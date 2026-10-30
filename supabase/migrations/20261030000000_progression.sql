-- Clikkies Who Code -- progression
--
-- Player state only. The missions, evidence and achievements these rows
-- point at are authored content in content/story, so ids here are plain text
-- rather than foreign keys. The registry validates the content; the admin
-- consistency check finds rows whose ids no longer exist.
--
-- Two lifetimes, kept strictly apart:
--   per RUN (a cycle)   -- which missions are open and finished this time round
--   per ACCOUNT         -- evidence, achievements, the notebook. Never reset.

-- ---------------------------------------------------------------------------
-- runs: one per cycle. A player always has exactly one active run

create table public.runs (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,
  number        integer not null check (number >= 1),
  status        text not null default 'active' check (status in ('active', 'completed')),
  started_at    timestamptz not null default now(),
  completed_at  timestamptz,
  unique (user_id, number)
);

create unique index runs_one_active_per_user on public.runs (user_id) where status = 'active';

-- ---------------------------------------------------------------------------
-- mission progress within a run. "locked" and "available" are worked out from
-- prerequisites, never stored, so they cannot drift

create table public.mission_progress (
  run_id        uuid not null references public.runs (id) on delete cascade,
  mission_id    text not null,
  status        text not null default 'in_progress' check (status in ('in_progress', 'completed')),
  -- the mission interface's own saved working state. never trusted for
  -- completion -- only the server's answer check completes a mission
  state         jsonb not null default '{}'::jsonb,
  version       integer not null default 1,
  started_at    timestamptz not null default now(),
  completed_at  timestamptz,
  updated_at    timestamptz not null default now(),
  primary key (run_id, mission_id),
  constraint mission_progress_state_size check (pg_column_size(state) <= 16384)
);

-- every completion ever, including replays. append-only
create table public.mission_completions (
  id            bigint generated always as identity primary key,
  user_id       uuid not null references auth.users (id) on delete cascade,
  run_id        uuid not null references public.runs (id) on delete cascade,
  mission_id    text not null,
  replay        boolean not null default false,
  hints_used    integer not null default 0,
  completed_at  timestamptz not null default now()
);

create index mission_completions_user_idx on public.mission_completions (user_id, completed_at desc);
create index mission_completions_mission_idx on public.mission_completions (mission_id);

-- ---------------------------------------------------------------------------
-- hints, per run: replaying a mission in a new cycle starts the hints fresh

create table public.hint_usage (
  run_id      uuid not null references public.runs (id) on delete cascade,
  mission_id  text not null,
  level       integer not null check (level between 1 and 3),
  user_id     uuid not null references auth.users (id) on delete cascade,
  used_at     timestamptz not null default now(),
  primary key (run_id, mission_id, level)
);

create index hint_usage_mission_idx on public.hint_usage (mission_id, level);

-- ---------------------------------------------------------------------------
-- answer attempts: rate limiting, and the admin's view of which wrong
-- answers players actually try (to tune puzzles and add fair variants).
-- Only incorrect attempts keep their text, already normalised and cut short.
-- Retention: 30 days -- see docs/architecture.md

create table public.answer_attempts (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references auth.users (id) on delete cascade,
  run_id      uuid not null references public.runs (id) on delete cascade,
  mission_id  text not null,
  correct     boolean not null,
  guess       text check (guess is null or char_length(guess) <= 64),
  created_at  timestamptz not null default now()
);

create index answer_attempts_rate_idx on public.answer_attempts (user_id, created_at desc);
create index answer_attempts_mission_idx on public.answer_attempts (mission_id, created_at desc);

-- ---------------------------------------------------------------------------
-- the permanent archive: evidence belongs to the account, not the run

create table public.evidence_discoveries (
  user_id       uuid not null references auth.users (id) on delete cascade,
  evidence_id   text not null,
  run_id        uuid references public.runs (id) on delete set null,
  source        text not null check (source in ('mission-start', 'mission-reward', 'hidden', 'admin')),
  mission_id    text,
  discovered_at timestamptz not null default now(),
  primary key (user_id, evidence_id)
);

create table public.player_achievements (
  user_id         uuid not null references auth.users (id) on delete cascade,
  achievement_id  text not null,
  run_id          uuid references public.runs (id) on delete set null,
  awarded_at      timestamptz not null default now(),
  primary key (user_id, achievement_id)
);

-- ---------------------------------------------------------------------------
-- the investigator's notebook: the player's own writing. never logged,
-- never shown to anyone else, including the admin panel

create table public.notebook_entries (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  title       text not null default '' check (char_length(title) <= 120),
  body        text not null default '' check (char_length(body) <= 20000),
  version     integer not null default 1,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index notebook_entries_user_idx on public.notebook_entries (user_id, updated_at desc);

create table public.notebook_entry_evidence (
  entry_id     uuid not null references public.notebook_entries (id) on delete cascade,
  evidence_id  text not null,
  primary key (entry_id, evidence_id)
);

-- ---------------------------------------------------------------------------
-- same lock as every other table: RLS on, no policies, no grants

alter table public.runs                     enable row level security;
alter table public.mission_progress         enable row level security;
alter table public.mission_completions      enable row level security;
alter table public.hint_usage               enable row level security;
alter table public.answer_attempts          enable row level security;
alter table public.evidence_discoveries     enable row level security;
alter table public.player_achievements      enable row level security;
alter table public.notebook_entries         enable row level security;
alter table public.notebook_entry_evidence  enable row level security;

revoke all on public.runs, public.mission_progress, public.mission_completions,
              public.hint_usage, public.answer_attempts, public.evidence_discoveries,
              public.player_achievements, public.notebook_entries, public.notebook_entry_evidence
  from anon, authenticated;
