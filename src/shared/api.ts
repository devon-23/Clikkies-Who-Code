// The shapes the browser and the API agree on. Both sides import this file,
// so a change here shows up as a type error wherever it matters.

import { z } from 'zod';

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
  | 'internal';

export interface ApiErrorBody {
  error: { code: ApiErrorCode; message: string; requestId?: string };
}
