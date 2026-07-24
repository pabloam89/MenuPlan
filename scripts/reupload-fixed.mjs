// Re-upload ONLY the regenerated combos to Vercel Blob, overwriting the exact
// same pathname so the URLs already referenced by dishImages.json stay valid.
//
// Usage:  node --env-file=.env.local scripts/reupload-fixed.mjs
//
// Reads output/rejections-fix.json for the combo_id list and pushes each
// output/dishes/<combo_id>.jpg to dishes/<combo_id>.jpg (public, overwrite).

import { put } from "@vercel/blob";
import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const IN_DIR = join(__dirname, "..", "output", "dishes");
const LIST = join(__dirname, "..", "output", "rejections-fix.json");

const TOKEN = process.env.BLOB_READ_WRITE_TOKEN;
if (!TOKEN) {
  console.error("❌  BLOB_READ_WRITE_TOKEN no encontrado en .env.local");
  process.exit(1);
}

const combos = JSON.parse(readFileSync(LIST, "utf8")).map((e) => e.combo_id);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let ok = 0, failed = 0;
for (let i = 0; i < combos.length; i++) {
  const id = combos[i];
  const file = `${id}.jpg`;
  const path = join(IN_DIR, file);
  if (!existsSync(path)) {
    console.error(`❌  falta ${file}`);
    failed++;
    continue;
  }
  try {
    const buffer = readFileSync(path);
    const blob = await put(`dishes/${file}`, buffer, {
      access: "public",
      token: TOKEN,
      contentType: "image/jpeg",
      addRandomSuffix: false,
      allowOverwrite: true,
    });
    ok++;
    console.log(`✅  [${i + 1}/${combos.length}] ${id} → ${blob.url}`);
  } catch (err) {
    failed++;
    console.error(`❌  ${id}: ${err.message?.slice(0, 150)}`);
  }
  await sleep(150);
}

console.log(`\n✨  Resubidas=${ok} fallidas=${failed}`);
