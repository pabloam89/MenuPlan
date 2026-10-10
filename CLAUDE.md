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
| Reglas de UI | `DESIGN_SYSTEM.md` (criterio); valores en `src/design/tokens.js`; estado y plan en `docs/diseno/ESTADO.md` |
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
Si la tarea es de un issue, su número detrás (`… datos/descartes 193`): la
rama queda `datos/193-descartes` y el PR lleva `Closes #193`.
En la carpeta principal (`C:\dev\MenuPlan`) no se trabaja: la guardia no deja
editar, commitear ni cambiar de rama en ella. Nada de borrar worktrees a mano;
si el arranque avisa de otra sesión en tu carpeta, no trabajes ahí. App en local: localhost y la IP de la wifi, nada más
(el login con Google solo vuelve al puerto 5176). Primer push: `git push -u
origin <rama>`. **Al fusionar tu PR:** `npm run retirar -- <tarea>` en la misma
sesión (la rama de GitHub la borra GitHub sola). Ramas viejas ya fusionadas:
`npm run podar` (ensayo) y `npm run podar -- --si`; nunca toca lo que no está
en staging.

## Antes del PR (lo que no vigila la guardia)

1. Fusiona `origin/staging` en tu rama y resuelve: hay sesiones en paralelo.
   La guardia no deja abrir un PR con la rama atrasada, ni fusionarlo si
   staging ha cambiado sus mismos ficheros desde entonces: en ese caso,
   `gh pr update-branch <n>` (en un comando aparte) y espera el CI.
2. `git status --short` y añade por nombre solo lo tuyo; si un fichero mezcla
   lo tuyo con lo de otro, dilo en el mensaje o déjalo fuera.
3. `npm test` y `npm run build`. Con el lint, `npm run lint:base`: cuenta la
   **lista** de errores, no el recuento.
4. Un test nuevo se ve fallar una vez antes de creértelo (detalle en la regla
   `tests`).
5. En el cuerpo del PR, `Closes #n` por cada encargo o problema de fondo que
   cierra y una línea `Agente: <nombre>` (o `sesión`): de ahí sale quién
   arregló qué y si aguantó.

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
por su nombre: `1password`, `alta-de-secreto`, `vercel`, `supabase`, `github`, `issues`,
`telegram`, `hetzner` y `tailscale` (precargadas en `gobierno` y `lola`); y
las de oficio, cómo se piensa un fallo: `causa-raiz` (diagnosticar) y
`plan-de-arreglo` (partir el arreglo en encargos). Todas siguen
`.claude/PLANTILLA-SKILL.md`, que vigila `.claude/skills.test.js`: un tipo de
ocho (hoy hay de herramienta y de oficio, cada tipo con sus secciones), dueño, fecha
de comprobación que caduca a los 90 días, un `SKILL.md` corto con el detalle en
capas y sus casos de prueba en `casos.json`; `npm run skills-prueba -- <skill>`
mide, con tokens, si ayuda. Un proveedor nuevo estrena su runbook con su
primera lección, no antes.

## Vocabulario del catálogo

