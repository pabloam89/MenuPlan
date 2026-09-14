/**
 * El reparto: un eje de SUMA FIJA sobre las familias de plato.
 *
 * ── Por qué no son los `freqs` de siempre ─────────────────────────────────
 * `config.freqs` son MÁXIMOS por semana, y el prompt del planner lo repite
 * tres veces ("NUNCA lo superes. Por debajo del número está siempre bien").
 * Son topes independientes: pueden solaparse (un arroz a la cubana gasta
 * `pasta_arroz` Y `huevos` de golpe) y su suma —14 con los defaults— está
 * deliberadamente por debajo de los 21 huecos de una semana. No son una
 * partición de nada.
 *
 * Un slider de "proporciones" es exactamente lo contrario: quitar de uno tiene
 * que poner en otro, porque el número de huecos no cambia. Meter esa mecánica
 * dentro de `freqs` habría cambiado el significado del campo para el motor y
 * obligado a reescribir el prompt y sus tests.
 *
 * Así que el reparto es un eje NUEVO —un porcentaje por familia que suma
 * siempre 100— y `repartoAFreqs` lo baja a máximos al generar. El motor sigue
 * recibiendo lo mismo que siempre, y las 16 reglas de validateMenu.js no se
 * enteran de que esto existe.
 *
 * ── La propiedad que lo mantiene honesto ──────────────────────────────────
 * El reparto por defecto proyecta EXACTAMENTE a DEFAULT_FREQS. Es decir: abrir
 * la pantalla nueva y no tocar nada genera el mismo menú que antes. Está en el
 * test, porque es la única forma de saber que un cambio de redondeo no ha
 * movido en silencio el menú de todo el mundo.
 */

import { DEFAULT_FREQS } from "./aiPlanner.js";
import { FAMILIAS } from "./notepadFields.js";

/** La suma es fija, y es 100. Porcentajes enteros: no hay medio plato. */
export const TOTAL = 100;

/**
 * El presupuesto semanal al que se baja el reparto. Es la suma de
 * DEFAULT_FREQS (14), no los 21 huecos de la semana: los `freqs` son topes con
 * holgura, y proyectar sobre 21 los dejaría tan altos que dejarían de limitar
 * nada — que es justo lo que hace hoy un tope de 7 en una familia.
 */
export const PRESUPUESTO = Object.values(DEFAULT_FREQS).reduce((a, b) => a + b, 0);

/** Un reparto con todo a cero: el punto de partida de `normalizar`. */
function vacio() {
  return Object.fromEntries(FAMILIAS.map((f) => [f, 0]));
}

/**
 * Cualquier mapa de pesos → enteros que suman exactamente 100.
 *
 * Reparte el resto por mayor resto (largest remainder) en vez de sumárselo
 * todo al primero: con seis familias, redondear a la baja pierde hasta 5
 * puntos, y dárselos a `carne` porque va primera en el array es un sesgo que
 * nadie pidió y que nadie vería.
 */
function aPorcentajes(pesos, suma) {
  const exactos = {};
  const enteros = vacio();
  let asignado = 0;
  for (const f of FAMILIAS) {
    exactos[f] = (pesos[f] / suma) * TOTAL;
    enteros[f] = Math.floor(exactos[f]);
    asignado += enteros[f];
  }
  const restos = FAMILIAS
    .map((f) => ({ f, resto: exactos[f] - enteros[f] }))
    .sort((a, b) => b.resto - a.resto || FAMILIAS.indexOf(a.f) - FAMILIAS.indexOf(b.f));
  for (let i = 0; asignado < TOTAL; i++, asignado++) enteros[restos[i % FAMILIAS.length].f] += 1;
  return enteros;
}

export function normalizar(bruto) {
  const pesos = {};
  let suma = 0;
  for (const f of FAMILIAS) {
    const v = Number(bruto?.[f]);
    const limpio = Number.isFinite(v) && v > 0 ? v : 0;
    pesos[f] = limpio;
    suma += limpio;
  }

  // Sin nada de qué repartir no hay reparto posible: se cae al default en vez
  // de devolver seis ceros, que como estado de un slider no significa nada.
  if (suma === 0) return repartoPorDefecto();

  return aPorcentajes(pesos, suma);
}

