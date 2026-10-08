# MenuPlan — reglas para cualquier sesión

Lo que vale siempre, para toda sesión. Lo de cada zona salta solo al tocarla
(`.claude/rules/`); el detalle de cada dominio, en `specs/INDEX.md`. Si una
regla choca con un hook, el hook manda.

## Qué es

HoMenu / MenuPlan: menús semanales para familias. **Lola**, el bot de
mensajería (Telegram hoy, WhatsApp después; `api/_bot/`, `api/bot/`), es el
producto hacia el que vamos; **la app** React + Vite (`src/`), PWA con
funciones en `api/`, es el respaldo. Datos en Supabase (Postgres + Auth +
RLS); catálogo de recetas y alimentos en JSON en git (`src/data/`).

## Equipo

- **Pablo** (`pabloam89`) y **Álvaro** (`algbarc`, `algbarc-design`) escriben
  en el repo, a menudo con varias sesiones a la vez. **Manu**, socio, sin
  acceso al repo a propósito.
- Pablo no es informático: decisiones técnicas en llano, recomendación primero.

## Dónde vive cada cosa

| Qué | Dónde |
|---|---|
| Repositorio (el único de verdad) | `github.com/pabloam89/MenuPlan`, **público** |
| Copia de trabajo de Pablo | `C:\dev\MenuPlan`; worktrees en `C:\dev\MenuPlan-<tarea>` |
| Hosting | Vercel, equipo «menuplan», proyecto `homenu` (antes «Monicos MenuPlan» y `menu-plan`) |
| Base de datos | Supabase `mdzwbrworucnummibxrq`, **una sola: producción**. Cuelga del equipo de Vercel (Marketplace) |
| Servicios, cuentas y dónde está cada clave | `ops/INVENTARIO.md` (nunca valores) |
| Las claves en local | 1Password, bóveda `HoMenu`. `.env.local` guarda direcciones `op://` (plantilla `ops/env.1password`), no claves. Skill `1password` |
| Estado real de las migraciones | `supabase/ESTADO.md`; NOT VALID por validar en `supabase/PENDIENTES.md` |
| Cómo deben ser las tablas | `docs/datos/PRINCIPIOS.md` (con test desde la 0087) |
| Reglas de UI | `DESIGN_SYSTEM.md` |
| Decisiones de operación y hoja de ruta | `ops/DECISIONES.md`, `ops/PLANOS.md` |

`pabloartinano/MenuPlan` y OneDrive son restos de antes del 7 oct: un error.

## Ramas y flujo

- **`staging`** es la rama por defecto y la que despliega Vercel en staging.
  Todo sale de `origin/staging` y vuelve por **PR con el CI en verde**
  (`tests.yml`: lint con línea base, tests y build). Ese PR lo puede fusionar
  la propia sesión.
- **`main` es producción.** Ninguna sesión sube ni fusiona a `main`; solo
  cuando Pablo lo pide, con el método que se decida con él.
- Una rama por tarea, prefijo de área y nombre en castellano: `bot/`, `datos/`,
  `ux/`, `fix/`, `feat/`, `ops/`, `motor/`. Las de la nube empujan solo a la
  suya. «¿Está en staging?» se mira en `origin/staging` tras `git fetch`.

## Una sesión, una tarea

**Una sesión = una carpeta = una rama = una tarea.**
`npm run tarea -- datos/descartes` abre `C:\dev\MenuPlan-descartes` (rama
desde `origin/staging`, `.env.local`, flags de staging, dependencias y
puerto); `npm run retirar -- descartes` la cierra solo si no se pierde nada.
Nada de borrar worktrees a mano; si el arranque avisa de otra sesión en tu
carpeta, no trabajes ahí. App en local: localhost y la IP de la wifi, nada más
(el login con Google solo vuelve al puerto 5176). Primer push: `git push -u
origin <rama>`. **Al fusionar tu PR:** `npm run retirar -- <tarea>` en la misma
sesión (la rama de GitHub la borra GitHub sola). Ramas viejas ya fusionadas:
`npm run podar` (ensayo) y `npm run podar -- --si`; nunca toca lo que no está
en staging.

## Antes del PR (lo que no vigila la guardia)

1. Fusiona `origin/staging` en tu rama y resuelve: hay sesiones en paralelo.
   La guardia no deja abrir ni fusionar un PR con la rama atrasada; si al
   fusionar ya va por detrás, `gh pr update-branch <n>` y espera el CI.
2. `git status --short` y añade por nombre solo lo tuyo; si un fichero mezcla
   lo tuyo con lo de otro, dilo en el mensaje o déjalo fuera.
3. `npm test` y `npm run build`. Con el lint, `npm run lint:base`: cuenta la
   **lista** de errores, no el recuento.
4. Un test nuevo se ve fallar una vez antes de creértelo (detalle en la regla
   `tests`).
5. En el cuerpo del PR, `Closes #n` por cada issue que arregla y una línea
   `Agente: <nombre>` (o `sesión`): de ahí sale quién arregló qué y si aguantó.

## Base de datos

**Solo hay una base y es la de producción**: staging, local y los scripts
escriben en ella, y cada migración es un cambio en producción.

