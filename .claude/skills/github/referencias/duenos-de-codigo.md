# Sin aprobación humana y rulesets (E4, #330; cambiado por #608)

Qué hay, qué cambia para una sesión y cómo lo aplica Pablo. Los rulesets son
ajustes de GitHub: una sesión no los cambia ni lo intenta; `scripts/rulesets.mjs`
sin argumentos solo lee.

## Decisión (11 oct 2026, #608)

Pablo quitó la revisión de dueño de código: **ningún PR a `staging` espera la
aprobación de una persona**. Se borró `.github/CODEOWNERS` y el ruleset de `staging`
ya no lleva la regla `pull_request`. Motivo: un PR (#605) quedaba bloqueado
esperando a Pablo, que no quiere ser el cuello de botella.

## Qué hay

- `main`, dos rulesets: (a) «main: PR y tests», PR (0 aprobaciones, sin revisión de
  dueño) y check `tests`, sin bypass; (b) «main: solo Pablo fusiona», regla `update`
  con bypass solo del rol Administrador y solo en modo `pull_request`. Fusiona quien
  tiene el bypass: Pablo, desde el botón del PR.
- `staging`: solo el check `tests` y la deploy key exenta (el cron de Mercadona).
  Sin otro bypass: uno también saltaría `tests`.
- `mercadona-sync.yml`: antes de usar la deploy key comprueba que hay como mucho un
  commit y que solo cambia `public/store/mercadona.json` y
  `src/data/derived/recipeCoste.json`; y `npm ci --ignore-scripts`.
- `scripts/rulesets.test.js` vigila que ningún ruleset deseado pida aprobaciones ni
  revisión de dueño y que no vuelva a existir un `CODEOWNERS`.

## Qué control queda (sin adornos)

- Lo que **hace cumplir GitHub**: `tests` en verde en `staging` y en `main`, y que a
  `main` solo fusione Pablo.
- Lo que **es de proceso**: el juez `revisor` («quien construye no juzga») y el
  `Runbook:`, `Casos:` y `Agente:` del PR, que comprueba el CI. Nada impide fusionar a
  `staging` un cambio de `.claude/`, `.github/`, los hooks o un script con secretos sin
  que lo haya mirado el juez. Un check «Juez:» en el cuerpo del PR (#612) queda como
  encargo, no construido; sería contra el olvido, no contra el abuso (quien quiera
  saltárselo escribe la línea sin haber pasado por el juez).
- Una sesión con la App `homenu-sesiones` sigue sin poder aprobar un PR (la guardia lo
  niega, #447) ni cambiar reglas del repo.

## Pasos de Pablo

Desde una terminal suya, con `gh auth status` como `pabloam89` (administrador):

1. Ver qué cambiaría: `node scripts/rulesets.mjs` (solo lee).
2. Aplicar: `node scripts/rulesets.mjs --escribir`. Lee, comprueba que la
   credencial es de administrador, crea los dos de `main`, quita la regla de
   revisión del de `staging` si la tiene y los vuelve a leer. Si GitHub rechaza la
   regla `update`, el 422 sale con su `errors[]`: pásalo a la sesión.
3. Comprobar: `node scripts/rulesets.mjs` debe acabar con tres líneas `ok` y
   código 0; `gh api repos/pabloam89/MenuPlan/rules/branches/staging` muestra solo
   `required_status_checks`.
4. Probar: un PR a `staging` que cambie un comentario de `.github/` se fusiona con
   `tests` en verde, sin pedir revisión. En `main`, un PR de una sesión no se puede
   fusionar y el botón de Pablo (bypass) sí.
5. Deshacer: Settings → Rules → Rulesets → desactivar «main: PR y tests» y «main:
   solo Pablo fusiona».

Sin comprobar a 11 oct 2026: el nombre exacto del parámetro de la regla `update`
(`update_allows_fetch_and_merge`) y que el ruleset 24770007 de hoy en GitHub ya
cuadre con lo deseado.

## Estado a 11 oct 2026 y orden de aplicación

La revisión de dueño de código **está viva** en `staging` (ruleset 24770007, desde
las 13:00 del 11 oct) y los dos rulesets de `main` también. Hasta que Pablo aplique
esto, un PR que toca rutas con dueño sigue pidiendo su aprobación (y `CODEOWNERS`
solo desaparece al fusionar este PR). Orden, una de dos:

- A (recomendada): Pablo ejecuta `node scripts/rulesets.mjs --escribir` desde esta
  rama, que quita la regla de revisión de `staging`; después el PR se fusiona con
  `tests` en verde, sin aprobación.
- B: Pablo aprueba este PR, se fusiona, y después aplica los rulesets.
