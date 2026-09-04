/**
 * cutout-illustrations.mjs
 *
 * Convierte una ilustración de fondo blanco en un RECORTE con transparencia.
 *
 * ── Por qué hace falta ────────────────────────────────────────────────────
 * Las 479 de public/ingredients y las 30 de public/categories están generadas
 * con el prompt de la casa, que pide "clean white background" — y se guardaron
 * tal cual, sin alfa (PNG color type 3). Eso vale sobre fondo blanco y solo ahí.
 *
 * En cuanto la ilustración va dentro de un círculo de color (el panel del menú)
 * se ve el cuadrado blanco metido a la fuerza en vez de un objeto flotando. Es
 * exactamente la diferencia entre las de /categories/cut, que sí tienen alfa y
 * quedan bien, y el resto.
 *
 * ── Cómo se recorta ───────────────────────────────────────────────────────
 * Solo se vuelve transparente el blanco CONECTADO AL BORDE, nunca el que está
 * dentro de la figura. Es la diferencia entre quitar el fondo y agujerear el
 * dibujo: un gorro de chef, un huevo o un ajo son casi blancos, y un filtro por
 * color a secas se los come por dentro. Se hace con un relleno por inundación
 * desde los cuatro bordes.
 *
 * El borde resultante se suaviza un poco (los píxeles casi-blancos vecinos
 * quedan semitransparentes) para que no salga el dentado de recorte a tijera.
 *
 * Uso:
 *   node scripts/cutout-illustrations.mjs public/ingredients/patata.png
 *   node scripts/cutout-illustrations.mjs --dir public/ingredients --out public/categories/cut/base --only patata,quinoa
 */

import sharp from "sharp";
import { readdirSync, mkdirSync, existsSync } from "fs";
import { join, basename } from "path";

// Cuánto se puede alejar un píxel del color del fondo y seguir siendo fondo.
// 26 aguanta el degradado suave del render sin comerse la sombra proyectada,
// que es bastante más oscura.
const TOLERANCIA = 26;

export async function recortar(src, dest, { size = 0 } = {}) {
  const { data, info } = await sharp(src).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h, channels: c } = info;

  // El fondo NO es blanco: el prompt de la casa pide "clean white background"
  // pero MidJourney devuelve un crema (239,235,234 y parecidos), y un umbral
  // fijo sobre 236 no encontraba nada.
  //
  // La referencia se saca de la MEDIANA de muchos píxeles de los cuatro
  // bordes, no de la media de las cuatro esquinas. Con la media bastaba con
  // que una esquina cayera sobre la sombra proyectada —en la asiática valía
  // 183,177,164— para torcer el color de referencia y dejar medio fondo sin
  // quitar. La mediana se traga esa esquina sin despeinarse.
  const muestras = [[], [], []];
  const paso = Math.max(1, Math.floor(Math.min(w, h) / 64));
  for (let x = 0; x < w; x += paso) {
    for (const y of [0, h - 1]) {
      const i = (y * w + x) * c;
      for (let k = 0; k < 3; k++) muestras[k].push(data[i + k]);
    }
  }
  for (let y = 0; y < h; y += paso) {
    for (const x of [0, w - 1]) {
      const i = (y * w + x) * c;
      for (let k = 0; k < 3; k++) muestras[k].push(data[i + k]);
    }
  }
  const ref = muestras.map((m) => m.sort((a, b) => a - b)[Math.floor(m.length / 2)]);

  const esFondo = (i) =>
    Math.abs(data[i] - ref[0]) <= TOLERANCIA &&
    Math.abs(data[i + 1] - ref[1]) <= TOLERANCIA &&
    Math.abs(data[i + 2] - ref[2]) <= TOLERANCIA;

  const esClaro = esFondo;

  // Inundación desde los bordes. Iterativa y con pila propia: una recursiva se
  // come la pila con imágenes de 1024×1024.
  const fondo = new Uint8Array(w * h);
  const pila = [];
  for (let x = 0; x < w; x++) { pila.push(x, x + (h - 1) * w); }
  for (let y = 0; y < h; y++) { pila.push(y * w, w - 1 + y * w); }

  while (pila.length) {
    const p = pila.pop();
    if (fondo[p]) continue;
    if (!esClaro(p * c)) continue;
    fondo[p] = 1;
    const x = p % w, y = (p / w) | 0;
    if (x > 0) pila.push(p - 1);
    if (x < w - 1) pila.push(p + 1);
    if (y > 0) pila.push(p - w);
    if (y < h - 1) pila.push(p + w);
  }

  // Alfa: fuera el fondo, y un borde suave de un píxel para que no quede
  // dentado. Un recorte a tijera canta tanto como el cuadrado blanco.
  let opacos = 0;
  for (let p = 0; p < w * h; p++) {
    if (fondo[p]) { data[p * c + 3] = 0; continue; }
    opacos++;
    const x = p % w, y = (p / w) | 0;
    let vecinosFondo = 0;
    if (x > 0 && fondo[p - 1]) vecinosFondo++;
    if (x < w - 1 && fondo[p + 1]) vecinosFondo++;
    if (y > 0 && fondo[p - w]) vecinosFondo++;
    if (y < h - 1 && fondo[p + w]) vecinosFondo++;
    if (vecinosFondo) data[p * c + 3] = 255 - vecinosFondo * 45;
  }

  const pct = Math.round((1 - opacos / (w * h)) * 100);
  const buf = await sharp(data, { raw: { width: w, height: h, channels: c } })
    .png()
    .toBuffer();
  // Sin `size`, se respeta el tamaño natural: las de ingredients son 200×200 y
  // reescalarlas a 256 sería inventar píxeles que no existen.
  const recorte = sharp(buf).trim({ threshold: 1 });
  const salida = await (size
    ? recorte.resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    : recorte
  ).png({ compressionLevel: 9 }).toBuffer();

  await sharp(salida).toFile(dest);
  return { pct, bytes: salida.length };
}

// ── CLI ────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
if (args.length && !args[0].startsWith("--")) {
  const src = args[0];
  const dest = args[1] ?? src.replace(/\.png$/, ".cut.png");
  const r = await recortar(src, dest);
  console.log(`${basename(src)} → ${dest}  ·  fondo quitado ${r.pct}%  ·  ${(r.bytes / 1024).toFixed(0)} KB`);
} else if (args.includes("--dir")) {
  const dir = args[args.indexOf("--dir") + 1];
  const out = args[args.indexOf("--out") + 1];
  const only = args.includes("--only") ? new Set(args[args.indexOf("--only") + 1].split(",")) : null;
  mkdirSync(out, { recursive: true });
  const files = readdirSync(dir).filter((f) => f.endsWith(".png"))
    .filter((f) => !only || only.has(f.replace(/\.png$/, "")));
  for (const f of files) {
    const r = await recortar(join(dir, f), join(out, f));
    console.log(`  ${f.padEnd(24)} fondo ${String(r.pct).padStart(3)}%  ${(r.bytes / 1024).toFixed(0)} KB`);
  }
  console.log(`\n${files.length} recortadas en ${out}`);
}
