// Build a Google Sheets-friendly review file from the Blob manifest.
//
// Usage:
//   node scripts/build-review-sheet.mjs
//
// Reads output/manifest.json (combo_id → URL) + the source CSV, and writes
// output/review-sheet.tsv with columns:
//   Imagen (=IMAGE formula) | combo_id | Plato | Familia | Tipo | Aprobado | Notas
//
// In Google Sheets: File → Import → upload the .tsv → "Replace spreadsheet" →
// separator Tab → DISABLE "Convert text to numbers/dates" so formulas import.
// Then set the "Imagen" column rows taller to see the thumbnails.

import { readFileSync, writeFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { loadCombos, displayName } from "./lib/combos.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MANIFEST = join(__dirname, "../output/manifest.json");
const OUT_TSV = join(__dirname, "../output/review-sheet.tsv");

if (!existsSync(MANIFEST)) {
  console.error(`❌  No existe ${MANIFEST}. Sube primero las imágenes a Blob.`);
  process.exit(1);
}

const manifest = JSON.parse(readFileSync(MANIFEST, "utf8"));
const rows = loadCombos();
const byId = new Map(rows.map((r) => [r.combo_id, r]));

const header = ["Imagen", "combo_id", "Plato", "Familia", "Tipo", "Aprobado", "Notas"];
const lines = [header.join("\t")];

let count = 0;
for (const [comboId, url] of Object.entries(manifest)) {
  const row = byId.get(comboId);
  const name = row ? displayName(row) : comboId;
  const family = row?.dish_family || "";
  const type = row?.type || "";
  // =IMAGE(url, 4, h, w) → mode 4 lets us set custom thumbnail size.
  const imageFormula = `=IMAGE("${url}", 4, 120, 120)`;
  lines.push([imageFormula, comboId, name, family, type, "", ""].join("\t"));
  count++;
}

writeFileSync(OUT_TSV, lines.join("\n"), "utf8");
console.log(`✨  ${count} filas → ${OUT_TSV}`);
console.log(`   Google Sheets: Archivo → Importar → sube el .tsv → separador Tabulación,`);
console.log(`   y DESACTIVA "convertir texto en números/fechas" para que entren las fórmulas.`);
