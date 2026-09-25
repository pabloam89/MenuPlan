-- ═══ Enlaces con llave: mandar una SEMANA por WhatsApp ═════════════════════
--
-- Hermana de 0055, y por la misma razón. Allí el problema era que mandarle una
-- receta a tu hermana le costaba hacerse cuenta, pedirte conexión y esperar.
-- Aquí es lo mismo con la semana entera, que es lo que la gente manda de
-- verdad al grupo de casa: «esto es lo que vamos a comer».
--
-- ── Por qué NO es publicar en Gente ────────────────────────────────────────
--
-- Publicar y compartir por enlace son dos actos distintos —lo dice 0055 y aquí
-- vale igual—: publicar es ponerlo en el feed para quien te siga; compartir es
-- mandárselo a alguien. El segundo no exige el primero, así que el menú viaja
-- en `visibility = 'private'`: no sale en ningún carrusel, y solo lo abre quien
-- tenga la llave.
--
-- ── Por qué se apoya en shared_menus ───────────────────────────────────────
--
-- Porque ya guarda lo que hace falta: un `payload` jsonb AUTOCONTENIDO con la
-- semana entera (lib/sharedMenu.js#buildSharedMenuPayload). Quien abre el
-- enlace no toca ni `user_menus` ni `user_menu_recipes` ni las políticas del
-- dueño — lee una foto de ese momento. Y la restricción única (owner_id,
-- menu_id) hace que volver a compartir ACTUALICE la foto en vez de duplicarla,
-- que es justo lo que se quiere: el enlace que mandaste ayer sigue valiendo y
-- enseña lo de hoy.

-- ── 1. La tabla de llaves ───────────────────────────────────────────────────
-- Igual que en 0055, la llave vive aparte y no como columna de shared_menus:
-- las políticas de lectura del feed enseñan la fila entera, y una llave que se
-- lee al pasar no es una llave.
create table if not exists public.menu_share_links (
  shared_menu_id uuid primary key references public.shared_menus(id) on delete cascade,
  owner_id       uuid not null references auth.users(id) on delete cascade,
  token          text not null unique,
  created_at     timestamptz not null default now()
);

comment on table public.menu_share_links is
  'Llave por menú compartido para el enlace "cualquiera con el enlace". Solo el dueño la ve; solo menu_share_token() la crea (0056).';

alter table public.menu_share_links enable row level security;

drop policy if exists "Owners read their menu share links" on public.menu_share_links;
create policy "Owners read their menu share links"
  on public.menu_share_links for select
  using (owner_id = (select auth.uid()));

-- Sin políticas de escritura a propósito: la llave nace solo en la función de
-- abajo, que comprueba que el menú es tuyo.

-- ── 2. Pedir la llave de un menú mío ───────────────────────────────────────
-- Idempotente, como la de recetas: la segunda vez devuelve la misma llave. Un
-- enlace que cambiara en cada «compartir» invalidaría el que mandaste ayer.
--
-- Recibe el `menu_id` de la app (user_menus.id, un texto) y no el uuid, porque
-- es lo que la pantalla tiene a mano. Devuelve las dos cosas que hacen falta
-- para montar la URL: el uuid de la fila y la llave.
create or replace function public.menu_share_token(p_menu text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_id uuid;
  v_token text;
begin
  if v_me is null or p_menu is null then
    raise exception 'sin sesión';
  end if;

  select id into v_id
  from public.shared_menus
  where owner_id = v_me and menu_id = p_menu;

  if v_id is null then
    raise exception 'ese menú no está compartido todavía';
  end if;

  insert into public.menu_share_links (shared_menu_id, owner_id, token)
  values (v_id, v_me, public.gen_invite_token())
  on conflict (shared_menu_id) do nothing;

  select token into v_token from public.menu_share_links where shared_menu_id = v_id;
  return jsonb_build_object('id', v_id, 'token', v_token);
end;
$$;

-- OJO con el `revoke ... from public`: NO basta. Supabase trae un
-- `alter default privileges` que concede EXECUTE a `anon` y `authenticated`
-- sobre las funciones nuevas del esquema public, y eso es una concesión
-- DIRECTA que quitarle a `public` no toca. Comprobado en vivo: sin la línea
-- de abajo, `anon` podía llamar a esto (igual que a recipe_share_token, 0055).
--
-- No era un agujero —la función empieza mirando `auth.uid()` y responde «sin
-- sesión»—, pero una concesión que dice lo contrario de lo que se pretende es
-- una trampa para el siguiente que la lea.
revoke all on function public.menu_share_token(text) from public;
revoke execute on function public.menu_share_token(text) from anon;
grant execute on function public.menu_share_token(text) to authenticated;

-- ── 3. Quitar la llave ──────────────────────────────────────────────────────
-- Un enlace que no se puede retirar no es un enlace, es una filtración. Borrar
-- la llave deja el menú donde estaba y cierra la puerta a quien la tuviera.
create or replace function public.menu_share_revoke(p_menu text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_n integer;
begin
  if v_me is null or p_menu is null then
    raise exception 'sin sesión';
  end if;
  delete from public.menu_share_links l
  using public.shared_menus m
  where l.shared_menu_id = m.id
    and m.owner_id = v_me
    and m.menu_id = p_menu;
  get diagnostics v_n = row_count;
  return v_n > 0;
end;
$$;

revoke all on function public.menu_share_revoke(text) from public;
revoke execute on function public.menu_share_revoke(text) from anon;
grant execute on function public.menu_share_revoke(text) to authenticated;

-- ── 4. Abrir un menú desde un enlace ───────────────────────────────────────
-- Una sola puerta para el cliente y para la preview de WhatsApp (api/). Dos
-- respuestas, y no tres como en las recetas: un menú no tiene el estado
-- «publicado pero solo para conexiones» que justificaba el `locked`.
--
--   ok    → el payload entero, con de quién es, para poder pintarlo.
--   gone  → no existe, la llave no vale, o hay un bloqueo por medio. Sin
--           distinguir entre ellas: un menú privado no debe delatar ni que
--           existe.
create or replace function public.menu_from_link(p_id uuid, p_token text default null)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  m public.shared_menus%rowtype;
  v_owner public.social_profiles%rowtype;
  v_key boolean := false;
begin
  select * into m from public.shared_menus where id = p_id;
  if not found then
    return jsonb_build_object('status', 'gone');
  end if;

  -- Bloqueo en cualquier dirección: ni con llave.
  if v_me is not null and v_me <> m.owner_id and public.is_blocked(v_me, m.owner_id) then
    return jsonb_build_object('status', 'gone');
  end if;

  if p_token is not null then
    v_key := exists (
      select 1 from public.menu_share_links
      where shared_menu_id = m.id and token = p_token
    );
  end if;

  -- Con llave, siendo el dueño, o si ya estaba en el feed para todo el mundo.
  if not (v_key or m.owner_id = v_me or m.visibility = 'public') then
    return jsonb_build_object('status', 'gone');
  end if;

  select * into v_owner from public.social_profiles where user_id = m.owner_id;

  return jsonb_build_object(
    'status', 'ok',
    'id', m.id,
    'title', m.title,
    'weekStart', m.week_start,
    'weekEnd', m.week_end,
    'payload', m.payload,
    'owner', case when v_owner.user_id is null then null else jsonb_build_object(
      'username', v_owner.username,
      'displayName', v_owner.display_name,
      'avatarUrl', v_owner.avatar_url
    ) end
  );
end;
$$;

revoke all on function public.menu_from_link(uuid, text) from public;
grant execute on function public.menu_from_link(uuid, text) to anon, authenticated;
