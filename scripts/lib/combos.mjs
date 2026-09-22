// Shared helpers: parse the dish/garnish CSV and build display names + prompts.
import { readFileSync } from "fs";
import Papa from "papaparse";
import { disambiguationClause } from "../../src/lib/photoDisambiguation.js";

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

// La fórmula de estilo de la casa — idéntica para cada imagen, para que todo
// el catálogo se vea del mismo sitio.
//
// MÁRMOL, no pizarra. Esta función se quedó con el fondo negro de la primera
// hornada mientras gen-all-photos.mjs pasaba al mármol cálido, y como
// regen-one-dish.mjs tira de aquí, toda foto generada de una en una salía del
// estilo viejo sin que nada lo dijera. Se notaba solo al ver la foto al lado de
// las demás.
//
// OJO: gen-all-photos.mjs tiene su PROPIA copia de este prompt, con las ramas
// de purés de bebé que aquí no hacen falta. Si se cambia el estilo, hay que
// cambiarlo en los dos sitios o volver a pasar lo mismo.
export function buildPrompt(row, opts = {}) {
  const dish = displayName(row);
  // El recipiente es SIEMPRE el mismo bol, salvo lo que sale del horno: una
  // bandeja de verduras asadas metida en un cuenco pierde justo lo que la hace
  // reconocible, que es la bandeja con los bordes tostados.
  const recipiente = opts.bandeja
    ? "Servido en una bandeja de horno rectangular de cerámica artesanal de color blanco roto, con los jugos tostados del asado en el fondo, "
    : "Servido en un bol de cerámica artesanal de color blanco roto con borde irregular, ";
  return (
    `Fotografía gastronómica cenital a exactamente 90 grados (vista de pájaro perfecta) de ${dish}. `
    + recipiente
    + `perfectamente centrado sobre una superficie de mármol blanco cálido con vetas grises suaves que llena todo el encuadre. `
    + `Iluminación lateral dorada y cálida con destello suave que crea brillos tentadores sobre la comida, `
    + `resaltando jugosidad, vapor delicado y texturas irresistibles. `
    + `Colores vivos, ricos y muy saturados; salsas brillantes y espesas; ingredientes jugosos y apetitosos; `
    + `un hilo fino de aceite de oliva virgen extra añadido en el último momento; hierbas frescas vibrantes como detalle final. `
    + `Estética de portada de revista gastronómica de lujo, hiperrealista, fotografía que se te hace la boca agua, calidad editorial Bon Appétit. `
    + disambiguationClause(dish, { esCombo: Boolean((row.garnish_name || "").trim()) })
    + `SOLO el bol con la comida en el encuadre: sin cubiertos, sin servilletas, sin manteles, `
    + `sin cuencos adicionales, sin ingredientes sueltos alrededor, sin ningún objeto fuera del bol. `
    + `SIN TEXTO, SIN LETRAS, SIN PALABRAS, SIN NÚMEROS en la imagen — imagen pura sin ninguna superposición gráfica.`
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
