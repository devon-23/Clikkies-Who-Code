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

## Data model (so far)

| Table | Holds |
|---|---|
| `profiles` | handle, role, when the intro was seen. 1:1 with `auth.users` |
| `tester_access` | invitation list, keyed by email (the invite exists before the account); `user_id` linked at intake |
| `app_settings` | runtime switches — currently `public_registration` |
| `admin_audit_log` | every privileged change: who, what, when |
| `error_events` | thin technical error records: route, message, request id. Never bodies, tokens or player writing |

Story progress, evidence, notebook, achievements, runs and Training Grounds
tables arrive in Milestone 3. Authored content (campaigns, missions, evidence
definitions) stays in `content/`, version-controlled; only player state goes in
the database.

`src/worker/db/schema.ts` mirrors the SQL for typed queries. **The SQL
migrations are the source of truth**: change a migration, then change the
mirror.

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

## Known limitations (current milestone)

- No rate limiting on API routes yet. Admin routes need an admin session, and
  sign-up/sign-in are rate-limited by Supabase. Answer submission (Milestone 4)
  will get its own limiter.
- `error_events` has no retention job yet. Planned with the admin diagnostics
  work.
- No end-to-end browser tests yet. They need a real Supabase project (or a
  local Auth server) to sign in against.
