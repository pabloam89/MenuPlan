/**
 * Lo mínimo de la Bot API de Telegram: mandar mensajes y leer el usuario del
 * bot. El canal se aísla aquí para que el día de WhatsApp solo cambie este
 * fichero y el adaptador, no el agente.
 */

const API = "https://api.telegram.org";

// El teclado fijo de los chats privados: lo de todos los días a un toque. Cada
// botón llega como texto; api/bot/telegram.js lo traduce (DEL_TECLADO).
export const TECLADO = [["🍽️ Hoy", "📅 Semana"], ["🛒 Compra", "✏️ Cambiar algo"]];

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
  // a propósito: sin cuerpo JSON, falla justo abajo con el status
  const json = await res.json().catch(seguirCon("telegram/json", null));
  if (!json?.ok) throw new Error(`Telegram ${metodo}: ${json?.description ?? res.status}`);
  return json.result;
}

/**
 * @param {string|number} chatId
 * @param {string} texto  HTML de Telegram (<b>, <i>, <a>): lo más cercano a lo
 *                        que WhatsApp también sabe pintar.
 * @param {{ botones?: {texto: string, dato?: string, url?: string}[][], responderA?: number, teclado?: string[][] }} [opts]
 *   `teclado`: el teclado fijo de abajo (ReplyKeyboardMarkup). No puede ir en el
 *   mismo mensaje que `botones`: si vienen los dos, mandan los botones.
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

/**
 * Un botón nuestro → el de Telegram. `login`: un botón de login (login_url).
 * Al pulsarlo, Telegram abre esa URL firmando quién lo ha pulsado (id, hash…),
 * y api/bot/entrar.js lo verifica: entra siempre, en mensajes viejos también,
 * y reenviado no le sirve a otro. El dominio es el que tiene el bot en
 * @BotFather (/setdomain).
 */
export function botonTelegram(b) {
  if (b.login) return { text: b.texto, login_url: { url: b.login, request_write_access: false } };
  if (b.url) return { text: b.texto, url: b.url };
  return { text: b.texto, callback_data: b.dato };
}

function enviarUno(chatId, texto, { botones, responderA, plano, teclado } = {}) {
  return llamar("sendMessage", {
    chat_id: chatId,
    text: texto,
    ...(plano ? {} : { parse_mode: "HTML" }),
    link_preview_options: { is_disabled: true },
    ...(responderA ? { reply_parameters: { message_id: responderA, allow_sending_without_reply: true } } : {}),
    ...(botones
      ? {
          reply_markup: {
            inline_keyboard: botones.map((fila) => fila.map(botonTelegram)),
          },
        }
      : teclado
        ? { reply_markup: { keyboard: teclado.map((fila) => fila.map((t) => ({ text: t }))), is_persistent: true, resize_keyboard: true } }
        : {}),
  });
}

/**
 * Reescribe un mensaje ya enviado (el que se va escribiendo mientras Lola
 * piensa). Con `plano`, sin HTML: a medio escribir las etiquetas pueden estar
 * sin cerrar. Si el texto final no cabe o el HTML falla, lo que no entra sale
 * en mensajes nuevos: nunca se pierde la respuesta.
 */
export async function editar(chatId, messageId, texto, { botones, plano = false } = {}) {
  const trozos = partir(String(texto ?? ""), 3900);
  const markup = botones
    ? { reply_markup: { inline_keyboard: botones.map((fila) => fila.map(botonTelegram)) } }
    : {};
  const uno = (t, p, conMarkup) => llamar("editMessageText", {
    chat_id: chatId, message_id: messageId, text: t,
    ...(p ? {} : { parse_mode: "HTML" }),
    link_preview_options: { is_disabled: true },
    ...(conMarkup ? markup : {}),
  });
  const soloUno = trozos.length === 1;
  try {
    await uno(trozos[0], plano, soloUno);
  } catch (err) {
    if (/message is not modified/i.test(err.message)) { /* ya estaba así */ }
    else if (/parse entities|can't find end/i.test(err.message)) await uno(trozos[0].replace(/<[^>]+>/g, ""), true, soloUno);
    else throw err;
  }
  if (!soloUno) await enviar(chatId, trozos.slice(1).join("\n\n"), { botones });
}

/**
 * Fotos de platos (URLs públicas): una sola con sendPhoto, varias en álbum
 * (sendMediaGroup, de 2 a 10). Si Telegram no puede bajar alguna, no pasa
 * nada: el texto ya ha salido.
 * @param {{ url: string, pie?: string }[]} fotos
 */
export async function enviarFotos(chatId, fotos, { responderA } = {}) {
  const lista = (fotos ?? []).filter((f) => f?.url).slice(0, 10);
  if (!lista.length) return;
  const respuesta = responderA ? { reply_parameters: { message_id: responderA, allow_sending_without_reply: true } } : {};
  try {
    if (lista.length === 1) {
      await llamar("sendPhoto", { chat_id: chatId, photo: lista[0].url, caption: lista[0].pie ?? "", ...respuesta });
    } else {
      await llamar("sendMediaGroup", {
        chat_id: chatId,
        media: lista.map((f) => ({ type: "photo", media: f.url, caption: f.pie ?? "" })),
        ...respuesta,
      });
    }
  } catch (e) {
    console.error("[telegram] fotos", e?.message);
  }
}

let usuarioBot = null;
/** El @usuario del bot, para montar enlaces t.me. Se cachea por instancia. */
export async function nombreDelBot() {
  if (process.env.TELEGRAM_BOT_USERNAME) return process.env.TELEGRAM_BOT_USERNAME;
  if (!usuarioBot) usuarioBot = (await llamar("getMe", {})).username;
  return usuarioBot;
}

export const escaparHtml = (s) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");import { seguirCon } from "./avisar.js";

