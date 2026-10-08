-- 0087 · El menú activo y la casa propia, cada uno con un solo dueño.
--
-- 1. household_shopping_mark (0072) decidía si tocar la copia viva de la
--    compra mirando state.data.activeMenuId, que es una caché del JSON. Manda
--    user_menus.is_active (src/lib/menuActivo.js): se mira la tabla.
-- 2. ensure_user_household (0071), _unirse (0073) y _despedir (0071) elegían
--    «la casa propia» por created_at. Tras heredar (0075) el heredero tiene
--    dos, y la heredada suele ser la más antigua: elegían esa. Ahora,
--    `order by propia desc, created_at`. Y ensure_user_household devuelve
--    'propia', que la app usa en casaPropia() (src/lib/householdsSync.js).
--
-- Cada función, copiada entera de su última versión; solo cambia lo dicho y
-- el search_path, que pasa a `public, pg_temp` (principios, desde la 0087).
-- Los permisos, los mismos que tenían, escritos enteros.
--
-- Idempotente. SIN APLICAR.

set lock_timeout = '5s';

-- Precondición: households.propia (0075). Sin ella, el `order by propia` de
-- abajo no compilaría a medias: mejor parar aquí con un mensaje claro.
do $$
begin
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'households' and column_name = 'propia'
  ) then
    raise exception '0087 necesita households.propia (0075): aplica antes la 0075';
  end if;
end;
$$;

-- ── 1. El lector tacha: el menú activo de la tabla ──────────────────────────
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
     set shopping = jsonb_set(coalesce(w.shopping, '{}'::jsonb), '{items}',
                              public._marcar_items(w.shopping->'items', p_marcas))
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
revoke all on function public.household_shopping_mark(uuid, text, date, jsonb) from public, anon, authenticated;
grant execute on function public.household_shopping_mark(uuid, text, date, jsonb) to authenticated, service_role;

-- ── 2. La casa propia es la que le nació ────────────────────────────────────
create or replace function public.ensure_user_household()
 returns jsonb
 language plpgsql
 security definer
 set search_path = public, pg_temp
as $function$
declare
  v_user_id uuid := auth.uid();
  v_household_id uuid;
  v_household record;
  v_memberships jsonb;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  insert into public.user_profiles (user_id)
  values (v_user_id)
  on conflict (user_id) do nothing;

  select id into v_household_id
  from public.households
  where owner_user_id = v_user_id
  order by propia desc, created_at
  limit 1;

  if v_household_id is null then
    insert into public.households (name, owner_user_id, setup_status, invite_token)
    values ('Mi casa', v_user_id, 'dormant', public.gen_invite_token())
    returning id into v_household_id;

    insert into public.household_members (household_id, user_id, role)
    values (v_household_id, v_user_id, 'owner');
  end if;

  if not exists (select 1 from public.household_state where household_id = v_household_id) then
    begin
      insert into public.household_state (household_id, state, updated_at)
      select v_household_id, coalesce(us.state, '{}'::jsonb), coalesce(us.updated_at, now())
      from public.user_state us
      where us.user_id = v_user_id
      on conflict (household_id) do nothing;

      insert into public.household_state (household_id)
      values (v_household_id)
      on conflict (household_id) do nothing;

      update public.households
      set setup_status = 'active',
          invite_token = coalesce(invite_token, public.gen_invite_token()),
          updated_at = now()
      where id = v_household_id
        and setup_status = 'dormant'
        and exists (
          select 1 from public.user_state us
          where us.user_id = v_user_id
            and (us.state->'data'->'members') is not null
            and jsonb_array_length(us.state->'data'->'members') > 0
        );

      update public.user_pantry
      set household_id = v_household_id
      where user_id = v_user_id and household_id is null;

      update public.user_menus
      set household_id = v_household_id
      where user_id = v_user_id and household_id is null;

      update public.user_menu_weeks
      set household_id = v_household_id
      where user_id = v_user_id and household_id is null;

      update public.user_menu_recipes
      set household_id = v_household_id
      where user_id = v_user_id and household_id is null;

      insert into public.household_favorites (household_id, recipe_id, scope)
      select
        v_household_id,
        rv.recipe_id,
        case
          when rv.scope is null then null
          when array_length(rv.scope, 1) is null then null
          else array_to_string(rv.scope, ',')
        end
      from public.recipe_votes rv
      where rv.user_id = v_user_id
        and rv.is_favorite = true
      on conflict (household_id, recipe_id) do nothing;

      insert into public.household_recipe_discards (household_id, recipe_id, is_permanent, cooldown_until)
      select v_household_id, urd.recipe_id, urd.is_permanent, urd.cooldown_until
      from public.user_recipe_discards urd
      where urd.user_id = v_user_id
      on conflict (household_id, recipe_id) do nothing;
    exception when others then
      insert into public.household_state (household_id)
      values (v_household_id)
      on conflict (household_id) do nothing;
    end;
  end if;

  update public.user_profiles
  set active_household_id = coalesce(active_household_id, v_household_id)
  where user_id = v_user_id
    and active_household_id is null;

  select jsonb_agg(
    jsonb_build_object(
      'id', h.id,
      'name', h.name,
      'role', hm.role,
      'setupStatus', h.setup_status,
      'ownerUserId', h.owner_user_id,
      'inviteToken', case when hm.role in ('owner', 'editor') and h.setup_status in ('invite_ready', 'active') then h.invite_token else null end,
      'joinedAt', hm.joined_at,
      'createdAt', h.created_at,
      'isOwn', h.owner_user_id = v_user_id,
      'propia', h.propia
    )
    order by (hm.role = 'owner') desc, hm.joined_at asc
  )
  into v_memberships
  from public.household_members hm
  join public.households h on h.id = hm.household_id
  where hm.user_id = v_user_id;

  select * into v_household from public.user_profiles where user_id = v_user_id;

  return jsonb_build_object(
    'households', coalesce(v_memberships, '[]'::jsonb),
    'activeHouseholdId', v_household.active_household_id
  );
