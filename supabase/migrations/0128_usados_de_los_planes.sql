-- «Veces en un menú» cuenta los platos de los menús, no las copias de las recetas (#1246, paso 5).
-- AUDITADA: auditor-datos 2026-11-04 OK
--   (un agente independiente, que no la escribió, leyendo producción en solo lectura, en dos pasadas; en la primera pidió
--   lock_timeout, pg_temp, revoke y grant, y el testigo en ESTADO: hecho). Sobre 351 semanas y 5370 huecos: planes todos
--   objeto, recipeId solo texto o null, 0 huecos `cleared` con receta, 0 semanas huérfanas, prefijo de un solo nivel;
--   permisos revisados contra el ACL vivo (sin ejecutar). Con 60 recetas, 31-50 ms con `materialized` (EXPLAIN ANALYZE,
--   un pico de 713 ms sin explicar) y 835-856 ms sin él. Sin verificar por la auditoría, por el cupo de 1Password: los
--   totales 4436→4265 y 107/184/22/17 y los 280 ms de la 0028 (cifras del autor).
--
-- recipe_social_stats contaba filas de user_menu_recipes, que son copias: un plato contaba una vez por grupo del
-- mismo menú, y seguía contando después de cambiarlo por otro. Para dejar de escribir esas copias, el contador tiene
-- que salir de lo que el menú lleva de verdad: los huecos del plan (recipeId y firstRecipeId). Ahora `used` es en
-- cuántos menús está el plato.
--
-- Medido el 4 nov 2026 en producción (351 semanas, 3248 kB): de 4436 a 4265 en total; 107 recetas suben y 184 bajan,
-- 22 solo están en los planes y 17 solo en las copias.
--
-- Mismas columnas y mismo permiso que la 0028 (anon y authenticated): el revoke y el grant
-- de abajo dejan lo que había. El `search_path` gana `pg_temp` (PRINCIPIOS, funciones security definer).
-- Sigue siendo security definer (cuenta los menús de todas las casas, y devuelve solo la cifra), así que se aplica con
-- `--si --pablo`. El código no depende de ella: la app lee las mismas columnas antes y después.

set lock_timeout = '5s';

create or replace function public.recipe_social_stats(p_ids text[])
returns table (recipe_id text, likes bigint, dislikes bigint, used bigint, comments bigint)
language sql
security definer
stable
set search_path = public, pg_temp
-- Como en la 0028: alias t(rid), siempre cualificado. El plan es un documento: lo que no sea objeto se salta en vez de
-- romper el contador entero. Las claves con «_» no son grupos (`_warnings`). `materialized` es a propósito: sin él,
-- Postgres mete `veces` dentro de cada receta y recorre todos los planes una vez por receta. Medido con 60 recetas: sin
-- él, 750-850 ms; con él, 20-50 ms; la versión de la 0028, 280 ms.
as $$
  with usados as (
    select w.user_id, w.menu_id, regexp_replace(h.value ->> k.campo, '^.*__', '') as rid
    from public.user_menu_weeks w
    cross join lateral jsonb_each(case when jsonb_typeof(w.plan) = 'object' then w.plan else '{}'::jsonb end) g
    cross join lateral jsonb_each(case when jsonb_typeof(g.value) = 'object' then g.value else '{}'::jsonb end) h
    cross join lateral (values ('recipeId'), ('firstRecipeId')) k(campo)
    where left(g.key, 1) <> '_'
      and jsonb_typeof(h.value) = 'object'
      and coalesce(h.value ->> k.campo, '') <> ''
  ),
  veces as materialized (
    select u.rid, count(distinct (u.user_id, u.menu_id)) as n
    from usados u
    where u.rid = any(p_ids)
    group by u.rid
  )
  select
    t.rid as recipe_id,
    (select count(*) from public.recipe_votes v
       where v.recipe_id = t.rid and v.vote = 'up'),
    (select count(*) from public.recipe_votes v
       where v.recipe_id = t.rid and v.vote = 'down'),
    coalesce((select x.n from veces x where x.rid = t.rid), 0),
    (select count(*) from public.social_comments c
       where c.target_type = 'recipe' and c.target_id = t.rid)
  from unnest(p_ids) as t(rid);
$$;

revoke all on function public.recipe_social_stats(text[]) from public, anon, authenticated;
grant execute on function public.recipe_social_stats(text[]) to anon, authenticated;
