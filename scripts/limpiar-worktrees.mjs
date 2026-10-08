/**
 * limpiar-worktrees.mjs — borra los worktrees cuya rama ya está mergeada.
 *
 * Por qué: cada worktree es una copia entera del repo, y en OneDrive cada
 * lectura de los tests se multiplica (OneDrive la sincroniza y el antivirus la
 * vuelve a escanear). Un worktree mergeado no aporta nada y pesa en disco y en
 * memoria. Pablo (8 oct 2026): «worktree mergeado, se borra al toque».
 *
 * Qué borra: un worktree (nunca el principal) cuya rama
 *   - se subió alguna vez a GitHub con su nombre (`git push -u`), y
 *   - está contenida en origin/staging o en origin/main, o tiene la rama
 *     remota borrada tras un merge (GitHub la borra al mergear),
 * y que además está LIMPIO (sin cambios sin commitear ni commits sin subir).
 * Un worktree sucio no se toca: se avisa, porque puede ser trabajo de otra sesión.
 *
 * Lo de «se subió alguna vez»: una rama recién creada desde staging, sin
 * commits, también está «contenida en staging». El 8 oct 2026 esto borraba la
 * carpeta nueva de cualquier sesión en cuanto otra arrancaba o fusionaba. Los
 * desconectados (detached) tampoco se borran solos, por lo mismo.
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
 * Lo que NO pudo borrar se dice siempre, también con --silencio (#141: dejaba
 * carpetas a medias y, como al arrancar va en silencio, nadie se enteraba). Lo
 * imprime y además lo apunta en la carpeta común de git
 * (`.git/claude-limpieza.json`); el arranque de la sesión (arranque.mjs) lo
 * enseña mientras la carpeta siga en disco.
 *
 * Dónde está enganchado: el hook de Claude Code en el settings.json de usuario
 * de cada máquina (PostToolUse tras un merge, y SessionStart para lo que se
 * mergeó desde la web), que llama a una copia de este fichero en
 * ~/.claude/hooks/. Si cambias este, copia el nuevo allí.
 */
