/**
 * Piezas puras de la medida de un turno de Lola (bot_route, #910). Nunca
 * cambian lo que hace el bot: solo cuentan. Las lee scripts/lib/bot-semana.mjs
 * (cada campo, con su lector, en el comentario de `medir`).
 *
 * Sin dependencias, a propósito: las importan menu.js, agente.js y
 * api/bot/telegram.js, y los tests de este último sustituyen a los demás.
 */

// ── De dónde viene un turno de Lola sin enrutador ───────────────────────────
// bot_route sin_enrutador: por qué Lola contestó sin pasar por la decisión del
// enrutador. Vocabulario cerrado (lo cuenta scripts/lib/bot-semana.mjs, `uso.porOrigen`).
export const SIN_ENRUTADOR = Object.freeze({
  APAGADO: "apagado", // BOT_ROUTER=off (o los grupos apagados)
  SOMBRA: "sombra", // el enrutador decide en paralelo, contesta Lola
  IDIOMA: "idioma", // quien escribe eligió inglés
  LIMITE: "limite", // pasado el límite del mes
  ALTA: "alta", // el primer mensaje de una casa nueva (texto, audio o foto)
  FOTO: "foto", // una foto suelta
  PDF: "pdf", // un PDF suelto
  COMPARTIDO: "compartido", // «ponla en mi menú» tras recibir una receta compartida
});
// Los que traen un adjunto o montan una casa: trabajo distinto del de un
// mensaje de texto (un PDF puede tardar 20 s). El informe semanal los mide
// aparte para no mezclarlos con los p95 de los turnos de texto.
export const ORIGEN_PESADO = Object.freeze(new Set([SIN_ENRUTADOR.ALTA, SIN_ENRUTADOR.FOTO, SIN_ENRUTADOR.PDF]));

// ── El motor en frío ────────────────────────────────────────────────────────
// core.mjs son ~10 MB y se importa la primera vez que una herramienta lo
// pide (menu.js motor()). En una instancia fría, ese import es tiempo del
// turno que nadie veía: bot_route `motor_frio`.
let carga = null;

/**
 * Corre `cargar` y, solo la primera vez en esta instancia, apunta cuánto
 * tardó. Devuelve lo que devuelva `cargar`; si falla, no apunta nada.
 * @template T
 * @param {() => Promise<T>} cargar
 * @returns {Promise<T>}
 */
export async function cargaMedida(cargar) {
  const inicio = Date.now();
  const r = await cargar();
  carga ??= { inicio, fin: Date.now() };
  return r;
}

/**
 * Los ms del primer import del motor SI ocurrió mientras corría este turno
 * (acabó después de `desde`); null si ya estaba cargado de antes o no hizo
 * falta. Dos turnos a la vez en la misma instancia fría ven el mismo import.
 * @param {number} desde  Date.now() al empezar el turno
 */
export function motorFrioDesde(desde) {
  return carga && carga.fin >= desde ? carga.fin - carga.inicio : null;
}

/** Solo para los tests: olvida el import apuntado. */
export function olvidarCargaDelMotor() { carga = null; }

// ── Tiempo de reloj de las herramientas ─────────────────────────────────────
/**
 * Los ms de reloj que cubren estos intervalos: lo que de verdad esperó el
 * turno. Las lecturas corren a la vez (cuenta la más larga) y las escrituras
 * de una casa van en fila (cuentan todas, una tras otra); sumar lo que dura
 * cada una cuenta de más, porque la que espera su turno en la fila ya lleva
 * dentro la espera (desde ac4bdcc3).
 * @param {{ t0: number, ms: number }[]} herramientas  inicio (Date.now()) y duración de cada una
 * @returns {number|null}  null si no hay ninguna con inicio apuntado
 */
