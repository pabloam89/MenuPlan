/**
 * Generates test dish photos with the new luminous marble prompt style.
 * Run: node scripts/gen-test-photos.mjs
 * Output: scripts/test-photos/
 */

import { GoogleGenAI } from "@google/genai";
import { writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, "test-photos");
mkdirSync(OUT_DIR, { recursive: true });

const API_KEY = process.env.GEMINI_AI_STUDIO_KEY;
if (!API_KEY) {
  console.error("Falta GEMINI_AI_STUDIO_KEY. Exportala antes de ejecutar este script.");
  process.exit(1);
}
const MODEL = "gemini-2.5-flash-image";

const DISHES = [
  "espárragos a la plancha con ajo",
  "chuletas de cerdo a la plancha con verduras salteadas",
  "lentejas con chorizo",
  "espaguetis carbonara",
  "gazpacho andaluz",
  "paella valenciana",
  "merluza en salsa verde con patatas cocidas",
  "albóndigas en salsa de tomate con puré de patatas",
  "pollo al horno con patatas",
  "garbanzos con espinacas",
  "pechugas de pollo a la plancha con arroz blanco",
];

function buildPrompt(dishName) {
  return (
    `Fotografía gastronómica cenital a exactamente 90 grados (vista de pájaro perfecta) de ${dishName}. ` +
    `Servido en un bol de cerámica artesanal de color blanco roto con borde irregular, ` +
    `perfectamente centrado sobre una superficie de mármol blanco cálido con vetas grises suaves que llena todo el encuadre. ` +
    `Iluminación lateral dorada y cálida que realza los brillos del aceite y las texturas, con un toque de luz natural de ventana. ` +
    `Colores vivos y saturados, vapor sutil, acabados brillantes y apetecibles, hierbas frescas como detalle final. ` +
    `Estética de revista gastronómica de alta gama, hiperrealista, calidad editorial Bon Appétit. ` +
    `SOLO el bol con la comida en el encuadre: sin cubiertos, sin servilletas, sin manteles, ` +
    `sin cuencos adicionales, sin ingredientes sueltos alrededor, sin ningún objeto fuera del bol.`
  );
}

function toFileName(dishName) {
  return dishName
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

async function generateOne(ai, dishName) {
  const prompt = buildPrompt(dishName);
  const stream = await ai.models.generateContentStream({
    model: MODEL,
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    config: {
      responseModalities: ["IMAGE", "TEXT"],
      httpOptions: { timeout: 60000, headers: {} },
    },
  });

  let imgPart = null;
  for await (const chunk of stream) {
    const parts = chunk?.candidates?.[0]?.content?.parts ?? [];
    for (const p of parts) {
      if (p.inlineData?.mimeType?.startsWith("image/")) imgPart = p;
    }
  }
  return imgPart;
}

async function main() {
  const ai = new GoogleGenAI({ apiKey: API_KEY });
  console.log(`Generando ${DISHES.length} fotos en ${OUT_DIR}\n`);

  for (let i = 0; i < DISHES.length; i++) {
    const dish = DISHES[i];
    console.log(`[${i + 1}/${DISHES.length}] ${dish}...`);
    try {
      const imgPart = await generateOne(ai, dish);
      if (!imgPart) {
        console.log(`  ⚠ Sin imagen para "${dish}"`);
        continue;
      }
      const ext = imgPart.inlineData.mimeType.includes("png") ? "png" : "jpg";
      const fileName = `${String(i + 1).padStart(2, "0")}_${toFileName(dish)}.${ext}`;
      const filePath = join(OUT_DIR, fileName);
      writeFileSync(filePath, Buffer.from(imgPart.inlineData.data, "base64"));
      console.log(`  ✓ ${fileName}`);
    } catch (err) {
      console.error(`  ✗ Error: ${err.message}`);
    }

    // Pequeña pausa entre peticiones para no saturar el rate limit
    if (i < DISHES.length - 1) await new Promise((r) => setTimeout(r, 2000));
  }

  console.log(`\nListo. Abre la carpeta: ${OUT_DIR}`);
}

main().catch(console.error);
