-- Ficha de la casa (spec v18): qué se puede saber, cómo lo sabemos y qué cambió.
--
--   · registro_campo: el catálogo de campos. Se rellena desde src/lib/registroCampos.js;
--     registroCampos.test.js compara el INSERT de aquí con ese objeto.
--   · sobre: la procedencia de cada dato (quién lo dijo, cómo lo sabemos, cuándo,
--     por qué canal y a raíz de qué). Uno por casa, campo y persona (persona nula = la casa).
--     Si el campo tiene columna propia (persona.edad, persona_alergia…), manda la columna
--     y sobre.valor queda nulo; si no la tiene, el valor vive aquí.
--   · cambio: el historial. Solo admite inserciones (el trigger lo impide todo lo demás,
--     salvo el borrado en cascada de la casa o la persona y anular quien_user).
--   · ficha_casa(): la lectura compacta para Lola, ficha y tareas abiertas en una ida.
--
-- Visibilidad: se guarda en registro_campo pero hoy no filtra nada (Pablo, 7 oct: todo visible).
-- persona.id sigue siendo text: estas FKs pasan a uuid con persona cuando toque (ver PENDIENTES.md).
--
-- Va después de la 0080 (bot_tareas v2: tipo, campo, persona_id, vuelve_at…) y de la
-- 0081/0082 (la copia de personas sincroniza por clave). Con la copia antigua, que borraba
-- y reinsertaba, las FKs en cascada de sobre y cambio se llevarían la procedencia en cada guardado.
do $$
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'bot_tareas' and column_name = 'vuelve_at') then
    raise exception 'Falta la 0080 (bot_tareas v2): aplícala antes que la 0120';
  end if;
  if to_regprocedure('public.persona_sincronizar_casa(uuid, jsonb)') is null then
    raise exception 'Falta la 0081 (persona_sincronizar_casa): aplícala antes que la 0120';
  end if;
  if to_regprocedure('public.persona_reemplazar_casa(uuid, jsonb)') is not null
     and pg_get_functiondef('public.persona_reemplazar_casa(uuid, jsonb)'::regprocedure) not ilike '%persona_sincronizar_casa%' then
    raise exception 'persona_reemplazar_casa todavía borra y reinserta: aplica la 0081 antes que la 0120';
  end if;
end $$;

-- 1. registro_campo ------------------------------------------------------------

create table if not exists public.registro_campo (
  id          text primary key,
  tipo        text not null,
  vocabulario text,
  unidad      text,
  minimo      numeric,
  maximo      numeric,
  politica    text not null,
  visibilidad text not null default 'casa',
  seguridad   boolean not null default false,
  por         text not null default 'persona',
  aplica      text not null default 'todos',
  caduca_dias integer check (caduca_dias is null or caduca_dias > 0),
  constraint registro_campo_id_forma check (id ~ '^[a-zA-Z][a-zA-Z0-9_]*$'),
  constraint registro_campo_tipo_vocabulario
    check (tipo in ('enum', 'lista_enum', 'int', 'float', 'bool', 'fecha', 'ref', 'texto')),
  constraint registro_campo_politica_vocabulario
    check (politica in ('nunca', 'solo_si_lo_piden', 'antes_de_usarlo', 'de_pasada', 'una_vez')),
  constraint registro_campo_visibilidad_vocabulario
    check (visibilidad in ('casa', 'titulares', 'la_persona_y_tutores')),
  constraint registro_campo_por_vocabulario check (por in ('persona', 'casa')),
  constraint registro_campo_aplica_vocabulario check (aplica in ('todos', 'bebe')),
  -- vocabulario si y solo si es enum; rango solo en numéricos
  constraint registro_campo_enum_con_vocabulario check ((tipo in ('enum', 'lista_enum')) = (vocabulario is not null)),
  constraint registro_campo_rango check (minimo is null or maximo is null or minimo <= maximo),
  constraint registro_campo_rango_numerico check ((minimo is null and maximo is null) or tipo in ('int', 'float'))
);

comment on table public.registro_campo is
  'Catálogo de campos de la ficha. Fuente: src/lib/registroCampos.js (test de paridad). No editar a mano.';

