---
name: github
description: Úsala cuando el CI de GitHub esté en rojo, un workflow o un cron de Actions falle o no arranque, haya que mirar los checks o los logs de un PR, una carpeta de trabajo desaparezca sola, o se toque la protección de ramas, Dependabot, el secret scanning o los secretos de Actions, o las líneas del PR (`Closes`, `Runbook:`, `Casos:`). No para: issues, casos y problemas de fondo (issues), despliegues (vercel) ni migraciones (agente constructor).
metadata:
  tipo: servicio
  opera_proveedor: true
  juzga_artefacto: false
  encadena: false
  pasos_fijos: false
  sintoma_a_causa: false
  elige_opciones: false
  dueno: constructor
  comprobado: "2026-10-09"
  normas: [main-solo-por-pr-con-tests, staging-exige-tests, sin-push-forzado, deploy-key-unica, secretos-de-repo, push-protection, pr-al-dia-y-closes, pr-agente-y-closes-en-ci, linea-runbook, sesion-con-su-identidad]
---

# GitHub

Método de la casa. El repo, su protección de ramas, los workflows y los secretos que son de un proyecto concreto, la identidad de sus sesiones y lo que se decidió allí no van aquí: están en la ficha de servicio de ese proyecto (`ops/proyectos/<id>/servicios/github.md`), que llega con `--proyecto <id>` en el brief.

## Qué es y dónde

