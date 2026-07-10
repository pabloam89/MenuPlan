// "Dominant component" classifier: proteina / hidrato / verdura / mixto,
// derived from a recipe's ACTUAL ingredient list (never from its name — a
// dish called "Ensalada César con pollo" is mixto, not verdura, because the
// chicken carries as much weight as the lettuce).
//
// Design choice: a runtime classifier, matching the existing pattern of
// `carbTypeFromText`/`getCarbType` (validateMenu.js) and
// `proteinFromText`/`PROTEIN_GROUP_MAP` (aiPlanner.js) — reusable functions
// derived from ingredient text, not a new persisted field on the 244 recipe
// JSONs. Reasons:
//   1. It's exactly the same shape of problem those two already solve
//      (classify a dish from its ingredient/name text into a small
//      taxonomy), so a third runtime classifier keeps all three consistent
//      and colocated in behavior instead of splitting the catalog into
//      "some taxonomy lives in JSON, some lives in code".
//   2. A persisted field is a strictly bigger-blast-radius change: it would
//      touch all 244 JSON files, recipeSchema.js, validate-catalog.mjs, and
//      would still need a script to *derive* the value in the first place —
//      i.e. this same classifier, just run once and frozen. A frozen value
//      goes stale the moment ingredients are edited (portion sizes, recipe
//      tweaks); a runtime function never can.
//   3. Nothing in this phase's scope needs the value to be authorable by
//      hand (unlike e.g. `category`, which is a deliberate editorial choice)
//      — it's fully mechanical from ingredients, so deriving it at call time
//      is strictly safer.
//
// Explicitly out of scope (per Fase 4 instructions): this module does not
// wire into validateMenu.js or the school-menu repeat-avoidance rule. It only
// exports the classifier + its building blocks so a future phase can decide
// whether/how to use it.

import { compileKeywordRegex, normalizeText } from "./recipeText.js";

// Ingredient-level keyword -> component regexes. Deliberately ingredient
// vocabulary, not dish vocabulary (e.g. no "guiso", "sopa" here — those
// describe the dish, not what's in it).
//
// Built with `compileKeywordRegex` (leading `\b` only, no trailing one) so
// plural/inflected forms still match — e.g. keyword "acelga" must match
// ingredient text "acelgas". A trailing `\b` would silently fail on every
// plural, which is exactly the bug an early version of this file had.
const PROTEIN_KEYWORDS = [
  "pollo", "pavo", "ternera", "cerdo", "carne", "lomo", "chorizo", "salchich", "jamon",
  "bacon", "beicon", "panceta", "tocino", "cordero", "solomillo", "chuleta", "morcilla",
  "picada", "costilla", "entrecot", "hamburgues", "albondig", "butifarra", "fuet",
  "mortadela", "fiambre", "conejo", "pato", "higado", "codorniz",
  "merluza", "salmon", "bacalao", "atun", "gamba", "langostino", "langosta", "cigala",
  "sardina", "anchoa", "calamar", "sepia", "mejillon", "pescado", "rape", "lubina",
  "rodaballo", "dorada", "boqueron", "besugo", "lenguado", "emperador", "caballa",
  "trucha", "almeja", "pulpo", "rosada", "bonito", "berberecho", "chirla", "navaja",
  "coquina", "marisco", "bogavante",
  "huevo",
  "lentej", "garbanz", "alubi", "judia", "frijol", "habas", "soja", "tofu", "tempeh", "seitan",
];

const HIDRATO_KEYWORDS = [
  "pasta", "espagueti", "macarron", "fideo", "tallarin", "penne", "lasaña", "lasana",
  "canelones", "ravioli", "arroz", "paella", "risotto", "patata", "papa", "quinoa",
  "cuscus", "couscous", "pan", "harina", "avena", "cereales", "tostada", "boller", "bulgur",
];

const VERDURA_KEYWORDS = [
  "lechuga", "tomate", "cebolla", "pimiento", "calabacin", "berenjena", "zanahoria",
  "brocoli", "coliflor", "espinaca", "acelga", "calabaza", "puerro", "apio",
  "champinon", "seta", "pepino", "rabano", "remolacha", "alcachofa", "esparrago",
  "guisante", "col", "repollo", "endibia", "escarola", "rucula", "canonigo", "brotes",
  "maiz", "pepinillo", "nabo", "verdura", "calcot", "escalivada",
];

