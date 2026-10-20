/**
 * registro.mjs — dónde se apunta qué jueces han corrido, por rama.
 * Vive fuera del repo (el repo es público): ~/.claude/factoria-alvaro/.
 * Por rama y no por sesión: una rama sigue entre sesiones, y un juez que ya
 * corrió después del último cambio vale aunque la sesión sea otra.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, statSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { homedir } from "node:os";
import { join } from "node:path";

export const dirRegistro = () => process.env.FACTORIA_ALVARO_DIR || join(homedir(), ".claude", "factoria-alvaro");

export function git(cwd, ...args) {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
}

export function ramaDe(cwd) {
  try {
    return git(cwd, "rev-parse", "--abbrev-ref", "HEAD") || "sin-rama";
  } catch {
    return "sin-rama"; // a propósito: fuera de un repo no hay rama
  }
}

const fichero = (cwd) => join(dirRegistro(), ramaDe(cwd).replace(/[^\w.-]/g, "_") + ".jsonl");

export function apuntar(cwd, entrada) {
  mkdirSync(dirRegistro(), { recursive: true });
  appendFileSync(fichero(cwd), JSON.stringify(entrada) + "\n");
}

export function leer(cwd) {
  const f = fichero(cwd);
  if (!existsSync(f)) return [];
  return readFileSync(f, "utf8").split("\n").filter(Boolean).flatMap((l) => {
    try {
      return [JSON.parse(l)];
    } catch {
      return []; // a propósito: una línea rota del registro no tumba el cierre
    }
  });
}

/** Ficheros cambiados respecto a origin/staging: confirmados, sin confirmar y nuevos. */
export function ficherosCambiados(cwd) {
  const lista = (...a) => {
    try {
      return git(cwd, ...a).split("\n").filter(Boolean);
    } catch {
      return []; // a propósito: sin origin/staging se mira solo lo local
    }
  };
  return [...new Set([
    ...lista("diff", "--name-only", "origin/staging...HEAD"),
    ...lista("diff", "--name-only", "HEAD"),
    ...lista("ls-files", "--others", "--exclude-standard"),
  ])];
}

export function mtime(cwd, rel) {
  try {
    return statSync(join(cwd, rel)).mtimeMs;
  } catch {
    return 0; // a propósito: un fichero borrado no cuenta como edición
  }
}
