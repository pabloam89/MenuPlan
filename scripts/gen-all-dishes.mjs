// MenuPlan — batch dish image generation (Gemini 2.5 Flash Image, streaming)
//
// Usage:
//   node --env-file=.env.local scripts/gen-all-dishes.mjs --pilot
//   node --env-file=.env.local scripts/gen-all-dishes.mjs                          (full 1524)
//   node --env-file=.env.local scripts/gen-all-dishes.mjs --limit 50
//   node --env-file=.env.local scripts/gen-all-dishes.mjs --ids carnes_001,huevos_001
//   node --env-file=.env.local scripts/gen-all-dishes.mjs --redo carnes_001,...    (force)
//   node --env-file=.env.local scripts/gen-all-dishes.mjs --rejections output/rechazadas-2026-06-21.json
//
// --rejections: path to the JSON exported from the gallery.
//   Each entry { combo_id, name, reason } is regenerated with the reviewer feedback
//   injected into the prompt so Gemini knows exactly what to fix.
//
// Images are written to output/dishes/<combo_id>.jpg
// Progress is checkpointed: any combo whose image already exists is skipped
// (unless --redo or --rejections is used).

import { GoogleGenAI } from "@google/genai";
import { writeFileSync, existsSync, mkdirSync, readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { loadCombos, buildPrompt, displayName, selectPilot } from "./lib/combos.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, "../output/dishes");
if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });

const GEMINI_KEY = process.env.GEMINI_AI_STUDIO_KEY;
if (!GEMINI_KEY) {
  console.error("❌  GEMINI_AI_STUDIO_KEY not found. Check .env.local");
  process.exit(1);
}

const ai = new GoogleGenAI({ apiKey: GEMINI_KEY });
const MODEL = "gemini-2.5-flash-image";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- CLI args ----
const args = process.argv.slice(2);
const hasFlag = (f) => args.includes(f);
const getOpt = (f) => {
  const i = args.indexOf(f);
  return i >= 0 ? args[i + 1] : null;
};
const PILOT       = hasFlag("--pilot");
const LIMIT       = getOpt("--limit") ? parseInt(getOpt("--limit"), 10) : null;
const IDS         = getOpt("--ids") ? getOpt("--ids").split(",").map((s) => s.trim()) : null;
const REDO        = getOpt("--redo") ? new Set(getOpt("--redo").split(",").map((s) => s.trim())) : new Set();
const REJECTIONS_PATH = getOpt("--rejections");

// ---- Load rejections file if provided ----
// Format: [{ combo_id, name, reason }]
let rejectionReasons = {}; // combo_id → reason string
if (REJECTIONS_PATH) {
  const fullPath = REJECTIONS_PATH.startsWith("/") || REJECTIONS_PATH.match(/^[A-Z]:/i)
    ? REJECTIONS_PATH
    : join(process.cwd(), REJECTIONS_PATH);

  if (!existsSync(fullPath)) {
    console.error(`❌  Rejections file not found: ${fullPath}`);
    process.exit(1);
  }
  const entries = JSON.parse(readFileSync(fullPath, "utf8"));
  for (const { combo_id, reason } of entries) {
    rejectionReasons[combo_id] = reason || "";
    REDO.add(combo_id); // always regenerate rejected ones
  }
  console.log(`📝  Loaded ${entries.length} rejections from ${REJECTIONS_PATH}`);
}

// ---- Build prompt — injects reviewer feedback when available ----
function buildPromptWithFeedback(row) {
  const base = buildPrompt(row);
  const reason = rejectionReasons[row.combo_id];
  if (!reason) return base;
  return (
    base +
    `\n\nFEEDBACK DEL REVISOR (corrígelo en esta versión): "${reason}"`
  );
}

// ---- Select which combos to generate ----
let rows = loadCombos();
console.log(`📋  Loaded ${rows.length} combos from CSV.`);

if (REJECTIONS_PATH) {
  // When using --rejections, only process the rejected IDs
  const rejectedIds = new Set(Object.keys(rejectionReasons));
  rows = rows.filter((r) => rejectedIds.has(r.combo_id));
  console.log(`🔄  Regenerating ${rows.length} rejected images with reviewer feedback.\n`);
} else if (IDS) {
  rows = rows.filter((r) => IDS.includes(r.combo_id));
} else if (PILOT) {
  rows = selectPilot(rows);
}

const outPathFor = (id) => join(OUT_DIR, `${id}.jpg`);

async function generate(row) {
  const t0 = Date.now();
  const prompt = buildPromptWithFeedback(row);

  const stream = await ai.models.generateContentStream({
    model: MODEL,
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    config: {
      responseModalities: ["IMAGE", "TEXT"],
      httpOptions: { timeout: 120000, headers: {} },
    },
  });

  let imgPart = null;
  for await (const chunk of stream) {
    const parts = chunk?.candidates?.[0]?.content?.parts ?? [];
    for (const p of parts) {
      if (p.inlineData?.mimeType?.startsWith("image/")) imgPart = p;
    }
  }
  if (!imgPart) throw new Error("No image returned");

  writeFileSync(outPathFor(row.combo_id), Buffer.from(imgPart.inlineData.data, "base64"));
  return Date.now() - t0;
}

// ---- Main loop with checkpoint + retries ----
const MAX_RETRIES = 2;
let done = 0, skipped = 0, failed = 0;
const failures = [];
const total = rows.length;

console.log(`🍽️   Generating up to ${LIMIT ?? total} images → ${OUT_DIR}\n`);

for (let i = 0; i < rows.length; i++) {
  const row = rows[i];
  const id = row.combo_id;

  if (existsSync(outPathFor(id)) && !REDO.has(id)) {
    skipped++;
    continue;
  }

  if (LIMIT !== null && done >= LIMIT) {
    console.log(`\n⏸️   Reached limit of ${LIMIT} new images. Stopping.`);
    break;
  }

  const feedback = rejectionReasons[id];
  if (feedback) {
    console.log(`   💬 feedback: "${feedback}"`);
  }

  let attempt = 0;
  while (true) {
    try {
      const ms = await generate(row);
      done++;
      console.log(`✅  [${i + 1}/${total}] ${id} — ${displayName(row)} (${ms}ms)`);
      break;
    } catch (err) {
      attempt++;
      const msg = err.message?.slice(0, 120);
      if (attempt > MAX_RETRIES) {
        failed++;
        failures.push(id);
        console.error(`❌  [${i + 1}/${total}] ${id}: ${msg} — giving up`);
        break;
      }
      console.warn(`   ↻ retry ${attempt}/${MAX_RETRIES} for ${id}: ${msg}`);
      await sleep(3000 * attempt);
    }
  }

  await sleep(800);
}

console.log(`\n✨  Done. generated=${done} skipped=${skipped} failed=${failed}`);
if (failures.length) {
  console.log(`   Failed IDs (rerun with --redo): ${failures.join(",")}`);
}
