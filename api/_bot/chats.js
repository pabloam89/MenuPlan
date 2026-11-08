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
 *
 *   · En qué casa trabaja Lola en cada mensaje (casaDelTurno, #1238). Un chat
 *     privado es de una persona, no de una casa: quien está en varias trabaja
 *     en la que tiene abierta en la app (user_profiles.active_household_id), y
 *     Lola lo dice cuando cambia. Un grupo es de su casa, siempre.
 *     bot_chats.household_id sigue siendo la casa con la que se enlazó el chat:
 *     por ella salen sus avisos, y es la de respaldo si la persona ya no es
 *     miembro de su casa activa.
 */

import { select, update, borrar, eq } from "./db.js";
import { CANAL } from "../../src/lib/vocabularios.js";
import { descartarDelChat } from "./recordatorios.js";
import { casaActivaDe, papelDeUsuario } from "./papel.js";
import { escaparHtml } from "./telegram.js";

// Las tablas con lo de un chat que tiene que seguir al chat cuando cambia de
// id. bot_cola y bot_candados no: son de segundos, y el id viejo ya no
// escribe. bot_codigos tampoco: un código de acceso es de un privado.
// Los recordatorios van en bot_tareas (0122, trozo 34).
export const TABLAS_DEL_CHAT = ["bot_chats", "bot_messages", "bot_tareas"];

// Los estados de `my_chat_member` en que Lola ya no está en el chat (API de Telegram).
export const FUERA_DEL_CHAT = new Set(["kicked", "left"]);

// Qué es un grupo para Lola, en un solo sitio (#958, C8): el webhook y la
// salida del chat la leen de aquí.
export const esGrupoDe = (chat) => chat?.type === "group" || chat?.type === "supergroup";

/**
 * Lo que se lee de la charla (bot_messages): de este chat Y de esta casa. Un chat privado puede cambiar de casa
 * (invitación, otra casa activa; #1238): lo dicho en la otra casa no es de esta familia y no viaja con el chat.
 * Toda lectura de bot_messages pasa por aquí: charlaPorCasa.test.js lo comprueba en api/_bot y api/bot.
 */
export const deLaCharla = (channel, chatId, householdId) => {
  if (!householdId) throw new Error("deLaCharla: sin casa no se lee la charla");
  return `channel=${eq(channel)}&chat_id=${eq(String(chatId))}&household_id=${eq(householdId)}`;
};

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
  const esGrupo = esGrupoDe(cambio.chat);
  // Sus recordatorios (tareas de tipo recordatorio, 0122) se descartan: nadie los recibiría.
  const cancelados = await descartarDelChat(chatId);
  let desenlazado = esGrupo;
  if (!esGrupo) {
    const [ident] = await select("bot_identities", `channel=eq.${CANAL.TELEGRAM}&external_id=${eq(chatId)}`, "user_id");
    desenlazado = Boolean(ident?.user_id);
  }
  if (desenlazado) await borrar("bot_chats", delChat(chatId));
  return { cancelados: cancelados?.length ?? 0, desenlazado };
}

/**
 * Pura. La casa del turno: en un grupo, la del chat; en privado, la activa de la cuenta si es miembro de ella; si no,
 * la del chat.
 * @param {{ chat: { household_id: string, kind: string }, activa?: string|null, esMiembro?: boolean }} datos
 */
export function elegirCasa({ chat, activa = null, esMiembro = false }) {
  if (chat.kind !== "private" || !activa || activa === chat.household_id) return chat.household_id;
  return esMiembro ? activa : chat.household_id;
}

/**
 * La casa de este turno para un chat ya enlazado, o null si el chat no está enlazado. Si no se puede leer el chat, la
 * cuenta o su casa activa, lanza, como ya pasaba al no poder leer el chat: no se adivina la casa (#1238).
 * @returns {Promise<string|null>}
 */
export async function casaDelTurno(chatId, { channel = CANAL.TELEGRAM } = {}) {
  const [chat] = await select("bot_chats", `channel=${eq(channel)}&chat_id=${eq(String(chatId))}`, "household_id,kind,linked_by");
  if (!chat?.household_id) return null;
  if (chat.kind !== "private") return chat.household_id;
  // En privado, el id del chat es el de la persona: su cuenta, por su identidad; en los chats viejos, quien lo enlazó.
  const [ident] = await select("bot_identities", `channel=${eq(channel)}&external_id=${eq(String(chatId))}`, "user_id");
  const cuenta = ident?.user_id ?? chat.linked_by;
  const activa = await casaActivaDe(cuenta);
  if (!activa || activa === chat.household_id) return chat.household_id;
  return elegirCasa({ chat, activa, esMiembro: Boolean(await papelDeUsuario(activa, cuenta)) });
}

/**
 * Pura. Lo que dice Lola cuando la casa cambió desde el último mensaje de este chat (otra casa activa en la app), o
 * null si no cambió. `anterior`: la casa del último mensaje de la charla (null si no hay charla: no hay cambio).
 */
export function avisoDeCambio({ anterior, actual, nombre }) {
  if (!anterior || !actual || anterior === actual) return null;
  const casa = nombre ? `<b>${escaparHtml(nombre)}</b>` : "otra casa";
  return `🏠 Ahora estoy con ${casa}, la casa que tienes abierta en la app. Lo que me pidas va ahí; para volver a la otra, cámbiala en la app.`;
}

/** La casa del último mensaje de la charla de este chat, de cualquier casa (para notar el cambio), o null. */
export async function casaDelUltimoMensaje(chatId, { channel = CANAL.TELEGRAM } = {}) {
  const [fila] = await select("bot_messages", `channel=${eq(channel)}&chat_id=${eq(String(chatId))}&order=created_at.desc,id.desc&limit=1`, "household_id");
  return fila?.household_id ?? null;
}
