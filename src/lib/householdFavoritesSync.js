import { supabase } from "./supabase.js";

/**
 * Household favorites for menu generation (see household_favorites table).
 * Personal favorites remain in recipe_votes (user_id).
 */

/**
 * @param {string} householdId
 * @returns {Promise<Record<string, { scope?: string|null }>>}
 */
export async function loadHouseholdFavorites(householdId) {
  if (!supabase || !householdId) return {};
  const { data, error } = await supabase
    .from("household_favorites")
    .select("recipe_id, scope")
    .eq("household_id", householdId);
  if (error) {
    console.warn("[householdFavoritesSync] load failed", error.message);
    return {};
  }
  /** @type {Record<string, { scope?: string|null }>} */
  const out = {};
  for (const row of data ?? []) {
    out[row.recipe_id] = { scope: row.scope ?? null };
  }
  return out;
}

/**
 * @param {string} householdId
 * @param {string} recipeId
 * @param {string|null|undefined} scope
 */
export async function saveHouseholdFavorite(householdId, recipeId, scope = null) {
  if (!supabase || !householdId || !recipeId) return;
  const { error } = await supabase.from("household_favorites").upsert(
    {
      household_id: householdId,
      recipe_id: recipeId,
      scope: scope ?? null,
    },
    { onConflict: "household_id,recipe_id" },
  );
  if (error) console.warn("[householdFavoritesSync] save failed", error.message);
}

/**
 * @param {string} householdId
 * @param {string} recipeId
 */
export async function deleteHouseholdFavorite(householdId, recipeId) {
  if (!supabase || !householdId || !recipeId) return;
  const { error } = await supabase
    .from("household_favorites")
    .delete()
    .eq("household_id", householdId)
    .eq("recipe_id", recipeId);
  if (error) console.warn("[householdFavoritesSync] delete failed", error.message);
}

/**
 * Converts household favorites rows into recipeVotes-shaped map for the app.
 * @param {Record<string, { scope?: string|null }>} favorites
 * @returns {Record<string, { isFavorite: true, scope?: string|null }>}
 */
export function householdFavoritesToVotes(favorites) {
  /** @type {Record<string, { isFavorite: true, scope?: string|null }>} */
  const out = {};
  for (const [recipeId, meta] of Object.entries(favorites ?? {})) {
    out[recipeId] = { isFavorite: true, scope: meta?.scope ?? null };
  }
  return out;
}
