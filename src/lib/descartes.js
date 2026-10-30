import { apiUrl } from "./apiUrl.js";
import { supabase } from "./supabase.js";
import { getAnonId } from "./analytics.js";
import { idBase } from "./rastro.js";
import { paraEscribir } from "./vocabularios.js";
import { MAX_DESCARTES, RECETA_ID_RE } from "./descartesForma.js";

// Los platos que se tiran al regenerar (tabla receta_descartes, 0102): uno suelto,
// un día o el menú entero. Quien tiene cuenta lo escribe con su sesión (la RLS exige
// user_id = auth.uid()); el invitado, por /api/track con la clave de servidor, con el
// mismo id anónimo de la analítica. Es analítica y señal para el solver, no el flujo
// del usuario: nunca lanza ni espera a nadie, y si la tabla aún no está (la migración
// la aplica Pablo) se pierde el descarte y regenerar funciona igual (plan B).

/**
 * Las filas (sin identidad) de lo descartado: id de catálogo sin el prefijo de grupo
 * (idBase), sin repetidos y con tope. `alcance` pasa por paraEscribir: un valor retirado
 * pasa a su sucesor y uno desconocido lanza, como lo rechazaría el CHECK.
 * @param {Array<string|null|undefined>} recetaIds
 * @param {string} ambito uno de ALCANCES_DESCARTE (el valor de la columna alcance)
 * @returns {{ receta_id: string, alcance: string }[]}
 */
export function filasDeDescartes(recetaIds, ambito) {
  const alcanceOk = paraEscribir("alcances_descarte", ambito);
  const vistos = new Set();
  const filas = [];
  for (const id of recetaIds ?? []) {
    const recetaId = typeof id === "string" ? idBase(id.trim()) : null;
    if (!recetaId || !RECETA_ID_RE.test(recetaId) || vistos.has(recetaId)) continue;
    vistos.add(recetaId);
    filas.push({ receta_id: recetaId, alcance: alcanceOk });
    if (filas.length >= MAX_DESCARTES) break;
  }
  return filas;
}

/**
 * Los platos de un menú entero (todos los grupos, primero y segundo plato), sin los huecos
 * vaciados: lo que se tira al regenerar el menú.
 * @param {Record<string, Record<string, {recipeId?: string, firstRecipeId?: string, cleared?: boolean}>>} menuPlan
 */
export function recetasDelPlan(menuPlan) {
  const ids = [];
  for (const grupo of Object.values(menuPlan ?? {})) {
    for (const hueco of Object.values(grupo ?? {})) {
      if (!hueco || hueco.cleared) continue;
      if (hueco.firstRecipeId) ids.push(hueco.firstRecipeId);
      if (hueco.recipeId) ids.push(hueco.recipeId);
    }
  }
  return ids;
}

/**
 * Apunta lo que se descarta. Nunca lanza: devuelve cuántas filas mandó (0 si no había
 * nada, no hay sesión de Supabase o falló).
 * @param {{ user: {id: string}|null, householdId?: string|null, recetaIds: Array<string|null|undefined>, ambito: string }} args
 */
export async function registrarDescartes({ user, householdId = null, recetaIds, ambito }) {
  try {
    const filas = filasDeDescartes(recetaIds, ambito);
    if (filas.length === 0) return 0;
    if (user) {
      if (!supabase) return 0;
      const { error } = await supabase
        .from("receta_descartes")
        .insert(filas.map((f) => ({ ...f, user_id: user.id, household_id: householdId ?? null })));
      if (error) {
        console.warn("[descartes] insert", error.message);
        return 0;
      }
      return filas.length;
    }
    const res = await fetch(apiUrl("/api/track"), {
      method: "POST",
      keepalive: true,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ anonId: getAnonId(), descartes: filas }),
    });
    if (!res.ok) {
      console.warn("[descartes] track", res.status);
      return 0;
    }
    return filas.length;
  } catch (err) {
    console.warn("[descartes]", err?.message ?? err);
    return 0;
  }
}
