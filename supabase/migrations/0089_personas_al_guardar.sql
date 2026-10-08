-- 0089 · Cada guardado de la casa copia la familia a persona y grupo.
--
-- Qué se rompía: las tablas persona/grupo (0079) solo las rellenaba a mano
-- scripts/backfill-personas.mjs. Nadie llamaba a persona_sincronizar_casa
-- (0081/0082) al guardar, así que se quedaban viejas; y de ellas cuelgan la FK
-- bot_tareas → persona (0083) y la ficha de la casa (0120).
--
-- Cómo: un trigger AFTER sobre household_state, en la misma transacción que el
-- guardado. No se tocan las funciones de guardado, por tres razones:
--   · escriben household_state.state seis funciones (save_household_state,
--     bot_save_casa, bot_save_casa_activando, household_shopping_mark,
--     ensure_user_household, _unirse…): el trigger las cubre a todas, y a las
--     que vengan;
--   · save_household_state es SECURITY INVOKER (corre como el usuario), y
--     persona_sincronizar_casa no se puede ejecutar como authenticated: llamarla
--     desde ahí rompería cada guardado de la app. El trigger es definer;
--   · copiar enteras tres funciones para añadir una línea es la forma de que
--     diverjan. Y el p_bot_rev nulo de los clientes viejos no le afecta.
--
-- Qué copia: SOLO la familia activa (data.members / data.groups). Desde el
-- 8 oct 2026 no hay varios rosters: los aparcados en data.rosters no se copian
-- (si están en la tabla, el primer guardado los borra), ni los invitados de las
-- reglas (`invitado: true`, ids `inv_…`). Y si la casa tiene activo otro roster
-- que no es `default` (una PWA vieja en caché aún puede cambiar a «Otro grupo»),
-- no se copia nada: data.members sería ese grupo y borraría a la familia real.
--
-- Rompe a la vista el principio 11 (una transacción, un módulo): la conversión
-- JSON → filas existe dos veces, src/lib/personasTabla.js (filasDeCasa, la
-- referencia, que usa el backfill) y _persona_filas_de_estado aquí. Por qué:
-- para que la copia sea atómica con el guardado tiene que hacerla la base.
-- supabase/personasAlGuardar.test.js compara las claves de `resto` y los topes.
--
-- Nunca rompe un guardado: sin lista de comensales (guardado parcial) o con la
-- familia vacía no hace nada (la 0082 rechazaría vaciar la casa), y si la copia
-- falla, avisa con un WARNING en el log de Postgres y el guardado sigue.
--
-- Quitar a alguien de la familia: cada guardado que lo quita borra su fila de
-- persona y, en cascada, su salud (persona_alergia, _intolerancia, _estado,
-- _perfil_salud: dato de salud, debe irse). Sus tareas NO: la FK de la 0083
-- pasa aquí de `on delete cascade` a `on delete set null (persona_id)`. La
-- 0083 decía que «una baja lógica no borra la fila»; con la sincronización por
-- clave (0081) no era verdad, y quitar a alguien se llevaba sus tareas. Las
-- tareas sobre una persona que ya no está las descarta el código
-- (api/_bot/estadoCasa.js, estadoDeClave → «sin_persona» → descartada).
-- La FK nueva va NOT VALID; su validate, en PENDIENTES.md.
--
-- Al final pone al día todas las casas una vez (las de roster `default`):
-- borra de persona a quien ya no está en data.members (con su salud; sus
-- tareas se quedan con persona_id a null).
--
-- Idempotente. SIN APLICAR.

set local lock_timeout = '5s';

-- Precondición: la sincronización por clave (0081) con sus guardas (0082). Sin
-- ellas, una lista vacía vaciaría la casa y, con la FK, sus tareas.
do $$
begin
  if to_regprocedure('public.persona_sincronizar_casa(uuid, jsonb)') is null then
    raise exception '0089 necesita persona_sincronizar_casa (0081): aplícala antes';
  end if;
  if pg_get_functiondef('public.persona_sincronizar_casa(uuid, jsonb)'::regprocedure) not ilike '%lista de personas vacía%' then
    raise exception '0089 necesita las guardas de la 0082 en persona_sincronizar_casa: aplícala antes';
  end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'bot_tareas' and column_name = 'persona_id') then
    raise exception '0089 necesita bot_tareas.persona_id (0080): aplícala antes';
  end if;
