import { supabase } from "./supabase.js";

/** @typedef {'up' | 'down'} RecipeVote */

/** @param {Record<string, RecipeVote>|undefined} votes */
export function getUserRecipeVote(votes, recipeId) {
  return votes?.[recipeId] ?? null;
}

/** Toggle or clear the user's vote on a recipe. */
export function toggleRecipeVote(votes, recipeId, vote) {
  const next = { ...(votes ?? {}) };
  if (next[recipeId] === vote) delete next[recipeId];
  else next[recipeId] = vote;
  return next;
}

/** Recipe ids the user has marked as favorites (thumbs up). */
export function favoriteRecipeIds(votes) {
  return Object.entries(votes ?? {})
    .filter(([, v]) => v === "up")
    .map(([id]) => id);
}

// ── Cloud sync (recipe_votes, see 0003_user_data.sql) ────────────
// Votes persist to Supabase so favorites survive across devices, and their
// counts can later be aggregated across users. All functions no-op without a
// session — localStorage (data.recipeVotes) stays the working source of truth.

/**
 * Loads the user's votes as the same { recipeId: 'up'|'down' } map the app
 * keeps in state.
 * @returns {Promise<Record<string, RecipeVote>>}
 */
export async function loadRecipeVotes(userId) {
  if (!supabase || !userId) return {};
  const { data, error } = await supabase
    .from("recipe_votes")
    .select("recipe_id, vote")
    .eq("user_id", userId);
  if (error) {
    console.warn("[recipeVotes] load failed", error.message);
    return {};
  }
  const map = {};
  for (const row of data ?? []) map[row.recipe_id] = row.vote;
  return map;
}

/** Upserts a single vote. */
export async function saveRecipeVote(userId, recipeId, vote) {
  if (!supabase || !userId || !recipeId) return;
  const { error } = await supabase
    .from("recipe_votes")
    .upsert(
      { user_id: userId, recipe_id: recipeId, vote },
      { onConflict: "user_id,recipe_id" },
    );
  if (error) console.warn("[recipeVotes] save failed", error.message);
}

/** Removes the user's vote on a recipe (toggled off). */
export async function deleteRecipeVote(userId, recipeId) {
  if (!supabase || !userId || !recipeId) return;
  const { error } = await supabase
    .from("recipe_votes")
    .delete()
    .eq("user_id", userId)
    .eq("recipe_id", recipeId);
  if (error) console.warn("[recipeVotes] delete failed", error.message);
}

/** Backfills several local-only votes to the cloud (first login on device). */
export async function upsertRecipeVotes(userId, votes) {
  if (!supabase || !userId) return;
  const rows = Object.entries(votes ?? {}).map(([recipe_id, vote]) => ({
    user_id: userId,
    recipe_id,
    vote,
  }));
  if (rows.length === 0) return;
  const { error } = await supabase
    .from("recipe_votes")
    .upsert(rows, { onConflict: "user_id,recipe_id" });
  if (error) console.warn("[recipeVotes] bulk upsert failed", error.message);
}
