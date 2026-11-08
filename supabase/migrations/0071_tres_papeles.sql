-- 0071 · Tres papeles por casa: titular (owner), cotitular (editor) y lector
-- (viewer). Fases 1 y 3 de specs/roles-de-la-casa-propuesta.md, con los
-- cambios de la revisión (specs/roles-de-la-casa-revision.md).
--
-- Requiere la 0070 aplicada y confirmada ANTES (otra transacción).
--
-- Decidido por Pablo (1 oct 2026):
--   · solo el titular nombra cotitulares y cambia papeles;
--   · el cotitular invita y quita lectores;
--   · el lector ve todo (alergias y salud incluidas) y solo tacha la compra.
--
-- Qué cambia:
--   1. Ayudantes: is_household_editor, household_role, count_foreign_memberships.
--   2. Las filas de casa van SIEMPRE a nombre del titular: el trigger de la
--      0067 ya no rechaza, reescribe `user_id` (A-7 de la revisión). Así da
--      igual qué `user_id` mande el cliente del cotitular, el bot o una
--      transferencia a medias. Quien no es editor sigue sin poder escribir:
--      la fila reescrita no pasa la RLS.
--   3. RLS: escribir en la casa = titular o cotitular. Vaciar household_state
--      sigue siendo del titular.
--   4. households y household_members ya no se escriben directamente: todo
--      por las RPC (en src/ no hay ninguna escritura directa).
--   5. Invitaciones con papel (household_invites) y sus RPC. El enlace de
--      siempre (invite_token) sigue dando lector.
--   6. RPC de miembros con papeles; quitar o rebajar a alguien rota el enlace
--      y revoca las invitaciones pendientes (A-2).
--   7. activate_household_menu con la casa explícita (A-8).
--
-- Lo que NO está aquí: transferir la titularidad y heredar al borrar la
-- cuenta (fase 5), y que el lector tache (fase 6).
--
-- Idempotente: se puede volver a ejecutar.

-- ── 1. Ayudantes ────────────────────────────────────────────────────────────

create or replace function public.is_household_editor(p_household_id uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.household_members hm
    where hm.household_id = p_household_id
      and hm.user_id = (select auth.uid())
      and hm.role in ('owner', 'editor')
  );
$$;

create or replace function public.household_role(p_household_id uuid)
returns text
language sql stable security definer set search_path = public as $$
  select hm.role::text from public.household_members hm
  where hm.household_id = p_household_id and hm.user_id = (select auth.uid());
$$;

-- Casas ajenas (cotitular o lector) de quien llama. Sin parámetro: la de la
-- 0017 (count_viewer_memberships) la podía ejecutar cualquiera con cualquier
-- usuario (M-7).
create or replace function public.count_foreign_memberships()
returns integer
language sql stable security definer set search_path = public as $$
  select count(*)::integer from public.household_members
  where user_id = (select auth.uid()) and role in ('editor', 'viewer');
$$;

revoke all on function public.is_household_editor(uuid) from public, anon;
revoke all on function public.household_role(uuid) from public, anon;
revoke all on function public.count_foreign_memberships() from public, anon;
grant execute on function public.is_household_editor(uuid) to authenticated, service_role;
grant execute on function public.household_role(uuid) to authenticated, service_role;
grant execute on function public.count_foreign_memberships() to authenticated, service_role;

-- ── 2. Las filas de una casa, a nombre de su titular (reescribe, no rechaza) ─

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
  -- `for share`: una transferencia de titularidad que caiga a la vez espera,
  -- y la fila no se queda a nombre del titular viejo (M-6).
  select owner_user_id into v_dueno from public.households where id = new.household_id for share;
  if v_dueno is null then
    raise exception 'Casa inexistente (tabla %, casa %)', tg_table_name, new.household_id
      using errcode = '42501';
  end if;
  -- El permiso lo decide la RLS sobre la fila ya reescrita: un cotitular
  -- pasa, un lector o un extraño no.
  new.user_id := v_dueno;
  return new;
end;
$function$;

-- ── 3. RLS: escribir en la casa = titular o cotitular ───────────────────────

drop policy if exists "Owners write household state" on public.household_state;
drop policy if exists "Editors insert household state" on public.household_state;
drop policy if exists "Editors update household state" on public.household_state;
drop policy if exists "Owner deletes household state" on public.household_state;
create policy "Editors insert household state" on public.household_state
  for insert with check (public.is_household_editor(household_id));
create policy "Editors update household state" on public.household_state
  for update using (public.is_household_editor(household_id))
  with check (public.is_household_editor(household_id));
