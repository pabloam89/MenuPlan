import { compileKeywordRegex, recipeHaystack } from "./recipeText.js";

// Hard dietary restrictions that are NOT the 14 UE allergens but still exclude
// recipes outright: food intolerances (lactose/fructose/sorbitol) and temporary
// states (pregnancy/breastfeeding). Unlike the allergen list — which the catalog
// encodes per recipe — these are matched heuristically against the recipe name +
// ingredient names, because the catalog carries no structured field for them.
//
// Over-exclusion is the safe direction here (especially for embarazo), so the
// keyword lists favor coverage. Cured cheeses/butter are intentionally NOT in
// `lactosa_fina` (usually tolerated); that's the whole point of the "fina"
// variant vs a full "leche" allergen.

export const INTOLERANCE_RULES = {
  lactosa_fina: {
    label: "Intolerancia a la lactosa",
    kind: "intolerance",
    keywords: [
      "leche", "nata", "bechamel", "queso fresco", "requeson", "mozzarella",
      "ricotta", "mascarpone", "cuajada", "crema de leche", "batido de leche",
      "helado",
    ],
  },
  fructosa: {
    label: "Intolerancia a la fructosa",
    kind: "intolerance",
    keywords: [
      "fructosa", "miel", "jarabe", "sirope", "agave", "manzana", "pera",
      "mango", "cereza", "sandia", "higo", "esparrago", "alcachofa",
      "zumo de fruta", "mermelada",
    ],
  },
  sorbitol: {
    label: "Intolerancia al sorbitol",
    kind: "intolerance",
    keywords: [
      "sorbitol", "ciruela", "melocoton", "nectarina", "albaricoque",
      "pera", "cereza", "manzana", "sin azucar",
    ],
  },
  embarazo: {
    label: "Embarazo",
    kind: "state",
    keywords: [
      // Raw / undercooked
      "crudo", "cruda", "sushi", "tartar", "carpaccio", "ceviche",
      // Cured / smoked
      "ahumado", "pate", "foie", "chorizo", "salchichon", "fuet",
      "jamon serrano", "jamon iberico", "lomo embuchado", "sobrasada",
      "cecina", "salami",
      // Unpasteurized / soft-mould cheeses
      "queso azul", "roquefort", "cabrales", "gorgonzola", "brie", "camembert",
      // High-mercury fish
      "pez espada", "atun rojo", "cazon", "tiburon", "emperador", "lucio",
      // Alcohol used to be hard-excluded here — see ALCOHOL_COCINA below for
      // why it's now adapted instead.
    ],
  },
  lactancia: {
    label: "Lactancia",
    kind: "state",
    keywords: [
      "pez espada", "atun rojo", "cazon", "tiburon", "emperador",
      // Alcohol used to be hard-excluded here — see ALCOHOL_COCINA below.
    ],
  },
  // Cooking alcohol shared by embarazo + lactancia. NOT a standalone
  // user-selectable restriction: buildGroupContext (aiPlanner.js) adds this id
  // automatically whenever a member has embarazo or lactancia active. Unlike
  // the items above (no safe swap exists), real alcohol-free wine/beer/cider
  // are normal supermarket products in Spain, so this is handled as an
  // ADAPTATION (see substitutions.js) rather than a hard exclusion.
  //
  // "jerez" is deliberately not a keyword: in this catalog it only ever shows
  // up inside "Vinagre de Jerez" (sherry VINEGAR, whose alcohol has already
  // fermented into acetic acid — not a comparable risk to a drink), so it was
  // a pure false positive that excluded recipes for no reason.
  alcohol_cocina: {
    label: "Alcohol de cocina",
    kind: "state-component",
    keywords: [
      "vino", "cerveza", "licor", "ron", "whisky", "brandy", "coñac",
      "vodka", "ginebra", "sidra", "cava", "champan",
    ],
  },
};

const INTOLERANCE_RE = Object.fromEntries(
  Object.entries(INTOLERANCE_RULES).map(([id, rule]) => [id, compileKeywordRegex(rule.keywords)]),
);

/**
 * Does a recipe violate any of the given restriction rule ids?
 * @param {Object} recipe
 * @param {Iterable<string>} ruleIds - keys of INTOLERANCE_RULES
 * @returns {boolean}
 */
export function recipeHitsIntolerances(recipe, ruleIds) {
  const ids = Array.from(ruleIds ?? []).filter((id) => INTOLERANCE_RE[id]);
  if (ids.length === 0) return false;
  const haystack = recipeHaystack(recipe);
  return ids.some((id) => INTOLERANCE_RE[id].test(haystack));
}
