import { recipeCatalog } from "../data/recipeCatalog.js";
import { normalizeAllergenId, recipeIngredientsHitAllergens } from "../lib/allergens.js";
import { recipeHitsIntolerances } from "../lib/intolerances.js";
import { isAdaptableRestriction, planAdaptations } from "../lib/substitutions.js";
import { ingredientWords, wordsOverlapEither } from "./normalizePantryInput.js";

function currentSeason() {
  const month = new Date().getMonth() + 1;
  if (month >= 6 && month <= 9) return "verano";
  if (month === 12 || month <= 2) return "invierno";
  return null;
}

/**
 * Proportion (0–1) of a recipe's ingredients the user already has at home.
 * Soft signal only — never excludes a recipe, just ranks it. Matches on
 * whole words (via normalizePantryInput's helpers), not raw substrings: a
 * naive `.includes("pollo")` would also match "Repollo" (cabbage).
 *
 * @param {Object} recipe
 * @param {string[]} pantryNormalized - normalized keys from user_pantry,
 *   e.g. ["pollo", "tomate", "pechuga_pollo"]
 */
export function scorePantryMatch(recipe, pantryNormalized) {
  if (!pantryNormalized || pantryNormalized.length === 0) return 0;
  if (!recipe.ingredients?.length) return 0;

  const recipeIngredientWords = recipe.ingredients.map((ing) => ingredientWords(ing.name));
  let matches = 0;
  for (const pantryKey of pantryNormalized) {
    const pantryWords = pantryKey.split("_");
    if (recipeIngredientWords.some((words) => wordsOverlapEither(pantryWords, words))) {
      matches++;
    }
  }
  return matches / recipe.ingredients.length;
}

/**
 * Filter the recipe catalog based on user/group constraints.
 *
 * @param {Object} opts
 * @param {string[]} opts.allergies  - member allergens (app format: "Gluten", "Frutos secos")
 * @param {string[]} opts.dislikes   - disliked ingredients (app format: "Hígado", "Coliflor")
 * @param {boolean}  opts.hasKids    - if true, only kidFriendly recipes
 * @param {number}   opts.maxTime    - max cooking time in minutes (weekday or weekend)
 * @param {string[]} opts.kitchenTools - available tools ["Horno", "Batidora", ...]
 * @param {string[]} [opts.pantryIngredients] - normalized user_pantry keys (e.g. ["pollo", "tomate"]);
 *   never excludes recipes, only annotates each with a `pantryScore` (see scorePantryMatch)
 * @param {Object[]} [opts.extraRecipes] - user-created recipes, joined into the same pool
 * @returns {{ recipes: Object[], error: string|null }}
 */
