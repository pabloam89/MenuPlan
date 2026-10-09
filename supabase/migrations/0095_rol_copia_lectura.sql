-- 0095 · Un usuario propio para las copias nocturnas, que además vea quién es dueño de cada casa (issue #273).
--
-- Qué hace. Crea el rol `copia_lectura`, con login y SIN contraseña (el repo es
-- público: la pone Pablo después con `scripts/clave-copia-lectura.mjs`, que
-- guarda la dirección en 1Password y manda a la base solo el verificador
-- SCRAM). Puede leer, y nada más:
--   - las tablas y vistas de `public` y `ops`, las de hoy y las que cree
--     `postgres` después;
--   - el VALOR de sus secuencias (`select`, no `usage`: `usage` deja hacer
--     `nextval`, que las avanza; con `select`, `pg_dump` lee `last_value` y la
--     copia sale `secuencias: con-valor`);
--   - un esquema nuevo, `copia`, con dos vistas de `auth`:
--       copia.auth_usuarios    = auth.users      (id, email, phone, email_confirmed_at,
--                                                 phone_confirmed_at, is_anonymous, created_at)
--       copia.auth_identidades = auth.identities (id, user_id, provider, provider_id, created_at)
--     SIN contraseñas, tokens ni metadatos: ni `encrypted_password`, ni ningún
--     `*_token`, ni `raw_user_meta_data`/`raw_app_meta_data`, ni
--     `identity_data`. Solo lo que hace falta para que, al restaurar en un
--     proyecto nuevo, las 34 claves ajenas que apuntan a `auth.users` vuelvan a
--     tener dueño y el login de Google (que busca por `provider` +
--     `provider_id`) encuentre al mismo usuario con el mismo id. El email y el
--     teléfono, porque sin ellos el usuario no puede volver a entrar por enlace
--     mágico. La lista vive también en `scripts/lib/copias.mjs`
--     (`RELACIONES_COPIA`), y `supabase/rolLectura.test.js` la cruza con esta.
--
-- Fuera: dos tablas de códigos efímeros que no hacen falta para restaurar
-- (`bot_link_tokens` y `household_invites`). `copia_lectura` no las lee, y
-- `copia-base.sh` las deja fuera del volcado con `--exclude-table` (no basta
-- `--exclude-table-data`: `pg_dump` bloquea con `lock … access share` toda tabla
-- cuya definición vuelca, y eso pide `select`). Al restaurar se recrean vacías
-- con sus migraciones. La lista vive también en `TABLAS_SIN_COPIA`
-- (`scripts/lib/copias.mjs`), cruzada por test. A `consulta_lectura` (0092) se
-- le quita la columna del código de esas dos tablas y conserva las demás, para
-- seguir contando y diagnosticando.
--
-- Por qué. Las copias (`ops/copias/copia-base.sh`, PR #285) iban a usar
-- `consulta_lectura` (0092), que se aprobó para consultas desde el PC de Pablo
-- y no para un servicio en otro servidor, y que no ve `auth`: una copia hecha
-- con él, restaurada en un proyecto nuevo, deja las casas sin dueño. Decisión
-- de Pablo del 9 oct 2026 en #273: usuario propio antes de instalar.
--
-- RLS: `bypassrls`, y hace falta. `pg_dump` pone `row_security = off` y, si el
-- usuario está sujeto a RLS en alguna tabla, se para con «query would be
-- affected by row-level security policy»; con `--enable-row-security` no se
-- para, pero vuelca solo las filas que las políticas dejan ver a este rol, que
-- son ninguna: una copia vacía que parece buena. La alternativa, una política
-- `to copia_lectura using (true)` en cada tabla, toca la RLS de las tablas con
-- datos de familias y habría que acordarse en cada tabla nueva (lo mismo que se
-- descartó en la 0092). Para `auth` NO hace falta: las vistas son de `postgres`
-- y sin `security_invoker`, así que Postgres comprueba los permisos y la RLS de
-- `auth.users` como `postgres`, no como `copia_lectura`; el rol no tiene
-- `usage` en `auth` ni lo necesita. El bloque final comprueba que `postgres`
-- puede leer las dos tablas de `auth` y que, si tienen RLS, la salta (si no,
-- las vistas saldrían vacías sin error).
--
-- `connection limit 1`: la copia abre una conexión cada vez (psql, pg_dump y un
-- psql por vista, en fila). Si alguien usa la dirección mientras corre la
-- copia, uno de los dos falla en vez de pasar callado.
--
-- Valores por defecto, NO barreras (la sesión los puede cambiar):
-- `default_transaction_read_only = on`, `statement_timeout` 120 s (pg_dump lo
-- pone a 0 para sí mismo; acota a los `\copy` de las vistas),
-- `idle_in_transaction_session_timeout` 60 s e `idle_session_timeout` 60 s.
--
-- La frontera es la URL, como en la 0092 (ver su cabecera): quien la tenga
-- puede usar las concesiones de Supabase a PUBLIC que `postgres` no puede
-- revocar (`net.http_post`, objetos grandes, `pg_advisory_lock`, tablas
-- temporales). Este rol además lee emails de `auth`; por eso su dirección va a
-- una ficha de la bóveda `Panel HoMenu` (cada lectura pide aprobar) y al
-- servidor, no a la bóveda `HoMenu` que la service account del PC lee sin
-- preguntar.
--
-- Pooler: el usuario de la conexión es `copia_lectura.mdzwbrworucnummibxrq`.
--
-- Consultas previas (las tres deben dar 0):
--   select count(*) from pg_roles where rolname = 'copia_lectura';
--   select count(*) from pg_namespace where nspname = 'copia';
--   select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
--    where n.nspname in ('public', 'ops') and c.relkind in ('r','p','v','m','f','S')
--      and c.relowner <> 'postgres'::regrole;   -- el grant y el alter default van con postgres
--
-- Objeto testigo: el rol `copia_lectura` en `pg_roles`.
-- Toca permisos: la aplica Pablo con `--pablo`. La palabra «truncate» que verá
-- `motivosDePablo` es la de la comprobación del final (`has_table_privilege`),
-- no vacía ninguna tabla.
-- SIN APLICAR.

set lock_timeout = '5s';

-- 1. El rol. Idempotente: si ya existe, el alter de abajo le vuelve a poner
--    los atributos buenos.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'copia_lectura') then
    create role copia_lectura;
  end if;
end
$$;

alter role copia_lectura with login nocreatedb nocreaterole noinherit noreplication bypassrls connection limit 1;

alter role copia_lectura set default_transaction_read_only = on;
alter role copia_lectura set statement_timeout = '120s';
alter role copia_lectura set idle_in_transaction_session_timeout = '60s';
alter role copia_lectura set idle_session_timeout = '60s';

comment on role copia_lectura is
  'Solo lectura para las copias nocturnas (ops/copias/copia-base.sh, issue #273). Select en public, ops, sus secuencias y el esquema copia; bypassrls, sin pertenencias, una conexión. Contraseña en 1Password (Panel HoMenu), nunca en el repo.';

-- 2. Lectura de los esquemas de la app, hoy y en adelante (las tablas las
--    crean las migraciones, que corren como postgres).
grant usage on schema public, ops to copia_lectura;
grant select on all tables in schema public, ops to copia_lectura;
grant select on all sequences in schema public, ops to copia_lectura;
alter default privileges for role postgres in schema public, ops grant select on tables to copia_lectura;
alter default privileges for role postgres in schema public, ops grant select on sequences to copia_lectura;

-- 2b. Tablas de códigos efímeros que no hacen falta para restaurar (cabecera):
--     copia_lectura no las lee; consulta_lectura lee todas sus columnas menos
--     la del código.
revoke select on public.bot_link_tokens, public.household_invites from copia_lectura;
revoke select on public.bot_link_tokens, public.household_invites from consulta_lectura;
grant select (user_id, household_id, expires_at, used_at, created_at) on public.bot_link_tokens to consulta_lectura;
grant select (household_id, role, created_by, lang, max_uses, uses, expires_at, revoked_at, created_at) on public.household_invites to consulta_lectura;

-- 3. El esquema copia: lo justo de auth para restaurar las claves ajenas.
create schema if not exists copia;
revoke all on schema copia from public;
comment on schema copia is
  'Vistas de auth para las copias nocturnas (issue #273): sin contraseñas, tokens ni metadatos. Solo las lee copia_lectura; las vuelca ops/copias/copia-base.sh.';

create or replace view copia.auth_usuarios with (security_invoker = false) as
  select u.id, u.email, u.phone, u.email_confirmed_at, u.phone_confirmed_at, u.is_anonymous, u.created_at
    from auth.users u;
comment on view copia.auth_usuarios is
  'Los usuarios de auth.users sin secretos, para restaurar las claves ajenas que apuntan a auth.users. Lector: ops/copias/copia-base.sh (CSV cifrado) y scripts/copias-ensayo.mjs.';

create or replace view copia.auth_identidades with (security_invoker = false) as
  select i.id, i.user_id, i.provider, i.provider_id, i.created_at
    from auth.identities i;
comment on view copia.auth_identidades is
  'Las identidades de auth.identities sin identity_data, para que tras restaurar el login de Google (provider + provider_id) encuentre al mismo usuario. Lector: ops/copias/copia-base.sh y scripts/copias-ensayo.mjs.';

revoke all on copia.auth_usuarios, copia.auth_identidades from public, anon, authenticated, service_role;
grant usage on schema copia to copia_lectura;
grant select on copia.auth_usuarios, copia.auth_identidades to copia_lectura;

-- 4. Comprobación en el catálogo: si algo de esto falla, la migración entera
--    se deshace.
do $$
declare
  r pg_roles%rowtype;
  v_lista text;
  v_n integer;
  v_fn text;
begin
  select * into r from pg_roles where rolname = 'copia_lectura';

  if r.rolsuper or r.rolcreaterole or r.rolcreatedb or r.rolreplication or r.rolinherit
     or not r.rolcanlogin or not r.rolbypassrls or r.rolconnlimit <> 1 then
    raise exception 'rol copia_lectura: copia_lectura tiene atributos que no tocan (super, createrole, createdb, replication, inherit), le faltan login/bypassrls o su límite de conexiones no es 1';
  end if;

  -- Ninguna pertenencia: ni pg_signal_backend, ni pg_read_server_files, ni pg_monitor, ni nada.
  select string_agg(g.rolname, ', ') into v_lista
    from pg_auth_members m join pg_roles g on g.oid = m.roleid
   where m.member = r.oid;
  if v_lista is not null then
    raise exception 'rol copia_lectura: copia_lectura es miembro de %', v_lista;
  end if;

  -- Ninguna tabla en la que pueda escribir, en un esquema al que llega. `net` y
  -- `pg_settings` aparte, por lo mismo que en la 0092 (concesiones a PUBLIC).
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
    raise exception 'rol copia_lectura: copia_lectura puede escribir en %', left(v_lista, 500);
  end if;

  -- Ni avanzar secuencias (nextval/setval): `select` sí, `usage` y `update` no.
  select string_agg(c.oid::regclass::text, ', ') into v_lista
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where c.relkind = 'S'
     and n.nspname <> 'net'
     and has_schema_privilege(r.oid, n.oid, 'USAGE')
     -- el case evita que el planificador la evalúe sobre filas que no son secuencias
     and case when c.relkind = 'S' then has_sequence_privilege(r.oid, c.oid, 'USAGE, UPDATE') else false end;
  if v_lista is not null then
    raise exception 'rol copia_lectura: copia_lectura puede avanzar las secuencias %', left(v_lista, 500);
  end if;

  -- Ningún esquema donde pueda crear, ni la base.
  select string_agg(n.nspname, ', ') into v_lista
    from pg_namespace n
   where n.nspname not like 'pg_temp%' and n.nspname not like 'pg_toast%'
     and has_schema_privilege(r.oid, n.oid, 'CREATE');
  if v_lista is not null or has_database_privilege(r.oid, current_database(), 'CREATE') then
    raise exception 'rol copia_lectura: copia_lectura puede crear objetos en % (o en la base)', coalesce(v_lista, '-');
  end if;

  -- Fuera de cron, vault, auth, storage y extensions: auth lo ve solo por las vistas.
  select string_agg(n.nspname, ', ') into v_lista
    from pg_namespace n
   where n.nspname in ('cron', 'vault', 'auth', 'storage', 'extensions', 'supabase_migrations', 'pgbouncer')
     and has_schema_privilege(r.oid, n.oid, 'USAGE');
  if v_lista is not null then
    raise exception 'rol copia_lectura: copia_lectura entra en %', v_lista;
  end if;

  -- Ninguna función security definer volátil a su alcance.
  select string_agg(p.oid::regprocedure::text, ', ') into v_lista
    from pg_proc p
   where p.prosecdef and p.provolatile = 'v'
     and p.prorettype not in ('trigger'::regtype, 'event_trigger'::regtype)
     and has_schema_privilege(r.oid, p.pronamespace, 'USAGE')
     and has_function_privilege(r.oid, p.oid, 'EXECUTE');
  if v_lista is not null then
    raise exception 'rol copia_lectura: copia_lectura puede ejecutar funciones security definer que escriben: %', left(v_lista, 500);
  end if;

  -- Ficheros del servidor, configuración y replicación: sin execute.
  foreach v_fn in array array[
    'pg_read_file(text)', 'pg_read_binary_file(text)', 'pg_ls_dir(text)', 'pg_stat_file(text)',
    'pg_ls_logdir()', 'pg_ls_waldir()', 'lo_import(text)', 'lo_export(oid,text)',
    'pg_reload_conf()', 'pg_rotate_logfile()', 'pg_promote(boolean,integer)', 'pg_switch_wal()'
  ] loop
    if to_regprocedure(v_fn) is not null and has_function_privilege(r.oid, to_regprocedure(v_fn), 'EXECUTE') then
      raise exception 'rol copia_lectura: copia_lectura puede ejecutar %', v_fn;
    end if;
  end loop;

  -- El esquema copia: de postgres, con justo las dos vistas, sin
  -- security_invoker, sin columnas de secretos y sin nadie más que lea.
  if (select nspowner from pg_namespace where nspname = 'copia') <> 'postgres'::regrole then
    raise exception 'rol copia_lectura: el esquema copia no es de postgres';
  end if;

  select string_agg(c.relname || ':' || c.relkind::text, ', ' order by c.relname) into v_lista
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'copia';
  if v_lista is distinct from 'auth_identidades:v, auth_usuarios:v' then
    raise exception 'rol copia_lectura: el esquema copia tiene %, no justo las dos vistas', coalesce(v_lista, 'nada');
  end if;

  select string_agg(c.relname, ', ') into v_lista
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'copia'
     and (c.relowner <> 'postgres'::regrole
          or coalesce(c.reloptions, '{}') && array['security_invoker=true', 'security_invoker=on', 'security_invoker=1']);
  if v_lista is not null then
    raise exception 'rol copia_lectura: vistas de copia que no son de postgres o van con security_invoker: %', v_lista;
  end if;

  -- Columnas exactas (la misma lista que RELACIONES_COPIA en scripts/lib/copias.mjs).
  select string_agg(c.relname || '.' || a.attname, ', ' order by c.relname, a.attnum) into v_lista
    from pg_attribute a join pg_class c on c.oid = a.attrelid join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'copia' and a.attnum > 0 and not a.attisdropped;
  if v_lista is distinct from
     'auth_identidades.id, auth_identidades.user_id, auth_identidades.provider, auth_identidades.provider_id, auth_identidades.created_at, '
     || 'auth_usuarios.id, auth_usuarios.email, auth_usuarios.phone, auth_usuarios.email_confirmed_at, auth_usuarios.phone_confirmed_at, auth_usuarios.is_anonymous, auth_usuarios.created_at' then
    raise exception 'rol copia_lectura: las columnas del esquema copia no son las acordadas: %', v_lista;
  end if;

  -- Por si alguien cambia la lista de arriba sin mirar: nada que huela a secreto.
  select string_agg(c.relname || '.' || a.attname, ', ') into v_lista
    from pg_attribute a join pg_class c on c.oid = a.attrelid join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'copia' and a.attnum > 0 and not a.attisdropped
     and a.attname ~ '(password|token|secret|meta_data|identity_data|code|nonce|hash)';
  if v_lista is not null then
    raise exception 'rol copia_lectura: el esquema copia saca columnas con secretos: %', v_lista;
  end if;

  -- Nadie más que postgres y copia_lectura con permisos en el esquema ni en las
  -- vistas (ni PUBLIC, anon, authenticated, service_role ni consulta_lectura).
  select string_agg(distinct coalesce(g.rolname, 'PUBLIC'), ', ') into v_lista
    from (
      select (aclexplode(nspacl)).grantee from pg_namespace where nspname = 'copia'
      union all
      select (aclexplode(c.relacl)).grantee
        from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'copia'
    ) x
    left join pg_roles g on g.oid = x.grantee
   where x.grantee not in ('postgres'::regrole, r.oid);
  if v_lista is not null then
    raise exception 'rol copia_lectura: el esquema copia lo pueden leer también: %', v_lista;
  end if;

  if not has_table_privilege(r.oid, 'copia.auth_usuarios', 'SELECT')
     or not has_table_privilege(r.oid, 'copia.auth_identidades', 'SELECT') then
    raise exception 'rol copia_lectura: copia_lectura no puede leer las vistas del esquema copia';
  end if;

  -- Las vistas leen auth como postgres: tiene que poder, y saltarse su RLS si la hay.
  select string_agg(n.nspname || '.' || c.relname, ', ') into v_lista
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'auth' and c.relname in ('users', 'identities')
     and (not has_table_privilege('postgres', c.oid, 'SELECT')
          or (c.relrowsecurity and not (select rolbypassrls from pg_roles where rolname = 'postgres')));
  if v_lista is not null then
    raise exception 'rol copia_lectura: postgres no puede leer % entero: las vistas de copia saldrían vacías', v_lista;
  end if;
  perform 1 from copia.auth_usuarios limit 1;
  perform 1 from copia.auth_identidades limit 1;

  -- Las tablas de códigos efímeros: copia_lectura no lee nada de ellas, y
  -- consulta_lectura lee todo menos la columna del código.
  select string_agg(t::text, ', ') into v_lista
    from unnest(array['public.bot_link_tokens'::regclass, 'public.household_invites'::regclass]) t
   where has_table_privilege(r.oid, t, 'SELECT') or has_any_column_privilege(r.oid, t, 'SELECT')
      or has_table_privilege('consulta_lectura', t, 'SELECT')
      or has_column_privilege('consulta_lectura', t, 'token', 'SELECT')
      or not has_any_column_privilege('consulta_lectura', t, 'SELECT');
  if v_lista is not null then
    raise exception 'rol copia_lectura: permisos sobre tablas de códigos efímeros que no son los acordados: %', v_lista;
  end if;

  select count(*) into v_n
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname in ('public', 'ops') and c.relkind in ('r', 'p', 'v', 'm', 'f')
     and has_table_privilege(r.oid, c.oid, 'SELECT');
  raise notice 'rol copia_lectura: copia_lectura lee % tablas y vistas de public y ops', v_n;

  select count(*) into v_n
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname in ('public', 'ops') and c.relkind = 'S'
     and case when c.relkind = 'S' then not has_sequence_privilege(r.oid, c.oid, 'SELECT') else false end;
  if v_n > 0 then
    raise exception 'rol copia_lectura: copia_lectura no puede leer % secuencias de public y ops', v_n;
  end if;

  select count(*) into v_n
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'net' and c.relkind in ('r', 'p')
     and has_schema_privilege(r.oid, n.oid, 'USAGE')
     and has_table_privilege(r.oid, c.oid, 'INSERT, UPDATE, DELETE');
  raise notice 'rol copia_lectura: tablas de net con escritura por PUBLIC (Supabase; riesgo aceptado, ver la 0092): %', v_n;
end
$$;
