/**
 * cableado.mjs — qué fichero del producto toca qué tabla de la base.
 *
 * El objetivo (docs/datos/PRINCIPIOS.md, «Cableado») es que cada tabla tenga
 * un módulo dueño y que el resto del código pase por él, en vez de escribir el
 * nombre de la tabla y sus filtros a mano en cualquier sitio. Esto mide el
 * punto de partida y supabase/cableado.test.js lo convierte en trinquete: un
 * fichero nuevo que se pone a tocar una tabla falla el CI, y uno que deja de
 * tocarla obliga a apuntarlo (el número solo baja).
 *
 *   node scripts/cableado.mjs            resumen por tabla
 *   node scripts/cableado.mjs --escribir reescribe supabase/cableado.json
 *
 * Es un lector de texto: busca `.from("tabla")` (supabase-js) y
 * `select|insert|update|borrar("tabla"` (el cliente REST del servidor,
 * api/_bot/db.js), solo con nombres de tablas que crea alguna migración, en
 * src/ y api/ sin tests ni ficheros generados.
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { quitarBorradas } from "./lib/migraciones.mjs";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CARPETAS = ["src", "api"];
const GENERADOS = new Set(["api/_bot/core.mjs"]);
export const BASE = join(RAIZ, "supabase", "cableado.json");

/** Las tablas que crea alguna migración y no borra una posterior (`drop table`). */
export function tablas(raiz = RAIZ) {
  const dir = join(raiz, "supabase", "migrations");
  const t = new Set();
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".sql")).sort()) {
    const crudo = readFileSync(join(dir, f), "utf8");
    for (const m of crudo.toLowerCase().matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?"?([a-z_][a-z0-9_]*)"?/g)) t.add(m[1]);
    // En orden de número: lo que esta migración borra deja de existir hasta que otra lo cree.
    quitarBorradas(t, crudo);
  }
  return t;
}

function* ficheros(dir) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const ruta = join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name !== "node_modules" && e.name !== "__snapshots__") yield* ficheros(ruta);
    } else if (/\.(?:js|jsx|mjs)$/.test(e.name) && !/\.test\.|\.spec\./.test(e.name)) {
      yield ruta;
    }
  }
}

const RE = /(?:\.from|\b(?:select|insert|update|borrar))\(\s*["'`]([a-z_][a-z0-9_]*)["'`]/g;

/** { tabla: [ficheros que la tocan] }, ordenado. */
export function medir(raiz = RAIZ) {
  const conocidas = tablas(raiz);
  const mapa = {};
  for (const c of CARPETAS) {
    for (const ruta of ficheros(join(raiz, c))) {
      const rel = relative(raiz, ruta).replace(/\\/g, "/");
      if (GENERADOS.has(rel)) continue;
      const texto = readFileSync(ruta, "utf8");
      for (const m of texto.matchAll(RE)) {
        if (!conocidas.has(m[1])) continue;
        (mapa[m[1]] ??= new Set()).add(rel);
      }
    }
  }
  return Object.fromEntries(Object.keys(mapa).sort().map((t) => [t, [...mapa[t]].sort()]));
}

const esPrincipal = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (esPrincipal) {
  const mapa = medir();
  if (process.argv.includes("--escribir")) {
    writeFileSync(BASE, JSON.stringify(mapa, null, 2) + "\n");
    console.log(`Escrito ${relative(RAIZ, BASE)}`);
  }
  const filas = Object.entries(mapa).sort((a, b) => b[1].length - a[1].length);
  const pares = filas.reduce((n, [, f]) => n + f.length, 0);
  for (const [t, f] of filas) console.log(`${String(f.length).padStart(3)}  ${t}`);
  console.log(`\n${filas.length} tablas, ${pares} pares tabla-fichero (objetivo: 1 por tabla)`);
}
