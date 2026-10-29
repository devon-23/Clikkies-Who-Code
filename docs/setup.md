# Setup

Everything here needs your own accounts, so it is a checklist for you rather
than something the code can do. Do it in order. Nothing in it asks you to
paste a secret into the repo or into chat.

You will end up with:

| | Supabase project | Cloudflare Worker | Used by |
|---|---|---|---|
| **staging** | `clikkies-staging` | `clikkies-who-code-staging` | local development *and* the invite-only test site |
| **production** | `clikkies-production` | `clikkies-who-code` | the real site, later |

Supabase's free plan allows two active projects, which is exactly this. Free
projects **pause after a week with no activity** and have **no automatic
backups** — fine for testing, not for launch (see *Before launch* below).

---

## 1. Supabase project (staging)

1. Create a project at supabase.com. Pick a region near your players; save the
   database password in your password manager.
2. **Authentication → Sign In / Providers → Email**
   - Email provider: **on**
   - Confirm email: **on**
   - Minimum password length: **10** (matches the sign-up form)
3. **Authentication → URL Configuration**
   - Site URL: `http://localhost:5173` for now
   - Redirect URLs: add `http://localhost:5173/**`
     (add the staging Worker URL here after step 5)
4. **Project Settings → JWT Keys.** The current signing key should be
   asymmetric (ECC P-256 or RSA). If it says *Legacy HS256*, create a new
   asymmetric key and rotate to it. The API verifies tokens with the public
   half; it never needs the shared secret.

## 2. Apply the database schema

From the repository folder:

```bash
npx supabase@2 login
npx supabase@2 link --project-ref YOUR_PROJECT_REF
npm run db:push
```

`YOUR_PROJECT_REF` is the `abcd1234` part of `https://abcd1234.supabase.co`.
`db:push` applies everything in `supabase/migrations/` that has not run yet.

## 3. Switch on the invitation gate

**Authentication → Hooks → Before User Created → Postgres →** schema `public`,
function `before_user_created`. Save.

This is what makes the registration switch real. Without it, anyone could
create an account by calling Supabase directly. They still could not get past
the API, but they would exist.

Check it: with the hook on and nobody invited, try registering on the site. It
should refuse with *"The archive is invitation-only right now."*

## 4. Local configuration

```bash
cp .env.example .env
cp .dev.vars.example .dev.vars
```

- `.env`: Project URL and **publishable** key (Project Settings → API Keys).
- `.dev.vars`: `SUPABASE_URL` (same URL), and `DATABASE_URL` from
  **Connect → Transaction pooler** (port 6543), with your password filled in.

Restart `npm run dev`, then check `http://localhost:5173/api/health`:
`"database":"ok"` and `"auth":"configured"`.

## 5. Make yourself the first admin

There is deliberately no button for this. In **SQL Editor**, open
`supabase/snippets/bootstrap-admin.sql`, replace `YOU@EXAMPLE.COM` in both
places, and:

1. Run **part 1**. This puts your address on the invitation list.
2. On the site, register with that address, confirm the email, sign in, and
   choose a handle.
3. Run **part 2**. This makes you an admin.

Sign out and in again. **Admin** appears in the menu.

> **Email delivery.** Supabase's built-in email only reaches members of your
> Supabase team, about two messages an hour. That is enough for you to do this
> step, but **not enough for testers**. See step 7.

## 6. Deploy staging to Cloudflare

```bash
npx wrangler login
npx wrangler hyperdrive create clikkies-staging --connection-string="postgres://…"
```

For the connection string, use what Cloudflare's *Hyperdrive → Supabase* guide
recommends for your project (at the time of writing, Supabase's **Session
pooler** string, port 5432). Then:

1. Put the Hyperdrive `id` it prints into `wrangler.jsonc` →
   `env.staging.hyperdrive[0].id`.
2. Put your staging Project URL into `env.staging.vars.SUPABASE_URL`.
3. `cp .env.example .env.staging` and fill it in like `.env`.
4. Deploy:

```bash
npm run deploy:staging
```

Wrangler prints the URL (`https://clikkies-who-code-staging.<you>.workers.dev`).
Add `https://…workers.dev/**` to Supabase's Redirect URLs (step 1.3), and
check `/api/health` on the live site.

**Rolling back:** Cloudflare dashboard → Workers → your Worker → Deployments,
or `npx wrangler rollback --env staging`. Database migrations do not roll back
automatically. Write them so the previous version of the code still works
with the new schema.

## 7. Before inviting testers: real email

Testers need invitation-adjacent emails (confirmations, password resets)
delivered to *their* inboxes. That needs your own sending domain:

1. A domain you control (Cloudflare Registrar sells at cost, about $10/year).
2. A Resend account (free: 3,000 emails/month, 100/day). Verify the domain
   there; it gives you DNS records to add.
3. Supabase → **Authentication → Emails → SMTP Settings**: enter Resend's
   SMTP details. Raise the rate limit under **Authentication → Rate Limits**
   if needed.

Then invite testers from **/admin** and send them the site link yourself.

## Before launch (not now)

- Supabase **Pro** ($25/month) on the production project: no pausing, daily
  backups.
- Repeat steps 1–6 for production (`deploy:production`).
- Open registration from **/admin** when you are ready. Revoked addresses stay
  blocked either way.

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| Sign-in page says *System not configured* | `.env` missing or the dev server was not restarted |
| `/api/health` shows `"auth":"unconfigured"` | `SUPABASE_URL` missing from `.dev.vars` / `wrangler.jsonc` |
| `/api/health` shows `"database":"error"` | wrong `DATABASE_URL` or password; the project may be **paused** (free plan) — restore it in the dashboard |
| Every API call is 401 after signing in | the JWT signing key is still Legacy HS256 (step 1.4), or `SUPABASE_URL` points at a different project than `.env` |
| Registration refused for an invited address | address typo on the invite list; check `/admin` |
| Registration *allowed* for an uninvited address | the Before User Created hook is not switched on (step 3) |
| Confirmation email never arrives | built-in email only reaches your Supabase team — set up SMTP (step 7) |
