-- Reservar la hora de entrega en Mercadona (trozo 20 de specs/plan-comprar-mercadona.md, #1407). Hoy un encargo
-- (0131) acaba en `hecho` con la lista; con `llega_hasta` en `reservar` o `pagar` (0133) sigue: el trabajador mete la
-- lista en el carro, crea el pedido en Mercadona y le pide las franjas libres; la persona elige una, en la app o con
-- Lola, y el trabajador la reserva. Las llamadas, en `.claude/skills/mercadona/referencias/pedido.md`.
--
-- Estados nuevos de `status`, en orden:
--   · eligiendo: la lista está, el pedido existe en Mercadona y la persona tiene que elegir. Lleva `pedido_xid` (el
--     id del pedido en Mercadona, externo: sin FK), `total` (lo que dice el carro) y `franjas`: las 3 o 4 primeras
--     libres, tal como las da Mercadona (`id, start, end, price, available, open, timezone`), porque para reservar
--     hay que devolver la franja entera. Las franjas cambian cada minuto: se piden justo antes y no hay tabla.
--   · reservando: la persona eligió. `franja` es la elegida, una de `franjas`, y `franjas` se vacía: solo se guarda la
--     elegida. `reserva_tomada_at` dice que el trabajador la ha cogido (tomar_reserva_mercadona), como `tomado_at`
--     para rellenar.
--   · hecho: como antes; si pasó por reservar, además `franja` y `cambiable_hasta` (el `cutoff_time` de Mercadona:
--     hasta cuándo se puede cambiar el pedido).
-- Saltos nuevos: rellenando → eligiendo; eligiendo → reservando o fallido; reservando → hecho o fallido.
--
-- Un fallo después de rellenar la lista deja la lista hecha: `fallido` puede llevar `lista_xid` (antes, solo `hecho`).
-- Así «no hay horas libres» no esconde que la lista ya está en Mercadona. Fallos nuevos, en el mismo vocabulario
-- (src/lib/mercadonaFallos.js):
--   · bajo_minimo: el carro no llega al pedido mínimo, y Mercadona no deja tramitar;
--   · sin_direccion: el pedido nace sin dirección (la persona la quitó después de la revisión de la 0133);
--   · sin_franjas: ninguna franja libre;
--   · franja_ocupada: Mercadona no deja reservar la elegida (se ocupó entre medias).
--
-- Uno activo por casa: el índice único de la 0131 pasa a contar también `eligiendo` y `reservando`. Mientras se elige
-- la hora no se puede pedir otra lista. Por eso nada se queda activo para siempre: barrerCaducados
-- (api/_bot/mercadonaEncargos.js, en el mismo trozo) cierra como `caducado`, con la lista que ya hubiera,
--   · un `eligiendo` de más de 30 minutos (nadie eligió; las franjas ya no valen), poniendo `franjas` a null;
--   · un `reservando` sin coger de más de 15 minutos (tomar_reserva_mercadona ya no lo coge);
--   · un `reservando` cogido de más de 10 minutos (el trabajador se cayó a medias).
-- El hecho tardío sobre un caducado de la 0131 sigue, pero solo cierra lo que ya había: no cambia franja, pedido ni
-- fechas de reservar.
--
-- NO hace: nada de pagar (trozo 21). No toca RLS ni permisos: la tabla sigue siendo solo del servidor. No guarda la
-- dirección ni el teléfono: la dirección la lee el trabajador del propio pedido y el teléfono sale de
-- `mercadona_cuenta.telefono_sellado` (0133).
--
-- Plan B (regla migraciones): sin estas columnas el trabajador no pasa de `hecho` (api/_bot/mercadonaEncargos.js
-- cierra el encargo con la lista, como hoy, si al ofrecer las franjas la base dice 42703 o 23514), y la app y Lola
-- siguen enseñando solo la lista.
--
-- Lector: api/_bot/mercadonaEncargos.js (estadoDeCasa, que lo da a la app y a Lola: la hoja de Comprar enseña las
-- franjas y Lola las ofrece en el chat). Escriben: el mismo módulo (ofrecer las franjas, elegir, cerrar) y
-- tomar_reserva_mercadona el trabajador.
--
-- Consultas previas:
--   select count(*) from information_schema.columns where table_name = 'mercadona_encargo' and column_name = 'franjas';
--     (debe dar 0)
--   select status, count(*) from public.mercadona_encargo group by 1;
-- Objeto testigo: la columna public.mercadona_encargo.franjas.

set lock_timeout = '5s';

alter table public.mercadona_encargo
  add column pedido_xid        text,
  add column total             numeric(8, 2) check (total is null or total >= 0),
  add column franjas           jsonb check (
    franjas is null or (jsonb_typeof(franjas) = 'array' and jsonb_array_length(franjas) >= 1 and jsonb_array_length(franjas) < 5)
  ),
  add column franja            jsonb check (franja is null or jsonb_typeof(franja) = 'object'),
  add column cambiable_hasta   timestamptz,
  add column eligiendo_at      timestamptz,
  add column reservando_at     timestamptz,
  add column reserva_tomada_at timestamptz;

-- Los estados y los fallos nuevos: los nombres los leí de pg_constraint (0131).
alter table public.mercadona_encargo drop constraint mercadona_encargo_status_vocabulario;
alter table public.mercadona_encargo add constraint mercadona_encargo_status_vocabulario
  check (status in ('pendiente', 'rellenando', 'eligiendo', 'reservando', 'hecho', 'fallido')) not valid;
alter table public.mercadona_encargo drop constraint mercadona_encargo_fallo_vocabulario;
alter table public.mercadona_encargo add constraint mercadona_encargo_fallo_vocabulario check (
  fallo is null or fallo in (
    'sin_cuenta', 'sesion_caducada', 'bloqueado', 'lista_no_valida', 'caducado', 'error',
    'bajo_minimo', 'sin_direccion', 'sin_franjas', 'franja_ocupada'
  )
) not valid;

-- Tomado: todo lo que pasó por rellenar. La lista: obligatoria en hecho, posible en fallido (un fallo de después).
alter table public.mercadona_encargo drop constraint mercadona_encargo_tomado_con_fecha;
alter table public.mercadona_encargo add constraint mercadona_encargo_tomado_con_fecha check (
  (status <> 'pendiente' or tomado_at is null)
  and (status not in ('rellenando', 'eligiendo', 'reservando', 'hecho') or tomado_at is not null)
) not valid;
alter table public.mercadona_encargo drop constraint mercadona_encargo_hecho_con_lista;
alter table public.mercadona_encargo add constraint mercadona_encargo_hecho_con_lista check (
  (status <> 'hecho' or lista_xid is not null)
  and (status in ('hecho', 'fallido', 'eligiendo', 'reservando') or lista_xid is null)
  and (lista_xid is null or tomado_at is not null)
) not valid;

alter table public.mercadona_encargo
  add constraint mercadona_encargo_eligiendo_con_todo check (
    (status = 'eligiendo') = (franjas is not null)
    and (status <> 'eligiendo' or (lista_xid is not null and pedido_xid is not null and eligiendo_at is not null))
  ) not valid,
  add constraint mercadona_encargo_reservando_con_franja check (
    status <> 'reservando' or (franja is not null and pedido_xid is not null and lista_xid is not null and reservando_at is not null)
  ) not valid,
  add constraint mercadona_encargo_pedido_al_elegir check ((pedido_xid is null and total is null) or eligiendo_at is not null) not valid,
  add constraint mercadona_encargo_eligiendo_tras_tomar check (eligiendo_at is null or tomado_at is not null) not valid,
  add constraint mercadona_encargo_franja_con_fecha check (franja is null or reservando_at is not null) not valid,
  add constraint mercadona_encargo_tomada_con_reserva check (reserva_tomada_at is null or reservando_at is not null) not valid,
  add constraint mercadona_encargo_cambiable_reservado check (cambiable_hasta is null or (status = 'hecho' and franja is not null)) not valid;

-- Las filas de hoy (pendiente, rellenando, hecho, fallido) ya cumplen todo: se validan aquí mismo.
alter table public.mercadona_encargo validate constraint mercadona_encargo_status_vocabulario;
alter table public.mercadona_encargo validate constraint mercadona_encargo_fallo_vocabulario;
alter table public.mercadona_encargo validate constraint mercadona_encargo_tomado_con_fecha;
alter table public.mercadona_encargo validate constraint mercadona_encargo_hecho_con_lista;
alter table public.mercadona_encargo validate constraint mercadona_encargo_eligiendo_con_todo;
alter table public.mercadona_encargo validate constraint mercadona_encargo_reservando_con_franja;
alter table public.mercadona_encargo validate constraint mercadona_encargo_franja_con_fecha;
alter table public.mercadona_encargo validate constraint mercadona_encargo_tomada_con_reserva;
alter table public.mercadona_encargo validate constraint mercadona_encargo_cambiable_reservado;
alter table public.mercadona_encargo validate constraint mercadona_encargo_pedido_al_elegir;
alter table public.mercadona_encargo validate constraint mercadona_encargo_eligiendo_tras_tomar;

drop index public.mercadona_encargo_uno_activo;
create unique index mercadona_encargo_uno_activo on public.mercadona_encargo (household_id)
  where status in ('pendiente', 'rellenando', 'eligiendo', 'reservando');
create index mercadona_encargo_reservas_idx on public.mercadona_encargo (reservando_at)
  where status = 'reservando' and reserva_tomada_at is null;

comment on column public.mercadona_encargo.pedido_xid is 'El id del pedido a medias en Mercadona (checkout), externo: sin FK.';
comment on column public.mercadona_encargo.total is 'El total del carro en euros, como lo da Mercadona al crear el pedido.';
comment on column public.mercadona_encargo.franjas is
  'Solo en eligiendo: las franjas libres que se ofrecen, tal como las da Mercadona. Se vacía al elegir.';
comment on column public.mercadona_encargo.franja is 'La franja elegida, una de `franjas`, tal como la dio Mercadona.';
comment on column public.mercadona_encargo.cambiable_hasta is
  'El cutoff_time de la franja reservada: hasta cuándo se puede cambiar el pedido en Mercadona.';

-- Los saltos de la 0131 más los de reservar. Igual que antes: un estado final no cambia, salvo el hecho tardío sobre un
-- caducado.
create or replace function public.mercadona_encargo_saltos() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if old.status = 'fallido' and old.fallo = 'caducado' and new.status = 'hecho' then
    -- El hecho tardío solo cierra lo que ya había: nada de reservar se escribe por esta puerta.
    if new.franja is distinct from old.franja or new.pedido_xid is distinct from old.pedido_xid
       or new.reservando_at is distinct from old.reservando_at or new.eligiendo_at is distinct from old.eligiendo_at then
      raise exception 'mercadona_encargo: un hecho tardío no cambia lo de reservar';
    end if;
    return new;
  end if;
  if old.status in ('hecho', 'fallido') then
    raise exception 'mercadona_encargo: % ya es final', old.status;
  end if;
  if new.status <> old.status and not (
    (old.status = 'pendiente' and new.status in ('rellenando', 'fallido'))
    or (old.status = 'rellenando' and new.status in ('eligiendo', 'hecho', 'fallido'))
    or (old.status = 'eligiendo' and new.status in ('reservando', 'fallido'))
    or (old.status = 'reservando' and new.status in ('hecho', 'fallido'))
  ) then
    raise exception 'mercadona_encargo: de % a % no vale', old.status, new.status;
  end if;
  -- La elegida es una de las que se ofrecieron, entera: `@>` dejaría pasar un trozo de una.
  if old.status = 'eligiendo' and new.status = 'reservando'
     and not exists (select 1 from jsonb_array_elements(old.franjas) f where f = new.franja) then
    raise exception 'mercadona_encargo: esa franja no se ofreció';
  end if;
  -- Dentro de un estado no se cambia lo que lo define: la lista y el pedido al elegir, y además la franja al reservar.
  if old.status in ('eligiendo', 'reservando')
     and (new.lista_xid is distinct from old.lista_xid or new.pedido_xid is distinct from old.pedido_xid) then
    raise exception 'mercadona_encargo: la lista y el pedido no cambian en %', old.status;
  end if;
  if old.status = 'reservando' and new.franja is distinct from old.franja then
    raise exception 'mercadona_encargo: la franja reservada no cambia';
  end if;
  return new;
end;
$$;
drop trigger mercadona_encargo_saltos on public.mercadona_encargo;
create trigger mercadona_encargo_saltos
  before update of status, lista, lista_xid, entraron, faltan, fallo, tomado_at, hecho_at, fallido_at,
    pedido_xid, total, franjas, franja, cambiable_hasta, eligiendo_at, reservando_at, reserva_tomada_at
  on public.mercadona_encargo
  for each row execute function public.mercadona_encargo_saltos();

-- El trabajador coge la reserva más antigua, de una en una. Una de más de 15 minutos no la coge: barrerCaducados la cierra.
create function public.tomar_reserva_mercadona() returns setof public.mercadona_encargo
language sql security definer set search_path = public, pg_temp as $$
  update public.mercadona_encargo e
     set reserva_tomada_at = now()
   where e.id = (
     select id from public.mercadona_encargo
      where status = 'reservando' and reserva_tomada_at is null and reservando_at > now() - interval '15 minutes'
      order by reservando_at
      limit 1
      for update skip locked
   )
  returning e.*;
$$;
revoke all on function public.tomar_reserva_mercadona() from public, anon, authenticated;
grant execute on function public.tomar_reserva_mercadona() to service_role;

-- Autoprueba: el camino entero de reservar, y lo que no vale. Con una casa cualquiera y en un bloque que se deshace.
do $$
declare
  v_casa uuid;
  v_id uuid;
  v_paso boolean;
  v_franja jsonb := '{"id": "f1", "start": "2026-11-12T14:00:00Z", "end": "2026-11-12T15:00:00Z", "price": "7.21"}';
begin
  -- Una casa sin encargo activo: así el índice único no estorba y no hay que tocar filas de verdad.
  select h.id into v_casa from public.households h
   where not exists (
     select 1 from public.mercadona_encargo e
      where e.household_id = h.id and e.status in ('pendiente', 'rellenando', 'eligiendo', 'reservando')
   )
   limit 1;
  if v_casa is null then
    raise notice 'autoprueba 0134: sin ninguna casa libre, no se ha probado ninguna fila';
    return;
  end if;
  begin
    insert into public.mercadona_encargo (household_id, canal, lista) values (v_casa, 'app', '{}') returning id into v_id;
    update public.mercadona_encargo set status = 'rellenando', tomado_at = now() where id = v_id;
    update public.mercadona_encargo
       set status = 'eligiendo', lista_xid = '1', pedido_xid = 'p1', total = 64.10, eligiendo_at = now(),
           franjas = jsonb_build_array(v_franja)
     where id = v_id;

    -- Una franja que no se ofreció no entra.
    v_paso := false;
    begin
      update public.mercadona_encargo
         set status = 'reservando', franja = '{"id": "otra"}', franjas = null, reservando_at = now() where id = v_id;
      v_paso := true;
    exception when raise_exception then null; -- a propósito: el rechazo es lo que se prueba
    end;
    if v_paso then
      raise exception 'autoprueba 0134: entró una franja que no se ofreció';
    end if;
    v_paso := false;
    begin
      update public.mercadona_encargo
         set status = 'reservando', franja = '{"id": "f1"}', franjas = null, reservando_at = now() where id = v_id;
      v_paso := true;
    exception when raise_exception then null; -- a propósito: el rechazo es lo que se prueba
    end;
    if v_paso then
      raise exception 'autoprueba 0134: entró un trozo de una franja ofrecida';
    end if;

    update public.mercadona_encargo
       set status = 'reservando', franja = v_franja, franjas = null, reservando_at = now() where id = v_id;
    if (select count(*) from public.tomar_reserva_mercadona() where id = v_id) <> 1 then
      raise exception 'autoprueba 0134: tomar_reserva_mercadona no la cogió';
    end if;
    v_paso := false;
    begin
      update public.mercadona_encargo set franja = '{"id": "otra"}' where id = v_id;
      v_paso := true;
    exception when raise_exception then null; -- a propósito: el rechazo es lo que se prueba
    end;
    if v_paso then
      raise exception 'autoprueba 0134: la franja reservada se pudo cambiar';
    end if;
    update public.mercadona_encargo
       set status = 'hecho', hecho_at = now(), cambiable_hasta = now() + interval '1 day' where id = v_id;

    -- Un fallo de después de la lista guarda la lista.
    insert into public.mercadona_encargo (household_id, canal, lista) values (v_casa, 'app', '{}') returning id into v_id;
    update public.mercadona_encargo set status = 'rellenando', tomado_at = now() where id = v_id;
    update public.mercadona_encargo
       set status = 'fallido', fallo = 'bajo_minimo', fallido_at = now(), lista_xid = '1' where id = v_id;
    raise exception 'autoprueba_0134_deshecha';
  exception when others then -- a propósito: así se deshace el bloque; lo que no sea el centinela se relanza
    if sqlerrm <> 'autoprueba_0134_deshecha' then
      raise;
    end if;
  end;
  raise notice 'autoprueba 0134: reservar va de rellenando a hecho y una franja inventada se rechaza';
end;
$$;