/** El reparto de partida: DEFAULT_FREQS en porcentaje. */
export function repartoPorDefecto() {
  const pesos = {};
  for (const f of FAMILIAS) pesos[f] = DEFAULT_FREQS[f] ?? 0;
  // No llama a `normalizar` para que no haya forma de recursión si algún día
  // DEFAULT_FREQS se quedara a cero: aquí la suma se calcula y se usa directa.
  return aPorcentajes(pesos, Object.values(pesos).reduce((a, b) => a + b, 0));
}

/**
 * Mover un slider. Devuelve un reparto NUEVO que sigue sumando 100.
 *
 * Lo que se quita (o se añade) sale del resto EN PROPORCIÓN a lo que cada
 * familia pesa ahora, no a partes iguales: si comes mucha carne y poco huevo,
 * subir el pescado tiene que morder sobre todo de la carne. A partes iguales,
 * subir un punto podía dejar los huevos en negativo y el gesto se sentía
 * aleatorio.
 *
 * `familia` nunca se mueve sola: es el único valor que el usuario ha pedido
 * explícitamente, así que se respeta y el ajuste lo pagan las demás.
 */
export function mover(reparto, familia, valor) {
  if (!FAMILIAS.includes(familia)) return normalizar(reparto);

  const actual = normalizar(reparto);
  const destino = Math.max(0, Math.min(TOTAL, Math.round(valor)));
  const delta = destino - actual[familia];
  if (delta === 0) return actual;

  const otras = FAMILIAS.filter((f) => f !== familia);
  const disponible = otras.reduce((a, f) => a + actual[f], 0);

  // Subir cuando las demás ya están a cero no es posible: el tope real de un
  // slider no es 100, es 100 menos lo que las otras no pueden ceder.
  if (delta > 0 && disponible === 0) return actual;

  const siguiente = { ...actual, [familia]: destino };
  let porRepartir = -delta;

  if (delta > 0) {
    // Quitar de las otras, proporcional a su peso y sin bajar de cero.
    let restante = delta;
    for (const f of otras) {
      const cuota = Math.round((actual[f] / disponible) * delta);
      const quita = Math.min(actual[f], cuota, restante);
      siguiente[f] = actual[f] - quita;
      restante -= quita;
    }
    // El redondeo deja un pico suelto: se lo come la familia que más tenga,
    // que es la que menos lo nota.
    for (let i = 0; restante > 0 && i < FAMILIAS.length * TOTAL; i++) {
      const mayor = otras.reduce((a, f) => (siguiente[f] > siguiente[a] ? f : a), otras[0]);
      if (siguiente[mayor] === 0) break;
      siguiente[mayor] -= 1;
      restante -= 1;
    }
  } else {
    // Bajar: se devuelve a las otras, proporcional a su peso. Si todas están a
    // cero (el usuario había puesto una familia al 100), se reparte a partes
    // iguales, que es lo único razonable sin pesos de los que tirar.
    let restante = -delta;
    const base = disponible > 0
      ? otras.map((f) => ({ f, peso: actual[f] / disponible }))
      : otras.map((f) => ({ f, peso: 1 / otras.length }));
    for (const { f, peso } of base) {
      const pon = Math.min(Math.round(peso * -delta), restante);
      siguiente[f] = actual[f] + pon;
      restante -= pon;
    }
    for (let i = 0; restante > 0; i++, restante--) siguiente[otras[i % otras.length]] += 1;
  }

  porRepartir = TOTAL - FAMILIAS.reduce((a, f) => a + siguiente[f], 0);
  // Cinturón: pase lo que pase con los redondeos, sale sumando 100 y con el
  // valor que el usuario pidió intacto.
  for (let i = 0; porRepartir !== 0 && i < FAMILIAS.length * TOTAL; i++) {
    const f = otras[i % otras.length];
    if (porRepartir > 0) { siguiente[f] += 1; porRepartir -= 1; }
    else if (siguiente[f] > 0) { siguiente[f] -= 1; porRepartir += 1; }
  }

  return siguiente;
}

/**
 * El reparto bajado a lo que el motor entiende: máximos por semana.
 *
 * `presupuesto` es cuántas raciones reparte en total. Por defecto la suma de
 * DEFAULT_FREQS, para que un reparto sin tocar dé exactamente los freqs de
 * siempre. Se puede subir cuando la semana tiene más huecos de lo normal.
 */
export function repartoAFreqs(reparto, { presupuesto = PRESUPUESTO } = {}) {
  const pct = normalizar(reparto);
  const freqs = {};
  for (const f of FAMILIAS) {
    const veces = Math.round((pct[f] / TOTAL) * presupuesto);
    // El dominio de un `freq` es 0..7 (una vez al día como mucho), igual que
    // el `n` que puede emitir el panel. Un 9 no lo rechazaría nadie aguas
    // abajo, simplemente dejaría de limitar.
    freqs[f] = Math.max(0, Math.min(7, veces));
  }
  return freqs;
}

