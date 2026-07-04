import { recipeCatalog } from "../data/recipeCatalog.js";
import { normalizeAllergenId } from "../lib/allergens.js";
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
 * @returns {{ recipes: Object[], error: string|null }}
 */
export function filterRecipes({
  allergies = [],
  dislikes = [],
  hasKids = false,
  maxTime = 120,
  kitchenTools = [],
  cookLevel = "normal",
  isBabyGroup = false,
  pantryIngredients = [],
} = {}) {
  const blockedAllergens = new Set(allergies.map(normalizeAllergenId));
  const dislikeLower = dislikes.map((d) => d.toLowerCase());
  const toolsLower = new Set(kitchenTools.map((t) => t.toLowerCase()));
  const season = currentSeason();

  let pool = recipeCatalog;

  // 0. Baby group isolation — baby recipes only for baby groups, excluded otherwise
  pool = pool.filter((r) => isBabyGroup ? r.category === "bebes" : r.category !== "bebes");

  // 1. Allergens — exclude any recipe containing a blocked allergen
  if (blockedAllergens.size > 0) {
    pool = pool.filter(
      (r) => !r.allergens.some((a) => blockedAllergens.has(normalizeAllergenId(a))),
    );
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

  // 4. Season — keep "all" + current season, drop opposite
  if (season) {
    pool = pool.filter((r) => r.season === "all" || r.season === season);
  }

  // 5. Time — exclude recipes that exceed the max
  pool = pool.filter((r) => r.time <= maxTime);

  // 6. Required appliance — exclude if user doesn't have the required tool
  pool = pool.filter((r) => {
    if (!r.requiredAppliance) return true;
    return toolsLower.has(r.requiredAppliance.toLowerCase());
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

  // Validate minimum viable pool
  const categories = new Set(pool.map((r) => r.category));
  const minRecipes = isBabyGroup ? 10 : 25;
  const minCategories = isBabyGroup ? 1 : 4;
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
 */
export function decisionCatalog(filteredRecipes) {
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
    // Omit when zero/absent rather than sending "pantryScore": 0 on every
    // recipe — only meaningful (and only present) once the user has a pantry.
    if (r.pantryScore > 0) {
      entry.pantryScore = Math.round(r.pantryScore * 100) / 100;
    }
    return entry;
  });
}
