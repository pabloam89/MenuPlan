-- Se retira bot_reminders (plan fichas con estado, trozo 34, PR 3; #1037): los recordatorios viven en bot_tareas
-- (tipo `recordatorio`, 0122) y Lola ya no lee ni escribe la tabla vieja (#1220). Antes de borrarla, sus pendientes
-- con casa pasan a bot_tareas, para que no se pierda ninguno.
-- CONTRAE: borra la tabla bot_reminders (1 fila pendiente el 3 nov 2026, que antes pasa a bot_tareas), su disparador
-- CONTRAE: bot_reminders_tipo_vispera y su función (0085). Sin lector desde el #1220. Es de Pablo (`--pablo`).
--
--   · Quién la usa (3 nov 2026): ningún fichero de api/, src/ ni scripts/ (`git grep bot_reminders` solo da comentarios).
--     En la base, ninguna función la nombra (pg_proc.prosrc), ninguna vista, ninguna política, y no está en Realtime. Sus
--     claves (household_id → households, tarea_id → bot_tareas) son suyas y se van con ella; nada la referencia.
--   · Lo pendiente no se pierde: cada fila `pending` con casa se copia como recordatorio abierto de bot_tareas, con su
--     texto, hora (`due_at` → `ejecutar_at`), repetición, aviso (`tipo` → `aviso`), chat y canal, y caduca un día
--     después de su hora (como los que crea api/_bot/recordatorios.js), o de ahora si su hora ya pasó: así no nace
--     caducado y el cron lo manda en su siguiente pasada. Una sin casa no cabe (bot_tareas.household_id
--     es not null): el 3 nov no hay ninguna (consulta abajo), y si la hubiera la migración se para.
--   · Copia previa (3 nov 2026, 20:48 Madrid, usuario consulta_lectura, read only): la tabla, su esquema y su disparador,
--     en C:\dev\MenuPlan-copias-previas\2026-11-03-bot_reminders (fuera del repo: lleva datos de una familia). Si el
--     número de filas ya no es el de la copia, la migración se para.
--   · Una sentencia por objeto y sin `cascade`: si algo dependiera de la tabla que no está aquí, el DROP falla y la
--     migración entera se deshace.
--
-- NO hace: no toca bot_tareas salvo las filas que copia, ni otras tablas; no cambia RLS ni permisos de nada que siga.
--
-- Plan B (regla migraciones): el código no la necesita. Desde el #1220 nadie usa bot_reminders; sin aplicarla, la tabla
-- se queda quieta (con su recordatorio sin mandar: el cron ya no la mira).
--
-- Lector de lo copiado: api/_bot/recordatorios.js (ver, cancelar y el cron, enviarPendientes).
--
-- Consultas previas:
--   select status, count(*), count(*) filter (where household_id is null) as sin_casa from public.bot_reminders group by status;
--   (3 nov 2026: pending 1, sin_casa 0)
-- Testigo: la tabla public.bot_reminders (deja de existir).
-- AUDITADA: auditor-datos 2026-11-03 OK
--   (un agente independiente, que no la escribió: la copia cumple los CHECK y disparadores de bot_tareas, no duplica y
--   nada queda colgando en la base. De sus avisos: caduca_at desde ahora si ya pasó su hora, btrim como el código, y las
--   entradas de bot_reminders en PENDIENTES.md marcadas)
set lock_timeout = '5s';

do $$
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'bot_tareas' and column_name = 'ejecutar_at') then
    raise exception 'Falta la 0122 (bot_tareas sin ejecutar_at): aplícala antes que la 0123';
  end if;
  -- La copia previa (skill supabase, «Borrar tablas»; C:\dev\MenuPlan-copias-previas\2026-11-03-bot_reminders, con su
  -- MANIFIESTO.json) tiene 1 fila: si la tabla ya no tiene esas, la copia no vale y se para.
  if (select count(*) from public.bot_reminders) <> 1 then
    raise exception 'bot_reminders no tiene la fila de la copia previa del 3 nov (1): rehaz la copia antes de retirarla';
  end if;
  if exists (select 1 from public.bot_reminders where status = 'pending' and household_id is null) then
    raise exception 'Hay recordatorios pendientes sin casa en bot_reminders: no caben en bot_tareas; míralos antes de retirarla';
  end if;
end $$;

-- Lo pendiente, a bot_tareas. Sin duplicar si ya hubiera uno igual (mismo chat, texto y hora).
insert into public.bot_tareas (household_id, channel, chat_id, texto, tipo, aviso, ejecutar_at, repite, caduca_at)
select r.household_id, r.channel, r.chat_id, left(btrim(r.text), 300), 'recordatorio', r.tipo, r.due_at, r.repite,
       greatest(r.due_at, now()) + interval '1 day'
  from public.bot_reminders r
 where r.status = 'pending'
   and not exists (select 1 from public.bot_tareas t
                    where t.tipo = 'recordatorio' and t.chat_id = r.chat_id and t.texto = left(btrim(r.text), 300)
                      and t.ejecutar_at = r.due_at);

-- Comprobación: cada pendiente tiene ya su recordatorio abierto en bot_tareas.
do $$
declare
  v_faltan integer;
begin
  select count(*) into v_faltan
    from public.bot_reminders r
   where r.status = 'pending'
     and not exists (select 1 from public.bot_tareas t
                      where t.tipo = 'recordatorio' and t.status = 'abierta' and t.chat_id = r.chat_id
                        and t.texto = left(btrim(r.text), 300) and t.ejecutar_at = r.due_at);
  if v_faltan > 0 then
    raise exception 'autoprueba 0123: % recordatorio(s) pendiente(s) sin su copia en bot_tareas', v_faltan;
  end if;
  raise notice 'autoprueba 0123: los pendientes de bot_reminders están en bot_tareas';
end $$;

drop trigger bot_reminders_tipo_vispera on public.bot_reminders;
drop function public.bot_reminders_tipo_vispera();
drop table public.bot_reminders;
