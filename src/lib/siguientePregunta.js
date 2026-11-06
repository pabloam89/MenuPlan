/**
 * Qué cuenta como no dicho, una sola regla para Lola (ejesDeCasa.js). Qué se pregunta lo decide el camino de cada
 * pedido (caminos.js, src/lib/pedidoMenu.js) y lo de seguridad lo preguntan las tareas «falta saber»
 * (registroTareas.js, CAMPOS_PREGUNTABLES), sea cual sea el camino.
 */
import { ESTADO_DATO } from "./vocabularios.js";

/**
 * ¿Falta este dato? Sin leer, vacío, por defecto o caducado; lo dicho, supuesto o aprendido ya no se pregunta. «Por
 * defecto» cuenta como vacío: el valor lo puso el registro, nadie de la casa (ESTADO_DE_ORIGEN, vocabularios.js).
 */
export function falta(leido) {
  if (!leido) return true;
  if (leido.bloqueado) return false;
  return leido.caducado || leido.estado === ESTADO_DATO.VACIO || leido.estado === ESTADO_DATO.POR_DEFECTO;
}
