/** Tombstones for user_recipes deleted locally — stops hydration/backfill from reviving them. */

const KEY = "menuplan.deletedRecipeIds.v1";

export function loadDeletedRecipeIds() {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(parsed) ? parsed.filter(Boolean) : []);
  } catch {
    return new Set();
  }
}

function persistDeletedRecipeIds(set) {
  try {
    localStorage.setItem(KEY, JSON.stringify([...set]));
  } catch {
    /* quota / private mode */
  }
}

/** @param {string} recipeId */
export function rememberDeletedRecipeId(recipeId) {
  if (!recipeId) return;
  const set = loadDeletedRecipeIds();
  set.add(recipeId);
  persistDeletedRecipeIds(set);
}

/** Drop tombstones when the cloud still has the row (delete failed or re-sync). */
export function reconcileDeletedRecipeIds(remoteRecipes = []) {
  const remoteIds = new Set(remoteRecipes.map((r) => r.id).filter(Boolean));
  const set = loadDeletedRecipeIds();
  let changed = false;
  for (const id of [...set]) {
    if (remoteIds.has(id)) {
      set.delete(id);
      changed = true;
    }
  }
  if (changed) persistDeletedRecipeIds(set);
  return set;
}

/** @param {object[]} recipes */
export function withoutDeletedRecipes(recipes, deletedIds = loadDeletedRecipeIds()) {
  if (!deletedIds.size) return recipes;
  return (recipes ?? []).filter((r) => !deletedIds.has(r.id ?? r.name));
}
