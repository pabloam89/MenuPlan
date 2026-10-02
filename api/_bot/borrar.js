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
import { llamar } from "./telegram.js";

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
 * Lo que el bot guarda fuera de la cascada de auth, de una cuenta: los chats
 * enlazados a sus casas (el privado y los de grupo), su conversación, cola,
 * candados, códigos, recordatorios, identidades de Telegram, deshacer, uso y
 * eventos. Lo usan el borrado desde Telegram y el de la app
 * (api/delete-account.js), que antes dejaba todo esto huérfano.
 * Hay que llamarlo ANTES de borrar el usuario: después ya no se sabe qué casas eran suyas.
 */
export async function borrarLoDelBot(userId, { chatIds = [], telegramId = null } = {}) {
  const casas = userId ? (await select("households", `owner_user_id=${eq(userId)}`, "id")).map((h) => h.id) : [];
  const identidades = userId ? await select("bot_identities", `user_id=${eq(userId)}`, "external_id") : [];
  const externos = new Set([...(telegramId != null ? [String(telegramId)] : []), ...identidades.map((i) => String(i.external_id))]);
  // En Telegram el chat privado tiene el mismo id que la persona.
  const chats = new Set([...chatIds.map(String), ...externos]);
  if (casas.length) for (const c of await select("bot_chats", `household_id=${lista(casas)}`, "chat_id")) chats.add(String(c.chat_id));
  // Todo a la vez: no dependen entre sí, y la app tiene poco tiempo.
  const borrados = [];
  if (chats.size) {
    const enChats = `chat_id=${lista([...chats])}`;
    for (const tabla of ["bot_messages", "bot_cola", "bot_candados", "bot_codigos", "bot_reminders", "bot_chats"]) borrados.push(borrarFilas(tabla, enChats));
  }
  if (externos.size) {
    borrados.push(borrarFilas("bot_identities", `external_id=${lista([...externos])}`));
    borrados.push(borrarFilas("bot_codigos", `external_id=${lista([...externos])}`));
  }
  if (userId) borrados.push(borrarFilas("bot_identities", `user_id=${eq(userId)}`));
  if (casas.length) for (const tabla of ["bot_deshacer", "bot_usage"]) borrados.push(borrarFilas(tabla, `household_id=${lista(casas)}`));
  if (userId) borrados.push(borrarFilas("user_events", `user_id=${eq(userId)}`));
  await Promise.all(borrados);
  return { casas: casas.length };
}

/**
 * Borrar la cuenta desde Telegram: lo del bot y el usuario (con él caen en
 * cascada la casa, sus menús, la compra, las recetas y la despensa).
 * @returns {Promise<{ ok: true, casas: number } | { ok: false, motivo: string }>}
 */
export async function borrarCuenta({ chatId, telegramId }) {
  const [identidad] = await select("bot_identities", `channel=eq.telegram&external_id=${eq(String(telegramId))}`, "user_id");
  // La cuenta de QUIEN PULSA: su identidad de Telegram o, si no la tiene (chats
  // enlazados antes de que existieran), la que enlazó este chat PRIVADO. Nunca
  // la del dueño de la casa: abierto a todos, alguien enlazado a una casa
  // ajena borraría al dueño (antes se hacía así, cuando solo lo usaba Pablo).
  const [chat] = await select("bot_chats", `channel=eq.telegram&chat_id=${eq(String(chatId))}`, "household_id,kind,linked_by");
  let userId = identidad?.user_id ?? null;
  if (!userId && chat?.kind === "private" && String(chatId) === String(telegramId)) userId = chat.linked_by ?? null;
  if (!userId) {
    // Sin cuenta que borrar: solo lo que el bot guarda de este chat.
    await borrarLoDelBot(null, { chatIds: [chatId], telegramId });
    return { ok: true, casas: 0, lectores: 0, sinCuenta: true };
  }

  // Quién más hay en sus casas (roles de la 0070: owner | editor | viewer). Un
  // coeditor frena el borrado: la casa también es suya, y hasta la fase 5
  // (pasarle la casa antes de borrar) no hay a quién dejársela. Un lector no
  // frena: pierde el acceso y se dice (92, propuesta de roles, sección 3).
  const casas = userId ? (await select("households", `owner_user_id=${eq(userId)}`, "id")).map((h) => h.id) : [];
  const otros = casas.length ? await select("household_members", `household_id=${lista(casas)}&user_id=neq.${userId}`, "user_id,role") : [];
  if (otros.some((o) => o.role === "editor")) {
    return { ok: false, motivo: "tu casa tiene alguien más que la lleva contigo, y borrarla se la quitaría. Que salga de la casa desde la app, o quítale tú, y luego vuelve a pedírmelo" };
  }
  const lectores = otros.filter((o) => o.role === "viewer").length;

  const r = await borrarLoDelBot(userId, { chatIds: [chatId], telegramId });
  // El último: con él cae todo lo demás.
  if (userId) await borrarUsuario(userId);
  return { ok: true, casas: r.casas, lectores };
}

// Cuántos mensajes hacia atrás intenta borrar /limpiar, y de cuántos en
// cuántos (deleteMessages acepta hasta 100 por llamada).
const LIMPIAR_HACIA_ATRAS = 3000;
const POR_TANDA = 100;

/**
 * Las tandas de ids a borrar, del más nuevo al más viejo: de `hasta` hacia
 * atrás. En un chat privado los ids de mensaje son correlativos (los de los
 * dos lados), así que no hace falta haberlos guardado.
 */
export function tandasHaciaAtras(hasta, cuantos = LIMPIAR_HACIA_ATRAS, porTanda = POR_TANDA) {
  const tandas = [];
  for (let fin = hasta; fin > 0 && hasta - fin < cuantos; fin -= porTanda) {
    const ini = Math.max(1, fin - porTanda + 1, hasta - cuantos + 1);
    tandas.push(Array.from({ length: fin - ini + 1 }, (_, i) => fin - i));
  }
  return tandas;
}

/**
 * /limpiar: borra la pantalla del chat privado, los mensajes de los dos lados.
 * Telegram solo deja a un bot borrar los de las últimas 48 horas: los más
 * viejos se saltan (para esos, «Borrar chat» en Telegram).
 */
export async function limpiarPantalla(chatId, ultimoId) {
  let tandas = 0;
  for (const ids of tandasHaciaAtras(ultimoId)) {
    // Una tanda que falla entera (todo más viejo de 48 h, o ya borrado) no
    // para las demás.
    const ok = await llamar("deleteMessages", { chat_id: chatId, message_ids: ids }).then(() => true).catch(() => false);
    if (ok) tandas++;
  }
  return { tandas };
}
