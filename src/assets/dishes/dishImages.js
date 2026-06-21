// Maps a menu slot (recipe + optional garnish) to its generated photo URL.
// The manifest is produced by scripts/upload-to-blob.mjs and copied here via
// scripts/build-catalog.mjs is for the gallery; for the app we copy
// output/manifest.json → dishImages.json.
//
// combo_id format:
//   - standalone dish:   "carnes_001"
//   - dish + garnish:    "carnes_002+guarniciones_001"

import manifest from "./dishImages.json";

/**
 * Resolve the photo URL for a given recipe + garnish pairing.
 * Falls back to the standalone-dish photo when the exact combo has no image.
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
  return manifest[recipeId] ?? null;
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
  const baseId = recipe.baseRecipeId ?? recipe.id;
  return dishImageUrl(baseId, recipe.garnishId);
}

export const hasDishImages = Object.keys(manifest).length > 0;
