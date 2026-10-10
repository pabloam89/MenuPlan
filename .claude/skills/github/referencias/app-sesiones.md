# GitHub App «homenu-sesiones» (E1, #327; fondo #326)

La identidad de máquina de las sesiones: una GitHub App propia, instalada solo en
`pabloam89/MenuPlan`, cuyos tokens caducan a la hora y salen en los PR y commits
como `homenu-sesiones[bot]` y no como Pablo. Una App por actor: no se reutiliza
`homenu-dependabot-merge` (App ID 5250358), que fusiona en `staging` y vive en
otro environment.

Lo hace **Pablo**, en el navegador, con su cuenta (crear una App, generar su clave
y guardarla son secretos y ajustes de GitHub). Una sesión no hace ninguno de estos
pasos. Ningún valor pasa por la conversación ni por el repo.

Los comandos de este runbook son de **Git Bash** (en PowerShell 5.1,
`GH_TOKEN="$(…)" orden` no funciona).

## Cambio respecto a #327: sin «Workflows»

El encargo #327 pedía **Workflows: escritura**. Se quita tras la revisión de
`seguridad` (10 oct 2026): con Workflows en escritura, la App puede empujar a una
rama un workflow `on: push` que lea los secretos de repo, sin PR ni fusión. Los
cambios en `.github/workflows/` los empuja Pablo, no la App. (Nota para el
comentario del issue #327.)

## Prerrequisitos: DECISIONES PENDIENTES de Pablo (antes de crear la App)

Hoy el riesgo ya existe para **cualquiera con Contents en escritura** (Pablo, las
sesiones con su token, Álvaro). La App no lo empeora, pero tampoco es «sin acceso
a secretos» mientras (a) y (b) no estén hechos:

- **(a) Secretos de repo a environments con política de rama.** Hoy hay secretos a
  nivel de repo (`ANTHROPIC_API_KEY`, `OPS_DB_URL`, `IOS_DIST_P12_*`,
  `APPSTORE_API_KEY_P8_BASE64`): un workflow empujado a cualquier rama los lee. Va
  en la rama `ops/secretos-a-environments`, que lleva **otra sesión** (aquí solo
  se enlaza). Cambia permisos de lo que ya existe: es de Pablo.
- **(b) `ios-testflight.yml` y los tags `ios-*`.** Ese workflow corre al empujar un
  tag `ios-*` desde **cualquier commit** y expone el p12 y el p8. Hace falta un
  *ruleset* de tags `ios-*` con bypass solo para Pablo, y un environment `ios` con
  revisor que tenga que aprobar. Es de Pablo; no lo hace una sesión.

Sin comprobar a 10 oct 2026: que (a) y (b) estén hechos. Pablo decide si crea la
App antes o después de ellos.

## Antes de empezar

- La bóveda `HoMenu-sesiones` de 1Password tiene que existir (E2, #328; a 10 oct
  2026 estaba **pendiente de crear**). Si no existe, para aquí: **no dejes el
  `.pem` en `HoMenu`**; E2 dice «mover» la clave a `HoMenu-sesiones`, y eso es
  lo mismo: el `.pem` nace directamente en `HoMenu-sesiones`, no pasa por
  `HoMenu`. Nombres fijados por la rama de E2: bóveda `HoMenu-sesiones`, Documento
  `GitHub App homenu-sesiones`.
- La app de escritorio de 1Password abierta y desbloqueada.
- La carpeta Descargas **no** sincronizada con OneDrive (Explorador → clic derecho
  en Descargas → si pone «Liberar espacio» o tiene la nube, lo está). Si lo está,
  la Papelera y el historial de versiones de OneDrive guardarían copia del `.pem`:
  baja la clave a una carpeta local de `C:\dev\` o desactiva la sincronización.

## 1. Crear la App

GitHub → tu foto → **Settings** → abajo del todo **Developer settings** →
**GitHub Apps** → **New GitHub App**. Rellena solo esto:

| Campo | Valor |
|---|---|
| GitHub App name | `homenu-sesiones` (es único en todo GitHub; si está cogido, `homenu-sesiones-pablo`, y se corrige en `ops/INVENTARIO.md`) |
| Homepage URL | `https://github.com/pabloam89/MenuPlan` |
| Callback URL | vacío |
| Request user authorization (OAuth) during installation | **desmarcado** |
| Webhook → Active | **desmarcado** (sin webhook; no hay URL ni secreto) |
| Where can this GitHub App be installed? | **Only on this account** |

**Permissions → Repository permissions** (todo lo no nombrado, en *No access*):

| Permiso | Nivel |
|---|---|
| Contents | Read and write |
| Pull requests | Read and write |
| Issues | Read and write |
| Actions | Read-only |
| Checks | Read-only |
| Metadata | Read-only (GitHub lo pone solo) |
| **Workflows**, Administration, Secrets, Environments, Deployments | **No access** |

Sin permisos de cuenta ni de organización, y sin eventos suscritos. **Create
GitHub App**. En la página de la App, arriba, anota el **App ID** (un número; no
es secreto).

## 2. Instalarla solo en este repo

En la App → menú izquierdo **Install App** → **Install** junto a `pabloam89` →
**Only select repositories** → `MenuPlan` → **Install**. La dirección que queda
acaba en `/settings/installations/<número>`: ese es el **Installation ID** (tampoco
es secreto).

## 3. Generar la clave y guardarla sin que pase por el chat

En la App → **Private keys** → **Generate a private key**: el navegador baja un
`.pem` (a Descargas, si no está sincronizada; ver «Antes de empezar»). La clave
**no caduca**.

1. En la app de 1Password: **Nuevo elemento → Documento**, arrastra el `.pem`,
   título exacto `GitHub App homenu-sesiones`, bóveda `HoMenu-sesiones`. O, desde
   una terminal tuya y con la ruta real entre comillas dobles (sin el token de la
   cuenta de servicio, que no escribe):
   `env -u OP_SERVICE_ACCOUNT_TOKEN op document create "C:\Users\pablo\Downloads\<fichero>.pem" --title "GitHub App homenu-sesiones" --vault HoMenu-sesiones`
2. Borra el `.pem` de Descargas **y de la Papelera de reciclaje**. Debe quedar una
   sola copia: la del Documento.
3. Apunta los dos números en `.env.local` de la carpeta principal, en claro (no son
   secretos): `SESIONES_APP_ID=…` y `SESIONES_INSTALLATION_ID=…`. Son opcionales
   desde E3 (#329): el arranque usa el App ID 5260552 de `scripts/lib/tokenSesion.mjs` y
   pide el Installation ID a GitHub; solo valen si quieres fijarlos.

## 4. Comprobar

Se usa `node scripts/op.mjs` y no `npm run op --`: la cabecera que imprime npm
entraría en la tubería delante del PEM y lo estropearía. El token **solo se
captura con `$(…)`**: no se imprime en una sesión (quedaría en la transcripción
en disco). El script avisa por stderr si su salida es una terminal.

`GH_TOKEN="$(node scripts/op.mjs document get "GitHub App homenu-sesiones" --vault HoMenu-sesiones | node scripts/token-sesiones.mjs)" gh api repos/pabloam89/MenuPlan -q .full_name`

Debe salir `pabloam89/MenuPlan`. Con el mismo token (misma forma de pasarlo):

| Llamada | Debe salir |
|---|---|
| `gh api /installation/repositories -q '.repositories[].full_name'` | solo `pabloam89/MenuPlan` |
| `gh api repos/pabloam89/MenuPlan/actions/secrets` | error 403 (Secrets: ninguno) |
| `gh api repos/pabloam89/MenuPlan/environments` | error 403 (Environments: ninguno) |
| `gh api repos/pabloam89/MenuPlan/rulesets` | error 403 o 404 (Administration: ninguno) |

El propio script se niega a imprimir un token si GitHub le concede `administration`,
`secrets`, `environments`, `deployments` o `workflows`, o si no está limitado
exactamente a `MenuPlan`. Si da 200 en alguna de las tres últimas llamadas, corrige
los permisos de la App antes de seguir (E3 no empieza hasta entonces). Para la
guardia futura: el token solo debe capturarse con `$(…)`, y no imprimirse.

## Seguridad: caducidad, alcance, fuga y revocación

- **Caducidad: la del token no es la de la clave.** El JWT dura 10 min y el token
  de instalación 1 hora, y eso solo protege frente a **un token que se escapa**. El
  `.pem` **no caduca**. Según el diseño de E2, cualquier sesión que lea la bóveda
  `HoMenu-sesiones` puede sacar el `.pem` y tener acceso persistente (pedir tokens
  nuevos cuando quiera) hasta que alguien borre la clave. Rotación: **cada 90 días,
  como mucho** (skill `alta-de-secreto`); la fecha, en `ops/INVENTARIO.md`.
  **DECISIÓN PENDIENTE de Pablo: ¿se acepta que las sesiones puedan leer el `.pem`?**
  Alternativa si no: que el token lo pida un proceso fuera de las sesiones.
- **Alcance.** Solo `pabloam89/MenuPlan`, con los permisos de arriba y el token
  pedido con permisos explícitos. No puede cambiar protecciones, secretos ni
  environments, ni tocar `.github/workflows/`. `main` y `staging` no admiten push
  directo ni siquiera de administradores (skill `github`).
- **`staging` no es una frontera de seguridad.** Con Contents y PR en escritura el
  bot puede fusionar en `staging` (con `tests` en verde) scripts que los crons
  ejecutan con secretos (`OPS_DB_URL`, `ANTHROPIC_API_KEY`, `VERCEL_TOKEN`,
  `MERCADONA_DEPLOY_KEY`). E4 (#330) solo pondrá revisión de dueño de código en
  `.claude/**` y `.github/**`, **no en `scripts/`**. Hasta entonces, lo único que lo
  frena es que Pablo lea el PR; hay que decidir si `scripts/` entra en E4.
- **Si se filtra el `.pem` o el token (revocación completa), en este orden:**
  1. App → **Private keys** → **Delete** **todas** las claves que pudieran estar
     expuestas (tras una rotación conviven dos): no basta borrar «la filtrada».
  2. Los tokens ya emitidos viven hasta 1 hora. Para cortarlos ya: App →
     **Install App** → **Suspend** (o **Uninstall**) la instalación. Sin comprobar
     cuál de los dos botones corta tokens vivos al instante.
  3. Revisa lo que hizo `homenu-sesiones[bot]` desde la filtración: tags `ios-*`
     (`gh api repos/pabloam89/MenuPlan/git/matching-refs/tags/ios-`), ramas
     (`gh api repos/pabloam89/MenuPlan/branches`), PR y ejecuciones de Actions
     (`gh api repos/pabloam89/MenuPlan/actions/runs`).
  4. Si corrió algún workflow desde una rama o tag del bot, **rota los secretos de
     repo** (skill `alta-de-secreto`, paso «Rotar»).
  5. Si el PEM salió de una sesión, rota también la **cuenta de servicio de E2**
     (la que lee `HoMenu-sesiones`): esa sesión pudo leer más de una ficha.
  6. Genera una clave nueva, sustitúyela en el Documento (pasos 3.1 y 3.2) y
     reactiva la instalación.
- **Rotación normal.** Genera una **segunda** clave (la App admite varias),
  sustituye el Documento, comprueba el paso 4 y solo entonces borra la vieja.
- **Quitar la App** (lo decide Pablo): Uninstall en el repo, Delete GitHub App, el
  Documento a la papelera y la fila del inventario marcada «retirada».
- El token sale por la salida estándar del script y no se escribe en ningún
  fichero. No lo pegues en un comando ni en un issue; no se pone en `GH_TOKEN` de
  forma permanente (`setx`).

## Qué falta por confirmar

- Los nombres exactos de los botones de GitHub (Suspend/Uninstall, «Private keys»)
  salen de la documentación y no de una pantalla: la primera vez, ajusta este
  texto.
- El nombre del Documento y de la bóveda, de la rama `ops/328-boveda-sesiones`
  (PR #412, sin fusionar): si E2 los cambia, se cambian aquí y en el script.
- Que los permisos del cuerpo de la petición (`permissions`) los acepte GitHub tal
  cual con estos seis: visto el 10 oct 2026 con la App real (`token-sesion.mjs --comprobar`, #329).

## Cómo trabaja una sesión con la App (#329)

El arranque canjea la clave (`scripts/lib/tokenSesion.mjs`, sobre `token-sesiones.mjs`) por un token de 1 hora
en `CLAUDE_ENV_FILE`, que carga Bash: `GH_TOKEN`, un ayudante de `git push` y el autor `homenu-sesiones[bot]`.
En PowerShell, `node scripts/token-sesion.mjs -- <comando>`, que sirve también con el token caducado
(`-- gh …`, `-- git push`). Sin clave legible avisa y sigue como Pablo (a los 13 s); sus credenciales siguen en
el llavero y el manager de github.com hasta su `gh auth logout`.

## Lo que la guardia niega a una sesión (#447)

Sin esto, la sesión volvería a ser administradora en cuanto quitara el token y
`gh` y `git` tiraran de las credenciales de Pablo. La regla vive en
`.claude/hooks/credenciales.mjs` y se llama desde `guardia.mjs`, con su test en
`.claude/hooks/guardia.test.js`. Mira cada orden por separado (también dentro de
`bash -c`, un subshell, `&&`, `;` o una tubería) y no el texto de un commit, un
cuerpo de PR o un heredoc que las nombre. Niega:

| Qué | Ejemplos |
|---|---|
| Quitar o vaciar el token | `env -u GH_TOKEN`, `env -i`, `unset GH_TOKEN`, `GH_TOKEN=` vacío, `export -n`, `Remove-Item Env:GH_TOKEN`, `$env:GH_TOKEN = ""` (también `GITHUB_TOKEN`) |
| Cambiar de dónde saca git sus credenciales o quién firma | `git -c credential.helper=…`, `git config credential.…`, asignar o quitar `GIT_CONFIG_*`, `GIT_AUTHOR_*`, `GIT_COMMITTER_*` |
| Cambiar reglas del repo | `node scripts/rulesets.mjs --escribir`; `gh api` que escribe (`-X` con PUT, PATCH, POST o DELETE, o con `-f`/`-F`/`--input`, que lo vuelve POST) en `rulesets`, `branches/*/protection`, `collaborators`, `actions/secrets`, `actions/variables`, `environments`, `hooks` o `keys`; `gh api graphql` con una mutación de protección de ramas, rulesets o `updateRepository` |
| Aprobar PR | `gh pr review --approve` (o `-a`), una review `APPROVE` por la API o por GraphQL |
| Imprimir el token | `echo $GH_TOKEN`, `printenv` y `env` sin argumentos |

Lo que sigue permitido: `node scripts/token-sesion.mjs -- gh …` y `-- git push` (el
remedio cuando el token caduca), `gh` y `git` normales con el token puesto, y leer
esas mismas rutas de la API (un GET).

Es un filtro de buena fe: quien parta el texto a propósito (una variable
intermedia, un script en un fichero, otro intérprete) se lo salta. La barrera de
fondo es de Pablo: `gh auth logout` y quitar el manager de credenciales de
github.com de su PC. Hasta entonces, sus credenciales siguen ahí.

Fuentes: https://docs.github.com/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-json-web-token-jwt-for-a-github-app
y https://docs.github.com/rest/apps/apps#create-an-installation-access-token-for-an-app
