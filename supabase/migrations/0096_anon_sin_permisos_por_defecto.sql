-- 0096 · Las tablas y secuencias NUEVAS de `public` ya no nacen abiertas a `anon` (issue #367).
-- AUDITADA: auditor-datos 2026-10-10 OK
--
-- Qué hace. Quita a `anon` los privilegios por defecto que Supabase pone a
-- las tablas y secuencias que `postgres` crea en `public`:
--   tablas      arwdDxtm  -> nada    (select, insert, update, delete, truncate, references, trigger, maintain)
--   secuencias  rwU       -> nada    (usage, select, update)
-- `authenticated` y `service_role` conservan los suyos: la app entra con
-- `authenticated`, el servidor con `service_role`. NO toca ningún grant de lo
-- que ya existe (41 tablas con grants a `anon` hoy): solo la plantilla de lo que
-- se cree a partir de ahora, y solo de `postgres` (el rol que corre las
-- migraciones; lo comprueba el bloque 1). `supabase_admin` no crea nada
-- nuestro. Los defaults de `consulta_lectura` y `copia_lectura` (0092, 0095) se
-- quedan como están.
--
-- Por qué. Hoy, para `anon`, la única barrera de una tabla nueva es la RLS: si
-- una migración olvida `enable row level security`, o una política queda con
-- `using (true)` o sin `to authenticated` (hoy hay 60 políticas con rol
-- `public`, que incluye a `anon`), cualquiera con la clave pública lee o
-- escribe por la API. Con esto hay dos barreras: sin permiso de tabla, Postgres
-- niega a `anon` antes de mirar la RLS. PRINCIPIOS §8 ya lo hacía por tabla
-- (revoke en las tablas sin políticas, en las funciones definer); esto lo
-- hace por defecto y la regla pasa a vigilar lo contrario: dar a `anon` es lo
-- que hay que escribir y justificar.
--
-- Funciones: NO se tocan, a propósito. Medido en el ensayo: una función nueva
-- sale con `=X` (PUBLIC) aunque la plantilla de `public` no lo lleve, porque
-- Postgres suma la plantilla del esquema a la de todos los esquemas, que aquí es
-- la de fábrica (con PUBLIC). Quitarlo exigiría `alter default privileges for
-- role postgres revoke execute on functions from public` SIN `in schema`, que
-- cambiaría también las funciones que `postgres` cree en `extensions` (48 de 49
-- llevan PUBLIC hoy) y en otros esquemas: demasiado ancho para esta migración.
-- Para las funciones sigue valiendo PRINCIPIOS §8: cada una revoca
-- `from public, anon, authenticated` y concede a quien la use. Queda como
-- seguimiento en #367 (33 funciones ejecutables por anon hoy, 29 definer).
--
-- Qué cambia para quien escribe migraciones. Una tabla nueva a la que `anon`
-- DEBA acceder (hoy ninguna se ha medido; lo público pasa por la API del servidor con
-- `service_role`) necesita un `grant … to anon` explícito, y el test
-- `supabase/anonPorDefecto.test.js` lo rechaza en tablas y secuencias a partir
-- de la 0096 salvo la marca `-- anon: <porqué>` en la propia sentencia. Una
-- función a la que `anon` deba llegar por RPC lleva su `grant execute … to anon`
-- explícito (como ya pedía PRINCIPIOS §8).
--
-- Plan B del código. Es la parte que no puede fallar: el código no usa
-- permisos por defecto de nada, solo de tablas que ya existen y no cambian.
-- Antes de aplicarla, una tabla nueva sigue naciendo abierta (como hoy); después,
-- cerrada. Ningún lector se rompe porque `anon` no lee tablas nuevas desde la app (todas
-- las lecturas de la app van con sesión; las públicas, por `api/` con service).
--
-- RLS y permisos de lo que ya existía: NO se toca ni una política ni un grant
-- existente. Pero es `alter default privileges`: `motivosDePablo` lo manda a
-- `--pablo` por regla, así que la lanza Pablo.
--
-- Cifras de antes (solo lectura, 10 oct 2026), todas en `public`:
--   pg_default_acl de postgres en public: tablas, secuencias y funciones con
--     anon + authenticated + service_role (más consulta_lectura y copia_lectura
--     en tablas, copia_lectura en secuencias).
--   tablas: 52, todas con RLS; anon tiene algún privilegio en 41; authenticated en 42.
--   secuencias: 6 de 6 con privilegios de anon.
--   funciones: 83; anon puede ejecutar 33 (29 son security definer); authenticated 59.
--   políticas con rol `public` o `anon`: 60.
--   Objetos de `public` con dueño distinto de postgres: 0.
-- Cifras de después, que esta migración NO cambia (siguen igual: lo existente
-- no se toca): lo único que cambia es lo que se cree desde ahora. El test del
-- bloque 3 lo comprueba creando una tabla con su secuencia
-- que se deshacen.
--
-- Seguimiento aparte (no en esta migración): cerrar a `anon` lo ya existente,
-- tabla a tabla, mirando que ninguna ruta pública lo use. Queda en el issue #367.
--
-- Consultas previas (la primera debe dar 1, la segunda 0):
--   select count(*) from pg_default_acl a where a.defaclrole = 'postgres'::regrole
--      and a.defaclnamespace = 'public'::regnamespace and a.defaclobjtype = 'r'
--      and a.defaclacl::text like '%anon=%';          -- 1: la plantilla de tablas lleva a anon
--   select count(*) from pg_class where relnamespace = 'public'::regnamespace
--      and relowner <> 'postgres'::regrole;           -- 0: todo lo de public es de postgres
--
-- Objeto testigo: ninguna entrada de `pg_default_acl` (rol postgres, esquema
-- public, tablas y secuencias) menciona a `anon`.
-- Toca permisos por defecto: la aplica Pablo con `--pablo`.
-- SIN APLICAR.

set lock_timeout = '5s';

-- 1. Solo vale como postgres: los defaults son por rol creador, y las
--    migraciones corren como él. Con otro rol cambiaría una plantilla que no es.
do $$
begin
  if current_user <> 'postgres' then
    raise exception '0096 se aplica como postgres, no como %', current_user;
  end if;
end
$$;

-- 2. La plantilla de tablas y secuencias, sin anon. Las funciones NO se tocan
--    aquí (ver «Funciones» en la cabecera).
alter default privileges for role postgres in schema public revoke all on tables from anon;
alter default privileges for role postgres in schema public revoke all on sequences from anon;

-- 3. Autoprueba: un objeto de cada clase, creado como lo hace una migración
--    cualquiera, tiene que salir sin nada para anon y con todo lo demás
--    intacto. El `raise` del final lo deshace (subtransacción), así que no
--    queda nada creado.
do $$
declare
  permiso text;
  rol text;
begin
  begin
    create table public.zz_prueba_0096 (id bigint generated always as identity primary key);

    -- anon: ni un solo permiso de tabla (con maintain) ni de secuencia.
    foreach permiso in array array['select', 'insert', 'update', 'delete', 'truncate', 'references', 'trigger', 'maintain'] loop
      if has_table_privilege('anon', 'public.zz_prueba_0096', permiso) then
        raise exception '0096: una tabla nueva sigue naciendo con % para anon', permiso;
      end if;
    end loop;
    foreach permiso in array array['usage', 'select', 'update'] loop
      if has_sequence_privilege('anon', pg_get_serial_sequence('public.zz_prueba_0096', 'id'), permiso) then
        raise exception '0096: una secuencia nueva sigue naciendo con % para anon', permiso;
      end if;
    end loop;

    -- Los demás roles siguen como antes, permiso a permiso.
    foreach rol in array array['authenticated', 'service_role'] loop
      foreach permiso in array array['select', 'insert', 'update', 'delete'] loop
        if not has_table_privilege(rol, 'public.zz_prueba_0096', permiso) then
          raise exception '0096: una tabla nueva perdió % de %', permiso, rol;
        end if;
      end loop;
    end loop;
    foreach rol in array array['consulta_lectura', 'copia_lectura'] loop
      if not has_table_privilege(rol, 'public.zz_prueba_0096', 'select') then
        raise exception '0096: una tabla nueva perdió select de %', rol;
      end if;
      foreach permiso in array array['insert', 'update', 'delete'] loop
        if has_table_privilege(rol, 'public.zz_prueba_0096', permiso) then
          raise exception '0096: una tabla nueva da % a %, que es de solo lectura', permiso, rol;
        end if;
      end loop;
    end loop;

    raise exception 'AUTOPRUEBA_0096_OK';
  exception
    when raise_exception then
      if sqlerrm <> 'AUTOPRUEBA_0096_OK' then
        raise;  -- relanza el fallo de la comprobación: aborta la migración
      end if;
  end;
end
$$;
