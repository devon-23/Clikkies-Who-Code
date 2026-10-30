// One player can never see or touch another player's private state, and the
// admin panel never shows anyone's notebook.

import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Diagnostics, NotebookEntry, PlayerDetail, PlayerRow, ProgressResponse } from '../../src/shared/api.ts';
import { createHarness, type Harness } from '../helpers/harness.ts';

let h: Harness;
let alice: { id: string; token: string };
let bob: { id: string; token: string };
let admin: { id: string; token: string };

beforeAll(async () => { h = await createHarness(); });
beforeEach(async () => {
  await h.reset();
  alice = await h.player('alice@example.com', 'alice');
  bob = await h.player('bob@example.com', 'bob');
  admin = await h.player('warden@example.com', 'warden', 'admin');
});

const call = async <T>(path: string, token: string, method = 'GET', body?: unknown) => {
  const res = await h.request(`/api${path}`, { method, token, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: res.status, body: (res.status === 204 ? null : await res.json()) as T };
};

describe('between players', () => {
  it('keeps notebooks private', async () => {
    const { body: entry } = await call<NotebookEntry>('/notebook', alice.token, 'POST', { body: 'ALICE-SECRET-THEORY' });

    const list = await call<{ entries: NotebookEntry[] }>('/notebook', bob.token);
    expect(list.body.entries).toEqual([]);

    expect((await call(`/notebook/${entry.id}`, bob.token, 'PUT', { body: 'vandalised', version: 1 })).status).toBe(404);
    expect((await call(`/notebook/${entry.id}`, bob.token, 'DELETE')).status).toBe(404);

    const [row] = await h.sql<{ body: string }>('select body from public.notebook_entries');
    expect(row?.body).toBe('ALICE-SECRET-THEORY');
  });

  it('keeps evidence and progress separate', async () => {
    await call('/missions/bf-letters/submit', alice.token, 'POST', { answer: 'Clancy' });

    expect((await call('/archive/ev-2', alice.token)).status).toBe(200);
    expect((await call('/archive/ev-2', bob.token)).status).toBe(404);

    const bobs = (await call<ProgressResponse>('/progress', bob.token)).body;
    expect(bobs.evidenceCount).toBe(0);
    expect((await call('/missions/bf-dates', bob.token)).status).toBe(403);
  });

  it('ignores any attempt to name another user in the request', async () => {
    // the user always comes from the token; a user id in the body is just noise
    const res = await call('/missions/bf-letters/submit', bob.token, 'POST', { answer: 'Clancy', userId: alice.id });
    expect(res.status).toBe(200);
    const owners = await h.sql<{ user_id: string }>('select distinct user_id from public.mission_completions');
    expect(owners).toEqual([{ user_id: bob.id }]);
  });
});

describe('admin views', () => {
  it('are refused to players', async () => {
    for (const path of ['/admin/players', '/admin/players/alice', '/admin/diagnostics']) {
      expect((await call(path, alice.token)).status, path).toBe(403);
    }
  });

  it('show progress and puzzle health, never notebook contents', async () => {
    await call('/notebook', alice.token, 'POST', { title: 'PRIVATE-TITLE', body: 'PRIVATE-NOTEBOOK-TEXT' });
    await call('/missions/bf-letters/submit', alice.token, 'POST', { answer: 'Torchbearer' });
    await call('/missions/bf-letters/submit', bob.token, 'POST', { answer: 'torchbearer' });
    await call('/missions/bf-letters/submit', alice.token, 'POST', { answer: 'Clancy' });
    await call('/missions/bf-letters/hints', bob.token, 'POST');

    const players = (await call<{ players: PlayerRow[] }>('/admin/players', admin.token)).body.players;
    expect(players.find((p) => p.username === 'alice')).toMatchObject({ missionsCompleted: 1, evidence: 2, cycle: 1 });

    const detail = (await call<PlayerDetail>('/admin/players/ALICE', admin.token)).body;
    expect(detail.progress.campaigns[0]!.completed).toBe(1);

    const diag = (await call<Diagnostics>('/admin/diagnostics', admin.token)).body;
    const letters = diag.missions.find((m) => m.missionId === 'bf-letters')!;
    expect(letters).toMatchObject({ attempts: 3, correct: 1, players: 2, hintUse: [1, 0, 0] });
    expect(letters.topWrong).toEqual([{ guess: 'torchbearer', count: 2 }]);

    const everything = JSON.stringify([players, detail, diag]);
    expect(everything).not.toContain('PRIVATE-NOTEBOOK-TEXT');
    expect(everything).not.toContain('PRIVATE-TITLE');
  });

  it('flag player rows that point at content which no longer exists', async () => {
    await h.sql(`insert into public.evidence_discoveries (user_id, evidence_id, source) values ($1, 'renamed-record', 'admin')`, [alice.id]);
    const diag = (await call<Diagnostics>('/admin/diagnostics', admin.token)).body;
    expect(diag.orphans).toEqual([{ table: 'evidence_discoveries', id: 'renamed-record', rows: 1 }]);
    // and the player is unaffected
    expect((await call<ProgressResponse>('/progress', alice.token)).body.evidenceCount).toBe(0);
  });
});
