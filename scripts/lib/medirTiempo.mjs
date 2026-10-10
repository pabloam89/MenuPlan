/**
 * medirTiempo.mjs — cómo mide tiempo un test sin dar rojos falsos bajo carga (#499, fondo #176).
 *
 * La clase: todo test que compara una duración con un tope fijo sin 20× de
 * margen sobre lo que tarda suelto, o con una sola medida, falla cuando varias
 * sesiones corren tests a la vez (#407: una razón con umbral 8× falló cuatro
 * veces; #499: 4 s frente a un tope de 800 ms medido en ~100 ms). La regla está
 * en `.claude/rules/tests.md`; la hace cumplir `ops/testsDeTiempo.test.js`
 * (vigilante de ops/vigilantes.json) con el escáner de abajo.
 *
 * Los caminos que acepta el vigilante:
 *  1. La utilidad: `expect(medianaMs(fn)).toBeLessThan(topeMs(suelto))`. La
 *     mediana de varias repeticiones aguanta un pico de carga suelto, y
 *     `topeMs` pone el tope a MARGEN veces lo medido suelto (con un suelo). Lo
 *     que no se puede repetir (deja procesos hijos vivos) va con `{ n: 1 }`:
 *     el margen de `topeMs` basta (la regla pide margen O repetición).
 *  2. Una medida a mano que no cabe en la utilidad, con la marca en las líneas de antes:
 *     `// tiempo: margen 25x medido 2026-10-10 (suelto ~160 ms, tope 4000 ms)`.
 *     El número es la razón tope / suelto, y no baja de MARGEN.
 *  3. Una medida que solo se informa y no se compara con ningún tope (un banco
 *     de resistencia): `// tiempo: sin tope — <por qué>`.
 *
 * Con `MENUPLAN_TIEMPOS=1` (a la consola) o `MENUPLAN_TIEMPOS=<fichero>` (se
 * añade ahí), cada medida con etiqueta deja una línea contable
 * (`tiempo etiqueta: … mediana_ms: … n: …`) para volver a medir lo suelto.
 */

import { appendFileSync } from "node:fs";

/** El margen mínimo entre el tope y lo que tarda suelto. */
export const MARGEN = 20;
/** Repeticiones por defecto de una mediana: un pico de carga no la mueve. */
export const REPETICIONES = 5;
/**
 * Ningún tope por debajo de esto: por debajo, una pausa del recolector o del
 * planificador pesa más que lo medido (medido el 2026-10-10 con otras sesiones:
 * operaciones de 1 a 3 ms con medianas de hasta 12 ms). Un ReDoS o una espera
 * de más tardan segundos: 100 ms los sigue cazando.
 */
export const SUELO_MS = 100;

const ahora = () => performance.now();

