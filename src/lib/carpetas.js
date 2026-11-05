/**
 * Las carpetas de recetas sin red ni navegador: las 4 fijas con su etiqueta, el id que se
 * escribe y el de una carpeta nueva. Las usan la app (`recipeCollections.js`, que las
 * reexporta) y Lola (`api/_bot/propias.js`), que no puede cargar el cliente de Supabase del
 * navegador. Qué es cada clase de carpeta: `recipeCollections.js`.
 */
import * as ids from "./ids.js";
import { CARPETAS_FIJAS, paraEscribir } from "./vocabularios.js";

/** La etiqueta de cada carpeta fija, por su id. Los ids salen de vocabularios.js (CHECK de 0086). */
const ETIQUETA_CARPETA_FIJA = {
  dia_a_dia: "Día a día",
  ocasion_especial: "Ocasión especial",
  cena_rapida: "Cena rápida",
  hijos: "Para mis hijos",
};

// En el orden de la constante; vocabularios.test.js comprueba que cada id tiene su etiqueta.
export const BUILT_IN_COLLECTIONS = CARPETAS_FIJAS.map((id) => ({ id, label: ETIQUETA_CARPETA_FIJA[id] }));

export const BUILT_IN_IDS = CARPETAS_FIJAS;

/**
 * El collection_id que se escribe (#539): una carpeta propia (`fld_…`, el patrón del CHECK)
 * tal cual; una fija, por la lista viva (un retirado pasa a su sucesor, uno sin sucesor da
 * null, uno desconocido lanza FueraDeVocabulario). «Descartados» no se guarda nunca: lanza.
 */
export function carpetaParaEscribir(id) {
  return typeof id === "string" && id.startsWith("fld_") ? id : paraEscribir("carpetas_fijas", id);
}

/**
 * "Descartados" no es una carpeta de este mapa: se pinta como una más en Mis
 * recetas, pero sus ids salen de `data.discards` (los rechazos de menú, que ya
 * excluyen del generador vía activeDiscardIds). Se queda fuera de
 * BUILT_IN_COLLECTIONS a propósito para que nunca aparezca como destino en el
 * selector de "guardar en…": ahí no se guarda, de ahí se recupera.
 */
export const DISCARDED_ID = "descartados";

const BUILT_IN = new Set(BUILT_IN_IDS);

export function isBuiltInCollection(id) {
  return BUILT_IN.has(id);
}

/** Las 4 fijas seguidas de las del usuario, ya etiquetadas para pintar. */
export function allFolders(customFolders = []) {
  return [
    ...BUILT_IN_COLLECTIONS.map((c) => ({ ...c, builtIn: true })),
    ...customFolders.map((f) => ({ id: f.id, label: f.name, builtIn: false })),
  ];
}

export function folderLabel(folderId, customFolders = []) {
  return allFolders(customFolders).find((f) => f.id === folderId)?.label ?? folderId;
}

export function newFolderId() {
  return ids.carpeta.nuevo();
}
