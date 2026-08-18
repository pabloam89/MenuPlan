// Maps a menu slot (recipe + optional garnish) to its generated photo URL.
// The manifest is produced by scripts/upload-to-blob.mjs and copied here via
// scripts/build-catalog.mjs is for the gallery; for the app we copy
// output/manifest.json → dishImages.json.
//
// combo_id format:
//   - standalone dish:   "carnes_001"
//   - dish + garnish:    "carnes_002+guarniciones_001"

import manifest from "./dishImages.json";
import { isSeasonalFruitRecipe, seasonalFruitMeta } from "../../lib/postres.js";

/**
 * Resolve the photo URL for a given recipe + garnish pairing.
 * Order: exact combo → standalone dish photo.
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
  return null;
}

/**
 * Resolve the photo URL from a recipe object (catalog, menu slot, or user-owned).
 * Uses `linkedCatalogId` + `pinnedGarnishId` for user-saved dish+garnish combos.
 *
 * @param {{id?: string, baseRecipeId?: string, linkedCatalogId?: string, garnishId?: string, pinnedGarnishId?: string, photo?: string}} recipe
 * @param {string} [garnishId]  Optional override (e.g. fixed-dish garnish picker in catalog)
 * @returns {string|null}
 */
export function dishImageForRecipe(recipe, garnishId) {
  if (!recipe) return null;
  if (isSeasonalFruitRecipe(recipe)) return seasonalFruitMeta().image;
  if (recipe.photo) return recipe.photo;

  if (recipe.linkedCatalogId && recipe.pinnedGarnishId) {
    return dishImageUrl(recipe.linkedCatalogId, recipe.pinnedGarnishId);
  }

  let baseId = recipe.baseRecipeId ?? recipe.linkedCatalogId ?? recipe.id;
  const dunder = baseId.indexOf("__");
  if (dunder !== -1) baseId = baseId.slice(dunder + 2);
  if (String(baseId).startsWith("user_")) return null;

  return dishImageUrl(baseId, garnishId ?? recipe.garnishId ?? recipe.pinnedGarnishId);
}

export const hasDishImages = Object.keys(manifest).length > 0;
