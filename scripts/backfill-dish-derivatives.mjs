// One-off backfill: generates the small WebP derivatives (see
// scripts/lib/dishDerivatives.mjs) for every dish photo already uploaded to
// Vercel Blob, so DishDetail/menu tiles/catalog cards stop depending on
// wsrv.nl's on-the-fly resize for existing dishes.
//
// Usage:
//   node --env-file=.env.local scripts/backfill-dish-derivatives.mjs [--limit N]
//
// Reads src/assets/dishes/dishImages.json (comboId -> original Blob URL),
// downloads each original, generates 200/500/900px WebP derivatives, uploads
// them to dishes/derivatives/<comboId>-<width>.webp, and writes
// output/derivatives-manifest.json mapping original URL -> { width: url }.
// Resume support: entries already in the manifest are skipped, so an
// interrupted run can just be re-launched.
import { put } from "@vercel/blob";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { generateDerivatives, DERIVATIVE_BUCKETS } from "./lib/dishDerivatives.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SOURCE_MANIFEST = join(__dirname, "../src/assets/dishes/dishImages.json");
const OUT_DIR = join(__dirname, "../output");
const OUT_MANIFEST = join(OUT_DIR, "derivatives-manifest.json");

const TOKEN = process.env.BLOB_READ_WRITE_TOKEN;
if (!TOKEN) {
  console.error("❌  BLOB_READ_WRITE_TOKEN not found (pass --env-file=.env.local)");
  process.exit(1);
}

const limitArg = process.argv.find((a) => a.startsWith("--limit"));
const LIMIT = limitArg ? Number(limitArg.split("=")[1] ?? process.argv[process.argv.indexOf(limitArg) + 1]) : Infinity;

const sourceManifest = JSON.parse(readFileSync(SOURCE_MANIFEST, "utf8"));
mkdirSync(OUT_DIR, { recursive: true });
const outManifest = existsSync(OUT_MANIFEST) ? JSON.parse(readFileSync(OUT_MANIFEST, "utf8")) : {};

const stripQuery = (url) => url.split("?")[0];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const entries = Object.entries(sourceManifest);
let processed = 0, skipped = 0, failed = 0;
const total = Math.min(entries.length, LIMIT);

console.log(`📐  Generando derivados para ${total} fotos (de ${entries.length} en el manifiesto)…\n`);

for (let i = 0; i < entries.length && processed + skipped + failed < LIMIT; i++) {
  const [comboId, originalUrl] = entries[i];
  const key = stripQuery(originalUrl);

  if (outManifest[key]) {
    skipped++;
    continue;
  }

  try {
    const res = await fetch(originalUrl);
    if (!res.ok) throw new Error(`fetch ${res.status}`);
    const sourceBuffer = Buffer.from(await res.arrayBuffer());

    const derivatives = await generateDerivatives(sourceBuffer);
    const urlsByWidth = {};
    for (const width of DERIVATIVE_BUCKETS) {
      const blob = await put(`dishes/derivatives/${comboId}-${width}.webp`, derivatives[width], {
        access: "public",
        token: TOKEN,
        contentType: "image/webp",
        addRandomSuffix: false,
        allowOverwrite: true,
      });
      urlsByWidth[width] = blob.url;
    }

    outManifest[key] = urlsByWidth;
    processed++;
    console.log(`✅  [${processed + skipped + failed}/${total}] ${comboId}`);
    writeFileSync(OUT_MANIFEST, JSON.stringify(outManifest, null, 2));
  } catch (err) {
    failed++;
    console.error(`❌  ${comboId}: ${err.message?.slice(0, 150)}`);
  }

  await sleep(80);
}

writeFileSync(OUT_MANIFEST, JSON.stringify(outManifest, null, 2));
console.log(`\n✨  Hecho. procesadas=${processed} saltadas=${skipped} fallidas=${failed}`);
console.log(`   Manifest → ${OUT_MANIFEST}`);
