# La foto publicada de los issues (fondo #326, cupo de GitHub)

## Qué es

Un fichero, `issues.json`, con el estado de TODOS los issues, que el workflow `foto-issues.yml` deja cada pocos minutos en la rama
`foto/issues` (un solo commit raíz, reescrito con `--force` cada vez). `npm run issues` y `npm run situacion` lo leen por
`https://raw.githubusercontent.com/pabloam89/MenuPlan/foto/issues/issues.json` (repo público: 0 puntos de la App de las sesiones) en vez de pedir
~1,1 puntos de GraphQL por issue (medido el 14 oct 2026: 414 issues, 486 puntos por lectura completa; `situacion` con 5 páginas de 107, 535).

- Contenido: los nodos de GraphQL tal cual (`CAMPOS_ISSUE` de `scripts/lib/issues.mjs`), más `version`, `generado_en`, `completa_en`, `total` y `refrescados`. Pesa ~1,9 MB.
- Escritor: `scripts/foto-issues.mjs` (lógica y consultas en `scripts/lib/fotoIssues.mjs`); lector: `nodosDeLaFoto()` del mismo módulo. Una sola fuente de la versión y de los campos; `scripts/fotoIssues.test.js` los compara con el workflow.
- Presupuesto: el `GITHUB_TOKEN` del workflow, **1.000 puntos por hora y repositorio** (docs de GitHub, «Rate limits for the GraphQL API»). Incremental: una consulta de 1 punto con lo cambiado
  desde la foto anterior, solo esos issues por id (1 punto por id), sus vecinos (padre e hijos) si cambió algo que copian (estado, etiquetas, padre) y una rotación de 8 issues por pasada que cura la deriva. Pasada sin cambios: ~10 puntos
  (~120 por hora). La lectura completa (~490) solo si no hay foto previa o es de otra versión, y no empieza con menos de 600 puntos libres.
- Cada pasada deja una línea `foto-issues modo: incremental total: … cambiados: … puntos: … restantes: …` (registrada en `ops/metricas.json`) para ver lo que gasta del 1.000.
- Permisos: `contents: write` (empujar la rama) e `issues: read`. Sin la App de las sesiones ni secretos. El código sale de `staging`; nada del texto de un issue entra en un `run:`.
- La rama no tiene ruleset ni protección (mirado el 14 oct 2026: los rulesets solo cubren `main` y `staging`). El commit lleva un `vercel.json` con `git.deploymentEnabled: false`; **sin comprobar** en Vercel que no despliegue (mira «Deployments» de `homenu` tras el primer run).

## Puesta en marcha (la hace Pablo)

La App `homenu-sesiones` no tiene el permiso `workflows`: GitHub rechaza el push de cualquier fichero de `.github/workflows/` («refusing to allow a GitHub App to create or update workflow … without `workflows` permission», 14 oct 2026). Por eso el workflow espera en `ops/workflows-pendientes/foto-issues.yml` y, hasta que se mueva, los lectores van a la API (la rama no existe). Pablo, desde una PowerShell, en la carpeta de la tarea o en una copia al día de `staging`: `git mv ops/workflows-pendientes/foto-issues.yml .github/workflows/foto-issues.yml`, commit y push con sus credenciales; luego `gh workflow run foto-issues.yml --ref staging` y comprobar que aparece la rama `foto/issues`. Fuera de esa carpeta de espera, `ops/workflows-pendientes/` debe quedar vacía.

## Cómo lee el lector

1. Baja la foto (con un `?c=<ms>` para saltar la caché de raw, que dura 5 min) y la acepta solo si `version` es la suya, la forma cuadra y `generado_en` tiene menos de 15 min (`MAX_MIN_FOTO`).
2. La pone al día con los issues cambiados después de generarla (REST `issues?since=`, 0 puntos GraphQL): estado, etiquetas, título, cuerpo, asignados y los issues nuevos. Padre, hijos, PR que lo cierran y comentarios se quedan como en la foto hasta la siguiente.
3. **Para escribir sobre un issue** (`--colgar`, `--nuevo`, `--ordenar`) la foto solo vale si se pudo poner al día; si no, va a la API.
4. Si algo falla (sin rama, otra versión, vieja, `--fresco`, `MENUPLAN_FOTO=0`), usa la API como antes y lo dice en una línea. `MENUPLAN_FOTO_ARCHIVO=<ruta>` lee la foto de un fichero (pruebas).
5. Deja una línea en `gh.log` con `api=foto` (`resultado=ok` si sirvió, `error` si cayó a la API) y 0 puntos: `npm run cuota -- --horas` compara lo que gasta cada origen antes y después.

## Cómo quitarla

Borrar `.github/workflows/foto-issues.yml` y la rama `foto/issues` (borrar ramas es de Pablo: `gh api -X DELETE repos/pabloam89/MenuPlan/git/refs/heads/foto/issues`). Los lectores vuelven a la API solos, sin romper nada
(test «LIMPIEZA» de `scripts/fotoIssues.test.js`). Si la foto se estropea, el remedio rápido es `MENUPLAN_FOTO=0` en el entorno o vaciar la rama y relanzar el workflow (`gh workflow run foto-issues.yml --ref staging`).

## Qué no cubre

`avisos.mjs` (hook, `gh issue list`, 1 por sesión), `fabrica`, `planos` y `cumplimiento` (estos últimos en CI con su propio token) siguen con su consulta. Los cron de GitHub se retrasan: si la foto pasa de 15 min con frecuencia,
los lectores vuelven a la API y el ahorro baja; el disparo por evento de issue la mantiene fresca cuando se trabaja.
