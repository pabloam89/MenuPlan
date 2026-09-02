/**
 * Reparto de frecuencias dentro del presupuesto de huecos del menú.
 *
 * Vive aquí y no dentro de Onboarding.jsx por una razón concreta: esto decide
 * qué números ve el usuario en un formulario, y un formulario cuyos valores
 * cambian solos —o peor, cambian DISTINTO cada vez que repites la misma
 * acción— destruye la confianza en toda la pantalla. Siendo una función pura
 * se puede fijar con tests, que es la única forma de garantizar que no vuelve
 * a pasar.
 *
 * Historia: la versión anterior recortaba las otras categorías barajándolas
 * con `Math.random()`. Subir un valor bajaba otros al azar, y hacerlo dos
 * veces daba resultados distintos.
 */

/**
 * Sube `key` a `next` y, si el total se pasa del presupuesto, recorta el resto
 * hasta que quepa.
 *
 * El recorte va SIEMPRE a la categoría que más tiene, y a igualdad de valor a
 * la primera del orden. Dos motivos: es determinista (misma entrada, misma
 * salida, siempre) y reparte mejor que quitarle al primero que pase — bajar
 * de 5 a 4 se nota menos que dejar a alguien en 0.
 *
 * @param {Record<string, number>} current  frecuencias actuales
 * @param {string} key                      categoría que se está tocando
 * @param {number} next                     valor pedido para esa categoría
 * @param {string[]} order                  orden canónico de categorías
 * @param {number} total                    huecos disponibles en la semana
 */
export function applyFreqWithinBudget(current, key, next, order, total) {
  const base = {};
  // Se redondea TODO, no solo lo que se toca: un decimal guardado de antes
  // se pintaria tal cual en el formulario ("2,6 comidas") y sumaria mal.
  for (const k of order) base[k] = Math.max(0, Math.round(current?.[k] ?? 0));
  base[key] = Math.max(0, Math.min(99, Math.round(next)));

  let over = order.reduce((sum, k) => sum + base[k], 0) - total;
  if (over <= 0) return base;

  const others = order.filter((k) => k !== key);
  let guard = 0;
  while (over > 0 && guard < 200) {
    const trimmable = others
      .filter((k) => base[k] > 0)
      .sort((a, b) => base[b] - base[a] || order.indexOf(a) - order.indexOf(b));
    if (trimmable.length === 0) break;
    base[trimmable[0]] -= 1;
    over -= 1;
    guard += 1;
  }

  // No queda nada que recortar en el resto (todas a 0): se limita la propia
  // categoría, para que el total nunca supere el presupuesto.
  if (over > 0) base[key] = Math.max(0, base[key] - over);
  return base;
}
