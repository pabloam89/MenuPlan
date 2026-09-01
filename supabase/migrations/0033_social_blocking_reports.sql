-- ═══ Feed social: bloquear y reportar ══════════════════════════════════════
--
-- Continúa 0027_social_feed.sql y 0028_social_requests_comments.sql. Es lo
-- último que faltaba antes de dejar que gente de verdad use el Feed: sin
-- esto, cualquier cosa desagradable que alguien publique o comente no tiene
-- salida — ni para la víctima (bloquear) ni para nadie que lo vea (reportar).
--
-- Lo que añade:
--   1. blocked_users — bloqueo, con lo que implica en cascada.
--   2. content_reports — reportes, sin RLS de lectura para el autor: solo tú
--      y (cuando exista panel) moderación deben poder leer tus reportes.

-- ── 1. Bloquear ─────────────────────────────────────────────────────────────
--
-- Bloquear es DIRIGIDO y no requiere que el otro sepa nada — igual que
-- silenciar en cualquier red. No es lo mismo que dejar de seguir: bloquear
-- además impide que ESA persona te siga, te comente o te encuentre, cosas que
-- dejar de seguir no toca.
create table if not exists public.blocked_users (
  blocker_id uuid not null references auth.users(id) on delete cascade,
  blocked_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  constraint chk_no_self_block check (blocker_id <> blocked_id)
);

alter table public.blocked_users enable row level security;

create index if not exists idx_blocked_by_blocked on public.blocked_users (blocked_id);

-- Cada uno ve y gestiona solo su propia lista de bloqueados — ni siquiera el
-- bloqueado puede saber que lo está (no hay policy de select para su lado).
drop policy if exists "Users manage own blocklist" on public.blocked_users;
create policy "Users manage own blocklist"
  on public.blocked_users for all
  using ((select auth.uid()) = blocker_id)
  with check ((select auth.uid()) = blocker_id);

