// Achievements are checked after anything that could earn one, and awarded
// at most once per account. They survive every new cycle. None of them can
// depend on hints -- the schema has no trigger that could.

import { and, count, eq } from 'drizzle-orm';
import type { CampaignId } from '../../shared/content/campaign.ts';
import type { AchievementView } from '../../shared/api.ts';
import type { Registry } from '../content/registry.ts';
import type { Achievement } from '../content/schema.ts';
import type { Db } from '../db/client.ts';
import { evidenceDiscoveries, missionCompletions, playerAchievements } from '../db/schema.ts';

export interface AwardContext {
  userId: string;
  runId: string;
  cycle: number;
  /** campaigns complete in the current run, as of now */
  completeCampaigns: Set<CampaignId>;
  /** achievements named directly, e.g. by a mission's rewards */
  granted?: string[];
}

export function toView(a: Achievement, awardedAt: Date | null): AchievementView {
  return { id: a.id, title: a.title, description: a.description, secret: a.secret, awardedAt: awardedAt?.toISOString() ?? null };
}

/** Awards whatever has now been earned. Returns the newly awarded ones. */
export async function awardEarned(db: Db, reg: Registry, ctx: AwardContext): Promise<AchievementView[]> {
  const have = new Set(
    (await db.select({ id: playerAchievements.achievementId }).from(playerAchievements)
      .where(eq(playerAchievements.userId, ctx.userId))).map((r) => r.id),
  );
  const pending = reg.achievementList.filter((a) => !have.has(a.id));
  if (!pending.length) return [];

  // counts are only fetched if something is waiting on them
  let evidenceTotal: number | undefined;
  let hiddenTotal: number | undefined;
  let missionsDone: Set<string> | undefined;

  const earned: Achievement[] = [];
  for (const a of pending) {
    const t = a.trigger;
    let ok = false;
    switch (t.kind) {
      case 'granted':
        ok = ctx.granted?.includes(a.id) ?? false;
        break;
      case 'campaign':
        ok = ctx.completeCampaigns.has(t.campaign);
        break;
      case 'cycle':
        ok = ctx.cycle >= t.count;
        break;
      case 'mission':
        missionsDone ??= new Set((await db.selectDistinct({ id: missionCompletions.missionId })
          .from(missionCompletions).where(eq(missionCompletions.userId, ctx.userId))).map((r) => r.id));
        ok = missionsDone.has(t.mission);
        break;
      case 'evidence-count':
        evidenceTotal ??= await countEvidence(db, reg, ctx.userId, false);
        ok = evidenceTotal >= t.count;
        break;
      case 'hidden-count':
        hiddenTotal ??= await countEvidence(db, reg, ctx.userId, true);
        ok = hiddenTotal >= t.count;
        break;
    }
    // granted achievements also count when named by a reward, whatever their trigger
    if (!ok && ctx.granted?.includes(a.id)) ok = true;
    if (ok) earned.push(a);
  }

  if (!earned.length) return [];
  const rows = await db
    .insert(playerAchievements)
    .values(earned.map((a) => ({ userId: ctx.userId, achievementId: a.id, runId: ctx.runId })))
    .onConflictDoNothing()
    .returning({ id: playerAchievements.achievementId, at: playerAchievements.awardedAt });
  return rows.map((r) => toView(reg.achievements.get(r.id)!, r.at));
}

async function countEvidence(db: Db, reg: Registry, userId: string, hiddenOnly: boolean): Promise<number> {
  const rows = await db
    .select({ id: evidenceDiscoveries.evidenceId })
    .from(evidenceDiscoveries)
    .where(hiddenOnly
      ? and(eq(evidenceDiscoveries.userId, userId), eq(evidenceDiscoveries.source, 'hidden'))
      : eq(evidenceDiscoveries.userId, userId));
  // only records that still exist in content count
  return rows.filter((r) => reg.evidence.has(r.id)).length;
}

export async function achievementCount(db: Db, userId: string): Promise<number> {
  const [row] = await db.select({ n: count() }).from(playerAchievements).where(eq(playerAchievements.userId, userId));
  return row?.n ?? 0;
}
