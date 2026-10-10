# Dueño de código y rulesets (E4, #330; fondo #326)

Qué hay, qué cambia para una sesión y cómo lo aplica Pablo. Los rulesets son
ajustes de GitHub: una sesión no los cambia ni lo intenta; `scripts/rulesets.mjs`
sin argumentos solo lee.

## Qué hay

- `.github/CODEOWNERS`: `@pabloam89` en `.claude/`, `.github/`,
  `scripts/apply-migration.mjs`, `scripts/lib/permisoAplicar.mjs`,
  `scripts/rulesets.mjs` y `ops/normas.json`. `scripts/rulesets.test.js` falla si
  una ruta no existe. `supabase/migrations/` no está: la sesión aplica con juez y
  ensayo (decisión del 8 oct, `ops/DECISIONES.md`); lo que sí protege es el
  script que las aplica.
- Ruleset de `main` («main: dueño de código»): PR, check `tests` y 1 aprobación de
  dueño de código. Sin bypass para nadie.
- Ruleset de `staging` (el 24770007 de hoy): `tests`, la excepción de la
  deploy key y, además, PR con revisión de dueño y 0 aprobaciones generales.

## Por qué staging no se condiciona por ruta en el ruleset

Un ruleset de rama no tiene condición por ruta: la regla `pull_request` se aplica
a todos los PR de la rama. El filtro por ruta sale de CODEOWNERS: con
`require_code_owner_review` activo, GitHub pide la aprobación del dueño solo a un
PR que cambia ficheros con dueño. Con 0 aprobaciones generales, el resto se
fusiona solo con `tests`. Sin comprobar a 10 oct 2026: que GitHub haga cumplir la
revisión de dueño con 0 aprobaciones (la documentación lo describe por ficheros,
no por cuenta). Se prueba con un PR que solo cambie un comentario de
`.github/CODEOWNERS`: tiene que salir bloqueado («Review required»).

Si no se cumple, opciones:

- A: dejar `staging` como hoy y proteger solo `main` (la promoción a producción
  ya pasa por Pablo). Lo recomendado si la prueba falla.
- B: la regla `file_path_restriction` del ruleset, que sí mira rutas; sin
  comprobar si un repo personal público la admite, y bloquea el cambio en vez de
  pedir aprobación.
- C: un paso del CI que falle si el PR toca esas rutas sin la aprobación.

## Lo que cambia para una sesión

- Un PR que toca esas rutas queda esperando a Pablo, con el CI en verde. Lo dice
  en el informe y no insiste.
- Pablo no puede aprobar su propio PR: los de rutas protegidas salen con la
  identidad de la App `homenu-sesiones` (E3). Si Pablo abre uno a mano, o la App
  no tiene clave y la sesión cae a su token, queda bloqueado; la salida es
  `--bypass-admin` (el rol Administrador fusiona por el botón del PR). Es una
  excepción para una persona, no para la App; hay que decidirla.
- Dependabot: los PR de npm (`package*.json`) y los de actions que no tocan
  `.github/` no cambian. Los de actions tocan `.github/workflows/` y esperan a
  Pablo. `scripts/dependabot-auto.mjs` no mira si falta una aprobación (solo
  `mergeable`, líneas 290-291): intentaría fusionar, GitHub lo rechazaría y el
  workflow saldría en rojo en cada pasada hasta que Pablo apruebe. Sin comprobar
  en GitHub; arreglo pendiente en #353: un motivo `espera-aprobacion` en el
  script, con test. Es la opción 1 de #353, sin excepción para la App
  `homenu-dependabot-merge`.
- El cron de Mercadona empuja con la deploy key, que sigue exenta.
- `main`: ningún PR sin aprobación de Pablo. Los suyos, con `--bypass-admin` o
  con la App como autora.

## Pasos de Pablo

Desde una terminal suya, con `gh auth status` como `pabloam89` (administrador):

1. Ver qué hay y qué cambiaría: `node scripts/rulesets.mjs` (solo lee).
2. Aplicar: `node scripts/rulesets.mjs --escribir` (o con `--bypass-admin`). Lee
   los rulesets, comprueba que la credencial es de administrador, crea el de
   `main`, actualiza el de `staging` y los vuelve a leer.
3. Comprobar: `node scripts/rulesets.mjs` debe acabar con las dos líneas `ok` y
   código de salida 0; `gh api repos/pabloam89/MenuPlan/rules/branches/main` y
   `.../staging` muestran la regla `pull_request`.
4. Probar: un PR que cambie un comentario de `.github/CODEOWNERS` queda
   bloqueado hasta aprobarlo; uno que cambie solo un comentario de `src/` se
   fusiona con `tests`.
5. Deshacer: Settings → Rules → Rulesets → «main: dueño de código» → Disable, y
   en el de `staging`, quitar la regla «Require a pull request».
