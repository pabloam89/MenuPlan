-- Persona y salud, fuente única (plan fichas con estado, trozo 10; #1037): escribir_persona y personas_de_casa,
-- y fuera el disparador de la 0089 con las funciones que copiaban data.members a persona. Va tras la 0105
-- (operacion, sobre.operacion_id), la 0106 (aplicar_operacion), la 0107 (ficha_casa v2) y la 0111.
--
--   · escribir_persona(p_operacion jsonb), definer, solo para la service role: la única vía de escritura a
--     persona, persona_* y grupo/grupo_persona. Una operación (fila en `operacion`, idempotente por casa y
--     clave) con una lista de personas (cada una, solo lo que trae: lo que no viene se conserva; o `borrar`) y,
--     si viene, la lista entera de grupos. Actualiza en sitio: no borra y reinserta personas (bot_tareas y
--     sobre cuelgan de ellas). Escribe además el sobre de los tres campos del registro con columna propia
--     (alergias, edad, nacimiento), para que ficha_casa v2 sepa que están dichos, y solo cuando cambian o aún
--     no lo tienen; el de alergias, con la marca alergias_revisadas puesta. Alergias (choque «mas_restrictivo»
--     del registro; intolerancias, estados y perfiles no tienen campo en el registro, y el último gana): si otra
--     persona u otro canal las tocó en el último minuto, lo que esta operación quitaría se queda. Sube bot_rev.
--   · personas_de_casa(p_casa uuid), definer, para los de la casa y la service role: las personas con su
--     salud y los grupos, de donde la app y Lola montan members y groups (src/lib/personas.js, trozo 10).
--   · persona.orden y grupo.tipo, columnas nuevas: el orden de la familia y el tipo de grupo (TIPOS_GRUPO), que
--     hoy solo guarda el documento. Nacen vacías en las filas que ya hay (no se repuebla nada): esas personas
--     salen por created_at hasta que se vuelvan a guardar, y esos grupos (7 de 36 con tipo) sin tipo.
--   · Fuera: los disparadores personas_al_guardar y personas_al_crear de household_state y las funciones
--     _personas_al_guardar, _persona_filas_de_estado, _fecha_iso_o_null (solo la usaba la anterior),
--     persona_sincronizar_casa y persona_reemplazar_casa. Su último llamador en el código,
--     scripts/backfill-personas.mjs, se va en el mismo PR (repoblar desde el documento es convivencia).
--
-- NO hace: no toca ninguna fila de familias (las 108 personas siguen; ni se repueblan ni se borran) ni RLS
-- ni permisos de lo que ya existía. Sin sobres de partida, las personas de hoy tendrán edad y alergias en
-- «faltan» de ficha_casa v2: Lola vuelve a preguntar (empezar de cero, Pablo 30 oct). No comprueba un
-- vocabulario de alérgenos ni de estados: hay alergias libres dichas por familias («otro», alergiasLibres) y
-- estados que solo ofrece una pantalla (dieta_blanda); rechazarlas en la base perdería salud dicha. Persona y
-- salud solo con origen dicho o delegado: no_quiere_decirlo vaciaría en la ficha una alergia guardada (0107).
-- No deshace: deshacer_operacion (0111) solo conoce la inversa de los sobres y ante una operación de persona
-- falla en alto («no tiene inversa»); la inversa de persona (fila, salud y sobres de antes) se guarda ya en
-- operacion.inversa, salvo la de quien se borra, que solo dice que se borró (su salud no se queda en la base).
--
-- Clientes viejos (la app de main sigue guardando data.members con save_household_state): hasta aplicarla,
-- el disparador copia como hoy. Aplicada, nadie copia ya data.members a persona: lo que guarde una app
-- vieja se queda en el documento sin lector en la app nueva, y las filas se quedan como estaban (sin
-- pérdida de lo que ya había). Por eso conviene aplicarla cuando el corte de lectura (trozo 10, PR B) suba
-- a main: entre medias, un cambio de familia hecho en la app de main no llega a las filas.
-- Plan B (regla migraciones): la rama se despliega antes. Sin escribir_persona la tubería contesta
-- rpc_ausente y no guarda; sin personas_de_casa la app y Lola dicen que no pueden leer la familia.
-- Lectores: personaFuente.test.js y la autoprueba; en el código, la tubería (src/lib/operaciones/) y
-- src/lib/personas.js, en el PR B del trozo 10.
-- Consulta previa (debe dar 0, 2 y 0): select (select count(*) from pg_proc where proname in ('escribir_persona',
--   'personas_de_casa')), (select count(*) from pg_trigger where tgname like 'personas_al_%'),
--   (select count(*) from information_schema.columns where table_schema = 'public'
--      and ((table_name = 'grupo' and column_name = 'tipo') or (table_name = 'persona' and column_name = 'orden')));
-- Objeto testigo: la función public.escribir_persona(jsonb), las columnas public.grupo.tipo y public.persona.orden,
-- y ningún disparador personas_al_%.
set lock_timeout = '5s';

do $$
begin
  if to_regprocedure('public.aplicar_operacion(jsonb)') is null
     or not exists (select 1 from information_schema.columns
                     where table_schema = 'public' and table_name = 'sobre' and column_name = 'operacion_id') then
    raise exception 'Faltan la 0105 y la 0106 (operacion, sobre.operacion_id, aplicar_operacion): aplícalas antes que la 0108';
  end if;
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'sobre' and column_name = 'ref_tipo') then
    raise exception 'Falta la 0107 (ficha_casa v2, sin sobre.ref_tipo): aplícala antes que la 0108';
  end if;
  if to_regprocedure('public.escribir_persona(jsonb)') is not null then
    raise exception 'escribir_persona ya existe: ¿la 0108 ya está aplicada?';
  end if;
end $$;

