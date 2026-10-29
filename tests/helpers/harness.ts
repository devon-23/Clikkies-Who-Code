// Spins up the real API against an in-memory Postgres (PGlite) with the real
// migrations applied, and signs tokens with a throwaway key pair exactly the
// way Supabase Auth would. Nothing here talks to the network.

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair, type CryptoKey } from 'jose';
import { createApp } from '../../src/worker/app.ts';
import * as schema from '../../src/worker/db/schema.ts';
import type { Db } from '../../src/worker/db/client.ts';
import type { Bindings } from '../../src/worker/env.ts';
import { verifierFor } from '../../src/worker/lib/tokens.ts';

const ROOT = join(import.meta.dirname, '../..');
const SUPABASE_URL = 'https://test-project.supabase.co';
const ISSUER = `${SUPABASE_URL}/auth/v1`;

export interface Harness {
  pg: PGlite;
  db: Db;
  request: (path: string, init?: RequestInit & { token?: string }) => Promise<Response>;
  signUp: (email: string) => Promise<{ id: string; token: string }>;
  tokenFor: (id: string, email: string, opts?: { expiresIn?: string; issuer?: string }) => Promise<string>;
  reset: () => Promise<void>;
  sql: <T = Record<string, unknown>>(query: string, params?: unknown[]) => Promise<T[]>;
  /** Signs up, invites, picks a username, and optionally makes them admin. */
  player: (email: string, username: string, role?: 'player' | 'admin') => Promise<{ id: string; token: string }>;
}

export async function createHarness(opts: { databaseConfigured?: boolean } = {}): Promise<Harness> {
  const pg = new PGlite();
  await pg.exec(readFileSync(join(ROOT, 'tests/helpers/supabase-shim.sql'), 'utf8'));
  const dir = join(ROOT, 'supabase/migrations');
  for (const file of readdirSync(dir).sort()) {
    await pg.exec(readFileSync(join(dir, file), 'utf8'));
  }
  const db = drizzle(pg, { schema }) as unknown as Db;

  const { publicKey, privateKey } = await generateKeyPair('ES256');
  const jwks = createLocalJWKSet({ keys: [{ ...(await exportJWK(publicKey)), alg: 'ES256' }] });

  const app = createApp({
    connect: () => (opts.databaseConfigured === false ? null : { db, close: async () => {} }),
    verifier: () => verifierFor(jwks, ISSUER),
  });

  const env = { APP_ENV: 'test', SUPABASE_URL } as Bindings;

  const tokenFor = (id: string, email: string, o: { expiresIn?: string; issuer?: string } = {}) =>
    sign(privateKey, id, email, o.issuer ?? ISSUER, o.expiresIn ?? '1h');

  const sql = async <T>(query: string, params: unknown[] = []) =>
    (await pg.query<T>(query, params)).rows;

  const signUp = async (email: string) => {
    const [row] = await sql<{ id: string }>('insert into auth.users (email) values ($1) returning id', [email]);
    return { id: row!.id, token: await tokenFor(row!.id, email) };
  };

  const request: Harness['request'] = (path, init = {}) => {
    const { token, ...rest } = init;
    const headers = new Headers(rest.headers);
    if (token) headers.set('authorization', `Bearer ${token}`);
    if (rest.body && !headers.has('content-type')) headers.set('content-type', 'application/json');
    return Promise.resolve(app.request(path, { ...rest, headers }, env));
  };

  return {
    pg,
    db,
    request,
    signUp,
    tokenFor,
    sql,
    reset: async () => {
      await pg.exec(`
        -- cascade reaches app_settings too (updated_by -> auth.users), so the
        -- switch is put back rather than updated
        truncate public.profiles, public.tester_access, public.admin_audit_log,
                 public.error_events, auth.users cascade;
        insert into public.app_settings (key, value) values ('public_registration', 'false')
          on conflict (key) do update set value = 'false', updated_by = null;
      `);
    },
    player: async (email, username, role = 'player') => {
      await sql('insert into public.tester_access (email) values ($1) on conflict do nothing', [email]);
      const user = await signUp(email);
      const res = await request('/api/profile', {
        method: 'POST', token: user.token, body: JSON.stringify({ username }),
      });
      if (res.status !== 201) throw new Error(`profile setup failed: ${res.status} ${await res.text()}`);
      if (role === 'admin') await sql(`update public.profiles set role = 'admin' where user_id = $1`, [user.id]);
      return user;
    },
  };
}

function sign(key: CryptoKey, sub: string, email: string, issuer: string, expiresIn: string) {
  return new SignJWT({ email, role: 'authenticated' })
    .setProtectedHeader({ alg: 'ES256' })
    .setSubject(sub)
    .setIssuer(issuer)
    .setAudience('authenticated')
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(key);
}
