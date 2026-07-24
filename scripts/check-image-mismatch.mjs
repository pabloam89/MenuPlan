// One-off: detect dishes whose generated photo does not match the catalog dish.
// Cross-references:
//   1. dishImages.json  -> which combo_ids actually have a photo
//   2. the source CSV    -> the dish_name used to GENERATE each photo
//   3. recipe catalog    -> the name the APP shows for that id
// A mismatch = photo depicts CSV name, app labels it catalog name, and they
// describe a materially different dish (not just wording/accents).

import { readFileSync, readdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import Papa from "papaparse";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const manifest = JSON.parse(
  readFileSync(join(ROOT, "src/assets/dishes/dishImages.json"), "utf8"),
);

const CSV_PATH =
  process.env.CSV_PATH || "C:/Users/pablo/Downloads/dish_garnish_combinations.csv";
const csvText = readFileSync(CSV_PATH, "utf8");
const { data: csvRows } = Papa.parse(csvText, { header: true, skipEmptyLines: true });

const csvById = new Map();
for (const r of csvRows) if (r.combo_id) csvById.set(r.combo_id, r);

// Build id -> {name, protein} from every recipe JSON (dishes + guarniciones).
const recipesDir = join(ROOT, "src/data/recipes");
const catById = new Map();
for (const file of readdirSync(recipesDir)) {
  if (!file.endsWith(".json")) continue;
  const arr = JSON.parse(readFileSync(join(recipesDir, file), "utf8"));
  for (const rec of arr) {
    if (rec.id) catById.set(rec.id, { name: rec.name, protein: rec.mainProtein });
  }
}

const STOP = new Set([
  "de","con","y","a","la","el","los","las","al","en","del","un","una","o",
  "estilo","casero","casera","caseros","caseras","salsa",
]);
function tokens(s) {
  if (!s) return [];
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter((t) => t && !STOP.has(t));
}
function jaccard(a, b) {
  const A = new Set(a), B = new Set(b);
  if (!A.size && !B.size) return 1;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  return inter / (A.size + B.size - inter);
}

const SIM_THRESHOLD = 0.5; // below this = likely a different dish

const strong = []; // clearly different dish
const weak = [];   // partial overlap, worth a look
const missingInCsv = [];
const missingInCatalog = [];

for (const key of Object.keys(manifest)) {
  const [dishId, garnishId] = key.split("+");
  const cat = catById.get(dishId);
  const catGarnish = garnishId ? catById.get(garnishId) : null;
  const csv = csvById.get(key) || csvById.get(dishId);

  if (!csv) { missingInCsv.push(key); continue; }
  if (!cat) { missingInCatalog.push(key); continue; }

  const csvDish = (csv.dish_name || "").trim();
  const csvGarnish = (csv.garnish_name || "").trim();
  const photoLabel = [csvDish, csvGarnish].filter(Boolean).join(" con ");
  const appLabel = [cat.name, catGarnish?.name].filter(Boolean).join(" con ");

  const sim = jaccard(tokens(photoLabel), tokens(appLabel));
  const proteinDiff =
    csv.dish_protein && cat.protein &&
    tokens(csv.dish_protein).join() !== tokens(cat.protein).join();

  if (sim === 1 && !proteinDiff) continue; // identical dish

  const entry = { key, photoLabel, appLabel, sim: sim.toFixed(2), proteinDiff,
    csvProtein: csv.dish_protein, catProtein: cat.protein };

  if (sim < SIM_THRESHOLD || proteinDiff) strong.push(entry);
  else weak.push(entry);
}

const p = (e) =>
  `${e.key}  (sim ${e.sim}${e.proteinDiff ? `, proteína ${e.csvProtein}→${e.catProtein}` : ""})\n` +
  `   foto muestra : ${e.photoLabel}\n` +
  `   app etiqueta : ${e.appLabel}\n`;

console.log(`\n=== Imágenes en manifest: ${Object.keys(manifest).length} ===`);
console.log(`Desajustes FUERTES (plato distinto): ${strong.length}`);
console.log(`Desajustes leves (revisar): ${weak.length}`);
console.log(`Foto sin fila en CSV: ${missingInCsv.length}`);
console.log(`Foto sin receta en catálogo: ${missingInCatalog.length}\n`);

console.log("############ DESAJUSTES FUERTES ############\n");
for (const e of strong.sort((a, b) => a.sim - b.sim)) console.log(p(e));

console.log("\n############ DESAJUSTES LEVES ############\n");
for (const e of weak.sort((a, b) => a.sim - b.sim)) console.log(p(e));

if (missingInCsv.length) {
  console.log("\n--- FOTO SIN FILA EN CSV ---\n" + missingInCsv.join(", "));
}
