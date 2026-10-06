// Por qué una receta propia podría no ser para niños, dicho con sus
// ingredientes («lleva vino blanco»). Review de UX, lámina 30: un padre quiere
// saber en qué se basa la app antes de fiarse, y que le avise si marca «Sí» a
// un plato con alcohol.
//
// Solo lo que se puede explicar con una línea y no admite discusión: alcohol
// (el mismo criterio que excluye esos platos del menú de los niños, ver
// filterRecipes.js) y picante (el de la marca de salud, ver healthFlags.js).
// Que no salga nada no es un sello de «apto»: es que no vemos motivo.

import { nombraAlcohol } from "../utils/filterRecipes.js";
import { nombraPicante } from "./healthFlags.js";

/**
 * @param {Array<{name: string}>} ingredients
 * @returns {Array<{ingrediente: string, motivo: "alcohol"|"picante"}>}
 */
export function motivosNoAptoNinos(ingredients) {
  const motivos = [];
  for (const ing of ingredients ?? []) {
    const name = String(ing?.name ?? "").trim();
    if (!name) continue;
    if (nombraAlcohol(name)) motivos.push({ ingrediente: name, motivo: "alcohol" });
    else if (nombraPicante(name)) motivos.push({ ingrediente: name, motivo: "picante" });
  }
  return motivos;
}

/** «vino blanco (alcohol) y guindilla (picante)» */
export function frasesMotivos(motivos) {
  const partes = motivos.map((m) => `${m.ingrediente.toLowerCase()} (${m.motivo})`);
  if (partes.length <= 1) return partes.join("");
  return `${partes.slice(0, -1).join(", ")} y ${partes[partes.length - 1]}`;
}
