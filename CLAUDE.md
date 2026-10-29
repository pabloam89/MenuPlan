# MenuPlan — lo que vale para toda sesión

## Qué es y dónde vive

HoMenu / MenuPlan: menús semanales para familias. **Lola**, el bot de mensajería
(Telegram hoy; `api/_bot/`, `api/bot/`), es el producto hacia el que vamos; **la app**
React + Vite (`src/`, PWA con funciones en `api/`) es el respaldo. Catálogo de recetas y
alimentos en JSON en git (`src/data/`). Escriben **Pablo** (`pabloam89`) y **Álvaro**
(`algbarc`, `algbarc-design`), a menudo con varias sesiones a la vez.

- Repo: `github.com/pabloam89/MenuPlan`, **público** (nada sensible en issues ni PR). Copia de Pablo en `C:\dev\MenuPlan`, nunca en OneDrive.
- Hosting: Vercel, equipo «menuplan», proyecto `homenu`. Base: Supabase `mdzwbrworucnummibxrq`.
- Servicios, cuentas y dónde está cada clave (nunca su valor): `ops/INVENTARIO.md`; decisiones de operación, `ops/DECISIONES.md`.
- Claves en local: 1Password (skill `1password`); `.env.local` guarda direcciones `op://`, no claves.
- Migraciones: `supabase/ESTADO.md` y `supabase/PENDIENTES.md`; cómo es una tabla, `docs/datos/PRINCIPIOS.md`.
- UI: `DESIGN_SYSTEM.md` y `src/design/tokens.js`. Producto: `docs/producto/PRINCIPIOS.md`; specs, `specs/INDEX.md`.
- La Factoría (agentes, normas, glosario, panel) ya no vive aquí: está en `factory-am89/fabrica` (`C:\dev\fabrica`).

## Ramas, carpetas y PR

- **`staging`** es la rama por defecto y la que despliega Vercel en staging. Todo sale de `origin/staging` y vuelve por **PR con el CI en verde** con dos checks en verde: `tests` (lint con línea base, tests y build) y `revisor` (el juez de la Fábrica, que pide evidencia en el cuerpo; estándar en `standards/code.md` de `factory-am89/fabrica`). Esa es la regla; GitHub la hará cumplir (ruleset y fusión automática) cuando Pablo termine los pasos de «Puente HoMenu» de `PASOS-PABLO.md` en la Fábrica. Hasta entonces `revisor` ya corre en cada PR a `staging` pero no bloquea: trátalo igual. Con la regla activa, la sesión abre el PR, lo deja al día con `staging`, arma `gh pr merge --auto --squash` y **lo fusiona GitHub**; la sesión no fusiona. Si `revisor` o `tests` dicen «no», se arregla en la misma rama (el motivo está en el log del job); no se discute el veredicto. La salida es el Approve de Pablo.
- **`main` es producción** y solo la fusiona Pablo, desde el botón del PR. GitHub lo impone.
- Una tarea = una carpeta = una rama, con prefijo de área (`bot/`, `datos/`, `ux/`, `fix/`, `feat/`, `ops/`, `motor/`). En `C:\dev\MenuPlan` no se trabaja. Para abrirla:
  ```
  git -C C:/dev/MenuPlan fetch origin
  git -C C:/dev/MenuPlan worktree add -b bot/mi-tema C:/dev/MenuPlan-mi-tema origin/staging
  cp C:/dev/MenuPlan/.env.local C:/dev/MenuPlan-mi-tema/ && cd C:/dev/MenuPlan-mi-tema && npm ci
  ```
  Primer push: `git push -u origin <rama>`. Un hook personal de Pablo borra solas las carpetas ya fusionadas y limpias. La app en local: `npm run dev -- --port 5176` (el login con Google solo vuelve a ese puerto).
- Antes del PR, y de cada push de arreglo, `git fetch origin && git merge origin/staging` y resuelve (el ruleset exigirá estar al día). Añade los ficheros por nombre (nada de `git add .`) y nada de `git stash`: es común a todas las carpetas.
- Tests: en local, los de lo que tocas (`npx vitest run <ficheros>`); la suite entera la corre el CI.
- En el cuerpo del PR, el CI solo exige una línea: si toca `.github/workflows/`, `scripts/workflows-pr.mjs` o `scripts/migraciones-pr.mjs`, `Jueces: …, seguridad` (sin «pendiente», «falta», «sin» ni «no»), tras una revisión de seguridad. `Closes #n` cierra el issue al fusionar, si lo hay.

