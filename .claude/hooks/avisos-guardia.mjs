/**
 * avisos-guardia.mjs — los avisos de la guardia, por campos (#494, fondo #488).
 *
 * Cada «no» y cada pregunta de `guardia.mjs` es un aviso con un id y UN `codigo`, el id de
 * la norma de `ops/normas.json` que hace cumplir. El mensaje no se escribe a mano: sale de
 * cuatro partes fijas, en este orden, para que todos se lean igual:
 *
 *   que        qué se niega (o qué se pregunta)
 *   porque     por qué
 *   enSuLugar  qué hacer en su lugar
 *   quien      a quién pedirlo; solo si aplica
 *
 * Una parte puede llevar `{variable}` y se rellena con los datos de la acción (el número de
 * un issue, la lista de ficheros…). El texto final es:
 *   «<Que>. Por qué: <porque>. En su lugar: <enSuLugar>. Pídeselo a: <quien>. (norma: <codigo>)»
 *
 * Contar: el id del aviso (`nombre`) y el `codigo` de su norma van a cada línea del registro
 * de eventos (`eventos.mjs`). Varios avisos pueden hacer cumplir la misma norma.
 *
 * Esto NO decide qué se niega ni cuándo: eso es de `guardia.mjs`. Lo vigila
 * `ops/normas.test.js`: cada aviso tiene sus partes y su norma existe, y cada `deny(`/`ask(`
 * de la guardia nombra un aviso de aquí. Sin imports: la guardia no puede depender de nada
 * que falle al cargar.
 */

/** Cómo pedir un token nuevo de la sesión (dura 1 hora). */
const AYUDA_TOKEN = "Si el token ha caducado (dura 1 hora), pide uno nuevo con `node scripts/token-sesion.mjs -- <comando>` (por ejemplo `node scripts/token-sesion.mjs -- gh pr list` o `-- git push`)";

/** Las partes de un aviso, en el orden en que salen. `quien` es opcional. */
export const PARTES = ["que", "porque", "enSuLugar", "quien"];

/**
 * id del aviso → { codigo, que, porque, enSuLugar, quien? }. Las partes van sin punto final:
 * el formateador lo pone.
 */
