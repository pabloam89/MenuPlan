-- List household members with display info (for Miembros sheet).
-- Preview invite token → household name (for accept banner).

create or replace function public.list_household_members(p_household_id uuid)
returns jsonb
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
        case when hm.role = 'owner' then 0 else 1 end as sort_key,
        hm.joined_at
      from public.household_members hm
      left join public.user_profiles up on up.user_id = hm.user_id
      left join auth.users au on au.id = hm.user_id
      where hm.household_id = p_household_id
    ) sub
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.list_household_members(uuid) from public;
grant execute on function public.list_household_members(uuid) to authenticated;
revoke execute on function public.list_household_members(uuid) from anon;

create or replace function public.preview_household_invite(p_token text)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'householdId', h.id,
    'householdName', h.name
  )
  from public.households h
  where h.invite_token = trim(p_token)
  limit 1;
$$;

revoke all on function public.preview_household_invite(text) from public;
grant execute on function public.preview_household_invite(text) to authenticated;
revoke execute on function public.preview_household_invite(text) from anon;
