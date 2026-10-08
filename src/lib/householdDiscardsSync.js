import { supabase } from "./supabase.js";

// Descartes de recetas en la nube: `household_recipe_discards` (0017), una
// fila por (casa, receta). Leen todos los miembros; escriben titular y
// cotitular (RLS de la 0071). El lector no escribe: App.jsx ni lo intenta.
// Sin cliente o sin casa, todo es no-op y manda la copia local.

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

/**
 * Sube de una vez los descartes que la nube aún no tiene (primera carga en un
 * dispositivo, o los del blob antiguo), a la tabla de la casa: la misma de la
 * que se leen al cargar (loadHouseholdDiscards). Sin casa no sube nada: se
 * quedan en el dispositivo y suben en la carga siguiente, ya con casa. La
 * tabla por usuario (`user_recipe_discards`, 0010) no existe en producción.
 *
 * @param {string|null} householdId
 * @param {DiscardsState} discards
 */
export async function subirDescartesPendientes(householdId, discards) {
  if (!supabase || !householdId) return;
  const forever = discards?.forever ?? [];
  const cooldownUntil = discards?.cooldownUntil ?? {};
  const rows = [
    ...forever.map((recipe_id) => ({ household_id: householdId, recipe_id, is_permanent: true, cooldown_until: null })),
    ...Object.entries(cooldownUntil).map(([recipe_id, ts]) => ({
      household_id: householdId,
      recipe_id,
      is_permanent: false,
      cooldown_until: new Date(ts).toISOString(),
    })),
  ];
  if (rows.length === 0) return;
  const { error } = await supabase
    .from("household_recipe_discards")
    .upsert(rows, { onConflict: "household_id,recipe_id" });
  if (error) console.warn("[householdDiscardsSync] bulk upsert failed", error.message);
}