-- Generado desde REGISTRO_CAMPOS; el test falla si no coincide.
insert into public.registro_campo
  (id, tipo, vocabulario, unidad, minimo, maximo, politica, visibilidad, seguridad, por, aplica, caduca_dias) values
  ('alergias',      'lista_enum', 'alergenos',      null,   null, null, 'una_vez',         'casa',                 true,  'persona', 'todos', 30),
  ('etapaBebe',     'enum',       'etapa_bebe',     null,   null, null, 'antes_de_usarlo', 'casa',                 true,  'persona', 'bebe',  21),
  ('edad',          'int',        null,             'años', 0,    120,  'nunca',           'casa',                 false, 'persona', 'todos', null),
  ('nacimiento',    'fecha',      null,             null,   null, null, 'nunca',           'casa',                 false, 'persona', 'todos', null),
  ('sexo',          'enum',       'sexo',           null,   null, null, 'nunca',           'la_persona_y_tutores', false, 'persona', 'todos', null),
  ('colegio',       'texto',      null,             null,   null, null, 'nunca',           'casa',                 false, 'persona', 'todos', null),
  ('patronSemanas', 'enum',       'patron_semanas', null,   null, null, 'nunca',           'titulares',            false, 'persona', 'todos', null)
on conflict (id) do update set
  tipo = excluded.tipo, vocabulario = excluded.vocabulario, unidad = excluded.unidad,
  minimo = excluded.minimo, maximo = excluded.maximo, politica = excluded.politica,
  visibilidad = excluded.visibilidad, seguridad = excluded.seguridad, por = excluded.por,
  aplica = excluded.aplica, caduca_dias = excluded.caduca_dias;

-- 2. sobre ---------------------------------------------------------------------

create table if not exists public.sobre (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  persona_id   text,                       -- null = dato de la casa
  campo        text not null references public.registro_campo(id),
  valor        jsonb,                      -- solo si el campo no tiene columna propia
  origen       text not null,
  bloqueado    boolean not null default false,   -- no volver a preguntar (≠ no saberlo)
  preguntado   integer not null default 0 check (preguntado >= 0),
  quien_user   uuid references auth.users(id) on delete set null,
  canal        text not null,
  frase        text check (frase is null or length(frase) <= 500),
  rechazados   jsonb check (rechazados is null or jsonb_typeof(rechazados) = 'array'),
  ref_tipo     text,
  ref_id       text,
  fecha        timestamptz not null default now(),
  constraint sobre_origen_vocabulario
    check (origen in ('dicho', 'supuesto', 'visto', 'derivado', 'por_defecto', 'delegado', 'no_quiere_decirlo')),
  constraint sobre_canal_vocabulario check (canal in ('app', 'telegram', 'whatsapp', 'sistema')),
  constraint sobre_ref_tipo_vocabulario check (ref_tipo is null or ref_tipo in ('menu', 'mensaje', 'pantalla', 'senal')),
  constraint sobre_ref_completa check ((ref_tipo is null) = (ref_id is null)),
  foreign key (household_id, persona_id) references public.persona(household_id, id) on delete cascade
);

create unique index if not exists sobre_unico
  on public.sobre (household_id, campo, coalesce(persona_id, ''));

-- El valor tiene el tipo y el rango de su campo. El vocabulario lo comprueba el
-- código (la lista vive en JS); aquí, la forma.
create or replace function public.sobre_valor_valido()
returns trigger language plpgsql set search_path = public as $$
declare
  r public.registro_campo;
  v jsonb := new.valor;
  bien boolean;
