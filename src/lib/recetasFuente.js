/**
 * De dónde salen las recetas de la casa (trozo 21 de #1037): las propias, los votos, los descartes, las colecciones y
 * las carpetas viven en sus tablas, y el documento de la casa (household_state.state.data) no las lleva. La lista sale
 * del registro (`registroFicha.js`: tema «recetas» y `vive: "tabla:…"`), no de una lista escrita a mano en cada sitio
 * que guarda el documento. Puro.
 */
import { DATOS_CASA } from "./registroFicha.js";

/** Las claves de `data` de recetas que viven en una tabla propia. */
export const CLAVES_EN_TABLAS_DE_RECETAS = Object.freeze(
  Object.entries(DATOS_CASA)
    .filter(([, d]) => d.tema === "recetas" && String(d.vive ?? "").startsWith("tabla:"))
    .map(([k]) => k),
);

/**
 * `data` sin las claves de recetas que viven en tablas, para guardar el documento de la casa.
 * @param {object | null | undefined} data
 */
export function sinRecetasDeTabla(data) {
  if (!data || !CLAVES_EN_TABLAS_DE_RECETAS.some((k) => k in data)) return data;
  return Object.fromEntries(Object.entries(data).filter(([k]) => !CLAVES_EN_TABLAS_DE_RECETAS.includes(k)));
}
