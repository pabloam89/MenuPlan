/**
 * Dónde se abre la lista que hizo Lola, en la app de iPhone: en la web de Mercadona (dentro de HoMenu, con la sesión
 * con la que se entró) o en la app de Mercadona. Se pregunta la primera vez y se recuerda en este móvil: es cosa del
 * aparato (si tiene la app de Mercadona o no), no de la casa. Se cambia en los ajustes de Mercadona.
 */

/** Las dos respuestas posibles. Vocabulario cerrado: lo que no sea una de estas es «aún no ha elegido». */
export const ABRIR_EN = Object.freeze({ WEB: "web", APP: "app" });

export const TEXTO_ABRIR = Object.freeze({
  PREGUNTA: "¿Dónde abres tu lista?",
  WEB: "Web de Mercadona",
  APP: "App de Mercadona",
  SI_LA_TIENES: "Si la tienes instalada.",
  AJUSTE: "Abrir listas en la app de Mercadona",
});

const CLAVE = "mp_mercadona_abrir";

const almacenDe = () => {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    // Con el almacén bloqueado no hay nada que leer: se pregunta cada vez.
    return null;
  }
};

/** La elección guardada en este móvil, o null si aún no hay (o no se puede leer). */
export function leerAbrirEn(almacen = almacenDe()) {
  try {
    const v = almacen?.getItem(CLAVE);
    return Object.values(ABRIR_EN).includes(v) ? v : null;
  } catch (e) {
    console.error("[mercadona] no se ha podido leer dónde abrir la lista:", String(e?.message ?? e));
    return null;
  }
}

/** Guarda la elección. Si no se puede, se dice; la lista se abre igual y la próxima vez se vuelve a preguntar. */
export function guardarAbrirEn(donde, almacen = almacenDe()) {
  if (!Object.values(ABRIR_EN).includes(donde)) return;
  try {
    almacen?.setItem(CLAVE, donde);
  } catch (e) {
    console.error("[mercadona] no se ha podido guardar dónde abrir la lista:", String(e?.message ?? e));
  }
}

/**
 * Abre la lista en la app de Mercadona. Su dirección es un enlace universal de Mercadona (su
 * `apple-app-site-association` cubre toda la tienda): el iPhone abre su app si está, y si no, Safari. Capacitor manda
 * `window.open` a `UIApplication.open`. Su app abre la pantalla de Listas, no la lista.
 */
export function abrirEnAppMercadona(href, abrirFuera = (u) => globalThis.open?.(u, "_blank")) {
  abrirFuera(href);
}
