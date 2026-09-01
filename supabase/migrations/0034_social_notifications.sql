-- ═══ Feed social: notificaciones ═══════════════════════════════════════════
--
-- Continúa 0027/0028/0033. Aquí NO hay tabla de notificaciones, y es la
-- decisión central de este diseño: los hechos que notificamos ya viven en
-- user_follows (solicitudes, aceptaciones, seguidores) y en social_comments
-- (comentarios y respuestas). Una tabla espejo escrita por triggers puede
-- discrepar de la verdad y deja fantasmas — la notificación de un comentario
-- que su autor ya borró. Derivando la bandeja de las tablas reales, borrar el
-- hecho borra el aviso solo.
--
-- Lo único que se persiste es una MARCA DE AGUA por usuario: todo lo más
-- nuevo que tu última mirada está "sin leer". Abrir el panel la avanza.
-- (Leído por-item sería otra tabla y otro estado que mantener, para una
-- distinción que en una app de menús no le importa a nadie.)

alter table public.social_profiles
  add column if not exists notifications_seen_at timestamptz;

comment on column public.social_profiles.notifications_seen_at is
  'Última vez que el usuario abrió su bandeja de notificaciones. Lo posterior a esta marca cuenta como no leído.';


-- ── Respuestas a mis comentarios ───────────────────────────────────────────
--
-- "Alguien respondió a lo que dijiste" exige un join de social_comments
-- consigo misma (hijo → padre mío), y las políticas RLS de la tabla hacen ese
-- join imposible desde el cliente sin traerse medio mundo. SECURITY DEFINER,
-- acotado: solo respuestas cuyo PADRE escribiste tú.
--
-- Nota consciente: esto te enseña la respuesta aunque hayas perdido acceso al
-- contenido donde vive (p. ej. dejaste de seguir al dueño). Es a propósito —
-- una respuesta a tus palabras va dirigida a ti; al tocarla, la pantalla del
-- contenido ya aplicará su propia puerta si no puedes verlo.
create or replace function public.my_reply_inbox(p_limit integer default 30)
returns table (
  id uuid,
  target_type public.comment_target,
  target_id text,
  target_owner_id uuid,
  author_id uuid,
  body text,
  parent_id uuid,
  created_at timestamptz
)
language sql
security definer
stable
set search_path = public
as $$
  select c.id, c.target_type, c.target_id, c.target_owner_id,
         c.author_id, c.body, c.parent_id, c.created_at
  from public.social_comments c
  join public.social_comments p on p.id = c.parent_id
  where p.author_id = auth.uid()
    and c.author_id <> auth.uid()
    and not public.is_blocked(auth.uid(), c.author_id)
  order by c.created_at desc
  limit least(greatest(p_limit, 1), 100);
$$;

revoke all on function public.my_reply_inbox(integer) from public;
grant execute on function public.my_reply_inbox(integer) to authenticated;
