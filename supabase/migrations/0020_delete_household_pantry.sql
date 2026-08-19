-- Vaciar hogar must wipe En casa / Inventario for that household.
-- Pantry rows often have household_id null (pre-migration or client without scope);
-- cascade on households only removes rows with a matching household_id.

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

  delete from public.user_pantry
  where household_id = p_household_id
     or (user_id = v_user_id and household_id is null);

  delete from public.households where id = p_household_id;

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
