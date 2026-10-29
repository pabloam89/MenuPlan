-- 0103 · Las recetas de familias que estaban publicadas pasan a privadas (#958).
-- AUDITADA: auditor-datos 2026-10-29 OK
--
-- Qué hace. Pone `visibility = 'private'` en las 8 filas de `user_recipes` que hoy
-- no son privadas: 7 en 'public' y 1 en 'friends'. Las dos cuentan como publicadas
-- para la RLS de la 0046 (`visibility <> 'private'`): la 'public' la lee cualquiera
-- si la cuenta del autor es abierta, y las dos, sus conexiones aceptadas. Ninguna
-- otra fila ni columna cambia.
--
-- Por qué. Decidido por Pablo el 29 oct 2026: las recetas de las familias que ahora
-- son públicas pasan a privadas, «y que las vea cada uno». Gente está apagada
-- (`GENTE_ACTIVA = !FRONTAL_BOT`, src/lib/frontalBot.js): nadie publica ya a
-- propósito, y lo publicado se leía sin cuenta en un sitio que no se ve. El PR #1011
-- ya hizo que Lola guarde siempre en privado, como la app (`saveRecipe`); esto
-- limpia las que quedaron de antes.
--
-- Quién las sigue viendo. Su autor, en la app y en Lola, igual que antes:
--   - App: `loadUserRecipes` (src/lib/userRecipesSync.js) lee `owner_id = yo`, y
--     la política «Owner manages own recipes» (0003/0011) deja pasar todas las del
--     dueño, sin mirar `visibility`.
--   - Lola: `recetasPropiasDeCasa` (api/_bot/propias.js) lee con service role las
--     de los que llevan la casa; no pasa por la RLS.
--   Ninguna es de quien lleva una casa con más miembros (owner/editor; consulta de
--   abajo, 0). 2 son de quien además solo mira (viewer) en una casa ajena; ahí la
--   app lee las del titular y Lola las de owner/editor: no cambia nada. Ninguna
--   tiene enlace de compartir (`recipe_share_links`: 0) ni cocinados (`cookings`: 0).
--
-- Quién deja de verlas (lo que pide la decisión, «que las vea cada uno»), medido
-- el 29 oct 2026:
--   - 4 copias que otras personas hicieron («guardar en mi recetario»): son filas
--     enteras suyas y siguen funcionando; solo el enlace al original deja de abrir.
--   - 1 favorita (`household_favorites`) en la casa de otra familia y 2 votos
--     (`recipe_votes`) de otras personas: quedan apuntando a una receta que ya no
--     ven. No se borran: son suyos, y si el autor la vuelve a publicar, vuelven.
--   - Los recuentos de recetas del perfil público (0037) bajan.
--
-- Qué NO toca. Ni la RLS ni los permisos ni el enum `recipe_visibility`. Tampoco
-- `shared_menus` ni `cookings`.
--
-- Plan B del código. Nada depende de esta migración: la app y Lola leen las
-- recetas propias igual sean privadas o publicadas; lo único que cambia es quién
-- de fuera las puede leer.
--
-- Consultas previas (29 oct 2026, solo lectura):
--   select visibility, count(*) from public.user_recipes group by 1;
--     -- public 7, friends 1, private 6
--   select count(*) from public.user_recipes r
--    where r.visibility <> 'private'
--      and exists (select 1 from public.household_members m
--                    join public.households h on h.id = m.household_id
--                   where h.owner_user_id = r.owner_id and m.user_id <> r.owner_id);
--     -- 0
--   Las otras cifras de arriba (auditor-datos, 29 oct 2026), con `r` = las publicadas:
--   select count(distinct r.id) from public.user_recipes r
--     join public.household_members m on m.user_id = r.owner_id and m.role = 'viewer'
--    where r.visibility <> 'private';                                   -- 2
--   select count(*) from public.recipe_share_links l join public.user_recipes r
--     on r.id = l.recipe_id where r.visibility <> 'private';            -- 0
--   select count(*) from public.cookings c join public.user_recipes r
--     on r.id = c.recipe_id where r.visibility <> 'private';            -- 0
--   select count(*) from public.user_recipes c join public.user_recipes r
--     on r.id = c.copied_from_recipe_id
--    where r.visibility <> 'private' and c.owner_id <> r.owner_id;      -- 4
--   select count(*) from public.household_favorites f join public.user_recipes r
--     on r.id = f.recipe_id join public.households h on h.id = f.household_id
--    where r.visibility <> 'private' and h.owner_user_id <> r.owner_id; -- 1
--   select count(*) from public.recipe_votes v join public.user_recipes r
--     on r.id = v.recipe_id
--    where r.visibility <> 'private' and v.user_id <> r.owner_id;       -- 2
--
-- set lock_timeout = '5s': si una fila de user_recipes está bloqueada (alguien
-- guardando su receta), la migración falla y se reintenta, en vez de dejar en
-- cola las escrituras de la app y de Lola detrás de ella.
--
-- Idempotente: la segunda vez no encuentra ninguna publicada en la lista y no
-- cambia nada. Aborta si aparece una publicada que no está en la lista (alguien
-- publicó después de contar: hay que volver a mirar) o si de la lista quedan
-- publicadas un número que no es ni 8 ni 0 (cambió algo desde la consulta).
--
-- Objeto testigo: ninguno (solo cambia datos). Se comprueba a mano:
--   select count(*) from public.user_recipes where visibility <> 'private';  -- 0
-- SIN APLICAR.

set lock_timeout = '5s';

do $$
declare
  v_lista text[] := array[
    'user_718plsvy', 'user_05u53261', 'user_05nu1mqp', 'user_wk2elvx4',
    'user_4mv8l5bv', 'user_j86cqu8k', 'user_12lijajr', 'user_7pt7i5zo'
  ];
  v_en_lista bigint;
  v_fuera bigint;
  v_cambiadas bigint;
  v_quedan bigint;
begin
  select count(*) into v_en_lista
    from public.user_recipes
   where id = any(v_lista) and visibility <> 'private';
  select count(*) into v_fuera
    from public.user_recipes
   where not (id = any(v_lista)) and visibility <> 'private';
  raise notice '0103: publicadas de la lista: %; publicadas fuera de la lista: %', v_en_lista, v_fuera;

  if v_fuera <> 0 then
    raise exception '0103: hay % recetas publicadas que no están en la lista; vuelve a contar antes de aplicar', v_fuera;
  end if;
  if v_en_lista not in (0, 8) then
    raise exception '0103: de la lista quedan % publicadas (se esperaban 8, o 0 si ya se aplicó); vuelve a contar', v_en_lista;
  end if;

  update public.user_recipes
     set visibility = 'private'
   where id = any(v_lista) and visibility <> 'private';
  get diagnostics v_cambiadas = row_count;

  select count(*) into v_quedan from public.user_recipes where visibility <> 'private';
  if v_quedan <> 0 then
    raise exception '0103: siguen % recetas publicadas tras el cambio', v_quedan;
  end if;
  raise notice '0103: % recetas pasan a privadas; no queda ninguna publicada', v_cambiadas;
end
$$;
