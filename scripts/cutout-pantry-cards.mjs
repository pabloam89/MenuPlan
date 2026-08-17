// Las 3 cards de ubicación de "En casa" (nevera / despensa / congelador) vienen
// del generador con su propio fondo melocotón y su sombra, así que el tinte de
// color por ubicación que pinta PantryLocationCards quedaba tapado. Esto las
// pasa a PNG con transparencia: se modela el fondo, se recorta al objeto y se
// reescala a la banda de tamaño del resto de la carpeta.
//
// Un flood fill por tolerancia local NO sirve aquí: el fondo es un degradado y
// los propios electrodomésticos también, así que el relleno entra por el borde
// antialiaseado y se come la ilustración entera (probado). En su lugar se ajusta
// por mínimos cuadrados un polinomio cuadrático en (x,y) por canal usando solo
// la banda de píxeles del borde — que es fondo puro — y se marca como fondo lo
// que encaja con ese modelo. La sombra se acepta como fondo multiplicativo
// (pixel ≈ k · modelo, k < 1), que es justo lo que es una sombra suave.
//
// La conectividad final desde el borde evita agujeros: las zonas crema del
// interior de la nevera se parecen al melocotón, pero están encerradas por el
// cuerpo del mueble y por tanto nunca conectan con el fondo.
//
// Idempotente: un archivo que ya tiene transparencia se salta.
//
//   node scripts/cutout-pantry-cards.mjs [--preview]
import { Jimp, ResizeStrategy } from "jimp";
import { stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const DIR = path.resolve("public/avatares/cards");
const CARDS = [
  { name: "nevera", tint: 0xddf4e8ff },
  { name: "despensa", tint: 0xfaefd0ff },
  { name: "congelador", tint: 0xdce9f8ff },
];
const WIDTH = 320;
const BORDER_BAND = 8;
// Distancia Chebyshev (máx. diferencia por canal) contra el modelo de fondo.
const TOL = 16;
// Sombra y brillo del fondo son el MISMO color multiplicado por un escalar, así
// que se detectan por dirección en RGB (ángulo pequeño) y no por distancia: la
// sombra bajo el mueble cae a k≈0.4 y el foco cálido del congelador sube de 1,
// y ninguno de los dos entraba con un test de distancia.
//
// El umbral se parte en dos porque el blanco está a solo ~5.7° del melocotón:
// con un ángulo único lo bastante ancho para la sombra, las caras crema y las
// sonrisas de los muebles se volvían transparentes. La rama oscura (k<1) puede
// permitirse más ángulo justamente porque el blanco y el crema son más claros
// que el fondo, no más oscuros.
const ANGLE_DARK_DEG = 5;
const ANGLE_BRIGHT_DEG = 3;
const K_LO = 0.12;
const K_DARK_HI = 0.95;
const K_HI = 1.4;
// Motas sueltas del recorte: al ser el bbox lo que manda en el crop, una mota
// perdida en una esquina deja la ilustración pequeña y descentrada.
const MIN_SPECK_RATIO = 0.0005;
const MARGIN = 2;

function hasTransparency(data) {
  let transparent = 0;
  for (let i = 3; i < data.length; i += 4) if (data[i] < 8) transparent += 1;
  return transparent / (data.length / 4) > 0.02;
}

function basis(u, v) {
  return [1, u, v, u * u, u * v, v * v];
}

function solve(matrix, rhs) {
  const n = rhs.length;
  const a = matrix.map((row, i) => [...row, rhs[i]]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(a[r][col]) > Math.abs(a[pivot][col])) pivot = r;
    }
    [a[col], a[pivot]] = [a[pivot], a[col]];
    const d = a[col][col];
    if (Math.abs(d) < 1e-12) return null;
    for (let c = col; c <= n; c++) a[col][c] /= d;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = a[r][col];
      if (!f) continue;
      for (let c = col; c <= n; c++) a[r][c] -= f * a[col][c];
    }
  }
  return a.map((row) => row[n]);
}

// Ajusta, por canal, el degradado del fondo a partir de la banda del borde.
function fitBackground(data, w, h) {
  const n = 6;
  const ata = Array.from({ length: n }, () => new Float64Array(n));
  const atb = [new Float64Array(n), new Float64Array(n), new Float64Array(n)];

  const addSample = (x, y) => {
    const p = (y * w + x) * 4;
    const f = basis(x / (w - 1), y / (h - 1));
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) ata[i][j] += f[i] * f[j];
      for (let c = 0; c < 3; c++) atb[c][i] += f[i] * data[p + c];
    }
  };
  for (let y = 0; y < h; y++) {
    const edgeRow = y < BORDER_BAND || y >= h - BORDER_BAND;
    for (let x = 0; x < w; x++) {
      if (edgeRow || x < BORDER_BAND || x >= w - BORDER_BAND) addSample(x, y);
    }
  }

  const coef = atb.map((b) => solve(ata, Array.from(b)));
  return coef.some((c) => c === null) ? null : coef;
}

