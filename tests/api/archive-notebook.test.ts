import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type {
  AchievementsResponse, ArchiveResponse, DiscoverResult, EvidenceRecord, NotebookEntry,
} from '../../src/shared/api.ts';
import { createHarness, type Harness } from '../helpers/harness.ts';

let h: Harness;
let token: string;

beforeAll(async () => { h = await createHarness(); });
beforeEach(async () => {
  await h.reset();
  ({ token } = await h.player('resident@example.com', 'resident'));
});

const call = async <T>(path: string, method = 'GET', body?: unknown, as = token) => {
  const res = await h.request(`/api${path}`, { method, token: as, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: res.status, body: (res.status === 204 ? null : await res.json()) as T };
};

describe('the archive', () => {
  it('shows gaps as file numbers only, and hidden records not at all', async () => {
    const { body } = await call<ArchiveResponse>('/archive');
    expect(body.records).toEqual([]);
    expect(body.slots.map((s) => s.fileNo)).toEqual(['D-0001', 'D-0002', 'D-0003', 'D-0004', 'D-0005']);
    expect(body.slots[0]).toEqual({ fileNo: 'D-0001', campaign: 'blurryface', classification: 'restricted' });
    const text = JSON.stringify(body);
    expect(text).not.toContain('Record 1');
    expect(text).not.toContain('D-0009');
    expect(text).not.toContain('CANARY-BODY');
  });

  it('fills a gap once the record is found', async () => {
    await call('/missions/bf-letters/start', 'POST');
    const { body } = await call<ArchiveResponse>('/archive');
    expect(body.records.map((r) => r.id)).toEqual(['ev-1']);
    expect(body.slots.map((s) => s.fileNo)).not.toContain('D-0001');
  });

  it('opens a record only once it is found, and 404s the same way for unknown ones', async () => {
    type Err = { error: { code: string; message: string } };
    const locked = await call<Err>('/archive/ev-1');
    const missing = await call<Err>('/archive/no-such-thing');
    expect(locked.status).toBe(404);
    expect(missing.status).toBe(404);
    // indistinguishable: you cannot probe for which records exist
    const shape = (e: Err['error']) => ({ code: e.code, message: e.message });
    expect(shape(locked.body.error)).toEqual(shape(missing.body.error));
    expect(locked.body.error.code).toBe('not_found');

    await call('/missions/bf-letters/start', 'POST');
    const { status, body } = await call<EvidenceRecord>('/archive/ev-1');
    expect(status).toBe(200);
    expect(body.body).toEqual([{ type: 'paragraph', text: 'CANARY-BODY-1' }]);
    // ev-1 relates to ev-2 and the hidden ev-9; neither is found yet
    expect(body.related).toEqual([]);
    expect(body.relatedMissing).toBe(2);
  });

  it('recovers a hidden record by phrase, however it is typed, even from a sealed campaign', async () => {
    const miss = await call<DiscoverResult>('/archive/discover', 'POST', { code: 'east is up' });
    expect(miss.body).toEqual({ found: false, message: 'Nothing on file under that.' });

    const hit = await call<DiscoverResult>('/archive/discover', 'POST', { code: '  SAHLO, folina! ' });
    expect(hit.body).toMatchObject({ found: true, alreadyHad: false, record: { id: 'ev-9', hidden: true, campaign: 'trench' } });
    if (!hit.body.found) throw new Error('expected found');
    expect(hit.body.achievements.map((a) => a.id).sort()).toEqual(['first-record', 'hidden-1']);

    const again = await call<DiscoverResult>('/archive/discover', 'POST', { code: 'sahlo folina' });
    expect(again.body).toMatchObject({ found: true, alreadyHad: true, achievements: [] });

    const archive = (await call<ArchiveResponse>('/archive')).body;
    expect(archive.hiddenFound).toBe(1);
    expect(archive.records.map((r) => r.id)).toEqual(['ev-9']);
  });
});

describe('achievements', () => {
  it('lists open ones, and counts secret ones without naming them', async () => {
    const { body } = await call<AchievementsResponse>('/achievements');
    expect(body.achievements.map((a) => a.id)).not.toContain('again');
    expect(JSON.stringify(body)).not.toContain('Again');
    expect(body.secretRemaining).toBe(1);
    expect(body.achievements.every((a) => a.awardedAt === null)).toBe(true);
  });
});

describe('the notebook', () => {
  it('creates, lists, edits and deletes entries', async () => {
    const created = await call<NotebookEntry>('/notebook', 'POST', { title: 'Two dates', body: 'They do not match.' });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ title: 'Two dates', version: 1, evidence: [] });

    const id = created.body.id;
    const edited = await call<NotebookEntry>(`/notebook/${id}`, 'PUT', { title: 'Two dates', body: 'One is forged.', version: 1 });
    expect(edited.body).toMatchObject({ body: 'One is forged.', version: 2 });

    const list = await call<{ entries: NotebookEntry[] }>('/notebook');
    expect(list.body.entries).toHaveLength(1);

    expect((await call(`/notebook/${id}`, 'DELETE')).status).toBe(204);
    expect((await call<{ entries: NotebookEntry[] }>('/notebook')).body.entries).toEqual([]);
  });

  it('refuses an edit made on a stale copy and returns the newer one', async () => {
    const { body: entry } = await call<NotebookEntry>('/notebook', 'POST', { title: 'Theory', body: 'v1' });
    await call(`/notebook/${entry.id}`, 'PUT', { title: 'Theory', body: 'from the laptop', version: 1 });
    const stale = await call<{ error: { code: string }; current: NotebookEntry }>(
      `/notebook/${entry.id}`, 'PUT', { title: 'Theory', body: 'from the phone', version: 1 });
    expect(stale.status).toBe(409);
    expect(stale.body.current).toMatchObject({ body: 'from the laptop', version: 2 });
  });

  it('links only records the player has recovered', async () => {
    expect((await call('/notebook', 'POST', { body: 'x', evidence: ['ev-1'] })).status).toBe(400);
    await call('/missions/bf-letters/start', 'POST');
    const ok = await call<NotebookEntry>('/notebook', 'POST', { body: 'x', evidence: ['ev-1', 'ev-1'] });
    expect(ok.body.evidence).toEqual(['ev-1']);
  });

  it('enforces its size limits', async () => {
    expect((await call('/notebook', 'POST', { title: 'x'.repeat(121) })).status).toBe(400);
    expect((await call('/notebook', 'POST', { body: 'x'.repeat(20001) })).status).toBe(400);
  });

  it('survives a new cycle', async () => {
    await call('/notebook', 'POST', { body: 'kept forever' });
    await h.sql(`update public.runs set status = 'completed'`);
    await h.sql(`insert into public.runs (user_id, number) select user_id, 2 from public.runs`);
    expect((await call<{ entries: NotebookEntry[] }>('/notebook')).body.entries[0]?.body).toBe('kept forever');
  });

  it('404s a malformed id instead of erroring', async () => {
    expect((await call('/notebook/not-a-uuid', 'PUT', { body: 'x', version: 1 })).status).toBe(404);
  });
});
