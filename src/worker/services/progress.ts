// The progression engine: runs, unlocks, starting a mission, hints, answers,
// saved working state, and the next cycle.
//
// What is locked and what is open is never stored. It is worked out from
// what this run has completed, every time, so it cannot drift:
//
//   * Campaign 1 is open. Campaign n opens when campaign n-1 is complete.
//   * A campaign is complete when it has missions and every non-optional
//     one is completed in this run. (An empty campaign is never complete,
//     so a campaign that is not built yet cannot be skipped through.)
//   * A mission opens when its campaign is open and its prerequisites are
//     completed in this run.

import { and, count, eq, gt, sql } from 'drizzle-orm';
import type {
  CampaignProgress, MissionStatus, MissionSummary, MissionView, ProgressResponse, RunSummary, SubmitResult,
} from '../../shared/api.ts';
import { CAMPAIGN_IDS, type CampaignId } from '../../shared/content/campaign.ts';
import type { Registry } from '../content/registry.ts';
import type { Mission } from '../content/schema.ts';
import type { Db } from '../db/client.ts';
import { answerAttempts, hintUsage, missionCompletions, missionProgress, runs } from '../db/schema.ts';
import { ApiError } from '../lib/http.ts';
import { checkAnswer, answerForm, type Submission } from './answers.ts';
import { achievementCount, awardEarned } from './achievements.ts';
import { discovered, grantEvidence, summaries } from './evidence.ts';

type Run = typeof runs.$inferSelect;
type ProgressRow = typeof missionProgress.$inferSelect;

// ---------------------------------------------------------------------------
// runs

/** The player's current cycle, opening cycle 1 on their first visit. */
export async function activeRun(db: Db, userId: string): Promise<Run> {
  const find = () => db.select().from(runs).where(and(eq(runs.userId, userId), eq(runs.status, 'active')));
  const [run] = await find();
  if (run) return run;
  // two first requests at once: the one-active-run index lets only one in
  await db.insert(runs).values({ userId, number: 1 }).onConflictDoNothing();
  const [created] = await find();
  return created!;
}

// ---------------------------------------------------------------------------
// working out what is open

export interface Computed {
  status: Map<string, MissionStatus>;
  campaigns: CampaignProgress[];
  complete: Set<CampaignId>;
}

export function computeProgress(
  reg: Registry,
  progress: Map<string, { status: ProgressRow['status'] }>,
  completedEver: Set<string>,
): Computed {
  const done = (id: string) => progress.get(id)?.status === 'completed';
  const status = new Map<string, MissionStatus>();
  const complete = new Set<CampaignId>();
  const campaigns: CampaignProgress[] = [];

  let previousComplete = true;
  CAMPAIGN_IDS.forEach((cid, i) => {
    const list = reg.byCampaign.get(cid) ?? [];
    const unlocked = i === 0 || previousComplete;

    const missions: MissionSummary[] = list.map((m) => {
      let s: MissionStatus;
      if (done(m.id)) s = 'completed';
      else if (!unlocked || !(reg.prerequisites.get(m.id) ?? []).every(done)) s = 'locked';
      else s = progress.has(m.id) ? 'in_progress' : 'available';
      status.set(m.id, s);
      const open = s !== 'locked';
      return {
        id: m.id,
        order: m.order,
        title: open ? m.title : null,
        subtitle: open ? m.subtitle : null,
        status: s,
        completedEver: completedEver.has(m.id),
        optional: m.optional,
        finale: m.finale,
      };
    });

    const required = list.filter((m) => !m.optional);
    const isComplete = required.length > 0 && required.every((m) => done(m.id));
    if (isComplete) complete.add(cid);
    campaigns.push({
      id: cid,
      unlocked,
      complete: isComplete,
      required: required.length,
      completed: required.filter((m) => done(m.id)).length,
      missions,
    });
    previousComplete = isComplete;
  });

  return { status, campaigns, complete };
}

interface RunState {
  run: Run;
  progress: Map<string, ProgressRow>;
  completedEver: Set<string>;
  computed: Computed;
}

