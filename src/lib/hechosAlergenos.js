import { EU_ALLERGEN_IDS } from "../data/ingredientSchema.js";
import { PRESENCIA } from "./comprobadorSeguridad.js";

/**
 * Construye los «hechos» que necesita comprobarSeguridad a partir de dos
 * fuentes: lo que cada ingrediente declara (allergens, mayContain) y la
 * relación de origen (ingredientLineage.json).
 *
 * La regla: un ingrediente «simple» o «derivado» tiene composición conocida,
 * así que todo lo que no está declarado ni se hereda del origen se puede
 * marcar «ausente» sin leer ninguna etiqueta — es la definición misma de esas
 * dos clases (ver ingredientLineageSchema.js). Un «compuesto» no: solo se
 * rellena lo que ya está declarado, y el resto queda sin fila, que
 * comprobarSeguridad trata como no verificado.
 *
 * @param {Array<{id:string, allergens?:string[], mayContain?:string[]}>} ingredientes
 * @param {{items: Array}} lineage
 * @returns {import("./comprobadorSeguridad.js").Hechos}
 */
export function construirHechos(ingredientes, lineage) {
  const porIdLineage = new Map(lineage.items.map((i) => [i.id, i]));
  const hechos = {};

  for (const ing of ingredientes) {
    const fila = {};
    for (const a of ing.allergens ?? []) fila[a] = PRESENCIA.CONTIENE;
    for (const a of ing.mayContain ?? []) if (!fila[a]) fila[a] = PRESENCIA.PUEDE_CONTENER;

    const item = porIdLineage.get(ing.id);
    const clase = item?.clase;
    if (clase === "simple" || clase === "derivado") {
      for (const a of item.heredaAlergenos ?? []) fila[a] = PRESENCIA.CONTIENE;
      for (const a of EU_ALLERGEN_IDS) if (!fila[a]) fila[a] = PRESENCIA.AUSENTE;
    }
    // "compuesto" o sin clasificar: solo lo declarado; el resto se queda sin
    // fila a propósito, para que cuente como no verificado.

    hechos[ing.id] = fila;
  }
  return hechos;
}
