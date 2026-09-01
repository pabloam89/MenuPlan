-- Corrige cómo se detecta que un ingrediente choca con una restricción.
--
-- Requiere 0029, 0030 y 0031.
--
-- QUÉ ESTABA MAL. La vista `recipe_substitution_options` que creó la 0031
-- deducía el conflicto a partir de los ALÉRGENOS del ingrediente:
--
--     lactosa_fina    ←  'leche'    = any (allergens)
--     alcohol_cocina  ←  'sulfitos' = any (cooking_allergens)
--
-- Los dos conjuntos NO coinciden con las restricciones que representan, y el
-- error se veía en los datos reales en las dos direcciones:
--
--   · La MANTEQUILLA lleva el alérgeno `leche` pero está deliberadamente fuera
--     de lactosa_fina — se tolera, y ese es justo el sentido de la variante
--     "fina" frente al alérgeno completo. Como no tiene sustituto en la lista,
--     aparecía BLOQUEANDO decenas de recetas que en realidad sí se adaptan.
--   · El VINAGRE tiene sulfitos de cocinado pero no alcohol (ya fermentó en
--     ácido acético), así que tampoco está en alcohol_cocina. Bloqueaba recetas
--     por un conflicto inexistente.
--
-- Con esa lógica salían 366 recetas "en conflicto con la lactosa"; la mayoría
-- solo llevaban mantequilla.
--
-- LA CORRECCIÓN: el conflicto pasa a ser un DATO del ingrediente
-- (`restriction_conflicts`), derivado en el cliente de INTOLERANCE_RULES — las
-- mismas listas con las que la app excluye recetas hoy — en vez de inferirse
-- aquí de un campo que significa otra cosa.
--
-- Run this in: Supabase Dashboard → SQL Editor → Run.

alter table ingredients
  add column if not exists restriction_conflicts text[] not null default '{}';

comment on column ingredients.restriction_conflicts is
  'Restricciones adaptables con las que choca este ingrediente (lactosa_fina, '
  'alcohol_cocina). NO se deduce de allergens: la mantequilla lleva el alérgeno '
  'leche pero no entra en lactosa_fina, y el vinagre tiene sulfitos pero no '
  'alcohol. Se genera desde INTOLERANCE_RULES en build-ingredient-catalog.mjs.';

create index if not exists idx_ingredients_restriction_conflicts
  on ingredients using gin(restriction_conflicts);

-- Misma vista, mismo contrato de salida, pero el conflicto se lee del dato en
-- vez de inferirse. Queda además bastante más simple: una fila por
-- (ingrediente × restricción con la que choca), sin el cross join de
-- restricciones contra todas las filas.
create or replace view recipe_substitution_options as
with conflicts as (
  select
    ri.recipe_id,
    c.restriction,
    ri.raw_name,
    s.replacement_label
  from recipe_ingredients ri
  join ingredients i on i.id = ri.ingredient_id
  cross join lateral unnest(i.restriction_conflicts) as c(restriction)
  left join ingredient_substitutions s
    on s.ingredient_id = ri.ingredient_id
   and s.restriction = c.restriction
)
select
  recipe_id,
  restriction,
  count(*) as conflicting,
  count(replacement_label) as substitutable,
  -- Adaptable solo si TODOS los ingredientes que chocan tienen recambio: uno
  -- solo sin sustituto invalida la adaptación entera.
  count(*) = count(replacement_label) as adaptable,
  array_agg(raw_name order by raw_name) filter (where replacement_label is null)
    as blockers
from conflicts
group by recipe_id, restriction;
