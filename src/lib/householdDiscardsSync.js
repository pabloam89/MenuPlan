import { supabase } from "./supabase.js";

/** @typedef {{ forever: string[], cooldownUntil: Record<string, number> }} DiscardsState */

/**
 * @param {string} householdId
 * @returns {Promise<DiscardsState>}
 */
export async function loadHouseholdDiscards(householdId) {
  if (!supabase || !householdId) return { forever: [], cooldownUntil: {} };
  const { data, error } = await supabase
    .from("household_recipe_discards")
    .select("recipe_id, is_permanent, cooldown_until")
    .eq("household_id", householdId);
  if (error) {
    console.warn("[householdDiscardsSync] load failed", error.message);
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

/**
 * @param {string} householdId
 * @param {string} recipeId
 * @param {{ isPermanent?: boolean, cooldownUntil?: number|null }} opts
 */
export async function saveHouseholdDiscard(householdId, recipeId, { isPermanent = false, cooldownUntil = null } = {}) {
  if (!supabase || !householdId || !recipeId) return;
  const { error } = await supabase.from("household_recipe_discards").upsert(
    {
      household_id: householdId,
      recipe_id: recipeId,
      is_permanent: isPermanent,
      cooldown_until: isPermanent ? null : cooldownUntil ? new Date(cooldownUntil).toISOString() : null,
    },
    { onConflict: "household_id,recipe_id" },
  );
  if (error) console.warn("[householdDiscardsSync] save failed", error.message);
}

/**
 * @param {string} householdId
 * @param {string} recipeId
 */
export async function deleteHouseholdDiscard(householdId, recipeId) {
  if (!supabase || !householdId || !recipeId) return;
  const { error } = await supabase
    .from("household_recipe_discards")
    .delete()
    .eq("household_id", householdId)
    .eq("recipe_id", recipeId);
  if (error) console.warn("[householdDiscardsSync] delete failed", error.message);
}
