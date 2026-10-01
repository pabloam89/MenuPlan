/**
 * Borrar la cuenta entera desde Telegram (/borrarme), para probar altas una y
 * otra vez (pedido por Pablo el 1 oct 2026).
 *
 * OJO: staging y producción comparten la misma Supabase, así que esto borra
 * datos reales. Por eso dos llaves, las dos necesarias:
 *   · el entorno: solo en el despliegue de staging (VERCEL_TARGET_ENV o la
 *     rama), o con BOT_BORRAR_CUENTA=on a mano;
 *   · quién: el id de Telegram tiene que estar en BOT_ADMINS (por defecto,
 *     solo el de Pablo). Ni el tipo de chat ni el nombre cuentan.
 *
 * Qué borra: el usuario de auth (y en cascada su casa, menús, compra,
 * recetas, despensa…), y lo que el bot guarda fuera de esa cascada: chats
 * enlazados a sus casas (también los de grupo), conversación, cola,
 * candados, códigos, recordatorios, identidades, deshacer, uso y eventos.
 * Si una casa suya tiene más miembros con cuenta, no se borra nada: la
 * cascada les quitaría la casa a ellos.
 */

import { select, eq, config } from "./db.js";

const ADMINS = (process.env.BOT_ADMINS || "491628449").split(",").map((s) => s.trim()).filter(Boolean);

/**
 * ¿Puede este usuario de Telegram borrar su cuenta desde aquí?
 * `host`: por dónde llegó la petición. El webhook de staging tiene su propio
 * dominio (homenu-staging…), y es lo fiable: en staging no llegaba ni
 * VERCEL_TARGET_ENV ni la rama, y /borrarme caía a Lola (1 oct 2026).
 */
export function puedeBorrar(telegramId, entorno = process.env, host = "") {
  const donde = entorno.VERCEL_TARGET_ENV || entorno.VERCEL_GIT_COMMIT_REF || "";
  const enStaging = donde === "staging" || entorno.BOT_BORRAR_CUENTA === "on" || /(^|[.-])staging([.-]|$)/i.test(host);
  return enStaging && telegramId != null && ADMINS.includes(String(telegramId));
}

const TIEMPO_MS = 8000;

async function borrarFilas(tabla, filtro) {
  const { url, headers } = config();
  const res = await fetch(`${url}/rest/v1/${tabla}?${filtro}`, { method: "DELETE", headers, signal: AbortSignal.timeout(TIEMPO_MS) });
  if (!res.ok) throw new Error(`${tabla}: ${res.status} ${(await res.text()).slice(0, 200)}`);
}

async function borrarUsuario(userId) {
  const { url, key } = config();
  const res = await fetch(`${url}/auth/v1/admin/users/${userId}`, {
    method: "DELETE",
    headers: { apikey: key, Authorization: `Bearer ${key}` },
    signal: AbortSignal.timeout(TIEMPO_MS),
  });
  if (!res.ok && res.status !== 404) throw new Error(`auth: ${res.status} ${(await res.text()).slice(0, 200)}`);
}

const lista = (ids) => `in.(${ids.map((x) => `"${x}"`).join(",")})`;

/**
 * @returns {Promise<{ ok: true, casas: number } | { ok: false, motivo: string }>}
 */
export async function borrarCuenta({ chatId, telegramId }) {
  const [identidad] = await select("bot_identities", `channel=eq.telegram&external_id=${eq(String(telegramId))}`, "user_id");
  const [chat] = await select("bot_chats", `channel=eq.telegram&chat_id=${eq(String(chatId))}`, "household_id");
  let userId = identidad?.user_id ?? null;
  if (!userId && chat?.household_id) {
    const [h] = await select("households", `id=${eq(chat.household_id)}`, "owner_user_id");
    userId = h?.owner_user_id ?? null;
  }

  const casas = userId ? (await select("households", `owner_user_id=${eq(userId)}`, "id")).map((h) => h.id) : [];
  if (casas.length) {
    const otros = await select("household_members", `household_id=${lista(casas)}&user_id=neq.${userId}`, "user_id");
    if (otros.length) return { ok: false, motivo: "tu casa tiene más miembros con cuenta, y borrarla se la quitaría a ellos" };
  }

  // Lo que el bot guarda fuera de la cascada de auth: por chat (el privado y
  // los grupos de esas casas), por identidad de Telegram y por usuario.
  const chats = new Set([String(chatId)]);
  if (casas.length) for (const c of await select("bot_chats", `household_id=${lista(casas)}`, "chat_id")) chats.add(String(c.chat_id));
  const enChats = `chat_id=${lista([...chats])}`;
  for (const tabla of ["bot_messages", "bot_cola", "bot_candados", "bot_codigos", "bot_reminders", "bot_chats"]) await borrarFilas(tabla, enChats);
  await borrarFilas("bot_identities", `channel=eq.telegram&external_id=${eq(String(telegramId))}`);
  await borrarFilas("bot_codigos", `external_id=${eq(String(telegramId))}`);
  if (casas.length) for (const tabla of ["bot_deshacer", "bot_usage"]) await borrarFilas(tabla, `household_id=${lista(casas)}`);
  if (userId) {
    await borrarFilas("user_events", `user_id=${eq(userId)}`);
    // El último: con él caen en cascada la casa, sus menús, la compra, las
    // recetas, la despensa y el resto de tablas de usuario.
    await borrarUsuario(userId);
  }
  return { ok: true, casas: casas.length };
}