export function filterRecipes({
  allergies = [],
  // Predefined intolerances + dietary states (lactosa_fina, fructosa,
  // sorbitol, embarazo, lactancia) — see lib/intolerances.js. Hard exclusion.
  intolerances = [],
  dislikes = [],
  hasKids = false,
  maxTime = 120,
  kitchenTools = [],
  cookLevel = "normal",
  isBabyGroup = false,
  pantryIngredients = [],
  extraRecipes = [],
  // "preferred" (default) | "only" (only the user's recipes) | "catalog"
  // (only the bundled catalog). Set from data.recipeMode.
  recipeMode = "preferred",
  // Set<string> of recipe ids the user favorited for this group (soft ranking
  // signal only — annotates each recipe with `isFavorite`, never excludes).
  favoriteIds = null,
} = {}) {
  const blockedAllergens = new Set(allergies.map(normalizeAllergenId));
  const activeIntolerances = Array.from(new Set(intolerances));
  const dislikeLower = dislikes.map((d) => d.toLowerCase());
  const toolsLower = new Set(kitchenTools.map((t) => t.toLowerCase()));
  const season = currentSeason();

  let pool = extraRecipes.length > 0 ? [...recipeCatalog, ...extraRecipes] : recipeCatalog;

  // 0. Recipe-source mode (never applies to baby groups, which have their own
  // curated catalog). "only" = just the user's recipes; "catalog" = drop them.
  if (!isBabyGroup && recipeMode === "only") {
    pool = pool.filter((r) => r.source === "user");
  } else if (!isBabyGroup && recipeMode === "catalog") {
    pool = pool.filter((r) => r.source !== "user");
  }

  // 0b. Baby group isolation — baby recipes only for baby groups, excluded otherwise
  pool = pool.filter((r) => isBabyGroup ? r.category === "bebes" : r.category !== "bebes");

  // 1. Allergens — exclude any recipe containing a blocked allergen. Declared
  // `allergens` cover 8 of the 14 UE allergens; the ingredient-name safety net
  // catches the other 6 (soja, cacahuetes, apio, mostaza, sulfitos, altramuces)
  // that the catalog can't encode, so marking them actually excludes recipes.
  if (blockedAllergens.size > 0) {
    pool = pool.filter((r) => {
      if (r.allergens.some((a) => blockedAllergens.has(normalizeAllergenId(a)))) return false;
      const names = (r.ingredients ?? []).map((ing) => ing.name);
      if (recipeIngredientsHitAllergens(names, blockedAllergens)) return false;
      return true;
    });
  }

  // 1c. Intolerances & dietary states. Two behaviors:
  //   - Adaptable (lactosa_fina): don't drop the recipe — annotate the swaps
  //     (dairy → lactose-free) so hydration can rename ingredients invisibly.
  //     Only bail out when the conflict is name-only (nothing to rename).
  //   - Hard (fructosa/sorbitol/embarazo/lactancia): exclude outright, no swap.
  if (activeIntolerances.length > 0) {
    const adaptableIds = activeIntolerances.filter(isAdaptableRestriction);
    const hardIds = activeIntolerances.filter((id) => !isAdaptableRestriction(id));

    pool = pool
      .map((r) => {
        if (hardIds.length > 0 && recipeHitsIntolerances(r, hardIds)) return null;
        if (adaptableIds.length > 0) {
          const { swaps, blocked } = planAdaptations(r, adaptableIds);
          if (blocked) return null;
          if (swaps.length > 0) return { ...r, adaptations: swaps };
        }
        return r;
      })
      .filter(Boolean);
  }

  // 2. Dislikes — exclude if any ingredient name contains a disliked term
  if (dislikeLower.length > 0) {
    pool = pool.filter(
      (r) =>
        !r.ingredients.some((ing) => {
          const name = ing.name.toLowerCase();
          return dislikeLower.some((d) => name.includes(d));
        }),
    );
  }

  // 3. Kid-friendly
  if (hasKids) {
    pool = pool.filter((r) => r.kidFriendly);
  }

  // 3b. Alcohol — block recipes whose ingredient list contains alcohol, even
  // when the recipe is otherwise marked kidFriendly (wine "cooks off" in theory
  // but parents rightly expect a kids menu to have zero alcohol ingredients).
  if (hasKids) {
    const ALCOHOL_RE =
      /\b(vino|cerveza|sidra|brandy|ron|whisky|vodka|licor|cava|champan|jerez|oporto|vermut|ginebra|cointreau|amaretto)\b/;
    const normalizeForFilter = (s) =>
      s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
    pool = pool.filter(
      (r) => !r.ingredients.some((ing) => ALCOHOL_RE.test(normalizeForFilter(ing.name))),
    );
  }

  // 4. Season — keep "all" + current season, drop opposite
  if (season) {
    pool = pool.filter((r) => r.season === "all" || r.season === season);
  }

  // 5. Time — exclude recipes that exceed the max
  pool = pool.filter((r) => r.time <= maxTime);

  // 6. Required appliance — exclude if user doesn't have the required tool.
  // Static catalog dishes use a single `requiredAppliance` string; user-made
  // recipes can accept several via `requiredAppliances` (any one unlocks it).
  pool = pool.filter((r) => {
    const required = r.requiredAppliances?.length
      ? r.requiredAppliances
      : r.requiredAppliance
        ? [r.requiredAppliance]
        : [];
    if (!required.length) return true;
    return required.some((a) => toolsLower.has(a.toLowerCase()));
  });

  // 7. Cook level — deterministic difficulty filter
  if (cookLevel === "basic") {
    pool = pool.filter((r) => r.difficulty === "facil");
  } else if (cookLevel === "normal") {
    pool = pool.filter((r) => r.difficulty === "facil" || r.difficulty === "normal");
  }
  // "pro" → all difficulties allowed

  // 8. Pantry score — soft ranking signal only, computed after every hard
  // filter above so it never changes which recipes survive, only how the
  // LLM (Phase 5) can prioritize among them.
  if (pantryIngredients.length > 0) {
    pool = pool.map((r) => ({ ...r, pantryScore: scorePantryMatch(r, pantryIngredients) }));
  }

  // 8b. Favorites — soft ranking signal only (like pantry): annotate matching
  // recipes so the LLM prioritizes them, never changes which survive.
  if (favoriteIds && favoriteIds.size > 0) {
    pool = pool.map((r) => (favoriteIds.has(r.id) ? { ...r, isFavorite: true } : r));
  }

  // Validate minimum viable pool. "Solo las mías" naturally has far fewer
  // recipes, so relax the minimums (repetition is expected and acceptable).
  const categories = new Set(pool.map((r) => r.category));
  const minRecipes = isBabyGroup ? 10 : recipeMode === "only" ? 5 : 25;
  const minCategories = isBabyGroup ? 1 : recipeMode === "only" ? 1 : 4;
  if (pool.length < minRecipes) {
    return {
      recipes: pool,
      error: `Solo quedan ${pool.length} recetas tras filtrar. Se necesitan al menos ${minRecipes} para generar un menú variado.`,
    };
  }
  if (categories.size < minCategories) {
    return {
      recipes: pool,
      error: `Solo quedan ${categories.size} categorías de recetas. Se necesitan al menos ${minCategories} para un menú equilibrado.`,
    };
  }

  return { recipes: pool, error: null };
}

