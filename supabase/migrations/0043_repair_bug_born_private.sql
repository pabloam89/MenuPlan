-- ── 0043: repara los perfiles que nacieron invisibles por un bug del cliente ──
--
-- ProfileDrawer auto-creaba el perfil escribiendo visibility 'private' a
-- pelo, tapando el default 'followers' que la 0038 habia puesto en la
-- columna. Resultado: TODA la base nacio en private. Y como la busqueda
-- (search_social_profiles), las sugerencias (suggested_profiles) y el feed
-- abierto filtran visibility <> 'private' — correctamente —, nadie podia
-- encontrar a nadie: cuatro superficies muertas por una columna.
--
-- El cliente quedo arreglado el 2026-09-02 (commit 3ae9186): ya no manda la
-- columna y el default vuelve a mandar. Esto repara las filas que el bug
-- dejo escritas.
--
-- ¿Por que TODAS y no "solo las que no eligio nadie"? Porque no hay señal
-- que las separe: updated_at salta con cualquier edicion (nombre, avatar),
-- asi que no marca quien toco la visibilidad. Y quien "eligio" private lo
-- hizo viendo "Nadie te ve" ya puesto — el estado que el bug imponia, no
-- una eleccion suya. Volver a private es un toque en Quien te ve; ser
-- invisible sin saberlo no se arregla solo.
--
-- 'followers' NO publica nada: te encuentran por tu nombre, pero tu
-- contenido solo lo ve quien tu aceptes. Es el arranque que decidio la 0038.

-- Idempotente, por si la 0038 no llego a aplicarse en algun entorno.
alter table public.social_profiles
  alter column visibility set default 'followers';

update public.social_profiles
  set visibility = 'followers'
  where visibility = 'private';
