/**
 * Cada mensaje que llega de fuera se atiende una sola vez (0088).
 *
 * Telegram reintenta una actualización si no le llega un 200 a tiempo, con el
 * mismo `update_id`. Sin esto, Lola atendía las dos: dos veces lo mismo en la
 * compra o en las tareas. Al llegar se apunta el id; si ya estaba, es un
 * reintento y no se hace nada.
 *
 * El código no depende de que la 0088 esté aplicada: si la tabla no existe o
 * la base falla, se atiende el mensaje como antes. Mejor un repetido raro que
 * un mensaje perdido.
 */

import { insert } from "./db.js";

const esDuplicado = (e) => /\b409\b|23505|duplicate key/i.test(String(e?.message ?? e));

/**
 * ¿Es la primera vez que llega esta entrada? `true` = atiéndela; `false` = ya
 * llegó antes, ignórala. Sin id (nada que comparar) o si la base falla, `true`.
 * @param {"telegram"|"whatsapp"} proveedor
 * @param {string|number|null|undefined} xid
 */
export async function primeraVez(proveedor, xid) {
  if (xid == null || String(xid).trim() === "") return true;
  try {
    await insert("bot_entradas", [{ proveedor, entrada_xid: String(xid).trim() }]);
    return true;
  } catch (e) {
    if (esDuplicado(e)) return false;
    console.warn("[bot/entradas] sin comprobar repetidos:", String(e?.message ?? e).slice(0, 160));
    return true;
  }
}
