/**
 * build-catalog.mjs
 * Generates dish-gallery/public/catalog.json combining:
 *   - output/manifest.json        (combo_id → Blob URL)
 *   - src/data/recipes/*.json      (dish names + family — same source as the app/menu)
 *   - src/data/recipes/guarniciones.json (garnish shortName — same label the menu shows)
 *
 * The gallery name now mirrors EXACTLY what the menu renders:
 *   "<recipe.name> con <garnish.shortName>"
 * so reviewers see the same wording in both places.
 *
 * Usage:  node scripts/build-catalog.mjs
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const MANIFEST_PATH = join(ROOT, "output", "manifest.json");
const RECIPES_DIR = join(ROOT, "src", "data", "recipes");
const OUT_DIR = join(ROOT, "dish-gallery", "public");
const OUT_PATH = join(OUT_DIR, "catalog.json");

if (!existsSync(MANIFEST_PATH)) {
  console.error("❌  output/manifest.json not found. Run upload-to-blob.mjs first.");
  process.exit(1);
}

// ---- Load all recipe families + garnishes from the app's own data ----
const recipeById = {};      // id → { name, category }
const garnishById = {};     // id → { shortName, name }

for (const file of readdirSync(RECIPES_DIR)) {
  if (!file.endsWith(".json")) continue;
  const entries = JSON.parse(readFileSync(join(RECIPES_DIR, file), "utf8"));
  for (const r of entries) {
    if (!r?.id) continue;
    if (file === "guarniciones.json") {
      garnishById[r.id] = { shortName: r.shortName ?? r.name, name: r.name };
    } else {
      recipeById[r.id] = { name: r.name, category: r.category };
    }
  }
}

// ---- Compose the menu-style display name for a combo_id ----
function menuName(comboId) {
  const [dishId, garnishId] = comboId.split("+");
  const dish = recipeById[dishId];
  const dishName = dish?.name ?? dishId.replace(/_/g, " ");
  if (garnishId) {
    const g = garnishById[garnishId];
    const gName = g?.shortName ?? garnishId.replace(/_/g, " ");
    return `${dishName} con ${gName}`;
  }
  return dishName;
}

function familyOf(comboId) {
  const [dishId] = comboId.split("+");
  return recipeById[dishId]?.category ?? dishId.replace(/_\d+.*$/, "");
}

const manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf8"));

const catalog = Object.entries(manifest).map(([combo_id, imageUrl]) => ({
  combo_id,
  imageUrl,
  name: menuName(combo_id),
  family: familyOf(combo_id),
  type: combo_id.includes("+") ? "dish+garnish" : "dish",
}));

// Sort by family then combo_id for a stable order
catalog.sort((a, b) => {
  if (a.family < b.family) return -1;
  if (a.family > b.family) return 1;
  return a.combo_id < b.combo_id ? -1 : 1;
});

if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(OUT_PATH, JSON.stringify(catalog, null, 2), "utf8");

const missing = catalog.filter((c) => c.name.match(/^[a-z_]+\d/)).length;
console.log(`✅  catalog.json → ${OUT_PATH}`);
console.log(`   ${catalog.length} dishes from ${new Set(catalog.map((c) => c.family)).size} families`);
if (missing) console.log(`   ⚠️  ${missing} combos had no recipe name (showing raw id)`);
