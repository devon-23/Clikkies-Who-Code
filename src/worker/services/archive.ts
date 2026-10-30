// The classified archive: the player's permanent record of what they found,
// and the terminal where hidden records can be recovered by phrase.

import type { ArchiveResponse, DiscoverResult, EvidenceRecord } from '../../shared/api.ts';
import type { Registry } from '../content/registry.ts';
import type { Db } from '../db/client.ts';
import { answerAttempts } from '../db/schema.ts';
import { ApiError } from '../lib/http.ts';
import { awardEarned } from './achievements.ts';
import { normalize } from './answers.ts';
import { discovered, grantEvidence, summaries, toRecord, toSummary } from './evidence.ts';
import { activeRun, checkRate, progressFor } from './progress.ts';

// attempts at the terminal share the answer log, under this pseudo-mission
export const TERMINAL = 'archive-terminal';

export async function archiveFor(db: Db, reg: Registry, userId: string): Promise<ArchiveResponse> {
  const found = await discovered(db, reg, userId);
  const byFile = (a: { fileNo: string }, b: { fileNo: string }) => a.fileNo.localeCompare(b.fileNo);
  return {
    records: summaries(reg, found).sort(byFile),
    // gaps in the register: a file number and where it belongs, nothing more.
    // hidden records do not even leave a gap until they are found
    slots: reg.evidenceList
      .filter((e) => !e.hidden && !found.has(e.id))
      .map((e) => ({ fileNo: e.fileNo, campaign: e.campaign, classification: e.classification }))
      .sort(byFile),
    hiddenFound: [...found.keys()].filter((id) => reg.evidence.get(id)?.hidden).length,
  };
}

export async function recordFor(db: Db, reg: Registry, userId: string, id: string): Promise<EvidenceRecord> {
  const e = reg.evidence.get(id);
  const found = await discovered(db, reg, userId);
  // not found and not real look identical from outside
  if (!e || !found.has(id)) throw new ApiError(404, 'not_found', 'No such record on file.');
  return toRecord(reg, e, found);
}

export async function discoverByCode(db: Db, reg: Registry, userId: string, code: string): Promise<DiscoverResult> {
  await checkRate(db, userId, TERMINAL);
  const run = await activeRun(db, userId);
  const hit = reg.hiddenCodes.find((h) => {
    const n = normalize(code, h.normalize);
    return n.length > 0 && n === normalize(h.code, h.normalize);
  });

  await db.insert(answerAttempts).values({
    userId, runId: run.id, missionId: TERMINAL, correct: Boolean(hit),
    guess: hit ? null : normalize(code, { caseSensitive: false, ignorePunctuation: true, ignoreSpaces: false }).slice(0, 64),
  });

  if (!hit) return { found: false, message: 'Nothing on file under that.' };

  // kept even if the record's campaign is still sealed -- found is found
  const fresh = await grantEvidence(db, userId, run.id, [hit.evidence], 'hidden', null);
  const progress = await progressFor(db, reg, userId);
  const achievements = fresh.length
    ? await awardEarned(db, reg, {
        userId, runId: run.id, cycle: run.number,
        completeCampaigns: new Set(progress.campaigns.filter((c) => c.complete).map((c) => c.id)),
      })
    : [];
  const at = (await discovered(db, reg, userId, [hit.evidence])).get(hit.evidence)!;
  return { found: true, record: toSummary(reg.evidence.get(hit.evidence)!, at), alreadyHad: fresh.length === 0, achievements };
}
