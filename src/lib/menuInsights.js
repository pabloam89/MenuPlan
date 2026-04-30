import { RECIPES_BY_ID } from "../data/recipes.js";

export function getVisibleMenuSlots(menuPlan, groups) {
  return groups.flatMap((group) =>
    Object.entries(menuPlan[group.id] ?? {})
      .filter(([, slot]) => Boolean(slot))
      .map(([slotKey, slot]) => ({
        group,
        slotKey,
        slot,
        recipe: RECIPES_BY_ID[slot.recipeId],
      }))
      .filter((entry) => Boolean(entry.recipe))
  );
}

export function getMenuInsights(menuPlan, groups) {
  const entries = getVisibleMenuSlots(menuPlan, groups);
  const total = entries.length;

  if (total === 0) {
    return {
      varietyScore: 0,
      uniqueCount: 0,
      proteinAvg: 0,
      timeAvg: 0,
      warningCount: 0,
      tupperCount: 0,
    };
  }

  const warningCount = entries.reduce(
    (sum, entry) => sum + (entry.slot.warnings?.length ?? 0),
    0
  );
  const proteinTotal = entries.reduce(
    (sum, entry) => sum + (entry.recipe.macros?.protein ?? 0),
    0
  );
  const timeTotal = entries.reduce((sum, entry) => sum + entry.recipe.time, 0);
  const tupperCount = entries.filter((entry) => entry.slot.mode === "tupper").length;
  const uniqueRecipes = new Set(entries.map((entry) => entry.recipe.id));
  const uniqueCount = uniqueRecipes.size;

  return {
    varietyScore: Math.round((uniqueCount / total) * 100),
    uniqueCount,
    proteinAvg: Math.round(proteinTotal / total),
    timeAvg: Math.round(timeTotal / total),
    warningCount,
    tupperCount,
  };
}
