// Queues standalone dish + garnish photos missing from the manifest.
//
// Usage:
//   node scripts/queue-missing-photos.mjs [--dry]
//
// Writes output/pending-photos.json (for gen-all-photos.mjs --only-queued) and
// appends imageUrl-less entries to dish-gallery/public/catalog.json.

import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const CATALOG_PATH = join(ROOT, "dish-gallery", "public", "catalog.json");
const RECIPES_DIR = join(ROOT, "src", "data", "recipes");
const PENDING_PATH = join(ROOT, "output", "pending-photos.json");

const dry = process.argv.includes("--dry");

function loadManifest() {
  const manifest = {};
  for (const rel of ["output/manifest.json", "src/assets/dishes/dishImages.json"]) {
    const p = join(ROOT, rel);
    if (!existsSync(p)) continue;
    Object.assign(manifest, JSON.parse(readFileSync(p, "utf8")));
  }
  return manifest;
}

const manifest = loadManifest();
const standalonePhotographed = new Set(
  Object.keys(manifest).filter((k) => !k.includes("+")),
);

const catalog = JSON.parse(readFileSync(CATALOG_PATH, "utf8"));
const catalogIds = new Set(catalog.map((c) => c.combo_id));

const missing = [];
for (const file of readdirSync(RECIPES_DIR)) {
  if (!file.endsWith(".json")) continue;
  const isGarnishFile = file === "guarniciones.json";
  for (const r of JSON.parse(readFileSync(join(RECIPES_DIR, file), "utf8"))) {
    if (!r?.id || standalonePhotographed.has(r.id)) continue;
    missing.push({
      combo_id: r.id,
      imageUrl: null,
      name: r.name,
      family: isGarnishFile ? "guarniciones" : (r.category ?? r.id.replace(/_\d+.*$/, "")),
      type: isGarnishFile ? "garnish" : "dish",
    });
  }
}

const dishes = missing.filter((m) => m.type === "dish");
const garnishes = missing.filter((m) => m.type === "garnish");
const toAddCatalog = missing.filter((m) => !catalogIds.has(m.combo_id));

console.log(`📷  Standalone sin foto en manifest: ${missing.length}`);
console.log(`    Platos: ${dishes.length} | Guarniciones: ${garnishes.length}`);
console.log(`    Nuevas entradas para catalog.json: ${toAddCatalog.length}`);

if (missing.length) {
  console.log("\nLista:");
  for (const m of missing) console.log(`   ${m.combo_id.padEnd(28)} ${m.name}`);
}

if (!missing.length) {
  console.log("\n✅  No hay fotos standalone pendientes.");
  process.exit(0);
}

if (dry) {
  console.log("\n(--dry: no se ha escrito nada)");
  process.exit(0);
}

mkdirSync(join(ROOT, "output"), { recursive: true });
writeFileSync(PENDING_PATH, JSON.stringify(missing, null, 2), "utf8");
console.log(`\n✅  Cola → ${PENDING_PATH}`);

if (toAddCatalog.length) {
  writeFileSync(
    CATALOG_PATH,
    JSON.stringify([...catalog, ...toAddCatalog], null, 2),
    "utf8",
  );
  console.log(`✅  catalog.json: ${catalog.length} → ${catalog.length + toAddCatalog.length}`);
}

console.log("\nSiguiente:");
console.log("  node --env-file=.env.local scripts/gen-all-photos.mjs --only-queued");
