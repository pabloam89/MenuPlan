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
import { lstatSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";

import { normaRuta } from "../../scripts/limpiar-worktrees.mjs";

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

/** ¿Tiene un `.git` que es una CARPETA? Un clon propio, no un worktree. */
export function tieneGitDeCarpeta(dir) {
  try {
    return lstatSync(join(dir, ".git")).isDirectory();
  } catch {
    return false; // a propósito: sin .git, o ilegible, no es un clon
  }
}

/**
 * Las carpetas huérfanas: lo que el registro de la limpieza dice que sigue en
 * disco sin ser worktree vivo, MÁS las hermanas `MenuPlan-*` que ni son worktree
 * vivo ni están apuntadas (el punto ciego: una carpeta que git soltó sin que el
 * registro llegara a anotarla). Una hermana con `.git` de carpeta es un clon
 * propio (p. ej. MenuPlan-panel-lectura) y NO cuenta. Pura: recibe las rutas y
 * lo que sabe del disco. Devuelve las rutas, sin repetir.
 *
 *   pendientes  entradas {dir} de claude-limpieza.json
 *   hermanas    rutas de las carpetas `MenuPlan-*` junto al repo
 *   vivos       Set de rutas normalizadas (worktreesVivos)
 *   existe      (ruta) → boolean
 *   esClon      (ruta) → boolean, ¿tiene un .git que es carpeta?
 */
export function carpetasHuerfanas({ pendientes = [], hermanas = [], vivos = new Set(), existe, esClon }) {
  const vistas = new Map();
  for (const p of pendientes) {
    if (p?.dir && existe(p.dir) && !vivos.has(normaRuta(p.dir))) vistas.set(normaRuta(p.dir), p.dir);
  }
  for (const d of hermanas) {
    if (/^MenuPlan-/i.test(basename(d)) && !vivos.has(normaRuta(d)) && !esClon(d)) vistas.set(normaRuta(d), d);
  }
  return [...vistas.values()];
}

/**
 * Las líneas de aviso de la copia del hook para el arranque. En la nube no hay
 * perfil de Pablo: devuelve []. La referencia es la de origin/staging (`deGit`);
 * si git no la da, la del disco. Cualquier fallo de lectura se dice, no se calla.
 */
export function avisosDeCopiaEnArranque({ nube, deGit, rutaRepo, ruta, leer, existe }) {
  if (nube) return [];
  try {
    const repo = deGit ?? (existe(rutaRepo) ? leer(rutaRepo) : null);
    const aviso = avisoDeCopia({ repo, copia: existe(ruta) ? leer(ruta) : null, ruta });
    return aviso ? [aviso] : [];
  } catch (e) {
    return [`limpieza-copia: no he podido compararla (${String(e?.message ?? e).split("\n")[0]}).`];
  }
}
