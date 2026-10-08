import { supabase } from "./supabase.js";
import { favScopeOf, isFavorite, voteOf } from "./recipeVotes.js";

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

// household_favorites.scope es texto, no text[] como recipe_votes.scope: null
// es «todos» y una lista de grupos va separada por comas (así la copió 0018).
// La app trabaja con "all" | string[] (favScopeOf), y aquí se traduce.

/** "all" | string[] | null → valor de la columna (null = todos). */
function scopeToColumn(favScope) {
  return Array.isArray(favScope) && favScope.length ? favScope.join(",") : null;
}

/** Valor de la columna → "all" | string[]. */
function columnToScope(scope) {
  const grupos = typeof scope === "string"
    ? scope.split(",").map((s) => s.trim()).filter(Boolean)
    : [];
  return grupos.length ? grupos : "all";
}

/**
 * @param {string} householdId
 * @param {string} recipeId
 * @param {import("./recipeVotes.js").VoteEntry|null|undefined} entry  la entrada
 *   de recipeVotes ({ v, fav }); de ella solo se guarda el ámbito de favorita.
 */
export async function saveHouseholdFavorite(householdId, recipeId, entry = null) {
  if (!supabase || !householdId || !recipeId) return;
  // Una entrada que ya no es favorita (queda solo el 👍/👎) no es una fila con
  // scope null: null es «todos», y al recargar volvería a ser de toda la casa.
  if (!isFavorite(entry)) return deleteHouseholdFavorite(householdId, recipeId);
  const { error } = await supabase.from("household_favorites").upsert(
    {
      household_id: householdId,
      recipe_id: recipeId,
      scope: scopeToColumn(favScopeOf(entry)),
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
 * Converts household favorites rows into recipeVotes-shaped map for the app,
 * con la misma forma que lee recipeVotes.js ({ v, fav }). Antes devolvía
 * { isFavorite, scope }, que mergeVotes leía como «ni nota ni favorita» y
 * borraba: las favoritas de la casa desaparecían en cada carga.
 * La casa no guarda notas: `v` se toma de `personal` para que la mezcla
 * (en la que este mapa manda) no borre el 👍/👎 propio de esas recetas.
 * @param {Record<string, { scope?: string|null }>} favorites
 * @param {Record<string, import("./recipeVotes.js").VoteEntry>} [personal]
 * @returns {Record<string, { v?: 'up'|'down', fav: 'all'|string[] }>}
 */
export function householdFavoritesToVotes(favorites, personal = {}) {
  const out = {};
  for (const [recipeId, meta] of Object.entries(favorites ?? {})) {
    out[recipeId] = {
      v: voteOf(personal?.[recipeId]) ?? undefined,
      fav: columnToScope(meta?.scope),
    };
  }
  return out;
}
