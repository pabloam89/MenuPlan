-- La lectura del dato con sobre (plan fichas con estado, trozo 40; #1037): ficha_casa v2, y fuera sobre.ref_tipo
-- y sobre.ref_id, que sustituye sobre.operacion_id (0105). Va tras la 0105 y la 0106.
-- CONTRAE: sobre.ref_tipo y sobre.ref_id (plan, «Entidades y campos nuevos»: los sustituye sobre.operacion_id). Ningún código los escribe (aplicar_operacion, 0106, apunta operacion_id) y solo los leía ficha_casa v1, que esta migración rehace; la guardia de abajo para si alguna fila los tiene.
-- AUDITADA: auditor-datos 2026-10-30 OK
--   · ficha_casa v2: lo de la v1 (personas, grupos, faltan, tareas, callados, con la misma forma) y, en vez
--     de «datos», «fichas»: por ficha, cada campo de cada sujeto con su sobre y su estado (vacio,
--     por_defecto, supuesto, aprendido, dicho). «faltan» gana minimo_para_generar y peso_menu.
--   · Solo el sobre vigente (sin caducar) dice qué se sabe: un campo con columna propia (edad, nacimiento,
--     alergias) sin sobre sale vacío y sin valor, y sigue en «faltan» aunque su columna tenga algo (hasta
--     escribir_persona, trozo 10, ningún sobre de esos campos existe). Es salud: ante la duda, se pregunta.
-- Plan B (regla migraciones): fichaRpc.js acepta v=1 y v=2 (lee lo común: personas, faltan, tareas y
-- callados) y sigue filtrando «faltan» con el JSON de la casa (faltanDeFicha), así que Lola no repregunta
-- lo que el JSON ya sabe. Ningún código lee ni escribe sobre.ref_tipo ni sobre.ref_id.
-- Lectores: api/_bot/fichaRpc.js (lo común; las «fichas», en el trozo 9) y datoConSobre.test.js.
-- Consulta previa (debe dar 0): select count(*) from public.sobre where ref_tipo is not null or ref_id is not null;
-- Objeto testigo: la columna public.sobre.operacion_id sin public.sobre.ref_tipo, y ficha_casa con «'v', 2».
set lock_timeout = '5s';

do $$
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'registro_campo' and column_name = 'ficha') then
    raise exception 'Falta la 0105 (registro_campo.ficha, sobre.peso…): aplícala antes que la 0107';
  end if;
  if exists (select 1 from public.sobre where ref_tipo is not null or ref_id is not null) then
    raise exception 'sobre tiene filas con ref_tipo o ref_id: la 0107 las quitaría. Para y revisa';
  end if;
end $$;

-- 1. Fuera la referencia vieja del sobre ------------------------------------------------

alter table public.sobre drop column ref_tipo, drop column ref_id;

