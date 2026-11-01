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
import { operar, operarPersonas, deshacer } from "../../src/lib/operaciones/tuberia.js";
import { membersDeFilas, FamiliaSinLeer, RPC_FAMILIA } from "../../src/lib/personas.js";
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
const falloDeError = (e) => ({ fallo: falloDeMotivo(motivoDe(e)), motivo: motivoDe(e) });

/**
 * Un dato como operación de tipo dato, por la tubería y su puerta (lo que devuelve, en `operar`).
 * @param {Parameters<typeof operar>[0]} pedido
 * @param {{ papel: string|null }} quien  el papel en la casa del autor, o null si no es de ella
 */
export const escribirDato = (pedido, { papel }) => operar(pedido, { papel, rpc, falloDeError });

/**
 * Un cambio de la familia (personas, su salud y grupos; escribir_persona, 0108) por la tubería y su puerta
 * (lo que devuelve, en `operarPersonas`). Lo usan api/operacion.js (la app) y, con el corte del trozo 10, Lola.
 * @param {Parameters<typeof operarPersonas>[0]} pedido
 * @param {{ papel: string|null }} quien  el papel en la casa del autor, o null si no es de ella
 */
export const escribirPersonas = (pedido, { papel }) => operarPersonas(pedido, { papel, rpc, falloDeError });

/**
 * La familia de una casa, de sus filas (personas_de_casa, 0108), en la forma de data.members y data.groups.
 * null si la base aún no tiene la RPC (`rpc_ausente`, 0108 sin aplicar): la familia sigue en el documento y la
 * copia el trigger 0089, como antes del corte (plan B: la rama se despliega antes que la migración, y la misma
 * 0108 crea la RPC y quita el trigger). Sin poder leerla por otra cosa lanza FamiliaSinLeer con su fallo y lo
 * deja en el log: una familia sin leer no es una familia vacía.
 * @returns {Promise<{ members: object[], groups: object[] } | null>}
 */
export async function leerFamilia(householdId) {
  let filas;
  try {
    filas = await rpc(RPC_FAMILIA, { p_casa: householdId });
  } catch (e) {
    const { fallo, motivo } = falloDeError(e);
    if (fallo === FALLO_DATO.RPC_AUSENTE) return null;
    console.error(JSON.stringify({ evento: "familia_sin_leer", fallo, motivo }));
    throw new FamiliaSinLeer(fallo);
  }
  return membersDeFilas(filas);
}

/**
 * Deshacer una operación propia por la tubería (deshacer_operacion, 0111; lo que devuelve, en `deshacer`).
 * @param {Parameters<typeof deshacer>[0]} pedido
 * @param {{ papel: string|null }} quien  el papel en la casa de quien lo pide, o null si no es de ella
 */
export const deshacerOperacion = (pedido, { papel }) => deshacer(pedido, { papel, rpc, falloDeError });
