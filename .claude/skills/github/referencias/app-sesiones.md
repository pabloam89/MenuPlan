# GitHub App «homenu-sesiones» (E1, #327; fondo #326)

La identidad de máquina de las sesiones: una GitHub App propia, instalada solo en
`pabloam89/MenuPlan`, cuyos tokens caducan a la hora y salen en los PR y commits
como `homenu-sesiones[bot]` y no como Pablo. Una App por actor: no se reutiliza
`homenu-dependabot-merge` (App ID 5250358), que fusiona en `staging` y vive en
otro environment.

Lo hace **Pablo**, en el navegador, con su cuenta (crear una App, generar su clave
y guardarla son secretos y ajustes de GitHub). Una sesión no hace ninguno de estos
pasos. Ningún valor pasa por la conversación ni por el repo.

## Antes de empezar

- La bóveda `HoMenu-sesiones` de 1Password tiene que existir (E2, #328; a 10 oct
  2026 estaba **pendiente de crear**). Si no existe, para aquí: **no dejes el
  `.pem` en `HoMenu`**, que la cuenta de servicio actual lee entera y las sesiones
  lo tendrían a la vista. Nombres fijados por la rama de E2: bóveda
  `HoMenu-sesiones`, Documento `GitHub App homenu-sesiones`.
- La app de escritorio de 1Password abierta y desbloqueada.

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
| Workflows | Read and write |
| Actions | Read-only |
| Checks | Read-only |
| Metadata | Read-only (GitHub lo pone solo) |
| Administration, Secrets, Environments, Deployments | **No access** |

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
`.pem` (probablemente a Descargas). Esa clave **no caduca**.

1. En la app de 1Password: **Nuevo elemento → Documento**, arrastra el `.pem`,
   título exacto `GitHub App homenu-sesiones`, bóveda `HoMenu-sesiones`. O, desde
   una terminal tuya y con la ruta real entre comillas dobles (sin el token de la
   cuenta de servicio, que no escribe):
   `env -u OP_SERVICE_ACCOUNT_TOKEN op document create "C:\Users\pablo\Downloads\<fichero>.pem" --title "GitHub App homenu-sesiones" --vault HoMenu-sesiones`
2. Borra el `.pem` de Descargas **y de la Papelera de reciclaje**. Debe quedar una
   sola copia: la del Documento.
3. Apunta los dos números en `.env.local` de la carpeta principal, en claro (no son
   secretos): `SESIONES_APP_ID=…` y `SESIONES_INSTALLATION_ID=…`. Dónde viven
   cuando las sesiones los lean (`ops/env.1password` o variables) lo decide E3
   (#329): **pendiente**.

## 4. Comprobar

La primera línea pide un token y lo pasa a `gh` sin mostrarlo; debe salir
`pabloam89/MenuPlan`:

`GH_TOKEN="$(node scripts/op.mjs document get "GitHub App homenu-sesiones" --vault HoMenu-sesiones | node scripts/token-sesiones.mjs)" gh api repos/pabloam89/MenuPlan -q .full_name`

Con el mismo token (misma forma de pasarlo), tienen que salir así:

| Llamada | Debe salir |
|---|---|
| `gh api /installation/repositories -q '.repositories[].full_name'` | solo `pabloam89/MenuPlan` |
| `gh api repos/pabloam89/MenuPlan/actions/secrets` | error 403 (Secrets: ninguno) |
| `gh api repos/pabloam89/MenuPlan/environments` | error 403 (Environments: ninguno) |
| `gh api repos/pabloam89/MenuPlan/rulesets` | error 403 o 404 (Administration: ninguno) |

Si alguna de las tres últimas da 200, la App tiene más permisos de los del
encargo: corrígelo en la App antes de seguir (E3 no empieza hasta entonces).

## Seguridad: caducidad, alcance, fuga y revocación

- **Caducidad.** El JWT dura 10 min y el token de instalación 1 hora (los
  cuenta el script al pedirlo). La clave `.pem` **no caduca**: se rota cada 90
  días, como el resto (skill `alta-de-secreto`); la fecha, en `ops/INVENTARIO.md`.
- **Alcance.** Solo `pabloam89/MenuPlan`, con los permisos de arriba. El script
  pide además el token limitado al repo `MenuPlan`. No puede cambiar protecciones,
  secretos ni environments, y `main` y `staging` no admiten push directo ni
  siquiera de administradores (skill `github`): lo que puede es abrir PR, crear
  ramas, comentar y proponer cambios en `.github/workflows/`. Hasta que E4 (#330)
  ponga revisión de dueño de código en esas rutas, lo único que frena un PR
  malicioso sobre los workflows es que Pablo lo lea antes de fusionar.
- **Si se filtra el `.pem`:** cualquiera con él pide tokens de 1 hora con esos
  permisos hasta que se borre la clave. Actúa en este orden:
  1. App → **Private keys** → **Delete** la clave filtrada. A partir de ahí no
     firma ningún JWT nuevo.
  2. Los tokens ya emitidos viven hasta 1 hora. Para cortarlos ya: App →
     **Advanced**/**Install App** → **Suspend** (o **Uninstall**) la instalación.
     Sin comprobar cuál de los dos botones corta tokens vivos al instante.
  3. Mira lo que hizo `homenu-sesiones[bot]`: los PR y las ramas creadas desde
     la filtración (`gh api repos/pabloam89/MenuPlan/branches` y la lista de PR).
  4. Genera una clave nueva, sustitúyela en el Documento (pasos 3.1 y 3.2) y
     reactiva la instalación.
- **Rotación normal.** Genera una **segunda** clave (la App admite varias),
  sustituye el Documento, comprueba el paso 4 y solo entonces borra la vieja.
- **Quitar la App** (OK de Pablo): Uninstall en el repo, Delete GitHub App, el
  Documento a la papelera y la fila del inventario marcada «retirada».
- El token de instalación sale por la salida estándar del script y no se escribe
  en ningún fichero. No lo pegues en un comando ni en un issue; no se pone en
  `GH_TOKEN` de forma permanente (`setx`).

## Qué falta por confirmar

- Los nombres exactos de los botones de GitHub (Suspend/Uninstall, «Private keys»)
  salen de la documentación y no de una pantalla: la primera vez, ajusta este
  texto.
- El nombre del Documento y de la bóveda, de la rama `ops/328-boveda-sesiones`
  (PR #412, sin fusionar): si E2 los cambia, se cambian aquí y en el script.
- Dónde guardan las sesiones el App ID y el Installation ID (E3, #329).

Fuentes: https://docs.github.com/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-json-web-token-jwt-for-a-github-app
y https://docs.github.com/rest/apps/apps#create-an-installation-access-token-for-an-app
