/**
 * Un vocabulario en el orden que pide una pantalla o una regla, sin copiarlo.
 *
 * El orden es de quien lo usa; los valores, del dueño del vocabulario. Lo que
 * el orden nombra y el vocabulario no tiene, se cae; lo que el vocabulario
 * tiene y el orden no nombra, va al final. Así un valor nuevo aparece solo y
 * uno retirado no se queda pintado (#939).
 *
 * @template T
 * @param {readonly T[]} vocabulario  la lista del dueño
 * @param {readonly T[]} orden        los que van primero, en este orden
 * @returns {T[]}
 */
export function enOrden(vocabulario, orden) {
  const primero = orden.filter((v) => vocabulario.includes(v));
  return [...primero, ...vocabulario.filter((v) => !primero.includes(v))];
}