end;
$function$;
revoke all on function public.ensure_user_household() from public, anon, authenticated;
grant execute on function public.ensure_user_household() to authenticated;

create or replace function public._unirse(p_user_id uuid, p_token text)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_household_id uuid;
  v_owner_id uuid;
  v_role public.household_member_role := 'viewer';
  v_lang text;
  v_inv record;
  v_actual public.household_member_role;
  v_own_household_id uuid;
begin
  if p_user_id is null then
    raise exception 'Authentication required';
  end if;
  if p_token is null or length(trim(p_token)) = 0 then
    raise exception 'Invalid invite token';
  end if;

  select * into v_inv from public.household_invites where token = trim(p_token) for update;
  if v_inv.token is not null then
    if v_inv.revoked_at is not null or v_inv.uses >= v_inv.max_uses or v_inv.expires_at <= now() then
      raise exception 'Invite expired';
    end if;
    v_household_id := v_inv.household_id;
    v_role := v_inv.role;
    v_lang := v_inv.lang;
  else
    select id into v_household_id from public.households where invite_token = trim(p_token);
  end if;

  if v_household_id is null then
    raise exception 'Invite not found';
  end if;

  select owner_user_id into v_owner_id from public.households where id = v_household_id;
  if v_owner_id = p_user_id then
    raise exception 'Cannot join your own household';
  end if;

  insert into public.user_profiles (user_id) values (p_user_id) on conflict (user_id) do nothing;
  if v_lang is not null then
    update public.user_profiles set ui_lang = v_lang where user_id = p_user_id and ui_lang is null;
  end if;

  select role into v_actual from public.household_members
   where household_id = v_household_id and user_id = p_user_id;

  if v_actual is not null then
    -- Sube (lector → cotitular), nunca baja.
    if v_actual = 'viewer' and v_role = 'editor' then
      update public.household_members set role = 'editor'
       where household_id = v_household_id and user_id = p_user_id;
      if v_inv.token is not null then
        update public.household_invites set uses = uses + 1 where token = v_inv.token;
      end if;
    end if;
    update public.user_profiles
    set active_household_id = v_household_id, pending_invite_token = null
    where user_id = p_user_id;
    return jsonb_build_object('householdId', v_household_id, 'alreadyMember', true, 'lang', v_lang,
                              'role', (select role::text from public.household_members
                                        where household_id = v_household_id and user_id = p_user_id));
  end if;

  if (select count(*) from public.household_members
       where user_id = p_user_id and role in ('editor', 'viewer')) >= 3 then
    raise exception 'Member limit reached (max 3)';
  end if;

  insert into public.household_members (household_id, user_id, role)
  values (v_household_id, p_user_id, v_role);

  if v_inv.token is not null then
    update public.household_invites set uses = uses + 1 where token = v_inv.token;
  end if;

  -- Su casa propia: la que le nació (propia), no una heredada más antigua.
  select id into v_own_household_id
  from public.households
  where owner_user_id = p_user_id
  order by propia desc, created_at
  limit 1;

  if v_own_household_id is null then
    insert into public.households (name, owner_user_id, setup_status, invite_token)
    values ('Mi casa', p_user_id, 'dormant', public.gen_invite_token())
    returning id into v_own_household_id;

    insert into public.household_members (household_id, user_id, role)
    values (v_own_household_id, p_user_id, 'owner');

    insert into public.household_state (household_id)
    values (v_own_household_id)
    on conflict (household_id) do nothing;
  end if;

  update public.user_profiles
  set active_household_id = v_household_id,
      pending_invite_token = null
  where user_id = p_user_id;

  return jsonb_build_object('householdId', v_household_id, 'alreadyMember', false, 'role', v_role::text, 'lang', v_lang);
end;
$$;
revoke all on function public._unirse(uuid, text) from public, anon, authenticated;

create or replace function public._despedir(p_household_id uuid, p_user_id uuid)
returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_own_id uuid;
begin
  delete from public.bot_chats
   where household_id = p_household_id and kind = 'private' and linked_by = p_user_id;
  delete from public.bot_link_tokens where household_id = p_household_id and user_id = p_user_id;
  select id into v_own_id from public.households where owner_user_id = p_user_id order by propia desc, created_at limit 1;
  update public.user_profiles
     set active_household_id = coalesce(v_own_id, active_household_id)
   where user_id = p_user_id and active_household_id = p_household_id;
  perform public._cerrar_puertas(p_household_id);
end;
$$;
revoke all on function public._despedir(uuid, uuid) from public, anon, authenticated;
