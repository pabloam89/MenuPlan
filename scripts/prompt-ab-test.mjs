// A/B test for the dish-photo prompt: current (name-only) vs ingredient-grounded.
//
// Usage:
//   node --env-file=.env.local scripts/prompt-ab-test.mjs
//
// Generates both variants for a handful of combos into scripts/prompt-test/ so
// they can be compared side by side before committing to a full regeneration.
// Deliberately writes OUTSIDE scripts/test-photos so gen-all-photos.mjs doesn't
// treat these as already-generated and skip the real run.

import { GoogleGenAI } from "@google/genai";
import { writeFileSync, mkdirSync, readFileSync, readdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const OUT_DIR = join(__dirname, "prompt-test");
mkdirSync(OUT_DIR, { recursive: true });

const API_KEY = process.env.GEMINI_AI_STUDIO_KEY;
if (!API_KEY) {
  console.error("Falta GEMINI_AI_STUDIO_KEY");
  process.exit(1);
}
const MODEL = "gemini-2.5-flash-image";

const CASES = [
  "carnes_024+guarniciones_022",   // Pavo a la plancha con patatas fritas
  "carnes_026+guarniciones_013",   // Albóndigas de pollo con calabacín a la plancha
  "huevos_001",                    // Tortilla de patatas
  "ensaladas_verduras_021",        // Ensalada griega
];

// ─── Catálogo ───────────────────────────────────────────────────────────────

const recipeById = {};
for (const file of readdirSync(join(ROOT, "src/data/recipes"))) {
  if (!file.endsWith(".json")) continue;
  for (const r of JSON.parse(readFileSync(join(ROOT, "src/data/recipes", file), "utf8"))) {
    if (r?.id) recipeById[r.id] = r;
  }
}
const catalog = JSON.parse(readFileSync(join(ROOT, "dish-gallery/public/catalog.json"), "utf8"));
const catalogById = Object.fromEntries(catalog.map((c) => [c.combo_id, c]));

/** Visible ingredients: skip seasoning/fat that never reads in a photo. */
const INVISIBLE = /^(sal|pimienta|aceite|agua|vinagre|azúcar|levadura|especias?|comino|orégano|perejil seco|laurel)$/i;
function visibleIngredients(recipeId) {
  const r = recipeById[recipeId];
  if (!Array.isArray(r?.ingredients)) return [];
  return r.ingredients
    .map((i) => (typeof i === "string" ? i : i?.name))
    .filter((n) => n && !INVISIBLE.test(String(n).trim()))
    .slice(0, 7);
}

// ─── Prompt A: el actual (solo nombre) ──────────────────────────────────────

function promptActual(dishName) {
  return (
    `Fotografía gastronómica cenital a exactamente 90 grados (vista de pájaro perfecta) de ${dishName}. ` +
    `Servido en un bol de cerámica artesanal de color blanco roto con borde irregular, ` +
    `perfectamente centrado sobre una superficie de mármol blanco cálido con vetas grises suaves que llena todo el encuadre. ` +
    `Iluminación lateral dorada y cálida con destello suave que crea brillos tentadores sobre la comida, ` +
    `resaltando jugosidad, vapor delicado y texturas irresistibles. ` +
    `Colores vivos, ricos y muy saturados; salsas brillantes y espesas; ingredientes jugosos y apetitosos; ` +
    `un hilo fino de aceite de oliva virgen extra añadido en el último momento; hierbas frescas vibrantes como detalle final. ` +
    `Estética de portada de revista gastronómica de lujo, hiperrealista, fotografía que se te hace la boca agua, calidad editorial Bon Appétit. ` +
    `SOLO el bol con la comida en el encuadre: sin cubiertos, sin servilletas, sin manteles, ` +
    `sin cuencos adicionales, sin ingredientes sueltos alrededor, sin ningún objeto fuera del bol. ` +
    `SIN TEXTO, SIN LETRAS, SIN PALABRAS, SIN NÚMEROS en la imagen — imagen pura sin ninguna superposición gráfica.`
  );
}

// ─── Prompt B: anclado a ingredientes + guarnición obligatoria ──────────────

function promptGrounded(comboId) {
  const [dishId, garnishId] = comboId.split("+");
  const dish = recipeById[dishId];
  const garnish = garnishId ? recipeById[garnishId] : null;
  const dishName = dish?.name ?? dishId;

  const dishIngs = visibleIngredients(dishId);
  const garnishIngs = garnishId ? visibleIngredients(garnishId) : [];

  let composition = `El plato es ${dishName}`;
  if (dishIngs.length) composition += `, elaborado con: ${dishIngs.join(", ")}`;
  composition += `. Todos esos ingredientes deben ser RECONOCIBLES en la imagen. `;

  if (garnish) {
    const gName = garnish.shortName ?? garnish.name;
    composition +=
      `OBLIGATORIO: junto al plato principal, y claramente visible ocupando aproximadamente un tercio del bol, ` +
      `va la guarnición "${gName}"`;
    if (garnishIngs.length) composition += ` (${garnishIngs.join(", ")})`;
    composition +=
      `. La guarnición NO puede faltar ni quedar tapada: se ve como un elemento separado y distinguible ` +
      `del plato principal. NO sustituyas la guarnición por otra cosa. `;
  }

  return (
    `Fotografía gastronómica cenital a exactamente 90 grados (vista de pájaro perfecta) de comida española casera. ` +
    composition +
    `Servido en un bol de cerámica artesanal de color blanco roto con borde irregular, ` +
    `perfectamente centrado sobre una superficie de mármol blanco cálido con vetas grises suaves que llena todo el encuadre. ` +
    `Iluminación lateral dorada y cálida con destello suave que crea brillos tentadores sobre la comida. ` +
    `Colores vivos y saturados; ingredientes jugosos y apetitosos; hierbas frescas como detalle final. ` +
    `Estética de portada de revista gastronómica de lujo, hiperrealista, calidad editorial Bon Appétit. ` +
    `NO inventes ingredientes que no estén en la lista. NO añadas salsas ni acompañamientos no mencionados. ` +
    `SOLO el bol con la comida en el encuadre: sin cubiertos, sin servilletas, sin manteles, sin objetos alrededor. ` +
    `SIN TEXTO, SIN LETRAS, SIN PALABRAS, SIN NÚMEROS en la imagen.`
  );
}

// ─── API ────────────────────────────────────────────────────────────────────

async function generate(ai, prompt) {
  const stream = await ai.models.generateContentStream({
    model: MODEL,
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    config: { responseModalities: ["IMAGE", "TEXT"], httpOptions: { timeout: 90000, headers: {} } },
  });
  let imgPart = null;
  for await (const chunk of stream) {
    for (const p of chunk?.candidates?.[0]?.content?.parts ?? []) {
      if (p.inlineData?.mimeType?.startsWith("image/")) imgPart = p;
    }
  }
  return imgPart;
}

const ai = new GoogleGenAI({ apiKey: API_KEY });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

for (const comboId of CASES) {
  const name = catalogById[comboId]?.name ?? comboId;
  for (const [variant, prompt] of [
    ["A-actual", promptActual(name)],
    ["B-ingredientes", promptGrounded(comboId)],
  ]) {
    process.stdout.write(`${variant.padEnd(15)} ${name}... `);
    try {
      const img = await generate(ai, prompt);
      if (!img) {
        console.log("sin imagen");
      } else {
        const ext = img.inlineData.mimeType.includes("png") ? "png" : "jpg";
        const safe = comboId.replace(/\+/g, "_MAS_");
        writeFileSync(join(OUT_DIR, `${safe}__${variant}.${ext}`), Buffer.from(img.inlineData.data, "base64"));
        console.log("ok");
      }
    } catch (err) {
      console.log(`error: ${err.message?.slice(0, 80)}`);
    }
    await sleep(10000);
  }
}

console.log(`\nListo → ${OUT_DIR}`);
