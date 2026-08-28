// Las ilustraciones de faceta (public/categories/faceta_*.png) se copiaron
// tal cual salieron de Midjourney: 1024x1024 y ~1MB cada una. Se pintan en
// una tesela de ~120px, así que 400px sobra incluso en pantallas retina, y
// bajar de ~4MB a ~150KB en total se nota en móvil.
//
// Idempotente: el criterio es el ANCHO, no el peso — una ya reducida a 400px
// se salta, así que reejecutarlo no la recomprime (recomprimir un PNG ya
// procesado solo degrada). Se puede volver a lanzar al añadir una faceta.
//
// Uso:  node scripts/optimize-facet-tiles.mjs
import { Jimp } from "jimp";
import { readdir, stat } from "node:fs/promises";
import path from "node:path";

const DIR = path.resolve("public/categories");
const WIDTH = 400;

const files = (await readdir(DIR)).filter((f) => f.startsWith("faceta_") && f.endsWith(".png"));
if (files.length === 0) {
  console.log("No hay faceta_*.png en public/categories/");
  process.exit(0);
}

let touched = 0;
for (const file of files.sort()) {
  const full = path.join(DIR, file);
  const before = (await stat(full)).size;
  const img = await Jimp.read(full);
  if (img.width <= WIDTH) {
    console.log(`  ${file.padEnd(26)} ya optimizada (${img.width}px, ${(before / 1024).toFixed(0)} KB)`);
    continue;
  }
  img.resize({ w: WIDTH });
  await img.write(full);
  const after = (await stat(full)).size;
  console.log(
    `✅ ${file.padEnd(26)} ${(before / 1024).toFixed(0).padStart(5)} KB → ${(after / 1024).toFixed(0)} KB`,
  );
  touched++;
}
console.log(`\n${touched} optimizada(s), ${files.length - touched} ya lo estaban.`);