- Aplicar (`--si`) lo puede lanzar la sesión: el script exige que esté en
  staging, un ensayo de menos de una hora y el OK del juez `auditor-datos` en
  la cabecera. Si borra algo con datos (`CONTRAE`) o toca RLS o permisos de lo
  que ya existía, la lanza **Pablo** con `!` y `--pablo`. Luego, ESTADO.md.
- **El código no puede depender de que la migración ya esté**: la rama se
  despliega antes de que alguien la aplique. Plan B siempre.
- **Ningún campo ni tabla sin lector**, y cada dato en un solo sitio.
- Una tabla, un módulo dueño: nada de columnas ni filtros PostgREST a mano
  fuera de él (PRINCIPIOS §15).

El cómo, en la regla `migraciones`; cómo es una tabla, en `PRINCIPIOS.md`.

## Encargos

Clasifica lo que pide Pablo. Lo trivial lo haces tú. Si es normal (un dominio)
o grande (varios, o un refactor), propón **`/orquestar <encargo>`**, que elige
el pipeline por tipo de encargo y escribe el brief de cada agente. Regla fija:
quien construye no juzga.

## Agentes

En `.claude/agents/`, con la estructura de `.claude/PLANTILLA-AGENTE.md`
(vigilada por `.claude/agentes.test.js`). Un subagente no pregunta a mitad de
trabajo: devuelve «Decisiones para Pablo».

| Constructores | Jueces (sin Edit ni Write; no escribir por Bash es convención que vigila `revisor`) |
|---|---|
| `gobierno`: git, CI, permisos, hooks, secretos, servicios, `ops/` | `revisor`: fallos reales en un diff |
| `datos`: esquema, migraciones, modelo, ESTADO.md | `qa`: la app en el navegador (Chrome en local) |
| `diseno`: pantallas, tokens, iconos y assets | `evaluador`: evals de Lola antes y después |
| `lola`: el bot, herramientas, conocimiento, coste | `seguridad`: RLS, endpoints, secretos, prompts |
| | `auditor-datos`: normalización, duplicados y cableado |

Aparcados en `.claude/agentes-aparcados/`: rendimiento y arquitecto.

## Reglas por carpeta y skills

Las reglas (`.claude/rules/`) saltan solas al leer o editar un fichero de su
zona: `ui` (`src/**/*.jsx`), `migraciones` (`supabase/`), `lola`
(`api/_bot/`, `api/bot/`), `catalogo` (`src/data/`, `src/utils/`, `src/lib/`,
`api/_bot/`), `tests` (`*.test.{js,jsx,mjs}`) y
`api` (`api/*.js`). Las skills (`.claude/skills/`) son runbooks que se abren
por su nombre: `1password`, `vercel`, `supabase`, `github`, `telegram`,
`hetzner` y `tailscale` (precargadas en `gobierno` y `lola`). Todas siguen
`.claude/PLANTILLA-SKILL.md`, que vigila `.claude/skills.test.js`: las mismas
siete secciones, operaciones con lo que debe salir, y cada fallo con fecha,
causa y arreglo. Un proveedor nuevo estrena su runbook con su primera lección,
no antes.

## Código

- UTF-8 sin BOM, comentarios en castellano, saltos de línea LF. Edita con
  Edit/Write.
- Regex sobre nombres de alimento: `\b` por defecto (detalle en la regla
  `catalogo`).
- Modelos: **Gemini para imágenes, Anthropic para texto.** Mira qué genera un
  script, no qué proveedor trae escrito.
- No cambies de rama en una carpeta con cambios sin commitear.

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

- **`arranque.mjs`** al abrir sesión: carpeta, rama, sesiones activas, números
  de migración cogidos, migraciones sin aplicar e issues que esperan.
- **`guardia.mjs`** antes de cada comando o edición: niega push a `main` o
  directo a staging, `git stash`, `git add .`, `vite build` a secas,
  `Set-Content`, tocar una migración aplicada (también por terminal), crear
  una con un número que staging ya usa, SQL a mano contra producción y
  `apply-migration --pablo` (solo de Pablo), y abrir o fusionar un PR con
  la rama atrasada respecto a staging; pregunta
  antes de un push forzado, de tocar permisos y hooks y de escribir por
  terminal lo que lee Lola. Cada regla,
  con su porqué y su test en `.claude/hooks/guardia.test.js`.
- **GitHub**: `main` solo por PR con `tests`; secret scanning y Dependabot.
- Las reglas por carpeta solo saltan con Read, Write o Edit, no por terminal:
  lo crítico va en la guardia.
- **Cuando algo falla, la lección va a un test o a la guardia; si no se puede,
  a una regla o una skill; a la memoria, nunca.** Si no se arregla en el
  momento, se abre un issue `tipo:leccion` (con causa y área) y se cierra con
  la etiqueta `arreglo:` de dónde quedó. Decisiones pendientes y trabajo por
  coger, también como issues (`tipo:decision`, `tipo:encargo`), no en el
  chat ni en mensajes entre sesiones. `npm run issues` lo cuenta; el cómo, en
  la skill `github`. El repo es público: nada sensible en un issue.
