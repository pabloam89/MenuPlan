/**
 * Hasta dónde llega el bot en Mercadona (mercadona_cuenta.alcance, 0133; trozo 15 de #1407), en orden: cada paso
 * incluye los de antes. Aparte de vocabularios.js porque el trabajador corre en un contenedor que solo lleva lo suyo.
 * COPIA PROVISIONAL en la rama del trozo 19: la de verdad llega con el trozo 15 y esta se descarta al juntarlas.
 */
export const ALCANCES_MERCADONA = ["lista", "reservar", "pagar"];
export const ALCANCE_MERCADONA = Object.freeze(Object.fromEntries(ALCANCES_MERCADONA.map((a) => [a.toUpperCase(), a])));

/** Si con `alcance` el bot llega a `paso`. Sin alcance o con uno desconocido, solo la lista. */
export function llegaA(alcance, paso) {
  const hasta = ALCANCES_MERCADONA.indexOf(alcance);
  return ALCANCES_MERCADONA.indexOf(paso) <= (hasta < 0 ? 0 : hasta);
}
