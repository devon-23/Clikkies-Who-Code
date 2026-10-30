// Turns authored content into lookups the engine can use, and refuses to
// build if anything is inconsistent: a reward naming evidence that does not
// exist, a prerequisite loop, two records with the same file number. Run by
// `npm run content:check`, by the tests, and when the Worker starts.

import { CAMPAIGN_IDS, type CampaignId } from '../../shared/content/campaign.ts';
import {
  achievementSchema, evidenceSchema, hiddenCodeSchema, missionSchema,
  type Achievement, type Evidence, type HiddenCode, type Mission,
} from './schema.ts';

export interface ContentInput {
  missions: unknown[];
  evidence: unknown[];
  achievements: unknown[];
  hiddenCodes: unknown[];
}

export interface Registry {
  missions: Mission[];
  mission: Map<string, Mission>;
  /** missions of one campaign, in play order */
  byCampaign: Map<CampaignId, Mission[]>;
  /** resolved prerequisites, defaults filled in */
  prerequisites: Map<string, string[]>;
  evidence: Map<string, Evidence>;
  evidenceList: Evidence[];
  achievements: Map<string, Achievement>;
  achievementList: Achievement[];
  hiddenCodes: HiddenCode[];
}

export class ContentError extends Error {
  readonly problems: string[];
  constructor(problems: string[]) {
    super(`Content has ${problems.length} problem(s):\n  - ${problems.join('\n  - ')}`);
    this.problems = problems;
  }
}

export function buildRegistry(input: ContentInput): Registry {
  const problems: string[] = [];

  const parseAll = <T>(items: unknown[], schema: { safeParse: (v: unknown) => { success: true; data: T } | { success: false; error: { issues: { path: PropertyKey[]; message: string }[] } } }, what: string): T[] =>
    items.flatMap((item, i) => {
      const r = schema.safeParse(item);
      if (r.success) return [r.data];
      const label = (item as { id?: string })?.id ?? `#${i}`;
      for (const issue of r.error.issues) problems.push(`${what} ${label}: ${issue.path.join('.') || '(root)'} — ${issue.message}`);
      return [];
    });

  const missions = parseAll(input.missions, missionSchema, 'mission');
  const evidenceList = parseAll(input.evidence, evidenceSchema, 'evidence');
  const achievementList = parseAll(input.achievements, achievementSchema, 'achievement');
  const hiddenCodes = parseAll(input.hiddenCodes, hiddenCodeSchema, 'hidden code');

  const unique = <T>(list: T[], key: (t: T) => string, what: string) => {
    const seen = new Set<string>();
    for (const item of list) {
      const k = key(item);
      if (seen.has(k)) problems.push(`duplicate ${what}: ${k}`);
      seen.add(k);
    }
  };
  unique(missions, (m) => m.id, 'mission id');
  unique(evidenceList, (e) => e.id, 'evidence id');
  unique(evidenceList, (e) => e.fileNo, 'evidence file number');
  unique(achievementList, (a) => a.id, 'achievement id');
  unique(hiddenCodes, (h) => h.id, 'hidden code id');
  unique(missions, (m) => `${m.campaign}#${m.order}`, 'mission order within a campaign');

  const mission = new Map(missions.map((m) => [m.id, m]));
  const evidence = new Map(evidenceList.map((e) => [e.id, e]));
  const achievements = new Map(achievementList.map((a) => [a.id, a]));

  const byCampaign = new Map<CampaignId, Mission[]>(CAMPAIGN_IDS.map((c) => [c, []]));
  for (const m of missions) byCampaign.get(m.campaign)!.push(m);
  for (const list of byCampaign.values()) list.sort((a, b) => a.order - b.order);

  const prerequisites = new Map<string, string[]>();
  for (const list of byCampaign.values()) {
    list.forEach((m, i) => prerequisites.set(m.id, m.prerequisites ?? (i > 0 ? [list[i - 1]!.id] : [])));
  }

  const needEvidence = (ref: string, where: string) => {
    if (!evidence.has(ref)) problems.push(`${where} names evidence "${ref}", which does not exist`);
  };

  for (const m of missions) {
    for (const p of prerequisites.get(m.id) ?? []) {
      if (!mission.has(p)) problems.push(`mission ${m.id} requires "${p}", which does not exist`);
      else if (CAMPAIGN_IDS.indexOf(mission.get(p)!.campaign) > CAMPAIGN_IDS.indexOf(m.campaign)) {
        problems.push(`mission ${m.id} requires "${p}" from a later campaign`);
      }
    }
    m.startingEvidence.forEach((e) => needEvidence(e, `mission ${m.id} startingEvidence`));
    m.rewards.evidence.forEach((e) => needEvidence(e, `mission ${m.id} rewards`));
    m.external.forEach((x) => needEvidence(x.fallbackEvidence, `mission ${m.id} external fallback`));
    for (const a of m.rewards.achievements) {
      if (!achievements.has(a)) problems.push(`mission ${m.id} rewards achievement "${a}", which does not exist`);
    }
    if (m.answer.kind === 'choice') {
      const ids = new Set(m.answer.options.map((o) => o.id));
      for (const c of m.answer.correct) if (!ids.has(c)) problems.push(`mission ${m.id}: correct choice "${c}" is not an option`);
    }
    // the levels must go nudge -> direction -> technique, in that order
    const order = ['nudge', 'direction', 'technique'];
    m.hints.forEach((h, i) => {
      if (h.level !== order[i]) problems.push(`mission ${m.id}: hint ${i + 1} should be "${order[i]}", not "${h.level}"`);
    });
  }

  for (const e of evidenceList) {
    for (const r of e.related) if (!evidence.has(r)) problems.push(`evidence ${e.id} relates to "${r}", which does not exist`);
  }
  for (const h of hiddenCodes) needEvidence(h.evidence, `hidden code ${h.id}`);

  for (const a of achievementList) {
    const t = a.trigger;
    if (t.kind === 'mission' && !mission.has(t.mission)) problems.push(`achievement ${a.id} waits on mission "${t.mission}", which does not exist`);
  }

  // prerequisite loops would leave missions that can never open
  const state = new Map<string, 'visiting' | 'done'>();
  const visit = (mid: string, path: string[]) => {
    if (state.get(mid) === 'done') return;
    if (state.get(mid) === 'visiting') {
      problems.push(`prerequisite loop: ${[...path, mid].join(' → ')}`);
      return;
    }
    state.set(mid, 'visiting');
    for (const p of prerequisites.get(mid) ?? []) if (mission.has(p)) visit(p, [...path, mid]);
    state.set(mid, 'done');
  };
  missions.forEach((m) => visit(m.id, []));

  if (problems.length) throw new ContentError(problems);

  return {
    missions, mission, byCampaign, prerequisites,
    evidence, evidenceList, achievements, achievementList, hiddenCodes,
  };
}
