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
 * Cubre las tres familias de pasos enriquecidos, que siguen las MISMAS reglas:
 * el `stepsRich` de cada receta (método tradicional), sus `thawSteps` (resucitar
 * una ración del congelador) y las listas por electrodoméstico de
 * recipeStepsByAppliance.json. Los `steps` planos legacy NO se comprueban, para
 * no romper por datos antiguos aún sin reescribir — y en el fichero por
 * electrodoméstico eso incluye las listas que aún son string[].
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

// La puntuación no cambia el modo verbal: "Remover," sigue siendo infinitivo, y
// sin recortar la coma final el regex de abajo lo daba por incumplimiento.
const stripPunct = (w) => w.replace(/^[¡¿"'(]+/, "").replace(/[,.;:)]+$/, "");

function firstWord(text) {
  return stripPunct(String(text).trim().split(/\s+/)[0] || "");
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
let recipesWithThaw = 0;

for (const file of files) {
  if (CATEGORY && file !== `${CATEGORY}.json`) continue;
  const recipes = JSON.parse(readFileSync(join(RECIPES_DIR, file), "utf8"));
  for (const recipe of recipes) {
    const rich = recipe?.stepsRich;
    if (Array.isArray(rich) && rich.length > 0) {
      recipesWithRich += 1;
      rich.forEach((step, i) => checkStep(recipe.id ?? file, i, step, i === rich.length - 1));
    }
    const thaw = recipe?.thawSteps;
    if (Array.isArray(thaw) && thaw.length > 0) {
      recipesWithThaw += 1;
      thaw.forEach((step, i) =>
        checkStep(`${recipe.id ?? file}/descongelar`, i, step, i === thaw.length - 1));
      // El schema (src/data/recipeSchema.js) ya lo rechaza, pero el lint corre
      // antes de que nadie importe el catálogo y da el id en claro.
      if (!recipe.freezable) {
        errors.push(`${recipe.id ?? file}: tiene thawSteps pero freezable no es true`);
      }
      // Un paso de descongelado que cita ingredientes de la receta delata que el
      // modelo ha vuelto a escribir el cocinado en vez del recalentado.
      const withMarkers = thaw.filter((s) => /\{\{/.test(String(s?.text ?? ""))).length;
      if (withMarkers > 0) {
        errors.push(
          `${recipe.id ?? file}: ${withMarkers} paso(s) de descongelado con marcadores {{…}} — el plato ya está cocinado`,
        );
      }
    }
  }
}

// Pasos por electrodoméstico: mismas reglas, mismo lint. Solo las listas ya
// enriquecidas; las que siguen siendo string[] son datos viejos aún sin rehacer.
const APPLIANCE_STEPS_PATH = join(ROOT, "src", "data", "recipeStepsByAppliance.json");
let applianceLists = 0;
let applianceLegacy = 0;
const applianceSteps = JSON.parse(readFileSync(APPLIANCE_STEPS_PATH, "utf8"));

for (const [recipeId, byAppliance] of Object.entries(applianceSteps)) {
  for (const [appliance, steps] of Object.entries(byAppliance ?? {})) {
    if (!Array.isArray(steps) || steps.length === 0) continue;
    if (steps.some((s) => typeof s === "string")) {
      applianceLegacy += 1;
      continue;
    }
    applianceLists += 1;
    steps.forEach((step, i) =>
      checkStep(`${recipeId}/${appliance}`, i, step, i === steps.length - 1));
  }
}

console.log(`Revisadas ${recipesWithRich} recetas con stepsRich.`);
console.log(`Revisadas ${recipesWithThaw} recetas con thawSteps (congelables).`);
console.log(
  `Revisadas ${applianceLists} listas por electrodoméstico`
  + (applianceLegacy ? ` (${applianceLegacy} aún en formato plano, sin comprobar).` : "."),
);
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