create policy "Owner deletes household state" on public.household_state
  for delete using (public.is_household_owner(household_id));

drop policy if exists "Owners manage household favorites" on public.household_favorites;
drop policy if exists "Editors manage household favorites" on public.household_favorites;
create policy "Editors manage household favorites" on public.household_favorites
  for all using (public.is_household_editor(household_id))
  with check (public.is_household_editor(household_id));

drop policy if exists "Owners manage household discards" on public.household_recipe_discards;
drop policy if exists "Editors manage household discards" on public.household_recipe_discards;
create policy "Editors manage household discards" on public.household_recipe_discards
  for all using (public.is_household_editor(household_id))
  with check (public.is_household_editor(household_id));

-- Las cuatro tablas con user_id + household_id. La fila ya llega con el
-- user_id del titular (trigger de arriba); la política mira que quien escribe
-- sea titular o cotitular de ESA casa.
drop policy if exists "Household owners manage pantry" on public.user_pantry;
drop policy if exists "Household editors write pantry" on public.user_pantry;
create policy "Household editors write pantry" on public.user_pantry for all
  using (household_id is not null and public.is_household_editor(household_id))
  with check (household_id is not null and public.is_household_editor(household_id));

drop policy if exists "Household owners manage menus" on public.user_menus;
drop policy if exists "Household editors write menus" on public.user_menus;
create policy "Household editors write menus" on public.user_menus for all
  using (household_id is not null and public.is_household_editor(household_id))
  with check (household_id is not null and public.is_household_editor(household_id));

drop policy if exists "Household owners manage menu weeks" on public.user_menu_weeks;
drop policy if exists "Household editors write menu weeks" on public.user_menu_weeks;
create policy "Household editors write menu weeks" on public.user_menu_weeks for all
  using (household_id is not null and public.is_household_editor(household_id))
  with check (household_id is not null and public.is_household_editor(household_id));

drop policy if exists "Household owners manage menu recipes" on public.user_menu_recipes;
drop policy if exists "Household editors write menu recipes" on public.user_menu_recipes;
create policy "Household editors write menu recipes" on public.user_menu_recipes for all
  using (household_id is not null and public.is_household_editor(household_id))
  with check (household_id is not null and public.is_household_editor(household_id));

-- ── 4. households y household_members: solo por RPC ─────────────────────────

drop policy if exists "Owners manage households" on public.households;
drop policy if exists "Owners manage memberships" on public.household_members;
drop policy if exists "Viewers delete own membership" on public.household_members;

-- ── 5. Invitaciones con papel ───────────────────────────────────────────────

create table if not exists public.household_invites (
  token        text primary key default public.gen_invite_token(),
  household_id uuid not null references public.households(id) on delete cascade,
  role         public.household_member_role not null check (role in ('editor', 'viewer')),
  created_by   uuid references auth.users(id) on delete set null,
  lang         text check (lang in ('es', 'en')),
  max_uses     integer not null default 1 check (max_uses between 1 and 20),
  uses         integer not null default 0,
  expires_at   timestamptz not null default now() + interval '7 days',
  revoked_at   timestamptz,
  created_at   timestamptz not null default now()
);
create index if not exists idx_household_invites_household on public.household_invites (household_id);
alter table public.household_invites enable row level security;
-- Sin políticas: solo las RPC de abajo (como bot_codigos y las llaves de 0055/0056).

-- Revoca lo pendiente y rota el enlace de siempre. Se llama al quitar, salir
-- o rebajar: si no, quien se va vuelve a entrar con lo que tenía (A-2).
create or replace function public._cerrar_puertas(p_household_id uuid)
returns void
language sql security definer set search_path = public as $$
  update public.household_invites set revoked_at = now()
   where household_id = p_household_id and revoked_at is null and uses < max_uses and expires_at > now();
  update public.households set invite_token = public.gen_invite_token(), updated_at = now()
   where id = p_household_id and invite_token is not null;
$$;
revoke all on function public._cerrar_puertas(uuid) from public, anon, authenticated;

