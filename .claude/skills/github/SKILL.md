---
name: github
description: Úsala cuando el CI de GitHub esté en rojo, un workflow o un cron de Actions falle o no arranque, haya que mirar los checks o los logs de un PR, una carpeta de trabajo desaparezca sola, o se toque la protección de ramas, Dependabot, el secret scanning o los secretos de Actions. No para: despliegues (vercel) ni migraciones (agente datos).
---

# GitHub

## Qué es y dónde

- **Repo** `pabloam89/MenuPlan`, **público**. Rama por defecto: `staging`
  (desde el 7 oct 2026). `main` es producción.
- **Protección de ramas** (desde el 7 oct, también para administradores):
  - `main`: solo por PR con el check `tests` en verde; sin force push ni
    borrado.
  - `staging`: sin force push ni borrado, pero **admite push directo**, porque
    el cron de Mercadona empuja ahí. El «solo por PR» lo pone la guardia de
    Claude, no GitHub.
- **Workflows** (`.github/workflows/`):

| Workflow | Cuándo | Qué hace |
|---|---|---|
| `tests.yml` | PR a `staging` o `main`, push a `staging`, a mano | lint con línea base, tests y build. Es el check `tests` |
| `mercadona-sync.yml` | lunes 06:15 UTC, a mano | precios de Mercadona; commitea y **empuja a `staging`** |
| `agente-fallos.yml` | cada día 06:20 UTC, a mano | agente de fallos de generación (`.claude/routines/fallos-generacion.md`) |
| `bot-semanal.yml` | lunes 06:40 UTC, a mano | informe semanal de Lola |
| `ios-testflight.yml` | solo a mano | build de iOS a TestFlight |

- **`tests.yml` en detalle:** Node 24 y 20 minutos de tope. El lint
  (`npm run lint:base`, `scripts/lint-base.mjs`) falla solo con errores
  **nuevos** respecto a `lint-base.json`. Los tests corren sin
  `src/lib/solver.test.js`, que está fuera a propósito. El build no usa
  secretos.
- **Seguridad** (desde el 8 oct): secret scanning con push protection, alertas
  de Dependabot y PRs de seguridad automáticos. Las actualizaciones de versión
  van en `.github/dependabot.yml`: semanales, contra `staging`, agrupadas y con
  un tope de 3 PRs.
- **Carpetas de trabajo** (worktrees): `npm run tarea` las crea y `npm run
  retirar` las cierra. Un hook personal de Pablo (`~/.claude/hooks/limpiar-worktrees.mjs`)
  borra solo las que ve **fusionadas y limpias**, tras cada `gh pr merge` y al
  abrir cualquier sesión.

## Claves y accesos

Los secretos de Actions (`ANTHROPIC_API_KEY`, `OPS_DB_URL`,
`CALLMEBOT_DESTINOS`, y los de iOS) y qué workflow usa cada uno están en
`ops/INVENTARIO.md`, que es la tabla que manda. `tests.yml` no usa ninguno. La
CLI `gh` va con la sesión de Pablo (`gh auth status`).

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
| Ver la seguridad del repo | `gh api repos/pabloam89/MenuPlan -q .security_and_analysis` | secret scanning y push protection en `enabled` |
| Ramas fusionadas que se borrarían (ensayo) | `npm run podar` | la lista, sin borrar nada |
| Borrarlas (OK) | `npm run podar -- --si` | GitHub y locales con `-d`; lo no fusionado sale como «decide Pablo» |
| ¿Está en staging? | `git fetch origin` y mirar `origin/staging`, nunca el upstream de tu rama | el commit o la ausencia |
| CI en rojo: reproducir un test | `npx vitest run <fichero>` | el mismo fallo que en el CI |

- **Ramas viejas:** GitHub borra la rama al fusionar el PR
  (`delete_branch_on_merge`), pero las de antes del 8 oct 2026 se quedaron.
  `scripts/podar.mjs` borra solo las fusionadas enteras en `origin/staging`,
  sin PR abierto, de hace más de 1 día y sin worktree.

### Issues: lecciones, decisiones y encargos

Lo que no se cierra en una sesión vive en un issue: sobrevive al reinicio, lo
ven Álvaro y las sesiones de la nube, y con las mismas etiquetas siempre se
puede contar qué falla más. La clasificación tiene una sola fuente,
`scripts/lib/issues.mjs`; los formularios de `.github/ISSUE_TEMPLATE/` salen
de ella y `scripts/issues.test.js` vigila que no se separen.

| Grupo | Valores | Cuándo |
|---|---|---|
| `tipo:` | `leccion`, `decision`, `encargo` | siempre, uno |
| `causa:` | `vigilante-falso`, `vigilante-hueco`, `entorno`, `limpieza`, `coordinacion`, `modelo-datos`, `codigo` | toda lección |
| `area:` | `datos`, `lola`, `ui`, `catalogo`, `motor`, `ops` | siempre |
| `arreglo:` | `test`, `guardia`, `script`, `regla`, `skill`, `ninguno` | al cerrar una lección: dónde quedó |

