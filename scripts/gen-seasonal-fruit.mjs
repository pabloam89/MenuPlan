// Generate the 4 seasonal-fruit overhead thumbnails (same bowl+slate formula
// as the rest of the catalog). Run:
//   node --env-file=.env.local scripts/gen-seasonal-fruit.mjs
//
// Writes public/dishes/fruta_temporada_{invierno,primavera,verano,otono}.jpg

import { GoogleGenAI } from "@google/genai";
import { writeFileSync, existsSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, "../public/dishes");
if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });

const GEMINI_KEY = process.env.GEMINI_AI_STUDIO_KEY;
if (!GEMINI_KEY) {
  console.error("❌  GEMINI_AI_STUDIO_KEY not found. Run with: node --env-file=.env.local scripts/gen-seasonal-fruit.mjs");
  process.exit(1);
}

const ai = new GoogleGenAI({ apiKey: GEMINI_KEY });
const MODEL = "gemini-2.5-flash-image";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const REDO = process.argv.includes("--redo");

const DISHES = [
  {
    id: "fruta_temporada_invierno",
    name: "un bol de fruta de temporada de invierno: gajos de naranja y mandarina con kiwi troceado",
  },
  {
    id: "fruta_temporada_primavera",
    name: "un bol de fresas frescas enteras y nísperos, fruta de temporada de primavera",
  },
  {
    id: "fruta_temporada_verano",
    name: "un bol de melocotón y sandía troceados, fruta de temporada de verano",
  },
  {
    id: "fruta_temporada_otono",
    name: "un bol de uvas y granos de granada, fruta de temporada de otoño",
  },
];

function buildPrompt(dish) {
  return (
    `Fotografía gastronómica cenital a exactamente 90 grados (vista de pájaro perfecta) de ${dish}. ` +
    `Servido en un bol de cerámica rústica moteada de color crema con borde marrón oscuro, ` +
    `perfectamente centrado sobre un fondo de pizarra negra texturizada que llena todo el encuadre. ` +
    `Iluminación natural difusa y suave, texturas hiperrealistas, estética minimalista y rústica, ` +
    `calidad de libro de cocina. ` +
    `SOLO el bol con la fruta en el encuadre: sin cubiertos, sin servilletas, sin manteles, ` +
    `sin recipientes adicionales, sin ingredientes sueltos alrededor, sin ningún objeto fuera del bol.`
  );
}

async function generate(dish) {
  const stream = await ai.models.generateContentStream({
    model: MODEL,
    contents: [{ role: "user", parts: [{ text: buildPrompt(dish.name) }] }],
    config: { responseModalities: ["IMAGE", "TEXT"], httpOptions: { timeout: 120000, headers: {} } },
  });
  let imgPart = null;
  for await (const chunk of stream) {
    for (const p of chunk?.candidates?.[0]?.content?.parts ?? []) {
      if (p.inlineData?.mimeType?.startsWith("image/")) imgPart = p;
    }
  }
  if (!imgPart) throw new Error("No image returned");
  const out = join(OUT_DIR, `${dish.id}.jpg`);
  writeFileSync(out, Buffer.from(imgPart.inlineData.data, "base64"));
}

console.log(`🍊  Seasonal fruit — ${DISHES.length} overhead shots → ${OUT_DIR}\n`);

for (const dish of DISHES) {
  const out = join(OUT_DIR, `${dish.id}.jpg`);
  if (existsSync(out) && !REDO) {
    console.log(`⏭️   ${dish.id} — ya existe`);
    continue;
  }
  let attempt = 0;
  while (true) {
    try {
      const t0 = Date.now();
      await generate(dish);
      console.log(`✅  ${dish.id} (${Date.now() - t0}ms)`);
      break;
    } catch (err) {
      attempt++;
      if (attempt > 2) {
        console.error(`❌  ${dish.id}: ${err.message?.slice(0, 140)}`);
        break;
      }
      await sleep(3000 * attempt);
    }
  }
  await sleep(1000);
}
