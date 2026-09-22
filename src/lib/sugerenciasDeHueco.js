/**
 * Las doce de «Para este hueco».
 *
 * ── Qué estaba mal ────────────────────────────────────────────────────────
 * El pool llegaba tal cual salía de `pickCatalogReplacement`, y ese pool está
 * ORDENADO por como se recorre el catálogo, no por lo que le sirve a alguien
 * que mira una tira de doce. Al abrir una comida salían, en este orden:
 *
 *   buñuelos de garbanzo · garbanzos con espinacas · judías con garbanzos ·
 *   ensalada de garbanzos · garbanzos con chorizo · ropa vieja con garbanzos ·
 *   garbanzos con arroz · steak frites · milanesa · filetes empanados ·
 *   entrecot · bowl de quinoa
 *
 * Siete de garbanzos seguidos y luego cuatro de filete con patatas. Con doce
 * huecos para enseñar el catálogo entero, gastar siete en la misma legumbre no
 * es variedad: es el orden del fichero asomando.
 *
 * ── Dos arreglos, y ninguno filtra ────────────────────────────────────────
 * Lo que entra aquí ya viene validado por el motor —rol del hueco, alergias,
 * tope de tiempo, lo que ya hay esta semana—. Así que esto no quita a nadie:
 * ORDENA y REPARTE.
 *
 *   1. Lo de diario primero. Un «Solomillo Wellington» y un «Magret de pato»
 *      son platos de ocasión (`apetecible` marca justo eso) y un «Ossobuco a
 *      la milanesa» es de otra cocina. Nada de eso es lo que se cena un martes
 *      en una casa española, así que baja — pero sigue estando, porque a veces
 *      el martes es un cumpleaños.
 *
 *   2. Un tope por familia. Máximo dos platos con la misma proteína y dos de
 *      la misma categoría, repartiendo por vueltas: primero el mejor de cada
 *      familia, luego el segundo. Doce sugerencias enseñan doce cosas.
 */

/**
 * Cuánto pinta esto en una mesa de diario. Más alto, más arriba.
 *
 * No hay una lista de «platos típicos» escrita a mano a propósito: sería una
 * lista de doce que deja fuera los otros setecientos, y habría que mantenerla
 * cada vez que entra una receta. Lo de diario se reconoce por lo que NO tiene.
 */
function notaDeDiario(r) {
  let nota = 0;
  // Plato de ocasión: el catálogo ya los marca (Wellington, cochinillo,
  // chuletón, rabo de toro). Son buenísimos y no son un martes.
  if (r?.apetecible) nota -= 3;
  // Cocina de fuera. Las que no traen `cocina` son las de aquí: son 566 de
  // las 747 del catálogo estrella, o sea que esto no vacía la tira.
  if (r?.cocina) nota -= 2;
  if (r?.difficulty === "elaborada") nota -= 2;
  // Lo que se hace en media hora es lo que se hace entre semana.
  const t = r?.time ?? 999;
  if (t <= 30) nota += 1;
  if (t <= 20) nota += 1;
  // Lo que gusta en casa, cuando el catálogo lo sabe.
  if (r?.kidFavourite) nota += 1;
  return nota;
}

/** La familia de un plato, para no repetirla. */
const familias = (r) => [
  `p:${r?.mainProtein ?? "none"}`,
  `c:${r?.category ?? "none"}`,
];

/**
 * Cuántos de la misma familia se admiten antes de empezar a repetir.
 *
 * Es un tope BLANDO: si el hueco tiene poco donde elegir, se dan más vueltas
 * hasta llenar. Doce sugerencias parecidas son mejores que cuatro, y un hueco
 * con cuatro candidatos no es sitio para lucir variedad.
 *
 * Para que el tope signifique algo hay que pedirle al motor bastantes más
 * candidatos que sugerencias (ver `sugerenciasDelHueco` en App.jsx): con doce
 * candidatos para doce huecos no hay nada que repartir.
 */
const TOPE_POR_FAMILIA = 2;

/**
 * @param {object[]} candidatos  el pool del motor, ya filtrado para este hueco
 * @param {number} cuantas
 * @returns {object[]}
 */
export function sugerenciasDeHueco(candidatos, cuantas = 12) {
  const pool = (candidatos ?? []).filter(Boolean);
  if (pool.length <= 1) return pool.slice(0, cuantas);

  // Se ordena por nota, y a igualdad se respeta el orden de entrada: el motor
  // ya trae sus propios criterios dentro y no hay por qué darles la vuelta.
  const ordenados = pool
    .map((r, i) => ({ r, i, nota: notaDeDiario(r) }))
    .sort((a, b) => b.nota - a.nota || a.i - b.i);

  // Por vueltas: en la primera solo entra un plato por familia, en la segunda
  // el segundo de cada una. Así las doce salen repartidas aunque el pool esté
  // lleno de garbanzos.
  const elegidas = [];
  const puestas = new Set();
  const usados = new Map();
  // Se dan vueltas hasta llenar. Las dos primeras son el tope; a partir de ahí
  // el hueco no daba para más variedad y se relaja en vez de quedarse corto.
  for (let vuelta = 1; elegidas.length < cuantas && elegidas.length < pool.length; vuelta++) {
    const antes = elegidas.length;
    for (const { r } of ordenados) {
      if (elegidas.length >= cuantas) break;
      if (puestas.has(r)) continue;
      if (familias(r).some((f) => (usados.get(f) ?? 0) >= vuelta)) continue;
      elegidas.push(r);
      puestas.add(r);
      for (const f of familias(r)) usados.set(f, (usados.get(f) ?? 0) + 1);
    }
    // Una vuelta que no coloca nada no colocará nada nunca: corta el bucle.
    if (elegidas.length === antes && vuelta > TOPE_POR_FAMILIA) break;
  }

  return elegidas;
}
