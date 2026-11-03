-- Los recordatorios pasan a ser tareas (plan fichas con estado, trozo 34, PR 1; #1037): bot_tareas gana el tipo
-- `recordatorio` y lo que un recordatorio necesita y una tarea no tenía: cuándo se manda (`ejecutar_at`), si se
-- repite (`repite`: diario o semanal) y qué aviso es (`aviso`: libre o el de la víspera). Así hay una sola lista de
-- lo pendiente: lo que Lola espera, lo que le falta saber, lo que hay que decidir y lo que hay que avisar a una hora.
--
--   · El plan daba la 0110 a este trozo; la numeración siguió (la 0111 a la 0121 llegaron antes) y va en la 0122.
--     La 0110 se queda sin usar, con su porqué en RESERVADOS (supabase/migrations.test.js).
--   · Solo añade: bot_reminders no se toca. El PR 2 pasa sus lectores y escritores a tareas (con plan B mientras esta
--     no esté aplicada) y el PR 3, otra migración, la retira. El plan pedía retirarla en esta misma, pero entonces el
--     código desplegado antes de aplicarla (la rama se despliega primero) leería una tabla que ya no está.
--   · bot_tareas_tipo_check se rehace con `recordatorio`, NOT VALID como la de la 0080 (sigue en PENDIENTES.md). El
--     código no escribe `recordatorio` hasta que esta esté aplicada (vocabularios.test.js lo exige): lo hace el PR 2.
--   · bot_tareas_recordatorio_check (NOT VALID y validado aquí: ninguna fila de hoy es recordatorio): un recordatorio lleva cuándo y
--     qué aviso es, solo él lleva `ejecutar_at`, `repite` y `aviso`, y no caduca antes de su hora (caduca_at >
--     ejecutar_at: la purga de la 0080 caduca lo abierto vencido).
--   · Un índice parcial para el cron que los manda: los abiertos por `ejecutar_at`.
--   · Lo demás del trozo 34 (origen enlazado, prioridad, intentos, qué bloquea, cerrada_por, objetivos con meta)
--     llega con su lector, en sus PR: un campo sin lector no entra (regla migraciones, .claude/rules/migraciones.md).
-- AUDITADA: auditor-datos 2026-11-03 OK
--   (un agente independiente, que no la escribió: encaja con kind null, el tope, v2_reglas_check, cierre_check, el
--   índice por clave y el canal; no duplica; lector en el PR 2 como la 0113 y la 0119; sin RLS, permisos ni filas.
--   De sus avisos: el CHECK ata caduca_at a después de ejecutar_at; ficha_casa (0116) devuelve los recordatorios
--   abiertos como tareas: el PR 2 los filtra o la rehace)
--
-- Cómo se usan (PR 2): un recordatorio nace abierto, con `ejecutar_at` y `caduca_at` un día después (la purga de la
-- 0080, bot_tareas_purgar, caduca lo que no se mandó a tiempo y borra lo cerrado a los 7 días, sin cambiar). Mandado,
-- pasa a `hecha` con `closed_at`; si se repite, sigue abierto con el siguiente `ejecutar_at`. Cancelado, `descartada`.
-- El disparador bot_tareas_kind_tipo (0080) le deja `kind` en null, y el tope (0080) no lo cuenta: solo cuenta
-- seguimientos.
--
-- NO hace: no toca bot_reminders ni sus filas (hoy, 1 pendiente: se pierde en el PR 3, decidido por Pablo el 3 nov
-- 2026), ni ninguna fila de bot_tareas; no cambia RLS, permisos ni funciones.
--
-- Plan B (regla migraciones): ningún código escribe todavía un recordatorio en bot_tareas: el PR 2 llega después de
-- aplicarla (vocabularios.test.js no deja ofrecer un valor que el CHECK vivo no admite). Desplegar esta rama antes de
-- aplicarla no cambia nada.
--
-- Lectores (principio «ningún campo sin lector»): en el PR 2, api/_bot/recordatorios.js (crear, ver, cancelar y
-- mandar), api/_bot/vispera.js (el aviso de la víspera), api/_bot/ficha.js (los próximos en la ficha) y
-- api/bot/recordatorios.js (el cron).
--
-- Consulta previa (debe dar 0): select count(*) from information_schema.columns
--   where table_schema = 'public' and table_name = 'bot_tareas' and column_name = 'ejecutar_at';
-- Testigo: la columna public.bot_tareas.ejecutar_at.
set lock_timeout = '5s';

do $$
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'bot_tareas' and column_name = 'tipo') then
    raise exception 'Falta la 0080 (bot_tareas sin tipo): aplícala antes que la 0122';
  end if;
