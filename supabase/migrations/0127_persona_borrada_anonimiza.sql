-- Al borrar una persona, sus operaciones pasadas pierden sus datos (trozo 36 de #1037, #1249).
-- AUDITADA: auditor-datos 2026-11-04 OK
--   (un agente independiente, que no la escribió, leyendo producción en solo lectura, en dos pasadas. Comprobado: 29 de
--   88 operaciones nombran personas, 0 de personas ya borradas, plan_preferencias vacía. _sin_persona: null, vacíos,
--   no-objetos, persona_id en `antes` y plan_id de sus planes, solo los que la cascada borró; lo ajeno no cambia.
--   Cascada desde households: la guarda sale sin hacer nada; sin «tuple already modified» con escribir_persona
--   (órdenes distintas, after). operacion: 88 filas, 376 kB, por la PK (household_id, id); definer con search_path
--   fijo y sin execute para anon ni authenticated. En la primera pasada pidió mirar `antes` en preferencias y planes,
--   las preferencias de sus planes, corregir la cifra y la frase de deshacer y nombrar el abrazo mortal; en la segunda,
--   no tocar los planes que siguen vivos: hecho)
--
-- Quitar a alguien de la casa va por escribir_persona (0108): borra su fila de persona y las FK se llevan su salud,
-- sus sobres, sus preferencias y sus conjuntos de preferencias. Pero sus operaciones pasadas (operacion) guardan
-- copias de sus datos en el pedido y en la inversa: en `personas` (su fila entera: nombre, peso, altura, fecha de
-- nacimiento, alergias), en `sobres` (sus sobres de antes, con su valor), en `datos` (lo pedido de un dato suyo y su
-- valor de antes, como su `schedule` en guardar_casa) y en `preferencias` y `planes` (sus gustos, con `persona_id`
-- arriba en el pedido y dentro de `antes` en la inversa, 0109). El 4 nov 2026, 29 de 88 operaciones nombran a
-- personas (27 con `personas` y 2 guardar_casa con `schedule` por persona en `datos`); ninguna a una persona ya
-- borrada: la clase existe aunque hoy no haya casos.
--
-- Un disparador, después de borrar cada fila de persona y en la misma transacción que el borrado, reescribe las
-- operaciones de esa casa que la nombran (public._sin_persona, pura):
--   · en `personas`, la suya queda como { id | persona_id, borrada: true }: se sabe que la operación la tocó, no qué
--     tenía;
--   · en cualquier otra lista (sobres, datos, preferencias, planes), salen los elementos suyos: los que tienen su
--     `persona_id` arriba o en `antes`, y las preferencias de sus conjuntos (`plan_id`, arriba o en `antes`, de un plan
--     suyo). Los ids de sus conjuntos salen de las propias operaciones de la casa (las listas `planes`): cuando corre el
--     disparador, la cascada ya ha borrado sus filas de plan_preferencias (los disparadores RI_… van antes, por orden de
--     nombre), y solo cuentan los que ya no están: un plan suyo que pasó a otra persona sigue vivo y no se toca;
--   · `hecho` y los `personas` de cada grupo en `grupos` no se tocan: solo llevan ids, sin nada suyo.
-- deshacer_operacion (0111, 0115) solo lee `inversa->'datos'` y solo hace update o delete de sobres. Hoy, un dato de
-- una persona borrada hace que todo el deshacer se rechace (`cambio_despues`, 0115). Con esto, se deshace el resto de
-- la operación (lo de las demás personas); lo suyo ya no está en la inversa. Si `datos` queda vacía, la operación pasa
-- a deshecha sin tocar sobres.
--
-- Si la casa entera se está borrando (cascada desde households, borrar cuenta), no hace nada: sus operaciones se van
-- con ella.
--
-- Aceptado: deshacer una operación que la nombra a la vez que se la borra puede acabar en un abrazo mortal (40P01):
-- deshacer_operacion bloquea su operacion y luego household_state; escribir_persona, al revés. Postgres aborta una,
-- no se corrompe nada y se puede repetir. Se quitaría en deshacer_operacion, con otra migración.
--
-- NO hace: no toca escribir_persona ni ninguna otra función, ni RLS ni permisos de lo que ya existía, ni bot_deshacer
-- (eso es api/_bot/borrarPersona.js, #1250). Sin datos que copiar: hoy no hay operaciones de personas borradas.
-- Plan B (regla migraciones): el código no depende de ella; sin ella, las copias se quedan como hoy.
-- Testigo: el disparador persona_borrada_anonimiza en public.persona.

set lock_timeout = '5s';

-- Pura. Un pedido o una inversa de operacion sin los datos de una persona ni de sus conjuntos (p_planes), como dice
-- la cabecera. Lo que no es un objeto, tal cual. Cada comparación va con coalesce: un campo que falta no es suyo.
create or replace function public._sin_persona(j jsonb, p_persona text, p_planes text[])
returns jsonb
language sql immutable set search_path = '' as $$
  select case when jsonb_typeof(j) is distinct from 'object' then j else (
    select coalesce(jsonb_object_agg(e.key, case
      when jsonb_typeof(e.value) is distinct from 'array' then e.value
      when e.key = 'personas' then (
        select coalesce(jsonb_agg(case
          when jsonb_typeof(x) = 'object' and p_persona in (coalesce(x->>'id', ''), coalesce(x->>'persona_id', ''))
            then jsonb_strip_nulls(jsonb_build_object('id', x->'id', 'persona_id', x->'persona_id', 'borrada', true))
          else x end order by n), '[]'::jsonb)
        from jsonb_array_elements(e.value) with ordinality t(x, n))
      else (
        select coalesce(jsonb_agg(x order by n), '[]'::jsonb)
        from jsonb_array_elements(e.value) with ordinality t(x, n)
        where not (jsonb_typeof(x) = 'object' and (
          p_persona in (coalesce(x->>'persona_id', ''), coalesce(x->'antes'->>'persona_id', ''))
          or coalesce(x->>'plan_id', '') = any(p_planes)
          or coalesce(x->'antes'->>'plan_id', '') = any(p_planes))))
      end), '{}'::jsonb)
    from jsonb_each(j) e) end
$$;

create or replace function public._persona_borrada_anonimiza()
returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_pid text := old.id::text;
  v_planes text[];
begin
  -- La casa entera se está borrando: sus operaciones se van con ella (cascada).
  if not exists (select 1 from public.households h where h.id = old.household_id) then
    return null;
  end if;
  -- Sus conjuntos de preferencias, de las listas `planes` de las operaciones de la casa (pedido: id; inversa: plan_id).
  v_planes := array(
    select distinct coalesce(x->>'id', x->>'plan_id')
      from public.operacion o,
           jsonb_array_elements(case when jsonb_typeof(o.pedido->'planes') = 'array' then o.pedido->'planes' else '[]'::jsonb end
                             || case when jsonb_typeof(o.inversa->'planes') = 'array' then o.inversa->'planes' else '[]'::jsonb end) x
     where o.household_id = old.household_id
       and jsonb_typeof(x) = 'object'
       and v_pid in (coalesce(x->>'persona_id', ''), coalesce(x->'antes'->>'persona_id', ''))
       and coalesce(x->>'id', x->>'plan_id') is not null
       -- Solo los que la cascada se ha llevado: un plan que fue suyo y pasó a otra persona o a la casa sigue vivo, y
       -- sus preferencias ya no son de ella.
       and not exists (select 1 from public.plan_preferencias pp
                        where pp.household_id = old.household_id and pp.id::text = coalesce(x->>'id', x->>'plan_id')));
  update public.operacion o
     set pedido = public._sin_persona(o.pedido, v_pid, v_planes),
         inversa = public._sin_persona(o.inversa, v_pid, v_planes)
   where o.household_id = old.household_id
     and exists (select 1 from unnest(array[v_pid] || v_planes) m
                  where strpos(coalesce(o.pedido::text, '') || coalesce(o.inversa::text, ''), m) > 0);
  return null;
end $$;

revoke all on function public._sin_persona(jsonb, text, text[]) from public, anon, authenticated;
revoke all on function public._persona_borrada_anonimiza() from public, anon, authenticated;

drop trigger if exists persona_borrada_anonimiza on public.persona;
create trigger persona_borrada_anonimiza
  after delete on public.persona
  for each row execute function public._persona_borrada_anonimiza();
