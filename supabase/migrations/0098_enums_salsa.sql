-- AUDITADA: auditor-datos 2026-10-10 OK
-- Declara tres valores de enum que existen en producción y ninguna migración declara (#366).
--
-- Qué hace: añade 'salsas' a recipe_category, 'salsa' a meal_role y 'salsa' a recipe_type, con
-- «add value if not exists». Los declaraba supabase/seed_0_setup.sql, que se borró en #303 (PR de la
-- 0093); desde entonces, reconstruir la base desde las migraciones los dejaría fuera y
-- user_recipes (que usa estos tres enums) no aceptaría una receta de salsa.
--
-- En producción NO cambia nada: los tres valores ya están, así que cada sentencia es un no-op
-- (Postgres avisa con un NOTICE «ya existe, se omite»). No toca datos, permisos ni RLS; sin CONTRAE.
--
-- Transacción: «add value» dentro de una transacción vale desde PG 12 mientras el valor no se use
-- en ella; aquí no se usa (apply-migration envuelve el fichero en begin/rollback o begin/commit).
--
-- Consultas previas (el ensayo debe confirmar que dan 3, es decir, que ya existen):
--   select count(*) from pg_enum e join pg_type t on t.oid = e.enumtypid
--    where (t.typname, e.enumlabel) in (('recipe_category','salsas'), ('meal_role','salsa'), ('recipe_type','salsa'));
--
-- Plan B: el código no depende de esta migración; en producción los valores ya existen.
-- Lector: user_recipes.category / .meal_roles / .type (y las constantes de vocabulario de src/data/model.js).
-- Testigo: verificar-estado lee estos tres valores en pg_enum (tipo «valor»).

-- enum-declarativo: los tres valores ya existen en producción (los declaraba el seed borrado en #303); aquí solo se declaran, no se añade ninguno.
set lock_timeout = '5s';

alter type public.recipe_category add value if not exists 'salsas';
alter type public.meal_role add value if not exists 'salsa';
alter type public.recipe_type add value if not exists 'salsa';
