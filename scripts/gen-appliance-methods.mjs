// MenuPlan — generate appliance preparation methods for every recipe (Gemini text)
//
// For each recipe in src/data/recipes/*.json we ask Gemini which alternative
// kitchen appliances can realistically prepare it (airfryer, horno, thermomix,
// vaporera, olla_express, microondas) and, for each one, the estimated time,
// difficulty and a short Spanish prep summary. The result is written back into
// the same recipe object as a `methods[]` array.
//
// The recipe's top-level { time, difficulty, steps } stay as the BASE/default
// version (stovetop / its own technique). `methods[]` only lists the variants.
//
// Usage:
//   node --env-file=.env.local scripts/gen-appliance-methods.mjs --pilot
//   node --env-file=.env.local scripts/gen-appliance-methods.mjs --file carnes.json
//   node --env-file=.env.local scripts/gen-appliance-methods.mjs --limit 20
//   node --env-file=.env.local scripts/gen-appliance-methods.mjs --ids carnes_001,huevos_003
//   node --env-file=.env.local scripts/gen-appliance-methods.mjs --redo carnes_001
//   node --env-file=.env.local scripts/gen-appliance-methods.mjs            (full catalog)
//
// Progress is checkpointed: recipes that already have a non-empty methods[]
// are skipped (unless --redo or --ids targets them). The source file is saved
// after every recipe so a crash never loses work.

import { GoogleGenAI } from "@google/genai";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const RECIPES_DIR = join(__dirname, "../src/data/recipes");

const GEMINI_KEY = process.env.GEMINI_AI_STUDIO_KEY;
if (!GEMINI_KEY) {
  console.error("❌  GEMINI_AI_STUDIO_KEY not found. Check .env.local");
  process.exit(1);
}

const ai = new GoogleGenAI({ apiKey: GEMINI_KEY });
const MODEL = getOptEarly("--model") || "gemini-2.5-flash";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function getOptEarly(f) {
  const a = process.argv.slice(2);
  const i = a.indexOf(f);
  return i >= 0 ? a[i + 1] : null;
}

// ---- Vocabulary ----
const APPLIANCES = ["airfryer", "horno", "thermomix", "vaporera", "olla_express", "microondas"];
const DIFFICULTIES = ["facil", "normal", "elaborada"];

// Default catalog files (skip guarniciones + bebes unless explicitly targeted)
const DEFAULT_FILES = [
  "legumbres.json", "carnes.json", "pescados.json", "huevos.json",
  "pasta_arroces.json", "sopas_cremas.json", "ensaladas_verduras.json",
  "platos_unicos.json", "cenas_rapidas.json",
];

// ---- CLI args ----
const args = process.argv.slice(2);
const hasFlag = (f) => args.includes(f);
const getOpt = (f) => {
  const i = args.indexOf(f);
  return i >= 0 ? args[i + 1] : null;
};
const PILOT = hasFlag("--pilot");
const LIMIT = getOpt("--limit") ? parseInt(getOpt("--limit"), 10) : null;
const IDS = getOpt("--ids") ? new Set(getOpt("--ids").split(",").map((s) => s.trim())) : null;
const REDO = getOpt("--redo") ? new Set(getOpt("--redo").split(",").map((s) => s.trim())) : new Set();
const ONLY_FILE = getOpt("--file");

let files = ONLY_FILE ? [ONLY_FILE] : DEFAULT_FILES;
if (PILOT) files = ["huevos.json"]; // small, varied category for a quick smoke test

// ---- Prompt builder ----
function buildPrompt(recipe) {
  const ingredients = (recipe.ingredients ?? [])
    .map((i) => `${i.name} (${i.amount}${i.unit})`)
    .join(", ");
  const base = recipe.requiredAppliance
    ? `técnica base: ${recipe.requiredAppliance}`
    : "técnica base: sartén/plancha/cazuela";

  return `Eres un chef experto en cocina con electrodomésticos. Analiza esta receta española.

RECETA: ${recipe.name}
Categoría: ${recipe.category}
${base}
Tiempo base: ${recipe.time} min · Dificultad base: ${recipe.difficulty}
Ingredientes: ${ingredients}

TAREA: De esta lista de electrodomésticos [${APPLIANCES.join(", ")}], dime en CUÁLES se puede preparar ESTA receta de forma realista y con buen resultado (sin desvirtuarla). Excluye los que no tengan sentido (p.ej. microondas para un filete a la plancha, airfryer para una crema líquida).

Para cada electrodoméstico viable devuelve:
- "appliance": uno de [${APPLIANCES.join(", ")}]
- "time": tiempo total estimado en minutos (entero)
- "difficulty": una de [${DIFFICULTIES.join(", ")}]
- "prepSummary": 1-2 frases en español explicando cómo se hace en ese electrodoméstico (temperatura, tiempo, truco clave)

Responde SOLO con un array JSON válido, sin texto adicional. Si ningún electrodoméstico aplica, devuelve []. Ejemplo:
[{"appliance":"airfryer","time":15,"difficulty":"facil","prepSummary":"Precalienta a 200°C y cocina 15 min dando la vuelta a mitad. Queda dorado por fuera y jugoso por dentro."}]`;
}

