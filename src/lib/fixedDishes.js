import { recipeCatalog, recipeCatalogById } from "../data/recipeCatalog.js";

/** Normalized fixed dish: repetitions per week + which meals.
 * `catalogId` is set when the dish was picked from the catalog browser, so the
 * planner can match it exactly instead of by name. */
export function normalizeFixedDish(raw) {
  if (!raw || typeof raw !== "object") return null;
  const name = String(raw.name ?? "").trim();
  if (!name) return null;

  const catalogId =
    typeof raw.catalogId === "string" && raw.catalogId.trim()
      ? raw.catalogId.trim()
      : undefined;

  // A pinned garnish only makes sense alongside an exact catalog dish.
  const garnishId =
    catalogId && typeof raw.garnishId === "string" && raw.garnishId.trim()
      ? raw.garnishId.trim()
      : undefined;

  const extra = { ...(catalogId ? { catalogId } : {}), ...(garnishId ? { garnishId } : {}) };

  if (typeof raw.timesPerWeek === "number") {
    const rawMeals =
      Array.isArray(raw.meals) && raw.meals.length > 0 ? raw.meals : ["Comida"];
    const meal =
      rawMeals.find((m) => String(m).toLowerCase() === "comida") ??
      rawMeals.find((m) => String(m).toLowerCase() === "cena") ??
      rawMeals[0];
    return {
      name,
      timesPerWeek: Math.min(7, Math.max(1, Math.round(raw.timesPerWeek))),
      meals: [meal],
      ...extra,
    };
  }

  const freq = raw.freq ?? "semanal";
  let timesPerWeek = 1;
  if (freq === "quincenal") timesPerWeek = 1;
  else if (freq === "de vez en cuando") timesPerWeek = 1;

  return { name, timesPerWeek, meals: ["Comida"], ...extra };
}

/** Build a { [catalogRecipeId]: garnishId } map from the user's pinned combos. */
export function pinnedGarnishMap(list) {
  const map = {};
  for (const fd of migrateFixedDishes(list)) {
    if (fd.catalogId && fd.garnishId) map[fd.catalogId] = fd.garnishId;
  }
  return map;
}

export function migrateFixedDishes(list) {
  return (list ?? []).map(normalizeFixedDish).filter(Boolean);
}

