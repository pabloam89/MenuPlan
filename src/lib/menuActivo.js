/**
 * Cuál es el menú activo de una casa. Un solo lector para la app y para Lola.
 *
 * El dato vivía en cuatro sitios que se podían contradecir:
 *   · user_menus.is_active            → LA VERDAD (un índice único lo garantiza)
 *   · data.activeMenuId (y su copia en cada roster de data.rosters)
 *   · data.menus[id].isActive         → solo lo usa la poda del archivo
 *   · bot_deshacer.antes.menuActivo   → la foto para deshacer, se lee de la tabla
 *
 * `data.activeMenuId` es una caché: se pone al cargar a partir de la tabla y
 * sirve mientras la tabla no ha contestado (o no tiene ninguno activo, que
 * puede ser un menú recién generado cuyo guardado aún no ha llegado).
 *
 * Pendiente en SQL: household_shopping_mark (0072) compara con
 * state.data.activeMenuId para decidir si toca la copia viva de la compra.
 */

/**
 * @param {Array<{ id: string, isActive?: boolean, is_active?: boolean }> | null | undefined} filas
 *   Filas de user_menus (o sus resúmenes) de la casa. `null` = no se leyó la tabla.
 * @param {string | null | undefined} [cache]  data.activeMenuId
 * @returns {string | null}
 */
export function menuActivoDe(filas, cache = null) {
  if (Array.isArray(filas)) {
    const activa = filas.find((f) => f && (f.isActive === true || f.is_active === true));
    if (activa?.id) return String(activa.id);
  }
  return typeof cache === "string" && cache ? cache : null;
}
