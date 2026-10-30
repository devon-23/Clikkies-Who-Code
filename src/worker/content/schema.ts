// What authored story content looks like. Everything here is SERVER-ONLY:
// missions, evidence, hints, answers and hidden codes are compiled into the
// Worker and reach the browser only through the API, one unlocked piece at a
// time. Never import content/story from src/app -- a test checks.

import { z } from 'zod';
import { CAMPAIGN_IDS } from '../../shared/content/campaign.ts';

const id = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'ids are lowercase-kebab-case');
const paragraphs = z.array(z.string().min(1)).min(1);

// ---------------------------------------------------------------------------
// answers
//
// How a submission is normalised before comparison. Defaults suit most text
// answers: case and surrounding/repeated whitespace never matter.

export const normalizeOptions = z.object({
  caseSensitive: z.boolean().default(false),
  // "east, is up!" == "east is up"
  ignorePunctuation: z.boolean().default(true),
  // "eastisup" == "east is up" -- for codes where spacing is meaningless
  ignoreSpaces: z.boolean().default(false),
}).prefault({});

// a recognised wrong answer that deserves a pointed, non-revealing reply
const nearMiss = z.object({
  accepted: z.array(z.string().min(1)).min(1),
  message: z.string().min(1),
});

const textAnswer = z.object({
  kind: z.literal('text'),
  label: z.string().min(1),
  placeholder: z.string().optional(),
  accepted: z.array(z.string().min(1)).min(1),
  normalize: normalizeOptions,
  nearMisses: z.array(nearMiss).default([]),
});

// several findings submitted together -- e.g. a finale. All must be right
const fieldsAnswer = z.object({
  kind: z.literal('fields'),
  fields: z.array(z.object({
    id,
    label: z.string().min(1),
    placeholder: z.string().optional(),
    accepted: z.array(z.string().min(1)).min(1),
    normalize: normalizeOptions,
  })).min(2),
  // "2 of 3 findings hold up" -- useful, and says nothing about which
  revealCount: z.boolean().default(true),
});

// pick the right options -- e.g. which two records contradict each other.
// option labels are public; which ones are correct is not
const choiceAnswer = z.object({
  kind: z.literal('choice'),
  prompt: z.string().min(1),
  options: z.array(z.object({ id, label: z.string().min(1) })).min(2),
  correct: z.array(id).min(1),
});

export const answerSchema = z.discriminatedUnion('kind', [textAnswer, fieldsAnswer, choiceAnswer]);
export type AnswerConfig = z.infer<typeof answerSchema>;

// ---------------------------------------------------------------------------
// missions

// which reusable interface the mission opens in. Its props are public and
// must never contain a solution
export const INTERACTIONS = [
  'document', 'website', 'terminal', 'source', 'cipher', 'comparison', 'data', 'workspace',
] as const;

const hint = z.object({
  level: z.enum(['nudge', 'direction', 'technique']),
  text: z.string().min(1),
});

export const missionSchema = z.object({
  id,
  campaign: z.enum(CAMPAIGN_IDS),
  order: z.number().int().min(1),
  title: z.string().min(1),
  subtitle: z.string().min(1),
  difficulty: z.string().min(1),
  intro: paragraphs,
  objectives: z.array(z.string().min(1)).min(1),
  // missions that must be completed in this run first. Omitted = the
  // previous mission in the same campaign (none for the first)
  prerequisites: z.array(id).optional(),
  interaction: z.object({
    component: z.enum(INTERACTIONS),
    props: z.record(z.string(), z.unknown()).default({}),
  }),
  startingEvidence: z.array(id).default([]),
  answer: answerSchema,
  // progressive: nudge, then direction, then technique. Never the answer
  hints: z.array(hint).min(1).max(3),
  success: paragraphs,
  rewards: z.object({
    evidence: z.array(id).default([]),
    achievements: z.array(id).default([]),
  }).prefault({}),
  // optional -- a campaign is complete when every non-optional mission is
  optional: z.boolean().default(false),
  finale: z.boolean().default(false),
  mobile: z.enum(['full', 'limited', 'desktop-only']).default('full'),
  mobileNote: z.string().optional(),
  external: z.array(z.object({
    label: z.string().min(1),
    url: z.url(),
    // the in-site copy of anything critical, in case the platform changes
    fallbackEvidence: id,
  })).default([]),
});

export type Mission = z.infer<typeof missionSchema>;

// ---------------------------------------------------------------------------
// evidence

export const EVIDENCE_KINDS = [
  'letter', 'transmission', 'image', 'file', 'profile', 'map', 'transcript', 'document', 'message', 'note',
] as const;

const block = z.discriminatedUnion('type', [
  z.object({ type: z.literal('paragraph'), text: z.string() }),
  z.object({ type: z.literal('heading'), text: z.string() }),
  z.object({ type: z.literal('fields'), rows: z.array(z.tuple([z.string(), z.string()])) }),
  z.object({ type: z.literal('preformatted'), text: z.string() }),
  z.object({ type: z.literal('redacted'), length: z.number().int().min(1).max(60) }),
  z.object({ type: z.literal('quote'), text: z.string(), attribution: z.string().optional() }),
]);

export const evidenceSchema = z.object({
  id,
  // a stable file number shown on redacted slots, so the archive can show a
  // gap without giving away the record's real id or title
  fileNo: z.string().regex(/^[A-Z]-\d{4}$/, 'file numbers look like D-0012'),
  title: z.string().min(1),
  kind: z.enum(EVIDENCE_KINDS),
  campaign: z.enum(CAMPAIGN_IDS),
  classification: z.enum(['public', 'restricted', 'classified']),
  source: z.string().min(1),
  // dated in-world. shown as a Dema date
  dated: z.iso.date().optional(),
  summary: z.string().min(1).max(280),
  body: z.array(block).min(1),
  related: z.array(id).default([]),
  // part of the optional ARG: not shown as an empty slot until found
  hidden: z.boolean().default(false),
});

export type Evidence = z.infer<typeof evidenceSchema>;

// a phrase a player can enter at the archive terminal to recover a record
// that is not handed out by any mission
export const hiddenCodeSchema = z.object({
  id,
  code: z.string().min(3),
  normalize: normalizeOptions,
  evidence: id,
  // documented in docs/content-map.md: where the clue is and what it means
  note: z.string().min(1),
});

export type HiddenCode = z.infer<typeof hiddenCodeSchema>;

// ---------------------------------------------------------------------------
// achievements
//
// Account-level and permanent across cycles. No trigger may depend on hint
// use -- hints never cost anything.

const trigger = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('mission'), mission: id }),
  z.object({ kind: z.literal('campaign'), campaign: z.enum(CAMPAIGN_IDS) }),
  z.object({ kind: z.literal('evidence-count'), count: z.number().int().min(1) }),
  z.object({ kind: z.literal('hidden-count'), count: z.number().int().min(1) }),
  z.object({ kind: z.literal('cycle'), count: z.number().int().min(1) }),
  // awarded by name from mission rewards, or later by Training Grounds
  z.object({ kind: z.literal('granted') }),
]);

export const achievementSchema = z.object({
  id,
  title: z.string().min(1),
  description: z.string().min(1),
  // secret ones are not listed until earned
  secret: z.boolean().default(false),
  trigger,
});

export type Achievement = z.infer<typeof achievementSchema>;
export type AchievementTrigger = z.infer<typeof trigger>;