-- 1. Fuera la copia desde el documento ------------------------------------------------
-- Primero los disparadores (dependen de _personas_al_guardar), luego las funciones.

drop trigger if exists personas_al_guardar on public.household_state;
drop trigger if exists personas_al_crear on public.household_state;
drop function if exists public._personas_al_guardar();
drop function if exists public._persona_filas_de_estado(jsonb);
drop function if exists public._fecha_iso_o_null(text);
drop function if exists public.persona_reemplazar_casa(uuid, jsonb);
drop function if exists public.persona_sincronizar_casa(uuid, jsonb);

-- 2. grupo.tipo y persona.orden -------------------------------------------------------------
-- El tipo de cada grupo (TIPOS_GRUPO, vocabularios.js: familia, adultos, ninos, bebe, adhoc) y el orden de la
-- familia los lleva hoy data.groups / data.members y la copia de la 0089 no los pasaba: sin columna se
-- perderían al dejar el documento. Nacen vacías (no se repuebla). Las escribe escribir_persona y las lee
-- personas_de_casa.
alter table public.grupo add column tipo text;
alter table public.grupo
  add constraint grupo_tipo_vocabulario check (tipo is null or tipo in ('familia', 'adultos', 'ninos', 'bebe', 'adhoc')) not valid;
-- La columna acaba de nacer vacía: validar es inmediato.
alter table public.grupo validate constraint grupo_tipo_vocabulario;
comment on column public.grupo.tipo is 'Qué grupo es (TIPOS_GRUPO, vocabularios.js); null = sin tipo (los grupos de antes de la 0108). Lo escribe escribir_persona y lo lee personas_de_casa.';

alter table public.persona add column orden integer;
alter table public.persona add constraint persona_orden_rango check (orden is null or orden >= 0) not valid;
alter table public.persona validate constraint persona_orden_rango;
comment on column public.persona.orden is 'El sitio de la persona en la familia (0 = la primera), como grupo.orden; null = sin orden (las de antes de la 0108: salen por created_at). Lo escribe escribir_persona y lo lee personas_de_casa.';

-- 3. escribir_persona -------------------------------------------------------------------
--
-- p_operacion: {casa, clave, accion, canal (app, telegram o whatsapp: nunca sistema), ref_tipo, ref_id,
--   autor_user_id?, autor_persona_id?, pedida_at?, origen? (dicho por defecto, o delegado),
--   personas: [{id, borrar?: true} | {id, nombre?, orden?, edad?, rol_hogar?, alergias_revisadas?, peso_kg?,
--     altura_cm?, usa_fecha_nacimiento?, fecha_nacimiento?, detalle_etapa?, no_es_bebe?, clave_perfil?,
--     clave_avatar?, color?, resto? (objeto: sustituye entero al de antes), alergias?: [texto],
--     intolerancias?: [texto], estados?: [{estado, hasta?}] (sin estados repetidos), perfiles_salud?: [texto]}],
--   grupos?: [{id, nombre, tipo?, color?, orden?, personas: [id]}]  (la lista entera: el grupo que no viene se borra)}
-- Un id nuevo (de persona o de grupo) tiene forma de uuid (src/lib/ids.js; desde la 0091 todos lo son).
-- Devuelve {operacion_id, estado, repetida, hecho, sin_hacer, choques, rev}, como aplicar_operacion.
-- Lo que no cuadra (una persona nueva sin nombre, una lista que no es lista, un grupo con una persona de
-- otra casa) aborta la operación entera: la tubería lo valida antes.
create function public.escribir_persona(p_operacion jsonb)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  -- Plan, «Cómo se escribe»: en la salud, añadir gana a quitar en el mismo minuto.
  c_mismo_rato constant interval := interval '1 minute';
  c_max constant integer := 50;
  c_uuid constant text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
  v_casa uuid := nullif(p_operacion->>'casa', '')::uuid;
  v_clave text := p_operacion->>'clave';
  v_canal text := p_operacion->>'canal';
  v_origen text := coalesce(p_operacion->>'origen', 'dicho');
  v_personas jsonb := coalesce(p_operacion->'personas', '[]'::jsonb);
  v_autor_persona text := nullif(p_operacion->>'autor_persona_id', '');
  v_uid uuid := auth.uid();
  v_autor uuid;
  v_id uuid;
  v_rev bigint;
  v_choque text;
  v_hecho jsonb := '[]'::jsonb;
  v_choques jsonb := '[]'::jsonb;
  v_inv_personas jsonb := '[]'::jsonb;
  v_inv_sobres jsonb := '[]'::jsonb;
  v_inv_grupos jsonb;
  p jsonb; v_pid text; v_antes public.persona; v_fila public.persona; v_habia boolean;
  v_lista text[]; v_alergias_antes text[]; v_alergias_ahora text[]; v_campo text; v_tiene boolean; v_cambia boolean;
  d jsonb;
