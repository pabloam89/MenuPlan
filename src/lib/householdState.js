import { supabase } from "./supabase.js";

/**
 * Cloud mirror for household_state (see 0017_households.sql).
 * Replaces user_state for planning data scoped to a household.
 */

/**
 * @param {string} householdId
 * @returns {Promise<{ state: any, updatedAt: string } | null>}
 */
export async function loadHouseholdState(householdId) {
  if (!supabase || !householdId) return null;
  const { data, error } = await supabase
    .from("household_state")
    .select("state, updated_at")
    .eq("household_id", householdId)
    .maybeSingle();
  if (error) {
    console.warn("[householdState] load failed", error.message);
    return null;
  }
  if (!data) return null;
  return { state: data.state ?? null, updatedAt: data.updated_at };
}

/**
 * @param {string} householdId
 * @param {any} state
 */
export async function saveHouseholdState(householdId, state) {
  if (!supabase || !householdId) return;
  const { error } = await supabase.from("household_state").upsert(
    {
      household_id: householdId,
      state,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "household_id" },
  );
  if (error) console.warn("[householdState] save failed", error.message);
}

/**
 * @param {string} householdId
 */
export async function clearHouseholdState(householdId) {
  if (!supabase || !householdId) return;
  const { error } = await supabase.from("household_state").delete().eq("household_id", householdId);
  if (error) console.warn("[householdState] clear failed", error.message);
}
