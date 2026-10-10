-- 0093 · Se borran las 7 tablas y las 2 vistas copia del catálogo (issue #303).
-- AUDITADA: auditor-datos 2026-10-09 OK
-- CONTRAE: borra recipes (1002 filas), recipe_ingredients (7140), catalog_meta (1), dish_images (2344),
-- CONTRAE: ingredients (383), ingredient_aliases (419), ingredient_substitutions (16) y las vistas
-- CONTRAE: recipe_derived_allergens (980) y recipe_substitution_options (327). Es de Pablo (`--pablo`).
--
-- Qué hace. Quita de la base, de una vez, la copia del catálogo que se quedó parada
-- en la v27 (8 sep 2026): 7 tablas y las 2 vistas que se calculan sobre ellas. Primero
-- las vistas y luego las tablas por el orden de sus claves ajenas (las 8 FK son todas
-- entre estas tablas): dish_images, recipe_ingredients, ingredient_substitutions,
-- ingredient_aliases, recipes, ingredients, catalog_meta. UNA sentencia por objeto,
-- sin `cascade` y sin `if exists`: si algo depende de ellas que no esté en este lote
-- (otra vista, una FK, un permiso), el DROP falla y la migración entera se deshace.
--
-- Por qué. Decidido por Pablo el 9 oct 2026: «si ahora no debería estar, que no
-- dependa de migrar». Razones, las tres medidas:
--   - Nadie las lee. Hace más de una semana que ningún fichero de src/, api/ o
--     scripts/ las consulta (ops/lecturasRetiradas.test.js lo vigila desde el #251);
--     la fuente del catálogo es el JSON de src/data/ en git (migración 0064).
--   - Son una copia parada en la v27 mientras el catálogo en git va por la v39+: una
--     segunda verdad, vieja, que alguien podría volver a leer por error.
--   - Están expuestas a la API pública: anon y authenticated tienen todos los
--     permisos sobre ellas (políticas «publicly readable»). Cada tabla sin
--     lector es superficie de ataque sin beneficio.
--
-- Qué NO se borra. Los 5 enums de la 0001 (recipe_type, meal_role…) los usa
-- user_recipes; la función set_updated_at la usan otras 7 tablas. Tampoco se toca
-- user_pantry.ingredient_id ni user_menu_recipes.recipe_id: son texto sin FK hacia
-- estas tablas (guardan ids de los JSON de git), y por eso el drop no los afecta.
--
-- Plan B del código. Ningún código de staging depende de que existan ni de que no:
-- el único lector era `main` (producción), que consulta catalog_meta en
-- src/data/recipeCatalog.js en cada carga y, si falla, usa el catálogo del bundle
-- (una petición de más por carga, aceptada por Pablo el 9 oct 2026). La retirada de
-- los seeds y scripts que las escribían va en el mismo PR.
--
-- Copia previa. Los 9 objetos se volcaron a JSON el 9 oct 2026, solo con SELECT, en
-- C:\dev\copias-previas\2026-10-09-catalogo-copia\ (MANIFIESTO.json con filas y
-- sha256; ESQUEMA.json con columnas, restricciones, índices, políticas y la
-- definición de las vistas; LEEME.txt con cómo restaurar). Fuera del repo. Todo el
-- contenido, además, está en git (JSON de src/data/, seeds antiguos en el historial).
-- Para restaurar: los CREATE están en las migraciones 0001, 0006_catalog_meta, 0012,
-- 0023, 0024, 0025, 0029, 0030, 0031, 0032, 0048, 0051, 0052 y 0054; los datos, en la
-- copia. Ver LEEME.txt.
--
-- Consultas previas (deben dar lo que dice cada línea; la comprobación del principio
-- lo repite y aborta si no cuadra):
--   select count(*) from public.recipes;                      -- 1002
--   select count(*) from public.recipe_ingredients;           -- 7140
--   select count(*) from public.catalog_meta;                 -- 1
--   select count(*) from public.dish_images;                  -- 2344
--   select count(*) from public.ingredients;                  -- 383
--   select count(*) from public.ingredient_aliases;           -- 419
--   select count(*) from public.ingredient_substitutions;     -- 16
--   select count(*) from public.recipe_derived_allergens;     -- 980
--   select count(*) from public.recipe_substitution_options;  -- 327
--   -- ninguna otra tabla o vista de public/ops depende de ellas (debe dar 0):
--   select count(*) from pg_depend d join pg_rewrite r on r.oid = d.objid
--     join pg_class v on v.oid = r.ev_class
--    where d.refobjid in ('public.recipes'::regclass, 'public.recipe_ingredients'::regclass,
--          'public.catalog_meta'::regclass, 'public.dish_images'::regclass, 'public.ingredients'::regclass,
--          'public.ingredient_aliases'::regclass, 'public.ingredient_substitutions'::regclass)
--      and v.relname not in ('recipe_derived_allergens', 'recipe_substitution_options')
--      and v.oid <> d.refobjid;
--
-- Objeto testigo (negativo): `recipes` ya no está en `pg_class`; con ella, las otras
-- 6 tablas y las 2 vistas. `verificar-estado` lo comprueba como «falta de la base».
-- SIN APLICAR.

set lock_timeout = '5s';

-- 0. Que lo que se va a borrar sea lo que se copió. Si alguien escribió algo entre
--    la copia previa y ahora, aborta: habría que repetir la copia.
do $$
declare
  c record;
  v_n bigint;
begin
  for c in
    select * from (values
      ('recipes', 1002), ('recipe_ingredients', 7140), ('catalog_meta', 1), ('dish_images', 2344),
      ('ingredients', 383), ('ingredient_aliases', 419), ('ingredient_substitutions', 16),
      ('recipe_derived_allergens', 980), ('recipe_substitution_options', 327)
    ) as t(objeto, esperadas)
  loop
    execute format('select count(*) from public.%I', c.objeto) into v_n;
    raise notice '0093: % tiene % filas (copia previa: %)', c.objeto, v_n, c.esperadas;
    if v_n <> c.esperadas then
      raise exception '0093: % tiene % filas y la copia previa tiene %; repite la copia antes de borrar', c.objeto, v_n, c.esperadas;
    end if;
  end loop;
end
$$;

-- 1. Las vistas primero: se calculan sobre recipes, recipe_ingredients, ingredients
--    e ingredient_substitutions.
drop view public.recipe_derived_allergens;
drop view public.recipe_substitution_options;

-- 2. Las tablas, de las que cuelgan a las que no cuelga nadie.
drop table public.dish_images;
drop table public.recipe_ingredients;
drop table public.ingredient_substitutions;
drop table public.ingredient_aliases;
drop table public.recipes;
drop table public.ingredients;
drop table public.catalog_meta;

-- 3. Comprobación final: no queda ninguna, y lo que no debía irse sigue ahí.
do $$
declare
  v_quedan text;
begin
  select string_agg(o, ', ') into v_quedan
    from unnest(array['recipes', 'recipe_ingredients', 'catalog_meta', 'dish_images', 'ingredients',
                      'ingredient_aliases', 'ingredient_substitutions',
                      'recipe_derived_allergens', 'recipe_substitution_options']) as o
   where to_regclass('public.' || o) is not null;
  if v_quedan is not null then
    raise exception '0093: siguen en la base: %', v_quedan;
  end if;
  if to_regprocedure('public.set_updated_at()') is null then
    raise exception '0093: falta set_updated_at(), que usan otras tablas';
  end if;
  if to_regtype('public.recipe_type') is null or to_regtype('public.meal_role') is null then
    raise exception '0093: faltan los enums de la 0001, que usa user_recipes';
  end if;
  raise notice '0093: 7 tablas y 2 vistas borradas; set_updated_at y los enums de la 0001 siguen';
end
$$;
