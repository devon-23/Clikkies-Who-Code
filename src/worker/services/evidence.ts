// The permanent archive. Evidence belongs to the account: once found it stays
// found, through every replay and every new cycle.

import { and, eq, inArray } from 'drizzle-orm';
import type { EvidenceRecord, EvidenceSummary } from '../../shared/api.ts';
import type { Registry } from '../content/registry.ts';
import type { Evidence } from '../content/schema.ts';
import type { Db } from '../db/client.ts';
import { evidenceDiscoveries } from '../db/schema.ts';

type Source = (typeof evidenceDiscoveries.$inferInsert)['source'];

export function toSummary(e: Evidence, discoveredAt: Date): EvidenceSummary {
  return {
    id: e.id,
    fileNo: e.fileNo,
    title: e.title,
    kind: e.kind,
    campaign: e.campaign,
    classification: e.classification,
    source: e.source,
    dated: e.dated ?? null,
    summary: e.summary,
    hidden: e.hidden,
    discoveredAt: discoveredAt.toISOString(),
  };
}

/** Records evidence as found. Returns only the ids that are new to this player. */
export async function grantEvidence(
  db: Pick<Db, 'insert'>,
  userId: string,
  runId: string,
  ids: string[],
  source: Source,
  missionId: string | null,
): Promise<string[]> {
  if (!ids.length) return [];
  const rows = await db
    .insert(evidenceDiscoveries)
    .values(ids.map((evidenceId) => ({ userId, evidenceId, runId, source, missionId })))
    .onConflictDoNothing()
    .returning({ id: evidenceDiscoveries.evidenceId });
  return rows.map((r) => r.id);
}

/** What this player has found, as a map of id -> when. Ids no longer in content are dropped. */
export async function discovered(db: Db, reg: Registry, userId: string, only?: string[]): Promise<Map<string, Date>> {
  if (only && !only.length) return new Map();
  const rows = await db
    .select({ id: evidenceDiscoveries.evidenceId, at: evidenceDiscoveries.discoveredAt })
    .from(evidenceDiscoveries)
    .where(only
      ? and(eq(evidenceDiscoveries.userId, userId), inArray(evidenceDiscoveries.evidenceId, only))
      : eq(evidenceDiscoveries.userId, userId));
  return new Map(rows.filter((r) => reg.evidence.has(r.id)).map((r) => [r.id, r.at]));
}

export function summaries(reg: Registry, found: Map<string, Date>, ids?: string[]): EvidenceSummary[] {
  return (ids ?? [...found.keys()])
    .filter((id) => found.has(id) && reg.evidence.has(id))
    .map((id) => toSummary(reg.evidence.get(id)!, found.get(id)!));
}

export function toRecord(reg: Registry, e: Evidence, found: Map<string, Date>): EvidenceRecord {
  const related = e.related.filter((r) => found.has(r)).map((r) => {
    const x = reg.evidence.get(r)!;
    return { id: x.id, fileNo: x.fileNo, title: x.title };
  });
  return {
    ...toSummary(e, found.get(e.id)!),
    body: e.body,
    related,
    relatedMissing: e.related.length - related.length,
  };
}
