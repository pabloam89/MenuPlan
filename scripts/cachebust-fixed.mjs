// Append a version query (?v=2) to the URLs of the regenerated combos so browsers
// and the CDN fetch the fresh image instead of the 30-day-cached old one.
// Updates both the app manifest and the gallery catalog.

import { readFileSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const VER = "2";

const MANIFEST = join(ROOT, "src", "assets", "dishes", "dishImages.json");
const CATALOG = join(ROOT, "dish-gallery", "public", "catalog.json");
const LIST = join(ROOT, "output", "rejections-fix.json");

const ids = new Set(JSON.parse(readFileSync(LIST, "utf8")).map((e) => e.combo_id));

function bust(url) {
  const base = url.split("?")[0];
  return `${base}?v=${VER}`;
}

// ---- App manifest (flat map combo_id -> url) ----
const manifest = JSON.parse(readFileSync(MANIFEST, "utf8"));
let m = 0;
for (const id of ids) {
  if (manifest[id]) { manifest[id] = bust(manifest[id]); m++; }
}
writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + "\n", "utf8");

// ---- Gallery catalog (array of { combo_id, imageUrl }) ----
const catalog = JSON.parse(readFileSync(CATALOG, "utf8"));
let c = 0;
for (const entry of catalog) {
  if (ids.has(entry.combo_id) && entry.imageUrl) { entry.imageUrl = bust(entry.imageUrl); c++; }
}
writeFileSync(CATALOG, JSON.stringify(catalog, null, 2) + "\n", "utf8");

console.log(`✅  cache-bust ?v=${VER} → manifest=${m} catalog=${c} (de ${ids.size} combos)`);
