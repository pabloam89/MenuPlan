/**
 * Fase 9 — propone nutrición por 100g (BEDCA) para el catálogo canónico de
 * ingredientes. NUNCA escribe en ingredients.json: genera un informe de
 * revisión (mismo flujo que scripts/ingredient-allergens.mjs +
 * scripts/apply-allergen-findings.mjs) para que Pablo elija el match correcto
 * antes de que nada se aplique.
 *
 *   node scripts/bedca-nutrition.mjs [--limit N] [--only id1,id2,...]
 *
 * Salida: output/bedca-nutrition-review.json — un array de
 *   { ingredientId, ingredientName, candidates: [{ foodId, foodName, score, nutrition }, ...] }
 * ordenado por score descendente dentro de cada ingrediente. `candidates`
 * vacío significa que BEDCA no devolvió nada razonable para ese nombre — se
 * queda sin nutrición, no es un error.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { searchFoodByName, getFoodNutrition } from "./lib/bedcaClient.mjs";
import { normalizeName } from "../src/lib/ingredientCategories.js";

// Small standalone word-splitter instead of importing normalizePantryInput.js
// (its ingredientWords() is the "right" shared implementation, but it pulls
// in the ENTIRE recipeCatalog.js — every recipe JSON file, plus a Supabase
// client — which not only doesn't run under plain Node ESM without bundler
// support, but would also try to reach Supabase at import time). Stopword
// list kept short and specific to what actually shows up in ingredient names.
const STOPWORDS = new Set(["de", "del", "la", "el", "los", "las", "y", "en", "con", "sin", "un", "una"]);
function ingredientWords(name) {
  return normalizeName(name)
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 1 && !STOPWORDS.has(w));
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const CATALOG_PATH = join(ROOT, "src", "data", "ingredients.json");
const OUT_DIR = join(ROOT, "output");
const OUT_PATH = join(OUT_DIR, "bedca-nutrition-review.json");

const limitArg = process.argv.find((a) => a.startsWith("--limit"));
const LIMIT = limitArg ? Number(limitArg.split("=")[1] ?? process.argv[process.argv.indexOf(limitArg) + 1]) : Infinity;
const onlyArg = process.argv.find((a) => a.startsWith("--only"));
const ONLY = onlyArg ? new Set((onlyArg.split("=")[1] ?? process.argv[process.argv.indexOf(onlyArg) + 1]).split(",")) : null;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Palabras de proceso de cocinado que preferimos EVITAR en el match por
// defecto — las recetas casi siempre listan la cantidad del ingrediente
// crudo/tal-cual-se-compra, no ya cocinado (el peso cambia al cocinar).
// Purely una señal de desempate, nunca descarta un candidato.
const COOKED_STATE_WORDS = new Set(["cocido", "cocida", "frito", "frita", "asado", "asada", "hervido", "hervida", "cocinado", "cocinada", "guisado", "guisada"]);

function scoreCandidate(ingredientWordsSet, foodName) {
  const foodWords = ingredientWords(foodName);
  if (foodWords.length === 0) return 0;
  const foodSet = new Set(foodWords);
  const overlap = [...ingredientWordsSet].filter((w) => foodSet.has(w)).length;
  let score = overlap / Math.max(ingredientWordsSet.size, foodWords.length);
  if (foodWords.some((w) => COOKED_STATE_WORDS.has(w))) score -= 0.15;
  return Math.max(0, Math.round(score * 1000) / 1000);
}

async function findCandidates(ingredient) {
  const nameWords = ingredientWords(ingredient.name);
  // BEDCA nombra "Pollo, pechuga, cruda" donde el catálogo dice "Pechuga de
  // pollo" — buscar por la palabra MÁS LARGA del nombre (normalmente el
  // sustantivo principal) encuentra más que buscar por la frase completa,
  // que rara vez aparece literal en BEDCA.
  const searchTerms = [...new Set([ingredient.name, ...nameWords])].sort((a, b) => b.length - a.length);

  const seen = new Map(); // foodId -> {foodId, foodName}
  for (const term of searchTerms.slice(0, 3)) {
    if (term.length < 3) continue;
    const results = await searchFoodByName(term);
    for (const r of results) seen.set(r.id, r);
    await sleep(150);
    if (seen.size >= 40) break; // suficientes candidatos para rankear, no hace falta agotar los 3 términos
  }
  if (seen.size === 0) return [];

  const nameWordSet = new Set(nameWords);
  const ranked = [...seen.values()]
    .map((f) => ({ foodId: f.id, foodName: f.name, score: scoreCandidate(nameWordSet, f.name) }))
    .filter((c) => c.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  const withNutrition = [];
  for (const c of ranked) {
    const nutrition = await getFoodNutrition(c.foodId);
    await sleep(150);
    if (nutrition) withNutrition.push({ ...c, nutrition });
  }
  return withNutrition;
}

const catalog = JSON.parse(readFileSync(CATALOG_PATH, "utf8"));
const targets = catalog
  .filter((ing) => !ONLY || ONLY.has(ing.id))
  .slice(0, LIMIT);

mkdirSync(OUT_DIR, { recursive: true });
const review = existsSync(OUT_PATH) ? JSON.parse(readFileSync(OUT_PATH, "utf8")) : [];
const doneIds = new Set(review.map((r) => r.ingredientId));

console.log(`🔎  Consultando BEDCA para ${targets.length} ingredientes (${doneIds.size} ya en el informe, se saltan)…\n`);

let processed = 0, withMatch = 0;
for (const ing of targets) {
  if (doneIds.has(ing.id)) continue;
  try {
    const candidates = await findCandidates(ing);
    const entry = { ingredientId: ing.id, ingredientName: ing.name, candidates };
    review.push(entry);
    processed++;
    if (candidates.length > 0) withMatch++;
    console.log(`  [${processed}/${targets.length - doneIds.size}] ${ing.name} → ${candidates.length} candidatos${candidates[0] ? ` (mejor: "${candidates[0].foodName}", score ${candidates[0].score})` : ""}`);
  } catch (err) {
    console.error(`  ❌  ${ing.name}: ${err.message}`);
    review.push({ ingredientId: ing.id, ingredientName: ing.name, candidates: [], error: err.message });
  }
  writeFileSync(OUT_PATH, JSON.stringify(review, null, 2), "utf8");
}

console.log(`\n✨  Hecho. ${processed} ingredientes consultados, ${withMatch} con al menos un candidato.`);
console.log(`   Revisa → ${OUT_PATH}`);
console.log(`   Nada se ha aplicado a ingredients.json todavía.`);
