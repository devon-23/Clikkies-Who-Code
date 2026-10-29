// Typed view of the tables for Drizzle. The SQL in supabase/migrations is the
// source of truth -- this file only describes it so queries are checked at
// compile time. Change a migration, change this to match.

import { sql } from 'drizzle-orm';
import {
  bigint, check, jsonb, pgEnum, pgSchema, pgTable, text, timestamp, uuid, uniqueIndex,
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
