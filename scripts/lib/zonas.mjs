/**
 * zonas.mjs — calcula qué ramas vivas llevan qué ficheros (#506, fondo #504).
 *
 * La foto que lee la guardia (`.claude/hooks/zonas.mjs`) y la cifra de
 * `npm run issues -- --zonas`. Todo sale de git, nada se escribe a mano:
 *
 *  - las ramas vivas: `git worktree list` (sin la carpeta principal ni las ajenas
 *    de `lleva.mjs`);
 *  - lo que cada una ya cambió: `git diff origin/staging...<rama>` (commiteado) y
 *    `git status` de su carpeta (sin commitear, también ficheros nuevos);
 *  - lo que reservó al abrir la tarea: `branch.<rama>.zona` de la configuración
 *    de git (`npm run tarea -- … --zona <fichero>`; se va al borrar la rama);
 *  - su issue, del nombre de la rama; desde cuándo, su commit más viejo fuera de
 *    origin/staging (el «tarea: arranca»).
 *
 *   node scripts/lib/zonas.mjs --refrescar <.git común>/claude-sesiones
 *       lo lanza la guardia en segundo plano cuando la foto está vieja.
 *
 * Solo ve las carpetas de este PC: las de Álvaro o de la nube no salen (las ve
 * `npm run issues` por sus marcas «lo lleva», sin ficheros).
 */
import { execFileSync } from "node:child_process";
import { readFileSync, rmSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { barrerVistas, escribirZonas, FICHERO_LINEAS, haceCuanto } from "../../.claude/hooks/zonas.mjs";
import { AJENAS, leerWorktrees, numeroDeRama } from "./lleva.mjs";

const gitReal = (...a) => execFileSync("git", a, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 15_000, maxBuffer: 32 * 1024 * 1024 });
const norma = (p) => String(p).replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();

/** Una reserva válida: ruta relativa del repo, con barras normales, sin `..` ni rarezas. */
export const RESERVA_VALIDA = /^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))[\w.\-/]{1,200}$/;

/**
 * Lo que no es de nadie aunque cambie: la memoria de los agentes (`.claude/agent-memory/`),
 * que vive en cada carpeta sin versionar; contarla daba zonas compartidas falsas.
 */
export const SIN_DUENO = /^\.claude\/agent-memory\//;

/** `git status --porcelain -z`: las rutas tocadas (sin la marca XY). */
export function rutasDeStatus(salida) {
  return String(salida).split("\0").filter(Boolean).map((e) => e.slice(3)).filter(Boolean);
}

/** `git config --get-regexp ^branch\..*\.zona$` → Map rama → [reservas]. */
export function leerReservas(salida) {
  const out = new Map();
  for (const linea of String(salida).split(/\r?\n/)) {
    const m = /^branch\.(.+)\.zona (.+)$/.exec(linea.trim());
    if (!m || !RESERVA_VALIDA.test(m[2])) continue;
    out.set(m[1], [...(out.get(m[1]) ?? []), m[2]]);
  }
  return out;
}

/**
 * La foto: { hecho, ramas: [{ rama, ruta, carpeta, issue, desde, ficheros, reservadas }] }.
 * `git` recibe los argumentos y devuelve la salida (o lanza); cada carpeta que
 * falle sale sin ficheros, sin tumbar las demás.
 */
export function construirZonas(principal, { git = gitReal, ahora = new Date() } = {}) {
  const worktrees = leerWorktrees(git("-C", principal, "worktree", "list", "--porcelain"))
    .filter((w) => norma(w.ruta) !== norma(principal) && !AJENAS.test(w.rama));
  let reservas = new Map();
  try {
    reservas = leerReservas(git("-C", principal, "config", "--get-regexp", "^branch\\..*\\.zona$"));
  } catch {
    // a propósito: `git config --get-regexp` sale con error cuando no hay ninguna reserva; es su respuesta
  }
  const ramas = worktrees.map((w) => {
    const ficheros = new Set();
    let desde = null;
    try {
      for (const f of git("-C", principal, "diff", "--name-only", "--no-renames", "-z", `origin/staging...${w.rama}`).split("\0")) if (f) ficheros.add(f);
    } catch {
      // a propósito: una rama que git no compara (sin origin/staging, carpeta rota) sale sin lo commiteado
    }
    try {
      for (const f of rutasDeStatus(git("-C", w.ruta, "status", "--porcelain", "-z", "--no-renames", "-uall"))) ficheros.add(f);
    } catch {
      // a propósito: una carpeta borrada a medias sale sin lo no commiteado; no tumba la foto
    }
    try {
      const fechas = git("-C", principal, "log", "--format=%cI", `origin/staging..${w.rama}`).trim().split(/\r?\n/).filter(Boolean);
      desde = fechas.at(-1) ?? null;
    } catch {
      // a propósito: sin fecha la rama sale «sin fecha»; no tumba la foto
    }
    const suyos = [...ficheros].filter((f) => !SIN_DUENO.test(f)).sort();
    return { rama: w.rama, ruta: w.ruta, carpeta: basename(w.ruta), issue: numeroDeRama(w.rama), desde, ficheros: suyos, reservadas: reservas.get(w.rama) ?? [] };
  });
  return { hecho: ahora.toISOString(), ramas };
}

