-- 0091 · Los ids viejos de persona y grupo pasan a UUID, en todas partes y sin borrar a nadie.
-- AUDITADA: auditor-datos 2026-10-08 OK
--
-- Por qué ahora (Pablo, 8 oct 2026, issue #194): «ahora da igual, pero luego será
-- peligroso». Desde el PR #91 los ids nuevos nacen UUID, y los viejos (el uid() de la
-- app, `m…` del bot, `per_`/`grp_`, y tres `m-<nombre>` de una casa de pruebas)
-- conviven. Mientras convivan, persona.id y grupo.id no pueden pasar a `uuid`, y
-- src/lib/ids.js tiene que seguir aceptando las formas viejas. Hay pocas casas: se
-- hace ya.
--
-- Qué se rompía con el script del PR #94: borraba y recreaba las personas
-- (persona_reemplazar_casa) y no tocaba bot_tareas.persona_id. Con la FK de la
-- 0083/0089 las tareas de Lola se habrían quedado sin persona. Aquí NO se borra y
-- recrea nada que tenga algo colgando:
--   1. Mapa viejo → UUID, guardado en `ids_uuid_equivalencias` (para poder repasar
--      lo que reintroduzca una app vieja, y para deshacer: no hay copias de la base).
--   2. persona y grupo: se inserta la copia con el id nuevo, se mueven a ella TODAS
--      las FK que apuntan a persona o grupo (leídas de pg_constraint, así entran
--      solas las tablas que vengan, como la `sobre` de la 0120), y se borra la fila
--      vieja cuando ya nadie la referencia (se comprueba antes: la cascada no
--      encuentra nada que llevarse).
--   3. Las columnas que guardan esos ids sin FK (texto y JSON) se reescriben con el
--      id entero como token (sin letra ni cifra a los lados): así caen `G__receta`,
--      `M|Lun|Comida`, `alergias:M`, `…::G__bebes_004`, claves y valores. La lista
--      está en INVENTARIO, abajo; supabase/idsPersonaGrupo.test.js vigila que no
--      falte ninguna columna que lleve ids de persona o de grupo.
--   4. household_state sube bot_rev: las apps abiertas, al guardar con su copia
--      vieja, reciben `conflict` y recargan la nube (src/lib/householdState.js). Por
--      lo mismo, las fotos de «deshaz» anteriores dejan de aplicarse (0060).
--   5. Comprueba y aborta (raise exception, todo se deshace) si queda un id viejo
--      en cualquier columna de texto o JSON de public, si cambia el número de
--      personas, grupos o filas que cuelgan de ellos, o si aparece una referencia
--      colgando que antes no estaba.
--
-- No toca: el texto libre de las charlas (bot_messages.content->'texto'), ni los
-- ids huérfanos (de personas o grupos que ya no existen en ninguna lista: no hay
-- a qué mapearlos), ni los invitados de las reglas (`inv_…`, `invitado: true`).
-- No cambia tipos de columna (persona.id sigue siendo text): eso va en otra
-- migración, cuando una semana sin ids viejos lo confirme (PENDIENTES.md).
--
-- Idempotente: con el mapa vacío no hace nada, y una segunda pasada reutiliza el
-- mismo UUID para cada id viejo (la tabla de equivalencias) y solo toca las filas
-- que aún lleven uno.
--
-- Consultas previas (solo lectura). La primera da cuántos ids viejos hay (8 oct:
-- 92 personas y 34 grupos, todos viejos); la segunda TIENE QUE DAR 0 (un id viejo
-- en dos casas recibiría un solo UUID):
--   select (select count(*) from public.persona where id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-') p,
--          (select count(*) from public.grupo   where id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-') g;
--   select count(*) from (select id from (select household_id, id from public.persona
--            union all select household_id, id from public.grupo) x
--          group by id having count(distinct household_id) > 1) y;
--
-- La lanza Pablo con `--pablo`: reescribe y borra filas de todas las casas, usa SQL
-- dinámico y pone RLS a una tabla con `if not exists`.
--
-- Testigo: la tabla public.ids_uuid_equivalencias (con filas), y
--   select count(*) from public.persona where id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-'  →  0
--
-- SIN APLICAR.

set local lock_timeout = '5s';

-- ── 0. El mapa que se queda ─────────────────────────────────────────────────

-- Rompe a la vista PRINCIPIOS §1 (no cuelga de la casa): no es una tabla del
-- dominio sino el registro de esta migración, y algunos ids viejos (user_state)
-- no tienen casa. Un id viejo es único en toda la base (consulta previa), así que
-- la clave es él solo. Lectores: esta migración al repasarse, y quien tenga que
-- deshacerla.
create table if not exists public.ids_uuid_equivalencias (
  viejo      text primary key,
  nuevo      uuid not null unique,
  created_at timestamptz not null default now(),
  constraint ids_uuid_equivalencias_viejo_forma check (viejo ~ '^[0-9a-z_-]{5,40}$')
);

alter table public.ids_uuid_equivalencias enable row level security;
revoke all on table public.ids_uuid_equivalencias from anon, authenticated;

comment on table public.ids_uuid_equivalencias is
  'Ids viejos (no UUID) de persona y grupo y el UUID que los sustituyó en toda la base (0091). Solo servidor. La lee la 0091 al repasarse (mismo UUID para el mismo id viejo) y sirve para deshacerla.';
comment on column public.ids_uuid_equivalencias.viejo is
  'El id de antes: uid() de la app, m… del bot, per_/grp_ o m-<nombre>. Único en toda la base.';
comment on column public.ids_uuid_equivalencias.nuevo is
  'El UUID que lo sustituye en persona, grupo, sus FK y los JSON de la casa.';

-- ── 1. Piezas de esta transacción (se van al terminar) ──────────────────────

create temp table _ids_mapa (viejo text primary key, nuevo uuid not null unique) on commit drop;
create temp table _ids_patron (patron text not null) on commit drop;
create temp table _ids_fuentes (ambito text not null, id text not null) on commit drop;
create temp table _ids_informe (orden bigint generated always as identity, linea text not null) on commit drop;
create temp table _ids_cuentas (que text primary key, antes bigint, despues bigint) on commit drop;

-- Los ids de persona y grupo que declara un estado (household_state.state o
-- user_state.state): la familia, los grupos y las fotos de los rosters aparcados.
-- Sin invitados.
create function pg_temp._ids_de_estado(p jsonb)
returns table (id text)
language sql
immutable
as $f$
  with rosters as (
    select r.value as v
      from jsonb_each(case when jsonb_typeof(p->'data'->'rosters') = 'object'
                           then p->'data'->'rosters' else '{}'::jsonb end) r
  ),
  listas(l) as (
    select p->'data'->'members'
    union all select p->'data'->'groups'
    union all select v->'snapshot'->'members' from rosters
    union all select v->'snapshot'->'groups' from rosters
  )
  select x->>'id'
    from listas, jsonb_array_elements(case when jsonb_typeof(l) = 'array' then l else '[]'::jsonb end) x
   where jsonb_typeof(x) = 'object'
     and x->'invitado' is distinct from 'true'::jsonb
     and nullif(btrim(x->>'id'), '') is not null
$f$;

-- Cambia cada id viejo que aparezca como token (sin letra ni cifra a los lados)
-- por su UUID. Para texto y para JSON pasado a texto: los ids solo llevan
-- [0-9a-z_-], que el JSON no escapa, así que valen igual en claves y valores.
create function pg_temp._ids_reescribir(s text)
returns text
language plpgsql
as $f$
declare
  v_re text;
  v_t text;
  v_nuevo text;
begin
  if s is null then
    return null;
  end if;
  select patron into v_re from pg_temp._ids_patron;
  if v_re is null or s !~ v_re then
    return s;
  end if;
  for v_t in select distinct x[1] from regexp_matches(s, v_re, 'g') as x loop
    select nuevo::text into v_nuevo from pg_temp._ids_mapa where viejo = v_t;
    s := regexp_replace(s, '(?<![0-9A-Za-z])' || v_t || '(?![0-9A-Za-z])', v_nuevo, 'g');
  end loop;
  return s;
end;
$f$;

-- ── 2. Todo lo demás, en un bloque: o entra entero o no entra ───────────────

do $$
declare
  -- INVENTARIO: columnas SIN FK que guardan ids de persona o de grupo, y cómo se
  -- reescriben. Las que tienen FK a persona o grupo no van aquí: se leen de
  -- pg_constraint. supabase/idsPersonaGrupo.test.js lee esta lista.
  --   jsonb_casa      : JSON entero, y sube bot_rev (las apps recargan)
  --   jsonb           : JSON entero
  --   jsonb_sin_texto : JSON entero salvo la clave 'texto' (lo que dijo la persona)
  --   texto           : columna de texto
  v_inventario constant jsonb := '[
    ["household_state",   "state",           "jsonb_casa"],
    ["user_state",        "state",           "jsonb"],
    ["user_menu_weeks",   "plan",            "jsonb"],
    ["user_menu_weeks",   "schedule",        "jsonb"],
    ["user_menu_weeks",   "shopping",        "jsonb"],
    ["user_menu_recipes", "recipe_id",       "texto"],
    ["user_menu_recipes", "recipe_snapshot", "jsonb"],
    ["cookings",          "recipe_id",       "texto"],
    ["cookings",          "eaters",          "jsonb"],
    ["shared_menus",      "payload",         "jsonb"],
    ["bot_tareas",        "clave",           "texto"],
    ["bot_tareas",        "para_member",     "texto"],
    ["bot_tareas",        "asignado_member", "texto"],
    ["bot_messages",      "content",         "jsonb_sin_texto"],
    ["bot_deshacer",      "antes",           "jsonb"],
    ["user_events",       "metadata",        "jsonb"]
  ]'::jsonb;
  c_uuid constant text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
  v_re text;
  v_n bigint;
  v_m bigint;
  v_txt text;
  v_cols text;
  v_tcols text;
  r record;
  e jsonb;
begin
  -- Precondiciones.
  if to_regclass('public.persona') is null or to_regclass('public.grupo') is null then
    raise exception '0091 necesita persona y grupo (0079): aplícala antes';
  end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'bot_tareas' and column_name = 'persona_id') then
    raise exception '0091 necesita bot_tareas.persona_id (0080): aplícala antes';
  end if;
  for e in select * from jsonb_array_elements(v_inventario) loop
    if not exists (select 1 from information_schema.columns
                    where table_schema = 'public' and table_name = e->>0 and column_name = e->>1) then
      raise exception '0091: no existe public.%.% del inventario', e->>0, e->>1;
    end if;
  end loop;

  -- 2.1 Qué ids viejos hay, y de qué ámbito (casa, o usuario para user_state).
  insert into _ids_fuentes
  select household_id::text, id from public.persona
  union all select household_id::text, id from public.grupo
  union all select hs.household_id::text, d.id from public.household_state hs, pg_temp._ids_de_estado(hs.state) d
  union all select 'u:' || us.user_id::text, d.id from public.user_state us, pg_temp._ids_de_estado(us.state) d;
  delete from _ids_fuentes where id ~* c_uuid or id like 'inv\_%';

  select string_agg(distinct id, ', ') into v_txt
    from (select id from _ids_fuentes where id !~ '^[0-9a-z_-]{5,40}$' limit 10) x;
  if v_txt is not null then
    raise exception '0091: ids viejos con una forma que no se puede buscar como token sin riesgo (se arreglan a mano antes): %', v_txt;
  end if;
  select string_agg(id, ', ') into v_txt
    from (select id from _ids_fuentes where ambito not like 'u:%'
           group by id having count(distinct ambito) > 1 limit 10) x;
  if v_txt is not null then
    raise exception '0091: el mismo id viejo está en varias casas (recibirían un solo UUID): %', v_txt;
  end if;

  -- 2.2 El mapa: lo que ya estaba (una pasada anterior) y los que faltan.
  insert into public.ids_uuid_equivalencias (viejo, nuevo)
  select id, gen_random_uuid() from (select distinct id from _ids_fuentes) d
  on conflict (viejo) do nothing;
  insert into _ids_mapa select viejo, nuevo from public.ids_uuid_equivalencias;

  select count(*) into v_n from _ids_mapa;
  if v_n = 0 then
    raise notice '0091: no hay ids viejos de persona ni de grupo; no se toca nada';
    return;
  end if;

  -- Un id viejo no puede ser token de otro: se reescribiría a medias.
  select string_agg(a.viejo || ' en ' || b.viejo, ', ') into v_txt
    from _ids_mapa a join _ids_mapa b
      on a.viejo <> b.viejo and b.viejo ~ ('(?<![0-9A-Za-z])' || a.viejo || '(?![0-9A-Za-z])');
  if v_txt is not null then
    raise exception '0091: un id viejo es parte de otro, no se pueden reescribir como token: %', v_txt;
  end if;

  insert into _ids_patron
  select '(?<![0-9A-Za-z])(' || string_agg(viejo, '|' order by length(viejo) desc, viejo) || ')(?![0-9A-Za-z])'
    from _ids_mapa;
  select patron into v_re from _ids_patron;

  insert into _ids_informe (linea)
  select format('mapa: %s ids viejos (%s en persona, %s en grupo, %s solo en JSON); %s ya mapeados antes',
                count(*),
                count(*) filter (where viejo in (select id from public.persona)),
                count(*) filter (where viejo in (select id from public.grupo)),
                count(*) filter (where viejo not in (select id from public.persona union select id from public.grupo)),
                (select count(*) from public.ids_uuid_equivalencias where created_at < now()))
    from _ids_mapa;

  -- 2.3 Cuentas de antes: personas, grupos, y filas y colgantes de cada FK hacia ellos.
  insert into _ids_cuentas (que, antes)
  select 'persona', count(*) from public.persona
  union all select 'grupo', count(*) from public.grupo
  union all select 'persona de ' || household_id, count(*) from public.persona group by household_id
  union all select 'grupo de ' || household_id, count(*) from public.grupo group by household_id;

  for r in
    select c.conrelid::regclass as hija, a.attname as col, c.confrelid::regclass as madre, c.conname
      from pg_constraint c
      join pg_attribute a on a.attrelid = c.conrelid
      join pg_attribute pa on pa.attrelid = c.confrelid and pa.attname = 'id'
      join lateral unnest(c.conkey, c.confkey) as k(hijo, padre) on k.padre = pa.attnum and a.attnum = k.hijo
     where c.contype = 'f'
       and c.confrelid in ('public.persona'::regclass, 'public.grupo'::regclass)
     order by 1, 2
  loop
    execute format('select count(%I) from %s', r.col, r.hija) into v_n;
    execute format('select count(*) from %s h where h.%I is not null and not exists '
                   '(select 1 from %s m where m.household_id = h.household_id and m.id = h.%I)',
                   r.hija, r.col, r.madre, r.col) into v_m;
    insert into _ids_cuentas (que, antes) values
      (format('filas %s.%s', r.hija, r.col), v_n),
      (format('colgando %s.%s', r.hija, r.col), v_m);
  end loop;

  -- 2.4 persona y grupo: copia con el id nuevo, FK a la copia, fuera la vieja.
  for r in select unnest(array['persona', 'grupo']) as t loop
    select string_agg(quote_ident(column_name), ', ' order by ordinal_position),
           string_agg('t.' || quote_ident(column_name), ', ' order by ordinal_position)
      into v_cols, v_tcols
      from information_schema.columns
     where table_schema = 'public' and table_name = r.t and column_name <> 'id'
       and is_generated = 'NEVER' and identity_generation is null;
    execute format('insert into public.%I (id, %s) select m.nuevo::text, %s from public.%I t '
                   'join pg_temp._ids_mapa m on m.viejo = t.id on conflict (household_id, id) do nothing',
                   r.t, v_cols, v_tcols, r.t);
    get diagnostics v_n = row_count;
    insert into _ids_informe (linea) values (format('%s: %s filas copiadas con el id nuevo', r.t, v_n));
  end loop;

  for r in
    select c.conrelid::regclass as hija, a.attname as col, format_type(a.atttypid, a.atttypmod) as tipo
      from pg_constraint c
      join pg_attribute a on a.attrelid = c.conrelid
      join pg_attribute pa on pa.attrelid = c.confrelid and pa.attname = 'id'
      join lateral unnest(c.conkey, c.confkey) as k(hijo, padre) on k.padre = pa.attnum and a.attnum = k.hijo
     where c.contype = 'f'
       and c.confrelid in ('public.persona'::regclass, 'public.grupo'::regclass)
     order by 1, 2
  loop
    if r.tipo <> 'text' then
      raise exception '0091: %.% apunta a persona o grupo y no es text (%): revisa la migración', r.hija, r.col, r.tipo;
    end if;
    execute format('update %s h set %I = m.nuevo::text from pg_temp._ids_mapa m where h.%I = m.viejo',
                   r.hija, r.col, r.col);
    get diagnostics v_n = row_count;
    insert into _ids_informe (linea) values (format('%s.%s: %s filas apuntan ya al id nuevo', r.hija, r.col, v_n));
    -- Nadie puede seguir apuntando a una fila vieja: su borrado se lo llevaría.
    execute format('select count(*) from %s h join pg_temp._ids_mapa m on m.viejo = h.%I', r.hija, r.col) into v_n;
    if v_n > 0 then
      raise exception '0091: %.% sigue apuntando a % ids viejos; no se borra nada', r.hija, r.col, v_n;
    end if;
  end loop;

  delete from public.grupo t using _ids_mapa m where t.id = m.viejo;
  get diagnostics v_n = row_count;
  insert into _ids_informe (linea) values (format('grupo: %s filas viejas fuera (ya sin nada colgando)', v_n));
  delete from public.persona t using _ids_mapa m where t.id = m.viejo;
  get diagnostics v_n = row_count;
  insert into _ids_informe (linea) values (format('persona: %s filas viejas fuera (ya sin nada colgando)', v_n));

  -- 2.5 Las columnas sin FK. household_state va después de persona: su trigger
  -- (personas_al_guardar, 0089) sincroniza persona con los ids nuevos y ya los
  -- encuentra, así que no borra a nadie.
  for e in select * from jsonb_array_elements(v_inventario) loop
    if e->>2 = 'jsonb_casa' then
      execute format('update public.%I set %I = pg_temp._ids_reescribir(%I::text)::jsonb, '
                     'bot_rev = bot_rev + 1, updated_at = now() where %I::text ~ $1',
                     e->>0, e->>1, e->>1, e->>1) using v_re;
    elsif e->>2 = 'jsonb' then
      execute format('update public.%I set %I = pg_temp._ids_reescribir(%I::text)::jsonb where %I::text ~ $1',
                     e->>0, e->>1, e->>1, e->>1) using v_re;
    elsif e->>2 = 'jsonb_sin_texto' then
      execute format('update public.%I set %I = case when %I ? ''texto'' '
                     'then pg_temp._ids_reescribir((%I - ''texto'')::text)::jsonb || jsonb_build_object(''texto'', %I->''texto'') '
                     'else pg_temp._ids_reescribir(%I::text)::jsonb end '
                     'where jsonb_typeof(%I) = ''object'' '
                     'and (case when jsonb_typeof(%I) = ''object'' then %I - ''texto'' end)::text ~ $1',
                     e->>0, e->>1, e->>1, e->>1, e->>1, e->>1, e->>1, e->>1, e->>1) using v_re;
    elsif e->>2 = 'texto' then
      execute format('update public.%I set %I = pg_temp._ids_reescribir(%I) where %I ~ $1',
                     e->>0, e->>1, e->>1, e->>1) using v_re;
    else
      raise exception '0091: modo desconocido % en el inventario', e->>2;
    end if;
    get diagnostics v_n = row_count;
    insert into _ids_informe (linea) values (format('%s.%s: %s filas reescritas', e->>0, e->>1, v_n));
  end loop;

  -- ── 3. Comprobaciones: si algo no cuadra, se deshace todo ─────────────────

  -- 3.1 Ningún id viejo en ninguna columna de texto o JSON de public.
  v_txt := null;
  for r in
    select c.table_name as t, c.column_name as col, c.data_type as dt
      from information_schema.columns c
      join information_schema.tables x on x.table_schema = c.table_schema and x.table_name = c.table_name
     where c.table_schema = 'public' and x.table_type = 'BASE TABLE'
       and c.data_type in ('text', 'jsonb', 'json', 'ARRAY', 'character varying')
       and c.table_name <> 'ids_uuid_equivalencias'
  loop
    if r.t = 'bot_messages' and r.col = 'content' then
      execute format('select count(*) from public.%I where (case when jsonb_typeof(%I) = ''object'' '
                     'then %I - ''texto'' else %I end)::text ~ $1', r.t, r.col, r.col, r.col) into v_n using v_re;
    else
      execute format('select count(*) from public.%I where %I::text ~ $1', r.t, r.col) into v_n using v_re;
    end if;
    if v_n > 0 then
      v_txt := coalesce(v_txt || ', ', '') || format('%s.%s (%s filas)', r.t, r.col, v_n);
    end if;
  end loop;
  if v_txt is not null then
    raise exception '0091: quedan ids viejos en %: añade la columna al INVENTARIO o mira qué es', v_txt;
  end if;

  -- 3.2 Mismas personas, grupos y filas colgando de ellos; ninguna colgada nueva.
  update _ids_cuentas k set despues = v.n
    from (select 'persona' as que, count(*) as n from public.persona
          union all select 'grupo', count(*) from public.grupo
          union all select 'persona de ' || household_id, count(*) from public.persona group by household_id
          union all select 'grupo de ' || household_id, count(*) from public.grupo group by household_id) v
   where v.que = k.que;
  for r in
    select c.conrelid::regclass as hija, a.attname as col, c.confrelid::regclass as madre
      from pg_constraint c
      join pg_attribute a on a.attrelid = c.conrelid
      join pg_attribute pa on pa.attrelid = c.confrelid and pa.attname = 'id'
      join lateral unnest(c.conkey, c.confkey) as k(hijo, padre) on k.padre = pa.attnum and a.attnum = k.hijo
     where c.contype = 'f'
       and c.confrelid in ('public.persona'::regclass, 'public.grupo'::regclass)
  loop
    execute format('select count(%I) from %s', r.col, r.hija) into v_n;
    execute format('select count(*) from %s h where h.%I is not null and not exists '
                   '(select 1 from %s m where m.household_id = h.household_id and m.id = h.%I)',
                   r.hija, r.col, r.madre, r.col) into v_m;
    update _ids_cuentas set despues = v_n where que = format('filas %s.%s', r.hija, r.col);
    update _ids_cuentas set despues = v_m where que = format('colgando %s.%s', r.hija, r.col);
  end loop;
  select string_agg(format('%s: %s → %s', que, antes, coalesce(despues, 0)), '; ') into v_txt
    from _ids_cuentas
   where (que like 'colgando %' and coalesce(despues, 0) > antes)
      or (que not like 'colgando %' and coalesce(despues, 0) <> antes);
  if v_txt is not null then
    raise exception '0091: se perdería o se desengancharía algo: %', v_txt;
  end if;

  -- 3.3 persona, grupo y las listas de cada casa, ya sin ids viejos.
  select count(*) into v_n from public.persona where id !~* c_uuid;
  select count(*) into v_m from public.grupo where id !~* c_uuid;
  if v_n + v_m > 0 then
    raise exception '0091: quedan % personas y % grupos con id no UUID', v_n, v_m;
  end if;
  select count(*) into v_n
    from public.household_state hs, pg_temp._ids_de_estado(hs.state) d
   where d.id !~* c_uuid and d.id not like 'inv\_%';
  if v_n > 0 then
    raise exception '0091: quedan % ids no UUID en las listas de household_state', v_n;
  end if;

  insert into _ids_informe (linea)
  select format('comprobado: %s', string_agg(format('%s %s', que, despues), ', ' order by que))
    from _ids_cuentas where que not like '% de %';
  for v_txt in select linea from _ids_informe order by orden loop
    raise notice '0091 · %', v_txt;
  end loop;
end;
$$;