/** El camino de vuelta: unos freqs guardados → el reparto que los pinta. */
export function freqsAReparto(freqs) {
  return normalizar(freqs ?? DEFAULT_FREQS);
}

/**
 * Los `freqs` que se le mandan al planner cuando la libreta tiene los dos ejes
 * escritos. Es una política de producto, así que vive aquí y no dentro de
 * `proyectar()`, donde nadie la encontraría.
 *
 * Manda `freqs` sobre `reparto`, familia a familia. El motivo es de quién dijo
 * qué: un `freq` solo se escribe si alguien pidió ese número —la pregunta del
 * wizard, o el panel diciendo "pescado tres veces"— mientras que el reparto se
 * mueve entero cada vez que se toca UN slider, porque la suma es fija. Si
 * ganara el reparto, subir la carne bajaría en silencio un pescado que el
 * usuario había pedido a mano hace dos semanas.
 *
 * Sin reparto escrito devuelve los `freqs` tal cual, así que una casa que
 * nunca abra la pantalla nueva no nota nada.
 */
export function freqsEfectivos({ freqs = {}, reparto = null } = {}, opciones = {}) {
  if (!reparto || Object.keys(reparto).length === 0) return { ...freqs };
  const delReparto = repartoAFreqs(reparto, opciones);
  const salida = { ...delReparto };
  for (const [familia, valor] of Object.entries(freqs)) {
    if (valor !== undefined) salida[familia] = valor;
  }
  return salida;
}

/**
 * La ruta de la libreta para una familia del reparto. Mismo formato que
 * `rutaDe` en notepadFields.js — el reparto vive en la libreta como todo lo
 * demás, para que herede los cuatro estados y la procedencia sin código nuevo.
 */
export function rutaDeReparto(familia) {
  return `reparto.${familia}`;
}

/**
 * El reparto que hay que PINTAR.
 *
 * Una sola fuente para el slider: si hay reparto escrito, ese y nada más. Solo
 * cuando la libreta no sabe nada del eje se cae a los `freqs` de siempre, que
 * es lo que hace que una casa llegada del wizard viejo vea sus números y no
 * unos por defecto.
 *
 * Deliberadamente NO funde los dos ejes al pintar. Fundirlos obligaba a pasar
 * por enteros de 0 a 7 y volver, y esa ida y vuelta cuantiza: un slider al 5 %
 * son 0,7 veces por semana, que redondean a 1 y vuelven como 8 %. El pulgar
 * saltaba bajo el dedo, que es la peor sensación que puede dar un control.
 */
export function repartoVisible({ freqs = {}, reparto = null } = {}) {
  if (reparto && Object.keys(reparto).length > 0) return normalizar(reparto);
  if (Object.keys(freqs).length === 0) return repartoPorDefecto();
  // Los `freqs` llegan casi siempre INCOMPLETOS: el panel escribe solo las
  // familias que el usuario nombró ("más pescado" toca una de seis). Sin
  // rellenar el resto con el default, normalizar las trata como ceros y una
  // frase sobre el pescado dejaba la semana entera sin legumbres, sin pasta y
  // sin verdura.
  return normalizar({ ...DEFAULT_FREQS, ...freqs });
}

/**
 * "Pescado tres veces por semana" traducido a un empujón del slider.
 *
 * El panel y el primer prompt hablan en veces por semana —que es como habla la
 * gente— y el slider en porcentajes. La traducción se hace AQUÍ, en el momento
 * de aplicar el ajuste, y no al pintar: así el reparto guardado ya lleva el
 * cambio dentro, el slider se mueve a la vista, y no hay dos ejes que puedan
 * contradecirse después.
 *
 * Las demás familias se recolocan solas porque `mover` mantiene la suma fija:
 * subir el pescado tiene que bajar algo, y eso es exactamente lo que el usuario
 * tiene que ver pasar.
 */
export function repartoConFreq(reparto, familia, veces, { presupuesto = PRESUPUESTO } = {}) {
  if (!FAMILIAS.includes(familia)) return normalizar(reparto);
  const pct = Math.round((Math.max(0, Math.min(7, veces)) / presupuesto) * TOTAL);
  return mover(reparto, familia, pct);
}
