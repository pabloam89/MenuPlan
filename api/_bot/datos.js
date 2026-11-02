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
import { FALLO_DATO, MOTIVO_FALLO, CANAL_DATO } from "../../src/lib/vocabularios.js";
import { FICHA_CON_ESTADO, fichaSinContrato, estadosDeFichas, datosConSobre, FICHAS_CASA_CON_SOBRE } from "../../src/lib/estadoDeDato.js";

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

/**
 * Los datos de la casa con sobre para la app: los de las fichas Casa (trozo 12) y Rutina (trozo 13) de
 * ficha_casa v2 (0107), FICHAS_CASA_CON_SOBRE, juntos y cada uno con su sobre o con el defecto del registro. Con la v1 (0107 sin aplicar), `datos` null: la app los lee del
 * documento como antes. Lanza si la base falla o contesta otra forma (una versión que no conoce, sin `fichas`):
 * no es una casa sin datos, y quien llama lo dice. Sin una de esas claves en `fichas` es que registro_campo no
 * tiene ningún campo de esa ficha (la 0112 o la 0113 sin aplicar: ficha_casa agrupa por ficha): sus datos no
 * vienen y siguen en el documento, que es verdad. Solo para quien
 * ya se sabe de la casa: con la service role, ficha_casa no lo comprueba (api/operacion.js mira el papel antes).
 * Lola la usa también (leerCasaConSobre), con su canal.
 * @returns {Promise<{ v: number|null, datos: object[]|null }>}
 */
export async function leerDatosDeCasa(householdId, userId, { canal = CANAL_DATO.APP } = {}) {
  const ficha = await rpc("ficha_casa", { p_casa: householdId, p_usuario: userId, p_canal: canal, p_max_tareas: 0 });
  const mal = fichaSinContrato(ficha);
  if (mal) throw new Error(`ficha_casa: forma que no se conoce (${mal})`);
  return { v: ficha.v, datos: ficha.v === FICHA_CON_ESTADO ? FICHAS_CASA_CON_SOBRE.flatMap((f) => ficha.fichas[f] ?? []) : null };
}

/**
 * Los datos de la casa con sobre (CAMPOS_CASA_CON_SOBRE, estadoDeDato.js) para Lola, al leer la casa (casa.js):
 * `{ [campo]: { valor, conSobre } }` con los que trae ficha_casa v2 (su sobre, o el defecto del registro), o null si
 * viven en el documento: ficha_casa v1, la base sin la RPC, o sin los campos en registro_campo (la 0112 sin
 * aplicar). Lanza si falla otra cosa: una casa sin leer no es una casa con los valores por defecto.
 */
export async function leerCasaConSobre(householdId) {
  let r;
  try {
    r = await leerDatosDeCasa(householdId, null, { canal: CANAL_DATO.TELEGRAM });
  } catch (e) {
    const { fallo, motivo } = falloDeError(e);
    if (fallo === FALLO_DATO.RPC_AUSENTE) return null;
    console.error(JSON.stringify({ evento: "casa_sin_leer", fallo, motivo }));
    throw e;
  }
  const leidos = r.datos ? datosConSobre(estadosDeFichas({ casa: r.datos })) : [];
  return leidos.length ? Object.fromEntries(leidos.map((l) => [l.campo, { valor: l.valor, conSobre: l.conSobre }])) : null;
}
