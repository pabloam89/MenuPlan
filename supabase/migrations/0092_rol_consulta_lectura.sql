-- 0092 · Un usuario de solo lectura para `npm run consulta`: que diga «no» la base (issue #233).
-- AUDITADA: auditor-datos 2026-10-09 OK
--
-- Qué hace. Crea el rol `consulta_lectura`, con login y SIN contraseña (el repo
-- es público: la contraseña la pone Pablo después, desde 1Password, con
-- `scripts/clave-consulta-lectura.mjs`). Puede leer las tablas y vistas de
-- `public` y `ops`, las de hoy y las que se creen después, y nada más.
--
-- Por qué. Hoy `scripts/consulta.mjs` entra con el administrador (`postgres`)
-- y lo protegen un filtro de texto y una transacción `read only`. El juez de
-- seguridad del PR #223 encontró, sin escribir datos, formas de cortar
-- conexiones ajenas, crear slots de replicación o esconder funciones al filtro.
-- Con este rol lo niega la base por permisos, no por texto:
--   - no tiene permiso de escribir en ninguna tabla ni secuencia de la app
--     (solo `select`), ni de crear nada en ningún esquema ni en la base;
--   - no es miembro de ningún rol: ni `pg_signal_backend` (solo puede cortar sus
--     propias conexiones), ni `pg_read_server_files`, ni `pg_monitor`, ni
--     `postgres`; sin `replication` (no crea slots), sin `superuser`,
--     `createrole` ni `createdb`;
--   - no entra en `cron`, `vault`, `auth`, `storage` ni `extensions`.
--
-- Valores por defecto, NO barreras: `default_transaction_read_only = on`,
-- `statement_timeout` 15 s, `idle_in_transaction_session_timeout` 30 s e
-- `idle_session_timeout` 60 s. La propia sesión los puede cambiar (`begin read
-- write`, `set …`); solo acotan a quien no los toque, como `consulta.mjs`.
--
-- Precedente: `ops_reader` (0051), para el agente de fallos de GitHub. Aquel
-- solo ve una vista anonimizada de `ops` y no salta la RLS; este lee las tablas
-- de `public` tal cual, como hoy `postgres`, porque es para consultas de
-- diagnóstico desde el PC de Pablo, no para un servicio fuera.
--
-- RLS: `bypassrls`. Lee lo mismo que hoy lee `postgres` (que también la
-- salta), ni más ni menos en `public`. La otra salida, una política
-- `to consulta_lectura using (true)` en cada tabla, tocaría la RLS de las 58
-- tablas con datos de familias y habría que acordarse en cada tabla nueva.
-- Menos que hoy: sin `auth` (emails), `cron`, `vault` ni `storage`.
--
-- La frontera es la URL, no el rol. Quien tenga `SUPABASE_DB_URL_LECTURA` y
-- abra su propia sesión (con `begin read write` o cambiando los valores por
-- defecto) puede, porque son concesiones de Supabase y de Postgres a PUBLIC
-- en objetos de `supabase_admin` que `postgres` no puede revocar:
--   - `net.http_post`/`http_get`: sacar datos que lee hacia fuera (PUBLIC tiene
--     `usage` en `net` y escritura en su cola);
--   - `update`, `truncate` o `lock` sobre la cola de `net` (MAINTAIN de PUBLIC);
--   - `lo_from_bytea`/`lo_create`: escribir objetos grandes hasta llenar el disco;
--   - sin escribir nada, `pg_advisory_lock` con la clave `bot_tareas:<id>`, que
--     deja esperando los triggers de bot_tareas mientras siga conectado
--     (`idle_session_timeout` lo acota solo si no lo cambia);
--   - `notify pgrst` (recarga de PostgREST) y tablas temporales.
-- Por `consulta.mjs` nada de esto pasa: protocolo extendido de una sentencia,
-- `begin read only` antes de la consulta, filtro de texto y rollback. Es un
-- riesgo aceptado, pendiente de Pablo: la URL vive en 1Password (bóveda
-- HoMenu); el `.env.local` del PC de Pablo guarda solo la dirección `op://`,
-- pero cualquier sesión de ese PC la resuelve sin preguntar con la service
-- account, que lee toda la bóveda HoMenu (también la URL de administrador, que
-- puede todo eso y más). La comprobación del final cuenta lo de `net` (NOTICE) y
-- falla si aparece cualquier otra escritura.
--
-- Pooler: Supavisor admite roles propios; el usuario de la conexión es
-- `consulta_lectura.mdzwbrworucnummibxrq` (como `postgres.<ref>` hoy).
--
-- Consultas previas (las dos deben dar 0):
--   select count(*) from pg_roles where rolname = 'consulta_lectura';
--   select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
--    where n.nspname in ('public', 'ops') and c.relkind in ('r','p','v','m','f')
--      and c.relowner <> 'postgres'::regrole;   -- el grant y el alter default van con postgres
--
-- Objeto testigo: el rol `consulta_lectura` en `pg_roles`.
-- Toca permisos: la aplica Pablo con `--pablo`. Nota para quien lea
-- `motivosDePablo`: la palabra «truncate» que verá es la de la comprobación del
-- final (`has_table_privilege`), no vacía ninguna tabla.
-- SIN APLICAR.

set lock_timeout = '5s';

-- 1. El rol. Idempotente: si ya existe, el alter de abajo le vuelve a poner
--    los atributos buenos.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'consulta_lectura') then
    create role consulta_lectura;
  end if;
