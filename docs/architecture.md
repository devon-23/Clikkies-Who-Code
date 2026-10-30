# Architecture

## The pieces

```
Browser (React app)
  │  signs in with Supabase Auth — the only thing it asks Supabase for
  │  then calls /api/* with the session's access token
  ▼
Cloudflare Worker  (src/worker)
  │  serves the built app as static files, and answers /api/* with Hono
  │  checks each token against Supabase's published public keys
  │  decides who may do what — every rule is here, and tested
  ▼  postgres-js (Hyperdrive when deployed, DATABASE_URL locally)
Supabase Postgres  (supabase/migrations)
     row-level security on, no policies: the public Data API is shut
     one function Supabase Auth calls before creating any account
```

**Why the browser never queries the database:** one path for data means one
place to check permissions. Supabase's Data API would let the browser read
tables directly if a policy allowed it; we give it no policies at all, and
revoke the grants as well, so a mistake in one layer is not enough to open
anything. `tests/api/gate.test.ts` fails if a new table arrives without RLS.

**Why tokens are checked with public keys:** Supabase signs each access token
with a private key and publishes the public half (a *JWKS*). The Worker fetches
those once and verifies every token locally — fast, and the Worker never holds
anything that could *forge* a session.

## Access rules

All in `src/worker/services/access.ts`:

1. Admins are always in.
2. A revoked tester is always out — even with public registration on.
3. An invited or active tester is in.
4. With public registration on, anyone with an account is in.
5. Everyone else is signed in but shown *Access not authorized*.

"In" without a profile means the player still has to choose a handle.

The registration switch is enforced in two places:

- **At account creation**, inside Supabase Auth, by
  `public.before_user_created()`. With registration off, an uninvited address
  cannot create an account at all, however the request is made.
- **On every API request**, by the rules above. Revoking a tester takes effect
  on their next request.

Admin is a database role (`profiles.role`), read on every admin request.
There is no API that grants it; the first admin is made by hand in SQL
(`supabase/snippets/bootstrap-admin.sql`).

## Account handle vs. in-story identity

`profiles.username` is the **account handle**: unique, chosen at intake, shown
in the masthead. It is never the player's name in the story. In the story they
start unnamed and later inherit *Clancy*. The interface says so where the
handle is chosen and where it is shown. Story identity will live with the run
(Milestone 3), not the account.

## Story content and the engine

Authored content lives in `content/story/` (missions, evidence, achievements,
hidden codes) and is **server-only**: it is compiled into the Worker and the
browser gets one unlocked piece at a time through the API. Answers and
unreleased story are never in the browser bundle. A test fails if `src/app`
imports `content/story`, and another scans the built bundle. The five
campaign cards (`content/campaigns.ts`) are the one public exception.

`src/worker/content/registry.ts` validates everything when the Worker starts
(and in `npm run content:check`): missing references, duplicate ids or file
numbers, prerequisite loops, hints out of order.

What is open is **never stored**. It is worked out from what the current
cycle has completed, every time (`src/worker/services/progress.ts`):

- Campaign 1 is open; campaign *n* opens when campaign *n − 1* is closed.
- A campaign is closed when it has missions and every non-optional one is
  completed this cycle. An empty campaign is never closed, so an unbuilt one
  cannot be skipped through.
- A mission opens when its campaign is open and its prerequisites are done.

Only the server decides an answer is right. Saved working state
(`mission_progress.state`) is the interface's scratch space and can never
complete a mission. Answer submission is rate-limited (20 per mission, 100
overall, per 10 minutes).

## Two lifetimes

| Per **cycle** (run) | Per **account**, forever |
|---|---|
| which missions are open / in progress / closed | evidence discovered |
| hints revealed | achievements |
| saved mission working state | notebook entries |

A new cycle (`POST /api/runs`, only once Breach is closed) marks the run
complete and opens the next. History stays in `runs` and
`mission_completions`.

## Data model

