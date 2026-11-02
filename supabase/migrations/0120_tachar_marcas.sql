-- El lector tacha también en una compra guardada como marcas (plan fichas con estado, trozo 18; #1037).
--
-- Desde el trozo 18, la compra de una semana puede guardarse como marcas de la familia sobre la lista que sale del
-- menú (`{ marcas: [{ id, nombre, unidad, marcas: [...] }] }`, src/lib/compraMarcas.js), y no como la lista entera
-- (`{ items: [...] }`). household_shopping_mark (0072, 0087), lo único que puede escribir quien solo lee la casa,
-- solo sabía tachar en `items`: en una semana con marcas no tachaba nada.
--
--   · _marcar_compra (nueva, sin permisos para nadie, como _marcar_items): con marcas, pone o quita la marca
--     'comprado' del artículo por su `id` (que manda la app desde ahora, src/lib/tacharLector.js); si el artículo no
--     tenía marcas, lo añade solo con 'comprado'; si se queda sin ninguna, lo quita. Con la lista entera, lo de
--     siempre (_marcar_items, por nombre y unidad).
--   · household_shopping_mark, copiada entera de la 0087: solo cambia que la semana y la copia viva de la casa pasan
--     por _marcar_compra. Mismos permisos, escritos enteros.
--
-- 'comprado' es MARCA_COMPRA.COMPRADO (src/lib/vocabularios.js); supabase/tacharMarcas.test.js compara las dos.
-- NO hace: no toca la forma de ninguna compra guardada (sin repoblar), ni RLS, ni tablas, ni otras funciones.
-- Plan B (regla migraciones): sin esta, en una semana con marcas el tachado del lector no se guarda (la función
-- vieja escribe `items` al lado de `marcas` y nadie lo lee); en una con la lista entera, igual que hoy.
-- Testigo: la función public._marcar_compra(jsonb, jsonb).

set lock_timeout = '5s';

-- ── 1. Tachar en una compra, tenga la forma que tenga ─────────────────────
create or replace function public._marcar_compra(p_compra jsonb, p_marcas jsonb)
returns jsonb
language plpgsql immutable set search_path = public, pg_temp as $$
declare
  v_lista jsonb;
  v_marca jsonb;
  v_entrada jsonb;
  v_suyas jsonb;
  v_pos integer;
  v_id text;
  v_have boolean;
begin
  -- La lista entera (antes del trozo 18): lo de siempre, por nombre y unidad.
  -- Un null de JSON o algo que no es un objeto se trata como una compra vacía: jsonb_set fallaría sobre él.
  if jsonb_typeof(p_compra->'marcas') is distinct from 'array' then
    return jsonb_set(case when jsonb_typeof(p_compra) = 'object' then p_compra else '{}'::jsonb end,
                     '{items}', public._marcar_items(p_compra->'items', p_marcas), true);
  end if;

  v_lista := p_compra->'marcas';
  for v_marca in select x from jsonb_array_elements(p_marcas) as t(x) loop
    v_id := v_marca->>'id';
    v_have := (v_marca->>'have')::boolean;
    continue when v_id is null or v_have is null;

    v_entrada := null;
    v_pos := null;
    select e.x, e.ord::integer - 1 into v_entrada, v_pos
      from jsonb_array_elements(v_lista) with ordinality as e(x, ord)
     where e.x->>'id' = v_id
     limit 1;

    if v_entrada is null then
      -- Sin marcas aún: solo hace falta apuntarlo si se tacha.
      continue when not v_have;
      v_lista := v_lista || jsonb_build_array(jsonb_build_object(
        'id', v_id, 'nombre', v_marca->>'name', 'unidad', coalesce(v_marca->>'unit', ''),
        'marcas', jsonb_build_array('comprado')));
    else
      v_suyas := coalesce(v_entrada->'marcas', '[]'::jsonb) - 'comprado';
      if v_have then v_suyas := v_suyas || jsonb_build_array('comprado'); end if;
      if jsonb_array_length(v_suyas) = 0 then
        v_lista := v_lista - v_pos;
      else
        v_lista := jsonb_set(v_lista, array[v_pos::text], jsonb_set(v_entrada, '{marcas}', v_suyas));
      end if;
    end if;
  end loop;
  return jsonb_set(p_compra, '{marcas}', v_lista);
end;
$$;
revoke all on function public._marcar_compra(jsonb, jsonb) from public, anon, authenticated;

-- ── 2. El lector tacha: la semana y la copia viva, por _marcar_compra ──────
create or replace function public.household_shopping_mark(
  p_household_id uuid, p_menu_id text, p_week_start date, p_marcas jsonb)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_rev bigint;
  v_offset smallint;
  v_state jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not public.is_household_member(p_household_id) then
    raise exception 'No eres de esta casa' using errcode = '42501';
  end if;
  if jsonb_typeof(p_marcas) <> 'array' or jsonb_array_length(p_marcas) = 0 then
    return jsonb_build_object('ok', false, 'error', 'nada que tachar');
  end if;
  if jsonb_array_length(p_marcas) > 300 then
    raise exception 'Demasiados artículos de una vez';
  end if;

  -- Mismo orden de candados que bot_save_casa y save_menu_week (0068).
  select bot_rev, state into v_rev, v_state from public.household_state
   where household_id = p_household_id for update;

  update public.user_menu_weeks w
     set shopping = public._marcar_compra(w.shopping, p_marcas)
   where w.household_id = p_household_id and w.menu_id = p_menu_id and w.week_start = p_week_start
  returning w.week_offset into v_offset;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'semana no encontrada');
  end if;

  -- La copia viva de la casa, si es esa semana del menú activo. El activo lo
  -- dice user_menus.is_active, no la caché data.activeMenuId del JSON (0087).
  if v_state is not null
     and exists (select 1 from public.user_menus m
                  where m.household_id = p_household_id and m.id = p_menu_id and m.is_active)
     and (v_state->'data'->'menuWeek'->>'offset')::int is not distinct from v_offset::int
     -- Como la 0087: si la casa no guarda copia viva de la compra, no se le crea.
     and jsonb_typeof(v_state->'shopping') = 'object' then
    v_state := jsonb_set(v_state, '{shopping}', public._marcar_compra(v_state->'shopping', p_marcas), true);
  end if;

  update public.household_state
     set state = coalesce(v_state, state), bot_rev = bot_rev + 1, updated_at = now()
   where household_id = p_household_id
  returning bot_rev into v_rev;

  return jsonb_build_object('ok', true, 'bot_rev', v_rev);
end;
$$;
revoke all on function public.household_shopping_mark(uuid, text, date, jsonb) from public, anon, authenticated;
grant execute on function public.household_shopping_mark(uuid, text, date, jsonb) to authenticated, service_role;
