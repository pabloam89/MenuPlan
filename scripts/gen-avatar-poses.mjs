// Piloto: ¿puede Gemini poner a un avatar existente a HACER algo (sujetar una
// taza, remover una olla, apuntar en una libreta) sin cambiarle la cara, la
// ropa ni el estilo?
//
// Los avatares son PNG estáticos hechos con Midjourney. Con código solo se
// pueden mover enteros (entrar, saltar, respirar); en cuanto hay un objeto al
// lado, se ve pegado. Para que interactúe hace falta una pose nueva, y este
// script la pide a Gemini pasándole el avatar como referencia.
//
// Por cada avatar × acción:
//   1. aplana el PNG sobre blanco (el modelo entiende mejor "fondo blanco" si
//      ya lo ve así) y lo manda junto al prompt,
//   2. guarda la respuesta en bruto,
//   3. le quita el fondo con el mismo `recortar` de cutout-illustrations.mjs,
//   4. al final escribe revision.html: original y poses lado a lado, para
//      juzgar si es la misma persona y el mismo estilo.
//
// Uso:
//   node --env-file=.env.local scripts/gen-avatar-poses.mjs
//   node --env-file=.env.local scripts/gen-avatar-poses.mjs --avatars papa/papa_1,hijo/hijo_3 --poses olla
//   node --env-file=.env.local scripts/gen-avatar-poses.mjs --model gemini-3-pro-image
//
// Salida en scripts/avatar-poses/ (ignorada por git).

import { GoogleGenAI } from "@google/genai";
import sharp from "sharp";
import { writeFileSync, mkdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { recortar } from "./cutout-illustrations.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const OUT = join(__dirname, "avatar-poses");

const arg = (name) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : null;
};

const MODEL = arg("--model") || "gemini-2.5-flash-image";
const AVATARS = (arg("--avatars") || "papa/papa_1,mama/mama_2,hijo/hijo_3").split(",");

const POSES = {
  taza: "sitting relaxed and leaning back, holding a steaming coffee mug with both hands close to the chest, eyes half closed, content smile",
  olla: "standing at a small stove, stirring a pot with a wooden spoon held in one hand, looking down into the pot with a focused, happy expression",
  libreta: "standing, holding a small open notebook in one hand and writing in it with a pencil in the other, looking at the page, thoughtful",
};
const POSE_KEYS = (arg("--poses") || Object.keys(POSES).join(",")).split(",");

const GEMINI_KEY = process.env.GEMINI_AI_STUDIO_KEY;
if (!GEMINI_KEY) {
  console.error("❌  GEMINI_AI_STUDIO_KEY no encontrado");
  process.exit(1);
}
for (const k of POSE_KEYS) {
  if (!POSES[k]) {
    console.error(`❌  Pose desconocida: ${k}. Hay: ${Object.keys(POSES).join(", ")}`);
    process.exit(1);
  }
}

function buildPrompt(pose) {
  return [
    "This image is a 3D animated character. Create a new image of EXACTLY the same character:",
    "same face, same hairstyle and hair colour, same beard or glasses if any, same body proportions,",
    "same clothes with the same colours and details, same 3D render style, materials and soft lighting.",
    `New pose and action: ${pose}.`,
    "Any object the character uses must be physically held or touched by the hands, in the same 3D style.",
    "Full body visible from head to feet, centered, facing slightly towards the camera.",
    "Plain pure white seamless background, no floor line, no scenery, no text, only a soft contact shadow under the feet.",
  ].join(" ");
}

async function referencia(avatar) {
  const src = join(ROOT, "public", "avatares", `${avatar}.png`);
  if (!existsSync(src)) throw new Error(`No existe ${src}`);
  return sharp(src).flatten({ background: "#ffffff" }).png().toBuffer();
}

async function generar(ai, refPng, prompt) {
  const stream = await ai.models.generateContentStream({
    model: MODEL,
    contents: [
      {
        role: "user",
        parts: [
          { inlineData: { mimeType: "image/png", data: refPng.toString("base64") } },
          { text: prompt },
        ],
      },
    ],
    config: { responseModalities: ["IMAGE", "TEXT"], httpOptions: { timeout: 120000, headers: {} } },
  });
  let imgPart = null;
  for await (const chunk of stream) {
    for (const p of chunk?.candidates?.[0]?.content?.parts ?? []) {
      if (p.inlineData?.mimeType?.startsWith("image/")) imgPart = p;
    }
  }
  return imgPart;
}

mkdirSync(join(OUT, "bruto"), { recursive: true });
mkdirSync(join(OUT, "recorte"), { recursive: true });

const ai = new GoogleGenAI({ apiKey: GEMINI_KEY });
const filas = [];

for (const avatar of AVATARS) {
  const slug = avatar.replace("/", "_");
  const ref = await referencia(avatar);
  const fila = { avatar, original: `../../public/avatares/${avatar}.png`, poses: [] };
  for (const pose of POSE_KEYS) {
    const nombre = `${slug}__${pose}`;
    process.stdout.write(`🎨  ${nombre} … `);
    try {
      const img = await generar(ai, ref, buildPrompt(POSES[pose]));
      if (!img) {
        console.log("sin imagen");
        fila.poses.push({ pose, error: "sin imagen" });
        continue;
      }
      const bruto = join(OUT, "bruto", `${nombre}.png`);
      writeFileSync(bruto, await sharp(Buffer.from(img.inlineData.data, "base64")).png().toBuffer());
      const recorte = join(OUT, "recorte", `${nombre}.png`);
      await recortar(bruto, recorte);
      fila.poses.push({ pose, bruto: `bruto/${nombre}.png`, recorte: `recorte/${nombre}.png` });
      console.log("✓");
    } catch (err) {
      console.log(`✗ ${err.message}`);
      fila.poses.push({ pose, error: err.message });
    }
  }
  filas.push(fila);
}

// Hoja de revisión: original a la izquierda, poses recortadas sobre el color
// de las escenas de la app para ver también cómo queda el recorte.
const celda = (src, pie) =>
  `<figure><div class="f"><img src="${src}" alt=""></div><figcaption>${pie}</figcaption></figure>`;
const html = `<!doctype html><meta charset="utf-8"><title>Poses de avatar · ${MODEL}</title>
<style>
body{font-family:system-ui,sans-serif;background:#f4f8f5;color:#142f1d;margin:24px}
h1{font-size:20px}.row{display:flex;gap:12px;margin:0 0 24px;flex-wrap:wrap}
figure{margin:0;width:200px}.f{height:260px;background:#dcebe1;border-radius:14px;display:flex;align-items:flex-end;justify-content:center;overflow:hidden}
.f img{max-height:100%;max-width:100%}figcaption{font-size:13px;font-weight:700;margin-top:6px}
.err{color:#b3261e}
</style>
<h1>Modelo: ${MODEL}</h1>
${filas
  .map(
    (f) => `<div class="row">${celda(f.original, `${f.avatar} · original`)}${f.poses
      .map((p) => (p.error ? `<figure><div class="f"></div><figcaption class="err">${p.pose}: ${p.error}</figcaption></figure>` : celda(p.recorte, p.pose)))
      .join("")}</div>`,
  )
  .join("\n")}`;
writeFileSync(join(OUT, "revision.html"), html);

const hechas = filas.flatMap((f) => f.poses).filter((p) => !p.error).length;
const total = filas.length * POSE_KEYS.length;
console.log(`\n${hechas}/${total} poses generadas. Revisión: ${join(OUT, "revision.html")}`);
