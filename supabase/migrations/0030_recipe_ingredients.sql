-- Tabla de unión receta ↔ ingrediente — Fase 2.
--
-- Requiere 0029_ingredients.sql.
--
-- ADITIVA, y esto es lo importante: `recipes.ingredients` (jsonb) SIGUE SIENDO
-- LA FUENTE DE VERDAD y no se toca ni se vacía. Esta tabla es una proyección
-- consultable de esa misma información, que se regenera entera desde el bundle
-- (seed_recipe_ingredients.sql). Ningún cliente depende todavía de ella, así
-- que si se queda atrás no rompe nada — solo deja de servir para consultar.
--
-- Lo que desbloquea, y que con el jsonb no se puede hacer sin escanear las 939
-- filas en el cliente:
--   · "qué recetas puedo cocinar con lo que tengo en la despensa"
--   · coste por ración cruzando con store_products
--   · alérgenos derivados de los ingredientes (vista de abajo)
--   · "en cuántas recetas de la semana entra este manojo de perejil"
--
-- Run this in: Supabase Dashboard → SQL Editor → Run.

create table if not exists recipe_ingredients (
  recipe_id     text not null references recipes(id) on delete cascade,

  -- Posición dentro de la receta. Forma parte de la PK en vez de un id
  -- autonumérico porque el orden es información real (se pinta así) y porque
  -- hace el re-seed idempotente: la misma receta reescribe sus mismas filas.
  position      integer not null,

  -- NULLABLE A PROPÓSITO, y no es un caso raro que haya que arreglar: las
  -- recetas de usuario y las generadas por IA traen texto libre que nunca
  -- estará en el catálogo. null significa "no sé qué ingrediente es", nunca
  -- "no tiene". Cualquier consulta de alérgenos que ignore los null estará
  -- dando una respuesta incompleta y tiene que saberlo.
  ingredient_id text references ingredients(id) on delete restrict,

  -- El texto tal cual lo escribe la receta. Se conserva SIEMPRE, también
  -- cuando ingredient_id resuelve: es lo que hay que mostrar. "Merluza o
  -- pescado blanco" resuelve a `merluza` pero tiene que seguir leyéndose así.
  raw_name      text not null,

  amount        numeric,
  unit          text,

  primary key (recipe_id, position),
  constraint chk_recipe_ingredient_unit check (unit is null or unit in ('g', 'ml', 'ud')),
  constraint chk_recipe_ingredient_amount check (amount is null or amount > 0)
);

-- El índice que hace útil la tabla: "dame las recetas que usan este
-- ingrediente" es la consulta inversa, y sin él sería un seq scan.
create index if not exists idx_recipe_ingredients_ingredient
  on recipe_ingredients(ingredient_id);
-- Parcial: encontrar rápido lo que quedó sin resolver, que es la métrica de
-- salud de la tabla.
create index if not exists idx_recipe_ingredients_unresolved
  on recipe_ingredients(recipe_id) where ingredient_id is null;

alter table recipe_ingredients enable row level security;

drop policy if exists "recipe_ingredients are publicly readable" on recipe_ingredients;
create policy "recipe_ingredients are publicly readable"
  on recipe_ingredients for select
  using (true);


-- ── Alérgenos derivados ────────────────────────────────────────────────────
--
-- La segunda opinión sobre `recipes.allergens`, calculada desde los
-- ingredientes. NO la sustituye: la columna declarada es la revisada a mano y
-- manda siempre. Esta vista sirve para compararlas y para responder "¿este
-- plato se puede hacer sin lactosa?" sin recorrer el jsonb.
--
-- `unresolved` es parte del contrato, no un extra: mientras sea > 0 los
-- alérgenos de esa fila son un MÍNIMO, porque hay ingredientes que la vista no
-- ha sabido identificar. Consumirla ignorando esa columna es leer una lista
-- incompleta como si fuera completa.
--
-- OJO AL VOCABULARIO: aquí salen los ids canónicos UE ('leche', 'huevos',
-- 'crustaceos', 'frutos_cascara'), mientras que recipes.allergens usa el
-- histórico ('lactosa', 'huevo', 'marisco', 'frutos_secos'). Comparar las dos
-- exige traducir — ver TO_SCHEMA_VOCAB en scripts/apply-allergen-findings.mjs.
-- Los dos niveles se agregan por separado a propósito. Hacerlo en un solo
-- SELECT con dos `unnest` a la vez cruza cada alérgeno duro con cada uno de
-- cocinado (producto cartesiano): el `distinct` disimula el resultado, pero
-- cualquier count() sobre esa misma consulta sale multiplicado.
create or replace view recipe_derived_allergens as
with hard as (
  select ri.recipe_id, array_agg(distinct a order by a) as allergens
  from recipe_ingredients ri
  join ingredients i on i.id = ri.ingredient_id
  cross join lateral unnest(i.allergens) as a
  group by ri.recipe_id
),
cooking as (
  select ri.recipe_id, array_agg(distinct c order by c) as cooking_allergens
  from recipe_ingredients ri
  join ingredients i on i.id = ri.ingredient_id
  cross join lateral unnest(i.cooking_allergens) as c
  group by ri.recipe_id
),
counts as (
  select recipe_id, count(*) filter (where ingredient_id is null) as unresolved
  from recipe_ingredients
  group by recipe_id
)
select
  n.recipe_id,
  coalesce(h.allergens, '{}') as allergens,
  -- Un alérgeno duro en cualquier ingrediente gana al nivel de cocinado de
  -- otro: si el plato ya lleva sulfitos en unas aceitunas, el chorrito de vino
  -- no añade nada que el usuario pueda evitar cambiando de producto.
  array(
    select x from unnest(coalesce(k.cooking_allergens, '{}')) as x
    where not (x = any (coalesce(h.allergens, '{}')))
  ) as cooking_allergens,
  n.unresolved
from counts n
left join hard h on h.recipe_id = n.recipe_id
left join cooking k on k.recipe_id = n.recipe_id;
