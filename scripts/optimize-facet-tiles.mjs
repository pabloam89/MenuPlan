// Las ilustraciones de faceta (public/categories/faceta_*) se copiaron tal
// cual salieron de Midjourney: 1024x1024 y ~1MB cada una. Se pintan en una
// tesela de ~120px, así que 400px sobra incluso en pantallas retina.
//
// WebP, no PNG: para este tipo de ilustración con degradados, un PNG normal
// (o incluso con paleta) se queda en 50-190 KB a 400px — WebP baja eso a
// 7-13 KB, ~15x menos. (Ver commit que corrigió esto: la primera pasada del
// script achicaba el ancho a 400px con Jimp pero escribía PNG sin paleta ni
// más compresión, así que "ya optimizada" según el ancho seguía pesando
// ~165 KB por imagen — el criterio de idempotencia no vigilaba el peso.)
//
// Idempotente: se salta cualquier faceta_*.webp que ya exista. Si aparece un
// faceta_*.png suelto (alguien lo copió a mano), lo convierte y borra el PNG.
//
// Uso:  node scripts/optimize-facet-tiles.mjs
import sharp from "sharp";
import { readdir, stat, unlink } from "node:fs/promises";
import path from "node:path";

const DIR = path.resolve("public/categories");
const WIDTH = 400;
const QUALITY = 82;

const files = await readdir(DIR);
const pngs = files.filter((f) => f.startsWith("faceta_") && f.endsWith(".png"));
const existingWebp = new Set(files.filter((f) => f.startsWith("faceta_") && f.endsWith(".webp")));

if (pngs.length === 0) {
  console.log("No hay faceta_*.png sueltos en public/categories/ — nada que convertir.");
  process.exit(0);
}

let touched = 0;
for (const file of pngs.sort()) {
  const webpName = file.replace(/\.png$/, ".webp");
  if (existingWebp.has(webpName)) {
    console.log(`  ${file.padEnd(26)} ya existe ${webpName}, se borra el PNG suelto`);
    await unlink(path.join(DIR, file));
    continue;
  }
  const inputPath = path.join(DIR, file);
  const before = (await stat(inputPath)).size;
  const outBuffer = await sharp(inputPath).resize({ width: WIDTH, withoutEnlargement: true }).webp({ quality: QUALITY }).toBuffer();
  const outPath = path.join(DIR, webpName);
  await sharp(outBuffer).toFile(outPath);
  await unlink(inputPath);
  console.log(
    `✅ ${file.padEnd(26)} ${(before / 1024).toFixed(0).padStart(5)} KB → ${webpName} ${(outBuffer.length / 1024).toFixed(0)} KB`,
  );
  touched++;
}
console.log(`\n${touched} convertida(s) a WebP.`);
console.log("Recuerda actualizar las referencias .png -> .webp en CatalogBrowserSheet.jsx (FACET_META).");
