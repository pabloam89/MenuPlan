import guarniciones from "../data/recipes/guarniciones.json";
import { getCarbType, COMIDA_KCAL_SOFT_CAP } from "./validateMenu.js";

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

// Carb detection for full catalog recipes reuses validateMenu's taxonomy
// directly. It used to be a verbatim copy of that pattern list, which meant
// every taxonomy fix had to be made twice or the two would silently disagree
// about what counts as the same base.
const carbOfRecipe = getCarbType;

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
 * - Comida (segundo) slots: recipe + garnish + that day's primero must stay
 *   under COMIDA_KCAL_SOFT_CAP combined (see below)
 *
 * A user can pin a specific garnish to a dish (picked from the catalog) via
 * `pinnedByRecipeId`. A pinned garnish always wins over the automatic rules
 * (carb repetition / cena time limit / kcal cap) — the user's choice takes
 * priority.
 *
 * @param {Array<{slotId: string, recipeId: string}>} slotAssignments
 * @param {Object} poolById - { [recipeId]: catalogRecipe }
 * @param {Object<string,string>} [pinnedByRecipeId] - { [recipeId]: garnishId }
 * @param {Object[]} [safeGarnishes] - guarniciones pre-filtered for the
 *   group's allergies/intolerances/hasKids (see filterRecipes.js
 *   `filterGarnishes`). Defaults to the full unfiltered catalog, but every
 *   real caller should pass the filtered list — this default only exists so
 *   call sites that genuinely have no restriction context don't crash.
 * @returns {Array<{slotId: string, recipeId: string, garnishId?: string}>}
 */
export function pairGarnishes(slotAssignments, poolById, pinnedByRecipeId = {}, safeGarnishes = guarniciones) {
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

    // Comida (segundo) only: the day's primero kcal, so a garnish never turns
    // this pairing into a plato_unico-heavy combo that duplicates an existing
    // catalog dish (tester report: "Huevos fritos con puntillas" + the
    // "Arroz blanco" garnish landed at ~580kcal — basically "Arroz a la
    // cubana" — while still being served alongside a primero). Only "comida"
    // reaches this point with position "2" (cena was filtered out above), so
    // no extra position check is needed. null = no primero on record, so
    // there's nothing to guard against.
    let siblingKcal = null;
    if (mealType === "comida") {
      const siblingSlot = slotAssignments.find((s) => s.slotId === `${daySlug}_comida_1`);
      const siblingRecipe = siblingSlot ? poolById[siblingSlot.recipeId] : null;
      if (siblingRecipe) siblingKcal = siblingRecipe.kcal ?? 0;
    }
    const weightOk = (g) =>
      siblingKcal === null || (recipe.kcal ?? 0) + siblingKcal + (g.kcal ?? 0) <= COMIDA_KCAL_SOFT_CAP;

    // Pinned garnish (user picked it for this exact dish) wins over auto rules.
    // Either pinned per fixed-dish combo (pinnedByRecipeId) or baked into the
    // recipe itself when created in the recipe planner (recipe.pinnedGarnishId).
    let garnish = null;
    const pinnedId = pinnedByRecipeId[recipeId] ?? recipe.pinnedGarnishId;
    if (pinnedId) {
      garnish = guarniciones.find((g) => g.id === pinnedId) ?? null;
    }
    if (!garnish) {
      const fitsRules = (g) => {
        if (usedGarnishIds.has(g.id)) return false;
        if (isCena && g.time > CENA_MAX_GARNISH_TIME) return false;
        const gCarb = carbOfGarnish(g);
        if (gCarb && dayCarbs.has(gCarb)) return false;
        if (!weightOk(g)) return false;
        return true;
      };
      // Every garnish meeting the rules is an equally valid pick — choosing
      // randomly among them (instead of always the first match in the JSON's
      // fixed order) is what actually gives week-to-week variety.
      let candidates = safeGarnishes.filter(fitsRules);
      // Relax "not used yet this week" before giving up entirely, so a slot
      // never goes without a side just because the week is running low on
      // fresh garnishes (still respects the cena time cap, day carb rule and
      // kcal cap).
      if (candidates.length === 0) {
        candidates = safeGarnishes.filter((g) => {
          if (isCena && g.time > CENA_MAX_GARNISH_TIME) return false;
          const gCarb = carbOfGarnish(g);
          if (gCarb && dayCarbs.has(gCarb)) return false;
          if (!weightOk(g)) return false;
          return true;
        });
      }
      // Last resort: relax the kcal cap too, so a segundo is never left
      // without any garnish at all just because every remaining option
      // would push the comida over budget.
      if (candidates.length === 0) {
        candidates = safeGarnishes.filter((g) => {
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