function modelAt(coef, u, v) {
  const f = basis(u, v);
  return coef.map((c) => {
    let sum = 0;
    for (let i = 0; i < f.length; i++) sum += c[i] * f[i];
    return sum;
  });
}

function backgroundMask(data, w, h, coef) {
  const cosDark = Math.cos((ANGLE_DARK_DEG * Math.PI) / 180);
  const cosBright = Math.cos((ANGLE_BRIGHT_DEG * Math.PI) / 180);
  const candidate = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const v = y / (h - 1);
    for (let x = 0; x < w; x++) {
      const p = (y * w + x) * 4;
      const m = modelAt(coef, x / (w - 1), v);
      let d = 0;
      let dot = 0;
      let normM = 0;
      let normP = 0;
      for (let c = 0; c < 3; c++) {
        const px = data[p + c];
        d = Math.max(d, Math.abs(px - m[c]));
        dot += px * m[c];
        normM += m[c] * m[c];
        normP += px * px;
      }
      if (d <= TOL) {
        candidate[y * w + x] = 1;
        continue;
      }
      if (normM <= 0 || normP <= 0) continue;
      const cos = dot / Math.sqrt(normM * normP);
      const k = dot / normM;
      const isShadow = k >= K_LO && k <= K_DARK_HI && cos >= cosDark;
      const isGlow = k > K_DARK_HI && k <= K_HI && cos >= cosBright;
      if (isShadow || isGlow) candidate[y * w + x] = 1;
    }
  }

  // Solo el fondo conectado al borde: así lo que se parece al melocotón pero
  // vive dentro del objeto no se convierte en un agujero transparente.
  const mask = new Uint8Array(w * h);
  const queue = new Int32Array(w * h);
  let head = 0;
  let tail = 0;
  const push = (idx) => {
    if (mask[idx] || !candidate[idx]) return;
    mask[idx] = 1;
    queue[tail++] = idx;
  };
  for (let x = 0; x < w; x++) {
    push(x);
    push((h - 1) * w + x);
  }
  for (let y = 0; y < h; y++) {
    push(y * w);
    push(y * w + w - 1);
  }
  while (head < tail) {
    const idx = queue[head++];
    const x = idx % w;
    const y = (idx - x) / w;
    if (x > 0) push(idx - 1);
    if (x < w - 1) push(idx + 1);
    if (y > 0) push(idx - w);
    if (y < h - 1) push(idx + w);
  }
  return mask;
}

// El bbox del recorte lo decide el píxel opaco más extremo, así que una mota
// suelta en una esquina descentra la ilustración entera: se descartan los
// grupos de primer plano por debajo de MIN_SPECK_RATIO.
function dropSpecks(mask, w, h) {
  const total = w * h;
  const minArea = Math.max(64, Math.round(total * MIN_SPECK_RATIO));
  const seen = new Uint8Array(total);
  const queue = new Int32Array(total);

  for (let start = 0; start < total; start++) {
    if (mask[start] || seen[start]) continue;
    let head = 0;
    let tail = 0;
    seen[start] = 1;
    queue[tail++] = start;
    const component = [];
    while (head < tail) {
      const idx = queue[head++];
      component.push(idx);
      const x = idx % w;
      const y = (idx - x) / w;
      const neighbours = [];
      if (x > 0) neighbours.push(idx - 1);
      if (x < w - 1) neighbours.push(idx + 1);
      if (y > 0) neighbours.push(idx - w);
      if (y < h - 1) neighbours.push(idx + w);
      for (const n of neighbours) {
        if (mask[n] || seen[n]) continue;
        seen[n] = 1;
        queue[tail++] = n;
      }
    }
    if (component.length < minArea) {
      for (const idx of component) mask[idx] = 1;
    }
  }
  return mask;
}

