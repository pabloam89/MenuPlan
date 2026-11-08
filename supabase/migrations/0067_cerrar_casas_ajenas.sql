-- 0067 · Cerrar la entrada a casas ajenas (fase 0 de specs/roles-de-la-casa-*.md)
--
-- Agujeros que había (comprobados el 1 oct 2026 contra producción):
--   1. Las políticas «Users manage own pantry/menus/menu weeks/menu recipes»
--      solo miraban user_id = auth.uid(), no a qué casa apunta la fila. Con el
--      household_id de otra casa (lo da preview_household_invite con el enlace),
--      un usuario podía meterle despensa, menús o semanas, y Lola los leía.
--   2. El enlace de invitación no cambiaba nunca: quitar a alguien no servía,
--      volvía a entrar con el mismo enlace.
--   3. «Owners manage households» dejaba cambiar owner_user_id por REST.
--
-- Antes de aplicar: 0 filas de casa a nombre de alguien que no es su dueño en
-- las cuatro tablas (consulta en el commit). Por eso la regla puede ser la
-- estricta: una fila con household_id va SIEMPRE a nombre del dueño de la casa.
--
-- Idempotente: se puede volver a ejecutar.

-- ── 1. Filas de una casa, a nombre de su dueño (vale para la app, el bot y SQL) ─

create or replace function public.fila_de_casa_es_del_dueno()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_dueno uuid;
begin
  if new.household_id is null then
    return new;
  end if;
  select owner_user_id into v_dueno from public.households where id = new.household_id;
  if v_dueno is null or new.user_id is distinct from v_dueno then
    raise exception 'Una fila de casa va a nombre de su dueño (tabla %, casa %)', tg_table_name, new.household_id
      using errcode = '42501';
  end if;
  return new;
end;
$function$;

revoke all on function public.fila_de_casa_es_del_dueno() from public;

drop trigger if exists fila_de_casa_es_del_dueno on public.user_pantry;
create trigger fila_de_casa_es_del_dueno before insert or update of user_id, household_id on public.user_pantry
  for each row execute function public.fila_de_casa_es_del_dueno();
drop trigger if exists fila_de_casa_es_del_dueno on public.user_menus;
create trigger fila_de_casa_es_del_dueno before insert or update of user_id, household_id on public.user_menus
  for each row execute function public.fila_de_casa_es_del_dueno();
drop trigger if exists fila_de_casa_es_del_dueno on public.user_menu_weeks;
create trigger fila_de_casa_es_del_dueno before insert or update of user_id, household_id on public.user_menu_weeks
  for each row execute function public.fila_de_casa_es_del_dueno();
drop trigger if exists fila_de_casa_es_del_dueno on public.user_menu_recipes;
create trigger fila_de_casa_es_del_dueno before insert or update of user_id, household_id on public.user_menu_recipes
  for each row execute function public.fila_de_casa_es_del_dueno();

-- ── 2. Las políticas «Users manage own …»: lo tuyo, y si es de una casa, que sea tuya ─

drop policy if exists "Users manage own pantry" on public.user_pantry;
create policy "Users manage own pantry" on public.user_pantry for all
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id and (household_id is null or public.is_household_owner(household_id)));

drop policy if exists "Users manage own menus" on public.user_menus;
create policy "Users manage own menus" on public.user_menus for all
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id and (household_id is null or public.is_household_owner(household_id)));

drop policy if exists "Users manage own menu weeks" on public.user_menu_weeks;
create policy "Users manage own menu weeks" on public.user_menu_weeks for all
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id and (household_id is null or public.is_household_owner(household_id)));

drop policy if exists "Users manage own menu recipes" on public.user_menu_recipes;
create policy "Users manage own menu recipes" on public.user_menu_recipes for all
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id and (household_id is null or public.is_household_owner(household_id)));

-- ── 3. El dueño de una casa no se cambia por REST ─────────────────────────────
-- Solo el servidor (service_role) o una función del propio esquema (la futura
-- transferencia de titularidad, SECURITY DEFINER) pueden cambiarlo.

create or replace function public.dueno_de_casa_no_cambia()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
begin
  if new.owner_user_id is distinct from old.owner_user_id
     and coalesce(auth.role(), '') <> 'service_role'
     and current_user not in ('postgres', 'supabase_admin') then
    raise exception 'El dueño de una casa no se cambia así' using errcode = '42501';
  end if;
  return new;
end;
$function$;

drop trigger if exists dueno_de_casa_no_cambia on public.households;
create trigger dueno_de_casa_no_cambia before update of owner_user_id on public.households
  for each row execute function public.dueno_de_casa_no_cambia();

-- ── 4. Quitar a alguien (o que salga) cambia el enlace de invitación ─────────

create or replace function public.remove_household_member(p_household_id uuid, p_user_id uuid)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if not public.is_household_owner(p_household_id) then
    raise exception 'Only the owner can remove members';
  end if;

  delete from public.household_members
  where household_id = p_household_id
    and user_id = p_user_id
    and role = 'viewer';

  -- Con el enlace de siempre, quien acaban de quitar volvería a entrar.
  update public.households
  set invite_token = public.gen_invite_token(), updated_at = now()
  where id = p_household_id and invite_token is not null;
end;
$function$;

create or replace function public.leave_household(p_household_id uuid)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_user_id uuid := auth.uid();
  v_own_id uuid;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  if public.is_household_owner(p_household_id) then
    raise exception 'Owners cannot leave — delete the household instead';
  end if;

  delete from public.household_members
  where household_id = p_household_id
    and user_id = v_user_id
    and role = 'viewer';

  -- Quien sale ya no tiene por qué poder volver con el enlace que tenía.
  update public.households
  set invite_token = public.gen_invite_token(), updated_at = now()
  where id = p_household_id and invite_token is not null;

  select id into v_own_id from public.households where owner_user_id = v_user_id limit 1;

  update public.user_profiles
  set active_household_id = coalesce(v_own_id, active_household_id)
  where user_id = v_user_id
    and active_household_id = p_household_id;
end;
$function$;