create or replace function public.create_household_invite(p_household_id uuid, p_role text, p_lang text default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_token text;
  v_expira timestamptz;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_role not in ('editor', 'viewer') then raise exception 'Papel no válido'; end if;
  if p_lang is not null and p_lang not in ('es', 'en') then raise exception 'Idioma no válido'; end if;
  -- Cotitular: solo el titular. Lector: titular o cotitular.
  if p_role = 'editor' and not public.is_household_owner(p_household_id) then
    raise exception 'Solo el titular puede invitar cotitulares' using errcode = '42501';
  end if;
  if not public.is_household_editor(p_household_id) then
    raise exception 'No puedes invitar a esta casa' using errcode = '42501';
  end if;
  insert into public.household_invites (household_id, role, created_by, lang)
  values (p_household_id, p_role::public.household_member_role, auth.uid(), p_lang)
  returning token, expires_at into v_token, v_expira;
  return jsonb_build_object('token', v_token, 'role', p_role, 'expiresAt', v_expira);
end;
$$;

create or replace function public.revoke_household_invite(p_token text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_inv record;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into v_inv from public.household_invites where token = p_token;
  if v_inv is null then return; end if;
  if v_inv.created_by is distinct from auth.uid() and not public.is_household_owner(v_inv.household_id) then
    raise exception 'No puedes revocar esta invitación' using errcode = '42501';
  end if;
  update public.household_invites set revoked_at = now() where token = p_token and revoked_at is null;
end;
$$;

-- Pendientes de una casa, para enseñarlas (y revocarlas) en Hogares.
create or replace function public.list_household_invites(p_household_id uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_household_editor(p_household_id) then
    raise exception 'No eres de esta casa' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('token', token, 'role', role::text, 'lang', lang,
             'expiresAt', expires_at, 'createdAt', created_at) order by created_at desc)
    from public.household_invites
    where household_id = p_household_id and revoked_at is null and uses < max_uses and expires_at > now()
      -- El cotitular no ve (ni reparte) las de cotitular.
      and (role = 'viewer' or public.is_household_owner(p_household_id))
  ), '[]'::jsonb);
end;
$$;

-- ── 6. RPC de miembros ──────────────────────────────────────────────────────

-- Lo que ve la app de cada casa. Cambios: el papel `editor`; el enlace de
-- lector también para el cotitular; la casa propia más antigua (A-3).
create or replace function public.ensure_user_household()
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
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
  order by created_at
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
      'isOwn', h.owner_user_id = v_user_id
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

