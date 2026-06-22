// Test script v5: image-to-image with reference, minimal prompt
// Run: node --env-file=.env.local scripts/gen-dish-images-test.mjs

import { writeFileSync, mkdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, "../public/dishes");
if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });

const FAL_KEY = process.env.FAL_KEY;
if (!FAL_KEY) {
  console.error("❌  FAL_KEY not found in environment. Check .env.local");
  process.exit(1);
}

// Reference images uploaded to Imgur (public, permanent)
// REF_1: original style reference (dark slate, ceramic plate) → https://i.imgur.com/lcXlEn9.jpeg
// REF_2: paella clean (overhead, speckled ceramic, no props) → https://i.imgur.com/h5eN6PB.jpeg
// REF_3: lentejas_v8 — cleanest result, no props, perfect angle (used as primary)
const REFERENCE_URL = "https://i.imgur.com/58eljXR.jpeg";

// Back to minimal positive prompt — negations don't work in Flux Pro
const buildPrompt = (dish) =>
  `${dish}, overhead flat lay, rustic ceramic plate, dark slate background, ` +
  `photorealistic, cookbook quality`;

const TEST_COMBOS = [
  { id: "verduras_003_v9",  name: "Crema de calabaza" },
  { id: "carnes_005_v9",    name: "Estofado de ternera con patatas" },
  { id: "huevos_001_v9",    name: "Tortilla española" },
  { id: "pescados_005_v9",  name: "Salmón al horno con limón" },
  { id: "pasta_001_v9",     name: "Macarrones con tomate y queso" },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function generate(combo, referenceUrl) {
  console.log(`⏳  ${combo.name} (${combo.id})…`);

  const res = await fetch("https://fal.run/fal-ai/flux-pro/v1.1", {
    method: "POST",
    headers: {
      "Authorization": `Key ${FAL_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      prompt: buildPrompt(combo.name),
      image_url: referenceUrl,
      image_prompt_strength: 0.35,   // 35% reference → forces clean composition from paella
      image_size: "square_hd",
      num_inference_steps: 28,
      guidance_scale: 3.5,
      num_images: 1,
      output_format: "jpeg",
      safety_tolerance: "2",
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`HTTP ${res.status}: ${errText}`);
  }

  const data = await res.json();
  const imageUrl = data.images[0].url;

  const imgRes = await fetch(imageUrl);
  const buffer = Buffer.from(await imgRes.arrayBuffer());
  const outPath = join(OUT_DIR, `${combo.id}.jpg`);
  writeFileSync(outPath, buffer);
  console.log(`✅  Saved → ${outPath}`);
}

console.log("🍽️   MenuPlan — Image generation v5 (img2img reference)\n");
console.log(`🖼️   Reference: ${REFERENCE_URL}\n`);

for (const combo of TEST_COMBOS) {
  try {
    await generate(combo, REFERENCE_URL);
    await sleep(2000);
  } catch (err) {
    console.error(`❌  ${combo.id}: ${err.message}`);
  }
}

console.log("\n✨  Done! Open public/dishes/ to review the images.");
