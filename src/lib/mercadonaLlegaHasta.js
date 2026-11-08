/**
 * Hasta dónde llega el bot en Mercadona (mercadona_cuenta.llega_hasta, 0133): los tres pasos que enciende la persona,
 * en orden, y cada uno lleva los de antes. Aparte de vocabularios.js porque el trabajador corre en un contenedor que
 * solo lleva lo suyo; vocabularios.js lo reexporta y lo registra. Lo leen la app, Lola y el trabajador.
 */
export const LLEGA_HASTA_MERCADONA = ["lista", "reservar", "pagar"];
export const LLEGA_HASTA = Object.freeze(Object.fromEntries(LLEGA_HASTA_MERCADONA.map((a) => [a.toUpperCase(), a])));

/** Pura. Lo que se guarda, o `lista` si no hay nada o no es de la lista (una fila de antes de la 0133). */
export const llegaHastaDe = (valor) => (LLEGA_HASTA_MERCADONA.includes(valor) ? valor : LLEGA_HASTA.LISTA);

/** Pura. ¿Llegando hasta `hasta`, el bot hace `paso`? `llegaA("pagar", "reservar")` → true. */
export const llegaA = (hasta, paso) => LLEGA_HASTA_MERCADONA.indexOf(llegaHastaDe(hasta)) >= LLEGA_HASTA_MERCADONA.indexOf(llegaHastaDe(paso));

/**
 * Pura. Lo que se dice de una fila de `mercadona_cuenta` (0133), o de ninguna: hasta dónde llega el bot y qué tiene la
 * cuenta, sin la sesión y sin el teléfono (solo si está). Una fila de antes de la 0133 llega hasta la lista, sin mirar.
 */
export const deUnaCuenta = (cuenta) => ({
  llega_hasta: llegaHastaDe(cuenta?.llega_hasta),
  tiene_direccion: cuenta?.tiene_direccion ?? null,
  tiene_pago: cuenta?.tiene_pago ?? null,
  tiene_telefono: cuenta ? Boolean(cuenta.telefono_sellado) : null,
});

/** Lo que un paso pide a la cuenta, en el orden en que se pide. */
export const FALTAS_MERCADONA = ["direccion", "telefono", "pago"];
export const FALTA_MERCADONA = Object.freeze(Object.fromEntries(FALTAS_MERCADONA.map((f) => [f.toUpperCase(), f])));

/**
 * Pura. Lo que le falta a la cuenta (`{ tiene_direccion, tiene_pago, tiene_telefono }`, de estadoDeCasa) para llegar
 * hasta `hasta`. Reservar pide dirección y teléfono; pagar, además, medio de pago. «Sin mirar» (null) cuenta como falta.
 */
export function faltaPara(cuenta, hasta) {
  const falta = [];
  if (!llegaA(hasta, LLEGA_HASTA.RESERVAR)) return falta;
  if (cuenta?.tiene_direccion !== true) falta.push(FALTA_MERCADONA.DIRECCION);
  if (cuenta?.tiene_telefono !== true) falta.push(FALTA_MERCADONA.TELEFONO);
  if (llegaA(hasta, LLEGA_HASTA.PAGAR) && cuenta?.tiene_pago !== true) falta.push(FALTA_MERCADONA.PAGO);
  return falta;
}
