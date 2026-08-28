import { supabase } from "./supabase.js";

/**
 * A vote entry mixes two independent user actions on a recipe:
 *  - `v` ("vote"): the user's public like/dislike rating ('up' | 'down'),
 *    shown to everyone as accumulated thumbs-up/down counts.
 *  - `fav` ("favorite"): the user's personal favorite scope
 *    ('all' | string[] of menu-group labels), used to populate "Mis
 *    favoritas" and to bias AI menu generation. Presence (non-null) means
 *    "this is a favorite"; the value says for which groups.
 * A recipe can be liked without being a favorite, and favorited without ever
 * being rated — they're shown and edited as separate controls in the UI.
 *
 * Legacy entries were a bare 'up'/'down' string, from before the two were
 * split. They used to also collapse to "favorited (all groups)" for
 * backward compat, but that made every old casual 👍 permanently count as a
 * deliberate ❤️ favorite — bloating "Mis recetas" with hundreds of dishes
 * someone once rated well but never actually favorited (2026-08-28). A bare
 * string is now read as JUST a rating, same as the modern `{v}`-only shape.
 * @typedef {'up' | 'down'} RecipeVote
 * @typedef {RecipeVote | { v?: RecipeVote, fav?: 'all' | string[] }} VoteEntry
 */

/** Normalizes any entry to its like/dislike rating, or null if unrated. */
export function voteOf(entry) {
  if (entry == null) return null;
  if (typeof entry === "string") return entry;
  return entry.v ?? null;
}

/** Normalizes any entry to its favorite scope ("all" | string[]), or null if not a favorite. */
export function favScopeOf(entry) {
  if (entry == null || typeof entry === "string") return null;
  return entry.fav ?? null;
}

/** Whether the entry represents a favorite (any scope). */
export function isFavorite(entry) {
  return favScopeOf(entry) != null;
}

/**
 * Builds the entry, or `null` when both fields are empty (meaning: delete it).
 * A bare "down" is unambiguous so it's kept compact, but a bare "up" is NEVER
 * written — `favScopeOf` reads a bare "up" as a legacy favorite (see above),
 * so an "up" vote with no favorite must stay wrapped as `{ v: "up" }` or it
 * would silently turn back into a favorite the next time it's read (this bit
 * the "Quitar" button: unfavoriting a liked recipe collapsed to "up", which
 * then read back as favorited again).
 */
function makeEntry(vote, favScope) {
  if (favScope == null) {
    if (vote === "down") return "down";
    if (vote === "up") return { v: "up" };
    return null;
  }
  return { v: vote ?? undefined, fav: favScope };
}

/** @param {Record<string, VoteEntry>|undefined} votes */
export function getUserRecipeVote(votes, recipeId) {
  return voteOf(votes?.[recipeId]);
}

/** Favorite scope of a recipe ("all" | string[] | null when not a favorite). */
export function getFavoriteScope(votes, recipeId) {
  return favScopeOf(votes?.[recipeId]);
}

/** Whether the user has favorited this recipe. */
export function isRecipeFavorite(votes, recipeId) {
  return isFavorite(votes?.[recipeId]);
}

function applyEntry(votes, recipeId, vote, favScope) {
  const next = { ...(votes ?? {}) };
  const entry = makeEntry(vote, favScope);
  if (entry == null) delete next[recipeId];
  else next[recipeId] = entry;
  return next;
}

/** Toggle or clear the user's like/dislike rating, preserving its favorite scope. */
export function toggleRecipeVote(votes, recipeId, vote) {
  const cur = votes?.[recipeId];
  const nextVote = voteOf(cur) === vote ? null : vote;
  return applyEntry(votes, recipeId, nextVote, favScopeOf(cur));
}

/** Toggle the favorite on/off (default scope "all" when turning on), preserving the rating. */
export function toggleFavorite(votes, recipeId, defaultScope = "all") {
  const cur = votes?.[recipeId];
  const nextScope = isFavorite(cur) ? null : defaultScope;
  return applyEntry(votes, recipeId, voteOf(cur), nextScope);
}

/**
 * Sets the favorite scope directly ("all" | string[] | null to unfavorite),
 * preserving the rating. Used by the "¿Para quién es favorita?" picker.
 */
export function setFavoriteScope(votes, recipeId, scope) {
  const cur = votes?.[recipeId];
  return applyEntry(votes, recipeId, voteOf(cur), scope ?? null);
}

/**
 * Applies a pick from the "¿Para quién es favorita?" popup (FavoriteScopeModal)
 * via the given setter. `key` is "all", a group label, or "__remove" to unfavorite.
 */
