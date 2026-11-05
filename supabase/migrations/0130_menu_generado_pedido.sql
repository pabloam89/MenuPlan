-- AUDITADA: auditor-datos 2026-11-05 OK
-- Cada menú generado sabe cómo se pidió (plan fichas con estado, trozo 70; #1037, #1210). Hoy `menu_generado` (0125)
-- solo guarda la casa y cuándo; para ofrecer «¿como la última vez?» (trozo 71) hace falta su camino y de qué
-- semana es.
--
--   · menu_generado gana menu_id, week_start y camino. Una fila vieja o de la app los deja a null: no se rellena nada,
--     se empieza a contar desde que Lola escribe filas.
--   · camino: los tres de src/lib/caminos.js, vocabulario `caminos_menu`.
--   · menu_id sin FK: la clave de user_menus es (user_id, id) y esta tabla no lleva user_id, y una fila del historial
--     tiene que sobrevivir a que borren el menú.
--   · menu_id y week_start, dentro de la casa, señalan una semana: son parte de la clave de user_menu_weeks (user_id,
--     menu_id, week_start) y no una copia, porque un menú lleva varias semanas (generarMenu copia las que se quedan) y
--     los ids se repiten entre casas. El fin y los días no se copian: se leen de esa fila, filtrando también por casa.
--
-- NO hace: no toca RLS ni permisos (la tabla sigue siendo solo del servidor), ni historial_podar(), que borra por fecha
-- la fila entera. No cambia lo que lee la racha.
--
-- Plan B (regla migraciones): sin estas columnas, api/_bot/menusGenerados.js recibe PGRST204 o 42703, lo registra y
-- apunta la fila como hasta ahora, con la casa; al leer, no hay último pedido. El menú se genera igual; solo no se
-- ofrece «como la última vez».
--
-- Lector: ultimoPedido de api/_bot/menusGenerados.js, para el trozo 71. Lo escribe generarMenu (api/_bot/generar.js).
--
-- Consultas previas:
--   select count(*) from information_schema.columns where table_name = 'menu_generado' and column_name = 'camino';
--     (debe dar 0)
--   select count(*) from public.menu_generado;   (5 nov 2026: 0)
-- Objeto testigo: la columna public.menu_generado.camino.

set lock_timeout = '5s';

alter table public.menu_generado
  add column menu_id text,
  add column week_start date,
  add column camino  text constraint menu_generado_camino_vocabulario check (camino is null or camino in ('basico', 'medio', 'avanzado'));

comment on column public.menu_generado.menu_id is
  'Null: fila de antes de la 0130 o de la app. Sin FK: user_menus tiene clave (user_id, id) y esta tabla no lleva user_id; y la fila del historial sobrevive al menú.';
comment on column public.menu_generado.week_start is
  'Con household_id y menu_id, la semana de user_menu_weeks que se pidió. Null: fila de antes de la 0130 o de la app.';
comment on column public.menu_generado.camino is
  'Null: el menú no vino de un pedido con camino (la app, «Rehacer la del…» o «sigue tú» sin elegir).';
