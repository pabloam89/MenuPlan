// Downloads all dish photos and builds labeled contact sheets per family so the
// images can be eyeballed against their names to spot photo/name mismatches.
import { readFileSync, existsSync, mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import sharp from "sharp";

const catalog = JSON.parse(readFileSync("public/catalog.json", "utf8"));
const IMG_DIR = "review/img";
const SHEET_DIR = "review/sheets";
mkdirSync(IMG_DIR, { recursive: true });
mkdirSync(SHEET_DIR, { recursive: true });

const onlyFamily = process.argv[2] || null; // optional: build one family
const CELL = 300;          // image size
const LABEL_H = 46;        // caption bar
const COLS = 5;
const ROWS = 5;            // 25 per sheet
const PER = COLS * ROWS;
const GAP = 6;

const rows = onlyFamily ? catalog.filter((c) => c.family === onlyFamily) : catalog;

// ---- download (concurrency-limited) ----
async function download(d) {
  const path = join(IMG_DIR, `${d.combo_id}.jpg`);
  if (existsSync(path)) return path;
  const res = await fetch(d.imageUrl);
  if (!res.ok) throw new Error(`${d.combo_id} HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  writeFileSync(path, buf);
  return path;
}

async function pool(items, worker, size = 16) {
  let i = 0, done = 0;
  const runners = Array.from({ length: size }, async () => {
    while (i < items.length) {
      const idx = i++;
      try { await worker(items[idx]); } catch (e) { console.warn("  ✗", e.message); }
      if (++done % 100 === 0) console.log(`  ...${done}/${items.length}`);
    }
  });
  await Promise.all(runners);
}

function esc(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

async function cell(d) {
  const path = join(IMG_DIR, `${d.combo_id}.jpg`);
  let img;
  try {
    img = await sharp(path).resize(CELL, CELL, { fit: "cover" }).toBuffer();
  } catch {
    img = await sharp({ create: { width: CELL, height: CELL, channels: 3, background: "#333" } }).jpeg().toBuffer();
  }
  const name = d.name.length > 42 ? d.name.slice(0, 40) + "…" : d.name;
  const label = Buffer.from(
    `<svg width="${CELL}" height="${LABEL_H}"><rect width="100%" height="100%" fill="#111"/>` +
    `<text x="6" y="18" font-family="Arial" font-size="16" fill="#4ea1ff" font-weight="bold">${esc(d.combo_id)}</text>` +
    `<text x="6" y="38" font-family="Arial" font-size="14" fill="#eee">${esc(name)}</text></svg>`
  );
  return sharp({ create: { width: CELL, height: CELL + LABEL_H, channels: 3, background: "#111" } })
    .composite([{ input: img, top: 0, left: 0 }, { input: label, top: CELL, left: 0 }])
    .jpeg()
    .toBuffer();
}

async function buildFamily(fam, items) {
  const sheets = Math.ceil(items.length / PER);
  for (let s = 0; s < sheets; s++) {
    const slice = items.slice(s * PER, s * PER + PER);
    const cells = await Promise.all(slice.map(cell));
    const cw = CELL + GAP, ch = CELL + LABEL_H + GAP;
    const W = COLS * cw + GAP, H = ROWS * ch + GAP;
    const composites = cells.map((buf, k) => ({
      input: buf,
      top: GAP + Math.floor(k / COLS) * ch,
      left: GAP + (k % COLS) * cw,
    }));
    const out = join(SHEET_DIR, `${fam}_${String(s + 1).padStart(2, "0")}.jpg`);
    await sharp({ create: { width: W, height: H, channels: 3, background: "#222" } })
      .composite(composites)
      .jpeg({ quality: 82 })
      .toFile(out);
    console.log(`  sheet ${out} (${slice.length})`);
  }
}

console.log(`Downloading ${rows.length} images...`);
await pool(rows, download, 20);

const families = [...new Set(rows.map((r) => r.family))];
for (const fam of families) {
  const items = rows.filter((r) => r.family === fam);
  console.log(`Building ${fam} (${items.length})`);
  await buildFamily(fam, items);
}
console.log("Done.");
