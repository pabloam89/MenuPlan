/**
 * sesiones.mjs — qué sesiones de Claude hay abiertas sobre este repo.
 *
 * Cada sesión se apunta al arrancar (arranque.mjs), la guardia le anota la
 * última actividad en cada acción (guardia.mjs) y se borra al cerrarse
 * (fin.mjs). El registro vive en la carpeta común de git
 * (`C:\dev\MenuPlan\.git\claude-sesiones\`), que comparten todos los worktrees
 * y que git no versiona: así cada sesión ve a las demás sin tocar el repo.
 *
 * Si una sesión se cae sin cerrarse, su ficha se queda. Por eso se cuenta como
 * activa solo si ha hecho algo en las últimas ACTIVA_H horas, y las fichas de
 * más de CADUCA_H horas se borran solas.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const ACTIVA_H = 3;
export const CADUCA_H = 48;

export function dirSesiones(desde) {
  try {
    const comun = execFileSync("git", ["-C", desde, "rev-parse", "--path-format=absolute", "--git-common-dir"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    return join(comun, "claude-sesiones");
  } catch {
    return null;
  }
}

const valido = (id) => typeof id === "string" && /^[\w-]{6,80}$/.test(id);
/** Rutas comparables en Windows y en Linux (el CI): barras, mayúsculas y la barra final. */
export const normaRuta = (p) => String(p).replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
const misma = (a, b) => normaRuta(a) === normaRuta(b);

export function apuntar(dir, { id, cwd, rama }) {
  if (!dir || !valido(id)) return;
  mkdirSync(dir, { recursive: true });
  const fichero = join(dir, `${id}.json`);
  const previa = existsSync(fichero) ? JSON.parse(readFileSync(fichero, "utf8")) : null;
  const ahora = new Date().toISOString();
  writeFileSync(fichero, JSON.stringify({ id, cwd, rama, inicio: previa?.inicio ?? ahora, ultima: ahora }));
}

/** Anota actividad. Barato: solo reescribe la ficha si ya existe. */
export function tocar(dir, id) {
  if (!dir || !valido(id)) return;
  const fichero = join(dir, `${id}.json`);
  if (!existsSync(fichero)) return;
  const s = JSON.parse(readFileSync(fichero, "utf8"));
  s.ultima = new Date().toISOString();
  writeFileSync(fichero, JSON.stringify(s));
}

export function quitar(dir, id) {
  if (!dir || !valido(id)) return;
  rmSync(join(dir, `${id}.json`), { force: true });
  try {
    const sk = join(dir, SKILLS);
    for (const f of existsSync(sk) ? readdirSync(sk) : []) if (f.startsWith(`${id}__`)) rmSync(join(sk, f), { force: true });
  } catch {
    // una ficha de skill que se queda la barre listar() a las 48 h
  }
}

// ── Skills abiertas ────────────────────────────────────────────────────────
// La puerta de lectura de la guardia necesita recordar, por sesión, qué skills
// ya se abrieron (o ya se avisaron). Un fichero por sesión y skill, en una
// subcarpeta: dos llamadas a la vez no se pisan, y listar() no las confunde
// con sesiones. Todo falla en silencio: sin registro, la puerta no bloquea.
const SKILLS = "skills";
const validaSkill = (s) => typeof s === "string" && /^[\w-]{1,40}$/.test(s);
const ficheroSkill = (dir, id, skill) => join(dir, SKILLS, `${id}__${skill}.json`);

/** Anota que la sesión abrió (como = "abierta") o ya fue avisada de (`avisada`) una skill. true si quedó escrito. */
export function anotarSkill(dir, id, skill, como = "abierta") {
  if (!dir || !valido(id) || !validaSkill(skill)) return false;
  try {
    mkdirSync(join(dir, SKILLS), { recursive: true });
    writeFileSync(ficheroSkill(dir, id, skill), JSON.stringify({ id, skill, como, cuando: new Date().toISOString() }));
    return true;
  } catch {
    return false;
  }
}

export function skillAnotada(dir, id, skill) {
  if (!dir || !valido(id) || !validaSkill(skill)) return false;
  try {
    return existsSync(ficheroSkill(dir, id, skill));
  } catch {
    return false;
  }
}

/** Borra las fichas de skill de sesiones que ya no existen (más de CADUCA_H horas sin tocarse). */
function barrerSkills(dir, ahora) {
  try {
    const sk = join(dir, SKILLS);
    if (!existsSync(sk)) return;
    for (const f of readdirSync(sk)) {
      const fichero = join(sk, f);
      if ((ahora - statSync(fichero).mtimeMs) / 36e5 > CADUCA_H) rmSync(fichero, { force: true });
    }
  } catch {
    // es limpieza: si falla, se queda para la próxima
  }
}

/** Todas las fichas, con `horas` desde la última actividad. Borra las caducadas. */
export function listar(dir, ahora = Date.now()) {
  if (!dir || !existsSync(dir)) return [];
  barrerSkills(dir, ahora);
  const out = [];
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".json"))) {
    try {
      const s = JSON.parse(readFileSync(join(dir, f), "utf8"));
      const horas = (ahora - Date.parse(s.ultima)) / 36e5;
      if (horas > CADUCA_H) rmSync(join(dir, f), { force: true });
      else out.push({ ...s, horas });
    } catch {
      rmSync(join(dir, f), { force: true });
    }
  }
  return out;
}

export const activas = (lista) => lista.filter((s) => s.horas <= ACTIVA_H);
export const enCarpeta = (lista, carpeta) => activas(lista).filter((s) => misma(s.cwd, carpeta));
