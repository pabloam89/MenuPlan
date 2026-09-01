-- ═══ Feed social: solicitudes y comentarios ════════════════════════════════
--
-- Continúa 0027_social_feed.sql. Dos piezas que el modo social necesita para
-- funcionar de verdad:
--   1. Seguir puede requerir aprobación → solicitudes que aceptar o rechazar.
--   2. Comentarios en una receta o en un menú publicado.

-- ── 1. Seguir con aprobación ───────────────────────────────────────────────
--
-- Hasta ahora seguir era inmediato y asimétrico (tipo IG con cuenta pública).
-- Eso sirve mientras tu perfil es 'public', pero no cuando es 'followers': ahí
-- seguirte ES pedir acceso a tu contenido, y esa decisión tiene que ser tuya.
--
-- Por eso el estado vive en la propia fila de user_follows en vez de en una
-- tabla de solicitudes aparte: una solicitud aceptada y un seguimiento son la
-- misma cosa en dos momentos, y separarlos obligaría a mover filas de una
-- tabla a otra (y a que las dos pudieran discrepar).
do $$ begin
  create type public.follow_status as enum ('pending', 'accepted');
exception when duplicate_object then null;
end $$;

alter table public.user_follows
  add column if not exists status public.follow_status not null default 'accepted';

alter table public.user_follows
  add column if not exists responded_at timestamptz;

-- El feed pregunta "¿a quién sigo de verdad?" y el perfil "¿quién me espera?".
create index if not exists idx_follows_pending
  on public.user_follows (followee_id, created_at desc)
  where status = 'pending';

-- Quien te sigue no puede auto-aceptarse: la política de escritura del
-- seguidor solo cubre crear y borrar su propia fila. Aceptar o rechazar es un
-- UPDATE/DELETE del SEGUIDO, y para eso hacen falta estas dos políticas.
drop policy if exists "Followee resolves own requests" on public.user_follows;
create policy "Followee resolves own requests"
  on public.user_follows for update
  using ((select auth.uid()) = followee_id)
  with check ((select auth.uid()) = followee_id);

drop policy if exists "Followee can remove a follower" on public.user_follows;
create policy "Followee can remove a follower"
  on public.user_follows for delete
  using ((select auth.uid()) = followee_id);

-- is_following() pasa a exigir seguimiento ACEPTADO: si no, una solicitud
-- pendiente ya daría acceso al contenido y la aprobación no serviría de nada.
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
  );
$$;

-- Igual para "amigos": dos solicitudes cruzadas sin aceptar no son amistad.
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
                 where follower_id = b and followee_id = a and status = 'accepted');
$$;

/**
 * Seguir respetando la privacidad del otro: si su perfil es 'public' entra
 * directo; si no, queda pendiente de que lo apruebe. La decisión NO puede
 * quedar en el cliente — bastaría con mandar status='accepted' a mano.
 */
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

  select visibility into v_vis from public.social_profiles where user_id = p_target;
  -- Sin perfil público no hay a quién seguir: el opt-in es un acto explícito.
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

revoke all on function public.request_follow(uuid) from public;
grant execute on function public.request_follow(uuid) to authenticated;


-- ── 2. Comentarios ─────────────────────────────────────────────────────────
--
-- Valen para una receta (user_recipes.id, texto) o para un menú publicado
-- (shared_menus.id, uuid), así que el destino se guarda como tipo + id en
-- texto en vez de con dos claves foráneas excluyentes.
--
-- `target_owner_id` va desnormalizado a propósito: la política de lectura
-- necesita saber de quién es el contenido, y resolverlo con un JOIN contra
-- dos tablas que a su vez tienen RLS es la receta para una recursión de
-- políticas (el mismo problema que resolvió are_mutual_follows en 0003).
do $$ begin
  create type public.comment_target as enum ('recipe', 'menu');
exception when duplicate_object then null;
end $$;

create table if not exists public.social_comments (
  id              uuid primary key default gen_random_uuid(),
  target_type     public.comment_target not null,
  target_id       text not null,
  target_owner_id uuid not null references auth.users(id) on delete cascade,
  author_id       uuid not null references auth.users(id) on delete cascade,
  body            text not null
                    constraint chk_comment_body check (length(btrim(body)) between 1 and 500),
  created_at      timestamptz not null default now()
);

alter table public.social_comments enable row level security;

create index if not exists idx_comments_target
  on public.social_comments (target_type, target_id, created_at desc);

-- La bandeja del perfil: "qué me han comentado", lo más reciente primero.
create index if not exists idx_comments_inbox
  on public.social_comments (target_owner_id, created_at desc);

drop policy if exists "Author writes own comments" on public.social_comments;
create policy "Author writes own comments"
  on public.social_comments for insert
  with check ((select auth.uid()) = author_id);

-- Se leen los comentarios del contenido que puedes ver: el tuyo, el que
-- escribiste tú, o el de alguien a quien sigues (con seguimiento aceptado).
drop policy if exists "Comments readable with the content" on public.social_comments;
create policy "Comments readable with the content"
  on public.social_comments for select
  using (
    (select auth.uid()) = target_owner_id
    or (select auth.uid()) = author_id
    or public.is_following((select auth.uid()), target_owner_id)
  );

