import type { Db } from './db/client.ts';

// Env comes from `npm run cf-typegen` (worker-configuration.d.ts).
// DATABASE_URL is a local-only secret from .dev.vars, so wrangler cannot see
// it in the config and it is added here by hand.
export interface Bindings extends Env {
  DATABASE_URL?: string;
}

export interface AuthUser {
  id: string;
  email: string;
}

export interface AppEnv {
  Bindings: Bindings;
  Variables: {
    requestId: string;
    db: Db;
    user: AuthUser;
  };
}