async function loadState(db: Db, reg: Registry, userId: string): Promise<RunState> {
  const run = await activeRun(db, userId);
  const rows = await db.select().from(missionProgress).where(eq(missionProgress.runId, run.id));
  const progress = new Map(rows.filter((r) => reg.mission.has(r.missionId)).map((r) => [r.missionId, r]));
  const ever = await db.selectDistinct({ id: missionCompletions.missionId })
    .from(missionCompletions).where(eq(missionCompletions.userId, userId));
  const completedEver = new Set(ever.map((r) => r.id));
  return { run, progress, completedEver, computed: computeProgress(reg, progress, completedEver) };
}

function mustMission(reg: Registry, id: string): Mission {
  const m = reg.mission.get(id);
  if (!m) throw new ApiError(404, 'not_found', 'No such file.');
  return m;
}

function mustBeOpen(state: RunState, missionId: string): MissionStatus {
  const s = state.computed.status.get(missionId) ?? 'locked';
  if (s === 'locked') throw new ApiError(403, 'locked', 'That file is still sealed.');
  return s;
}

// ---------------------------------------------------------------------------
// the progress overview

export async function progressFor(db: Db, reg: Registry, userId: string): Promise<ProgressResponse> {
  const state = await loadState(db, reg, userId);
  const { computed } = state;

  const allRuns = await db.select().from(runs).where(eq(runs.userId, userId)).orderBy(runs.number);
  const perRun = await db
    .select({ runId: missionCompletions.runId, n: sql<number>`count(distinct ${missionCompletions.missionId})`.mapWith(Number) })
    .from(missionCompletions)
    .where(eq(missionCompletions.userId, userId))
    .groupBy(missionCompletions.runId);
  const doneIn = new Map(perRun.map((r) => [r.runId, r.n]));
  const summary = (r: Run): RunSummary => ({
    number: r.number,
    status: r.status,
    startedAt: r.startedAt.toISOString(),
    completedAt: r.completedAt?.toISOString() ?? null,
    missionsCompleted: doneIn.get(r.id) ?? 0,
  });

  // where to pick up: something already started, else the next thing open
  const flat = computed.campaigns.flatMap((c) => c.missions.map((m) => ({ ...m, campaign: c.id })));
  const next = flat.find((m) => m.status === 'in_progress') ?? flat.find((m) => m.status === 'available');

  return {
    run: summary(state.run),
    history: allRuns.filter((r) => r.id !== state.run.id).map(summary).reverse(),
    campaigns: computed.campaigns,
    current: next ? { missionId: next.id, title: next.title!, campaign: next.campaign, status: next.status } : null,
    canStartNewCycle: computed.complete.has('breach'),
    evidenceCount: (await discovered(db, reg, userId)).size,
    achievementCount: await achievementCount(db, userId),
  };
}

// ---------------------------------------------------------------------------
// one mission

async function buildView(db: Db, reg: Registry, userId: string, state: RunState, m: Mission): Promise<MissionView> {
  const row = state.progress.get(m.id);
  const status = state.computed.status.get(m.id)!;

  const used = await db
    .select({ level: hintUsage.level })
    .from(hintUsage)
    .where(and(eq(hintUsage.runId, state.run.id), eq(hintUsage.missionId, m.id)))
    .orderBy(hintUsage.level);

  // everything this mission hands out, so records found early are recognised
  const own = [...new Set([...m.startingEvidence, ...m.rewards.evidence, ...m.external.map((x) => x.fallbackEvidence)])];
  const found = await discovered(db, reg, userId, own);

  return {
    id: m.id,
    campaign: m.campaign,
    order: m.order,
    title: m.title,
    subtitle: m.subtitle,
    difficulty: m.difficulty,
    intro: m.intro,
    objectives: m.objectives,
    interaction: m.interaction,
    answerForm: answerForm(m.answer),
    status,
    state: row?.state ?? {},
    version: row?.version ?? 0,
    hints: used.map((u) => m.hints[u.level - 1]!).filter(Boolean),
    hintsTotal: m.hints.length,
    evidence: summaries(reg, found, own),
    success: status === 'completed' ? m.success : null,
    mobile: m.mobile,
    mobileNote: m.mobileNote ?? null,
    external: m.external.map((x) => {
      const f = found.has(x.fallbackEvidence) ? reg.evidence.get(x.fallbackEvidence)! : null;
      return { label: x.label, url: x.url, fallback: f && { id: f.id, fileNo: f.fileNo, title: f.title } };
    }),
  };
}

