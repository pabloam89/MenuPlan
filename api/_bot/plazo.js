/**
 * El reloj de cada invocación del webhook (#958, clase F).
 *
 * Vercel mata la función a los 120 s (maxDuration de api/bot/telegram.js en
 * vercel.json), y `waitUntil` cuenta dentro de ese tiempo. Antes nadie miraba
 * el reloj: quien tenía el candado de un chat podía encadenar 4 vueltas (×2
 * intentos), cada una con hasta 55 + 50 s de modelo. La función moría a medias:
 * los mensajes ya sacados de la cola se perdían y el candado seguía tomado sus
 * 150 s.
 *
 * Ahora cada invocación lleva su hora límite (AsyncLocalStorage: en Fluid
 * Compute varias invocaciones comparten proceso, así que no vale una variable
 * del módulo). Con ella:
 *   · turnos.js no saca más trabajo de la cola si no cabe un turno entero, y
 *     se lo deja a otra invocación (el relevo de api/bot/telegram.js);
 *   · agente.js recorta el plazo del modelo a lo que queda, y no prueba el de
 *     reserva si ya no cabe: el turno acaba antes de que maten la función.
 * Fuera de una invocación (pruebas, scripts) no hay límite: `quedaMs()` es Infinity.
 */

import { AsyncLocalStorage } from "node:async_hooks";

/** El maxDuration de api/bot/telegram.js en vercel.json (lo fija plazo.test.js). */
export const DURACION_MAX_MS = 120_000;
// Lo que se reserva al final para contestar, guardar la charla y soltar el
// candado: sin esto, el turno acababa justo cuando moría la función.
export const MARGEN_MS = 12_000;
// Lo mínimo para empezar un turno nuevo: si no queda esto, el trabajo se deja
// en la cola para otra invocación. Un turno normal tarda 3-20 s (bot_route,
// oct 2026); con 35 s cabe casi siempre entero, y el plazo del modelo se
// recorta a lo que quede.
export const TURNO_MIN_MS = 35_000;
// Por debajo de esto no se prueba el modelo de reserva: no le daría tiempo.
export const RESERVA_MIN_MS = 8_000;

const reloj = new AsyncLocalStorage();

/**
 * Corre `fn` con la hora límite de esta invocación.
 * @param {number} inicioMs  cuándo empezó la invocación (Date.now() al entrar)
 * @param {() => Promise<any>} fn
 */
export function conPlazo(inicioMs, fn, { duracionMs = DURACION_MAX_MS } = {}) {
  return reloj.run({ hasta: inicioMs + duracionMs - MARGEN_MS }, fn);
}

/** Lo que le queda a esta invocación antes del margen final; Infinity fuera de una. */
export function quedaMs() {
  const p = reloj.getStore();
  return p ? Math.max(0, p.hasta - Date.now()) : Infinity;
}

/** ¿Cabe todavía un turno entero en esta invocación? */
export const cabeUnTurno = () => quedaMs() >= TURNO_MIN_MS;

/**
 * El plazo de una llamada al modelo: el suyo, o lo que quede si es menos.
 * @param {number} propioMs  el plazo normal de esa llamada (PLAZO_MS de agente.js)
 */
export const plazoDeLlamada = (propioMs) => Math.min(propioMs, quedaMs());