begin
  if v_casa is null or v_clave is null then
    raise exception 'escribir_persona: faltan casa o clave' using errcode = '22023';
  end if;
  if v_uid is null and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'escribir_persona: hace falta sesión' using errcode = '42501';
  end if;
  v_autor := coalesce(v_uid, nullif(p_operacion->>'autor_user_id', '')::uuid);
  if v_autor is not null and not exists (
       select 1 from public.household_members m where m.household_id = v_casa and m.user_id = v_autor) then
    raise exception 'escribir_persona: el autor no es de esta casa' using errcode = '42501';
  end if;
  -- Persona y salud las dice una persona de la casa: nada supuesto, nada del sistema, y nada que vacíe en la
  -- ficha lo guardado (no_quiere_decirlo deja el campo vacío en ficha_casa v2 aunque la columna tenga algo).
  if v_origen not in ('dicho', 'delegado') then
    raise exception 'escribir_persona: la persona y su salud las dice la familia (dicho o delegado), no %', v_origen using errcode = '22023';
  end if;
  if v_canal is null or v_canal = 'sistema' then
    raise exception 'escribir_persona: la persona y su salud llegan por la app o por un chat, no por %', coalesce(v_canal, 'nada') using errcode = '22023';
  end if;
  if jsonb_typeof(v_personas) <> 'array' or jsonb_array_length(v_personas) > c_max
     or exists (select 1 from jsonb_array_elements(v_personas) x
                 where jsonb_typeof(x.value) <> 'object' or nullif(btrim(x.value->>'id'), '') is null)
     or exists (select 1 from jsonb_array_elements(v_personas) x group by btrim(x.value->>'id') having count(*) > 1) then
    raise exception 'escribir_persona: personas, una lista de hasta % con id y sin ids repetidos', c_max using errcode = '22023';
  end if;
  if p_operacion ? 'grupos' and (jsonb_typeof(p_operacion->'grupos') <> 'array' or jsonb_array_length(p_operacion->'grupos') > c_max
     or exists (select 1 from jsonb_array_elements(p_operacion->'grupos') x
                 where jsonb_typeof(x.value) <> 'object' or nullif(btrim(x.value->>'id'), '') is null)
     or exists (select 1 from jsonb_array_elements(p_operacion->'grupos') x group by btrim(x.value->>'id') having count(*) > 1)) then
    raise exception 'escribir_persona: grupos, una lista de hasta % con id y sin ids repetidos', c_max using errcode = '22023';
  end if;
  if jsonb_array_length(v_personas) = 0 and not p_operacion ? 'grupos' then
    raise exception 'escribir_persona: nada que escribir (ni personas ni grupos)' using errcode = '22023';
  end if;

  -- La clave primero, como aplicar_operacion: la misma dos veces espera aquí a la primera y no hace nada.
  -- La persona autora se apunta al final: puede ser una que nace en esta misma operación («yo soy Ana»).
  insert into public.operacion (household_id, clave, accion, autor_user_id, canal, ref_tipo, ref_id,
                                estado, pedido, pedida_at)
  values (v_casa, v_clave, p_operacion->>'accion', v_autor, v_canal,
          p_operacion->>'ref_tipo', p_operacion->>'ref_id', 'pendiente',
          jsonb_build_object('personas', v_personas, 'origen', v_origen)
            || case when p_operacion ? 'grupos' then jsonb_build_object('grupos', p_operacion->'grupos') else '{}'::jsonb end,
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

  -- Una escritura de la familia a la vez por casa: la fila de household_state (la que sube bot_rev al final)
  -- se toma ya, así dos operaciones de persona no se cruzan aunque recorran las personas en su orden.
  perform 1 from public.household_state where household_id = v_casa for update;
  if not found then
    raise exception 'escribir_persona: la casa no tiene household_state' using errcode = '23503';
  end if;
  select choque into v_choque from public.registro_campo where id = 'alergias';

  for p in select x.value from jsonb_array_elements(v_personas) with ordinality x order by x.ordinality loop
    v_pid := btrim(p->>'id');
    -- «no key update»: no espera a quien solo apunta una fila a esta persona (sobre, bot_tareas: la FK toma
    -- «key share»), que luego sube bot_rev; con «for update» las dos se esperarían (40P01). Como en la 0111.
    select * into v_antes from public.persona where household_id = v_casa and id = v_pid for no key update;
    v_habia := found;

    -- Quitar a alguien: su salud y sus sobres se van con él (cascada); sus tareas se quedan sin persona (0089).
    -- De quien se borra, la inversa solo dice que se borró: su salud no se queda guardada en operacion.
    if p->'borrar' = 'true'::jsonb then
      if v_habia then
        v_inv_personas := v_inv_personas || jsonb_build_array(jsonb_build_object('persona_id', v_pid, 'borrada', true));
        delete from public.persona where household_id = v_casa and id = v_pid;
        v_hecho := v_hecho || jsonb_build_array(jsonb_build_object('persona_id', v_pid, 'borrada', true));
      end if;
      continue;
    end if;

    -- La foto de antes (fila, salud y sobres) para la inversa; null si la persona nace aquí.
    v_alergias_antes := array(select a.alergeno from public.persona_alergia a
                               where a.household_id = v_casa and a.persona_id = v_pid order by a.alergeno);
    v_inv_personas := v_inv_personas || jsonb_build_array(jsonb_build_object('persona_id', v_pid, 'antes',
      case when v_habia then to_jsonb(v_antes) - 'household_id' || jsonb_build_object(
        'alergias', to_jsonb(v_alergias_antes),
        'intolerancias', coalesce((select jsonb_agg(i.valor order by i.valor) from public.persona_intolerancia i
                                    where i.household_id = v_casa and i.persona_id = v_pid), '[]'::jsonb),
        'estados', coalesce((select jsonb_agg(jsonb_build_object('estado', e.estado, 'hasta', e.hasta) order by e.estado)
                              from public.persona_estado e where e.household_id = v_casa and e.persona_id = v_pid), '[]'::jsonb),
        'perfiles_salud', coalesce((select jsonb_agg(ps.perfil order by ps.perfil) from public.persona_perfil_salud ps
                                     where ps.household_id = v_casa and ps.persona_id = v_pid), '[]'::jsonb),
        'grupos', coalesce((select jsonb_agg(gp.grupo_id order by gp.grupo_id) from public.grupo_persona gp
                             where gp.household_id = v_casa and gp.persona_id = v_pid), '[]'::jsonb)) end));
    if v_habia then
      v_inv_sobres := v_inv_sobres || coalesce((select jsonb_agg(to_jsonb(s) - 'household_id') from public.sobre s
                                                 where s.household_id = v_casa and s.persona_id = v_pid), '[]'::jsonb);
    end if;

    if not v_habia then
      if v_pid !~ c_uuid then
        raise exception 'escribir_persona: el id de una persona nueva es un uuid (ids.js), no «%»', v_pid using errcode = '22023';
      end if;
      if nullif(btrim(p->>'nombre'), '') is null then
        raise exception 'escribir_persona: una persona nueva necesita nombre' using errcode = '22023';
      end if;
      insert into public.persona (household_id, id, nombre, created_at, updated_at)
      values (v_casa, v_pid, btrim(p->>'nombre'), clock_timestamp(), clock_timestamp())
      on conflict (household_id, id) do nothing;
      perform 1 from public.persona where household_id = v_casa and id = v_pid for no key update;
    end if;
    if p ? 'resto' and jsonb_typeof(p->'resto') not in ('object', 'null') then
      raise exception 'escribir_persona: resto de % es un objeto (o null para vaciarlo)', v_pid using errcode = '22023';
    end if;

    -- Solo lo que viene; lo demás se queda como estaba. Las marcas, sin nulo (false).
    update public.persona set
      nombre = case when p ? 'nombre' then coalesce(nullif(btrim(p->>'nombre'), ''), nombre) else nombre end,
      orden = case when p ? 'orden' then (p->>'orden')::integer else orden end,
      edad = case when p ? 'edad' then (p->>'edad')::integer else edad end,
      rol_hogar = case when p ? 'rol_hogar' then nullif(btrim(p->>'rol_hogar'), '') else rol_hogar end,
      alergias_revisadas = case when p ? 'alergias_revisadas' then coalesce((p->>'alergias_revisadas')::boolean, false) else alergias_revisadas end,
      peso_kg = case when p ? 'peso_kg' then (p->>'peso_kg')::numeric else peso_kg end,
      altura_cm = case when p ? 'altura_cm' then (p->>'altura_cm')::numeric else altura_cm end,
      usa_fecha_nacimiento = case when p ? 'usa_fecha_nacimiento' then coalesce((p->>'usa_fecha_nacimiento')::boolean, false) else usa_fecha_nacimiento end,
      fecha_nacimiento = case when p ? 'fecha_nacimiento' then (p->>'fecha_nacimiento')::date else fecha_nacimiento end,
      detalle_etapa = case when p ? 'detalle_etapa' then nullif(btrim(p->>'detalle_etapa'), '') else detalle_etapa end,
      no_es_bebe = case when p ? 'no_es_bebe' then coalesce((p->>'no_es_bebe')::boolean, false) else no_es_bebe end,
      clave_perfil = case when p ? 'clave_perfil' then nullif(btrim(p->>'clave_perfil'), '') else clave_perfil end,
      clave_avatar = case when p ? 'clave_avatar' then nullif(btrim(p->>'clave_avatar'), '') else clave_avatar end,
      color = case when p ? 'color' then nullif(btrim(p->>'color'), '') else color end,
      resto = case when p ? 'resto' then coalesce(nullif(p->'resto', 'null'::jsonb), '{}'::jsonb) else resto end,
      updated_at = clock_timestamp()
    where household_id = v_casa and id = v_pid
    returning * into v_fila;

    -- Las listas de salud: la que viene sustituye a la de antes, en sitio (lo que sigue no se toca).
    foreach v_campo in array array['alergias', 'intolerancias', 'perfiles_salud'] loop
      continue when not p ? v_campo;
      if jsonb_typeof(p->v_campo) <> 'array' or jsonb_array_length(p->v_campo) > c_max
         or exists (select 1 from jsonb_array_elements(p->v_campo) x where jsonb_typeof(x.value) <> 'string' or char_length(x.value #>> '{}') > 100) then
        raise exception 'escribir_persona: % de %, una lista de hasta % textos de hasta 100 letras', v_campo, v_pid, c_max using errcode = '22023';
      end if;
      v_lista := array(select distinct btrim(x) from jsonb_array_elements_text(p->v_campo) x where btrim(x) <> '');
      if v_campo = 'alergias' then
        -- Más restrictivo: si otra persona u otro canal tocó estas alergias hace menos de un minuto, lo que
        -- quitaría esta operación se queda (añadir gana). Quien se corrige a sí mismo sí quita.
        if v_choque = 'mas_restrictivo' and exists (
             select 1 from public.sobre s
              where s.household_id = v_casa and s.campo = 'alergias' and s.persona_id = v_pid
                and s.updated_at > now() - c_mismo_rato
                and (s.dicho_by is distinct from v_autor or s.canal is distinct from v_canal))
           and exists (select 1 from unnest(v_alergias_antes) a where a <> all(v_lista)) then
          v_lista := array(select unnest(v_lista) union select unnest(v_alergias_antes));
          v_choques := v_choques || jsonb_build_array(jsonb_build_object('campo', 'alergias', 'persona_id', v_pid, 'regla', v_choque));
        end if;
        delete from public.persona_alergia where household_id = v_casa and persona_id = v_pid and alergeno <> all(v_lista);
        insert into public.persona_alergia (household_id, persona_id, alergeno)
        select v_casa, v_pid, x from unnest(v_lista) x on conflict do nothing;
      elsif v_campo = 'intolerancias' then
        delete from public.persona_intolerancia where household_id = v_casa and persona_id = v_pid and valor <> all(v_lista);
        insert into public.persona_intolerancia (household_id, persona_id, valor)
        select v_casa, v_pid, x from unnest(v_lista) x on conflict do nothing;
      else
        delete from public.persona_perfil_salud where household_id = v_casa and persona_id = v_pid and perfil <> all(v_lista);
        insert into public.persona_perfil_salud (household_id, persona_id, perfil)
        select v_casa, v_pid, x from unnest(v_lista) x on conflict do nothing;
      end if;
    end loop;

    if p ? 'estados' then
      if jsonb_typeof(p->'estados') <> 'array' or jsonb_array_length(p->'estados') > c_max
         or exists (select 1 from jsonb_array_elements(p->'estados') x
                     where jsonb_typeof(x.value) <> 'object' or nullif(btrim(x.value->>'estado'), '') is null
                        or char_length(x.value->>'estado') > 100)
         or exists (select 1 from jsonb_array_elements(p->'estados') x group by btrim(x.value->>'estado') having count(*) > 1) then
        raise exception 'escribir_persona: estados de %, una lista de hasta % {estado, hasta} sin estados repetidos', v_pid, c_max using errcode = '22023';
      end if;
      delete from public.persona_estado e where e.household_id = v_casa and e.persona_id = v_pid
         and e.estado not in (select btrim(x.value->>'estado') from jsonb_array_elements(p->'estados') x);
      insert into public.persona_estado (household_id, persona_id, estado, hasta)
      select v_casa, v_pid, btrim(x.value->>'estado'), (x.value->>'hasta')::date
        from jsonb_array_elements(p->'estados') x
      on conflict (household_id, persona_id, estado) do update set hasta = excluded.hasta;
    end if;

    -- El sobre de los campos del registro con columna propia: dicho si tiene valor (alergias: con la marca),
    -- y fuera si se vacía. Solo si su dato cambió o aún no tiene sobre: guardar el nombre no lo renueva (ni
    -- arma la regla del minuto). El valor no va en el sobre: lo lee ficha_casa v2 de la columna.
    v_alergias_ahora := array(select a.alergeno from public.persona_alergia a
                               where a.household_id = v_casa and a.persona_id = v_pid order by a.alergeno);
    for v_campo, v_tiene, v_cambia in
      select c.campo, c.tiene, c.cambia from (values
        ('alergias', case when p ? 'alergias' or p ? 'alergias_revisadas' then v_fila.alergias_revisadas end,
                     not v_habia or v_antes.alergias_revisadas is distinct from v_fila.alergias_revisadas
                       or v_alergias_antes is distinct from v_alergias_ahora),
        ('edad', case when p ? 'edad' then v_fila.edad is not null end,
                 not v_habia or v_antes.edad is distinct from v_fila.edad),
        ('nacimiento', case when p ? 'fecha_nacimiento' then v_fila.fecha_nacimiento is not null end,
                       not v_habia or v_antes.fecha_nacimiento is distinct from v_fila.fecha_nacimiento)
      ) as c(campo, tiene, cambia)
      where c.tiene is not null
    loop
      if v_tiene and (v_cambia or not exists (select 1 from public.sobre s
                                               where s.household_id = v_casa and s.campo = v_campo and s.persona_id = v_pid)) then
        update public.sobre
           set valor = null, origen = v_origen, canal = v_canal, operacion_id = v_id, caduca_at = null,
               dicho_by = v_autor, confirmado_at = now()
         where household_id = v_casa and campo = v_campo and persona_id = v_pid;
        if not found then
          insert into public.sobre (household_id, persona_id, campo, valor, origen, dicho_by, canal, operacion_id)
          values (v_casa, v_pid, v_campo, null, v_origen, v_autor, v_canal, v_id);
        end if;
      elsif not v_tiene then
        delete from public.sobre where household_id = v_casa and campo = v_campo and persona_id = v_pid;
      end if;
    end loop;

    v_hecho := v_hecho || jsonb_build_array(jsonb_build_object('persona_id', v_pid, 'nueva', not v_habia));
  end loop;

  -- Los grupos: la lista entera. Los que siguen se actualizan en sitio; el que no viene se borra; quién está
  -- en cada uno se rehace (grupo_persona no tiene nada colgando).
  if p_operacion ? 'grupos' then
    if exists (select 1 from jsonb_array_elements(p_operacion->'grupos') x
                where btrim(x.value->>'id') !~ c_uuid
                  and not exists (select 1 from public.grupo g where g.household_id = v_casa and g.id = btrim(x.value->>'id'))) then
      raise exception 'escribir_persona: el id de un grupo nuevo es un uuid (ids.js)' using errcode = '22023';
    end if;
    select coalesce(jsonb_agg(to_jsonb(g) - 'household_id' || jsonb_build_object('personas',
             coalesce((select jsonb_agg(gp.persona_id order by gp.persona_id) from public.grupo_persona gp
                        where gp.household_id = g.household_id and gp.grupo_id = g.id), '[]'::jsonb)) order by g.orden, g.id), '[]'::jsonb)
      into v_inv_grupos
      from public.grupo g where g.household_id = v_casa;
    insert into public.grupo (household_id, id, nombre, tipo, color, orden)
    select v_casa, btrim(x.value->>'id'), coalesce(nullif(btrim(x.value->>'nombre'), ''), '(sin nombre)'),
           nullif(btrim(x.value->>'tipo'), ''), nullif(btrim(x.value->>'color'), ''),
           coalesce((x.value->>'orden')::integer, (x.ordinality - 1)::integer)
      from jsonb_array_elements(p_operacion->'grupos') with ordinality x
    on conflict (household_id, id) do update set nombre = excluded.nombre, tipo = excluded.tipo, color = excluded.color, orden = excluded.orden;
    delete from public.grupo g where g.household_id = v_casa
       and g.id not in (select btrim(x.value->>'id') from jsonb_array_elements(p_operacion->'grupos') x);
    delete from public.grupo_persona where household_id = v_casa;
    insert into public.grupo_persona (household_id, grupo_id, persona_id)
    select distinct v_casa, btrim(x.value->>'id'), btrim(m)
      from jsonb_array_elements(p_operacion->'grupos') x
     cross join lateral jsonb_array_elements_text(case when jsonb_typeof(x.value->'personas') = 'array'
                                                       then x.value->'personas' else '[]'::jsonb end) m;
    v_hecho := v_hecho || jsonb_build_array(jsonb_build_object('grupos', jsonb_array_length(p_operacion->'grupos')));
  end if;

  update public.household_state set bot_rev = bot_rev + 1 where household_id = v_casa returning bot_rev into v_rev;

  -- La inversa de persona no la conoce aún deshacer_operacion (0111): sin «datos», falla en alto si se pide.
  update public.operacion
     set estado = 'hecha', hecho = v_hecho, choques = v_choques, ejecutada_at = now(),
         autor_persona_id = (select x.id from public.persona x where x.household_id = v_casa and x.id = v_autor_persona),
         inversa = jsonb_build_object('personas', v_inv_personas, 'sobres', v_inv_sobres)
                   || case when v_inv_grupos is not null then jsonb_build_object('grupos', v_inv_grupos) else '{}'::jsonb end
   where household_id = v_casa and id = v_id;

  return jsonb_build_object('operacion_id', v_id, 'estado', 'hecha', 'repetida', false, 'hecho', v_hecho,
                            'sin_hacer', '[]'::jsonb, 'choques', v_choques, 'rev', v_rev);
end $$;

revoke all on function public.escribir_persona(jsonb) from public, anon, authenticated;
grant execute on function public.escribir_persona(jsonb) to service_role;

comment on function public.escribir_persona(jsonb) is
  'La única escritura de persona, persona_* y grupo (trozo 10): una operación con sus personas (solo lo que traen, o borrar) y, si vienen, todos los grupos; en una transacción, con el sobre de alergias, edad y nacimiento, la regla más restrictiva en alergias y bot_rev. Idempotente por (casa, clave). Solo la service role (la tubería del servidor).';

-- 4. personas_de_casa -------------------------------------------------------------------
-- {v: 1, rev, personas: [{id, nombre, orden, edad, rol_hogar, alergias_revisadas, peso_kg, altura_cm,
--   usa_fecha_nacimiento, fecha_nacimiento, detalle_etapa, no_es_bebe, clave_perfil, clave_avatar, color, resto,
--   alergias, intolerancias, estados: [{estado, hasta}], perfiles_salud, origen_alergias}],
--   grupos: [{id, nombre, tipo, color, orden, personas}]}.
-- Las personas, por su orden (las de antes de la 0108, sin orden, detrás y por created_at); origen_alergias,
-- el del sobre de alergias (null si no lo tiene: nadie lo ha confirmado desde la 0108).
create function public.personas_de_casa(p_casa uuid)
returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_personas jsonb;
  v_grupos jsonb;
begin
  if auth.uid() is null and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'personas_de_casa: hace falta sesión' using errcode = '42501';
  end if;
  if auth.uid() is not null and not exists (
       select 1 from public.household_members m where m.household_id = p_casa and m.user_id = auth.uid()) then
    raise exception 'personas_de_casa: no eres de esta casa' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(to_jsonb(p) - 'household_id' - 'created_at' - 'updated_at' || jsonb_build_object(
           'alergias', coalesce((select jsonb_agg(a.alergeno order by a.alergeno) from public.persona_alergia a
                                  where a.household_id = p.household_id and a.persona_id = p.id), '[]'::jsonb),
           'intolerancias', coalesce((select jsonb_agg(i.valor order by i.valor) from public.persona_intolerancia i
                                       where i.household_id = p.household_id and i.persona_id = p.id), '[]'::jsonb),
           'estados', coalesce((select jsonb_agg(jsonb_build_object('estado', e.estado, 'hasta', e.hasta) order by e.estado)
                                 from public.persona_estado e
                                where e.household_id = p.household_id and e.persona_id = p.id), '[]'::jsonb),
           'perfiles_salud', coalesce((select jsonb_agg(ps.perfil order by ps.perfil) from public.persona_perfil_salud ps
                                        where ps.household_id = p.household_id and ps.persona_id = p.id), '[]'::jsonb),
           'origen_alergias', (select s.origen from public.sobre s
                                where s.household_id = p.household_id and s.campo = 'alergias' and s.persona_id = p.id))
         order by p.orden nulls last, p.created_at, p.id), '[]'::jsonb)
    into v_personas
    from public.persona p where p.household_id = p_casa;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', g.id, 'nombre', g.nombre, 'tipo', g.tipo, 'color', g.color, 'orden', g.orden,
           'personas', coalesce((select jsonb_agg(gp.persona_id order by gp.persona_id) from public.grupo_persona gp
                                  where gp.household_id = g.household_id and gp.grupo_id = g.id), '[]'::jsonb)
         ) order by g.orden, g.id), '[]'::jsonb)
    into v_grupos
    from public.grupo g where g.household_id = p_casa;

  return jsonb_build_object('v', 1, 'rev', (select s.bot_rev from public.household_state s where s.household_id = p_casa),
                            'personas', v_personas, 'grupos', v_grupos);
