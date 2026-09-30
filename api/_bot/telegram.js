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
export async function enviar(chatId, texto, opts = {}) {
  // Telegram corta en 4096 caracteres: se parte por párrafos.
  const trozos = partir(String(texto ?? ""), 3900);
  let ultimo;
  for (let i = 0; i < trozos.length; i++) {
    const conBotones = i === trozos.length - 1 ? opts : { responderA: opts.responderA };
    try {
      ultimo = await enviarUno(chatId, trozos[i], conBotones);
    } catch (err) {
      // Un HTML mal cerrado (lo escribe un modelo) hace que Telegram rechace el
      // mensaje entero: mejor en texto plano que no contestar.
      if (!/parse entities|can't find end/i.test(err.message)) throw err;
      ultimo = await enviarUno(chatId, trozos[i].replace(/<[^>]+>/g, ""), { ...conBotones, plano: true });
    }
  }
  return ultimo;
}

function partir(texto, max) {
  if (texto.length <= max) return [texto];
  const trozos = [];
  let actual = "";
  for (const parrafo of texto.split(/\n\n/)) {
    if (actual && (actual + "\n\n" + parrafo).length > max) { trozos.push(actual); actual = parrafo; }
    else actual = actual ? `${actual}\n\n${parrafo}` : parrafo;
  }
  if (actual) trozos.push(actual);
  return trozos.flatMap((t) => (t.length > max ? t.match(new RegExp(`[\\s\\S]{1,${max}}`, "g")) : [t]));
}

function enviarUno(chatId, texto, { botones, responderA, plano } = {}) {
  return llamar("sendMessage", {
    chat_id: chatId,
    text: texto,
    ...(plano ? {} : { parse_mode: "HTML" }),
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
