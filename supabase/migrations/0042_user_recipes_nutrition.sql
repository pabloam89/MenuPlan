-- Fase 9: nutrición fiable en recetas de IA/usuario. `generateUserRecipeDraft`
-- (src/lib/userRecipes.js) ya calcula estos 4 campos a partir del catálogo de
-- ingredientes (BEDCA) cuando la cobertura es suficiente, y siempre marca de
-- dónde salen los macros con nutrition_source — pero user_recipes no tenía
-- columnas para guardar ninguno de los dos, así que hoy se pierden al recargar
-- tras guardar. Solo en user_recipes, no en `recipes`: nutrition_source
-- ("computed" vs "ai") no tiene sentido para el catálogo curado, que siempre
-- está revisado a mano.
--
-- Nullable, sin default: una receta guardada antes de esta migración
-- simplemente no tiene estos datos (NULL), no es un error.
alter table user_recipes add column if not exists fiber_g numeric;
alter table user_recipes add column if not exists sugar_g numeric;
alter table user_recipes add column if not exists saturated_fat_g numeric;
alter table user_recipes add column if not exists sodium_mg numeric;
alter table user_recipes add column if not exists nutrition_source text
  check (nutrition_source is null or nutrition_source in ('computed', 'ai'));
