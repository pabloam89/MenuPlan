// Reconcile the generation CSV dish_name against the app's authoritative recipe
// names (src/data/recipes/*.json). Because the dish name drives the image prompt,
// any combo whose CSV dish_name differs from the recipe name will render a photo
// that does not match what the app shows.
//
// Usage:
//   node scripts/reconcile-csv-names.mjs            (report only)
//   node scripts/reconcile-csv-names.mjs --write     (rewrite the CSV in place)
//
// Honors CSV_PATH env var (defaults to the same path combos.mjs uses).

import { readFileSync, writeFileSync, readdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import Papa from "papaparse";
import { DEFAULT_CSV_PATH } from "./lib/combos.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const RECIPES_DIR = join(__dirname, "..", "src", "data", "recipes");
const CSV_PATH = process.env.CSV_PATH || DEFAULT_CSV_PATH;
const WRITE = process.argv.includes("--write");

// ---- Load authoritative recipe names + proteins ----
const recipeById = {};
for (const file of readdirSync(RECIPES_DIR)) {
  if (!file.endsWith(".json") || file === "guarniciones.json") continue;
  const entries = JSON.parse(readFileSync(join(RECIPES_DIR, file), "utf8"));
  for (const r of entries) {
    if (r?.id) recipeById[r.id] = { name: r.name, protein: r.mainProtein };
  }
}

// ---- Parse CSV preserving all columns ----
const text = readFileSync(CSV_PATH, "utf8");
const parsed = Papa.parse(text, { header: true, skipEmptyLines: true });
const rows = parsed.data.filter((r) => r.combo_id);

const mismatches = [];
for (const row of rows) {
  const recipe = recipeById[row.dish_id];
  if (!recipe) continue; // dish not in app catalog; skip
  if (recipe.name !== row.dish_name) {
    mismatches.push({
      combo_id: row.combo_id,
      dish_id: row.dish_id,
      csv_name: row.dish_name,
      recipe_name: recipe.name,
      csv_protein: row.dish_protein,
      recipe_protein: recipe.protein,
    });
    if (WRITE) {
      row.dish_name = recipe.name;
      if (recipe.protein) row.dish_protein = recipe.protein;
    }
  }
}

// Unique diverging dishes
const byDish = new Map();
for (const m of mismatches) {
  if (!byDish.has(m.dish_id)) byDish.set(m.dish_id, m);
}

console.log(`CSV: ${CSV_PATH}`);
console.log(`Total combos: ${rows.length}`);
console.log(`Diverging combos: ${mismatches.length} (across ${byDish.size} base dishes)\n`);
for (const m of byDish.values()) {
  const nAffected = mismatches.filter((x) => x.dish_id === m.dish_id).length;
  console.log(`• ${m.dish_id} (x${nAffected})`);
  console.log(`    CSV:    "${m.csv_name}"  [${m.csv_protein}]`);
  console.log(`    Receta: "${m.recipe_name}"  [${m.recipe_protein}]`);
}

if (WRITE) {
  const out = Papa.unparse(rows, { quotes: true, columns: parsed.meta.fields });
  writeFileSync(CSV_PATH, out, "utf8");
  console.log(`\n✅  CSV reescrito con ${mismatches.length} nombres corregidos.`);
} else {
  console.log(`\n(Solo informe. Ejecuta con --write para corregir el CSV.)`);
}

// Emit the unique diverging dish ids as a comma list for convenience
console.log(`\nBase dishes: ${[...byDish.keys()].join(",")}`);
