-- Households V1 — shared planning spaces with owner + read-only viewers.
-- See HOUSEHOLDS.md for the product spec.
--
-- Run in: Supabase Dashboard → SQL Editor → project → Run.

-- ── Enums ─────────────────────────────────────────────────────

do $$ begin
  create type public.household_setup_status as enum ('dormant', 'invite_ready', 'active');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.household_member_role as enum ('owner', 'viewer');
exception when duplicate_object then null;
end $$;

-- ── Households ──────────────────────────────────────────────────

create table if not exists public.households (
  id             uuid primary key default gen_random_uuid(),
  name           text not null default 'Mi casa',
  owner_user_id  uuid not null references auth.users(id) on delete cascade,
  setup_status   public.household_setup_status not null default 'dormant',
  invite_token   text unique,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists idx_households_owner
  on public.households (owner_user_id);

create unique index if not exists uq_households_one_owner_per_user
  on public.households (owner_user_id);

alter table public.households enable row level security;

-- ── Members ─────────────────────────────────────────────────────

create table if not exists public.household_members (
  household_id uuid not null references public.households(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  role         public.household_member_role not null,
  joined_at    timestamptz not null default now(),
  primary key (household_id, user_id)
);

create index if not exists idx_household_members_user
  on public.household_members (user_id);

create unique index if not exists uq_household_members_one_owner
  on public.household_members (household_id)
  where role = 'owner';

alter table public.household_members enable row level security;

-- ── Household state (replaces user_state for planning data) ─────

create table if not exists public.household_state (
  household_id uuid primary key references public.households(id) on delete cascade,
  state        jsonb not null default '{}'::jsonb,
  updated_at   timestamptz not null default now()
);

alter table public.household_state enable row level security;

-- ── Household favorites (menu generation pool) ──────────────────

create table if not exists public.household_favorites (
  household_id uuid not null references public.households(id) on delete cascade,
  recipe_id    text not null,
  scope        text,
  created_at   timestamptz not null default now(),
  primary key (household_id, recipe_id)
);

alter table public.household_favorites enable row level security;

create index if not exists idx_household_favorites_household
  on public.household_favorites (household_id);

-- ── Household discards ──────────────────────────────────────────

create table if not exists public.household_recipe_discards (
  id             bigserial primary key,
  household_id   uuid not null references public.households(id) on delete cascade,
  recipe_id      text not null,
  is_permanent   boolean not null default false,
  cooldown_until timestamptz,
  created_at     timestamptz not null default now(),
  unique (household_id, recipe_id)
);

alter table public.household_recipe_discards enable row level security;

create index if not exists idx_household_discards_household
  on public.household_recipe_discards (household_id);

-- ── user_profiles extensions ────────────────────────────────────

alter table public.user_profiles
  add column if not exists active_household_id uuid references public.households(id) on delete set null,
  add column if not exists pending_invite_token text;

-- ── household_id on existing tables ─────────────────────────────

alter table public.user_pantry
  add column if not exists household_id uuid references public.households(id) on delete cascade;

create index if not exists idx_user_pantry_household
  on public.user_pantry (household_id);

alter table public.user_menus
  add column if not exists household_id uuid references public.households(id) on delete cascade;

create index if not exists idx_user_menus_household
  on public.user_menus (household_id);

alter table public.user_menu_weeks
  add column if not exists household_id uuid references public.households(id) on delete cascade;

alter table public.user_menu_recipes
  add column if not exists household_id uuid references public.households(id) on delete cascade;

-- Drop old pantry uniqueness and recreate with household_id when present.
-- Rows without household_id keep legacy user_id uniqueness during rollout.
drop index if exists public.user_pantry_ingredient_unique;
create unique index if not exists user_pantry_ingredient_unique
  on public.user_pantry (coalesce(household_id, '00000000-0000-0000-0000-000000000000'::uuid), user_id, ingredient_normalized, frozen)
  where item_type = 'ingredient';

drop index if exists public.uq_user_menus_one_active;
create unique index if not exists uq_user_menus_one_active
  on public.user_menus (coalesce(household_id, '00000000-0000-0000-0000-000000000000'::uuid), user_id)
  where is_active;

create unique index if not exists uq_household_menus_one_active
  on public.user_menus (household_id)
  where is_active and household_id is not null;

-- ── Helper functions (SECURITY DEFINER for RLS) ─────────────────

create or replace function public.is_household_member(p_household_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.household_members hm
    where hm.household_id = p_household_id
      and hm.user_id = (select auth.uid())
  );
$$;

create or replace function public.is_household_owner(p_household_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.households h
    where h.id = p_household_id
      and h.owner_user_id = (select auth.uid())
  );
$$;

create or replace function public.count_viewer_memberships(p_user_id uuid default auth.uid())
returns integer
language sql
security definer
stable
set search_path = public
as $$
  select count(*)::integer
  from public.household_members hm
  where hm.user_id = p_user_id
    and hm.role = 'viewer';
$$;

create or replace function public.gen_invite_token()
returns text
language sql
volatile
as $$
  select replace(gen_random_uuid()::text, '-', '');
$$;

-- ── RLS: households ─────────────────────────────────────────────

drop policy if exists "Members read households" on public.households;
create policy "Members read households"
  on public.households for select
  using (public.is_household_member(id));

drop policy if exists "Owners manage households" on public.households;
create policy "Owners manage households"
  on public.households for all
  using (public.is_household_owner(id))
  with check (public.is_household_owner(id));

-- ── RLS: household_members ──────────────────────────────────────

drop policy if exists "Members read memberships" on public.household_members;
create policy "Members read memberships"
  on public.household_members for select
  using (public.is_household_member(household_id));

drop policy if exists "Owners manage memberships" on public.household_members;
create policy "Owners manage memberships"
  on public.household_members for all
  using (public.is_household_owner(household_id))
  with check (public.is_household_owner(household_id));

drop policy if exists "Users insert self as viewer" on public.household_members;
create policy "Users insert self as viewer"
  on public.household_members for insert
  with check (
    user_id = (select auth.uid())
    and role = 'viewer'
    and exists (
      select 1 from public.households h
      where h.id = household_id
        and h.owner_user_id <> (select auth.uid())
    )
  );

drop policy if exists "Viewers delete own membership" on public.household_members;
create policy "Viewers delete own membership"
  on public.household_members for delete
  using (
    user_id = (select auth.uid())
    and role = 'viewer'
  );

-- ── RLS: household_state ────────────────────────────────────────

drop policy if exists "Members read household state" on public.household_state;
create policy "Members read household state"
  on public.household_state for select
  using (public.is_household_member(household_id));

drop policy if exists "Owners write household state" on public.household_state;
create policy "Owners write household state"
  on public.household_state for all
  using (public.is_household_owner(household_id))
  with check (public.is_household_owner(household_id));

-- ── RLS: household_favorites ────────────────────────────────────

drop policy if exists "Members read household favorites" on public.household_favorites;
create policy "Members read household favorites"
  on public.household_favorites for select
  using (public.is_household_member(household_id));

drop policy if exists "Owners manage household favorites" on public.household_favorites;
create policy "Owners manage household favorites"
  on public.household_favorites for all
  using (public.is_household_owner(household_id))
  with check (public.is_household_owner(household_id));

-- ── RLS: household_recipe_discards ──────────────────────────────

drop policy if exists "Members read household discards" on public.household_recipe_discards;
create policy "Members read household discards"
  on public.household_recipe_discards for select
  using (public.is_household_member(household_id));

drop policy if exists "Owners manage household discards" on public.household_recipe_discards;
create policy "Owners manage household discards"
  on public.household_recipe_discards for all
  using (public.is_household_owner(household_id))
  with check (public.is_household_owner(household_id));

-- ── Extend RLS on existing tables (household-aware) ─────────────
-- Legacy user_id-only rows still work via existing policies.
-- New household-scoped rows also allow member read / owner write.

drop policy if exists "Household members read pantry" on public.user_pantry;
create policy "Household members read pantry"
  on public.user_pantry for select
  using (
    household_id is not null
    and public.is_household_member(household_id)
  );

drop policy if exists "Household owners manage pantry" on public.user_pantry;
create policy "Household owners manage pantry"
  on public.user_pantry for all
  using (
    household_id is not null
    and public.is_household_owner(household_id)
  )
  with check (
    household_id is not null
    and public.is_household_owner(household_id)
  );

drop policy if exists "Household members read menus" on public.user_menus;
create policy "Household members read menus"
  on public.user_menus for select
  using (
    household_id is not null
    and public.is_household_member(household_id)
  );

drop policy if exists "Household owners manage menus" on public.user_menus;
create policy "Household owners manage menus"
  on public.user_menus for all
  using (
    household_id is not null
    and public.is_household_owner(household_id)
  )
  with check (
    household_id is not null
    and public.is_household_owner(household_id)
  );

drop policy if exists "Household members read menu weeks" on public.user_menu_weeks;
create policy "Household members read menu weeks"
  on public.user_menu_weeks for select
  using (
    household_id is not null
    and public.is_household_member(household_id)
  );

drop policy if exists "Household owners manage menu weeks" on public.user_menu_weeks;
create policy "Household owners manage menu weeks"
  on public.user_menu_weeks for all
  using (
    household_id is not null
    and public.is_household_owner(household_id)
  )
  with check (
    household_id is not null
    and public.is_household_owner(household_id)
  );

drop policy if exists "Household members read menu recipes" on public.user_menu_recipes;
create policy "Household members read menu recipes"
  on public.user_menu_recipes for select
  using (
    household_id is not null
    and public.is_household_member(household_id)
  );

drop policy if exists "Household owners manage menu recipes" on public.user_menu_recipes;
create policy "Household owners manage menu recipes"
  on public.user_menu_recipes for all
  using (
    household_id is not null
    and public.is_household_owner(household_id)
  )
  with check (
    household_id is not null
    and public.is_household_owner(household_id)
  );

-- ── Migration + ensure on login ─────────────────────────────────

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

  -- Ensure profile row exists
  insert into public.user_profiles (user_id)
  values (v_user_id)
  on conflict (user_id) do nothing;

  -- Find or create owned household
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

  -- One-time migration from legacy per-user tables
  if not exists (select 1 from public.household_state where household_id = v_household_id) then
    insert into public.household_state (household_id, state, updated_at)
    select v_household_id, coalesce(us.state, '{}'::jsonb), coalesce(us.updated_at, now())
    from public.user_state us
    where us.user_id = v_user_id
    on conflict (household_id) do nothing;

    -- If no user_state row, still create empty household_state
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
    select v_household_id, rv.recipe_id, rv.scope
    from public.recipe_votes rv
    where rv.user_id = v_user_id
      and rv.is_favorite = true
    on conflict (household_id, recipe_id) do nothing;

    insert into public.household_recipe_discards (household_id, recipe_id, is_permanent, cooldown_until)
    select v_household_id, urd.recipe_id, urd.is_permanent, urd.cooldown_until
    from public.user_recipe_discards urd
    where urd.user_id = v_user_id
    on conflict (household_id, recipe_id) do nothing;
  end if;

  -- Default active household
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

-- ── Join by invite token ────────────────────────────────────────

create or replace function public.join_household_by_token(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_household_id uuid;
  v_owner_id uuid;
  v_own_household_id uuid;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;
  if p_token is null or length(trim(p_token)) = 0 then
    raise exception 'Invalid invite token';
  end if;

  select id, owner_user_id into v_household_id, v_owner_id
  from public.households
  where invite_token = trim(p_token)
  limit 1;

  if v_household_id is null then
    raise exception 'Invite not found';
  end if;

  if v_owner_id = v_user_id then
    raise exception 'Cannot join your own household';
  end if;

  if exists (
    select 1 from public.household_members
    where household_id = v_household_id and user_id = v_user_id
  ) then
    -- Already a member — just switch active household
    update public.user_profiles
    set active_household_id = v_household_id, pending_invite_token = null
    where user_id = v_user_id;
    return jsonb_build_object('householdId', v_household_id, 'alreadyMember', true);
  end if;

  if public.count_viewer_memberships(v_user_id) >= 2 then
    raise exception 'Viewer limit reached (max 2)';
  end if;

  insert into public.household_members (household_id, user_id, role)
  values (v_household_id, v_user_id, 'viewer');

  -- Ensure viewer has their own dormant household slot
  select id into v_own_household_id
  from public.households
  where owner_user_id = v_user_id
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

  return jsonb_build_object('householdId', v_household_id, 'alreadyMember', false);
end;
$$;

revoke all on function public.join_household_by_token(text) from public;
grant execute on function public.join_household_by_token(text) to authenticated;
revoke execute on function public.join_household_by_token(text) from anon;

-- ── Set active household ────────────────────────────────────────

create or replace function public.set_active_household(p_household_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  if not public.is_household_member(p_household_id) then
    raise exception 'Not a member of this household';
  end if;

  update public.user_profiles
  set active_household_id = p_household_id
  where user_id = v_user_id;
end;
$$;

revoke all on function public.set_active_household(uuid) from public;
grant execute on function public.set_active_household(uuid) to authenticated;
revoke execute on function public.set_active_household(uuid) from anon;

-- ── Leave / remove member ───────────────────────────────────────

create or replace function public.leave_household(p_household_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
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

  select id into v_own_id from public.households where owner_user_id = v_user_id limit 1;

  update public.user_profiles
  set active_household_id = coalesce(v_own_id, active_household_id)
  where user_id = v_user_id
    and active_household_id = p_household_id;
end;
$$;

revoke all on function public.leave_household(uuid) from public;
grant execute on function public.leave_household(uuid) to authenticated;
revoke execute on function public.leave_household(uuid) from anon;

create or replace function public.remove_household_member(p_household_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
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
end;
$$;

revoke all on function public.remove_household_member(uuid, uuid) from public;
grant execute on function public.remove_household_member(uuid, uuid) to authenticated;
revoke execute on function public.remove_household_member(uuid, uuid) from anon;

-- ── Update household (name, setup status) ───────────────────────

create or replace function public.update_household(
  p_household_id uuid,
  p_name text default null,
  p_setup_status public.household_setup_status default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if not public.is_household_owner(p_household_id) then
    raise exception 'Only the owner can update the household';
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
$$;

revoke all on function public.update_household(uuid, text, public.household_setup_status) from public;
grant execute on function public.update_household(uuid, text, public.household_setup_status) to authenticated;
revoke execute on function public.update_household(uuid, text, public.household_setup_status) from anon;

-- ── Delete household (owner only) ───────────────────────────────

create or replace function public.delete_household(p_household_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_new_own_id uuid;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  if not public.is_household_owner(p_household_id) then
    raise exception 'Only the owner can delete the household';
  end if;

  delete from public.households where id = p_household_id;

  -- Recreate empty owned household if user has none left
  select id into v_new_own_id from public.households where owner_user_id = v_user_id limit 1;

  if v_new_own_id is null then
    insert into public.households (name, owner_user_id, setup_status, invite_token)
    values ('Mi casa', v_user_id, 'dormant', public.gen_invite_token())
    returning id into v_new_own_id;

    insert into public.household_members (household_id, user_id, role)
    values (v_new_own_id, v_user_id, 'owner');

    insert into public.household_state (household_id)
    values (v_new_own_id);
  end if;

  update public.user_profiles
  set active_household_id = v_new_own_id
  where user_id = v_user_id;
end;
$$;

revoke all on function public.delete_household(uuid) from public;
grant execute on function public.delete_household(uuid) to authenticated;
revoke execute on function public.delete_household(uuid) from anon;

-- ── Activate menu (household-scoped) ────────────────────────────

create or replace function public.activate_household_menu(p_menu_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_household_id uuid;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  select household_id into v_household_id
  from public.user_menus
  where id = p_menu_id
    and (user_id = v_user_id or (household_id is not null and public.is_household_owner(household_id)))
  limit 1;

  if v_household_id is null then
    -- Fallback: legacy user-scoped menus
    if not exists (select 1 from public.user_menus where user_id = v_user_id and id = p_menu_id) then
      raise exception 'Menu not found';
    end if;

    update public.user_menus set is_active = false where user_id = v_user_id and is_active;
    update public.user_menus set is_active = true where user_id = v_user_id and id = p_menu_id;
    return;
  end if;

  if not public.is_household_owner(v_household_id) then
    raise exception 'Only the owner can activate menus';
  end if;

  update public.user_menus
  set is_active = false
  where household_id = v_household_id and is_active;

  update public.user_menus
  set is_active = true
  where household_id = v_household_id and id = p_menu_id;
end;
$$;

revoke all on function public.activate_household_menu(text) from public;
grant execute on function public.activate_household_menu(text) to authenticated;
revoke execute on function public.activate_household_menu(text) from anon;

-- Keep legacy RPC working
create or replace function public.activate_user_menu(p_menu_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.activate_household_menu(p_menu_id);
end;
$$;