end $$;

revoke all on function public.personas_de_casa(uuid) from public, anon, authenticated;
grant execute on function public.personas_de_casa(uuid) to authenticated, service_role;

comment on function public.personas_de_casa(uuid) is
  'Las personas de la casa con su salud, y los grupos (trozo 10): de aquí montan members y groups la app y Lola (src/lib/personas.js). Para los de la casa (lo mismo que ya leían en household_state) y la service role. Solo lee.';

-- 5. Autoprueba (se deshace siempre) ---------------------------------------------------
-- En una casa de prueba que crea aquí, con el dueño de una casa cualquiera como miembro: crea personas con su
-- salud y su sobre (y la autora que nace en la misma operación), conserva lo que no viene y no renueva el sobre
-- si nada cambió, no repite una clave, otro canal no quita una alergia recién dicha (y quien la dijo sí), vaciar
-- la edad quita su sobre, arma los grupos, borra a una persona sin guardar su salud, rechaza lo supuesto, una
-- persona nueva sin nombre o con un id que no es uuid, lee la casa en su orden, y nadie con sesión escribe.
do $$
declare
  v_dueno uuid; v_casa uuid; v_r jsonb; v_n integer;
  v_fuera constant uuid := '00000000-0000-4000-8000-000000000108';
  v_a constant text := '00000000-0000-4000-8000-0000000001a8';
  v_b constant text := '00000000-0000-4000-8000-0000000001b8';
  v_g constant text := '00000000-0000-4000-8000-0000000001c8';
  v_base jsonb;
