/**
 * La tubería de operaciones (plan fichas con estado, trozo 26; arquitectura
 * objetivo, [3], D1 y D3): la única vía por la que se escribe una ficha,
 * igual para Lola y para la app, en el servidor. Lola y las pantallas
 * proponen; esto entiende, comprueba, aplica, apunta, cuenta y deshace:
 *
 *   entender   el pedido, a la operación cerrada que espera aplicar_operacion
 *              (operacionDeDato: registro y vocabularios); si no cuadra, no sale.
 *   comprobar  la puerta (puerta.js): papel y quién habla, salud.
 *   aplicar    la RPC aplicar_operacion (0106), en una transacción, con la
 *              clave de idempotencia y la regla de choque de cada dato.
 *   apuntar    aplicar_operacion deja la fila en `operacion`; lo que para la
 *              puerta también se apunta, como rechazada y con su motivo.
 *   contar     lo que se devuelve sale de hecho y sin_hacer de la base
 *              (resultadoDeOperacion: sin `pedido` ni `inversa`, que llevan salud).
 *   deshacer   una operación hecha, con la RPC deshacer_operacion (0111, trozo 41):
 *              en una transacción de la base aplica su inversa, la marca deshecha
 *              y borra el sobre que nació en ella. Solo la propia, y si un dato
 *              cambió después no se pisa (sin_hacer con su motivo). Nunca desde
 *              aquí con escrituras sueltas.
 *
 * Hoy solo operaciones de tipo dato; ningún escritor pasa todavía por aquí.
 * Sin la RPC (0106 sin aplicar, o la 0111 para deshacer): no se guarda, vuelve
 * `rpc_ausente` y queda `dato_sin_guardar` en el log; nunca se escribe en household_state.
 * Sin base propia: `rpc` y cómo leer sus errores los da api/_bot/datos.js.
 */
import { operacionDeDato, cabeceraDeOperacion, hay, resultadoDeOperacion, apuntarSinGuardar, DatoInvalido } from "../escribirDato.js";
import { comprobar, falloDePuerta } from "./puerta.js";
import { ESTADO_OPERACION, FALLO_DATO, CANAL_DATO } from "../vocabularios.js";

/** La RPC que escribe toda operación (0106). */
export const RPC_OPERACION = "aplicar_operacion";
/** La RPC que escribe persona, su salud y los grupos (0108, trozo 10). */
export const RPC_PERSONA = "escribir_persona";
/**
 * Lo que se añade a la clave de una operación de persona: escribir_persona y aplicar_operacion comparten las
 * claves de la casa, y de un mismo mensaje pueden salir un dato y un cambio de la familia.
 */
export const SUFIJO_CLAVE_PERSONA = ":persona";
/** La RPC que deshace una operación con su inversa (0111). */
export const RPC_DESHACER = "deshacer_operacion";

/** Una RPC de la tubería. Un fallo de la base no tumba a quien llama: queda en el log y vuelve como { fallo }. */
async function llamarRpc(funcion, args, { rpc, falloDeError, canal, campo }) {
  try {
    return { r: await rpc(funcion, args) };
  } catch (e) {
    // a propósito: un fallo de la base no tumba a quien llama; queda en el log y vuelve como fallo.
    const { fallo, motivo } = falloDeError(e);
    apuntarSinGuardar({ fallo, motivo, canal, campo });
    return { fallo };
  }
}

/**
 * Una operación de tipo dato, por la tubería entera. Nunca lanza por un fallo
 * de la base: devuelve { guardado: false, fallo } y lo apunta en el log.
 * @param {Parameters<typeof operacionDeDato>[0]} pedido  casa, clave, accion, canal, ref, autor, pedida_at y dato
 * @param {{ papel: string|null, rpc: (funcion: string, args: object) => Promise<any>,
 *   falloDeError: (e: unknown) => { fallo: string, motivo: string|null } }} servidor
 * @returns {Promise<{ guardado: boolean, fallo?: string, error?: string, motivo?: string } & Record<string, unknown>>}
 */