end;
$$;

-- Tareas → persona: quitar a alguien de la familia no borra sus tareas (ver
-- cabecera). Misma FK compuesta que la 0083; solo cambia el on delete. Se
-- quita y se pone en la misma sentencia. El índice ya lo creó la 0083.
create index if not exists bot_tareas_persona
  on public.bot_tareas (household_id, persona_id) where persona_id is not null;
alter table public.bot_tareas
  drop constraint if exists bot_tareas_persona_fk,
  add constraint bot_tareas_persona_fk
    foreign key (household_id, persona_id) references public.persona(household_id, id)
    on delete set null (persona_id) not valid;

-- Una fecha ISO que existe, o null. «2020-02-30» tiene la forma pero no
-- convierte a date, y haría fallar la fila entera.
create or replace function public._fecha_iso_o_null(p text)
returns text
language plpgsql
immutable
set search_path = public, pg_temp
as $$
begin
  if p is null or p !~ '^\d{4}-\d{2}-\d{2}$' then
    return null;
  end if;
  return case when to_char(p::date, 'YYYY-MM-DD') = p then p end;
exception when others then
  return null;
end;
$$;

revoke all on function public._fecha_iso_o_null(text) from public, anon, authenticated;

-- El gemelo de filasDeCasa (src/lib/personasTabla.js): el estado de la casa en
-- la forma que recibe persona_sincronizar_casa. Pura.
create or replace function public._persona_filas_de_estado(p_state jsonb)
returns jsonb
language sql
stable
set search_path = public, pg_temp
as $$
  with miembros as (
    -- Con id, que no sean invitados; si un id se repite, gana el primero. Con
    -- otro roster activo (cliente viejo en «Otro grupo»), nadie.
    select distinct on (t.x->>'id') t.x as m, t.x->>'id' as id
      from jsonb_array_elements(case when jsonb_typeof(p_state->'data'->'members') = 'array'
                                      and coalesce(p_state->'data'->>'activeRosterId', 'default') = 'default'
                                     then p_state->'data'->'members' else '[]'::jsonb end)
           with ordinality as t(x, ord)
     where jsonb_typeof(t.x) = 'object'
       and nullif(btrim(t.x->>'id', E' \t\r\n'), '') is not null
       and t.x->'invitado' is distinct from 'true'::jsonb
       and t.x->>'id' not like 'inv\_%'
     order by t.x->>'id', t.ord
  ),
  numeros as (
    select mi.id, mi.m,
           case when jsonb_typeof(mi.m->'age') = 'number' then trunc((mi.m->>'age')::numeric) end as edad,
           case when jsonb_typeof(mi.m->'pesoKg') = 'number' then (mi.m->>'pesoKg')::numeric end as peso,
           case when jsonb_typeof(mi.m->'alturaCm') = 'number' then (mi.m->>'alturaCm')::numeric end as altura
      from miembros mi
  ),
  personas as (
    -- Los topes son los CHECK de persona (0079), y los de RANGOS en JS.
    select n.id, jsonb_build_object(
      'id', n.id,
      'nombre', coalesce(nullif(btrim(n.m->>'name', E' \t\r\n'), ''), '(sin nombre)'),
      'edad', case when n.edad >= 0 and n.edad <= 120 then n.edad::int end,
      'rol_hogar', n.m->>'homeRole',
      'alergias_revisadas', n.m->'alergiasRevisadas' is not distinct from 'true'::jsonb,
      'peso_kg', case when n.peso >= 2 and n.peso <= 300 then n.peso end,
      'altura_cm', case when n.altura >= 40 and n.altura <= 230 then n.altura end,
      'usa_fecha_nacimiento', n.m->'useBirthDate' is not distinct from 'true'::jsonb,
      'fecha_nacimiento', public._fecha_iso_o_null(case when jsonb_typeof(n.m->'birthDate') = 'string' then n.m->>'birthDate' end),
      'detalle_etapa', nullif(btrim(n.m->>'stageDetail', E' \t\r\n'), ''),
      'no_es_bebe', n.m->'notBaby' is not distinct from 'true'::jsonb,
      'clave_perfil', nullif(btrim(n.m->>'profileKey', E' \t\r\n'), ''),
      'clave_avatar', nullif(btrim(n.m->>'avatarKey', E' \t\r\n'), ''),
      'color', nullif(btrim(n.m->>'color', E' \t\r\n'), ''),
      -- Lo que no tiene columna: las mismas claves que CAMPOS_CON_COLUMNA.
      'resto', n.m - array['id', 'name', 'age', 'homeRole', 'alergiasRevisadas', 'pesoKg', 'alturaCm',
                          'allergies', 'intolerances', 'dietaryStates', 'dietaryStatesMeta',
                          'useBirthDate', 'birthDate', 'stageDetail', 'notBaby', 'profileKey', 'avatarKey', 'color',
                          'healthProfiles', 'healthProfile']
    ) as fila
      from numeros n
  ),
  lista as (
    -- Cada lista de texto de un miembro, limpia y sin repetidos.
    select distinct mi.id as persona_id, k.clave, btrim(v, E' \t\r\n') as valor
      from miembros mi
     cross join (values ('allergies'), ('intolerances'), ('dietaryStates'), ('healthProfiles')) as k(clave)
     cross join lateral jsonb_array_elements_text(case when jsonb_typeof(mi.m->k.clave) = 'array'
                                                       then mi.m->k.clave else '[]'::jsonb end) as v
     where btrim(v, E' \t\r\n') <> ''
    union
    -- El perfil antiguo (un texto suelto) cuenta como uno más de la lista nueva.
    select mi.id, 'healthProfiles', btrim(mi.m->>'healthProfile', E' \t\r\n')
      from miembros mi
     where btrim(mi.m->>'healthProfile', E' \t\r\n') <> ''
  ),
  grupos as (
    -- El orden es la posición en la lista original, como en JS.
    select distinct on (t.g->>'id') t.g->>'id' as id, t.g, (t.ord - 1)::int as orden
      from jsonb_array_elements(case when jsonb_typeof(p_state->'data'->'groups') = 'array'
                                      and coalesce(p_state->'data'->>'activeRosterId', 'default') = 'default'
                                     then p_state->'data'->'groups' else '[]'::jsonb end)
           with ordinality as t(g, ord)
     where jsonb_typeof(t.g) = 'object'
       and nullif(btrim(t.g->>'id', E' \t\r\n'), '') is not null
     order by t.g->>'id', t.ord
  ),
  grupo_persona as (
    select distinct gr.id as grupo_id, p as persona_id
      from grupos gr
     cross join lateral jsonb_array_elements_text(case when jsonb_typeof(gr.g->'memberIds') = 'array'
                                                       then gr.g->'memberIds' else '[]'::jsonb end) as p
     where p in (select id from miembros)
  )
  select jsonb_build_object(
    'personas', coalesce((select jsonb_agg(fila order by id) from personas), '[]'::jsonb),
    'alergias', coalesce((select jsonb_agg(jsonb_build_object('persona_id', persona_id, 'alergeno', valor))
                            from lista where clave = 'allergies'), '[]'::jsonb),
    'intolerancias', coalesce((select jsonb_agg(jsonb_build_object('persona_id', persona_id, 'valor', valor))
                                 from lista where clave = 'intolerances'), '[]'::jsonb),
    'estados', coalesce((select jsonb_agg(jsonb_build_object(
                           'persona_id', l.persona_id, 'estado', l.valor,
                           'hasta', public._fecha_iso_o_null(
                             case when jsonb_typeof(mi.m->'dietaryStatesMeta'->l.valor->'hasta') = 'string'
                                  then mi.m->'dietaryStatesMeta'->l.valor->>'hasta' end)))
                           from lista l join miembros mi on mi.id = l.persona_id
                          where l.clave = 'dietaryStates'), '[]'::jsonb),
    'perfilesSalud', coalesce((select jsonb_agg(jsonb_build_object('persona_id', persona_id, 'perfil', valor))
                                 from lista where clave = 'healthProfiles'), '[]'::jsonb),
    'grupos', coalesce((select jsonb_agg(jsonb_build_object(
                          'id', id,
                          'nombre', coalesce(nullif(btrim(g->>'label', E' \t\r\n'), ''), '(sin nombre)'),
                          'color', case when jsonb_typeof(g->'color') = 'string' then g->>'color' end,
                          'orden', orden) order by orden)
                          from grupos), '[]'::jsonb),
    'grupoPersona', coalesce((select jsonb_agg(jsonb_build_object('grupo_id', grupo_id, 'persona_id', persona_id))
                                from grupo_persona), '[]'::jsonb)
  );
