// Build the rejections JSON consumed by gen-all-dishes.mjs --rejections.
// It bundles two kinds of fixes:
//   1) Name-divergence combos (CSV name already corrected) → empty reason, so the
//      base prompt regenerates them from the corrected dish name.
//   2) True generation failures (name was already correct) → targeted feedback.
//
// Output: output/rejections-fix.json  [{ combo_id, name, reason }]

import { writeFileSync, mkdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { loadCombos, displayName } from "./lib/combos.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, "..", "output", "rejections-fix.json");
if (!existsSync(dirname(OUT))) mkdirSync(dirname(OUT), { recursive: true });

const rows = loadCombos();
const byId = new Map(rows.map((r) => [r.combo_id, r]));

// (1) The 26 name-divergence base dishes (all dish-only, combo_id === dish_id).
const CORRECTED = [
  "sopas_cremas_013", "ensaladas_verduras_003", "ensaladas_verduras_018", "cenas_rapidas_005",
  "bebes_001", "bebes_002", "bebes_003", "bebes_004", "bebes_005", "bebes_006", "bebes_007",
  "bebes_008", "bebes_009", "bebes_010", "bebes_011", "bebes_012", "bebes_013", "bebes_014",
  "bebes_015", "bebes_016", "bebes_017", "bebes_018", "bebes_019", "bebes_020", "bebes_021", "bebes_022",
];

// (2a) Emperador a la plancha — every garnish combo of dish pescados_020.
const EMPERADOR_FEEDBACK =
  "El emperador (pez espada) es un PESCADO BLANCO. Muestra un filete o rodaja de pescado " +
  "blanco a la plancha, con la carne de color blanco marfil y marcas de plancha doradas. " +
  "NO es salmón: nada de carne rosada ni anaranjada.";

// (2b) Sopa de fideos — Spanish, not Japanese ramen.
const SOPA_FIDEOS_FEEDBACK =
  "Sopa de fideos ESPAÑOLA: fideos finos en un caldo dorado claro, casera y sencilla. " +
  "NO es un ramen japonés: sin alga nori, sin huevo cocido, sin lonchas de cerdo chashu, " +
  "sin cebolleta en juliana ni palillos.";

const entries = [];

for (const id of CORRECTED) {
  const row = byId.get(id);
  if (!row) { console.warn(`⚠️  ${id} no está en el CSV`); continue; }
  entries.push({ combo_id: id, name: displayName(row), reason: "" });
}

for (const [id, row] of byId) {
  if (row.dish_id === "pescados_020") {
    entries.push({ combo_id: id, name: displayName(row), reason: EMPERADOR_FEEDBACK });
  }
}

{
  const row = byId.get("sopas_cremas_002");
  if (row) entries.push({ combo_id: "sopas_cremas_002", name: displayName(row), reason: SOPA_FIDEOS_FEEDBACK });
}

writeFileSync(OUT, JSON.stringify(entries, null, 2), "utf8");
console.log(`✅  ${entries.length} combos → ${OUT}`);
console.log(`   corregidos=${CORRECTED.length}  emperador=${entries.filter(e => e.combo_id.startsWith("pescados_020")).length}  sopa_fideos=1`);
