---
name: 1password
description: Úsala al tocar una clave o secreto de MenuPlan, al montar un .env.local o un worktree, cuando un script no pueda leer una dirección op://, al dar de alta o rotar una clave en 1Password, o si falla la service account o el token del llavero.
---

# 1Password

## Qué es y dónde

- **Cuenta** de Pablo en `my.1password.eu` (plan Familias, en prueba desde el
  8 oct 2026). Las claves del proyecto están en la bóveda **`HoMenu`**, con una
  ficha por servicio y un campo por variable:
  `op://HoMenu/Supabase/SUPABASE_DB_URL`.
- **`.env.local` guarda direcciones, no claves.** La plantilla es
  `ops/env.1password`. `npm run tarea` copia el `.env.local` de la carpeta
  principal, así que cada worktree hereda las direcciones.
- **Quién las resuelve**: `scripts/lib/env.mjs` (`leerEnv`, `cargarEnv`) en los
  scripts y `vite.config.js` en la app. En los tests no se resuelven: corren
  sin claves, como en el CI.
- **Service account «MenuPlan PC Pablo»**: solo lectura sobre `HoMenu`. Su
  token vive en el llavero de Windows (Administrador de credenciales →
  credenciales web, recurso `MenuPlan 1Password`, usuario `service-account`).
  `env.mjs` lo coge de ahí para que `op` no pida la huella en cada comando.
- **CLI** `op`: `winget install AgileBits.1Password.CLI`.

## Claves

Los nombres, para qué sirve cada una y quién es el dueño están en
`ops/INVENTARIO.md`, que es la tabla que manda. Las direcciones están en
`ops/env.1password`. Aquí no se repiten.

## Operaciones habituales

- **Un worktree nuevo sin `.env.local`**: `cp ops/env.1password .env.local`.
- **Leer una clave desde un script nuevo**: `leerEnv("NOMBRE")` de
  `scripts/lib/env.mjs`. Nunca un `readFileSync(".env.local")` propio.
- **Lo que lee `process.env` directamente** (`node --env-file`, `vercel`…):
  `npm run op -- run --env-file=.env.local -- <comando>` (`scripts/op.mjs`
  añade el token del llavero). `op run` además tapa en la salida cualquier
  clave que se imprima: sale `<concealed by 1Password>`.
- **Comprobar que una clave está bien**: compararla a ciegas
  (`valor === otro`) e imprimir solo el sí o el no.
- **Dar de alta una clave**: la pega Pablo en la app, en la ficha del servicio,
  como campo oculto con el nombre de la variable. Si ya está en un fichero, un
  script la lee de ahí y pasa la ficha en JSON por stdin a
  `op item create --vault HoMenu` (o `op item edit`). El valor nunca va
  escrito en un comando, porque quedaría en la conversación. Después se añade
  la línea `NOMBRE=op://HoMenu/<Ficha>/NOMBRE` en `ops/env.1password`.
- **Rotar una clave**: se genera la nueva en el servicio y se cambia en la
  ficha y, si el despliegue la usa, en Vercel. Las direcciones no cambian, así
  que nadie toca su `.env.local`.
- **Token nuevo de la service account** (anulación o caducidad): se crea con
  `op service-account create "<nombre>" --vault HoMenu:read_items --raw` y la
  salida va directa a un script que la guarda en el llavero, sin pasar por la
  pantalla. La vieja se anula en 1Password.com → Developer → Service accounts.

## Lo que falló y por qué

- **2026-10-08 · cada comando tardaba ~10 s y el build cayó con «authorization
  timeout».** Causa: sin service account, `op` pasa por la app de escritorio,
  que pide aprobar en cada proceso nuevo, y cada comando de una sesión es un
  proceso nuevo. Arreglo: service account de solo lectura con el token en el
  llavero. Ahora 16 claves tardan unos 9 s y no piden nada.
- **2026-10-08 · «connecting to desktop app timed out».** Causa: la app de
  1Password estaba cerrada o bloqueada mientras se creaba la service account.
  Arreglo: abrirla y desbloquearla. La creación sí necesita la app, porque la
  service account no puede crear nada.
- **2026-10-08 · `op` no se encontraba tras instalarlo.** Causa: el PATH nuevo
  solo llega a los terminales abiertos después de instalar. Arreglo: reiniciar
  el terminal.

## Qué requiere el OK de Pablo

- Crear, rotar, editar o borrar una clave, una ficha o una service account.
- Cambiar los permisos de una bóveda o invitar a alguien (Álvaro, el servidor).
- Leer con la service account no lo requiere.
- El token nunca va a un fichero ni a una variable de entorno permanente
  (`setx`), y nunca se guarda nada en la bóveda Private de Pablo.

Comprobado el 2026-10-08.
