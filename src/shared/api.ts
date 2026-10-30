// The shapes the browser and the API agree on. Both sides import this file,
// so a change here shows up as a type error wherever it matters.

import { z } from 'zod';
import type { CampaignId } from './content/campaign.ts';

// ---------------------------------------------------------------------------
// usernames
//
// The account handle. Not the in-story identity -- see docs/architecture.md.

export const USERNAME_RULE = '3–24 letters, numbers or underscores';

// story names, and anything that would let one player pass for staff
const RESERVED = new Set([
  'admin', 'administrator', 'moderator', 'mod', 'staff', 'support', 'system', 'root',
  'clancy', 'torchbearer', 'nico', 'blurryface', 'nova', 'novabishop', 'bishop',
  'keons', 'andre', 'lisden', 'reisdro', 'sacarver', 'nills', 'vetomo', 'listo',
  'ned', 'trash', 'dema', 'dmaorg',
]);

export const usernameSchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9_]{3,24}$/, `Use ${USERNAME_RULE}.`)
  .refine((u) => !RESERVED.has(u.toLowerCase()), 'That name is reserved. Choose another.');

export const createProfileSchema = z.object({ username: usernameSchema });

// ---------------------------------------------------------------------------
// who am I

export type Role = 'player' | 'admin';

// granted       -- in, carry on
// needs_profile -- allowed in, but has not chosen a username yet
// denied        -- signed in, but not on the tester list (or revoked)
export type AccessState = 'granted' | 'needs_profile' | 'denied';
export type DenialReason = 'not_invited' | 'revoked';

export interface Profile {
  username: string;
  role: Role;
  introSeenAt: string | null;
  createdAt: string;
}

export interface MeResponse {
  id: string;
  email: string;
  access: AccessState;
  reason: DenialReason | null;
  profile: Profile | null;
}

export interface PublicConfig {
  registrationOpen: boolean;
  databaseConfigured: boolean;
}

export interface HealthResponse {
  ok: boolean;
  env: string;
  database: 'ok' | 'unconfigured' | 'error';
  auth: 'configured' | 'unconfigured';
}

// ---------------------------------------------------------------------------
// admin

export type TesterStatus = 'invited' | 'active' | 'revoked';

export interface Tester {
  email: string;
  status: TesterStatus;
  source: 'invite' | 'public' | 'bootstrap';
  note: string | null;
  username: string | null;
  createdAt: string;
  revokedAt: string | null;
}

export interface AuditEntry {
  id: number;
  action: string;
  target: string | null;
  actor: string | null;
  createdAt: string;
}

export interface AdminOverview {
  registrationOpen: boolean;
  testers: Tester[];
  audit: AuditEntry[];
  counts: { profiles: number; admins: number; activeTesters: number; invited: number; revoked: number };
}

export const inviteTesterSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email('Enter a valid email address.')).pipe(z.string().max(254)),
  note: z.string().trim().max(200).optional(),
});

export const registrationSchema = z.object({ open: z.boolean() });

// ---------------------------------------------------------------------------
// errors

export type ApiErrorCode =
  | 'unauthenticated'
  | 'forbidden'
  | 'not_invited'
  | 'revoked'
  | 'needs_profile'
  | 'profile_exists'
  | 'username_taken'
  | 'invalid'
  | 'not_found'
  | 'conflict'
  | 'unconfigured'
  | 'locked'
  | 'rate_limited'
  | 'internal';

export interface ApiErrorBody {
  error: { code: ApiErrorCode; message: string; requestId?: string };
}

// ---------------------------------------------------------------------------
// progression
//
// "locked" and "available" are worked out on the server from what this run
// has completed. Locked missions arrive without a title -- the name of an
// unreached mission is itself a small spoiler.

export type MissionStatus = 'locked' | 'available' | 'in_progress' | 'completed';

export interface MissionSummary {
  id: string;
  order: number;
  title: string | null;
  subtitle: string | null;
  status: MissionStatus;
  /** finished in this or any earlier cycle */
  completedEver: boolean;
  optional: boolean;
  finale: boolean;
}

export interface CampaignProgress {
  id: CampaignId;
  unlocked: boolean;
  complete: boolean;
  required: number;
  completed: number;
  missions: MissionSummary[];
}

export interface RunSummary {
  number: number;
  status: 'active' | 'completed';
  startedAt: string;
  completedAt: string | null;
  missionsCompleted: number;
}

export interface ProgressResponse {
  run: RunSummary;
  history: RunSummary[];
  campaigns: CampaignProgress[];
  current: { missionId: string; title: string; campaign: CampaignId; status: MissionStatus } | null;
  canStartNewCycle: boolean;
  evidenceCount: number;
  achievementCount: number;
}

// ---------------------------------------------------------------------------
// evidence

export type EvidenceBlock =
  | { type: 'paragraph'; text: string }
  | { type: 'heading'; text: string }
  | { type: 'fields'; rows: [string, string][] }
  | { type: 'preformatted'; text: string }
  | { type: 'redacted'; length: number }
  | { type: 'quote'; text: string; attribution?: string };

