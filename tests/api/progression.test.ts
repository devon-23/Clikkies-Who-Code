import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { MissionView, ProgressResponse, SubmitResult } from '../../src/shared/api.ts';
import { createHarness, type Harness } from '../helpers/harness.ts';

let h: Harness;
let token: string;
let userId: string;

beforeAll(async () => { h = await createHarness(); });
beforeEach(async () => {
  await h.reset();
  ({ token, id: userId } = await h.player('resident@example.com', 'resident'));
});

const get = async <T>(path: string) => {
  const res = await h.request(`/api${path}`, { token });
  return { status: res.status, body: (await res.json()) as T };
};
const post = async <T>(path: string, body?: unknown) => {
  const res = await h.request(`/api${path}`, { method: 'POST', token, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: res.status, body: (res.status === 204 ? null : await res.json()) as T };
};
const submit = (id: string, answer: unknown) => post<SubmitResult>(`/missions/${id}/submit`, { answer });
const progress = async () => (await get<ProgressResponse>('/progress')).body;
const statusOf = (p: ProgressResponse, id: string) => p.campaigns.flatMap((c) => c.missions).find((m) => m.id === id)?.status;

async function solveBlurryface() {
  await submit('bf-letters', 'Clancy');
  await submit('bf-dates', { first: '026 10MOON 17', second: '026 10MOON 19' });
  await submit('bf-finale', 'the next one');
}

async function solveEverything() {
  await solveBlurryface();
  await submit('tr-one', 'east is up');
  await submit('si-one', 'smile');
  await submit('cl-one', 'red tape');
  await submit('br-one', 'nova');
}

describe('a new player', () => {
  it('starts cycle 1 at the first Blurryface mission with everything else sealed', async () => {
    const p = await progress();
    expect(p.run).toMatchObject({ number: 1, status: 'active' });
    expect(p.current).toMatchObject({ missionId: 'bf-letters', status: 'available' });
    expect(p.campaigns.map((c) => c.unlocked)).toEqual([true, false, false, false, false]);
    expect(statusOf(p, 'bf-dates')).toBe('locked');
    expect(statusOf(p, 'tr-one')).toBe('locked');
  });

  it('does not reveal the titles of locked missions', async () => {
    const p = await progress();
    const dates = p.campaigns[0]!.missions.find((m) => m.id === 'bf-dates')!;
    expect(dates.title).toBeNull();
    expect(JSON.stringify(p)).not.toContain('The Wrong Date');
  });

  it('refuses to open a sealed mission, and 404s one that does not exist', async () => {
    expect((await get('/missions/bf-dates')).status).toBe(403);
    expect((await post('/missions/bf-dates/start')).status).toBe(403);
    expect((await submit('bf-dates', { first: 'x', second: 'y' })).status).toBe(403);
    expect((await get('/missions/nope')).status).toBe(404);
  });
});

describe('opening a mission', () => {
  it('hands over its starting records and recognises the first one as an achievement', async () => {
    const { status, body } = await post<MissionView>('/missions/bf-letters/start');
    expect(status).toBe(200);
    expect(body.status).toBe('in_progress');
    expect(body.evidence.map((e) => e.id)).toEqual(['ev-1']);
    expect(body.answerForm).toEqual({ kind: 'text', label: 'Who wrote it?', placeholder: undefined });
    const [a] = await h.sql(`select achievement_id from public.player_achievements where user_id = $1`, [userId]);
    expect(a).toEqual({ achievement_id: 'first-record' });
  });

  it('is safe to repeat', async () => {
    await post('/missions/bf-letters/start');
    await post('/missions/bf-letters/start');
    expect(await h.sql('select * from public.mission_progress')).toHaveLength(1);
  });

  it('never sends accepted answers to the browser', async () => {
    const view = JSON.stringify((await post<MissionView>('/missions/bf-letters/start')).body);
    expect(view).not.toMatch(/C\. Clancy/);
    expect(view).not.toMatch(/accepted|nearMisses/);
    await submit('bf-letters', 'Clancy');
    const dates = JSON.stringify((await post<MissionView>('/missions/bf-dates/start')).body);
    expect(dates).not.toContain('10MOON 19');
  });
});

describe('answers', () => {
  it('rejects a wrong answer without giving anything away', async () => {
    const { body } = await submit('bf-letters', 'Torchbearer');
    expect(body).toEqual({ correct: false, message: expect.any(String) });
    expect(JSON.stringify(body).toLowerCase()).not.toContain('clancy');
  });

  it('answers a recognised near miss with a pointed nudge', async () => {
    const { body } = await submit('bf-letters', 'nico');
    expect(body).toMatchObject({ correct: false, message: 'That name is on the envelope, not the letter.' });
  });

  it('forgives case, spacing and punctuation, and accepts configured variants', async () => {
    for (const variant of ['  clancy. ', 'CLANCY', 'c clancy', 'C. Clancy']) {
      await h.reset();
      ({ token } = await h.player('resident@example.com', 'resident'));
      expect((await submit('bf-letters', variant)).body.correct, variant).toBe(true);
    }
  });

  it('reports how many findings hold up, but not which', async () => {
    await submit('bf-letters', 'Clancy');
    const { body } = await submit('bf-dates', { first: '026 10MOON 17', second: 'wrong' });
    expect(body).toMatchObject({ correct: false, message: expect.stringContaining('1 of 2') });
    expect(JSON.stringify(body)).not.toMatch(/first|second/);
  });

  it('takes a set of choices in any order, and refuses a partial set', async () => {
    await submit('bf-letters', 'Clancy');
    await submit('bf-dates', { first: '026 10MOON 17', second: '026 10MOON 19' });
    expect((await submit('bf-side', ['a'])).body.correct).toBe(false);
    expect((await submit('bf-side', ['c', 'a'])).body.correct).toBe(true);
  });

  it('keeps the text of wrong answers for tuning, but never of right ones', async () => {
    await submit('bf-letters', 'Torchbearer!');
    await submit('bf-letters', 'Clancy');
    const rows = await h.sql<{ correct: boolean; guess: string | null }>('select correct, guess from public.answer_attempts order by id');
    expect(rows).toEqual([{ correct: false, guess: 'torchbearer' }, { correct: true, guess: null }]);
  });

  it('slows down someone hammering the answer box', async () => {
    for (let i = 0; i < 20; i++) await submit('bf-letters', `guess ${i}`);
    const res = await submit('bf-letters', 'Clancy');
    expect(res.status).toBe(429);
    expect(res.body).toMatchObject({ error: { code: 'rate_limited' } });
  });
});

describe('completion and unlocking', () => {
  it('rewards evidence and achievements, and opens the next mission', async () => {
    const { body } = await submit('bf-letters', 'Clancy');
    expect(body).toMatchObject({
      correct: true,
      replay: false,
      success: ['You have a name.'],
      unlocked: { missions: [{ id: 'bf-dates', title: 'The Wrong Date' }], campaigns: [] },
    });
    if (!body.correct) throw new Error('unreachable');
    expect(body.rewards.evidence.map((e) => e.id)).toEqual(['ev-2']);
    expect(body.rewards.achievements.map((a) => a.id).sort()).toEqual(['first-record', 'letters-done']);
  });

  it('awards an achievement a mission names directly', async () => {
    await submit('bf-letters', 'Clancy');
    const { body } = await submit('bf-dates', { first: '026 10MOON 17', second: '026 10MOON 19' });
    if (!body.correct) throw new Error('expected correct');
    expect(body.rewards.achievements.map((a) => a.id)).toContain('date-checker');
  });

  it('honours an explicit prerequisite', async () => {
    await submit('bf-letters', 'Clancy');
    expect(statusOf(await progress(), 'bf-finale')).toBe('locked');
    await submit('bf-dates', { first: '026 10MOON 17', second: '026 10MOON 19' });
    expect(statusOf(await progress(), 'bf-finale')).toBe('available');
  });

  it('closes a campaign without its optional missions, and opens the next campaign', async () => {
    await submit('bf-letters', 'Clancy');
    await submit('bf-dates', { first: '026 10MOON 17', second: '026 10MOON 19' });
    const { body } = await submit('bf-finale', 'the next one');
    if (!body.correct) throw new Error('expected correct');
    expect(body.unlocked.campaigns).toEqual(['trench']);
    expect(body.rewards.achievements.map((a) => a.id)).toContain('bf-closed');

    const p = await progress();
    expect(p.campaigns[0]).toMatchObject({ complete: true, required: 3, completed: 3 });
    expect(statusOf(p, 'bf-side')).toBe('available');
    expect(p.current?.missionId).toBe('bf-side');
  });

  it('unlocks campaigns strictly in order', async () => {
    await solveBlurryface();
    const p = await progress();
    expect(p.campaigns.map((c) => c.unlocked)).toEqual([true, true, false, false, false]);
    expect((await submit('si-one', 'smile')).status).toBe(403);
  });
});

describe('hints', () => {
  it('are optional -- missions complete without them', async () => {
    expect((await submit('bf-letters', 'Clancy')).body.correct).toBe(true);
    expect(await h.sql('select * from public.hint_usage')).toHaveLength(0);
  });

  it('reveal one level at a time, nudge to technique, then stop', async () => {
    const levels: string[][] = [];
    for (let i = 0; i < 4; i++) {
      const { body } = await post<{ hints: { level: string }[] }>('/missions/bf-letters/hints');
      levels.push(body.hints.map((x) => x.level));
    }
    expect(levels).toEqual([
      ['nudge'], ['nudge', 'direction'], ['nudge', 'direction', 'technique'], ['nudge', 'direction', 'technique'],
    ]);
    const view = (await get<MissionView>('/missions/bf-letters')).body;
    expect(view.hints).toHaveLength(3);
    expect(view.hintsTotal).toBe(3);
  });

  it('never cost an achievement', async () => {
    for (let i = 0; i < 3; i++) await post('/missions/bf-letters/hints');
    const { body } = await submit('bf-letters', 'Clancy');
    if (!body.correct) throw new Error('expected correct');
    expect(body.rewards.achievements.map((a) => a.id)).toContain('letters-done');
    const [row] = await h.sql<{ hints_used: number }>('select hints_used from public.mission_completions');
    expect(row?.hints_used).toBe(3);
  });
});

describe('replay', () => {
  it('keeps the original completion and adds a replay record', async () => {
    await submit('bf-letters', 'Clancy');
    const before = await h.sql<{ completed_at: Date }>('select completed_at from public.mission_progress');
    const { body } = await submit('bf-letters', 'Clancy');
    expect(body).toMatchObject({ correct: true, replay: true, rewards: { evidence: [], achievements: [] } });

    const rows = await h.sql<{ replay: boolean }>('select replay from public.mission_completions order by id');
    expect(rows.map((r) => r.replay)).toEqual([false, true]);
    const after = await h.sql<{ completed_at: Date; status: string }>('select completed_at, status from public.mission_progress');
    expect(after[0]).toMatchObject({ status: 'completed', completed_at: before[0]!.completed_at });
  });

  it('can be opened again after completion and shows the success text', async () => {
    await submit('bf-letters', 'Clancy');
    const view = (await get<MissionView>('/missions/bf-letters')).body;
    expect(view).toMatchObject({ status: 'completed', success: ['You have a name.'] });
  });
});

describe('evidence found out of order', () => {
  it('is recognised by its mission rather than handed out again', async () => {
    // ev-2 is bf-letters' reward, but suppose it turned up early
    await h.sql(`insert into public.evidence_discoveries (user_id, evidence_id, source) values ($1, 'ev-2', 'admin')`, [userId]);
    const view = (await post<MissionView>('/missions/bf-letters/start')).body;
    expect(view.evidence.map((e) => e.id).sort()).toEqual(['ev-1', 'ev-2']);

    const { body } = await submit('bf-letters', 'Clancy');
    if (!body.correct) throw new Error('expected correct');
    expect(body.rewards.evidence).toEqual([]);
  });
});

describe('external clues', () => {
  it('offer an in-site fallback copy', async () => {
    await submit('bf-letters', 'Clancy');
    const before = (await post<MissionView>('/missions/bf-dates/start')).body;
    expect(before.external).toEqual([{ label: 'A fictional profile', url: 'https://example.com/profile', fallback: null }]);
    const after = (await post<MissionView>('/missions/bf-dates/external/0/fallback')).body;
    expect(after.external[0]!.fallback).toMatchObject({ id: 'ev-5', fileNo: 'D-0005' });
    expect((await post('/missions/bf-dates/external/7/fallback')).status).toBe(404);
  });
});

describe('saved mission state', () => {
  it('saves with a version, and refuses a stale copy with the newer one', async () => {
    const view = (await post<MissionView>('/missions/bf-letters/start')).body;
    expect(view.version).toBe(1);

    const put = (state: unknown, version: number) =>
      h.request('/api/missions/bf-letters/state', { method: 'PUT', token, body: JSON.stringify({ state, version }) });

    const first = await put({ notes: 'laptop' }, 1);
    expect(await first.json()).toEqual({ version: 2 });

    // the phone still thinks it is on version 1
    const stale = await put({ notes: 'phone' }, 1);
    expect(stale.status).toBe(409);
    expect(await stale.json()).toMatchObject({ error: { code: 'conflict' }, current: { state: { notes: 'laptop' }, version: 2 } });

    expect((await get<MissionView>('/missions/bf-letters')).body.state).toEqual({ notes: 'laptop' });
  });

  it('cannot complete a mission', async () => {
    await post('/missions/bf-letters/start');
    await h.request('/api/missions/bf-letters/state', {
      method: 'PUT', token, body: JSON.stringify({ state: { status: 'completed', completed: true }, version: 1 }),
    });
    expect(statusOf(await progress(), 'bf-letters')).toBe('in_progress');
    expect(statusOf(await progress(), 'bf-dates')).toBe('locked');
  });
});

describe('cycles', () => {
  it('cannot begin a new cycle before Breach is closed', async () => {
    await solveBlurryface();
    const res = await post('/runs');
    expect(res.status).toBe(403);
  });

  it('starts over, keeping history, evidence and achievements', async () => {
    await solveEverything();
    const done = await progress();
    expect(done.canStartNewCycle).toBe(true);
    const evidenceBefore = done.evidenceCount;

    const { status, body } = await post<ProgressResponse>('/runs');
    expect(status).toBe(201);
    expect(body.run).toMatchObject({ number: 2, status: 'active', missionsCompleted: 0 });
    expect(body.history).toEqual([expect.objectContaining({ number: 1, status: 'completed', missionsCompleted: 7 })]);
    expect(body.campaigns.map((c) => c.unlocked)).toEqual([true, false, false, false, false]);
    expect(statusOf(body, 'bf-letters')).toBe('available');
    expect(statusOf(body, 'bf-dates')).toBe('locked');
    expect(body.campaigns[0]!.missions.find((m) => m.id === 'bf-dates')!.completedEver).toBe(true);
    expect(body.evidenceCount).toBe(evidenceBefore);

    const achievements = await h.sql<{ achievement_id: string }>('select achievement_id from public.player_achievements');
    expect(achievements.map((a) => a.achievement_id)).toEqual(expect.arrayContaining(['bf-closed', 'letters-done', 'again']));
  });

  it('starts hints fresh in the new cycle', async () => {
    await post('/missions/bf-letters/hints');
    await solveEverything();
    await post('/runs');
    expect((await post<MissionView>('/missions/bf-letters/start')).body.hints).toEqual([]);
  });
});
