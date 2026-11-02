/**
 * compilar-ejes.mjs — los ejes de receta, compilados a números (trozo 30 de #1037)
 *
 * Escribe src/data/derived/recipeEjes.json: una tabla receta × eje en la que
 * cada valor ya es un número, para que el motor compare y pese ejes sin leer
 * cadenas receta a receta. Sale de dos fuentes y de ninguna más: los ejes de
 * `src/data/axisRegistry.js` y las recetas de `src/data/recipes/*.json`.
 *
 * Qué ejes entran: los de ámbito receta con un `campo` simple en el JSON y una
 * forma de pasarlo a número (CODIGOS). Un enum va por la posición de su valor
 * en el vocabulario del eje; unas etiquetas, como bits sobre ese vocabulario;
 * un sí/no, 1 o 0; un número, tal cual. Lo que falta o no está en el
 * vocabulario es `null`, nunca 0: «no lo sé» no es «no». Los nutrientes no se
 * copian (viven en recipeNutrition.json); los derivados que la receta no trae
 * en su JSON (healthFlags, costeNivel…) tampoco: tienen su propia tabla.
 *
 * La tabla va por columnas (un eje, una línea): mil recetas por eje en una
 * línea se leen y se revisan mejor que mil líneas por receta.
 *
 *   node scripts/compilar-ejes.mjs              escribe la tabla
 *   node scripts/compilar-ejes.mjs --comprobar  falla si la del repo no es la de hoy
 *
 * validate-catalog.mjs hace la misma comprobación en cada build.
 */
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { EJES, AMBITO } from "../src/data/axisRegistry.js";

const ROOT = join(import.meta.dirname, "..");
const RECIPES_DIR = join(ROOT, "src", "data", "recipes");
export const RUTA_EJES = join(ROOT, "src", "data", "derived", "recipeEjes.json");

/** Cómo se pasa a número cada tipo de eje: la clave es el `tipo` del registro. */
export const CODIGOS = Object.freeze({ enum: "indice", tags: "bits", booleano: "booleano", numerico: "numero" });

/** El código de un eje: un numérico con vocabulario (niveles) va por posición, como un enum. */
const codigoDe = (eje) => (eje.tipo === "numerico" && Array.isArray(eje.vocabulario) ? "indice" : CODIGOS[eje.tipo]);

/** Las etiquetas van en los bits de un entero de 32: un vocabulario más largo no cabe. */
const MAX_BITS = 31;

/** ¿Se compila este eje? Ámbito receta, campo simple y una forma de pasarlo a número. */
function compilable(eje) {
  if (eje.ambito !== AMBITO.RECETA || !/^[A-Za-z]+$/.test(eje.campo ?? "")) return false;
  const codigo = codigoDe(eje);
  if (codigo === "indice") return Array.isArray(eje.vocabulario);
  if (codigo === "bits") return Array.isArray(eje.vocabulario) && eje.vocabulario.length <= MAX_BITS;
  return Boolean(codigo);
}

/** El número de un valor de una receta en un eje, o null si falta o no es del vocabulario. */
export function codificar(eje, valor) {
  if (valor === undefined || valor === null) return null;
  switch (codigoDe(eje)) {
    case "indice": {
      const i = eje.vocabulario.indexOf(valor);
      return i < 0 ? null : i;
    }
    case "bits": {
      // Una etiqueta sola puede venir sin lista («horno»): es una lista de una.
      let bits = 0;
      for (const v of Array.isArray(valor) ? valor : [valor]) {
        const i = eje.vocabulario.indexOf(v);
        if (i < 0) return null;
        bits |= 1 << i;
      }
      return bits;
    }
    case "booleano":
      return typeof valor === "boolean" ? Number(valor) : null;
    case "numero":
      return Number.isFinite(valor) ? valor : null;
    default:
      throw new Error(`eje ${eje.id}: el tipo ${eje.tipo} no se compila a número`);
  }
}

/**
 * La tabla de unas recetas: los ejes que entran, los ids ordenados por id y
 * una columna por eje. Un eje sin ningún valor en los JSON no lleva columna
 * (un derivado con su propia tabla, o un eje aún sin datos): una columna
 * entera de null no dice nada.
 */
export function compilarEjes(recetas, ejes = EJES) {
  const ordenadas = [...recetas].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const columnas = ejes.filter(compilable).sort((a, b) => a.n - b.n)
    .map((e) => [e, ordenadas.map((r) => codificar(e, r[e.campo]))])
    .filter(([, col]) => col.some((v) => v !== null));
  return {
    generado_por: "scripts/compilar-ejes.mjs",
    ejes: columnas.map(([e]) => ({ n: e.n, id: e.id, campo: e.campo, codigo: codigoDe(e), valores: e.vocabulario ?? null })),
    ids: ordenadas.map((r) => r.id),
    tabla: Object.fromEntries(columnas.map(([e, col]) => [e.id, col])),
  };
}

/** El JSON de la tabla con una línea por eje (y una para los ids). */
export function serializarEjes(t) {
  const linea = (x) => JSON.stringify(x);
  return [
    "{",
    `  "generado_por": ${linea(t.generado_por)},`,
    `  "ejes": [\n${t.ejes.map((e) => `    ${linea(e)}`).join(",\n")}\n  ],`,
    `  "ids": ${linea(t.ids)},`,
    `  "tabla": {\n${Object.entries(t.tabla).map(([id, col]) => `    ${linea(id)}: ${linea(col)}`).join(",\n")}\n  }`,
    "}",
    "",
  ].join("\n");
}

/** Las recetas del catálogo, de sus JSON (lo mismo que lee validate-catalog.mjs). */
export function leerRecetas() {
  return readdirSync(RECIPES_DIR).filter((f) => f.endsWith(".json")).sort()
    .flatMap((f) => JSON.parse(readFileSync(join(RECIPES_DIR, f), "utf8")));
}

/** ¿La tabla del repo es la que salen hoy de estas recetas? (Sin mirar saltos de línea.) */
export function ejesAlDia(recetas) {
  const actual = readFileSync(RUTA_EJES, "utf8").replace(/\r\n/g, "\n");
  return actual === serializarEjes(compilarEjes(recetas));
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const recetas = leerRecetas();
  if (process.argv.includes("--comprobar")) {
    if (!ejesAlDia(recetas)) {
      console.error("❌ src/data/derived/recipeEjes.json no es el de este catálogo: node scripts/compilar-ejes.mjs");
      process.exit(1);
    }
    console.log("✅ recipeEjes.json al día");
  } else {
    const t = compilarEjes(recetas);
    writeFileSync(RUTA_EJES, serializarEjes(t));
    console.log(`recipeEjes.json: ${t.ids.length} recetas × ${t.ejes.length} ejes`);
  }
}
