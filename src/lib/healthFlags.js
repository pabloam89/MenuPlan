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
  if (
    IRON_RE.test(hay) ||
    recipe?.mainProtein === "ternera" ||
    recipe?.category === "legumbres"
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
