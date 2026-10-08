// Manejadores para un `.catch` que sigue adelante sin tragarse el error a
// escondidas (#177): siempre deja rastro en el log. Lo vigila
// sinErroresTragados.test.js.
//
//   seguirCon: se sigue a propósito (lo que falla es accesorio). Va con su
//              «// a propósito: …» al lado y deja un console.warn.
//   fallaCon:  es un fallo de verdad, pero no debe tumbar el turno: se sigue
//              con el valor por defecto y deja un console.error.

const motivo = (e) => String(e?.message ?? e).slice(0, 200);

/** console.warn con dónde y por qué, y sigue con `valor`. */
export const seguirCon = (donde, valor) => (e) => {
  console.warn(`[${donde}]`, motivo(e));
  return valor;
};

/** console.error con dónde y por qué, y sigue con `valor`. */
export const fallaCon = (donde, valor) => (e) => {
  console.error(`[${donde}]`, motivo(e));
  return valor;
};
