import { describe, expect, it } from 'vitest';
import { createHarness } from '../helpers/harness.ts';

describe('health and configuration', () => {
  it('reports a working database', async () => {
    const h = await createHarness();
    const res = await h.request('/api/health');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, env: 'test', database: 'ok', auth: 'configured' });
    expect(res.headers.get('cache-control')).toBe('no-store');
  });

  it('degrades cleanly when the database is not configured', async () => {
    const h = await createHarness({ databaseConfigured: false });
    expect((await h.request('/api/health')).status).toBe(503);
    expect(await (await h.request('/api/public-config')).json()).toEqual({
      registrationOpen: false, databaseConfigured: false,
    });
    const me = await h.request('/api/me');
    expect(me.status).toBe(503);
    expect(await me.json()).toMatchObject({ error: { code: 'unconfigured' } });
  });

  it('tells the register form whether registration is open', async () => {
    const h = await createHarness();
    expect(await (await h.request('/api/public-config')).json()).toEqual({
      registrationOpen: false, databaseConfigured: true,
    });
  });

  it('answers unknown endpoints with a JSON 404', async () => {
    const h = await createHarness();
    const res = await h.request('/api/nope');
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ error: { code: 'not_found' } });
  });
});
