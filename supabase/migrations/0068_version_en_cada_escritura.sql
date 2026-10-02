-- 0068 · La versión de la casa sube con CUALQUIER escritura, no solo con las del bot
-- (C-2 de specs/roles-de-la-casa-revision.md, fase 1b).
--
-- Qué se rompía: `household_state.bot_rev` solo lo subía `bot_save_casa`. Un
-- guardado de la app no lo movía, así que dos dispositivos de la misma casa
-- (el móvil y el portátil hoy; titular y cotitular mañana) no se veían: el
-- sondeo de la app no se enteraba, y el siguiente guardado del segundo subía
-- su blob viejo entero encima del primero. En ese blob van la familia, las
-- alergias, la salud y la compra. El último ganaba y nadie se enteraba.
--
-- Ahora `save_household_state` y `save_menu_week` (en una casa) suben la
-- versión al escribir y la devuelven; la app se apunta la suya para no
-- confundir sus propios guardados con los de otro. El nombre `bot_rev` se
-- queda: lo leen la app, el bot y `bot_deshacer`, y renombrarlo no compra nada.
--
-- Orden de candados igual que `bot_save_casa`: primero household_state,
-- después user_menu_weeks. Así una semana de la app y una escritura del bot a
-- la vez no se bloquean entre sí.
--
-- Idempotente: se puede volver a ejecutar.

create or replace function public.save_household_state(p_household_id uuid, p_state jsonb, p_bot_rev bigint)
 returns jsonb
 language plpgsql
 set search_path to 'public'
as $function$
declare
  v_rev bigint;
begin
  update household_state
     set state = p_state,
         bot_rev = bot_rev + 1,
         updated_at = now()
   where household_id = p_household_id
     and bot_rev = coalesce(p_bot_rev, bot_rev)
  returning bot_rev into v_rev;
  if found then
    return jsonb_build_object('ok', true, 'bot_rev', v_rev);
  end if;

  select bot_rev into v_rev from household_state where household_id = p_household_id;
  if found then
    return jsonb_build_object('ok', false, 'bot_rev', v_rev);
  end if;

  -- Casa sin fila todavía. Si dos la crean a la vez, la segunda choca en vez
  -- de reventar con la clave duplicada.
  insert into household_state (household_id, state, updated_at)
  values (p_household_id, p_state, now())
  on conflict (household_id) do nothing
  returning bot_rev into v_rev;
  if found then
    return jsonb_build_object('ok', true, 'bot_rev', v_rev);
  end if;
  select bot_rev into v_rev from household_state where household_id = p_household_id;
  return jsonb_build_object('ok', false, 'bot_rev', v_rev);
end;
$function$;

create or replace function public.save_menu_week(p_row jsonb, p_bot_rev bigint)
 returns jsonb
 language plpgsql
 set search_path to 'public'
as $function$
declare
  v_hh uuid := nullif(p_row->>'household_id', '')::uuid;
  v_rev bigint;
begin
  if v_hh is not null then
    -- Comprobar y subir en un solo paso: con el `select … for share` de antes,
    -- dos semanas a la vez pasaban las dos con la misma versión.
    update household_state
       set bot_rev = bot_rev + 1
     where household_id = v_hh
       and bot_rev = coalesce(p_bot_rev, bot_rev)
    returning bot_rev into v_rev;
    if not found then
      select bot_rev into v_rev from household_state where household_id = v_hh;
      if found then
        -- Otra versión, o la misma y sin permiso para escribir (la app
        -- distingue los dos casos por el número).
        return jsonb_build_object('ok', false, 'bot_rev', v_rev);
      end if;
      -- Casa sin fila de estado: la semana se guarda sin versión, como antes.
    end if;
  end if;

  insert into user_menu_weeks (
    user_id, household_id, menu_id, week_start, week_end, week_offset,
    start_day_idx, active_days, plan, shopping, schedule
  ) values (
    (p_row->>'user_id')::uuid,
    v_hh,
    p_row->>'menu_id',
    (p_row->>'week_start')::date,
    (p_row->>'week_end')::date,
    (p_row->>'week_offset')::smallint,
    coalesce((p_row->>'start_day_idx')::smallint, 0),
    case when jsonb_typeof(p_row->'active_days') = 'array'
         then array(select jsonb_array_elements_text(p_row->'active_days')) end,
    coalesce(p_row->'plan', '{}'::jsonb),
    coalesce(p_row->'shopping', '{"items": []}'::jsonb),
    coalesce(p_row->'schedule', '{}'::jsonb)
  )
  on conflict (user_id, menu_id, week_start) do update set
    household_id  = excluded.household_id,
    week_end      = excluded.week_end,
    week_offset   = excluded.week_offset,
    start_day_idx = excluded.start_day_idx,
    active_days   = excluded.active_days,
    plan          = excluded.plan,
    shopping      = excluded.shopping,
    schedule      = excluded.schedule;

  return jsonb_build_object('ok', true, 'bot_rev', coalesce(v_rev, p_bot_rev));
end;
$function$;

-- `create or replace` conserva los permisos, pero por si alguien la pega en
-- una base sin la 0057: solo usuarios con sesión (y el servidor).
revoke all on function public.save_household_state(uuid, jsonb, bigint) from public, anon;
revoke all on function public.save_menu_week(jsonb, bigint) from public, anon;
grant execute on function public.save_household_state(uuid, jsonb, bigint) to authenticated, service_role;
grant execute on function public.save_menu_week(jsonb, bigint) to authenticated, service_role;