-- Ver una invitación antes de aceptarla: casa, papel y quién invita.
create or replace function public.preview_household_invite(p_token text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_res jsonb;
begin
  select jsonb_build_object('householdId', h.id, 'householdName', h.name, 'role', i.role::text,
                            'lang', i.lang, 'ownerName', public._nombre_de(h.owner_user_id))
    into v_res
    from public.household_invites i join public.households h on h.id = i.household_id
   where i.token = trim(p_token) and i.revoked_at is null and i.uses < i.max_uses and i.expires_at > now();
  if v_res is not null then return v_res; end if;

  select jsonb_build_object('householdId', h.id, 'householdName', h.name, 'role', 'viewer',
                            'ownerName', public._nombre_de(h.owner_user_id))
    into v_res
    from public.households h
   where h.invite_token = trim(p_token);
  return v_res;
end;
$function$;

create or replace function public._nombre_de(p_user_id uuid)
returns text
language sql stable security definer set search_path = public as $$
  select coalesce(
    nullif(trim(up.display_name), ''),
    nullif(trim(au.raw_user_meta_data ->> 'full_name'), ''),
    nullif(trim(au.raw_user_meta_data ->> 'name'), ''),
    split_part(au.email, '@', 1)
  )
  from auth.users au left join public.user_profiles up on up.user_id = au.id
  where au.id = p_user_id;
$$;
revoke all on function public._nombre_de(uuid) from public, anon, authenticated;

-- Unirse con una invitación con papel o con el enlace de siempre (lector).
-- Si ya es miembro con un papel MENOR, sube (lector → cotitular); nunca baja.
create or replace function public.join_household_by_token(p_token text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_user_id uuid := auth.uid();
  v_household_id uuid;
  v_owner_id uuid;
  v_role public.household_member_role := 'viewer';
  v_lang text;
  v_inv record;
  v_actual public.household_member_role;
  v_own_household_id uuid;
begin
  if v_user_id is null then
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
  if v_owner_id = v_user_id then
    raise exception 'Cannot join your own household';
  end if;

  select role into v_actual from public.household_members
   where household_id = v_household_id and user_id = v_user_id;

  if v_actual is not null then
    if v_actual = 'viewer' and v_role = 'editor' then
      update public.household_members set role = 'editor'
       where household_id = v_household_id and user_id = v_user_id;
      if v_inv.token is not null then
        update public.household_invites set uses = uses + 1 where token = v_inv.token;
      end if;
    end if;
    update public.user_profiles
    set active_household_id = v_household_id, pending_invite_token = null
    where user_id = v_user_id;
    return jsonb_build_object('householdId', v_household_id, 'alreadyMember', true,
                              'role', (select role::text from public.household_members
                                        where household_id = v_household_id and user_id = v_user_id));
  end if;

  if public.count_foreign_memberships() >= 3 then
    raise exception 'Member limit reached (max 3)';
  end if;

  insert into public.household_members (household_id, user_id, role)
  values (v_household_id, v_user_id, v_role);

  if v_inv.token is not null then
    update public.household_invites set uses = uses + 1 where token = v_inv.token;
  end if;

  -- Su casa propia, como hasta ahora (la más antigua si hubiera varias).
  select id into v_own_household_id
  from public.households
  where owner_user_id = v_user_id
  order by created_at
  limit 1;

  if v_own_household_id is null then
    insert into public.households (name, owner_user_id, setup_status, invite_token)
    values ('Mi casa', v_user_id, 'dormant', public.gen_invite_token())
    returning id into v_own_household_id;

    insert into public.household_members (household_id, user_id, role)
    values (v_own_household_id, v_user_id, 'owner');

    insert into public.household_state (household_id)
    values (v_own_household_id)
    on conflict (household_id) do nothing;
  end if;

  update public.user_profiles
  set active_household_id = v_household_id,
      pending_invite_token = null
  where user_id = v_user_id;

  return jsonb_build_object('householdId', v_household_id, 'alreadyMember', false, 'role', v_role::text, 'lang', v_lang);
end;
$function$;

-- Miembros: titular, cotitulares y lectores, en ese orden.
create or replace function public.list_household_members(p_household_id uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  if not public.is_household_member(p_household_id) then
    raise exception 'Not a member of this household';
  end if;

  return coalesce((
    select jsonb_agg(row order by sort_key, joined_at)
    from (
      select
        jsonb_build_object(
          'userId', hm.user_id,
          'role', hm.role::text,
          'name', coalesce(
            nullif(trim(up.display_name), ''),
            nullif(trim(au.raw_user_meta_data ->> 'full_name'), ''),
            nullif(trim(au.raw_user_meta_data ->> 'name'), ''),
            split_part(au.email, '@', 1),
            'Usuario'
          ),
          'photo', coalesce(
            nullif(trim(up.avatar_url), ''),
            nullif(trim(au.raw_user_meta_data ->> 'picture'), ''),
            nullif(trim(au.raw_user_meta_data ->> 'avatar_url'), '')
          ),
          'joinedAt', hm.joined_at
        ) as row,
        case hm.role when 'owner' then 0 when 'editor' then 1 else 2 end as sort_key,
        hm.joined_at
      from public.household_members hm
      left join public.user_profiles up on up.user_id = hm.user_id
      left join auth.users au on au.id = hm.user_id
      where hm.household_id = p_household_id
    ) sub
  ), '[]'::jsonb);
end;
$function$;

-- Cambiar de papel (cotitular ↔ lector): solo el titular, y nunca a sí mismo.
create or replace function public.set_household_member_role(p_household_id uuid, p_user_id uuid, p_role text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_actual public.household_member_role;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_role not in ('editor', 'viewer') then raise exception 'Papel no válido'; end if;
  if not public.is_household_owner(p_household_id) then
    raise exception 'Solo el titular cambia papeles' using errcode = '42501';
  end if;
  select role into v_actual from public.household_members
   where household_id = p_household_id and user_id = p_user_id;
  if v_actual is null then raise exception 'No es de esta casa'; end if;
  if v_actual = 'owner' then raise exception 'El titular no cambia de papel así'; end if;
  if v_actual::text = p_role then return; end if;

  update public.household_members set role = p_role::public.household_member_role
   where household_id = p_household_id and user_id = p_user_id;
  -- Al rebajar, lo que tuviera para volver a subir deja de valer.
  if p_role = 'viewer' then perform public._cerrar_puertas(p_household_id); end if;
end;
$$;

-- Lo que se va con alguien que deja la casa: sus chats privados con Lola
-- enlazados a ella, y la casa activa vuelve a la suya.
create or replace function public._despedir(p_household_id uuid, p_user_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_own_id uuid;
begin
  delete from public.bot_chats
   where household_id = p_household_id and kind = 'private' and linked_by = p_user_id;
  delete from public.bot_link_tokens where household_id = p_household_id and user_id = p_user_id;
  select id into v_own_id from public.households where owner_user_id = p_user_id order by created_at limit 1;
  update public.user_profiles
     set active_household_id = coalesce(v_own_id, active_household_id)
   where user_id = p_user_id and active_household_id = p_household_id;
  perform public._cerrar_puertas(p_household_id);
end;
$$;
revoke all on function public._despedir(uuid, uuid) from public, anon, authenticated;

-- Quitar a alguien: el titular quita cotitulares y lectores; el cotitular,
-- solo lectores. Al titular no lo quita nadie.
create or replace function public.remove_household_member(p_household_id uuid, p_user_id uuid)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_suyo public.household_member_role;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select role into v_suyo from public.household_members
   where household_id = p_household_id and user_id = p_user_id;
  if v_suyo is null then return; end if;
  if v_suyo = 'owner' then raise exception 'Al titular no se le quita de la casa'; end if;

  if not (public.is_household_owner(p_household_id)
          or (v_suyo = 'viewer' and public.is_household_editor(p_household_id))) then
    raise exception 'No puedes quitar a esta persona' using errcode = '42501';
  end if;

  delete from public.household_members
  where household_id = p_household_id and user_id = p_user_id and role <> 'owner';

  perform public._despedir(p_household_id, p_user_id);
end;
$function$;

-- Salir: cotitular o lector. El titular no sale (borra la casa, o en el
-- futuro la transfiere).
create or replace function public.leave_household(p_household_id uuid)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_user_id uuid := auth.uid();
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
    and role in ('editor', 'viewer');

  perform public._despedir(p_household_id, v_user_id);
end;
$function$;

-- Renombrar (y el estado de configuración): titular o cotitular.
create or replace function public.update_household(p_household_id uuid, p_name text default null::text, p_setup_status household_setup_status default null::household_setup_status)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if not public.is_household_editor(p_household_id) then
    raise exception 'Only the owner or a co-owner can update the household';
  end if;

  update public.households
  set
    name = coalesce(nullif(trim(p_name), ''), name),
    setup_status = coalesce(p_setup_status, setup_status),
    invite_token = case
      when coalesce(p_setup_status, setup_status) in ('invite_ready', 'active')
        and invite_token is null then public.gen_invite_token()
      else invite_token
    end,
    updated_at = now()
  where id = p_household_id;
end;
$function$;

-- ── 7. Activar un menú: con la casa explícita (A-8) ─────────────────────────
-- Los id de menú no son únicos entre usuarios: buscar «el menú con este id»
-- podía activar el de otra casa. La firma nueva lleva la casa; la vieja se
-- queda para los clientes viejos, ahora también para cotitulares.

create or replace function public.activate_household_menu(p_household_id uuid, p_menu_id text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not public.is_household_editor(p_household_id) then
    raise exception 'Only the owner or a co-owner can activate menus' using errcode = '42501';
  end if;
  if not exists (select 1 from public.user_menus where household_id = p_household_id and id = p_menu_id) then
    raise exception 'Menu not found';
  end if;
  update public.user_menus set is_active = false where household_id = p_household_id and is_active and id <> p_menu_id;
  update public.user_menus set is_active = true where household_id = p_household_id and id = p_menu_id;
end;
$$;

create or replace function public.activate_household_menu(p_menu_id text)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_user_id uuid := auth.uid();
  v_household_id uuid;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  -- La casa activa primero: es la que el cliente está mirando.
  select m.household_id into v_household_id
  from public.user_menus m
  join public.user_profiles up on up.user_id = v_user_id and up.active_household_id = m.household_id
  where m.id = p_menu_id and public.is_household_editor(m.household_id)
  limit 1;

  if v_household_id is null then
    select household_id into v_household_id
    from public.user_menus
    where id = p_menu_id
      and household_id is not null and public.is_household_editor(household_id)
    order by updated_at desc
    limit 1;
  end if;

  if v_household_id is null then
    -- Fallback: legacy user-scoped menus
    if not exists (select 1 from public.user_menus where user_id = v_user_id and id = p_menu_id) then
      raise exception 'Menu not found';
    end if;

    update public.user_menus set is_active = false where user_id = v_user_id and is_active;
    update public.user_menus set is_active = true where user_id = v_user_id and id = p_menu_id;
    return;
  end if;

  perform public.activate_household_menu(v_household_id, p_menu_id);
end;
$function$;

-- ── Permisos de las RPC (patrón de la 0056) ─────────────────────────────────

do $$
declare f text;
begin
  foreach f in array array[
    'create_household_invite(uuid, text, text)',
    'revoke_household_invite(text)',
    'list_household_invites(uuid)',
    'set_household_member_role(uuid, uuid, text)',
    'activate_household_menu(uuid, text)'
  ] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated, service_role', f);
  end loop;
end $$;
