/**
 * Vino, vinagre y licores: sus sulfitos pasan de «alérgeno de cocinado» a
 * alérgeno DECLARADO (decisión de Pablo, 30 sep 2026).
 *
 * Hasta ahora `cookingAllergens: ["sulfitos"]` los dejaba en un segundo nivel
 * que no se declaraba en la receta, con la idea de que se evaporan al
 * cocinar. No es del todo cierto, y para una alergia la duda cuenta. La red
 * por nombre de filterRecipes ya excluía «vino» y «vinagre» para quien marca
 * sulfitos; esto lo deja declarado donde se ve.
 *
 *   node scripts/sulfitos-vino-vinagre.mjs            # aplica
 *   node scripts/sulfitos-vino-vinagre.mjs --dry-run  # solo cuenta
 *
 * Solo añade: nunca quita un alérgeno de ninguna receta.
 */

import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const SECO = process.argv.includes("--dry-run");
const rutaIng = path.join(ROOT, "src/data/ingredients.json");
const ingredientes = JSON.parse(fs.readFileSync(rutaIng, "utf8"));

const movidos = ingredientes.filter((i) => i.cookingAllergens.includes("sulfitos"));
for (const i of movidos) {
  i.cookingAllergens = i.cookingAllergens.filter((a) => a !== "sulfitos");
  if (!i.allergens.includes("sulfitos")) i.allergens = [...i.allergens, "sulfitos"].sort();
  if (i.mayContain) i.mayContain = i.mayContain.filter((a) => a !== "sulfitos");
  if (i.mayContain && !i.mayContain.length) delete i.mayContain;
}
const ids = new Set(movidos.map((i) => i.id));

const dir = path.join(ROOT, "src/data/recipes");
let recetas = 0;
for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".json"))) {
  const lista = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
  let tocado = false;
  for (const r of lista) {
    if (!(r.ingredients ?? []).some((l) => ids.has(l.ingredientId))) continue;
    if ((r.allergens ?? []).includes("sulfitos")) continue;
    r.allergens = [...(r.allergens ?? []), "sulfitos"];
    tocado = true;
    recetas++;
  }
  if (tocado && !SECO) fs.writeFileSync(path.join(dir, f), `${JSON.stringify(lista, null, 2)}\n`);
}
if (!SECO) fs.writeFileSync(rutaIng, `${JSON.stringify(ingredientes, null, 2)}\n`);
console.log(`${SECO ? "[dry-run] " : ""}${movidos.length} ingredientes (${movidos.map((i) => i.name).join(", ")}) y ${recetas} recetas que ahora declaran sulfitos.`);
