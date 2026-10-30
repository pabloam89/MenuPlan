-- 0104 · Los miembros de una casa leen las recetas propias de su titular (#958).
-- AUDITADA: auditor-datos 2026-10-29 OK
--
-- Qué hace. Una política de SOLO LECTURA en `user_recipes`: quien es miembro de
-- una casa (`household_members`, cualquier papel: owner, editor o viewer) puede
-- leer las recetas del titular de esa casa (`households.owner_user_id`), también
-- las privadas. Nada más: ni escribir, ni editar, ni borrar (eso sigue siendo
-- solo del dueño, «Owner manages own recipes» de la 0003/0011).
--
-- Por qué. Decidido por Pablo el 29 oct 2026: todos los miembros de una casa ven
-- las recetas privadas del titular, también «quien solo mira». Con la 0103 y el
-- #1011 ya no queda ninguna receta publicada, y la app del lector lee las del
-- titular (`loadUserRecipes(menuUserId)`, src/App.jsx, con `owner_id = titular`):
-- sin esta política, la RLS solo le dejaba ver las publicadas, es decir ninguna.
--
-- Cómo. La pregunta «¿comparto casa con este titular?» va en una función
-- `security definer` (`comparte_casa_con_titular`), como `is_household_member`
-- de la 0017: así la política no depende de la RLS de `households` ni de
-- `household_members` y no hay recursión. La política es `to authenticated`:
-- `anon` no la evalúa nunca (y la función devolvería false sin `auth.uid()`).
-- La función: `execute` solo para `authenticated` (la 0096 no toca funciones, por
-- eso se revoca aquí a mano de public y anon).
--
-- Quién NO gana nada. Quien no es miembro de ninguna casa del titular: la función
-- exige una fila suya en `household_members` de una casa cuyo `owner_user_id` es
-- el dueño de la receta. Las recetas de un cotitular (editor) no entran: la
-- decisión es sobre las del titular. Las invitaciones pendientes no cuentan (no
-- son fila de `household_members`).
--
-- Quién lo aprovecha hoy. El lector (viewer) en la app, sin cambiar código:
-- ya pide las del titular. El cotitular (editor) no: la app le carga solo las
-- suyas (`user.id`), y meter las del titular en su recetario haría que se
-- intentaran subir a su nombre; queda para un PR de código aparte. Lola enseña
-- a toda la casa las del titular y las de los editores (service role,
-- api/_bot/propias.js): más amplia que esta política, a propósito.
--
-- Plan B del código. Sin la migración todo sigue como hoy: el lector carga las
-- del titular y la RLS le devuelve las publicadas (ninguna tras la 0103). La app
-- no cambia: ya pide las del titular cuando eres lector. Lola lee con service
-- role (api/_bot/propias.js) y no pasa por la RLS.
--
-- Toca RLS de una tabla que ya existía y crea una `security definer`: la lanza
-- Pablo con `--pablo`.
--
-- Autoprueba al final, en un subbloque que se deshace siempre: con una casa real
-- que tenga un miembro que no es el titular, se mete una receta privada de prueba
-- del titular y se comprueba, con los roles de verdad, que el miembro la lee y no
-- la puede cambiar ni borrar, que alguien de fuera no la ve y que anon no la ve.
--
-- Objeto testigo: la función `public.comparte_casa_con_titular(uuid)` y la
-- política «Household members read the titular's recipes» en `user_recipes`.
-- SIN APLICAR.

set lock_timeout = '5s';

-- ── 1. ¿Comparto casa con este titular? ──────────────────────────────────

create function public.comparte_casa_con_titular(p_titular uuid)
 returns boolean
 language sql
 stable
 security definer
 set search_path = public, pg_temp
as $function$
  select exists (
    select 1
      from public.households h
      join public.household_members hm on hm.household_id = h.id
     where h.owner_user_id = p_titular
       and hm.user_id = (select auth.uid())
  );
$function$;

comment on function public.comparte_casa_con_titular(uuid) is
  'true si quien llama es miembro (cualquier papel) de alguna casa cuyo titular es p_titular (0104, #958). '
  'La usa la política «Household members read the titular''s recipes» de user_recipes.';

revoke all on function public.comparte_casa_con_titular(uuid) from public, anon, authenticated;
grant execute on function public.comparte_casa_con_titular(uuid) to authenticated;

-- ── 2. La política: solo select, solo authenticated ──────────────────────

create policy "Household members read the titular's recipes"
  on public.user_recipes for select
  to authenticated
  using (public.comparte_casa_con_titular(owner_id));

-- ── 3. Autoprueba (se deshace siempre) ───────────────────────────────────

do $$
declare
  v_titular uuid;
  v_miembro uuid;
  v_fuera uuid := '00000000-0000-4000-8000-000000000104';
  v_id constant text := 'user_autoprueba-0104';
  v_n integer;
begin
  select h.owner_user_id, hm.user_id into v_titular, v_miembro
    from public.households h
    join public.household_members hm on hm.household_id = h.id
   where hm.user_id <> h.owner_user_id
   limit 1;
  if v_titular is null then
    raise notice '0104 autoprueba: no hay ninguna casa con un miembro que no sea el titular, no se prueba';
    return;
  end if;
  begin
    -- Como postgres: la receta privada de prueba, a nombre del titular.
    insert into public.user_recipes (id, owner_id, name, category, type, visibility)
    values (v_id, v_titular, 'Autoprueba 0104', 'huevos', 'completo', 'private');

    -- El miembro, con su rol y su RLS.
    perform set_config('request.jwt.claims', json_build_object('sub', v_miembro, 'role', 'authenticated')::text, true);
    perform set_config('role', 'authenticated', true);
    if current_user <> 'authenticated' then
      raise exception '0104 autoprueba: no se pudo pasar a authenticated';
    end if;
    if not exists (select 1 from public.user_recipes where id = v_id) then
      raise exception '0104 autoprueba: el miembro no lee la receta privada del titular';
    end if;
    update public.user_recipes set name = 'Cambiada por el miembro' where id = v_id;
    get diagnostics v_n = row_count;
    if v_n <> 0 then
      raise exception '0104 autoprueba: el miembro ha podido cambiar la receta del titular';
    end if;
    delete from public.user_recipes where id = v_id;
    get diagnostics v_n = row_count;
    if v_n <> 0 then
      raise exception '0104 autoprueba: el miembro ha podido borrar la receta del titular';
    end if;
    -- Tampoco puede crear una a nombre del titular: el with check de «Owner
    -- manages own recipes» la rechaza (42501).
    begin
      insert into public.user_recipes (id, owner_id, name, category, type)
      values ('user_autoprueba-0104-b', v_titular, 'Autoprueba 0104 b', 'huevos', 'completo');
      raise exception '0104 autoprueba: el miembro ha podido crear una receta a nombre del titular';
    exception when insufficient_privilege then
      raise notice '0104 autoprueba: el miembro no puede crear a nombre del titular';
    end;

    -- Alguien con cuenta que no es de la casa (un id que no existe en ninguna).
    perform set_config('request.jwt.claims', json_build_object('sub', v_fuera, 'role', 'authenticated')::text, true);
    if exists (select 1 from public.user_recipes where id = v_id) then
      raise exception '0104 autoprueba: alguien de fuera de la casa lee la receta privada';
    end if;

    -- Sin cuenta.
    perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
    perform set_config('role', 'anon', true);
    if current_user <> 'anon' then
      raise exception '0104 autoprueba: no se pudo pasar a anon';
    end if;
    -- Si anon no tuviera ni el permiso de select en la tabla, mejor aún: tampoco ve.
    begin
      if exists (select 1 from public.user_recipes where id = v_id) then
        raise exception '0104 autoprueba: anon lee la receta privada';
      end if;
    exception when insufficient_privilege then
      raise notice '0104 autoprueba: anon no tiene select en user_recipes';
    end;

    -- Todo bien: se deshace el subbloque (la receta, los roles) con un código propio.
    raise exception 'autoprueba 0104 bien' using errcode = 'MP958';
  exception when sqlstate 'MP958' then
    raise notice '0104 autoprueba: el miembro lee y no escribe; fuera y anon no ven nada (deshecho)';
  end;
end $$;
