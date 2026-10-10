-- Ficha de la casa (spec v18): qué se puede saber y cómo lo sabemos.
--
-- NÚMERO: era la 0120 en el PR #106 (8 oct 2026); pasó a la 0097, el contiguo a staging. La 0120 queda libre.
-- NOMBRES: las tablas de la ficha van en singular, como persona y grupo (excepción declarada a PRINCIPIOS §12).
--
--   · registro_campo: el catálogo de campos. Se rellena desde src/lib/registroCampos.js;
--     registroCampos.test.js compara el INSERT de aquí con ese objeto.
--   · sobre: la procedencia de cada dato (quién lo dijo, cómo lo sabemos, cuándo,
--     por qué canal y a raíz de qué). Uno por casa, campo y persona (persona nula = la casa).
--     Si el campo tiene columna propia (registro_campo.columna: persona.edad, persona.fecha_nacimiento,
--     persona_alergia), manda la columna y sobre.valor tiene que ser nulo (lo exige el trigger);
--     si no la tiene, el valor vive aquí.
--   · ficha_casa(): la lectura compacta para Lola, ficha y tareas abiertas en una ida.
--
-- persona.id sigue siendo text: estas FKs pasan a uuid con persona cuando toque (ver PENDIENTES.md).
--
-- Va después de la 0080 (bot_tareas v2: tipo, campo, persona_id, vuelve_at…) y de la
-- 0081/0082 (la copia de personas sincroniza por clave). Con la copia antigua, que borraba
-- y reinsertaba, las FKs en cascada de sobre se llevaría la procedencia en cada guardado.
-- La 0080, la 0081 y la 0082 están aplicadas desde el 8 oct 2026; la guardia de abajo sigue por si
-- alguien aplica esto sobre otra base.
--
-- Era la 0120 (PR #106, 8 oct); se rehízo el 10 oct sobre staging con el número contiguo (0097) y con
-- los principios que llegaron después (PRINCIPIOS.md, 0096). Cambios respecto a aquella:
--   · 'float' pasa a 'decimal' (el principio 14 prohíbe la palabra y el campo es numeric);
--   · sin la tabla cambio (historial de solo añadir) ni las columnas registro_campo.visibilidad y .unidad:
--     ningún código ni función las lee (regla «ningún campo ni tabla sin lector»). Vuelven con su primer
--     lector o escritor, en otra migración;
--   · sin las columnas sobre.frase, .rechazados y .preguntado (ni lector ni escritor); vuelven con su
--     primer escritor, en otra migración;
--   · registro_campo.columna: una sola verdad para los campos que ya tienen columna propia;
--   · etapaBebe pasa a por = casa (un dato por casa, como data.etapaBebe);
--   · sobre.quien_user pasa a dicho_by y sobre.fecha a confirmado_at;
--   · ficha_casa solo para service_role mientras la app no tenga lector;
--   · el trigger de sobre pone tope de 200 caracteres a los textos;
--   · lock_timeout, on delete en campo, índice de cada FK, created_at, comentarios (también SALUD:),
--     search_path con pg_temp y revoke a authenticated en ficha_casa, y el constraint
--     registro_campo_enum_con_vocabulario pasa a registro_campo_enum_lista_check (el sufijo
--     _vocabulario lo reserva src/lib/vocabularios.test.js a los CHECK de una lista cerrada).
--
-- Lectores y escritores (principio 8, «ningún campo sin lector»), al 10 oct 2026:
--   · registro_campo: la lee ficha_casa (faltan, tareas de seguridad), el trigger sobre_valor_valido y la FK
--     de sobre; la escribe esta migración, generada de src/lib/registroCampos.js (módulo dueño).
--   · sobre: la lee ficha_casa (datos, faltan). Aún no la escribe ningún código: la primera escritura
--     será de la sesión de la ficha (RPC que anota «lo dijo X por Y»). La lee api/_bot/fichaRpc.js (servidor,
--     clave de servicio); la app no la lee todavía.
--
-- Consultas previas (deben dar 0): ninguna de las dos tablas existe aún.
--   select count(*) from information_schema.tables
--    where table_schema = 'public' and table_name in ('registro_campo', 'sobre');
-- Objeto testigo: la tabla public.registro_campo con 7 filas y la función public.ficha_casa.
set lock_timeout = '5s';

do $$
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'bot_tareas' and column_name = 'vuelve_at') then
    raise exception 'Falta la 0080 (bot_tareas v2): aplícala antes que la 0097';
  end if;
  if to_regprocedure('public.persona_sincronizar_casa(uuid, jsonb)') is null then
    raise exception 'Falta la 0081 (persona_sincronizar_casa): aplícala antes que la 0097';
  end if;
  if to_regprocedure('public.persona_reemplazar_casa(uuid, jsonb)') is not null
     and pg_get_functiondef('public.persona_reemplazar_casa(uuid, jsonb)'::regprocedure) not ilike '%persona_sincronizar_casa%' then
    raise exception 'persona_reemplazar_casa todavía borra y reinserta: aplica la 0081 antes que la 0097';
  end if;