| Table | Holds |
|---|---|
| `profiles` | handle, role, when the intro was seen. 1:1 with `auth.users` |
| `tester_access` | invitation list, keyed by email; `user_id` linked at intake |
| `app_settings` | runtime switches: `public_registration` |
| `admin_audit_log` | every privileged change: who, what, when |
| `error_events` | thin technical error records. Deleted after 90 days |
| `runs` | one per cycle; at most one active per player |
| `mission_progress` | per run × mission: in progress / completed, working state, version |
| `mission_completions` | every completion ever, replays included. Append-only |
| `hint_usage` | per run × mission × level |
| `answer_attempts` | rate limiting + diagnostics. Only wrong answers keep text (normalised, ≤64 chars), wiped after 30 days |
| `evidence_discoveries` | per account × record, with where it came from |
| `player_achievements` | per account × achievement |
| `notebook_entries` + `notebook_entry_evidence` | the player's notes and links to records they have found |

Content ids in these tables are plain text, not foreign keys, because the
content lives in git. The admin **Diagnostics → Content drift** panel lists
rows that point at ids no longer in content.

`src/worker/db/schema.ts` mirrors the SQL for typed queries. **The SQL
migrations are the source of truth**: change a migration, then the mirror.

## Saving and conflicts

Notebook entries and mission working state carry a `version`. A save names
the version it was based on. If another device saved since, the server
refuses with 409 and returns the newer copy, and nothing is overwritten. The
notebook then shows both versions and lets the player choose.
`src/app/lib/useAutosave.ts` debounces saves, only says "Saved" once the
server confirms, retries on failure, and warns before closing a tab with
unsaved work.

## Visual system

Two materials, taken from the FPE Identification Record:

- **The system** — near-black, bone text, hairline rules, monospace readouts.
  Everything the player navigates.
- **The paper** — off-white Dema documents in black and oxblood ink:
  letterhead, nine-sector seal, value written on a dotted line with the label
  printed beneath, benediction at the foot, a half-inked stamp hanging off the
  edge.

One rule from the lore drives colour: **the Bishops cannot see yellow**.
Nothing official is yellow; yellow means the Banditos were here (tape, help,
annotations). Each campaign redefines only `--accent` via `[data-era]`;
navigation and controls never change.

Tokens: `src/app/styles/tokens.css`. Fonts are open-licensed and self-hosted
(Michroma, IBM Plex Sans, IBM Plex Mono). Michroma stands in for the Bank
Gothic face on the FPE card, whose web licence is unverified. Swap
`--font-dema` if a licence turns up.

The seal is drawn from geometry (`src/shared/seal.ts`), ported from the FPE
archive's `cityMarkDrawn` — not traced from official artwork.

## Security decisions

| Decision | Why |
|---|---|
| Content-Security-Policy allows scripts and fonts from this site only | nothing third-party runs; fonts are bundled, not fetched from Google |
| `frame-ancestors 'none'` | the site cannot be embedded to trick clicks |
| `cache-control: no-store` on all API responses | player data never lands in a shared cache |
| `noindex` everywhere | invitation-only while testing |
| Unexpected errors log route + message only | no request bodies, headers or tokens in logs |
| Reserved handles (`clancy`, `admin`, bishop names…) | nobody can pass for staff or a story character |
| Password reset replies identically for any address | the form cannot be used to test which emails have accounts |
| Supabase secret key is never used | nothing in this design needs it, so nothing can leak it |

## Retention

A nightly cron (`scheduled()` in `src/worker/index.ts`, deployed environments
only) blanks the text of wrong answers older than 30 days and deletes error
records older than 90. Counts stay; what people typed does not.

## Known limitations (current milestone)

- Only answer submission and the archive terminal are rate-limited. Other
  routes need a signed-in, authorized player; sign-up and sign-in are
  rate-limited by Supabase.
- No end-to-end browser tests yet. They need a real Supabase project (or a
  local Auth server) to sign in against. The dev preview (`/dev/preview`) is
  for design and manual checks, not a substitute.
