/**
 * normalize-main-base.mjs
 *
 * `mainBase` era `z.string().optional()` — texto libre— y el catálogo pagó el
 * precio: `patata` (8 recetas) y `patatas` (81) convivían como si fueran ejes
 * distintos, igual que `cuscús`/`cuscus`/`sémola`, y `lentejas`/`garbanzos`
 * pisaban a `legumbre`. Nada fallaba, que es lo peor: el sesgo "más patatas"
 * del panel (notepadFields.js, campo `base`) se saltaba en silencio 8 platos
 * porque comparaba contra su propio dominio cerrado.
 *
 * Esa tolerancia dejaba de ser un detalle en el momento en que `mainBase` pasa
 * a ser la CLAVE por la que se agrupan los platos que comparten olla: si el
 * mismo valor se escribe de dos formas, no se puede agrupar por él.
 *
 * Este script hace la limpieza una vez; el enum MAIN_BASES de recipeSchema.js
 * impide que vuelva a entrar sucio.
 *
 * Idempotente: pasarlo dos veces no cambia nada.
 *
 * Usage:  node scripts/normalize-main-base.mjs [--dry]
 */

import { readFileSync, writeFileSync, readdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const RECIPES_DIR = join(__dirname, "..", "src", "data", "recipes");
const DRY = process.argv.includes("--dry");

/**
 * Sucio → canónico.
 *
 * `lentejas` y `garbanzos` colapsan en `legumbre` a propósito: la base que se
 * cocina en tanda es "una olla de legumbre", y qué legumbre concreta ya lo
 * dicen los ingredientes de cada plato. Distinguirlas aquí partiría en tres el
 * grupo que precisamente queremos juntar.
 *
 * `boniato` NO colapsa en `patatas`: no se cuece igual, no sabe igual y son 4
 * recetas que quedarían mintiendo. Se queda como base propia.
 */
const CANON = {
  patata: "patatas",
  "cuscús": "cuscus",
  "sémola": "cuscus",
  lentejas: "legumbre",
  garbanzos: "legumbre",
};

let cambios = 0;
const porValor = {};

for (const file of readdirSync(RECIPES_DIR)) {
  if (!file.endsWith(".json")) continue;
  const path = join(RECIPES_DIR, file);
  const recipes = JSON.parse(readFileSync(path, "utf8"));
  let tocado = false;

  for (const r of recipes) {
    if (!r.mainBase) continue;
    const canon = CANON[r.mainBase];
    if (canon && canon !== r.mainBase) {
      console.log(`  ${r.id.padEnd(26)} ${r.mainBase} → ${canon}   (${r.name})`);
      r.mainBase = canon;
      tocado = true;
      cambios++;
    }
    porValor[r.mainBase] = (porValor[r.mainBase] ?? 0) + 1;
  }

  if (tocado && !DRY) writeFileSync(path, JSON.stringify(recipes, null, 2) + "\n", "utf8");
}

console.log(`\n${cambios} recetas normalizadas${DRY ? " (dry run, nada escrito)" : ""}.`);
console.log("\nReparto final de mainBase:");
for (const [k, n] of Object.entries(porValor).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${k.padEnd(10)} ${n}`);
}
