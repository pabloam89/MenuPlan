import { supabase } from "./supabase.js";

/**
 * Cloud mirror for household_state (see 0017_households.sql).
 * Replaces user_state for planning data scoped to a household.
 *
 * `botRev` (0057, 0068): la versión de la casa. Sube con cada escritura, sea
 * de Lola o de la app. La app guarda condicionada a la última que conoce (la
 * cola de versionCasa.js lleva la cuenta de las suyas); si otro ha escrito
 * entretanto, el guardado vuelve con `conflict` y la app recarga la nube en
 * vez de pisar el cambio.
 */

/**
 * @param {string} householdId
 * @returns {Promise<{ state: any, updatedAt: string, botRev: number | null } | null>}
 */
export async function loadHouseholdState(householdId) {
  if (!supabase || !householdId) return null;
  let { data, error } = await supabase
    .from("household_state")
    .select("state, updated_at, bot_rev")
    .eq("household_id", householdId)
    .maybeSingle();
  // Base sin la 0057 todavía: la columna no existe. Se lee como antes.
  if (error && /bot_rev/.test(error.message)) {
    ({ data, error } = await supabase
      .from("household_state")
      .select("state, updated_at")
      .eq("household_id", householdId)
      .maybeSingle());
  }
  if (error) {
    console.warn("[householdState] load failed", error.message);
    return null;
  }
  if (!data) return null;
  return {
    state: data.state ?? null,
    updatedAt: data.updated_at,
    botRev: data.bot_rev == null ? null : Number(data.bot_rev),
  };
}

/**
 * Solo el contador, para mirar barato si alguien ha escrito (al volver a la app).
 * @param {string} householdId
 * @returns {Promise<number | null>}
 */
export async function loadHouseholdBotRev(householdId) {
  if (!supabase || !householdId) return null;
  const { data, error } = await supabase
    .from("household_state")
    .select("bot_rev")
    .eq("household_id", householdId)
    .maybeSingle();
  if (error || !data) return null;
  return Number(data.bot_rev ?? 0);
}

// PostgREST: la función no existe (base sin la 0057).
const sinFuncion = (error) => error?.code === "PGRST202" || /save_household_state/.test(error?.message ?? "");

/**
 * @param {string} householdId
 * @param {any} state
 * @param {number | null} botRev  la última versión que la app conoce; null = sin condición
 * @returns {Promise<{ ok: boolean, conflict?: boolean, botRev?: number | null }>}
 */
export async function saveHouseholdState(householdId, state, botRev = null) {
  if (!supabase || !householdId) return { ok: false };
  const { data, error } = await supabase.rpc("save_household_state", {
    p_household_id: householdId,
    p_state: state,
    p_bot_rev: botRev,
  });
  if (error && sinFuncion(error)) return upsertLegacy(householdId, state, botRev);
  if (error) {
    console.warn("[householdState] save failed", error.message);
    return { ok: false };
  }
  if (data?.ok === false) {
    // Mismo contador que el enviado: no ha escrito nadie, es que la fila no
    // se pudo actualizar (permisos). No es conflicto: recargar entraría en bucle.
    if (Number(data.bot_rev) === botRev) {
      console.warn("[householdState] save rejected");
      return { ok: false };
    }
    return { ok: false, conflict: true, botRev: Number(data.bot_rev) };
  }
  return { ok: true, botRev: data?.bot_rev == null ? botRev : Number(data.bot_rev) };
}

async function upsertLegacy(householdId, state, botRev) {
  const { error } = await supabase.from("household_state").upsert(
    {
      household_id: householdId,
      state,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "household_id" },
  );
  if (error) console.warn("[householdState] save failed", error.message);
  return { ok: !error, botRev };
}

/**
 * @param {string} householdId
 */
export async function clearHouseholdState(householdId) {
  if (!supabase || !householdId) return;
  const { error } = await supabase.from("household_state").delete().eq("household_id", householdId);
  if (error) console.warn("[householdState] clear failed", error.message);
}