export async function operar(pedido, { papel, rpc, falloDeError }) {
  const campo = pedido?.dato?.campo ?? null;
  // Entender.
  let op;
  try {
    op = operacionDeDato(pedido);
  } catch (e) {
    if (!(e instanceof DatoInvalido)) throw e;
    apuntarSinGuardar({ fallo: e.fallo, canal: pedido?.canal ?? null, campo });
    return { guardado: false, fallo: e.fallo, error: e.message };
  }

  const llamar = (operacion) => llamarRpc(RPC_OPERACION, { p_operacion: operacion }, { rpc, falloDeError, canal: op.canal, campo });

  // Comprobar.
  const contra = comprobar(op, { papel });
  if (contra) {
    const fallo = falloDePuerta(contra.motivo);
    apuntarSinGuardar({ fallo, motivo: contra.motivo, canal: op.canal, campo });
    // Apuntar: la base solo acepta autores de la casa (o el sistema, sin autor); de quien no lo es no queda fila.
    // Sin el valor: lo rechazado no se guarda, y así un lector no puede llenar `operacion` con lo que mande.
    const apuntable = op.autor_user_id == null || papel != null;
    const pedido = { datos: op.datos.map(({ valor: _fuera, ...d }) => d) };
    const apunte = apuntable ? await llamar({ ...op, estado: ESTADO_OPERACION.RECHAZADA, pedido, sin_hacer: [contra] }) : {};
    return { guardado: false, fallo, error: contra.motivo, operacion_id: apunte.r?.operacion_id ?? null };
  }

  // Aplicar y apuntar, en la misma transacción de la base; contar, desde lo que devuelve.
  const { r, fallo } = await llamar(op);
  return fallo ? { guardado: false, fallo } : resultadoDeOperacion(r);
}

/**
 * Pura. Entender un cambio de la familia: la operación que espera escribir_persona (0108: p_operacion). Las
 * personas y los grupos salen de cambiosDePersonas (src/lib/personas.js), ya limpios; aquí, la forma de la
 * operación (la cabecera, la misma que la de un dato: cabeceraDeOperacion). Persona y salud las dice una
 * persona por la app o un chat: el canal `sistema` no vale. Lanza DatoInvalido.
 */
export function operacionDePersonas({ personas, grupos, ...pedido }) {
  const cabecera = cabeceraDeOperacion(pedido);
  if (cabecera.canal === CANAL_DATO.SISTEMA) throw new DatoInvalido("la familia no la escribe el sistema");
  if (!Array.isArray(personas ?? [])) throw new DatoInvalido("personas es una lista");
  if (grupos !== undefined && !Array.isArray(grupos)) throw new DatoInvalido("grupos es una lista");
  if (!(personas ?? []).length && grupos === undefined) throw new DatoInvalido("nada que escribir");
  if ((personas ?? []).some((p) => !hay(p?.id))) throw new DatoInvalido("una persona sin id");
  return {
    ...cabecera,
    clave: `${cabecera.clave}${SUFIJO_CLAVE_PERSONA}`,
    personas: personas ?? [],
    ...(grupos !== undefined ? { grupos } : {}),
  };
}

/**
 * Un cambio de la familia (personas, su salud y los grupos) por la tubería entera: entender, la puerta (la
 * parte de quién habla: una persona de la casa que la edita) y escribir_persona (0108) en una transacción. Las
 * comprobaciones por campo de la puerta (el origen y la salud dicha por la familia) no se le pasan: lo de la
 * familia no lleva origen, porque solo lo dice una persona (el canal `sistema` no vale aquí y sin autor la puerta
 * para), que es lo que esas comprobaciones exigen a un dato. Nunca lanza por un fallo
 * de la base: devuelve { guardado: false, fallo } y lo apunta en el log (sin la RPC, `rpc_ausente`). Lo que para
 * la puerta no se apunta en `operacion` (escribir_persona no tiene estado rechazada): queda en el log.
 * @param {Parameters<typeof operacionDePersonas>[0]} pedido
 * @param {Parameters<typeof operar>[1]} servidor
 */
