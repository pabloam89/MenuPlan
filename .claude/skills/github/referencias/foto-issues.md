# La foto publicada de los issues (fondo #326, cupo de GitHub)

## Qué es

Un fichero, `issues.json`, con el estado de TODOS los issues, que el workflow `foto-issues.yml` sube cada 5 minutos como asset de la
release `foto-issues` (prerelease, nunca «latest», reemplazado con `--clobber`). `npm run issues` y `npm run situacion` lo bajan de
`https://github.com/pabloam89/MenuPlan/releases/download/foto-issues/issues.json` (repo público: sin autenticar y 0 puntos de la API) en vez de pedir
~1,1 puntos de GraphQL por issue (medido el 14 oct 2026: 414 issues, 486 puntos por lectura completa; `situacion` con 5 páginas de 107, 535).

- Contenido: los nodos de GraphQL tal cual (`CAMPOS_ISSUE` de `scripts/lib/issues.mjs`, con `updatedAt`), más `version` (2), `generado_en`, `completa`, `total`, `refrescados` y `pendientes`. Pesa ~1,9 MB.
- Escritor: `scripts/foto-issues.mjs` (lógica y consultas en `scripts/lib/fotoIssues.mjs`); lector: `nodosDeLaFoto()` del mismo módulo. Una sola fuente de la versión y de los campos; `scripts/fotoIssues.test.js` los compara con el workflow.
- **Por qué una release y no una rama** (la primera versión usaba la rama `foto/issues`): un asset reemplazado no deja historia (en una rama, los commits viejos se siguen leyendo por SHA aunque se reescriba con `--force`: lo borrado no desaparece) y no hay push que dispare un despliegue de Vercel. Medido el 14 oct 2026: la URL se baja sin autenticar (302 a `release-assets.githubusercontent.com`), y la release no avisa a nadie (prerelease, `latest` da 404, el repo tiene 0 suscriptores y ningún workflow escucha `release`).
- **Caché**: tras un `--clobber`, la URL a secas siguió sirviendo el asset anterior (github.com guarda la redirección); con `?c=<ms>` dio el nuevo al instante, dos de dos. El lector siempre pide con `?c=`. Además, `generado_en` de más de 15 min no se usa.

## Cuánto gasta y cómo no se pasa

Presupuesto: el `GITHUB_TOKEN` del workflow, **1.000 puntos por hora y repositorio** (docs de GitHub, «Rate limits for the GraphQL API»). Cada pasada:

