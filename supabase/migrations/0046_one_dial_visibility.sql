-- ── 0046: un solo dial — quién ve lo que publicas ──────────────────────────
--
-- Hasta hoy convivían TRES audiencias con tres nombres: el perfil
-- (private/followers/public, que solo gobernaba búsqueda y seguibilidad),
-- la receta ('friends' = seguimiento MUTUO, o 'public', elegido ítem a
-- ítem) y el menú ('followers' fijo). Un dial que decía "Quién te ve" y no
-- tocaba el contenido, y una receta "Cualquiera" de un perfil "Nadie te ve"
-- que salía en el feed igual. Si el copy honesto de un ajuste no cabe en
-- una frase, el problema no es el copy.
--
-- El modelo nuevo cabe en una: LA CUENTA decide quién ve TODO lo publicado.
--
--   · Cerrada (defecto): te encuentran por tu nombre; lo publicado lo ven
--     solo las conexiones que aceptes.
--   · Abierta: lo publicado lo ve cualquiera; seguirte es solo suscribirse.
--
-- Por ítem queda UNA pregunta: publicado o no ('private' = no publicado).
-- El dial es RETROACTIVO: la RLS consulta el perfil del autor en cada
-- lectura, así que cerrar la cuenta cierra todo en el acto — que es lo que
-- cualquiera espera de ese interruptor. Y al estilo IG, cerrar NO expulsa a
-- los seguidores que ya tenías: se cierra la puerta a nuevos, no la de los
-- que dejaste entrar (decisión de producto del 2026-09-03).
--
-- 'private' de perfil se retira COMO ESTADO (no del enum: quitar valores de
-- un enum en Postgres es una obra, y dejarlo sin uso no rompe nada). Los
-- niveles viejos de receta ('friends'/'public') pasan a significar solo
-- "publicada". Ojo: una receta legacy en 'friends' (mutuo) pasa a verla
-- cualquier conexión aceptada — ensanche deliberado: bajo el modelo de
-- conexión mutua, follower y amigo convergen.

-- ── 1. El perfil pierde el modo invisible ──────────────────────────────────
update public.social_profiles set visibility = 'followers' where visibility = 'private';
alter table public.social_profiles alter column visibility set default 'followers';

comment on column public.social_profiles.visibility is
  'Quién ve lo que publicas. followers = cuenta cerrada (solo conexiones aceptadas); public = cuenta abierta (cualquiera). private ya no se usa como estado de perfil (0046).';

-- ── 2. ¿Cuenta abierta? Un solo sitio donde se responde ───────────────────
-- SECURITY DEFINER para que las políticas de recetas/menús puedan preguntar
-- sin depender de las políticas de social_profiles (y sin recursión).
create or replace function public.profile_is_open(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.social_profiles
    where user_id = p_user and visibility = 'public'
  );
$$;

revoke all on function public.profile_is_open(uuid) from public;
grant execute on function public.profile_is_open(uuid) to anon, authenticated;

-- ── 3. Recetas: la audiencia la pone el PERFIL del autor ──────────────────
drop policy if exists "Public recipes readable" on public.user_recipes;
drop policy if exists "Friends read friends recipes" on public.user_recipes;

-- Publicada + cuenta abierta -> cualquiera, incluido anónimo.
create policy "Published recipes of open accounts readable"
  on public.user_recipes for select
  using (visibility <> 'private' and public.profile_is_open(owner_id));

-- Publicada + cuenta cerrada -> tus conexiones aceptadas.
create policy "Published recipes readable by accepted followers"
  on public.user_recipes for select
  using (visibility <> 'private' and public.is_following((select auth.uid()), owner_id));

-- ── 4. Menús: exactamente la misma regla ───────────────────────────────────
drop policy if exists "Public shared menus readable" on public.shared_menus;
drop policy if exists "Followers read followers-only menus" on public.shared_menus;

create policy "Published menus of open accounts readable"
  on public.shared_menus for select
  using (visibility <> 'private' and public.profile_is_open(owner_id));

create policy "Published menus readable by accepted followers"
  on public.shared_menus for select
  using (visibility <> 'private' and public.is_following((select auth.uid()), owner_id));

-- ── 5. Aceptar = conectar: la vuelta se crea sola ──────────────────────────
-- Quien pidió conectar YA consintió la mutualidad al pedirla (el botón dice
-- "Conectar", no "déjame mirarte"), así que su fila de vuelta nace aceptada
-- sin segunda solicitud. Esto mata el baile de cuatro pasos y dos
-- aceptaciones que hacía falta para que dos personas se vieran mutuamente.
--
-- Si había solicitudes CRUZADAS (cada uno pidió al otro), aceptar una
-- resuelve las dos: dos peticiones cruzadas son dos consentimientos.
create or replace function public.accept_follow(p_follower uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
begin
  if v_me is null or p_follower is null or v_me = p_follower then
    raise exception 'aceptación no permitida';
  end if;

  update public.user_follows
     set status = 'accepted', responded_at = now()
   where followee_id = v_me and follower_id = p_follower and status = 'pending';

  -- Solo si había algo que aceptar: llamar esto en frío no fabrica vínculos.
  if found then
    insert into public.user_follows (follower_id, followee_id, status, responded_at)
    values (v_me, p_follower, 'accepted', now())
    on conflict (follower_id, followee_id)
    do update set status = 'accepted', responded_at = now()
    where user_follows.status = 'pending';
  end if;
end;
$$;

revoke all on function public.accept_follow(uuid) from public;
grant execute on function public.accept_follow(uuid) to authenticated;