$$;

revoke all on function public._persona_filas_de_estado(jsonb) from public, anon, authenticated;

-- El trigger. Definer: save_household_state corre como el usuario, que no
-- puede tocar persona ni ejecutar persona_sincronizar_casa.
create or replace function public._personas_al_guardar()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_filas jsonb;
begin
  -- Un guardado sin lista de comensales no dice nada de quién vive en la casa.
  if jsonb_typeof(new.state->'data'->'members') is distinct from 'array' then
    return null;
  end if;
  -- Un cliente viejo en «Otro grupo»: data.members no es la familia de la casa.
  if coalesce(new.state->'data'->>'activeRosterId', 'default') <> 'default' then
    return null;
  end if;
  -- Todo lo demás, dentro del bloque: nada de aquí puede tumbar un guardado.
  begin
    v_filas := public._persona_filas_de_estado(new.state);
    -- Familia vacía (casa recién creada, «Reiniciar»): no se vacía la tabla al
    -- guardar; la 0082 lo rechazaría igual.
    if jsonb_array_length(v_filas->'personas') = 0 then
      return null;
    end if;
    perform public.persona_sincronizar_casa(new.household_id, v_filas);
  exception when others then
    raise warning '_personas_al_guardar: casa %, la copia a persona falló (% %); el guardado sigue',
      new.household_id, sqlstate, sqlerrm;
  end;
  return null;
