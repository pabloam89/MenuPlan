/**
 * copiaHook.mjs — ¿el hook de limpieza que se ejecuta es el del repo? (#725, #198)
 *
 * La limpieza de carpetas (`scripts/limpiar-worktrees.mjs`) corre como hook de
 * USUARIO, desde una copia en `~/.claude/hooks/`. Un arreglo en el repo no
 * llega a esa copia solo: el CI no ve el perfil de nadie. Así que el arranque
 * compara las dos y avisa con una línea `campo: valor` si difieren, y cuenta
 * las carpetas huérfanas que la limpieza no ha podido borrar.
 *
 * Todo es puro (recibe los textos): arranque.mjs lee los ficheros.
 */
import { homedir } from "node:os";
import { join } from "node:path";

/** Dónde vive la copia de usuario del hook de limpieza. */
export const rutaCopiaDelHook = (casa = homedir()) => join(casa, ".claude", "hooks", "limpiar-worktrees.mjs");

/** Los saltos de línea de Windows no cuentan como diferencia. */
const normal = (t) => String(t).replace(/\r\n/g, "\n").trim();

/**
 * La línea de aviso, o null si la copia es igual (o si no se sabe cuál es la
 * del repo: sin referencia no se acusa a nadie).
 * `repo` y `copia`: el texto de cada fichero, o null si no existe.
 */
export function avisoDeCopia({ repo, copia, ruta = rutaCopiaDelHook() }) {
  if (repo == null) return null;
  if (copia == null) {
    return `limpieza-copia: falta — no hay ${ruta}, así que la limpieza de carpetas no corre en esta máquina. Cópiala desde scripts/limpiar-worktrees.mjs (copia autorizada, #198).`;
  }
  if (normal(repo) === normal(copia)) return null;
  return `limpieza-copia: difiere — ${ruta} no es igual a scripts/limpiar-worktrees.mjs de staging: los arreglos de la limpieza no llegan hasta que se copie (copia autorizada, #198).`;
}

/** `huerfanas: n` (campo: valor, para poder contarlo) cuando hay alguna; si no, null. */
export const lineaDeHuerfanas = (n) => (n > 0 ? `huerfanas: ${n} (carpetas de worktree sin registro que la limpieza no ha podido borrar)` : null);