-- 2. ficha_casa v2: en vez de «datos», «fichas»: {<ficha>: [{campo, sujeto, estado, valor, origen, bloqueado, peso, confirmado_el, caduca_at,
-- cambiado_at, dicho_por, canal, operacion_id}]}, un elemento por campo y sujeto, tenga sobre o no.
-- El estado sale del origen (ESTADO_DE_ORIGEN, vocabularios.js; datoConSobre.test.js compara el case); sin
-- sobre vigente es por_defecto (con el defecto) si el campo lo tiene, y vacio (sin valor) si no. Con sobre
-- vigente, el valor de un campo con columna propia sale de la columna (aún la copia el trigger 0089).
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
  v_fichas jsonb;
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

  -- fichas: cada campo de cada sujeto (los de persona, por cada persona; los de la casa, uno), con su sobre
  -- si lo tiene y vigente. Los tres «when d.campo» del valor son los campos con columna (datoConSobre.test.js).
  with sujetos as (
    select r.id as campo, r.ficha, r.defecto, p.id as persona_id, p.edad, p.fecha_nacimiento
      from public.registro_campo r join public.persona p on p.household_id = p_casa
     where r.por = 'persona'
    union all
    select r.id, r.ficha, r.defecto, null, null, null
      from public.registro_campo r
     where r.por = 'casa'
  ), datos as (
    select x.ficha, x.campo, x.persona_id, x.defecto, x.edad, x.fecha_nacimiento,
           s.valor, s.origen, s.bloqueado, s.peso, s.confirmado_at, s.caduca_at, s.updated_at, s.dicho_by,
           s.canal, s.operacion_id,
           s.id is not null and (s.caduca_at is null or s.caduca_at > now()) as vigente
      from sujetos x
      left join public.sobre s on s.household_id = p_casa and s.campo = x.campo
                              and s.persona_id is not distinct from x.persona_id
  )
  select coalesce(jsonb_object_agg(f.ficha, f.datos), '{}'::jsonb)
    into v_fichas
    from (
      select d.ficha, jsonb_agg(jsonb_build_object(
               'campo', d.campo,
               'sujeto', jsonb_build_object('tipo', case when d.persona_id is null then 'casa' else 'persona' end, 'id', d.persona_id),
               'estado', case when not d.vigente then case when d.defecto is not null then 'por_defecto' else 'vacio' end
                              else case d.origen
                                     when 'dicho' then 'dicho'
                                     when 'delegado' then 'dicho'
                                     when 'visto' then 'aprendido'
                                     when 'supuesto' then 'supuesto'
                                     when 'derivado' then 'supuesto'
                                     when 'por_defecto' then 'por_defecto'
                                     when 'no_quiere_decirlo' then 'vacio'
                                   end end,
               'valor', case when not d.vigente then d.defecto
                             when d.origen = 'no_quiere_decirlo' then null
                             when d.campo = 'edad' then to_jsonb(d.edad)
                             when d.campo = 'nacimiento' then to_jsonb(d.fecha_nacimiento::text)
                             when d.campo = 'alergias' then coalesce((select jsonb_agg(a.alergeno order by a.alergeno) from public.persona_alergia a
                                                             where a.household_id = p_casa and a.persona_id = d.persona_id), '[]'::jsonb)
                             else d.valor end,
               'origen', case when d.vigente then d.origen end,
               'bloqueado', coalesce(d.bloqueado, false),
               'peso', d.peso,
               'confirmado_el', to_char(d.confirmado_at at time zone 'Europe/Madrid', 'YYYY-MM-DD'),
               'caduca_at', d.caduca_at,
               'cambiado_at', d.updated_at,
               'dicho_por', d.dicho_by,
               'canal', d.canal,
               'operacion_id', d.operacion_id
             ) order by d.campo, (d.persona_id is not null), d.persona_id) as datos
        from datos d
       group by d.ficha
    ) f;

  -- faltan: lo que se puede preguntar y no tiene sobre vigente (la columna no cuenta: ver la cabecera), con
  -- minimo_para_generar y peso_menu.
  select coalesce(jsonb_agg(jsonb_build_object(
           'campo', f.campo,
           'sujeto', jsonb_build_object('tipo', f.sujeto_tipo, 'id', f.persona_id),
           'politica', f.politica, 'aplica', f.aplica, 'seguridad', f.seguridad,
           'minimo_para_generar', f.minimo_para_generar, 'peso_menu', f.peso_menu
         ) order by f.campo, f.sujeto_tipo, f.persona_id), '[]'::jsonb)
    into v_faltan
    from (
      select r.id as campo, 'persona' as sujeto_tipo, p.id as persona_id, r.politica, r.aplica, r.seguridad,
             r.minimo_para_generar, r.peso_menu
        from public.registro_campo r
        join public.persona p on p.household_id = p_casa
       where r.politica <> 'nunca' and r.por = 'persona'
         and not exists (select 1 from public.sobre s where s.household_id = p_casa and s.campo = r.id and s.persona_id = p.id
                          and (s.caduca_at is null or s.caduca_at > now()))
      union all
      select r.id, 'casa', null, r.politica, r.aplica, r.seguridad, r.minimo_para_generar, r.peso_menu
        from public.registro_campo r
       where r.politica <> 'nunca' and r.por = 'casa'
         and not exists (select 1 from public.sobre s where s.household_id = p_casa and s.campo = r.id and s.persona_id is null
                          and (s.caduca_at is null or s.caduca_at > now()))
    ) f;

  -- tareas y callados: como la v1.
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
    'v', 2,
    'generado_at', now(),
    'canal', p_canal,
    'casa', jsonb_build_object('id', p_casa, 'rev', coalesce(v_rev, 0)),
    'personas', v_personas,
    'grupos', v_grupos,
    'fichas', v_fichas,
    'faltan', v_faltan,
    'tareas', v_tareas,
    'callados', v_callados
  );
end $$;

-- Los mismos permisos que la v1 (create or replace los conserva; se repiten para que se lean aquí).
revoke all on function public.ficha_casa(uuid, uuid, text, integer) from public, anon, authenticated;
grant execute on function public.ficha_casa(uuid, uuid, text, integer) to service_role;