export const AVISOS = {
  // ── Ramas y PR ─────────────────────────────────────────────────────────
  "push-a-main": {
    codigo: "main-solo-pablo",
    que: "Subir a main desde una sesión",
    porque: "main es producción",
    enSuLugar: "abre un PR a staging; el paso a main lo hace Pablo cuando lo pide",
    quien: "Pablo",
  },
  "push-directo-a-staging": {
    codigo: "staging-exige-tests",
    que: "Subir directo a staging",
    porque: "a staging se llega por PR con el CI en verde",
    enSuLugar: "empuja tu rama y abre un PR a staging; con el CI en verde lo puedes fusionar",
  },
  "push-forzado": {
    codigo: "push-forzado-con-permiso",
    que: "Hacer un push forzado",
    porque: "reescribe la historia de la rama remota",
    enSuLugar: "confirma que la rama es tuya y que nadie más trabaja en ella",
  },
  "pr-sin-closes": {
    codigo: "pr-al-dia-y-closes",
    que: "Abrir el PR sin `Closes #{issue}` en su cuerpo",
    porque: "tu rama es del issue #{issue}: sin el `Closes` no se cierra al fusionar y no queda la traza",
    enSuLugar: "pon `Closes #{issue}` en el cuerpo del PR, y la línea `Agente: <nombre>`",
  },
  "pr-sin-casos": {
    codigo: "cuando-algo-falla",
    que: "Abrir el PR sin una línea «Casos:» válida",
    porque: "{motivo}",
    enSuLugar: "{ayuda}; el CI lo vuelve a comprobar",
  },
  "rama-atrasada": {
    codigo: "pr-al-dia-y-closes",
    que: "Abrir el PR con la rama atrasada",
    porque: "tu rama va {atraso} commit(s) por detrás de staging y chocaría con lo que han metido otras sesiones",
    enSuLugar: "`git fetch origin staging`, `git merge origin/staging`, resuelve, pasa los tests y empuja",
  },
  "rama-sin-comprobar": {
    codigo: "pr-al-dia-y-closes",
    que: "Abrir el PR sin saber si la rama tiene lo último de staging",
    porque: "no he podido comprobar si tu rama tiene lo último de staging",
    enSuLugar: "haz `git fetch origin staging` y `git merge origin/staging` antes de abrir el PR",
  },
  "pr-pisado-por-staging": {
    codigo: "pr-al-dia-y-closes",
    que: "Fusionar este PR sin ponerlo al día",
    porque: "desde que se abrió, staging ha cambiado sus mismos ficheros ({lista}) y el CI no los ha probado juntos",
    enSuLugar: "ponlo al día (`gh pr update-branch{pr}` o merge de origin/staging y push), espera el CI en verde y fusiona",
  },
  "pr-choques-sin-comprobar": {
    codigo: "pr-al-dia-y-closes",
    que: "Fusionar este PR sin saber si staging ha tocado lo mismo",
    porque: "no he podido comprobar si staging ha tocado lo mismo que este PR",
    enSuLugar: "míralo antes de fusionar",
  },
  "fusion-con-repo-ajeno": {
    codigo: "main-solo-pablo",
    que: "Fusionar con `gh -R … pr merge`",
    porque: "no deja comprobar la base del PR",
    enSuLugar: "fusiona desde la carpeta del repo, con el número del PR",
  },
  "fusion-sin-numero": {
    codigo: "guardia-vigila-cada-orden",
    que: "Fusionar sin el número del PR justo detrás de `merge`",
    porque: "así la guardia mira el mismo PR que fusiona gh",
    enSuLugar: "pon el número del PR justo detrás de `merge` (`gh pr merge 230 --squash`)",
  },
  "fusion-auto": {
    codigo: "main-solo-pablo",
    que: "Fusionar con `gh pr merge --auto`",
    porque: "fusiona más tarde, cuando nadie mira la base",
    enSuLugar: "fusiona a mano con el CI en verde",
  },
  "fusion-fuera-de-staging": {
    codigo: "main-solo-pablo",
    que: "Fusionar un PR que va contra {base}",
    porque: "no va contra staging, y fusionar fuera de staging llega a producción",
    enSuLugar: "deja el PR listo y que lo fusione Pablo",
    quien: "Pablo",
  },
  "fusion-base-ilegible": {
    codigo: "main-solo-pablo",
    que: "Fusionar un PR sin conocer su rama base",
    porque: "no he podido leer la rama base de este PR",
    enSuLugar: "comprueba que la base es staging; si no lo es, solo Pablo lo fusiona",
    quien: "Pablo",
  },
  "base-cambiada": {
    codigo: "main-solo-pablo",
    que: "Cambiar la base de un PR a {base}",
    porque: "lo llevaría fuera de staging",
    enSuLugar: "deja la base en staging",
    quien: "Pablo",
  },
  "fusion-por-api": {
    codigo: "main-solo-pablo",
    que: "Fusionar, cambiar la base de un PR o borrar por `gh api`",
    porque: "se salta la guardia",
    enSuLugar: "usa `gh pr merge <n>` (a staging)",
    quien: "Pablo",
  },

  // ── Hábitos de la sesión ───────────────────────────────────────────────
  "stash": {
    codigo: "sin-git-stash",
    que: "Usar `git stash`",
    porque: "es común a todos los worktrees y se cruza con otras sesiones",
    enSuLugar: "usa un worktree aparte o `git show origin/staging:<ruta>` para comparar",
  },
  "add-a-ciegas": {
    codigo: "sin-git-add-todo",
    que: "Usar `git add .`, `-A` o `commit -a`",
    porque: "se cuelan en el commit cambios de otras sesiones",
    enSuLugar: "mira `git status --short` y añade por nombre solo lo que has tocado tú",
  },
  "vite-build-a-secas": {
    codigo: "build-con-prebuild",
    que: "Lanzar `vite build` a secas",
    porque: "se salta el prebuild (validate-catalog + check:tdz), que es lo que corre Vercel",
    enSuLugar: "usa `npm run build`",
  },
  "issue-a-pelo": {
    codigo: "issues-con-buscar-antes",
    que: "Crear un issue con `gh issue create`",
    porque: "no mira lo que ya está apuntado y no asigna a Pablo las decisiones",
    enSuLugar: "usa `npm run issues -- --nuevo \"título\" --tipo … --area … --cuerpo <fichero>`, que antes enseña los parecidos; si ya existe uno, comenta allí",
  },
  "borrar-issue": {
    codigo: "issues-no-se-borran",
    que: "Borrar o trasladar un issue, o borrar una etiqueta",
    porque: "no tiene vuelta atrás",
    enSuLugar: "ciérralo o retírala con `npm run issues -- --etiquetas`",
  },
  "escribir-por-terminal": {
    codigo: "edicion-con-edit-y-write",
    que: "Usar Set-Content, Out-File o Add-Content sobre ficheros del repo",
    porque: "rompen los acentos y meten BOM",
    enSuLugar: "edita con la herramienta Edit/Write",
  },
  "carpeta-principal": {
    codigo: "no-trabajar-en-principal",
    que: "Trabajar en la carpeta principal (C:\\dev\\MenuPlan)",
    porque: "es de todas las sesiones y en ella no se trabaja, solo se mira y se lanza `npm run tarea`",
    enSuLugar: "abre la tuya con `npm run tarea -- <area>/<nombre>` y trabaja allí",
  },
  "puerta-de-skill-comando": {
    codigo: "skill-antes-de-riesgo",
    que: "Lanzar este comando sin haber abierto {las_skills} {lista}",
    porque: "es de los que, mal hechos, cuestan caro, y {su_dominio_tiene} runbook con lo que ya falló aquí",
    enSuLugar: "abre antes {las_skills} {lista} (herramienta {abre}) y reintenta el mismo comando; este aviso sale una sola vez por skill y sesión: al reintentar pasa",
  },
  "puerta-de-skill-edicion": {
    codigo: "skill-antes-de-tocar",
    que: "Editar este fichero sin haber abierto {las_skills} {lista}",
    porque: "es de un dominio con runbook: {sus_skills_tienen} lo que ya falló aquí y cómo se hace",
    enSuLugar: "abre antes {las_skills} {lista} (herramienta {abre}) y reintenta la misma edición; este aviso sale una sola vez por skill y sesión: al reintentar pasa",
  },
  "escribir-lo-de-lola": {
    codigo: "evals-antes-de-fusionar",
    que: "Escribir desde la shell en lo que lee Lola",
    porque: "así no se carga `.claude/rules/lola.md`, y si cambia lo que lee Lola hay que pasar los evals",
    enSuLugar: "usa Edit y pasa los evals (`scripts/bot-evals.mjs`) antes de mergear",
  },
  "entrada-ilegible": {
    codigo: "guardia-vigila-cada-orden",
    que: "Dejar pasar una orden que la guardia no ha podido leer",
    porque: "sin leerla, la guardia no sabe si es segura",
    enSuLugar: "decide tú si la dejas pasar",
  },

  // ── Producción, base de datos y migraciones ────────────────────────────
  "vercel-production": {
    codigo: "variables-production-solo-pablo",
    que: "Bajar o listar las variables de Production de Vercel",
    porque: "tienen la clave de administrador de la base y el token del bot (#332)",
    enSuLugar: "para desarrollo usa `.env.local` (direcciones `op://`)",
    quien: "Pablo, con el comando para que lo lance él con `!`",
  },
  "op-de-pablo": {
    codigo: "claves-de-pablo-solo-pablo",
    que: "Leer 1Password fuera de `npm run op -- …`, o tocar lo que es de Pablo",
    porque: "las sesiones leen solo con la cuenta de servicio de `HoMenu-sesiones`, y `op` a pelo, sin token, iría por la app y le sacaría una ventana a Pablo (#328)",
    enSuLugar: "usa siempre `npm run op -- …`, sin `MENUPLAN_OP_PABLO`, sin tocar `OP_SERVICE_ACCOUNT_TOKEN` y sin `op://HoMenu`; si solo es texto de un commit, PR o issue, pásalo por fichero (`git commit -F`, `--body-file`)",
    quien: "Pablo, desde su propia terminal, si hace falta algo de producción",
  },
  "apply-migration-pablo": {
    codigo: "migracion-pablo-solo-pablo",
    que: "Lanzar `apply-migration` con `--pablo`",
    porque: "borra algo con datos o cambia RLS o permisos",
    enSuLugar: "enséñale a Pablo el ensayo y el veredicto del juez",
    quien: "Pablo, con el comando para que lo lance él con `!`",
  },
  "sql-contra-produccion": {
    codigo: "sin-sql-a-mano",
    que: "Escribir SQL a mano que escribe, borra o cambia permisos contra producción",
    porque: "producción es la única base",
    enSuLugar: "ponlo en una migración por `scripts/apply-migration.mjs`",
    quien: "Pablo, con el comando para que lo lance él con `!`, si de verdad hace falta a mano",
  },
  "migracion-numero-ocupado": {
    codigo: "migracion-numero-libre",
    que: "Usar el número {numero} para una migración",
    porque: "ya es de {otra} en staging",
    enSuLugar: "usa el siguiente libre (te lo dice el arranque de la sesión)",
  },
  "migracion-estado-ilegible": {
    codigo: "migracion-aplicada-no-se-edita",
    que: "Editar {nombre} sin saber si está aplicada",
    porque: "no puedo leer supabase/ESTADO.md",
    enSuLugar: "compruébalo antes de editarla",
  },
  "migracion-aplicada": {
    codigo: "migracion-aplicada-no-se-edita",
    que: "Editar {nombre}, que ya está aplicada en producción",
    porque: "no figura «sin aplicar» en supabase/ESTADO.md y producción ya ejecutó la versión vieja",
    enSuLugar: "escribe una migración nueva con el siguiente número libre",
  },

  // ── La identidad de la sesión y las reglas del repo (#447) ─────────────
  "token-de-sesion-quitado": {
    codigo: "sesion-con-su-identidad",
    que: "Quitar o vaciar GH_TOKEN",
    porque: "deja a gh y a git con las credenciales de Pablo (administrador): la sesión va con la identidad de la App homenu-sesiones a propósito (#447)",
    enSuLugar: AYUDA_TOKEN,
  },
  "identidad-git-cambiada": {
    codigo: "sesion-con-su-identidad",
    que: "Cambiar de dónde saca git sus credenciales o quién firma (credential.helper, GIT_CONFIG_*, GIT_AUTHOR_*, GIT_COMMITTER_*)",
    porque: "es salirse de la identidad de la sesión (#447)",
    enSuLugar: `si un push o un commit falla, mira el error y cuéntalo en vez de rodearlo. ${AYUDA_TOKEN}`,
  },
  "credenciales-guardadas": {
    codigo: "sesion-con-su-identidad",
    que: "Sacar o cambiar las credenciales guardadas del PC (gh auth token, login o switch, git credential, cmdkey)",
    porque: "es salirse de la identidad de la sesión (#447)",
    enSuLugar: `${AYUDA_TOKEN}. Si hace falta de verdad una credencial de Pablo, dale el comando para que lo lance él con \`!\``,
    quien: "Pablo",
  },
  "powershell-sin-token": {
    codigo: "sesion-con-su-identidad",
    que: "Lanzar gh o git (push, pull, fetch, clone) desde PowerShell sin envoltorio",
    porque: "en PowerShell la sesión no lleva el token de la App: gh y git irían con las credenciales de Pablo (#447)",
    enSuLugar: "usa Bash, o envuélvelo: `node scripts/token-sesion.mjs -- <comando>`",
  },
  "reglas-del-repo": {
    codigo: "ajustes-servicios-ok-pablo",
    que: "Cambiar las reglas del repo (rulesets, protección de ramas, colaboradores, secretos, variables, ajustes del repo, environments, hooks o llaves)",
    porque: "es solo de Pablo (#447): hace falta una credencial de administrador, que la sesión no tiene",
    enSuLugar: "prepara el cambio y el comando exacto; una consulta de GraphQL desde un fichero tampoco se puede leer: escríbela en el propio comando",
    quien: "Pablo, para que lo lance él con `!`",
  },
  "aprobar-pr": {
    codigo: "rutas-protegidas-aprobacion-de-dueno",
    que: "Aprobar un PR desde una sesión",
    porque: "la aprobación de dueño de código es de una persona (#447)",
    enSuLugar: "deja el PR listo con el CI en verde",
    quien: "Pablo o Álvaro, para que lo revisen",
  },
  "token-impreso": {
    codigo: "token-de-sesion-no-se-imprime",
    que: "Imprimir el token de la sesión",
    porque: "lo dejaría en la conversación (#447)",
    enSuLugar: "para comprobar que existe, usa `node scripts/token-sesion.mjs --comprobar`, que dice si vale sin enseñarlo",
  },
};

