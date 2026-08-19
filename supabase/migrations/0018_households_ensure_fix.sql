-- Fix ensure_user_household failing for users with recipe_votes favorites
-- (recipe_votes.scope is text[], household_favorites.scope is text).
-- Also harden one-time migration so a partial failure never blocks login.
--
-- Run in Supabase Dashboard → SQL Editor → production project.

create or replace function public.gen_invite_token()
returns text
language sql
volatile
set search_path = public
as $$
  select replace(gen_random_uuid()::text, '-', '');
$$;

create or replace function public.ensure_user_household()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
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
      'inviteToken', case when hm.role = 'owner' and h.setup_status in ('invite_ready', 'active') then h.invite_token else null end,
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
$$;

revoke all on function public.ensure_user_household() from public;
grant execute on function public.ensure_user_household() to authenticated;
revoke execute on function public.ensure_user_household() from anon;
