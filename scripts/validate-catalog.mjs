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

import { readFileSync, readdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { validateRecipes } from "../src/data/recipeSchema.js";
import { validateIngredients } from "../src/data/ingredientSchema.js";
import { normalizeName } from "../src/lib/ingredientCategories.js";

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

// El catálogo de ingredientes se valida aquí también, y no solo en su
// generador: src/lib/ingredients.js lanza al importarlo, así que un JSON
// inválido es una pantalla en blanco. Mejor que reviente el build.
const INGREDIENTS_PATH = join(ROOT, "src", "data", "ingredients.json");
let ingredientCount = 0;
if (existsSync(INGREDIENTS_PATH)) {
  const ingredients = JSON.parse(readFileSync(INGREDIENTS_PATH, "utf8"));
  ingredientCount = ingredients.length;
  errors.push(...validateIngredients(ingredients));

  // Cobertura: cada ingrediente que usa una receta tiene que resolver contra el
  // catálogo. Si no, es que se añadió una receta sin regenerarlo
  // (npm run build:ingredients).
  const labels = new Set();
  for (const ing of ingredients) {
    for (const label of [ing.name, ...ing.aliases]) labels.add(normalizeName(label));
  }
  const sinResolver = new Set();
  for (const r of recipes) {
    for (const line of r.ingredients ?? []) {
      if (!labels.has(normalizeName(line.name))) sinResolver.add(line.name);
    }
  }
  for (const name of sinResolver) {
    errors.push(`Ingrediente "${name}" no está en ingredients.json — regenera con npm run build:ingredients`);
  }

  // Sustituciones (Fase 3). Una que apunte a un ingrediente inexistente no da
  // error en runtime: simplemente no se aplica nunca, y "no se adapta" pasa
  // mucho más desapercibido que "revienta".
  const SUBS_PATH = join(ROOT, "src", "data", "ingredientSubstitutions.json");
  if (existsSync(SUBS_PATH)) {
    const ids = new Set(ingredients.map((i) => i.id));
    // Mismo criterio que el CHECK de 0031: `restriction` es una intolerancia,
    // jamás un alérgeno. Confundirlos ofrecería a un alérgico un plato que le
    // sienta mal, sin ningún error visible por el camino.
    const ADAPTABLES = new Set(["lactosa_fina", "alcohol_cocina"]);
    for (const sub of JSON.parse(readFileSync(SUBS_PATH, "utf8"))) {
      if (!ids.has(sub.ingredientId)) {
        errors.push(`Sustitución para un ingrediente inexistente: "${sub.ingredientId}"`);
      }
      if (!ADAPTABLES.has(sub.restriction)) {
        errors.push(
          `Sustitución con restricción no adaptable: "${sub.restriction}" (${sub.ingredientId})`,
        );
      }
      if (!sub.replacementLabel) {
        errors.push(`Sustitución sin replacementLabel: "${sub.ingredientId}"`);
      }
    }
  }
}

// ── Toda receta del Recetario Estrella tiene foto ───────────────────────────
// El estrella es el ÚNICO pool que sirve el generador: filterRecipes lo filtra
// por `estrella` y, si se queda corto, devuelve error en vez de rellenar con
// fondo de armario (isPrimaryCatalog, sin plan B). Así que una receta estrella
// sin foto no es un detalle estético: es un hueco visible en el menú, y sin
// nada detrás que lo tape.
//
// Ojo con la dirección: la foto NO decide si algo es estrella —esa señal se
// separó a mano justo porque conectar una foto huérfana ascendía recetas sin
// que nadie lo decidiera (ver recipeSchema.js)—, pero ser estrella sí exige
// foto. Este check vigila esa segunda mitad.
const IMAGES_PATH = join(ROOT, "src", "assets", "dishes", "dishImages.json");
if (existsSync(IMAGES_PATH)) {
  const manifest = JSON.parse(readFileSync(IMAGES_PATH, "utf8"));
  // Las claves con "+" son combos plato+guarnición; para "¿tiene foto propia?"
  // solo cuenta la entrada suelta.
  const conFoto = new Set(Object.keys(manifest).filter((k) => !k.includes("+")));
  const sinFoto = recipes.filter((r) => r.estrella && !conFoto.has(r.id));
  for (const r of sinFoto) {
    errors.push(`[${r.id}] "${r.name}": es estrella pero no tiene foto en dishImages.json`);
  }
}

if (errors.length > 0) {
  console.error(`❌ Catálogo inválido (${errors.length} error/es):`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}

console.log(
  `✅ Catálogo válido — ${recipes.length} recetas y ${ingredientCount} ingredientes verificados.`,
);
