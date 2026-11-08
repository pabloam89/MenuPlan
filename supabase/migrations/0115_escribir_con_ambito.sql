-- Escribir y deshacer con ámbito (plan fichas con estado, trozo 56; #1037): aplicar_operacion y deshacer_operacion
-- buscan, bloquean y apuntan cada sobre por su clave entera (casa, campo, persona y ámbito, 0114). Va tras la 0114.
-- AUDITADA: auditor-datos 2026-11-02 OK
--
--   · aplicar_operacion(jsonb): misma firma, definer y permisos (solo service_role). Cada dato puede traer
--     grupo_id, semana, dia y comida; repetidos, búsqueda, orden de bloqueo, el sobre nuevo, hecho, sin_hacer,
--     choques e inversa van por la clave entera, y las claves de ámbito solo salen si el dato las trae (lo de hoy
--     devuelve lo mismo). Un dato cuyo ámbito no es el de su campo va a sin_hacer con «ambito_no_cuadra»
--     (MOTIVOS_SIN_HACER_DATO), como «persona_no_cuadra». Tope de datos por operación: de 50 a 400, para que un
--     horario entero (8 personas × 7 días × 5 comidas = 280 en la casa más grande) sea una operación.
--   · deshacer_operacion(uuid, uuid, uuid): misma firma, definer y permisos. Lee el ámbito de cada dato de la
--     inversa (en las de antes no viene: nulo, como su sobre) y busca, ordena, bloquea, borra o devuelve el sobre
--     por la clave entera.
--   · escribir_dato no cambia: sigue sin ámbito; lo de ámbito entra por aplicar_operacion (la tubería).
-- NO hace: ni ficha_casa (trozo 57), ni RLS ni permisos nuevos, ni datos de familias.
-- Plan B: el código de staging llama a las dos con la misma firma y datos sin ámbito, y recibe lo mismo; ningún
-- código pide aún datos con ámbito (trozo 13). main no las usa.
-- Lectores: la tubería (src/lib/operaciones/tuberia.js, por api/_bot/datos.js) y datoConSobre.test.js.
-- Consulta previa (debe dar 0): select count(*) from pg_proc where proname = 'aplicar_operacion' and prosrc like '%ambito_no_cuadra%';
-- Objeto testigo: aplicar_operacion con «ambito_no_cuadra» en su cuerpo (verificar-estado, por prosrc).
set lock_timeout = '5s';

do $$
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'sobre' and column_name = 'dia') then
    raise exception 'Falta la 0114 (sobre sin ámbito): aplícala antes que la 0115';
  end if;
  if to_regprocedure('public.deshacer_operacion(uuid, uuid, uuid)') is null then
    raise exception 'Falta la 0111 (deshacer_operacion): aplícala antes que la 0115';
  end if;
end $$;

-- 1. aplicar_operacion, con ámbito ---------------------------------------------------------
create or replace function public.aplicar_operacion(p_operacion jsonb)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  -- Plan, «Cómo se escribe»: en una lista de salud, añadir gana a quitar en el mismo minuto.
  c_mismo_rato constant interval := interval '1 minute';
  -- Un horario entero de la casa más grande (8 personas × 7 días × 5 comidas = 280) en una operación (trozo 56).
  c_max_datos constant integer := 400;
  v_casa uuid := nullif(p_operacion->>'casa', '')::uuid;
  v_clave text := p_operacion->>'clave';
  v_canal text := p_operacion->>'canal';
  v_uid uuid := auth.uid();
  v_autor uuid;
  v_estado text := coalesce(p_operacion->>'estado', 'hecha');
  v_datos jsonb := coalesce(p_operacion->'datos', '[]'::jsonb);
  v_id uuid;
  v_hecho jsonb := '[]'::jsonb;
  v_sin_hacer jsonb := coalesce(p_operacion->'sin_hacer', '[]'::jsonb);
  v_choques jsonb := coalesce(p_operacion->'choques', '[]'::jsonb);
  v_inversa jsonb := '[]'::jsonb;
  d jsonb; r public.registro_campo; v_antes public.sobre; v_habia boolean; v_rev bigint; v_sobre uuid;
  v_persona text; v_origen text; v_valor jsonb; v_de_la_familia boolean; v_motivo text;
  -- El ámbito del dato (0114): sus dimensiones, y las que trae, para apuntarlas al lado de campo y persona.
  v_grupo text; v_semana date; v_dia text; v_comida text; v_ambito jsonb;
