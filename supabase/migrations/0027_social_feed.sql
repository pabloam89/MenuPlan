-- ═══ Feed social ═══════════════════════════════════════════════════════════
--
-- Reaprovecha lo que ya existía sin usarse desde 0003_user_data.sql:
--   · user_follows (grafo dirigido) + are_mutual_follows()
--   · user_recipes.visibility ('public' | 'friends' | 'private') con sus
--     políticas — NO se tocan aquí: público lo lee cualquiera, 'friends' sigue
--     pidiendo seguimiento mutuo. Seguir a alguien (asimétrico) te deja ver lo
--     suyo público; ser amigos (mutuo) desbloquea además lo de 'friends'.
--
-- Lo que añade:
--   1. social_profiles — la cara pública, en tabla APARTE de user_profiles.
--   2. shared_menus    — instantánea curada de un menú publicado.
--   3. atribución de copia en user_recipes.
--   4. is_following() + RPCs de contadores, búsqueda y estadísticas.
--
-- ── Por qué social_profiles no es user_profiles ────────────────────────────
-- user_profiles guarda `email` en la misma fila. Abrir su SELECT para que se
-- vean los perfiles filtraría el correo de todos los usuarios de golpe, y una
-- vista encima de una tabla con RLS es justo el tipo de atajo que acaba en
-- fuga. Tabla nueva, sin un solo dato de contacto dentro.
--
-- ── Por qué shared_menus y no `visibility` en user_menu_weeks ──────────────
-- user_menu_weeks lleva `shopping` (la lista de la compra) y `schedule` (qué
-- días come cada uno fuera de casa) en la misma fila que el plan. Abrir esa
-- tabla por RLS comparte esas dos columnas quiera o no el dueño. Además el
-- menú vivo se sigue editando después de compartirlo.
-- Por eso publicar es una INSTANTÁNEA: el cliente construye la proyección
-- (platos por día + avatares de quién come) y la escribe aquí. Las tablas
-- privadas no cambian ni una política, y lo publicado no se mueve solo.

-- ── Visibilidad ────────────────────────────────────────────────────────────
-- private   : por defecto. No apareces en búsquedas ni en el feed de nadie.
-- followers : te encuentran por nombre y ven tu contenido quienes te siguen.
-- public    : cualquiera, incluido anónimo.
do $$ begin
  create type public.social_visibility as enum ('private', 'followers', 'public');
exception when duplicate_object then null;
end $$;


-- ── 1. Perfil público ──────────────────────────────────────────────────────