begin
  select * into r from public.registro_campo where id = new.campo;
  if (r.por = 'persona') <> (new.persona_id is not null) then
    raise exception 'sobre: el campo % es de %, y la persona no cuadra', new.campo, r.por using errcode = '23514';
  end if;
  if v is null or jsonb_typeof(v) = 'null' then return new; end if;
  -- En una variable: dentro de un IF, PL/pgSQL cortaría la condición en el primer THEN del CASE.
  bien := case r.tipo
    when 'int'        then jsonb_typeof(v) = 'number' and (v #>> '{}')::numeric = trunc((v #>> '{}')::numeric)
    when 'float'      then jsonb_typeof(v) = 'number'
    when 'bool'       then jsonb_typeof(v) = 'boolean'
    when 'fecha'      then jsonb_typeof(v) = 'string' and (v #>> '{}') ~ '^\d{4}-\d{2}-\d{2}$'
    when 'lista_enum' then jsonb_typeof(v) = 'array'
                           and not exists (select 1 from jsonb_array_elements(v) e where jsonb_typeof(e) <> 'string')
    else jsonb_typeof(v) = 'string'      -- enum, ref, texto
  end;
  if not bien then
    raise exception 'sobre: % no es un valor de tipo % para %', v, r.tipo, new.campo using errcode = '23514';
  end if;
  if r.tipo in ('int', 'float') and (
       (r.minimo is not null and (v #>> '{}')::numeric < r.minimo) or
       (r.maximo is not null and (v #>> '{}')::numeric > r.maximo)) then
    raise exception 'sobre: % fuera de rango para %', v, new.campo using errcode = '23514';
  end if;
  return new;
end $$;

drop trigger if exists sobre_valor_valido on public.sobre;
create trigger sobre_valor_valido before insert or update on public.sobre
  for each row execute function public.sobre_valor_valido();

-- 3. cambio --------------------------------------------------------------------

create table if not exists public.cambio (
  id           bigint generated always as identity primary key,
  household_id uuid not null references public.households(id) on delete cascade,
  persona_id   text,                       -- de quién trata (para el borrado RGPD)
  entidad      text not null,
  entidad_id   text,
  campo        text,
  antes        jsonb,
  despues      jsonb,
  actor        text not null,              -- U usuario · L Lola · C código · K cron
  quien_user   uuid references auth.users(id) on delete set null,
  canal        text not null,
  alcance      text,
  ref_tipo     text,                       -- referencia blanda: sin FK, el historial no se reescribe
  ref_id       text,
  created_at   timestamptz not null default now(),
  constraint cambio_actor_vocabulario check (actor in ('U', 'L', 'C', 'K')),
  constraint cambio_canal_vocabulario check (canal in ('app', 'telegram', 'whatsapp', 'sistema')),
  constraint cambio_alcance_vocabulario check (alcance is null or alcance in ('permanente', 'esta_semana', 'estos_dias')),
  constraint cambio_ref_tipo_vocabulario check (ref_tipo is null or ref_tipo in ('menu', 'mensaje', 'pantalla', 'senal')),
  constraint cambio_ref_completa check ((ref_tipo is null) = (ref_id is null)),
  foreign key (household_id, persona_id) references public.persona(household_id, id) on delete cascade
);

create index if not exists cambio_casa_fecha on public.cambio (household_id, created_at desc);

create or replace function public.cambio_inmutable()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'UPDATE' then
    -- Solo se deja anular quien_user (on delete set null de auth.users); nada más.
    if new.quien_user is null and old.quien_user is not null
       and (to_jsonb(new) - 'quien_user') = (to_jsonb(old) - 'quien_user') then
      return new;
    end if;
    raise exception 'cambio solo admite inserciones' using errcode = '42501';
  end if;
  if pg_trigger_depth() > 1 then return old; end if;   -- borrado en cascada (casa o persona)
  raise exception 'cambio solo admite inserciones' using errcode = '42501';
end $$;

drop trigger if exists cambio_inmutable on public.cambio;
create trigger cambio_inmutable before update or delete on public.cambio
  for each row execute function public.cambio_inmutable();

-- 4. Acceso: como persona (0079), solo la service role y las RPC.

alter table public.registro_campo enable row level security;
alter table public.sobre enable row level security;
alter table public.cambio enable row level security;
revoke all on public.registro_campo, public.sobre, public.cambio from anon, authenticated;
grant select on public.registro_campo to authenticated;
drop policy if exists registro_campo_lectura on public.registro_campo;
create policy registro_campo_lectura on public.registro_campo for select to authenticated using (true);

-- 5. ficha_casa ----------------------------------------------------------------
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
language plpgsql stable security definer set search_path = public as $$
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

  -- datos: lo que tiene sobre. Si el campo tiene columna, el valor sale de ella.
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
           'visto', to_char(s.fecha at time zone 'Europe/Madrid', 'YYYY-MM-DD'),
           'por', s.quien_user,
           'canal', s.canal,
           'ref', case when s.ref_tipo is null then null else jsonb_build_object('tipo', s.ref_tipo, 'id', s.ref_id) end
         ) order by s.campo, (s.persona_id is not null), s.persona_id), '[]'::jsonb)
    into v_datos
    from public.sobre s
    left join public.persona p on p.household_id = s.household_id and p.id = s.persona_id
   where s.household_id = p_casa;

  -- faltan: campos que se pueden preguntar, sin sobre y sin valor en su columna.
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

revoke all on function public.ficha_casa(uuid, uuid, text, integer) from public, anon;
grant execute on function public.ficha_casa(uuid, uuid, text, integer) to authenticated, service_role;
