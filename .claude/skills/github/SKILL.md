---
name: github
description: Úsala cuando el CI de GitHub esté en rojo, un workflow o un cron de Actions falle o no arranque, haya que mirar los checks o los logs de un PR, una carpeta de trabajo desaparezca sola, la identidad de las sesiones (la App `homenu-sesiones`), o se toque la protección de ramas, Dependabot, el secret scanning o los secretos de Actions. No para: despliegues (vercel) ni migraciones (regla migraciones).
metadata:
  tipo: servicio
  opera_proveedor: true
  juzga_artefacto: false
  encadena: false
  pasos_fijos: false
  sintoma_a_causa: false
  elige_opciones: false
  dueno: pablo
  comprobado: "2026-10-19"
---

# GitHub

## Qué es y dónde

- **Repo** `pabloam89/MenuPlan`, **público**. Rama por defecto: `staging` (desde cuándo, en «Fechas» de Fuentes y comprobación). `main` es producción.
- **Protección de ramas** (desde el 7 oct, también para administradores):
  - `main`: solo por PR con el check `tests` en verde; sin force push ni
    borrado. Con los rulesets de #330 (aplicados), solo fusiona Pablo (bypass).
  - `staging`: sin force push ni borrado (protección clásica) y el **ruleset
    «staging: tests obligatorios»**: nada entra sin `tests` en verde, ni por PR
    ni por push, tampoco Pablo. Solo se lo saltan las deploy keys, y la única
    es la del cron de Mercadona, cuyo secreto vive en el environment
    `mercadona-sync` (solo rama staging). Decidido y activo (id 24770007; día en «Fechas» de Fuentes y comprobación),
    sin exigir la rama al día. Sin aprobación humana ni dueño de código (#608): `.claude/skills/github/referencias/duenos-de-codigo.md`.
- **Workflows** (`.github/workflows/`):

| Workflow | Cuándo | Qué hace |
|---|---|---|
| `tests.yml` | PR a `staging` o `main` (también al editar su cuerpo), push a `staging`, a mano | lint con línea base, tests y build; y, solo en PR, dos pasos al final que sustituyen a reglas de la guardia (#878): «Migraciones del PR» (`scripts/migraciones-pr.mjs`: una migración aplicada según el `ESTADO.md` de la base no se toca, y una nueva no repite el número de otro PR abierto; lista los PR con el `GITHUB_TOKEN`, `pull-requests: read`) y «Juez de seguridad si cambia un workflow» (`scripts/workflows-pr.mjs`, solo en PR a `staging`: si el PR toca `.github/workflows/`, `scripts/workflows-pr.mjs` o `scripts/migraciones-pr.mjs`, el cuerpo lleva «Jueces: …, seguridad» y esa línea no dice «pendiente(s)», «falta(n)», «sin» ni «no»; Dependabot exento; de buena fe: el PR puede cambiar su propia comprobación, el arreglo es #881). Es el check `tests`. Ninguna otra línea del cuerpo del PR la mira el CI (#878) |
| `mercadona-sync.yml` | lunes 06:15 UTC, a mano (con `probar_push`, un commit vacío si no hay precios nuevos) | precios de Mercadona; commitea y **empuja a `staging` con la deploy key** (sin el secreto, con el token). Ese push sí lanza `tests` |
| `bot-semanal.yml` | lunes 06:40 UTC, a mano | informe semanal de Lola |
| `vigia-lola.yml` | cada 15 min (`4,19,34,49`), a mano | el vigía de Lola (#267): fallos `bot_fallo` de los logs de Vercel, el canario y los avisos al grupo de Telegram «HoMenu avisos». Su estado va en la caché de Actions (`vigia-estado-*`); borrarla solo cuesta un aviso repetido. Sin `VERCEL_TOKEN` ni `CANARIO_SECRET` se salta. Sus secretos y variables, en el environment `vigia` (solo `staging`) |
| `dependabot-auto.yml` | al acabar `Tests` en verde sobre una rama `dependabot/` de un PR, cada 3 h (`23 */3`), a mano | `scripts/dependabot-auto.mjs --si` (#193): fusiona en staging los PR de Dependabot de parche o menor y comenta `@dependabot rebase` a los atrasados cuyos ficheros pisó staging. Una línea por PR (`dependabot-auto pr: … decision: … motivo: … ruta: npm\|actions`); reglas y motivos, en la cabecera del script. Nunca hace checkout del PR. npm (solo `package*.json` de la raíz) con el `GITHUB_TOKEN`, cuya fusión no lanza `tests` en staging (Vercel despliega igual). Actions (solo líneas `uses:` de `.github/workflows/*.yml`) con un token de la GitHub App `homenu-dependabot-merge`, en un segundo job, el único con el environment `dependabot-auto` y la clave; los que tocan `dependabot-auto.yml` o un workflow con environment esperan, y en un workflow con algún `secrets.` solo entran acciones de `actions/` y `github/` (otro dueño: `tercero-con-secretos`); si el `workflow_run` no ve la clave (`motivo: sin-clave-app`), lo fusiona la pasada de cada 3 h. Tamaño: `update-type` del commit (a los indirectos les falta) y, de respaldo, los «from A to B» fuera de `<details>`; gana el mayor. Ensayo (lo lanza Pablo con `!`; una sesión, con `node scripts/token-sesion.mjs --`): `GH_TOKEN="$(gh auth token)" node scripts/dependabot-auto.mjs` |
| `ios-testflight.yml` | solo a mano | build de iOS a TestFlight |

- **`tests.yml` en detalle:** Node 24 y 20 minutos de tope. El lint (`npm run lint:base`,
  `scripts/lint-base.mjs`) falla solo con errores **nuevos** respecto a `lint-base.json`. El build no usa secretos.
- **Seguridad** (desde el 8 oct): secret scanning con push protection, alertas
  de Dependabot y PRs de seguridad automáticos. Versiones: `.github/dependabot.yml`, semanal, contra `staging`, tope de 3 PRs,
  cooldown de 5 días (no afecta a los de seguridad) y grupos `-menores`, `-mayores` y `npm-cero` (las 0.x directas: `CERO` del script; un PR suelto de una de ellas también espera) (#193).
- **Carpetas de trabajo** (worktrees): se abren a mano desde `origin/staging` con
  `git worktree add -b <rama> C:/dev/MenuPlan-<tema> origin/staging`, se copia el
  `.env.local` de la carpeta principal y `npm ci` (CLAUDE.md). Un hook personal de
  Pablo (`~/.claude/hooks/limpiar-worktrees.mjs`) borra solo las que ve **subidas,
  fusionadas y limpias**, tras cada `gh pr merge` y al abrir cualquier sesión. El
  primer push de la rama es `git push -u origin <rama>`: deja el upstream con su
  nombre, que es lo que mira el hook para saber que la rama se subió.

## Claves y accesos

Los secretos de Actions (`ANTHROPIC_API_KEY`, `OPS_DB_URL`, `CALLMEBOT_DESTINOS`, `MERCADONA_DEPLOY_KEY`,
los del vigía, los de iOS y la clave de la App `homenu-dependabot-merge`) y qué workflow usa cada uno están en `ops/INVENTARIO.md`, que es la tabla
que manda. `tests.yml` no usa ninguno.

**Identidad de las sesiones (#329).** Al abrir sesión, `.claude/hooks/identidad.mjs` canjea la clave de la App `homenu-sesiones` por un token de 1 hora (con «Workflows: escritura», activo en la App por #422 y #821; si se le quita, sale sin él: `workflows: sin-conceder`), guardado y reutilizado entre sesiones
(Bash; en PowerShell, `node scripts/token-sesion.mjs -- <comando>`). `.claude/hooks/guardia-minima.mjs` niega quitar o vaciar el token, `git -c credential.…` y cambiar reglas del repo o aprobar PR (#447). El detalle, en `.claude/skills/github/referencias/app-sesiones.md`.
**Repos de otro dueño** (p. ej. la organización `factory-am89`, donde la App también está instalada): `node scripts/token-sesion.mjs --dueño <login> [--repo <nombre>] -- <comando>`, o `--del-remoto` para sacarlo de `origin` de la carpeta. Pide `/orgs/<login>/installation` (y `/users/…` si no es organización), limita el token a ese repo y usa su propia caché. Sin la opción, el repo de la casa.

Un secreto nuevo o rotado va a un environment con política de ramas, nunca al
repo; el alta entera, en la skill `alta-de-secreto`.

## Operaciones habituales

| Qué | Comando | Debe salir |
|---|---|---|
| PRs abiertos | `gh pr list` | una línea por PR con su rama |
| Estado de un PR | `gh pr view <n>` | título, rama, estado y descripción |
| Checks de un PR | `gh pr checks <n>` | `tests` en `pass` (o `fail` con enlace al run) |
| Esperar a que acaben | `gh pr checks <n>` de vez en cuando (sin `--watch`: gasta cuota GraphQL) | todos en `pass` |
| Últimos runs | `gh run list --workflow tests.yml --limit 5` | cinco filas con su estado |
| Solo el log de lo que falló | `gh run view <run-id> --log-failed` | el error: si es lint, fichero, regla y mensaje; si es test, su nombre |
| Relanzar lo que falló | `gh run rerun <run-id> --failed` | el run vuelve a `in_progress` |
| Lanzar a mano un workflow | `gh workflow run tests.yml --ref <rama>` | `Created workflow_dispatch event` |
| Fusionar un PR a `staging` | `gh pr merge <n> --merge` | `Merged`; a `main` GitHub solo deja fusionar a Pablo |
| Reglas que aplican a `staging` | `gh api repos/pabloam89/MenuPlan/rules/branches/staging` | un `required_status_checks` con `tests` (más los de la protección clásica); `node scripts/rulesets.mjs` (solo lee) compara `main` y `staging` con lo deseado |
| Deploy keys del repo | `gh repo deploy-key list` | una, «mercadona-sync: cron, push a staging», `read-write` |
| Environment del cron | `gh api repos/pabloam89/MenuPlan/environments/mercadona-sync/deployment-branch-policies -q '.branch_policies[].name'` y `gh secret list --env mercadona-sync` | `staging` y `MERCADONA_DEPLOY_KEY`. Si un workflow nombra un environment que no existe, GitHub lo crea **sin política**: se crea antes a mano |
| Probar el push del cron sin esperar al lunes | `gh workflow run mercadona-sync.yml --ref staging -f probar_push=true` y `gh run watch` | el paso «Commitear» dice `Empujo con la deploy key a staging`, aparece en `origin/staging` el commit «prueba de push» (o el del catálogo, si hay precios nuevos) y un run de `tests` con evento `push` sobre él |
| Rotar la clave de la App `homenu-dependabot-merge` (OK) | Settings → Developer settings → GitHub Apps → la App → «Generate a private key» (baja un `.pem`); ese `.pem` sustituye al Documento `HoMenu/GitHub App dependabot-merge` de 1Password; `env -u OP_SERVICE_ACCOUNT_TOKEN op document get "GitHub App dependabot-merge" --vault HoMenu \| gh secret set DEPENDABOT_APP_KEY --env dependabot-auto`; `gh workflow run dependabot-auto.yml --ref staging`; y solo si sale `clave-app: si`, borrar la vieja en la App y el `.pem` del disco | el log dice `clave-app: si`; en la App queda una sola clave |
| Crear la App de las sesiones `homenu-sesiones` (OK; Pablo, #327), pedir su token, revocarla | pasos, comprobación y revocación en `.claude/skills/github/referencias/app-sesiones.md`; el token: `node scripts/op.mjs document get "GitHub App homenu-sesiones" --vault HoMenu-sesiones \| node scripts/token-sesiones.mjs` | el token de 1 hora por la salida estándar, para `GH_TOKEN`; no sale en pantalla |
| Ver la seguridad del repo | `gh api repos/pabloam89/MenuPlan -q .security_and_analysis` | secret scanning y push protection en `enabled` |
| ¿Está en staging? | `git fetch origin` y mirar `origin/staging`, nunca el upstream de tu rama | el commit o la ausencia |
| CI en rojo: reproducir un test | `npx vitest run <fichero>` | el mismo fallo que en el CI |

- **Ramas viejas:** GitHub borra la rama al fusionar el PR
  (`delete_branch_on_merge`), pero las de antes del cambio (día en «Fechas» de Fuentes y comprobación) se quedaron.
  Borrarlas es de Pablo (`git push origin --delete <rama>`), solo si ya están en `origin/staging`.

## Lo que falló y por qué

- **2026-10-15 · las ramas que cambiaban un workflow se quedaban en local esperando a Pablo (#821, fondo #326).** Causa: la App de las sesiones no tenía «Workflows» (se le quitó el 10 oct por la revisión de seguridad) y GitHub rechaza su push entero; los movía Pablo (PR #824 y #847). Arreglo: Pablo decidió devolvérselo en escritura (opción C de #422, riesgo aceptado por escrito) y lo activó en la App. Contrapeso: desde #878, el paso «Juez de seguridad si cambia un workflow» de `tests.yml` (`scripts/workflows-pr.mjs`) pide «Jueces: …, seguridad» en el cuerpo del PR; es de buena fe, porque el PR puede cambiar su propio `tests.yml` (#881). Si la App pierde el permiso, los workflows vuelve a empujarlos Pablo.
- **2026-10-14 · `gh` y `git push` daban 401 pasada la hora del token del arranque (#719, caso #716, fondo #715).** Causa: el entorno de Bash se fija una vez al arrancar (`CLAUDE_ENV_FILE` solo existe en el hook de arranque), así que el `GH_TOKEN` y el ayudante de git leían un token que caduca. Arreglo: `scripts/bin/gh` (shim, delante en el PATH desde el arranque) pide el token a la caché al usarse, y el ayudante de git es `gh auth git-credential`, que pasa por él; el arranque escribe PATH, ayudante, autor y un `GH_TOKEN` inválido de relleno ANTES del canje. Tests en `scripts/ghShim.test.js` y `scripts/tokenSesion.test.js`, vistos fallar con el código anterior (28 casos, más la suite del shim que ni cargaba). Detalle en `.claude/skills/github/referencias/app-sesiones.md`. Sin cubrir: los scripts de Node con `execFile("gh")` (E3, #731). Deuda: el shim vive en la carpeta de la tarea (el hook corre desde `${CLAUDE_PROJECT_DIR}`), no fuera de ella; sacarlo a una copia fuera es un encargo del fondo #715.
- **2026-10-13 · `node scripts/token-sesion.mjs -- npm run …` no hacía nada y salía con 1 sin decir por qué (#720, caso #718, fondo #715).** Causa: `npm` en Windows es un `.cmd` y, sin shell, Node 24 da `EINVAL` en `spawnSync`; el envoltorio convertía el `status: null` en 1 y descartaba el error. Con `shell: true` no se arregla: cmd.exe sustituiría `%GH_TOKEN%` en los argumentos. Arreglo: `npm` y `npx` se lanzan con `process.execPath` y el JS de la propia CLI de npm (de `npm_execpath` o junto a node), sin shell; otro `.cmd` o `.bat` se rechaza; si no se puede lanzar, sale con 127 y `token-sesion resultado: fallo motivo: comando-no-lanzado (<código>)`; un hijo muerto por señal sale con 128 + señal y `comando-muerto-por-senal`. Tests en `scripts/tokenSesion.test.js` (vistos fallar con el código anterior, 9 de 9), con el barrido de envoltorios y su comando.
- **2026-10-11 · tres workflows publicaban en el primer issue que devolvía `in:title` (#450).** Causa: `agente-fallos.yml`, `bot-semanal.yml` y `planos-semanal.yml` buscaban su issue solo por título; la búsqueda es difusa y el repo público, así que un issue ajeno con ese título se llevaba el informe y la mención. Arreglo: `--author "app/github-actions"` y `select(.title==…)` en el `--jq`, y la regla de `ops/workflows.test.js` que lo pide a toda búsqueda de issue de un `run:` (vista fallar con los de staging). Antes: 3 de 4 workflows sin autor; después, 0.
- **2026-10-10 · `flujo-semanal.yml` dejó de ser YAML y cada run salía en rojo a los 0 s (#480).** Causa: dos `printf '\n…'` del cambio de #341 llevaban saltos de línea de verdad en vez de `\n`, que sacaban líneas del bloque `run: |`; los tests del workflow lo leían como texto. Arreglo: los `printf` con `\n` y `ops/workflows.test.js`, que lee todos los workflows con el parser `yaml` (visto fallar con el de staging). No aguantó la primera vez, por la otra cara: al reponer las continuaciones `\` del paso Publicar con un script, quedaron `\n` escritos tal cual en una sola línea; el YAML era válido, pero bash pasaba una «n» suelta a cada `gh` y, dentro de un `if !`, el paso salía en verde sin informe (#526). Arreglo: una orden por línea, editada a mano, y la regla del test que niega un `\n` fuera de comillas en un `run:`. Un workflow se edita con Edit, no con un script que reescribe el fichero. Ojo también: en `name:` un ` #` empieza un comentario y corta el nombre.
- **2026-10-10 · la cuota GraphQL de Pablo llegó a 0 dos veces (#424, fondo #326).** Causa: todas las sesiones gastaban el mismo token, cada arranque leía todos los issues por GraphQL y los `gh pr checks --watch` preguntaban cada 30 s; el contador REST de `gh api rate_limit` seguía con miles libres, así que parecía que quedaba cuota. Lección que sigue: la verdad sobre GraphQL la da `gh api graphql -f query='{ rateLimit { remaining resetAt } }'`, y para esperar al CI, consultas espaciadas.
- **2026-10-10 · el token de instalación real (390 caracteres, con `.` y `-`) no pasaba la forma escrita de memoria (#329).** Causa: se validó sin ver uno real. Arreglo: `[A-Za-z0-9_.-]`, con test; visto en vivo.
- **2026-10-09 · exigir `tests` en `staging` con la protección clásica: 404
  «Required status checks not enabled».** Causa: el PATCH a
  `branches/staging/protection/required_status_checks` solo edita checks que ya
  existen; para activarlos hay que reescribir la protección entera con PUT. Y
  aunque se hiciera, la protección clásica no tiene excepciones por actor: con
  `enforce_admins` bloquearía el `git push` del cron de Mercadona. Arreglo: no
  tocar la clásica y poner los checks en un ruleset, que sí admite excepciones.
- **2026-10-09 · ruleset con la app de GitHub Actions como excepción: 422
  «Actor GitHub Actions integration must be part of the ruleset source or owner
  organization».** Causa: el repo es personal (`pabloam89`), no de una
  organización, y en un repo personal no se puede eximir a la integración de
  Actions (ni a `OrganizationAdmin`); eximir al rol de administrador tampoco
  sirve, porque las sesiones usan el token de Pablo y se saltarían la regla.
  Arreglo: el cron empuja con una **deploy key** de escritura y el ruleset
  exime a `DeployKey` (`actor_id: null`, `bypass_mode: always`; `pull_request`
  no vale para deploy keys). Fuente: «Create a repository ruleset» en la REST
  de GitHub. De paso, el push con la deploy key sí lanza `tests` (el del
  `GITHUB_TOKEN` no).
- **2026-10-08 · la carpeta de trabajo recién creada desaparece sola y queda un
  directorio huérfano sin `.git`, con `node_modules` a medio borrar.** Pasó dos
  veces; la segunda, con `npm ci` todavía instalando. Causa:
  `limpiar-worktrees.mjs` da por «fusionada» cualquier rama que sea ancestro de
  `origin/staging`, y una rama nueva sin commits lo es. Se ejecuta al abrir
  *cualquier* sesión, así que otra sesión arrancando se la lleva por delante.
  Arreglo: el hook ya solo borra ramas subidas con su nombre (`git push -u`) y
  luego fusionadas; su copia está en `~/.claude/hooks/` de cada PC y se actualiza
  a mano. Los restos huérfanos los borra Pablo, tras mirar que `node_modules` no
  es una unión y parar el `npm ci` vivo.
- **2026-10 · el PR que abre el token de Actions no lanza `tests.yml`.** Causa:
  un PR abierto con `GITHUB_TOKEN` no dispara otros workflows. Arreglo: lanzarlo
  a mano con `gh workflow run tests.yml --ref <rama>`. La documentación de
  GitHub dice ahora (leída el 2026-10-09) que esos PR sí crean runs, pero
  esperando a que alguien con escritura pulse «Approve workflows to run»; sin
  probar aquí. La pendiente 11 de `ops/INVENTARIO.md` (que el cron abra PR) la
  sustituyó la deploy key.
- **2026-10-08 · `gh` colgado con «TLS handshake timeout»** al activar
  Dependabot. Causa: la red, no el comando. Arreglo: reintentar; si un `gh` pasa
  de 60 s sin responder, se corta con `timeout 60 gh …` y se repite.
- **2026-10 · `git worktree remove` falla en Windows con «Filename too long».**
  Causa: rutas largas dentro de `node_modules`. Arreglo: las cierra el hook de
  limpieza (`node C:\Users\pablo\.claude\hooks\limpiar-worktrees.mjs --si`), o se
  le da a Pablo el comando para que lo lance él con `!`.

## Qué requiere el OK de Pablo

- Rotar o retirar la clave de la App `homenu-sesiones`, y volver a entrar con `gh auth login` (su sesión está cerrada; la cierra otra vez al acabar, y el registro está en app-sesiones.md).
- Cualquier ajuste del repo: protección de ramas y rulesets, visibilidad, rama
  por defecto, Dependabot, secret scanning, environments, secretos y deploy keys
  (una de escritura se salta el ruleset de `staging`: no se crea otra sin más).
- Subir o fusionar a `main`.
- Borrar ramas, y borrar un directorio huérfano de una carpeta de trabajo.
- Tocar los hooks de usuario (`~/.claude/hooks/`), aunque estén rotos.

## Coste y límites

Repo público: los minutos de Actions no cuentan. Si pasa a privado (pendiente 10
del inventario) empiezan a contar (medido el 7 oct: ~600 de 2.000 minutos al
mes) y, en Vercel, un commit de un autor que no es miembro del equipo deja el
despliegue «Blocked» (ver la skill `vercel`). Hay que mirarlo antes de cambiar
la visibilidad. Dependabot, secret scanning y push protection no tienen coste.

## Fuentes y comprobación

- https://docs.github.com/actions
- https://cli.github.com/manual/
- https://docs.github.com/code-security/dependabot
- https://docs.github.com/rest/repos/rules (bypass_actors y `DeployKey`)
- https://docs.github.com/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow
- https://github.com/actions/checkout (`ssh-key`)

Fechas que estaban repartidas por el cuerpo (#411): rama por defecto `staging` desde el 7 oct 2026; el ruleset «staging: tests obligatorios» se decidió el 9 oct 2026; `delete_branch_on_merge` rige desde el 8 oct 2026 (las ramas anteriores se quedaron).

Comprobado el 2026-10-15 (#422, #821): `GET /app/installations` con el JWT de la App da `contents`, `issues`, `pull_requests` y `workflows` de escritura y `actions`, `checks` y `metadata` de lectura, solo en los repos elegidos; el canje con `workflows: write` (#863) acaba en `workflows: concedido` (`token-sesion.mjs --sin-cache --comprobar`) y sin advertencias, y con los permisos de antes (sin workflows) da `permisos-de-mas`. El respaldo, si se le quita el permiso, se vio antes de activarlo: pedir `workflows: write` da 422 («The permissions requested are not granted to this installation») y el canje vuelve a pedir sin él (`workflows: sin-conceder`). 

Comprobado el 2026-10-19 (#878): que `tests.yml` solo mira en el cuerpo del PR la línea «Jueces:» de `scripts/workflows-pr.mjs`, leyendo el workflow y los dos scripts; que `npm run tarea`, `retirar`, `podar` y `espera-ci` ya no están en `package.json`.

Comprobado el 2026-10-09: en #193, `dependabot-auto.yml` pasa `actionlint` 1.7.12; en ensayo contra el repo, #169 sale `grupo-manual` y #288 (en `/dish-gallery`) `ficheros-fuera`, y los cerrados #165 y #167 salen menores con commits limpios; en la documentación de GitHub, que `cooldown` solo afecta a las de versión y que el primer grupo que nombra una dependencia se la queda; el ruleset 24770007 de `staging` activo, exige `tests` y no pide la rama al día. Sin comprobar: si un `workflow_run` tras un run de Dependabot ve los secretos del environment (la documentación no lo aclara; por eso la pasada de cada 3 h), una fusión real, que Dependabot obedezca un `@dependabot rebase` de `github-actions[bot]`. Comprobado el 2026-10-09: el formato del bypass por deploy key (`actor_id` null) en la REST de rulesets; que `actions/checkout` v7 con `ssh-key` vacío usa HTTPS y el token (su `url-helper`), aunque el cron ya no lo usa así; que hoy hay 0 rulesets y 0 deploy keys, y que el check de `main` es `tests` de la app 15368. Sin comprobar: el ruleset y la deploy key creados de verdad, y que el push de la key lance `tests` (lo dirá la prueba con `probar_push`). Comprobado el 2026-10-08: la causa del borrado de carpetas, leyendo el hook y comprobando que la rama no tenía commits propios; el resto viene de la versión anterior, reordenado sin cambiar los hechos. Con el hook en modo ensayo, una carpeta con commit propio no sale como borrable. Sin probar: el borrado real con una carpeta que tenga ese commit inicial, al abrir otra sesión.