create table if not exists public.social_profiles (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  -- Handle para buscar y para la URL. Minúsculas, dígitos, guion bajo y punto.
  username     text
                 constraint chk_social_username_format
                 check (username is null or username ~ '^[a-z0-9._]{3,24}$'),
  display_name text not null default '',
  avatar_url   text,
  bio          text
                 constraint chk_social_bio_len check (bio is null or length(bio) <= 240),
  visibility   public.social_visibility not null default 'private',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

alter table public.social_profiles enable row level security;

-- Unicidad sin depender de la extensión citext.
create unique index if not exists uq_social_profiles_username
  on public.social_profiles (lower(username))
  where username is not null;

create index if not exists idx_social_profiles_visible
  on public.social_profiles (visibility)
  where visibility <> 'private';

drop policy if exists "Owner manages own social profile" on public.social_profiles;
create policy "Owner manages own social profile"
  on public.social_profiles for all
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- El perfil en sí es visible en cuanto sales de 'private' — así te pueden
-- encontrar y decidir si te siguen. Lo que se gatea es el CONTENIDO, no la
-- ficha: ver las recetas/menús de un perfil 'followers' exige seguirle.
drop policy if exists "Opted-in social profiles are readable" on public.social_profiles;
create policy "Opted-in social profiles are readable"
  on public.social_profiles for select
  using (visibility <> 'private');

drop trigger if exists trg_social_profiles_updated_at on public.social_profiles;
create trigger trg_social_profiles_updated_at
  before update on public.social_profiles
  for each row execute function public.set_updated_at();


-- ── 2. Seguimiento (helper) ────────────────────────────────────────────────
-- SECURITY DEFINER por lo mismo que are_mutual_follows(): las políticas de
-- user_follows solo dejan ver las filas donde estás implicado, así que una
-- policy que consultase la tabla directamente se bloquearía a sí misma.
create or replace function public.is_following(p_follower uuid, p_followee uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.user_follows
    where follower_id = p_follower and followee_id = p_followee
  );
$$;

revoke all on function public.is_following(uuid, uuid) from public;
grant execute on function public.is_following(uuid, uuid) to anon, authenticated;


-- ── 3. Menús publicados ────────────────────────────────────────────────────
--
-- `payload` es una proyección construida en el cliente, versionada con "v".
-- Contrato v1 — lo que SÍ lleva y lo que NUNCA debe llevar:
--
--   {
--     "v": 1,
--     "weeks": [{
--       "weekStart": "2026-09-01",
--       "days": [{ "day": "Lun",
--                  "meals": [{ "slot": "Comida",
--                              "dishes": [{ "name": "...",
--                                           "recipeId": "carnes_002",
--                                           "source": "catalog" | "user",
--                                           "readable": true }],
--                              "eaters": ["m1", "m2"] }] }]
--     }],
--     "members": [{ "id": "m1", "avatar": "...", "role": "adulto" | "nino" }]
--   }
--
--   NUNCA: lista de la compra, presupuesto, precios, horarios de fuera de
--   casa, alergias, ni nombres o edades de los miembros. Los avatares van
--   porque el dueño eligió compartir "con quién", pero anónimos: dibujo y
--   rol, nada que identifique a un menor.
--
--   `readable` lo calcula el cliente al publicar: false para recetas propias
--   que siguen en privado. El nombre del plato se ve siempre; la receta solo
--   se abre si es de catálogo o su visibility la deja leer.

create table if not exists public.shared_menus (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references auth.users(id) on delete cascade,
  -- El user_menus.id de origen: republicar el mismo menú lo actualiza en vez
  -- de duplicarlo en el feed.
  menu_id     text not null,
  title       text,
  week_start  date,
  week_end    date,
  payload     jsonb not null,
  visibility  public.social_visibility not null default 'followers',
  copy_count  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint uq_shared_menus_source unique (owner_id, menu_id)
);

alter table public.shared_menus enable row level security;

create index if not exists idx_shared_menus_feed
  on public.shared_menus (created_at desc)
  where visibility <> 'private';

create index if not exists idx_shared_menus_owner
  on public.shared_menus (owner_id, created_at desc);

drop policy if exists "Owner manages own shared menus" on public.shared_menus;
create policy "Owner manages own shared menus"
  on public.shared_menus for all
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

drop policy if exists "Public shared menus readable" on public.shared_menus;
create policy "Public shared menus readable"
  on public.shared_menus for select
  using (visibility = 'public');

drop policy if exists "Followers read followers-only menus" on public.shared_menus;
create policy "Followers read followers-only menus"
  on public.shared_menus for select
  using (visibility = 'followers' and public.is_following((select auth.uid()), owner_id));

drop trigger if exists trg_shared_menus_updated_at on public.shared_menus;
create trigger trg_shared_menus_updated_at
  before update on public.shared_menus
  for each row execute function public.set_updated_at();


-- ── 4. Atribución de copia ─────────────────────────────────────────────────
-- Copiar es una INSTANTÁNEA, no un enlace vivo: la receta pasa a ser tuya y
-- no cambia si el original se edita o se borra. Estas columnas son solo para
-- poder decir "de @quien" y para contar copias.
alter table public.user_recipes
  add column if not exists copied_from_recipe_id text;

alter table public.user_recipes
  add column if not exists copied_from_owner_id uuid references auth.users(id) on delete set null;

comment on column public.user_recipes.copied_from_recipe_id is
  'Receta de origen si esta se copió del feed. Instantánea: no se sincroniza con el original.';
comment on column public.user_recipes.copied_from_owner_id is
  'Autor original, para la atribución. ON DELETE SET NULL: si borra su cuenta, la copia sobrevive sin firma.';


-- ── 5. Contadores de perfil ────────────────────────────────────────────────
-- Las políticas de user_follows solo dejan ver las filas donde estás
-- implicado, así que desde el cliente es imposible contar los seguidores de
-- otro. Esto lo resuelve sin abrir la tabla.
create or replace function public.social_profile_counts(p_user uuid)
returns table (followers bigint, following bigint, recipes bigint, menus bigint)
language sql
security definer
stable
set search_path = public
as $$
  select
    -- Solo lo aceptado: una solicitud pendiente no es un seguidor todavia, y
    -- contarla inflaba el numero justo antes de que decidieras.
    (select count(*) from public.user_follows
       where followee_id = p_user and status = 'accepted'),
    (select count(*) from public.user_follows
       where follower_id = p_user and status = 'accepted'),
    (select count(*) from public.user_recipes
       where owner_id = p_user and visibility <> 'private'),
    (select count(*) from public.shared_menus
       where owner_id = p_user and visibility <> 'private');
$$;

revoke all on function public.social_profile_counts(uuid) from public;
grant execute on function public.social_profile_counts(uuid) to anon, authenticated;


-- ── 6. Búsqueda de perfiles ────────────────────────────────────────────────
-- RPC en vez de un SELECT abierto: con dos caracteres mínimos y un tope de
-- filas no se puede barrer la base de usuarios entera a base de prefijos.
create or replace function public.search_social_profiles(p_query text)
returns table (user_id uuid, username text, display_name text, avatar_url text, visibility public.social_visibility)
language sql
security definer
stable
set search_path = public
as $$
  select p.user_id, p.username, p.display_name, p.avatar_url, p.visibility
  from public.social_profiles p
  where p.visibility <> 'private'
    and length(coalesce(trim(p_query), '')) >= 2
    and (
      lower(p.username) like lower(trim(p_query)) || '%'
      or lower(p.display_name) like '%' || lower(trim(p_query)) || '%'
    )
  order by
    -- Coincidencia exacta de handle primero, luego por handle para que el
    -- orden sea estable entre llamadas.
    (lower(p.username) = lower(trim(p_query))) desc,
    p.username nulls last
  limit 20;
$$;

revoke all on function public.search_social_profiles(text) from public;
grant execute on function public.search_social_profiles(text) to anon, authenticated;


-- ── 7. Estadísticas públicas de una receta ─────────────────────────────────
--
-- Tres números, y los tres salen de tablas que ya existen — no hay contadores
-- denormalizados que mantener ni triggers que se puedan desincronizar:
--   · me gusta / no me gusta → recipe_votes
--   · veces incluida en un menú → user_menu_recipes
--
-- SECURITY DEFINER por lo de siempre: las políticas de esas dos tablas solo
-- dejan ver TUS filas, así que desde el cliente el recuento daría 0 o 1. Lo
-- que sale de aquí son agregados, nunca quién votó qué.
--
-- Ojo al `__`: en los menús el id de receta puede venir prefijado por el grupo
-- ("<groupId>__<recipeId>", ver handleSetFavoriteScope en App.jsx), así que se
-- normaliza antes de contar o el recuento saldría a cero.
create or replace function public.recipe_social_stats(p_ids text[])
returns table (recipe_id text, likes bigint, dislikes bigint, used bigint)
language sql
security definer
stable
set search_path = public
-- El alias de `unnest` se llama t(rid) y NO `id`, y se referencia siempre
-- cualificado. Con `... as id` a secas, la subconsulta `where v.recipe_id = id`
-- no comparaba con el elemento de p_ids: Postgres resuelve un nombre sin
-- cualificar contra la tabla más INTERNA primero, encontraba recipe_votes.id
-- (bigserial, ver 0003_analytics_feedback_votes.sql) y reventaba con
-- "operator does not exist: text = bigint". user_menu_recipes no tiene columna
-- `id`, así que la tercera subconsulta sí funcionaba — misma trampa, latente.
as $$
  select
    t.rid as recipe_id,
    (select count(*) from public.recipe_votes v
       where v.recipe_id = t.rid and v.vote = 'up'),
    (select count(*) from public.recipe_votes v
       where v.recipe_id = t.rid and v.vote = 'down'),
    (select count(*) from public.user_menu_recipes m
       where regexp_replace(m.recipe_id, '^.*__', '') = t.rid)
  from unnest(p_ids) as t(rid);
$$;

revoke all on function public.recipe_social_stats(text[]) from public;
grant execute on function public.recipe_social_stats(text[]) to anon, authenticated;
