/**
 * Regenerates ALL dish photos in the catalog with the new luminous marble prompt.
 * - Skips already-generated files (safe to resume if interrupted).
 * - Retries on rate-limit errors with exponential backoff.
 * - Baby dishes keep their own prompt style.
 *
 * Run:   node scripts/gen-all-photos.mjs
 * Output: scripts/test-photos/  (named by combo_id)
 */

import { GoogleGenAI } from "@google/genai";
import { writeFileSync, mkdirSync, existsSync, readFileSync, readdirSync, openSync, closeSync, unlinkSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { disambiguationClause } from "../src/lib/photoDisambiguation.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, "test-photos");
mkdirSync(OUT_DIR, { recursive: true });

// ─── Bloqueo de instancia única (lockfile) ───────────────────────────────────
// Impide que se lancen dos instancias en paralelo y se dupliquen costes API.
const LOCK_FILE = join(OUT_DIR, "_gen.lock");
if (existsSync(LOCK_FILE)) {
  const lockAge = Date.now() - Number(readFileSync(LOCK_FILE, "utf-8").trim() || 0);
  if (lockAge < 30 * 60 * 1000) { // lockfile de menos de 30 min → otra instancia activa
    console.error(
      `\n🔒 YA HAY UNA INSTANCIA EN EJECUCIÓN (lockfile de hace ${Math.round(lockAge / 60000)} min).\n` +
      `   Si estás seguro de que no hay ninguna corriendo, borra:\n` +
      `   ${LOCK_FILE}\n` +
      `   y vuelve a ejecutar el script.`
    );
    process.exit(1);
  }
}
// Escribe el lockfile con el timestamp actual
writeFileSync(LOCK_FILE, String(Date.now()));
// Elimina el lockfile al salir (normal o por señal)
const releaseLock = () => { try { unlinkSync(LOCK_FILE); } catch {} };
process.on("exit", releaseLock);
process.on("SIGINT", () => { releaseLock(); process.exit(130); });
process.on("SIGTERM", () => { releaseLock(); process.exit(143); });

const API_KEY = process.env.GEMINI_AI_STUDIO_KEY;
if (!API_KEY) {
  console.error("Falta GEMINI_AI_STUDIO_KEY. Exportala antes de ejecutar este script.");
  process.exit(1);
}
const MODEL = "gemini-2.5-flash-image";

// ─── Nombre del plato ───────────────────────────────────────────────────────
// El nombre se deriva de src/data/recipes/*.json, NO del catalog.json que se
// itera. catalog.json es un fichero generado a partir del manifiesto de fotos:
// se quedó dos semanas sin reconstruir y, como al limpiar guarniciones se
// reutilizaron ids (guarniciones_022 pasó de "pepino con yogur" a "patatas
// fritas"), la tanda entera se generó pidiendo platos que ya no eran ésos y
// guardándolos bajo el combo_id nuevo. 281 fotos acabaron siendo de otro plato.
// Leyendo la fuente de verdad, el nombre no puede ir por detrás del id.

function loadRecipes(root) {
  const dir = join(root, "src", "data", "recipes");
  const byId = {};
  for (const file of readdirSync(dir)) {
    if (!file.endsWith(".json")) continue;
    for (const r of JSON.parse(readFileSync(join(dir, file), "utf-8"))) {
      if (r?.id) byId[r.id] = r;
    }
  }
  return byId;
}

/** "<plato> con <guarnición>", igual que menuName en build-catalog.mjs. */
function resolveName(comboId, recipeById, fallback) {
  const [dishId, garnishId] = comboId.split("+");
  const dish = recipeById[dishId];
  if (!dish) return fallback;
  if (!garnishId) return dish.name;
  const garnish = recipeById[garnishId];
  if (!garnish) return fallback;
  return `${dish.name} con ${garnish.shortName ?? garnish.name}`;
}

// ─── Prompts ────────────────────────────────────────────────────────────────

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

function buildBabyPureePrompt(dishName) {
  return (
    `Fotografía cenital de una papilla de bebé de "${dishName}". ` +
    `TODO el contenido del bol es UNA SOLA masa triturada, lisa, cremosa y completamente homogénea, ` +
    `de un único color uniforme resultante de mezclar y batir juntos TODOS los ingredientes. ` +
    `PROHIBIDO ABSOLUTAMENTE: ningún filete ni trozo de pescado o carne reconocible, ninguna pieza de ` +
    `verdura entera o en dados, ningún grano de arroz, pasta o legumbre suelto, nada crujiente ni tostado. ` +
    `Superficie totalmente lisa y mate, como un puré de bebé recién batido. ` +
    `Servido en un bol de cerámica artesanal de color blanco roto con borde irregular, ` +
    `perfectamente centrado sobre una superficie de mármol blanco cálido con vetas grises suaves que llena todo el encuadre. ` +
    `Iluminación lateral dorada y cálida, estética de revista gastronómica de alta gama, hiperrealista. ` +
    `SOLO el bol con la papilla en el encuadre: sin cubiertos, sin servilletas, sin manteles. ` +
    `SIN TEXTO, SIN LETRAS, SIN PALABRAS, SIN NÚMEROS en la imagen — imagen pura sin ninguna superposición gráfica.`
  );
}

// ─── API ────────────────────────────────────────────────────────────────────

// Los 429 de Gemini suelen ser cortes pasajeros, no la cuota diaria, así que la
// espera se corta a 90s: doblar hasta 480s gastaba un cuarto de hora en una sola
// foto. Mejor reintentar más veces y más seguido.
const MAX_BACKOFF_MS = 90_000;

async function generateImage(ai, prompt, retries = 8) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const stream = await ai.models.generateContentStream({
        model: MODEL,
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        config: {
          responseModalities: ["IMAGE", "TEXT"],
          httpOptions: { timeout: 90000, headers: {} },
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
    } catch (err) {
      const isRateLimit =
        err?.message?.includes("429") ||
        err?.message?.toLowerCase().includes("quota") ||
        err?.message?.toLowerCase().includes("rate") ||
        err?.message?.toLowerCase().includes("resource_exhausted");
      if (isRateLimit && attempt < retries) {
        // 30s, 60s, y a partir de ahí 90s
        const wait = Math.min(Math.pow(2, attempt + 1) * 15000, MAX_BACKOFF_MS);
        console.log(`\n    ↻ Rate limit (intento ${attempt + 1}/${retries}), esperando ${wait / 1000}s...`);
        await new Promise((r) => setTimeout(r, wait));
      } else {
        throw err;
      }
    }
  }
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  const onlyQueued = process.argv.includes("--only-queued");
  const pendingPath = join(__dirname, "../output/pending-photos.json");
  const catalogPath = join(__dirname, "../dish-gallery/public/catalog.json");
  if (onlyQueued && !existsSync(pendingPath)) {
    console.error(`❌  Falta ${pendingPath}. Ejecuta primero: node scripts/queue-missing-photos.mjs`);
    process.exit(1);
  }
  const catalog = onlyQueued
    ? JSON.parse(readFileSync(pendingPath, "utf-8"))
    : JSON.parse(readFileSync(catalogPath, "utf-8"));
  if (onlyQueued) {
    console.log(`Modo --only-queued: ${catalog.length} fotos en cola (sin recorrer todo el catálogo)\n`);
  }
  const recipeById = loadRecipes(join(__dirname, ".."));

  const stale = catalog.filter(
    (e) => resolveName(e.combo_id, recipeById, e.name) !== e.name,
  );
  if (stale.length) {
    console.log(
      `⚠️  ${stale.length} nombres del catálogo van por detrás de las recetas — se usa el de las recetas.\n` +
        stale.slice(0, 5).map((e) => `     ${e.combo_id}: "${e.name}" → "${resolveName(e.combo_id, recipeById, e.name)}"`).join("\n") +
        (stale.length > 5 ? `\n     …y ${stale.length - 5} más` : "") +
        "\n",
    );
  }

  const ai = new GoogleGenAI({ apiKey: API_KEY });

  let done = 0, skipped = 0, failed = 0;
  const errors = [];

  console.log(`Catálogo: ${catalog.length} platos → carpeta: ${OUT_DIR}\n`);

  // Warm-up pause: let any previous session's RPM window expire before starting.
  // Emits progress every 5s so the shell stays alive during the wait.
  const firstPending = catalog.findIndex(({ combo_id }) => {
    const jpg = join(OUT_DIR, `${combo_id}.jpg`);
    const png = join(OUT_DIR, `${combo_id}.png`);
    return !existsSync(jpg) && !existsSync(png);
  });
  if (firstPending > 0) {
    const WARMUP_S = 65;
    process.stdout.write(`  ⏳ Warm-up RPM: `);
    for (let w = 0; w < WARMUP_S; w += 5) {
      process.stdout.write(`${w}s `);
      await new Promise((r) => setTimeout(r, 5000));
    }
    console.log("✓\n");
  }

  for (let i = 0; i < catalog.length; i++) {
    const entry = catalog[i];
    const { combo_id, family } = entry;
    const name = resolveName(combo_id, recipeById, entry.name);

    // Destino: combo_id.jpg (o .png si la IA devuelve PNG)
    const jpgPath = join(OUT_DIR, `${combo_id}.jpg`);
    const pngPath = join(OUT_DIR, `${combo_id}.png`);

    if (existsSync(jpgPath) || existsSync(pngPath)) {
      skipped++;
      if (skipped % 50 === 0)
        console.log(`  (${skipped} ya existían, saltando...)`);
      continue;
    }

    const prefix = `[${i + 1}/${catalog.length}]`;
    process.stdout.write(`${prefix} ${name}... `);

    const prompt =
      family === "bebes"
        ? buildBabyPureePrompt(name)
        : buildPrompt(name);

    try {
      const imgPart = await generateImage(ai, prompt);
      if (!imgPart) {
        console.log("⚠ sin imagen");
        failed++;
        errors.push({ combo_id, name, reason: "no image returned" });
      } else {
        const ext = imgPart.inlineData.mimeType.includes("png") ? "png" : "jpg";
        const filePath = join(OUT_DIR, `${combo_id}.${ext}`);
        writeFileSync(filePath, Buffer.from(imgPart.inlineData.data, "base64"));
        console.log("✓");
        done++;
      }
    } catch (err) {
      console.log(`✗ ${err.message?.slice(0, 80)}`);
      failed++;
      errors.push({ combo_id, name, reason: err.message });
    }

    // Pausa entre peticiones (10s → 6 req/min, bien bajo el límite de 10 RPM de Gemini)
    if (i < catalog.length - 1) await new Promise((r) => setTimeout(r, 10000));
  }

  console.log(`\n──────────────────────────────`);
  console.log(`✓ Generadas: ${done}`);
  console.log(`→ Ya existían: ${skipped}`);
  console.log(`✗ Errores: ${failed}`);
  if (errors.length) {
    const errPath = join(OUT_DIR, "_errores.json");
    writeFileSync(errPath, JSON.stringify(errors, null, 2));
    console.log(`  Detalle de errores: ${errPath}`);
  }
  console.log(`\nListo. Carpeta: ${OUT_DIR}`);
}

main().catch(console.error);
