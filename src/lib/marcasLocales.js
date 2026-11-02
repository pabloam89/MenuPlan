/**
 * Las marcas de pantalla (plan fichas con estado, «Marca de pantalla»): estado de una interfaz, no de la casa,
 * así que viven en el móvil (localStorage), una por casa, como botRevVisto.js, y nunca en el documento de la
 * casa. El trozo 22 de #1037 trae aquí las demás; el 12 empieza con `pantryPrefsSeen`, que era un dato de la casa.
 *
 * Sin casa (invitado, sin cuenta), la clave «local». Un fallo de localStorage no se traga: llega a quien llama.
 */

/** Las marcas que guarda el móvil. Con el nombre que tenían en los datos de la casa, para poder contarlas. */
export const MARCAS_LOCALES = Object.freeze(["pantryPrefsSeen"]);

function clave(marca, casa) {
  if (!MARCAS_LOCALES.includes(marca)) throw new Error(`marcasLocales: «${marca}» no es una marca de MARCAS_LOCALES`);
  return `hm.marca.${marca}.${casa ?? "local"}`;
}

/** ¿Este móvil ya apuntó la marca en esta casa? */
export const marcaLocal = (marca, casa, almacen = window.localStorage) => almacen.getItem(clave(marca, casa)) === "1";

/** Apunta la marca en este móvil para esta casa. */
export function apuntarMarcaLocal(marca, casa, almacen = window.localStorage) {
  almacen.setItem(clave(marca, casa), "1");
}

/**
 * ¿Sale sola la hoja «¿Cuándo se da por gastado?» de «En casa» (Shopping.jsx)? La primera vez que se entra en esa
 * pestaña (`pestana` "home") con un menú activo, si se puede editar y este móvil aún no la enseñó en esta casa
 * (`pantryPrefsSeen`, que se apunta al contestarla o cerrarla). El icono de la pestaña la reabre igual.
 */
export const abrirPrefsDespensaSola = ({ pestana, puedeEditar, menuActivo, casa, almacen = window.localStorage }) =>
  pestana === "home" && puedeEditar && Boolean(menuActivo) && !marcaLocal("pantryPrefsSeen", casa, almacen);