comment on function public.ficha_casa(uuid, uuid, text, integer) is
  'La ficha de la casa y sus tareas abiertas en una ida (contrato v2, 0107): lo de la v1 y, por ficha, cada dato con su sobre y su estado. Lector: api/_bot/fichaRpc.js (lo común con la v1; las fichas, en el trozo 9). Solo la service role. Solo lectura.';

-- 3. Autoprueba (se deshace siempre) ---------------------------------------------------
-- En una casa de prueba que crea aquí (no en la de una familia): un dato dicho, uno supuesto, uno caducado
-- (que vuelve a faltar) y uno con columna sin sobre (vacío, sin valor y en «faltan»), leídos con ficha_casa
-- v2 como la service role; y ni authenticated ni anon la pueden ejecutar.
do $$
declare
  v_dueno uuid;
  v_casa uuid;
  v_f jsonb;
  v_p jsonb;
begin
  select owner_user_id into v_dueno from public.households order by created_at limit 1;
  if v_dueno is null then
    raise notice '0107 autoprueba: no hay ninguna casa, no se prueba';
    return;
  end if;
  begin
    insert into public.households (name, owner_user_id, propia) values ('Autoprueba 0107', v_dueno, false) returning id into v_casa;
    insert into public.household_state (household_id) values (v_casa);
    insert into public.persona (household_id, id, nombre, edad, alergias_revisadas) values (v_casa, 'p_autoprueba_0107', 'Prueba', 30, true);
    insert into public.sobre (household_id, persona_id, campo, valor, origen, canal, caduca_at) values
      (v_casa, 'p_autoprueba_0107', 'sexo', '"mujer"', 'dicho', 'sistema', null),
      (v_casa, 'p_autoprueba_0107', 'edad', null, 'no_quiere_decirlo', 'sistema', null),
      (v_casa, 'p_autoprueba_0107', 'patronSemanas', '"alternas"', 'supuesto', 'sistema', null),
      (v_casa, 'p_autoprueba_0107', 'colegio', '"El cole"', 'dicho', 'sistema', now() - interval '1 day'),
      (v_casa, null, 'etapaBebe', '"cremas"', 'dicho', 'sistema', now() - interval '1 day');

    perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
    v_f := public.ficha_casa(v_casa, v_dueno, 'telegram', 8);
    v_p := v_f->'fichas'->'persona';
    if (v_f->>'v')::int <> 2 or v_f ? 'datos'
       or not exists (select 1 from jsonb_array_elements(v_p) e where e->>'campo' = 'sexo' and e->>'estado' = 'dicho' and e->>'valor' = 'mujer')
       or not exists (select 1 from jsonb_array_elements(v_p) e where e->>'campo' = 'patronSemanas' and e->>'estado' = 'supuesto')
       or not exists (select 1 from jsonb_array_elements(v_p) e where e->>'campo' = 'colegio' and e->>'estado' = 'vacio' and e->'valor' = 'null'::jsonb)
       or not exists (select 1 from jsonb_array_elements(v_p) e where e->>'campo' = 'edad' and e->>'estado' = 'vacio' and e->'valor' = 'null'::jsonb)
       or not exists (select 1 from jsonb_array_elements(v_p) e where e->>'campo' = 'alergias' and e->>'estado' = 'vacio' and e->'valor' = 'null'::jsonb)
       or not exists (select 1 from jsonb_array_elements(v_f->'faltan') e where e->>'campo' = 'alergias' and (e->>'minimo_para_generar')::boolean)
       or not exists (select 1 from jsonb_array_elements(v_f->'faltan') e where e->>'campo' = 'etapaBebe') then
      raise exception '0107 autoprueba: la ficha v2 no dice el estado de cada dato: %', v_f;
    end if;

    if has_function_privilege('authenticated', 'public.ficha_casa(uuid, uuid, text, integer)', 'execute')
       or has_function_privilege('anon', 'public.ficha_casa(uuid, uuid, text, integer)', 'execute') then
      raise exception '0107 autoprueba: un usuario o anon pueden llamar a ficha_casa';
    end if;

    raise exception 'autoprueba 0107 bien' using errcode = 'MP107';
  exception when sqlstate 'MP107' then
    raise notice '0107 autoprueba: la ficha v2 da dicho, supuesto, caducado y vacío, la columna sin sobre falta, y solo la lee el servidor (deshecho)';
  end;
end $$;
