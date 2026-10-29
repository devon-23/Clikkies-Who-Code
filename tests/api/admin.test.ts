import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { AdminOverview } from '../../src/shared/api.ts';
import { createHarness, type Harness } from '../helpers/harness.ts';

let h: Harness;
let admin: { id: string; token: string };
let player: { id: string; token: string };

beforeAll(async () => { h = await createHarness(); });
beforeEach(async () => {
  await h.reset();
  admin = await h.player('warden@example.com', 'warden', 'admin');
  player = await h.player('resident@example.com', 'resident');
});

const call = (path: string, token: string, method = 'GET', body?: unknown) =>
  h.request(`/api/admin${path}`, { method, token, body: body === undefined ? undefined : JSON.stringify(body) });

describe('admin authorization', () => {
  it('refuses every admin route to a signed-out caller', async () => {
    expect((await h.request('/api/admin/overview')).status).toBe(401);
  });

  it('refuses every admin route to an ordinary player', async () => {
    const attempts = [
      call('/overview', player.token),
      call('/registration', player.token, 'PUT', { open: true }),
      call('/testers', player.token, 'POST', { email: 'friend@example.com' }),
      call('/testers/warden%40example.com/revoke', player.token, 'POST'),
    ];
    for (const res of await Promise.all(attempts)) expect(res.status).toBe(403);

    // and none of it happened
    const [setting] = await h.sql<{ value: boolean }>(`select value from public.app_settings where key = 'public_registration'`);
    expect(setting?.value).toBe(false);
    expect(await h.sql(`select 1 from public.tester_access where email = 'friend@example.com'`)).toHaveLength(0);
  });

  it('treats a revoked admin as an admin -- the role, not the tester list, decides', async () => {
    await h.sql(`update public.tester_access set status = 'revoked' where email = 'warden@example.com'`);
    expect((await call('/overview', admin.token)).status).toBe(200);
  });
});

describe('admin operations', () => {
  it('shows the tester list and counts', async () => {
    const res = await call('/overview', admin.token);
    const body = (await res.json()) as AdminOverview;
    expect(body.registrationOpen).toBe(false);
    expect(body.counts).toMatchObject({ profiles: 2, admins: 1, activeTesters: 2 });
    expect(body.testers.map((t) => t.username).sort()).toEqual(['resident', 'warden']);
  });

  it('opens and closes registration, and logs who did it', async () => {
    const opened = (await (await call('/registration', admin.token, 'PUT', { open: true })).json()) as AdminOverview;
    expect(opened.registrationOpen).toBe(true);
    const closed = (await (await call('/registration', admin.token, 'PUT', { open: false })).json()) as AdminOverview;
    expect(closed.registrationOpen).toBe(false);
    expect(closed.audit.map((a) => [a.action, a.actor])).toEqual([
      ['registration.close', 'warden'],
      ['registration.open', 'warden'],
    ]);
  });

  it('invites a tester, normalising the address', async () => {
    const res = await call('/testers', admin.token, 'POST', { email: '  Friend@Example.COM ', note: 'from the show' });
    expect(res.status).toBe(201);
    const [row] = await h.sql<{ status: string; note: string }>(
      `select status, note from public.tester_access where email = 'friend@example.com'`);
    expect(row).toEqual({ status: 'invited', note: 'from the show' });
  });

  it('rejects a duplicate or malformed invitation', async () => {
    expect((await call('/testers', admin.token, 'POST', { email: 'resident@example.com' })).status).toBe(409);
    expect((await call('/testers', admin.token, 'POST', { email: 'not-an-email' })).status).toBe(400);
  });

  it('revokes and restores a tester', async () => {
    const revoked = (await (await call('/testers/resident%40example.com/revoke', admin.token, 'POST')).json()) as AdminOverview;
    expect(revoked.testers.find((t) => t.email === 'resident@example.com')?.status).toBe('revoked');
    expect((await h.request('/api/profile/intro-seen', { method: 'POST', token: player.token })).status).toBe(403);

    const restored = (await (await call('/testers/resident%40example.com/restore', admin.token, 'POST')).json()) as AdminOverview;
    expect(restored.testers.find((t) => t.email === 'resident@example.com')?.status).toBe('active');
    expect((await h.request('/api/profile/intro-seen', { method: 'POST', token: player.token })).status).toBe(204);
  });

  it('will not let an admin revoke themselves', async () => {
    expect((await call('/testers/warden%40example.com/revoke', admin.token, 'POST')).status).toBe(400);
  });

  it('404s an unknown tester', async () => {
    expect((await call('/testers/nobody%40example.com/revoke', admin.token, 'POST')).status).toBe(404);
  });
});
