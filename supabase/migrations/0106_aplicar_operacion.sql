-- La escritura del dato con sobre (plan fichas con estado, trozo 39; #1037): aplicar_operacion y escribir_dato.
-- Va tras la 0105 (columnas del eje, sobre con estado de uso, tabla operacion) y antes de la 0107 (ficha_casa v2).
--
-- AUDITADA: auditor-datos 2026-10-30 OK
--   · aplicar_operacion(p_operacion jsonb), definer, solo para la service role: en una transacción escribe
--     los sobres, apunta la operación y sube bot_rev; idempotente por (casa, clave). Aplica el registro:
--     solo hechos, la salud nunca se supone, la familia no escribe lo del sistema, lo supuesto no pisa lo
--     dicho, los campos con columna propia esperan a escribir_persona (0108, trozo 10), y la regla de choque.
--   · escribir_dato(...), invoker, solo para la service role: una operación de un solo dato.
-- Estados: una operación nace hecha, rechazada o pendiente y no cambia después. Una pendiente no avanza
-- (la misma clave devuelve la de antes; seguir es otra operación, trozo 26) y nadie escribe aún «deshecha»:
-- la inversa se guarda ya, y deshacer llega con la tubería (trozo 26). Hoy ningún campo ejerce la regla de
-- choque (alergias va a tiene_columna; ninguno suma), y escribe familia y ambos se tratan igual: lo frena suposicion.
-- Plan B: ningún código las llama todavía (trozo 8). Lectores: datoConSobre.test.js y la autoprueba.
-- Consulta previa (debe dar 0): select count(*) from pg_proc where proname in ('aplicar_operacion', 'escribir_dato');
-- Objeto testigo: la función public.aplicar_operacion(jsonb).
set lock_timeout = '5s';

do $$
begin
  if to_regclass('public.operacion') is null
     or not exists (select 1 from information_schema.columns
                     where table_schema = 'public' and table_name = 'sobre' and column_name = 'operacion_id') then
    raise exception 'Falta la 0105 (operacion, sobre.operacion_id): aplícala antes que la 0106';
  end if;
  if to_regprocedure('public.aplicar_operacion(jsonb)') is not null then
    raise exception 'aplicar_operacion ya existe: ¿la 0106 ya está aplicada?';
  end if;
end $$;

-- 1. aplicar_operacion ---------------------------------------------------------------
--
-- p_operacion: {casa, clave, accion, canal, ref_tipo, ref_id, autor_user_id?, autor_persona_id?, estado?
-- (hecha por defecto; pendiente o rechazada solo se apuntan), pedido?, sin_hacer?, choques?, pedida_at?,
-- datos: [{campo, persona_id?, valor?, origen, bloqueado?, peso?, caduca_at?}]}. En un sobre que ya existe,
-- bloqueado, peso y caduca_at que no vengan se conservan. Devuelve {operacion_id, estado, repetida, hecho,
-- sin_hacer, choques, rev}.
-- Lo que no cuadra con el registro va a sin_hacer con su motivo (MOTIVOS_SIN_HACER_DATO); lo que no cuadra
-- con la base (tipo, rango, una persona de otra casa) aborta la operación entera: la tubería lo valida antes.
create function public.aplicar_operacion(p_operacion jsonb)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  -- Plan, «Cómo se escribe»: en una lista de salud, añadir gana a quitar en el mismo minuto.
  c_mismo_rato constant interval := interval '1 minute';
  c_max_datos constant integer := 50;
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
       group by x.value->>'campo', coalesce(x.value->>'persona_id', '') having count(*) > 1) then
    raise exception 'aplicar_operacion: datos, una lista de hasta % sin campo y persona repetidos', c_max_datos using errcode = '22023';
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

  -- En orden fijo (campo, persona): dos operaciones a la vez bloquean los sobres en el mismo orden.
  for d in select x.value from jsonb_array_elements(v_datos) x
            order by x.value->>'campo', coalesce(x.value->>'persona_id', '') loop
    select * into r from public.registro_campo where id = d->>'campo';
    if not found then
      raise exception 'aplicar_operacion: el campo % no está en registro_campo', d->>'campo' using errcode = '22023';
    end if;
    v_persona := nullif(d->>'persona_id', '');
    v_origen := d->>'origen';
    v_valor := case when jsonb_typeof(d->'valor') = 'null' then null else d->'valor' end;  -- null de JSON = sin valor
    -- Lo que dice una persona; el resto (supuesto, visto, derivado, por_defecto) lo pone el sistema.
    v_de_la_familia := v_origen in ('dicho', 'delegado', 'no_quiere_decirlo');
    v_motivo := case
      when r.clase <> 'hecho' then 'no_es_hecho'
      when (r.por = 'persona') <> (v_persona is not null) then 'persona_no_cuadra'
      when not r.suposicion and not v_de_la_familia then 'no_se_supone'
      when r.escribe = 'sistema' and v_de_la_familia then 'no_lo_escribe'
      -- Su valor vive en persona o persona_*, que escribirá escribir_persona (0108): ni «dicho» sin él, ni abortar.
      when r.columna is not null then 'tiene_columna'
    end;

    if v_motivo is null then
      select * into v_antes from public.sobre s
       where s.household_id = v_casa and s.campo = r.id and s.persona_id is not distinct from v_persona
       for update;
      v_habia := found;
      if not v_habia then
        insert into public.sobre (household_id, persona_id, campo, valor, origen, bloqueado, dicho_by, canal,
                                  peso, caduca_at, operacion_id)
        values (v_casa, v_persona, r.id, v_valor, v_origen, coalesce((d->>'bloqueado')::boolean, false),
                case when v_canal = 'sistema' then null else v_autor end, v_canal,
                (d->>'peso')::numeric, (d->>'caduca_at')::timestamptz, v_id)
        on conflict do nothing
        returning id into v_sobre;
        -- Otra operación lo ha creado a la vez: se sigue con su fila, como si ya estuviera.
        if v_sobre is null then
          select * into v_antes from public.sobre s
           where s.household_id = v_casa and s.campo = r.id and s.persona_id is not distinct from v_persona
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
      v_sin_hacer := v_sin_hacer || jsonb_build_array(jsonb_build_object('campo', r.id, 'persona_id', v_persona, 'motivo', v_motivo));
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
          v_choques := v_choques || jsonb_build_array(jsonb_build_object('campo', r.id, 'persona_id', v_persona, 'regla', r.choque));
        elsif r.choque = 'suma' then
          v_valor := to_jsonb((v_antes.valor #>> '{}')::numeric + (v_valor #>> '{}')::numeric);
          v_choques := v_choques || jsonb_build_array(jsonb_build_object('campo', r.id, 'persona_id', v_persona, 'regla', r.choque));
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
                   'antes', case when v_habia then to_jsonb(v_antes) - 'household_id' end));
    v_hecho := v_hecho || jsonb_build_array(jsonb_build_object('campo', r.id, 'persona_id', v_persona, 'sobre_id', v_sobre));
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