end $$;

-- 1. registro_campo ------------------------------------------------------------

create table if not exists public.registro_campo (
  id          text primary key,
  tipo        text not null,
  vocabulario text,
  minimo      numeric,
  maximo      numeric,
  politica    text not null,
  seguridad   boolean not null default false,
  por         text not null default 'persona',
  aplica      text not null default 'todos',
  columna     text,
  caduca_dias integer check (caduca_dias is null or caduca_dias > 0),
  created_at  timestamptz not null default now(),
  constraint registro_campo_id_forma check (id ~ '^[a-zA-Z][a-zA-Z0-9_]*$'),
  constraint registro_campo_tipo_vocabulario
    check (tipo in ('enum', 'lista_enum', 'int', 'decimal', 'bool', 'fecha', 'ref', 'texto')),
  constraint registro_campo_politica_vocabulario
    check (politica in ('nunca', 'solo_si_lo_piden', 'antes_de_usarlo', 'de_pasada', 'una_vez')),
  constraint registro_campo_por_vocabulario check (por in ('persona', 'casa')),
  constraint registro_campo_aplica_vocabulario check (aplica in ('todos', 'bebe')),
  -- vocabulario si y solo si es enum; rango solo en numéricos
  constraint registro_campo_enum_lista_check check ((tipo in ('enum', 'lista_enum')) = (vocabulario is not null)),
  constraint registro_campo_columna_forma check (columna is null or columna ~ '^[a-z_]+(\.[a-z_]+)?$'),
  constraint registro_campo_rango check (minimo is null or maximo is null or minimo <= maximo),
  constraint registro_campo_rango_numerico check ((minimo is null and maximo is null) or tipo in ('int', 'decimal'))
);

comment on table public.registro_campo is
  'Catálogo de campos de la ficha (qué se puede saber de una casa o de una persona y cómo preguntarlo). Global, no de una casa: se genera de src/lib/registroCampos.js (módulo dueño; registroCampos.test.js compara los dos). No editar a mano.';
