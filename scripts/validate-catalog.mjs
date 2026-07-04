/**
 * validate-catalog.mjs
 *
 * Standalone check for CI/local use: `vite build` only bundles the JS, it
 * never executes it — so the throw-on-invalid-data guard in
 * src/data/recipeCatalog.js does NOT fail a build, it only fails at runtime
 * once a browser (or `vite dev`) actually loads the module. This script runs
 * the same validation directly under Node so bad data is caught in CI
 * before it ships, not after a user hits a white screen.
 *
 * Wired as "pretest" and "prebuild" in package.json so `npm test` and
 * `npm run build` both run it automatically.
 *
 * Usage:  node scripts/validate-catalog.mjs
 */

import { readFileSync, readdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { validateRecipes } from "../src/data/recipeSchema.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const RECIPES_DIR = join(ROOT, "src", "data", "recipes");

const recipes = [];
for (const file of readdirSync(RECIPES_DIR)) {
  if (!file.endsWith(".json")) continue;
  const entries = JSON.parse(readFileSync(join(RECIPES_DIR, file), "utf8"));
  for (const r of entries) recipes.push(r);
}

const errors = [];

const seen = new Set();
for (const r of recipes) {
  if (seen.has(r.id)) errors.push(`Duplicate recipe id: ${r.id}`);
  seen.add(r.id);
}

errors.push(...validateRecipes(recipes));

for (const r of recipes) {
  if (r.baseDishId && !seen.has(r.baseDishId)) {
    errors.push(`[${r.id}] baseDishId "${r.baseDishId}" no existe en el catálogo`);
  }
}

if (errors.length > 0) {
  console.error(`❌ Catálogo de recetas inválido (${errors.length} error/es):`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}

console.log(`✅ Catálogo válido — ${recipes.length} recetas verificadas.`);