end $$;

alter table public.bot_tareas
  add column if not exists ejecutar_at timestamptz,
  add column if not exists repite      text,
  add column if not exists aviso       text;

comment on column public.bot_tareas.ejecutar_at is 'Cuándo se manda un recordatorio (tipo recordatorio); null en las demás. Lo lee el cron (api/bot/recordatorios.js).';
comment on column public.bot_tareas.repite is 'Si un recordatorio se repite: diario o semanal; null, una vez. Solo en tipo recordatorio.';
comment on column public.bot_tareas.aviso is 'Qué aviso es un recordatorio: libre (lo que pidió la familia) o vispera (el aviso de la víspera, vispera.js). Solo en tipo recordatorio.';

alter table public.bot_tareas drop constraint if exists bot_tareas_tipo_check;
alter table public.bot_tareas add constraint bot_tareas_tipo_check
  check (tipo is null or tipo in ('espera', 'falta_saber', 'decision', 'seguimiento', 'recordatorio')) not valid;

alter table public.bot_tareas drop constraint if exists bot_tareas_repite_vocabulario;
alter table public.bot_tareas add constraint bot_tareas_repite_vocabulario check (repite is null or repite in ('diario', 'semanal')) not valid;
alter table public.bot_tareas drop constraint if exists bot_tareas_aviso_vocabulario;
alter table public.bot_tareas add constraint bot_tareas_aviso_vocabulario check (aviso is null or aviso in ('libre', 'vispera')) not valid;

-- Un recordatorio lleva cuándo y qué aviso es; nada más los lleva. tipo null (filas del bot viejo) cuenta como no.
alter table public.bot_tareas drop constraint if exists bot_tareas_recordatorio_check;
alter table public.bot_tareas add constraint bot_tareas_recordatorio_check check (
  (coalesce(tipo, '') = 'recordatorio') = (ejecutar_at is not null)
  and (coalesce(tipo, '') = 'recordatorio') = (aviso is not null)
  and (repite is null or coalesce(tipo, '') = 'recordatorio')
  -- No caduca antes de su hora: la purga (0080) caduca lo abierto con caduca_at vencido.
  and (coalesce(tipo, '') <> 'recordatorio' or caduca_at > ejecutar_at)
) not valid;

-- Las tres nuevas, validadas aquí mismo: las columnas acaban de nacer vacías y ninguna fila es recordatorio.
alter table public.bot_tareas validate constraint bot_tareas_repite_vocabulario;
alter table public.bot_tareas validate constraint bot_tareas_aviso_vocabulario;
alter table public.bot_tareas validate constraint bot_tareas_recordatorio_check;

create index if not exists bot_tareas_recordatorios_abiertos on public.bot_tareas (ejecutar_at)
  where tipo = 'recordatorio' and status = 'abierta';

-- Autoprueba: un recordatorio entra, uno sin hora no; con una casa cualquiera y en un bloque que se deshace.
do $$
declare
  v_casa uuid;
begin
  select id into v_casa from public.households limit 1;
  if v_casa is not null then
    begin
      insert into public.bot_tareas (household_id, channel, chat_id, texto, tipo, ejecutar_at, aviso, repite, caduca_at)
      values (v_casa, 'telegram', 'autoprueba-0122', 'sacar el pescado', 'recordatorio', now() + interval '1 hour', 'libre', 'semanal',
              now() + interval '1 day 1 hour');
      begin
        insert into public.bot_tareas (household_id, channel, chat_id, texto, tipo, aviso)
        values (v_casa, 'telegram', 'autoprueba-0122', 'sin hora', 'recordatorio', 'libre');
        raise exception 'autoprueba 0122: entró un recordatorio sin hora';
      exception when check_violation then
        if sqlerrm not like '%bot_tareas_recordatorio_check%' then
          raise;
        end if;
      end;
      raise exception 'autoprueba_0122_deshecha';
    exception when raise_exception then
      if sqlerrm <> 'autoprueba_0122_deshecha' then
        raise;
      end if;
    end;
  end if;
  if v_casa is null then
    raise notice 'autoprueba 0122: sin ninguna casa, no se ha probado ninguna fila';
  else
    raise notice 'autoprueba 0122: un recordatorio entra en bot_tareas y uno sin hora no';
  end if;
end $$;
