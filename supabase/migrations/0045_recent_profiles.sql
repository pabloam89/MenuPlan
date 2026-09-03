-- ── 0045: gente en HoMenu sin necesidad de escribir en el buscador ─────────
--
-- El descubridor tenia tres secciones y las tres dependian de un grafo que
-- en una red recien estrenada no existe: "por gente que sigues" necesita
-- follows, "te siguen" necesita que alguien te haya encontrado antes, y
-- "cocinan en abierto" solo enseña perfiles public. Resultado real: para
-- encontrar a alguien habia que saberse su nombre y escribirlo — que es
-- exactamente lo contrario de descubrir.
--
-- Esta funcion es la cuarta pata, la de arranque: los ultimos perfiles
-- activos que puedes encontrar (visibility <> 'private'), quitando a quien
-- ya sigues, a quien le pediste seguir, y bloqueos en ambas direcciones.
-- Mismas exclusiones que suggested_profiles (0035), mismo tope defensivo.
--
-- Ordena por created_at desc: en una red pequeña "lo nuevo" es la señal mas
-- honesta que hay — no hay popularidad que rankear y cualquier otra cosa
-- seria inventarsela.

create or replace function public.recent_profiles(p_limit integer default 12)
returns table (
  user_id uuid, username text, display_name text, avatar_url text,
  visibility public.social_visibility, created_at timestamptz
)
language sql
security definer
stable
set search_path = public
as $$
  select p.user_id, p.username, p.display_name, p.avatar_url, p.visibility, p.created_at
  from public.social_profiles p
  where p.visibility <> 'private'
    and p.user_id <> auth.uid()
    and not exists (
      select 1 from public.user_follows x
      where x.follower_id = auth.uid()
        and x.followee_id = p.user_id
    )
    and not public.is_blocked(auth.uid(), p.user_id)
  order by p.created_at desc
  limit least(greatest(p_limit, 1), 50);
$$;

revoke all on function public.recent_profiles(integer) from public;
grant execute on function public.recent_profiles(integer) to authenticated;
