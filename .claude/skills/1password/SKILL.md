---
name: 1password
description: Úsala al montar un .env.local o un worktree, cuando un script no pueda leer una dirección op://, para leer una clave desde un script (leerEnv), al guardar algo en una bóveda nueva, o si falla la service account, el token del llavero o el agente SSH. No para: dar de alta ni rotar una clave de punta a punta, ni una clave filtrada (alta-de-secreto); la clave de las copias cifradas (hetzner); dónde vive cada clave (ops/INVENTARIO.md) ni las contraseñas personales de Pablo.
metadata:
  tipo: herramienta
  dueno: gobierno
  comprobado: "2026-10-10"
---

# 1Password

## Qué es y dónde

- **Cuenta** de Pablo en `my.1password.eu` (plan Familias, en prueba desde el
  8 oct 2026). Cinco bóvedas (#328; `HoMenu-sesiones`, **pendiente de crear**
  el 9 oct 2026):
  - **`HoMenu`**: todas las claves de MenuPlan, también las de producción, una
    ficha por servicio y un campo por variable
    (`op://HoMenu/Supabase/SUPABASE_DB_URL`). Solo Pablo.
  - **`HoMenu-sesiones`**: la copia de lo que leen las sesiones (desarrollo, IA,
    la URL de solo lectura de la base), con los mismos títulos y campos; nada de
    producción. Qué va a cada una: `ops/INVENTARIO.md` y la lista `COPIAR` de
    `scripts/boveda-sesiones.mjs`.
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
  lectura, sin ventanas) para leer; sin ella, por la app de escritorio (pide
  aprobación a Pablo), para escribir o leer lo que la cuenta no ve. En los
  scripts, `MENUPLAN_OP_PABLO=1` hace que `env.mjs` y `npm run op` vayan por
  la app. **Sin token y sin esa variable, `env.mjs` falla cerrado** (#328): no
  cae solo a la app.
- **La guardia** niega a las sesiones `MENUPLAN_OP_PABLO`, tocar
  `OP_SERVICE_ACCOUNT_TOKEN` (`env -u`, `unset`…) y cualquier dirección
  `op://HoMenu/` en una orden (#328). Pablo lo lanza con `!`, que no pasa por ella.
- **Plan B entre bóvedas** (`env.mjs`, `enOtraBoveda`): una dirección de
  `HoMenu-sesiones` que no se lee se busca en `HoMenu` y al revés, con la
  línea `env-boveda clave: X de: A a: B motivo: respaldo`; Vite arranca sin las
  que no puede leer (`motivo: sin-acceso`, vacías). Un `.env.local` viejo
  sigue sirviendo tras cambiar el token.
- **Agente SSH de 1Password**: activo desde el 8 oct 2026. Guarda la llave
  `HoMenu - Hetzner Panel` (Ed25519, en `Private`); cada conexión pide
  aprobar. Sirve a la `ssh` de Windows, no a la de Git for Windows.
- **CLI** `op`: `winget install AgileBits.1Password.CLI`.

## Claves y accesos

- Los nombres, para qué sirve cada clave y quién es el dueño: `ops/INVENTARIO.md`,
  que es la tabla que manda. Las direcciones: `ops/env.1password`. No se
  repiten aquí.
- **El token del llavero** de Windows (Administrador de credenciales →
  credenciales web, recurso `MenuPlan 1Password`, usuario `service-account`):
  `env.mjs` lo coge de ahí para que `op` no pida la huella en cada comando. Un
  solo token: el de las sesiones. Cualquier proceso del PC puede leerlo. Lo
  guarda `scripts/llavero-op.mjs` por stdin, con un solo `Add` (sustituye en
  sitio: el llavero nunca se queda vacío) y lo relee a ciegas.
- **Service account «MenuPlan PC Pablo»**: lee toda `HoMenu`, URL de
  administrador incluida. Es la del llavero hasta el cambio de #328; luego se
  anula.
- **Service account «MenuPlan sesiones»** (#328, **pendiente de crear**): solo
  lectura de `HoMenu-sesiones`. Sustituye a la anterior en el llavero.
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
| Listar las bóvedas (Pablo, `!`) | `MENUPLAN_OP_PABLO=1 npm run op -- vault list` | todas las bóvedas con su id (ventana de aprobación la primera vez) |
| Dar de alta una clave (OK; de punta a punta: skill `alta-de-secreto`) | primero, a qué bóveda: si da acceso a producción (URL de administrador, bots o tokens de producción, Vercel con producción, claves de Apps), solo a `HoMenu` y nunca a `env.1password` (comentada, si acaso). Si es de desarrollo, a `HoMenu` y a `HoMenu-sesiones`: un script la pasa en JSON por stdin a `op item create --vault HoMenu -`, se añade a `COPIAR` y a `ops/env.1password` con `op://HoMenu-sesiones/…`, y `node scripts/boveda-sesiones.mjs --si` | ficha creada; `npx vitest run scripts/boveda-sesiones.test.js` en verde |
| Pasar una clave a otro programa por nombre de ficha (Pablo, PowerShell aparte) | `node scripts/op.mjs item get "<Ficha>" --vault HoMenu --fields label=<CAMPO> --reveal \| <programa que lee stdin>` | el programa la recibe; en pantalla, nada. Vale con fichas cuyo nombre no cabe en `op://` |
| Copiar a `HoMenu-sesiones` (OK; Pablo, `!`) | `node scripts/boveda-sesiones.mjs` (ensayo) y `--si` | una línea por ficha: `copiada … COINCIDEN` o `salto … ya existe`; ningún valor |
| ¿La cuenta de sesiones lee solo lo suyo? | `node scripts/boveda-sesiones.mjs --comprobar` | todo `BIEN`: ve solo `HoMenu-sesiones`, la URL de administrador **no** se lee y las de sesiones sí. El 9 oct 2026, con «MenuPlan PC Pablo»: 12 `MAL` |
| Guardar algo en otra bóveda, p. ej. `Panel HoMenu` (OK; Pablo, `!`) | como la anterior, **sin** el token de la service account y con el **id** de la bóveda: `MENUPLAN_OP_PABLO=1 npm run op -- item create --vault <id> --format json -` | ficha creada; ventana de 1Password a aprobar |
| Rotar una clave (OK) | se genera la nueva en el servicio, se cambia en la ficha (en las dos bóvedas si está en `COPIAR`) y, si el despliegue la usa, en Vercel | las direcciones no cambian: nadie toca su `.env.local` |
| Token nuevo de la service account (OK; Pablo, `!`) | `op service-account create "MenuPlan sesiones" --vault HoMenu-sesiones:read_items --raw \| node scripts/llavero-op.mjs` | `llavero … resultado: COINCIDEN`; si no parece un token (`ops_…`), no guarda nada. La vieja se anula en 1Password.com → Developer → Service accounts |
| Crear la clave de las copias (OK; Pablo, `!`) | `node scripts/copias-clave.mjs` (ensayo) y luego `--si`; necesita `age-keygen` (`winget install FiloSottile.age`) | `Ficha «Copias de la base» creada en Panel HoMenu y comprobada (COINCIDEN)` y la pública añadida a `destinatarios.txt`; si la ficha ya existe, se niega |
| ¿`destinatarios.txt` es la pública de la ficha? (sin leer la privada; **requisito antes de subirlo al servidor**) | `node scripts/copias-clave.mjs --comprobar` | `COINCIDEN`; si sale `NO COINCIDEN`, no se sube: las copias se cifrarían para otra clave |
| Ver qué llaves sirve el agente SSH | `C:\Windows\System32\OpenSSH\ssh-add.exe -l` | una línea por llave, con su título, p. ej. `HoMenu - Hetzner Panel (ED25519)` |

El valor de una clave **nunca va escrito en un comando**: quedaría en la
conversación. Se pasa por tubería (stdin) entre dos procesos.

### Bóveda de sesiones (#328): pasos de Pablo, en orden

**Lo que pasa por la app de escritorio** (pasos 2 y 5) **se lanza desde una
PowerShell aparte, fuera de Claude Code**, con la integración de la CLI
encendida solo mientras dura (App → Ajustes → Desarrollador → «Integrar con
1Password CLI»). Un `!` dentro de Claude Code cuelga del mismo proceso que el
Bash de las sesiones y podría compartir la aprobación. Las sesiones no pueden
lanzar `op` ni `opPorLaApp`: la guardia lo niega. Una ventana de aprobación que
no has lanzado tú: no la apruebes.

1. App de 1Password → **Nueva bóveda** → `HoMenu-sesiones` (con guion).
2. PowerShell aparte, en `C:\dev\MenuPlan-boveda-sesiones`: `node scripts/boveda-sesiones.mjs`
   (ensayo, no abre la app) y `$env:MENUPLAN_OP_PABLO = "1"; node scripts/boveda-sesiones.mjs --si`:
   8 fichas, una línea `COINCIDEN` cada una.
3. **Mover** (no copiar) la clave de la App de E1 (#327) a `HoMenu-sesiones`,
   Documento `GitHub App homenu-sesiones`.
4. Fusionar el PR de #328 y poner al día la carpeta principal:
   `git fetch origin; git merge --ff-only origin/staging`.
5. PowerShell aparte, en `C:\dev\MenuPlan`:
   `op service-account create "MenuPlan sesiones" --vault HoMenu-sesiones:read_items --raw | node scripts/llavero-op.mjs` → `COINCIDEN`.
6. `node scripts/boveda-sesiones.mjs --comprobar` → todo `BIEN`.
7. En la misma sentada, en 1Password.com → Developer → Service accounts: anular «MenuPlan PC Pablo».
8. **Los `.env.local` viejos no se tocan**: el plan B resuelve sus direcciones
   desde `HoMenu-sesiones` (línea `env-boveda … respaldo`); las carpetas nuevas
   salen con la plantilla nueva (`npm run tarea`), sin perder puerto ni flags.
9. **Apagar «Integrar con 1Password CLI»** al terminar, y encenderla solo
   mientras Pablo use `MENUPLAN_OP_PABLO`. Encendida, una sesión podría pedir
   ventanas iguales a las suyas: esa es la barrera real; la guardia es un
   filtro de buena fe.

Desde el paso 5 las sesiones no leen la URL de administrador:
`bot-coste`, `bot-medidas`, `bot-panel`, `lola-feedback`, `router-feedback` y
`verificar-estado` entran con `SUPABASE_DB_URL_LECTURA` (`verificar-estado` no
ve `cron`: con `--admin`, Pablo). Aplicar migraciones, `bot-cron`, `ensayo-*`,
`telegram-webhook`, `telegram-perfil` y los de Blob: Pablo con `MENUPLAN_OP_PABLO=1` hasta E5 (#331).

## Lo que falló y por qué

- **2026-10-09 · una dirección `op://` daba error con la ficha y el campo bien puestos.**
  Causa: el nombre de la ficha llevaba una tilde; la sintaxis de `op://` solo
  admite letras y cifras sin acento, espacios, `-`, `_` y `.` (lo demás, por id).
  Arreglo: leer esa ficha por nombre con `op item get` (fila de arriba) y crear
  las fichas nuevas sin tildes (skill `alta-de-secreto`).
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
  account, `op item get` pide `--vault`; con la app, no. Arreglo: todo script
  pasa `--vault` (`clave-consulta-lectura.mjs`, `boveda-sesiones.mjs`).
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
- https://developer.1password.com/docs/cli/secret-reference-syntax/
- https://developer.1password.com/docs/service-accounts/
- https://developer.1password.com/docs/ssh/agent/

Comprobado el 2026-10-08: lectura con service account, creación y lectura de una ficha en `Panel HoMenu` y agente SSH con una conexión real. Sin probar: caducidad del token ni el límite de peticiones. Sin probar (9 oct 2026): `copias-clave.mjs --si` y `--comprobar` contra 1Password, y la ficha «Copias de la base», que aún no existe. Tampoco si `op` acepta la etiqueta `clave_privada_age` en el campo de contraseña: si no, la relectura del script no coincide y no escribe la pública.

Comprobado el 2026-10-10: en #328, el inventario de `HoMenu` (16 fichas, solo títulos y campos); el ensayo de `boveda-sesiones.mjs` (lee los campos de `COPIAR` sin escribir); que `PasswordVault.Add` con el mismo recurso sustituye en sitio, y `llavero-op.mjs` contra un recurso de prueba (`COINCIDEN` dos veces, una sola entrada; borrado después); `--comprobar` con «MenuPlan PC Pablo» (12 `MAL`); y `bot-coste`, `bot-medidas`, `bot-panel` y `verificar-estado` con el usuario de lectura (este, igual que con `--admin` salvo los 2 testigos de `cron`). En #299, el plan B contra 1Password de verdad. Sin probar: `--si` (la bóveda no existe), `op service-account create` con `HoMenu-sesiones`, `--comprobar` con la cuenta nueva, y `lola-feedback` y `router-feedback` con el de lectura (escriben ficheros del repo; misma consulta a `user_events` que `bot-panel`).
