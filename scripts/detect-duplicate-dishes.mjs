/**
 * detect-duplicate-dishes.mjs
 *
 * Groups recipes that share mainProtein + cooking technique + main ingredient
 * ("fingerprint") to surface likely semantic duplicates the ID-uniqueness
 * check in recipeCatalog.js can't catch (e.g. "Pollo al horno con patatas"
 * vs "Muslos de pollo al horno").
 *
 * This is a review aid, not a build gate: clusters are printed for a human
 * to decide whether to merge, keep as distinct variants (and link via
 * `baseDishId`), or leave untouched.
 *
 * Usage:  node scripts/detect-duplicate-dishes.mjs
 */

import { readFileSync, readdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const RECIPES_DIR = join(ROOT, "src", "data", "recipes");

const TECHNIQUES = [
  [/horno|asad[oa]|al horno/, "horno"],
  [/plancha/, "plancha"],
  [/guis[oa]d[oa]|estofad[oa]|fricand[oó]|ragú/, "guiso"],
  [/frit[oa]|rebozad[oa]|empanad[oa]/, "frito"],
  [/vapor/, "vapor"],
  [/crud[oa]|ensalada/, "crudo"],
  [/airfryer/, "airfryer"],
];

const EXCLUDED_INGREDIENTS = /^(aceite|sal|agua|pimienta|ajo|perejil|laurel)/i;

function normalize(text) {
  return String(text ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

function technique(recipe) {
  const text = normalize([recipe.name, ...(recipe.steps ?? [])].join(" "));
  for (const [pattern, label] of TECHNIQUES) {
    if (pattern.test(text)) return label;
  }
  return "otro";
}

function mainIngredient(recipe) {
  const candidates = (recipe.ingredients ?? [])
    .filter((i) => !EXCLUDED_INGREDIENTS.test(normalize(i.name)))
    .sort((a, b) => b.amount - a.amount);
  return candidates.length ? normalize(candidates[0].name) : "ninguno";
}

function fingerprint(recipe) {
  return `${recipe.mainProtein}__${technique(recipe)}__${mainIngredient(recipe)}`;
}

const recipes = [];
for (const file of readdirSync(RECIPES_DIR)) {
  if (!file.endsWith(".json")) continue;
  const entries = JSON.parse(readFileSync(join(RECIPES_DIR, file), "utf8"));
  for (const r of entries) recipes.push(r);
}

const clusters = new Map();
for (const r of recipes) {
  if (r.mainProtein === "none") continue; // guarniciones, ensaladas sin proteína: no aplica
  const fp = fingerprint(r);
  if (!clusters.has(fp)) clusters.set(fp, []);
  clusters.get(fp).push(r);
}

const overlaps = [...clusters.entries()]
  .filter(([, group]) => group.length > 1)
  .sort((a, b) => b[1].length - a[1].length);

if (overlaps.length === 0) {
  console.log("✅ No se detectaron solapamientos semánticos.");
  process.exit(0);
}

console.log(`⚠️  ${overlaps.length} posible(s) solapamiento(s) semántico(s):\n`);
for (const [fp, group] of overlaps) {
  console.log(`Fingerprint: ${fp}`);
  for (const r of group) {
    const baseTag = r.baseDishId ? ` (baseDishId → ${r.baseDishId})` : "";
    console.log(`  - ${r.id}: "${r.name}"${baseTag}`);
  }
  console.log("");
}

console.log(
  "Revisa cada grupo: si son variantes reales del mismo plato base, vincula con\n" +
  "`baseDishId` en el JSON. Si es un falso positivo, no hace falta ninguna acción.",
);
