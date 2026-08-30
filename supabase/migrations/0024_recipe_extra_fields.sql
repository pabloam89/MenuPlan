-- Tres columnas que ya vivían en el schema/JSON local pero nunca llegaron a
-- Supabase, así que rowToRecipe() las perdía en silencio para cualquier
-- receta servida desde la nube (que es el caso normal en producción desde
-- que catalog_meta.version llegó a 17).
--
-- Descubierto al investigar por qué el catálogo antiguo seguía apareciendo en
-- el menú: no era la causa principal (esa era el fallback de filterRecipes.js,
-- ya arreglado), pero de camino se vio que faltaban estas tres.
--
-- TODO ES ADITIVO, mismo patrón que 0023_recipe_axes.sql: nullable, sin
-- default no trivial, las filas existentes quedan intactas.
--
-- Run this in: Supabase Dashboard → SQL Editor → project → Run.

-- Proteínas animales secundarias (jamón en una ensalada, atún en un huevo…).
-- La regla de "no repetir proteína el mismo día" (validateMenu.js,
-- proteinGroupsOf) depende de este campo para verlas — sin él, esos platos
-- cuentan como mainProtein "none"/"legumbre"/etc. y la regla no los ve.
alter table recipes      add column if not exists extra_proteins main_protein[];
alter table user_recipes add column if not exists extra_proteins main_protein[];

-- ¿Aguanta el plato una congelación y un recalentado sin arruinarse? Sin esta
-- columna, ninguna receta puede entrar nunca en el flujo de congelador
-- (banner en la ficha, uso desde el planner) para nadie servido desde
-- Supabase — el feature completo queda invisible, no solo degradado.
alter table recipes      add column if not exists freezable boolean;
alter table user_recipes add column if not exists freezable boolean;

-- Paso a paso enriquecido (stepper con tipo de paso/tiempo/paralelo) — ver
-- 0013_user_recipes_steps_rich.sql para el detalle del formato. Esa migración
-- solo tocó user_recipes; el catálogo (recipes) se quedó sin la columna
-- cuando el enriquecimiento llegó a las 896 recetas del bundle.
alter table recipes add column if not exists steps_rich jsonb;