/**
 * Build reduced catalog (decision-only fields) from a filtered pool.
 * This is what gets sent to the LLM.
 *
 * @param {Object[]} filteredRecipes
 * @param {Object} [opts]
 * @param {boolean} [opts.includeHealth] - add macros (carbs/fat/protein) and
 *   healthFlags so the model can honor a group's health profiles. Off by
 *   default to keep the prompt lean when no profile is active.
 */
export function decisionCatalog(filteredRecipes, { includeHealth = false } = {}) {
  return filteredRecipes.map((r) => {
    const entry = {
      id: r.id,
      name: r.name,
      category: r.category,
      mainProtein: r.mainProtein,
      mealRole: r.mealRole,
      time: r.time,
      kcal: r.kcal,
      kidFriendly: r.kidFriendly,
      tupperFriendly: r.tupperFriendly,
    };
    if (r.category === "bebes") {
      entry.protein_g = r.protein_g ?? 0;
      if (r.mainBase) {
        entry.mainBase = r.mainBase;
      }
    }
    // Macros + healthFlags only when a health profile is active in the group,
    // so the prompt stays lean the rest of the time.
    if (includeHealth) {
      if (typeof r.carbs_g === "number") entry.carbs_g = r.carbs_g;
      if (typeof r.fat_g === "number") entry.fat_g = r.fat_g;
      if (typeof r.protein_g === "number") entry.protein_g = r.protein_g;
      if (Array.isArray(r.healthFlags) && r.healthFlags.length > 0) {
        entry.healthFlags = r.healthFlags;
      }
    }
    // Omit when zero/absent rather than sending "pantryScore": 0 on every
    // recipe — only meaningful (and only present) once the user has a pantry.
    if (r.pantryScore > 0) {
      entry.pantryScore = Math.round(r.pantryScore * 100) / 100;
    }
    // Signals for prioritization (only present when true, to keep payload lean).
    if (r.isFavorite) entry.favorite = true;
    if (r.source === "user") entry.own = true;
    return entry;
  });
}