"Antiguo" y "nuevo" no se usan para el catálogo (#249). Los roles de una fuente
(`ingesta`, `fuente_de_verdad`, `derivado`, `copia_retirada`), **Recetario** y
**Reserva** se definen una vez, en `specs/INDEX.md`. Cada fuente, con su estado
y su fecha, está en `src/data/model.js` (`TABLAS`, vigilado por `ops/fuentes.test.js`).

## Código

- UTF-8 sin BOM, comentarios en castellano, saltos de línea LF. Edita con
  Edit/Write.
- Regex sobre nombres de alimento: `\b` por defecto (detalle en la regla
  `catalogo`).
- Modelos: **Gemini para imágenes, Anthropic para texto.** Mira qué genera un
  script, no qué proveedor trae escrito.
- No cambies de rama en una carpeta con cambios sin commitear.
- **La hora es la de Madrid y sale de `npm run hora`** (o del arranque), nunca
  de `date`: en Git Bash `TZ=Europe/Madrid date` da UTC sin avisar (#210).
  Una hora límite que se le da a Pablo la calcula el script que la impone.

## Pensar en datos

Lo que se repite se diseña para poder contarse; todo se analiza mejor con
cifras que con impresiones.

- **Vocabulario cerrado, no texto libre**, para todo lo que se vaya a agrupar:
  motivos de fallo, estados, causas, tipos, sitios. Una constante en JS (y un
  CHECK si va a SQL) con su test, como `src/lib/vocabularios.js`.
- **Cada cosa que pasa deja una línea estructurada** (`campo: valor`, sin datos
  de familias) que un script pueda contar. Lo que no deja rastro no se mide, y
  lo que no se mide no mejora.
- **La clase, no el caso**: se arregla el caso y se ataca su problema de fondo
  («Cuando algo falla», abajo). Una regla, un dato, una fuente que el resto usa.
- **La cifra antes y después**: cuántos casos, desde cuándo y dónde, antes de
  proponer un arreglo; la misma cifra después, para saber si sirvió.

## Qué se le pregunta a Pablo, y qué no

Pablo decidió el 8 oct de 2026 que solo se le pregunte lo **irreversible o lo
que sale fuera**: cada pregunta de más le interrumpe, y casi siempre dice que
sí. Preguntar algo de la segunda lista también es un fallo; se cuenta (#185).

**Se pregunta y se espera el sí:**

- Subir o fusionar a `main` (producción).
- Borrar o reescribir datos de familias, o cambiar RLS y permisos de lo que ya
  existe (`--pablo`, `CONTRAE`).
- Borrar recursos de un servicio (una base, un proyecto, un bucket) o ramas
  que no están fusionadas.
- Crear, rotar o cambiar secretos y variables de entorno.
- Gastar dinero: un plan de pago, una compra, evals de pago que no tocan.
- Escribir a personas o publicar algo en su nombre.
- Ampliar los permisos de `.claude/settings.json` (la sesión pregunta en el chat antes de abrir el PR y el juez lo marca; la guardia ya no pregunta al editar).
- Reescribir historia de una rama que no es tuya.

**Autorizado de forma permanente** (se hace y se cuenta en el resumen):

- Leer producción en solo lectura con los scripts del repo:
  `npm run consulta -- "<select>"`, `verificar-estado`, el ensayo de
  `apply-migration`.
- Aplicar las migraciones que el script deja aplicar (en staging, ensayadas,
  con el juez y sin `--pablo`).
- Issues y etiquetas: crearlos, clasificarlos, colgarlos, cerrarlos con su PR,
  y `npm run issues -- --etiquetas`.
- Cambiar hooks, guardia, reglas, skills y agentes, siempre por PR con su juez
  y el CI en verde. Fusionar a staging es de la propia sesión.
- Ajustes del repo que no tocan permisos ni producción: etiquetas,
  plantillas, la descripción de un PR.
- Poner al día la carpeta principal (`git pull --ff-only`) y las copias de
  hooks de usuario que salen del repo (#198).
- Retirar carpetas y ramas ya fusionadas (`npm run retirar`, `npm run podar`).

## Lo que hace cumplir esto

- **`arranque.mjs`** al abrir sesión: carpeta, rama, sesiones activas, números
  de migración cogidos, migraciones sin aplicar e issues que esperan.
- **`guardia.mjs`** antes de cada comando o edición: niega push a `main` o
  directo a staging, `git stash`, `git add .`, `vite build` a secas,
  `Set-Content`, tocar una migración aplicada (también por terminal), crear
  una con un número que staging ya usa, SQL a mano contra producción y
  `apply-migration --pablo` (solo de Pablo), abrir un PR con la rama
  atrasada, sin `Casos:`, o sin `Closes` si la rama es de un issue, fusionarlo si staging
  pisó sus ficheros, trabajar en la carpeta principal y `gh issue create` a
  pelo (se crea con `npm run issues -- --nuevo`, que busca los parecidos);
  pregunta
  antes de un push forzado y de escribir por
  terminal lo que lee Lola. Cada regla,
  con su porqué y su test en `.claude/hooks/guardia.test.js`.
- **`avisos.mjs`** tras editar un fichero: los issues abiertos que lo nombran.
  **`pendientes.mjs`** al terminar de responder: frena una vez si dejas
  decisiones o pendientes sin ningún issue, o fallos sin ningún caso (#185).
  Las decisiones se asignan a Pablo.
- **GitHub**: `main` solo por PR con `tests`; secret scanning y Dependabot.
- **Las skills, por obligación** (`.claude/dominios-skills.json`): la primera
  vez que una sesión lanza un comando de riesgo de un dominio con skill
  (`apply-migration`, `telegram-webhook.mjs set`, `vercel env`, `op item`, `ssh` al
  panel…), la guardia le pide abrir antes la skill; y el CI (`tests`) exige en
  cada PR que toca un dominio la línea «Runbook: actualizado (skill X)» o
  «Runbook: sin novedades». El `revisor` comprueba que un fallo arreglado dejó
  su lección en un test, la guardia o la skill.
- Las reglas por carpeta solo saltan con Read, Write o Edit, no por terminal:
  lo crítico va en la guardia.
- **Cuando algo falla, la lección va a un test o a la guardia; si no se puede,
  a una regla o una skill; a la memoria, nunca.**

## Cuando algo falla: hasta el problema de fondo

Ningún fallo se cierra como suelto. Se arregla el caso si urge y se analiza
de qué **problema de fondo** es síntoma (`tipo:fondo`). El caso acaba en una
respuesta de `analisis:` —nuevo, abierto, no aguantó o puntual— y se cuelga de
su fondo; el arreglo se hace en el fondo, no en el caso: uno o varios encargos
colgando de él, y se cierra cuando acaban y un test cubre la clase. **Esto no
depende de acordarse**: todo PR lleva `Casos: #n, #m` o `Casos: ninguno — <por
qué>` (la guardia no deja abrirlo sin ella y el CI comprueba que son casos de
verdad), y al terminar `pendientes.mjs` frena una vez si hubo fallos y no
registraste nada.

- **El camino completo** (detectar, registrar, triaje, diagnosticar, fondo,
  plan, ejecutar, verificar, observar, cerrar, aprender, medir), qué obligación
  tiene cada paso y **qué la hace cumplir de verdad**: `docs/ops/FLUJO.md`.
  `npm run flujo` da el resumen y dice qué pasos siguen blandos.
- **Las definiciones** de cada respuesta del análisis, de las causas y de las
  etiquetas: `scripts/lib/issues.mjs`, su única fuente. No se copian aquí.
- Decisiones pendientes y trabajo por coger, también como issues, no en el chat
  ni en mensajes entre sesiones. `npm run issues` lo cuenta y `--colgar` cuelga;
  el cómo, en la skill `issues`; el repaso del conjunto, cada semana con
  `/revision-issues`. El repo es público: nada sensible en un issue.