1. **Listado ligero** de todos los issues (`id number updatedAt parent { id }`): 1 punto por cada 100 (medido: 414 issues, 5 puntos). Da:
   - los **nuevos** (no están en la foto) y los **cambiados** (`updatedAt` distinto);
   - los que **cambiaron de padre**: colgar con `addSubIssue` NO mueve `updatedAt` de hijo ni padre (comprobado con #768 y #176), así que se compara `parent.id` con la foto y se releen el hijo y los dos padres;
   - los **borrados o trasladados**: los que ya no salen se quitan sin pedir su id. Si uno desaparece entre el listado y la lectura, GitHub contesta `nodes: [null]` con un error `NOT_FOUND` de `path: ["nodes", i]` y `gh` sale con 1: el escritor lo lee de stdout y lo quita; cualquier otro error para la pasada.
2. **Por id** (1 punto por id): esos, sus vecinos (padre e hijos) si cambió algo que copian (estado, etiquetas, padre) y, si cabe, una rotación de 8 de lectura más antigua.
3. **Dentro del cupo**: nunca baja de 100 puntos restantes (`RESERVA_PUNTOS`). Lo que no cabe queda en `pendientes` y sigue en la pasada siguiente. Sin foto previa es el mismo camino (todos son nuevos): la primera foto se hace a trozos si no cabe, y sale con `completa: false` hasta que estén todos (los lectores no la usan mientras tanto). Así no hay techo de issues: con ~850 la lectura completa ya no cabría en una hora, y aquí se reparte.

Medido el 14 oct 2026 contra el repo real, con el token de la App y el cupo recortado a 50: listado de 414 en 5 puntos, 43 leídos por id, 371 pendientes; la pasada siguiente sin cupo gastó 5 y los dejó pendientes. Pasada sin cambios: ~5 del listado + 8 de rotación (~160 por hora).

Cada pasada deja `foto-issues modo: … total: … completa: … listados: … nuevos: … cambiados: … de_padre: … vecinos: … rotados: … borrados: … pendientes: … puntos: … restantes: …` (registrada en `ops/metricas.json`).

## Seguridad

- Solo por el **reloj** (cada 5 min) y **a mano** (`workflow_dispatch`); no por eventos de issues ni de comentarios: en un repo público cualquiera puede comentar, y cada disparo gastaría del presupuesto.
- Permisos: `contents: write` (subir el asset) e `issues: read`. Sin la App de las sesiones ni secretos. El código sale de `staging`; nada del texto de un issue entra en un `run:`.
- **Solo el workflow escribe la release**: la guardia niega a las sesiones `gh release create|upload|edit|delete|delete-asset foto-issues`, escribir releases por `gh api` y empujar el tag `foto-issues` (norma `foto-de-issues-solo-workflow`). Los scripts se fían de lo que trae la foto, también de `authorAssociation` (quién escribió cada comentario, con lo que se cuentan las marcas «lo lleva»): una foto subida a mano, o por un texto inyectado, lo falsificaría. Es un filtro de buena fe: la App puede escribir releases.

## Puesta en marcha (la hace Pablo)

La App `homenu-sesiones` no tiene el permiso `workflows`: GitHub rechaza el push de cualquier fichero de `.github/workflows/` («refusing to allow a GitHub App to create or update workflow … without `workflows` permission», 14 oct 2026). Por eso el workflow espera en `ops/workflows-pendientes/foto-issues.yml` y, hasta que se mueva, los lectores van a la API. La release ya existe (creada el 14 oct 2026 con un marcador `{"version":0}` que ningún lector acepta). Pablo, desde una PowerShell, en una copia al día de `staging`: `git mv ops/workflows-pendientes/foto-issues.yml` a la carpeta `.github/workflows/`, commit y push con sus credenciales; luego `gh workflow run foto-issues.yml --ref staging` y comprobar en el log la línea `foto-issues modo: desde-cero … completa: si`. Fuera de esa carpeta de espera, `ops/workflows-pendientes/` debe quedar vacía.

## Cómo lee el lector

1. Baja la foto (con `?c=<ms>`, en un hijo de node con `fetch`; el hijo no llama a `process.exit`: en Windows con Node 24 revienta con `UV_HANDLE_CLOSING` y código 127 tras escribir la foto, y la primera versión del lector nunca la usaba, visto el 14 oct 2026) y la acepta solo si `version` es la suya, la forma cuadra, está `completa` y `generado_en` tiene menos de 15 min (`MAX_MIN_FOTO`).
2. La pone al día con los issues cambiados después de generarla (REST `issues?since=`, 0 puntos GraphQL): estado, etiquetas, título, cuerpo, asignados y los issues nuevos. Padre, hijos, PR que lo cierran y comentarios se quedan como en la foto hasta la siguiente.
3. **Las escrituras que dependen del padre van siempre a la API**: `--colgar`, `--ordenar` y el colgar de `--nuevo --padre` (`fotoPermitida` y `sinFoto` en `scripts/issues.mjs`). `--nuevo` sin padre usa la foto solo si pudo ponerla al día.
4. Si algo falla (sin release, otra versión, a medias, vieja, `--fresco`, `MENUPLAN_FOTO=0`), usa la API como antes y lo dice en una línea. `MENUPLAN_FOTO_ARCHIVO=<ruta>` lee la foto de un fichero (pruebas).
5. Deja una línea en `gh.log` con `api=foto` (`resultado=ok` si sirvió, `error` si cayó a la API) y 0 puntos: `npm run cuota -- --horas` compara lo que gasta cada origen antes y después.
6. **Aviso**: si la foto falta, está a medias o tiene más de 1 h (`MAX_MIN_AVISO`), `npm run situacion` y el arranque lo dicen en una línea que empieza por `Foto de los issues:`. Sale de la última mirada (`foto-estado.json` en la carpeta de la cuota), así que también avisa cuando la lectura viene de la caché.

## Cómo quitarla

Borrar el workflow `foto-issues.yml` y la release `foto-issues` con su tag (borrar recursos es de Pablo: `gh release delete foto-issues --cleanup-tag --yes --repo pabloam89/MenuPlan`; la guardia se lo niega a las sesiones). Los lectores vuelven a la API solos, sin romper nada (test «LIMPIEZA» de `scripts/fotoIssues.test.js`). Si la foto se estropea, el remedio rápido es `MENUPLAN_FOTO=0` en el entorno y relanzar el workflow (`gh workflow run foto-issues.yml --ref staging`): una foto ilegible o de otra versión hace que empiece desde cero.

## Qué no cubre

`avisos.mjs` (hook, `gh issue list`, 1 por sesión), `fabrica`, `planos` y `cumplimiento` (estos últimos en CI con su propio token) siguen con su consulta. Los cron de GitHub se retrasan: si la foto pasa de 15 min con frecuencia, los lectores vuelven a la API y el ahorro baja; si pasa de 1 h, el aviso lo dice.
