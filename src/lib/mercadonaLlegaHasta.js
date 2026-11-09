/**
 * Hasta dónde llega el bot en Mercadona (mercadona_cuenta.llega_hasta, 0133): los tres pasos que enciende la persona,
 * en orden, y cada uno lleva los de antes. Aparte de vocabularios.js porque el trabajador corre en un contenedor que
 * solo lleva lo suyo. Aquí, solo lo que lee el trabajador (trozo 19); el trozo 15 trae el resto del fichero, lo
 * registra en vocabularios.js y ata la lista al CHECK de la 0133.
 */
export const LLEGA_HASTA_MERCADONA = ["lista", "reservar", "pagar"];
export const LLEGA_HASTA = Object.freeze(Object.fromEntries(LLEGA_HASTA_MERCADONA.map((a) => [a.toUpperCase(), a])));

/** Pura. Lo que se guarda, o `lista` si no hay nada o no es de la lista (una fila de antes de la 0133). */
export const llegaHastaDe = (valor) => (LLEGA_HASTA_MERCADONA.includes(valor) ? valor : LLEGA_HASTA.LISTA);

/** Pura. ¿Llegando hasta `hasta`, el bot hace `paso`? `llegaA("pagar", "reservar")` → true. */
export const llegaA = (hasta, paso) => LLEGA_HASTA_MERCADONA.indexOf(llegaHastaDe(hasta)) >= LLEGA_HASTA_MERCADONA.indexOf(llegaHastaDe(paso));