// ---- Response parsing ----
function extractJsonArray(text) {
  const trimmed = String(text ?? "").trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("[");
    const end = trimmed.lastIndexOf("]");
    if (start === -1 || end === -1 || end <= start) {
      throw new Error("respuesta sin array JSON");
    }
    return JSON.parse(trimmed.slice(start, end + 1));
  }
}

function sanitizeMethods(raw) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  const out = [];
  for (const m of raw) {
    if (!m || typeof m !== "object") continue;
    const appliance = String(m.appliance ?? "").toLowerCase().trim();
    if (!APPLIANCES.includes(appliance)) continue;
    if (seen.has(appliance)) continue;
    const time = Number.parseInt(m.time, 10);
    if (!Number.isFinite(time) || time <= 0) continue;
    let difficulty = String(m.difficulty ?? "").toLowerCase().trim();
    if (!DIFFICULTIES.includes(difficulty)) difficulty = "facil"; // normalize any "muy_facil" etc.
    const prepSummary = String(m.prepSummary ?? "").trim().slice(0, 280);
    seen.add(appliance);
    out.push({ appliance, time, difficulty, prepSummary });
  }
  return out;
}

async function generateMethods(recipe) {
  const prompt = buildPrompt(recipe);
  const resp = await ai.models.generateContent({
    model: MODEL,
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    config: {
      responseMimeType: "application/json",
      temperature: 0.4,
      httpOptions: { timeout: 60000 },
    },
  });
  const text = resp?.candidates?.[0]?.content?.parts?.map((p) => p.text).join("") ?? "";
  return sanitizeMethods(extractJsonArray(text));
}

// ---- Main loop ----
const MAX_RETRIES = 5;
let done = 0, skipped = 0, failed = 0;
const failures = [];

for (const file of files) {
  const path = join(RECIPES_DIR, file);
  if (!existsSync(path)) {
    console.warn(`⚠️   File not found, skipping: ${file}`);
    continue;
  }
  const recipes = JSON.parse(readFileSync(path, "utf8"));
  console.log(`\n📂  ${file} — ${recipes.length} recipes`);

  for (let i = 0; i < recipes.length; i++) {
    const r = recipes[i];

    if (IDS && !IDS.has(r.id)) continue;
    const alreadyProcessed = "methods" in r && Array.isArray(r.methods);
    const targeted = REDO.has(r.id) || (IDS && IDS.has(r.id));
    if (alreadyProcessed && !targeted) {
      skipped++;
      continue;
    }
    if (LIMIT !== null && done >= LIMIT) {
      console.log(`\n⏸️   Reached limit of ${LIMIT}. Stopping.`);
      break;
    }

    let attempt = 0;
    while (true) {
      try {
        const methods = await generateMethods(r);
        r.methods = methods;
        // Persist immediately (whole file) so a crash never loses progress.
        writeFileSync(path, JSON.stringify(recipes, null, 2) + "\n", "utf8");
        done++;
        const list = methods.map((m) => `${m.appliance}:${m.time}m`).join(", ") || "—";
        console.log(`✅  [${i + 1}/${recipes.length}] ${r.id} ${r.name} → ${list}`);
        break;
      } catch (err) {
        attempt++;
        const msg = err.message?.slice(0, 120);
        // 404 = model gone / bad name → permanent, don't waste retries
        if (/404|no longer available|not found/i.test(msg ?? "")) {
          console.error(`❌  ${r.id}: ${msg} — permanent error, aborting run`);
          failed++;
          failures.push(r.id);
          process.exit(1);
        }
        if (attempt > MAX_RETRIES) {
          failed++;
          failures.push(r.id);
          console.error(`❌  ${r.id}: ${msg} — giving up`);
          break;
        }
        const is503 = /503|high demand|overloaded|unavailable/i.test(msg ?? "");
        const wait = is503 ? Math.min(20000, 4000 * attempt) : 2500 * attempt;
        console.warn(`   ↻ retry ${attempt}/${MAX_RETRIES} for ${r.id}: ${msg}`);
        await sleep(wait);
      }
    }
    await sleep(400);
  }

  if (LIMIT !== null && done >= LIMIT) break;
}

console.log(`\n✨  Done. generated=${done} skipped=${skipped} failed=${failed}`);
if (failures.length) {
  console.log(`   Failed IDs (rerun with --redo): ${failures.join(",")}`);
}