- **El repo** del proyecto, con una rama por defecto (`staging`: de ahí sale todo y ahí vuelve por PR) y `main` como producción.
- **Protección de ramas:** `main` solo por PR con el check `tests` en verde, sin force push ni borrado, y solo fusiona la persona dueña; `staging` exige `tests` en verde por PR y por push, con un ruleset (los rulesets admiten excepciones por actor; la protección clásica no). Sin aprobación humana ni dueño de código (#608). Los ids y las excepciones de un repo, en su ficha.
- **Workflows de la casa** (`.github/workflows/`; los que son de un proyecto, en su ficha):

| Workflow | Cuándo | Qué hace |
|---|---|---|
| `tests.yml` | PR a `staging` o `main` (también al editar su cuerpo), push a `staging`, a mano | las líneas «Runbook:», «Casos:», «Agente:» y «Closes» del PR (esas dos, en el paso «Fondos del PR», que mira también que cada norma sin ejecutor cuelgue de un encargo o una decisión abiertos, #620), la higiene de las skills que toca el PR (paso «Higiene de las skills del PR», #341: una falta falla), los avisos del PR (paso «Avisos del PR», #576: tests relajados, PR grande y fondo cerrado sin aprendizaje; solo avisan, con UNA forma de excepción en el cuerpo, `Excepción: <id de norma> — <motivo> — hasta AAAA-MM-DD` (#621; una caducada o de una norma inexistente no cuenta y solo falla la de una norma dura que el PR toca; cada aviso deja además su línea `norma: <id> resultado: …`; las formas de antes siguen valiendo con aviso en la transición, ver «Fechas»), lint con línea base, tests y build. Es el check `tests` |
| `fondos.yml` | eventos de issues (alta, edición, etiqueta, cierre, reapertura), cada día 06:35 UTC, a mano | los controles de la ficha del fondo (#337, skill `issues`): un comentario del bot con la marca `<!-- menuplan:fondo -->`, la etiqueta `control:ok` o `control:falla`, y reabrir, subir alcance o cerrar como `cerrado-eficaz`. `issues: write`, `contents: read` y `actions: read` (para comprobar el run de su comentario), acciones fijadas por SHA, solo issues de OWNER, MEMBER o COLLABORATOR, sin secretos ni `pull_request_target`; nada del issue entra en un `run:` |
| `planos-semanal.yml` | lunes 06:50 UTC, a mano | `npm run planos -- --red` con el token del workflow (sin secretos ni Claude); si un nivel no cuadra o un juicio caduca, abre o comenta el issue «Planos: la medición semanal no cuadra». Lo que solo ve un administrador sale «sin comprobar» y no cambia ningún nivel. Desde #351 también mide la política de ramas de los environments con secretos (la lista sale de la API), los secretos a nivel de repo, las deploy keys de escritura y las aprobaciones de `main`, con detalle neutro («norma X no cuadra» y una cifra); las cuatro necesitan ver lo que solo ve un administrador, así que en el workflow salen «sin comprobar» y se miran con `npm run planos -- --red` en local |
| `flujo-semanal.yml` | lunes 06:55 UTC, a mano | `scripts/cumplimiento.mjs --informe` (#341) con el token del workflow, sin secretos ni coste: los indicadores de cumplimiento del flujo (fondos sin diagnóstico, encargos sin juez, cerrados sin aprendizaje, reabiertos por clase corta, ciclos sobre presupuesto), la higiene y caducidad de las skills y el ENSAYO del nivel 2 (`skills-prueba --ensayo`: valida los casos, no llama a ningún modelo). Lo deja como comentario del issue «Flujo: informe semanal»; no abre un issue por indicador (un disparo se registra a mano con `npm run issues -- --nuevo`, que busca los parecidos). El nivel 2 de pago lo lanza una persona. Desde #480 lee antes los informes anteriores del bot (`--historial`) y pone cada cifra con su vigilante (`ops/metricas.json`) y su margen de ruido |
| `dependabot-auto.yml` | al acabar `Tests` en verde sobre una rama `dependabot/` de un PR, cada 3 h (`23 */3`), a mano | `scripts/dependabot-auto.mjs --si` (#193): fusiona en staging los PR de Dependabot de parche o menor y comenta `@dependabot rebase` a los atrasados cuyos ficheros pisó staging. Una línea por PR (`dependabot-auto pr: … decision: … motivo: … ruta: npm\|actions`); reglas y motivos, en la cabecera del script. Nunca hace checkout del PR. npm (solo `package*.json` de la raíz) con el `GITHUB_TOKEN`, cuya fusión no lanza `tests` en staging (Vercel despliega igual). Actions (solo líneas `uses:` de `.github/workflows/*.yml`) con un token de una GitHub App de fusión, en un segundo job, el único con el environment `dependabot-auto` y la clave; los que tocan `dependabot-auto.yml` o un workflow con environment esperan, y en un workflow con algún `secrets.` solo entran acciones de `actions/` y `github/` (otro dueño: `tercero-con-secretos`); si el `workflow_run` no ve la clave (`motivo: sin-clave-app`), lo fusiona la pasada de cada 3 h. Tamaño: `update-type` del commit (a los indirectos les falta) y, de respaldo, los «from A to B» fuera de `<details>`; gana el mayor. Ensayo (lo lanza Pablo con `!`; una sesión, con `node scripts/token-sesion.mjs --`): `GH_TOKEN="$(gh auth token)" node scripts/dependabot-auto.mjs` |

- **`tests.yml` en detalle:** Node 24 y 20 minutos de tope. El lint (`npm run lint:base`,
  `scripts/lint-base.mjs`) falla solo con errores **nuevos** respecto a `lint-base.json`. El build no usa secretos.
- **Seguridad:** secret scanning con push protection, alertas de Dependabot y PRs de seguridad automáticos; las versiones, en `.github/dependabot.yml` (la configuración concreta de un proyecto, en su ficha).
- **Carpetas de trabajo** (worktrees): `npm run tarea` las crea y `npm run
  retirar` las cierra. Un hook personal de Pablo (`~/.claude/hooks/limpiar-worktrees.mjs`)
  borra solo las que ve **fusionadas y limpias**, tras cada `gh pr merge` y al
  abrir cualquier sesión. `--zona <fichero>` reserva lo que la tarea aún no ha
  tocado (`branch.<rama>.zona` de git, se va con la rama) y la guardia avisa a
  otra rama que lo edite (#506).
- **Lo generado al traer staging** (#551): `tarea` instala dos drivers de fusión
  (`generado` y `json-claves`); qué hacen, qué línea dejan y qué toca tras fusionar,
  en `.claude/skills/github/referencias/generados.md`.
- **Las skills, por obligación** (#164; mapa `.claude/dominios-skills.json`): la puerta de lectura de la guardia, lo que avisa de más y las líneas «Runbook:», «Casos:», «Closes #n» y «Agente:» del PR, en `.claude/skills/github/referencias/skills-por-obligacion.md`.

## Claves y accesos

Los secretos de Actions y qué workflow usa cada uno están en `ops/INVENTARIO.md`, que es la tabla
que manda (cuáles son los de un proyecto, en su ficha). `tests.yml` no usa ninguno.

**Identidad de las sesiones (#329).** El arranque canjea la clave de una GitHub App por un token de 1 hora, guardado y reutilizado entre sesiones
(Bash; en PowerShell, `node scripts/token-sesion.mjs -- <comando>`). La guardia niega quitar o vaciar el token, `git -c credential.…` y cambiar reglas del repo o aprobar PR (#447). Cómo se crea la App y cómo se pide su token: la ficha del proyecto.

Un secreto nuevo o rotado va a un environment con política de ramas, nunca al <!-- norma:secretos-de-repo -->
repo; el alta entera, en la skill `alta-de-secreto`.

## Operaciones habituales

| Qué | Comando | Debe salir |
|---|---|---|
| PRs abiertos | `gh pr list` | una línea por PR con su rama |
| Estado de un PR | `gh pr view <n>` | título, rama, estado y descripción |
| Checks de un PR | `gh pr checks <n>` | `tests` en `pass` (o `fail` con enlace al run) |
| Esperar a que acaben (REST, gasta poca cuota; #424) | `npm run espera-ci -- <n>` (una llamada cada 60 s) | una línea `ci pr: n estado: ok`, `falla` o `pendiente`; sale 0 si pasa, 1 si falla o se acaba el tiempo, 3 si no pudo preguntar (no es un CI en rojo) |
| Últimos runs | `gh run list --workflow tests.yml --limit 5` | cinco filas con su estado |
| Solo el log de lo que falló | `gh run view <run-id> --log-failed` | el error: si es lint, fichero, regla y mensaje; si es test, su nombre |
| Relanzar lo que falló | `gh run rerun <run-id> --failed` | el run vuelve a `in_progress` |
| Lanzar a mano un workflow | `gh workflow run tests.yml --ref <rama>` | `Created workflow_dispatch event` |
| Fusionar un PR a `staging` | `gh pr merge <n> --merge` | `Merged`; la guardia vigila que no sea a `main` |
| Reglas que aplican a `staging` | `gh api repos/<dueño>/<repo>/rules/branches/staging` | un `required_status_checks` con `tests` (más los de la protección clásica); `node scripts/rulesets.mjs` (solo lee) compara `main` y `staging` con lo deseado |
| Ver la seguridad del repo | `gh api repos/<dueño>/<repo> -q .security_and_analysis` | secret scanning y push protection en `enabled` |
| Ramas fusionadas que se borrarían (ensayo) | `npm run podar` | la lista, sin borrar nada |
| Borrarlas (OK) | `npm run podar -- --si` | GitHub y locales con `-d`; lo no fusionado sale como «decide Pablo» |
| ¿Está en staging? | `git fetch origin` y mirar `origin/staging`, nunca el upstream de tu rama | el commit o la ausencia |
| CI en rojo: reproducir un test | `npx vitest run <fichero>` | el mismo fallo que en el CI |
| Probar a mano la línea «Runbook:» | `git diff --name-only origin/staging... > $TEMP/f.txt` y `PR_BODY="$(gh pr view <n> --json body -q .body)" node scripts/runbook-pr.mjs $TEMP/f.txt` | `Runbook: ok`, o `FALLA` con la línea a poner (se arregla con `gh pr edit <n> --body-file <f>`) |

- **Ramas viejas:** GitHub borra la rama al fusionar el PR (`delete_branch_on_merge`), pero las de antes del cambio se quedan.
  `scripts/podar.mjs` borra solo las fusionadas enteras en `origin/staging`,
  sin PR abierto, de hace más de 1 día y sin worktree.

## Lo que falló y por qué

- **2026-10-14 · `gh` y `git push` daban 401 pasada la hora del token del arranque (#719, caso #716, fondo #715).** Causa: el entorno de Bash se fija una vez al arrancar (`CLAUDE_ENV_FILE` solo existe en el hook de arranque), así que el `GH_TOKEN` y el ayudante de git leían un token que caduca. Arreglo: `scripts/bin/gh` (shim, delante en el PATH desde el arranque) pide el token a la caché al usarse, y el ayudante de git es `gh auth git-credential`, que pasa por él; el arranque escribe PATH, ayudante, autor y un `GH_TOKEN` inválido de relleno ANTES del canje. Tests en `scripts/ghShim.test.js`, `.claude/hooks/arranque.test.js` y `scripts/tokenSesion.test.js`, vistos fallar con el código anterior (28 casos, más la suite del shim que ni cargaba). Sin cubrir: los scripts de Node con `execFile("gh")` (E3, #731) y la guardia (E4, #738). Deuda: el shim vive en la carpeta de la tarea (el hook corre desde `${CLAUDE_PROJECT_DIR}`), no fuera de ella; sacarlo a una copia fuera es un encargo del fondo #715.
- **2026-10-13 · `node scripts/token-sesion.mjs -- npm run …` no hacía nada y salía con 1 sin decir por qué (#720, caso #718, fondo #715).** Causa: `npm` en Windows es un `.cmd` y, sin shell, Node 24 da `EINVAL` en `spawnSync`; el envoltorio convertía el `status: null` en 1 y descartaba el error. Con `shell: true` no se arregla: cmd.exe sustituiría `%GH_TOKEN%` en los argumentos. Arreglo: `npm` y `npx` se lanzan con `process.execPath` y el JS de la propia CLI de npm (de `npm_execpath` o junto a node), sin shell; otro `.cmd` o `.bat` se rechaza; si no se puede lanzar, sale con 127 y `token-sesion resultado: fallo motivo: comando-no-lanzado (<código>)`; un hijo muerto por señal sale con 128 + señal y `comando-muerto-por-senal`. Tests en `scripts/tokenSesion.test.js` (vistos fallar con el código anterior, 9 de 9), con el barrido de envoltorios y su comando.
- **2026-10-11 · tres workflows publicaban en el primer issue que devolvía `in:title` (#450).** Causa: `agente-fallos.yml`, `bot-semanal.yml` y `planos-semanal.yml` buscaban su issue solo por título; la búsqueda es difusa y el repo público, así que un issue ajeno con ese título se llevaba el informe y la mención. Arreglo: como `flujo-semanal.yml`, `--author "app/github-actions"` y `select(.title==…)` en el `--jq`, y la regla de `ops/workflows.test.js` que lo pide a toda búsqueda de issue de un `run:` (vista fallar con los de staging). Antes: 3 de 4 workflows sin autor; después, 0.
- **2026-10-10 · `flujo-semanal.yml` dejó de ser YAML y cada run salía en rojo a los 0 s (#480).** Causa: dos `printf '\n…'` del cambio de #341 llevaban saltos de línea de verdad en vez de `\n`, que sacaban líneas del bloque `run: |`; los tests del workflow lo leían como texto. Arreglo: los `printf` con `\n` y `ops/workflows.test.js`, que lee todos los workflows con el parser `yaml` (visto fallar con el de staging). No aguantó la primera vez, por la otra cara: al reponer las continuaciones `\` del paso Publicar con un script, quedaron `\n` escritos tal cual en una sola línea; el YAML era válido, pero bash pasaba una «n» suelta a cada `gh` y, dentro de un `if !`, el paso salía en verde sin informe (#526). Arreglo: una orden por línea, editada a mano, y la regla del test que niega un `\n` fuera de comillas en un `run:`. Un workflow se edita con Edit, no con un script que reescribe el fichero. Ojo también: en `name:` un ` #` empieza un comentario y corta el nombre.
- **2026-10-10 · la cuota GraphQL de Pablo llegó a 0 dos veces (#424, fondo #326).** Causa: todas las sesiones gastaban el mismo token y cada arranque pedía ~320 puntos (`npm run issues`: 3 páginas de 106), más los `gh pr checks --watch` cada 30 s; el contador REST de `gh api rate_limit` seguía con 4.656 libres, así que parecía que quedaba cuota. Arreglo: caché de 15 min (arranque) y 10 (listado) en `scripts/lib/cuotaGh.mjs`, `npm run espera-ci` por REST, línea `gh: caller=… api=…` por llamada y techos en `scripts/cuotaGh.test.js`, visto fallar. Cifras y cómo medir, en `.claude/skills/github/referencias/cuota-graphql.md`; la verdad sobre GraphQL la da `gh api graphql -f query='{ rateLimit { remaining resetAt } }'`.
- **2026-10-10 · el token de instalación real (390 caracteres, con `.` y `-`) no pasaba la forma escrita de memoria (#329).** Causa: se validó sin ver uno real. Arreglo: `[A-Za-z0-9_.-]`, con test; visto en vivo.
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
  `enforce_admins` bloquearía el `git push` de un cron. Arreglo: no
  tocar la clásica y poner los checks en un ruleset, que sí admite excepciones.
- **2026-10-09 · ruleset con la app de GitHub Actions como excepción: 422
  «Actor GitHub Actions integration must be part of the ruleset source or owner
  organization».** Causa: el repo es personal, no de una
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

- Rotar o retirar la clave de la App de las sesiones, y volver a entrar con `gh auth login` (la sesión de la persona está cerrada; la cierra otra vez al acabar).
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

Fechas que estaban repartidas por el cuerpo (#411): las formas de excepción de antes de #621 («Tests relajados:», «Tamaño:», «Aprendizaje:») valen con aviso hasta el 15 nov 2026. Las fechas del repo de un proyecto (rama por defecto, rulesets), en su ficha.

Comprobado el 2026-10-11 (#551): los drivers `generado` y `json-claves` con git 2.52 en repos de prueba (`ops/generados.test.js`, visto fallar sin las líneas de `.gitattributes`); sin comprobar: una fusión real entre dos PR ni `gh pr update-branch` con un generado desfasado.

Comprobado el 2026-10-10 (#341): `cumplimiento.mjs` contra la API real de issues y con tests (cada indicador visto fallar); sin comprobar: `flujo-semanal.yml` y el paso «Higiene de las skills del PR» en GitHub de verdad.

Comprobado el 2026-10-09: la línea «Casos:» (#185), con tests y datos sintéticos en local, sin probarla aún en un PR real de GitHub ni la API desde el runner.

Comprobado el 2026-10-09: en #193, `dependabot-auto.yml` pasa `actionlint` 1.7.12; en ensayo contra el repo, #169 sale `grupo-manual` y #288 (en `/dish-gallery`) `ficheros-fuera`, y los cerrados #165 y #167 salen menores con commits limpios; en la documentación de GitHub, que `cooldown` solo afecta a las de versión y que el primer grupo que nombra una dependencia se la queda. Sin comprobar: si un `workflow_run` tras un run de Dependabot ve los secretos del environment (la documentación no lo aclara; por eso la pasada de cada 3 h), una fusión real, que Dependabot obedezca un `@dependabot rebase` de `github-actions[bot]`. Comprobado el 2026-10-09: el formato del bypass por deploy key (`actor_id` null) en la REST de rulesets y que `actions/checkout` v7 con `ssh-key` vacío usa HTTPS y el token (su `url-helper`); los ids y las claves de un repo, en la ficha del proyecto. Comprobado el 2026-10-08: la comprobación del runbook y la puerta de lectura, con sus tests y a mano en local (sin probarlas aún en un PR real de GitHub ni con el campo `agent_type` de un subagente de verdad); la causa del borrado de carpetas, leyendo el hook y comprobando que la rama no tenía commits propios; el resto viene de la versión anterior, reordenado sin cambiar los hechos. Con el hook en modo ensayo, una carpeta con commit propio no sale como borrable. Sin probar: el borrado real con una carpeta que tenga ese commit inicial, al abrir otra sesión.
