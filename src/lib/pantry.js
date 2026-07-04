import { supabase } from "./supabase.js";

/**
 * Data access for user_pantry (see supabase/migrations/0002_user_pantry.sql).
 * Gated behind auth: every function requires a userId, and the feature's UI
 * never calls these without a signed-in session — "Entrar sin cuenta" users
 * never see the pantry input, so there's no anonymous-write path to support.
 */

/** @returns {Promise<{ id: string, ingredientName: string, ingredientNormalized: string, source: string }[]>} */
export async function loadPantry(userId) {
  if (!supabase || !userId) return [];
  const { data, error } = await supabase
    .from("user_pantry")
    .select("id, ingredient_name, ingredient_normalized, source, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });
  if (error) {
    console.error("[pantry] load failed", error);
    return [];
  }
  return (data ?? []).map((row) => ({
    id: row.id,
    ingredientName: row.ingredient_name,
    ingredientNormalized: row.ingredient_normalized,
    source: row.source,
  }));
}

/**
 * Adds items, skipping ones the user already has (ingredient_normalized is
 * unique per user). Returns the rows actually inserted.
 * @param {{ name: string, normalized: string, source?: 'manual'|'voice' }[]} items
 */
export async function addPantryItems(userId, items) {
  if (!supabase || !userId || items.length === 0) return [];
  const rows = items.map((it) => ({
    user_id: userId,
    ingredient_name: it.name,
    ingredient_normalized: it.normalized,
    source: it.source ?? "manual",
  }));
  const { data, error } = await supabase
    .from("user_pantry")
    // Existing ingredients are left as-is (first write wins) rather than
    // overwritten — re-adding "pollo" shouldn't reset its original source.
    .upsert(rows, { onConflict: "user_id,ingredient_normalized", ignoreDuplicates: true })
    .select("id, ingredient_name, ingredient_normalized, source");
  if (error) {
    console.error("[pantry] add failed", error);
    return [];
  }
  return (data ?? []).map((row) => ({
    id: row.id,
    ingredientName: row.ingredient_name,
    ingredientNormalized: row.ingredient_normalized,
    source: row.source,
  }));
}

export async function removePantryItem(userId, id) {
  if (!supabase || !userId) return false;
  const { error } = await supabase
    .from("user_pantry")
    .delete()
    .eq("user_id", userId)
    .eq("id", id);
  if (error) {
    console.error("[pantry] remove failed", error);
    return false;
  }
  return true;
}

export async function clearPantry(userId) {
  if (!supabase || !userId) return false;
  const { error } = await supabase.from("user_pantry").delete().eq("user_id", userId);
  if (error) {
    console.error("[pantry] clear failed", error);
    return false;
  }
  return true;
}
