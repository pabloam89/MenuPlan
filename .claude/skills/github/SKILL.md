---
name: github
description: Úsala cuando el CI de GitHub esté en rojo, un workflow o un cron de Actions falle o no arranque, haya que mirar los checks o los logs de un PR, una carpeta de trabajo desaparezca sola, o se toque la protección de ramas, Dependabot, el secret scanning o los secretos de Actions, o las líneas del PR (`Closes`, `Runbook:`, `Casos:`). No para: issues, casos y problemas de fondo (issues), despliegues (vercel) ni migraciones (agente datos).
metadata:
  tipo: herramienta
  dueno: gobierno
  comprobado: "2026-10-09"
---

# GitHub

## Qué es y dónde

- **Repo** `pabloam89/MenuPlan`, **público**. Rama por defecto: `staging` (desde el 7 oct 2026). `main` es producción.
- **Protección de ramas** (desde el 7 oct, también para administradores):
  - `main`: solo por PR con el check `tests` en verde; sin force push ni
    borrado.
  - `staging`: sin force push ni borrado (protección clásica) y el **ruleset
    «staging: tests obligatorios»**: nada entra sin `tests` en verde, ni por PR
    ni por push, tampoco Pablo. Solo se lo saltan las deploy keys, y la única
    es la del cron de Mercadona, cuyo secreto vive en el environment
    `mercadona-sync` (solo rama staging). Decidido el 9 oct 2026; activo (id 24770007),
    sin exigir la rama al día.
- **Workflows** (`.github/workflows/`):

