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
    disambiguationClause(dish) +
    `SOLO el bol con la comida en el encuadre: sin cubiertos, sin servilletas, sin manteles, ` +
    `sin cuencos adicionales, sin ingredientes sueltos alrededor, sin ningún objeto fuera del bol.`
  );
}

// Extra guidance for dish names that generative models routinely misread. The
// biggest offender is "… con tomate" on rice/pasta, which comes out as raw diced
// tomato instead of a cooked red tomato sauce coating the dish.
function disambiguationClause(dish) {
  const d = dish.toLowerCase();
  const clauses = [];

  const hasTomate = /\btomate\b/.test(d);
  const isSalad = /ensalada|gazpacho|tomate fresco|tomate natural/.test(d);
  const isStarch = /arroz|pasta|macarrones|espagueti|fideos|ñoquis|noquis/.test(d);
  if (hasTomate && isStarch && !isSalad) {
    clauses.push(
      `El tomate es salsa de tomate frito COCINADA, roja y brillante, en cantidad MODERADA ` +
        `sobre arroz blanco suelto: se ven claramente los granos de arroz alrededor y por debajo, ` +
        `la salsa NO cubre todo el bol ni forma una capa gruesa y uniforme; ` +
        `presentación casera, ligera y apetitosa. NO tomate crudo en dados ni rodajas frescas. `,
    );
  }

  // "patatas fritas" comes out as a healthy yogurt/cucumber plate far too often —
  // the model drops the fries entirely. Force the classic Spanish look and ban the
  // yogurt/cucumber sauce it keeps inventing.
  if (/patatas fritas/.test(d)) {
    clauses.push(
      `Las patatas fritas son OBLIGATORIAS y bien visibles: bastones alargados de patata ` +
        `fritos, dorados y crujientes, tipo patatas fritas caseras clásicas, apiladas junto al ` +
        `plato principal ocupando buena parte del bol. NADA de salsa de yogur, NADA de pepino, ` +
        `NADA de crema blanca ni tzatziki. `,
    );
  }

  return clauses.join("");
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
