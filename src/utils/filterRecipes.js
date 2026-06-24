import { recipeCatalog } from "../data/recipeCatalog.js";
import { normalizeAllergenId } from "../lib/allergens.js";

function currentSeason() {
  const month = new Date().getMonth() + 1;
  if (month >= 6 && month <= 9) return "verano";
  if (month === 12 || month <= 2) return "invierno";
  return null;
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
      const base = r.ingredients?.find((i) =>
        /patata|boniato|calabac|zanahoria|calabaza|espinaca|brócoli|puerro|arroz|guisante|lenteja|garbanzo/i.test(i.name)
      );
      if (base) entry.mainBase = base.name.toLowerCase();
    }
    return entry;
  });
}
