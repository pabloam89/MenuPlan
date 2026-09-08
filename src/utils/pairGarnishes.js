import guarniciones from "../data/recipes/guarniciones.json";

const GUARNICION_BY_ID = Object.fromEntries(guarniciones.map((g) => [g.id, g]));

/**
 * Guarniciones: SOLO lo fijado a mano.
 *
 * ── Por qué este fichero ya no combina nada ────────────────────────────────
 *
 * Aquí vivía una combinatoria de ~200 líneas que elegía guarnición por su
 * cuenta: tope de kcal para la comida, patatas fritas solo con carne o
 * pescado, guarnición de cena por debajo de 15 minutos, control de doble
 * hidrato, anclas de repetición semanal, respaldo a pan cuando no quedaba
 * nada. Estaba bien escrita y resolvía bien su problema. El problema es que
 * el problema no existía.
 *
 * Un plato del catálogo YA ES un plato. "Lenguado meunière con mantequilla y
 * limón" no es una pieza a la que le falte algo; pegarle "alcachofas
 * confitadas con jamón" produce un título imposible, veinte ingredientes y la
 * misma sal y el mismo aceite contados tres veces. Eso es el "plato
 * recargado" que se reportó.
 *
 * La versión anterior lo tapó a medias: dejó de combinar el Recetario Estrella
 * y siguió combinando el fondo de armario, con el argumento de que "ahí los
 * platos SÍ son piezas sueltas". Pero eso es una lectura del catálogo, no de
 * lo que quiere quien cocina: un plato del fondo de armario es MENOS
 * apetecible, no incompleto. Y el título imposible salía igual.
 *
 * ── Por qué se borró en vez de apagarse con una condición ──────────────────
 *
 * Una guarda (`if (recipe.estrella) return slot`) es una política, y una
 * política se puede revertir sin querer: basta con que alguien la lea como un
 * caso particular y la relaje. Aquí no se combina porque NO SE PUEDE — el
 * código que lo hacía ya no existe.
 *
 * Es además la misma forma que pairSauces, que nunca tuvo combinatoria y ya
 * declaraba la regla: "SOLO lo fijado a mano. La app no añade ninguna por su
 * cuenta." Las dos mitades del plato se comportan por fin igual.
 *
 * Fijar una guarnición sigue funcionando, y no es una excepción a lo anterior:
 * aplicar lo que alguien eligió no es combinar, es obedecer.
 *
 * @param {Array<{slotId: string, recipeId: string, garnishId?: string}>} slotAssignments
 * @param {Object} poolById - { [recipeId]: catalogRecipe }
 * @param {Object<string,string>} [pinnedByRecipeId] - { [recipeId]: garnishId }
 * @param {Object[]} [safeGarnishes] - guarniciones que pasan el filtro de
 *   alergias/intolerancias/alcohol de la casa (ver filterGarnishes).
 * @returns {Array<{slotId: string, recipeId: string, garnishId?: string}>}
 */
export function pairGarnishes(slotAssignments, poolById, pinnedByRecipeId = {}, safeGarnishes = guarniciones) {
  const result = slotAssignments.map((s) => ({ ...s }));
  // Las guarniciones vienen de su propio catálogo y no pasan por
  // filterRecipes, así que necesitan su pasada de alergias aparte. Se aplica
  // TAMBIÉN a lo fijado a mano: elegir una guarnición es una decisión de quien
  // cocina, pero una alergia no se negocia — y un plato fijo guardado hace
  // meses no sabe que desde entonces alguien de la casa dejó de tolerar algo.
  const safeIds = new Set(safeGarnishes.map((g) => g.id));

  for (const slot of result) {
    const recipe = poolById[slot.recipeId];
    if (!recipe) continue;
    // Lo que fijó quien cocina (plato fijo con guarnición) o lo que la propia
    // receta declara suyo. Nada más.
    const pinnedId = pinnedByRecipeId[slot.recipeId] ?? recipe.pinnedGarnishId;
    if (!pinnedId) continue;
    if (GUARNICION_BY_ID[pinnedId] && safeIds.has(pinnedId)) slot.garnishId = pinnedId;
  }

  return result;
}
