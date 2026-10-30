/**
 * escribirDato en el servidor (plan fichas con estado, trozo 8; #1037): el
 * único sitio que llama a la RPC aplicar_operacion (0106) con una operación de
 * tipo dato. Lo usan Lola (con su canal y el mensaje como ref) y la app, a
 * través de api/operacion.js (canal app, la pantalla como ref, el autor sale
 * de la sesión). El trozo 26 pone delante la tubería y su puerta.
 *
 * aplicar_operacion es solo de la service role (db.js): el navegador nunca la
 * llama, y lo que devuelve sale recortado (resultadoDeOperacion: sin `pedido`
 * ni `inversa`, que llevan salud).
 *
 * Si la RPC no existe (la rama se despliega antes de que Pablo aplique la
 * 0106): no se guarda, se devuelve el fallo `rpc_ausente` para que quien llama
 * lo diga, y queda la línea `dato_sin_guardar` en el log. Nunca se escribe en el
 * documento household_state: sin convivencia (plan, «Cómo se escribe»).
 */
import { rpc } from "./db.js";
import { motivoDe } from "./avisar.js";
import { operacionDeDato, resultadoDeOperacion, apuntarSinGuardar, DatoInvalido } from "../../src/lib/escribirDato.js";
import { FALLO_DATO, MOTIVO_FALLO } from "../../src/lib/vocabularios.js";

/** La RPC que escribe toda operación (0106). */
export const RPC_OPERACION = "aplicar_operacion";

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

/**
 * Escribe un dato como operación de tipo dato. Nunca lanza por un fallo de la
 * base: devuelve { guardado: false, fallo } y lo apunta en el log; si la base
 * contestó, { guardado, operacion_id, estado, repetida, hecho, sin_hacer, choques, rev }.
 * @param {{ casa: string, clave: string, accion: string, canal: string, ref: { tipo: string, id: string },
 *   autor?: { user_id?: string|null, persona_id?: string|null }, pedida_at?: string|null,
 *   dato: { campo: string, persona_id?: string|null, valor?: unknown, origen: string } }} pedido
 */
export async function escribirDato(pedido) {
  const campo = pedido?.dato?.campo;
  let operacion;
  try {
    operacion = operacionDeDato(pedido);
  } catch (e) {
    if (!(e instanceof DatoInvalido)) throw e;
    apuntarSinGuardar({ fallo: e.fallo, canal: pedido?.canal, campo });
    return { guardado: false, fallo: e.fallo, error: e.message };
  }
  try {
    return resultadoDeOperacion(await rpc(RPC_OPERACION, { p_operacion: operacion }));
  } catch (e) {
    // a propósito: un fallo de la base no tumba a quien llama; queda en el log (apuntarSinGuardar) y vuelve como fallo.
    const motivo = motivoDe(e);
    const fallo = falloDeMotivo(motivo);
    apuntarSinGuardar({ fallo, motivo, canal: operacion.canal, campo });
    return { guardado: false, fallo };
  }
}
