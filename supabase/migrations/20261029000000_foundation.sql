-- Clikkies Who Code -- foundation schema
--
-- Accounts, tester access, the registration switch, and the admin's paper
-- trail. Story progress, evidence and the notebook arrive in the next
-- migration.
--
-- Who can touch what:
--   * The browser never queries these tables. Row-level security is on for
--     every table with no policies at all, so Supabase's public Data API
--     refuses every read and write from the anon/authenticated roles.
--   * The API Worker connects as the database owner and enforces the rules
--     in code, where they are tested.
--   * Supabase Auth reaches in exactly once, through before_user_created(),
--     to decide whether a new account may be created.

-- ---------------------------------------------------------------------------
-- runtime switches

create table public.app_settings (
  key         text primary key,
  value       jsonb not null,
  updated_at  timestamptz not null default now(),
  updated_by  uuid references auth.users (id) on delete set null
);

-- registration starts shut. turning it on is a deliberate act in /admin
insert into public.app_settings (key, value) values ('public_registration', 'false');

-- ---------------------------------------------------------------------------
-- profiles
--
-- The account handle lives here. It is NOT the player's name in the story --
-- in the story they start unnamed and later inherit Clancy. Keep the two apart.

create type public.user_role as enum ('player', 'admin');

create table public.profiles (
  user_id        uuid primary key references auth.users (id) on delete cascade,
  username       text not null,
  role           public.user_role not null default 'player',
  intro_seen_at  timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint profiles_username_format check (username ~ '^[A-Za-z0-9_]{3,24}$')
);

-- handles are unique regardless of case: Clancy and clancy are one person
create unique index profiles_username_lower_key on public.profiles (lower(username));

-- ---------------------------------------------------------------------------
-- tester access
--
-- Keyed on email because an invitation exists before the account does.
-- user_id is filled in when the invited person creates their profile, so a
-- later email change does not lock them out.

create type public.tester_status as enum ('invited', 'active', 'revoked');

create table public.tester_access (
  email       text primary key,
  status      public.tester_status not null default 'invited',
  source      text not null default 'invite',
  note        text,
  invited_by  uuid references auth.users (id) on delete set null,
  user_id     uuid unique references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  revoked_at  timestamptz,
  constraint tester_access_email_lower check (email = lower(email)),
  constraint tester_access_source check (source in ('invite', 'public', 'bootstrap')),
  constraint tester_access_note_length check (note is null or char_length(note) <= 200)
);

create index tester_access_status_idx on public.tester_access (status);

-- ---------------------------------------------------------------------------
-- admin audit log -- every privileged change, who made it, and when

create table public.admin_audit_log (
  id          bigint generated always as identity primary key,
  actor_id    uuid references auth.users (id) on delete set null,
  action      text not null,
  target      text,
  detail      jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

create index admin_audit_log_created_idx on public.admin_audit_log (created_at desc);

-- ---------------------------------------------------------------------------
-- technical errors, for troubleshooting from /admin
--
-- Deliberately thin: a route, a message, a request id. Never request bodies,
-- tokens, or anything a player wrote.

create table public.error_events (
  id           bigint generated always as identity primary key,
  occurred_at  timestamptz not null default now(),
  source       text not null,
  route        text,
  message      text not null,
  request_id   text,
  user_id      uuid references auth.users (id) on delete set null,
  constraint error_events_source check (source in ('api', 'client')),
  constraint error_events_message_length check (char_length(message) <= 500)
);

create index error_events_occurred_idx on public.error_events (occurred_at desc);

-- ---------------------------------------------------------------------------
-- lock the front door
--
-- RLS on, no policies: the Data API can see these tables exist and nothing
-- else. Grants are revoked as well, so a policy added by mistake later still
-- would not open anything on its own.

alter table public.app_settings     enable row level security;
alter table public.profiles         enable row level security;
alter table public.tester_access    enable row level security;
alter table public.admin_audit_log  enable row level security;
alter table public.error_events     enable row level security;

revoke all on public.app_settings, public.profiles, public.tester_access,
              public.admin_audit_log, public.error_events
  from anon, authenticated;

-- ---------------------------------------------------------------------------
-- the gate
--
-- Supabase Auth's "Before User Created" hook. Runs inside Auth immediately
-- before a new user row is written; returning an error object stops the
-- signup outright. That makes the registration switch real: posting straight
-- to the Auth API with registration off gets the same refusal as the form.
--
-- Enable it in the dashboard: Authentication -> Hooks -> Before User Created
-- -> Postgres -> public.before_user_created. See docs/setup.md.

create or replace function public.before_user_created(event jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_email text := lower(trim(event -> 'user' ->> 'email'));
  registration_open boolean;
  invited boolean;
begin
  select coalesce((value)::boolean, false)
    into registration_open
    from public.app_settings
   where key = 'public_registration';

  -- a revoked address stays out even when registration is open
  if exists (
    select 1 from public.tester_access
     where email = new_email and status = 'revoked'
  ) then
    return jsonb_build_object('error', jsonb_build_object(
      'http_code', 403,
      'message', 'This address is not authorized for the archive.'));
  end if;

  if coalesce(registration_open, false) then
    return '{}'::jsonb;
  end if;

  select exists (
    select 1 from public.tester_access
     where email = new_email and status in ('invited', 'active')
  ) into invited;

  if invited then
    return '{}'::jsonb;
  end if;

  return jsonb_build_object('error', jsonb_build_object(
    'http_code', 403,
    'message', 'The archive is invitation-only right now. Use the address your invitation was sent to.'));
end;
$$;

-- only Supabase Auth may call it. not the public API, not signed-in players
grant usage on schema public to supabase_auth_admin;
revoke execute on function public.before_user_created(jsonb) from public, anon, authenticated;
grant execute on function public.before_user_created(jsonb) to supabase_auth_admin;
