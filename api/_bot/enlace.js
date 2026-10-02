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

// Ids de Telegram que no son una persona: el admin anónimo de un grupo
// (GroupAnonymousBot), lo que se publica como canal (Channel_Bot) y los avisos
// del propio Telegram. Todos los admins anónimos escriben con el primero: si se
// enlazara a alguien, todos heredarían su cuenta.
const NO_PERSONAS = new Set(["1087968824", "136817688", "777000"]);

/** El id de quien escribe, o null si no es una persona (un bot, un anónimo). */
export function idDePersona(from) {
  if (!from?.id || from.is_bot) return null;
  const id = String(from.id);
  return NO_PERSONAS.has(id) ? null : id;
}

/**
 * Enlazar un chat con una casa (bot_chats) es una cosa; decir que un Telegram
 * ES una cuenta (bot_identities) es otra, y solo se apunta con prueba (C-3 de
 * specs/roles-de-la-casa-revision.md):
 *   · `nacida`: la cuenta se creó en este Telegram (email sintético de su id).
 *     Es la prueba más fuerte, y la única que corrige una identidad anterior.
 *   · `email`: escribió aquí el código que llegó al correo de la cuenta.
 *   · `ajustes`: el enlace de «Conectar Telegram» que el dueño sacó en su app,
 *     pulsado en un chat privado.
 * Sin prueba (`identidad` null), o en un grupo, solo se enlaza el chat: el
 * que pulsa «Añadir al grupo» no tiene por qué ser quien firmó el enlace.
 * Y una identidad que ya es de otra cuenta no se cambia por pulsar un enlace.
 *
 * @param {{ identidad?: "nacida" | "email" | "ajustes" | null }} args
 * @returns {Promise<{ ok: true, identidad: "nueva" | "igual" | "de-otra" | "sin" } | { ok: false, ocupado: true }>}
 */
export async function enlazarChat({ channel = "telegram", chatId, kind, householdId, userId, externalId, nombre, lang, identidad = null }) {
  // Un chat ya enlazado a OTRA casa solo lo puede mover quien lo enlazó: si
  // no, cualquiera del grupo familiar se lo llevaría a su casa con su código.
  const [actual] = await select("bot_chats", `channel=${eq(channel)}&chat_id=${eq(chatId)}`, "household_id,linked_by");
  if (actual && actual.household_id !== householdId && actual.linked_by !== userId) {
    return { ok: false, ocupado: true };
  }

  const estado = await apuntarIdentidad({ channel, kind, userId, externalId, nombre, identidad });
  await insert("bot_chats", [{
    channel,
    chat_id: String(chatId),
    household_id: householdId,
    kind,
    linked_by: userId,
    lang: lang ?? null,
  }], { upsert: true });
  await registrar(EMBUDO.ENLACE, { userId, telegramId: externalId, unaVez: true, extra: { tipo: kind } });
  return { ok: true, identidad: estado };
}

async function apuntarIdentidad({ channel, kind, userId, externalId, nombre, identidad }) {
  if (!identidad || kind !== "private" || !externalId || NO_PERSONAS.has(String(externalId))) return "sin";
  const [ya] = await select("bot_identities", `channel=${eq(channel)}&external_id=${eq(String(externalId))}`, "user_id");
  if (ya && ya.user_id !== userId && identidad !== "nacida") {
    console.warn("[enlace] identidad de otra cuenta, no se cambia", { channel, identidad });
    return "de-otra";
  }
  await insert("bot_identities", [{
    channel,
    external_id: String(externalId),
    user_id: userId,
    display_name: nombre ?? null,
  }], { upsert: true });
  return ya?.user_id === userId ? "igual" : "nueva";
}

/** 16 bytes en base64url: cabe en el `/start` de Telegram (máx. 64) y en una URL. */
export const codigoNuevo = () => crypto.randomBytes(16).toString("base64url");

// Los de /grupo llevan una «g» delante: 23 caracteres, y los demás (16 bytes en
// base64url, también los de la app) siempre 22. Así se distinguen sin tocar la
// tabla, y uno de grupo no sirve para enlazar un privado.
export const codigoDeGrupo = () => `g${codigoNuevo()}`;
export const esCodigoDeGrupo = (token) => typeof token === "string" && token.length === 23 && token.startsWith("g");

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
