-- AUDITADA: auditor-datos 2026-11-04 OK
-- El historial de menús generados, en su tabla (plan fichas con estado, trozo 22; #1037). Hoy es data.menuHistory en
-- el documento de la casa: una entrada `{ at, groups }` por menú generado (o repetido), recortada a las 60 últimas
-- (src/App.jsx). Lo leen la racha (computeStreak), el contador y «último menú» de Ajustes (src/lib/menuStats.js,
-- src/screens/Settings.jsx) y el «primer menú» de la analítica (App.jsx). `groups` no lo lee nadie: no se guarda.
--
--   · menu_generado: una fila por menú generado, con su casa y cuándo (`created_at`: no se copia nada, así que es
--     la hora del menú; sin otra columna de fecha con el mismo valor). Solo el servidor (como cocinado, 0109): RLS
--     sin políticas y sin permisos de usuario; la app llega por api/operacion.js.
--   · historial_podar() (0109) gana su plazo: un año, como lo cocinado. Los demás plazos, iguales.
--
-- NO hace: no copia data.menuHistory (sin convivencia, plan del trozo 22: se empieza a contar desde que la app escribe
-- filas). No toca las otras tablas del historial ni el pg_cron `historial-podar`, que ya llama a historial_podar().
--
-- Plan B (regla migraciones): sin la tabla, api/_bot/menusGenerados.js recibe un error de PostgREST y lo dice
-- (`servidor`); la app avisa de que no apuntó el menú, y Ajustes dice que no pudo cargar la racha (no inventa un cero).
--
-- Lector: api/_bot/menusGenerados.js (para la app: src/lib/menusGenerados.js → racha, contador, primer menú).
--
-- Consultas previas:
--   select count(*) from pg_class where relname = 'menu_generado';   (debe dar 0)
--   select count(*) filter (where jsonb_array_length(coalesce(state->'data'->'menuHistory','[]'::jsonb)) > 0)
--     from public.household_state;   (4 nov 2026: 23 de 37; no se copian)
-- Objeto testigo: la tabla public.menu_generado.

set lock_timeout = '5s';

do $$
begin
  if to_regprocedure('public.historial_podar()') is null then
    raise exception 'Falta la 0109 (historial_podar): aplícala antes que la 0125';
  end if;
end $$;

create table public.menu_generado (
  id           bigint generated always as identity primary key,
  household_id uuid not null references public.households(id) on delete cascade,
  created_at   timestamptz not null default now()
);
create index menu_generado_casa on public.menu_generado (household_id, created_at desc);
comment on table public.menu_generado is
  'Un menú generado o repetido (hoy data.menuHistory): la racha y el contador de menús. Lo escribe el trozo 22; se poda al año (historial_podar). Solo el servidor.';
alter table public.menu_generado enable row level security;
revoke all on table public.menu_generado from anon, authenticated;

-- Los plazos, escritos una sola vez (plan, trozo 14): 90 días los precios y los tickets, un año lo cocinado y los menús.
create or replace function public.historial_podar() returns integer
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  c_precios constant interval := interval '90 days';
  c_cocinado constant interval := interval '1 year';
  c_menus constant interval := interval '1 year';
  v_n integer;
  v_total integer := 0;
begin
  delete from public.precio_observado where comprado_at < now() - c_precios;
  get diagnostics v_n = row_count; v_total := v_total + v_n;
  delete from public.ticket where comprado_at < now() - c_precios;
  get diagnostics v_n = row_count; v_total := v_total + v_n;
  delete from public.cocinado where cocinado_at < now() - c_cocinado;
  get diagnostics v_n = row_count; v_total := v_total + v_n;
  delete from public.menu_generado where created_at < now() - c_menus;
  get diagnostics v_n = row_count; v_total := v_total + v_n;
  return v_total;
end $$;
revoke all on function public.historial_podar() from public, anon, authenticated;

-- Autoprueba (se deshace siempre): en la primera casa, un menú de hoy y otro de hace dos años; la poda quita solo el
-- viejo; ni anon ni authenticated pueden leer la tabla.
do $$
declare
  v_casa uuid;
  v_n integer;
begin
  if has_table_privilege('anon', 'public.menu_generado', 'select') or has_table_privilege('authenticated', 'public.menu_generado', 'select') then
    raise exception '0125 autoprueba: menu_generado se puede leer sin pasar por el servidor';
  end if;
  select id into v_casa from public.households order by created_at limit 1;
  if v_casa is null then raise notice '0125 autoprueba: no hay ninguna casa, no se prueba la poda'; return; end if;
  begin
    insert into public.menu_generado (household_id, created_at) values (v_casa, now()), (v_casa, now() - interval '2 years');
    perform public.historial_podar();
    select count(*) into v_n from public.menu_generado where household_id = v_casa;
    if v_n <> 1 then raise exception '0125 autoprueba: tras la poda quedan % menús (debía quedar 1)', v_n; end if;
    raise exception '0125 autoprueba bien' using errcode = 'MP125';
  exception when sqlstate 'MP125' then
    raise notice '0125 autoprueba: la poda quita el menú viejo y deja el de hoy (deshecho)';
  end;
end $$;
