// What the admin can see about players: progress, counts, and puzzle health.
// Never notebook contents -- not here, not anywhere in /admin.

import { and, count, desc, eq, gt, isNotNull, max, sql } from 'drizzle-orm';
import type { AchievementsResponse, Diagnostics, PlayerDetail, PlayerRow } from '../../shared/api.ts';
import type { Registry } from '../content/registry.ts';
import type { Db } from '../db/client.ts';
import {
  answerAttempts, errorEvents, evidenceDiscoveries, hintUsage, missionCompletions, missionProgress,
  playerAchievements, profiles, runs,
} from '../db/schema.ts';
import { ApiError } from '../lib/http.ts';
import { toView } from './achievements.ts';
import { TERMINAL } from './archive.ts';
import { progressFor } from './progress.ts';

const RECENT_MS = 30 * 24 * 60 * 60_000;

export async function listPlayers(db: Db): Promise<PlayerRow[]> {
  const people = await db.select().from(profiles).orderBy(desc(profiles.createdAt));
  const cycles = await db.select({ userId: runs.userId, n: max(runs.number) }).from(runs).groupBy(runs.userId);
  const done = await db
    .select({ userId: missionCompletions.userId, n: sql<number>`count(distinct ${missionCompletions.missionId})`.mapWith(Number), last: max(missionCompletions.completedAt) })
    .from(missionCompletions).groupBy(missionCompletions.userId);
  const ev = await db.select({ userId: evidenceDiscoveries.userId, n: count() }).from(evidenceDiscoveries).groupBy(evidenceDiscoveries.userId);
  const tried = await db.select({ userId: answerAttempts.userId, last: max(answerAttempts.createdAt) }).from(answerAttempts).groupBy(answerAttempts.userId);

  const by = <T extends { userId: string }>(rows: T[]) => new Map(rows.map((r) => [r.userId, r]));
  const [c, d, e, t] = [by(cycles), by(done), by(ev), by(tried)];

  return people.map((p) => {
    const last = [d.get(p.userId)?.last, t.get(p.userId)?.last].filter((x): x is Date => x instanceof Date)
      .sort((a, b) => b.getTime() - a.getTime())[0];
    return {
      username: p.username,
      role: p.role,
      cycle: c.get(p.userId)?.n ?? 1,
      missionsCompleted: d.get(p.userId)?.n ?? 0,
      evidence: e.get(p.userId)?.n ?? 0,
      lastActive: last?.toISOString() ?? null,
      createdAt: p.createdAt.toISOString(),
    };
  });
}

export async function playerDetail(db: Db, reg: Registry, username: string): Promise<PlayerDetail> {
  const [p] = await db.select().from(profiles).where(sql`lower(${profiles.username}) = ${username.toLowerCase()}`);
  if (!p) throw new ApiError(404, 'not_found', 'No player with that handle.');
  const progress = await progressFor(db, reg, p.userId);
  const hints = await db
    .select({ missionId: hintUsage.missionId, levels: count() })
    .from(hintUsage)
    .innerJoin(runs, and(eq(runs.id, hintUsage.runId), eq(runs.status, 'active')))
    .where(eq(hintUsage.userId, p.userId))
    .groupBy(hintUsage.missionId);
  return { username: p.username, role: p.role, progress, hintsUsed: hints };
}

