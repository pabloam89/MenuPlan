# MenuPlan — reglas para cualquier sesión

Lo lee toda sesión de Claude, en cualquier terminal, worktree o en la nube.
Arriba va lo que evita fricción: dónde vive cada cosa y qué no se toca sin
permiso. El detalle de cada dominio está en `specs/` (índice en
`specs/INDEX.md`).

Lo que de verdad obliga no es este fichero: son los permisos y los hooks de
`.claude/settings.json` (ver «Lo que hace cumplir esto»). Si una regla de aquí
choca con un hook, el hook manda y la regla se corrige.

## Qué es

HoMenu / MenuPlan: menús semanales para familias. Dos frentes sobre el mismo
código:

- **Lola**, el bot de mensajería (Telegram hoy, WhatsApp después): `api/_bot/`
  y `api/bot/`. Es el producto hacia el que vamos.
- **La app** React + Vite (`src/`), PWA, con funciones serverless en `api/`.

Datos en Supabase (Postgres + Auth + RLS). Catálogo de recetas y alimentos en
JSON versionado en git (`src/data/`). Hosting en Vercel.

## Equipo

- **Pablo** (`pabloam89`) y **Álvaro** (`algbarc`, `algbarc-design`):
  escriben en el repo, a menudo con varias sesiones a la vez.
- **Manu**: socio sin acceso al repo, a propósito.
- Pablo no es informático: explicar decisiones técnicas en llano, con la
  recomendación primero.

## Dónde vive cada cosa

| Qué | Dónde |
|---|---|
| Repositorio (el único de verdad) | `github.com/pabloam89/MenuPlan`, **público** |
| Copia de trabajo en el PC de Pablo | `C:\dev\MenuPlan`; worktrees en `C:\dev\MenuPlan-<tarea>` |
| Hosting | Vercel, equipo «Monicos MenuPlan», proyecto `menu-plan` |
| Base de datos | Supabase `mdzwbrworucnummibxrq`, **una sola: producción**. Cuelga del equipo de Vercel (Marketplace), no de una cuenta propia |
| Servicios, cuentas dueñas y dónde está cada clave | `ops/INVENTARIO.md` (nunca valores de claves) |
| Las claves en local | 1Password, bóveda `HoMenu`. `.env.local` guarda direcciones `op://` (plantilla `ops/env.1password`), no claves. Skill `1password` |
| Estado real de las migraciones | `supabase/ESTADO.md` (el registro de Supabase no sirve: tiene 12 filas) |
| Constraints NOT VALID por validar | `supabase/PENDIENTES.md` |
| Reglas de estructura de tablas | `docs/datos/PRINCIPIOS.md` (con test desde la 0087) |
| Reglas de UI | `DESIGN_SYSTEM.md` |
| Decisiones de operación | `ops/DECISIONES.md` |

`pabloartinano/MenuPlan` y la carpeta de OneDrive son restos de antes del
7 oct 2026: si aparecen en algún fichero, es un error a corregir.

## Ramas y flujo

- **`staging`** es la rama por defecto de GitHub y la que despliega Vercel en
  staging. Todo trabajo sale de `origin/staging` y vuelve por **PR con el CI
  en verde** (`.github/workflows/tests.yml`: tests + build). Nada de push
  directo a staging.
- **`main` es producción.** Ninguna sesión sube ni fusiona a `main`. Solo
  cuando Pablo lo pide («sube a prod», «despliega»), y el método se decide con
  él en ese momento.
- **Protección en GitHub (desde el 7 oct 2026), también para administradores:**
  `main` solo admite PR con el check `tests` en verde; ni `main` ni `staging`
  admiten force push ni borrado. `staging` aún admite push directo porque el
  cron de Mercadona lo usa; ahí el «solo por PR» lo pone la guardia.
- Una rama por tarea, con prefijo de área y nombre corto en castellano:
  `bot/`, `datos/`, `ux/`, `fix/`, `feat/`, `ops/`, `motor/`. Se borra sola
  al fusionar el PR.
- Las sesiones en la nube trabajan en la rama que se les asigna y solo empujan
  a esa.
- **«¿Está en staging?»** se responde con `git fetch origin` y mirando
  `origin/staging`, nunca el upstream de tu rama.
- Hay sesiones en paralelo tocando los mismos ficheros: antes del PR, fusiona
  `origin/staging` en tu rama y resuelve.
- Un PR a staging con el CI verde lo puede fusionar la propia sesión. A `main`,
  nunca.

## Varias sesiones a la vez

**Una sesión = una carpeta = una rama = una tarea.**

