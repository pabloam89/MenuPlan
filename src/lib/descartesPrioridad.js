import { ALCANCE_DESCARTE } from "./vocabularios.js";

// Qué platos baja de prioridad una casa por lo que descarta al regenerar. Es la lectura de lo
// que apunta src/lib/descartes.js: aquí solo está la cuenta (pura, sin red) y la memoria de la
// última cuenta, que lee el solver y el cambio de plato suelto.
//
// El criterio, por casa y no por persona:
//   · cada descarte suma puntos según cuánto se tiró de golpe: un plato suelto dice mucho de ese
//     plato (1 punto), un día entero algo menos (0,5) y regenerar el menú entero casi nada de
//     cada uno (0,1: son ~17 platos a la vez). Se cuenta en DÉCIMAS de punto, con enteros, para
//     que sumar muchos 0,1 no dé 1,9999… y falle el umbral;
//   · solo cuentan los últimos 60 días, y un plato no vuelve a salir bajo sospecha por algo de
//     hace meses;
//   · con UMBRAL_DESCARTE puntos o más el plato pasa a ser de las ÚLTIMAS opciones. No se quita:
//     si no hay otro, sale (el solver y el cambio de plato caen al pool entero, como con los
//     recientes). Una sola vez es ruido (quizá ese día no apetecía); dos señales ya son patrón.
// Los números son una estimación sin datos todavía: medir una semana y ajustar aquí, en un solo
// sitio, antes de dar el criterio por cerrado.

/** Décimas de punto que suma un descarte según su alcance (10 = un punto). */
export const PUNTOS_POR_ALCANCE = Object.freeze({
  [ALCANCE_DESCARTE.PLATO]: 10,
  [ALCANCE_DESCARTE.DIA]: 5,
  [ALCANCE_DESCARTE.MENU]: 1,
});

/** Días hacia atrás que se miran. */
export const VENTANA_DIAS_DESCARTE = 60;

/** Décimas de punto a partir de las que un plato pasa a las últimas opciones (20 = 2 puntos). */
export const UMBRAL_DESCARTE = 20;

const MS_DIA = 24 * 60 * 60 * 1000;

/**
 * Los platos que la casa ha tirado lo bastante como para bajarlos de prioridad.
 * @param {Array<{receta_id: string, alcance: string, created_at: string}>} filas descartes de la casa
 * @param {object} [opciones]
 * @param {number} [opciones.ahora] instante de referencia en ms (para los tests)
 * @param {Set<string>|string[]} [opciones.exentos] ids que no se bajan: las favoritas de la casa
 * @returns {Set<string>} ids de receta de catálogo
 */
export function recetasDescartadas(filas, { ahora = Date.now(), exentos = [] } = {}) {
  const fuera = exentos instanceof Set ? exentos : new Set(exentos);
  const desde = ahora - VENTANA_DIAS_DESCARTE * MS_DIA;
  const puntos = new Map();
  for (const f of filas ?? []) {
    const cuando = Date.parse(f?.created_at);
    if (!f?.receta_id || fuera.has(f.receta_id) || !Number.isFinite(cuando) || cuando < desde) continue;
    const suma = PUNTOS_POR_ALCANCE[f.alcance];
    if (!suma) continue;
    puntos.set(f.receta_id, (puntos.get(f.receta_id) ?? 0) + suma);
  }
  return new Set([...puntos].filter(([, p]) => p >= UMBRAL_DESCARTE).map(([id]) => id));
}

/**
 * Entre los candidatos, los que no están bajados de prioridad; si no queda ninguno, todos
 * (un hueco sin plato es peor que uno repetido o rechazado).
 */
export function sinDescartadas(candidatos, descartadas) {
  if (!descartadas || descartadas.size === 0) return candidatos;
  const frescos = candidatos.filter((r) => !descartadas.has(r.id));
  return frescos.length > 0 ? frescos : candidatos;
}

// La última cuenta, en memoria: el solver y el cambio de plato la leen sin que nadie se la pase
// por toda la cadena. La rellena src/App.jsx al saber la casa activa y tras cada descarte. Vacía
// por defecto (invitado, bot, sin migración): entonces nada cambia.
let descartadasActuales = new Set();

/** Fija la cuenta vigente (un Set de ids de receta). */
export function fijarDescartadas(ids) {
  descartadasActuales = ids instanceof Set ? ids : new Set(ids ?? []);
}

/** La cuenta vigente, sin las exentas (favoritas) si se dicen. */
export function descartadasVigentes({ exentos = [] } = {}) {
  const fuera = exentos instanceof Set ? exentos : new Set(exentos);
  if (fuera.size === 0) return descartadasActuales;
  return new Set([...descartadasActuales].filter((id) => !fuera.has(id)));
}
