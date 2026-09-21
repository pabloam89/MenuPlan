// Heuristic health flags derived from a recipe's name + ingredients (+ macros).
//
// Re-tagging all 244 catalog recipes by hand is not worth it, so flags are
// derived at catalog-load time (see data/recipeCatalog.js) and merged with any
// explicitly declared `healthFlags`. They feed the LLM's "menú más cuidado"
// bias (see aiPlanner.js SYSTEM_PROMPT + decisionCatalog includeHealth).
//
// These are coarse signals, not medical claims: a missing flag is not a promise.

import { recipeHaystack } from "./recipeText.js";

export const HEALTH_FLAGS = [
  "frito",
  "embutido",
  "alto_sodio",
  "picante",
  "acido",
  "azucar_anadido",
  "rico_hierro",
];

const PATTERNS = {
  frito: /\b(frito|frita|rebozad|empanad|bunuelo|croqueta|tempura|fritura|churro|a la romana|a la andaluza|san ?jacobo|escalope|flamenqu|milanesa|varita|nugget|bravas|padron|palitos de merluza|palitos de pescado|huevos rotos)/,
  embutido: /\b(chorizo|salchichon|salchicha|bacon|panceta|fuet|salami|mortadela|jamon|sobrasada|butifarra|morcilla|cecina|lomo embuchado)/,
  picante: /\b(picante|guindilla|chili|jalapeno|cayena|tabasco|sriracha|pimenton picante|salsa brava|harissa)/,
  acido: /\b(vinagre|escabeche|encurtido|limon|lima|salsa de tomate|tomate frito|citric)/,
  azucar_anadido: /\b(azucar|miel|chocolate|nocilla|nutella|caramelo|sirope|jarabe|mermelada|leche condensada|galleta|bizcocho|reposteria|flan|natilla|helado|dulce de leche)/,
};

// alto_sodio and rico_hierro have extra (non-name) signals, handled separately.
const HIGH_SODIUM_RE = /\b(cubito|pastilla de caldo|caldo concentrado|salsa de soja|anchoa|aceituna|encurtido|conserva|bacalao salado|queso curado|feta|beicon|panceta)/;
const IRON_RE = /\b(lenteja|garbanzo|alubia|judia blanca|higado|morcilla|espinaca|acelga|berberecho|almeja|mejillon|ternera|solomillo|carne roja|remolacha)/;

/**
 * Derive coarse health flags for a raw catalog recipe.
 * @param {Object} recipe - catalog shape (name, ingredients, mainProtein, category, macros)
 * @returns {string[]}
 */
export function deriveHealthFlags(recipe) {
  const hay = recipeHaystack(recipe);
  const flags = new Set(Array.isArray(recipe?.healthFlags) ? recipe.healthFlags : []);

  for (const [flag, re] of Object.entries(PATTERNS)) {
    if (re.test(hay)) flags.add(flag);
  }

  // Sodium: cured meats already imply it, plus salty pantry staples.
  if (flags.has("embutido") || HIGH_SODIUM_RE.test(hay)) flags.add("alto_sodio");

  // Iron: red meat / legumes / leafy greens / iron-rich shellfish.
  //
  // El HIERRO MEDIDO se suma a la lista de palabras, no la sustituye, y eso es
  // deliberado: el hierro solo llega a 166 de los 371 ingredientes con ficha
  // —CIQUAL y USDA lo publican, y las 198 fichas de BEDCA no lo traen—, así que
  // sustituir la heurística por el dato DEJARÍA DE MARCAR platos que hoy sí se
  // marcan. Sumándolo, la bandera solo puede mejorar: nunca se quita una que ya
  // estaba, y aparece en platos con hierro de verdad que ninguna de las quince
  // palabras nombra. Cuando el hierro esté en toda la tabla, esta función podrá
  // invertirse y la lista pasará a ser el respaldo.
  //
  // El umbral son 3,5 mg por ración: el 25 % de la ingesta diaria recomendada
  // para una mujer adulta (14 mg), que es el corte que usa el Reglamento UE
  // 1169/2011 para poder decir «alto contenido en» en una etiqueta. No es un
  // número elegido a ojo.
  const hierroPorRacion = recipe?.macros?.iron_mg ?? recipe?.iron_mg ?? null;
  if (
    IRON_RE.test(hay) ||
    recipe?.mainProtein === "ternera" ||
    recipe?.category === "legumbres" ||
    (hierroPorRacion != null && hierroPorRacion >= 3.5)
  ) {
    flags.add("rico_hierro");
  }

  return Array.from(flags);
}

/**
 * Defensive helper for any place that registers/joins a recipe at runtime
 * (user-created recipes, AI-generated recipes, remote merges): returns the
 * recipe unchanged if it already carries healthFlags, otherwise derives them.
 * Keeps every registration point honest without recomputing on recipes that
 * already went through the catalog pipeline.
 * @param {Object} recipe
 * @returns {Object}
 */
export function ensureHealthFlags(recipe) {
  return Array.isArray(recipe?.healthFlags) ? recipe : { ...recipe, healthFlags: deriveHealthFlags(recipe) };
}