-- Borra el autor (me arrepentí) o el dueño del contenido (moderación mínima:
-- lo que se publica en tu receta lo puedes quitar tú).
drop policy if exists "Author or owner deletes a comment" on public.social_comments;
create policy "Author or owner deletes a comment"
  on public.social_comments for delete
  using ((select auth.uid()) = author_id or (select auth.uid()) = target_owner_id);

comment on column public.social_comments.target_owner_id is
  'Dueño del contenido comentado. Desnormalizado para que la política de lectura no tenga que cruzar tablas con RLS (riesgo de recursión).';


-- ── 3. Respuestas y "me gusta" en comentarios ──────────────────────────────
--
-- Un hilo de un solo nivel: un comentario puede responder a otro, pero una
-- respuesta no se responde. Anidar sin fondo obliga a decidir sangrados,
-- plegados y "ver 3 respuestas mas" — todo eso para una app de menus donde la
-- conversacion tipica son dos frases.
alter table public.social_comments
  add column if not exists parent_id uuid references public.social_comments(id) on delete cascade;

create index if not exists idx_comments_parent
  on public.social_comments (parent_id, created_at)
  where parent_id is not null;

-- El limite de un nivel se garantiza en la base, no en el cliente: si el padre
-- ya tiene padre, no se inserta.
create or replace function public.check_comment_depth()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.parent_id is not null
     and exists (select 1 from public.social_comments
                 where id = new.parent_id and parent_id is not null) then
    raise exception 'las respuestas no se responden';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_comment_depth on public.social_comments;
create trigger trg_comment_depth
  before insert on public.social_comments
  for each row execute function public.check_comment_depth();


create table if not exists public.social_comment_likes (
  comment_id uuid not null references public.social_comments(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (comment_id, user_id)
);

alter table public.social_comment_likes enable row level security;

create index if not exists idx_comment_likes_comment
  on public.social_comment_likes (comment_id);

-- Cada uno gestiona los suyos. El recuento NO sale de aqui (verias solo tu
-- fila): sale de la RPC de abajo, que devuelve agregados.
drop policy if exists "Users manage own comment likes" on public.social_comment_likes;
create policy "Users manage own comment likes"
  on public.social_comment_likes for all
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create or replace function public.comment_like_counts(p_ids uuid[])
returns table (comment_id uuid, likes bigint, liked_by_me boolean)
language sql
security definer
stable
set search_path = public
-- Alias cualificado t(cid), nunca `id` a secas: ver la nota de
-- recipe_social_stats más abajo. Aquí funcionaría igualmente porque
-- social_comment_likes no tiene columna `id`, pero depender de eso es depender
-- de que nadie se la añada nunca.
as $$
  select
    t.cid as comment_id,
    (select count(*) from public.social_comment_likes l where l.comment_id = t.cid),
    exists (select 1 from public.social_comment_likes l
             where l.comment_id = t.cid and l.user_id = auth.uid())
  from unnest(p_ids) as t(cid);
$$;

revoke all on function public.comment_like_counts(uuid[]) from public;
grant execute on function public.comment_like_counts(uuid[]) to anon, authenticated;


-- ── 4. Los comentarios entran en las estadisticas de la receta ─────────────
--
-- Se redefine aqui y no en 0027 porque alli social_comments todavia no existe
-- y el cuerpo de la funcion se valida al crearla. Cambia el numero de columnas
-- de salida, asi que hay que soltarla antes: `create or replace` no puede.
drop function if exists public.recipe_social_stats(text[]);

create function public.recipe_social_stats(p_ids text[])
returns table (recipe_id text, likes bigint, dislikes bigint, used bigint, comments bigint)
language sql
security definer
stable
set search_path = public
-- El alias de `unnest` se llama t(rid) y NO `id`, y se referencia siempre
-- cualificado. Con `... as id` a secas, Postgres resuelve un nombre sin
-- cualificar contra la tabla más INTERNA primero, así que `= id` no comparaba
-- con el elemento de p_ids sino con la columna `id` de la tabla de la
-- subconsulta: recipe_votes.id (bigserial) → "operator does not exist:
-- text = bigint", y social_comments.id (uuid) → el mismo error con uuid.
as $$
  select
    t.rid as recipe_id,
    (select count(*) from public.recipe_votes v
       where v.recipe_id = t.rid and v.vote = 'up'),
    (select count(*) from public.recipe_votes v
       where v.recipe_id = t.rid and v.vote = 'down'),
    (select count(*) from public.user_menu_recipes m
       where regexp_replace(m.recipe_id, '^.*__', '') = t.rid),
    -- Con los demas numeros, para que la tarjeta no necesite una segunda
    -- peticion solo para el globito de comentarios.
    (select count(*) from public.social_comments c
       where c.target_type = 'recipe' and c.target_id = t.rid)
  from unnest(p_ids) as t(rid);
$$;

revoke all on function public.recipe_social_stats(text[]) from public;
grant execute on function public.recipe_social_stats(text[]) to anon, authenticated;
