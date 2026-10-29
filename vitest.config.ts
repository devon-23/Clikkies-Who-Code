import { defineConfig } from 'vitest/config';

// Kept apart from vite.config.ts so tests do not boot the Cloudflare runtime.
// The API is plain Hono, so it runs fine under Node against an in-process
// Postgres (PGlite) with the real migrations applied.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    testTimeout: 20000,
    hookTimeout: 30000,
  },
});
