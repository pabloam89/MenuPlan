-- AUDITADA: auditor-datos 2026-11-08 OK
-- Hasta dónde llega el bot en Mercadona y qué tiene la cuenta para llegar (trozo 15 de specs/plan-comprar-mercadona.md,
-- #1407; #1037). Hoy `mercadona_cuenta` (0131) solo sabe si la cuenta está conectada o caducada.
--
--   · llega_hasta: los tres pasos que enciende la persona, en orden y cada uno con los de antes: `lista` (rellenar la
--     lista), `reservar` (carro, pedido y hora de entrega) y `pagar`. Un solo dato y no tres casillas: «pagar sin
--     reservar» no existe. Vocabulario `llega_hasta_mercadona` (src/lib/mercadonaLlegaHasta.js). Toda fila existente
--     queda en `lista`, que es lo que hace hoy el bot.
--   · revisada_at: cuándo miró el trabajador la cuenta de Mercadona. Null es «sin mirar», y solo se dice ahí.
--   · tiene_direccion, tiene_pago: si la cuenta tiene dirección y medio de pago, según esa revisión. Sin revisión, los
--     dos son false (un check lo exige): no hay un tercer estado en los booleanos. Deciden qué pasos se pueden
--     encender. La dirección y la tarjeta no se copian: viven en Mercadona.
--   · telefono_sellado: el teléfono que Mercadona exige en cada pedido (su perfil no lo tiene), sellado con la misma
--     clave pública que la sesión: solo lo abre el trabajador. Es de `conectada_por`, como la sesión. «Tiene
--     teléfono» es que no sea null; no hay otra columna. Con tope de largo, como un sello.
--
-- Ciclo de vida: la fila sigue siendo de quien conectó la cuenta (el trigger de la 0131 la borra si sale de la casa).
-- El trigger nuevo `mercadona_cuenta_al_reconectar`, cuando se vuelve a entrar (la cuenta estaba `caducada` y vuelve a
-- `conectada`) o la conecta otra persona:
--   · la revisión vuelve a «sin mirar» (revisada_at null, tiene_* false): puede ser otra cuenta de Mercadona;
--   · si cambia `conectada_por`, llega_hasta vuelve a `lista` y el teléfono se borra: eran de la otra persona.
-- Renovar la sesión (trozo 2: misma persona, sigue `conectada`) no cambia nada de esto. Desconectar borra la fila, y
-- volver a conectar crea una nueva con los valores por defecto. Así no hay que tocar el upsert de `conectar`
-- (api/_bot/mercadonaEncargos.js), que con columnas nuevas rompería el plan B. Límite conocido: si la misma persona
-- entra con otra cuenta de Mercadona sin que la de antes haya caducado, la revisión no se reinicia aquí; el trabajador
-- vuelve a mirar en cada encargo (trozo 16).
--
-- NO hace: no toca RLS ni permisos (la tabla sigue siendo solo del servidor), ni `mercadona_encargo`, ni los triggers
-- de la 0131. No impide en la base `reservar` sin dirección: la dirección puede desaparecer después en Mercadona, y el
-- trabajador tiene que poder apuntarlo; lo comprueba quien cambia `llega_hasta` (faltaPara, trozos 17 y 18).
--
-- Plan B (regla migraciones): sin estas columnas, estadoDeCasa (api/_bot/mercadonaEncargos.js) recibe 42703, vuelve a
-- leer solo `estado` y contesta `llega_hasta: 'lista'` y lo demás sin mirar. El bot sigue rellenando listas como hasta
-- ahora.
--
-- Lector: estadoDeCasa de api/_bot/mercadonaEncargos.js (con deUnaCuenta de src/lib/mercadonaLlegaHasta.js), que lo
-- devuelve a la app y a Lola: los tres interruptores, trozos 17 y 18. Escriben: `llega_hasta` y `telefono_sellado`, la
-- app y Lola (trozos 17 y 18); `tiene_*` y `revisada_at`, el trabajador (trozo 16). El teléfono lo abre el trabajador
-- al reservar (trozo 20).
--
-- Consultas previas:
--   select count(*) from information_schema.columns where table_name = 'mercadona_cuenta' and column_name = 'llega_hasta';
--     (debe dar 0; 8 nov 2026: 0)
--   select count(*) from public.mercadona_cuenta;   (8 nov 2026: 0)
-- Objeto testigo: la columna public.mercadona_cuenta.llega_hasta.

set lock_timeout = '5s';

alter table public.mercadona_cuenta
  add column llega_hasta text not null default 'lista'
    constraint mercadona_cuenta_llega_hasta_vocabulario check (llega_hasta in ('lista', 'reservar', 'pagar')),
  add column revisada_at timestamptz,
  add column tiene_direccion boolean not null default false,
  add column tiene_pago boolean not null default false,
  add column telefono_sellado text
    constraint mercadona_cuenta_telefono_sellado_largo check (char_length(telefono_sellado) <= 2000),
  add constraint mercadona_cuenta_revisada_con_fecha
    check (revisada_at is not null or (not tiene_direccion and not tiene_pago));

comment on column public.mercadona_cuenta.llega_hasta is
  'Hasta dónde llega el bot: lista, reservar o pagar, cada uno con los de antes (src/lib/mercadonaLlegaHasta.js).';
comment on column public.mercadona_cuenta.revisada_at is
  'Cuándo miró el trabajador la cuenta de Mercadona (dirección y medio de pago). Null: sin mirar.';
comment on column public.mercadona_cuenta.tiene_direccion is
  'La cuenta de Mercadona tiene alguna dirección, según la revisión de revisada_at. Sin revisión, false.';
comment on column public.mercadona_cuenta.tiene_pago is
  'La cuenta de Mercadona tiene un medio de pago activo (has_active_billing), según la revisión. Sin revisión, false.';
comment on column public.mercadona_cuenta.telefono_sellado is
  'El teléfono para el pedido, de conectada_por, sellado con la clave pública del trabajador como sesion_cifrada. Null: no lo ha dado.';

-- Al reconectar, lo que se sabía de la cuenta anterior deja de valer; si es otra persona, también su teléfono y hasta
-- dónde dejó llegar al bot.
create function public.mercadona_cuenta_al_reconectar() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  new.revisada_at := null;
  new.tiene_direccion := false;
  new.tiene_pago := false;
  if new.conectada_por is distinct from old.conectada_por then
    new.llega_hasta := 'lista';
    new.telefono_sellado := null;
  end if;
  return new;
end;
$$;
create trigger mercadona_cuenta_al_reconectar before update of estado, conectada_por on public.mercadona_cuenta
  for each row
  when ((old.estado = 'caducada' and new.estado = 'conectada') or new.conectada_por is distinct from old.conectada_por)
  execute function public.mercadona_cuenta_al_reconectar();
revoke all on function public.mercadona_cuenta_al_reconectar() from public, anon, authenticated;
