/**
 * Qué carpetas tienen sentido en el hueco desde el que abres el recetario.
 *
 * ── El problema ───────────────────────────────────────────────────────────
 * La rejilla enseñaba siempre las mismas catorce carpetas, vinieras de donde
 * vinieras. Así que al rellenar la cena del martes te ofrecía «Desayunos»,
 * «Meriendas», «Postres» y «Cremas de bebé» — cuatro carpetas que en ese hueco
 * no se pueden usar, y que hay que leer y descartar cada vez.
 *
 * No es lo mismo que filtrar los platos: los platos ya los filtra el motor por
 * rol. Esto es la PUERTA. Una carpeta que al abrirla sale vacía, o cuyo
 * contenido el hueco va a rechazar, no debería estar.
 *
 * ── Qué se esconde y qué no ───────────────────────────────────────────────
 * Solo lo que está atado a una franja concreta. Las categorías de comida
 * —carnes, pescados, legumbres— valen en cualquier hueco y se quedan todas:
 * esconder «Legumbres» en una cena sería decidir por el usuario qué se cena,
 * que es justo lo que la pizarra existe para no hacer.
 *
 * Sin contexto —el recetario abierto por su cuenta, no desde un hueco— no se
 * esconde nada. Ahí estás mirando el catálogo, no rellenando.
 */

/** Carpeta → en qué franja tiene sentido. Lo que no esté aquí vale siempre. */
const SOLO_EN = {
  desayunos: "Desayuno",
  meriendas: "Merienda",
  postres: "Postre",
};

/** Las de bebé, que dependen del menú y no de la franja. */
const SOLO_BEBE = new Set(["bebes_cremas", "bebes_solidos"]);

/**
 * "Cenas rápidas" es una faceta, no una carpeta, pero se esconde por lo mismo:
 * en una comida no es que sobre, es que su propio nombre dice otra franja.
 */
const FACETAS_SOLO_EN = {
  rapido: "Cena",
};

/**
 * @param {string[]} ids  las carpetas que habría sin filtrar
 * @param {{meal?: string, esBebe?: boolean}|null} contexto  el hueco, si lo hay
 * @returns {string[]} las que se pintan, en el mismo orden
 */
export function carpetasDelHueco(ids, contexto) {
  if (!contexto) return ids;
  return (ids ?? []).filter((id) => {
    if (SOLO_BEBE.has(id)) return contexto.esBebe === true;
    const franja = SOLO_EN[id];
    return franja == null || franja === contexto.meal;
  });
}

/** Lo mismo para las facetas de la primera fila. */
export function facetasDelHueco(ids, contexto) {
  if (!contexto) return ids;
  return (ids ?? []).filter((id) => {
    const franja = FACETAS_SOLO_EN[id];
    return franja == null || franja === contexto.meal;
  });
}
