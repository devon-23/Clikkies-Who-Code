// Typed view of the tables for Drizzle. The SQL in supabase/migrations is the
// source of truth -- this file only describes it so queries are checked at
// compile time. Change a migration, change this to match.

import { sql } from 'drizzle-orm';
import {
  bigint, boolean, check, integer, jsonb, pgEnum, pgSchema, pgTable, primaryKey, text, timestamp, uuid, uniqueIndex,
} from 'drizzle-orm/pg-core';

// auth.users belongs to Supabase. Only the columns the API reads are listed
const auth = pgSchema('auth');
export const authUsers = auth.table('users', {
  id: uuid('id').primaryKey(),
  email: text('email'),
});

export const userRole = pgEnum('user_role', ['player', 'admin']);
export const testerStatus = pgEnum('tester_status', ['invited', 'active', 'revoked']);

export const appSettings = pgTable('app_settings', {
  key: text('key').primaryKey(),
  value: jsonb('value').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  updatedBy: uuid('updated_by'),
});

export const profiles = pgTable('profiles', {
  userId: uuid('user_id').primaryKey(),
  username: text('username').notNull(),
  role: userRole('role').notNull().default('player'),
  introSeenAt: timestamp('intro_seen_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex('profiles_username_lower_key').on(sql`lower(${t.username})`),
]);

export const testerAccess = pgTable('tester_access', {
  email: text('email').primaryKey(),
  status: testerStatus('status').notNull().default('invited'),
  source: text('source', { enum: ['invite', 'public', 'bootstrap'] }).notNull().default('invite'),
  note: text('note'),
  invitedBy: uuid('invited_by'),
  userId: uuid('user_id').unique(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
}, (t) => [
  check('tester_access_email_lower', sql`${t.email} = lower(${t.email})`),
]);

export const adminAuditLog = pgTable('admin_audit_log', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  actorId: uuid('actor_id'),
  action: text('action').notNull(),
  target: text('target'),
  detail: jsonb('detail').notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const errorEvents = pgTable('error_events', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
  source: text('source', { enum: ['api', 'client'] }).notNull(),
  route: text('route'),
  message: text('message').notNull(),
  requestId: text('request_id'),
  userId: uuid('user_id'),
});

// ---------------------------------------------------------------------------
// progression -- see supabase/migrations/20261030000000_progression.sql

const ts = (name: string) => timestamp(name, { withTimezone: true });

export const runs = pgTable('runs', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull(),
  number: integer('number').notNull(),
  status: text('status', { enum: ['active', 'completed'] }).notNull().default('active'),
  startedAt: ts('started_at').notNull().defaultNow(),
  completedAt: ts('completed_at'),
});

export const missionProgress = pgTable('mission_progress', {
  runId: uuid('run_id').notNull(),
  missionId: text('mission_id').notNull(),
  status: text('status', { enum: ['in_progress', 'completed'] }).notNull().default('in_progress'),
  state: jsonb('state').$type<Record<string, unknown>>().notNull().default({}),
  version: integer('version').notNull().default(1),
  startedAt: ts('started_at').notNull().defaultNow(),
  completedAt: ts('completed_at'),
  updatedAt: ts('updated_at').notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.runId, t.missionId] })]);

export const missionCompletions = pgTable('mission_completions', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  userId: uuid('user_id').notNull(),
  runId: uuid('run_id').notNull(),
  missionId: text('mission_id').notNull(),
  replay: boolean('replay').notNull().default(false),
  hintsUsed: integer('hints_used').notNull().default(0),
  completedAt: ts('completed_at').notNull().defaultNow(),
});

export const hintUsage = pgTable('hint_usage', {
  runId: uuid('run_id').notNull(),
  missionId: text('mission_id').notNull(),
  level: integer('level').notNull(),
  userId: uuid('user_id').notNull(),
  usedAt: ts('used_at').notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.runId, t.missionId, t.level] })]);

export const answerAttempts = pgTable('answer_attempts', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  userId: uuid('user_id').notNull(),
  runId: uuid('run_id').notNull(),
  missionId: text('mission_id').notNull(),
  correct: boolean('correct').notNull(),
  guess: text('guess'),
  createdAt: ts('created_at').notNull().defaultNow(),
});

export const evidenceDiscoveries = pgTable('evidence_discoveries', {
  userId: uuid('user_id').notNull(),
  evidenceId: text('evidence_id').notNull(),
  runId: uuid('run_id'),
  source: text('source', { enum: ['mission-start', 'mission-reward', 'hidden', 'admin'] }).notNull(),
  missionId: text('mission_id'),
  discoveredAt: ts('discovered_at').notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.userId, t.evidenceId] })]);

export const playerAchievements = pgTable('player_achievements', {
  userId: uuid('user_id').notNull(),
  achievementId: text('achievement_id').notNull(),
  runId: uuid('run_id'),
  awardedAt: ts('awarded_at').notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.userId, t.achievementId] })]);

export const notebookEntries = pgTable('notebook_entries', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull(),
  title: text('title').notNull().default(''),
  body: text('body').notNull().default(''),
  version: integer('version').notNull().default(1),
  createdAt: ts('created_at').notNull().defaultNow(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
});

export const notebookEntryEvidence = pgTable('notebook_entry_evidence', {
  entryId: uuid('entry_id').notNull(),
  evidenceId: text('evidence_id').notNull(),
}, (t) => [primaryKey({ columns: [t.entryId, t.evidenceId] })]);
