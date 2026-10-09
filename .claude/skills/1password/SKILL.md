---
name: 1password
description: Úsala al tocar una clave o secreto de MenuPlan, al montar un .env.local o un worktree, cuando un script no pueda leer una dirección op://, al dar de alta o rotar una clave, al guardar algo en una bóveda nueva, o si falla la service account, el token del llavero o el agente SSH. No para: dónde vive cada clave de cada servicio (ops/INVENTARIO.md) ni las contraseñas personales de Pablo.
---

# 1Password

## Qué es y dónde

- **Cuenta** de Pablo en `my.1password.eu` (plan Familias, en prueba desde el
  8 oct 2026). Cuatro bóvedas, y una quinta por crear (#299, #328):
  - **`HoMenu`**: las claves de MenuPlan, una ficha por servicio y un campo por
    variable (`op://HoMenu/Supabase/SUPABASE_DB_URL`). Cuando exista la de
    sesiones, solo lo de administración y lo de Actions: solo Pablo.
  - **`HoMenu-sesiones`** (**pendiente de crear**, 9 oct 2026): lo que necesita
    una sesión para trabajar, y nada de administración. La única que leerá la
    service account de las sesiones. Qué va en cada una, abajo.
  - **`Panel HoMenu`**: las del servidor del panel (skills `hetzner` y
    `tailscale`).
  - **`Private`**: lo personal de Pablo. Ninguna sesión escribe aquí, y la
    service account no la ve.
  - **`Shared`** («Compartida»): de la familia, no del proyecto.
- **`.env.local` guarda direcciones, no claves.** La plantilla es
  `ops/env.1password`. `npm run tarea` copia el `.env.local` de la carpeta
  principal, así que cada worktree hereda las direcciones.
- **Quién las resuelve**: `scripts/lib/env.mjs` (`leerEnv`, `cargarEnv`) en los
  scripts y `vite.config.js` en la app. En los tests no se resuelven: corren
  sin claves, como en el CI.
- **Dos caminos con `op`, y no se mezclan**: con la service account (solo
  lectura de `HoMenu`, sin ventanas) para leer; sin ella, por la app de
  escritorio (pide aprobación), para escribir o tocar otras bóvedas. Con
  `MENUPLAN_OP_PABLO=1` en el entorno, `env.mjs` y `npm run op` van por el
  segundo: es como Pablo lee `HoMenu` cuando la service account sea la de
  sesiones. Una sesión puede ponerla, pero la ventana solo la aprueba Pablo.
- **Plan B entre bóvedas** (`env.mjs`, `enOtraBoveda`): una dirección de
  `HoMenu-sesiones` que no se puede leer se busca en `HoMenu` y al revés, con
  la línea `env-boveda clave: X de: A a: B motivo: respaldo`. Vite, además,
  arranca sin las que no puede leer (`motivo: sin-acceso`, quedan vacías).
- **Agente SSH de 1Password**: activo desde el 8 oct 2026. Guarda la llave
  `HoMenu - Hetzner Panel` (Ed25519, en `Private`); cada conexión pide
  aprobar. Sirve a la `ssh` de Windows, no a la de Git for Windows.
- **CLI** `op`: `winget install AgileBits.1Password.CLI`.

## Claves y accesos

- Los nombres, para qué sirve cada clave y quién es el dueño: `ops/INVENTARIO.md`,
  que es la tabla que manda. Las direcciones: `ops/env.1password`. No se
  repiten aquí.
- **Service account «MenuPlan PC Pablo»**: solo lectura sobre `HoMenu`. Su token
  vive en el llavero de Windows (Administrador de credenciales → credenciales
  web, recurso `MenuPlan 1Password`, usuario `service-account`). `env.mjs` lo
  coge de ahí para que `op` no pida la huella en cada comando.
- **Ficha `Postgres del panel`** (bóveda `Panel HoMenu`, id
  `c64ol4a3oewjeue3szoafrrr6q`): servidor, puerto, base, usuario y contraseña
  del Postgres del panel.
- **Ficha «Copias de la base»** (bóveda `Panel HoMenu`, la misma id; #247): la
  clave **privada** de `age` que abre todas las copias cifradas de la base
  (una sola vez, en el campo de contraseña con la etiqueta `clave_privada_age`; la
  pública, en `clave_publica` y en
  `ops/copias/destinatarios.txt`). En `Panel HoMenu` y no en `HoMenu` a
  propósito: la service account lee `HoMenu` sin preguntar, y esta se lee solo
  aprobando en la app. No va nunca al servidor ni a `.env.local`. La crea
  `node scripts/copias-clave.mjs --si` (Pablo, con `!`): la genera, la pasa a
  `op` por stdin, la relee a ciegas y solo entonces escribe la pública. **Si se
  pierde, ninguna copia sirve**: segunda copia fuera de 1Password, en #273.
  **Pendiente de crear** (9 oct 2026).
- **Cuenta de Hetzner y Tailscale**: fichas de Pablo en `Private`, con los
  códigos de recuperación del 2FA dentro de la propia ficha.

## Operaciones habituales

| Qué | Comando | Debe salir |
|---|---|---|
| Worktree nuevo sin `.env.local` | `cp ops/env.1password .env.local` | un `.env.local` con líneas `NOMBRE=op://…` |
| Leer una clave desde un script nuevo | `leerEnv("NOMBRE")` de `scripts/lib/env.mjs`; nunca un `readFileSync(".env.local")` propio | el valor en memoria; en pantalla nada |
| Lanzar algo que lee `process.env` (`node --env-file`, `vercel`…) | `npm run op -- run --env-file=.env.local -- <comando>` | el comando corre; si imprime una clave, sale `<concealed by 1Password>` |
| Comprobar que una clave está bien | comparar a ciegas (`valor === otro`) e imprimir solo el sí o el no | `COINCIDEN` o `NO COINCIDEN`, nunca el valor |
| Listar las bóvedas | `env -u OP_SERVICE_ACCOUNT_TOKEN op vault list` | las cuatro bóvedas con su id (ventana de aprobación la primera vez) |
| Dar de alta una clave en `HoMenu` (OK) | un script lee el valor de donde esté y pasa la ficha en JSON por stdin a `op item create --vault HoMenu -`; después, la línea en `ops/env.1password` | `op` imprime el título y la bóveda de la ficha creada |
| Guardar algo en otra bóveda, p. ej. `Panel HoMenu` (OK) | como la anterior, **sin** el token de la service account y con el **id** de la bóveda: `env -u OP_SERVICE_ACCOUNT_TOKEN op item create --vault <id> --format json -` | ficha creada; ventana de 1Password a aprobar |
| Rotar una clave (OK) | se genera la nueva en el servicio, se cambia en la ficha y, si el despliegue la usa, en Vercel | las direcciones no cambian: nadie toca su `.env.local` |
| Token nuevo de la service account (OK; Pablo, en PowerShell) | `$env:MENUPLAN_OP_PABLO=1; npm run --silent op -- service-account create "<nombre>" --vault <bóveda>:read_items --raw \| node scripts/llavero-op.mjs` | `llavero … resultado: COINCIDEN`; si no parece un token (`ops_…`), no guarda nada. La vieja se anula en 1Password.com → Developer → Service accounts |
| ¿La service account del llavero lee `HoMenu`? (la de sesiones, no) | `npm run --silent op -- item get Supabase --vault HoMenu --format json > $null; $LASTEXITCODE` | distinto de 0. Con 0, la del llavero aún es la vieja |
| Crear la clave de las copias (OK; Pablo, `!`) | `node scripts/copias-clave.mjs` (ensayo) y luego `--si`; necesita `age-keygen` (`winget install FiloSottile.age`) | `Ficha «Copias de la base» creada en Panel HoMenu y comprobada (COINCIDEN)` y la pública añadida a `destinatarios.txt`; si la ficha ya existe, se niega |
| ¿`destinatarios.txt` es la pública de la ficha? (sin leer la privada; **requisito antes de subirlo al servidor**) | `node scripts/copias-clave.mjs --comprobar` | `COINCIDEN`; si sale `NO COINCIDEN`, no se sube: las copias se cifrarían para otra clave |
| Ver qué llaves sirve el agente SSH | `C:\Windows\System32\OpenSSH\ssh-add.exe -l` | una línea por llave, con su título, p. ej. `HoMenu - Hetzner Panel (ED25519)` |

El valor de una clave **nunca va escrito en un comando**: quedaría en la
conversación. Se pasa por tubería (stdin) entre dos procesos.

### Bóveda de sesiones (#299, #328): pasos de Pablo, en orden

Nada pasa por el chat: se hace en la app de escritorio de 1Password y en
PowerShell, en la carpeta principal al día con `origin/staging` (con el PR de
#299 ya fusionado: trae el plan B).

1. App → **Nueva bóveda** → `HoMenu-sesiones` (con guion, sin espacios).
2. **Mover** (clic derecho en la ficha → Mover) de `HoMenu` a
   `HoMenu-sesiones`: `Anthropic`, `Vercel AI Gateway`, `fal`,
   `Gemini AI Studio`, `Groq`, `Tripo3D` y `Supabase lectura`.
3. `Supabase`: **Duplicar**, mover la copia a `HoMenu-sesiones`, que se llame
   `Supabase`, y borrar en la copia `SUPABASE_DB_URL` y `SUPABASE_ACCESS_TOKEN`
   (quedan las dos `VITE_`, que son públicas). La de `HoMenu` no se toca.
4. Se quedan en `HoMenu`: `Supabase` (URL de administrador y token de
   gestión), `Vercel Blob` (escribe en producción), `Telegram` (el bot de
   verdad), `Gmail SMTP`, `Anthropic Evals` y lo de Actions (`Canario Vigía`,
   `Telegram Avisos`, `Vercel Vigía`, `GitHub App dependabot-merge` y las
   fichas de `mover-secretos`, skill `github`).
5. La service account de sesiones, directa al llavero: fila «Token nuevo» de
   arriba con `"MenuPlan sesiones"` y `--vault HoMenu-sesiones:read_items`.
   Sustituye en el llavero a «MenuPlan PC Pablo».
6. Comprobar: `npm run consulta -- "select 1"` lee, y la fila «¿La service
   account del llavero lee `HoMenu`?» sale distinto de 0.
7. Solo con el 6 bien y un día de sesiones sin `sin-acceso` inesperados:
   anular «MenuPlan PC Pablo» en 1Password.com → Developer → Service accounts.

Desde el paso 5 una sesión **no** lee la URL de administrador: no aplica
migraciones ni lanza `verificar-estado`, `bot-cron`, `bot-coste`,
`bot-medidas`, `bot-panel`, `lola-feedback`, `router-feedback`, `run-seed` ni
los `ensayo-*` (leen `SUPABASE_DB_URL`), ni `telegram-webhook`,
`telegram-perfil` o los de Blob. Los lanza Pablo con `$env:MENUPLAN_OP_PABLO=1`
delante, o los que solo leen pasan a la conexión de lectura (encargo de `datos`).

## Lo que falló y por qué

- **2026-10-08 · «"Panel HoMenu" isn't a vault in this account» al crear una
  ficha por script.** Causa: Node con `shell: true` concatena los argumentos y
  el espacio del nombre parte la bóveda en dos. Arreglo: pasar el **id** de la
  bóveda, no el nombre (`op vault list` lo da).
- **2026-10-08 · al conectar por SSH sale una ventana de «Git for Windows» que
  pide algo, y la conexión se queda colgada.** Causa: la `ssh` que trae Git Bash
  no habla con el agente de 1Password (que escucha en la tubería de Windows).
  Arreglo: usar siempre `C:\Windows\System32\OpenSSH\ssh.exe` (en PowerShell,
  `ssh` ya es esa). La devbox del trabajo de Pablo no se ve afectada: usa su
  propia llave con `IdentityFile` e `IdentitiesOnly` en `~/.ssh/config`.
- **2026-10-08 · 1Password no ofreció guardar la contraseña de Hetzner al crear
  la cuenta.** Causa: no determinada; la extensión estaba instalada y mandando
  sobre el gestor de Chrome, así que lo más probable es que estuviera bloqueada
  en ese momento. Arreglo: la ficha se creó a mano en `Private`
  (Nuevo elemento → Inicio de sesión). Si vuelve a pasar, comprobar primero que
  el icono de la extensión está desbloqueado.
- **2026-10-08 · no se encuentra «Importar» en la web de 1Password.** Causa:
  el menú de la cuenta de la web nueva solo trae Administrar cuentas,
  Configurar otro dispositivo, Ajustes y Bloquear. Arreglo: sin resolver; probar
  el paso de importar de «Comenzar aquí» o la app de escritorio.
- **2026-10-08 · cada comando tardaba ~10 s y el build cayó con «authorization
  timeout».** Causa: sin service account, `op` pasa por la app de escritorio,
  que pide aprobar en cada proceso nuevo, y cada comando de una sesión es un
  proceso nuevo. Arreglo: service account de solo lectura con el token en el
  llavero. Ahora 16 claves tardan unos 9 s y no piden nada.
- **2026-10-08 · «connecting to desktop app timed out».** Causa: la app de
  1Password estaba cerrada o bloqueada mientras se creaba la service account.
  Arreglo: abrirla y desbloquearla. La creación sí necesita la app, porque la
  service account no puede crear nada.
- **2026-10-09 · «a vault query must be provided when this command is called by
  a service account» al leer fichas por su nombre.** Causa: con la service
  account, `op item get` pide `--vault`; con la app de escritorio, no.
  Arreglo: todo script pasa `--vault` (`clave-consulta-lectura.mjs`, el
  `mover-secretos` de #299).
- **2026-10-08 · `op` no se encontraba tras instalarlo.** Causa: el PATH nuevo
  solo llega a los terminales abiertos después de instalar. Arreglo: reiniciar
  el terminal.

## Qué requiere el OK de Pablo

- Crear, rotar, editar o borrar una clave, una ficha, una bóveda o una service
  account.
- Cambiar los permisos de una bóveda o invitar a alguien (Álvaro, el servidor).
- Leer la clave privada de las copias (solo la lee `copias-ensayo.mjs`, que lanza
  Pablo) o hacer una segunda copia de ella.
- Guardar o mover códigos de recuperación del 2FA: los pega él, nunca pasan por
  la conversación.
- Leer con la service account no lo requiere.
- El token nunca va a un fichero ni a una variable de entorno permanente
  (`setx`), y ninguna sesión escribe en la bóveda `Private` de Pablo.

## Coste y límites

Plan Familias en prueba desde el 8 oct 2026: hay que decidir antes de que
acabe si se paga. Las service accounts tienen su propio límite de peticiones
por hora; no se ha tocado con 16 claves. Una service account solo lee las
bóvedas que se le dieron al crearla: para dar otra hay que crear una nueva.

## Fuentes y comprobación

- https://developer.1password.com/docs/cli/
- https://developer.1password.com/docs/service-accounts/
- https://developer.1password.com/docs/ssh/agent/

Comprobado el 2026-10-08: lectura con service account, creación y lectura de una ficha en `Panel HoMenu` y agente SSH con una conexión real. Sin probar: caducidad del token ni el límite de peticiones. Sin probar (9 oct 2026): `copias-clave.mjs --si` y `--comprobar` contra 1Password, y la ficha «Copias de la base», que aún no existe. Tampoco si `op` acepta la etiqueta `clave_privada_age` en el campo de contraseña: si no, la relectura del script no coincide y no escribe la pública.

Comprobado el 2026-10-09: en #299, el plan B de `env.mjs` contra 1Password de verdad (una dirección de `HoMenu-sesiones`, que aún no existe, se leyó de `HoMenu` con la línea `respaldo`); en tests, el modo tolerante, `MENUPLAN_OP_PABLO` y `llavero-op.mjs` (sin guardar nada en el llavero). Sin probar: la bóveda `HoMenu-sesiones`, la service account nueva, `llavero-op.mjs` con un token real y si `npm run op` pasa bien la salida de `--raw` por la tubería de PowerShell.
