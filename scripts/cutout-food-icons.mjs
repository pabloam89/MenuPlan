// Recorta el fondo gris de estudio (degradado + sombra suave) de unos iconos de
// categoría/ingrediente a PNG con transparencia, para poder pintarlos sobre
// cards blancas sin el "cuadrado gris" de fondo. NO sobrescribe los originales:
// escribe copias en public/categories/cut/ (las compartidas se siguen usando
// sobre fondos tintados donde el gris no molesta).
//
// Mismo motor que cutout-pantry-cards.mjs: se ajusta por mínimos cuadrados un
// polinomio cuadrático en (x,y) por canal usando solo la banda del borde (fondo
// puro) y se marca como fondo lo que encaja con ese modelo; la sombra se acepta
// como el mismo color multiplicado por k<1. Conectividad desde el borde para no
// abrir agujeros dentro del alimento.
//
//   node scripts/cutout-food-icons.mjs [--preview]
import { Jimp, ResizeStrategy } from "jimp";
import { mkdir, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const SRC_DIR = path.resolve("public/categories");
const OUT_DIR = path.resolve("public/categories/cut");
const FILES = ["carne", "pasta_arroz", "verduras"];
const WIDTH = 320;
const BORDER_BAND = 8;
const TOL = 16;
const ANGLE_DARK_DEG = 6;
const ANGLE_BRIGHT_DEG = 3;
const K_LO = 0.12;
const K_DARK_HI = 0.96;
const K_HI = 1.4;
const MIN_SPECK_RATIO = 0.0005;
const MARGIN = 4;

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
      for (const nb of neighbours) {
        if (mask[nb] || seen[nb]) continue;
        seen[nb] = 1;
        queue[tail++] = nb;
      }
    }
    if (component.length < minArea) {
      for (const idx of component) mask[idx] = 1;
    }
  }
  return mask;
}

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
  const src = path.join(SRC_DIR, `${name}.png`);
  const out = path.join(OUT_DIR, `${name}.png`);
  const before = (await stat(src)).size;
  const img = await Jimp.read(src);
  const { width: w, height: h, data } = img.bitmap;

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
  await img.write(out);

  const after = (await stat(out)).size;
  console.log(`${name}.png  ${w}x${h} ${before >> 10}KB -> ${img.bitmap.width}x${img.bitmap.height} ${after >> 10}KB`);
  return img;
}

async function writePreview(imgs) {
  const cellW = 260;
  const cellH = 260;
  const sheet = new Jimp({ width: cellW * imgs.length, height: cellH, color: 0xffffffff });
  imgs.forEach((img, i) => {
    const fit = img.clone();
    const ratio = Math.min((cellW - 30) / fit.bitmap.width, (cellH - 30) / fit.bitmap.height);
    fit.resize({
      w: Math.round(fit.bitmap.width * ratio),
      h: Math.round(fit.bitmap.height * ratio),
      mode: ResizeStrategy.BICUBIC,
    });
    sheet.composite(fit, i * cellW + Math.round((cellW - fit.bitmap.width) / 2), Math.round((cellH - fit.bitmap.height) / 2));
  });
  const out = path.join(os.tmpdir(), "food-icons-preview.png");
  await sheet.write(out);
  console.log(`preview: ${out}`);
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const preview = process.argv.includes("--preview");
  const done = [];
  for (const name of FILES) done.push(await cutout(name));
  if (preview) await writePreview(done);
}

main();
