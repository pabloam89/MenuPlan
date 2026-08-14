// Upload generated dish images to Vercel Blob and write a manifest.
//
// Usage:
//   node --env-file=.env.local scripts/upload-to-blob.mjs
//
// Requires BLOB_READ_WRITE_TOKEN in .env.local (Vercel → Storage → your Blob → Tokens).
// Reads every .jpg in output/dishes/, uploads to dishes/<combo_id>.jpg (public),
// and writes output/manifest.json mapping combo_id → public CDN URL. Also
// generates the small WebP derivatives the app serves instead of the full
// original (see scripts/lib/dishDerivatives.mjs) and writes
// output/derivatives-manifest.json mapping original URL → { width: url }.

import { put } from "@vercel/blob";
import { readFileSync, writeFileSync, readdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { generateDerivatives, DERIVATIVE_BUCKETS } from "./lib/dishDerivatives.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const IN_DIR = join(__dirname, "../output/dishes");
const MANIFEST = join(__dirname, "../output/manifest.json");
const DERIVATIVES_MANIFEST = join(__dirname, "../output/derivatives-manifest.json");

const TOKEN = process.env.BLOB_READ_WRITE_TOKEN;
if (!TOKEN) {
  console.error("❌  BLOB_READ_WRITE_TOKEN not found in .env.local");
  console.error("    Vercel → Storage → tu Blob store → .env.local / Tokens → copia vercel_blob_rw_...");
  process.exit(1);
}

if (!existsSync(IN_DIR)) {
  console.error(`❌  No existe ${IN_DIR}. Genera imágenes primero.`);
  process.exit(1);
}

const files = readdirSync(IN_DIR).filter((f) => f.endsWith(".jpg"));
console.log(`📤  Subiendo ${files.length} imágenes a Vercel Blob…\n`);

// Resume support: keep existing manifest entries and skip already-uploaded ids.
const manifest = existsSync(MANIFEST) ? JSON.parse(readFileSync(MANIFEST, "utf8")) : {};
const derivativesManifest = existsSync(DERIVATIVES_MANIFEST) ? JSON.parse(readFileSync(DERIVATIVES_MANIFEST, "utf8")) : {};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let uploaded = 0, skipped = 0, failed = 0;

for (let i = 0; i < files.length; i++) {
  const file = files[i];
  const comboId = file.replace(/\.jpg$/, "");

  if (manifest[comboId]) {
    skipped++;
    continue;
  }

  try {
    const buffer = readFileSync(join(IN_DIR, file));
    const blob = await put(`dishes/${file}`, buffer, {
      access: "public",
      token: TOKEN,
      contentType: "image/jpeg",
      addRandomSuffix: false,
      allowOverwrite: true,
    });
    manifest[comboId] = blob.url;

    const derivatives = await generateDerivatives(buffer);
    const urlsByWidth = {};
    for (const width of DERIVATIVE_BUCKETS) {
      const dBlob = await put(`dishes/derivatives/${comboId}-${width}.webp`, derivatives[width], {
        access: "public",
        token: TOKEN,
        contentType: "image/webp",
        addRandomSuffix: false,
        allowOverwrite: true,
      });
      urlsByWidth[width] = dBlob.url;
    }
    derivativesManifest[blob.url] = urlsByWidth;

    uploaded++;
    console.log(`✅  [${i + 1}/${files.length}] ${comboId} → ${blob.url}`);
    // Persist manifests incrementally so an interruption never loses progress.
    writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2));
    writeFileSync(DERIVATIVES_MANIFEST, JSON.stringify(derivativesManifest, null, 2));
  } catch (err) {
    failed++;
    console.error(`❌  ${comboId}: ${err.message?.slice(0, 150)}`);
  }

  await sleep(150);
}

writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2));
writeFileSync(DERIVATIVES_MANIFEST, JSON.stringify(derivativesManifest, null, 2));
console.log(`\n✨  Hecho. subidas=${uploaded} saltadas=${skipped} fallidas=${failed}`);
console.log(`   Manifest → ${MANIFEST}`);
console.log(`   Derivados → ${DERIVATIVES_MANIFEST}`);
