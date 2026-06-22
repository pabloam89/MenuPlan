// Shared helpers: parse the dish/garnish CSV and build display names + prompts.
import { readFileSync } from "fs";
import Papa from "papaparse";

// Default location of the source CSV. Override with the CSV_PATH env var.
export const DEFAULT_CSV_PATH =
  process.env.CSV_PATH || "C:/Users/pablo/Downloads/dish_garnish_combinations.csv";

// Read + parse the CSV (UTF-8) into an array of row objects.
export function loadCombos(csvPath = DEFAULT_CSV_PATH) {
  const text = readFileSync(csvPath, "utf8");
  const { data, errors } = Papa.parse(text, {
    header: true,
    skipEmptyLines: true,
  });
  if (errors.length) {
    console.warn(`⚠️  CSV parse warnings: ${errors.length} (first: ${errors[0]?.message})`);
  }
  return data.filter((r) => r.combo_id);
}

// Human-readable dish name used both in the prompt and the review sheet.
export function displayName(row) {
  const dish = (row.dish_name || "").trim();
  const garnish = (row.garnish_name || "").trim();
  if (garnish) return `${dish} con ${garnish}`;
  return dish;
}

// The fixed style formula — identical wording for every image so the whole
// catalogue stays visually consistent (overhead, speckled ceramic bowl, slate).
export function buildPrompt(row) {
  const dish = displayName(row);
  return (
    `Fotografía gastronómica cenital a exactamente 90 grados (vista de pájaro perfecta) de ${dish}. ` +
    `Servido en un bol de cerámica rústica moteada de color crema con borde marrón oscuro, ` +
    `perfectamente centrado sobre un fondo de pizarra negra texturizada que llena todo el encuadre. ` +
    `Iluminación natural difusa y suave, texturas hiperrealistas, estética minimalista y rústica, ` +
    `calidad de libro de cocina. ` +
    `SOLO el bol con la comida en el encuadre: sin cubiertos, sin servilletas, sin manteles, ` +
    `sin cuencos adicionales, sin ingredientes sueltos alrededor, sin ningún objeto fuera del bol.`
  );
}

// Build a diverse pilot subset: the first N combos of every family, plus a few
// dish+garnish examples. Robust against unknown IDs since it reads from the rows.
export function selectPilot(rows, perFamily = 2) {
  const byFamily = new Map();
  const pilot = [];

  for (const row of rows) {
    const fam = row.dish_family || "otros";
    const count = byFamily.get(fam) || 0;
    if (count < perFamily) {
      pilot.push(row);
      byFamily.set(fam, count + 1);
    }
  }

  // Add a couple of dish+garnish combos so the team also reviews those.
  const combos = rows.filter((r) => r.type === "dish+garnish").slice(0, 3);
  for (const c of combos) {
    if (!pilot.some((p) => p.combo_id === c.combo_id)) pilot.push(c);
  }

  return pilot;
}
