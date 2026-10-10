# Dueño de código y rulesets (E4, #330; fondo #326)

Qué hay, qué cambia para una sesión y cómo lo aplica Pablo. Los rulesets son
ajustes de GitHub: una sesión no los cambia ni lo intenta; `scripts/rulesets.mjs`
sin argumentos solo lee. Hasta que Pablo los aplique y pruebe, todo esto es texto.

## Qué hay

- `.github/CODEOWNERS`, con `@pabloam89`:
  - `.claude/`, `.github/`, `CLAUDE.md`, `ops/DECISIONES.md` y `ops/normas.json`;
  - el script que aplica migraciones, `permisoAplicar.mjs`, `rulesets.mjs` y su test;
  - todo lo que ejecutan los workflows con secretos o environment, los hooks y el
    script de aplicar migraciones, con sus imports locales.
  `scripts/rulesets.test.js` **deriva** esa lista (de los `node scripts/…` de los
  workflows con secretos, de los comandos de `.claude/settings.json` y de los
  imports relativos) y falla si algo no tiene dueño, y si una ruta de CODEOWNERS no
  existe. Un import nuevo en un script con secretos hace fallar el test hasta que
  se añada la ruta. `supabase/migrations/` no está: la sesión aplica con juez y
  ensayo (decisión del 8 oct, `ops/DECISIONES.md`).
- `main`, dos rulesets: (a) «main: PR y tests», PR y check `tests`, sin bypass; (b)
  «main: solo Pablo fusiona», regla `update` (restringir actualizaciones) con bypass
  solo del rol Administrador y solo en modo `pull_request`. Sin aprobación de dueño
  en `main`: fusiona quien tiene el bypass, es decir, Pablo desde el botón del PR.
- `staging` (el ruleset 24770007 de hoy): `tests`, la deploy key exenta y, además,
  PR con revisión de dueño y 0 aprobaciones generales. Sin otro bypass: uno
  también saltaría `tests`.
- `mercadona-sync.yml`: antes de usar la deploy key comprueba que hay como mucho un
  commit y que solo cambia `public/store/mercadona.json` y
  `src/data/derived/recipeCoste.json`; y `npm ci --ignore-scripts`.

## Por qué staging no se condiciona por ruta en el ruleset

Un ruleset de rama no tiene condición por ruta: la regla `pull_request` vale para
todos los PR de la rama. El filtro sale de CODEOWNERS: con `require_code_owner_review`
activo, GitHub pide la aprobación del dueño solo a un PR que cambia ficheros con
dueño. Con 0 aprobaciones generales, el resto se fusiona con `tests`.

Sin comprobar a 10 oct 2026: que GitHub haga cumplir la revisión de dueño con 0
aprobaciones generales, y el nombre exacto del parámetro de la regla `update`
(`update_allows_fetch_and_merge`). Por eso la prueba de abajo va antes de dar la
norma por cumplida. Si la revisión de dueño no se cumple en `staging`:

- A (recomendada): dejar `staging` como hoy y proteger solo `main`.
- B: la regla `file_path_restriction`, que sí mira rutas pero bloquea en vez de
  pedir aprobación; sin comprobar si un repo personal público la admite.
- C: un paso del CI que falle si el PR toca esas rutas sin aprobación.

## Lo que cambia para una sesión (cuando se aplique y se pruebe)

- Un PR a `staging` que toca esas rutas queda esperando a Pablo, con el CI en
  verde. Lo dice en el informe y no insiste.
- Pablo no puede aprobar su propio PR: los de rutas protegidas salen con la
  identidad de la App `homenu-sesiones` (E3). Uno suyo, o de la App sin clave que
  cae a su token, queda bloqueado en `staging`; no hay bypass para eso.
- Pasan a esperar a Pablo, entre otros, los cambios en `scripts/lib/issues.mjs`,
  `normas.mjs`, `flujo.mjs`, `src/lib/vocabularios.js` y `api/_bot/senales.js`, que
  eran de rutina.
- Dependabot: los PR de npm (`package*.json`) y los de actions que no tocan
  `.github/` no cambian. Los de actions tocan `.github/workflows/` y esperan a
  Pablo. `scripts/dependabot-auto.mjs` solo mira `mergeable`: intentaría fusionar,
  GitHub lo rechazaría y el workflow saldría en rojo en cada pasada hasta que
  Pablo apruebe. Sin comprobar en GitHub; arreglo pendiente en #353 (motivo
  `espera-aprobacion`).
- El cron de Mercadona empuja con la deploy key, que sigue exenta.
- `main`: fusiona solo Pablo, desde el botón del PR.

## Pasos de Pablo

Desde una terminal suya, con `gh auth status` como `pabloam89` (administrador):

1. Ver qué hay y qué cambiaría: `node scripts/rulesets.mjs` (solo lee).
2. Aplicar: `node scripts/rulesets.mjs --escribir`. Lee, comprueba que la
   credencial es de administrador, crea los dos de `main`, actualiza el de
   `staging` y los vuelve a leer. Si GitHub rechaza la regla `update`, el 422 sale
   con su `errors[]`: pásalo a la sesión.
3. Comprobar: `node scripts/rulesets.mjs` debe acabar con tres líneas `ok` y
   código 0; `gh api repos/pabloam89/MenuPlan/rules/branches/staging` muestra
   `pull_request` y `required_status_checks`.
4. Probar en `staging`: un PR que cambie un comentario de `.github/CODEOWNERS`
   queda en «Review required»; uno que cambie un comentario en `src/` se fusiona
   con `tests`. Probar en `main`: un PR de una sesión no se puede fusionar y el
   botón de Pablo (bypass) sí.
5. Deshacer: Settings → Rules → Rulesets → desactivar «main: PR y tests» y «main:
   solo Pablo fusiona», y quitar «Require a pull request» del de `staging`.
