# Clikkies Who Code

An unofficial, fan-made Twenty One Pilots-inspired cyber investigation, ARG,
and HTML/CSS playground. You enter Dema as an unnamed resident, find that the
city's records disagree, and start pulling the thread.

Fan project. Not affiliated with Twenty One Pilots, Fueled By Ramen, or anyone
else. The visual language comes from the
[FPE Identification Record](https://fpe-archive.pages.dev) by the same author.

## Status

| Area | State |
|---|---|
| Accounts, sign-in, password reset | Built, tested against a simulated Supabase. Needs a real project — see `docs/setup.md` |
| Invitation-only access + registration switch | Built and tested (API and database gate) |
| Admin: registration, testers, audit log | Built and tested |
| Design system, transmission, hub, campaign directory | Built |
| Mission engine, Blurryface | **Not built** — Milestones 3–4 |
| Archive, notebook, achievements, runs/cycles | **Not built** — Milestone 3 |
| Training Grounds | **Not built** — Milestone 5 |
| Deployment | Configured, **not yet deployed** — needs your Supabase and Cloudflare accounts |

## Stack

React + Vite in the browser, a Hono API on a Cloudflare Worker, Supabase for
sign-in and Postgres. One Worker serves both the app and `/api/*`.
`docs/architecture.md` explains how the pieces fit and why.

## Running it

```bash
npm install
npm run dev          # http://localhost:5173
```

That works with no configuration — the transmission plays, and anything that
needs an account explains that sign-in is not set up. To sign in for real,
follow `docs/setup.md`.

While designing, `http://localhost:5173/dev/preview/hub?as=admin` shows the
signed-in pages with a fake session (also `/campaigns`, `/admin`, `/intake`,
`/denied`). Development builds only; it is stripped from production.

## Checks

```bash
npm run typecheck
npm run build
npm test             # API, database gate, content, and the built bundle
```

Tests run the real API and the real migrations against an in-memory Postgres
(PGlite), so they need no database, no Docker and no network.

## Docs

- `docs/setup.md` — Supabase, Cloudflare, the first admin, deploying
- `docs/environment.md` — every variable, and which are secret
- `docs/architecture.md` — how it fits together, the data model, security decisions

## Layout

```
content/               authored story content (version-controlled)
src/app/               the React app
src/worker/            the API (Hono on a Cloudflare Worker)
src/shared/            types and helpers both sides use
supabase/migrations/   database schema, applied in order
tests/                 everything `npm test` runs
docs/
```
