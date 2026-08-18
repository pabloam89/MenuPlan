// Prepares the regeneration of the photos that show the wrong dish.
//
// Usage:
//   node scripts/prep-photo-fix.mjs [--dry]
//
// Background: gen-all-photos.mjs takes the dish NAME from the generated
// dish-gallery/public/catalog.json. That file had not been rebuilt since 02/08,
// so two weeks of catalog edits (garnish ids reused for a different garnish,
// dishes renamed) never reached it: photos were generated from a stale name and
// saved under a combo_id that meanwhile meant something else.
//
// This script, run AFTER build-catalog.mjs has refreshed the names:
//   1. drops manifest entries whose recipe no longer exists (dead photos),
//   2. queues dish+garnish combos that have no photo at all — a garnish added
//      after the last run has zero combos, and dishImageUrl's firstComboByDish
//      fallback then silently serves a different garnish's photo,
//   3. deletes the stale PNGs so gen-all-photos.mjs regenerates them with the
//      corrected name.
//
// Writes output/regen-ids.json: the combos to re-upload afterwards (the
// uploader skips anything already in the manifest).

import { readFileSync, writeFileSync, readdirSync, existsSync, unlinkSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const MANIFEST = join(ROOT, "output", "manifest.json");
const CATALOG = join(ROOT, "dish-gallery", "public", "catalog.json");
const RECIPES_DIR = join(ROOT, "src", "data", "recipes");
const PHOTOS_DIR = join(__dirname, "test-photos");
const REGEN_LIST = join(ROOT, "output", "regen-ids.json");
const MISMATCH_LIST = join(ROOT, "output", "fotos-mal-mapeadas.json");

const dry = process.argv.includes("--dry");

// ─── Catálogo vivo ──────────────────────────────────────────────────────────

const recipeById = {};
for (const file of readdirSync(RECIPES_DIR)) {
  if (!file.endsWith(".json")) continue;
  for (const r of JSON.parse(readFileSync(join(RECIPES_DIR, file), "utf8"))) {
    if (r?.id) recipeById[r.id] = { ...r, isGarnish: file === "guarniciones.json" };
  }
}
const isLiveCombo = (comboId) => comboId.split("+").every((p) => recipeById[p]);

const manifest = JSON.parse(readFileSync(MANIFEST, "utf8"));
const catalog = JSON.parse(readFileSync(CATALOG, "utf8"));

// ─── 1. Fotos muertas ───────────────────────────────────────────────────────

const dead = Object.keys(manifest).filter((id) => !isLiveCombo(id));

// ─── 2. Combos sin ninguna foto (guarnición nueva) ──────────────────────────

const garnishIds = Object.values(recipeById).filter((r) => r.isGarnish).map((r) => r.id);
const dishesWithCombos = new Set();
const comboSet = new Set(Object.keys(manifest));
for (const id of comboSet) {
  const plus = id.indexOf("+");
  if (plus !== -1) dishesWithCombos.add(id.slice(0, plus));
}

const missingCombos = [];
for (const garnishId of garnishIds) {
  // Sólo interesa la guarnición que no aparece con NINGÚN plato: si tiene
  // cobertura parcial es una decisión del catálogo, no un agujero.
  const covered = [...dishesWithCombos].filter((d) => comboSet.has(`${d}+${garnishId}`));
  if (covered.length > 0) continue;
  for (const dishId of dishesWithCombos) missingCombos.push(`${dishId}+${garnishId}`);
}

// ─── 3. Fotos generadas con el nombre equivocado ────────────────────────────

const mismatched = existsSync(MISMATCH_LIST)
  ? JSON.parse(readFileSync(MISMATCH_LIST, "utf8")).map((m) => m.id).filter(isLiveCombo)
  : [];

// Receta editada tras su foto: mismo nombre, ingredientes distintos. Se pasa por
// argumento para no re-derivarlo aquí.
const extraIds = process.argv
  .filter((a) => a.startsWith("--also="))
  .flatMap((a) => a.slice("--also=".length).split(","))
  .filter(Boolean);
const extraCombos = Object.keys(manifest).filter((id) =>
  extraIds.some((base) => id === base || id.startsWith(`${base}+`)),
);

const toRegen = [...new Set([...mismatched, ...extraCombos])];

// ─── Informe ────────────────────────────────────────────────────────────────

console.log(`🗑  Fotos muertas (receta eliminada):        ${dead.length}`);
console.log(`➕  Combos sin ninguna foto (guarnición nueva): ${missingCombos.length}`);
if (missingCombos.length) {
  const g = missingCombos[0].split("+")[1];
  console.log(`     → ${g} (${recipeById[g]?.shortName ?? recipeById[g]?.name}) × ${missingCombos.length} platos`);
}
console.log(`🔁  Fotos con nombre equivocado a rehacer:   ${toRegen.length}`);
console.log(`    ────────────────────────────────────────`);
console.log(`    Total a generar: ${toRegen.length + missingCombos.length}`);

if (dry) {
  console.log("\n(--dry: no se ha tocado nada)");
  process.exit(0);
}

// ─── Aplicar ────────────────────────────────────────────────────────────────

for (const id of dead) delete manifest[id];
writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2), "utf8");
console.log(`\n✅  ${dead.length} entradas muertas fuera de output/manifest.json`);

// Las muertas también sobran en disco.
let borradas = 0;
for (const id of dead) {
  for (const ext of ["png", "jpg"]) {
    const p = join(PHOTOS_DIR, `${id}.${ext}`);
    if (existsSync(p)) { unlinkSync(p); borradas++; }
  }
}
console.log(`✅  ${borradas} PNG muertos borrados de scripts/test-photos`);

// Borrar las mal mapeadas para que el generador las rehaga con el nombre bueno.
let rehechas = 0;
for (const id of toRegen) {
  for (const ext of ["png", "jpg"]) {
    const p = join(PHOTOS_DIR, `${id}.${ext}`);
    if (existsSync(p)) { unlinkSync(p); rehechas++; }
  }
}
console.log(`✅  ${rehechas} PNG mal mapeados borrados (se regenerarán)`);

// Encolar los combos sin foto para que el generador los vea.
const catalogClean = catalog.filter((c) => isLiveCombo(c.combo_id));
const known = new Set(catalogClean.map((c) => c.combo_id));
const queued = [];
for (const comboId of missingCombos) {
  if (known.has(comboId)) continue;
  const [dishId, garnishId] = comboId.split("+");
  const dish = recipeById[dishId];
  const garnish = recipeById[garnishId];
  queued.push({
    combo_id: comboId,
    imageUrl: null,
    name: `${dish.name} con ${garnish.shortName ?? garnish.name}`,
    family: dish.category ?? dishId.replace(/_\d+.*$/, ""),
    type: "dish+garnish",
  });
}
writeFileSync(CATALOG, JSON.stringify([...catalogClean, ...queued], null, 2), "utf8");
console.log(`✅  catalog.json: ${catalog.length} → ${catalogClean.length + queued.length} (${queued.length} combos nuevos encolados)`);

writeFileSync(REGEN_LIST, JSON.stringify([...toRegen, ...missingCombos], null, 2), "utf8");
console.log(`✅  Lista de re-subida → ${REGEN_LIST}`);
console.log(`\nSiguiente: node --env-file=.env.local scripts/gen-all-photos.mjs`);
