// MenuPlan — generate dish photos for the NEW desayuno/merienda/postre recipes.
//
// Unlike gen-all-dishes.mjs (which reads a curated CSV), this reads the three
// new recipe JSON files directly, so it always matches whatever we seeded.
//
// Usage:
//   node --env-file=.env.local scripts/gen-new-meals.mjs
//   node --env-file=.env.local scripts/gen-new-meals.mjs --ids desayunos_002,meriendas_003
//   node --env-file=.env.local scripts/gen-new-meals.mjs --redo   (regenerate even if the jpg exists)
//
// Images are written to public/dishes/<id>.jpg (served by Vite at /dishes/<id>.jpg).
// After running, add the printed manifest lines to src/assets/dishes/dishImages.json.

import { GoogleGenAI } from "@google/genai";
import { writeFileSync, existsSync, mkdirSync, readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const OUT_DIR = join(ROOT, "public/dishes");
if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });

const GEMINI_KEY = process.env.GEMINI_AI_STUDIO_KEY;
if (!GEMINI_KEY) {
  console.error("❌  GEMINI_AI_STUDIO_KEY not found. Run with: node --env-file=.env.local scripts/gen-new-meals.mjs");
  process.exit(1);
}

const ai = new GoogleGenAI({ apiKey: GEMINI_KEY });
const MODEL = "gemini-2.5-flash-image";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const args = process.argv.slice(2);
const REDO = args.includes("--redo");
const idsArg = args.indexOf("--ids");
const ONLY_IDS = idsArg >= 0 ? new Set(args[idsArg + 1].split(",").map((s) => s.trim())) : null;

// Load the three new recipe files.
const files = ["desayunos.json", "meriendas.json", "postres.json"];
let recipes = [];
for (const f of files) {
  const arr = JSON.parse(readFileSync(join(ROOT, "src/data/recipes", f), "utf8"));
  recipes.push(...arr);
}
if (ONLY_IDS) recipes = recipes.filter((r) => ONLY_IDS.has(r.id));

// A tostada/bocadillo/baked piece is plated, not served in a bowl. Everything
// else (smoothie, yogur, natillas, flan, macedonia, cereales, porridge…) is a bowl.
function isPlated(name) {
  return /tostada|bocadillo|asada/i.test(name);
}

// Same fixed style as scripts/lib/combos.mjs#buildPrompt; only the vessel word
// changes (bol → plato llano) so plated items don't look wrong in a bowl.
function buildPrompt(name) {
  const vessel = isPlated(name)
    ? "un plato llano de cerámica rústica moteada de color crema con borde marrón oscuro"
    : "un bol de cerámica rústica moteada de color crema con borde marrón oscuro";
  const container = isPlated(name) ? "plato" : "bol";
  return (
    `Fotografía gastronómica cenital a exactamente 90 grados (vista de pájaro perfecta) de ${name}. ` +
    `Servido en ${vessel}, ` +
    `perfectamente centrado sobre un fondo de pizarra negra texturizada que llena todo el encuadre. ` +
    `Iluminación natural difusa y suave, texturas hiperrealistas, estética minimalista y rústica, ` +
    `calidad de libro de cocina. ` +
    `SOLO el ${container} con la comida en el encuadre: sin cubiertos, sin servilletas, sin manteles, ` +
    `sin recipientes adicionales, sin ingredientes sueltos alrededor, sin ningún objeto fuera del ${container}.`
  );
}

const outPathFor = (id) => join(OUT_DIR, `${id}.jpg`);

async function generate(recipe) {
  const stream = await ai.models.generateContentStream({
    model: MODEL,
    contents: [{ role: "user", parts: [{ text: buildPrompt(recipe.name) }] }],
    config: { responseModalities: ["IMAGE", "TEXT"], httpOptions: { timeout: 120000, headers: {} } },
  });
  let imgPart = null;
  for await (const chunk of stream) {
    for (const p of chunk?.candidates?.[0]?.content?.parts ?? []) {
      if (p.inlineData?.mimeType?.startsWith("image/")) imgPart = p;
    }
  }
  if (!imgPart) throw new Error("No image returned");
  writeFileSync(outPathFor(recipe.id), Buffer.from(imgPart.inlineData.data, "base64"));
}

let done = 0, skipped = 0, failed = 0;
const manifest = [];
console.log(`🍽️   Generating ${recipes.length} images → ${OUT_DIR}\n`);

for (let i = 0; i < recipes.length; i++) {
  const r = recipes[i];
  manifest.push(`  "${r.id}": "/dishes/${r.id}.jpg"`);
  if (existsSync(outPathFor(r.id)) && !REDO) {
    skipped++;
    console.log(`⏭️   [${i + 1}/${recipes.length}] ${r.id} — ya existe`);
    continue;
  }
  let attempt = 0;
  while (true) {
    try {
      const t0 = Date.now();
      await generate(r);
      done++;
      console.log(`✅  [${i + 1}/${recipes.length}] ${r.id} — ${r.name} (${Date.now() - t0}ms)`);
      break;
    } catch (err) {
      attempt++;
      if (attempt > 2) {
        failed++;
        console.error(`❌  [${i + 1}/${recipes.length}] ${r.id}: ${err.message?.slice(0, 120)} — giving up`);
        break;
      }
      await sleep(3000 * attempt);
    }
  }
  await sleep(800);
}

console.log(`\n✨  Done. generated=${done} skipped=${skipped} failed=${failed}`);
console.log(`\n📋  Manifest entries for src/assets/dishes/dishImages.json:\n{\n${manifest.join(",\n")}\n}`);