## Base de datos

**Solo hay una base y es producción**: staging, local y los scripts escriben en ella.

- Leer: `npm run consulta -- "<select>"` y `node scripts/verificar-estado.mjs` (solo lectura).
- Una migración nueva: número siguiente al último de `origin/staging`; el CI falla si toca una ya aplicada o repite el número de otro PR abierto. El código **no puede depender de que la migración ya esté** (la rama se despliega antes): plan B siempre.
- La aplica **Pablo**: las sesiones no tienen la URL de administrador. El ensayo (`node scripts/apply-migration.mjs <nombre>`) y el `--si` los lanza él desde una PowerShell aparte; la sesión le deja el comando. El script pide la migración en staging, un ensayo de menos de una hora y la línea `-- AUDITADA: auditor-datos AAAA-MM-DD OK` en la cabecera. Detalle en la regla `migraciones` y la skill `supabase`.
- Ningún campo ni tabla sin lector, y cada dato en un solo sitio.

## Identidad de las sesiones

Al abrir sesión, `.claude/hooks/identidad.mjs` da a `gh` y `git` el token de la App **`homenu-sesiones`**: commits y PR salen a su nombre. No usa la cuenta de Pablo porque Pablo es administrador: con ella una sesión podría fusionar a `main` o cambiar las reglas del repo. En PowerShell, `node scripts/token-sesion.mjs -- <comando>` (en el PC de Pablo es obligatorio; en otro PC, `gh` y `git` van con la cuenta de quien está delante). `.claude/hooks/guardia-minima.mjs` niega volver a las credenciales de Pablo (quitar `GH_TOKEN`, `git -c credential.…`, aprobar PR…). Detalle: skill `github`.

**Nada fuera de `C:\dev\MenuPlan*`** (o de la carpeta del repo y sus `-<tarea>`, si en ese PC se llama de otra forma). En `C:\dev` viven también la Fábrica (`fabrica*`) y el panel (`homenu-panel*`). `guardia-minima.mjs` (con `fueraDelRepo.mjs`) niega escribir, borrar, entrar o ejecutar en esas carpetas; leerlas sí se puede. Lo que haya que cambiar ahí se hace desde una sesión abierta en esa carpeta.

## Qué se le pregunta a Pablo

Solo lo irreversible o lo que sale fuera; lo demás se hace y se cuenta.

- **Se pregunta:** subir o fusionar a `main`; ensayar y aplicar migraciones (las lanza él); borrar o reescribir datos de familias, o cambiar RLS y permisos; borrar recursos de un servicio o ramas sin fusionar; crear, rotar o cambiar secretos; gastar dinero; escribir o publicar a personas; ampliar los permisos de `.claude/settings.json`.
- **No se pregunta:** leer producción con los scripts de arriba; issues y etiquetas; fusionar a `staging` con el CI en verde; retirar carpetas y ramas ya fusionadas.

## Reglas por carpeta y skills

- Reglas (`.claude/rules/`), saltan al leer o editar su zona: `lola` (`api/_bot/`, `api/bot/`), `catalogo` (`src/data/`, `src/utils/`, `src/lib/`), `ui` (`src/**/*.jsx`), `api` (`api/*.js`), `migraciones` (`supabase/`) y `tests`.
- Skills (`.claude/skills/`), runbooks de cada servicio: `1password`, `alta-de-secreto`, `github`, `hetzner`, `supabase`, `tailscale`, `telegram` y `vercel`.

## Código

UTF-8 sin BOM, saltos LF, comentarios en castellano. Gemini para imágenes, Anthropic para texto. **La hora es la de Madrid y sale de `npm run hora`**, nunca de `date` (en Git Bash da UTC sin avisar).

## Pensar en datos

Lo que se repite, en vocabulario cerrado (CHECK + constante JS + test) para poder contarlo; la clase del problema y no el caso; y la cifra antes y después de cada arreglo.

## Cómo se le habla a Pablo

Pablo no es informático. Primera línea: **la idea raíz, en negrita**, una frase. Cuatro ideas como mucho, en llano; un término técnico, explicado en media frase. Si es una decisión, tres opciones con la recomendada primero.