```
gh issue create --title "[lección] …" --label tipo:leccion,causa:entorno,area:ops --body-file <fichero>
gh issue create --title "[decisión] …" --label tipo:decision,area:datos --body-file <fichero>
gh issue edit <n> --add-assignee @me        # coger un encargo (o «Quién lo coge» en el cuerpo)
gh issue close <n> --comment "Queda en el PR #n"     # solo si no lo cerró el PR; antes: --add-label arreglo:test
gh issue reopen <n> --comment "Vuelve a pasar: …"     # una lección que reincide se reabre, no se duplica
npm run issues                              # abiertos, lecciones por causa y por agente, sin trazar
npm run issues -- --ordenar                 # etiquetas que faltan, leídas de un formulario
npm run issues -- --etiquetas               # crear las etiquetas en GitHub (OK de Pablo)
```

- **El cuerpo de una lección:** cuándo, qué pasó (esperado frente a real),
  evidencia (comando y salida, PR, fichero:línea) y dónde debería quedar el
  arreglo. El de una decisión: la pregunta en llano, las opciones con la
  recomendada primero y qué pasa si no se decide.
- **La traza no se rellena: se deduce.** Fechas, reaperturas, asignados y el
  issue padre los guarda GitHub. Quién arregló sale del PR que cierra: lleva
  `Closes #n` y una línea `Agente: <nombre>` (o `sesión`); la plantilla de PR
  los trae. Si se cierra a mano, «PR #n» en el comentario de cierre. Un
  seguimiento que deja una lección se abre como sub-issue de ella.
- **Si una lección vuelve a pasar, se reabre la misma.** Las reaperturas son
  la cuenta de «arreglo que no aguantó», por causa y por agente.
- **Una categoría nueva** se añade en `scripts/lib/issues.mjs` con su
  descripción, se regeneran las etiquetas y se pone en el formulario. Si algo
  no encaja en ninguna causa, primero se mira si es una de las que hay; una
  clasificación que crece sin control deja de servir para contar.
- **El repo es público:** ni claves, ni datos de familias, ni un fallo de
  seguridad que se pueda aprovechar. Eso va a Pablo en privado.
- **Antes de empezar un encargo**, `npm run issues`: si ya está cogido, no se
  duplica.

## Lo que falló y por qué

- **2026-10-08 · la carpeta de trabajo recién creada desaparece sola y queda un
  directorio huérfano sin `.git`, con `node_modules` a medio borrar.** Pasó dos
  veces; la segunda, con `npm ci` todavía instalando. Causa:
  `limpiar-worktrees.mjs` da por «fusionada» cualquier rama que sea ancestro de
  `origin/staging`, y una rama nueva sin commits lo es. Se ejecuta al abrir
  *cualquier* sesión, así que otra sesión arrancando se la lleva por delante.
  Arreglo: `npm run tarea` hace ahora un commit vacío (`tarea: arranca <rama>`)
  nada más crear la rama, antes de copiar el entorno y de instalar nada, y
  `retirar` no lo cuenta como trabajo sin subir (test en `scripts/tarea.test.js`).
  Para una carpeta anterior a ese cambio, a mano:
  `git commit --allow-empty -m "tarea: arranca <rama>"`. Y el hook ya solo borra
  ramas que se subieron con su nombre (`git push -u`) y luego se fusionaron
  (`scripts/limpiar-worktrees.test.js`); la copia que corre está en
  `~/.claude/hooks/` de cada PC y se actualiza a mano desde `scripts/`.
  Si pasa igual, los restos huérfanos no los trata ni `tarea` ni `retirar`: los
  borra Pablo, tras mirar que `node_modules` no es una unión, y antes hay que
  parar el `npm ci` que siga vivo (`taskkill /T` sobre su `tarea.mjs`).
- **2026-10 · el PR que abre el token de Actions no lanza `tests.yml`.** Causa:
  un PR abierto con `GITHUB_TOKEN` no dispara otros workflows. Arreglo: lanzarlo
  a mano con `gh workflow run tests.yml --ref <rama>`. Es lo que frena la
  pendiente 11 de `ops/INVENTARIO.md` (que el cron de Mercadona abra PR en vez
  de empujar).
- **2026-10-08 · `gh` colgado con «TLS handshake timeout»** al activar
  Dependabot. Causa: la red, no el comando. Arreglo: reintentar; si un `gh` pasa
  de 60 s sin responder, se corta con `timeout 60 gh …` y se repite.
- **2026-10 · `git worktree remove` falla en Windows con «Filename too long».**
  Causa: rutas largas dentro de `node_modules`. Arreglo: las carpetas se cierran
  con `npm run retirar -- <nombre>`, o se le da a Pablo el comando para que lo
  lance él con `!`.

## Qué requiere el OK de Pablo

- Cualquier ajuste del repo: protección de ramas, visibilidad, rama por
  defecto, Dependabot o secret scanning, y los secretos de Actions.
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

Comprobado el 2026-10-08: la causa del borrado de carpetas, leyendo el hook y comprobando que la rama no tenía commits propios; el resto viene de la versión anterior, reordenado sin cambiar los hechos. Con el hook en modo ensayo, una carpeta con commit propio no sale como borrable. Sin probar: el borrado real con una carpeta que tenga ese commit inicial, al abrir otra sesión.
