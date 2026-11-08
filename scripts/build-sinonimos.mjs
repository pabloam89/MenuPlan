#!/usr/bin/env node
/**
 * Genera src/data/derived/sinonimosTaxonomia.json: las formas de decir cada
 * proteína y cada base, sacadas del árbol de alimentos (src/lib/derive/sinonimos.js).
 * Gratis: solo lee el catálogo. Su test (src/lib/diccionario.test.js) falla si
 * el fichero no coincide con lo que sale de las fuentes de hoy.
 *
 *   npm run build:sinonimos
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { formasDeTaxonomia } from "../src/lib/derive/sinonimos.js";

const leer = (p) => JSON.parse(readFileSync(fileURLToPath(new URL(p, import.meta.url)), "utf8"));
const filas = formasDeTaxonomia({
  alimentos: leer("../src/data/alimentos.json"),
  ingredientes: leer("../src/data/ingredients.json"),
  alimentoPorIngrediente: leer("../src/data/alimentoPorIngrediente.json"),
});
const destino = fileURLToPath(new URL("../src/data/derived/sinonimosTaxonomia.json", import.meta.url));
writeFileSync(destino, `${JSON.stringify(filas, null, 1)}\n`);
console.log(`sinonimosTaxonomia.json: ${filas.length} valores, ${filas.reduce((n, f) => n + f.formas.length, 0)} formas.`);