create or replace function public.is_blocked(a uuid, b uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  -- En cualquier dirección: si A bloqueó a B o B bloqueó a A, no hay relación
  -- posible entre los dos. Quien bloquea no tiene por qué seguir viendo a
  -- quien le bloqueó a él tampoco.
  select exists (
    select 1 from public.blocked_users
    where (blocker_id = a and blocked_id = b)
       or (blocker_id = b and blocked_id = a)
  );
$$;

revoke all on function public.is_blocked(uuid, uuid) from public;
grant execute on function public.is_blocked(uuid, uuid) to anon, authenticated;

/**
 * Bloquear deshace toda relación existente entre los dos, en las dos
 * direcciones — si no, bloquear a alguien que ya te seguía lo dejaría
 * viéndote igual hasta que hiciera otra petición.
 */
create or replace function public.block_user(p_target uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
begin
  if v_me is null or p_target is null or v_me = p_target then
    raise exception 'bloqueo no permitido';
  end if;

  insert into public.blocked_users (blocker_id, blocked_id)
  values (v_me, p_target)
  on conflict (blocker_id, blocked_id) do nothing;

  delete from public.user_follows
   where (follower_id = v_me and followee_id = p_target)
      or (follower_id = p_target and followee_id = v_me);
end;
$$;

revoke all on function public.block_user(uuid) from public;
grant execute on function public.block_user(uuid) to authenticated;

create or replace function public.unblock_user(p_target uuid)
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.blocked_users
   where blocker_id = auth.uid() and blocked_id = p_target;
$$;

revoke all on function public.unblock_user(uuid) from public;
grant execute on function public.unblock_user(uuid) to authenticated;

-- El bloqueo entra en las mismas comprobaciones que ya deciden si veis
-- contenido el uno del otro: is_following() (feed, mazo, comentarios) y
-- are_mutual_follows() (recetas 'friends'). Redefinirlas aquí es más seguro
-- que tocar cada policy que las usa: todo lo que ya confía en ellas queda
-- cerrado sin cambiar una sola policy.
create or replace function public.is_following(p_follower uuid, p_followee uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.user_follows
    where follower_id = p_follower
      and followee_id = p_followee
      and status = 'accepted'
  )
  and not public.is_blocked(p_follower, p_followee);
$$;

create or replace function public.are_mutual_follows(a uuid, b uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (select 1 from public.user_follows
                 where follower_id = a and followee_id = b and status = 'accepted')
     and exists (select 1 from public.user_follows
                 where follower_id = b and followee_id = a and status = 'accepted')
     and not public.is_blocked(a, b);
$$;

-- Igual en el punto de entrada de seguir: sin esto, alguien bloqueado podría
-- seguir de todos modos con un perfil público (o pedirlo, con uno privado).
create or replace function public.request_follow(p_target uuid)
returns public.follow_status
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_vis public.social_visibility;
  v_status public.follow_status;
begin
  if v_me is null or p_target is null or v_me = p_target then
    raise exception 'follow no permitido';
  end if;

  if public.is_blocked(v_me, p_target) then
    raise exception 'no puedes seguir a este perfil';
  end if;

  select visibility into v_vis from public.social_profiles where user_id = p_target;
  if v_vis is null or v_vis = 'private' then
    raise exception 'ese perfil no acepta seguidores';
  end if;

  v_status := case when v_vis = 'public' then 'accepted' else 'pending' end;

  insert into public.user_follows (follower_id, followee_id, status)
  values (v_me, p_target, v_status)
  on conflict (follower_id, followee_id) do nothing;

  select status into v_status from public.user_follows
   where follower_id = v_me and followee_id = p_target;
  return v_status;
end;
$$;

-- Comentar tampoco se salta el bloqueo: hoy solo hacía falta ver el
-- contenido (is_following), y un perfil 'public' te deja verlo aunque tu
-- dueño te haya bloqueado a ti.
drop policy if exists "Author writes own comments" on public.social_comments;
create policy "Author writes own comments"
  on public.social_comments for insert
  with check (
    (select auth.uid()) = author_id
    and not public.is_blocked((select auth.uid()), target_owner_id)
  );


-- ── 2. Reportar ─────────────────────────────────────────────────────────────
--
-- Vale para un perfil, una receta, un menú o un comentario — de ahí que
-- 'profile' se sume a comment_target en vez de crear un enum propio.
alter type public.comment_target add value if not exists 'profile';

do $$ begin
  create type public.report_reason as enum ('spam', 'inappropriate', 'harassment', 'other');
exception when duplicate_object then null;
end $$;

create table if not exists public.content_reports (
  id          uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references auth.users(id) on delete cascade,
  target_type public.comment_target not null,
  -- uuid (comentario) o text (receta/menú/perfil) en la misma columna texto,
  -- igual que target_id en social_comments — mismo patrón, misma razón.
  target_id   text not null,
  reason      public.report_reason not null,
  note        text
                constraint chk_report_note_len check (note is null or length(note) <= 500),
  status      text not null default 'open'
                constraint chk_report_status check (status in ('open', 'reviewed', 'dismissed')),
  created_at  timestamptz not null default now()
);

alter table public.content_reports enable row level security;

create index if not exists idx_reports_open
  on public.content_reports (created_at desc)
  where status = 'open';

-- Sin límite de uno por persona y contenido: si alguien insiste en spamear
-- reportes sobre lo mismo, eso en sí es una señal para moderación, no un caso
-- a bloquear con una constraint unique.
drop policy if exists "Users file their own reports" on public.content_reports;
create policy "Users file their own reports"
  on public.content_reports for insert
  with check ((select auth.uid()) = reporter_id);

-- Cada uno ve solo los reportes que ha hecho — para poder decirle "ya lo
-- reportaste" y no para que nadie pueda leer los ajenos. No hay policy de
-- lectura para moderación todavía: eso espera al panel, que es su propio
-- proyecto y no algo que improvisar aquí con una columna de "es admin".
drop policy if exists "Users see own filed reports" on public.content_reports;
create policy "Users see own filed reports"
  on public.content_reports for select
  using ((select auth.uid()) = reporter_id);

comment on table public.content_reports is
  'Reportes de usuario. Sin policy de lectura para moderación aún — pendiente del panel de moderación.';
