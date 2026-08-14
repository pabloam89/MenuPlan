-- Recipe discards ("No me gusta" / cooldowns), previously only inside the
-- generic user_state JSONB blob (debounced 1.2s together with the rest of
-- the profile). Splitting it into its own table, mirroring recipe_votes
-- (0003_analytics_feedback_votes.sql), gives it an immediate, dedicated
-- write instead of riding along a whole-profile save.
--
-- A row represents one of two independent things, matching the app's local
-- `data.discards = { forever: string[], cooldownUntil: Record<id, ts> }`:
--   is_permanent = true   → "Descartado para siempre" (Recetas ▸ Descartados,
--                           reversible via "Recuperar" — cooldown_until null)
--   is_permanent = false  → temporary cooldown ("Esta semana no" / "Tarda
--                           demasiado" ≈7d, "Lo dejamos para luego" ≈14d),
--                           cooldown_until holds the expiry; the row is
--                           filtered out (treated as if absent) once it's
--                           past, rather than eagerly deleted — same
--                           lazy-prune behaviour the local copy already has.
--
-- Run this in: Supabase Dashboard → SQL Editor → project → Run.

create table if not exists user_recipe_discards (
  id             bigserial primary key,
  user_id        uuid references auth.users(id) on delete cascade not null,
  recipe_id      text not null,
  is_permanent   boolean not null default false,
  cooldown_until timestamptz,
  created_at     timestamptz not null default now(),
  unique(user_id, recipe_id)
);

alter table user_recipe_discards enable row level security;

create policy "Users manage own discards"
  on user_recipe_discards for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists idx_user_recipe_discards_user   on user_recipe_discards(user_id);
create index if not exists idx_user_recipe_discards_recipe on user_recipe_discards(recipe_id);