revoke all on function public.aplicar_operacion(jsonb) from public, anon, authenticated;
grant execute on function public.aplicar_operacion(jsonb) to service_role;

comment on function public.aplicar_operacion(jsonb) is
  'La escritura final de toda operación (arquitectura objetivo, [3]): en una transacción escribe los sobres, apunta la operación y sube bot_rev; idempotente por (casa, clave). Solo la service role (la tubería del servidor, trozo 26). Sin lector en el código hasta el trozo 8.';

-- 2. escribir_dato: una operación de un solo dato. Invoker: la ejecuta quien puede ejecutar aplicar_operacion.
-- Sin nulls en el dato: lo que no se pasa (bloqueado, caduca_at) se conserva en un sobre que ya existe.
create function public.escribir_dato(p_casa uuid, p_campo text, p_persona_id text, p_valor jsonb, p_origen text,
  p_canal text, p_ref_tipo text, p_ref_id text, p_clave text, p_accion text, p_autor_user_id uuid default null,
  p_autor_persona_id text default null, p_bloqueado boolean default null, p_caduca_at timestamptz default null) returns jsonb
language sql set search_path = public, pg_temp as $$
  select public.aplicar_operacion(jsonb_build_object(
    'casa', p_casa, 'clave', p_clave, 'accion', p_accion, 'canal', p_canal, 'ref_tipo', p_ref_tipo, 'ref_id', p_ref_id,
    'autor_user_id', p_autor_user_id, 'autor_persona_id', p_autor_persona_id,
    'datos', jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
      'campo', p_campo, 'persona_id', p_persona_id, 'valor', p_valor, 'origen', p_origen,
      'bloqueado', p_bloqueado, 'caduca_at', p_caduca_at)))));
$$;

revoke all on function public.escribir_dato(uuid, text, text, jsonb, text, text, text, text, text, text, uuid, text, boolean, timestamptz) from public, anon, authenticated;
grant execute on function public.escribir_dato(uuid, text, text, jsonb, text, text, text, text, text, text, uuid, text, boolean, timestamptz) to service_role;

comment on function public.escribir_dato(uuid, text, text, jsonb, text, text, text, text, text, text, uuid, text, boolean, timestamptz) is
  'Un dato de la ficha con su sobre, como operación de un solo dato (llama a aplicar_operacion). Solo la service role. Su lector será escribirDato (trozo 8).';

-- 3. Autoprueba (se deshace siempre) ---------------------------------------------------
-- En una casa de prueba que crea aquí, con el dueño de una casa cualquiera como miembro: escribe, repite la clave,
-- conserva el bloqueo, lo supuesto no pisa lo dicho, la salud espera a escribir_persona, y nadie de fuera entra.
do $$
declare
  v_dueno uuid; v_casa uuid; v_r jsonb; v_rev bigint; v_n integer;
  v_fuera constant uuid := '00000000-0000-4000-8000-000000000106';
