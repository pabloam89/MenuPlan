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
 * For each "principal" recipe in a comida_2 or cena slot, picks a garnish
 * from guarniciones.json at random among every candidate that satisfies the
 * rules below (never just the first match in the JSON's fixed order — that
 * used to make e.g. "pasta al ajillo" win almost every cena, every week).
 *
 * Rules:
 * - No repeated carb type within the same day (main recipes + garnishes combined)
 * - No repeated garnish across the week
 * - Cena slots: garnish time must be ≤ 15 min
 *
 * A user can pin a specific garnish to a dish (picked from the catalog) via
 * `pinnedByRecipeId`. A pinned garnish always wins over the automatic rules
 * (carb repetition / cena time limit) — the user's choice takes priority.
 *
 * @param {Array<{slotId: string, recipeId: string}>} slotAssignments
 * @param {Object} poolById - { [recipeId]: catalogRecipe }
 * @param {Object<string,string>} [pinnedByRecipeId] - { [recipeId]: garnishId }
 * @returns {Array<{slotId: string, recipeId: string, garnishId?: string}>}
 */
export function pairGarnishes(slotAssignments, poolById, pinnedByRecipeId = {}) {
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

    // Pinned garnish (user picked it for this exact dish) wins over auto rules.
    let garnish = null;
    const pinnedId = pinnedByRecipeId[recipeId];
    if (pinnedId) {
      garnish = guarniciones.find((g) => g.id === pinnedId) ?? null;
    }
    if (!garnish) {
      const fitsRules = (g) => {
        if (usedGarnishIds.has(g.id)) return false;
        if (isCena && g.time > CENA_MAX_GARNISH_TIME) return false;
        const gCarb = carbOfGarnish(g);
        if (gCarb && dayCarbs.has(gCarb)) return false;
        return true;
      };
      // Every garnish meeting the rules is an equally valid pick — choosing
      // randomly among them (instead of always the first match in the JSON's
      // fixed order) is what actually gives week-to-week variety.
      let candidates = guarniciones.filter(fitsRules);
      // Relax "not used yet this week" before giving up entirely, so a slot
      // never goes without a side just because the week is running low on
      // fresh garnishes (still respects the cena time cap and day carb rule).
      if (candidates.length === 0) {
        candidates = guarniciones.filter((g) => {
          if (isCena && g.time > CENA_MAX_GARNISH_TIME) return false;
          const gCarb = carbOfGarnish(g);
          if (gCarb && dayCarbs.has(gCarb)) return false;
          return true;
        });
      }
      if (candidates.length > 0) {
        garnish = candidates[Math.floor(Math.random() * candidates.length)];
      }
    }

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
