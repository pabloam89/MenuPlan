/**
 * Lo que le pasa al chat mismo, no a un mensaje (#958, clase F):
 *
 *   · Un grupo que pasa a supergrupo cambia de id (Telegram manda
 *     `migrate_to_chat_id` en el viejo y `migrate_from_chat_id` en el nuevo).
 *     Antes nadie lo atendía: el grupo nuevo salía «no conectado» y los
 *     recordatorios seguían yendo al id muerto. Ahora el enlace, los
 *     recordatorios, la charla y las tareas del chat pasan al id nuevo.
 *   · Echan a Lola de un grupo, o alguien la bloquea en privado
 *     (`my_chat_member` con estado `kicked` o `left`). Antes cada recordatorio
 *     y cada aviso fallaban para siempre. Ahora se cancelan los recordatorios
 *     pendientes de ese chat y, en un grupo, se quita el enlace (si vuelven a
 *     meterla, se conecta otra vez como un grupo nuevo). En privado el enlace
 *     se quita solo si la persona tiene identidad de Telegram: al volver a
 *     escribir, enlace.js la reengancha sola a su casa. Sin identidad (chats
 *     muy viejos) se deja, para no mandarla al alta.
 *
 * Las dos cosas son idempotentes: un reintento o los dos avisos de la
 * migración no rompen nada.
 */

import { select, update, borrar, eq } from "./db.js";
import { CANAL } from "../../src/lib/vocabularios.js";

// Las tablas con lo de un chat que tiene que seguir al chat cuando cambia de
// id. bot_cola y bot_candados no: son de segundos, y el id viejo ya no
// escribe. bot_codigos tampoco: un código de acceso es de un privado.
export const TABLAS_DEL_CHAT = ["bot_chats", "bot_reminders", "bot_messages", "bot_tareas"];

// Los estados de `my_chat_member` en que Lola ya no está en el chat (API de Telegram).
export const FUERA_DEL_CHAT = new Set(["kicked", "left"]);

const delChat = (chatId) => `channel=eq.${CANAL.TELEGRAM}&chat_id=${eq(String(chatId))}`;

/**
 * El grupo `viejo` es ahora el supergrupo `nuevo`: todo lo del chat pasa al id nuevo.
 * @returns {Promise<{ movidas: Record<string, number> }>}
 */
export async function migrarChat(viejo, nuevo) {
  const movidas = {};
  if (!viejo || !nuevo || String(viejo) === String(nuevo)) return { movidas };
  // El enlace primero: si el nuevo ya estuviera enlazado (alguien lo conectó a
  // mano antes de llegar el aviso), no se pisa: el viejo queda como estaba.
  const [yaNuevo] = await select("bot_chats", delChat(nuevo), "chat_id");
  for (const tabla of TABLAS_DEL_CHAT) {
    if (tabla === "bot_chats" && yaNuevo) { movidas[tabla] = 0; continue; }
    const filas = await update(tabla, delChat(viejo), { chat_id: String(nuevo) });
    movidas[tabla] = filas?.length ?? 0;
  }
  return { movidas };
}

/**
 * Lola ya no está en el chat (la echaron o la bloquearon).
 * @param {{ chat: { id: number|string, type: string }, new_chat_member?: { status: string } }} cambio  el `my_chat_member` de Telegram
 * @returns {Promise<null | { cancelados: number, desenlazado: boolean }>}  null si no es una salida
 */
export async function alSalirDelChat(cambio) {
  const estado = cambio?.new_chat_member?.status;
  if (!FUERA_DEL_CHAT.has(estado)) return null;
  const chatId = String(cambio.chat.id);
  const esGrupo = cambio.chat.type === "group" || cambio.chat.type === "supergroup";
  const cancelados = await update("bot_reminders", `${delChat(chatId)}&status=eq.pending`, { status: "cancelled" });
  let desenlazado = esGrupo;
  if (!esGrupo) {
    const [ident] = await select("bot_identities", `channel=eq.${CANAL.TELEGRAM}&external_id=${eq(chatId)}`, "user_id");
    desenlazado = Boolean(ident?.user_id);
  }
  if (desenlazado) await borrar("bot_chats", delChat(chatId));
  return { cancelados: cancelados?.length ?? 0, desenlazado };
}
