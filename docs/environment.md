# Environment variables

Two places hold configuration, and they are kept apart on purpose.

## Browser — `.env`, `.env.staging`, `.env.production`

Anything prefixed `VITE_` is **compiled into the JavaScript every visitor
downloads**. Nothing secret may go here, ever.

| Variable | Secret? | Where it comes from |
|---|---|---|
| `VITE_SUPABASE_URL` | No | Supabase → Project Settings → API → Project URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | No | Supabase → Project Settings → API Keys → Publishable key (`sb_publishable_…`) |

`npm run dev` reads `.env`. `npm run deploy:staging` reads `.env.staging`,
`deploy:production` reads `.env.production`. All three are gitignored; copy
`.env.example`.

The publishable key is safe to expose: it only lets a browser talk to Supabase
Auth, and the database refuses every direct request from it (row-level
security, with no policies — see `docs/architecture.md`).

## Worker — `.dev.vars` locally, Cloudflare for deployed environments

| Variable | Secret? | Local | Deployed |
|---|---|---|---|
| `SUPABASE_URL` | No | `.dev.vars` | `vars` in `wrangler.jsonc`, per environment |
| `DATABASE_URL` | **Yes** | `.dev.vars` | not used |
| `HYPERDRIVE` (binding) | Holds the DB password | not used | `hyperdrive` in `wrangler.jsonc`; the password lives inside Cloudflare |
| `APP_ENV` | No | `development` | `staging` / `production` |

`.dev.vars` is gitignored; copy `.dev.vars.example`.

## Never needed

- **Supabase secret key / `service_role` key.** The Worker connects to Postgres
  directly and verifies sign-in tokens with Supabase's *public* keys, so no
  part of this app needs the secret key. If you ever find yourself pasting it
  somewhere, stop.
- **The database password in the repo.** It lives in `.dev.vars` (local) and in
  Hyperdrive (deployed). Nowhere else.

The build test (`tests/build/bundle.test.ts`) fails if the production bundle
ever contains something that looks like a database URL or a secret key.
