-- Ejes de clasificación separados para el catálogo de recetas.
--
-- Contexto (ver model/recipe-data-model-refactor.md): `category` mezclaba tres
-- cosas de naturaleza distinta en un enum de valor único — qué ingrediente
-- lleva, cuánto tarda y cuánto esfuerzo requiere. Esta migración añade los ejes
-- que faltaban como columnas propias, espejo de los campos nuevos en
-- src/data/recipeSchema.js.
--
-- TODO ES ADITIVO, a propósito:
--   * NO se elimina ningún valor de `recipe_category`. "cenas_rapidas" y
--     "platos_unicos" quedan DEPRECADOS (el catálogo curado deja de usarlos)
--     pero siguen siendo válidos para siempre: `recipe_category` es un enum
--     nativo compartido por `recipes` y `user_recipes`, quitar un valor obliga
--     a reconstruir el tipo y hay filas de usuarios reales que ya lo usan (el
--     checkbox "cena rápida" de RecipeClassificationFields.jsx las escribía).
--     El predicado isMontaje() en recipeSchema.js resuelve ambas formas.
--   * Todas las columnas son nullable / sin default no trivial, así que las
--     filas existentes quedan intactas y cualquier cliente que aún no conozca
--     estos campos sigue funcionando.
--
-- Run this in: Supabase Dashboard → SQL Editor → staging project → Run.

-- Ambas tablas comparten la forma de receta (ver 0003_user_data.sql), así que
-- los ejes nuevos tienen que existir en las dos o `rowToRecipe` devolvería
-- recetas de usuario sin clasificar.

-- ¿Entra por los ojos? Eje de curación, ortogonal a difficulty/time: sesga qué
-- se destaca al usuario, ninguna regla del motor depende de él.
alter table recipes      add column if not exists apetecible boolean;
alter table user_recipes add column if not exists apetecible boolean;

-- "Cena rápida" real: se monta, no se cocina. Sustituye a category
-- 'cenas_rapidas'. Se marca a mano y NO se deriva de time+difficulty: medido
-- contra el catálogo, 57 recetas cumplen el mismo umbral (fácil + rol cena +
-- ≤20 min) sin tener ese carácter, y ni requiredAppliance ni el número de
-- ingredientes separan los dos grupos.
alter table recipes      add column if not exists montaje boolean;
alter table user_recipes add column if not exists montaje boolean;

-- ¿Puede además hacer de guarnición de otro plato? Una ensalada o un arroz
-- sencillo acompañan un filete un día y son la cena entera otro. Solo mete el
-- plato en el pool de utils/pairGarnishes.js; su meal_roles no cambia.
alter table recipes      add column if not exists can_be_garnish boolean;
alter table user_recipes add column if not exists can_be_garnish boolean;

-- Composición no proteica y no feculenta (verdura/lacteo/seta/fruta/
-- frutos_secos/encurtido). Sin solape con main_protein ni con main_base, para
-- que un mismo concepto no viva en dos columnas. Informativo/filtrable: las
-- reglas de no-repetición siguen siendo main_protein + main_base.
alter table recipes      add column if not exists main_ingredients text[];
alter table user_recipes add column if not exists main_ingredients text[];

-- Salsa/emulsión emparejada, mismo patrón que la guarnición (referencia por
-- id, nunca embebida). Solo para salsas que se preparan APARTE y se añaden al
-- final; una técnica de cocinado integral (al ajillo, en salsa verde, guisos)
-- se queda dentro de ingredients/steps de la propia receta.
alter table recipes      add column if not exists sauce_id text;
alter table user_recipes add column if not exists sauce_id text;
