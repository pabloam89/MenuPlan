-- Ubicación explícita del ítem en "En casa" (nevera / despensa / congelador).
--
-- Hasta ahora la ubicación se DERIVABA: congelador = frozen, y nevera vs
-- despensa según el aisle (isPerishableAisle). Eso no dejaba mover un ítem a
-- mano (p. ej. pasta que quieres tener en la nevera). Añadimos un override
-- opcional que, cuando está puesto, manda sobre la derivación.
--
--   - location NULL      → comportamiento de siempre (derivado del aisle/frozen).
--   - 'nevera'|'despensa'|'congelador' → el usuario lo fijó a mano.
--
-- `frozen` se mantiene sincronizado desde la app (location='congelador' ⇔
-- frozen=true) para que el planner/congelador/compra sigan leyendo `frozen`.
--
-- Run this in: Supabase Dashboard → SQL Editor → project → Run.

alter table user_pantry
  add column if not exists location text
    check (location is null or location in ('nevera', 'despensa', 'congelador'));
