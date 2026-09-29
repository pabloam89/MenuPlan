/**
 * Webhook de Telegram.
 *
 * Telegram manda aquí cada mensaje dirigido al bot. En privado le llega todo;
 * en un grupo, con el modo privacidad por defecto, solo los comandos, las
 * menciones y las respuestas a sus mensajes: justo lo decidido (en grupo se
 * habla con él nombrándolo).
 *
 * Cimientos (esta versión): enlazar un chat con una casa (`/start <código>`,
 * código que genera api/bot/link.js) y confirmar que el bot lee la casa. El
 * agente que conversa llega en la fase 1 (specs/plan-bot-mensajeria.md).
 *
 * Seguridad: Telegram firma cada llamada con la cabecera
 * `X-Telegram-Bot-Api-Secret-Token`, que fijamos al registrar el webhook
 * (scripts/telegram-webhook.mjs). Sin ella no se atiende nada.
 */

import crypto from "node:crypto";
import { select, insert, update, eq } from "../_bot/db.js";
import { enviar, escaparHtml } from "../_bot/telegram.js";
import { cargarCasa } from "../_bot/casa.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  if (!secretoValido(req.headers["x-telegram-bot-api-secret-token"])) return res.status(401).end();

  const update_ = req.body ?? {};
  const msg = update_.message;
  // Siempre 200: si no, Telegram reintenta el mismo mensaje una y otra vez.
  if (!msg?.chat) return res.status(200).json({ ok: true });

  try {
    await atender(msg);
  } catch (err) {
    console.error("[bot/telegram]", err?.message);
    await enviar(msg.chat.id, "Uy, algo ha fallado por mi lado. Prueba otra vez en un momento.").catch(() => {});
  }
  return res.status(200).json({ ok: true });
}

async function atender(msg) {
  const chatId = String(msg.chat.id);
  const esGrupo = msg.chat.type === "group" || msg.chat.type === "supergroup";
  const texto = (msg.text ?? "").trim();

  // /start <código> o, en grupo, /start@HoMenuBot <código>
  const start = texto.match(/^\/start(?:@\w+)?(?:\s+(\S+))?$/);
  if (start) return enlazar(msg, chatId, esGrupo, start[1]);

  const [chat] = await select("bot_chats", `channel=eq.telegram&chat_id=${eq(chatId)}`, "household_id");
  if (!chat) {
    return enviar(
      chatId,
      "¡Hola! Todavía no sé de qué casa eres. Ábrelo desde la app de HoMenu con <b>Conectar Telegram</b> y quedamos enlazados.",
    );
  }

  const casa = await cargarCasa(chat.household_id);
  const platos = contarPlatos(casa?.semana?.plan);
  return enviar(
    chatId,
    platos
      ? `Te leo 👋 Tengo vuestra semana: <b>${platos} platos</b>. Muy pronto podrás preguntarme y cambiar cosas desde aquí.`
      : "Te leo 👋 Aún no veo un menú activo en vuestra casa. Muy pronto podrás crearlo desde aquí.",
    { responderA: esGrupo ? msg.message_id : undefined },
  );
}

async function enlazar(msg, chatId, esGrupo, token) {
  if (!token) {
    return enviar(chatId, "Para enlazarme con tu casa, entra en la app de HoMenu y pulsa <b>Conectar Telegram</b>.");
  }

  const [fila] = await select("bot_link_tokens", `token=${eq(token)}`, "token,user_id,household_id,expires_at,used_at");
  if (!fila || fila.used_at || Date.parse(fila.expires_at) < Date.now()) {
    return enviar(chatId, "Ese enlace ya no vale (caduca a los 15 minutos y sirve una sola vez). Pide otro desde la app.");
  }

  // Un chat ya enlazado a OTRA casa solo lo puede mover quien lo enlazó: si
  // no, cualquiera del grupo familiar se lo llevaría a su casa con su código.
  const [actual] = await select("bot_chats", `channel=eq.telegram&chat_id=${eq(chatId)}`, "household_id,linked_by");
  if (actual && actual.household_id !== fila.household_id && actual.linked_by !== fila.user_id) {
    return enviar(chatId, "Este chat ya está conectado a otra casa. Solo quien lo conectó puede cambiarlo.");
  }

  // Marcarlo usado ANTES de enlazar: dos pulsaciones seguidas no enlazan dos veces.
  const usados = await update(
    "bot_link_tokens",
    `token=${eq(token)}&used_at=is.null`,
    { used_at: new Date().toISOString() },
  );
  if (!usados?.length) return enviar(chatId, "Ese enlace ya se ha usado. Pide otro desde la app.");

  const nombre = [msg.from?.first_name, msg.from?.last_name].filter(Boolean).join(" ") || null;
  await insert("bot_identities", [{
    channel: "telegram",
    external_id: String(msg.from.id),
    user_id: fila.user_id,
    display_name: nombre,
  }], { upsert: true });
  await insert("bot_chats", [{
    channel: "telegram",
    chat_id: chatId,
    household_id: fila.household_id,
    kind: esGrupo ? "group" : "private",
    linked_by: fila.user_id,
    lang: msg.from?.language_code ?? null,
  }], { upsert: true });

  const [hogar] = await select("households", `id=${eq(fila.household_id)}`, "name");
  const casa = hogar?.name ? ` con <b>${escaparHtml(hogar.name)}</b>` : "";
  return enviar(
    chatId,
    esGrupo
      ? `¡Listo! Este grupo está conectado${casa}. Para hablarme aquí, nómbrame (@) o responde a uno de mis mensajes.`
      : `¡Listo! Estamos conectados${casa}. Escríbeme o mándame un audio cuando quieras.`,
  );
}

function secretoValido(recibido) {
  const secreto = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!secreto || typeof recibido !== "string") return false;
  const a = Buffer.from(recibido);
  const b = Buffer.from(secreto);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function contarPlatos(plan) {
  let n = 0;
  for (const [grupo, huecos] of Object.entries(plan ?? {})) {
    if (grupo.startsWith("_")) continue;
    for (const h of Object.values(huecos ?? {})) if (h?.recipeId || h?.firstRecipeId) n++;
  }
  return n;
}
