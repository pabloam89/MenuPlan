/**
 * Quick 10-dish test of the updated prompt. Output: scripts/prompt-test/
 * Run: node scripts/gen-prompt-test.mjs
 */
import { GoogleGenAI } from "@google/genai";
import { writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, "prompt-test");
mkdirSync(OUT_DIR, { recursive: true });

const API_KEY = process.env.GEMINI_AI_STUDIO_KEY;
if (!API_KEY) {
  console.error("Falta GEMINI_AI_STUDIO_KEY. Exportala antes de ejecutar este script.");
  process.exit(1);
}
const MODEL = "gemini-2.5-flash-image";

const DISHES = [
  "pollo al horno con patatas",
  "merluza en salsa verde con patatas cocidas",
  "espaguetis a la boloñesa",
  "lentejas con chorizo",
  "pechugas de pollo a la plancha con patatas fritas",
  "paella valenciana",
  "albóndigas en salsa de tomate con arroz blanco",
  "gazpacho andaluz",
  "garbanzos con espinacas",
  "puré de calabacín con pollo y cuscús",
];

function buildPrompt(dishName) {
  return (
    `Fotografía gastronómica cenital a exactamente 90 grados (vista de pájaro perfecta) de ${dishName}. ` +
    `Servido en un bol de cerámica artesanal de color blanco roto con borde irregular, ` +
    `perfectamente centrado sobre una superficie de mármol blanco cálido con vetas grises suaves que llena todo el encuadre. ` +
    `Iluminación lateral dorada y cálida con destello suave que crea brillos tentadores sobre la comida, ` +
    `resaltando jugosidad, vapor delicado y texturas irresistibles. ` +
    `Colores vivos, ricos y muy saturados; salsas brillantes y espesas; ingredientes jugosos y apetitosos; ` +
    `un hilo fino de aceite de oliva virgen extra añadido en el último momento; hierbas frescas vibrantes como detalle final. ` +
    `Estética de portada de revista gastronómica de lujo, hiperrealista, fotografía que se te hace la boca agua, calidad editorial Bon Appétit. ` +
    disambiguationClause(dishName) +
    `SOLO el bol con la comida en el encuadre: sin cubiertos, sin servilletas, sin manteles, ` +
    `sin cuencos adicionales, sin ingredientes sueltos alrededor, sin ningún objeto fuera del bol. ` +
    `SIN TEXTO, SIN LETRAS, SIN PALABRAS, SIN NÚMEROS en la imagen — imagen pura sin ninguna superposición gráfica.`
  );
}

function disambiguationClause(dishName) {
  const d = String(dishName).toLowerCase();
  const clauses = [];
  const hasTomate = /\btomate\b/.test(d);
  const isSalad = /ensalada|gazpacho|tomate fresco|tomate natural/.test(d);
  const isStarch = /arroz|pasta|macarrones|espagueti|fideos|ñoquis|noquis/.test(d);
  if (hasTomate && isStarch && !isSalad) {
    clauses.push(
      `El tomate es salsa de tomate frito COCINADA, roja y brillante, en cantidad MODERADA ` +
        `sobre arroz blanco suelto: se ven claramente los granos de arroz alrededor y por debajo, ` +
        `la salsa NO cubre todo el bol; presentación casera, ligera y apetitosa. NO tomate crudo. `
    );
  }
  if (/patatas fritas/.test(d)) {
    clauses.push(
      `Las patatas fritas son OBLIGATORIAS y bien visibles: bastones alargados de patata ` +
        `fritos, dorados y crujientes, tipo patatas fritas caseras clásicas, apiladas junto al ` +
        `plato principal ocupando buena parte del bol. NADA de salsa de yogur, NADA de pepino, ` +
        `NADA de crema blanca ni tzatziki. `
    );
  }
  return clauses.join("");
}

async function main() {
  const ai = new GoogleGenAI({ apiKey: API_KEY });
  console.log(`Probando prompt con ${DISHES.length} platos → ${OUT_DIR}\n`);

  for (let i = 0; i < DISHES.length; i++) {
    const dish = DISHES[i];
    process.stdout.write(`[${i + 1}/${DISHES.length}] ${dish}... `);
    try {
      const stream = await ai.models.generateContentStream({
        model: MODEL,
        contents: [{ role: "user", parts: [{ text: buildPrompt(dish) }] }],
        config: { responseModalities: ["IMAGE", "TEXT"], httpOptions: { timeout: 90000, headers: {} } },
      });
      let imgPart = null;
      for await (const chunk of stream) {
        for (const p of chunk?.candidates?.[0]?.content?.parts ?? []) {
          if (p.inlineData?.mimeType?.startsWith("image/")) imgPart = p;
        }
      }
      if (!imgPart) { console.log("⚠ sin imagen"); continue; }
      const ext = imgPart.inlineData.mimeType.includes("png") ? "png" : "jpg";
      const name = `${String(i + 1).padStart(2, "0")}_${dish.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "_")}.${ext}`;
      writeFileSync(join(OUT_DIR, name), Buffer.from(imgPart.inlineData.data, "base64"));
      console.log(`✓ ${name}`);
    } catch (err) {
      console.log(`✗ ${err.message?.slice(0, 80)}`);
    }
    if (i < DISHES.length - 1) await new Promise((r) => setTimeout(r, 2500));
  }
  console.log(`\nListo. Abre: ${OUT_DIR}`);
}

main().catch(console.error);
