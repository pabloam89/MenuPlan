-- El dueño del contenido comentado lo decide la BASE DE DATOS, no el cliente.
--
-- EL PROBLEMA
--
-- `target_owner_id` viaja desde el cliente (lib/social.js#postComment) y hasta
-- ahora nadie comprobaba que fuera verdad. La política de INSERT solo mira dos
-- cosas: que el autor seas tú, y -- desde 0033 -- que el dueño DECLARADO no te
-- haya bloqueado. En ningún sitio se comprobaba que ese dueño declarado sea
-- realmente el dueño de `target_id`.
--
-- Y la política de SELECT usa justo ese campo como llave de visibilidad
-- (`auth.uid() = target_owner_id or is_following(auth.uid(), target_owner_id)`),
-- así que mentir sobre él no te deja LEER nada nuevo -- eso era cierto -- pero
-- sí te deja ESCRIBIR donde no te toca:
--
--   · Bandeja ajena: pones el id de cualquiera y tu texto le aparece en su
--     bandeja de comentarios (idx_comments_inbox indexa por esta columna, y
--     loadCommentInbox consulta por ella). Sin que esa persona tenga
--     contenido público, y sin haber comentado nada suyo.
--   · Audiencia prestada: pones el id de una cuenta con muchos seguidores y tu
--     comentario pasa a ser legible por todos ellos.
--
-- No es una fuga de datos: es un canal de spam/acoso. Pero es el tipo de cosa
-- que conviene tener cerrada antes de publicar con contenido de usuario.
--
-- LA SOLUCIÓN
--
-- Un trigger BEFORE INSERT que SOBRESCRIBE el campo con el dueño real,
-- resuelto en la propia base. El cliente puede seguir mandando lo que quiera:
-- da igual, se descarta. Nada que cambiar en la app.
--
-- Va en SECURITY DEFINER a propósito: es exactamente la razón por la que la
-- columna está desnormalizada (ver el `comment on column` de 0036) -- cruzar
-- tablas con RLS desde una política arriesga recursión. Un DEFINER con
-- search_path fijo lo resuelve sin ese riesgo, y no filtra nada: solo devuelve
-- de quién es un id que quien comenta ya tiene delante.
--
-- Ojo con el orden: PostgreSQL ejecuta los triggers BEFORE ROW ANTES de
-- evaluar el WITH CHECK de la RLS. O sea que la comprobación de bloqueo de
-- 0033 pasa a hacerse contra el dueño REAL, no contra el declarado. Es una
-- mejora: ya no se puede esquivar un bloqueo mintiendo sobre el dueño.

create or replace function public.resolve_comment_target_owner(
  p_target_type public.comment_target,
  p_target_id   text
)
returns uuid
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select case p_target_type
    -- Receta del catálogo de HoMenu: no hay fila en user_recipes y el NULL es
    -- la respuesta correcta (no tiene dueño). La política de lectura ya trata
    -- `target_owner_id is null` como "cualquiera puede verlo" desde 0036.
    when 'recipe' then (
      select r.owner_id from public.user_recipes r where r.id = p_target_id
    )
    when 'menu' then (
      select m.owner_id from public.shared_menus m where m.id::text = p_target_id
    )
    -- Comentar un perfil: el destino ES la persona. Se valida el formato antes
    -- de castear para que un id mal formado no reviente el insert con un error
    -- de cast -- se queda en NULL y la fila entra como "sin dueño".
    when 'profile' then (
      case
        when p_target_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          then p_target_id::uuid
        else null
      end
    )
  end;
$$;

revoke all on function public.resolve_comment_target_owner(public.comment_target, text) from public;

create or replace function public.set_comment_target_owner()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  new.target_owner_id := public.resolve_comment_target_owner(new.target_type, new.target_id);
  return new;
end;
$$;

-- También en UPDATE del destino: sin esto, se podría insertar un comentario
-- legítimo y luego moverlo a la bandeja de otro con un update.
drop trigger if exists trg_comment_target_owner on public.social_comments;
create trigger trg_comment_target_owner
  before insert or update of target_type, target_id on public.social_comments
  for each row execute function public.set_comment_target_owner();

comment on column public.social_comments.target_owner_id is
  'Dueño del contenido comentado, NULO si es una receta del catálogo de HoMenu (no tiene dueño). Desnormalizado para que la política de lectura no cruce tablas con RLS. Lo RELLENA EL TRIGGER trg_comment_target_owner (0049): lo que mande el cliente se ignora.';
