/**
 * ¿La cifra de después sale del ruido de la de antes? (#480, fondo #479).
 *
 * «Mejoró» solo vale si la diferencia es mayor que lo que la cifra varía sola. Se
 * mira con un gráfico de control de individuos (XmR, Shewhart; NIST/SEMATECH
 * e-Handbook, 6.3.2): la media de la serie de antes y sus límites a 3 sigmas, con
 * sigma estimada por el rango móvil medio entre puntos seguidos dividido por 1,128
 * (la constante d2 para rangos de dos puntos). Un valor fuera de los límites es una
 * señal; dentro, es ruido aunque «parezca» mejor o peor.
 *
 * Con pocos puntos los límites no valen: por debajo de `MIN_PUNTOS` el veredicto es
 * `sin_datos_suficientes` y lo dice, en vez de inventarse una mejora. Con todos los
 * puntos iguales (sigma 0) cualquier valor distinto sale fuera: es lo honesto con
 * una cifra que nunca se había movido.
 *
 * Puro: sin red, sin reloj y sin dependencias (lo usa el workflow semanal sin `npm ci`).
 */

/**
 * Puntos de antes que se piden para trazar límites. Wheeler recomienda unos 20 para
 * límites firmes y admite límites provisionales desde unos pocos; 8 semanas es el
 * mínimo que aquí se da por suficiente para una cifra semanal [I].
 */
export const MIN_PUNTOS = 8;

/** Constante d2 de un rango móvil de dos puntos. */
export const D2 = 1.128;

/** Los veredictos, vocabulario cerrado (van en la línea `ruido` y se agrupan). */
export const VEREDICTOS_RUIDO = {
  dentro: "la cifra de después está dentro de los límites de antes: la diferencia es ruido",
  fuera_por_encima: "la cifra de después pasa del límite superior: subió de verdad",
  fuera_por_debajo: "la cifra de después baja del límite inferior: bajó de verdad",
  sin_datos_suficientes: "hay menos puntos de antes que el mínimo, o falta la cifra de después: no se puede decir si cambió",
};

const redondeo = (x) => (x === null ? null : Math.round(x * 100) / 100);

/**
 * Dada la serie de antes (números, del más antiguo al más reciente) y el valor de
 * después, dice si la diferencia sale del margen.
 * → { veredicto, puntos, minimo, media, sigma, inferior, superior }
 */
export function salDelMargen(serie, valor, { minimo = MIN_PUNTOS } = {}) {
  const xs = (Array.isArray(serie) ? serie : []).filter((x) => typeof x === "number" && Number.isFinite(x));
  const base = { puntos: xs.length, minimo, media: null, sigma: null, inferior: null, superior: null };
  if (xs.length < minimo || typeof valor !== "number" || !Number.isFinite(valor)) return { veredicto: "sin_datos_suficientes", ...base };
  const media = xs.reduce((a, b) => a + b, 0) / xs.length;
  let rangos = 0;
  for (let i = 1; i < xs.length; i++) rangos += Math.abs(xs[i] - xs[i - 1]);
  const sigma = rangos / (xs.length - 1) / D2;
  const inferior = media - 3 * sigma;
  const superior = media + 3 * sigma;
  // Tolerancia de coma flotante: una serie constante de decimales (0,1 ocho veces) da una media
  // que no es exactamente 0,1, y ese mismo 0,1 no puede salir «fuera» por eso.
  const tolerancia = 1e-9 * Math.max(1, Math.abs(media));
  const veredicto = valor > superior + tolerancia ? "fuera_por_encima" : valor < inferior - tolerancia ? "fuera_por_debajo" : "dentro";
  return { veredicto, puntos: xs.length, minimo, media: redondeo(media), sigma: redondeo(sigma), inferior: redondeo(inferior), superior: redondeo(superior) };
}

/** La línea contable del margen de una cifra. */
export function lineaDeRuido(id, valor, r) {
  const n = (x) => (x === null || x === undefined ? "-" : String(x));
  return `ruido metrica: ${id} valor: ${n(valor)} puntos: ${r.puntos} minimo: ${r.minimo} media: ${n(r.media)} inferior: ${n(r.inferior)} superior: ${n(r.superior)} veredicto: ${r.veredicto}`;
}

/** La frase para una persona: el veredicto en llano, con la advertencia cuando faltan datos. */
export function textoDeRuido(r) {
  if (r.veredicto === "sin_datos_suficientes") return `sin datos suficientes (${r.puntos} de ${r.minimo} puntos de antes)`;
  const margen = `media ${r.media}, límites ${r.inferior} a ${r.superior}, ${r.puntos} puntos`;
  if (r.veredicto === "dentro") return `dentro del ruido (${margen})`;
  return `${r.veredicto === "fuera_por_encima" ? "sube" : "baja"} de verdad (${margen})`;
}