comment on column public.registro_campo.id is 'Nombre del campo, tal cual está en REGISTRO_CAMPOS (src/lib/registroCampos.js).';
comment on column public.registro_campo.vocabulario is 'Nombre de su lista en VOCABULARIOS (src/lib/vocabularios.js); null si no es enum. No es FK: la lista vive en JS.';
comment on column public.registro_campo.minimo is 'Mínimo del valor numérico, que sobre_valor_valido comprueba; null si no aplica.';
comment on column public.registro_campo.maximo is 'Máximo del valor numérico, que sobre_valor_valido comprueba; null si no aplica.';
comment on column public.registro_campo.politica is 'Cuándo se pregunta (nunca, solo_si_lo_piden, antes_de_usarlo, de_pasada, una_vez); la lee ficha_casa en «faltan».';
comment on column public.registro_campo.seguridad is 'true: su tarea entra siempre en lo que lee Lola, sin límite (alergias…); la lee ficha_casa.';
comment on column public.registro_campo.por is 'Si el dato es de cada persona o de la casa entera; lo lee sobre_valor_valido.';
comment on column public.registro_campo.aplica is 'A quién se le pregunta: todos, o solo bebés (la etapa la decide etapaDe en JS); la lee ficha_casa y la usa faltanDeFicha.';
comment on column public.registro_campo.columna is 'Dónde vive ya el valor si el campo tiene columna o tabla propia (persona.edad, persona_alergia…): sobre.valor tiene que ser nulo y ficha_casa lee el valor de ahí. null = el valor vive en sobre.valor. Lo leen sobre_valor_valido y, con registroCampos.test.js, los dos case de ficha_casa.';
comment on column public.registro_campo.caduca_dias is 'Días que vive la pregunta abierta sobre el campo; null = el de su tipo de tarea. Lo lee registroTareas.js desde el JS, no desde esta tabla.';

-- Generado desde REGISTRO_CAMPOS; el test falla si no coincide.
insert into public.registro_campo
  (id, tipo, vocabulario, minimo, maximo, politica, seguridad, por, aplica, columna, caduca_dias) values
  ('alergias',      'lista_enum', 'alergenos',      null, null, 'una_vez',         true,  'persona', 'todos', 'persona_alergia',         30),
  ('etapaBebe',     'enum',       'etapa_bebe',     null, null, 'antes_de_usarlo', true,  'casa',    'bebe',  null,                    21),
  ('edad',          'int',        null,             0,    120,  'nunca',           false, 'persona', 'todos', 'persona.edad',            null),
  ('nacimiento',    'fecha',      null,             null, null, 'nunca',           false, 'persona', 'todos', 'persona.fecha_nacimiento', null),
  ('sexo',          'enum',       'sexo',           null, null, 'nunca',           false, 'persona', 'todos', null,                    null),
  ('colegio',       'texto',      null,             null, null, 'nunca',           false, 'persona', 'todos', null,                    null),
  ('patronSemanas', 'enum',       'patron_semanas', null, null, 'nunca',           false, 'persona', 'todos', null,                    null)
on conflict (id) do update set
  tipo = excluded.tipo, vocabulario = excluded.vocabulario,
  minimo = excluded.minimo, maximo = excluded.maximo, politica = excluded.politica,
  seguridad = excluded.seguridad, por = excluded.por,
  aplica = excluded.aplica, columna = excluded.columna, caduca_dias = excluded.caduca_dias;

-- 2. sobre ---------------------------------------------------------------------

create table if not exists public.sobre (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  persona_id   text,                       -- null = dato de la casa
  campo        text not null references public.registro_campo(id) on delete restrict,  -- restrict: no se borra un campo con datos
  valor        jsonb,                      -- solo si el campo no tiene columna propia (registro_campo.columna)
  origen       text not null,
  bloqueado    boolean not null default false,   -- no volver a preguntar (≠ no saberlo)
  dicho_by     uuid references auth.users(id) on delete set null,
  canal        text not null,
  ref_tipo     text,
  ref_id       text,
  confirmado_at timestamptz not null default now(),
  created_at   timestamptz not null default now(),
  constraint sobre_origen_vocabulario
    check (origen in ('dicho', 'supuesto', 'visto', 'derivado', 'por_defecto', 'delegado', 'no_quiere_decirlo')),
  constraint sobre_canal_vocabulario check (canal in ('app', 'telegram', 'whatsapp', 'sistema')),
  constraint sobre_ref_tipo_vocabulario check (ref_tipo is null or ref_tipo in ('menu', 'mensaje', 'pantalla', 'senal')),
  constraint sobre_ref_completa check ((ref_tipo is null) = (ref_id is null)),
  constraint sobre_sistema_sin_usuario check (canal <> 'sistema' or dicho_by is null),
  foreign key (household_id, persona_id) references public.persona(household_id, id) on delete cascade
);

