-- Tareas → persona: FK compuesta (household_id, persona_id) → persona(household_id, id).
--
-- Va DESPUÉS de la 0080 (bot_tareas.persona_id text), de la 0081
-- (persona_sincronizar_casa) y de la 0082 (que la sincronización no vacíe
-- una casa con una lista vacía). Antes de la 0081, la copia de personas borraba y
-- reinsertaba todas las de la casa: con esta FK en cascada, cada copia habría
-- borrado todas las tareas con persona de esa casa, en silencio.
--
-- Con cascada: borrar de verdad a una persona se lleva sus tareas (RGPD). Una
-- baja lógica (quitar a alguien de la casa) no borra la fila: sus tareas las
-- descarta el código.
--
-- Antes de aplicar, en el SQL editor (debe dar 0): tareas con persona que no existe.
--   select count(*) from public.bot_tareas t
--    where t.persona_id is not null
--      and not exists (select 1 from public.persona p
--                       where p.household_id = t.household_id and p.id = t.persona_id);
-- Después, cuando dé 0 y el bot nuevo lleve una semana sin errores:
--   alter table public.bot_tareas validate constraint bot_tareas_persona_fk;

-- La copia de personas tiene que sincronizar por clave, o esta FK borraría tareas.
do $$
begin
  if to_regprocedure('public.persona_sincronizar_casa(uuid, jsonb)') is null then
    raise exception 'Falta la 0081 (persona_sincronizar_casa): aplícala antes que la 0083';
  end if;
  if to_regprocedure('public.persona_reemplazar_casa(uuid, jsonb)') is not null
     and pg_get_functiondef('public.persona_reemplazar_casa(uuid, jsonb)'::regprocedure) not ilike '%persona_sincronizar_casa%' then
    raise exception 'persona_reemplazar_casa todavía borra y reinserta: aplica la 0081 antes que la 0083';
  end if;
  -- Con una lista de personas vacía (o sin la clave), la sincronización de la
  -- 0081 borraba a todas las personas de la casa: con esta FK, también sus tareas.
  if pg_get_functiondef('public.persona_sincronizar_casa(uuid, jsonb)'::regprocedure) not ilike '%lista de personas vacía%' then
    raise exception 'persona_sincronizar_casa aún vacía una casa con una lista vacía: aplica la 0082 antes que la 0083';
  end if;
end;
$$;

create index if not exists bot_tareas_persona
  on public.bot_tareas (household_id, persona_id) where persona_id is not null;

alter table public.bot_tareas drop constraint if exists bot_tareas_persona_fk;
alter table public.bot_tareas add constraint bot_tareas_persona_fk
  foreign key (household_id, persona_id) references public.persona(household_id, id)
  on delete cascade not valid;
