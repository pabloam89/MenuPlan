// Publish a freshly uploaded photo batch to the app manifests.
//
// Usage:
//   node scripts/finalize-photo-swap.mjs [--version 5]
//
// Copies output/manifest.json → src/assets/dishes/dishImages.json and
// output/derivatives-manifest.json → src/assets/dishes/dishImageDerivatives.json,
// stamping every URL with ?v=<version>.
//
// The version stamp matters on BOTH files. Blob paths are stable
// (addRandomSuffix:false + allowOverwrite:true), so a re-upload serves new bytes
// from the same URL and browsers/CDN would happily keep the old photo. The app
// serves the WebP derivative, not the origin (see deckImg in
// src/lib/dishPhotoOptimize.js), so stamping only dishImages.json would leave
// everyone looking at cached derivatives of the previous batch. Derivative
// lookup keys off the origin URL with its query stripped, so the values can
// carry ?v= without any code change.

import { readFileSync, writeFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const SRC_MANIFEST = join(ROOT, "output", "manifest.json");
const SRC_DERIVATIVES = join(ROOT, "output", "derivatives-manifest.json");
const OUT_IMAGES = join(ROOT, "src", "assets", "dishes", "dishImages.json");
const OUT_DERIVATIVES = join(ROOT, "src", "assets", "dishes", "dishImageDerivatives.json");

const versionArg = process.argv.indexOf("--version");
const VERSION = versionArg !== -1 ? Number(process.argv[versionArg + 1]) : 5;
if (!Number.isInteger(VERSION) || VERSION < 1) {
  console.error("❌  --version debe ser un entero positivo");
  process.exit(1);
}

for (const p of [SRC_MANIFEST, SRC_DERIVATIVES]) {
  if (!existsSync(p)) {
    console.error(`❌  Falta ${p}. Ejecuta upload-to-blob.mjs primero.`);
    process.exit(1);
  }
}

const stripQuery = (url) => String(url).split("?")[0];
const stamp = (url) => `${stripQuery(url)}?v=${VERSION}`;

const manifest = JSON.parse(readFileSync(SRC_MANIFEST, "utf8"));
const derivatives = JSON.parse(readFileSync(SRC_DERIVATIVES, "utf8"));

const prevImages = existsSync(OUT_IMAGES) ? JSON.parse(readFileSync(OUT_IMAGES, "utf8")) : {};

const images = {};
for (const [comboId, url] of Object.entries(manifest)) images[comboId] = stamp(url);

const outDerivatives = {};
let missingDerivatives = 0;
for (const [comboId, url] of Object.entries(manifest)) {
  const key = stripQuery(url);
  const buckets = derivatives[key];
  if (!buckets) {
    missingDerivatives++;
    continue;
  }
  outDerivatives[key] = Object.fromEntries(
    Object.entries(buckets).map(([width, dUrl]) => [width, stamp(dUrl)]),
  );
}

writeFileSync(OUT_IMAGES, JSON.stringify(images, null, 2), "utf8");
writeFileSync(OUT_DERIVATIVES, JSON.stringify(outDerivatives, null, 2), "utf8");

// Combos the previous batch served that this one doesn't cover: recipes dropped
// from the catalog are expected here, anything else means a generation gap.
const dropped = Object.keys(prevImages).filter((id) => !images[id]);

console.log(`✅  dishImages.json → ${Object.keys(images).length} fotos (?v=${VERSION})`);
console.log(`✅  dishImageDerivatives.json → ${Object.keys(outDerivatives).length} entradas`);
if (missingDerivatives) console.log(`   ⚠️  ${missingDerivatives} fotos sin derivados (usarán wsrv.nl)`);
if (dropped.length) {
  console.log(`   ℹ️  ${dropped.length} combos ya no tienen foto: ${dropped.slice(0, 10).join(", ")}${dropped.length > 10 ? "…" : ""}`);
}
