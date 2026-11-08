/**
 * Si el hueco apunta lo que hace falta para sacar del catálogo el plato de ese curso: recambios, para cuántos, y una
 * guarnición y una salsa que son de esa receta (#1246). Módulo hoja: lo usan los ficheros del bot que no cargan el
 * motor, para saber si un plato sale del hueco o aún de su copia.
 */
export function apuntaSuPlato(hueco, curso = "principal") {
  if (!Array.isArray(hueco?.restricciones) || !(hueco.eaters > 0)) return false;
  return curso === "primero" ? hueco.primeroDe === hueco.firstRecipeId : hueco.platoDe === hueco.recipeId;
}

/** Si algún hueco del plan de una semana apunta su plato. Las claves con «_» no son grupos (`_warnings`). */
export function planApuntaPlatos(plan) {
  return Object.entries(plan ?? {}).some(([grupo, huecos]) => !grupo.startsWith("_")
    && Object.values(huecos ?? {}).some((h) => (h?.recipeId && apuntaSuPlato(h, "principal"))
      || (h?.firstRecipeId && apuntaSuPlato(h, "primero"))));
}
