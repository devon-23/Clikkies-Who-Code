import { drizzle } from 'drizzle-orm/postgres-js';
import type { PgDatabase } from 'drizzle-orm/pg-core';
import postgres from 'postgres';
import * as schema from './schema.ts';
import type { Bindings } from '../env.ts';

// Any Drizzle Postgres database with our schema: postgres-js in the Worker,
// PGlite in the tests.
export type Db = PgDatabase<any, typeof schema>;

export interface DbHandle {
  db: Db;
  close: () => Promise<void>;
}

export type DbFactory = (env: Bindings) => DbHandle | null;

// Deployed, Hyperdrive hands us a pooled connection string. Locally it is
// DATABASE_URL from .dev.vars. Neither set means the database is simply not
// configured yet, and routes that need it answer 503 rather than crash.
export const connectDb: DbFactory = (env) => {
  const url = env.HYPERDRIVE?.connectionString ?? env.DATABASE_URL;
  if (!url) return null;

  // a fresh client per request is how Workers are meant to talk to Postgres.
  // prepare:false because Supabase's transaction pooler cannot hold prepared
  // statements between requests
  const sql = postgres(url, { max: 5, fetch_types: false, prepare: false });
  return {
    db: drizzle(sql, { schema }),
    close: () => sql.end({ timeout: 5 }),
  };
};
