// Upload the 5 Midjourney fixes from scripts/prompt-test/ to Vercel Blob,
// regenerate WebP derivatives, and cache-bust app manifests.
//
// Usage:
//   node --env-file=.env.local scripts/upload-prompt-test-fixes.mjs

import { put } from "@vercel/blob";
import sharp from "sharp";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { generateDerivatives, DERIVATIVE_BUCKETS } from "./lib/dishDerivatives.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const SRC_DIR = join(__dirname, "prompt-test");

const FIXES = [
  { file: "macarrones_tomate.png", comboId: "pasta_arroces_001" },
  { file: "yogur_sabores.png", comboId: "postres_013" },
  { file: "batido_cacao.png", comboId: "meriendas_006" },
  { file: "tosta_aceite_tomate.png", comboId: "desayunos_002" },
  { file: "tarta_queso.png", comboId: "postres_017" },
];

const MANIFEST = join(ROOT, "src/assets/dishes/dishImages.json");
const DERIVATIVES = join(ROOT, "src/assets/dishes/dishImageDerivatives.json");
const CATALOG = join(ROOT, "dish-gallery/public/catalog.json");

const TOKEN = process.env.BLOB_READ_WRITE_TOKEN;
if (!TOKEN) {
  console.error("❌  BLOB_READ_WRITE_TOKEN no encontrado (--env-file=.env.local)");
  process.exit(1);
}

const stripQuery = (url) => String(url).split("?")[0];
const bumpVersion = (url) => {
  const base = stripQuery(url);
  const query = String(url).split("?")[1];
  const prev = query ? Number(new URLSearchParams(query).get("v")) || 1 : 1;
  return `${base}?v=${prev + 1}`;
};

const manifest = JSON.parse(readFileSync(MANIFEST, "utf8"));
const derivativesManifest = JSON.parse(readFileSync(DERIVATIVES, "utf8"));
const catalog = JSON.parse(readFileSync(CATALOG, "utf8"));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let ok = 0;
const failed = [];

for (const { file, comboId } of FIXES) {
  const srcPath = join(SRC_DIR, file);
  if (!existsSync(srcPath)) {
    console.error(`❌  Falta ${file}`);
    failed.push(comboId);
    continue;
  }

  try {
    const jpg = await sharp(readFileSync(srcPath))
      .jpeg({ quality: 88, mozjpeg: true })
      .toBuffer();

    const blob = await put(`dishes/${comboId}.jpg`, jpg, {
      access: "public",
      token: TOKEN,
      contentType: "image/jpeg",
      addRandomSuffix: false,
      allowOverwrite: true,
    });

    const derivBuffers = await generateDerivatives(jpg);
    const derivUrls = {};
    for (const width of DERIVATIVE_BUCKETS) {
      const dBlob = await put(`dishes/derivatives/${comboId}-${width}.webp`, derivBuffers[width], {
        access: "public",
        token: TOKEN,
        contentType: "image/webp",
        addRandomSuffix: false,
        allowOverwrite: true,
      });
      derivUrls[width] = dBlob.url;
    }

    const current = manifest[comboId] ?? blob.url;
    const nextUrl = bumpVersion(current);
    manifest[comboId] = nextUrl;

    const originKey = stripQuery(blob.url);
    derivativesManifest[originKey] = Object.fromEntries(
      Object.entries(derivUrls).map(([w, u]) => [w, bumpVersion(u)]),
    );

    const catEntry = catalog.find((e) => e.combo_id === comboId);
    if (catEntry) catEntry.imageUrl = stripQuery(blob.url);

    ok++;
    console.log(`✅  ${comboId} ← ${file} (${(jpg.length / 1024).toFixed(0)} KB) → ${nextUrl}`);
  } catch (err) {
    failed.push(comboId);
    console.error(`❌  ${comboId}: ${err.message?.slice(0, 200)}`);
  }

  await sleep(200);
}

writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + "\n", "utf8");
writeFileSync(DERIVATIVES, JSON.stringify(derivativesManifest, null, 2) + "\n", "utf8");
writeFileSync(CATALOG, JSON.stringify(catalog, null, 2) + "\n", "utf8");

console.log(`\n✨  Subidas=${ok} fallidas=${failed.length}${failed.length ? ` (${failed.join(", ")})` : ""}`);
