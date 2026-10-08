/**
 * migraciones.mjs — qué números de migración están ocupados y dónde.
 *
 * El choque que más se repite con varias sesiones: dos ramas cogen el mismo
 * número. `supabase/migrations.test.js` solo lo ve cuando las dos ya están en
 * la misma rama. Esto mira antes los tres sitios donde puede estar un número:
 * origin/staging, los demás worktrees de este PC y los PR abiertos.
 */
import { execFile, execFileSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { basename, join } from "node:path";

import { normaRuta } from "./sesiones.mjs";

const ejecuta = (cmd, args, cwd, timeout = 8000) => {
  try {
    return execFileSync(cmd, args, { cwd, encoding: "utf8", timeout, stdio: ["ignore", "pipe", "ignore"] });
  } catch {
    return null;
  }
};
const NOMBRE = /^(\d{4})_[\w-]+\.sql$/;

/** Ficheros de migración en origin/staging (sin .sql). */
export function enStaging(raiz) {
  const salida = ejecuta("git", ["-C", raiz, "ls-tree", "--name-only", "origin/staging", "supabase/migrations/"], raiz);
  if (salida === null) return null;
  return salida
    .split("\n")
    .map((r) => basename(r))
    .filter((f) => NOMBRE.test(f))
    .map((f) => f.replace(/\.sql$/, ""));
}

/** Migraciones que están en otros worktrees y aún no en staging. */
export function enWorktrees(raiz, deStaging) {
  const lista = ejecuta("git", ["-C", raiz, "worktree", "list", "--porcelain"], raiz);
  if (!lista) return [];
  const yaEstan = new Set(deStaging);
  const out = [];
  let ruta = null;
  for (const l of lista.split("\n")) {
    if (l.startsWith("worktree ")) ruta = l.slice(9).trim();
    if (l.startsWith("branch ") && ruta) {
      const dir = join(ruta, "supabase", "migrations");
      if (!existsSync(dir)) continue;
      const rama = l.slice(7).replace("refs/heads/", "").trim();
      for (const f of readdirSync(dir).filter((x) => NOMBRE.test(x))) {
        const n = f.replace(/\.sql$/, "");
        if (!yaEstan.has(n)) out.push({ nombre: n, donde: `${rama} (${basename(ruta)})`, ruta });
      }
    }
  }
  return out;
}

const ARGS_PRS = ["pr", "list", "--state", "open", "--limit", "50", "--json", "number,headRefName,files"];

/**
 * Lanza la consulta de PR abiertos SIN esperar (es red, tarda de 1 a 15 s):
 * así corre a la vez que el `git fetch` del arranque. Devuelve una promesa con
 * la salida de gh, o null si falla o pasa de `ms`.
 */
export function pedirPrs(raiz, ms = 5000) {
  return new Promise((ok) => {
    execFile("gh", ARGS_PRS, { cwd: raiz, encoding: "utf8", timeout: ms, maxBuffer: 8e6 }, (error, salida) => ok(error ? null : salida));
  });
}

/** Migraciones nuevas en PR abiertos, a partir de la salida de gh. */
export function enPrs(salida, deStaging) {
  if (!salida) return [];
  const yaEstan = new Set(deStaging);
  const out = [];
  for (const pr of JSON.parse(salida)) {
    for (const f of pr.files ?? []) {
      const m = f.path.match(/^supabase\/migrations\/(\d{4}_[\w-]+)\.sql$/);
      if (m && !yaEstan.has(m[1])) out.push({ nombre: m[1], donde: `PR #${pr.number} (${pr.headRefName})` });
    }
  }
  return out;
}

/**
 * Resume: el último número de staging, los ocupados fuera y el siguiente libre.
 * `aqui` es la carpeta de la sesión: sus propias migraciones no cuentan como
 * «de otro».
 */
export function resumen(deStaging, fuera, aqui = null) {
  const num = (n) => Number(n.slice(0, 4));
  const ultimo = Math.max(0, ...deStaging.map(num));
  const deOtros = fuera.filter((m) => !aqui || !m.ruta || normaRuta(m.ruta) !== normaRuta(aqui));
  const porNombre = new Map();
  for (const m of deOtros) porNombre.set(m.nombre, [...new Set([...(porNombre.get(m.nombre) ?? []), m.donde])]);
  const ocupados = [...porNombre.entries()].map(([nombre, donde]) => ({ nombre, donde })).sort((a, b) => a.nombre.localeCompare(b.nombre));
  const siguiente = Math.max(ultimo, ...fuera.map((m) => num(m.nombre))) + 1;
  // Dos nombres distintos con el mismo número = choque, dentro o fuera de staging.
  const porNumero = new Map();
  const numerosFuera = new Set(fuera.map((m) => m.nombre.slice(0, 4)));
  for (const m of [...deStaging.filter((n) => numerosFuera.has(n.slice(0, 4))), ...fuera.map((x) => x.nombre)]) {
    porNumero.set(m.slice(0, 4), new Set([...(porNumero.get(m.slice(0, 4)) ?? []), m]));
  }
  const choques = [...porNumero.entries()].filter(([, s]) => s.size > 1).map(([n, s]) => `${n}: ${[...s].join(" + ")}`);
  return { ultimo, ocupados, siguiente: String(siguiente).padStart(4, "0"), choques };
}
