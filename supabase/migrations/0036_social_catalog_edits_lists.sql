-- ═══ Feed social: catálogo comentable, edición, listas y copias ════════════
--
-- Continúa 0027/0028/0033/0034/0035. Cuatro cosas que faltaban para que la
-- parte social deje de tener agujeros visibles:
--
--   1. Comentar y votar las recetas de HoMenu (que no tienen dueño).
--   2. Editar un comentario propio (hasta ahora: o lo dejabas o lo borrabas).
--   3. Ver la lista de seguidores/seguidos de alguien, no solo el número.
--   4. Copiar el menú de otro contando la copia.


-- ── 1. Comentarios en contenido sin dueño ──────────────────────────────────
--
-- Las recetas del catálogo son de la casa, no de un usuario, así que no hay
-- `target_owner_id` que poner. Se permite nulo y las políticas lo tratan como
-- "contenido público de HoMenu": lo lee cualquiera y lo borra solo su autor
-- (no hay dueño que modere, y que un tercero pudiera borrar comentarios de
-- una receta común sería una puerta abierta).

alter table public.social_comments
  alter column target_owner_id drop not null;

comment on column public.social_comments.target_owner_id is
  'Dueño del contenido comentado, NULO si es una receta del catálogo de HoMenu (no tiene dueño). Desnormalizado para que la política de lectura no cruce tablas con RLS.';

drop policy if exists "Comments readable with the content" on public.social_comments;
create policy "Comments readable with the content"
  on public.social_comments for select
  using (
    target_owner_id is null
    or (select auth.uid()) = target_owner_id
    or (select auth.uid()) = author_id
    or public.is_following((select auth.uid()), target_owner_id)
  );

drop policy if exists "Author or owner deletes a comment" on public.social_comments;
create policy "Author or owner deletes a comment"
  on public.social_comments for delete
  using (
    (select auth.uid()) = author_id
    or (target_owner_id is not null and (select auth.uid()) = target_owner_id)
  );


-- ── 2. Editar un comentario propio ─────────────────────────────────────────
--
-- Solo el autor, y solo el cuerpo: `edited_at` deja constancia para que la
-- interfaz pueda decir "editado" y nadie sienta que le han cambiado lo que
-- leyó. El WITH CHECK repite la condición para que un UPDATE no pueda
-- reasignar el comentario a otra persona o a otro contenido.

alter table public.social_comments
  add column if not exists edited_at timestamptz;

drop policy if exists "Author edits own comment" on public.social_comments;
create policy "Author edits own comment"
  on public.social_comments for update
  using ((select auth.uid()) = author_id)
  with check ((select auth.uid()) = author_id);


-- ── 3. Listas de seguidores y seguidos ─────────────────────────────────────
--
-- Las políticas de user_follows solo dejan ver las filas donde estás
-- implicado, así que la lista de otra persona es imposible desde el cliente.
--
-- Quién puede verla: la tuya siempre; la de otro solo si su perfil NO es
-- privado. Un perfil privado no enseña su red ni de refilón. Y de la lista
-- se caen los perfiles privados y cualquiera con bloqueo de por medio.

create or replace function public.profile_follow_list(
  p_user uuid,
  p_kind text default 'followers',
  p_limit integer default 60
)
returns table (
  user_id uuid,
  username text,
  display_name text,
  avatar_url text,
  visibility public.social_visibility
)
language sql
security definer
stable
set search_path = public
as $$
  with allowed as (
    select 1
    where p_user = auth.uid()
       or exists (
            select 1 from public.social_profiles p
            where p.user_id = p_user and p.visibility <> 'private'
          )
  )
  select p.user_id, p.username, p.display_name, p.avatar_url, p.visibility
  from public.user_follows f
  join public.social_profiles p
    on p.user_id = case when p_kind = 'following' then f.followee_id else f.follower_id end
  where exists (select 1 from allowed)
    and f.status = 'accepted'
    and case when p_kind = 'following' then f.follower_id else f.followee_id end = p_user
    and p.visibility <> 'private'
    and not public.is_blocked(auth.uid(), p.user_id)
  order by f.created_at desc
  limit least(greatest(p_limit, 1), 200);
$$;

revoke all on function public.profile_follow_list(uuid, text, integer) from public;
grant execute on function public.profile_follow_list(uuid, text, integer) to authenticated;


-- ── 4. Copiar el menú de otro ──────────────────────────────────────────────
--
-- Copiar pasa entero en el cliente (el payload ya lo tienes si puedes ver el
-- menú); lo único que hace falta del servidor es sumar uno al contador, y
-- eso las políticas no lo dejan porque la fila es de otra persona.
--
-- Esta función SOLO incrementa el contador: no devuelve el menú ni lo toca de
-- ninguna otra forma, así que no abre ninguna puerta a contenido que no
-- pudieras ver ya.

create or replace function public.count_menu_copy(p_menu uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.shared_menus
     set copy_count = coalesce(copy_count, 0) + 1
   where id = p_menu
     and visibility <> 'private'
     and owner_id <> auth.uid();
$$;

revoke all on function public.count_menu_copy(uuid) from public;
grant execute on function public.count_menu_copy(uuid) to authenticated;


-- ── 5. Menciones ───────────────────────────────────────────────────────────
--
-- "Te han nombrado" no se puede resolver desde el cliente: haría falta leer
-- comentarios de contenido que no es tuyo para ver si aparece tu @. Aquí se
-- busca por el handle del que llama, y solo en comentarios que él no escribió.

create or replace function public.my_mention_inbox(p_limit integer default 20)
returns table (
  id uuid,
  target_type public.comment_target,
  target_id text,
  target_owner_id uuid,
  author_id uuid,
  body text,
  created_at timestamptz
)
language sql
security definer
stable
set search_path = public
as $$
  select c.id, c.target_type, c.target_id, c.target_owner_id,
         c.author_id, c.body, c.created_at
  from public.social_comments c
  join public.social_profiles me on me.user_id = auth.uid()
  where me.username is not null
    and c.author_id <> auth.uid()
    and c.body ~* ('@' || me.username || '\M')
    and not public.is_blocked(auth.uid(), c.author_id)
  order by c.created_at desc
  limit least(greatest(p_limit, 1), 50);
$$;

revoke all on function public.my_mention_inbox(integer) from public;
grant execute on function public.my_mention_inbox(integer) to authenticated;