end;
$$;

revoke all on function public._personas_al_guardar() from public, anon, authenticated;

create or replace trigger personas_al_crear
  after insert on public.household_state
  for each row
  execute function public._personas_al_guardar();

-- Solo si cambian los comensales o los grupos: tachar la compra o guardar el
-- menú no copia nada.
create or replace trigger personas_al_guardar
  after update of state on public.household_state
  for each row
  when (old.state->'data'->'members' is distinct from new.state->'data'->'members'
        or old.state->'data'->'groups' is distinct from new.state->'data'->'groups')
  execute function public._personas_al_guardar();

-- Poner al día, una vez, las casas que ya hay. Una casa que falle no para las
-- demás: queda un WARNING y se copiará en su próximo guardado.
do $$
declare
  r record;
  v_filas jsonb;
begin
  for r in
    select household_id, state from public.household_state
     where jsonb_typeof(state->'data'->'members') = 'array'
       and coalesce(state->'data'->>'activeRosterId', 'default') = 'default'
  loop
    begin
      v_filas := public._persona_filas_de_estado(r.state);
      continue when jsonb_array_length(v_filas->'personas') = 0;
      perform public.persona_sincronizar_casa(r.household_id, v_filas);
    exception when others then
      raise warning '0089: casa %, la copia a persona falló (% %)', r.household_id, sqlstate, sqlerrm;
    end;
  end loop;
end;
$$;
