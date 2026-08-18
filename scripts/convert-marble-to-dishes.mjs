// Convert the marble-background PNGs produced by gen-all-photos.mjs into the
// JPEGs that upload-to-blob.mjs expects.
//
// Usage:
//   node scripts/convert-marble-to-dishes.mjs [--keep-old]
//
// Reads scripts/test-photos/*.png, writes output/dishes/<combo_id>.jpg. By
// default it first clears the existing JPEGs so combos dropped from the catalog
// (boquerones, poke, pasta al ajillo…) don't get re-uploaded with their old
// slate photo; pass --keep-old to merge instead. Back up output/dishes before
// running — the wipe is what makes the swap clean, but it is destructive.

import sharp from "sharp";
import { readdirSync, readFileSync, writeFileSync, unlinkSync, mkdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC_DIR = join(__dirname, "test-photos");
const OUT_DIR = join(__dirname, "../output/dishes");
const QUALITY = 88;

// Early prompt experiments live alongside the real output as 01_…png … 11_…png.
// They aren't combo ids, so they must never reach the Blob.
const isPromptTest = (name) => /^\d{2}_/.test(name);
const isInternal = (name) => name.startsWith("_");

const keepOld = process.argv.includes("--keep-old");

if (!existsSync(SRC_DIR)) {
  console.error(`❌  No existe ${SRC_DIR}`);
  process.exit(1);
}
mkdirSync(OUT_DIR, { recursive: true });

const sources = readdirSync(SRC_DIR).filter(
  (f) => f.endsWith(".png") && !isInternal(f) && !isPromptTest(f),
);
if (!sources.length) {
  console.error("❌  No hay PNGs que convertir.");
  process.exit(1);
}

if (!keepOld) {
  const stale = readdirSync(OUT_DIR).filter((f) => f.endsWith(".jpg"));
  for (const f of stale) unlinkSync(join(OUT_DIR, f));
  console.log(`🧹  Borradas ${stale.length} fotos antiguas de output/dishes\n`);
}

console.log(`🎨  Convirtiendo ${sources.length} PNG → JPG (q${QUALITY})…\n`);

let done = 0;
let failed = 0;
let bytesIn = 0;
let bytesOut = 0;

for (const file of sources) {
  const comboId = file.replace(/\.png$/, "");
  try {
    const src = readFileSync(join(SRC_DIR, file));
    const jpg = await sharp(src).jpeg({ quality: QUALITY, mozjpeg: true }).toBuffer();
    writeFileSync(join(OUT_DIR, `${comboId}.jpg`), jpg);
    bytesIn += src.length;
    bytesOut += jpg.length;
    done++;
    if (done % 100 === 0) console.log(`   ${done}/${sources.length}…`);
  } catch (err) {
    failed++;
    console.error(`❌  ${comboId}: ${err.message?.slice(0, 120)}`);
  }
}

const mb = (n) => `${(n / 1024 / 1024).toFixed(0)} MB`;
console.log(`\n✨  Convertidas=${done} fallidas=${failed}`);
console.log(`   ${mb(bytesIn)} PNG → ${mb(bytesOut)} JPG`);
console.log(`   Destino: ${OUT_DIR}`);
