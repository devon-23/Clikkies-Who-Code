// The Worker entry point. Static files (the built React app) are served by
// Cloudflare before this runs; only /api/* reaches it -- see wrangler.jsonc.

import { createApp } from './app.ts';
import { connectDb } from './db/client.ts';
import { supabaseVerifier } from './lib/tokens.ts';

const app = createApp({
  connect: connectDb,
  verifier: (env) => supabaseVerifier(env.SUPABASE_URL),
});

export default app;
