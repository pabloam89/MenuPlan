-- Hasta dónde llega el bot en Mercadona y qué tiene la cuenta para llegar (trozo 15 de specs/plan-comprar-mercadona.md,
-- #1407; #1037). Hoy `mercadona_cuenta` (0131) solo sabe si la cuenta está conectada o caducada.
--
--   · llega_hasta: los tres pasos que enciende la persona, en orden y cada uno con los de antes: `lista` (rellenar la
--     lista), `reservar` (carro, pedido y hora de entrega) y `pagar`. Un solo dato y no tres casillas: «pagar sin
--     reservar» no existe. Vocabulario `llega_hasta_mercadona` (src/lib/mercadonaLlegaHasta.js). Toda fila existente queda
--     en `lista`, que es lo que hace hoy el bot.
--   · tiene_direccion, tiene_pago: si la cuenta de Mercadona tiene dirección y medio de pago, según lo último que miró
--     el trabajador. Null es «sin mirar», distinto de false. Deciden qué pasos se pueden encender. La dirección y la
--     tarjeta no se copian: viven en Mercadona.
--   · revisada_at: cuándo lo miró. Un check exige la fecha si hay algo mirado.
--   · telefono_sellado: el teléfono que Mercadona exige en cada pedido (su perfil no lo tiene), sellado en el móvil o
--     en el servidor con la misma clave pública que la sesión: solo lo abre el trabajador. «Tiene teléfono» es que no
--     sea null; no hay otra columna.
--
-- NO hace: no toca RLS ni permisos (la tabla sigue siendo solo del servidor), ni `mercadona_encargo`, ni el trigger de
-- la 0131. No impide en la base `reservar` sin dirección: la dirección puede desaparecer después en Mercadona, y el
-- trabajador tiene que poder apuntarlo; lo comprueba quien cambia `llega_hasta` (api/mercadona.js, trozo 17).
--
-- Plan B (regla migraciones): sin estas columnas, estadoDeCasa (api/_bot/mercadonaEncargos.js) recibe 42703, vuelve a
-- leer solo `estado` y contesta `llega_hasta: 'lista'` y lo demás null. El bot sigue rellenando listas como hasta ahora.
--
-- Lector: estadoDeCasa de api/_bot/mercadonaEncargos.js, que lo devuelve a la app y a Lola (los tres interruptores,
-- trozos 17 y 18). Escriben: `llega_hasta` y `telefono_sellado`, la app y Lola (trozos 17 y 18); `tiene_*` y
-- `revisada_at`, el trabajador (trozo 16). El teléfono lo abre el trabajador al reservar (trozo 20).
--
-- Consultas previas:
--   select count(*) from information_schema.columns where table_name = 'mercadona_cuenta' and column_name = 'llega_hasta';
--     (debe dar 0)
--   select count(*) from public.mercadona_cuenta;
-- Objeto testigo: la columna public.mercadona_cuenta.llega_hasta.

set lock_timeout = '5s';

alter table public.mercadona_cuenta
  add column llega_hasta text not null default 'lista'
    constraint mercadona_cuenta_llega_hasta_vocabulario check (llega_hasta in ('lista', 'reservar', 'pagar')),
  add column tiene_direccion boolean,
  add column tiene_pago boolean,
  add column revisada_at timestamptz,
  add column telefono_sellado text,
  add constraint mercadona_cuenta_revisada_con_fecha
    check ((tiene_direccion is null and tiene_pago is null) or revisada_at is not null);

comment on column public.mercadona_cuenta.llega_hasta is
  'Hasta dónde llega el bot: lista, reservar o pagar, cada uno con los de antes (src/lib/mercadonaLlegaHasta.js).';
comment on column public.mercadona_cuenta.tiene_direccion is
  'La cuenta de Mercadona tiene alguna dirección, según el trabajador. Null: sin mirar.';
comment on column public.mercadona_cuenta.tiene_pago is
  'La cuenta de Mercadona tiene un medio de pago activo (has_active_billing), según el trabajador. Null: sin mirar.';
comment on column public.mercadona_cuenta.revisada_at is
  'Cuándo miró el trabajador tiene_direccion y tiene_pago.';
comment on column public.mercadona_cuenta.telefono_sellado is
  'El teléfono para el pedido, sellado con la clave pública del trabajador como sesion_cifrada. Null: no lo ha dado.';
