/**
 * apply-allergen-findings.mjs
 *
 * Escribe en src/data/recipes/*.json los alérgenos que la reconciliación
 * detectó como FALTA duro: el ingrediente los delata pero la receta no los
 * declaraba. Ver el informe en output/allergen-reconciliation.md
 * (`node scripts/build-ingredient-catalog.mjs` lo regenera).
 *
 * Tres invariantes, en orden de importancia:
 *
 *   1. SOLO AÑADE. Nunca quita un alérgeno declarado, ni siquiera cuando
 *      ningún ingrediente lo justifica. Una declaración conservadora de más es
 *      segura; quitarla no lo es, y el autor pudo saber algo que el nombre del
 *      ingrediente no dice (p. ej. "Paella de marisco" declara pescado aunque
 *      solo lleve gambas, mejillones y sepia).
 *
 *   2. NO escribe los alérgenos de COCINADO (el vino/vinagre/brandy de
 *      `COOKING_ALLERGEN_RULES`). Esos son un segundo nivel deliberado — mismo
 *      patrón que `alcohol_cocina` en intolerances.js — y meterlos aquí
 *      vaciaría 65 recetas para quien filtre por sulfitos. Ver la sección
 *      "Sulfitos de cocinado" del informe.
 *
 *   3. Traduce al vocabulario del schema. La tabla de reglas trabaja con los
 *      ids canónicos UE de EU_ALLERGENS (allergens.js), pero el campo
 *      `allergens` de una receta usa el vocabulario histórico del catálogo
 *      (marisco / huevo / lactosa / frutos_secos). Escribir el id UE crudo
 *      rompería RecipeSchema, que valida contra ese enum.
 *
 * Es idempotente: correrlo dos veces no cambia nada la segunda.
 *
 * Uso:  node scripts/apply-allergen-findings.mjs [--dry-run]
 */

import { readFileSync, readdirSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

import { allergensForIngredientName } from "./ingredient-allergens.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const RECIPES_DIR = join(ROOT, "src", "data", "recipes");

const DRY_RUN = process.argv.includes("--dry-run");

// Id canónico UE (EU_ALLERGENS) → valor del enum ALLERGENS de recipeSchema.js.
// Los que no aparecen aquí se llaman igual en los dos vocabularios.
const TO_SCHEMA_VOCAB = {
  crustaceos: "marisco",
  huevos: "huevo",
  leche: "lactosa",
  frutos_cascara: "frutos_secos",
};

const toSchema = (id) => TO_SCHEMA_VOCAB[id] ?? id;

let changedRecipes = 0;
let addedTotal = 0;
const perAllergen = new Map();
const log = [];

for (const file of readdirSync(RECIPES_DIR)) {
  if (!file.endsWith(".json")) continue;
  const path = join(RECIPES_DIR, file);
  const original = readFileSync(path, "utf8");
  // Los ficheros del catálogo no comparten final de línea: ensaladas_verduras
  // .json está commiteado con CRLF y el resto con LF. Escribir siempre LF
  // reescribía ese fichero entero (39.928 líneas de diff para añadir un
  // alérgeno), enterrando el cambio real. Se detecta y se respeta.
  const usesCrlf = original.includes("\r\n");
  const recipes = JSON.parse(original);
  let fileChanged = false;

  for (const recipe of recipes) {
    const declared = new Set(recipe.allergens ?? []);

    // Solo el nivel duro: `cooking` se descarta a propósito (invariante 2).
    const computed = new Set();
    const evidence = new Map();
    for (const line of recipe.ingredients ?? []) {
      for (const id of allergensForIngredientName(line.name).hard) {
        const schemaId = toSchema(id);
        computed.add(schemaId);
        if (!evidence.has(schemaId)) evidence.set(schemaId, new Set());
        evidence.get(schemaId).add(line.name);
      }
    }

    const missing = [...computed].filter((a) => !declared.has(a)).sort();
    if (missing.length === 0) continue;

    // Añadir, nunca reordenar ni quitar: el orden existente se conserva y los
    // nuevos van al final, para que el diff sea legible.
    recipe.allergens = [...(recipe.allergens ?? []), ...missing];
    fileChanged = true;
    changedRecipes += 1;
    addedTotal += missing.length;
    for (const a of missing) perAllergen.set(a, (perAllergen.get(a) ?? 0) + 1);
    for (const a of missing) {
      log.push(`${recipe.id}  +${a.padEnd(13)} ← ${[...evidence.get(a)].join(", ")}`);
    }
  }

  if (fileChanged && !DRY_RUN) {
    const json = `${JSON.stringify(recipes, null, 2)}\n`;
    writeFileSync(path, usesCrlf ? json.replaceAll("\n", "\r\n") : json, "utf8");
  }
}

for (const line of log) console.log(line);
console.log("");
console.log(DRY_RUN ? "— DRY RUN, no se ha escrito nada —" : "Escrito en src/data/recipes/*.json");
console.log(`Recetas modificadas .... ${changedRecipes}`);
console.log(`Alérgenos añadidos ..... ${addedTotal}`);
for (const [a, n] of [...perAllergen.entries()].sort((x, y) => y[1] - x[1])) {
  console.log(`  ${a.padEnd(14)} ${n}`);
}
if (!DRY_RUN && changedRecipes > 0) {
  console.log("");
  console.log("SIGUIENTE PASO: sube BUNDLED_CATALOG_VERSION en src/data/catalogVersion.js");
  console.log("y regenera la seed (node scripts/generate-supabase-seed.mjs), o Supabase");
  console.log("seguirá sirviendo los alérgenos viejos.");
}