export async function viewMission(db: Db, reg: Registry, userId: string, missionId: string): Promise<MissionView> {
  const m = mustMission(reg, missionId);
  const state = await loadState(db, reg, userId);
  mustBeOpen(state, m.id);
  return buildView(db, reg, userId, state, m);
}

/** Opening a mission: marks it started and hands over its starting records. Safe to repeat. */
export async function startMission(db: Db, reg: Registry, userId: string, missionId: string): Promise<MissionView> {
  const m = mustMission(reg, missionId);
  let state = await loadState(db, reg, userId);
  mustBeOpen(state, m.id);

  if (!state.progress.has(m.id)) {
    await db.insert(missionProgress).values({ runId: state.run.id, missionId: m.id }).onConflictDoNothing();
  }
  const fresh = await grantEvidence(db, userId, state.run.id, m.startingEvidence, 'mission-start', m.id);
  if (fresh.length) {
    await awardEarned(db, reg, { userId, runId: state.run.id, cycle: state.run.number, completeCampaigns: state.computed.complete });
  }

  state = await loadState(db, reg, userId);
  return buildView(db, reg, userId, state, m);
}

export async function revealHint(db: Db, reg: Registry, userId: string, missionId: string): Promise<MissionView['hints']> {
  const m = mustMission(reg, missionId);
  const state = await loadState(db, reg, userId);
  mustBeOpen(state, m.id);

  const [row] = await db
    .select({ n: count() })
    .from(hintUsage)
    .where(and(eq(hintUsage.runId, state.run.id), eq(hintUsage.missionId, m.id)));
  const used = row?.n ?? 0;
  if (used < m.hints.length) {
    // always the next level in order; a double click cannot skip one
    await db.insert(hintUsage)
      .values({ runId: state.run.id, missionId: m.id, level: used + 1, userId })
      .onConflictDoNothing();
  }
  return m.hints.slice(0, Math.min(used + 1, m.hints.length));
}

// generous enough for any honest player; stops someone scripting guesses
const WINDOW_MS = 10 * 60_000;
const PER_MISSION = 20;
const OVERALL = 100;

export async function checkRate(db: Db, userId: string, missionId: string): Promise<void> {
  const since = new Date(Date.now() - WINDOW_MS);
  const recent = await db
    .select({ missionId: answerAttempts.missionId })
    .from(answerAttempts)
    .where(and(eq(answerAttempts.userId, userId), gt(answerAttempts.createdAt, since)));
  if (recent.length >= OVERALL || recent.filter((r) => r.missionId === missionId).length >= PER_MISSION) {
    throw new ApiError(429, 'rate_limited', 'Too many attempts in a short time. Step away for a few minutes and come back to it.');
  }
}

export async function submitAnswer(
  db: Db, reg: Registry, userId: string, missionId: string, answer: Submission,
): Promise<SubmitResult> {
  const m = mustMission(reg, missionId);
  const before = await loadState(db, reg, userId);
  const status = mustBeOpen(before, m.id);
  await checkRate(db, userId, m.id);

  const result = checkAnswer(m.answer, answer);
  const runId = before.run.id;

  if (!result.correct) {
    await db.insert(answerAttempts).values({ userId, runId, missionId: m.id, correct: false, guess: result.guess });
    return { correct: false, message: result.message };
  }

  return db.transaction(async (tx) => {
    await tx.insert(answerAttempts).values({ userId, runId, missionId: m.id, correct: true });

    const [hints] = await tx.select({ n: count() }).from(hintUsage)
      .where(and(eq(hintUsage.runId, runId), eq(hintUsage.missionId, m.id)));

    const now = new Date();
    await tx.insert(missionProgress)
      .values({ runId, missionId: m.id, status: 'completed', completedAt: now })
      .onConflictDoUpdate({
        target: [missionProgress.runId, missionProgress.missionId],
        // a replay keeps the first completion time
        set: {
          status: 'completed',
          completedAt: sql`coalesce(${missionProgress.completedAt}, ${now.toISOString()}::timestamptz)`,
          updatedAt: now,
        },
      });

    const replay = status === 'completed';
    await tx.insert(missionCompletions).values({ userId, runId, missionId: m.id, replay, hintsUsed: hints?.n ?? 0 });

    // starting records too, in case the mission was solved without opening it
    await grantEvidence(tx, userId, runId, m.startingEvidence, 'mission-start', m.id);
    const fresh = await grantEvidence(tx, userId, runId, m.rewards.evidence, 'mission-reward', m.id);

    const afterProgress = new Map<string, { status: ProgressRow['status'] }>(before.progress);
    afterProgress.set(m.id, { status: 'completed' });
    const after = computeProgress(reg, afterProgress, new Set([...before.completedEver, m.id]));

    const achievements = await awardEarned(tx, reg, {
      userId, runId, cycle: before.run.number, completeCampaigns: after.complete, granted: m.rewards.achievements,
    });

    const found = await discovered(tx, reg, userId, fresh);
    const newlyOpen = [...after.status].filter(([id, s]) => s === 'available' && before.computed.status.get(id) === 'locked');

    return {
      correct: true,
      replay,
      success: m.success,
      rewards: { evidence: summaries(reg, found, fresh), achievements },
      unlocked: {
        missions: newlyOpen.map(([id]) => ({ id, title: reg.mission.get(id)!.title })),
        campaigns: after.campaigns.filter((c, i) => c.unlocked && !before.computed.campaigns[i]!.unlocked).map((c) => c.id),
      },
    };
  });
}

