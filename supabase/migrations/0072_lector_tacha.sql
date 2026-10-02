-- 0072 · El lector tacha la compra (fase 6 de specs/roles-de-la-casa-*.md).
--
-- Es su trabajo: la asistenta va al súper con la lista, y si no puede tachar
-- en el pasillo la lista no le sirve, y en casa no se sabe qué se compró.
--
-- No se le abre la RLS de household_state ni de user_menu_weeks (podría subir
-- la casa entera). Una RPC estrecha: solo cambia `have` de artículos que ya
-- existen, buscados por nombre y unidad. No añade, no borra, no toca
-- cantidades. Vale para cualquier miembro (titular y cotitular también).
--
-- Sube la versión de la casa (bot_rev), como cualquier escritura (0068): la
-- app abierta de otro recarga en vez de pisarlo. La app junta los tachados de
-- un rato en una sola llamada (M-2 de la revisión).
--
-- Idempotente.

create or replace function public._marcar_items(p_items jsonb, p_marcas jsonb)
returns jsonb
language sql immutable set search_path = public as $$
  select coalesce(jsonb_agg(
           case when m.have is null then it else jsonb_set(it, '{have}', to_jsonb(m.have)) end
           order by e.ord), '[]'::jsonb)
  from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) with ordinality as e(it, ord)
  left join lateral (
    select (x->>'have')::boolean as have
    from jsonb_array_elements(p_marcas) x
    where x->>'name' = e.it->>'name'
      and coalesce(x->>'unit', 'ud') = coalesce(e.it->>'unit', 'ud')
    limit 1
  ) m on true;
$$;
revoke all on function public._marcar_items(jsonb, jsonb) from public, anon, authenticated;

create or replace function public.household_shopping_mark(
  p_household_id uuid, p_menu_id text, p_week_start date, p_marcas jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
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
     set shopping = jsonb_set(coalesce(w.shopping, '{}'::jsonb), '{items}',
                              public._marcar_items(w.shopping->'items', p_marcas))
   where w.household_id = p_household_id and w.menu_id = p_menu_id and w.week_start = p_week_start
  returning w.week_offset into v_offset;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'semana no encontrada');
  end if;

  -- La copia viva de la casa, si es esa semana del menú activo.
  if v_state is not null
     and v_state->'data'->>'activeMenuId' = p_menu_id
     and (v_state->'data'->'menuWeek'->>'offset')::int is not distinct from v_offset::int then
    v_state := jsonb_set(v_state, '{shopping,items}', public._marcar_items(v_state->'shopping'->'items', p_marcas), true);
  end if;

  update public.household_state
     set state = coalesce(v_state, state), bot_rev = bot_rev + 1, updated_at = now()
   where household_id = p_household_id
  returning bot_rev into v_rev;

  return jsonb_build_object('ok', true, 'bot_rev', v_rev);
end;
$$;

revoke all on function public.household_shopping_mark(uuid, text, date, jsonb) from public, anon;
grant execute on function public.household_shopping_mark(uuid, text, date, jsonb) to authenticated, service_role;
