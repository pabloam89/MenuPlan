-- El tope de bot_tareas ya no olvida nada en silencio.
--
-- 0077 descartaba la tarea más vieja al llegar la novena: era olvidar algo que
-- alguien pidió sin decírselo. Ahora la novena se RECHAZA (P0001, «tope») y el
-- código pregunta cuál quitar; solo con su respuesta se reemplaza una.
--
-- Solo cuentan los seguimientos: las preguntas de estado (alergias, etapa del
-- bebé) ya están acotadas por el índice único (casa, clave) y nunca se pierden.
-- El candado por casa sigue: dos inserciones a la vez no saltan el tope.

create or replace function public.bot_tareas_tope()
returns trigger
language plpgsql
as $$
declare
  abiertas int;
begin
  if new.status <> 'abierta' or new.kind <> 'seguimiento' then return new; end if;
  perform pg_advisory_xact_lock(hashtext('bot_tareas:' || new.household_id::text));
  select count(*) into abiertas
    from public.bot_tareas
   where household_id = new.household_id and status = 'abierta' and kind = 'seguimiento'
     and caduca_at > now();
  if abiertas >= 8 then
    raise exception 'tope de tareas abiertas' using errcode = 'P0001', hint = 'tope';
  end if;
  return new;
end;
$$;

revoke all on function public.bot_tareas_tope() from public, anon, authenticated;

-- «No quiero decirlo»: una pregunta de estado rechazada no se vuelve a hacer.
-- No es «ninguna»: el estado de la casa sigue sin resolver; solo se calla.
-- No se purga (si se borrase, Lola volvería a preguntar a los 7 días).
alter table public.bot_tareas drop constraint if exists bot_tareas_status_check;
alter table public.bot_tareas add constraint bot_tareas_status_check
  check (status in ('abierta', 'hecha', 'descartada', 'caducada', 'rechazada'));

create or replace function public.bot_tareas_purgar()
returns jsonb
language plpgsql
as $$
declare
  caducadas int;
  borradas  int;
begin
  update public.bot_tareas
     set status = 'caducada', closed_at = now(), updated_at = now()
   where status = 'abierta' and caduca_at < now();
  get diagnostics caducadas = row_count;
  delete from public.bot_tareas
   where status in ('hecha', 'descartada', 'caducada')
     and coalesce(closed_at, updated_at) < now() - interval '7 days';
  get diagnostics borradas = row_count;
  return jsonb_build_object('ok', true, 'caducadas', caducadas, 'borradas', borradas);
end;
$$;

revoke all on function public.bot_tareas_purgar() from public, anon, authenticated;
