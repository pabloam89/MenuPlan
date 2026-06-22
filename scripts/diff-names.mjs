/**
 * diff-names.mjs
 * Cross-checks the original CSV (dish_garnish_combinations.csv) against the
 * app's recipe data (src/data/recipes/*.json) and reports every name gap:
 *   - dish_name (CSV)      vs recipe.name (JSON)
 *   - garnish_name (CSV)   vs garnish.name / garnish.shortName (JSON)
 *   - dish ids in CSV missing from the recipe catalog
 *
 * Usage:  node scripts/diff-names.mjs
 */

import { readFileSync, readdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { loadCombos } from "./lib/combos.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const RECIPES_DIR = join(__dirname, "..", "src", "data", "recipes");

const recipeById = {};
const garnishById = {};

for (const file of readdirSync(RECIPES_DIR)) {
  if (!file.endsWith(".json")) continue;
  const entries = JSON.parse(readFileSync(join(RECIPES_DIR, file), "utf8"));
  for (const r of entries) {
    if (!r?.id) continue;
    if (file === "guarniciones.json") garnishById[r.id] = r;
    else recipeById[r.id] = r;
  }
}

const rows = loadCombos();
console.log(`📋  CSV rows: ${rows.length}`);
console.log(`🍽️   recipes: ${Object.keys(recipeById).length} · garnishes: ${Object.keys(garnishById).length}\n`);

const dishMismatches = new Map();   // dish_id → { csv, json }
const garnishMismatches = new Map();
const missingDishes = new Set();
const missingGarnishes = new Set();

for (const row of rows) {
  const dishId = row.dish_id;
  const csvDish = (row.dish_name || "").trim();
  const recipe = recipeById[dishId];
  if (!recipe) {
    missingDishes.add(dishId);
  } else if (recipe.name.trim() !== csvDish) {
    dishMismatches.set(dishId, { csv: csvDish, json: recipe.name.trim() });
  }

  const garnishId = row.garnish_id;
  if (garnishId) {
    const csvGarnish = (row.garnish_name || "").trim();
    const g = garnishById[garnishId];
    if (!g) {
      missingGarnishes.add(garnishId);
    } else if (g.name.trim() !== csvGarnish) {
      garnishMismatches.set(garnishId, {
        csv: csvGarnish,
        jsonName: g.name.trim(),
        jsonShort: (g.shortName || "").trim(),
      });
    }
  }
}

function section(title) {
  console.log(`\n${"─".repeat(60)}\n${title}\n${"─".repeat(60)}`);
}

section(`DISH name mismatches (CSV dish_name ≠ recipe.name): ${dishMismatches.size}`);
for (const [id, { csv, json }] of dishMismatches) {
  console.log(`  ${id}\n    CSV : "${csv}"\n    JSON: "${json}"`);
}

section(`GARNISH name mismatches (CSV garnish_name ≠ garnish.name): ${garnishMismatches.size}`);
for (const [id, { csv, jsonName, jsonShort }] of garnishMismatches) {
  console.log(`  ${id}\n    CSV       : "${csv}"\n    JSON name : "${jsonName}"\n    JSON short: "${jsonShort}"`);
}

section(`Dish ids in CSV missing from recipe catalog: ${missingDishes.size}`);
if (missingDishes.size) console.log("  " + [...missingDishes].join(", "));

section(`Garnish ids in CSV missing from guarniciones.json: ${missingGarnishes.size}`);
if (missingGarnishes.size) console.log("  " + [...missingGarnishes].join(", "));

console.log(
  `\n✨  Summary: ${dishMismatches.size} dish gaps · ${garnishMismatches.size} garnish gaps · ` +
  `${missingDishes.size} missing dishes · ${missingGarnishes.size} missing garnishes`
);