begin
  if v_casa is null or v_clave is null then
    raise exception 'aplicar_operacion: faltan casa o clave' using errcode = '22023';
  end if;
  if v_uid is null and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'aplicar_operacion: hace falta sesión' using errcode = '42501';
  end if;
  -- El autor (quien llama con sesión, o el que dice el servidor) tiene que ser de la casa.
  v_autor := coalesce(v_uid, nullif(p_operacion->>'autor_user_id', '')::uuid);
  if v_autor is not null and not exists (
       select 1 from public.household_members m where m.household_id = v_casa and m.user_id = v_autor) then
    raise exception 'aplicar_operacion: el autor no es de esta casa' using errcode = '42501';
  end if;
  if jsonb_typeof(v_datos) <> 'array' or jsonb_array_length(v_datos) > c_max_datos or exists (select 1 from jsonb_array_elements(v_datos) x
       group by x.value->>'campo', coalesce(x.value->>'persona_id', ''), coalesce(x.value->>'grupo_id', ''), coalesce(x.value->>'semana', ''),
                coalesce(x.value->>'dia', ''), coalesce(x.value->>'comida', '') having count(*) > 1) then
    raise exception 'aplicar_operacion: datos, una lista de hasta % sin campo, persona y ámbito repetidos', c_max_datos using errcode = '22023';
  end if;
  if v_estado not in ('hecha', 'pendiente', 'rechazada') then
    raise exception 'aplicar_operacion: una operación nace hecha, pendiente o rechazada, no %', v_estado using errcode = '22023';
  end if;

  -- La clave primero: una segunda llamada con la misma espera aquí a que acabe la primera y no hace nada.
  -- Una hecha se apunta como pendiente y se cierra abajo, en la misma transacción (nadie la ve a medias).
  insert into public.operacion (household_id, clave, accion, autor_user_id, autor_persona_id, canal, ref_tipo, ref_id,
                                estado, pedido, sin_hacer, choques, pedida_at)
  values (v_casa, v_clave, p_operacion->>'accion', v_autor, nullif(p_operacion->>'autor_persona_id', ''), v_canal,
          p_operacion->>'ref_tipo', p_operacion->>'ref_id', case when v_estado = 'hecha' then 'pendiente' else v_estado end,
          coalesce(p_operacion->'pedido', jsonb_build_object('datos', v_datos)), v_sin_hacer, v_choques,
          least(coalesce((p_operacion->>'pedida_at')::timestamptz, now()), now()))
  on conflict (household_id, clave) do nothing
  returning id into v_id;

  if v_id is null then
    select jsonb_build_object('operacion_id', o.id, 'estado', o.estado, 'repetida', true, 'hecho', o.hecho,
                              'sin_hacer', o.sin_hacer, 'choques', o.choques, 'rev', s.bot_rev)
      into d
      from public.operacion o left join public.household_state s on s.household_id = o.household_id
     where o.household_id = v_casa and o.clave = v_clave;
    return d;
  end if;
  if v_estado <> 'hecha' then
    return jsonb_build_object('operacion_id', v_id, 'estado', v_estado, 'repetida', false,
                              'hecho', '[]'::jsonb, 'sin_hacer', v_sin_hacer, 'choques', v_choques, 'rev', null);
  end if;

  -- En orden fijo (campo, persona, ámbito): dos operaciones a la vez bloquean los sobres en el mismo orden.
  for d in select x.value from jsonb_array_elements(v_datos) x
            order by x.value->>'campo', coalesce(x.value->>'persona_id', ''), coalesce(x.value->>'grupo_id', ''),
                     coalesce(x.value->>'semana', ''), coalesce(x.value->>'dia', ''), coalesce(x.value->>'comida', '') loop
    select * into r from public.registro_campo where id = d->>'campo';
    if not found then
      raise exception 'aplicar_operacion: el campo % no está en registro_campo', d->>'campo' using errcode = '22023';
    end if;
    v_persona := nullif(d->>'persona_id', '');
    v_grupo := nullif(d->>'grupo_id', ''); v_semana := nullif(d->>'semana', '')::date;
    v_dia := nullif(d->>'dia', ''); v_comida := nullif(d->>'comida', '');
    v_ambito := jsonb_strip_nulls(jsonb_build_object('grupo_id', v_grupo, 'semana', v_semana, 'dia', v_dia, 'comida', v_comida));
    v_origen := d->>'origen';
    v_valor := case when jsonb_typeof(d->'valor') = 'null' then null else d->'valor' end;  -- null de JSON = sin valor
    -- Lo que dice una persona; el resto (supuesto, visto, derivado, por_defecto) lo pone el sistema.
    v_de_la_familia := v_origen in ('dicho', 'delegado', 'no_quiere_decirlo');
    v_motivo := case
      when r.clase <> 'hecho' then 'no_es_hecho'
      when (r.por = 'persona') <> (v_persona is not null) then 'persona_no_cuadra'
      -- Cada dimensión, si y solo si el campo la tiene en su ámbito (lo mismo que exige sobre_valor_valido, 0114).
      when (v_grupo is not null) <> ('grupo' = any(r.ambito)) or (v_semana is not null) <> ('semana' = any(r.ambito))
        or (v_dia is not null) <> ('dia' = any(r.ambito)) or (v_comida is not null) <> ('comida' = any(r.ambito)) then 'ambito_no_cuadra'
      when not r.suposicion and not v_de_la_familia then 'no_se_supone'
      when r.escribe = 'sistema' and v_de_la_familia then 'no_lo_escribe'
      -- Su valor vive en persona o persona_*, que escribirá escribir_persona (0108): ni «dicho» sin él, ni abortar.
      when r.columna is not null then 'tiene_columna'
    end;

    if v_motivo is null then
      select * into v_antes from public.sobre s
       where s.household_id = v_casa and s.campo = r.id and s.persona_id is not distinct from v_persona
         and s.grupo_id is not distinct from v_grupo and s.semana is not distinct from v_semana
         and s.dia is not distinct from v_dia and s.comida is not distinct from v_comida
       for update;
      v_habia := found;
      if not v_habia then
        insert into public.sobre (household_id, persona_id, grupo_id, semana, dia, comida, campo, valor, origen, bloqueado,
                                  dicho_by, canal, peso, caduca_at, operacion_id)
        values (v_casa, v_persona, v_grupo, v_semana, v_dia, v_comida, r.id, v_valor, v_origen, coalesce((d->>'bloqueado')::boolean, false),
                case when v_canal = 'sistema' then null else v_autor end, v_canal,
                (d->>'peso')::numeric, (d->>'caduca_at')::timestamptz, v_id)
        on conflict do nothing
        returning id into v_sobre;
        -- Otra operación lo ha creado a la vez: se sigue con su fila, como si ya estuviera.
        if v_sobre is null then
          select * into v_antes from public.sobre s
           where s.household_id = v_casa and s.campo = r.id and s.persona_id is not distinct from v_persona
             and s.grupo_id is not distinct from v_grupo and s.semana is not distinct from v_semana
             and s.dia is not distinct from v_dia and s.comida is not distinct from v_comida
           for update;
          v_habia := found;
          if not found then
            raise exception 'aplicar_operacion: el sobre de % desapareció a medias; reintenta', r.id using errcode = '40001';
          end if;
        end if;
      end if;
      -- Lo que supone el sistema no pisa lo que dijo la familia mientras siga vigente.
      if v_habia and not v_de_la_familia and v_antes.origen in ('dicho', 'delegado', 'no_quiere_decirlo')
         and (v_antes.caduca_at is null or v_antes.caduca_at > now()) then
        v_motivo := 'ya_lo_dijo_la_familia';
      end if;
    end if;
    if v_motivo is not null then
      v_sin_hacer := v_sin_hacer || jsonb_build_array(jsonb_build_object('campo', r.id, 'persona_id', v_persona, 'motivo', v_motivo) || v_ambito);
      continue;
    end if;

    if v_habia then
      -- Choque con lo que había, solo si había valor y el nuevo también lo trae.
      if v_antes.valor is not null and v_valor is not null then
        -- Una regla que no vale para el tipo del campo es un registro mal hecho: falla, no pasa a «el último gana».
        if (r.choque = 'mas_restrictivo' and r.tipo <> 'lista_enum') or (r.choque = 'suma' and r.tipo not in ('int', 'decimal')) then
          raise exception 'aplicar_operacion: la regla % no vale para % (tipo %, registro_campo)', r.choque, r.id, r.tipo using errcode = '22023';
        elsif r.choque = 'mas_restrictivo' and v_antes.updated_at > now() - c_mismo_rato then
          select coalesce(jsonb_agg(distinct e order by e), '[]'::jsonb) into v_valor
            from (select jsonb_array_elements(v_antes.valor) as e union select jsonb_array_elements(v_valor)) x;
          v_choques := v_choques || jsonb_build_array(jsonb_build_object('campo', r.id, 'persona_id', v_persona, 'regla', r.choque) || v_ambito);
        elsif r.choque = 'suma' then
          v_valor := to_jsonb((v_antes.valor #>> '{}')::numeric + (v_valor #>> '{}')::numeric);
          v_choques := v_choques || jsonb_build_array(jsonb_build_object('campo', r.id, 'persona_id', v_persona, 'regla', r.choque) || v_ambito);
        end if;
      end if;
      update public.sobre
         set valor = v_valor, origen = v_origen, canal = v_canal, operacion_id = v_id,
             dicho_by = case when v_canal = 'sistema' then null else v_autor end,
             bloqueado = case when d ? 'bloqueado' then coalesce((d->>'bloqueado')::boolean, false) else bloqueado end,
             peso = case when d ? 'peso' then (d->>'peso')::numeric else peso end,
             caduca_at = case when d ? 'caduca_at' then (d->>'caduca_at')::timestamptz when caduca_at <= now() then null else caduca_at end,
             confirmado_at = case when v_de_la_familia then now() else confirmado_at end
       where id = v_antes.id
      returning id into v_sobre;
    end if;
    v_inversa := v_inversa || jsonb_build_array(jsonb_build_object('campo', r.id, 'persona_id', v_persona,
                   'antes', case when v_habia then to_jsonb(v_antes) - 'household_id' end) || v_ambito);
    v_hecho := v_hecho || jsonb_build_array(jsonb_build_object('campo', r.id, 'persona_id', v_persona, 'sobre_id', v_sobre) || v_ambito);
  end loop;

  -- Nada escrito y algo sin hacer: rechazada. Si se escribió algo, hecha y sube bot_rev.
  if jsonb_array_length(v_hecho) = 0 and jsonb_array_length(v_sin_hacer) > 0 then
    v_estado := 'rechazada';
  elsif jsonb_array_length(v_hecho) > 0 then
    update public.household_state set bot_rev = bot_rev + 1 where household_id = v_casa returning bot_rev into v_rev;
    if v_rev is null then
      raise exception 'aplicar_operacion: la casa no tiene household_state' using errcode = '23503';
    end if;
  end if;

  update public.operacion
     set estado = v_estado, hecho = v_hecho, sin_hacer = v_sin_hacer, choques = v_choques,
         inversa = case when v_estado = 'hecha' then jsonb_build_object('datos', v_inversa) end,
         ejecutada_at = case when v_estado = 'hecha' then now() end
   where household_id = v_casa and id = v_id;

  return jsonb_build_object('operacion_id', v_id, 'estado', v_estado, 'repetida', false, 'hecho', v_hecho,
                            'sin_hacer', v_sin_hacer, 'choques', v_choques, 'rev', v_rev);
end $$;

-- Los mismos permisos que la 0106 (create or replace los conserva; se repiten para que se lean aquí).
revoke all on function public.aplicar_operacion(jsonb) from public, anon, authenticated;
grant execute on function public.aplicar_operacion(jsonb) to service_role;

comment on function public.aplicar_operacion(jsonb) is
  'La escritura final de toda operación (arquitectura objetivo, [3]): en una transacción escribe los sobres, apunta la operación y sube bot_rev; idempotente por (casa, clave). Cada dato, por su clave entera: campo, persona y ámbito (grupo_id, semana, dia, comida; 0114, 0115). Solo la service role (la tubería del servidor, src/lib/operaciones/tuberia.js).';

-- 2. deshacer_operacion, con ámbito --------------------------------------------------------
create or replace function public.deshacer_operacion(p_casa uuid, p_operacion_id uuid, p_autor_user_id uuid default null)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_quien uuid := coalesce(auth.uid(), p_autor_user_id);
  v_op public.operacion;
  v_datos jsonb;
  v_sin_hacer jsonb := '[]'::jsonb;
  v_deshecho jsonb := '[]'::jsonb;
  v_rev bigint;
  d jsonb; v_persona text; v_ahora public.sobre; v_antes public.sobre;
  -- El ámbito del dato de la inversa (0114); en una inversa de antes no viene y es nulo, como su sobre.
  v_ambito jsonb;
  v_nada constant jsonb := '[]'::jsonb;
begin
  if p_casa is null or p_operacion_id is null then
    raise exception 'deshacer_operacion: faltan casa u operación' using errcode = '22023';
  end if;
  if auth.uid() is null and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'deshacer_operacion: hace falta sesión' using errcode = '42501';
  end if;
  if v_quien is null then
    raise exception 'deshacer_operacion: falta quién la pide (solo se deshace lo propio)' using errcode = '22023';
  end if;
  if not exists (select 1 from public.household_members m where m.household_id = p_casa and m.user_id = v_quien) then
    raise exception 'deshacer_operacion: quien la pide no es de esta casa' using errcode = '42501';
  end if;

  -- «no key update»: no espera a quien solo apunta un sobre a esta operación (la FK toma «key share»).
  select * into v_op from public.operacion o where o.household_id = p_casa and o.id = p_operacion_id for no key update;
  if not found then
    return jsonb_build_object('operacion_id', p_operacion_id, 'estado', null, 'repetida', false, 'deshecho', v_nada,
                              'sin_hacer', jsonb_build_array(jsonb_build_object('motivo', 'no_existe')), 'rev', null);
  end if;
  -- Solo lo propio, como bot_deshacer: una del sistema (sin autor) o de otro no la deshace quien pide.
  if v_op.autor_user_id is distinct from v_quien then
    v_sin_hacer := jsonb_build_array(jsonb_build_object('motivo', 'no_es_suya'));
  elsif v_op.estado = 'deshecha' then
    return jsonb_build_object('operacion_id', v_op.id, 'estado', v_op.estado, 'repetida', true, 'deshecho', v_nada,
                              'sin_hacer', '[]'::jsonb, 'rev', (select bot_rev from public.household_state where household_id = p_casa));
  elsif v_op.estado <> 'hecha' then
    v_sin_hacer := jsonb_build_array(jsonb_build_object('motivo', 'no_esta_hecha'));
  end if;
  if jsonb_array_length(v_sin_hacer) > 0 then
    -- De la operación de otro no se dice ni el estado.
    return jsonb_build_object('operacion_id', v_op.id,
                              'estado', case when v_op.autor_user_id is distinct from v_quien then null else v_op.estado end,
                              'repetida', false, 'deshecho', v_nada, 'sin_hacer', v_sin_hacer, 'rev', null);
  end if;
  v_datos := v_op.inversa->'datos';
  if jsonb_typeof(v_datos) is distinct from 'array' then
    raise exception 'deshacer_operacion: la operación % está hecha y no tiene inversa', v_op.id using errcode = '22023';
  end if;

  -- Primero se mira todo, en el orden de aplicar_operacion: si algo cambió después, no se toca nada.
  for d in select x.value from jsonb_array_elements(v_datos) x
            order by x.value->>'campo', coalesce(x.value->>'persona_id', ''), coalesce(x.value->>'grupo_id', ''),
                     coalesce(x.value->>'semana', ''), coalesce(x.value->>'dia', ''), coalesce(x.value->>'comida', '') loop
    v_persona := nullif(d->>'persona_id', '');
    v_ambito := jsonb_strip_nulls(jsonb_build_object('grupo_id', d->'grupo_id', 'semana', d->'semana', 'dia', d->'dia', 'comida', d->'comida'));
    select * into v_ahora from public.sobre s
     where s.household_id = p_casa and s.campo = d->>'campo' and s.persona_id is not distinct from v_persona
       and s.grupo_id is not distinct from nullif(d->>'grupo_id', '') and s.semana is not distinct from nullif(d->>'semana', '')::date
       and s.dia is not distinct from nullif(d->>'dia', '') and s.comida is not distinct from nullif(d->>'comida', '')
     for update;
    if not found or v_ahora.operacion_id is distinct from v_op.id then
      v_sin_hacer := v_sin_hacer || jsonb_build_array(jsonb_build_object('campo', d->>'campo', 'persona_id', v_persona, 'motivo', 'cambio_despues') || v_ambito);
    end if;
  end loop;
  if jsonb_array_length(v_sin_hacer) > 0 then
    return jsonb_build_object('operacion_id', v_op.id, 'estado', v_op.estado, 'repetida', false, 'deshecho', v_nada,
                              'sin_hacer', v_sin_hacer, 'rev', null);
  end if;

  -- La inversa: el sobre que nació en la operación se borra; el que ya estaba vuelve a como estaba.
  for d in select x.value from jsonb_array_elements(v_datos) x
            order by x.value->>'campo', coalesce(x.value->>'persona_id', ''), coalesce(x.value->>'grupo_id', ''),
                     coalesce(x.value->>'semana', ''), coalesce(x.value->>'dia', ''), coalesce(x.value->>'comida', '') loop
    v_persona := nullif(d->>'persona_id', '');
    v_ambito := jsonb_strip_nulls(jsonb_build_object('grupo_id', d->'grupo_id', 'semana', d->'semana', 'dia', d->'dia', 'comida', d->'comida'));
    if jsonb_typeof(d->'antes') is distinct from 'object' then
      delete from public.sobre s
       where s.household_id = p_casa and s.campo = d->>'campo' and s.persona_id is not distinct from v_persona
       and s.grupo_id is not distinct from nullif(d->>'grupo_id', '') and s.semana is not distinct from nullif(d->>'semana', '')::date
       and s.dia is not distinct from nullif(d->>'dia', '') and s.comida is not distinct from nullif(d->>'comida', '');
    else
      -- jsonb_populate_record lee las columnas de hoy e ignora las que ya no están (ref_tipo, ref_id: 0107).
      v_antes := jsonb_populate_record(null::public.sobre, d->'antes');
      update public.sobre s
         set valor = v_antes.valor, origen = v_antes.origen, bloqueado = v_antes.bloqueado, canal = v_antes.canal,
             -- Una cuenta o una operación purgadas desde entonces vuelven como null, como haría su on delete set null.
             dicho_by = (select u.id from auth.users u where u.id = v_antes.dicho_by),
             operacion_id = (select o.id from public.operacion o where o.household_id = p_casa and o.id = v_antes.operacion_id),
             confirmado_at = v_antes.confirmado_at, peso = v_antes.peso, caduca_at = v_antes.caduca_at
       where s.household_id = p_casa and s.campo = d->>'campo' and s.persona_id is not distinct from v_persona
       and s.grupo_id is not distinct from nullif(d->>'grupo_id', '') and s.semana is not distinct from nullif(d->>'semana', '')::date
       and s.dia is not distinct from nullif(d->>'dia', '') and s.comida is not distinct from nullif(d->>'comida', '');
    end if;
    v_deshecho := v_deshecho || jsonb_build_array(jsonb_build_object('campo', d->>'campo', 'persona_id', v_persona) || v_ambito);
  end loop;

  update public.operacion set estado = 'deshecha', deshecha_at = now()
   where household_id = p_casa and id = v_op.id;
  update public.household_state set bot_rev = bot_rev + 1 where household_id = p_casa returning bot_rev into v_rev;
  if v_rev is null then
    raise exception 'deshacer_operacion: la casa no tiene household_state' using errcode = '23503';
  end if;

  return jsonb_build_object('operacion_id', v_op.id, 'estado', 'deshecha', 'repetida', false, 'deshecho', v_deshecho,
                            'sin_hacer', '[]'::jsonb, 'rev', v_rev);
end $$;

-- Los mismos permisos que la 0111.
revoke all on function public.deshacer_operacion(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.deshacer_operacion(uuid, uuid, uuid) to service_role;

comment on function public.deshacer_operacion(uuid, uuid, uuid) is
  'Deshace una operación hecha con su inversa, en una transacción: cada sobre (por campo, persona y ámbito; 0115) vuelve a como estaba (el que nació en ella se borra), la operación queda deshecha y sube bot_rev. Solo su autor, y solo si ningún dato que tocó cambió después (si no, sin_hacer con motivo de MOTIVOS_SIN_DESHACER). Solo la service role; la llama la tubería (src/lib/operaciones/tuberia.js).';

-- 3. Autoprueba (se deshace siempre) -------------------------------------------------------
-- En una casa de prueba con 12 personas: dos días de una persona son dos sobres, y cambiar uno no toca el otro; un
-- ámbito que no es el del campo va a sin_hacer; el mismo hueco dos veces en una operación no entra; lo sin ámbito
-- devuelve lo mismo que antes; 280 datos son una operación y 420 no; y deshacer devuelve o borra cada hueco.
do $$
declare
  v_dueno uuid; v_casa uuid; v_r jsonb; v_op1 uuid; v_op2 uuid; v_n int;
  v_base jsonb;
begin
  select owner_user_id into v_dueno from public.households order by created_at limit 1;
  if v_dueno is null then raise notice '0115 autoprueba: no hay ninguna casa, no se prueba'; return; end if;
  begin
    insert into public.households (name, owner_user_id, propia) values ('Autoprueba 0115', v_dueno, false) returning id into v_casa;
    insert into public.household_members (household_id, user_id, role) values (v_casa, v_dueno, 'owner');
    insert into public.household_state (household_id) values (v_casa);
    insert into public.persona (household_id, id, nombre)
      select v_casa, 'p_autoprueba_0115_' || n, 'Prueba ' || n from generate_series(1, 12) n;
    perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
    v_base := jsonb_build_object('casa', v_casa, 'accion', 'ver_ajustes', 'canal', 'app', 'ref_tipo', 'pantalla',
                                 'ref_id', 'p1', 'autor_user_id', v_dueno);

    v_r := public.aplicar_operacion(v_base || jsonb_build_object('clave', 'autoprueba-1', 'datos', jsonb_build_array(
             jsonb_build_object('campo', 'schedule', 'persona_id', 'p_autoprueba_0115_1', 'dia', 'Lun', 'comida', 'Comida', 'valor', 'fuera', 'origen', 'dicho'),
             jsonb_build_object('campo', 'schedule', 'persona_id', 'p_autoprueba_0115_1', 'dia', 'Mar', 'comida', 'Comida', 'valor', 'cole', 'origen', 'dicho'))));
    v_op1 := (v_r->>'operacion_id')::uuid;
    if v_r->>'estado' <> 'hecha' or jsonb_array_length(v_r->'hecho') <> 2 or v_r->'hecho'->0->>'dia' <> 'Lun'
       or (select count(*) from public.sobre where household_id = v_casa and campo = 'schedule') <> 2 then
      raise exception '0115 autoprueba: dos días de una persona no son dos sobres: %', v_r;
    end if;
    v_r := public.aplicar_operacion(v_base || jsonb_build_object('clave', 'autoprueba-2', 'datos', jsonb_build_array(
             jsonb_build_object('campo', 'schedule', 'persona_id', 'p_autoprueba_0115_1', 'dia', 'Lun', 'comida', 'Comida', 'valor', 'casa', 'origen', 'dicho'))));
    v_op2 := (v_r->>'operacion_id')::uuid;
    if (select valor from public.sobre where household_id = v_casa and campo = 'schedule' and dia = 'Lun') <> '"casa"'
       or (select valor from public.sobre where household_id = v_casa and campo = 'schedule' and dia = 'Mar') <> '"cole"' then
      raise exception '0115 autoprueba: cambiar el lunes pisó el martes: %', v_r;
    end if;

    v_r := public.aplicar_operacion(v_base || jsonb_build_object('clave', 'autoprueba-3', 'datos', jsonb_build_array(
             jsonb_build_object('campo', 'schedule', 'persona_id', 'p_autoprueba_0115_1', 'dia', 'Mié', 'valor', 'casa', 'origen', 'dicho'),
             jsonb_build_object('campo', 'meals', 'dia', 'Lun', 'valor', jsonb_build_array('Comida'), 'origen', 'dicho'))));
    if v_r->>'estado' <> 'rechazada' or not v_r->'sin_hacer' @> '[{"campo": "schedule", "dia": "Mié", "motivo": "ambito_no_cuadra"}, {"campo": "meals", "motivo": "ambito_no_cuadra"}]' then
      raise exception '0115 autoprueba: un ámbito que no es el del campo no fue a sin_hacer: %', v_r;
    end if;
    begin
      perform public.aplicar_operacion(v_base || jsonb_build_object('clave', 'autoprueba-4', 'datos', jsonb_build_array(
                jsonb_build_object('campo', 'schedule', 'persona_id', 'p_autoprueba_0115_1', 'dia', 'Jue', 'comida', 'Cena', 'valor', 'casa', 'origen', 'dicho'),
                jsonb_build_object('campo', 'schedule', 'persona_id', 'p_autoprueba_0115_1', 'dia', 'Jue', 'comida', 'Cena', 'valor', 'fuera', 'origen', 'dicho'))));
      raise exception '0115 autoprueba: el mismo hueco entró dos veces en una operación';
    exception when invalid_parameter_value then null;  -- a propósito: 22023 es lo que se prueba
    end;
    v_r := public.aplicar_operacion(v_base || jsonb_build_object('clave', 'autoprueba-5', 'datos', jsonb_build_array(
             jsonb_build_object('campo', 'meals', 'valor', jsonb_build_array('Cena'), 'origen', 'dicho'))));
    if v_r->>'estado' <> 'hecha' or v_r->'hecho'->0 ?| array['grupo_id', 'semana', 'dia', 'comida'] then
      raise exception '0115 autoprueba: un dato sin ámbito no devuelve lo de antes: %', v_r;
    end if;

    -- El tope: el horario entero de 8 personas (280) es una operación; el de 12 (420), no.
    v_r := public.aplicar_operacion(v_base || jsonb_build_object('clave', 'autoprueba-6', 'datos', (
             select jsonb_agg(jsonb_build_object('campo', 'schedule', 'persona_id', 'p_autoprueba_0115_' || n, 'dia', d, 'comida', c,
                                                 'valor', 'casa', 'origen', 'dicho'))
               from generate_series(5, 12) n, unnest(array['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']) d,
                    unnest(array['Desayuno', 'Comida', 'Merienda', 'Cena', 'Postre']) c)));
    if v_r->>'estado' <> 'hecha' or jsonb_array_length(v_r->'hecho') <> 280 then
      raise exception '0115 autoprueba: un horario entero de 8 personas no fue una operación: % hechos', jsonb_array_length(v_r->'hecho');
    end if;
    begin
      perform public.aplicar_operacion(v_base || jsonb_build_object('clave', 'autoprueba-7', 'datos', (
                select jsonb_agg(jsonb_build_object('campo', 'schedule', 'persona_id', 'p_autoprueba_0115_' || n, 'dia', d, 'comida', c,
                                                    'valor', 'fuera', 'origen', 'dicho'))
                  from generate_series(1, 12) n, unnest(array['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']) d,
                       unnest(array['Desayuno', 'Comida', 'Merienda', 'Cena', 'Postre']) c)));
      raise exception '0115 autoprueba: entraron 420 datos en una operación';
    exception when invalid_parameter_value then null;  -- a propósito: el tope (22023) es lo que se prueba
    end;

    -- Deshacer la 2 devuelve el lunes de la 1 y no toca el martes; deshacer luego la 1 borra los dos.
    v_r := public.deshacer_operacion(v_casa, v_op2, v_dueno);
    if v_r->>'estado' is distinct from 'deshecha' or v_r->'deshecho'->0->>'dia' is distinct from 'Lun'
       or (select valor from public.sobre where household_id = v_casa and campo = 'schedule' and persona_id = 'p_autoprueba_0115_1' and dia = 'Lun') <> '"fuera"'
       or (select operacion_id from public.sobre where household_id = v_casa and campo = 'schedule' and persona_id = 'p_autoprueba_0115_1' and dia = 'Mar') <> v_op1 then
      raise exception '0115 autoprueba: deshacer no devolvió el hueco de antes: %', v_r;
    end if;
    v_r := public.deshacer_operacion(v_casa, v_op1, v_dueno);
    select count(*) into v_n from public.sobre where household_id = v_casa and campo = 'schedule' and persona_id = 'p_autoprueba_0115_1';
    if v_r->>'estado' is distinct from 'deshecha' or v_n <> 0 then
      raise exception '0115 autoprueba: deshacer no borró los huecos nacidos en la operación (quedan %): %', v_n, v_r;
    end if;

    raise exception 'autoprueba 0115 bien' using errcode = 'MP115';
  exception when sqlstate 'MP115' then
    raise notice '0115 autoprueba: un sobre por hueco, sin pisarse, ámbito que no cuadra a sin_hacer, sin repetidos, lo de antes igual, tope de 400 y deshacer por hueco (deshecho)';
  end;
end $$;