export function relojDeHerramientas(herramientas) {
  const tramos = (herramientas ?? [])
    .filter((h) => Number.isFinite(h?.t0) && Number.isFinite(h?.ms))
    .map((h) => [h.t0, h.t0 + Math.max(0, h.ms)])
    .sort((a, b) => a[0] - b[0]);
  if (!tramos.length) return null;
  let total = 0;
  let [ini, fin] = tramos[0];
  for (const [a, b] of tramos.slice(1)) {
    if (a > fin) { total += fin - ini; [ini, fin] = [a, b]; } else if (b > fin) fin = b;
  }
  return total + (fin - ini);
}

// ── La llamada cancelada ────────────────────────────────────────────────────
/**
 * Lo que ya se había pagado de la llamada que se cortó (la vía rápida ganó):
 * las llamadas acabadas del turno (`progreso.uso`) más lo que el stream en
 * curso había contado al cortarse (`enCurso.currentMessage.usage`: la entrada
 * llega entera en message_start, la salida va parcial). null si no hay nada.
 * @param {{ uso?: object, enCurso?: { currentMessage?: { usage?: object } } | null } | null} progreso
 * @returns {{ in: number, out: number, cr: number, cw: number } | null}
 */
export function usoParcialDe(progreso) {
  const a = progreso?.uso ?? {};
  const b = progreso?.enCurso?.currentMessage?.usage ?? {};
  const suma = (k) => (Number(a[k]) || 0) + (Number(b[k]) || 0);
  const uso = { in: suma("input_tokens"), out: suma("output_tokens"), cr: suma("cache_read_input_tokens"), cw: suma("cache_creation_input_tokens") };
  return uso.in + uso.out + uso.cr + uso.cw > 0 ? uso : null;
}

// Las dos formas en que viaja el uso: la de la API («input_tokens»…) y la corta
// de bot_route y de lo pagado al cortar una llamada («in», «out», «cr», «cw»).
const CLAVES_USO = Object.freeze({ input_tokens: "in", output_tokens: "out", cache_read_input_tokens: "cr", cache_creation_input_tokens: "cw" });

/**
 * Suma usos de un mismo turno (Lola, el enrutador, lo pagado en intentos que
 * fallaron), en la forma de la API, que es la que cuenta bot_usage (uso.js
 * contarUso). Acepta las dos formas y nulos (#958).
 */
export function sumarUsos(...usos) {
  const total = Object.fromEntries(Object.keys(CLAVES_USO).map((k) => [k, 0]));
  for (const u of usos) {
    if (!u) continue;
    for (const [k, corta] of Object.entries(CLAVES_USO)) total[k] += Number(u[k] ?? u[corta]) || 0;
  }
  return total;
}

// ── Lo que llega con el turno en marcha ─────────────────────────────────────
/**
 * Los mensajes de esta vuelta que llegaron al chat mientras corría el turno
 * anterior de la misma invocación (turnos.js drenar): cuántos y a cuántos ms
 * de su inicio. Es la medida del trozo 28 de #1037 (cancelar y rehacer): sin
 * ella no se sabía cuántos turnos reciben otro mensaje mientras corren.
 * bot_route `llegaron_durante`; lo cuenta scripts/lib/bot-semana.mjs
 * (`uso.llegaronDuranteN`, `latencia.llegaronDuranteP50Ms`).
 * @param {{ inicio: number, fin: number } | null} anterior  el turno anterior (Date.now())
 * @param {(number|null|undefined)[]} llegadas  cuándo entró en la cola cada mensaje (item.enCola)
 * @returns {{ n: number, ms: number[] } | null}  null si ninguno llegó con él en marcha
 */
export function llegadosDurante(anterior, llegadas) {
  if (!anterior || !Number.isFinite(anterior.inicio) || !Number.isFinite(anterior.fin)) return null;
  const ms = (llegadas ?? [])
    .filter((t) => Number.isFinite(t) && t > anterior.inicio && t <= anterior.fin)
    .map((t) => t - anterior.inicio);
  return ms.length ? { n: ms.length, ms } : null;
}