/** La mediana de una lista de números. */
export function mediana(valores) {
  const s = [...valores].sort((a, b) => a - b);
  if (!s.length) return NaN;
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function anotar(etiqueta, ms, n) {
  const destino = process.env.MENUPLAN_TIEMPOS;
  if (!etiqueta || !destino) return;
  const linea = `tiempo etiqueta: ${etiqueta} mediana_ms: ${ms.toFixed(1)} n: ${n}`;
  // El informe de vitest de este repo no enseña la consola de los tests: con una ruta, la línea va a ese fichero.
  if (destino === "1") console.log(linea);
  else appendFileSync(destino, `${linea}\n`);
}

/** Mediana, en ms, de `n` ejecuciones de `fn` (síncrona). */
export function medianaMs(fn, { n = REPETICIONES, etiqueta } = {}) {
  const t = [];
  for (let i = 0; i < n; i++) {
    const t0 = ahora();
    fn(i);
    t.push(ahora() - t0);
  }
  const ms = mediana(t);
  anotar(etiqueta, ms, n);
  return ms;
}

/** Mediana, en ms, de `n` ejecuciones de `fn` (asíncrona), una detrás de otra. */
export async function medianaMsAsync(fn, { n = REPETICIONES, etiqueta } = {}) {
  const t = [];
  for (let i = 0; i < n; i++) {
    const t0 = ahora();
    await fn(i);
    t.push(ahora() - t0);
  }
  const ms = mediana(t);
  anotar(etiqueta, ms, n);
  return ms;
}

/**
 * El tope para algo que tarda `sueltoMs` sin carga: MARGEN veces más, y nunca
 * menos de SUELO_MS. Si lo medido incluye una espera a propósito que la carga
 * no alarga (el tope de un proceso hijo, un temporizador), esa espera va en
 * `fijoMs` y `sueltoMs` es solo lo que varía (lo medido menos la espera): el
 * margen se aplica a lo que la carga sí alarga, no a la espera.
 */
export function topeMs(sueltoMs, { fijoMs = 0 } = {}) {
  if (!(Number(sueltoMs) > 0)) throw new Error(`topeMs: lo medido suelto tiene que ser un número positivo de ms (llegó ${sueltoMs})`);
  if (!(Number(fijoMs) >= 0)) throw new Error(`topeMs: la espera fija tiene que ser un número de ms (llegó ${fijoMs})`);
  return fijoMs + Math.max(MARGEN * sueltoMs, SUELO_MS);
}

// ── El escáner del vigilante ────────────────────────────────────────────────

/**
 * Una medida de duración a mano: `performance.now() - x`, `Date.now() - x`
 * (con x un nombre, no una cuenta de fechas como `Date.now() - 8 * 86400000`)
 * o `process.hrtime`.
 */
const MEDIDA = /(?:performance\.now|Date\.now)\(\)\s*-\s*[A-Za-z_$][\w$.]*(?!\s*[*/(\w$])|process\.hrtime/;
/** La marca de una medida a mano. */
const MARCA = /\/\/\s*tiempo:\s*(?:margen\s+(\d+(?:[.,]\d+)?)x\s+medido\s+(\d{4}-\d{2}-\d{2})|sin tope\b)/;
/**
 * Ficheros de test que el vigilante deja pasar sin cumplir: { ruta, motivo }.
 * Solo baja (ops/testsDeTiempo.test.js lo compara con su literal de partida,
 * que está vacío): una medida nueva se arregla con la utilidad, no se añade aquí.
 */
export const EXCEPCIONES_TIEMPO = [];

/** Cuántas líneas antes de la medida puede estar su marca. */
export const LINEAS_MARCA = 12;

const fechaReal = (f) => {
  const d = new Date(`${f}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === f;
};

/**
 * Las medidas de tiempo de un test que no siguen la regla: [{ linea, motivo, texto }].
 *  - `sin-marca`: una medida a mano sin `// tiempo: margen Nx medido AAAA-MM-DD` (o `sin tope`) en las
 *    LINEAS_MARCA líneas de antes (ni en la misma);
 *  - `margen-corto`: la marca dice menos de MARGEN;
 *  - `fecha-mala`: la fecha de la marca no existe;
 *  - `tope-sin-margen`: un `toBeLessThan` sobre `medianaMs` cuyo tope no sale de `topeMs`.
 * La propia utilidad (este fichero) no se escanea: no es un test.
 */
export function medidasSinMargen(texto) {
  const lineas = String(texto).split(/\r?\n/);
  const malas = [];
  lineas.forEach((l, i) => {
    const codigo = l.replace(/\/\/.*$/, "");
    if (MEDIDA.test(codigo) && !/^\s*\*/.test(l)) {
      let marca = null;
      for (let j = i; j >= Math.max(0, i - LINEAS_MARCA) && !marca; j--) marca = lineas[j].match(MARCA);
      // Con «sin tope» (marca[1] vacío) se mide para informar, no se compara con nada.
      if (!marca) malas.push({ linea: i + 1, motivo: "sin-marca", texto: l.trim().slice(0, 120) });
      else if (marca[1] !== undefined && Number(marca[1].replace(",", ".")) < MARGEN) malas.push({ linea: i + 1, motivo: "margen-corto", texto: marca[0] });
      else if (marca[1] !== undefined && !fechaReal(marca[2])) malas.push({ linea: i + 1, motivo: "fecha-mala", texto: marca[0] });
    }
    if (/medianaMs(?:Async)?\(/.test(codigo) && /toBeLessThan(?:OrEqual)?\(/.test(codigo) && !/topeMs\(/.test(codigo)) {
      malas.push({ linea: i + 1, motivo: "tope-sin-margen", texto: l.trim().slice(0, 120) });
    }
  });
  return malas;
}