/** Qué aviso sale por cada familia de `credencialDeSesion` (credenciales.mjs). */
export const AVISO_POR_CREDENCIAL = {
  token: "token-de-sesion-quitado",
  identidad: "identidad-git-cambiada",
  guardadas: "credenciales-guardadas",
  reglas: "reglas-del-repo",
  aprobar: "aprobar-pr",
  imprimir: "token-impreso",
  powershell: "powershell-sin-token",
};

/** Una parte sin punto final ni espacios sobrantes: el formateador pone los puntos. */
const limpia = (t) => String(t).trim().replace(/[.\s]+$/, "");
const mayuscula = (t) => t.charAt(0).toUpperCase() + t.slice(1);

/** Rellena los `{variable}` de una parte. Una variable que falta sale tal cual, para verla. */
const rellena = (parte, vars) => String(parte).replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));

/**
 * El mensaje de un aviso: las cuatro partes en su orden fijo, con la norma al final.
 * Un id desconocido no lanza (la guardia no puede romperse por esto): sale un texto
 * genérico que lo nombra, y `ops/normas.test.js` falla antes de llegar aquí.
 */
export function textoDeAviso(id, vars = {}) {
  const a = AVISOS[id];
  if (!a) return `Orden no permitida por la guardia (aviso «${id}» sin definir). Por qué: la guardia no tiene su texto. En su lugar: cuéntaselo a Pablo.`;
  const p = (k) => limpia(rellena(a[k], vars));
  const piezas = [`${mayuscula(p("que"))}.`, `Por qué: ${p("porque")}.`, `En su lugar: ${p("enSuLugar")}.`];
  if (a.quien) piezas.push(`Pídeselo a: ${p("quien")}.`);
  piezas.push(`(norma: ${a.codigo})`);
  return piezas.join(" ");
}

/** La respuesta de la guardia: decisión, mensaje, id del aviso y código de su norma. */
export function avisoDe(decision, id, vars = {}) {
  return { decision, motivo: textoDeAviso(id, vars), aviso: id, codigo: AVISOS[id]?.codigo ?? null };
}
