import { supabase } from "./supabase.js";

// ── Cloud sync (user_recipe_discards, see 0010_recipe_discards.sql) ────────
// Discards persist to Supabase so a permanent "No me gusta" and active
// cooldowns survive across devices, with their own dedicated write instead
// of riding along the debounced whole-profile user_state save. All
// functions no-op without a session — localStorage (data.discards) stays
// the working source of truth.

/** @typedef {{ forever: string[], cooldownUntil: Record<string, number> }} DiscardsState */

/**
 * Loads the user's discards in the same shape the app keeps in state.
 * Expired cooldowns are filtered out here (lazy prune), matching the local
 * copy's own on-load pruning — an expired row is simply treated as absent
 * rather than eagerly deleted.
 * @returns {Promise<DiscardsState>}
 */
export async function loadRecipeDiscards(userId) {
  if (!supabase || !userId) return { forever: [], cooldownUntil: {} };
  const { data, error } = await supabase
    .from("user_recipe_discards")
    .select("recipe_id, is_permanent, cooldown_until")
    .eq("user_id", userId);
  if (error) {
    console.warn("[recipeDiscardsSync] load failed", error.message);
    return { forever: [], cooldownUntil: {} };
  }
  const now = Date.now();
  const forever = [];
  const cooldownUntil = {};
  for (const row of data ?? []) {
    if (row.is_permanent) {
      forever.push(row.recipe_id);
    } else if (row.cooldown_until) {
      const ts = new Date(row.cooldown_until).getTime();
      if (ts > now) cooldownUntil[row.recipe_id] = ts;
    }
  }
  return { forever, cooldownUntil };
}

/** Upserts a permanent discard or an active cooldown for one recipe. */
export async function saveRecipeDiscard(userId, recipeId, { isPermanent = false, cooldownUntil = null } = {}) {
  if (!supabase || !userId || !recipeId) return;
  const { error } = await supabase
    .from("user_recipe_discards")
    .upsert(
      {
        user_id: userId,
        recipe_id: recipeId,
        is_permanent: isPermanent,
        cooldown_until: isPermanent ? null : cooldownUntil ? new Date(cooldownUntil).toISOString() : null,
      },
      { onConflict: "user_id,recipe_id" },
    );
  if (error) console.warn("[recipeDiscardsSync] save failed", error.message);
}

/** Clears a recipe's discard entirely (Recuperar, or a superseded cooldown). */
export async function deleteRecipeDiscard(userId, recipeId) {
  if (!supabase || !userId || !recipeId) return;
  const { error } = await supabase
    .from("user_recipe_discards")
    .delete()
    .eq("user_id", userId)
    .eq("recipe_id", recipeId);
  if (error) console.warn("[recipeDiscardsSync] delete failed", error.message);
}

/** Backfills local-only discards to the cloud (first login on device). */
export async function upsertRecipeDiscards(userId, discards) {
  if (!supabase || !userId) return;
  const forever = discards?.forever ?? [];
  const cooldownUntil = discards?.cooldownUntil ?? {};
  const rows = [
    ...forever.map((recipe_id) => ({
      user_id: userId,
      recipe_id,
      is_permanent: true,
      cooldown_until: null,
    })),
    ...Object.entries(cooldownUntil).map(([recipe_id, ts]) => ({
      user_id: userId,
      recipe_id,
      is_permanent: false,
      cooldown_until: new Date(ts).toISOString(),
    })),
  ];
  if (rows.length === 0) return;
  const { error } = await supabase
    .from("user_recipe_discards")
    .upsert(rows, { onConflict: "user_id,recipe_id" });
  if (error) console.warn("[recipeDiscardsSync] bulk upsert failed", error.message);
}

/**
 * Merges cloud discards into local ones. Forever is a pure union (if either
 * side ever marked a recipe permanently discarded, it stays discarded — a
 * merge should never silently un-discard something). Cooldowns take the
 * later expiry per id, so a merge never shortens an active cooldown.
 */
export function mergeDiscards(local = { forever: [], cooldownUntil: {} }, remote = { forever: [], cooldownUntil: {} }) {
  const forever = Array.from(new Set([...(local.forever ?? []), ...(remote.forever ?? [])]));
  const cooldownUntil = { ...(local.cooldownUntil ?? {}) };
  for (const [id, ts] of Object.entries(remote.cooldownUntil ?? {})) {
    cooldownUntil[id] = Math.max(cooldownUntil[id] ?? 0, ts);
  }
  return { forever, cooldownUntil };
}