```
npm run tarea -- datos/descartes      # abre C:\dev\MenuPlan-descartes
npm run retirar -- descartes          # la cierra, solo si no se pierde nada
```

- `tarea` crea el worktree y la rama desde `origin/staging` (o retoma la de
  GitHub si ya existe), sin enganche a staging. Copia `.env.local`, crea
  `.env.development.local` con solver y pizarra (como en staging; en
  `.env.local` romperían tests), instala dependencias y busca un puerto libre.
- `retirar` se niega si hay cambios sin commitear, commits que no están en
  GitHub ni en staging, o una sesión activa en esa carpeta. Con `--ensayo`
  solo dice qué haría. Nada de borrar worktrees a mano.
- El primer push de una rama nueva: `git push -u origin <rama>`.
- Si Pablo pide ver la app en local, dale las dos URLs (localhost y la IP de la
  wifi) y nada más. El login con Google solo vuelve al puerto 5176.
- Al abrir sesión, el arranque dice qué otras sesiones hay activas y en qué
  rama, y qué números de migración están cogidos (staging, otros worktrees y
  PR abiertos). Si avisa de otra sesión en tu misma carpeta, no trabajes ahí.
- **Nunca `git stash`**: es uno para todos los worktrees y se cruza con otras
  sesiones. Para comparar, `git show origin/staging:<ruta>` o un worktree
  aparte.
- No cambies de rama en una carpeta con cambios sin commitear.
- Saltos de línea: LF siempre (`.gitattributes`), también en Windows.

## Antes de commitear y de abrir el PR

1. `git status --short` y añade **por nombre** solo lo que has tocado tú. Si
   un fichero mezcla lo tuyo con lo de otro, dilo en el mensaje o déjalo fuera.
2. `npm test` y **`npm run build`**, nunca `vite build` a secas: el `prebuild`
   (catálogo + `check:tdz`) es lo que corre Vercel.
3. Con el lint, compara la **lista** de errores antes y después, no el
   recuento.
4. Un test nuevo se ve fallar una vez (rompe a propósito lo que mide) antes de
   creértelo. Prueba con los objetos que entrega el motor (`RECIPES_BY_ID`),
   no con el JSON del catálogo. Un test que copia la verdad
   (`expect(UMBRAL).toBe(4.2)`) no la vigila: fija suelos y relaciones.
5. `src/lib/solver.test.js` está fuera del CI a propósito (ver `tests.yml`).

## Base de datos

**Solo hay una base y es la de producción.** Staging, local y los scripts
escriben en ella. Cada migración es un cambio en producción.

- **Una sola vía para aplicar:** `node scripts/apply-migration.mjs <nombre>`
  (ensayo, hace ROLLBACK; lo puede lanzar la sesión). El `--si` lo lanza
  **Pablo** con `!` en su terminal: la guardia lo niega a cualquier sesión. Se
  le enseña el ensayo y se le da el comando listo. En el mismo PR o justo
  después, apúntala en `supabase/ESTADO.md` con su objeto testigo.
- **¿Está aplicada?** `node scripts/verificar-estado.mjs` (o `--solo 0080`)
  compara cada migración con el catálogo de producción, en solo lectura, y
  avisa de lo que no cuadra con ESTADO.md.
- **Una migración aplicada no se edita nunca**: se escribe otra. La que está
  en staging y ESTADO.md da por «sin aplicar» todavía se puede tocar.
- Número: el «siguiente libre» que da el arranque de la sesión (cuenta
  staging, los otros worktrees y los PR abiertos); vuelve a mirarlo justo
  antes del PR. La guardia niega crear una migración con un número que
  staging ya usa, y `supabase/migrations.test.js` vigila los repetidos.
- **El código no puede depender de que la migración ya esté**: la rama se
  despliega antes de que alguien la aplique. Plan B siempre.
- `drop constraint` **sin** `if exists`, con el nombre leído de
  `pg_constraint`: con el nombre mal, `if exists` no hace nada y el ensayo
  pasa igual.
- Vocabulario cerrado: **CHECK** (NOT VALID si hay filas, apuntado en
  PENDIENTES.md) con la lista en una constante JS y un test SQL↔JS. Tabla
  catálogo solo si los valores tienen atributos que alguien lee. **Enum de
  Postgres, casi nunca.** Y la regla de cada valor en su propio check
  (`tipo <> 'alta' or external_id is not null`).
- Ids nuevos generados en cliente: `src/lib/ids.js` (prefijo de tipo + 12
  base36).
- **Ningún campo ni tabla sin lector.** Antes de exponer un dato en la UI o al
  motor, mide su cobertura.