function norm(s) {
  return String(s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

export function recipeMatchesFixedDish(recipe, fixedDish) {
  // Exact match when the dish was chosen from the catalog browser.
  if (fixedDish?.catalogId) return recipe?.id === fixedDish.catalogId;
  const wanted = norm(fixedDish?.name);
  if (!wanted) return false;
  const name = norm(recipe?.name);
  return name.includes(wanted) || wanted.includes(name);
}

export function fixedDishScoreBoost(recipe, meal, tracks) {
  let boost = 0;
  for (const ft of tracks) {
    if ((ft.placed ?? 0) >= ft.timesPerWeek) continue;
    if (!ft.meals.includes(meal)) continue;
    if (recipeMatchesFixedDish(recipe, ft)) boost = Math.max(boost, 85);
  }
  return boost;
}

export function markFixedDishPlaced(recipe, meal, tracks) {
  for (const ft of tracks) {
    if ((ft.placed ?? 0) >= ft.timesPerWeek) continue;
    if (!ft.meals.includes(meal)) continue;
    if (recipeMatchesFixedDish(recipe, ft)) {
      ft.placed = (ft.placed ?? 0) + 1;
      return;
    }
  }
}

export function formatFixedDishesForAI(list) {
  return migrateFixedDishes(list).map((fd) => ({
    name: fd.name,
    timesPerWeek: fd.timesPerWeek,
    meals: fd.meals,
    catalogMatches: catalogMatchesForFixedDish(fd).map((r) => ({ id: r.id, name: r.name })),
  }));
}

/** Pick `k` items evenly spread across the list (e.g. Mon/Wed/Fri, not Mon/Tue/Wed). */
function pickEvenlySpread(items, k) {
  if (k <= 0) return [];
  if (k >= items.length) return [...items];
  const out = [];
  const step = items.length / k;
  for (let i = 0; i < k; i++) out.push(items[Math.floor(i * step)]);
  return out;
}

/**
 * Choose the comida position ("1" primero / "2" segundo) or cena that matches
 * the dish's culinary role, so a vegetable primero never lands in the main
 * protein slot (and vice versa).
 */
function slotPositionForRecipe(recipe, targetMealType) {
  if (targetMealType === "cena") return null; // cena has a single slot
  const roles = recipe.mealRole ?? [];
  if (roles.includes("segundo")) return "2";
  if (roles.includes("primero")) return "1";
  if (roles.includes("plato_unico")) return "2";
  return "2";
}

/**
 * Deterministically forces each fixed dish to appear exactly `timesPerWeek`
 * times, in the meal the user picked AND in the slot position that matches the
 * dish's culinary role (primero/segundo/cena). Placements are spread across the
 * week so a repeated dish doesn't pile up on consecutive days. The LLM is asked
 * to do this too, but only this step is a hard guarantee.
 *
 * Runs after the LLM/fallback assignment and before garnish pairing. Mutates
 * `poolById` to include any forced recipe so downstream steps can resolve it.
 *
 * @param {Array<{slotId: string, recipeId: string, garnishId?: string}>} slotAssignments
 * @param {Array} fixedDishesRaw - raw fixed dishes from user data
 * @param {Object} poolById - { [recipeId]: catalogRecipe }, mutated in place
 * @returns {Array} new slot assignments with fixed dishes enforced
 */
export function enforceFixedDishes(slotAssignments, fixedDishesRaw, poolById) {
  const fixedDishes = migrateFixedDishes(fixedDishesRaw);
  if (fixedDishes.length === 0) return slotAssignments;

  const bySlot = new Map(slotAssignments.map((s) => [s.slotId, { ...s }]));
  const locked = new Set(); // slots already owned by a fixed dish — never evict

  for (const fd of fixedDishes) {
    const meal = String(fd.meals?.[0] ?? "Comida").toLowerCase();
    const targetMealType = meal === "cena" ? "cena" : "comida";

    // Resolve the target recipe (pool first, then full catalog).
    let recipe = null;
    if (fd.catalogId) {
      recipe = poolById[fd.catalogId] ?? recipeCatalogById[fd.catalogId] ?? null;
    } else {
      recipe =
        Object.values(poolById).find((r) => recipeMatchesFixedDish(r, fd)) ??
        recipeCatalog.find((r) => recipeMatchesFixedDish(r, fd)) ??
        null;
    }
    if (!recipe) continue;

    // Ensure downstream steps (garnish pairing, hydration) can resolve it.
    if (!poolById[recipe.id]) poolById[recipe.id] = recipe;

    // Only touch slots of the correct meal AND position for this dish's role.
    const wantPosition = slotPositionForRecipe(recipe, targetMealType);
    const slotByDay = new Map(); // day -> slotId (one candidate slot per day)
    for (const slotId of bySlot.keys()) {
      const [day, slotMeal, pos] = slotId.split("_");
      if (targetMealType === "cena") {
        if (slotMeal === "cena") slotByDay.set(day, slotId);
      } else if (slotMeal === "comida" && pos === wantPosition) {
        // A primero must not replace a plato_unico day (would leave no main).
        if (wantPosition === "1" && !bySlot.has(`${day}_comida_2`)) continue;
        slotByDay.set(day, slotId);
      }
    }
    const days = [...slotByDay.keys()];
    if (days.length === 0) continue;

    // Existing placements already count (one per day).
    const daysWithDish = new Set();
    for (const [day, slotId] of slotByDay) {
      if (bySlot.get(slotId)?.recipeId === recipe.id) {
        daysWithDish.add(day);
        locked.add(slotId);
      }
    }

    const target = Math.min(fd.timesPerWeek, days.length);
    const need = target - daysWithDish.size;
    if (need <= 0) continue;

    // Inject into free days (not already holding the dish, not owned by another
    // fixed dish), spread evenly across the week.
    const freeDays = days.filter(
      (day) => !daysWithDish.has(day) && !locked.has(slotByDay.get(day)),
    );
    for (const day of pickEvenlySpread(freeDays, need)) {
      const slotId = slotByDay.get(day);
      bySlot.set(slotId, { slotId, recipeId: recipe.id });
      locked.add(slotId);
    }
  }

  // Preserve original slot order.
  return slotAssignments.map((s) => bySlot.get(s.slotId) ?? s);
}

export function catalogMatchesForFixedDish(fixedDish, catalog = recipeCatalog) {
  if (fixedDish?.catalogId) {
    const exact = catalog.find((r) => r.id === fixedDish.catalogId);
    return exact ? [exact] : [];
  }
  if (!fixedDish?.name) return [];
  return catalog.filter((r) => recipeMatchesFixedDish(r, fixedDish));
}