import { execFileSync } from "node:child_process";
import { existsSync, lstatSync, readFileSync, readlinkSync, rmdirSync, unlinkSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

/**
 * ¿Está terminada la rama de este worktree? Pura, para poder probarla.
 * `subida`: tiene upstream con su propio nombre. `contenida`: es ancestro de
 * origin/staging o origin/main. `remotaBorrada`: tuvo remota y ya no está.
 * `sinSubir`: commits que no están en ninguna remota.
 */
export function terminada({ rama, subida, contenida, remotaBorrada, sinSubir }) {
  if (!rama || !subida) return false;
  return Boolean(contenida || (remotaBorrada && !sinSubir));
}

// ── Lo que no se pudo borrar (#141) ────────────────────────────────────────
// Un registro en la carpeta común de git, que comparten todos los worktrees y
// que git no versiona (como el de sesiones).
export const ficheroPendientes = (comun) => join(comun, "claude-limpieza.json");

/** El registro, o [] si no hay. Si está corrupto, lanza: quien lo lee avisa. */
export function leerPendientes(comun) {
  const f = ficheroPendientes(comun);
  if (!existsSync(f)) return [];
  const lista = JSON.parse(readFileSync(f, "utf8"));
  return Array.isArray(lista) ? lista : [];
}

/**
 * Junta lo que quedaba pendiente con lo nuevo de esta pasada. Se queda solo lo
 * que sigue en disco (`existe`); si una carpeta sale dos veces, vale la nueva.
 */
export function fusionarPendientes(previos, nuevos, existe) {
  const porCarpeta = new Map();
  for (const p of [...previos, ...nuevos]) porCarpeta.set(String(p.dir).toLowerCase(), p);
  return [...porCarpeta.values()].filter((p) => existe(p.dir));
}

/**
 * ¿Quedó algo tras intentar borrar? Se mira el disco, no lo que dice git: git
 * puede quitar el worktree de su lista y dejar la carpeta (un fichero
 * bloqueado, rutas largas en node_modules), y el `worktree prune` del final
 * borra la entrada aunque el remove fallara. Eso fue #141.
 */
export function problemaDelBorrado({ dir, rama, quitado, sigue }, ahora = new Date()) {
  if (!sigue) return null;
  return {
    dir,
    rama,
    motivo: quitado ? "git la quitó de su lista, pero la carpeta sigue en disco" : "falló `git worktree remove`",
    cuando: ahora.toISOString(),
  };
}

/**
 * Lo que se imprime de lo que no se pudo borrar. No depende de --silencio: se
 * dice siempre. Tras un merge (PostToolUse, `hook`), lo que se imprime sin más
 * no llega a la sesión y va como contexto adicional; al arrancar
 * (SessionStart), el texto llano sí llega.
 */
export function salidaDeProblemas(problemas, { hook = false } = {}) {
  if (!problemas.length) return "";
  const texto = problemas.map((p) => `⚠ no pude borrar ${p.dir} (${p.rama}): ${p.motivo}`).join("\n");
  if (hook) return JSON.stringify({ hookSpecificOutput: { hookEventName: "PostToolUse", additionalContext: texto } });
  return `${texto}\n`;
}

/** Las líneas de aviso para el arranque, una por carpeta que sigue en disco. */
export function avisosDeLimpieza(pendientes, existe = existsSync) {
  return pendientes
    .filter((p) => existe(p.dir))
    .map(
      (p) =>
        `AVISO: la limpieza de carpetas no pudo borrar ${p.dir}${p.rama ? ` (${p.rama})` : ""}: ${p.motivo}. ` +
        "La borra Pablo (con `!`), tras mirar que su node_modules no es una unión; si lo es, se quita antes la unión.",
    );
}

const esPrincipal = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (esPrincipal) {
  // --hook: lo llama Claude Code (PostToolUse de Bash/PowerShell). Lee la llamada
  // por stdin y solo actúa si el comando era un merge de PR; borra en silencio.
  const HOOK = process.argv.includes("--hook");
  if (HOOK) {
    let entrada = "";
    for await (const trozo of process.stdin) entrada += trozo;
    const comando = (() => {
      try {
        return JSON.parse(entrada)?.tool_input?.command ?? "";
      } catch {
        return ""; // a propósito: sin entrada legible no es un merge y no hay nada que limpiar
      }
    })();
    if (!/\bgh\s+pr\s+merge\b|\bgit\s+(merge|pull)\b/.test(comando)) process.exit(0);
  }
  const SI = HOOK || process.argv.includes("--si");
  const SILENCIO = HOOK || process.argv.includes("--silencio");
  const log = (...a) => { if (!SILENCIO) console.log(...a); };

  const git = (args, cwd) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  const intenta = (f) => {
    try {
      return f();
    } catch {
      // a propósito: git dice «no» saliendo con error (una ref que no existe, una
      // rama sin remota); quien llama trata el null. Lo que no se pudo BORRAR no
      // se queda aquí: se mira el disco y va a `problemas`.
      return null;
    }
  };
  const problemas = [];

  // El hook es de usuario (vale en cualquier carpeta): fuera de un repo, nada.
  const comun = intenta(() => git(["rev-parse", "--path-format=absolute", "--git-common-dir"], process.cwd()));
  if (!comun) process.exit(0);
  const raiz = comun.replace(/[\\/]\.git$/, "");
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

  const contenidaEn = (rama) =>
    objetivos.some((o) => intenta(() => (git(["merge-base", "--is-ancestor", rama, o], raiz), true)));
  const subidaConSuNombre = (rama) =>
    intenta(() => git(["config", `branch.${rama}.merge`], raiz)) === `refs/heads/${rama}`;
  const remotaBorradaDe = (rama) =>
    Boolean(intenta(() => git(["config", `branch.${rama}.remote`], raiz))) &&
    !intenta(() => git(["rev-parse", "--verify", `refs/remotes/origin/${rama}`], raiz));

  /** Quita node_modules si es una unión o un enlace, sin tocar su destino. */
  const soltarUniones = (dir) => {
    const nm = join(dir, "node_modules");
    const st = intenta(() => lstatSync(nm));
    if (!st) return;
    const esUnion = st.isSymbolicLink() || Boolean(intenta(() => readlinkSync(nm)));
    if (!esUnion) return;
    // En Windows una junction se quita con rmdir (no recursivo); en otros, unlink.
    if (!intenta(() => (rmdirSync(nm), true))) unlinkSync(nm);
  };

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
    // Los de un scratchpad (AppData\Local\Temp\claude\…) son de una sesión que
    // puede estar usándolos ahora mismo para comparar: no se tocan.
    if (/[\\/]AppData[\\/]Local[\\/]Temp[\\/]/i.test(dir)) continue;
    const rama = typeof w.branch === "string" ? w.branch.replace("refs/heads/", "") : null;
    const lista = rama && terminada({
      rama,
      subida: subidaConSuNombre(rama),
      contenida: contenidaEn(rama),
      remotaBorrada: remotaBorradaDe(rama),
      sinSubir: intenta(() => git(["log", "--oneline", rama, "--not", "--remotes"], raiz)) ?? "x",
    });
    if (!lista) continue;
    if (anfitriones.has(dir.toLowerCase())) {
      log(`· dejo ${dir}: otros worktrees usan su node_modules`);
      continue;
    }
    const sucio = intenta(() => git(["status", "--porcelain"], dir)) ?? "x";
    // El snapshot que vitest reescribe solo por fin de línea no cuenta como trabajo.
    const cambios = sucio.split(/\r?\n/).filter((l) => l && !/fichas\.test\.js\.snap$/.test(l));
    if (cambios.length) {
      log(`· dejo ${dir} (${rama}): tiene cambios sin guardar`);
      continue;
    }
    log(`${SI ? "✓ borro" : "· borraría"} ${dir} (${rama})`);
    if (!SI) continue;
    soltarUniones(dir);
    intenta(() => git(["checkout", "--", "."], dir));
    const quitado = Boolean(intenta(() => (git(["worktree", "remove", "--force", dir], raiz), true)));
    const problema = problemaDelBorrado({ dir, rama, quitado, sigue: existsSync(dir) });
    if (problema) problemas.push(problema);
    else {
      borrados++;
      intenta(() => git(["branch", "-D", rama], raiz));
    }
  }
  intenta(() => git(["worktree", "prune"], raiz));
  log(SI ? `${borrados} worktrees borrados.` : "Ensayo: repite con --si para borrar.");

  // Lo que no se pudo borrar se dice SIEMPRE, también en silencio, y se apunta
  // para que el arranque lo siga enseñando mientras la carpeta exista.
  let previos = [];
  try {
    previos = leerPendientes(comun);
  } catch (e) {
    console.error(`⚠ limpiar-worktrees: no he podido leer ${ficheroPendientes(comun)} (${e.message}); lo reescribo.`);
  }
  const pendientes = fusionarPendientes(previos, problemas, existsSync);
  if (pendientes.length || previos.length) {
    try {
      writeFileSync(ficheroPendientes(comun), JSON.stringify(pendientes, null, 2));
    } catch (e) {
      console.error(`⚠ limpiar-worktrees: no he podido apuntar lo pendiente (${e.message}).`);
    }
  }
  process.stdout.write(salidaDeProblemas(problemas, { hook: HOOK }));
}
