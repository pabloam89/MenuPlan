import { recipeCatalog } from "../data/recipeCatalog.js";

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

export function catalogMatchesForFixedDish(fixedDish, catalog = recipeCatalog) {
  if (fixedDish?.catalogId) {
    const exact = catalog.find((r) => r.id === fixedDish.catalogId);
    return exact ? [exact] : [];
  }
  if (!fixedDish?.name) return [];
  return catalog.filter((r) => recipeMatchesFixedDish(r, fixedDish));
}
