// The Worker entry point. Static files (the built React app) are served by
// Cloudflare before this runs; only /api/* reaches it -- see wrangler.jsonc.

import { story } from '../../content/story/index.ts';
import { createApp } from './app.ts';
import { buildRegistry } from './content/registry.ts';
import { connectDb } from './db/client.ts';
import type { Bindings } from './env.ts';
import { supabaseVerifier } from './lib/tokens.ts';
import { prune } from './services/diagnostics.ts';

// throws on broken content, so a bad edit fails the deploy instead of
// failing a player halfway through a mission
const content = buildRegistry(story);

const app = createApp({
  connect: connectDb,
  verifier: (env) => supabaseVerifier(env.SUPABASE_URL),
  content,
});

export default {
  fetch: app.fetch,

  // nightly housekeeping (cron in wrangler.jsonc): forget old wrong-answer
  // text and old error records
  async scheduled(_event: ScheduledController, env: Bindings, ctx: ExecutionContext) {
    const handle = connectDb(env);
    if (!handle) return;
    ctx.waitUntil(prune(handle.db).finally(handle.close));
  },
} satisfies ExportedHandler<Bindings>;
