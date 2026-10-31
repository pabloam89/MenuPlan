-- Deshacer una operación (plan fichas con estado, trozo 41; #1037): deshacer_operacion, la RPC hermana de
-- aplicar_operacion. Va tras la 0105 (tabla operacion), la 0106 (aplicar_operacion, que guarda la inversa) y la 0107.
--
--   · deshacer_operacion(p_casa, p_operacion_id, p_autor_user_id), definer, solo para la service role: en una
--     transacción aplica la inversa de una operación hecha (cada sobre vuelve a como estaba; el que nació en
--     ella se borra), la marca «deshecha» con deshecha_at y sube bot_rev. Todo o nada.
--   · Solo lo propio, como bot_deshacer: quien la pide tiene que ser su autor (una del sistema, sin autor, no
--     la deshace nadie por aquí). Si un dato que tocó cambió después (su sobre ya no sale de esta operación o
--     ya no está), no se pisa: no se deshace nada y vuelve en sin_hacer con su motivo.
--   · Devuelve {operacion_id, estado, repetida, deshecho, sin_hacer, rev}; los motivos de sin_hacer son
--     MOTIVOS_SIN_DESHACER (vocabularios.js; datoConSobre.test.js compara los literales). Deshacer otra vez la
--     misma da repetida y no toca nada. Lo que no se deshace no se apunta en la operación: solo vuelve.
-- Concurrencia: la operación se bloquea «for no key update» (no choca con la FK de sobre.operacion_id, que
-- toma «key share» al devolver a un sobre su operación de antes) y sus sobres en el orden de aplicar_operacion.
-- Plan B: la llamará la tubería (src/lib/operaciones/tuberia.js, deshacer; segundo PR del trozo 41), que sin
-- ella contesta rpc_ausente, lo apunta en el log y no escribe nada. Lectores: datoConSobre.test.js, la
-- autoprueba y, con el segundo PR, la tubería.
-- Consulta previa (debe dar 0): select count(*) from pg_proc where proname = 'deshacer_operacion';
-- Objeto testigo: la función public.deshacer_operacion(uuid, uuid, uuid).
set lock_timeout = '5s';

do $$
begin
  if to_regprocedure('public.aplicar_operacion(jsonb)') is null then
    raise exception 'Falta la 0106 (aplicar_operacion): aplícala antes que la 0111';
  end if;
  if to_regprocedure('public.deshacer_operacion(uuid, uuid, uuid)') is not null then
    raise exception 'deshacer_operacion ya existe: ¿la 0111 ya está aplicada?';
  end if;
end $$;

-- 1. deshacer_operacion ----------------------------------------------------------------
create function public.deshacer_operacion(p_casa uuid, p_operacion_id uuid, p_autor_user_id uuid default null)
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
            order by x.value->>'campo', coalesce(x.value->>'persona_id', '') loop
    v_persona := nullif(d->>'persona_id', '');
    select * into v_ahora from public.sobre s
     where s.household_id = p_casa and s.campo = d->>'campo' and s.persona_id is not distinct from v_persona
     for update;
    if not found or v_ahora.operacion_id is distinct from v_op.id then
      v_sin_hacer := v_sin_hacer || jsonb_build_array(jsonb_build_object('campo', d->>'campo', 'persona_id', v_persona, 'motivo', 'cambio_despues'));
    end if;
  end loop;
  if jsonb_array_length(v_sin_hacer) > 0 then
    return jsonb_build_object('operacion_id', v_op.id, 'estado', v_op.estado, 'repetida', false, 'deshecho', v_nada,
                              'sin_hacer', v_sin_hacer, 'rev', null);
  end if;

  -- La inversa: el sobre que nació en la operación se borra; el que ya estaba vuelve a como estaba.
  for d in select x.value from jsonb_array_elements(v_datos) x
            order by x.value->>'campo', coalesce(x.value->>'persona_id', '') loop
    v_persona := nullif(d->>'persona_id', '');
    if jsonb_typeof(d->'antes') is distinct from 'object' then
      delete from public.sobre s
       where s.household_id = p_casa and s.campo = d->>'campo' and s.persona_id is not distinct from v_persona;
    else
      -- jsonb_populate_record lee las columnas de hoy e ignora las que ya no están (ref_tipo, ref_id: 0107).
      v_antes := jsonb_populate_record(null::public.sobre, d->'antes');
      update public.sobre s
         set valor = v_antes.valor, origen = v_antes.origen, bloqueado = v_antes.bloqueado, canal = v_antes.canal,
             -- Una cuenta o una operación purgadas desde entonces vuelven como null, como haría su on delete set null.
             dicho_by = (select u.id from auth.users u where u.id = v_antes.dicho_by),
             operacion_id = (select o.id from public.operacion o where o.household_id = p_casa and o.id = v_antes.operacion_id),
             confirmado_at = v_antes.confirmado_at, peso = v_antes.peso, caduca_at = v_antes.caduca_at
       where s.household_id = p_casa and s.campo = d->>'campo' and s.persona_id is not distinct from v_persona;
    end if;
    v_deshecho := v_deshecho || jsonb_build_array(jsonb_build_object('campo', d->>'campo', 'persona_id', v_persona));
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

revoke all on function public.deshacer_operacion(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.deshacer_operacion(uuid, uuid, uuid) to service_role;

comment on function public.deshacer_operacion(uuid, uuid, uuid) is
  'Deshace una operación hecha con su inversa, en una transacción: cada sobre vuelve a como estaba (el que nació en ella se borra), la operación queda deshecha y sube bot_rev. Solo su autor, y solo si ningún dato que tocó cambió después (si no, sin_hacer con motivo de MOTIVOS_SIN_DESHACER). Solo la service role; la llama la tubería (src/lib/operaciones/tuberia.js).';

-- 2. Autoprueba (se deshace siempre) ---------------------------------------------------
-- En una casa de prueba que crea aquí, con el dueño de una casa cualquiera como miembro: lo que cambió después no
-- se pisa, deshacer devuelve el sobre de antes (con su bloqueo) o borra el que nació, una segunda vez no hace
-- nada, lo del sistema y lo no hecho no se deshacen, y nadie con sesión la llama.
do $$
declare
  v_dueno uuid; v_casa uuid; v_r jsonb; v_op1 uuid; v_op2 uuid; v_rev bigint; v_sis uuid; v_rech uuid;
  v_fuera constant uuid := '00000000-0000-4000-8000-000000000111';
begin
  select owner_user_id into v_dueno from public.households order by created_at limit 1;
  if v_dueno is null then raise notice '0111 autoprueba: no hay ninguna casa, no se prueba'; return; end if;
  begin
    insert into public.households (name, owner_user_id, propia) values ('Autoprueba 0111', v_dueno, false) returning id into v_casa;
    insert into public.household_members (household_id, user_id, role) values (v_casa, v_dueno, 'owner');
    insert into public.household_state (household_id) values (v_casa);
    insert into public.persona (household_id, id, nombre) values (v_casa, 'p_autoprueba_0111', 'Prueba');
    perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);

    v_op1 := (public.escribir_dato(v_casa, 'sexo', 'p_autoprueba_0111', '"mujer"', 'dicho', 'telegram',
              'mensaje', 'm1', 'autoprueba-1', 'ver_ajustes', v_dueno, null, true)->>'operacion_id')::uuid;
    v_op2 := (public.escribir_dato(v_casa, 'sexo', 'p_autoprueba_0111', '"hombre"', 'dicho', 'app',
              'pantalla', 'p1', 'autoprueba-2', 'ver_ajustes', v_dueno)->>'operacion_id')::uuid;
    v_sis := (public.escribir_dato(v_casa, 'colegio', 'p_autoprueba_0111', '"Uno"', 'supuesto', 'sistema',
              'motor', 'x', 'autoprueba-3', 'ver_ajustes')->>'operacion_id')::uuid;
    v_rech := (public.aplicar_operacion(jsonb_build_object('casa', v_casa, 'clave', 'autoprueba-4', 'accion', 'ver_ajustes',
               'canal', 'app', 'ref_tipo', 'pantalla', 'ref_id', 'p4', 'autor_user_id', v_dueno, 'estado', 'rechazada'))->>'operacion_id')::uuid;
    select bot_rev into v_rev from public.household_state where household_id = v_casa;

    -- La 1 creó el sobre y la 2 lo cambió después: deshacer la 1 no pisa a la 2.
    v_r := public.deshacer_operacion(v_casa, v_op1, v_dueno);
    if v_r->>'estado' is distinct from 'hecha' or v_r->'sin_hacer'->0->>'motivo' is distinct from 'cambio_despues'
       or (select valor from public.sobre where household_id = v_casa and campo = 'sexo') <> '"hombre"' then
      raise exception '0111 autoprueba: deshacer pisó un cambio posterior: %', v_r;
    end if;
    -- Deshacer la 2 devuelve el sobre de la 1, con su bloqueo, y sube bot_rev.
    v_r := public.deshacer_operacion(v_casa, v_op2, v_dueno);
    if v_r->>'estado' is distinct from 'deshecha' or (v_r->>'rev')::bigint <> v_rev + 1 or not exists (select 1 from public.sobre
         where household_id = v_casa and campo = 'sexo' and valor = '"mujer"' and bloqueado and canal = 'telegram' and operacion_id = v_op1)
       or not exists (select 1 from public.operacion where household_id = v_casa and id = v_op2 and estado = 'deshecha' and deshecha_at is not null) then
      raise exception '0111 autoprueba: deshacer no devolvió el sobre de antes: %', v_r;
    end if;
    v_r := public.deshacer_operacion(v_casa, v_op2, v_dueno);
    if not (v_r->>'repetida')::boolean or (select bot_rev from public.household_state where household_id = v_casa) <> v_rev + 1 then
      raise exception '0111 autoprueba: deshacer dos veces hizo algo: %', v_r;
    end if;
    -- Ahora la 1 es la última: deshacerla borra el sobre que nació en ella.
    v_r := public.deshacer_operacion(v_casa, v_op1, v_dueno);
    if v_r->>'estado' is distinct from 'deshecha' or exists (select 1 from public.sobre where household_id = v_casa and campo = 'sexo') then
      raise exception '0111 autoprueba: deshacer no borró el sobre que nació en la operación: %', v_r;
    end if;
    v_r := public.deshacer_operacion(v_casa, v_sis, v_dueno);
    if v_r->'sin_hacer'->0->>'motivo' is distinct from 'no_es_suya' or not exists (select 1 from public.sobre where household_id = v_casa and campo = 'colegio') then
      raise exception '0111 autoprueba: alguien deshizo lo que no era suyo: %', v_r;
    end if;
    v_r := public.deshacer_operacion(v_casa, v_rech, v_dueno);
    if v_r->'sin_hacer'->0->>'motivo' is distinct from 'no_esta_hecha' then
      raise exception '0111 autoprueba: se deshizo una operación rechazada: %', v_r;
    end if;
    v_r := public.deshacer_operacion(v_casa, v_fuera, v_dueno);
    if v_r->'sin_hacer'->0->>'motivo' is distinct from 'no_existe' then
      raise exception '0111 autoprueba: una operación que no existe no dijo no_existe: %', v_r;
    end if;
    perform set_config('request.jwt.claims', json_build_object('sub', v_fuera, 'role', 'authenticated')::text, true);
    perform set_config('role', 'authenticated', true);
    begin
      perform public.deshacer_operacion(v_casa, v_op1, v_fuera);
      raise exception '0111 autoprueba: un usuario ha podido llamar a deshacer_operacion';
    exception when insufficient_privilege then null;  -- a propósito: «permission denied» es lo esperado
    end;

    raise exception 'autoprueba 0111 bien' using errcode = 'MP111';
  exception when sqlstate 'MP111' then
    raise notice '0111 autoprueba: no pisa lo posterior, devuelve el sobre de antes o borra el nacido, no repite, solo lo propio y lo hecho, y nadie con sesión la llama (deshecho)';
  end;
end $$;