export function applyFavoriteScopePick(key, { recipeId, onSetFavoriteScope }) {
  onSetFavoriteScope(recipeId, key === "__remove" ? null : key === "all" ? "all" : [key]);
}

/** Recipe ids the user has marked as favorites, any scope. */
export function favoriteRecipeIds(votes) {
  return Object.entries(votes ?? {})
    .filter(([, v]) => isFavorite(v))
    .map(([id]) => id);
}

/**
 * Favorite recipe ids that apply to a given menu group. A favorite applies when
 * its scope is "all", when the group is the single-family group ("Familia"), or
 * when the scope explicitly lists the group's label.
 * @param {string} groupLabel  e.g. "Adultos" | "Niños" | "Bebé" | "Familia"
 * @returns {Set<string>}
 */
export function favoriteIdsForGroup(votes, groupLabel) {
  const ids = new Set();
  for (const [id, entry] of Object.entries(votes ?? {})) {
    if (!isFavorite(entry)) continue;
    const scope = favScopeOf(entry);
    if (
      scope === "all" ||
      groupLabel === "Familia" ||
      (Array.isArray(scope) && scope.includes(groupLabel))
    ) {
      ids.add(id);
    }
  }
  return ids;
}

/**
 * Merges cloud votes into local ones. Remote is authoritative for both the
 * rating and the favorite flag, but when the remote favorite scope is generic
 * ("all") and the local copy has a more specific one, the local scope is kept
 * so a fresh login never silently wipes a per-group favorite that hasn't
 * round-tripped to the server yet.
 */
export function mergeVotes(local = {}, remote = {}) {
  const out = { ...local };
  for (const [id, rEntry] of Object.entries(remote)) {
    const rFav = favScopeOf(rEntry);
    const lFav = favScopeOf(local[id]);
    const fav = rFav === "all" && Array.isArray(lFav) ? lFav : rFav;
    const entry = makeEntry(voteOf(rEntry), fav);
    if (entry == null) delete out[id];
    else out[id] = entry;
  }
  return out;
}

// ── Cloud sync (recipe_votes, see 0003_user_data.sql / 0004_recipe_favorites.sql) ────────────
// Votes persist to Supabase so favorites/ratings survive across devices, and
// ratings can later be aggregated across users. All functions no-op without a
// session — localStorage (data.recipeVotes) stays the working source of truth.

const scopeColumn = (scope) => (scope === "all" || !Array.isArray(scope) ? null : scope);

/**
 * Loads the user's votes as the same map the app keeps in state.
 * @returns {Promise<Record<string, VoteEntry>>}
 */
export async function loadRecipeVotes(userId) {
  if (!supabase || !userId) return {};
  const { data, error } = await supabase
    .from("recipe_votes")
    .select("recipe_id, vote, is_favorite, scope")
    .eq("user_id", userId);
  if (error) {
    console.warn("[recipeVotes] load failed", error.message);
    return {};
  }
  const map = {};
  for (const row of data ?? []) {
    const favScope = row.is_favorite ? (Array.isArray(row.scope) && row.scope.length ? row.scope : "all") : null;
    const entry = makeEntry(row.vote, favScope);
    if (entry != null) map[row.recipe_id] = entry;
  }
  return map;
}

/** Upserts a single recipe's vote entry (rating and/or favorite scope). */
export async function saveRecipeVote(userId, recipeId, entry) {
  if (!supabase || !userId || !recipeId) return;
  const vote = voteOf(entry);
  const favScope = favScopeOf(entry);
  const { error } = await supabase
    .from("recipe_votes")
    .upsert(
      {
        user_id: userId,
        recipe_id: recipeId,
        vote,
        is_favorite: favScope != null,
        scope: scopeColumn(favScope),
      },
      { onConflict: "user_id,recipe_id" },
    );
  if (error) console.warn("[recipeVotes] save failed", error.message);
}

/** Removes the user's entry on a recipe entirely (no rating, no favorite left). */
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
  const rows = Object.entries(votes ?? {}).map(([recipe_id, entry]) => ({
    user_id: userId,
    recipe_id,
    vote: voteOf(entry),
    is_favorite: isFavorite(entry),
    scope: scopeColumn(favScopeOf(entry)),
  }));
  if (rows.length === 0) return;
  const { error } = await supabase
    .from("recipe_votes")
    .upsert(rows, { onConflict: "user_id,recipe_id" });
  if (error) console.warn("[recipeVotes] bulk upsert failed", error.message);
}