/**
 * Los ficheros que llevan dos ramas o más a la vez: [{ fichero, ramas: [{ rama,
 * issue, desde, como }] }], de más a menos ramas. Las reservas de carpeta no se
 * expanden: cuenta lo que se puede nombrar.
 */
export function compartidos(foto) {
  const por = new Map();
  for (const r of foto.ramas) {
    const poner = (f, como) => {
      if (!por.has(f)) por.set(f, new Map());
      const ya = por.get(f).get(r.rama);
      if (!ya || ya.como === "reservado") por.get(f).set(r.rama, { rama: r.rama, issue: r.issue, desde: r.desde, como });
    };
    for (const f of r.reservadas ?? []) poner(f, "reservado");
    for (const f of r.ficheros ?? []) poner(f, "cambiado");
  }
  return [...por.entries()]
    .filter(([, m]) => m.size > 1)
    .map(([fichero, m]) => ({ fichero, ramas: [...m.values()] }))
    .sort((a, b) => b.ramas.length - a.ramas.length || a.fichero.localeCompare(b.fichero));
}

/** Cuenta los avisos de zona del registro (`zonas.log`) desde una fecha: { avisos, ficheros }. */
export function contarAvisos(texto, desde) {
  const lineas = String(texto ?? "").split(/\r?\n/)
    .map((l) => /^ts: (\S+) zona: (\S+) rama: (\S+) .*aviso: si$/.exec(l))
    .filter((m) => m && Date.parse(m[1]) >= desde.getTime());
  return { avisos: lineas.length, ficheros: new Set(lineas.map((m) => m[2])).size };
}

/** El informe de `npm run issues -- --zonas`, en líneas. */
export function informeZonas(foto, { ahora = new Date(), registro = null } = {}) {
  const lista = compartidos(foto);
  const con = foto.ramas.filter((r) => r.ficheros.length || r.reservadas.length).length;
  const out = [`zonas-compartidas: ${lista.length} ramas-vivas: ${foto.ramas.length} ramas-con-ficheros: ${con}`];
  if (!lista.length) out.push("Ningún fichero lo llevan dos ramas vivas a la vez.");
  for (const c of lista) {
    out.push(`  ${c.fichero}  (${c.ramas.length} ramas)`);
    for (const r of c.ramas) {
      const h = r.desde ? (ahora - Date.parse(r.desde)) / 3_600_000 : null;
      out.push(`      ${r.rama}  ${r.issue ? `#${r.issue}` : "sin issue"}  ${r.como === "reservado" ? "reservado" : "con cambios"}  ${h == null ? "sin fecha" : `desde hace ${haceCuanto(h)}`}`);
    }
  }
  if (registro) {
    const semana = new Date(ahora.getTime() - 7 * 24 * 3_600_000);
    const c = contarAvisos(registro, semana);
    out.push(`avisos-de-zona-7-dias: ${c.avisos} ficheros: ${c.ficheros}`);
  }
  return out;
}

/** Lee el registro de avisos de la fábrica, o null si no hay. */
export function leerRegistroAvisos(dirFabrica) {
  try {
    return readFileSync(join(dirFabrica, FICHERO_LINEAS), "utf8");
  } catch {
    return null; // a propósito: sin registro todavía (ningún aviso) el informe sale sin esa línea
  }
}

const esPrincipal = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (esPrincipal && process.argv[2] === "--refrescar") {
  // dirReg = <.git común>/claude-sesiones; la carpeta principal es la que contiene ese .git.
  const dirReg = resolve(process.argv[3]);
  const principal = dirname(dirname(dirReg));
  try {
    escribirZonas(dirReg, construirZonas(principal));
    barrerVistas(dirReg);
  } catch (e) {
    console.error(`[zonas] no he podido calcular la foto: ${String(e?.message ?? e).split("\n")[0]}`);
    process.exitCode = 1;
  } finally {
    rmSync(join(dirReg, "zonas.lock"), { force: true });
  }
}
