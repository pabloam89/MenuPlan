/**
 * Los aparatos de la casa tal como se enseñan (trozo 12 de #1037). `kitchenTools` es una lista cerrada
 * (APARATOS_CASA, vocabularios.js): lo que no está en ella va como OTRO y su nombre, en `kitchenToolsNota`.
 * Sustituye a `customKitchenTools`, la lista abierta de antes (0 casas la tenían el 2 nov 2026).
 *
 * El motor no la necesita: cruza `kitchenTools` con el aparato que pide cada receta (filterRecipes), y OTRO no
 * lo pide ninguna. Esto es para quien lo enseña o se lo cuenta a Lola.
 */
import { OTRO } from "./vocabularios.js";

/** Pura. Los nombres de los aparatos de la casa: OTRO se enseña con su nota, o como «Otro» si no la hay. */
export function aparatosParaEnsenar(data) {
  const lista = Array.isArray(data?.kitchenTools) ? data.kitchenTools : [];
  const nota = typeof data?.kitchenToolsNota === "string" ? data.kitchenToolsNota.trim() : "";
  return lista.map((a) => (a === OTRO && nota ? nota : a));
}
