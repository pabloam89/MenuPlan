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
    // Un "compuesto" sin receta propia (`componentes`) no se deriva: solo lo
    // declarado, y el resto se queda sin fila a propósito, para que cuente
    // como no verificado. Los que sí tienen receta propia se resuelven abajo,
    // en una segunda pasada, porque dependen de hechos de otros ingredientes.

    hechos[ing.id] = fila;
  }

  // Segunda pasada: un "compuesto" con `componentes` (alioli, mayonesa, pesto,
  // bechamel) hereda de SUS propios ingredientes, ya calculados arriba. La
  // combinación es la misma que usaría el comprobador sobre una receta: si
  // algún componente lo tiene, el compuesto lo tiene; si algún componente no
  // está verificado para ese alérgeno, el compuesto tampoco lo está — no se
  // puede decir "ausente" de algo que depende de una pieza desconocida.
  for (const item of lineage.items) {
    if (item.clase !== "compuesto" || !item.componentes?.length) continue;
    const fila = hechos[item.id] ?? {};
    for (const a of EU_ALLERGEN_IDS) {
      if (fila[a]) continue; // lo declarado manda sobre lo derivado.
      const delosComponentes = item.componentes.map((c) => hechos[c]?.[a]);
      if (delosComponentes.some((p) => p === PRESENCIA.CONTIENE)) fila[a] = PRESENCIA.CONTIENE;
      else if (delosComponentes.some((p) => p === PRESENCIA.PUEDE_CONTENER)) fila[a] = PRESENCIA.PUEDE_CONTENER;
      else if (delosComponentes.every((p) => p === PRESENCIA.AUSENTE)) fila[a] = PRESENCIA.AUSENTE;
      // Si algún componente no tiene fila para este alérgeno, se deja sin
      // fila: no verificado, no "ausente" por falta de información.
    }
    hechos[item.id] = fila;
  }

  return hechos;
}
