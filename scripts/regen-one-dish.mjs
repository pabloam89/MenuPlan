// Regenerate a SINGLE dish photo end-to-end: generate with Gemini (reusing the
// shared buildPrompt + its disambiguation rules), upload to Vercel Blob at the
// exact same path, and cache-bust that entry in the app manifest so the fresh
// image is actually served (the CDN caches the old one for ~30 days).
//
// Usage:
//   node --env-file=.env.local scripts/regen-one-dish.mjs <combo_id> "<Nombre del plato>"
//
// Example:
//   node --env-file=.env.local scripts/regen-one-dish.mjs pasta_arroces_003 "Arroz con tomate frito"

import { GoogleGenAI } from "@google/genai";
import { put } from "@vercel/blob";
import { writeFileSync, readFileSync, mkdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { buildPrompt } from "./lib/combos.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const [comboId, dishName] = process.argv.slice(2);
if (!comboId || !dishName) {
  console.error('Uso: node --env-file=.env.local scripts/regen-one-dish.mjs <combo_id> "<Nombre>"');
  process.exit(1);
}

const GEMINI_KEY = process.env.GEMINI_AI_STUDIO_KEY;
const BLOB_TOKEN = process.env.BLOB_READ_WRITE_TOKEN;
if (!GEMINI_KEY) { console.error("❌  GEMINI_AI_STUDIO_KEY no encontrado"); process.exit(1); }
if (!BLOB_TOKEN) { console.error("❌  BLOB_READ_WRITE_TOKEN no encontrado"); process.exit(1); }

// A dish+garnish combo id ("carnes_002+guarniciones_001") splits into its two
// display names so the shared prompt reads "<dish> con <garnish>".
const [dishPart, garnishPart] = dishName.split(" con ");
const row = { combo_id: comboId, dish_name: dishPart ?? dishName, garnish_name: garnishPart ?? "" };

const prompt = buildPrompt(row);
console.log(`🎨  Prompt:\n${prompt}\n`);

const ai = new GoogleGenAI({ apiKey: GEMINI_KEY });
const stream = await ai.models.generateContentStream({
  model: "gemini-2.5-flash-image",
  contents: [{ role: "user", parts: [{ text: prompt }] }],
  config: { responseModalities: ["IMAGE", "TEXT"], httpOptions: { timeout: 120000, headers: {} } },
});

let imgPart = null;
for await (const chunk of stream) {
  for (const p of chunk?.candidates?.[0]?.content?.parts ?? []) {
    if (p.inlineData?.mimeType?.startsWith("image/")) imgPart = p;
  }
}
if (!imgPart) { console.error("❌  La IA no devolvió imagen"); process.exit(1); }

const buffer = Buffer.from(imgPart.inlineData.data, "base64");
const outDir = join(ROOT, "output", "dishes");
if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, `${comboId}.jpg`), buffer);
console.log(`✅  Imagen generada (${(buffer.length / 1024).toFixed(0)} KB) → output/dishes/${comboId}.jpg`);

const blob = await put(`dishes/${comboId}.jpg`, buffer, {
  access: "public",
  token: BLOB_TOKEN,
  contentType: "image/jpeg",
  addRandomSuffix: false,
  allowOverwrite: true,
});
console.log(`✅  Subida a Blob → ${blob.url}`);

// Cache-bust the app manifest: bump ?v=N so browsers + wsrv fetch the fresh one.
const MANIFEST = join(ROOT, "src", "assets", "dishes", "dishImages.json");
const manifest = JSON.parse(readFileSync(MANIFEST, "utf8"));
const current = manifest[comboId] ?? blob.url;
const [base, query] = current.split("?");
const prevV = query ? Number(new URLSearchParams(query).get("v")) || 1 : 1;
manifest[comboId] = `${base}?v=${prevV + 1}`;
writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + "\n", "utf8");
console.log(`✅  Manifest cache-busted → ${manifest[comboId]}`);
console.log("\n✨  Listo. Recarga la app para ver la foto nueva.");
