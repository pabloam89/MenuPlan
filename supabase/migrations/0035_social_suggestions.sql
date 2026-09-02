-- ═══ Feed social: a quién seguir ═══════════════════════════════════════════
--
-- Continúa 0027/0028/0033/0034. Antes, "Buscar gente" solo sabía buscar: sin
-- escribir no había nada, y quien no conoce a nadie se quedaba en la casilla
-- de salida. Esto da el otro camino: gente sugerida.
--
-- Una sola fuente sale de la base — la clásica "a quién sigue la gente que
-- sigues". Las otras dos (quien ya te sigue y no le sigues; los autores del
-- feed público) se calculan en el cliente con datos que ya tiene, así que no
-- necesitan nada aquí.
--
-- SECURITY DEFINER por lo de siempre: las políticas de user_follows solo
-- dejan ver las filas donde estás implicado, así que este JOIN de la tabla
-- consigo misma es imposible desde el cliente.
--
-- Qué se enseña y qué NO:
--   · solo perfiles que NO son privados (los privados no se sugieren jamás),
--   · nunca a quien ya sigues o a quien ya has pedido seguir,
--   · nunca a quien has bloqueado, ni a quien te ha bloqueado (is_blocked),
--   · y `via_ids` son gente a la que TÚ ya sigues — el "le siguen estos" de
--     toda red social. Devuelve los IDS y no un nombre montado aquí porque
--     el cliente enseña sus CARAS: tres avatares se leen de un vistazo y una
--     frase gris hay que pararse a leerla. Decisión consciente: revela un
--     vínculo entre cuentas no privadas, y sin ese "por qué" una sugerencia
--     es solo una lista de desconocidos.

create or replace function public.suggested_profiles(p_limit integer default 12)
returns table (
  user_id uuid,
  username text,
  display_name text,
  avatar_url text,
  visibility public.social_visibility,
  mutuals integer,
  via_ids uuid[]
)
language sql
security definer
stable
set search_path = public
as $$
  with mine as (
    -- A quién sigues tú, ya aceptado.
    select followee_id as id
    from public.user_follows
    where follower_id = auth.uid() and status = 'accepted'
  ),
  theirs as (
    -- A quién siguen ellos, con cuántos de los tuyos coinciden y quiénes son
    -- unos cuantos, para poder enseñar sus caras.
    select
      f.followee_id as id,
      count(*)::integer as mutuals,
      -- Solo los tres primeros: son las caras que caben en la fila.
      (array_agg(f.follower_id order by f.follower_id))[1:3] as via_ids
    from public.user_follows f
    join mine m on m.id = f.follower_id
    where f.status = 'accepted'
      and f.followee_id <> auth.uid()
      and f.followee_id not in (select id from mine)
      -- Ni a quien ya le has pedido seguir y está esperando respuesta.
      and not exists (
        select 1 from public.user_follows x
        where x.follower_id = auth.uid()
          and x.followee_id = f.followee_id
      )
    group by f.followee_id
  )
  select
    p.user_id, p.username, p.display_name, p.avatar_url, p.visibility,
    t.mutuals, t.via_ids
  from theirs t
  join public.social_profiles p on p.user_id = t.id
  where p.visibility <> 'private'
    and not public.is_blocked(auth.uid(), p.user_id)
  order by t.mutuals desc, p.username nulls last
  limit least(greatest(p_limit, 1), 50);
$$;

revoke all on function public.suggested_profiles(integer) from public;
grant execute on function public.suggested_profiles(integer) to authenticated;
