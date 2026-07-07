-- Per-user data layer: profile/preferences snapshot, user-created recipes,
-- recipe votes (favorites) and follows (for "solo amigos" visibility).
--
-- Reuses the enums declared in 0001_recipe_catalog.sql (recipe_category,
-- main_protein, recipe_type, meal_role, difficulty_level, recipe_season) so a
-- user recipe is validated against the exact same taxonomy as the bundled
-- catalog. Follows the same conventions as 0002_user_pantry.sql: RLS keyed on
-- auth.uid(), snake_case columns mapped back to camelCase in the client.
--
-- Run this in: Supabase Dashboard → SQL Editor → staging project → Run.

-- ── user_state ────────────────────────────────────────────────
-- Private per-user snapshot of the whole app state EXCEPT the normalized bits
-- (recipes + votes live in their own tables below). The client writes the same
-- object it caches in localStorage ("menuplan.state.v1"), minus userRecipes and
-- recipeVotes. Enables cross-device sync and a "smart reset" that only clears
-- the active menu without losing the profile.
create table if not exists user_state (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  state      jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table user_state enable row level security;

create policy "Users manage own state"
  on user_state for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ── user_follows ──────────────────────────────────────────────
-- Directed graph: follower_id follows followee_id. "Friends" = a mutual follow
-- (see are_mutual_follows() used by the user_recipes friends policy).
create table if not exists user_follows (
  follower_id uuid not null references auth.users(id) on delete cascade,
  followee_id uuid not null references auth.users(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (follower_id, followee_id),
  constraint chk_no_self_follow check (follower_id <> followee_id)
);

alter table user_follows enable row level security;
create index if not exists idx_follows_followee on user_follows(followee_id);

create policy "Users manage own follows"
  on user_follows for all
  using (auth.uid() = follower_id)
  with check (auth.uid() = follower_id);

create policy "Follows readable by involved users"
  on user_follows for select
  using (auth.uid() = follower_id or auth.uid() = followee_id);

-- SECURITY DEFINER so the user_recipes RLS policy can check friendship without
-- being blocked by user_follows' own RLS (avoids policy recursion).
create or replace function are_mutual_follows(a uuid, b uuid)
returns boolean
language sql
security definer
stable
as $$
  select exists (select 1 from user_follows where follower_id = a and followee_id = b)
     and exists (select 1 from user_follows where follower_id = b and followee_id = a);
$$;

-- ── user_recipes ──────────────────────────────────────────────
do $$ begin
  create type recipe_visibility as enum ('public', 'friends', 'private');
exception when duplicate_object then null;
end $$;

create table if not exists user_recipes (
  id                  text primary key,               -- client-generated "user_<uuid>"
  owner_id            uuid not null references auth.users(id) on delete cascade,
  name                text not null,
  category            recipe_category not null,
  main_protein        main_protein not null default 'none',
  meal_roles          meal_role[] not null default '{}',
  usage_tags          text[] not null default '{}',   -- eje B: plato_unico / plato_normal / guarnicion
  type                recipe_type not null,
  base_dish_id        text,                            -- eje A: variante de un plato existente
  linked_catalog_id   text,
  pinned_garnish_id   text,
  required_appliances text[],
  time_minutes        integer check (time_minutes > 0),
  difficulty          difficulty_level,
  season              recipe_season not null default 'all',
  kcal                numeric check (kcal >= 0),
  protein_g           numeric check (protein_g >= 0),
  carbs_g             numeric check (carbs_g >= 0),
  fat_g               numeric check (fat_g >= 0),
  base_servings       integer check (base_servings > 0),
  kid_friendly        boolean not null default false,
  tupper_friendly     boolean not null default false,
  allergens           text[] not null default '{}',
  ingredients         jsonb not null default '[]'::jsonb,
  steps               text[] not null default '{}',
  description         text,
  methods             jsonb,
  photo               text,
  owner_snapshot      jsonb,                           -- {id,name,avatar,email} cached for display
  visibility          recipe_visibility not null default 'private',
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

alter table user_recipes enable row level security;
create index if not exists idx_user_recipes_owner on user_recipes(owner_id);
create index if not exists idx_user_recipes_visibility on user_recipes(visibility);

-- Owner: full control over their own recipes.
create policy "Owner manages own recipes"
  on user_recipes for all
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

-- Anyone (including anon) can read recipes marked public.
create policy "Public recipes readable"
  on user_recipes for select
  using (visibility = 'public');

-- Mutual-follow friends can read "friends"-scoped recipes.
create policy "Friends read friends recipes"
  on user_recipes for select
  using (visibility = 'friends' and are_mutual_follows(auth.uid(), owner_id));

create trigger trg_user_recipes_updated_at
  before update on user_recipes
  for each row execute function set_updated_at();

-- ── recipe_votes ──────────────────────────────────────────────
-- One row per (user, recipe). recipe_id is text with NO FK: it may point to a
-- bundled catalog id ("carnes_001") OR a user_recipes id ("user_<uuid>").
-- `vote` (like/dislike) and `is_favorite` (personal collection) are
-- independent — see migration 0004 — so a row can carry either or both.
create table if not exists recipe_votes (
  user_id    uuid not null references auth.users(id) on delete cascade,
  recipe_id  text not null,
  vote       text not null check (vote in ('up', 'down')),
  -- Optional per-group scope for a favorite: NULL = applies to the whole
  -- household ("all"); otherwise the menu-group labels it applies to
  -- ("Adultos", "Niños", "Bebé"). Used to prioritize favorites only in the
  -- relevant group's menu (see favoriteIdsForGroup in lib/recipeVotes.js).
  scope      text[],
  created_at timestamptz not null default now(),
  primary key (user_id, recipe_id)
);

-- Safe to re-run if recipe_votes already existed from an earlier apply.
alter table recipe_votes add column if not exists scope text[];

alter table recipe_votes enable row level security;
create index if not exists idx_recipe_votes_recipe on recipe_votes(recipe_id);

create policy "Users manage own votes"
  on recipe_votes for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Aggregate up/down counts need reading everyone's votes; a vote carries no
-- private data beyond the (already public-facing) recipe it points to.
create policy "Votes are publicly readable"
  on recipe_votes for select
  using (true);
