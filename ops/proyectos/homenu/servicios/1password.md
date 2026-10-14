# 1Password en HoMenu (ficha de proyecto)

Los datos de HoMenu de la skill `1password` (`.claude/skills/1password/SKILL.md`, el método de la casa): cuenta, bóvedas, service accounts, fichas, scripts del repo y lo que ha fallado aquí. Se piden con `--proyecto homenu` (`npm run skills-encargo -- … --proyecto homenu`). Lado: vertical (`ops/lados-ficheros.json`). Nunca valores de claves: solo nombres y dónde viven; la tabla que manda es `ops/INVENTARIO.md`.

## Qué hay

- **Cuenta** de Pablo en `my.1password.eu` (plan Familias, en prueba; desde cuándo, en «Fechas» de abajo). Cinco bóvedas (#328; `HoMenu-sesiones`, creada, ver «Comprobado»):
  - **`HoMenu`**: todas las claves de MenuPlan, también las de producción, una ficha por servicio y un campo por variable (`op://HoMenu/Supabase/SUPABASE_DB_URL`). Solo Pablo.
  - **`HoMenu-sesiones`**: la copia de lo que leen las sesiones (desarrollo, IA, la URL de solo lectura de la base), con los mismos títulos y campos; nada de producción. Qué va a cada una: `ops/INVENTARIO.md` y la lista `COPIAR` de `scripts/boveda-sesiones.mjs`.
  - **`Panel HoMenu`**: las del servidor del panel (skills `hetzner` y `tailscale`).
  - **`Private`**: lo personal de Pablo. Ninguna sesión escribe aquí, y la service account no la ve.
  - **`Shared`** («Compartida»): de la familia, no del proyecto.
- **`.env.local` guarda direcciones, no claves.** La plantilla es `ops/env.1password`. `npm run tarea` copia el `.env.local` de la carpeta principal, así que cada worktree hereda las direcciones.
- **Quién las resuelve**: `scripts/lib/env.mjs` (`leerEnv`, `cargarEnv`) en los scripts y `vite.config.js` en la app. En los tests no se resuelven: corren sin claves, como en el CI.
- **Dos caminos con `op`, y no se mezclan**: con la service account (solo lectura, sin ventanas) para leer; sin ella, por la app de escritorio (pide aprobación a Pablo), para escribir o leer lo que la cuenta no ve. En los scripts, `MENUPLAN_OP_PABLO=1` hace que `env.mjs` y `npm run op` vayan por la app. **Sin token y sin esa variable, `env.mjs` falla cerrado** (#328): no cae solo a la app.
- **La guardia** niega a las sesiones `MENUPLAN_OP_PABLO`, tocar `OP_SERVICE_ACCOUNT_TOKEN` (`env -u`, `unset`…) y cualquier dirección `op://HoMenu/` en una orden (#328). Pablo lo lanza con `!`, que no pasa por ella.
- **Plan B entre bóvedas** (`env.mjs`, `enOtraBoveda`): una dirección de `HoMenu-sesiones` que no se lee se busca en `HoMenu` y al revés, con la línea `env-boveda clave: X de: A a: B motivo: respaldo`; Vite arranca sin las que no puede leer (`motivo: sin-acceso`, vacías). Un `.env.local` viejo sigue sirviendo tras cambiar el token.
- **Agente SSH de 1Password**: activo (alta en «Fechas»). Guarda la llave `HoMenu - Hetzner Panel` (Ed25519, en `Private`); cada conexión pide aprobar **en la ventana de 1Password y con Pablo delante**: si nadie la contesta en unos segundos, la `ssh` falla con «communication with agent failed» (ver «Lo que falló»). Sirve a la `ssh` de Windows, no a la de Git for Windows.

## Claves y accesos

- Los nombres, para qué sirve cada clave y quién es el dueño: `ops/INVENTARIO.md`, que es la tabla que manda. Las direcciones: `ops/env.1password`.
- **El token del llavero** de Windows (Administrador de credenciales → credenciales web, recurso `MenuPlan 1Password`, usuario `service-account`): `env.mjs` lo coge de ahí para que `op` no pida la huella en cada comando. Un solo token: el de las sesiones. Cualquier proceso del PC puede leerlo. Lo guarda `scripts/llavero-op.mjs` por stdin, con un solo `Add` (sustituye en sitio: el llavero no se queda vacío) y lo relee a ciegas.
- **Service account «MenuPlan PC Pablo»**: lee toda `HoMenu`, URL de administrador incluida. Fue la del llavero hasta el cambio de #328; anularla en 1Password.com es de Pablo (sin comprobar).
- **Service account «MenuPlan sesiones»** (#328, creada; es la del llavero): solo lectura de `HoMenu-sesiones`, donde vive también la clave de la App de GitHub (#329, skill `github`); no se le da lectura de `HoMenu`. Sustituye a la anterior en el llavero.
- **Ficha `Postgres del panel`** (bóveda `Panel HoMenu`, id `c64ol4a3oewjeue3szoafrrr6q`): servidor, puerto, base, usuario y contraseña del Postgres del panel.
- **Ficha «Copias de la base»** (bóveda `Panel HoMenu`, la misma id; #247): la clave **privada** de `age` que abre todas las copias cifradas de la base (una sola vez, en el campo de contraseña con la etiqueta `clave_privada_age`; la pública, en `clave_publica` y en `ops/copias/destinatarios.txt`). En `Panel HoMenu` y no en `HoMenu` a propósito: la service account lee `HoMenu` sin preguntar, y esta se lee solo aprobando en la app. No va nunca al servidor ni a `.env.local`. La crea `node scripts/copias-clave.mjs --si` (Pablo, con `!`): la genera, la pasa a `op` por stdin, la relee a ciegas y solo entonces escribe la pública. **Si se pierde, ninguna copia sirve**: segunda copia fuera de 1Password, en #273. **Pendiente de crear** (desde cuándo, en «Fechas»).
- **Cuenta de Hetzner y Tailscale**: fichas de Pablo en `Private`, con los códigos de recuperación del 2FA dentro de la propia ficha.

## Operaciones del proyecto

| Qué | Comando | Debe salir |
|---|---|---|
| Worktree nuevo sin `.env.local` | `cp ops/env.1password .env.local` | un `.env.local` con líneas `NOMBRE=op://…` |
| Listar las bóvedas (Pablo, `!`) | `MENUPLAN_OP_PABLO=1 npm run op -- vault list` | todas las bóvedas con su id (ventana de aprobación la primera vez) |
| Dar de alta una clave (OK; de punta a punta: skill `alta-de-secreto`) | primero, a qué bóveda: si da acceso a producción (URL de administrador, bots o tokens de producción, Vercel con producción, claves de Apps), solo a `HoMenu` y no a `env.1password` (comentada, si acaso). Si es de desarrollo, a `HoMenu` y a `HoMenu-sesiones`: un script la pasa en JSON por stdin a `op item create --vault HoMenu -`, se añade a `COPIAR` y a `ops/env.1password` con `op://HoMenu-sesiones/…`, y `node scripts/boveda-sesiones.mjs --si` | ficha creada; `npx vitest run scripts/boveda-sesiones.test.js` en verde |
| Pasar una clave a otro programa por nombre de ficha (Pablo, PowerShell aparte) | `node scripts/op.mjs item get "<Ficha>" --vault HoMenu --fields label=<CAMPO> --reveal \| <programa que lee stdin>` | el programa la recibe; en pantalla, nada. Vale con fichas cuyo nombre no cabe en `op://` |
| Copiar a `HoMenu-sesiones` (OK; Pablo, `!`) | `node scripts/boveda-sesiones.mjs` (ensayo) y `--si` | una línea por ficha: `copiada … COINCIDEN` o `salto … ya existe`; ningún valor |
| ¿La cuenta de sesiones lee solo lo suyo? | `node scripts/boveda-sesiones.mjs --comprobar` | todo `BIEN`: ve solo `HoMenu-sesiones`, la URL de administrador **no** se lee y las de sesiones sí. Con «MenuPlan PC Pablo» salen 12 `MAL` (día en «Fechas») |
| Guardar algo en otra bóveda, p. ej. `Panel HoMenu` (OK; Pablo, `!`) | como la anterior, **sin** el token de la service account y con el **id** de la bóveda: `MENUPLAN_OP_PABLO=1 npm run op -- item create --vault <id> --format json -` | ficha creada; ventana de 1Password a aprobar |
| Cambiar el valor de una ficha (OK). Rotar de punta a punta es de `alta-de-secreto` | solo el paso de 1Password: se cambia el campo de la ficha (en las dos bóvedas si está en `COPIAR`). Crear la nueva en el servicio, ponerla en cada destino y revocar la vieja: skill `alta-de-secreto` | las direcciones no cambian: nadie toca su `.env.local` |
| Token nuevo de la service account (OK; Pablo, `!`) | `op service-account create "MenuPlan sesiones" --vault HoMenu-sesiones:read_items --raw \| node scripts/llavero-op.mjs` | `llavero … resultado: COINCIDEN`; si no parece un token (`ops_…`), no guarda nada. La vieja se anula en 1Password.com → Developer → Service accounts |
| Crear la clave de las copias (OK; Pablo, `!`) | `node scripts/copias-clave.mjs` (ensayo) y luego `--si`; necesita `age-keygen` (`winget install FiloSottile.age`) | `Ficha «Copias de la base» creada en Panel HoMenu y comprobada (COINCIDEN)` y la pública añadida a `destinatarios.txt`; si la ficha ya existe, se niega |
| ¿`destinatarios.txt` es la pública de la ficha? (sin leer la privada; **requisito antes de subirlo al servidor**) | `node scripts/copias-clave.mjs --comprobar` | `COINCIDEN`; si sale `NO COINCIDEN`, no se sube: las copias se cifrarían para otra clave |
| Ver qué llaves sirve el agente SSH | `C:\Windows\System32\OpenSSH\ssh-add.exe -l` | una línea por llave, con su título, p. ej. `HoMenu - Hetzner Panel (ED25519)` |
| La `ssh` falla con «communication with agent failed» o «Permission denied (publickey)»: ¿por qué? | `grep -a "ssh authorization prompt" "$LOCALAPPDATA"/1Password/logs/1Password_r*.log` (Git Bash; las horas del log son UTC) | una línea `ssh authorization prompt timed out` a la hora del fallo = nadie aprobó la ventana; no es un fallo del agente |

### Bóveda de sesiones (#328): pasos de Pablo, en orden

Los pasos de Pablo, en orden (qué pasa por la app de escritorio y qué no, y qué hace la guardia), están en `.claude/skills/1password/referencias/boveda-sesiones.md`: ábrelo antes de crear la bóveda o la service account.

El detalle de la ssh que falla sin que nadie apruebe la ventana, en `.claude/skills/1password/referencias/ssh-sin-aprobar.md`.

## Lo que falló y por qué

- **2026-10-10 · «Too many requests» de 1Password a las 19:10 (límite de lecturas por hora de la cuenta de servicio).**
  Causa: cada arranque de cada sesión leía el `.pem` de la App (dos lecturas si fallaba la primera bóveda), y un test
  llamaba a `op` de verdad en cada ejecución; qué lo agotó exactamente no se sabe, y el límite exacto tampoco. El arranque
  tardaba ~14 s. Arreglo: el token de la App se guarda y se reutiliza entre sesiones hasta que falten 15 minutos
  (`scripts/lib/cacheTokenSesion.mjs`, detalle en la skill `github`, `.claude/skills/github/referencias/app-sesiones.md`); con el límite agotado
  sale el motivo `limite-de-1password`, sin probar otra bóveda, y se usa el token guardado si no caducó; el test ya no
  llama a `op`. Tests en `scripts/tokenSesion.test.js`, vistos fallar. Antes: 1 lectura del `.pem` por sesión; después:
  1 por hora entre todas.
  Seguimiento (11 oct, #556): `service-account ratelimit` mostró el cupo **de la cuenta** agotado (1000 por hora) con el
  token de la sesión a 0: lo gastan otras sesiones. Cada llamada a `op inject` deja ya una línea en
  `~/.menuplan/op-lecturas.jsonl` (`script`, `claves`, `reintento`; sin valores) para sumar por script, y el error de
  «Too many requests» manda a `npm run op -- service-account ratelimit` para ver cuándo se reinicia. Sin cerrar:
  quién gasta más (hay que dejar correr el registro) y reutilizar las claves leídas durante la hora.
- **2026-10-11 · la `ssh` al servidor falla con «communication with agent failed».**
  Causa: nadie contestó la ventana de aprobar de 1Password (log: `ssh authorization
  prompt timed out`); no era el agente ni la llave. Arreglo: avisar a Pablo antes de
  conectar y esperar su sí, sin reintentar en bucle. Detalle en
  `.claude/skills/1password/referencias/ssh-sin-aprobar.md`.
- **2026-10-09 · «a vault query must be provided when this command is called by
  a service account» al leer fichas por su nombre.** Causa: con la service
  account, `op item get` pide `--vault`; con la app, no. Arreglo: todo script
  pasa `--vault` (`clave-consulta-lectura.mjs`, `boveda-sesiones.mjs`).
- **2026-10-08 · «"Panel HoMenu" isn't a vault in this account» al crear una
  ficha por script.** Causa: Node con `shell: true` concatena los argumentos y
  el espacio del nombre parte la bóveda en dos. Arreglo: pasar el **id** de la
  bóveda, no el nombre (`op vault list` lo da).
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

## Coste y fechas

Plan Familias en prueba (desde cuándo, en «Fechas» de abajo): hay que decidir antes de que acabe si se paga.

Fechas que estaban repartidas por el cuerpo de la skill (#411): plan Familias en prueba desde el 8 oct 2026; agente SSH de 1Password activo desde el 8 oct 2026; al 9 oct 2026, `HoMenu-sesiones` y la ficha «Copias de la base» sin crear, y `--comprobar` con «MenuPlan PC Pablo» daba 12 `MAL`.

## Comprobado

Comprobado el 2026-10-08: lectura con service account, creación y lectura de una ficha en `Panel HoMenu` y agente SSH con una conexión real. Sin probar: caducidad del token ni el límite de peticiones. Sin probar (9 oct 2026): `copias-clave.mjs --si` y `--comprobar` contra 1Password, y la ficha «Copias de la base», que aún no existe. Tampoco si `op` acepta la etiqueta `clave_privada_age` en el campo de contraseña: si no, la relectura del script no coincide y no escribe la pública.

Comprobado el 2026-10-10: en #328, el inventario de `HoMenu` (16 fichas, solo títulos y campos); el ensayo de `boveda-sesiones.mjs` (lee los campos de `COPIAR` sin escribir); que `PasswordVault.Add` con el mismo recurso sustituye en sitio, y `llavero-op.mjs` contra un recurso de prueba (`COINCIDEN` dos veces, una sola entrada; borrado después); `--comprobar` con «MenuPlan PC Pablo» (12 `MAL`); y `bot-coste`, `bot-medidas`, `bot-panel` y `verificar-estado` con el usuario de lectura (este, igual que con `--admin` salvo los 2 testigos de `cron`). En #299, el plan B contra 1Password de verdad. Comprobado el 2026-10-11: `--comprobar` con la cuenta de sesiones, todo `BIEN` (la bóveda y la cuenta existen; ve solo `HoMenu-sesiones`, la URL de administrador no se lee, la ficha de la App está dentro). Sin probar: `lola-feedback` y `router-feedback` con el de lectura (escriben ficheros del repo; misma consulta a `user_events` que `bot-panel`).
