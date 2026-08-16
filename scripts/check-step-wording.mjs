/**
 * check-step-wording.mjs
 *
 * Lint de estilo para los pasos enriquecidos (`stepsRich`) del catálogo. No llama
 * a ningún modelo: solo verifica que el wording va SISTEMATIZADO según la spec que
 * también vive en el prompt de scripts/enrich-recipe-steps.mjs, de modo que la
 * redacción no dependa de que el LLM "se porte bien".
 *
 * Reglas (por cada paso de `stepsRich`):
 *   1. La orden empieza en INFINITIVO (primera palabra termina en -ar/-er/-ir).
 *      Se marcan imperativos ("Corta") y gerundios ("Cortando").
 *   2. Empieza en mayúscula y termina en punto.
 *   3. Máx 140 caracteres.
 *   4. Tiempo abreviado: "min", nunca "minutos".
 *   5. `kind` dentro de la taxonomía; el último paso suele ser "emplatado".
 *
 * Solo mira `stepsRich` (las recetas ya enriquecidas). Los `steps` planos legacy
 * NO se comprueban, para no romper por datos antiguos aún sin reescribir.
 *
 * Uso:
 *   node scripts/check-step-wording.mjs [--category=pescados]
 * Sale con código 1 si hay errores (útil en CI); los avisos no rompen.
 */

import { readFileSync, readdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const RECIPES_DIR = join(ROOT, "src", "data", "recipes");

const args = process.argv.slice(2);
const catArg = args.find((a) => a.startsWith("--category="));
const CATEGORY = catArg ? catArg.slice("--category=".length) : null;

const STEP_KINDS = new Set([
  "prep", "activo", "paralelo", "pasivo", "espera", "opcional", "emplatado",
]);

const stripLead = (w) => w.replace(/^[¡¿"'(]+/, "");

function firstWord(text) {
  return stripLead(String(text).trim().split(/\s+/)[0] || "");
}

// Infinitivo = primera palabra termina en ar/er/ir (sin tilde: freír → freir).
function startsInfinitive(text) {
  const w = firstWord(text)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  return /(ar|er|ir)$/.test(w);
}
function looksGerund(text) {
  const w = firstWord(text).toLowerCase();
  return /(ando|iendo|yendo)$/.test(w);
}

const errors = [];
const warns = [];

function checkStep(id, i, step, isLast) {
  const where = `${id} · paso ${i + 1}`;
  const text = String(step?.text ?? "");
  if (!text.trim()) {
    errors.push(`${where}: text vacío`);
    return;
  }
  if (looksGerund(text)) {
    errors.push(`${where}: la orden va en gerundio ("${firstWord(text)}"), usa infinitivo`);
  } else if (!startsInfinitive(text)) {
    errors.push(`${where}: la orden no empieza en infinitivo ("${firstWord(text)}")`);
  }
  if (!/^[A-ZÁÉÍÓÚÑ]/.test(text.trim())) {
    warns.push(`${where}: no empieza en mayúscula`);
  }
  if (!/[.…]$/.test(text.trim())) {
    errors.push(`${where}: no termina en punto`);
  }
  if (text.length > 140) {
    errors.push(`${where}: ${text.length} caracteres (máx 140)`);
  }
  if (/\bminutos\b/i.test(text)) {
    warns.push(`${where}: usa "min" en vez de "minutos"`);
  }
  if (step?.kind != null && !STEP_KINDS.has(step.kind)) {
    errors.push(`${where}: kind inválido "${step.kind}"`);
  }
  if (step?.minutes != null && (!Number.isFinite(step.minutes) || step.minutes <= 0)) {
    warns.push(`${where}: minutes inválido (${step.minutes})`);
  }
  if (isLast && step?.kind && step.kind !== "emplatado" && /\bsirv|\bservir\b/i.test(text)) {
    warns.push(`${where}: parece emplatado pero kind="${step.kind}"`);
  }
}

const files = readdirSync(RECIPES_DIR).filter((f) => f.endsWith(".json"));
let recipesWithRich = 0;

for (const file of files) {
  if (CATEGORY && file !== `${CATEGORY}.json`) continue;
  const recipes = JSON.parse(readFileSync(join(RECIPES_DIR, file), "utf8"));
  for (const recipe of recipes) {
    const rich = recipe?.stepsRich;
    if (!Array.isArray(rich) || rich.length === 0) continue;
    recipesWithRich += 1;
    rich.forEach((step, i) => checkStep(recipe.id ?? file, i, step, i === rich.length - 1));
  }
}

console.log(`Revisadas ${recipesWithRich} recetas con stepsRich.`);
if (warns.length) {
  console.log(`\n⚠️  ${warns.length} avisos:`);
  for (const w of warns) console.log(`  · ${w}`);
}
if (errors.length) {
  console.log(`\n❌ ${errors.length} errores de estilo:`);
  for (const e of errors) console.log(`  · ${e}`);
  process.exit(1);
}
console.log("\n✅ Wording consistente (infinitivo, punto final, longitud, unidades).");
