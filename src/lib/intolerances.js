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
      "helado", "yogur", "yogurt",
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

// ── Vegetarian / vegan ──────────────────────────────────────────────────
// Deliberately NOT in INTOLERANCE_RULES / matched via recipeHitsIntolerances:
// unlike lactose/fructose/sorbitol, the catalog already classifies every
// recipe's protein through a structured, fixed enum (mainProtein +
// extraProteins — see recipeSchema.js), so checking that field is far more
// reliable than keyword-matching ingredient text (which would false-positive
// on, say, "pollo" appearing nowhere but still miss a recipe whose only meat
// signal is an uncommon cut name). Also never adaptable — there's no
// vegetarian substitution for a chicken dish the way there is for milk — so
// these ids are intentionally absent from substitutions.js SUBSTITUTION_RULES
// and isAdaptableRestriction() correctly returns false for them by default.
export const DIET_RULES = {
  vegetariano: { label: "Vegetariano" },
  vegano: { label: "Vegano" },
};

const MEAT_FISH_PROTEINS = new Set([
  "pollo", "pavo", "cerdo", "ternera", "pescado_blanco", "pescado_azul", "marisco",
]);

// Animal products a structured protein check can't see (dairy, honey).
// Broader than lactosa_fina's keyword list on purpose: lactosa_fina
// deliberately tolerates cured cheese/butter (the "fina" variant), but vegano
// excludes all dairy outright.
const VEGAN_ANIMAL_RE = compileKeywordRegex([
  "leche", "nata", "mantequilla", "queso", "requeson", "yogur", "yogurt",
  "mozzarella", "ricotta", "mascarpone", "cuajada", "miel", "bechamel",
]);

/**
 * Structured diet check (vegetariano/vegano) — a sibling to
 * recipeHitsIntolerances, not a replacement: call both when checking a
 * recipe against a member's restriction ids.
 * @param {Object} recipe
 * @param {Iterable<string>} restrictionIds - same ids as recipeHitsIntolerances
 * @returns {boolean}
 */
export function recipeViolatesDiet(recipe, restrictionIds) {
  if (!recipe) return false;
  const ids = new Set(restrictionIds ?? []);
  if (ids.size === 0) return false;

  if (ids.has("vegetariano") || ids.has("vegano")) {
    const proteins = [recipe.mainProtein, ...(recipe.extraProteins ?? [])];
    if (proteins.some((p) => MEAT_FISH_PROTEINS.has(p))) return true;
  }
  if (ids.has("vegano")) {
    const proteins = [recipe.mainProtein, ...(recipe.extraProteins ?? [])];
    if (proteins.includes("huevo")) return true;
    if (VEGAN_ANIMAL_RE.test(recipeHaystack(recipe))) return true;
  }
  return false;
}
