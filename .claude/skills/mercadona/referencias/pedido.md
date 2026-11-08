# Cómo se tramita un pedido en la web de Mercadona

Trozo 13 de #1407. Sale de una sola pasada a mano de Pablo con su cuenta, el
8 nov 2026, grabada con `node scripts/mercadona-navegador.mjs --grabar`: 46
llamadas a `tienda.mercadona.es/api/`. Pablo hizo él cada clic: Listas → añadir
la lista al carro → completar → Tramitar → dirección y franja → teléfono →
confirmar, y cerró en la autenticación del banco. **No se pagó ni se hizo
ningún pedido**: la lista de pedidos de la cuenta salió vacía y `confirm`
devolvió la redirección al banco, que no se completó.

La grabación en crudo vive fuera del repo (`~/.menuplan/`) y ya va sin datos de
la persona (`scripts/lib/mercadonaGrabacion.mjs`). Aquí no hay ni un id real:
`:cliente`, `:pedido`, `:direccion`, `:lista` son marcadores. La web pone en
todas las rutas `?lang=es&wh=<almacén>` y la cabecera de autorización con el
token de la sesión. `scripts/lib/mercadonaPagina.mjs` manda la misma cabecera,
pero solo `?lang=es`, sin `wh`.

Lo que no dice esta pasada, en «Sin comprobar», al final.

## Resumen: los pasos y sus llamadas

| Paso | Llamada | Devuelve |
|---|---|---|
| Ver el carrito | `GET /api/customers/:cliente/cart/` | `{ id, version, lines, open_order_id, summary, products_count }` |
| Cambiar el carrito | `PUT /api/customers/:cliente/cart/` con el carrito **entero** | el carrito nuevo, con `version` + 1 |
| Crear el pedido | `POST /api/customers/:cliente/checkouts/` con `{ cart }` | 201 y el pedido a medias (`id`, `address`, `payment_method`, `summary`…) |
| Ver el pedido | `GET /api/customers/:cliente/checkouts/:pedido/` | el pedido, con `order_id: null` mientras no se confirma |
| Direcciones | `GET /api/customers/:cliente/addresses/` | `{ count, results: [{ id, …, permanent_address, postal_code, category }] }` |
| Franjas libres | `GET /api/customers/:cliente/addresses/:direccion/slots/?size=…` | `{ results: [{ id, start, end, price, available, open }] }` |
| Reservar la franja | `PUT /api/customers/:cliente/checkouts/:pedido/delivery-info/` con `{ address, slot }` | el pedido, con `slot.cutoff_time` |
| Teléfono | `PUT /api/customers/:cliente/checkouts/:pedido/phone-number/` con `{ phone_country_code, phone_national_number }` | el pedido, con `customer_phone` |
| Confirmar (pagar) | `POST /api/customers/:cliente/checkouts/:pedido/confirm/` sin cuerpo | **202** `{ authentication_mode: "redirection", authentication_uuid, exemption }` |
| Cómo va el pago | `GET /api/customers/:cliente/checkouts/:pedido/status/` | `{ state, authentication_uuid }` |
| Pedidos hechos | `GET /api/customers/:cliente/orders/?page=…&status=…` | `{ next_page, results }` |

## Carrito

- `GET …/cart/` da `id`, `version` (un número que sube con cada cambio), `lines`
  (`{ product_id, quantity, sources }`), `summary` y `products_count`.
- **Se sustituye entero:** la web manda en cada `PUT …/cart/` el carrito
  completo, `{ id, version, lines: [{ product_id, quantity, sources }] }`. Al
  añadir una lista al carro hizo un `PUT` por producto, cada uno con todo lo de
  antes más uno. Para no pisar lo que la persona ya tenía: leer el carrito,
  sumar las líneas y mandar el resultado con la `version` leída.
- `sources` dice de dónde vino cada unidad (una por unidad). No se ha visto qué
  valores tiene: la grabación los quita.