end
$$;

alter role consulta_lectura with login nocreatedb nocreaterole noinherit noreplication bypassrls connection limit 3;

alter role consulta_lectura set default_transaction_read_only = on;
alter role consulta_lectura set statement_timeout = '15s';
alter role consulta_lectura set idle_in_transaction_session_timeout = '30s';
alter role consulta_lectura set idle_session_timeout = '60s';

comment on role consulta_lectura is
  'Solo lectura para npm run consulta (scripts/consulta.mjs, issue #233). Select en public y ops, bypassrls, sin pertenencias. Contraseña en 1Password (HoMenu), nunca en el repo.';

-- 2. Lectura de los esquemas de la app, hoy y en adelante (las tablas las
--    crean las migraciones, que corren como postgres).
grant usage on schema public, ops to consulta_lectura;
grant select on all tables in schema public, ops to consulta_lectura;
alter default privileges for role postgres in schema public, ops grant select on tables to consulta_lectura;

-- 3. Comprobación en el catálogo: si algo de esto falla, la migración entera
--    se deshace.
do $$
declare
  r pg_roles%rowtype;
  v_lista text;
  v_n integer;
  v_fn text;
begin
  select * into r from pg_roles where rolname = 'consulta_lectura';

  if r.rolsuper or r.rolcreaterole or r.rolcreatedb or r.rolreplication or r.rolinherit
     or not r.rolcanlogin or not r.rolbypassrls then
    raise exception '0092: consulta_lectura tiene atributos que no tocan (super, createrole, createdb, replication, inherit) o le faltan login/bypassrls';
  end if;

  -- Ninguna pertenencia: ni pg_signal_backend, ni pg_read_server_files, ni pg_monitor, ni nada.
  select string_agg(g.rolname, ', ') into v_lista
    from pg_auth_members m join pg_roles g on g.oid = m.roleid
   where m.member = r.oid;
  if v_lista is not null then
    raise exception '0092: consulta_lectura es miembro de %', v_lista;
  end if;

  -- Ninguna tabla en la que pueda escribir, en un esquema al que llega.
  -- `net` aparte: es la concesión de Supabase a PUBLIC (cabecera). Y
  -- `pg_settings`, que Postgres deja «actualizar» a todos: es lo mismo que un
  -- SET de la propia sesión, no escribe nada en la base.
  select string_agg(c.oid::regclass::text, ', ') into v_lista
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where c.relkind in ('r', 'p', 'v', 'm', 'f')
     and n.nspname <> 'net'
     and c.oid <> 'pg_catalog.pg_settings'::regclass
     and n.nspname not like 'pg_temp%' and n.nspname not like 'pg_toast%'
     and has_schema_privilege(r.oid, n.oid, 'USAGE')
     and (has_table_privilege(r.oid, c.oid, 'INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN')
          or has_any_column_privilege(r.oid, c.oid, 'INSERT, UPDATE, REFERENCES'));
  if v_lista is not null then
    raise exception '0092: consulta_lectura puede escribir en %', left(v_lista, 500);
  end if;

  -- Ni avanzar secuencias (nextval/setval), fuera de `net` por lo mismo.
  select string_agg(c.oid::regclass::text, ', ') into v_lista
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where c.relkind = 'S'
     and n.nspname <> 'net'
     and has_schema_privilege(r.oid, n.oid, 'USAGE')
     -- el case evita que el planificador la evalúe sobre filas que no son secuencias
     and case when c.relkind = 'S' then has_sequence_privilege(r.oid, c.oid, 'USAGE, UPDATE') else false end;
  if v_lista is not null then
    raise exception '0092: consulta_lectura puede avanzar las secuencias %', left(v_lista, 500);
  end if;

  -- Ningún esquema donde pueda crear, ni la base.
  select string_agg(n.nspname, ', ') into v_lista
    from pg_namespace n
   where n.nspname not like 'pg_temp%' and n.nspname not like 'pg_toast%'
     and has_schema_privilege(r.oid, n.oid, 'CREATE');
  if v_lista is not null or has_database_privilege(r.oid, current_database(), 'CREATE') then
    raise exception '0092: consulta_lectura puede crear objetos en % (o en la base)', coalesce(v_lista, '-');
  end if;

  -- Fuera de cron, vault, auth, storage y extensions.
  select string_agg(n.nspname, ', ') into v_lista
    from pg_namespace n
   where n.nspname in ('cron', 'vault', 'auth', 'storage', 'extensions', 'supabase_migrations', 'pgbouncer')
     and has_schema_privilege(r.oid, n.oid, 'USAGE');
  if v_lista is not null then
    raise exception '0092: consulta_lectura entra en %', v_lista;
  end if;

  -- Ninguna función security definer volátil a su alcance (las de trigger no
  -- se pueden llamar a pelo). Una stable o immutable no puede escribir.
  select string_agg(p.oid::regprocedure::text, ', ') into v_lista
    from pg_proc p
   where p.prosecdef and p.provolatile = 'v'
     and p.prorettype not in ('trigger'::regtype, 'event_trigger'::regtype)
     and has_schema_privilege(r.oid, p.pronamespace, 'USAGE')
     and has_function_privilege(r.oid, p.oid, 'EXECUTE');
  if v_lista is not null then
    raise exception '0092: consulta_lectura puede ejecutar funciones security definer que escriben: %', left(v_lista, 500);
  end if;

  -- Ficheros del servidor, configuración y replicación: sin execute.
  foreach v_fn in array array[
    'pg_read_file(text)', 'pg_read_binary_file(text)', 'pg_ls_dir(text)', 'pg_stat_file(text)',
    'pg_ls_logdir()', 'pg_ls_waldir()', 'lo_import(text)', 'lo_export(oid,text)',
    'pg_reload_conf()', 'pg_rotate_logfile()', 'pg_promote(boolean,integer)', 'pg_switch_wal()'
  ] loop
    if to_regprocedure(v_fn) is not null and has_function_privilege(r.oid, to_regprocedure(v_fn), 'EXECUTE') then
      raise exception '0092: consulta_lectura puede ejecutar %', v_fn;
    end if;
  end loop;

  select count(*) into v_n
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname in ('public', 'ops') and c.relkind in ('r', 'p', 'v', 'm', 'f')
     and has_table_privilege(r.oid, c.oid, 'SELECT');
  raise notice '0092: consulta_lectura lee % tablas y vistas de public y ops', v_n;

  select count(*) into v_n
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'net' and c.relkind in ('r', 'p')
     and has_schema_privilege(r.oid, n.oid, 'USAGE')
     and has_table_privilege(r.oid, c.oid, 'INSERT, UPDATE, DELETE');
  raise notice '0092: tablas de net con escritura por PUBLIC (Supabase; riesgo aceptado, ver cabecera): %', v_n;
end
$$;
