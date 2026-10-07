/**
 * Enlazar un chat con una casa, y los códigos de un solo uso del bot.
 *
 * Tres caminos acaban aquí: «Conectar Telegram» en Ajustes (bot_link_tokens),
 * «ya tengo cuenta» por email y «soy nuevo» (bot_codigos, 0058). Las reglas
 * viven en un solo sitio para que ninguno se las salte.
 */

import crypto from "node:crypto";
import { select, insert, update, eq } from "./db.js";
import { enviar, escaparHtml, TECLADO } from "./telegram.js";
import { registrar, EMBUDO } from "./embudo.js";

/**
 * @returns {Promise<{ ok: true } | { ok: false, ocupado: true }>}
 */
export async function enlazarChat({ channel = "telegram", chatId, kind, householdId, userId, externalId, nombre, lang }) {
  // Un chat ya enlazado a OTRA casa solo lo puede mover quien lo enlazó: si
  // no, cualquiera del grupo familiar se lo llevaría a su casa con su código.
  // `actual.linked_by` también manda aquí, pero SOLO en chats privados: si es
  // null, no es que "lo enlazó otro" — es que su cuenta se borró (ON DELETE
  // SET NULL) y esta fila quedó huérfana, sin dueño que proteger (un chat
  // privado es de una sola persona). Sin esta comprobación, cualquier intento
  // de volver a usar ese chat se topaba con "ocupado" para siempre (una
  // cuenta nueva nunca puede coincidir con la fila vieja), deshaciendo justo
  // el "se cura solo" que era la idea original de esto.
  //
  // En un GRUPO no aplica: `linked_by` es solo quien ejecutó /grupo una vez,
  // no el dueño de lo que hay dentro — el grupo sigue siendo de toda su
  // familia aunque esa cuenta se borre. Tratar su fila como "sin dueño"
  // dejaría que cualquiera que lance un enlace para ese mismo chat_id se
  // lleve el grupo entero a otra casa sin que nadie más lo apruebe.
  const [actual] = await select("bot_chats", `channel=${eq(channel)}&chat_id=${eq(chatId)}`, "household_id,linked_by");
  const huerfanoAutocurable = kind === "private" && !actual?.linked_by;
  if (actual && actual.household_id !== householdId && !huerfanoAutocurable && actual.linked_by !== userId) {
    return { ok: false, ocupado: true };
  }

  if (externalId) {
    await insert("bot_identities", [{
      channel,
      external_id: String(externalId),
      user_id: userId,
      display_name: nombre ?? null,
    }], { upsert: true });
  }
  await insert("bot_chats", [{
    channel,
    chat_id: String(chatId),
    household_id: householdId,
    kind,
    linked_by: userId,
    lang: lang ?? null,
  }], { upsert: true });
  await registrar(EMBUDO.ENLACE, { userId, telegramId: externalId, unaVez: true, extra: { tipo: kind } });
  return { ok: true };
}

/** 16 bytes en base64url: cabe en el `/start` de Telegram (máx. 64) y en una URL. */
export const codigoNuevo = () => crypto.randomBytes(16).toString("base64url");

export async function crearCodigo({ tipo, channel = "telegram", chatId, externalId, nombre, userId = null, email = null, minutos }) {
  const codigo = codigoNuevo();
  await insert("bot_codigos", [{
    codigo,
    tipo,
    channel,
    chat_id: String(chatId),
    external_id: externalId ? String(externalId) : null,
    nombre: nombre ?? null,
    user_id: userId,
    email,
    expires_at: new Date(Date.now() + minutos * 60000).toISOString(),
  }]);
  return codigo;
}

/**
 * Gasta un código: solo lo devuelve una vez, y solo si no ha caducado. El
 * `used_at=is.null` en el mismo UPDATE hace que dos peticiones a la vez no lo
 * gasten las dos.
 */
export async function gastarCodigo(codigo, tipo) {
  if (typeof codigo !== "string" || !/^[\w-]{16,64}$/.test(codigo)) return null;
  const filas = await update(
    "bot_codigos",
    `codigo=${eq(codigo)}&tipo=${eq(tipo)}&used_at=is.null&expires_at=gt.${encodeURIComponent(new Date().toISOString())}`,
    { used_at: new Date().toISOString() },
  );
  return filas?.[0] ?? null;
}

/** El dueño de la casa activa de un usuario (el bot escribe como dueño). */
export async function casaPropia(userId) {
  const [perfil] = await select("user_profiles", `user_id=${eq(userId)}`, "active_household_id");
  const householdId = perfil?.active_household_id;
  if (!householdId) return null;
  const [hogar] = await select("households", `id=${eq(householdId)}`, "id,name,owner_user_id");
  if (!hogar || hogar.owner_user_id !== userId) return null;
  return hogar;
}

/** El «¡Listo!» del bot en el chat recién enlazado. */
export async function confirmarEnlace(chatId, householdId, esGrupo = false) {
  const [hogar] = await select("households", `id=${eq(householdId)}`, "name");
  const casa = hogar?.name ? ` con <b>${escaparHtml(hogar.name)}</b>` : "";
  return enviar(
    chatId,
    esGrupo
      ? `¡Listo! Este grupo está conectado${casa}. Para hablarme aquí, empezad el mensaje con <b>Lola</b> (por ejemplo, «Lola, ¿qué cenamos?») o responded a uno de mis mensajes.`
      : `¡Listo! Estamos conectados${casa}. Escríbeme o mándame un audio cuando quieras.`,
    esGrupo ? {} : { teclado: TECLADO },
  );
}

/** La URL pública de la app para este despliegue (staging o producción). */
export function baseDe(req) {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  return `https://${host}`;
}
