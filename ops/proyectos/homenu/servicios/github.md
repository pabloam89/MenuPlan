# GitHub en HoMenu (ficha de proyecto)

Los datos de HoMenu de la skill `github` (`.claude/skills/github/SKILL.md`, el método de la casa): el repo, su protección de ramas, los workflows y los secretos que son del proyecto, la identidad de las sesiones y lo que se decidió aquí. Se piden con `--proyecto homenu` (`npm run skills-encargo -- … --proyecto homenu`). Lado: vertical (`ops/lados-ficheros.json`). Nunca valores de claves: solo nombres y dónde viven.

## Qué hay

- **Repo** `pabloam89/MenuPlan`, **público**. Rama por defecto: `staging` (desde cuándo, en «Fechas» de abajo). `main` es producción.
- **Protección de ramas** (desde el 7 oct, también para administradores):
  - `main`: solo por PR con el check `tests` en verde; sin force push ni borrado. Con los rulesets de #330 (aplicados), solo fusiona Pablo (bypass).
  - `staging`: sin force push ni borrado (protección clásica) y el **ruleset «staging: tests obligatorios»**: nada entra sin `tests` en verde, ni por PR ni por push, tampoco Pablo. Solo se lo saltan las deploy keys, y la única es la del cron de Mercadona, cuyo secreto vive en el environment `mercadona-sync` (solo rama staging). Decidido y activo (id 24770007; día en «Fechas»), sin exigir la rama al día. Sin aprobación humana ni dueño de código (#608): `.claude/skills/github/referencias/duenos-de-codigo.md`.
- **Workflows del proyecto** (`.github/workflows/`; los de la casa —`tests.yml`, `fondos.yml`, `planos-semanal.yml`, `flujo-semanal.yml`, `dependabot-auto.yml`— están en la skill):

| Workflow | Cuándo | Qué hace |
|---|---|---|
| `mercadona-sync.yml` | lunes 06:15 UTC, a mano (con `probar_push`, un commit vacío si no hay precios nuevos) | precios de Mercadona; commitea y **empuja a `staging` con la deploy key** (sin el secreto, con el token). Ese push sí lanza `tests` |
| `agente-fallos.yml` | cada día 06:20 UTC, a mano | agente de fallos de generación (`.claude/routines/fallos-generacion.md`) |
| `bot-semanal.yml` | lunes 06:40 UTC, a mano | informe semanal de Lola |
| `vigia-lola.yml` | cada 15 min (`4,19,34,49`), a mano | el vigía de Lola (#267): fallos `bot_fallo` de los logs de Vercel, el canario y los avisos al grupo de Telegram «HoMenu avisos». Su estado va en la caché de Actions (`vigia-estado-*`); borrarla solo cuesta un aviso repetido. Sin `VERCEL_TOKEN` ni `CANARIO_SECRET` se salta. Sus secretos y variables, en el environment `vigia` (solo `staging`) |
| `ios-testflight.yml` | solo a mano | build de iOS a TestFlight |

- **Seguridad** (desde el 8 oct): secret scanning con push protection, alertas de Dependabot y PRs de seguridad automáticos. Versiones: `.github/dependabot.yml`, semanal, contra `staging`, tope de 3 PRs, cooldown de 5 días (no afecta a los de seguridad) y grupos `-menores`, `-mayores` y `npm-cero` (las 0.x directas: `CERO` del script; un PR suelto de una de ellas también espera) (#193).
- **Ramas viejas:** GitHub borra la rama al fusionar el PR (`delete_branch_on_merge`), pero las de antes del cambio (día en «Fechas») se quedaron.

## Claves y accesos

Los secretos de Actions (`ANTHROPIC_API_KEY`, `OPS_DB_URL`, `CALLMEBOT_DESTINOS`, `MERCADONA_DEPLOY_KEY`, los del vigía, los de iOS y la clave de la App `homenu-dependabot-merge`) y qué workflow usa cada uno están en `ops/INVENTARIO.md`, que es la tabla que manda. `tests.yml` no usa ninguno.

**Identidad de las sesiones (#329).** El arranque canjea la clave de la App `homenu-sesiones` por un token de 1 hora, guardado y reutilizado entre sesiones (Bash; en PowerShell, `node scripts/token-sesion.mjs -- <comando>`). La guardia niega quitar o vaciar el token, `git -c credential.…` y cambiar reglas del repo o aprobar PR (#447). El detalle (crear la App, pedir su token, revocarla), en `.claude/skills/github/referencias/app-sesiones.md`.

## Operaciones del proyecto

| Qué | Comando | Debe salir |
|---|---|---|
| Reglas que aplican a `staging` | `gh api repos/pabloam89/MenuPlan/rules/branches/staging` | un `required_status_checks` con `tests` (más los de la protección clásica); `node scripts/rulesets.mjs` (solo lee) compara `main` y `staging` con lo deseado |
| Deploy keys del repo | `gh repo deploy-key list` | una, «mercadona-sync: cron, push a staging», `read-write` |
| Environment del cron | `gh api repos/pabloam89/MenuPlan/environments/mercadona-sync/deployment-branch-policies -q '.branch_policies[].name'` y `gh secret list --env mercadona-sync` | `staging` y `MERCADONA_DEPLOY_KEY`. Si un workflow nombra un environment que no existe, GitHub lo crea **sin política**: se crea antes a mano |
| Probar el push del cron sin esperar al lunes | `gh workflow run mercadona-sync.yml --ref staging -f probar_push=true` y `gh run watch` | el paso «Commitear» dice `Empujo con la deploy key a staging`, aparece en `origin/staging` el commit «prueba de push» (o el del catálogo, si hay precios nuevos) y un run de `tests` con evento `push` sobre él |
| Rotar la clave de la App `homenu-dependabot-merge` (OK) | Settings → Developer settings → GitHub Apps → la App → «Generate a private key» (baja un `.pem`); ese `.pem` sustituye al Documento `HoMenu/GitHub App dependabot-merge` de 1Password; `env -u OP_SERVICE_ACCOUNT_TOKEN op document get "GitHub App dependabot-merge" --vault HoMenu \| gh secret set DEPENDABOT_APP_KEY --env dependabot-auto`; `gh workflow run dependabot-auto.yml --ref staging`; y solo si sale `clave-app: si`, borrar la vieja en la App y el `.pem` del disco | el log dice `clave-app: si`; en la App queda una sola clave |
| Crear la App de las sesiones `homenu-sesiones` (OK; Pablo, #327), pedir su token, revocarla | pasos, comprobación y revocación en `.claude/skills/github/referencias/app-sesiones.md`; el token: `node scripts/op.mjs document get "GitHub App homenu-sesiones" --vault HoMenu-sesiones \| node scripts/token-sesiones.mjs` | el token de 1 hora por la salida estándar, para `GH_TOKEN`; no sale en pantalla |
| Ver la seguridad del repo | `gh api repos/pabloam89/MenuPlan -q .security_and_analysis` | secret scanning y push protection en `enabled` |
| Merge de un PR a `staging` | `gh pr merge <n> --merge` | `Merged`; la guardia vigila que no sea a `main` |

## Lo que falló y por qué

- **2026-10-09 · exigir `tests` en `staging` con la protección clásica: 404 «Required status checks not enabled».** Causa: el PATCH a `branches/staging/protection/required_status_checks` solo edita checks que ya existen; para activarlos hay que reescribir la protección entera con PUT. Y aunque se hiciera, la protección clásica no tiene excepciones por actor: con `enforce_admins` bloquearía el `git push` del cron de Mercadona. Arreglo: no tocar la clásica y poner los checks en un ruleset, que sí admite excepciones.
- **2026-10-09 · ruleset con la app de GitHub Actions como excepción: 422 «Actor GitHub Actions integration must be part of the ruleset source or owner organization».** Causa: el repo es personal (`pabloam89`), no de una organización, y en un repo personal no se puede eximir a la integración de Actions (ni a `OrganizationAdmin`); eximir al rol de administrador tampoco sirve, porque las sesiones usan el token de Pablo y se saltarían la regla. Arreglo: el cron empuja con una **deploy key** de escritura y el ruleset exime a `DeployKey` (`actor_id: null`, `bypass_mode: always`; `pull_request` no vale para deploy keys). Fuente: «Create a repository ruleset» en la REST de GitHub. De paso, el push con la deploy key sí lanza `tests` (el del `GITHUB_TOKEN` no).
- **2026-10 · el PR que abre el token de Actions no lanza `tests.yml`.** La pendiente 11 de `ops/INVENTARIO.md` (que el cron abra PR) la sustituyó la deploy key.

## Qué requiere el OK de Pablo, aquí

- Rotar o retirar la clave de la App `homenu-sesiones`, y volver a entrar con `gh auth login` (su sesión está cerrada; la cierra otra vez al acabar, y el registro está en app-sesiones.md).
- Una deploy key de escritura se salta el ruleset de `staging`: no se crea otra sin más.
- Cambiar un workflow que escribe en el repo o usa secretos (`mercadona-sync`, `vigia-lola`, `dependabot-auto`).

## Coste y fechas

Repo público: los minutos de Actions no cuentan. Si pasa a privado (pendiente 10 del inventario) empiezan a contar (medido el 7 oct: ~600 de 2.000 minutos al mes) y, en Vercel, un commit de un autor que no es miembro del equipo deja el despliegue «Blocked» (ver la skill `vercel`). Hay que mirarlo antes de cambiar la visibilidad. Dependabot, secret scanning y push protection no tienen coste.

Fechas que estaban repartidas por el cuerpo de la skill (#411): rama por defecto `staging` desde el 7 oct 2026; el ruleset «staging: tests obligatorios» se decidió el 9 oct 2026; las formas de excepción de antes de #621 («Tests relajados:», «Tamaño:», «Aprendizaje:») valen con aviso hasta el 15 nov 2026; `delete_branch_on_merge` rige desde el 8 oct 2026 (las ramas anteriores se quedaron).

## Comprobado

Comprobado el 2026-10-09: en #193, en ensayo contra el repo, #169 sale `grupo-manual` y #288 (en `/dish-gallery`) `ficheros-fuera`, y los cerrados #165 y #167 salen menores con commits limpios; el ruleset 24770007 de `staging` activo, exige `tests` y no pide la rama al día. Sin comprobar: si un `workflow_run` tras un run de Dependabot ve los secretos del environment (la documentación no lo aclara; por eso la pasada de cada 3 h), una fusión real, que Dependabot obedezca un `@dependabot rebase` de `github-actions[bot]`. Comprobado el 2026-10-09: el formato del bypass por deploy key (`actor_id` null) en la REST de rulesets; que hoy hay 0 rulesets y 0 deploy keys, y que el check de `main` es `tests` de la app 15368. Sin comprobar: el ruleset y la deploy key creados de verdad, y que el push de la key lance `tests` (lo dirá la prueba con `probar_push`).
