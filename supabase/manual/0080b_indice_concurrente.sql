-- 0080b · Índice único que cubre «abierta» y «aplazada». Va FUERA de las
-- migraciones porque `create index concurrently` no puede ir en una
-- transacción, y Supabase ejecuta cada migración dentro de una. Sin
-- `concurrently`, crear el índice bloquearía las escrituras en bot_tareas
-- mientras dura, en una base que comparten producción y staging.
--
-- Cuándo: después de aplicar 0080 y ANTES de encender BOT_TAREAS_V2 (que es
-- quien escribe «aplazada»). Mientras no exista, una aplazada no frena a una
-- abierta igual: el índice de 0077 solo mira «abierta».
--
-- Cómo: en el SQL editor de Supabase, cada sentencia por separado (sin
-- begin/commit alrededor).
--
-- 1) Comprobación previa: debe dar 0 filas. Si da alguna, hay dos vivas con la
--    misma clave en una casa: decidir cuál se cierra antes de seguir.
select household_id, clave, count(*)
  from public.bot_tareas
 where status in ('abierta', 'aplazada') and clave is not null
 group by 1, 2
having count(*) > 1;

-- 2) El índice nuevo, sin bloquear escrituras.
create unique index concurrently if not exists bot_tareas_una_viva_por_clave
  on public.bot_tareas (household_id, clave)
  where status in ('abierta', 'aplazada') and clave is not null;

-- 3) Comprobar que quedó válido (indisvalid = true). Si un concurrently falla
--    a medias deja el índice inválido: borrarlo y repetir el paso 2.
select indexrelid::regclass, indisvalid
  from pg_index
 where indexrelid = 'public.bot_tareas_una_viva_por_clave'::regclass;

-- 4) Solo con el paso 3 en true: el viejo sobra (el nuevo lo cubre entero).
drop index concurrently if exists public.bot_tareas_una_abierta_por_clave;
