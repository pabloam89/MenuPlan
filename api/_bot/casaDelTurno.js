/**
 * En qué casa trabaja Lola en este mensaje (#1238).
 *
 * Un chat privado es de una persona, no de una casa: quien está en varias (titular en la suya, cotitular o lector en
 * otras) trabaja en la que tiene abierta en la app, `user_profiles.active_household_id`, la misma que enseña la app.
 * Así la app y Lola no pueden estar en casas distintas. Un grupo sí es de una casa: la suya, siempre.
 *
 * `bot_chats.household_id` sigue siendo la casa con la que se enlazó el chat: por ella salen sus avisos y es la de
 * respaldo si la persona ya no es miembro de su casa activa o no se puede leer.
 *
 * Que Lola lo diga cuando cambia no necesita dato nuevo: cada mensaje de la charla (bot_messages) guarda su casa, y
 * si la del último no es la de este turno, la casa cambió desde la última vez (avisoDeCambio).
 */
import { select, eq } from "./db.js";
import { escaparHtml } from "./telegram.js";
import { avisarFallo } from "./avisar.js";
import { CANAL } from "../../src/lib/vocabularios.js";

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
 * La casa de este turno para un chat ya enlazado, o null si el chat no está enlazado.
 * Si no se puede leer la cuenta o su casa activa, se sigue con la casa del chat, como antes de #1238, y se avisa.
 * @returns {Promise<string|null>}
 */
export async function casaDelTurno(chatId, { channel = CANAL.TELEGRAM } = {}) {
  const [chat] = await select("bot_chats", `channel=${eq(channel)}&chat_id=${eq(String(chatId))}`, "household_id,kind,linked_by");
  if (!chat?.household_id) return null;
  if (chat.kind !== "private") return chat.household_id;
  try {
    // En privado, el id del chat es el de la persona: su cuenta, por su identidad; en los chats viejos, quien lo enlazó.
    const [ident] = await select("bot_identities", `channel=${eq(channel)}&external_id=${eq(String(chatId))}`, "user_id");
    const cuenta = ident?.user_id ?? chat.linked_by;
    if (!cuenta) return chat.household_id;
    const [perfil] = await select("user_profiles", `user_id=${eq(cuenta)}`, "active_household_id");
    const activa = perfil?.active_household_id ?? null;
    if (!activa || activa === chat.household_id) return chat.household_id;
    const miembro = await select("household_members", `household_id=${eq(activa)}&user_id=${eq(cuenta)}`, "role");
    return elegirCasa({ chat, activa, esMiembro: miembro.length > 0 });
  } catch (e) {
    avisarFallo("casa_del_turno", e, { grave: false });
    return chat.household_id;
  }
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
