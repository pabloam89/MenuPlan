-- 0069 · El bot activa un menú y guarda la casa en UNA transacción.
--
-- generarMenu y deshacer cambiaban el menú activo con dos PATCH sueltos
-- (desactivar todos, activar uno) y DESPUÉS guardaban la casa con bot_save_casa.
-- Si ese guardado chocaba, quedaba activo un menú que la casa no conocía; y dos
-- generaciones a la vez chocaban en uq_household_menus_one_active y una de las
-- dos se quedaba huérfana con «algo ha fallado».
--
-- Ahora es lo mismo que bot_save_casa (comprueba la versión que el bot leyó,
-- escribe la casa y/o la semana, sube bot_rev) y, en la misma transacción,
-- deja activo p_menu_id. O entra todo o no entra nada, y quien llama relee y
-- repite como con cualquier choque.

create or replace function public.bot_save_casa_activando(
  p_household_id uuid,
  p_base_rev bigint,
  p_state jsonb,
  p_week jsonb,
  p_menu_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rev bigint;
begin
  select bot_rev into v_rev from household_state where household_id = p_household_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'sin casa en la nube');
  end if;
  if v_rev <> p_base_rev then
    return jsonb_build_object('ok', false, 'bot_rev', v_rev);
  end if;
  if not exists (select 1 from user_menus where household_id = p_household_id and id = p_menu_id) then
    return jsonb_build_object('ok', false, 'error', 'menú no encontrado');
  end if;

  update user_menus set is_active = false where household_id = p_household_id and is_active and id <> p_menu_id;
  update user_menus set is_active = true where household_id = p_household_id and id = p_menu_id;

  update household_state
     set state = coalesce(p_state, state),
         bot_rev = bot_rev + 1,
         updated_at = now()
   where household_id = p_household_id
  returning bot_rev into v_rev;

  if p_week is not null then
    update user_menu_weeks
       set plan = coalesce(p_week->'plan', plan),
           shopping = coalesce(p_week->'shopping', shopping)
     where household_id = p_household_id
       and menu_id = p_week->>'menu_id'
       and week_start = (p_week->>'week_start')::date;
  end if;

  return jsonb_build_object('ok', true, 'bot_rev', v_rev);
end;
$$;

revoke execute on function public.bot_save_casa_activando(uuid, bigint, jsonb, jsonb, text) from public, anon, authenticated;
grant execute on function public.bot_save_casa_activando(uuid, bigint, jsonb, jsonb, text) to service_role;
