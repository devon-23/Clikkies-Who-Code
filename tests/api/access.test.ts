import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { MeResponse } from '../../src/shared/api.ts';
import { createHarness, type Harness } from '../helpers/harness.ts';

let h: Harness;
beforeAll(async () => { h = await createHarness(); });
beforeEach(async () => { await h.reset(); });

const me = async (token: string) => {
  const res = await h.request('/api/me', { token });
  return { status: res.status, body: (await res.json()) as MeResponse & { error?: { code: string } } };
};

const pickUsername = (token: string, username: string) =>
  h.request('/api/profile', { method: 'POST', token, body: JSON.stringify({ username }) });

describe('authentication', () => {
  it('refuses requests with no token', async () => {
    const res = await h.request('/api/me');
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ error: { code: 'unauthenticated' } });
  });

  it('refuses a token that is not signed by Supabase', async () => {
    const res = await h.request('/api/me', { token: 'eyJhbGciOiJIUzI1NiJ9.e30.forged' });
    expect(res.status).toBe(401);
  });

  it('refuses an expired token', async () => {
    const { id } = await h.signUp('late@example.com');
    const token = await h.tokenFor(id, 'late@example.com', { expiresIn: '-1m' });
    expect((await me(token)).status).toBe(401);
  });

  it('refuses a token from a different Supabase project', async () => {
    const { id } = await h.signUp('elsewhere@example.com');
    const token = await h.tokenFor(id, 'elsewhere@example.com', { issuer: 'https://other.supabase.co/auth/v1' });
    expect((await me(token)).status).toBe(401);
  });
});

describe('invitation-only access', () => {
  it('signs in an uninvited account but denies it', async () => {
    const { token } = await h.signUp('stranger@example.com');
    const { status, body } = await me(token);
    expect(status).toBe(200);
    expect(body).toMatchObject({ access: 'denied', reason: 'not_invited', profile: null });
  });

  it('will not let an uninvited account create a profile by calling the API directly', async () => {
    const { token } = await h.signUp('stranger@example.com');
    const res = await pickUsername(token, 'stranger');
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ error: { code: 'not_invited' } });
    expect(await h.sql('select * from public.profiles')).toHaveLength(0);
  });

  it('walks an invited tester through choosing a username', async () => {
    await h.sql(`insert into public.tester_access (email) values ('invited@example.com')`);
    const { token } = await h.signUp('invited@example.com');

    expect((await me(token)).body.access).toBe('needs_profile');

    const res = await pickUsername(token, 'Resident_42');
    expect(res.status).toBe(201);

    const after = (await me(token)).body;
    expect(after.access).toBe('granted');
    expect(after.profile).toMatchObject({ username: 'Resident_42', role: 'player', introSeenAt: null });

    const [row] = await h.sql<{ status: string }>(`select status from public.tester_access where email = 'invited@example.com'`);
    expect(row?.status).toBe('active');
  });

  it('matches invitations regardless of the case the email was typed in', async () => {
    await h.sql(`insert into public.tester_access (email) values ('mixed@example.com')`);
    const { token } = await h.signUp('Mixed@Example.com');
    expect((await me(token)).body.access).toBe('needs_profile');
  });

  it('shuts a revoked tester out of protected routes', async () => {
    const { token } = await h.player('gone@example.com', 'gone');
    await h.sql(`update public.tester_access set status = 'revoked' where email = 'gone@example.com'`);

    expect((await me(token)).body).toMatchObject({ access: 'denied', reason: 'revoked' });
    const res = await h.request('/api/profile/intro-seen', { method: 'POST', token });
    expect(res.status).toBe(403);
  });
});

describe('public registration', () => {
  beforeEach(async () => {
    await h.sql(`update public.app_settings set value = 'true' where key = 'public_registration'`);
  });

  it('lets anyone with an account in, and records them so they can be revoked', async () => {
    const { token } = await h.signUp('walkin@example.com');
    expect((await me(token)).body.access).toBe('needs_profile');
    expect((await pickUsername(token, 'walkin')).status).toBe(201);

    const [row] = await h.sql<{ status: string; source: string }>(
      `select status, source from public.tester_access where email = 'walkin@example.com'`);
    expect(row).toEqual({ status: 'active', source: 'public' });
  });

  it('still keeps a revoked address out', async () => {
    await h.sql(`insert into public.tester_access (email, status) values ('banned@example.com', 'revoked')`);
    const { token } = await h.signUp('banned@example.com');
    expect((await me(token)).body).toMatchObject({ access: 'denied', reason: 'revoked' });
  });
});

describe('usernames', () => {
  beforeEach(async () => {
    await h.sql(`insert into public.tester_access (email) values ('a@example.com'), ('b@example.com')`);
  });

  it('rejects malformed names', async () => {
    const { token } = await h.signUp('a@example.com');
    for (const bad of ['ab', 'has space', 'x'.repeat(25), '<script>', '']) {
      const res = await pickUsername(token, bad);
      expect(res.status, bad).toBe(400);
    }
  });

  it('reserves story and staff names', async () => {
    const { token } = await h.signUp('a@example.com');
    for (const name of ['Clancy', 'NICO', 'admin', 'Torchbearer']) {
      expect((await pickUsername(token, name)).status, name).toBe(400);
    }
  });

  it('treats names that differ only by case as taken', async () => {
    const a = await h.signUp('a@example.com');
    const b = await h.signUp('b@example.com');
    expect((await pickUsername(a.token, 'Vulture')).status).toBe(201);
    const res = await pickUsername(b.token, 'vulture');
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: { code: 'username_taken' } });
  });

  it('will not create a second profile', async () => {
    const a = await h.signUp('a@example.com');
    expect((await pickUsername(a.token, 'first')).status).toBe(201);
    expect((await pickUsername(a.token, 'second')).status).toBe(409);
  });
});

describe('intro', () => {
  it('remembers that the transmission has been seen', async () => {
    const { token } = await h.player('intro@example.com', 'listener');
    expect((await me(token)).body.profile?.introSeenAt).toBeNull();
    expect((await h.request('/api/profile/intro-seen', { method: 'POST', token })).status).toBe(204);
    expect((await me(token)).body.profile?.introSeenAt).toEqual(expect.any(String));
  });
});
