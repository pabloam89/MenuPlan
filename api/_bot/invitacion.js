/**
 * Entrar en una casa con una invitación, desde Telegram (/start inv_<token>):
 * el camino de la asistenta, que no tiene por qué usar la app
 * (specs/roles-de-la-casa-propuesta.md, apartado 3).
 *
 * Quién se une: si este Telegram ya ES una cuenta (bot_identities, que desde
 * C-3 solo se apunta con prueba), esa; si no, una cuenta nueva nacida aquí
 * (como «Soy nuevo»), con su casa propia vacía. Después: se une con el papel
 * de la invitación (bot_unirse_por_invitacion, 0073), y su chat privado queda
 * enlazado a la casa que le invita. Si la invitación trae idioma y la persona
 * no había elegido uno, la base se lo pone.
 */

import { select, rpc, eq } from "./db.js";
import { crearCuentaTelegram } from "./cuentas.js";
import { enlazarChat, idDePersona } from "./enlace.js";

export const ES_INVITACION = /^inv_([0-9a-f]{32})$/;

const TEXTOS = {
  es: {
    caducada: "Esa invitación ya no vale (caduca a los 7 días y sirve una sola vez). Pide otra a quien te invitó.",
    ocupado: "Este chat ya está conectado a otra casa. Solo quien lo conectó puede cambiarlo.",
    lleno: "Ya estás en el máximo de casas ajenas (3). Sal de alguna antes de entrar en esta.",
    hola: (casa, papel) => papel === "editor"
      ? `¡Hola! Soy <b>Lola</b> 👩‍🍳 Ya eres cotitular de <b>${casa}</b>: puedes pedirme el menú, cambiar platos, la compra… como quien te invitó.`
      : `¡Hola! Soy <b>Lola</b> 👩‍🍳 Ya estás en <b>${casa}</b>. Pregúntame qué toca cocinar hoy, cómo se hace un plato o qué hay en la lista de la compra; y dime lo que vayas comprando, que te lo tacho.`,
  },
  en: {
    caducada: "That invitation is no longer valid (it expires after 7 days and works only once). Ask whoever invited you for a new one.",
    ocupado: "This chat is already linked to another home. Only the person who linked it can change that.",
    lleno: "You're already in the maximum number of other homes (3). Leave one before joining this one.",
    hola: (casa, papel) => papel === "editor"
      ? `Hi! I'm <b>Lola</b> 👩‍🍳 You're now a co-owner of <b>${casa}</b>: ask me for the menu, change dishes, the shopping list… just like whoever invited you.`
      : `Hi! I'm <b>Lola</b> 👩‍🍳 You're now in <b>${casa}</b>. Ask me what to cook today, how to make a dish, or what's on the shopping list; and tell me what you buy, and I'll tick it off.`,
  },
};

const lenguaDe = (codigo) => (String(codigo ?? "").toLowerCase().startsWith("en") ? "en" : "es");

/**
 * @param {{ from: object, chatId: string|number, token: string, nombre?: string|null }} args
 * @returns {Promise<{ texto: string, householdId: string|null, lang: 'es'|'en' }>}
 */
export async function unirsePorInvitacion({ from, chatId, token, nombre = null }) {
  const yo = idDePersona(from);
  let lang = lenguaDe(from?.language_code);
  if (!yo) return { texto: TEXTOS[lang].caducada, householdId: null, lang };

  const [ident] = await select("bot_identities", `channel=eq.telegram&external_id=${eq(yo)}`, "user_id");
  let userId = ident?.user_id ?? null;
  let nacida = false;
  if (!userId) {
    const cuenta = await crearCuentaTelegram({ telegramId: from.id, nombre });
    userId = cuenta.userId;
    nacida = true;
  }

  let r;
  try {
    r = await rpc("bot_unirse_por_invitacion", { p_user_id: userId, p_token: token });
  } catch (e) {
    console.warn("[invitación] unirse:", String(e?.message ?? e).slice(0, 200));
    const lleno = /limit/i.test(String(e?.message));
    return { texto: TEXTOS[lang][lleno ? "lleno" : "caducada"], householdId: null, lang };
  }
  if (!r?.householdId) return { texto: TEXTOS[lang].caducada, householdId: null, lang };
  if (r.lang === "en" || r.lang === "es") lang = r.lang;
  const [perfil] = await select("user_profiles", `user_id=${eq(userId)}`, "ui_lang");
  if (perfil?.ui_lang === "en" || perfil?.ui_lang === "es") lang = perfil.ui_lang;

  const enlace = await enlazarChat({
    chatId,
    kind: "private",
    householdId: r.householdId,
    userId,
    externalId: yo,
    nombre,
    lang: from?.language_code,
    // La cuenta nacida aquí sí apunta identidad; una que ya lo era, ya la tiene.
    identidad: nacida ? "nacida" : null,
  });
  if (enlace.ocupado) return { texto: TEXTOS[lang].ocupado, householdId: r.householdId, lang };

  const [casa] = await select("households", `id=${eq(r.householdId)}`, "name");
  const nombreCasa = String(casa?.name ?? "la casa").replace(/[<>&]/g, "");
  return { texto: TEXTOS[lang].hola(nombreCasa, r.role), householdId: r.householdId, lang };
}