create unique index if not exists sobre_unico
  on public.sobre (household_id, campo, coalesce(persona_id, ''));
-- Un índice por FK (PRINCIPIOS §2): sin ellos, cada borrado en cascada recorre la tabla.
create index if not exists sobre_persona on public.sobre (household_id, persona_id);
create index if not exists sobre_campo on public.sobre (campo);
create index if not exists sobre_dicho_by on public.sobre (dicho_by);

comment on table public.sobre is
  'SALUD: la procedencia de cada dato de la ficha (quién lo dijo, cómo lo sabemos, cuándo, por qué canal y a raíz de qué), uno por casa, campo y persona (persona nula = la casa). Puede guardar el valor de datos de salud (alergias, etapa del bebé) cuando el campo no tiene columna propia (hoy, etapaBebe). Se borra con la persona o la casa (cascada); sin plazo propio de conservación. La lee ficha_casa; aún no la escribe ningún código.';
comment on column public.sobre.persona_id is 'null = dato de la casa. FK compuesta a persona; persona.id sigue siendo text hasta el paso 2 de la transición a uuid (PENDIENTES.md).';
comment on column public.sobre.valor is 'Solo si el campo no tiene columna propia (registro_campo.columna es null; si la tiene, el trigger exige null); su tipo y rango los comprueba sobre_valor_valido contra registro_campo. Puede ser un escalar, por eso no lleva check de objeto.';
comment on column public.sobre.bloqueado is 'true: no volver a preguntar (distinto de no saberlo).';
comment on column public.sobre.dicho_by is 'El usuario que lo dijo. null = lo puso el sistema (canal = ''sistema'', que lo exige un check). También queda null si la cuenta se borra (on delete set null: el dato no depende de la cuenta).';
comment on column public.sobre.ref_id is 'Id de lo que lo originó, polimórfico según ref_tipo (menú, mensaje, pantalla o señal): sin FK a propósito.';
comment on column public.sobre.confirmado_at is 'Cuándo se confirmó el dato por última vez (se actualiza cada vez que se confirma); created_at es cuándo se creó la fila.';

-- El valor tiene el tipo y el rango de su campo. El vocabulario lo comprueba el
-- código (la lista vive en JS); aquí, la forma.
create or replace function public.sobre_valor_valido()
returns trigger language plpgsql set search_path = public, pg_temp as $$
declare
  r public.registro_campo;
  v jsonb := new.valor;
  bien boolean;
