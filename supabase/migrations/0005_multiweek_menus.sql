-- Requiere public.set_updated_at(), ya creada en 0001_recipe_catalog.sql.

-- ── Menús ─────────────────────────────────────────────────────

create table if not exists public.user_menus (
  id            text not null,
  user_id       uuid not null references auth.users(id) on delete cascade,
  variety_pref  text not null default 'strict'
                  check (variety_pref in ('strict', 'moderate', 'relaxed')),
  is_favorite   boolean not null default false,
  is_active     boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  primary key (user_id, id)
);

alter table public.user_menus enable row level security;

create index if not exists idx_user_menus_recent
  on public.user_menus (user_id, created_at desc);

create unique index if not exists uq_user_menus_one_active
  on public.user_menus (user_id)
  where is_active;

drop policy if exists "Users manage own menus"
  on public.user_menus;

create policy "Users manage own menus"
  on public.user_menus
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop trigger if exists trg_user_menus_updated_at
  on public.user_menus;

create trigger trg_user_menus_updated_at
  before update on public.user_menus
  for each row execute function public.set_updated_at();


-- ── Semanas de cada menú ──────────────────────────────────────

create table if not exists public.user_menu_weeks (
  user_id        uuid not null,
  menu_id        text not null,
  week_start     date not null,
  week_end       date not null,
  week_offset    smallint not null check (week_offset >= 0),
  start_day_idx  smallint not null default 0
                   check (start_day_idx between 0 and 6),
  plan           jsonb not null default '{}'::jsonb,
  shopping       jsonb not null default '{"items":[]}'::jsonb,
  schedule       jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  primary key (user_id, menu_id, week_start),

  constraint fk_user_menu_weeks_menu
    foreign key (user_id, menu_id)
    references public.user_menus (user_id, id)
    on delete cascade,

  constraint chk_user_menu_weeks_range
    check (week_end >= week_start),

  constraint uq_user_menu_weeks_offset
    unique (user_id, menu_id, week_offset)
);

alter table public.user_menu_weeks enable row level security;

create index if not exists idx_user_menu_weeks_ordered
  on public.user_menu_weeks (user_id, menu_id, week_offset);

drop policy if exists "Users manage own menu weeks"
  on public.user_menu_weeks;

create policy "Users manage own menu weeks"
  on public.user_menu_weeks
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop trigger if exists trg_user_menu_weeks_updated_at
  on public.user_menu_weeks;

create trigger trg_user_menu_weeks_updated_at
  before update on public.user_menu_weeks
  for each row execute function public.set_updated_at();


-- ── Snapshots de recetas del menú ─────────────────────────────

create table if not exists public.user_menu_recipes (
  user_id         uuid not null,
  menu_id         text not null,
  recipe_id       text not null,
  recipe_snapshot jsonb not null,
  created_at      timestamptz not null default now(),

  primary key (user_id, menu_id, recipe_id),

  constraint fk_user_menu_recipes_menu
    foreign key (user_id, menu_id)
    references public.user_menus (user_id, id)
    on delete cascade
);

alter table public.user_menu_recipes enable row level security;

create index if not exists idx_user_menu_recipes_menu
  on public.user_menu_recipes (user_id, menu_id);

drop policy if exists "Users manage own menu recipes"
  on public.user_menu_recipes;

create policy "Users manage own menu recipes"
  on public.user_menu_recipes
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);


-- ── Cambio atómico del menú activo ────────────────────────────

create or replace function public.activate_user_menu(p_menu_id text)
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

  if not exists (
    select 1
    from public.user_menus
    where user_id = v_user_id
      and id = p_menu_id
  ) then
    raise exception 'Menu not found';
  end if;

  update public.user_menus
  set is_active = false
  where user_id = v_user_id
    and is_active;

  update public.user_menus
  set is_active = true
  where user_id = v_user_id
    and id = p_menu_id;
end;
$$;

revoke all
  on function public.activate_user_menu(text)
  from public;

grant execute
  on function public.activate_user_menu(text)
  to authenticated;

-- Belt-and-suspenders: the function already rejects any call with a null
-- auth.uid() ("Authentication required"), but PostgREST exposes RPC
-- endpoints to `anon` regardless of that internal check unless explicitly
-- revoked, which the database linter flags. Close it explicitly.
revoke execute
  on function public.activate_user_menu(text)
  from anon;
