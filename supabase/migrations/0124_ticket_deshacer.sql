-- AUDITADA: auditor-datos 2026-11-03 OK
-- El ticket guarda lo que deshace al borrarlo (plan fichas con estado, trozo 22; #1229, #1037). Hoy un ticket de
-- data.receipts lleva, además de súper, fecha, total y líneas, lo que hizo en la lista y en la despensa, para que
-- borrarlo lo deshaga (src/screens/SpendPanel.jsx, deleteReceipt): los artículos que tachó (`tachedKeys`), la semana
-- en que los tachó (`tachedWeekStart`) y lo que creó en «En casa» (`pantryIds`). La tabla `ticket` de la 0109 no
-- tenía dónde: sin estas columnas, pasar los tickets a su tabla rompería el deshacer.
--
--   · Tres columnas nuevas en `ticket`, con defecto vacío: nada que copiar (el 3 nov 2026, 0 de 37 casas tienen
--     tickets en el documento; consulta abajo) y ninguna fila hoy en la tabla.
--   · Sin CONTRAE, sin RLS ni permisos nuevos: la tabla sigue siendo solo del servidor (0109).
--
-- NO hace: no toca `precio_observado` ni `cocinado`, ni la poda (historial_podar, 0109), que borra el ticket entero.
--
-- Plan B (regla migraciones): el código no la necesita. Sin aplicarla, api/_bot/historialCompra.js guarda el ticket
-- sin estas columnas (PostgREST contesta PGRST204) y lo dice en el log (`ticket_sin_deshacer`); al borrarlo, solo se
-- quita del gasto.
--
-- Lector: api/_bot/historialCompra.js (lee el ticket con sus tres columnas para la app) y, en la app,
-- src/screens/SpendPanel.jsx (deleteReceipt) con App.undoReceiptTachado y removePantryItem.
--
-- Consultas previas:
--   select count(*) filter (where jsonb_array_length(coalesce(state->'data'->'receipts','[]'::jsonb)) > 0) from public.household_state;
--   (3 nov 2026: 0 de 37)
--   select count(*) from public.ticket;   (3 nov 2026: 0)

set lock_timeout = '5s';

alter table public.ticket
  add column tachados text[] not null default '{}',
  add column tachados_semana date,
  add column despensa_ids text[] not null default '{}';

comment on column public.ticket.tachados is
  'Las claves de la lista que este ticket tachó (tachedKeys de la app): borrarlo las destacha. Vacío si no tachó nada.';
comment on column public.ticket.tachados_semana is
  'El lunes de la única semana en que tachó (tachedWeekStart; que sea lunes lo comprueba filaDeTicket, src/lib/historialCompra.js): el deshacer se queda en ella. Null si no se sabe.';
comment on column public.ticket.despensa_ids is
  'Los ids de lo que creó en la despensa (pantryIds): borrarlo los quita, y nada más de «En casa».';

-- Autoprueba (no escribe nada): las tres columnas existen, con su tipo y su defecto.
do $$
declare
  v_n integer;
begin
  select count(*) into v_n from information_schema.columns
   where table_schema = 'public' and table_name = 'ticket'
     and ((column_name = 'tachados' and udt_name = '_text' and is_nullable = 'NO' and position('{}' in column_default) > 0)
       or (column_name = 'tachados_semana' and data_type = 'date' and is_nullable = 'YES')
       or (column_name = 'despensa_ids' and udt_name = '_text' and is_nullable = 'NO' and position('{}' in column_default) > 0));
  if v_n <> 3 then raise exception '0124 autoprueba: ticket tiene % de las 3 columnas nuevas como deben', v_n; end if;
end $$;
