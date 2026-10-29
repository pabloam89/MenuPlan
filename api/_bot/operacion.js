/**
 * Cada turno de Lola es una operación con identidad y autor (#958, raíz 4).
 *
 * Antes, una escritura del bot no sabía de quién era ni de qué mensaje salía:
 *   · «deshaz» restauraba la última foto de la casa, la hubiera pedido quien
 *     fuera y desde el chat que fuera;
 *   · lo que no pasa por la casa (despensa, tareas, recordatorios) no dejaba
 *     rastro, y «apunta patatas en la despensa» + «deshaz» reactivaba el menú
 *     anterior mientras Lola decía «Deshecho»;
 *   · un fallo después de escribir pedía «escríbemelo otra vez» o ponía
 *     [[Reintentar]], y la escritura se hacía dos veces.
 *
 * Aquí vive el contexto del turno (AsyncLocalStorage, como `dentro` en
 * casa.js): quién escribe (chat y persona), de qué mensaje sale (`mid`), si es
 * un reintento, y lo que se ha escrito en él. Se pone una vez a la entrada
 * (api/bot/telegram.js, conAutor) y lo leen db.js, casa.js y agente.js sin
 * pasar parámetros por cada herramienta.
 */

import { AsyncLocalStorage } from "node:async_hooks";
import { createHash } from "node:crypto";

const als = new AsyncLocalStorage();

/**
 * Corre `fn` como una operación. `op`: { chat, persona?, mid?, reintento? }.
 * `persona` es el id de Telegram de quien escribe; null si en el turno hablan
 * varios (un grupo, juntar en turnos.js).
 */
export function conOperacion(op, fn) {
  return als.run({
    chat: op?.chat != null ? String(op.chat) : null,
    persona: op?.persona != null ? String(op.persona) : null,
    mid: op?.mid != null ? String(op.mid) : null,
    reintento: Boolean(op?.reintento),
    // Escrituras en tablas de la casa (db.js); las de registro no cuentan.
    escrituras: 0,
    // Fotos para deshacer y guardados de la casa hechos (casa.js).
    fotos: 0,
    guardadosCasa: 0,
    // La herramienta que corre ahora (agente.js), y lo que hay que deshacer
    // además de la casa si se deshace su foto (p. ej. la fila de una receta).
    herramienta: null,
    tambien: [],
  }, fn);
}

/** La operación en curso, o null fuera de un turno (scripts, tests, crons). */
export const operacion = () => als.getStore() ?? null;

/** Quién escribe, para guardarlo con cada foto de deshacer. null si no se sabe. */
export function quienEscribe() {
  const o = operacion();
  if (!o?.chat) return null;
  return { chat: o.chat, persona: o.persona };
}

/** Algo más que deshacer junto con la foto de la casa que se guarde a continuación. */
export function deshacerTambien(paso) {
  const o = operacion();
  if (o && paso?.tipo) o.tambien.push(paso);
}

/**
 * Las tablas que NO son lo de la casa: registros, colas, candados, contadores
 * y claves de una vez. Escribir en ellas no es «haber hecho algo» que pueda
 * repetirse ni deshacerse.
 */
export const NO_ES_DE_LA_CASA = new Set([
  "bot_messages", "user_events", "bot_route", "bot_deshacer", "bot_entradas", "bot_idempotencia",
  "bot_cola", "bot_tomar_candado", "bot_soltar_candado", "bot_contar_uso", "content_translations",
  "bot_link_tokens", "bot_codigos", "ficha_casa",
]);

/** db.js avisa de cada escritura que llegó a la base. */
export function contarEnOperacion(tabla) {
  const o = operacion();
  if (o && !NO_ES_DE_LA_CASA.has(tabla)) o.escrituras++;
}

/**
 * Los tipos de operación que se apuntan para deshacer: vocabulario cerrado
 * (deshacer.test.js). Solo CASA se restaura con su foto; el resto se apunta
 * para que «deshaz» sepa qué fue lo último de esa persona y se niegue con la
 * verdad en vez de restaurar una foto más vieja.
 */
export const TIPO_OPERACION = Object.freeze({
  CASA: "casa",
  DESPENSA: "despensa",
  TAREA: "tarea",
  RECORDATORIO: "recordatorio",
  RECETA: "receta",
  BORRADOR: "borrador",
  COLE: "cole",
  OTRO: "otro",
});

/** Qué tipo de operación hace cada herramienta que escribe fuera de la casa. */
export const TIPO_DE_HERRAMIENTA = Object.freeze({
  anadir_despensa: TIPO_OPERACION.DESPENSA,
  anotar_tarea: TIPO_OPERACION.TAREA,
  cerrar_tarea: TIPO_OPERACION.TAREA,
  editar_tarea: TIPO_OPERACION.TAREA,
  crear_recordatorio: TIPO_OPERACION.RECORDATORIO,
  aviso_vispera: TIPO_OPERACION.RECORDATORIO,
  cancelar_recordatorio: TIPO_OPERACION.RECORDATORIO,
  preparar_receta: TIPO_OPERACION.BORRADOR,
  apartar_foto_plato: TIPO_OPERACION.BORRADOR,
  guardar_receta: TIPO_OPERACION.RECETA,
  guardar_menu_cole: TIPO_OPERACION.COLE,
});

/** Lo que fue, en palabras, para negarse con la verdad. */
export const QUE_FUE = Object.freeze({
  [TIPO_OPERACION.DESPENSA]: "apuntar en la despensa",
  [TIPO_OPERACION.TAREA]: "una tarea",
  [TIPO_OPERACION.RECORDATORIO]: "un recordatorio",
  [TIPO_OPERACION.RECETA]: "guardar una receta",
  [TIPO_OPERACION.BORRADOR]: "preparar una receta",
  [TIPO_OPERACION.COLE]: "el menú del cole",
  [TIPO_OPERACION.OTRO]: "un cambio que no sé deshacer solo",
});

/** El tipo de una herramienta que escribió sin dejar foto de la casa. */
export const tipoDeHerramienta = (nombre) => TIPO_DE_HERRAMIENTA[nombre] ?? TIPO_OPERACION.OTRO;

/** Una huella corta y estable de unos argumentos (el orden de las claves no cuenta). */
export function huella(valor) {
  const ordenar = (v) => (Array.isArray(v) ? v.map(ordenar)
    : v && typeof v === "object" ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, ordenar(v[k])])) : v);
  return createHash("sha256").update(JSON.stringify(ordenar(valor ?? null))).digest("hex").slice(0, 16);
}

/**
 * La clave de una escritura dentro de su intención: el mensaje del que sale
 * (`mid`, que un [[Reintentar]] conserva), la herramienta y sus argumentos.
 * null sin chat o sin mensaje: entonces no hay con qué compararla.
 */
export function claveDeEscritura(nombre, args) {
  const o = operacion();
  if (!o?.chat || !o?.mid) return null;
  return `escritura:${o.chat}:${o.mid}:${nombre}:${huella(args)}`;
}

/** Lo que contesta una escritura que ya se hizo en el intento anterior del mismo mensaje. */
export const YA_ESCRITA = "Eso ya quedó hecho en el intento anterior de este mismo mensaje: no lo he repetido. Cuéntalo como hecho.";
