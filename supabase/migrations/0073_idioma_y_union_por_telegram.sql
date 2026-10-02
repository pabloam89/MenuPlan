-- 0073 · El idioma de cada persona, y unirse a una casa desde Telegram
-- (fases 3 y 7 de specs/roles-de-la-casa-*.md: la asistenta, que habla inglés
-- y no tiene por qué usar la app, entra con una invitación de Lola).
--
-- 1. user_profiles.ui_lang ('es' | 'en' | null = automático). Es una elección
--    de la persona, no `locale` (eso es el navegador, se pisa en cada sesión).
-- 2. _unirse(usuario, token): el cuerpo de join_household_by_token (0071)
--    para un usuario dado. Lo usan la app (con su sesión) y el bot (servidor,
--    sin sesión del usuario). Si la invitación trae idioma y la persona no ha
--    elegido uno, se le pone.
--
-- Idempotente.

alter table public.user_profiles
  add column if not exists ui_lang text check (ui_lang in ('es', 'en'));
comment on column public.user_profiles.ui_lang is
  'Idioma elegido por la persona (app y Lola). null = automático. NO es `locale`, que es del navegador y se pisa en cada sesión.';

create or replace function public._unirse(p_user_id uuid, p_token text)
returns jsonb
language plpgsql security definer set search_path = public as $$
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

  -- Su casa propia, como hasta ahora (la más antigua si hubiera varias).
  select id into v_own_household_id
  from public.households
  where owner_user_id = p_user_id
  order by created_at
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

-- La app: con su sesión.
create or replace function public.join_household_by_token(p_token text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  return public._unirse(auth.uid(), p_token);
end;
$function$;

-- El bot: sin sesión del usuario (inv_ en Telegram). Solo el servidor.
create or replace function public.bot_unirse_por_invitacion(p_user_id uuid, p_token text)
returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  return public._unirse(p_user_id, p_token);
end;
$$;
revoke all on function public.bot_unirse_por_invitacion(uuid, text) from public, anon, authenticated;
grant execute on function public.bot_unirse_por_invitacion(uuid, text) to service_role;
