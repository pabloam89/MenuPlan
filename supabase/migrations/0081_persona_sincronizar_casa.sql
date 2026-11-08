-- Sincronización de personas y grupos por clave (sustituye a persona_reemplazar_casa
-- para las copias futuras; 0079 ya está aplicada y no se toca).
--
-- Por qué: persona_reemplazar_casa borraba todas las personas de la casa y las
-- volvía a insertar. Con una FK en cascada desde bot_tareas, cada copia borraría
-- las tareas de la casa; con restrict, la copia fallaría. Aquí:
--   · las personas y los grupos se hacen UPSERT por (household_id, id);
--   · solo se borran los que ya no están en el JSON (esos sí, con su cascada);
--   · las tablas hijas (alergias, intolerancias, estados, perfiles, pertenencia)
--     se rehacen: no tienen dependientes externos, así que no arrastran nada.
--
-- Todo dentro de una sola llamada = una transacción.

create or replace function public.persona_sincronizar_casa(p_household uuid, p_filas jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  -- 1. Personas: upsert por clave.
  insert into public.persona (household_id, id, nombre, edad, rol_hogar, alergias_revisadas, peso_kg, altura_cm,
    usa_fecha_nacimiento, fecha_nacimiento, detalle_etapa, no_es_bebe, clave_perfil, clave_avatar, color, resto)
  select p_household, x->>'id', x->>'nombre', (x->>'edad')::int, x->>'rol_hogar',
         (x->>'alergias_revisadas')::boolean, (x->>'peso_kg')::numeric, (x->>'altura_cm')::numeric,
         (x->>'usa_fecha_nacimiento')::boolean, (x->>'fecha_nacimiento')::date, x->>'detalle_etapa',
         (x->>'no_es_bebe')::boolean, x->>'clave_perfil', x->>'clave_avatar', x->>'color', coalesce(x->'resto', '{}'::jsonb)
    from jsonb_array_elements(coalesce(p_filas->'personas', '[]'::jsonb)) x
  on conflict (household_id, id) do update set
    nombre = excluded.nombre, edad = excluded.edad, rol_hogar = excluded.rol_hogar,
    alergias_revisadas = excluded.alergias_revisadas, peso_kg = excluded.peso_kg, altura_cm = excluded.altura_cm,
    usa_fecha_nacimiento = excluded.usa_fecha_nacimiento, fecha_nacimiento = excluded.fecha_nacimiento,
    detalle_etapa = excluded.detalle_etapa, no_es_bebe = excluded.no_es_bebe,
    clave_perfil = excluded.clave_perfil, clave_avatar = excluded.clave_avatar, color = excluded.color,
    resto = excluded.resto, updated_at = now();

  -- 2. Personas que ya no están en el JSON: se borran (cascada a sus hijas y, cuando
  --    exista, a sus tareas: es lo que pide el borrado de datos).
  delete from public.persona
   where household_id = p_household
     and id not in (select x->>'id' from jsonb_array_elements(coalesce(p_filas->'personas', '[]'::jsonb)) x);

  -- 3. Hijas de persona: se rehacen completas.
  delete from public.grupo_persona where household_id = p_household;
  delete from public.persona_perfil_salud where household_id = p_household;
  delete from public.persona_estado where household_id = p_household;
  delete from public.persona_intolerancia where household_id = p_household;
  delete from public.persona_alergia where household_id = p_household;

  insert into public.persona_alergia (household_id, persona_id, alergeno)
  select p_household, x->>'persona_id', x->>'alergeno'
    from jsonb_array_elements(coalesce(p_filas->'alergias', '[]'::jsonb)) x;
  insert into public.persona_intolerancia (household_id, persona_id, valor)
  select p_household, x->>'persona_id', x->>'valor'
    from jsonb_array_elements(coalesce(p_filas->'intolerancias', '[]'::jsonb)) x;
  insert into public.persona_estado (household_id, persona_id, estado, hasta)
  select p_household, x->>'persona_id', x->>'estado', (x->>'hasta')::date
    from jsonb_array_elements(coalesce(p_filas->'estados', '[]'::jsonb)) x;
  insert into public.persona_perfil_salud (household_id, persona_id, perfil)
  select p_household, x->>'persona_id', x->>'perfil'
    from jsonb_array_elements(coalesce(p_filas->'perfilesSalud', '[]'::jsonb)) x;

  -- 4. Grupos: upsert, borrado de los que ya no están, y pertenencia rehecha.
  insert into public.grupo (household_id, id, nombre, color, orden)
  select p_household, x->>'id', x->>'nombre', x->>'color', (x->>'orden')::int
    from jsonb_array_elements(coalesce(p_filas->'grupos', '[]'::jsonb)) x
  on conflict (household_id, id) do update set
    nombre = excluded.nombre, color = excluded.color, orden = excluded.orden;
  delete from public.grupo
   where household_id = p_household
     and id not in (select x->>'id' from jsonb_array_elements(coalesce(p_filas->'grupos', '[]'::jsonb)) x);

  insert into public.grupo_persona (household_id, grupo_id, persona_id)
  select p_household, x->>'grupo_id', x->>'persona_id'
    from jsonb_array_elements(coalesce(p_filas->'grupoPersona', '[]'::jsonb)) x;

  return jsonb_build_object(
    'personas', jsonb_array_length(coalesce(p_filas->'personas', '[]'::jsonb)),
    'grupos', jsonb_array_length(coalesce(p_filas->'grupos', '[]'::jsonb))
  );
end;
$$;

revoke all on function public.persona_sincronizar_casa(uuid, jsonb) from public, anon, authenticated;

-- La función vieja deja de borrar y reinsertar: delega en la nueva. Así ningún
-- script antiguo puede volver a vaciar las personas de una casa.
create or replace function public.persona_reemplazar_casa(p_household uuid, p_filas jsonb)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select public.persona_sincronizar_casa(p_household, p_filas);
$$;

revoke all on function public.persona_reemplazar_casa(uuid, jsonb) from public, anon, authenticated;
