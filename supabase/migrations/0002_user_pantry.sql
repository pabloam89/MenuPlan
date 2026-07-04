-- User pantry ("Tengo esto en casa") — lets a signed-in user list ingredients
-- they already have so menu generation can prioritize recipes that use them
-- and the shopping list can discount them. Binary presence only: no
-- quantities, no expiry dates (see feature spec — deliberately out of scope).
--
-- Requires an authenticated user (auth.uid()): this feature is gated behind
-- login in the UI — "Entrar sin cuenta" sessions never see the pantry input,
-- so there's no anonymous-write case to handle here.
--
-- Run this in: Supabase Dashboard → SQL Editor → staging project → Run.

create table user_pantry (
  id                     uuid default gen_random_uuid() primary key,
  user_id                uuid references auth.users(id) on delete cascade not null,
  ingredient_name        text not null,
  ingredient_normalized  text not null,
  source                 text default 'manual' check (source in ('manual', 'voice')),
  created_at             timestamptz default now(),
  unique(user_id, ingredient_normalized)
);

alter table user_pantry enable row level security;

create policy "Users manage own pantry"
  on user_pantry for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index idx_pantry_user on user_pantry(user_id);