// Un píxel de borde conserva algo del melocotón original, así que el fondo se
// dilata 1px antes de suavizar: sin esto queda un halo de color alrededor.
function dilate(mask, w, h) {
  const out = new Uint8Array(mask);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x;
      if (mask[idx]) continue;
      if (
        (x > 0 && mask[idx - 1]) ||
        (x < w - 1 && mask[idx + 1]) ||
        (y > 0 && mask[idx - w]) ||
        (y < h - 1 && mask[idx + w])
      ) {
        out[idx] = 1;
      }
    }
  }
  return out;
}

// Alfa binario → gris difuminado → alfa suave, para que el contorno no salga
// escalonado sobre el color de la card.
function featherAlpha(mask, w, h) {
  const gray = new Jimp({ width: w, height: h, color: 0x000000ff });
  for (let idx = 0; idx < w * h; idx++) {
    const value = mask[idx] ? 0 : 255;
    const p = idx * 4;
    gray.bitmap.data[p] = value;
    gray.bitmap.data[p + 1] = value;
    gray.bitmap.data[p + 2] = value;
    gray.bitmap.data[p + 3] = 255;
  }
  gray.blur(1);
  return gray.bitmap.data;
}

function alphaBounds(data, w, h) {
  let minX = w;
  let minY = h;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * 4 + 3] <= 8) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  return { minX, minY, maxX, maxY };
}

async function cutout(name) {
  const file = path.join(DIR, `${name}.png`);
  const before = (await stat(file)).size;
  const img = await Jimp.read(file);
  const { width: w, height: h, data } = img.bitmap;

  if (hasTransparency(data)) {
    console.log(`${name}.png ya tiene transparencia — saltado`);
    return img;
  }

  const coef = fitBackground(data, w, h);
  if (!coef) {
    console.log(`${name}.png: no se pudo ajustar el fondo — saltado`);
    return img;
  }

  const mask = dilate(dropSpecks(backgroundMask(data, w, h, coef), w, h), w, h);
  const soft = featherAlpha(mask, w, h);
  for (let idx = 0; idx < w * h; idx++) data[idx * 4 + 3] = soft[idx * 4];

  const { minX, minY, maxX, maxY } = alphaBounds(data, w, h);
  if (maxX < 0) {
    console.log(`${name}.png: el recorte se comió la imagen — saltado`);
    return img;
  }
  const x = Math.max(0, minX - MARGIN);
  const y = Math.max(0, minY - MARGIN);
  img.crop({
    x,
    y,
    w: Math.min(w - x, maxX - minX + 1 + MARGIN * 2),
    h: Math.min(h - y, maxY - minY + 1 + MARGIN * 2),
  });
  if (img.bitmap.width > WIDTH) {
    const ratio = WIDTH / img.bitmap.width;
    img.resize({ w: WIDTH, h: Math.round(img.bitmap.height * ratio), mode: ResizeStrategy.BICUBIC });
  }
  await img.write(file);

  const after = (await stat(file)).size;
  const kept = ((100 * ((maxX - minX) * (maxY - minY))) / (w * h)).toFixed(0);
  console.log(
    `${name}.png  ${w}x${h} ${before >> 10}KB -> ${img.bitmap.width}x${img.bitmap.height} ${after >> 10}KB (bbox ${kept}%)`,
  );
  return img;
}

// Contactos sobre el tinte real de cada ubicación: el recorte solo en el visor
// de PNG no dice si queda halo, y aquí es donde se va a ver.
async function writePreview(cards) {
  const cellW = 340;
  const cellH = 500;
  const sheet = new Jimp({ width: cellW * cards.length, height: cellH, color: 0xffffffff });
  cards.forEach(({ img, tint }, i) => {
    const cell = new Jimp({ width: cellW, height: cellH, color: tint });
    const fit = img.clone();
    const ratio = Math.min((cellW - 40) / fit.bitmap.width, (cellH - 40) / fit.bitmap.height);
    fit.resize({
      w: Math.round(fit.bitmap.width * ratio),
      h: Math.round(fit.bitmap.height * ratio),
      mode: ResizeStrategy.BICUBIC,
    });
    cell.composite(fit, Math.round((cellW - fit.bitmap.width) / 2), Math.round((cellH - fit.bitmap.height) / 2));
    sheet.composite(cell, i * cellW, 0);
  });
  const out = path.join(os.tmpdir(), "pantry-cards-preview.png");
  await sheet.write(out);
  console.log(`preview: ${out}`);
}

async function main() {
  const preview = process.argv.includes("--preview");
  const done = [];
  for (const card of CARDS) {
    done.push({ ...card, img: await cutout(card.name) });
  }
  if (preview) await writePreview(done);
}

main();
