-- ═══ Enlaces con llave: mandar una receta por WhatsApp ═════════════════════
--
-- Hasta hoy un enlace a una receta (?r=<id>) solo abría algo si quien lo
-- tocaba ya podía verla por las políticas de 0046: cuenta abierta del autor,
-- o conexión aceptada. Para mandarle una receta a tu hermana eso es un peaje
-- absurdo: tenía que hacerse cuenta, pedirte conexión y esperar a que
-- aceptaras... para ver algo que TÚ le habías mandado.
--
-- El enlace lleva ahora una llave (token) que solo el dueño puede generar.
-- Quien tiene la llave ve la receta, sin sesión y sin conectar: el modelo de
-- "cualquiera con el enlace". Mandar el enlace ES el consentimiento, así que
-- la llave abre también recetas en 'private': publicar en Gente y compartir
-- por enlace son dos actos distintos, y el segundo no exige el primero.
--
-- La llave vive en su propia tabla y no como columna de user_recipes: las
-- políticas de lectura de user_recipes enseñan la fila ENTERA a las
-- conexiones (y con cuenta abierta, a cualquiera), y una llave que se lee al
-- pasar no es una llave. Aquí solo la ve el dueño; se crea desde una función.

-- ── 1. La tabla de llaves ───────────────────────────────────────────────────
create table if not exists public.recipe_share_links (
  recipe_id  text primary key references public.user_recipes(id) on delete cascade,
  owner_id   uuid not null references auth.users(id) on delete cascade,
  token      text not null unique,
  created_at timestamptz not null default now()
);

comment on table public.recipe_share_links is
  'Llave por receta para el enlace "cualquiera con el enlace". Solo el dueño la ve; solo recipe_share_token() la crea (0055).';

alter table public.recipe_share_links enable row level security;

drop policy if exists "Owners read their share links" on public.recipe_share_links;
create policy "Owners read their share links"
  on public.recipe_share_links for select
  using (owner_id = (select auth.uid()));

-- Sin políticas de escritura a propósito: la llave nace solo en la función de
-- abajo, que comprueba que la receta es tuya.

-- ── 2. Pedir la llave de una receta mía ────────────────────────────────────
-- Idempotente: la segunda vez devuelve la misma. Un enlace que cambiara cada
-- vez que pulsas "compartir" invalidaría el que mandaste ayer.
create or replace function public.recipe_share_token(p_recipe text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_token text;
begin
  if v_me is null or p_recipe is null then
    raise exception 'sin sesión';
  end if;
  if not exists (
    select 1 from public.user_recipes where id = p_recipe and owner_id = v_me
  ) then
    raise exception 'esa receta no es tuya';
  end if;

  insert into public.recipe_share_links (recipe_id, owner_id, token)
  values (p_recipe, v_me, public.gen_invite_token())
  on conflict (recipe_id) do nothing;

  select token into v_token from public.recipe_share_links where recipe_id = p_recipe;
  return v_token;
end;
$$;

revoke all on function public.recipe_share_token(text) from public;
grant execute on function public.recipe_share_token(text) to authenticated;

-- ── 3. Abrir una receta desde un enlace ────────────────────────────────────
-- Una sola puerta para el cliente y para la preview de WhatsApp (api/). Tres
-- respuestas posibles:
--
--   ok      → la receta entera. Con llave válida, siendo el dueño, o si las
--             políticas de 0046 ya la dejaban ver (cuenta abierta / conexión).
--   locked  → publicada pero para conexiones, y esta persona no lo es: nombre,
--             foto y de quién es, para poder pedir conexión. Ni ingredientes
--             ni pasos.
--   gone    → no existe, es privada sin llave, o hay un bloqueo por medio.
--             Sin distinguir entre ellas: una receta privada no debe delatar
--             ni su nombre.
create or replace function public.recipe_from_link(p_recipe text, p_token text default null)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  r public.user_recipes%rowtype;
  v_owner public.social_profiles%rowtype;
  v_key boolean := false;
begin
  select * into r from public.user_recipes where id = p_recipe;
  if not found then
    return jsonb_build_object('status', 'gone');
  end if;

  -- Bloqueo en cualquier dirección: ni con llave.
  if v_me is not null and v_me <> r.owner_id and public.is_blocked(v_me, r.owner_id) then
    return jsonb_build_object('status', 'gone');
  end if;

  if p_token is not null then
    v_key := exists (
      select 1 from public.recipe_share_links
      where recipe_id = r.id and token = p_token
    );
  end if;

  if v_key
     or r.owner_id = v_me
     or (
       r.visibility <> 'private'
       and (
         public.profile_is_open(r.owner_id)
         or (v_me is not null and public.is_following(v_me, r.owner_id))
       )
     )
  then
    return jsonb_build_object('status', 'ok', 'recipe', to_jsonb(r));
  end if;

  if r.visibility <> 'private' then
    select * into v_owner from public.social_profiles where user_id = r.owner_id;
    return jsonb_build_object(
      'status', 'locked',
      'preview', jsonb_build_object(
        'id', r.id,
        'name', r.name,
        'photo', r.photo,
        'linked_catalog_id', r.linked_catalog_id,
        'base_dish_id', r.base_dish_id,
        'owner', jsonb_build_object(
          'user_id', r.owner_id,
          'username', v_owner.username,
          'display_name', v_owner.display_name,
          'avatar_url', v_owner.avatar_url
        )
      )
    );
  end if;

  return jsonb_build_object('status', 'gone');
end;
$$;

revoke all on function public.recipe_from_link(text, text) from public;
grant execute on function public.recipe_from_link(text, text) to anon, authenticated;