- Añadir una lista al carro es la web haciendo esos `PUT`; no hay una llamada
  «lista entera al carro».

## Pedido

- `POST …/checkouts/` con `{ cart: { id, version, lines } }` crea un pedido a
  medias (201). Ya trae la dirección por defecto, la tarjeta por defecto y el
  `summary` (`products`, `slot`, `total`, `taxes`, `volume_extra_cost`).
- `GET …/checkouts/:pedido/` lo devuelve con `order_id: null`,
  `customer_phone: null` (hasta que se pone), `requires_address_confirmation` y
  `requires_age_check` (los dos `false` en esta pasada) y `authentication_type: "sca"`.
- `POST …/checkouts/:pedido/confirm/` **es pagar**: contesta 202 con
  `authentication_mode: "redirection"`, es decir, manda a la autenticación del
  banco (SCA). El pago no termina sin que la persona lo apruebe en su banco.
  Luego `GET …/status/` dice cómo va (`state`; en esta pasada salió
  `authentication_failed`, que no se ha mirado a qué pedido correspondía).
- **El teléfono es obligatorio y va en el pedido:** el pedido nace con
  `customer_phone: null` y la web lo pide antes de confirmar
  (`PUT …/phone-number/`). El perfil (`GET /api/customers/:cliente/`) no tiene
  teléfono.

## Direcciones

- `GET …/addresses/` da `count` y las direcciones. Con `count: 0` no se puede
  tramitar: es la comprobación «tiene dirección».
- El pedido nace con la dirección por defecto (`permanent_address: true`).

## Franjas

- Son de la dirección, no del pedido: `GET …/addresses/:direccion/slots/`.
  En esta pasada, 120 franjas de una hora, en UTC (`start`, `end`), cada una con
  `price`, `available` (si se puede elegir) y `open`. Las primeras, de dos días
  después, salieron todas `available: false`.
- Reservar es `PUT …/checkouts/:pedido/delivery-info/` con la dirección entera y
  la franja tal como vino (`{ id, start, end, available, open, price, timezone }`).
- La franja reservada trae `cutoff_time`: hasta cuándo se puede cambiar el pedido
  (para una entrega el 12 nov a las 15:00 hora de España, el 11 nov a las 19:59).
- Las franjas libres cambian a cada momento: se piden justo antes de enseñarlas
  y no se guardan.

## Medios de pago

- El perfil (`GET /api/customers/:cliente/`) trae `has_active_billing: true`:
  es la comprobación «tiene medio de pago».
- El pedido trae `payment_method`: `{ id, credit_card_type, credit_card_number`
  (enmascarado en la web; quitado en la grabación)`, expires_month, expires_year,
  default_card, expiration_status }`. `expiration_status: "valid"` dice que no ha
  caducado.
- No hay una llamada para elegir tarjeta en esta pasada: se usó la de por defecto.

## Pedido mínimo

- En esta pasada el carrito pasaba de 60 € y no salió ningún aviso, así que no se
  ha visto cómo responde Mercadona por debajo. Los 60 € los dice Pablo
  (trozo 12 de #1407).
- El `summary` trae `volume_extra_cost` con `threshold: 70`: un recargo por
  litros de más (bebidas), que se suma al total.

## Sin comprobar

- Qué contesta Mercadona por debajo del pedido mínimo, y con qué llamada.
- Si el teléfono se rellena solo en un segundo pedido (esta cuenta no tenía
  pedidos).
- Cuánto aguanta un pedido a medias con su franja reservada sin confirmar.
- Si un pedido a medias creado por el trabajador aparece en la app de Mercadona
  para pagarlo allí.
- Qué valores lleva `sources` en las líneas del carrito.
- Si el carrito, el pedido o las franjas fallan sin `wh=<almacén>`, que el
  trabajador hoy no manda.
- Qué se hace tras `confirm` en la página del banco, y cómo se vuelve.
