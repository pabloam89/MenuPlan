/**
 * limpiar-worktrees.mjs — borra los worktrees cuya rama ya está mergeada.
 *
 * Por qué: cada worktree es una copia entera del repo, y en OneDrive cada
 * lectura de los tests se multiplica (OneDrive la sincroniza y el antivirus la
 * vuelve a escanear). Un worktree mergeado no aporta nada y pesa en disco y en
 * memoria. Pablo (8 oct 2026): «worktree mergeado, se borra al toque».
 *
 * Qué borra: un worktree (nunca el principal) cuya rama
 *   - está contenida en origin/staging o en origin/main, o
 *   - tiene la rama remota borrada tras un merge (gh la borra al mergear),
 * y que además está LIMPIO (sin cambios sin commitear ni commits sin subir).
 * Un worktree sucio no se toca: se avisa, porque puede ser trabajo de otra sesión.
 *
 * Ojo con node_modules: en muchos worktrees es una unión (junction) a otro
 * worktree. Se quita la unión ANTES de borrar el worktree; si no, borrar
 * recursivamente podría vaciar la carpeta de destino.
 *
 *   node scripts/limpiar-worktrees.mjs            # ensayo: dice qué borraría
 *   node scripts/limpiar-worktrees.mjs --si       # borra
 *   node scripts/limpiar-worktrees.mjs --si --silencio   # al empezar sesión
 *   node scripts/limpiar-worktrees.mjs --hook            # tras un `gh pr merge`
 *
 * Dónde está enganchado: el hook de Claude Code en .claude/settings.local.json
 * de cada máquina (PostToolUse tras un merge, y SessionStart para lo que se
 * mergeó desde la web).
 */
import { execFileSync } from "node:child_process";
import { existsSync, lstatSync, readlinkSync, rmdirSync, unlinkSync } from "node:fs";
import { join, resolve } from "node:path";

// --hook: lo llama Claude Code (PostToolUse de Bash/PowerShell). Lee la llamada
// por stdin y solo actúa si el comando era un merge de PR; borra en silencio.
const HOOK = process.argv.includes("--hook");
if (HOOK) {
  let entrada = "";
  for await (const trozo of process.stdin) entrada += trozo;
  const comando = (() => { try { return JSON.parse(entrada)?.tool_input?.command ?? ""; } catch { return ""; } })();
  if (!/\bgh\s+pr\s+merge\b|\bgit\s+(merge|pull)\b/.test(comando)) process.exit(0);
}
const SI = HOOK || process.argv.includes("--si");
const SILENCIO = HOOK || process.argv.includes("--silencio");
const log = (...a) => { if (!SILENCIO) console.log(...a); };

const git = (args, cwd) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
const intenta = (f) => { try { return f(); } catch { return null; } };

const raiz = git(["rev-parse", "--path-format=absolute", "--git-common-dir"], process.cwd()).replace(/[\\/]\.git$/, "");
intenta(() => git(["fetch", "-q", "--prune", "origin"], raiz));

// git worktree list --porcelain: bloques separados por línea vacía.
const bloques = git(["worktree", "list", "--porcelain"], raiz).split(/\r?\n\r?\n/).map((b) => {
  const o = {};
  for (const l of b.split(/\r?\n/)) {
    const [k, ...v] = l.split(" ");
    o[k] = v.join(" ") || true;
  }
  return o;
});
const principal = resolve(bloques[0].worktree);
const objetivos = ["origin/staging", "origin/main"].filter((r) => intenta(() => git(["rev-parse", "--verify", r], raiz)));

const mergeada = (rama) =>
  objetivos.some((o) => intenta(() => (git(["merge-base", "--is-ancestor", rama, o], raiz), true)));
const remotaBorrada = (rama) =>
  Boolean(intenta(() => git(["config", `branch.${rama}.remote`], raiz))) &&
  !intenta(() => git(["rev-parse", "--verify", `refs/remotes/origin/${rama}`], raiz));

/** Quita node_modules si es una unión o un enlace, sin tocar su destino. */
function soltarUniones(dir) {
  const nm = join(dir, "node_modules");
  const st = intenta(() => lstatSync(nm));
  if (!st) return;
  const esUnion = st.isSymbolicLink() || Boolean(intenta(() => readlinkSync(nm)));
  if (!esUnion) return;
  // En Windows una junction se quita con rmdir (no recursivo); en otros, unlink.
  if (!intenta(() => (rmdirSync(nm), true))) unlinkSync(nm);
}

// Worktrees que prestan su node_modules a otros por una unión: no se borran
// mientras alguien cuelgue de ellos.
const anfitriones = new Set();
for (const w of bloques) {
  const destino = intenta(() => readlinkSync(join(resolve(w.worktree), "node_modules")));
  if (destino) anfitriones.add(resolve(destino, "..").toLowerCase());
}

let borrados = 0;
for (const w of bloques.slice(1)) {
  const dir = resolve(w.worktree);
  if (dir === principal || !existsSync(dir)) continue;
  const rama = typeof w.branch === "string" ? w.branch.replace("refs/heads/", "") : null;
  // Desconectado (detached): se trata como mergeado si su HEAD está en staging/main.
  const sinSubir = rama ? intenta(() => git(["log", "--oneline", rama, "--not", "--remotes"], raiz)) : "";
  const lista = rama ? mergeada(rama) || (remotaBorrada(rama) && !sinSubir) : mergeada(w.HEAD);
  if (!lista) continue;
  if (anfitriones.has(dir.toLowerCase())) {
    log(`· dejo ${dir}: otros worktrees usan su node_modules`);
    continue;
  }
  const sucio = intenta(() => git(["status", "--porcelain"], dir)) ?? "x";
  // El snapshot que vitest reescribe solo por fin de línea no cuenta como trabajo.
  const cambios = sucio.split(/\r?\n/).filter((l) => l && !/fichas\.test\.js\.snap$/.test(l));
  if (cambios.length) {
    log(`· dejo ${dir} (${rama ?? "detached"}): tiene cambios sin guardar`);
    continue;
  }
  log(`${SI ? "✓ borro" : "· borraría"} ${dir} (${rama ?? "detached"})`);
  if (!SI) continue;
  soltarUniones(dir);
  intenta(() => git(["checkout", "--", "."], dir));
  if (intenta(() => (git(["worktree", "remove", "--force", dir], raiz), true))) {
    borrados++;
    if (rama) intenta(() => git(["branch", "-D", rama], raiz));
  } else log(`  ⚠ no pude borrar ${dir}`);
}
intenta(() => git(["worktree", "prune"], raiz));
log(SI ? `${borrados} worktrees borrados.` : "Ensayo: repite con --si para borrar.");
