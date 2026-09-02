-- Sustituciones de ingrediente — Fase 3.
--
-- Requiere 0029_ingredients.sql y 0030_recipe_ingredients.sql.
--
-- Convierte en datos lo que el cliente hacía concatenando strings
-- (`"Nata" + " sin lactosa"`) sobre una lista de palabras clave. Ver
-- scripts/ingredient-substitutions.mjs para la curación y, sobre todo, para
-- las omisiones deliberadas.
--
-- ─────────────────────────────────────────────────────────────────────────
-- LO MÁS IMPORTANTE DE ESTA TABLA:
--
--   `restriction` es SIEMPRE una intolerancia o un estado (INTOLERANCE_RULES
--   del cliente: 'lactosa_fina', 'alcohol_cocina'), NUNCA un alérgeno.
--
-- Un producto "sin lactosa" conserva la proteína láctea. Vale para la
-- INTOLERANCIA y no vale para la ALERGIA a la leche, que tiene que seguir
-- excluyendo el plato de forma dura. El CHECK de abajo impide escribir aquí
-- un id de alérgeno por error, porque esa confusión no daría ningún error
-- visible: simplemente ofrecería a un alérgico un plato que le sienta mal.
-- ─────────────────────────────────────────────────────────────────────────
--
-- Run this in: Supabase Dashboard → SQL Editor → Run.

create table if not exists ingredient_substitutions (
  ingredient_id     text not null references ingredients(id) on delete cascade,
  restriction       text not null,

  -- Qué comprar en su lugar. Puede ser una VARIANTE del mismo producto
  -- ("Nata para cocinar sin lactosa"), que es el caso normal, o —cuando se
  -- añadan— otro ingrediente del catálogo, y entonces replacement_id apunta a
  -- él. replacement_label es obligatorio siempre porque es lo que se le enseña
  -- al usuario en la lista de la compra.
  replacement_label text not null,
  replacement_id    text references ingredients(id) on delete restrict,

  -- ¿El cambio es invisible para el resto de la mesa? Es la regla que decide
  -- si una sustitución vale: el objetivo es adaptar el menú familiar sin
  -- bifurcarlo. Si el plato cambia de sabor, no es una sustitución, es otro
  -- plato. Por defecto true porque hoy no hay ninguna que no lo sea.
  invisible         boolean not null default true,
  note              text,

  primary key (ingredient_id, restriction),

  -- Lista blanca de restricciones adaptables. Deliberadamente corta: si una
  -- restricción no tiene un producto de súper equivalente, la receta debe
  -- excluirse, no fingir que se adapta. Ampliarla es una decisión de producto,
  -- por eso cuesta un ALTER y no basta con insertar una fila.
  constraint chk_substitution_restriction
    check (restriction in ('lactosa_fina', 'alcohol_cocina')),

  -- Red de seguridad contra el error que más caro saldría: meter aquí un id de
  -- alérgeno de EU_ALLERGENS en vez de una intolerancia.
  constraint chk_substitution_not_an_allergen
    check (restriction not in (
      'gluten', 'crustaceos', 'huevos', 'pescado', 'cacahuetes', 'soja', 'leche',
      'frutos_cascara', 'apio', 'mostaza', 'sesamo', 'sulfitos', 'altramuces', 'moluscos'
    ))
);

create index if not exists idx_ingredient_substitutions_restriction
  on ingredient_substitutions(restriction);

alter table ingredient_substitutions enable row level security;

drop policy if exists "ingredient_substitutions are publicly readable" on ingredient_substitutions;
create policy "ingredient_substitutions are publicly readable"
  on ingredient_substitutions for select
  using (true);


-- ── ¿Qué recetas se pueden adaptar, y a qué? ───────────────────────────────
--
-- Responde de una consulta la pregunta con la que arrancó todo esto: "¿este
-- plato se puede hacer sin lactosa?".
--
-- `adaptable` es true solo si TODOS los ingredientes que chocan con la
-- restricción tienen recambio. Un solo ingrediente sin sustituto basta para
-- que la receta no se pueda adaptar, por muchos otros que sí lo tengan — de
-- ahí que se cuenten las dos cosas y no solo los sustituibles.
--
-- El choque se detecta por el ALÉRGENO del ingrediente y no por palabras
-- clave: 'lactosa_fina' mira los lácteos ('leche' en ingredients.allergens) y
-- 'alcohol_cocina' mira los sulfitos DE COCINADO, que en este catálogo son
-- exactamente el vino, el vinagre y los destilados de vino.
create or replace view recipe_substitution_options as
with conflicts as (
  select
    ri.recipe_id,
    r.restriction,
    ri.ingredient_id,
    ri.raw_name,
    s.replacement_label
  from recipe_ingredients ri
  join ingredients i on i.id = ri.ingredient_id
  cross join (values ('lactosa_fina'), ('alcohol_cocina')) as r(restriction)
  left join ingredient_substitutions s
    on s.ingredient_id = ri.ingredient_id and s.restriction = r.restriction
  where
    (r.restriction = 'lactosa_fina'   and 'leche'    = any (i.allergens))
    or
    (r.restriction = 'alcohol_cocina' and 'sulfitos' = any (i.cooking_allergens))
)
select
  recipe_id,
  restriction,
  count(*) as conflicting,
  count(replacement_label) as substitutable,
  count(*) = count(replacement_label) as adaptable,
  array_agg(raw_name order by raw_name) filter (where replacement_label is null)
    as blockers
from conflicts
group by recipe_id, restriction;
