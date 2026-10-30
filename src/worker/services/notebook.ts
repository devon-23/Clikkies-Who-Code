// The investigator's notebook: the player's own words. Saved per entry with a
// version number, so an edit made on a stale copy (another device got there
// first) is refused with the newer copy rather than silently overwriting it.
//
// Never logged, never read by the admin panel.

import { and, count, desc, eq, inArray, sql } from 'drizzle-orm';
import type { NotebookEntry } from '../../shared/api.ts';
import type { Registry } from '../content/registry.ts';
import type { Db } from '../db/client.ts';
import { notebookEntries, notebookEntryEvidence } from '../db/schema.ts';
import { ApiError } from '../lib/http.ts';
import { discovered } from './evidence.ts';

const MAX_ENTRIES = 500;

type Row = typeof notebookEntries.$inferSelect;

interface Draft {
  title: string;
  body: string;
  evidence: string[];
}

function toEntry(row: Row, evidence: string[]): NotebookEntry {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    evidence,
    version: row.version,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function linksFor(db: Db, ids: string[]): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>(ids.map((id) => [id, []]));
  if (!ids.length) return out;
  const rows = await db.select().from(notebookEntryEvidence).where(inArray(notebookEntryEvidence.entryId, ids));
  for (const r of rows) out.get(r.entryId)?.push(r.evidenceId);
  return out;
}

// a note can only point at records this player has actually recovered
async function checkLinks(db: Db, reg: Registry, userId: string, ids: string[]): Promise<string[]> {
  const unique = [...new Set(ids)];
  const found = await discovered(db, reg, userId, unique);
  if (unique.some((id) => !found.has(id))) {
    throw new ApiError(400, 'invalid', 'A note can only link records you have recovered.');
  }
  return unique;
}

export async function listEntries(db: Db, userId: string): Promise<NotebookEntry[]> {
  const rows = await db.select().from(notebookEntries)
    .where(eq(notebookEntries.userId, userId)).orderBy(desc(notebookEntries.updatedAt));
  const links = await linksFor(db, rows.map((r) => r.id));
  return rows.map((r) => toEntry(r, links.get(r.id) ?? []));
}

export async function createEntry(db: Db, reg: Registry, userId: string, draft: Draft): Promise<NotebookEntry> {
  const [{ n } = { n: 0 }] = await db.select({ n: count() }).from(notebookEntries).where(eq(notebookEntries.userId, userId));
  if (n >= MAX_ENTRIES) throw new ApiError(400, 'invalid', `The notebook holds ${MAX_ENTRIES} entries. Delete some to make room.`);
  const evidence = await checkLinks(db, reg, userId, draft.evidence);

  return db.transaction(async (tx) => {
    const [row] = await tx.insert(notebookEntries).values({ userId, title: draft.title, body: draft.body }).returning();
    if (evidence.length) await tx.insert(notebookEntryEvidence).values(evidence.map((evidenceId) => ({ entryId: row!.id, evidenceId })));
    return toEntry(row!, evidence);
  });
}

export async function updateEntry(
  db: Db, reg: Registry, userId: string, id: string, draft: Draft, version: number,
): Promise<NotebookEntry> {
  const evidence = await checkLinks(db, reg, userId, draft.evidence);

  return db.transaction(async (tx) => {
    const [row] = await tx.update(notebookEntries)
      .set({ title: draft.title, body: draft.body, version: sql`${notebookEntries.version} + 1`, updatedAt: new Date() })
      // the user check is what keeps one player's request off another's entry
      .where(and(eq(notebookEntries.id, id), eq(notebookEntries.userId, userId), eq(notebookEntries.version, version)))
      .returning();

    if (!row) {
      const [current] = await tx.select().from(notebookEntries)
        .where(and(eq(notebookEntries.id, id), eq(notebookEntries.userId, userId)));
      if (!current) throw new ApiError(404, 'not_found', 'No such entry.');
      const links = await linksFor(tx, [id]);
      throw new ApiError(409, 'conflict', 'This entry was changed on another device.', {
        current: toEntry(current, links.get(id) ?? []),
      });
    }

    await tx.delete(notebookEntryEvidence).where(eq(notebookEntryEvidence.entryId, id));
    if (evidence.length) await tx.insert(notebookEntryEvidence).values(evidence.map((evidenceId) => ({ entryId: id, evidenceId })));
    return toEntry(row, evidence);
  });
}

export async function deleteEntry(db: Db, userId: string, id: string): Promise<void> {
  const rows = await db.delete(notebookEntries)
    .where(and(eq(notebookEntries.id, id), eq(notebookEntries.userId, userId)))
    .returning({ id: notebookEntries.id });
  if (!rows.length) throw new ApiError(404, 'not_found', 'No such entry.');
}