begin
  select * into r from public.registro_campo where id = new.campo;
  if (r.por = 'persona') <> (new.persona_id is not null) then
    raise exception 'sobre: el campo % es de %, y la persona no cuadra', new.campo, r.por using errcode = '23514';
  end if;
  if r.columna is not null and new.valor is not null then
    raise exception 'sobre: % tiene columna propia (%), su valor no va en sobre', new.campo, r.columna using errcode = '23514';
  end if;
  if v is null or jsonb_typeof(v) = 'null' then return new; end if;
  -- En una variable: dentro de un IF, PL/pgSQL cortaría la condición en el primer THEN del CASE.
  bien := case r.tipo
    when 'int'        then jsonb_typeof(v) = 'number' and (v #>> '{}')::numeric = trunc((v #>> '{}')::numeric)
    when 'decimal'    then jsonb_typeof(v) = 'number'
    when 'bool'       then jsonb_typeof(v) = 'boolean'
    when 'fecha'      then jsonb_typeof(v) = 'string' and (v #>> '{}') ~ '^\d{4}-\d{2}-\d{2}$'
    when 'lista_enum' then jsonb_typeof(v) = 'array'
                           and not exists (select 1 from jsonb_array_elements(v) e where jsonb_typeof(e) <> 'string')
    else jsonb_typeof(v) = 'string'      -- enum, ref, texto
  end;
  if not bien then
    raise exception 'sobre: % no es un valor de tipo % para %', v, r.tipo, new.campo using errcode = '23514';
  end if;
  -- Tope de 200 caracteres a cada texto (el valor entero o cada elemento de una lista).
  if exists (select 1 from jsonb_path_query(v, '$.** ? (@.type() == "string")') t where char_length(t #>> '{}') > 200) then
    raise exception 'sobre: texto de más de 200 caracteres para %', new.campo using errcode = '23514';
  end if;
  if r.tipo in ('int', 'decimal') and (
       (r.minimo is not null and (v #>> '{}')::numeric < r.minimo) or
       (r.maximo is not null and (v #>> '{}')::numeric > r.maximo)) then
    raise exception 'sobre: % fuera de rango para %', v, new.campo using errcode = '23514';
  end if;
  return new;
end $$;

drop trigger if exists sobre_valor_valido on public.sobre;
create trigger sobre_valor_valido before insert or update on public.sobre
  for each row execute function public.sobre_valor_valido();

-- 3. Acceso: como persona (0079), solo la service role y las RPC.

alter table public.registro_campo enable row level security;
alter table public.sobre enable row level security;
revoke all on public.registro_campo, public.sobre from anon, authenticated;
grant select on public.registro_campo to authenticated;
drop policy if exists registro_campo_lectura on public.registro_campo;
create policy registro_campo_lectura on public.registro_campo for select to authenticated using (true);

-- 4. ficha_casa ----------------------------------------------------------------
--
-- La ficha y las tareas abiertas en una ida, para el prompt de Lola. Contrato v1
-- acordado con la sesión del bot (8 oct):
--   · casa.rev = el bot_rev con el que se montó, y generado_at, para invalidar la caché;
--   · datos en orden fijo (campo, sujeto.tipo, sujeto.id) para que el bloque sea estable;
--   · la etapa no se calcula aquí: va en bruto y la decide etapaDe en JS;
--   · tareas personales solo de quien llama: auth.uid() si es un usuario, p_usuario si es la service role;
--   · las aplazadas solo entran cuando les toca volver; lo que no se debe repreguntar va en «callados»;
--   · de seguridad, todas; del resto, como mucho p_max_tareas.
-- Vetos, reglas, semana y menú no van aquí (v1): se siguen leyendo del estado de la casa.
create or replace function public.ficha_casa(
  p_casa uuid,
  p_usuario uuid default null,
  p_canal text default null,
  p_max_tareas integer default 8
) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_usuario uuid := coalesce(auth.uid(), case when auth.role() = 'service_role' then p_usuario end);
  v_rev bigint;
  v_personas jsonb;
  v_grupos jsonb;
  v_datos jsonb;
  v_faltan jsonb;
  v_tareas jsonb;
  v_callados jsonb;
begin
  if auth.uid() is not null and not exists (
       select 1 from public.household_members m where m.household_id = p_casa and m.user_id = auth.uid()) then
    raise exception 'ficha_casa: no eres de esta casa' using errcode = '42501';
  end if;
  if auth.uid() is null and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'ficha_casa: hace falta sesión' using errcode = '42501';
  end if;

  select s.bot_rev into v_rev from public.household_state s where s.household_id = p_casa;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', p.id, 'nombre', p.nombre, 'edad', p.edad,
           'fecha_nacimiento', p.fecha_nacimiento, 'usa_fecha_nacimiento', p.usa_fecha_nacimiento,
           'no_es_bebe', p.no_es_bebe, 'rol_hogar', p.rol_hogar,
           'alergias_revisadas', p.alergias_revisadas,
           'alergias', coalesce((select jsonb_agg(a.alergeno order by a.alergeno) from public.persona_alergia a
                                  where a.household_id = p.household_id and a.persona_id = p.id), '[]'::jsonb),
           'intolerancias', coalesce((select jsonb_agg(i.valor order by i.valor) from public.persona_intolerancia i
                                  where i.household_id = p.household_id and i.persona_id = p.id), '[]'::jsonb),
           'estados', coalesce((select jsonb_agg(jsonb_build_object('valor', e.estado, 'hasta', e.hasta) order by e.estado)
                                  from public.persona_estado e
                                 where e.household_id = p.household_id and e.persona_id = p.id), '[]'::jsonb),
           'grupos', coalesce((select jsonb_agg(gp.grupo_id order by gp.grupo_id) from public.grupo_persona gp
                                 where gp.household_id = p.household_id and gp.persona_id = p.id), '[]'::jsonb)
         ) order by p.id), '[]'::jsonb)
    into v_personas
    from public.persona p where p.household_id = p_casa;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', g.id, 'nombre', g.nombre,
           'miembros', coalesce((select jsonb_agg(gp.persona_id order by gp.persona_id) from public.grupo_persona gp
                                   where gp.household_id = g.household_id and gp.grupo_id = g.id), '[]'::jsonb)
         ) order by g.orden, g.id), '[]'::jsonb)
    into v_grupos
    from public.grupo g where g.household_id = p_casa;

  -- datos: lo que tiene sobre. Si el campo tiene columna (registro_campo.columna), el valor sale de ella:
  -- los tres «when» de abajo son exactamente los campos con columna (registroCampos.test.js lo comprueba).
  select coalesce(jsonb_agg(jsonb_build_object(
           'campo', s.campo,
           'sujeto', jsonb_build_object('tipo', case when s.persona_id is null then 'casa' else 'persona' end, 'id', s.persona_id),
           'valor', case s.campo
                      when 'edad' then to_jsonb(p.edad)
                      when 'nacimiento' then to_jsonb(p.fecha_nacimiento::text)
                      when 'alergias' then coalesce((select jsonb_agg(a.alergeno order by a.alergeno) from public.persona_alergia a
                                                      where a.household_id = s.household_id and a.persona_id = s.persona_id), '[]'::jsonb)
                      else s.valor end,
           'estado', case when s.bloqueado then 'bloqueado'
                          when s.origen = 'no_quiere_decirlo' then 'declinado'
                          when s.origen in ('dicho', 'delegado') then 'confirmado'
                          else 'inferido' end,
           'origen', s.origen,
           'confirmado_el', to_char(s.confirmado_at at time zone 'Europe/Madrid', 'YYYY-MM-DD'),
           'dicho_por', s.dicho_by,
           'canal', s.canal,
           'ref', case when s.ref_tipo is null then null else jsonb_build_object('tipo', s.ref_tipo, 'id', s.ref_id) end
         ) order by s.campo, (s.persona_id is not null), s.persona_id), '[]'::jsonb)
    into v_datos
    from public.sobre s
    left join public.persona p on p.household_id = s.household_id and p.id = s.persona_id
   where s.household_id = p_casa;

  -- faltan: campos que se pueden preguntar, sin sobre y sin valor en su columna (los tres «r.id =» son
  -- los mismos campos con columna).
  -- «aplica» va tal cual: si es «bebe», el JS mira la etapa antes de preguntarlo.
  select coalesce(jsonb_agg(jsonb_build_object(
           'campo', f.campo,
           'sujeto', jsonb_build_object('tipo', f.sujeto_tipo, 'id', f.persona_id),
           'politica', f.politica, 'aplica', f.aplica, 'seguridad', f.seguridad
         ) order by f.campo, f.sujeto_tipo, f.persona_id), '[]'::jsonb)
    into v_faltan
    from (
      select r.id as campo, 'persona' as sujeto_tipo, p.id as persona_id, r.politica, r.aplica, r.seguridad
        from public.registro_campo r
        join public.persona p on p.household_id = p_casa
       where r.politica <> 'nunca' and r.por = 'persona'
         and not exists (select 1 from public.sobre s where s.household_id = p_casa and s.campo = r.id and s.persona_id = p.id)
         and not (r.id = 'alergias' and p.alergias_revisadas)
         and not (r.id = 'edad' and p.edad is not null)
         and not (r.id = 'nacimiento' and p.fecha_nacimiento is not null)
      union all
      select r.id, 'casa', null, r.politica, r.aplica, r.seguridad
        from public.registro_campo r
       where r.politica <> 'nunca' and r.por = 'casa'
         and not exists (select 1 from public.sobre s where s.household_id = p_casa and s.campo = r.id and s.persona_id is null)
    ) f;

  -- tareas: abiertas, y aplazadas a las que ya les toca volver. Las de seguridad, todas.
  with visibles as (
    select t.*,
           coalesce(t.tipo, case t.kind when 'pregunta' then 'falta_saber' else t.kind end) as tipo_v2,
           coalesce(t.persona_id, t.para_member) as persona_v2,
           coalesce(r.seguridad, false) as es_seguridad
      from public.bot_tareas t
      left join public.registro_campo r on r.id = t.campo
     where t.household_id = p_casa
       and (t.status = 'abierta' or (t.status = 'aplazada' and (t.vuelve_at is null or t.vuelve_at <= now())))
       and (t.scope = 'casa' or t.owner_user_id = v_usuario)
  ), numeradas as (
    select v.*, row_number() over (partition by v.es_seguridad order by v.vence nulls last, v.created_at, v.id) as n
      from visibles v
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', x.id, 'tipo', x.tipo_v2, 'campo', x.campo, 'persona_id', x.persona_v2,
           'texto', x.texto, 'falta', x.falta, 'status', x.status,
           'scope', x.scope, 'owner_user_id', x.owner_user_id, 'encargado', x.asignado_member,
           'vence', x.vence, 'vuelve_at', x.vuelve_at, 'caduca_at', x.caduca_at, 'created_at', x.created_at,
           'seguridad', x.es_seguridad
         ) order by x.es_seguridad desc, x.vence nulls last, x.created_at, x.id), '[]'::jsonb)
    into v_tareas
    from numeradas x
   where x.es_seguridad or x.n <= greatest(coalesce(p_max_tareas, 8), 0);

  -- callados: lo que no se debe repreguntar (descartado o rechazado en 24 h, o aplazado a futuro).
  select coalesce(jsonb_agg(jsonb_build_object(
           'campo', c.campo, 'clave', c.clave, 'persona_id', c.persona_v2, 'hasta', c.hasta)
           order by c.campo nulls last, c.clave nulls last, c.persona_v2 nulls first), '[]'::jsonb)
    into v_callados
    from (
      select t.campo, t.clave, coalesce(t.persona_id, t.para_member) as persona_v2,
             max(case when t.status = 'aplazada' then t.vuelve_at else t.closed_at + interval '24 hours' end) as hasta
        from public.bot_tareas t
       where t.household_id = p_casa and (t.campo is not null or t.clave is not null)
         and (t.scope = 'casa' or t.owner_user_id = v_usuario)
         and ((t.status in ('descartada', 'rechazada') and t.closed_at > now() - interval '24 hours')
              or (t.status = 'aplazada' and t.vuelve_at > now()))
       group by 1, 2, 3
    ) c;

  return jsonb_build_object(
    'v', 1,
    'generado_at', now(),
    'canal', p_canal,
    'casa', jsonb_build_object('id', p_casa, 'rev', coalesce(v_rev, 0)),
    'personas', v_personas,
    'grupos', v_grupos,
    'datos', v_datos,
    'faltan', v_faltan,
    'tareas', v_tareas,
    'callados', v_callados
  );
end $$;

revoke all on function public.ficha_casa(uuid, uuid, text, integer) from public, anon, authenticated;
-- Solo la service role (el bot) hasta que la app tenga un lector; entonces se concede a authenticated.
grant execute on function public.ficha_casa(uuid, uuid, text, integer) to service_role;

comment on function public.ficha_casa(uuid, uuid, text, integer) is
  'La ficha de la casa y sus tareas abiertas en una ida, para el prompt de Lola (contrato v1; lector: api/_bot/fichaRpc.js). Solo la service role puede llamarla hoy (pasa p_usuario); la rama de authenticated, que solo ve su casa, queda lista para cuando la app la lea. Solo lectura.';
