import guarniciones from "../data/recipes/guarniciones.json";

const CENA_MAX_GARNISH_TIME = 15;

// Same patterns as validateMenu.js getCarbType, applied to garnish shortName
const CARB_PATTERNS = [
  [/arroz/, "arroz"],
  [/pasta|ajillo.*pasta|espagueti/, "pasta"],
  [/patata|pur[eé]/, "patatas"],
  [/quinoa/, "quinoa"],
  [/c[uú]sc[uú]s/, "cuscus"],
  [/\bpan\b/, "pan"],
];

function carbOfGarnish(g) {
  const text = (g.shortName ?? g.name)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
  for (const [pat, carb] of CARB_PATTERNS) {
    if (pat.test(text)) return carb;
  }
  return null;
}

// Carb detection from a full catalog recipe (same logic as validateMenu getCarbType)
const RECIPE_CARB_PATTERNS = [
  [/arroz|paella|risotto/, "arroz"],
  [/pasta|macarr[oó]n|espagueti|tallar[íi]n|fideo|penne|lasa[ñn]a|canelones|ravioli/, "pasta"],
  [/patata|papa\b/, "patatas"],
  [/quinoa/, "quinoa"],
  [/c[uú]sc[uú]s|couscous/, "cuscus"],
  [/\bpan\b|s[áa]ndwich|bocadillo|tostada|rebanada/, "pan"],
];

function carbOfRecipe(recipe) {
  const text = [recipe.name, ...recipe.ingredients.map((i) => i.name)]
    .join(" ")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
  for (const [pat, carb] of RECIPE_CARB_PATTERNS) {
    if (pat.test(text)) return carb;
  }
  return null;
}

/**
 * For each "principal" recipe in a comida_2 or cena slot, deterministically
 * selects a garnish from guarniciones.json.
 *
 * Rules:
 * - No repeated carb type within the same day (main recipes + garnishes combined)
 * - No repeated garnish across the week
 * - Cena slots: garnish time must be ≤ 15 min
 *
 * @param {Array<{slotId: string, recipeId: string}>} slotAssignments
 * @param {Object} poolById - { [recipeId]: catalogRecipe }
 * @returns {Array<{slotId: string, recipeId: string, garnishId?: string}>}
 */
export function pairGarnishes(slotAssignments, poolById) {
  // Collect carbs already used by main recipes, per day
  const dayUsedCarbs = {};
  for (const { slotId, recipeId } of slotAssignments) {
    const daySlug = slotId.split("_")[0];
    const recipe = poolById[recipeId];
    if (!recipe) continue;
    const carb = carbOfRecipe(recipe);
    if (!carb) continue;
    if (!dayUsedCarbs[daySlug]) dayUsedCarbs[daySlug] = new Set();
    dayUsedCarbs[daySlug].add(carb);
  }

  const usedGarnishIds = new Set();

  return slotAssignments.map((slot) => {
    const { slotId, recipeId } = slot;
    const recipe = poolById[recipeId];

    if (!recipe || recipe.type !== "principal") return slot;

    const parts = slotId.split("_");
    const daySlug = parts[0];
    const mealType = parts[1];
    const position = parts[2];

    // Only pair comida_2 and cena
    if (mealType === "comida" && position !== "2") return slot;
    if (mealType !== "comida" && mealType !== "cena") return slot;

    const isCena = mealType === "cena";
    const dayCarbs = dayUsedCarbs[daySlug] ?? new Set();

    const garnish = guarniciones.find((g) => {
      if (usedGarnishIds.has(g.id)) return false;
      if (isCena && g.time > CENA_MAX_GARNISH_TIME) return false;
      const gCarb = carbOfGarnish(g);
      if (gCarb && dayCarbs.has(gCarb)) return false;
      return true;
    });

    if (!garnish) return slot;

    usedGarnishIds.add(garnish.id);

    // Register garnish carb so later slots in the same day don't repeat it
    const gCarb = carbOfGarnish(garnish);
    if (gCarb) {
      if (!dayUsedCarbs[daySlug]) dayUsedCarbs[daySlug] = new Set();
      dayUsedCarbs[daySlug].add(gCarb);
    }

    return { ...slot, garnishId: garnish.id };
  });
}
