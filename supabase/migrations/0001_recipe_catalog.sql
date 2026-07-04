-- Recipe catalog schema — mirrors the taxonomy enforced client-side by
-- src/data/recipeSchema.js. Garnishes are NOT a separate table: they are
-- recipes with type = 'guarnicion' (same shape as guarniciones.json), so one
-- table covers both, matching how the app already treats them.
--
-- The JSON files in src/data/recipes/ remain the source of truth during the
-- transition — this schema exists so the catalog can be indexed, queried,
-- and later extended (favorites, history, user-contributed dishes) without
-- shipping a new JS bundle for every data change.
--
-- Run this in: Supabase Dashboard → SQL Editor → staging project → Run.

create type recipe_category as enum (
  'bebes', 'carnes', 'cenas_rapidas', 'ensaladas_verduras', 'guarniciones',
  'huevos', 'legumbres', 'pasta_arroces', 'pescados', 'platos_unicos',
  'sopas_cremas'
);

create type main_protein as enum (
  'cerdo', 'huevo', 'legumbre', 'marisco', 'none', 'pavo',
  'pescado_azul', 'pescado_blanco', 'pollo', 'ternera'
);

create type recipe_type as enum ('completo', 'principal', 'guarnicion');

create type meal_role as enum ('cena', 'guarnicion', 'plato_unico', 'primero', 'segundo');

create type difficulty_level as enum ('elaborada', 'facil', 'normal');

create type recipe_season as enum ('all', 'invierno', 'verano');

create table recipes (
  id                 text primary key,
  name               text not null,
  category           recipe_category not null,
  main_protein       main_protein not null,
  main_base          text,
  meal_roles         meal_role[] not null,
  type               recipe_type not null,
  -- Links a variant (e.g. "Muslos de pollo al horno") to the base dish it
  -- overlaps with (e.g. "Pollo al horno con patatas"). NULL = not reviewed
  -- yet, or genuinely a standalone dish. Populated after reviewing
  -- scripts/detect-duplicate-dishes.mjs output.
  base_dish_id       text references recipes(id),
  required_appliance text,
  time_minutes       integer not null check (time_minutes > 0),
  difficulty         difficulty_level not null,
  season             recipe_season not null default 'all',
  kcal               numeric not null check (kcal >= 0),
  protein_g          numeric not null check (protein_g >= 0),
  carbs_g            numeric not null check (carbs_g >= 0),
  fat_g              numeric not null check (fat_g >= 0),
  base_servings      integer not null check (base_servings > 0),
  kid_friendly       boolean not null default false,
  tupper_friendly    boolean not null default false,
  allergens          text[] not null default '{}',
  ingredients        jsonb not null,
  steps              text[] not null,
  description        text not null,
  methods            jsonb,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),

  constraint chk_base_dish_not_self check (base_dish_id is distinct from id),
  -- Same cross-field rules as RecipeSchema's superRefine in recipeSchema.js —
  -- kept in sync manually; if you change one, change the other.
  constraint chk_guarnicion_role check (
    type <> 'guarnicion' or meal_roles = array['guarnicion']::meal_role[]
  ),
  constraint chk_no_guarnicion_role_outside_type check (
    type = 'guarnicion' or not ('guarnicion' = any(meal_roles))
  )
);

create index idx_recipes_category on recipes(category);
create index idx_recipes_protein on recipes(main_protein);
create index idx_recipes_type on recipes(type);
create index idx_recipes_meal_roles on recipes using gin(meal_roles);
create index idx_recipes_base_dish on recipes(base_dish_id);
create index idx_recipes_allergens on recipes using gin(allergens);

create table dish_images (
  combo_id   text primary key,  -- "carnes_002" or "carnes_002+guarniciones_001"
  recipe_id  text not null references recipes(id),
  garnish_id text references recipes(id),
  image_url  text not null,
  created_at timestamptz not null default now()
);

create index idx_dish_images_recipe on dish_images(recipe_id);

create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger trg_recipes_updated_at
  before update on recipes
  for each row execute function set_updated_at();

-- Public read-only catalog (no user data in these tables). Writes require
-- the service role key, which bypasses RLS — no write policies needed here.
alter table recipes enable row level security;
alter table dish_images enable row level security;

create policy "recipes are publicly readable"
  on recipes for select
  using (true);

create policy "dish_images are publicly readable"
  on dish_images for select
  using (true);
