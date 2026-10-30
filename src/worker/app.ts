import { Hono, type MiddlewareHandler } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { eq, sql } from 'drizzle-orm';
import { z, type ZodType } from 'zod';
import {
  createProfileSchema, discoverSchema, inviteTesterSchema, missionStateSchema, notebookCreateSchema,
  notebookSaveSchema, registrationSchema, submitSchema,
  type ApiErrorBody, type HealthResponse, type MeResponse, type PublicConfig,
} from '../shared/api.ts';
import type { Registry } from './content/registry.ts';
import type { DbFactory } from './db/client.ts';
import { errorEvents, profiles } from './db/schema.ts';
import type { AppEnv, Bindings } from './env.ts';
import { ApiError, forbidden, unauthenticated } from './lib/http.ts';
import type { TokenVerifier } from './lib/tokens.ts';
import { createProfile, denialMessage, resolveAccess } from './services/access.ts';
import { isRegistrationOpen, setRegistrationOpen } from './services/settings.ts';
import { adminOverview, inviteTester, setTesterRevoked } from './services/testers.ts';
import { archiveFor, discoverByCode, recordFor } from './services/archive.ts';
import { achievementsFor, diagnostics, listPlayers, playerDetail } from './services/diagnostics.ts';
import { createEntry, deleteEntry, listEntries, updateEntry } from './services/notebook.ts';
import {
  claimFallback, progressFor, revealHint, saveMissionState, startMission, startNewCycle, submitAnswer, viewMission,
} from './services/progress.ts';

export interface AppDeps {
  connect: DbFactory;
  verifier: (env: Bindings) => TokenVerifier | null;
  /** the story content, already validated -- see content/story */
  content: Registry;
}

