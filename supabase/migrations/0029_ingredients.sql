-- Catálogo canónico de ingredientes — Fase 1.
--
-- Hasta ahora los ingredientes solo existían como texto libre dentro de
-- `recipes.ingredients` (jsonb): `{name, amount, unit}`, sin identificador. Eso
-- obligaba a cada consumidor a deducir por palabras clave lo que necesitara
-- saber del ingrediente (pasillo, alérgeno, imagen, precio, si es vegano), y
-- había seis tablas de keywords distintas en el cliente que podían equivocarse
-- por separado. Estas dos tablas son la fuente única.
--
-- ESPEJO DEL BUNDLE, NO SUSTITUTO. La fuente de verdad sigue siendo
-- src/data/ingredients.json, generado por scripts/build-ingredient-catalog.mjs
-- desde el catálogo de recetas real y validado contra src/data/
-- ingredientSchema.js. En esta fase el CLIENTE NO LEE ESTAS TABLAS: existen
-- para poder consultar, indexar y unir por SQL (informes, precios, la futura
-- `recipe_ingredients` de la Fase 2) sin tener que desplegar el bundle.
--
-- Por eso tampoco hay fila en `catalog_meta` para ingredientes: no existe aún
-- un gate de versión que arbitre entre bundle y BD porque no hay nada que
-- arbitrar. Se añadirá cuando el cliente empiece a leer de aquí.
--
-- Run this in: Supabase Dashboard → SQL Editor → Run.

create table if not exists ingredients (
  id                text primary key,
  name              text not null,

  -- Pasillo de súper y categoría de despensa. Se guardan como text y no como
  -- enum nativo a propósito: son taxonomías de presentación que cambian con la
  -- UI (SHOPPING_AISLES / INGREDIENT_CATEGORIES en el cliente), y un enum
  -- nativo obliga a reconstruir el tipo para renombrar un valor. El enum de
  -- verdad lo impone el schema Zod en el cliente, que es quien genera esto.
  aisle             text not null,
  category          text not null,

  -- Alérgeno declarable: el producto lo lleva y se come tal cual.
  --
  -- OJO AL VOCABULARIO: aquí van los ids canónicos UE de EU_ALLERGENS
  -- ('leche', 'huevos', 'crustaceos', 'frutos_cascara'), NO los del enum
  -- `recipes.allergens`, que conserva el vocabulario histórico del catálogo
  -- ('lactosa', 'huevo', 'marisco', 'frutos_secos'). Cualquier join entre las
  -- dos tablas tiene que traducir — ver TO_SCHEMA_VOCAB en
  -- scripts/apply-allergen-findings.mjs.
  allergens         text[] not null default '{}',

  -- Segundo nivel: alérgeno real que entra como ingrediente de COCINADO (el
  -- vino, el vinagre o el brandy de un sofrito), no como algo que se coma tal
  -- cual. Mismo patrón que `alcohol_cocina` en el cliente: no excluye el plato,
  -- lo adapta. Separarlo evita vaciar 65 recetas a quien filtre por sulfitos.
  cooking_allergens text[] not null default '{}',

  is_vegetarian     boolean not null,
  is_vegan          boolean not null,

  -- Unidad y cantidad típicas, derivadas del uso real en el catálogo. Son
  -- valores por defecto para la UI (añadir a la despensa, a la lista), no una
  -- restricción sobre lo que puede escribir el usuario.
  default_unit      text not null,
  median_amount     numeric,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint chk_ingredient_unit check (default_unit in ('g', 'ml', 'ud')),
  constraint chk_ingredient_amount check (median_amount is null or median_amount > 0),
  -- Espejo de la superRefine del schema Zod: vegano implica vegetariano.
  constraint chk_vegan_implies_vegetarian check (not is_vegan or is_vegetarian),
  -- Un alérgeno no puede estar en los dos niveles: o se come tal cual o es de
  -- cocinado. Si estuviera en ambos, dos consumidores que miren campos
  -- distintos tomarían decisiones distintas sobre el mismo producto.
  constraint chk_allergen_levels_disjoint check (
    not (allergens && cooking_allergens)
  )
);

-- Todas las formas en que el catálogo escribe un mismo producto
-- ("Pechuga de pollo" → pollo). Tabla propia y no un array en `ingredients`
-- porque la búsqueda va SIEMPRE del alias al ingrediente, nunca al revés, y
-- porque así la unicidad del alias la garantiza la PK en vez de la aplicación.
create table if not exists ingredient_aliases (
  -- PK sobre el alias YA NORMALIZADO (minúsculas, sin acentos), que es la clave
  -- con la que busca resolveIngredientId() en el cliente. Como PK, la base
  -- impide por construcción que un mismo alias apunte a dos ingredientes —
  -- justo la invariante que sostiene al resolutor: si un alias fuera ambiguo,
  -- resolvería a uno u otro según el orden, y con él a un alérgeno distinto.
  alias_normalized text primary key,
  alias            text not null,
  ingredient_id    text not null references ingredients(id) on delete cascade
);

create index if not exists idx_ingredient_aliases_ingredient
  on ingredient_aliases(ingredient_id);
create index if not exists idx_ingredients_aisle on ingredients(aisle);
create index if not exists idx_ingredients_allergens on ingredients using gin(allergens);
create index if not exists idx_ingredients_cooking_allergens
  on ingredients using gin(cooking_allergens);
-- Filtrar "solo vegano" / "solo vegetariano" es una consulta de menú habitual y
-- toca pocas filas del total, así que los índices van parciales.
create index if not exists idx_ingredients_vegan on ingredients(id) where is_vegan;
create index if not exists idx_ingredients_vegetarian on ingredients(id) where is_vegetarian;

-- set_updated_at() ya existe desde 0001_recipe_catalog.sql.
drop trigger if exists trg_ingredients_updated_at on ingredients;
create trigger trg_ingredients_updated_at
  before update on ingredients
  for each row execute function set_updated_at();

-- Catálogo público de solo lectura, igual que `recipes`: no hay datos de
-- usuario aquí. Las escrituras van con la service role key, que salta RLS, así
-- que no hacen falta políticas de insert/update/delete.
alter table ingredients enable row level security;
alter table ingredient_aliases enable row level security;

drop policy if exists "ingredients are publicly readable" on ingredients;
create policy "ingredients are publicly readable"
  on ingredients for select
  using (true);

drop policy if exists "ingredient_aliases are publicly readable" on ingredient_aliases;
create policy "ingredient_aliases are publicly readable"
  on ingredient_aliases for select
  using (true);
