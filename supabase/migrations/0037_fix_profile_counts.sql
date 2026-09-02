-- ═══ Corrección: los contadores de perfil contaban solicitudes ═════════════
--
-- `social_profile_counts` nació en 0027 contando TODAS las filas de
-- user_follows, sin mirar el `status`. Consecuencia: quien solo había PEDIDO
-- seguirte ya sumaba como seguidor tuyo, y tus solicitudes sin contestar
-- sumaban como "siguiendo". El número mentía justo en el momento en que más
-- se mira — al recibir una solicitud, antes de decidir.
--
-- Esto va aparte y no dentro de 0027 porque 0027 YA está aplicada en el
-- proyecto: un `create or replace` escondido dentro de una migración vieja no
-- se volvería a ejecutar solo, y además el arreglo se merece su propia
-- entrada en el historial. La definición aquí es idéntica a la de 0027 salvo
-- por los dos `status = 'accepted'`.
--
-- (0027 también quedó corregida en el repo, para que quien monte la base
-- desde cero no llegue a tener nunca el error.)

create or replace function public.social_profile_counts(p_user uuid)
returns table (followers bigint, following bigint, recipes bigint, menus bigint)
language sql
security definer
stable
set search_path = public
as $$
  select
    -- Solo lo aceptado: una solicitud pendiente no es un seguidor todavía.
    (select count(*) from public.user_follows
       where followee_id = p_user and status = 'accepted'),
    (select count(*) from public.user_follows
       where follower_id = p_user and status = 'accepted'),
    (select count(*) from public.user_recipes
       where owner_id = p_user and visibility <> 'private'),
    (select count(*) from public.shared_menus
       where owner_id = p_user and visibility <> 'private');
$$;

revoke all on function public.social_profile_counts(uuid) from public;
grant execute on function public.social_profile_counts(uuid) to anon, authenticated;