begin
  select owner_user_id into v_dueno from public.households order by created_at limit 1;
  if v_dueno is null then raise notice '0106 autoprueba: no hay ninguna casa, no se prueba'; return; end if;
  begin
    insert into public.households (name, owner_user_id, propia) values ('Autoprueba 0106', v_dueno, false) returning id into v_casa;
    insert into public.household_members (household_id, user_id, role) values (v_casa, v_dueno, 'owner');
    insert into public.household_state (household_id) values (v_casa);
    insert into public.persona (household_id, id, nombre) values (v_casa, 'p_autoprueba_0106', 'Prueba'), (v_casa, 'p_autoprueba_0106b', 'Otra');
    perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);

    v_r := public.escribir_dato(v_casa, 'sexo', 'p_autoprueba_0106', '"mujer"', 'dicho', 'telegram',
                                'mensaje', 'm1', 'autoprueba-1', 'ver_ajustes', v_dueno, null, true);
    select bot_rev into v_rev from public.household_state where household_id = v_casa;
    if v_r->>'estado' <> 'hecha' or v_rev <> 1 or not exists (select 1 from public.sobre where household_id = v_casa
         and campo = 'sexo' and operacion_id = (v_r->>'operacion_id')::uuid and dicho_by = v_dueno and bloqueado) then
      raise exception '0106 autoprueba: escribir_dato no escribió el sobre con su operación: %', v_r;
    end if;
    v_r := public.escribir_dato(v_casa, 'sexo', 'p_autoprueba_0106', '"hombre"', 'dicho', 'telegram',
                                'mensaje', 'm1', 'autoprueba-1', 'ver_ajustes', v_dueno);
    if not (v_r->>'repetida')::boolean or (select bot_rev from public.household_state where household_id = v_casa) <> 1 then
      raise exception '0106 autoprueba: la misma clave escribió dos veces: %', v_r;
    end if;
    v_r := public.escribir_dato(v_casa, 'sexo', 'p_autoprueba_0106', '"hombre"', 'dicho', 'app',
                                'pantalla', 'p1', 'autoprueba-2', 'ver_ajustes', v_dueno);
    if not coalesce((select bloqueado and valor = '"hombre"' from public.sobre where household_id = v_casa and campo = 'sexo'), false) then
      raise exception '0106 autoprueba: actualizar el sobre perdió el bloqueo: %', v_r;
    end if;
    v_r := public.escribir_dato(v_casa, 'sexo', 'p_autoprueba_0106', '"mujer"', 'supuesto', 'sistema',
                                'motor', 'x', 'autoprueba-3', 'ver_ajustes');
    if v_r->>'estado' <> 'rechazada' or v_r->'sin_hacer'->0->>'motivo' <> 'ya_lo_dijo_la_familia' then
      raise exception '0106 autoprueba: lo supuesto pisó lo dicho: %', v_r;
    end if;
    v_r := public.aplicar_operacion(jsonb_build_object('casa', v_casa, 'clave', 'autoprueba-4', 'accion', 'ver_ajustes',
             'canal', 'telegram', 'ref_tipo', 'mensaje', 'ref_id', 'm4', 'autor_user_id', v_dueno, 'datos', jsonb_build_array(
             jsonb_build_object('campo', 'alergias', 'persona_id', 'p_autoprueba_0106', 'origen', 'dicho'),
             jsonb_build_object('campo', 'alergias', 'persona_id', 'p_autoprueba_0106b', 'origen', 'supuesto'))));
    if v_r->>'estado' <> 'rechazada' or not v_r->'sin_hacer' @> '[{"motivo": "tiene_columna"}, {"motivo": "no_se_supone"}]' then
      raise exception '0106 autoprueba: una alergia dicha no esperó a escribir_persona o una supuesta no se rechazó: %', v_r;
    end if;
    -- Alguien con sesión que no es de la casa: operacion es solo del servidor (0105), y la RPC también.
    perform set_config('request.jwt.claims', json_build_object('sub', v_fuera, 'role', 'authenticated')::text, true);
    perform set_config('role', 'authenticated', true);
    begin
      select count(*) into v_n from public.operacion where household_id = v_casa;
      raise exception '0106 autoprueba: un usuario lee operacion';
    exception when insufficient_privilege then null;  -- a propósito: «permission denied» es lo esperado
    end;
    begin
      perform public.aplicar_operacion('{}'::jsonb);
      raise exception '0106 autoprueba: un usuario ha podido llamar a aplicar_operacion';
    exception when insufficient_privilege then null;  -- a propósito: «permission denied» es lo esperado
    end;

    raise exception 'autoprueba 0106 bien' using errcode = 'MP106';
  exception when sqlstate 'MP106' then
    raise notice '0106 autoprueba: escribe, no repite, conserva el bloqueo, no pisa lo dicho, deja la salud a escribir_persona y nadie de fuera la usa (deshecho)';
  end;
end $$;