| Workflow | Cuándo | Qué hace |
|---|---|---|
| `tests.yml` | PR a `staging` o `main` (también al editar su cuerpo), push a `staging`, a mano | las líneas «Runbook:», «Casos:», «Agente:» y «Closes» del PR (esas dos, en el paso «Fondos del PR»), lint con línea base, tests y build. Es el check `tests` |
| `fondos.yml` | eventos de issues (alta, edición, etiqueta, cierre, reapertura), cada día 06:35 UTC, a mano | los controles de la ficha del fondo (#337, skill `issues`): un comentario del bot con la marca `<!-- menuplan:fondo -->`, la etiqueta `control:ok` o `control:falla`, y reabrir, subir alcance o cerrar como `cerrado-eficaz`. `issues: write`, `contents: read` y `actions: read` (para comprobar el run de su comentario), acciones fijadas por SHA, solo issues de OWNER, MEMBER o COLLABORATOR, sin secretos ni `pull_request_target`; nada del issue entra en un `run:` |
| `mercadona-sync.yml` | lunes 06:15 UTC, a mano (con `probar_push`, un commit vacío si no hay precios nuevos) | precios de Mercadona; commitea y **empuja a `staging` con la deploy key** (sin el secreto, con el token). Ese push sí lanza `tests` |
| `agente-fallos.yml` | cada día 06:20 UTC, a mano | agente de fallos de generación (`.claude/routines/fallos-generacion.md`) |
| `bot-semanal.yml` | lunes 06:40 UTC, a mano | informe semanal de Lola |
| `vigia-lola.yml` | cada 15 min (`4,19,34,49`), a mano | el vigía de Lola (#267): fallos `bot_fallo` de los logs de Vercel, el canario y los avisos al grupo de Telegram «HoMenu avisos». Su estado va en la caché de Actions (`vigia-estado-*`); borrarla solo cuesta un aviso repetido. Sin `VERCEL_TOKEN` ni `CANARIO_SECRET` se salta. Sus secretos y variables, en el environment `vigia` (solo `staging`) |
| `planos-semanal.yml` | lunes 06:50 UTC, a mano | `npm run planos -- --red` con el token del workflow (sin secretos ni Claude); si un nivel no cuadra o un juicio caduca, abre o comenta el issue «Planos: la medición semanal no cuadra». Lo que solo ve un administrador sale «sin comprobar» y no cambia ningún nivel. Desde #351 también mide la política de ramas de los environments con secretos (la lista sale de la API), los secretos a nivel de repo, las deploy keys de escritura y las aprobaciones de `main`, con detalle neutro («norma X no cuadra» y una cifra); las cuatro necesitan ver lo que solo ve un administrador, así que en el workflow salen «sin comprobar» y se miran con `npm run planos -- --red` en local |
| `dependabot-auto.yml` | al acabar `Tests` en verde sobre una rama `dependabot/` de un PR, cada 3 h (`23 */3`), a mano | `scripts/dependabot-auto.mjs --si` (#193): fusiona en staging los PR de Dependabot de parche o menor y comenta `@dependabot rebase` a los atrasados cuyos ficheros pisó staging. Una línea por PR (`dependabot-auto pr: … decision: … motivo: … ruta: npm|actions`); reglas y motivos, en la cabecera del script. Nunca hace checkout del PR. npm (solo `package*.json` de la raíz) con el `GITHUB_TOKEN`, cuya fusión no lanza `tests` en staging (Vercel despliega igual). Actions (solo líneas `uses:` de `.github/workflows/*.yml`) con un token de la GitHub App `homenu-dependabot-merge`, en un segundo job, el único con el environment `dependabot-auto` y la clave; los que tocan `dependabot-auto.yml` o un workflow con environment esperan, y en un workflow con algún `secrets.` solo entran acciones de `actions/` y `github/` (otro dueño: `tercero-con-secretos`); si el `workflow_run` no ve la clave (`motivo: sin-clave-app`), lo fusiona la pasada de cada 3 h. Tamaño: `update-type` del commit (a los indirectos les falta) y, de respaldo, los «from A to B» fuera de `<details>`; gana el mayor. Ensayo: `GH_TOKEN="$(gh auth token)" node scripts/dependabot-auto.mjs` |
| `ios-testflight.yml` | solo a mano | build de iOS a TestFlight |

- **`tests.yml` en detalle:** Node 24 y 20 minutos de tope. El lint (`npm run lint:base`,
  `scripts/lint-base.mjs`) falla solo con errores **nuevos** respecto a `lint-base.json`. El build no usa secretos.
- **Seguridad** (desde el 8 oct): secret scanning con push protection, alertas
  de Dependabot y PRs de seguridad automáticos. Versiones: `.github/dependabot.yml`, semanal, contra `staging`, tope de 3 PRs,
  cooldown de 5 días (no afecta a los de seguridad) y grupos `-menores`, `-mayores` y `npm-cero` (las 0.x directas: `CERO` del script; un PR suelto de una de ellas también espera) (#193).
- **Carpetas de trabajo** (worktrees): `npm run tarea` las crea y `npm run
  retirar` las cierra. Un hook personal de Pablo (`~/.claude/hooks/limpiar-worktrees.mjs`)
  borra solo las que ve **fusionadas y limpias**, tras cada `gh pr merge` y al
  abrir cualquier sesión.
- **Las skills, por obligación** (#164; mapa `.claude/dominios-skills.json`, cruzado por test con `.claude/skills/`):
  - **Puerta de lectura** (`guardia.mjs`): el primer comando de riesgo de un dominio en la
    sesión (`apply-migration`, `telegram-webhook.mjs set`, `vercel env`, `op item|read`, `ssh`
    al panel, `gh api -X POST`…) se niega con «abre antes la skill X y reintenta»; al
    reintentar pasa, y a la primera si la sesión ya abrió la skill (`Skill` o `Read` de su
    `SKILL.md`; lo anota `skill-abierta.mjs`) o el subagente la trae en su `skills:`. Sin registro, no bloquea.
    Un alta (`gh secret set`, `vercel env add`, `op item create`) pide además `alta-de-secreto`
    (#397); listar o leer (`gh secret list`, `vercel env ls`, `op item get`) no. Editar o
    escribir un fichero de las `rutas` de un dominio pasa por la misma puerta (#397), con la
    ruta sacada de la carpeta del fichero, no de la sesión.
  - **Puede avisar de más** («ante la duda, niega»; un reintento; fijado en el test del
    mapa): un `git commit -m` que nombra `apply-migration`, `gh workflow run`, `gh api
    graphql -f`, un `docker … -U panel` local, una `ssh` con la IP.
  - **Línea «Runbook:» del PR** (`scripts/runbook-pr.mjs`, tercer paso del job `tests`): si
    el PR toca rutas de un dominio, `Runbook: actualizado (skill X)` (y tocar esa skill) o
    `Runbook: sin novedades`; todas las líneas valen, las de bloques de código no cuentan.
    Exentos solo los PR de un bot; editar el cuerpo relanza el check.
  - **Línea «Casos:» del PR** (#185; `scripts/casos-pr.mjs`): `Casos: #n, #m` (issues
    `tipo:caso` con `analisis:`) o `Casos: ninguno — <motivo>` (25 caracteres o más). La guardia
    niega `gh pr create` sin ella; el CI consulta la API (`issues: read`) y, **si no responde,
    falla con la causa**: se relanza el check. `npm run issues` la cuenta en los últimos 50 PR.
    Cómo se registra un caso y se analiza hasta su fondo: skill `issues`.
  - **Línea «Closes #n» y «Agente:» del PR**: `Closes #n` por cada encargo o fondo
    que cierra (la guardia lo exige si la rama es de un issue: `npm run tarea --
    ops/x 193`) y `Agente: <nombre>` (o `sesión`); la plantilla de PR los trae.
    De ahí sale quién arregló qué (skill `issues`). Desde #337 también los pide el
    CI (`scripts/fondos-pr.mjs`, paso «Fondos del PR» de `tests`, para cualquiera
    y no solo las sesiones de Claude): `Agente:` con un agente de `.claude/agents/`
    o `sesión`; el `Closes` de la rama `area/<n>-…`; y por cada `Closes #n`, que el
    fondo de un encargo tenga diagnóstico (mecanismo y causa de escape) y que un
    fondo tenga aprendizaje. Bots exentos; si la API no responde, falla con la
    causa y se relanza el check.

## Claves y accesos

Los secretos de Actions (`ANTHROPIC_API_KEY`, `OPS_DB_URL`, `CALLMEBOT_DESTINOS`, `MERCADONA_DEPLOY_KEY`,
los del vigía, los de iOS y la clave de la App `homenu-dependabot-merge`) y qué workflow usa cada uno están en `ops/INVENTARIO.md`, que es la tabla
que manda. `tests.yml` no usa ninguno. La CLI `gh` va con la sesión de Pablo (`gh auth status`).
Un secreto nuevo o rotado va a un environment con política de ramas, nunca al <!-- norma:secretos-de-repo -->
repo; el alta entera, en la skill `alta-de-secreto`.

## Operaciones habituales

| Qué | Comando | Debe salir |
|---|---|---|
| PRs abiertos | `gh pr list` | una línea por PR con su rama |
| Estado de un PR | `gh pr view <n>` | título, rama, estado y descripción |
| Checks de un PR | `gh pr checks <n>` | `tests` en `pass` (o `fail` con enlace al run) |
| Esperar a que acaben | `gh pr checks <n> --watch --interval 30` | termina cuando no queda ninguno en curso |
| Últimos runs | `gh run list --workflow tests.yml --limit 5` | cinco filas con su estado |
| Solo el log de lo que falló | `gh run view <run-id> --log-failed` | el error: si es lint, fichero, regla y mensaje; si es test, su nombre |
| Relanzar lo que falló | `gh run rerun <run-id> --failed` | el run vuelve a `in_progress` |
| Lanzar a mano un workflow | `gh workflow run tests.yml --ref <rama>` | `Created workflow_dispatch event` |
| Fusionar un PR a `staging` | `gh pr merge <n> --merge` | `Merged`; la guardia vigila que no sea a `main` |
| Reglas que aplican a `staging` | `gh api repos/pabloam89/MenuPlan/rules/branches/staging` | un `required_status_checks` con `tests` (más los de la protección clásica) |
| Deploy keys del repo | `gh repo deploy-key list` | una, «mercadona-sync: cron, push a staging», `read-write` |
| Environment del cron | `gh api repos/pabloam89/MenuPlan/environments/mercadona-sync/deployment-branch-policies -q '.branch_policies[].name'` y `gh secret list --env mercadona-sync` | `staging` y `MERCADONA_DEPLOY_KEY`. Si un workflow nombra un environment que no existe, GitHub lo crea **sin política**: se crea antes a mano |
| Probar el push del cron sin esperar al lunes | `gh workflow run mercadona-sync.yml --ref staging -f probar_push=true` y `gh run watch` | el paso «Commitear» dice `Empujo con la deploy key a staging`, aparece en `origin/staging` el commit «prueba de push» (o el del catálogo, si hay precios nuevos) y un run de `tests` con evento `push` sobre él |
| Rotar la clave de la App `homenu-dependabot-merge` (OK) | Settings → Developer settings → GitHub Apps → la App → «Generate a private key» (baja un `.pem`); ese `.pem` sustituye al Documento `HoMenu/GitHub App dependabot-merge` de 1Password; `env -u OP_SERVICE_ACCOUNT_TOKEN op document get "GitHub App dependabot-merge" --vault HoMenu \| gh secret set DEPENDABOT_APP_KEY --env dependabot-auto`; `gh workflow run dependabot-auto.yml --ref staging`; y solo si sale `clave-app: si`, borrar la vieja en la App y el `.pem` del disco | el log dice `clave-app: si`; en la App queda una sola clave |
| Ver la seguridad del repo | `gh api repos/pabloam89/MenuPlan -q .security_and_analysis` | secret scanning y push protection en `enabled` |
| Ramas fusionadas que se borrarían (ensayo) | `npm run podar` | la lista, sin borrar nada |
| Borrarlas (OK) | `npm run podar -- --si` | GitHub y locales con `-d`; lo no fusionado sale como «decide Pablo» |
| ¿Está en staging? | `git fetch origin` y mirar `origin/staging`, nunca el upstream de tu rama | el commit o la ausencia |
| CI en rojo: reproducir un test | `npx vitest run <fichero>` | el mismo fallo que en el CI |
| Probar a mano la línea «Runbook:» | `git diff --name-only origin/staging... > $TEMP/f.txt` y `PR_BODY="$(gh pr view <n> --json body -q .body)" node scripts/runbook-pr.mjs $TEMP/f.txt` | `Runbook: ok`, o `FALLA` con la línea a poner (se arregla con `gh pr edit <n> --body-file <f>`) |

- **Ramas viejas:** GitHub borra la rama al fusionar el PR
  (`delete_branch_on_merge`), pero las de antes del 8 oct 2026 se quedaron.
  `scripts/podar.mjs` borra solo las fusionadas enteras en `origin/staging`,
  sin PR abierto, de hace más de 1 día y sin worktree.

## Lo que falló y por qué

- **2026-10-09 · `Closes #n` y `Agente:` solo los comprobaba la guardia, y la guardia
  solo ve a las sesiones de Claude (#337).** Causa: el CI miraba `Runbook:` y
  `Casos:` y nada más; un PR abierto desde la web o por otra vía no los llevaba y
  `npm run issues` perdía quién arregló qué. Arreglo: `scripts/fondos-pr.mjs`
  (paso «Fondos del PR»), con `scripts/fondos-pr.test.js`, visto fallar sin cada
  regla. Sin comprobar: un PR real con el paso nuevo.
- **2026-10-09 · 7 PR de una sesión arreglaron fallos sin registrar ningún caso (#185).**
  Causa: la norma era solo texto. Arreglo: la línea `Casos:` del PR (guardia + CI) y el
  freno de `pendientes.mjs`; tests en `casos.test.js` y `casos-pr.test.js`. Antes: 0 de 7.
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
  Arreglo: `npm run tarea` hace ahora un commit vacío (`tarea: arranca <rama>`)
  nada más crear la rama, antes de copiar el entorno y de instalar nada, y
  `retirar` no lo cuenta como trabajo sin subir (test en `scripts/tarea.test.js`).
  Para una carpeta anterior, a mano: `git commit --allow-empty -m "tarea: arranca
  <rama>"`. El hook ya solo borra ramas subidas con su nombre (`git push -u`) y
  luego fusionadas (`scripts/limpiar-worktrees.test.js`); su copia está en
  `~/.claude/hooks/` de cada PC y se actualiza a mano desde `scripts/`. Los restos
  huérfanos los borra Pablo, tras mirar que `node_modules` no es una unión y
  parar el `npm ci` vivo (`taskkill /T` sobre su `tarea.mjs`).
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
  Causa: rutas largas dentro de `node_modules`. Arreglo: las carpetas se cierran
  con `npm run retirar -- <nombre>`, o se le da a Pablo el comando para que lo
  lance él con `!`.

## Qué requiere el OK de Pablo

- Cualquier ajuste del repo: protección de ramas y rulesets, visibilidad, rama
  por defecto, Dependabot, secret scanning, environments, secretos y deploy keys
  (una de escritura se salta el ruleset de `staging`: no se crea otra sin más).
- Subir o fusionar a `main`.
- Borrar ramas, y borrar un directorio huérfano de una carpeta de trabajo.
- Cambiar un workflow que escribe en el repo o usa secretos.
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

Comprobado el 2026-10-09: la línea «Casos:» (#185), con tests y datos sintéticos en local, sin probarla aún en un PR real de GitHub ni la API desde el runner.

Comprobado el 2026-10-09: en #193, `dependabot-auto.yml` pasa `actionlint` 1.7.12; en ensayo contra el repo, #169 sale `grupo-manual` y #288 (en `/dish-gallery`) `ficheros-fuera`, y los cerrados #165 y #167 salen menores con commits limpios; en la documentación de GitHub, que `cooldown` solo afecta a las de versión y que el primer grupo que nombra una dependencia se la queda; el ruleset 24770007 de `staging` activo, exige `tests` y no pide la rama al día. Sin comprobar: si un `workflow_run` tras un run de Dependabot ve los secretos del environment (la documentación no lo aclara; por eso la pasada de cada 3 h), una fusión real, que Dependabot obedezca un `@dependabot rebase` de `github-actions[bot]`. Comprobado el 2026-10-09: el formato del bypass por deploy key (`actor_id` null) en la REST de rulesets; que `actions/checkout` v7 con `ssh-key` vacío usa HTTPS y el token (su `url-helper`), aunque el cron ya no lo usa así; que hoy hay 0 rulesets y 0 deploy keys, y que el check de `main` es `tests` de la app 15368. Sin comprobar: el ruleset y la deploy key creados de verdad, y que el push de la key lance `tests` (lo dirá la prueba con `probar_push`). Comprobado el 2026-10-08: la comprobación del runbook y la puerta de lectura, con sus tests y a mano en local (sin probarlas aún en un PR real de GitHub ni con el campo `agent_type` de un subagente de verdad); la causa del borrado de carpetas, leyendo el hook y comprobando que la rama no tenía commits propios; el resto viene de la versión anterior, reordenado sin cambiar los hechos. Con el hook en modo ensayo, una carpeta con commit propio no sale como borrable. Sin probar: el borrado real con una carpeta que tenga ese commit inicial, al abrir otra sesión.
