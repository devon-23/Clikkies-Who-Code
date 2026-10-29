// The before_user_created hook, called the way Supabase Auth calls it. This
// is the server-side half of the registration switch: it decides whether an
// account can exist at all, no matter how the signup request was made.

import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createHarness, type Harness } from '../helpers/harness.ts';

let h: Harness;
beforeAll(async () => { h = await createHarness(); });
beforeEach(async () => { await h.reset(); });

const gate = async (email: string) => {
  const [row] = await h.sql<{ r: { error?: { http_code: number; message: string } } }>(
    'select public.before_user_created($1::jsonb) as r',
    [JSON.stringify({ metadata: { name: 'before-user-created' }, user: { email } })],
  );
  return row!.r;
};

describe('signup gate', () => {
  it('refuses an uninvited address while registration is closed', async () => {
    expect((await gate('stranger@example.com')).error?.http_code).toBe(403);
  });

  it('admits an invited address, whatever its case', async () => {
    await h.sql(`insert into public.tester_access (email) values ('guest@example.com')`);
    expect(await gate('guest@example.com')).toEqual({});
    expect(await gate('  GUEST@example.com ')).toEqual({});
  });

  it('admits anyone once registration is open', async () => {
    await h.sql(`update public.app_settings set value = 'true' where key = 'public_registration'`);
    expect(await gate('anyone@example.com')).toEqual({});
  });

  it('keeps a revoked address out even when registration is open', async () => {
    await h.sql(`update public.app_settings set value = 'true' where key = 'public_registration'`);
    await h.sql(`insert into public.tester_access (email, status) values ('banned@example.com', 'revoked')`);
    expect((await gate('banned@example.com')).error?.http_code).toBe(403);
  });
});

describe('row-level security', () => {
  const TABLES = ['app_settings', 'profiles', 'tester_access', 'admin_audit_log', 'error_events'];

  it('is switched on for every table', async () => {
    const rows = await h.sql<{ relname: string; relrowsecurity: boolean }>(
      `select relname, relrowsecurity from pg_class
        where relnamespace = 'public'::regnamespace and relkind = 'r'`);
    for (const t of TABLES) expect(rows.find((r) => r.relname === t)?.relrowsecurity, t).toBe(true);
    // a new table without RLS should fail this test until it gets it
    expect(rows.every((r) => r.relrowsecurity)).toBe(true);
  });

  it('gives the browser roles no access to any table', async () => {
    for (const role of ['anon', 'authenticated']) {
      for (const t of TABLES) {
        const [row] = await h.sql<{ ok: boolean }>(
          `select has_table_privilege($1, $2, 'select') or has_table_privilege($1, $2, 'insert')
               or has_table_privilege($1, $2, 'update') or has_table_privilege($1, $2, 'delete') as ok`,
          [role, `public.${t}`]);
        expect(row?.ok, `${role} on ${t}`).toBe(false);
      }
    }
  });

  it('lets only Supabase Auth run the gate', async () => {
    for (const role of ['anon', 'authenticated']) {
      const [row] = await h.sql<{ ok: boolean }>(
        `select has_function_privilege($1, 'public.before_user_created(jsonb)', 'execute') as ok`, [role]);
      expect(row?.ok, role).toBe(false);
    }
    const [auth] = await h.sql<{ ok: boolean }>(
      `select has_function_privilege('supabase_auth_admin', 'public.before_user_created(jsonb)', 'execute') as ok`);
    expect(auth?.ok).toBe(true);
  });
});
