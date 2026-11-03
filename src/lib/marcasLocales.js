/**
 * Las marcas de pantalla (plan fichas con estado, «Marca de pantalla»): estado de una interfaz, no de la casa,
 * así que viven en el móvil (localStorage), una por casa, como botRevVisto.js, y nunca en el documento de la
 * casa. El trozo 12 de #1037 empezó con `pantryPrefsSeen`; el 22 trae `pantryHasItems` («¿tienes algo en casa?» del
 * asistente) y quita del documento las marcas que nadie lee (`modePrompted`, `pantryPrefsSet`). `expertMode` no es
 * marca de pantalla: lo lee el motor (resolveModeData) también en Lola, así que sigue en la casa (Pablo, 3 nov 2026).
 *
 * Sin casa (invitado, sin cuenta), la clave «local». Un fallo de localStorage no se traga: llega a quien llama.
 */

/** Las marcas que guarda el móvil. Con el nombre que tenían en los datos de la casa, para poder contarlas. */
export const MARCAS_LOCALES = Object.freeze(["pantryPrefsSeen", "pantryHasItems"]);

/** Marcas de pantalla que se guardaban en la casa y nadie lee ya: no se guardan en ningún sitio. */
export const MARCAS_SIN_LECTOR = Object.freeze(["modePrompted", "pantryPrefsSet"]);

/** Lo que una casa vieja aún trae en su documento y no debe volver a guardarse: lo del móvil y lo que nadie lee. */
export const MARCAS_FUERA_DE_LA_CASA = Object.freeze([...MARCAS_LOCALES, ...MARCAS_SIN_LECTOR]);

/** Los datos de la casa sin las marcas de pantalla (para guardar el documento, en la app y en Lola). */
export function sinMarcasDePantalla(data) {
  if (!data || !MARCAS_FUERA_DE_LA_CASA.some((k) => k in data)) return data;
  return Object.fromEntries(Object.entries(data).filter(([k]) => !MARCAS_FUERA_DE_LA_CASA.includes(k)));
}

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

/** Pone la marca a sí o a no (la quita) en este móvil para esta casa. */
export function ponerMarcaLocal(marca, casa, valor, almacen = window.localStorage) {
  if (valor) almacen.setItem(clave(marca, casa), "1");
  else almacen.removeItem(clave(marca, casa));
}

/**
 * ¿Sale sola la hoja «¿Cuándo se da por gastado?» de «En casa» (Shopping.jsx)? La primera vez que se entra en esa
 * pestaña (`pestana` "home") con un menú activo, si se puede editar y este móvil aún no la enseñó en esta casa
 * (`pantryPrefsSeen`, que se apunta al contestarla o cerrarla). El icono de la pestaña la reabre igual.
 */
export const abrirPrefsDespensaSola = ({ pestana, puedeEditar, menuActivo, casa, almacen = window.localStorage }) =>
  pestana === "home" && puedeEditar && Boolean(menuActivo) && !marcaLocal("pantryPrefsSeen", casa, almacen);
