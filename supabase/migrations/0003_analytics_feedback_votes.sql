-- Analytics, feedback, and recipe votes schema.
--
-- user_profiles: upserted on every login with device info and locale.
-- user_events:   append-only analytics log; the client batches events and
--                flushes in groups of ≤10 every 5 s to reduce write load.
-- app_feedback:  messages from the in-app feedback FAB.
-- recipe_votes:  per-user like/dislike and favourite flag for recipes;
--                vote is nullable so liking and favouriting are independent
--                actions.
--
-- Run this in: Supabase Dashboard → SQL Editor → project → Run.

-- ── user_profiles ────────────────────────────────────────────────────────────

create table if not exists user_profiles (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  email        text,
  display_name text,
  avatar_url   text,
  device_type  text,
  locale       text,
  updated_at   timestamptz not null default now()
);

alter table user_profiles enable row level security;

create policy "Users manage own profile"
  on user_profiles for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ── user_events ──────────────────────────────────────────────────────────────

create table if not exists user_events (
  id         bigserial primary key,
  user_id    uuid references auth.users(id) on delete cascade,
  event      text not null,
  screen     text,
  metadata   jsonb default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table user_events enable row level security;

create policy "Users insert own events"
  on user_events for insert
  with check (auth.uid() = user_id);

create index if not exists idx_user_events_user  on user_events(user_id);
create index if not exists idx_user_events_event on user_events(event);

-- ── app_feedback ─────────────────────────────────────────────────────────────

create table if not exists app_feedback (
  id         bigserial primary key,
  user_id    uuid references auth.users(id) on delete set null,
  user_email text,
  type       text,
  message    text not null,
  screen     text,
  metadata   jsonb default '{}'::jsonb,
  user_agent text,
  created_at timestamptz not null default now()
);

alter table app_feedback enable row level security;

create policy "Users insert own feedback"
  on app_feedback for insert
  with check (auth.uid() = user_id);

-- ── recipe_votes ─────────────────────────────────────────────────────────────
-- vote is nullable: liking and favouriting are independent actions.

create table if not exists recipe_votes (
  id          bigserial primary key,
  user_id     uuid references auth.users(id) on delete cascade not null,
  recipe_id   text not null,
  vote        text check (vote is null or vote in ('up', 'down')),
  is_favorite boolean not null default false,
  created_at  timestamptz not null default now(),
  unique(user_id, recipe_id)
);

alter table recipe_votes enable row level security;

create policy "Users manage own votes"
  on recipe_votes for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists idx_recipe_votes_user   on recipe_votes(user_id);
create index if not exists idx_recipe_votes_recipe on recipe_votes(recipe_id);
