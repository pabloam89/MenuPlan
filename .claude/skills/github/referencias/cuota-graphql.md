# La cuota de GitHub: REST, GraphQL y quién gasta (#424, fondo #326)

## Lo que hay que saber

- GitHub da 5.000 puntos por hora y por identidad **en cada API**: REST (`core`) y GraphQL son cupos distintos.
- `gh api rate_limit` enseña el REST. **No dice la verdad sobre GraphQL**: el 10 oct 2026 enseñaba 4.656 libres con GraphQL a 0.
  Lo único que la dice: `gh api graphql -f query='{ rateLimit { limit remaining resetAt } }'`.
- Casi todo `gh issue …`, `gh pr …` y `gh label …` habla GraphQL; `gh run`, `gh workflow`, `gh secret` y `gh api repos/…` son REST.
- Una consulta GraphQL cuesta **la cantidad de peticiones que haría falta para sus listas anidadas, entre 100** (mínimo 1). Se mide
  añadiendo `rateLimit { cost remaining }` a la consulta. Medido el 10 oct 2026 (token de la App, sin otra carga):

| Consulta | Puntos |
|---|---|
| `scripts/issues.mjs` (`CONSULTA`, 100 issues con comentarios, hijos y PR), por página; son 3 páginas con ~220 issues | 106 |
| PR recientes del índice (`CONSULTA_PR_INDICE`, 60) | 1 |
| PR fusionados para «Casos:» (`CONSULTA_PR`, 50) | 1 |
| `{ rateLimit }` a secas | 1 |

Cada `npm run issues` o arranque de sesión sin caché valía **~320 puntos**: con 15 sesiones a la hora, el cupo entero.

## Quién llama a gh (inventario del 10 oct 2026)

| Quién | Qué pide | API | Frecuencia |
|---|---|---|---|
| `scripts/issues.mjs` (arranque, listado, `--indexar`) | todos los issues (3 páginas) + PR del índice | GraphQL | cada arranque de sesión: ~320 puntos. Ahora con caché de 15 min (arranque) o 10 (listado) |
| `scripts/issues.mjs` (`--nuevo`, `--colgar`, `--ordenar`) | lo mismo, sin caché, fresco, y la escritura | GraphQL | a mano; invalidan la caché |
| `scripts/issues.mjs` (listado) | PR fusionados para «Casos:» | GraphQL | 1 punto |
| `.claude/hooks/arranque.mjs` + `migraciones.mjs` | `gh pr list --state open --limit 50` con ficheros | GraphQL | 1 por sesión, pocos puntos |
| `.claude/hooks/avisos.mjs` | `gh issue list --state open --limit 300` | GraphQL | caché de 10 min en la carpeta temporal |
| `scripts/podar.mjs`, `scripts/retirar.mjs` | `gh pr list` (abiertos y todos / por rama) | GraphQL | a mano |
| `scripts/lib/lleva.mjs` (`tarea`, `retirar`) | comentarios del issue | REST | a mano |
| `scripts/lib/planos.mjs`, `scripts/cumplimiento.mjs`, `scripts/fabrica.mjs` | issues paginados / rutas del repo | GraphQL / REST | semanales en el CI, con el token del workflow (cupo propio) |
| esperar al CI: `gh pr checks --watch` | los checks del PR | GraphQL | una vuelta cada 30 s por sesión esperando |

## Cómo se gasta menos

- **Esperar al CI**: `npm run espera-ci -- <pr>` (REST, una llamada cada 60 s, sale con 0 si todo pasa, 1 si algo falla o se acaba el tiempo y 3 si no pudo preguntar tras 3 intentos; el PR va en primer lugar).
  No uses `gh pr checks --watch`.
- **Leer un issue o un PR suelto**: `gh api repos/pabloam89/MenuPlan/issues/<n> --jq .body` (REST) en vez de `gh issue view`.
- **Issues de golpe**: `npm run issues` tiene caché (`--fresco` la salta). Si GitHub no contesta o no hay cuota, el arranque usa lo último que guardó (hasta 6 h) y lo dice en su salida.
- **Con el token de la App** (`node scripts/token-sesion.mjs -- <comando gh>`): cupo propio, aparte del de Pablo. Sirve para esperar a que se reinicie el de Pablo.

## Cómo se cuenta

Cada llamada de `issues.mjs`, `avisos.mjs` y `espera-ci.mjs` (`migraciones.mjs` no: la guardia lo carga solo, sin `scripts/`, y cuesta 1 punto por sesión) añade una línea a `<temporal>/menuplan-cuota/gh.log`:
`<fecha> gh: caller=<quién> api=rest|graphql`. Vocabulario cerrado en `scripts/lib/cuotaGh.mjs` (`CALLERS_GH`, `APIS_GH`), sin tokens ni
datos de familias. Contar: `node -e "import('./scripts/lib/cuotaGh.mjs').then(m=>console.log(m.contarLog(require('fs').readFileSync(require('os').tmpdir()+'/menuplan-cuota/gh.log','utf8'))))"`.

## Lo que vigila el CI

`scripts/cuotaGh.test.js`: la caché y su plan B; que el arranque lea una sola vez los issues y con caché; que las escrituras la invaliden;
un techo para los sitios de GraphQL de `issues.mjs` y para las menciones de `gh pr checks --watch`. Subir un techo es una decisión,
no un descuido.

## Sin comprobar

Cuánto gasta de verdad cada vuelta de `gh pr checks` (la medida del 10 oct salió ruidosa: la App falló al canjear el token en medio) y cuántos
puntos ahorra la caché en un día real: mirar `gh.log` y el `rateLimit` tras una semana.
