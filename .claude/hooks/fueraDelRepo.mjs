/**
 * fueraDelRepo.mjs — una sesión de MenuPlan no escribe en otras carpetas de `C:\dev`.
 *
 * Pablo lo pidió el 19 oct 2026, tras borrar la Factoría antigua (#878): en `C:\dev` viven
 * también la Fábrica (`fabrica`, `fabrica-*`), el panel (`homenu-panel*`) y otras cosas suyas,
 * y una sesión de MenuPlan, que trabaja sobre el mismo disco, podía borrarlas o cambiarlas.
 * Los vigilantes de la Fábrica solo corren en sesiones abiertas en su carpeta, no desde aquí.
 *
 * Lo propio es `C:\dev\MenuPlan` y `C:\dev\MenuPlan-*` (las carpetas de tarea). Todo lo demás
 * que cuelga de `C:\dev` es ajeno. Se niega:
 *  - Edit, Write y NotebookEdit sobre un fichero ajeno;
 *  - entrar en una carpeta ajena (`cd`, `pushd`, `Set-Location`), porque el directorio de Bash
 *    se conserva entre órdenes y la siguiente ya no nombraría la ruta;
 *  - una orden que nombra una ruta ajena y lleva algo que escribe o ejecuta (rm, mv, cp,
 *    Remove-Item, git commit/push/reset…, npm, node, una redirección a esa ruta…);
 *  - cualquier orden que escribe o ejecuta si la sesión ya está dentro de una carpeta ajena.
 * Leer (ls, cat, grep, `git -C … log`) se deja: sirve para mirar sin tocar.
 *
 * Es un filtro de buena fe, como el resto de la guardia mínima: una orden retorcida a propósito
 * puede escaparse. La barrera de fondo de lo que está en GitHub es que la App de las sesiones
 * solo puede leer los repos de la Fábrica (comprobado el 19 oct 2026).
 */
import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { basename, dirname } from "node:path";

/** Las entradas de `C:\dev` que no son de MenuPlan, en minúsculas. Si no se puede leer, ninguna. */
export function hermanasDeDisco(raiz = "C:/dev") {
  try {
    return readdirSync(raiz).map((n) => n.toLowerCase()).filter((n) => !esPropia(n));
  } catch {
    return [];
  }
}

// El nombre de la carpeta principal de este repo en este PC, si no se llama MenuPlan (Álvaro puede
// tenerlo en `C:\dev\HoMenu`, 19 oct 2026). Lo fija la guardia al arrancar con raizPropiaDeGit.
let raizPropia = null;

/** Fija (o borra, con null) el nombre de la carpeta principal del repo en este PC. */
export function fijarRaizPropia(nombre) {
  raizPropia = nombre ? String(nombre).toLowerCase() : null;
}

/**
 * El nombre de la carpeta principal del repo al que pertenece `dir` (también desde una carpeta
 * de tarea: sale del directorio común de git), o null si git no contesta.
 */