const PROTEIN_INGREDIENT_RE = compileKeywordRegex(PROTEIN_KEYWORDS);
const HIDRATO_INGREDIENT_RE = compileKeywordRegex(HIDRATO_KEYWORDS);
const VERDURA_INGREDIENT_RE = compileKeywordRegex(VERDURA_KEYWORDS);

// "Judía verde" (green bean, a vegetable) vs. plain "judía" (a legume/protein)
// — checked first, ahead of the generic classifiers, so the phrase wins over
// the bare PROTEIN_KEYWORDS "judia" entry.
const JUDIA_VERDE_RE = /judias?\s*verdes?/;

// "Caldo de pollo/pescado/carne" is a flavoring liquid (stock), not the
// dish's protein component — checked first so it never falls into
// PROTEIN_KEYWORDS via the "pollo"/"pescado"/"carne" it names.
const CALDO_RE = /\bcaldo\b/;

// Rough weight to assign a "ud" (unit) ingredient when comparing against
// gram/ml amounts — precision doesn't matter here, only that a whole onion
// or chicken breast isn't treated as weighing nothing next to 200 g of rice.
const ASSUMED_GRAMS_PER_UNIT = 80;

function estimateGrams(ingredient) {
  const { amount, unit } = ingredient ?? {};
  if (typeof amount !== "number" || !Number.isFinite(amount)) return 0;
  if (unit === "g" || unit === "ml") return amount;
  if (unit === "ud") return amount * ASSUMED_GRAMS_PER_UNIT;
  return 0; // qualitative units ("al gusto", "pizca", "c/n") carry no weight
}

/**
 * Classify a single ingredient name into a component bucket, or null if it's
 * a condiment/spice/dairy/liquid that doesn't carry a dish's "component"
 * identity (oil, salt, cheese, stock, wine...).
 * @param {string} name
 * @returns {"proteina"|"hidrato"|"verdura"|null}
 */
export function componentOfIngredient(name) {
  const n = normalizeText(name);
  if (CALDO_RE.test(n)) return null;
  if (JUDIA_VERDE_RE.test(n)) return "verdura";
  if (PROTEIN_INGREDIENT_RE.test(n)) return "proteina";
  if (HIDRATO_INGREDIENT_RE.test(n)) return "hidrato";
  if (VERDURA_INGREDIENT_RE.test(n)) return "verdura";
  return null;
}

// A component "wins" outright only if it clearly dominates the weighed
// ingredients; otherwise the dish is mixto. Both thresholds are deliberately
// conservative (favor "mixto" over a wrong single label) since this feeds no
// safety rule — being cautious here just means a dish gets classified as
// mixto instead of a debatable single bucket.
const DOMINANCE_MIN_SHARE = 0.55;
const DOMINANCE_MIN_LEAD = 0.2;

/**
 * @param {{ingredients: {name:string, amount:number, unit:string}[]}} recipe
 * @returns {"proteina"|"hidrato"|"verdura"|"mixto"}
 */
export function dominantComponentOf(recipe) {
  const totals = { proteina: 0, hidrato: 0, verdura: 0 };
  for (const ing of recipe?.ingredients ?? []) {
    const component = componentOfIngredient(ing?.name);
    if (!component) continue;
    totals[component] += estimateGrams(ing);
  }
  const total = totals.proteina + totals.hidrato + totals.verdura;
  if (total <= 0) return "mixto";

  const entries = Object.entries(totals).sort((a, b) => b[1] - a[1]);
  const [topGroup, topWeight] = entries[0];
  const [, secondWeight] = entries[1];
  const topShare = topWeight / total;
  const secondShare = secondWeight / total;

  if (topShare >= DOMINANCE_MIN_SHARE && topShare - secondShare >= DOMINANCE_MIN_LEAD) {
    return topGroup;
  }
  return "mixto";
}