export async function diagnostics(db: Db, reg: Registry): Promise<Diagnostics> {
  const since = new Date(Date.now() - RECENT_MS);

  const attempts = await db
    .select({
      missionId: answerAttempts.missionId,
      attempts: count(),
      correct: sql<number>`count(*) filter (where ${answerAttempts.correct})`.mapWith(Number),
      players: sql<number>`count(distinct ${answerAttempts.userId})`.mapWith(Number),
    })
    .from(answerAttempts)
    .where(gt(answerAttempts.createdAt, since))
    .groupBy(answerAttempts.missionId);

  const wrong = await db
    .select({ missionId: answerAttempts.missionId, guess: answerAttempts.guess, n: count() })
    .from(answerAttempts)
    .where(and(eq(answerAttempts.correct, false), isNotNull(answerAttempts.guess), gt(answerAttempts.createdAt, since)))
    .groupBy(answerAttempts.missionId, answerAttempts.guess)
    .orderBy(desc(count()));

  const hints = await db
    .select({ missionId: hintUsage.missionId, level: hintUsage.level, n: count() })
    .from(hintUsage)
    .groupBy(hintUsage.missionId, hintUsage.level);

  const ids = [...reg.missions.map((m) => m.id), TERMINAL];
  const missions = ids.map((id) => {
    const a = attempts.find((x) => x.missionId === id);
    const h = (level: number) => hints.find((x) => x.missionId === id && x.level === level)?.n ?? 0;
    return {
      missionId: id,
      title: reg.mission.get(id)?.title ?? 'Archive terminal (hidden codes)',
      attempts: a?.attempts ?? 0,
      correct: a?.correct ?? 0,
      players: a?.players ?? 0,
      hintUse: [h(1), h(2), h(3)] as [number, number, number],
      topWrong: wrong.filter((w) => w.missionId === id).slice(0, 5).map((w) => ({ guess: w.guess!, count: w.n })),
    };
  });

  const errors = await db.select().from(errorEvents).orderBy(desc(errorEvents.occurredAt)).limit(25);

  return {
    missions,
    errors: errors.map((e) => ({ occurredAt: e.occurredAt.toISOString(), route: e.route, message: e.message, requestId: e.requestId })),
    orphans: await orphans(db, reg),
  };
}

// rows pointing at content that has since been renamed or removed. They are
// harmless -- the engine ignores them -- but they usually mean an id was
// changed in content without thinking about players who already had it
async function orphans(db: Db, reg: Registry): Promise<Diagnostics['orphans']> {
  const out: Diagnostics['orphans'] = [];
  const check = async (table: string, rows: { id: string; n: number }[], known: (id: string) => boolean) => {
    for (const r of rows) if (!known(r.id)) out.push({ table, id: r.id, rows: r.n });
  };
  await check('mission_progress',
    await db.select({ id: missionProgress.missionId, n: count() }).from(missionProgress).groupBy(missionProgress.missionId),
    (id) => reg.mission.has(id));
  await check('evidence_discoveries',
    await db.select({ id: evidenceDiscoveries.evidenceId, n: count() }).from(evidenceDiscoveries).groupBy(evidenceDiscoveries.evidenceId),
    (id) => reg.evidence.has(id));
  await check('player_achievements',
    await db.select({ id: playerAchievements.achievementId, n: count() }).from(playerAchievements).groupBy(playerAchievements.achievementId),
    (id) => reg.achievements.has(id));
  return out;
}

export async function achievementsFor(db: Db, reg: Registry, userId: string): Promise<AchievementsResponse> {
  const rows = await db.select().from(playerAchievements).where(eq(playerAchievements.userId, userId));
  const got = new Map(rows.map((r) => [r.achievementId, r.awardedAt]));
  return {
    achievements: reg.achievementList
      .filter((a) => !a.secret || got.has(a.id))
      .map((a) => toView(a, got.get(a.id) ?? null)),
    secretRemaining: reg.achievementList.filter((a) => a.secret && !got.has(a.id)).length,
  };
}

// nightly: old wrong-answer text and old error records are deleted. counts
// stay; the words people typed do not
export async function prune(db: Db): Promise<void> {
  const cutoff = new Date(Date.now() - RECENT_MS);
  await db.update(answerAttempts).set({ guess: null })
    .where(and(isNotNull(answerAttempts.guess), sql`${answerAttempts.createdAt} < ${cutoff.toISOString()}::timestamptz`));
  await db.delete(errorEvents).where(sql`${errorEvents.occurredAt} < ${new Date(Date.now() - 3 * RECENT_MS).toISOString()}::timestamptz`);
}

