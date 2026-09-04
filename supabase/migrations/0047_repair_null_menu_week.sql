-- ── 0047: rescata los menús publicados sin rango de fechas ────────────────
--
-- handlePublishMenu leía `dates[0]` y `dates.length` de
-- getWeekDatesByMenuWeek, que devuelve un objeto POR NOMBRE DE DÍA
-- ({Lun: Date, Mar: Date...}), no un array. Los dos son undefined, así que
-- al compartir la SEMANA entera el menú se guardaba con week_start y
-- week_end nulos.
--
-- Y el carrusel «Hoy cocinan» filtra por rango (week_start <= hoy <=
-- week_end). Un NULL no compara, así que esos menús quedaron publicados y
-- visibles para NADIE, para siempre — ni para sus amigos ni para el propio
-- autor. Compartir "solo hoy" se salvaba porque usa otra rama del código,
-- que es justo por qué el fallo parecía intermitente.
--
-- El cliente quedó arreglado el 2026-09-03. Esto repara lo ya escrito.
--
-- La semana se reconstruye desde created_at y no se inventa: date_trunc
-- ('week') en Postgres devuelve el LUNES de esa semana (ISO), que es la
-- misma referencia que usa getWeekDates en el cliente. Un menú compartido
-- el jueves era el menú de esa semana, así que su rango es el lunes a
-- domingo que lo contiene.
--
-- Solo toca filas rotas: si un menú ya tiene rango, no se le mueve.

update public.shared_menus
   set week_start = (date_trunc('week', created_at))::date,
       week_end   = (date_trunc('week', created_at))::date + 6
 where week_start is null
    or week_end is null;

-- Que no vuelva a colarse una fila sin rango: si el cliente vuelve a
-- calcularlo mal, preferimos que el guardado falle en la cara de quien
-- publica a que el menú desaparezca en silencio, que es lo que acaba de
-- pasarnos y costó días de "no me aparece".
alter table public.shared_menus
  alter column week_start set not null,
  alter column week_end   set not null;