export function raizPropiaDeGit(dir) {
  try {
    const comun = execFileSync("git", ["-C", dir, "rev-parse", "--path-format=absolute", "--git-common-dir"], {
      encoding: "utf8", timeout: 5000, windowsHide: true, stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    return comun ? basename(dirname(comun)) : null;
  } catch {
    return null;
  }
}

/** `menuplan` y `menuplan-<tarea>` son de este repo, y también la carpeta principal y sus `-<tarea>`. */
function esPropia(nombre) {
  const n = String(nombre).toLowerCase();
  if (/^menuplan(?:-|$)/.test(n)) return true;
  return Boolean(raizPropia) && (n === raizPropia || n.startsWith(`${raizPropia}-`));
}

/** Lleva una ruta a la forma `c:/dev/x/...`: barras normales, minúsculas, `/c/` de Git Bash a `c:/`. */
function normalizar(ruta) {
  let p = String(ruta ?? "").trim().replace(/^["']|["']$/g, "").replace(/\\+/g, "/").replace(/\/+/g, "/").toLowerCase();
  p = p.replace(/^\/([a-z])\//, "$1:/");
  return p;
}

/** Si la ruta absoluta cae en `C:\dev\<ajeno>`, el nombre ajeno; si no, null. */
export function carpetaAjena(ruta) {
  const m = /^[a-z]:\/dev\/([^/]+)/.exec(normalizar(ruta));
  if (!m) return null;
  return esPropia(m[1]) ? null : m[1];
}

// Rutas absolutas a `dev\<nombre>`: `C:\dev\x`, `C:/dev/x`, `/c/dev/x`, con o sin comillas.
const RUTA_ABS = /(?:\b[a-zA-Z]:|(?<![\w.~$-])\/[a-zA-Z](?=[\\/]))[\\/]+dev[\\/]+([^\\/\s"'`;|&<>(){}*?]+)/g;
// Rutas relativas que suben: `..\fabrica`, `../../dev/fabrica`.
const RUTA_REL = /(?:^|[\s"'=(])(?:\.\.[\\/]+)+(?:dev[\\/]+)?([^\\/\s"'`;|&<>(){}*?]+)/g;

/** Los nombres ajenos que nombra la orden. */
export function ajenasEnOrden(cmd, hermanas = []) {
  const s = String(cmd ?? "");
  const nombres = new Set();
  for (const m of s.matchAll(RUTA_ABS)) {
    const n = m[1].toLowerCase();
    if (!esPropia(n)) nombres.add(n);
  }
  for (const m of s.matchAll(RUTA_REL)) {
    const n = m[1].toLowerCase();
    if (n !== ".." && n !== "." && hermanas.includes(n)) nombres.add(n);
  }
  return [...nombres];
}

// Lo que escribe, borra o ejecuta, mirado al principio de cada orden de la línea (tras `;`, `&&`,
// `|`, un salto o un paréntesis), para no confundir `cat CLAUDE.md` con `md`. Ejecutar cuenta: un
// `npm run` o un `node x.mjs` dentro de otro repo puede hacer cualquier cosa.
const VERBO = new RegExp(
  String.raw`^(?:sudo\s+|xargs\s+(?:-\S+\s+)*|&\s*)?(?:` +
    [
      String.raw`(?:rm|rmdir|del|erase|rd|mv|cp|move|copy|xcopy|robocopy|ren|rename|mkdir|md|touch|tee|truncate|ln|chmod|chown|unlink|install|dd|ni|ri|mi|ci|sc|ac)\b`,
      String.raw`(?:remove|move|copy|rename|new|set|add|clear)-(?:item|content|itemproperty)\b`,
      String.raw`out-file\b`,
      String.raw`(?:sed|perl)\b.*\s-i`,
      String.raw`(?:npm|npx|pnpm|yarn|node|bun|deno|python3?|py|bash|sh|pwsh|powershell|cmd)\b`,
      String.raw`git\b.*?\s(?:commit|push|reset|checkout|switch|clean|restore|rm|mv|merge|rebase|pull|stash|apply|am|cherry-pick|revert|worktree|branch|tag|init|clone|gc|prune|update-ref|config|add|fetch)\b`,
    ].join("|") +
    ")",
  "i",
);
// Llamadas a .NET que escriben, en cualquier sitio de la línea.
const DOTNET = /\[(?:system\.)?io\.(?:file|directory|path)\]::(?!exists|get|read|open(?!write)|combine)/i;

/** ¿Hay en la orden algo que escribe o ejecuta? */
function escribe(cmd) {
  if (DOTNET.test(cmd)) return true;
  return cmd
    .split(/;|&&|\|\||\||\n|\(|\)|\{|\}/)
    .map((s) => s.trim().replace(/^["']+/, ""))
    .some((s) => VERBO.test(s));
}

// Entrar en una carpeta: la ruta va justo detrás.
const ENTRA = /(?:^|[;&|\n(]\s*|\s)(?:cd|pushd|set-location|sl|chdir)\s+(?:-(?:path|literalpath)\s+)?(["']?)([^\s"';&|)]+)\1/gi;

// Redirección a fichero (no `2>&1`, ni a /dev/null, $null o NUL).
const REDIRIGE = /(?<![0-9&])\d?>>?\s*(["']?)([^\s"';&|)]+)\1/g;

function resolverDesde(cwd, destino) {
  const d = normalizar(destino);
  if (/^[a-z]:\//.test(d)) return d;
  if (!cwd) return d;
  const partes = normalizar(cwd).split("/");
  for (const trozo of d.split("/")) {
    if (trozo === "..") partes.pop();
    else if (trozo && trozo !== ".") partes.push(trozo);
  }
  return partes.join("/");
}

/**
 * Pura. `entrada` es la de un PreToolUse de Claude Code. Devuelve el nombre de la carpeta ajena
 * que se tocaría, o null.
 */
export function fueraDelRepo(entrada, { hermanas = [] } = {}) {
  const herramienta = entrada?.tool_name;
  const input = entrada?.tool_input ?? {};

  if (herramienta === "Edit" || herramienta === "Write" || herramienta === "NotebookEdit" || herramienta === "MultiEdit") {
    return carpetaAjena(input.file_path ?? input.notebook_path ?? "");
  }
  if (herramienta !== "Bash" && herramienta !== "PowerShell") return null;

  const cmd = String(input.command ?? "");
  const cwd = entrada?.cwd ?? "";

  // 1. Ya dentro de una carpeta ajena: nada que escriba ni ejecute.
  const dentro = carpetaAjena(cwd);
  if (dentro && escribe(cmd)) return dentro;

  // 2. Entrar en una carpeta ajena.
  for (const m of cmd.matchAll(ENTRA)) {
    const ajena = carpetaAjena(resolverDesde(cwd, m[2]));
    if (ajena) return ajena;
  }

  // 3. Redirigir la salida a un fichero ajeno.
  for (const m of cmd.matchAll(REDIRIGE)) {
    const destino = m[2];
    if (/^(?:\/dev\/null|\$null|nul)$/i.test(destino) || /^&/.test(destino)) continue;
    const ajena = carpetaAjena(resolverDesde(cwd, destino));
    if (ajena) return ajena;
  }

  // 4. Nombrar una ruta ajena junto a algo que escribe o ejecuta.
  const ajenas = ajenasEnOrden(cmd, hermanas);
  if (ajenas.length && escribe(cmd)) return ajenas[0];

  return null;
}

export const AVISO_FUERA = (nombre) =>
  `Esta sesión es de MenuPlan y no escribe fuera de C:\\dev\\MenuPlan y C:\\dev\\MenuPlan-* (aquí: «${nombre}»). ` +
  "Lo pidió Pablo el 19 oct 2026: en C:\\dev viven también la Fábrica y el panel, y no son de este repo. " +
  "Leer sí se puede (ls, cat, grep, git log). Si hace falta cambiar algo ahí, se hace desde una sesión abierta en esa carpeta.";