export async function operarPersonas(pedido, { papel, rpc, falloDeError }) {
  const campo = "persona";
  let op;
  try {
    op = operacionDePersonas(pedido);
  } catch (e) {
    if (!(e instanceof DatoInvalido)) throw e;
    apuntarSinGuardar({ fallo: e.fallo, canal: pedido?.canal ?? null, campo });
    return { guardado: false, fallo: e.fallo, error: e.message };
  }
  const contra = comprobar({ canal: op.canal, autor_user_id: op.autor_user_id, datos: [] }, { papel });
  if (contra) {
    const fallo = falloDePuerta(contra.motivo);
    apuntarSinGuardar({ fallo, motivo: contra.motivo, canal: op.canal, campo });
    return { guardado: false, fallo, error: contra.motivo };
  }
  const { r, fallo } = await llamarRpc(RPC_PERSONA, { p_operacion: op }, { rpc, falloDeError, canal: op.canal, campo });
  return fallo ? { guardado: false, fallo } : resultadoDeOperacion(r);
}

/** Lo que se contesta de deshacer_operacion (0111): todo lo que devuelve, que no lleva `inversa` ni valores. */
export const CAMPOS_DESHACER = ["operacion_id", "estado", "repetida", "deshecho", "sin_hacer", "rev"];

/**
 * Deshacer una operación hecha, por la tubería: comprobar (la misma puerta que al escribir: quien pide habla
 * por sí y edita la casa) y deshacer en la base (deshacer_operacion, 0111), que mira que sea suya y que nada
 * de lo que tocó haya cambiado después. Nunca lanza por un fallo de la base: devuelve { guardado: false, fallo }
 * y lo apunta en el log (sin la RPC, `rpc_ausente`).
 * @param {{ casa: string, operacion_id: string, canal: string, autor?: { user_id?: string|null } }} pedido
 * @param {Parameters<typeof operar>[1]} servidor
 * @returns {Promise<{ guardado: boolean, fallo?: string, error?: string } & Record<string, unknown>>}
 *   guardado: true si quedó deshecha (también si ya lo estaba: `repetida`); si no, `sin_hacer` dice por qué
 *   (MOTIVOS_SIN_DESHACER).
 */
export async function deshacer({ casa, operacion_id, canal, autor = {} }, { papel, rpc, falloDeError }) {
  const autor_user_id = autor.user_id ?? null;
  // Entender: solo se deshace lo propio, así que sin quién lo pide no hay nada que deshacer.
  const falta = !casa ? "casa" : !operacion_id ? "operacion_id" : !autor_user_id ? "autor" : null;
  if (falta) {
    apuntarSinGuardar({ fallo: FALLO_DATO.INVALIDO, canal: canal ?? null, campo: falta });
    return { guardado: false, fallo: FALLO_DATO.INVALIDO, error: `falta ${falta}` };
  }
  // Comprobar: la puerta de escribir, sin datos (papel y quién habla).
  const contra = comprobar({ canal, autor_user_id, datos: [] }, { papel });
  if (contra) {
    const fallo = falloDePuerta(contra.motivo);
    apuntarSinGuardar({ fallo, motivo: contra.motivo, canal });
    return { guardado: false, fallo, error: contra.motivo };
  }
  // Deshacer, en una transacción de la base; contar, desde lo que devuelve.
  const { r, fallo } = await llamarRpc(RPC_DESHACER, { p_casa: casa, p_operacion_id: operacion_id, p_autor_user_id: autor_user_id },
    { rpc, falloDeError, canal, campo: null });
  if (fallo) return { guardado: false, fallo };
  const out = Object.fromEntries(CAMPOS_DESHACER.map((k) => [k, r?.[k] ?? null]));
  return { guardado: out.estado === ESTADO_OPERACION.DESHECHA, ...out };
}
