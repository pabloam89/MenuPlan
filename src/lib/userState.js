import { supabase } from "./supabase.js";

/**
 * Data access for user_state (see supabase/migrations/0003_user_data.sql).
 *
 * user_state holds a private per-user JSON snapshot of the app state — the same
 * object cached in localStorage ("menuplan.state.v1"), minus the normalized
 * bits (userRecipes + recipeVotes live in their own tables). It's the cloud
 * mirror that makes the profile survive across devices and a "smart reset".
 *
 * Everything degrades gracefully: no Supabase / no session → no-op, and
 * localStorage stays the working source of truth.
 */

/**
 * @param {string} userId
 * @returns {Promise<{ state: any, updatedAt: string } | null>}
 */
export async function loadUserState(userId) {
  if (!supabase || !userId) return null;
  const { data, error } = await supabase
    .from("user_state")
    .select("state, updated_at")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    console.warn("[userState] load failed", error.message);
    return null;
  }
  if (!data) return null;
  return { state: data.state ?? null, updatedAt: data.updated_at };
}

/**
 * Upserts the snapshot. Callers should debounce this (state changes on almost
 * every interaction). Fire-and-forget: failures are logged, never thrown.
 * @param {string} userId
 * @param {any} state
 */
export async function saveUserState(userId, state) {
  if (!supabase || !userId) return;
  const { error } = await supabase.from("user_state").upsert(
    { user_id: userId, state, updated_at: new Date().toISOString() },
    { onConflict: "user_id" },
  );
  if (error) console.warn("[userState] save failed", error.message);
}
