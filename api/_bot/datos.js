/**
 * escribirDato en el servidor (plan fichas con estado, trozo 8; #1037): una
 * operación de tipo dato por la tubería (src/lib/operaciones/tuberia.js, trozo
 * 26), con la base del servidor (db.js, service role) y cómo se leen sus
 * errores (avisar.js). Lo usan Lola (con su canal, el mensaje como ref y el
 * papel de papelDeQuien) y la app, a través de api/operacion.js (canal app, la
 * pantalla como ref, el autor y el papel salen de la sesión).
 *
 * aplicar_operacion es solo de la service role: el navegador nunca la llama, y
 * lo que devuelve sale recortado (sin `pedido` ni `inversa`, que llevan salud).
 * Si la RPC no existe: no se guarda, vuelve `rpc_ausente` y queda la línea
 * `dato_sin_guardar` en el log; nunca se escribe en el documento household_state.
 */
import { rpc } from "./db.js";
import { motivoDe } from "./avisar.js";
import { operar } from "../../src/lib/operaciones/tuberia.js";
import { FALLO_DATO, MOTIVO_FALLO } from "../../src/lib/vocabularios.js";

/**
 * El fallo de dato (FALLOS_DATO) de cada motivo de avisar.js (MOTIVOS_FALLO).
 * `no_existe` en una llamada a la RPC es que la RPC no está (PGRST202, 42883, 404).
 * Lo que no está aquí es `servidor`.
 */
const FALLO_DE_MOTIVO = Object.freeze({
  [MOTIVO_FALLO.NO_EXISTE]: FALLO_DATO.RPC_AUSENTE,
  [MOTIVO_FALLO.DATOS_INVALIDOS]: FALLO_DATO.INVALIDO,
  // 23503 (una persona o una casa que ya no está) o 23505 no se arreglan repitiendo: salen de la cola de la app.
  [MOTIVO_FALLO.CONFLICTO]: FALLO_DATO.INVALIDO,
  [MOTIVO_FALLO.PERMISO]: FALLO_DATO.SIN_PERMISO,
  [MOTIVO_FALLO.RED]: FALLO_DATO.SIN_RED,
  [MOTIVO_FALLO.TIEMPO]: FALLO_DATO.SIN_RED,
});

/** Pura. El fallo de dato de un motivo de avisar.js. */
export const falloDeMotivo = (motivo) => FALLO_DE_MOTIVO[motivo] ?? FALLO_DATO.SERVIDOR;

/** Pura. Un error de la base, en fallo de dato y su motivo (lo que la tubería apunta en el log). */
const falloDeError = (e) => {
  const motivo = motivoDe(e);
  return { fallo: falloDeMotivo(motivo), motivo };
};

/**
 * Escribe un dato como operación de tipo dato, por la tubería y su puerta.
 * Nunca lanza por un fallo de la base: devuelve { guardado: false, fallo } y lo
 * apunta en el log; si la base contestó, { guardado, operacion_id, estado,
 * repetida, hecho, sin_hacer, choques, rev }.
 * @param {Parameters<typeof operar>[0]} pedido
 * @param {{ papel: string|null }} quien  el papel en la casa del autor, o null si no es de ella
 */
export function escribirDato(pedido, { papel }) {
  return operar(pedido, { papel, rpc, falloDeError });
}
