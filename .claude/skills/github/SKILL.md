---
name: github
description: Úsala cuando el CI de GitHub esté en rojo, un workflow o un cron de Actions falle o no arranque, haya que mirar los checks o los logs de un PR, o se toque la protección de ramas, Dependabot, el secret scanning o los secretos de Actions.
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

## Claves

Los secretos de Actions (`ANTHROPIC_API_KEY`, `OPS_DB_URL`,
`CALLMEBOT_DESTINOS`, y los de iOS) y qué workflow usa cada uno están en
`ops/INVENTARIO.md`, que es la tabla que manda. `tests.yml` no usa ninguno.

## Operaciones habituales

```
gh pr list                                  # PRs abiertos
gh pr view <n>                              # estado, rama, descripción
gh pr checks <n>                            # checks de un PR
gh pr checks <n> --watch --interval 30      # esperar a que acaben
gh run list --workflow tests.yml --limit 5  # últimos runs
gh run view <run-id> --log-failed           # solo el log de lo que falló
gh run rerun <run-id> --failed              # relanzar lo que falló
gh workflow run tests.yml --ref <rama>      # lanzar a mano (workflow_dispatch)
gh pr merge <n> --merge                     # solo a staging; la guardia lo vigila
gh api repos/pabloam89/MenuPlan -q .security_and_analysis   # seguridad, en lectura
npm run podar                               # ensayo: ramas fusionadas que borraría
npm run podar -- --si                       # borrarlas (GitHub y locales con -d)
```

- **Ramas viejas:** GitHub borra la rama al fusionar el PR
  (`delete_branch_on_merge`), pero las de antes del 8 oct 2026 se quedaron.
  `scripts/podar.mjs` borra solo las fusionadas enteras en `origin/staging`,
  sin PR abierto, de hace más de 1 día y sin worktree. Lo que no está en
  staging sale como «sin fusionar: decide Pablo» y no se toca.

- **¿Está en staging?** Se contesta con `git fetch origin` y mirando
  `origin/staging`, nunca el upstream de tu rama.
- **CI en rojo:** primero `gh run view <id> --log-failed`. Si es el lint, el
  mensaje lista el error nuevo (fichero, regla, mensaje). Si es un test, se
  reproduce en local con `npx vitest run <fichero>`.

## Lo que falló y por qué

- **El PR del token de Actions no lanza `tests.yml`.** Un PR abierto con
  `GITHUB_TOKEN` no dispara otros workflows. Arreglo: lanzarlo a mano con
  `gh workflow run tests.yml --ref <rama>`. Es lo que frena la pendiente 11 de
  `ops/INVENTARIO.md` (que el cron de Mercadona abra PR en vez de empujar).
- **`gh` colgado con «TLS handshake timeout»** (8 oct 2026), al activar
  Dependabot. Era la red, no el comando: se reintenta. Si un `gh` pasa de 60 s
  sin responder, se corta con `timeout 60 gh …` y se repite.
- **`git worktree remove` falla en Windows con «Filename too long».** Las
  carpetas se cierran con `npm run retirar -- <nombre>`, o se le da a Pablo
  el comando para que lo lance él con `!`.
- **Si el repo pasa a privado:** los minutos de Actions dejan de ser gratis sin
  límite, y en Vercel un commit de un autor que no es miembro del equipo deja
  el despliegue «Blocked». Hay que mirarlo antes de cambiar la visibilidad.

## Qué requiere el OK de Pablo

- Cualquier ajuste del repo: protección de ramas, visibilidad, rama por
  defecto, Dependabot o secret scanning, y los secretos de Actions.
- Subir o fusionar a `main`.
- Borrar ramas.
- Cambiar un workflow que escribe en el repo o usa secretos.

Comprobado el 2026-10-08.