begin
  select owner_user_id into v_dueno from public.households order by created_at limit 1;
  if v_dueno is null then raise notice '0108 autoprueba: no hay ninguna casa, no se prueba'; return; end if;
  begin
    if exists (select 1 from pg_trigger where tgname like 'personas_al_%') then
      raise exception '0108 autoprueba: siguen los disparadores de la 0089';
    end if;
    insert into public.households (name, owner_user_id, propia) values ('Autoprueba 0108', v_dueno, false) returning id into v_casa;
    insert into public.household_members (household_id, user_id, role) values (v_casa, v_dueno, 'owner');
    insert into public.household_state (household_id) values (v_casa);
    perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
    v_base := jsonb_build_object('casa', v_casa, 'accion', 'editar_persona', 'canal', 'app', 'ref_tipo', 'pantalla',
                                 'ref_id', 'p1', 'autor_user_id', v_dueno);

    -- La autora (v_b) nace en la misma operación: su id en operacion se pone al final.
    v_r := public.escribir_persona(v_base || jsonb_build_object('clave', 'autoprueba-1', 'autor_persona_id', v_b,
             'personas', jsonb_build_array(
             jsonb_build_object('id', v_b, 'nombre', 'Otra', 'orden', 1, 'resto', jsonb_build_object('dislikes', jsonb_build_array('ajo'))),
             jsonb_build_object('id', v_a, 'nombre', 'Una', 'orden', 0, 'edad', 40, 'alergias', jsonb_build_array('Gluten'), 'alergias_revisadas', true,
                                'estados', jsonb_build_array(jsonb_build_object('estado', 'embarazo', 'hasta', '2027-01-01'))))));
    if v_r->>'estado' <> 'hecha' or (select bot_rev from public.household_state where household_id = v_casa) <> 1
       or not exists (select 1 from public.persona_alergia where household_id = v_casa and persona_id = v_a and alergeno = 'Gluten')
       or not exists (select 1 from public.sobre where household_id = v_casa and persona_id = v_a and campo = 'alergias'
                       and origen = 'dicho' and dicho_by = v_dueno and operacion_id = (v_r->>'operacion_id')::uuid)
       or not exists (select 1 from public.sobre where household_id = v_casa and persona_id = v_a and campo = 'edad')
       or exists (select 1 from public.sobre where household_id = v_casa and persona_id = v_b)
       or (select autor_persona_id from public.operacion where household_id = v_casa and clave = 'autoprueba-1') is distinct from v_b then
      raise exception '0108 autoprueba: no creó las personas con su salud, sus sobres y su autora: %', v_r;
    end if;
    v_r := public.escribir_persona(v_base || jsonb_build_object('clave', 'autoprueba-1', 'personas', jsonb_build_array(
             jsonb_build_object('id', v_a, 'nombre', 'Cambiada'))));
    if not (v_r->>'repetida')::boolean or (select nombre from public.persona where household_id = v_casa and id = v_a) <> 'Una' then
      raise exception '0108 autoprueba: la misma clave escribió dos veces: %', v_r;
    end if;
    -- Solo lo que viene: cambiar el nombre (con la misma edad) no toca la salud, el resto ni el sobre de la edad.
    v_r := public.escribir_persona(v_base || jsonb_build_object('clave', 'autoprueba-2', 'personas', jsonb_build_array(
             jsonb_build_object('id', v_a, 'nombre', 'Cambiada', 'edad', 40))));
    if not exists (select 1 from public.persona where household_id = v_casa and id = v_a and nombre = 'Cambiada' and edad = 40 and alergias_revisadas)
       or not exists (select 1 from public.persona_estado where household_id = v_casa and persona_id = v_a and hasta = '2027-01-01')
       or exists (select 1 from public.sobre where household_id = v_casa and persona_id = v_a and campo = 'edad'
                   and operacion_id = (v_r->>'operacion_id')::uuid) then
      raise exception '0108 autoprueba: cambiar el nombre tocó lo que no venía o renovó un sobre sin cambio: %', v_r;
    end if;
    -- Otro canal quita el Gluten recién dicho por la app: se queda (más restrictivo) y lo dice en choques.
    v_r := public.escribir_persona(v_base || jsonb_build_object('clave', 'autoprueba-3', 'canal', 'telegram', 'ref_tipo', 'mensaje',
             'personas', jsonb_build_array(jsonb_build_object('id', v_a, 'alergias', jsonb_build_array('Leche')))));
    if (select array_agg(alergeno order by alergeno) from public.persona_alergia where household_id = v_casa and persona_id = v_a) <> array['Gluten', 'Leche']
       or jsonb_array_length(v_r->'choques') <> 1 then
      raise exception '0108 autoprueba: otro canal quitó una alergia recién dicha: %', v_r;
    end if;
    -- Quien la dijo (mismo autor y canal) sí se corrige.
    v_r := public.escribir_persona(v_base || jsonb_build_object('clave', 'autoprueba-4', 'canal', 'telegram', 'ref_tipo', 'mensaje',
             'personas', jsonb_build_array(jsonb_build_object('id', v_a, 'alergias', jsonb_build_array('Leche')))));
    if (select array_agg(alergeno) from public.persona_alergia where household_id = v_casa and persona_id = v_a) <> array['Leche'] then
      raise exception '0108 autoprueba: quien dijo la alergia no pudo corregirla: %', v_r;
    end if;
    -- Vaciar la edad quita su sobre.
    v_r := public.escribir_persona(v_base || jsonb_build_object('clave', 'autoprueba-5', 'personas', jsonb_build_array(
             jsonb_build_object('id', v_a, 'edad', null))));
    if exists (select 1 from public.sobre where household_id = v_casa and persona_id = v_a and campo = 'edad') then
      raise exception '0108 autoprueba: vaciar la edad dejó su sobre: %', v_r;
    end if;
    -- Grupos: la lista entera, con su tipo.
    v_r := public.escribir_persona(v_base || jsonb_build_object('clave', 'autoprueba-6', 'grupos', jsonb_build_array(
             jsonb_build_object('id', v_g, 'nombre', 'Todos', 'tipo', 'familia', 'personas', jsonb_build_array(v_a, v_b)))));
    if (select count(*) from public.grupo_persona where household_id = v_casa and grupo_id = v_g) <> 2
       or (select tipo from public.grupo where household_id = v_casa and id = v_g) is distinct from 'familia' then
      raise exception '0108 autoprueba: no armó el grupo: %', v_r;
    end if;
    v_r := public.personas_de_casa(v_casa);
    if v_r->'personas'->0->>'id' <> v_a or v_r->'personas'->1->'resto'->'dislikes'->>0 <> 'ajo'
       or jsonb_array_length(v_r->'grupos') <> 1 then
      raise exception '0108 autoprueba: personas_de_casa no devolvió la casa en su orden: %', v_r;
    end if;
    -- Borrar a una persona: con su salud, sus sobres y su sitio en el grupo; la inversa no guarda su salud.
    v_r := public.escribir_persona(v_base || jsonb_build_object('clave', 'autoprueba-7', 'personas', jsonb_build_array(
             jsonb_build_object('id', v_a, 'borrar', true))));
    if exists (select 1 from public.persona where household_id = v_casa and id = v_a)
       or exists (select 1 from public.sobre where household_id = v_casa and persona_id = v_a)
       or (select count(*) from public.grupo_persona where household_id = v_casa) <> 1
       or (select inversa->'personas'->0 from public.operacion where household_id = v_casa and clave = 'autoprueba-7')
          is distinct from jsonb_build_object('persona_id', v_a, 'borrada', true) then
      raise exception '0108 autoprueba: borrar no se llevó lo suyo o guardó su salud: %', v_r;
    end if;
    -- Lo que no entra: salud supuesta, por el sistema, una persona nueva sin nombre o con un id que no es uuid.
    for v_r in select x.value from jsonb_array_elements(jsonb_build_array(
        jsonb_build_object('origen', 'supuesto', 'personas', jsonb_build_array(jsonb_build_object('id', v_b, 'alergias', '[]'::jsonb))),
        jsonb_build_object('origen', 'no_quiere_decirlo', 'personas', jsonb_build_array(jsonb_build_object('id', v_b, 'alergias', '[]'::jsonb))),
        jsonb_build_object('canal', 'sistema', 'personas', jsonb_build_array(jsonb_build_object('id', v_b, 'alergias', '[]'::jsonb))),
        jsonb_build_object('personas', jsonb_build_array(jsonb_build_object('id', v_fuera::text, 'edad', 3))),
        jsonb_build_object('personas', jsonb_build_array(jsonb_build_object('id', 'p_nueva', 'nombre', 'Mal'))))) x loop
      begin
        perform public.escribir_persona(v_base || jsonb_build_object('clave', 'autoprueba-mal') || v_r);
        raise exception '0108 autoprueba: entró lo que no debía: %', v_r;
      exception when sqlstate '22023' then null;  -- a propósito: el rechazo es lo esperado
      end;
    end loop;

    -- Con sesión (de fuera o de la casa) nadie llama a escribir_persona; de fuera tampoco se lee.
    perform set_config('request.jwt.claims', json_build_object('sub', v_fuera, 'role', 'authenticated')::text, true);
    perform set_config('role', 'authenticated', true);
    begin
      perform public.escribir_persona(v_base || jsonb_build_object('clave', 'autoprueba-8'));
      raise exception '0108 autoprueba: un usuario de fuera ha podido llamar a escribir_persona';
    exception when insufficient_privilege then null;  -- a propósito: «permission denied» es lo esperado
    end;
    begin
      perform public.personas_de_casa(v_casa);
      raise exception '0108 autoprueba: alguien de fuera ha leído las personas de una casa';
    exception when insufficient_privilege then null;  -- a propósito: «no eres de esta casa» (42501) es lo esperado
    end;
    perform set_config('request.jwt.claims', json_build_object('sub', v_dueno, 'role', 'authenticated')::text, true);
    begin
      perform public.escribir_persona(v_base || jsonb_build_object('clave', 'autoprueba-9'));
      raise exception '0108 autoprueba: el dueño con su sesión ha podido llamar a escribir_persona';
    exception when insufficient_privilege then null;  -- a propósito: solo la tubería del servidor la llama
    end;
    select jsonb_array_length(public.personas_de_casa(v_casa)->'personas') into v_n;
    if v_n <> 1 then
      raise exception '0108 autoprueba: el dueño no lee su casa (% personas)', v_n;
    end if;

    raise exception 'autoprueba 0108 bien' using errcode = 'MP108';
  exception when sqlstate 'MP108' then
    raise notice '0108 autoprueba: crea con salud, sobres y autora, conserva lo que no viene, no repite, añadir gana a quitar entre canales, vaciar quita el sobre, grupos, borrar sin guardar salud, rechaza lo que no vale, lee en orden y nadie con sesión escribe (deshecho)';
  end;
end $$;