export interface EvidenceSummary {
  id: string;
  fileNo: string;
  title: string;
  kind: string;
  campaign: CampaignId;
  classification: 'public' | 'restricted' | 'classified';
  source: string;
  dated: string | null;
  summary: string;
  hidden: boolean;
  discoveredAt: string;
}

export interface EvidenceRecord extends EvidenceSummary {
  body: EvidenceBlock[];
  /** related records this player has also found */
  related: { id: string; fileNo: string; title: string }[];
  /** related records they have not found yet -- a count, nothing more */
  relatedMissing: number;
}

/** an empty slot in the register: a record exists, but not what it is */
export interface EvidenceSlot {
  fileNo: string;
  campaign: CampaignId;
  classification: 'public' | 'restricted' | 'classified';
}

export interface ArchiveResponse {
  records: EvidenceSummary[];
  slots: EvidenceSlot[];
  hiddenFound: number;
}

export const discoverSchema = z.object({ code: z.string().trim().min(1).max(200) });

export type DiscoverResult =
  | { found: true; record: EvidenceSummary; alreadyHad: boolean; achievements: AchievementView[] }
  | { found: false; message: string };

// ---------------------------------------------------------------------------
// missions

export type AnswerForm =
  | { kind: 'text'; label: string; placeholder?: string }
  | { kind: 'fields'; fields: { id: string; label: string; placeholder?: string }[] }
  | { kind: 'choice'; prompt: string; options: { id: string; label: string }[]; multiple: boolean };

export interface MissionView {
  id: string;
  campaign: CampaignId;
  order: number;
  title: string;
  subtitle: string;
  difficulty: string;
  intro: string[];
  objectives: string[];
  interaction: { component: string; props: Record<string, unknown> };
  answerForm: AnswerForm;
  status: MissionStatus;
  state: Record<string, unknown>;
  version: number;
  hints: { level: 'nudge' | 'direction' | 'technique'; text: string }[];
  hintsTotal: number;
  /** the mission's own records the player already holds -- even from out of order */
  evidence: EvidenceSummary[];
  /** shown once completed in this run */
  success: string[] | null;
  mobile: 'full' | 'limited' | 'desktop-only';
  mobileNote: string | null;
  external: { label: string; url: string; fallback: { id: string; fileNo: string; title: string } | null }[];
}

export const submitSchema = z.object({
  answer: z.union([
    z.string().max(500),
    z.record(z.string().max(60), z.string().max(500)),
    z.array(z.string().max(60)).max(20),
  ]),
});

export type SubmitResult =
  | { correct: false; message: string }
  | {
      correct: true;
      replay: boolean;
      success: string[];
      rewards: { evidence: EvidenceSummary[]; achievements: AchievementView[] };
      unlocked: { missions: { id: string; title: string }[]; campaigns: CampaignId[] };
    };

export const missionStateSchema = z.object({
  state: z.record(z.string(), z.unknown()),
  version: z.number().int().min(1),
});

export interface StateConflict {
  state: Record<string, unknown>;
  version: number;
}

// ---------------------------------------------------------------------------
// achievements

export interface AchievementView {
  id: string;
  title: string;
  description: string;
  secret: boolean;
  awardedAt: string | null;
}

export interface AchievementsResponse {
  achievements: AchievementView[];
  /** secret achievements not yet earned. their names stay hidden */
  secretRemaining: number;
}

// ---------------------------------------------------------------------------
// notebook

export interface NotebookEntry {
  id: string;
  title: string;
  body: string;
  evidence: string[];
  version: number;
  createdAt: string;
  updatedAt: string;
}

export const NOTEBOOK_TITLE_MAX = 120;
export const NOTEBOOK_BODY_MAX = 20000;

export const notebookCreateSchema = z.object({
  title: z.string().max(NOTEBOOK_TITLE_MAX).default(''),
  body: z.string().max(NOTEBOOK_BODY_MAX).default(''),
  evidence: z.array(z.string().max(80)).max(50).default([]),
});

export const notebookSaveSchema = notebookCreateSchema.extend({
  /** the version this edit was based on. a mismatch means another device saved first */
  version: z.number().int().min(1),
});

export interface NotebookConflict {
  error: { code: 'conflict'; message: string };
  current: NotebookEntry;
}

// ---------------------------------------------------------------------------
// admin: players and diagnostics
//
// Deliberately no notebook content anywhere in here.

export interface PlayerRow {
  username: string;
  role: Role;
  cycle: number;
  missionsCompleted: number;
  evidence: number;
  lastActive: string | null;
  createdAt: string;
}

export interface PlayerDetail {
  username: string;
  role: Role;
  progress: ProgressResponse;
  hintsUsed: { missionId: string; levels: number }[];
}

export interface MissionDiagnostics {
  missionId: string;
  title: string;
  attempts: number;
  correct: number;
  players: number;
  hintUse: [number, number, number];
  /** most common wrong answers, normalised. for tuning, not for shaming */
  topWrong: { guess: string; count: number }[];
}

export interface Diagnostics {
  missions: MissionDiagnostics[];
  errors: { occurredAt: string; route: string | null; message: string; requestId: string | null }[];
  /** player rows that point at missions or evidence no longer in content */
  orphans: { table: string; id: string; rows: number }[];
}
