/**
 * Cuál es el menú activo de una casa. Un solo lector para la app y para Lola.
 *
 * El dato vivía en cuatro sitios que se podían contradecir:
 *   · user_menus.is_active            → LA VERDAD. Uno por casa lo dice
 *     uq_household_menus_one_active (0017: household_id where is_active and
 *     household_id is not null; la 0069 cuenta los choques que daba). El otro,
 *     uq_user_menus_one_active, es por (casa, usuario) y solo no bastaría.
 *     (scripts/verificar-estado.mjs mira los índices: de la 0017 solo falta una
 *     política, ver ESTADO.md.)
 *   · data.activeMenuId (y su copia en cada roster de data.rosters)
 *   · data.menus[id].isActive         → solo lo usa la poda del archivo
 *   · bot_deshacer.antes.menuActivo   → la foto para deshacer, se lee de la tabla
 *
 * `data.activeMenuId` es una caché: se pone al cargar a partir de la tabla y
 * sirve mientras la tabla no ha contestado (o no tiene ninguno activo, que
 * puede ser un menú recién generado cuyo guardado aún no ha llegado).
 *
 * Si aun así llegaran dos activos, se elige el de updated_at más reciente: el
 * mismo criterio que casa.js (`order=updated_at.desc&limit=1`), para que la
 * app y Lola vean el mismo.
 */

const tiempo = (f) => {
  const v = f?.updatedAt ?? f?.updated_at;
  const t = typeof v === "number" ? v : Date.parse(v ?? "");
  return Number.isFinite(t) ? t : -Infinity;
};

/**
 * @param {Array<{ id: string, isActive?: boolean, is_active?: boolean, updatedAt?: number|string, updated_at?: string }> | null | undefined} filas
 *   Filas de user_menus (o sus resúmenes) de la casa. `null` = no se leyó la tabla.
 * @param {string | null | undefined} [cache]  data.activeMenuId
 * @returns {string | null}
 */
export function menuActivoDe(filas, cache = null) {
  if (Array.isArray(filas)) {
    let activa = null;
    for (const f of filas) {
      if (!f?.id || !(f.isActive === true || f.is_active === true)) continue;
      if (!activa || tiempo(f) > tiempo(activa)) activa = f;
    }
    if (activa) return String(activa.id);
  }
  return typeof cache === "string" && cache ? cache : null;
}
