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
 * Se escribe en el build (`prebuild` y `pretest` de package.json) y no se
 * versiona (.gitignore): sale entera del catálogo, así que una copia en git
 * sería el mismo dato en dos sitios, y una receta cambiada sin recompilar la
 * dejaría vieja. Va por columnas (un eje, una línea).
 *
 *   node scripts/compilar-ejes.mjs   escribe la tabla y dice lo que no ha podido pasar a número
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

/**
 * Por qué no se compila un eje de receta, o null si se compila: el campo no es
 * simple, el tipo no tiene número, le falta el vocabulario o no cabe en bits.
 */
function porQueNo(eje) {
  if (!/^[A-Za-z]+$/.test(eje.campo ?? "")) return "sin campo simple en el JSON";
  const codigo = codigoDe(eje);
  if (!codigo) return `el tipo ${eje.tipo} no tiene número`;
  if ((codigo === "indice" || codigo === "bits") && !Array.isArray(eje.vocabulario)) return "sin vocabulario";
  if (codigo === "bits" && eje.vocabulario.length > MAX_BITS) return `más de ${MAX_BITS} etiquetas`;
  return null;
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
 * una columna por eje. Lo que no entra se apunta en la tabla, no se calla:
 * `sinCompilar` (los ejes de receta que no se pasan a número, y por qué; un
 * eje sin ningún valor en los JSON no lleva columna) y `fueraDelVocabulario`
 * (por eje, cuántas recetas traen un valor que su vocabulario no tiene y
 * quedan en null).
 */
export function compilarEjes(recetas, ejes = EJES) {
  const ordenadas = [...recetas].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const sinCompilar = [];
  const fueraDelVocabulario = {};
  const columnas = [];
  for (const e of ejes.filter((x) => x.ambito === AMBITO.RECETA).sort((x, y) => x.n - y.n)) {
    const porque = porQueNo(e);
    if (porque) { sinCompilar.push({ id: e.id, porque }); continue; }
    const col = ordenadas.map((r) => codificar(e, r[e.campo]));
    if (col.every((v) => v === null)) { sinCompilar.push({ id: e.id, porque: "ningún valor en los JSON" }); continue; }
    const fuera = ordenadas.filter((r, i) => r[e.campo] != null && col[i] === null).length;
    if (fuera) fueraDelVocabulario[e.id] = fuera;
    columnas.push([e, col]);
  }
  return {
    generado_por: "scripts/compilar-ejes.mjs",
    ejes: columnas.map(([e]) => ({ n: e.n, id: e.id, campo: e.campo, codigo: codigoDe(e), valores: e.vocabulario ?? null })),
    sinCompilar,
    fueraDelVocabulario,
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
    `  "sinCompilar": ${linea(t.sinCompilar)},`,
    `  "fueraDelVocabulario": ${linea(t.fueraDelVocabulario)},`,
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

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const t = compilarEjes(leerRecetas());
  writeFileSync(RUTA_EJES, serializarEjes(t));
  const fuera = Object.entries(t.fueraDelVocabulario).map(([id, n]) => `${id} ${n}`).join(", ");
  console.log(`recipeEjes.json: ${t.ids.length} recetas × ${t.ejes.length} ejes; sin compilar ${t.sinCompilar.length} ejes de receta; fuera del vocabulario: ${fuera || "ninguno"}`);
}
