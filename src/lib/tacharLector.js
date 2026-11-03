// El lector solo tacha (0072): de una lista de la compra antes y después, lo
// único que viaja a la base es «este artículo (nombre + unidad), comprado sí
// o no». La base no acepta nada más, así que aquí se saca solo eso.
//
// La pantalla junta duplicados antes de tachar (mergeShoppingItems), así que
// se compara por la misma clave que usa ella (normalizeIngredientKey) y se
// manda el nombre y la unidad TAL CUAL están guardados. Va también el `id` del
// artículo: una semana que guarda marcas (src/lib/compraMarcas.js, trozo 18)
// tacha por él (0120); la que guarda la lista entera, por nombre y unidad.

import { normalizeIngredientKey } from "./ingredientCategories.js";

const clave = (it) => normalizeIngredientKey(it?.name ?? "", it?.unit ?? "ud");

/**
 * @param {{ name: string, unit?: string, have?: boolean }[]} antes  la semana guardada
 * @param {{ name: string, unit?: string, have?: boolean }[]} despues  la que deja la pantalla
 * @returns {{ id: string, name: string, unit: string, have: boolean }[]}
 */
export function marcasEntre(antes = [], despues = []) {
  const ahora = new Map();
  for (const it of despues) ahora.set(clave(it), Boolean(it.have));
  const marcas = [];
  for (const it of antes) {
    const k = clave(it);
    if (!ahora.has(k)) continue;
    const have = ahora.get(k);
    if (have !== Boolean(it.have)) marcas.push({ id: it.id ?? k, name: it.name, unit: it.unit ?? "ud", have });
  }
  return marcas;
}