- Dónde vive un dato: lo curado por nosotros (catálogo) en JSON en git; lo que
  escriben los usuarios, solo en SQL; los dos solo si uno se genera del otro y
  nunca se editan a mano ambos.
- Cambios de modelo: primero el modelo (entidades, relaciones con `on delete`
  justificado, ciclo de vida, invariantes), luego el código. Lo lleva el
  agente `datos`.

## Código

- Ficheros del repo: UTF-8 sin BOM, comentarios en castellano. Edita con la
  herramienta Edit/Write; **nunca** `Set-Content`/`Out-File` de PowerShell
  (destrozan los acentos).
- Regex sobre nombres de alimento: `\b` por defecto y probado contra el
  catálogo entero. Cuando la palabra va dentro de otro ingrediente («vinagre
  de vino»), quita ese otro nombre antes de preguntar.
- Modelos: **Gemini para imágenes, Anthropic para texto.** Mira qué genera un
  script, no qué proveedor trae escrito.
- Evals de Lola (`scripts/bot-evals.mjs`, ~1,20 $) y e2e que pasen por ella:
  solo antes de mergear cambios en lo que Lola lee (`api/_bot/conocimiento.md`,
  el SISTEMA de `agente.js`, textos de herramientas). Vitest y CI, siempre.
- UI: lee `DESIGN_SYSTEM.md` antes de tocar un `.jsx`. Iconos solo de Nucleo
  (`src/components/icons.jsx`, `npm run build:icons`). Sin textos ni toasts que
  nadie pidió; ante una duda de diseño, pregunta.

## Acciones que SIEMPRE requieren un OK explícito de Pablo

No basta con que la tarea «lo implique»: se pregunta y se espera el sí.

- Subir o fusionar a `main`.
- Aplicar una migración o ejecutar SQL que escriba, borre o cambie permisos.
- Borrar ramas, worktrees, datos o recursos de cualquier servicio.
- Crear, rotar o cambiar secretos y variables de entorno.
- Cambiar `.claude/settings.json` o los hooks, o ampliar permisos.
- Reescribir historia (`--force`, `rebase` de algo empujado) en una rama que
  no es tuya.
- Cambiar ajustes de GitHub, Vercel o Supabase.

## Lo que hace cumplir esto

`.claude/settings.json` (compartido, en git) + `.claude/settings.local.json`
(personal, fuera de git).

- **`arranque.mjs`** (al abrir sesión): carpeta, rama, si falta `.env.local`,
  si vas por detrás de staging, qué otras sesiones están activas, números de
  migración cogidos y el siguiente libre, y qué migraciones siguen sin
  aplicar. Apunta la sesión en el registro (`sesiones.mjs`, en la carpeta
  común de git); `fin.mjs` la borra al cerrarse.
- **`guardia.mjs`** (antes de cada comando o edición). **Niega:** push a
  `main`, push directo a staging, `git stash`, `git add .`/`-A`, `vite build` a
  secas, `Set-Content`, editar una migración aplicada, crear una con un número
  que staging ya usa, y cualquier escritura en producción (`--si` o SQL que
  escribe: eso lo lanza Pablo con `!`). **Pregunta:** push forzado y tocar
  permisos o hooks. `gh pr merge`, solo a staging.
- **GitHub:** `main` solo por PR con `tests` en verde; `main` y `staging` sin
  force push ni borrado. **Secret scanning** con push protection activado.
- **Permitidos sin preguntar** (`settings.json`): lecturas de git y gh, los
  `npm run` (incluidos `tarea` y `retirar`, que se protegen solos), el ensayo de
  migraciones y `verificar-estado`. En modo auto el clasificador para por su
  cuenta lo destructivo que no esté en esa lista.

Cada regla de la guardia tiene su porqué y su test en
`.claude/hooks/guardia.test.js`. Si una estorba, se cambia ahí con su test,
nunca se desactiva sin decirlo.

## Agentes

En `.claude/agents/`, todos con la misma estructura
(`.claude/PLANTILLA-AGENTE.md`, vigilada por `.claude/agentes.test.js`):

- **`gobierno`**: git, ramas, worktrees, CI, despliegues, permisos, hooks,
  secretos y servicios. Custodia los gateways y lleva `ops/DECISIONES.md`.
- **`datos`**: esquema, migraciones, ESTADO.md, principios y modelo de datos.
  Propone y ensaya; aplicar en producción pasa por el gateway.

Un subagente no puede preguntar a mitad de trabajo: devuelve sus decisiones
pendientes y es la sesión principal la que se las plantea a Pablo.
