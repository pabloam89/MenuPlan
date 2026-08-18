// Adds catalog recipes that have no photo yet to dish-gallery/public/catalog.json
// so gen-all-photos.mjs picks them up.
//
// Usage:
//   node scripts/queue-missing-photos.mjs [--dry]
//
// build-catalog.mjs derives the gallery catalog from output/manifest.json — the
// list of photos that already exist. gen-all-photos.mjs then reads that same
// catalog, so a recipe added to src/data/recipes/*.json after the last upload is
// invisible to the generator and silently never gets a photo. This queues those
// stragglers as imageUrl-less entries; the next build-catalog.mjs run rewrites
// the file from the manifest once they've been generated and uploaded.
//
// Garnishes are skipped: they're photographed as "<dish>+<garnish>" combos, not
// on their own.

import { readFileSync, writeFileSync, readdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const CATALOG_PATH = join(ROOT, "dish-gallery", "public", "catalog.json");
const RECIPES_DIR = join(ROOT, "src", "data", "recipes");

const dry = process.argv.includes("--dry");

const catalog = JSON.parse(readFileSync(CATALOG_PATH, "utf8"));
const photographed = new Set(catalog.map((c) => c.combo_id.split("+")[0]));
const garnishesInUse = new Set(
  catalog.filter((c) => c.combo_id.includes("+")).map((c) => c.combo_id.split("+")[1]),
);

const missing = [];
for (const file of readdirSync(RECIPES_DIR)) {
  if (!file.endsWith(".json")) continue;
  const isGarnishFile = file === "guarniciones.json";
  for (const r of JSON.parse(readFileSync(join(RECIPES_DIR, file), "utf8"))) {
    if (!r?.id || photographed.has(r.id)) continue;
    if (isGarnishFile && garnishesInUse.has(r.id)) continue;
    missing.push({
      combo_id: r.id,
      imageUrl: null,
      name: r.name,
      family: r.category ?? r.id.replace(/_\d+.*$/, ""),
      type: "dish",
    });
  }
}

if (!missing.length) {
  console.log("✅  Todas las recetas del catálogo tienen foto.");
  process.exit(0);
}

console.log(`📝  ${missing.length} recetas sin foto:`);
for (const m of missing) console.log(`   ${m.combo_id.padEnd(28)} ${m.name}`);

if (dry) {
  console.log("\n(--dry: no se ha escrito nada)");
  process.exit(0);
}

writeFileSync(CATALOG_PATH, JSON.stringify([...catalog, ...missing], null, 2), "utf8");
console.log(`\n✅  Añadidas a ${CATALOG_PATH} (${catalog.length} → ${catalog.length + missing.length})`);
console.log("   Ahora: node scripts/gen-all-photos.mjs");