/**
 * Saves a mission interface's working state. `version` is the version the
 * edit was based on; if another device saved since, nothing is written and
 * the caller gets the newer copy to reconcile.
 */
export async function saveMissionState(
  db: Db, reg: Registry, userId: string, missionId: string, next: Record<string, unknown>, version: number,
): Promise<{ version: number }> {
  const m = mustMission(reg, missionId);
  const state = await loadState(db, reg, userId);
  mustBeOpen(state, m.id);
  if (JSON.stringify(next).length > 12_000) throw new ApiError(400, 'invalid', 'That is too much to save at once.');

  const row = state.progress.get(m.id);
  if (!row) throw new ApiError(409, 'conflict', 'Open the mission before saving to it.');

  const [saved] = await db.update(missionProgress)
    .set({ state: next, version: sql`${missionProgress.version} + 1`, updatedAt: new Date() })
    .where(and(eq(missionProgress.runId, state.run.id), eq(missionProgress.missionId, m.id), eq(missionProgress.version, version)))
    .returning({ version: missionProgress.version });
  if (saved) return saved;

  const [current] = await db.select().from(missionProgress)
    .where(and(eq(missionProgress.runId, state.run.id), eq(missionProgress.missionId, m.id)));
  throw new ApiError(409, 'conflict', 'This was changed on another device.', {
    current: { state: current?.state ?? {}, version: current?.version ?? 0 },
  });
}

/** The mission's fallback copy of an external clue, for when the platform lets the player down. */
export async function claimFallback(db: Db, reg: Registry, userId: string, missionId: string, index: number) {
  const m = mustMission(reg, missionId);
  const state = await loadState(db, reg, userId);
  mustBeOpen(state, m.id);
  const ext = m.external[index];
  if (!ext) throw new ApiError(404, 'not_found', 'No such link.');
  await grantEvidence(db, userId, state.run.id, [ext.fallbackEvidence], 'mission-start', m.id);
  await awardEarned(db, reg, { userId, runId: state.run.id, cycle: state.run.number, completeCampaigns: state.computed.complete });
  return buildView(db, reg, userId, await loadState(db, reg, userId), m);
}

// ---------------------------------------------------------------------------
// the next cycle

export async function startNewCycle(db: Db, reg: Registry, userId: string): Promise<ProgressResponse> {
  const state = await loadState(db, reg, userId);
  if (!state.computed.complete.has('breach')) {
    throw new ApiError(403, 'locked', 'This cycle is not over yet.');
  }
  const number = state.run.number + 1;
  await db.transaction(async (tx) => {
    await tx.update(runs).set({ status: 'completed', completedAt: new Date() }).where(eq(runs.id, state.run.id));
    const [next] = await tx.insert(runs).values({ userId, number }).returning();
    await awardEarned(tx, reg, { userId, runId: next!.id, cycle: number, completeCampaigns: new Set() });
  });
  return progressFor(db, reg, userId);
}
