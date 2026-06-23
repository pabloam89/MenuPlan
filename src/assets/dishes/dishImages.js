// Maps a menu slot (recipe + optional garnish) to its generated photo URL.
// The manifest is produced by scripts/upload-to-blob.mjs and copied here via
// scripts/build-catalog.mjs is for the gallery; for the app we copy
// output/manifest.json → dishImages.json.
//
// combo_id format:
//   - standalone dish:   "carnes_001"
//   - dish + garnish:    "carnes_002+guarniciones_001"

import manifest from "./dishImages.json";

// Precompute a fallback per dish: the first available combo photo for each base
// dish id. Covers dishes that exist ONLY as dish+garnish combos (no standalone
// photo) when they are served on their own — and also pre-fix saved menus whose
// recipe objects don't carry a garnishId yet.
const firstComboByDish = {};
for (const key of Object.keys(manifest)) {
  const plus = key.indexOf("+");
  if (plus === -1) continue;
  const base = key.slice(0, plus);
  if (!firstComboByDish[base]) firstComboByDish[base] = manifest[key];
}

/**
 * Resolve the photo URL for a given recipe + garnish pairing.
 * Order: exact combo → standalone dish → any combo of that dish.
 * Returns null when nothing matches (caller renders the icon fallback).
 *
 * @param {string} recipeId
 * @param {string} [garnishId]
 * @returns {string|null}
 */
export function dishImageUrl(recipeId, garnishId) {
  if (!recipeId) return null;
  if (garnishId) {
    const combo = `${recipeId}+${garnishId}`;
    if (manifest[combo]) return manifest[combo];
  }
  if (manifest[recipeId]) return manifest[recipeId];
  return firstComboByDish[recipeId] ?? null;
}

/**
 * Resolve the photo URL from a frontend recipe object. Uses `baseRecipeId`
 * (the catalog id, prefix-free) and `garnishId` set by the AI planner when a
 * garnish is merged in. Falls back to the recipe id for static catalog dishes.
 *
 * @param {{id?: string, baseRecipeId?: string, garnishId?: string}} recipe
 * @returns {string|null}
 */
export function dishImageForRecipe(recipe) {
  if (!recipe) return null;
  let baseId = recipe.baseRecipeId ?? recipe.id;
  // Strip group prefix (e.g. "groupA__carnes_001" → "carnes_001") for recipes
  // persisted before baseRecipeId was introduced.
  const dunder = baseId.indexOf("__");
  if (dunder !== -1) baseId = baseId.slice(dunder + 2);
  return dishImageUrl(baseId, recipe.garnishId);
}

export const hasDishImages = Object.keys(manifest).length > 0;
