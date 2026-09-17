-- Los días sueltos de una semana, en la tabla y no solo en el blob.
--
-- Una semana de menú puede cubrir días NO contiguos: el selector deja arrastrar
-- y marcar lunes, miércoles y viernes (ver OnboardingWeek). Esa lista vive hoy
-- únicamente en `user_state.state.menuWeekDays`; `user_menu_weeks` solo guarda
-- `start_day_idx`, que al releerse significa "de ese día hasta el domingo".
--
-- O sea: una semana L/X/V archivada y releída desde esta tabla vuelve como
-- lunes-a-domingo, con cuatro días de comida que nadie pidió.
--
-- Hoy no se nota porque la app hidrata del blob. Importa porque la auditoría de
-- agosto (#15) recomienda retirar esa copia duplicada — cada check de la compra
-- escribe en las dos —, y el día que se haga, los días sueltos se pierden en
-- silencio. Esta columna es lo que hay que tener puesto ANTES de ese cambio.
--
-- Aditiva y nullable a propósito: NULL significa "esta semana no marcó días
-- sueltos", que es exactamente el comportamiento de siempre (semana completa, o
-- desde `start_day_idx` en la semana ancla). Las 209 filas que ya existen se
-- quedan como están y siguen leyéndose igual. Sin backfill, sin downtime, sin
-- tocar RLS.
--
-- El dominio son los códigos de día de `lib/planner.js` (DAYS): Lun, Mar, Mié,
-- Jue, Vie, Sáb, Dom. Se guarda como text[] y no como enum porque Postgres no
-- tiene ese enum y crear uno solo para esto obliga a mantenerlo sincronizado con
-- el cliente a mano — el mismo problema de deriva que ya arrastran
-- `recipe_category` y `meal_role` (ver specs/batch-cooking.md §2).

alter table public.user_menu_weeks
  add column if not exists active_days text[];

comment on column public.user_menu_weeks.active_days is
  'Días marcados a mano para esta semana (códigos de DAYS en lib/planner.js). NULL = sin selección manual: semana completa, o desde start_day_idx en la semana ancla.';
