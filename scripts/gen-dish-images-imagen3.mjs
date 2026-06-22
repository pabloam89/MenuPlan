// MenuPlan — image generation via Gemini 2.5 Flash Image (streaming)
// Run: node --env-file=.env.local scripts/gen-dish-images-imagen3.mjs

import { GoogleGenAI } from "@google/genai";
import { writeFileSync, mkdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, "../public/dishes");

if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });

const GEMINI_KEY = process.env.GEMINI_AI_STUDIO_KEY;
if (!GEMINI_KEY) {
  console.error("❌  GEMINI_AI_STUDIO_KEY not found in environment. Check .env.local");
  process.exit(1);
}

const ai = new GoogleGenAI({ apiKey: GEMINI_KEY });
const MODEL = "gemini-2.5-flash-image";

// Fixed style formula — keeps every image visually consistent
const buildPrompt = (dish) =>
  `Fotografía gastronómica cenital a exactamente 90 grados (vista de pájaro perfecta) de ${dish}. ` +
  `Servido en un bol de cerámica rústica moteada de color crema con borde marrón oscuro, ` +
  `perfectamente centrado sobre un fondo de pizarra negra texturizada que llena todo el encuadre. ` +
  `Iluminación natural difusa y suave, texturas hiperrealistas, estética minimalista y rústica, ` +
  `calidad de libro de cocina. ` +
  `SOLO el bol con la comida en el encuadre: sin cubiertos, sin servilletas, sin manteles, ` +
  `sin cuencos adicionales, sin ingredientes sueltos alrededor, sin ningún objeto fuera del bol.`;

const TEST_COMBOS = [
  { id: "carnes_pollo_g25",       name: "Pollo al horno con patatas y romero" },
  { id: "legumbres_garbanzos_g25", name: "Garbanzos con espinacas" },
  { id: "pescados_merluza_g25",   name: "Merluza al horno con limón" },
  { id: "huevos_revuelto_g25",    name: "Revuelto de setas y gambas" },
  { id: "verduras_pisto_g25",     name: "Pisto manchego" },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function generate(combo) {
  const t0 = Date.now();
  console.log(`⏳  ${combo.name} (${combo.id})…`);

  const stream = await ai.models.generateContentStream({
    model: MODEL,
    contents: [{ role: "user", parts: [{ text: buildPrompt(combo.name) }] }],
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

  const outPath = join(OUT_DIR, `${combo.id}.jpg`);
  writeFileSync(outPath, Buffer.from(imgPart.inlineData.data, "base64"));
  console.log(`✅  Saved → ${outPath} (${Date.now() - t0}ms)`);
}

console.log(`🍽️   MenuPlan — ${MODEL} (5 dishes)\n`);

for (const combo of TEST_COMBOS) {
  try {
    await generate(combo);
    await sleep(1000);
  } catch (err) {
    console.error(`❌  ${combo.id}: ${err.message?.slice(0, 200)}`);
  }
}

console.log("\n✨  Done! Open public/dishes/ to review the images.");
