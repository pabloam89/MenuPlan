/**
 * Lo mínimo de la Bot API de Telegram: mandar mensajes y leer el usuario del
 * bot. El canal se aísla aquí para que el día de WhatsApp solo cambie este
 * fichero y el adaptador, no el agente.
 */

const API = "https://api.telegram.org";

function token() {
  const t = process.env.TELEGRAM_BOT_TOKEN;
  if (!t) throw new Error("Falta TELEGRAM_BOT_TOKEN");
  return t;
}

export async function llamar(metodo, cuerpo) {
  const res = await fetch(`${API}/bot${token()}/${metodo}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(cuerpo),
  });
  const json = await res.json().catch(() => null);
  if (!json?.ok) throw new Error(`Telegram ${metodo}: ${json?.description ?? res.status}`);
  return json.result;
}

/**
 * @param {string|number} chatId
 * @param {string} texto  HTML de Telegram (<b>, <i>, <a>): lo más cercano a lo
 *                        que WhatsApp también sabe pintar.
 * @param {{ botones?: {texto: string, dato?: string, url?: string}[][], responderA?: number }} [opts]
 */
export function enviar(chatId, texto, { botones, responderA } = {}) {
  return llamar("sendMessage", {
    chat_id: chatId,
    text: texto,
    parse_mode: "HTML",
    link_preview_options: { is_disabled: true },
    ...(responderA ? { reply_parameters: { message_id: responderA, allow_sending_without_reply: true } } : {}),
    ...(botones
      ? {
          reply_markup: {
            inline_keyboard: botones.map((fila) =>
              fila.map((b) => (b.url ? { text: b.texto, url: b.url } : { text: b.texto, callback_data: b.dato })),
            ),
          },
        }
      : {}),
  });
}

let usuarioBot = null;
/** El @usuario del bot, para montar enlaces t.me. Se cachea por instancia. */
export async function nombreDelBot() {
  if (process.env.TELEGRAM_BOT_USERNAME) return process.env.TELEGRAM_BOT_USERNAME;
  if (!usuarioBot) usuarioBot = (await llamar("getMe", {})).username;
  return usuarioBot;
}

export const escaparHtml = (s) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
