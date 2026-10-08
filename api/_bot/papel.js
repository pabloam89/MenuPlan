/**
 * El papel en la casa de quien escribe a Lola (specs/roles-de-la-casa-*.md,
 * apartado 4): titular (owner), cotitular (editor), lector (viewer), o
 * «ajeno» si no se sabe quién es (alguien del grupo sin cuenta enlazada).
 *
 * Se calcula en CADA turno y no se guarda: quitar a alguien o cambiarle el
 * papel se aplica al mensaje siguiente.
 *
 * De dónde sale: Telegram (from.id) → bot_identities → usuario → su fila en
 * household_members de esta casa. bot_identities solo se escribe con prueba
 * (C-3, enlace.js). En privado hay una segunda vía: quien enlazó ese chat
 * (bot_chats.linked_by), porque desde C-3 un privado solo se enlaza con prueba.
 *
 * Varios autores en un mismo turno (mensajes seguidos de varias personas en
 * un grupo): vale el papel MÁS BAJO. Nadie (o null): ajeno. Falla cerrado.
 */

import { select, eq } from "./db.js";

export const RANGO = { owner: 3, editor: 2, viewer: 1, ajeno: 0 };

/** El más bajo de una lista de papeles; vacía, ajeno. */
export function papelMasBajo(papeles) {
  if (!papeles.length) return "ajeno";
  return papeles.reduce((a, b) => (RANGO[b] < RANGO[a] ? b : a));
}

/** Quienes llevan la casa: los user_id con papel owner o editor (titular y cotitular). */
export async function quienesLlevanLaCasa(householdId) {
  if (!householdId) return [];
  const filas = await select("household_members", `household_id=${eq(householdId)}&role=in.(owner,editor)`, "user_id");
  return (filas ?? []).map((m) => m.user_id).filter(Boolean);
}

async function papelDeUsuario(householdId, userId) {
  if (!userId) return null;
  const [m] = await select("household_members", `household_id=${eq(householdId)}&user_id=${eq(userId)}`, "role");
  return m?.role ?? null;
}

/**
 * @param {{ householdId: string, chatId: string|number, esGrupo: boolean, desde: (string|number|null)[], channel?: string }} args
 *   `desde`: los ids de Telegram de quienes escriben en este turno (ya
 *   filtrados con idDePersona: sin bots ni anónimos).
 * @returns {Promise<{ papel: 'owner'|'editor'|'viewer'|'ajeno', userId: string|null }>}
 */
export async function papelDeQuien({ householdId, chatId, esGrupo, desde, channel = "telegram" }) {
  const ids = [...new Set((desde ?? []).filter(Boolean).map(String))];
  const uno = async (externalId) => {
    const [ident] = await select("bot_identities", `channel=${eq(channel)}&external_id=${eq(externalId)}`, "user_id");
    const papel = await papelDeUsuario(householdId, ident?.user_id);
    if (papel) return { papel, userId: ident.user_id };
    return null;
  };
  const vistos = await Promise.all(ids.map(uno));
  if (ids.length && vistos.every(Boolean)) {
    const papel = papelMasBajo(vistos.map((v) => v.papel));
    return { papel, userId: vistos.length === 1 ? vistos[0].userId : null };
  }
  // En privado, quien enlazó este chat (con prueba desde C-3).
  if (!esGrupo && ids.length <= 1) {
    const [chat] = await select("bot_chats", `channel=${eq(channel)}&chat_id=${eq(String(chatId))}`, "linked_by,household_id,kind");
    if (chat?.kind === "private" && chat.household_id === householdId) {
      const papel = await papelDeUsuario(householdId, chat.linked_by);
      if (papel) return { papel, userId: chat.linked_by };
    }
  }
  return { papel: "ajeno", userId: null };
}

/**
 * El idioma que eligió la persona (user_profiles.ui_lang, 0073), o null si no
 * eligió: entonces Lola contesta en el idioma en que le escriban, como siempre.
 * No se mira el idioma del teléfono: un móvil en inglés no es una elección.
 */
export async function idiomaDe(userId) {
  if (!userId) return null;
  const [p] = await select("user_profiles", `user_id=${eq(userId)}`, "ui_lang");
  return p?.ui_lang === "en" || p?.ui_lang === "es" ? p.ui_lang : null;
}
