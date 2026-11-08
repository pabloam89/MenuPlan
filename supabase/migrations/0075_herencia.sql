-- 0075 · Heredar la casa al borrar la cuenta del titular (fase 5 de
-- specs/roles-de-la-casa-*.md, con la revisión: A-3, A-4, M-1, M-6).
--
-- Hasta ahora, si el titular borraba su cuenta, su casa se iba con él: menús,
-- compra y despensa, también para su pareja cotitular. Ahora, antes de borrar,
-- la casa pasa al cotitular más antiguo (prepare_account_deletion). Si solo
-- hay lectores, la casa se va como siempre (un lector no gestiona nada).
--
-- 1. `households.propia`: la casa que le nació a cada uno. La regla «una casa
--    propia por usuario» (uq_households_one_owner_per_user) impedía heredar,
--    porque el heredero ya tiene la suya; pero también era la única barrera
--    contra casas duplicadas al crear cuentas a la vez (A-3). Se queda la
--    barrera, solo para las propias: una heredada lleva propia = false.
-- 2. Las semanas y las recetas del menú siguen a su menú cuando cambia de
--    titular (ON UPDATE CASCADE).
-- 3. _transfer_household_ownership: cambia el titular, mueve las filas de la
--    casa a su nombre y, si el heredero tenía un menú con el mismo id (la PK es
--    user_id + id, y ya hay ids repetidos: A-4), renombra el SUYO, que es la
--    copia. No borra nada: su casa propia se queda (muchas tienen familia y
--    alergias aunque estén «dormidas»).
-- 4. transfer_household_ownership (el titular, en vida, a un cotitular) y
--    prepare_account_deletion (el servidor, antes de borrar en auth).
--
-- Idempotente.

-- ── 1. Una casa propia por persona; las heredadas, aparte ───────────────────
alter table public.households add column if not exists propia boolean not null default true;
comment on column public.households.propia is
  'La casa que le nació a su titular. Una heredada (0075) es false. Única por titular entre las propias.';
create unique index if not exists uq_households_una_propia on public.households (owner_user_id) where propia;
drop index if exists public.uq_households_one_owner_per_user;

-- ── 2. Semanas y recetas del menú, con su menú ──────────────────────────────
alter table public.user_menu_weeks drop constraint if exists fk_user_menu_weeks_menu;
alter table public.user_menu_weeks add constraint fk_user_menu_weeks_menu foreign key (user_id, menu_id)
  references public.user_menus (user_id, id) on delete cascade on update cascade;
alter table public.user_menu_recipes drop constraint if exists fk_user_menu_recipes_menu;
alter table public.user_menu_recipes add constraint fk_user_menu_recipes_menu foreign key (user_id, menu_id)
  references public.user_menus (user_id, id) on delete cascade on update cascade;

-- ── 3. Pasar la casa a un cotitular ─────────────────────────────────────────
create or replace function public._transfer_household_ownership(p_household_id uuid, p_new_owner uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_old uuid;
begin
  -- `for update`: las escrituras de la casa (trigger de la 0071, `for share`)
  -- esperan, y ninguna fila se queda a nombre del titular viejo (M-6).
  select owner_user_id into v_old from public.households where id = p_household_id for update;
  if v_old is null then raise exception 'Casa inexistente'; end if;
  if v_old = p_new_owner then return; end if;
  if not exists (select 1 from public.household_members
                 where household_id = p_household_id and user_id = p_new_owner and role = 'editor') then
    raise exception 'El nuevo titular tiene que ser cotitular de la casa';
  end if;

  -- Ids de menú que chocarían al pasar a su nombre: se renombra la copia del
  -- heredero (sus semanas y recetas la siguen, ON UPDATE CASCADE).
  update public.user_menus
     set id = id || '-' || left(md5(random()::text), 6)
   where user_id = p_new_owner
     and id in (select id from public.user_menus where household_id = p_household_id and user_id = v_old);

  -- Primero baja el viejo (uq_household_members_one_owner), luego sube el nuevo.
  update public.household_members set role = 'editor' where household_id = p_household_id and user_id = v_old;
  update public.household_members set role = 'owner' where household_id = p_household_id and user_id = p_new_owner;
  update public.households set owner_user_id = p_new_owner, propia = false, updated_at = now() where id = p_household_id;

  -- Las filas de la casa, a nombre del nuevo titular (semanas y recetas del
  -- menú, en cascada).
  update public.user_menus set user_id = p_new_owner where household_id = p_household_id and user_id = v_old;
  update public.user_pantry set user_id = p_new_owner where household_id = p_household_id and user_id = v_old;
end;
$$;
revoke all on function public._transfer_household_ownership(uuid, uuid) from public, anon, authenticated;

-- El titular, en vida, a un cotitular.
create or replace function public.transfer_household_ownership(p_household_id uuid, p_new_owner uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not public.is_household_owner(p_household_id) then
    raise exception 'Solo el titular puede pasar la casa' using errcode = '42501';
  end if;
  perform public._transfer_household_ownership(p_household_id, p_new_owner);
end;
$$;
revoke all on function public.transfer_household_ownership(uuid, uuid) from public, anon;
grant execute on function public.transfer_household_ownership(uuid, uuid) to authenticated, service_role;

-- ── 4. Antes de borrar una cuenta ───────────────────────────────────────────
-- Para cada casa de la que es titular: con cotitular, pasa al más antiguo y
-- se le quita a él (con sus chats privados de esa casa, y el enlace rotado);
-- sin cotitular, nada: la casa cae en cascada al borrar el usuario, y se
-- cuenta a cuántos lectores deja sin acceso. Una transacción: si falla, no se
-- borra la cuenta (los llamadores lo comprueban).
create or replace function public.prepare_account_deletion(p_user_id uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_casa record;
  v_heredero uuid;
  v_pasadas integer := 0;
  v_borradas integer := 0;
  v_lectores integer := 0;
begin
  for v_casa in select id from public.households where owner_user_id = p_user_id order by created_at loop
    select user_id into v_heredero from public.household_members
     where household_id = v_casa.id and role = 'editor'
     order by joined_at limit 1;
    if v_heredero is not null then
      perform public._transfer_household_ownership(v_casa.id, v_heredero);
      delete from public.household_members where household_id = v_casa.id and user_id = p_user_id;
      delete from public.bot_chats where household_id = v_casa.id and kind = 'private' and linked_by = p_user_id;
      perform public._cerrar_puertas(v_casa.id);
      v_pasadas := v_pasadas + 1;
    else
      v_lectores := v_lectores + (select count(*)::integer from public.household_members
                                   where household_id = v_casa.id and role = 'viewer');
      v_borradas := v_borradas + 1;
    end if;
  end loop;
  return jsonb_build_object('pasadas', v_pasadas, 'borradas', v_borradas, 'lectores', v_lectores);
end;
$$;
revoke all on function public.prepare_account_deletion(uuid) from public, anon, authenticated;
grant execute on function public.prepare_account_deletion(uuid) to service_role;