// Built as a function so the tests can hand in an in-memory database and
// their own signing keys. index.ts wires up the real ones.
export function createApp(deps: AppDeps) {
  const app = new Hono<AppEnv>().basePath('/api');

  // ---------------------------------------------------------------- plumbing

  app.use('*', async (c, next) => {
    c.set('requestId', crypto.randomUUID());
    await next();
    // player data must never sit in a shared cache
    c.header('cache-control', 'no-store');
    c.header('x-content-type-options', 'nosniff');
    c.header('x-request-id', c.get('requestId'));
  });

  const json = (body: ApiErrorBody['error']): ApiErrorBody => ({ error: body });

  app.onError(async (err, c) => {
    const requestId = c.get('requestId');
    if (err instanceof ApiError) {
      return c.json({ ...err.extra, ...json({ code: err.code, message: err.message, requestId }) }, err.status);
    }

    // something we did not plan for. keep a thin record -- route and message,
    // never the body or headers -- and give the player only the request id
    console.error(`[${requestId}] ${c.req.method} ${c.req.path}`, err);
    const db = c.var.db as AppEnv['Variables']['db'] | undefined;
    if (db) {
      try {
        await db.insert(errorEvents).values({
          source: 'api',
          route: `${c.req.method} ${c.req.routePath}`.slice(0, 200),
          message: String(err instanceof Error ? err.message : err).slice(0, 500),
          requestId,
          userId: c.var.user?.id ?? null,
        });
      } catch {
        // the error log failing must not hide the original error
      }
    }
    return c.json(json({ code: 'internal', message: 'Something went wrong on our side.', requestId }), 500);
  });

  app.notFound((c) => c.json(json({ code: 'not_found', message: 'No such endpoint.' }), 404));

  // validation failures come back in the same shape as every other error
  const body = <T extends ZodType>(schema: T) =>
    zValidator('json', schema, (result) => {
      if (!result.success) {
        throw new ApiError(400, 'invalid', result.error.issues[0]?.message ?? 'Invalid request.');
      }
    });

  // opens a connection for this request, and closes it once the response is out
  const withDb: MiddlewareHandler<AppEnv> = async (c, next) => {
    const handle = deps.connect(c.env);
    if (!handle) throw new ApiError(503, 'unconfigured', 'The database is not configured yet.');
    c.set('db', handle.db);
    try {
      await next();
    } finally {
      const closing = handle.close();
      try {
        c.executionCtx.waitUntil(closing);
      } catch {
        await closing; // no execution context (tests)
      }
    }
  };

  const withUser: MiddlewareHandler<AppEnv> = async (c, next) => {
    const verify = deps.verifier(c.env);
    if (!verify) throw new ApiError(503, 'unconfigured', 'Sign-in is not configured yet.');
    const header = c.req.header('authorization') ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
    const user = token ? await verify(token) : null;
    if (!user) throw unauthenticated();
    c.set('user', user);
    await next();
  };

  // signed in, on the list, and finished choosing a username
  const withAccess: MiddlewareHandler<AppEnv> = async (c, next) => {
    const access = await resolveAccess(c.var.db, c.var.user);
    if (access.state === 'denied') {
      throw new ApiError(403, access.reason ?? 'not_invited', denialMessage(access.reason));
    }
    if (access.state === 'needs_profile') {
      throw new ApiError(403, 'needs_profile', 'Choose a username first.');
    }
    await next();
  };

  // the role is read from the database on every request. hiding the admin
  // link in the interface is a courtesy; this is the actual lock
  const withAdmin: MiddlewareHandler<AppEnv> = async (c, next) => {
    const [row] = await c.var.db
      .select({ role: profiles.role })
      .from(profiles)
      .where(eq(profiles.userId, c.var.user.id));
    if (row?.role !== 'admin') throw forbidden();
    await next();
  };

  // ------------------------------------------------------------------ public

  app.get('/health', async (c) => {
    const handle = deps.connect(c.env);
    let database: HealthResponse['database'] = 'unconfigured';
    if (handle) {
      try {
        await handle.db.execute(sql`select 1`);
        database = 'ok';
      } catch {
        database = 'error';
      } finally {
        await handle.close();
      }
    }
    const res: HealthResponse = {
      ok: database === 'ok',
      env: c.env.APP_ENV,
      database,
      auth: deps.verifier(c.env) ? 'configured' : 'unconfigured',
    };
    return c.json(res, res.ok ? 200 : 503);
  });

  // whether the register form should say "open" or "invitation-only". the
  // real enforcement is the before_user_created hook inside Supabase Auth
  app.get('/public-config', async (c) => {
    const handle = deps.connect(c.env);
    if (!handle) return c.json<PublicConfig>({ registrationOpen: false, databaseConfigured: false });
    try {
      return c.json<PublicConfig>({ registrationOpen: await isRegistrationOpen(handle.db), databaseConfigured: true });
    } finally {
      await handle.close();
    }
  });

  // ---------------------------------------------------------------- accounts

  app.get('/me', withDb, withUser, async (c) => {
    const access = await resolveAccess(c.var.db, c.var.user);
    return c.json<MeResponse>({
      id: c.var.user.id,
      email: c.var.user.email,
      access: access.state,
      reason: access.reason,
      profile: access.profile,
    });
  });

  app.post('/profile', withDb, withUser, body(createProfileSchema), async (c) => {
    const { username } = c.req.valid('json');
    const profile = await createProfile(c.var.db, c.var.user, username);
    return c.json({ profile }, 201);
  });

  // the intercepted transmission plays once per account, on any device
  app.post('/profile/intro-seen', withDb, withUser, withAccess, async (c) => {
    await c.var.db
      .update(profiles)
      .set({ introSeenAt: new Date(), updatedAt: new Date() })
      .where(eq(profiles.userId, c.var.user.id));
    return c.body(null, 204);
  });

  // ------------------------------------------------------------------- story
  //
  // Everything below needs a signed-in, authorized player with a handle.
  // Each handler acts only on the caller's own records: the user id always
  // comes from the verified token, never from the request.

  const player = [withDb, withUser, withAccess] as const;
  const reg = deps.content;
  const uid = (c: { var: AppEnv['Variables'] }) => c.var.user.id;
  const entryId = (raw: string) => {
    const r = z.uuid().safeParse(raw);
    if (!r.success) throw new ApiError(404, 'not_found', 'No such entry.');
    return r.data;
  };

  app.get('/progress', ...player, async (c) => c.json(await progressFor(c.var.db, reg, uid(c))));

  app.post('/runs', ...player, async (c) => c.json(await startNewCycle(c.var.db, reg, uid(c)), 201));

  app.get('/missions/:id', ...player, async (c) => c.json(await viewMission(c.var.db, reg, uid(c), c.req.param('id'))));

  app.post('/missions/:id/start', ...player, async (c) => c.json(await startMission(c.var.db, reg, uid(c), c.req.param('id'))));

  app.post('/missions/:id/hints', ...player, async (c) =>
    c.json({ hints: await revealHint(c.var.db, reg, uid(c), c.req.param('id')) }));

  app.post('/missions/:id/submit', ...player, body(submitSchema), async (c) =>
    c.json(await submitAnswer(c.var.db, reg, uid(c), c.req.param('id'), c.req.valid('json').answer)));

  app.put('/missions/:id/state', ...player, body(missionStateSchema), async (c) => {
    const { state, version } = c.req.valid('json');
    return c.json(await saveMissionState(c.var.db, reg, uid(c), c.req.param('id'), state, version));
  });

  app.post('/missions/:id/external/:index/fallback', ...player, async (c) =>
    c.json(await claimFallback(c.var.db, reg, uid(c), c.req.param('id'), Number(c.req.param('index')))));

  app.get('/archive', ...player, async (c) => c.json(await archiveFor(c.var.db, reg, uid(c))));

  app.post('/archive/discover', ...player, body(discoverSchema), async (c) =>
    c.json(await discoverByCode(c.var.db, reg, uid(c), c.req.valid('json').code)));

  app.get('/archive/:id', ...player, async (c) => c.json(await recordFor(c.var.db, reg, uid(c), c.req.param('id'))));

  app.get('/achievements', ...player, async (c) => c.json(await achievementsFor(c.var.db, reg, uid(c))));

  app.get('/notebook', ...player, async (c) => c.json({ entries: await listEntries(c.var.db, uid(c)) }));

  app.post('/notebook', ...player, body(notebookCreateSchema), async (c) =>
    c.json(await createEntry(c.var.db, reg, uid(c), c.req.valid('json')), 201));

  app.put('/notebook/:id', ...player, body(notebookSaveSchema), async (c) => {
    const { version, ...draft } = c.req.valid('json');
    return c.json(await updateEntry(c.var.db, reg, uid(c), entryId(c.req.param('id')), draft, version));
  });

  app.delete('/notebook/:id', ...player, async (c) => {
    await deleteEntry(c.var.db, uid(c), entryId(c.req.param('id')));
    return c.body(null, 204);
  });

  // ------------------------------------------------------------------- admin

  const admin = new Hono<AppEnv>();
  admin.use('*', withDb, withUser, withAccess, withAdmin);

  admin.get('/overview', async (c) => c.json(await adminOverview(c.var.db)));

  admin.put('/registration', body(registrationSchema), async (c) => {
    await setRegistrationOpen(c.var.db, c.var.user.id, c.req.valid('json').open);
    return c.json(await adminOverview(c.var.db));
  });

  admin.post('/testers', body(inviteTesterSchema), async (c) => {
    const { email, note } = c.req.valid('json');
    await inviteTester(c.var.db, c.var.user.id, email, note);
    return c.json(await adminOverview(c.var.db), 201);
  });

  for (const [path, revoked] of [['revoke', true], ['restore', false]] as const) {
    admin.post(`/testers/:email/${path}`, async (c) => {
      const email = decodeURIComponent(c.req.param('email')).toLowerCase();
      await setTesterRevoked(c.var.db, c.var.user.id, c.var.user.email, email, revoked);
      return c.json(await adminOverview(c.var.db));
    });
  }

  admin.get('/players', async (c) => c.json({ players: await listPlayers(c.var.db) }));
  admin.get('/players/:username', async (c) => c.json(await playerDetail(c.var.db, reg, c.req.param('username'))));
  admin.get('/diagnostics', async (c) => c.json(await diagnostics(c.var.db, reg)));

  app.route('/admin', admin);

  return app;
}
