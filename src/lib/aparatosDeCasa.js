/**
 * Los aparatos de la casa tal como se enseñan (trozo 12 de #1037). `kitchenTools` es una lista cerrada
 * (APARATOS_CASA, vocabularios.js): lo que no está en ella va como OTRO y su nombre, en `kitchenToolsNota`.
 * Sustituye a `customKitchenTools`, la lista abierta de antes (0 casas la tenían el 2 nov 2026). Los súper
 * (`supermarkets` y `supermarketsNota`) tienen la misma forma y se enseñan con `conSuNota`.
 *
 * El motor no la necesita: cruza `kitchenTools` con el aparato que pide cada receta (filterRecipes), y OTRO no
 * lo pide ninguna. Esto es para quien lo enseña o se lo cuenta a Lola.
 */
import { OTRO } from "./vocabularios.js";

/** Pura. Una lista de la casa con OTRO tal como se enseña: OTRO sale con su nota, o como «Otro» si no la hay. */
export function conSuNota(lista, nota) {
  const n = typeof nota === "string" ? nota.trim() : "";
  return (Array.isArray(lista) ? lista : []).map((x) => (x === OTRO && n ? n : x));
}

/** Pura. Los nombres de los aparatos de la casa (conSuNota con kitchenToolsNota). */
export function aparatosParaEnsenar(data) {
  return conSuNota(data?.kitchenTools, data?.kitchenToolsNota);
}
