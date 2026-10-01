/**
 * Webhook de Telegram.
 *
 * Telegram manda aquí cada mensaje dirigido al bot. En privado le llega todo;
 * en un grupo, con el modo privacidad por defecto, solo los comandos, las
 * menciones y las respuestas a sus mensajes: justo lo decidido (en grupo se
 * habla con él nombrándolo).
 *
 * Tres formas de enlazar un chat con una casa:
 *   · `/start <código>` desde «Conectar Telegram» en Ajustes (bot_link_tokens).
 *   · «Ya tengo cuenta»: el bot pide el email, Supabase manda un código de 6
 *     cifras y se escribe aquí mismo (0059). Todo dentro de Telegram.
 *   · «Soy nuevo»: el bot crea cuenta y casa (api/_bot/cuentas.js) y da un
 *     enlace que abre la app ya dentro (api/bot/entrar.js).
 * Y `/app` en privado: un enlace para abrir la app ya dentro, cuando quieras.
 *
 * El agente que conversa llega en la fase 1 (specs/plan-bot-mensajeria.md).
 *
 * Seguridad: Telegram firma cada llamada con la cabecera
 * `X-Telegram-Bot-Api-Secret-Token`, que fijamos al registrar el webhook
 * (scripts/telegram-webhook.mjs). Sin ella no se atiende nada.
 */

import crypto from "node:crypto";
import { waitUntil } from "@vercel/functions";
import { select, insert, update, eq } from "../_bot/db.js";
import { enviar, enviarFotos, editar, llamar, escaparHtml, nombreDelBot, TECLADO } from "../_bot/telegram.js";
import { respuestaHoy, respuestaSemana, respuestaCompra, recordar } from "../_bot/rapido.js";
import { responder, cortarCharla, esCaida } from "../_bot/agente.js";
import { registrar, rastro, EMBUDO, duenoDe } from "../_bot/embudo.js";
import { RASTRO } from "../../src/lib/rastro.js";
import { transcribir } from "../_bot/voz.js";
import { adjuntoDe } from "../_bot/adjuntos.js";
import { enTurno, aSolas, juntar } from "../_bot/turnos.js";
import { clasificar, vaPorLaRapida } from "../_bot/router.js";
import { viaRapida, eleccionDe, aplicarEleccion, contextoDe } from "../_bot/turno.js";
import { ahoraEnMadrid } from "../_bot/recordatorios.js";
import { fueraDeLimite, contarUso } from "../_bot/uso.js";
import {
  enlacesReceta, enlacesSemana, botonesCompartir, resolverInvitacion,
  recetaEnTexto, semanaEnTexto, copiarReceta,
} from "../_bot/compartir.js";
import { motor } from "../_bot/menu.js";
import { sembrarCasa } from "../_bot/ajustes.js";
import { enlazarChat, crearCodigo, gastarCodigo, baseDe, confirmarEnlace, casaPropia } from "../_bot/enlace.js";
import { hoyISO } from "../_bot/casa.js";
import { partirStart, fraseDePedido } from "../../src/lib/pedidoLola.js";
import { enviarAcceso, verificarCodigoEmail, crearCuentaTelegram, cuentaNacidaAqui } from "../_bot/cuentas.js";

const EMAIL_RE = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]{2,}$/;

// /app va aparte (abrirApp); el resto, al agente como frase.
const COMANDOS = {
  start: "Hola, ¿qué sabes hacer?",
  menu: "Enséñame el menú de la semana",
  hoy: "¿Qué comemos hoy?",
  compra: "¿Qué falta por comprar?",
  generar: "Quiero generar un menú nuevo",
  ayuda: "¿Qué sabes hacer y cómo funcionas?",
};
// Los botones del teclado fijo (TECLADO), dichos como los diría una persona.
const DEL_TECLADO = {
  "🍽️ Hoy": "¿Qué comemos hoy?",
  "📅 Semana": "Enséñame el menú de la semana",
  "🛒 Compra": "¿Qué falta por comprar?",
  "✏️ Cambiar algo": "Quiero cambiar algo del menú",
};
const FALLO = "bot_error";
const MIN_VINCULAR = 60; // lo que dura el enlace de acceso de Supabase
const MIN_ENTRAR = 30;

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  if (!secretoValido(req.headers["x-telegram-bot-api-secret-token"])) return res.status(401).end();

  const upd = req.body ?? {};
  const base = baseDe(req);
  const chatId = upd.message?.chat?.id ?? upd.callback_query?.message?.chat?.id;
  // Siempre 200: si no, Telegram reintenta el mismo mensaje una y otra vez.
  if (chatId == null) return res.status(200).json({ ok: true });

  // Se contesta a Telegram al momento y se trabaja después (waitUntil): el
  // agente puede tardar varios segundos entre modelo y herramientas, y si el
  // webhook no responde, Telegram reintenta y el mensaje se atendería dos veces.
  waitUntil((async () => {
    try {
      if (upd.callback_query) await pulsado(upd.callback_query, base);
      else if (upd.message) await atender(upd.message, base);
    } catch (err) {
      console.error("[bot/telegram]", err?.message);
      await enviar(chatId, "Uy, algo ha fallado. Escríbemelo otra vez en un momento, porfa.").catch(() => {});
    }
  })());
  return res.status(200).json({ ok: true });
}

/**
 * En un grupo, ¿el mensaje es para Lola? Un comando, una mención, una
 * respuesta a un mensaje suyo, o que empiece por «Lola». Exportada para el test.
 */
export function meHablan(msg, yo) {
  const pie = (msg.text ?? msg.caption ?? "").trim();
  const bot = String(yo ?? "").toLowerCase();
  return /^\/\w+/.test(pie)
    || Boolean(bot && pie.toLowerCase().includes(`@${bot}`))
    || Boolean(msg.reply_to_message?.from?.is_bot && msg.reply_to_message.from.username?.toLowerCase() === bot)
    || /^lola\b/i.test(pie);
}

const nombreDe = (from) => [from?.first_name, from?.last_name].filter(Boolean).join(" ") || null;
const esGrupoDe = (chat) => chat.type === "group" || chat.type === "supergroup";

async function atender(msg, base) {
  const chatId = String(msg.chat.id);
  const esGrupo = esGrupoDe(msg.chat);
  let texto = (msg.text ?? "").trim();

  // En un grupo: al entrar, se presenta; y solo contesta cuando le hablan a
  // ella (un comando, una mención, una respuesta a un mensaje suyo, o un
  // mensaje que empieza por «Lola»). Para oír lo de «Lola, …» sin mención el
  // bot necesita el modo privacidad apagado (BotFather → /setprivacy).
  if (esGrupo) {
    const yo = (await nombreDelBot().catch(() => "")).toLowerCase();
    if (msg.new_chat_members?.some((m) => m.is_bot && m.username?.toLowerCase() === yo)) return saludoGrupo(chatId);
    if (!meHablan(msg, yo)) return;
    texto = texto.replace(/^lola[\s,:;.!¡¿-]*/i, "").trim() || texto;
  }

  // /start <código> o, en grupo, /start@HoMenuBot <código>
  const start = texto.match(/^\/start(?:@\w+)?(?:\s+(\S+))?$/);
  // `c123456`: el botón del correo de «ya tengo cuenta» abre Telegram y manda
  // el código solo (la plantilla de Supabase lo pone en el enlace t.me).
  const desdeCorreo = start?.[1]?.match(/^c(\d{6})$/);
  if (desdeCorreo && !esGrupo) return comprobarCodigo(msg, chatId, desdeCorreo[1]);
  if (start?.[1] && /^(rc|ru|m)_/.test(start[1]) && !esGrupo) {
    const hecho = await recibirCompartido(chatId, start[1]);
    if (hecho) return hecho;
  }
  // Desde un botón de la app con algo pedido («cambia la cena del viernes»,
  // src/lib/pedidoLola.js): se enlaza sin ceremonia si viene con código, y
  // Lola recibe la frase como si la hubieran escrito.
  const conPedido = !esGrupo && start?.[1] ? partirStart(start[1]) : null;
  if (conPedido?.pedido) {
    const frase = fraseDePedido(conPedido.pedido, hoyISO());
    if (conPedido.codigo) {
      const r = await enlazarDesdeAjustes(msg, chatId, false, conPedido.codigo, { callado: true });
      if (r?.ocupado) return;
    }
    const [enlazado] = await select("bot_chats", `channel=eq.telegram&chat_id=${eq(chatId)}`, "household_id");
    if (!enlazado) return bienvenida(chatId);
    return enTurno(chatId, itemDe(msg.from, frase ?? COMANDOS.start),
      atenderCola({ chatId, householdId: enlazado.household_id, esGrupo: false, base }));
  }
  if (start?.[1]) return enlazarDesdeAjustes(msg, chatId, esGrupo, start[1]);

  const [chat] = await select("bot_chats", `channel=eq.telegram&chat_id=${eq(chatId)}`, "household_id");

  if (/^\/app(?:@\w+)?$/.test(texto)) return abrirApp(msg, chatId, esGrupo, base);

  if (!chat) {
    if (esGrupo) {
      return enviar(chatId, "Este grupo aún no está conectado a ninguna casa. Quien use HoMenu, que me escriba <b>/grupo</b> por privado y le doy el enlace para conectarlo.");
    }
    if (EMAIL_RE.test(texto)) return pedirAcceso(msg, chatId, texto.toLowerCase(), base);
    const cifras = texto.replace(/\s/g, "");
    if (/^\d{6}$/.test(cifras)) return comprobarCodigo(msg, chatId, cifras);
    await registrar(EMBUDO.ARRANQUE, { telegramId: msg.from?.id, unaVez: true });
    if (!texto || texto.startsWith("/")) {
      // Un audio o una foto de primeras: se crea la casa y se atiende igual.
      if (msg.voice || msg.audio || msg.photo || msg.document) return crearCuenta(msg.from, chatId, { msg, base });
      return bienvenida(chatId);
    }
    // Lo primero que escriben ya es el alta («somos cuatro, dos niños…»): sin
    // preguntar por cuentas. Enlazar con la app es un botón, no un paso.
    return crearCuenta(msg.from, chatId, { texto, base });
  }

  if (/^\/grupo(?:@\w+)?$/.test(texto)) return enlaceGrupo(chatId, esGrupo, chat.household_id);
  if (/^\/nueva(?:@\w+)?$/.test(texto)) {
    // Sin pasar por el modelo: es un corte en la memoria, nada más. Y dicho de
    // forma que nadie tema haber borrado su menú.
    await cortarCharla("telegram", chatId, chat.household_id);
    return enviar(chatId, "✨ Listo, empezamos de cero.\n\nTu casa, tu menú y tu compra siguen igual: solo he olvidado lo que estábamos hablando. ¿En qué te ayudo?", esGrupo ? {} : { teclado: TECLADO });
  }

  // Notas de voz: se transcriben y siguen el camino del texto. La respuesta
  // empieza con lo que se entendió, para que un error de oído se vea.
  const audio = msg.voice ?? msg.audio;
  if (!texto && audio) {
    await llamar("sendChatAction", { chat_id: chatId, action: "typing" }).catch(() => {});
    const t = await transcribir(audio, { idioma: msg.from?.language_code, householdId: chat.household_id })
      .catch((e) => ({ error: e?.message }));
    if (t.error) {
      // Sin esto, «no he podido entender el audio» no dejaba rastro de por qué.
      console.error("[voz]", t.error, { segundos: audio.duration, tipo: audio.mime_type });
      const porque = t.error === "largo" ? "Es un audio muy largo: mándamelo en trozos de menos de dos minutos." : "No he podido entender el audio. ¿Me lo escribes?";
      return enviar(chatId, porque, { responderA: esGrupo ? msg.message_id : undefined });
    }
    return enTurno(chatId, itemDe(msg.from, t.texto, { oido: t.texto, responderA: esGrupo ? msg.message_id : undefined }),
      atenderCola({ chatId, householdId: chat.household_id, esGrupo, base }));
  }

  // Fotos y PDFs (un ticket, la nevera, el menú del cole): los lee el modelo.
  // El pie de foto, si lo hay, es lo que se pide; si no, que lo deduzca.
  if (!texto && (msg.photo || msg.document)) {
    await llamar("sendChatAction", { chat_id: chatId, action: "typing" }).catch(() => {});
    const adjunto = await adjuntoDe(msg).catch((e) => ({ error: e?.message }));
    if (!adjunto || adjunto.error) {
      const porque = adjunto?.error === "tipo" ? "De ficheros solo entiendo fotos y PDFs."
        : adjunto?.error === "grande" ? "Es demasiado grande: mándala como foto normal (no como archivo) o un PDF más ligero."
          : "No he podido abrirla. ¿Me la mandas otra vez?";
      return enviar(chatId, porque, { responderA: esGrupo ? msg.message_id : undefined });
    }
    const pie = (msg.caption ?? "").replace(/@\w+bot\b/gi, "").trim();
    // Una foto no se junta con otros mensajes (va entera al modelo): espera a
    // que el chat esté libre, y lo que llegue detrás va en el turno siguiente.
    return aSolas(chatId, () => conversar({ base,
      chatId, householdId: chat.household_id, from: msg.from, esGrupo, adjunto,
      texto: pie || (adjunto.tipo === "document" ? "(te mando este PDF)" : "(te mando esta foto)"),
      responderA: esGrupo ? msg.message_id : undefined,
    }), atenderCola({ chatId, householdId: chat.household_id, esGrupo, base }));
  }

  // Stickers, ubicaciones y demás: nada que hacer.
  if (!texto) {
    return enviar(chatId, "Eso no lo sé leer 🙈 Escríbemelo, mándame un audio o una foto y te ayudo.", {
      responderA: esGrupo ? msg.message_id : undefined,
    });
  }

  // Los comandos del menú «/» (los registra scripts/telegram-perfil.mjs) se
  // traducen a lo que diría una persona y los atiende el agente, igual que si
  // se hubieran escrito. En grupo llegan como «/menu@bot».
  const comando = texto.match(/^\/(\w+)(?:@\w+)?\s*$/)?.[1]?.toLowerCase();
  // Pura consulta del menú guardado: se contesta al momento, sin Lola. Si no
  // hay nada claro que enseñar, sigue hacia ella (sabe explicar y ofrecer).
  const directa = { "🍽️ Hoy": respuestaHoy, hoy: respuestaHoy, "📅 Semana": respuestaSemana, menu: respuestaSemana, "🛒 Compra": respuestaCompra, compra: respuestaCompra }[comando ?? texto];
  if (directa) {
    const r = await directa(chat.household_id).catch((e) => { console.error("[rapido]", e?.message); return null; });
    if (r) {
      const pregunta = COMANDOS[comando] ?? DEL_TECLADO[texto] ?? texto;
      await entregar({ chatId, householdId: chat.household_id, esGrupo, base, from: msg.from, responderA: esGrupo ? msg.message_id : undefined, r });
      await recordar({ chatId, householdId: chat.household_id, pregunta, respuesta: r.texto, autor: esGrupo ? nombreDe(msg.from) : null });
      return;
    }
  }
  // En un grupo le hablan como «@bot …»: la mención no es parte del mensaje.
  const limpio = COMANDOS[comando] ?? DEL_TECLADO[texto] ?? (texto.replace(/@\w+bot\b/gi, "").trim() || texto);
  return enTurno(chatId, itemDe(msg.from, limpio, { responderA: esGrupo ? msg.message_id : undefined }),
    atenderCola({ chatId, householdId: chat.household_id, esGrupo, base }));
}

/** Un mensaje en la cola del chat (api/_bot/turnos.js): lo justo para responderlo. */
function itemDe(from, texto, { oido = null, responderA, inmediato = false } = {}) {
  return {
    texto, oido, responderA, autor: nombreDe(from), inmediato,
    from: from ? { id: from.id, first_name: from.first_name, last_name: from.last_name, language_code: from.language_code } : null,
  };
}

/**
 * Un turno con todo lo acumulado en la cola: varios mensajes seguidos, una
 * sola respuesta. En un grupo con varias personas, cada línea va firmada
 * (juntar) y no se atribuye el turno a nadie en concreto.
 */
function atenderCola({ chatId, householdId, esGrupo, base }) {
  return async (items) => {
    const { texto, oido, ultimo, variosAutores } = juntar(items, { esGrupo });
    await turno({
      base, chatId, householdId, esGrupo, texto, oido,
      from: variosAutores ? null : ultimo.from,
      responderA: ultimo.responderA,
    });
  };
}

// ── El enrutador (api/_bot/router.js) ───────────────────────────────────────
//
// BOT_ROUTER=off     todo a Lola, como antes.
// BOT_ROUTER=sombra  Lola contesta siempre; el enrutador decide en paralelo y
//                    solo se APUNTA qué habría hecho (bot_route en user_events),
//                    para medirlo con tráfico real antes de encenderlo.
// BOT_ROUTER=on      la cascada entera:
//   0. estado: si Lola acaba de dar opciones y le eligen una → se aplica.
//   1. el enrutador (Haiku) y Lola arrancan A LA VEZ (especulativo, como hace
//      Sierra): Lola no espera a nadie, pero lo que escribiría en la casa
//      queda retenido, y lo que va escribiendo en el chat no sale todavía.
//   2. si el turno es de la vía rápida, se cancela a Lola sin que haya tocado
//      nada y se contesta con la plantilla; si no, se abre la puerta y sigue.
// En grupos, de momento, siempre Lola.
const MODO_ROUTER = () => (["sombra", "on"].includes(process.env.BOT_ROUTER) ? process.env.BOT_ROUTER : "off");
const RUTA = "bot_route";

/** Lo último que dijo Lola en este chat (y su propuesta de opciones, si la hubo). */
async function ultimaDeLola(chatId) {
  const filas = await select("bot_messages", `channel=eq.telegram&chat_id=${eq(chatId)}&order=created_at.desc&limit=2`, "role,content").catch(() => []);
  const f = filas.find((x) => x.role === "assistant");
  // Tras un /nueva (marcador de corte) no hay «último» que valga.
  if (!f || filas[0]?.content?.corte) return null;
  // Y lo que el usuario dijo justo antes: «pizza congelada» → «¿qué día?» →
  // «los viernes de cena». Con solo la frase de Lola, el enrutador veía un
  // cambio sin plato y ponía uno al azar. Solo si Lola acababa de PREGUNTAR:
  // si el turno anterior ya se cerró, su plato no tiene que ver con lo nuevo
  // (pizza el viernes → «cambia la cena del sábado» no es otra pizza).
  const antes = filas.find((x) => x.role === "user");
  const texto = String(f.content?.texto ?? "").replace(/<[^>]+>/g, "");
  const pregunto = /\?\s*(\[\[[^\]]*\]\]\s*)*$/.test(texto.trim());
  return {
    texto,
    propuesta: f.content?.propuesta ?? null,
    anteriorDelUsuario: antes && pregunto ? String(antes.content?.texto ?? "").slice(0, 300) : null,
  };
}

async function apuntarRuta(householdId, extra) {
  await registrar(RUTA, { userId: await duenoDe(householdId).catch(() => null), extra }).catch(() => {});
}

async function turno({ chatId, householdId, esGrupo, base, texto, oido = null, from, responderA }) {
  const modo = MODO_ROUTER();
  if (modo === "off" || esGrupo) return conversar({ base, chatId, householdId, esGrupo, texto, oido, from, responderA });
  const t0 = Date.now();
  const marca = (que) => process.env.BOT_TIEMPOS && console.log(`[turno] ${que}: ${Date.now() - t0} ms`);
  // Lo último que dijo Lola y la casa (quién hay, si hay menú). Se probó a
  // quitar la casa para ahorrar 0,3 s y el enrutador perdió confianza donde
  // importa: sin saber que hay menú dudaba en «cambia la cena del jueves», y
  // sin saber que hay un bebé mandaba «¿qué le hago al bebé?» a Lola
  // (scripts/router-evals.mjs, 84/92 frente a 135/138).
  const [ultima, contexto] = await Promise.all([ultimaDeLola(chatId), contextoDe(householdId)]);
  marca("contexto");

  // 0. Estado: elegir una de las opciones que acaba de dar.
  if (modo === "on" && ultima?.propuesta) {
    const eleccion = eleccionDe(texto, ultima.propuesta);
    if (eleccion) {
      const r = await aplicarEleccion(eleccion, ultima.propuesta, householdId).catch(() => null);
      marca("elección aplicada");
      if (r) {
        await entregarRapida({ chatId, householdId, esGrupo, base, from, responderA, oido, texto, r });
        marca("entregado");
        return apuntarRuta(householdId, { modo: "eleccion", rapida: true, ms: Date.now() - t0 });
      }
    }
  }

  const decisionP = clasificar({ texto, contexto: { ...contexto, ahora: ahoraEnMadrid(), ultimaDeLola: ultima?.texto ?? null, anteriorDelUsuario: ultima?.anteriorDelUsuario ?? null } });

  if (modo === "sombra") {
    decisionP.then((d) => apuntarRuta(householdId, {
      sombra: true, modo: d.modo, confianza: d.confianza, rapida: vaPorLaRapida(d), ms: d.ms, error: d.error, texto: String(texto).slice(0, 120),
    }));
    return conversar({ base, chatId, householdId, esGrupo, texto, oido, from, responderA });
  }

  // on: Lola arranca ya, con la puerta cerrada.
  let abrir;
  const puerta = new Promise((r) => { abrir = r; });
  const ctrl = new AbortController();
  const lola = conversar({ base, chatId, householdId, esGrupo, texto, oido, from, responderA, puerta, signal: ctrl.signal });

  const d = await decisionP;
  marca(`enrutador (${d.modo} ${d.confianza}, ${d.ms} ms)`);
  // Lo que hace falta para convertir un turno real en un caso de
  // scripts/router-evals.json (scripts/router-feedback.mjs): la frase, lo que
  // acababa de decir Lola, los datos sacados y el chat, para ver qué vino después.
  const paraEvals = { texto: String(texto).slice(0, 200), ultima: ultima?.texto ? String(ultima.texto).slice(0, 300) : null, anterior: ultima?.anteriorDelUsuario ?? null, datos: d.datos, chat: String(chatId) };
  if (vaPorLaRapida(d) && !(await fueraDeLimite(householdId))) {
    const r = await viaRapida(d, householdId).catch((e) => { console.error("[router] vía rápida", e?.message); return null; });
    marca("vía rápida hecha");
    if (r) {
      abrir(false);
      ctrl.abort();
      await lola.catch(() => {});
      await entregarRapida({ chatId, householdId, esGrupo, base, from, responderA, oido, texto, r });
      await contarUso(householdId, d.uso ?? {}).catch(() => {});
      return apuntarRuta(householdId, { ...paraEvals, modo: d.modo, confianza: d.confianza, rapida: true, ms: Date.now() - t0, router_ms: d.ms });
    }
  }
  abrir(true);
  // Con el tiempo total del turno de Lola (hasta su respuesta entregada): sin
  // él no había forma de saber cuánto tarda de verdad lo que no es vía rápida.
  await lola.catch(() => {});
  return apuntarRuta(householdId, { ...paraEvals, modo: d.modo, confianza: d.confianza, rapida: false, ms: Date.now() - t0, router_ms: d.ms, error: d.error });
}

/** Entrega una respuesta de la vía rápida y la deja en la memoria de la charla. */
async function entregarRapida({ chatId, householdId, esGrupo, base, from, responderA, oido, texto, r }) {
  await entregar({ chatId, householdId, esGrupo, base, from, responderA, oido, r: { compartir: null, deshacible: false, ...r } });
  await recordar({
    chatId, householdId, pregunta: texto, respuesta: r.texto, autor: esGrupo ? nombreDe(from) : null,
    extra: r.propuesta ? { propuesta: r.propuesta, via: "rapida" } : { via: "rapida" },
  });
}

/** Un turno con el agente, venga de un mensaje o de un botón pulsado. */
async function conversar({ chatId, householdId, texto, from, esGrupo, responderA, oido = null, adjunto = null, base = null, puerta = null, signal = null }) {
  await llamar("sendChatAction", { chat_id: chatId, action: "typing" }).catch(() => {});
  const eco = oido ? `🎙️ «${oido}»\n\n` : "";
  const vivo = mensajeVivo(chatId, { responderA, eco });
  // Turno especulativo: lo que Lola va escribiendo no sale hasta que el turno
  // es suyo (puerta → true). Se guarda lo último y se suelta al abrir.
  let pendiente = null;
  let abierta = !puerta;
  puerta?.then((suyo) => {
    abierta = suyo;
    if (suyo && pendiente) vivo.escribir(...pendiente);
  });
  const alEscribir = (parcial, extra) => (abierta ? vivo.escribir(parcial, extra) : (pendiente = [parcial, extra]));
  let r;
  try {
    r = await responder({ chatId, householdId, texto, autor: esGrupo ? nombreDe(from) : null, esGrupo, adjunto, alEscribir, puerta, signal });
    if (puerta && !(await puerta)) return; // el turno fue de la vía rápida
  } catch (err) {
    // Cancelada porque el turno era de la vía rápida: nada que decir.
    if (signal?.aborted || (puerta && !(await puerta))) { await vivo.parar(); return; }
    // Nunca un error técnico en el chat: una frase y, si cabe, reintentar con
    // un toque (el botón vuelve a mandar lo mismo).
    console.error("[bot/telegram] agente", err?.message);
    await registrar(FALLO, { userId: await duenoDe(householdId).catch(() => null), extra: { error: String(err?.message ?? err).slice(0, 300) } });
    const cabe = Buffer.byteLength(`t:${texto}`) <= 64;
    // Si es que la IA no está (saturada o caída, y el plan B tampoco), se dice
    // lo que SÍ funciona: los botones de abajo salen del menú guardado, sin IA.
    const caida = esCaida(err);
    const aviso = caida
      ? `😵‍💫 Ahora mismo tengo la cabeza saturada y no puedo pensar bien.\n\nLo tuyo sigue ahí: <b>🍽️ Hoy</b>, <b>📅 Semana</b> y <b>🛒 Compra</b> funcionan igual (botones de abajo, o /hoy, /menu y /compra). ${cabe ? "Y esto, reinténtalo en un minuto:" : "Y esto, ¿me lo escribes otra vez en un minuto?"}`
      : cabe ? "Uy, algo ha fallado. ¿Lo intento otra vez?" : "Uy, algo ha fallado. ¿Me lo escribes otra vez?";
    const botones = cabe ? [[{ texto: "🔁 Reintentar", dato: `t:${texto}` }]] : undefined;
    await vivo.parar();
    if (vivo.id()) return editar(chatId, vivo.id(), aviso, { botones }).catch(() => enviar(chatId, aviso, { responderA, botones }));
    return enviar(chatId, aviso, { responderA, botones });
  }
  await vivo.parar();
  return entregar({ chatId, householdId, esGrupo, base, from, responderA, oido, r, vivo });
}

/**
 * La respuesta, con todo lo que la acompaña: fotos (un álbum, antes del
 * texto), botones que puso Lola, «Deshacer», el de su pantalla en la app, los
 * de compartir, y el teclado fijo en privado. Sirve igual para
 * lo que contesta Lola que para las respuestas directas (api/_bot/rapido.js).
 * Si el texto ya se estaba escribiendo en vivo, se termina ese mismo mensaje.
 */
async function entregar({ chatId, householdId, esGrupo, base, from, responderA, oido = null, r, vivo = null }) {
  const { cuerpo, botones: propiosCrudos } = sacarBotones(r.texto);
  // [[No es así]] solo deshace si este turno ha guardado algo; si no, es una
  // respuesta más (deshacer ahí tocaría un cambio anterior que nadie discute).
  const propios = r.deshacible ? propiosCrudos
    : propiosCrudos?.map((fila) => fila.map((b) => (b.dato === `t:${DESHACER}` ? { ...b, dato: `t:${b.texto}` } : b)));
  // Tras un cambio que se puede deshacer, el botón va solo: no hace falta
  // saber decir «deshaz».
  const botones = [...(propios ?? [])];
  // Lo que se ha visto o cambiado, en su pantalla de la app (en privado: el
  // enlace abre la app de quien lo pulsa, con su sesión).
  const alPie = [];
  // Si Lola ya puso su [[No es así]] (que es deshacer), no dos botones para lo mismo.
  const yaDeshace = botones.flat().some((b) => b.dato === `t:${DESHACER}`);
  if (r.deshacible && !yaDeshace) alPie.push({ texto: "↩️ Deshacer", dato: `t:${DESHACER}` });
  // Todo se abre en la app, en su pantalla (?ir=). Solo en privado: el enlace
  // puede llevar la llave de entrada de quien lo pide, y en un grupo la
  // pulsaría cualquiera.
  if (r.ir && base && !esGrupo) {
    alPie.push({ texto: textoBotonApp(r.ir), url: await enlaceApp(base, r.ir, from, chatId) });
  }
  if (alPie.length) botones.push(alPie);
  if (r.compartir && base) {
    const enlaces = r.compartir.tipo === "semana"
      ? await enlacesSemana(householdId, base).catch((e) => { console.error("[compartir]", e?.message); return null; })
      : await enlacesReceta(householdId, r.compartir.recetaId, base).catch((e) => { console.error("[compartir]", e?.message); return null; });
    if (enlaces) botones.push(...botonesCompartir(enlaces, r.compartir.tipo));
  }
  const eco = oido ? `🎙️ <i>«${escaparHtml(oido)}»</i>\n\n` : "";
  if (vivo?.id()) {
    // Ya estaba en pantalla escribiéndose: se completa ahí, con su formato y
    // sus botones. (Las fotos, si las había, salieron antes que el texto.)
    return editar(chatId, vivo.id(), eco + cuerpo, { botones: botones.length ? botones : undefined });
  }
  const fotos = fotosDelTurno(r.fotos);
  if (fotos.length) await enviarFotos(chatId, fotos, { responderA });
  return enviar(chatId, eco + cuerpo, { responderA, botones: botones.length ? botones : undefined, ...(esGrupo ? {} : { teclado: TECLADO }) });
}

// Las fotos, en UN álbum y justo antes del texto (así los botones quedan
// abajo). Si en el turno se han propuesto opciones (pie «1. …»), solo esas:
// son lo que se está eligiendo, y mezclarlas con las del menú confunde.
function fotosDelTurno(todas = []) {
  const propuestas = todas.filter((f) => /^\d+\. /.test(f.pie ?? ""));
  // Si buscó dos veces en el mismo turno (una carpeta y luego otra), la última
  // serie: es la que acaba en el texto. Si no, salían 7 fotos para 4 recetas.
  const desde = propuestas.findLastIndex((f) => /^1\. /.test(f.pie ?? ""));
  return propuestas.length ? propuestas.slice(Math.max(desde, 0)) : todas;
}

/**
 * El mensaje que se va escribiendo mientras Lola piensa: en cuanto hay una
 * frase, sale; luego se reescribe como mucho cada ~1,2 s (Telegram no deja
 * editar mucho más rápido). A medio escribir va sin formato (las etiquetas
 * estarían sin cerrar) y sin los [[botones]]; el mensaje final, con todo, lo
 * pone entregar() sobre este mismo.
 *
 * Si Lola llama a una herramienta después de haber empezado a escribir, lo
 * siguiente que escriba sustituye a lo anterior en el mismo mensaje.
 */
const CADA_MS = 1200;
const MINIMO = 40;
export function mensajeVivo(chatId, { responderA, eco = "" }) {
  let id = null;
  let ultimo = "";
  let ultimaVez = 0;
  let pendiente = null;
  let cadena = Promise.resolve();
  let parado = false;
  let fotosEnviadas = false;

  const limpiar = (t) => String(t ?? "")
    .replace(/\[\[[^\]\n]*\]\]/g, "")
    .replace(/\[\[[^\]\n]*$/, "")
    .replace(/<[^>]*>?/g, "")
    .trim();

  const volcar = (texto, fotos) => {
    cadena = cadena.then(async () => {
      if (parado || texto === ultimo) return;
      if (!id) {
        const fs = fotosDelTurno(fotos ?? []);
        if (fs.length && !fotosEnviadas) { fotosEnviadas = true; await enviarFotos(chatId, fs, { responderA }); }
        const m = await enviar(chatId, `${eco}${texto} …`, { responderA, plano: true }).catch(() => null);
        id = m?.message_id ?? null;
      } else {
        await editar(chatId, id, `${eco}${texto} …`, { plano: true }).catch(() => {});
      }
      ultimo = texto;
      ultimaVez = Date.now();
    });
    return cadena;
  };

  return {
    id: () => id,
    /** @param {string} parcial  lo escrito hasta ahora en esta vuelta del modelo */
    escribir(parcial, { fotos } = {}) {
      if (parado) return;
      const texto = limpiar(parcial);
      if (texto.length < MINIMO) return;
      clearTimeout(pendiente);
      const espera = Math.max(0, CADA_MS - (Date.now() - ultimaVez));
      pendiente = setTimeout(() => volcar(texto, fotos), id ? espera : 0);
    },
    async parar() {
      parado = true;
      clearTimeout(pendiente);
      await cadena;
    },
  };
}

/** Lo que dice el botón que lleva a la app, según a qué pantalla lleva. */
export function textoBotonApp(ir) {
  if (ir === "semana") return "📅 Ver la semana en la app";
  if (ir === "compra") return "🛒 Abrir la lista en la app";
  if (ir === "hoy" || String(ir).startsWith("dia:")) return "🍽️ Ver el día en la app";
  if (String(ir).startsWith("receta:")) return "📖 Ver la receta en la app";
  if (String(ir).startsWith("recetas")) return "📚 Abrir el recetario";
  return "📱 Verlo en la app";
}

/**
 * El enlace a una pantalla de la app (?ir=, src/lib/destinoBot.js). A quien nació
 * en este Telegram se le añade una llave de entrada de un solo uso, como /app:
 * no tiene sesión en la app y sin ella vería el login. A los demás, no: su
 * sesión es la de siempre (Google o email) y no se regala desde un chat.
 */
async function enlaceApp(base, ir, from, chatId) {
  const destino = `ir=${encodeURIComponent(ir)}`;
  const cuenta = from?.id ? await cuentaNacidaAqui(from.id).catch(() => null) : null;
  if (!cuenta) return `${base}/?${destino}`;
  const codigo = await crearCodigo({ tipo: "entrar", chatId, externalId: from.id, userId: cuenta.id, minutos: MIN_ENTRAR });
  return `${base}/?entrar=${codigo}&${destino}`;
}

/**
 * Alguien abre a Lola desde un enlace de compartir (/start rc_… | ru_… | m_…):
 * se le enseña lo que le han mandado y, si ya tiene casa, qué puede hacer con
 * ello. Si no la tiene, la invitación a empezar: su siguiente mensaje ya es el
 * alta (atender, «lo primero que escriben»).
 */
async function recibirCompartido(chatId, param) {
  const inv = await resolverInvitacion(param).catch(() => null);
  if (!inv) return enviar(chatId, "Ese enlace ya no funciona 🙈 Pídele que te lo vuelva a mandar.");
  const [chat] = await select("bot_chats", `channel=eq.telegram&chat_id=${eq(chatId)}`, "household_id");
  // Que lo compartido llega y a quién (con casa o sin ella): sin nombres.
  await rastro(chat?.household_id ?? null, RASTRO.COMPARTIDO_RECIBIDO, { tipo: inv.tipo === "semana" ? "semana" : "receta", conCasa: Boolean(chat) });
  const invitacion = "¿Te preparo también a ti el menú de la semana? Cuéntame quiénes coméis en casa (o mándame un audio) y empezamos 🙂";

  if (inv.tipo === "semana") {
    await enviar(chatId, `👋 Te han pasado su menú de la semana:\n\n${semanaEnTexto(inv.payload)}`);
    return enviar(chatId, chat
      ? "Si te apetece algún plato, dime «ponme la tortilla el jueves» y te lo cambio en tu menú."
      : invitacion);
  }

  const r = inv.receta;
  const m = await motor();
  const foto = r.photo || m.dishImageForRecipe(inv.propia ? { id: r.linked_catalog_id ?? r.base_dish_id ?? r.id } : r);
  if (foto) await enviarFotos(chatId, [{ url: foto, pie: r.name }]);
  const de = inv.deQuien ? ` de ${escaparHtml(inv.deQuien)}` : "";
  await enviar(chatId, `👋 Te han pasado una receta${de}:\n\n${recetaEnTexto(r)}`);
  if (!chat) return enviar(chatId, invitacion);
  return enviar(chatId, "¿Qué hago con ella?", {
    botones: [[
      ...(inv.propia ? [{ texto: "📥 Guardar en mi recetario", dato: `comp:g:${param}` }] : []),
      { texto: "🍽️ Ponerla en mi menú", dato: `comp:m:${param}` },
    ]],
  });
}

async function usarCompartido(cq, chat, base) {
  const chatId = String(cq.message.chat.id);
  if (!chat) return bienvenida(chatId);
  const [, accion, param] = cq.data.match(/^comp:(\w):(.+)$/) ?? [];
  const inv = await resolverInvitacion(param).catch(() => null);
  if (!inv || inv.tipo !== "receta") return enviar(chatId, "Ese enlace ya no funciona 🙈");
  const esGrupo = esGrupoDe(cq.message.chat);
  let nombre = inv.receta.name;
  // Una receta propia de otra persona hay que tenerla antes de poder usarla.
  if (inv.propia) {
    const c = await copiarReceta(chat.household_id, inv.receta);
    if (c.error) return enviar(chatId, c.error);
    nombre = c.nombre;
    if (accion === "g") {
      return enviar(chatId, c.ya
        ? `«${escaparHtml(nombre)}» ya estaba en tu recetario 👍`
        : `📥 Guardada en tu recetario: <b>${escaparHtml(nombre)}</b>. La verás en la app y la puedo poner en tus menús.`, {
        botones: [[{ texto: "🍽️ Ponerla en mi menú", dato: `comp:m:${param}` }]],
      });
    }
  }
  return conversar({
    chatId, householdId: chat.household_id, from: cq.from, esGrupo, base,
    texto: `Quiero poner «${nombre}» en mi menú de esta semana. ¿En qué comida encaja mejor?`,
  });
}

/** Al entrar en un grupo: cómo se le habla, y cómo conectarlo si no lo está. */
async function saludoGrupo(chatId) {
  const [chat] = await select("bot_chats", `channel=eq.telegram&chat_id=${eq(chatId)}`, "household_id");
  return enviar(chatId, [
    "¡Hola, familia! Soy <b>Lola</b> 👩‍🍳, la que os prepara el menú y la compra.",
    "Para hablarme aquí, empezad el mensaje con <b>Lola</b>: «Lola, ¿qué cenamos hoy?» o «Lola, apunta leche».",
    chat ? "" : "Aún no sé de qué casa sois: quien use HoMenu, que me escriba <b>/grupo</b> por privado y le doy el enlace para conectarnos.",
  ].filter(Boolean).join("\n\n"));
}

// /grupo, en privado: el enlace para meter a Lola en el grupo de la familia,
// con un código de un solo uso (el mismo que da la app en Ajustes).
const VALIDEZ_GRUPO_MS = 15 * 60 * 1000;
async function enlaceGrupo(chatId, esGrupo, householdId) {
  if (esGrupo) return enviar(chatId, "Eso por privado: escríbeme /grupo allí y te paso el enlace.");
  const dueno = await duenoDe(householdId);
  if (!dueno) return enviar(chatId, "No encuentro quién gestiona esta casa.");
  const token = crypto.randomBytes(16).toString("base64url");
  await insert("bot_link_tokens", [{ token, user_id: dueno, household_id: householdId, expires_at: new Date(Date.now() + VALIDEZ_GRUPO_MS).toISOString() }]);
  const bot = await nombreDelBot();
  return enviar(chatId, [
    "Para tenerme en el grupo de la familia:",
    "1. Pulsa el botón y elige el grupo.",
    "2. Listo: allí, empezad los mensajes con <b>Lola</b>.",
    "<i>El enlace vale 15 minutos y una sola vez.</i>",
  ].join("\n"), {
    botones: [[{ texto: "👨‍👩‍👧 Añadir al grupo", url: `https://t.me/${bot}?startgroup=${token}` }]],
  });
}

/**
 * El agente pone botones escribiendo `[[Opción]]` en líneas al final
 * (api/_bot/conocimiento.md). Al pulsarlo vuelve como si se hubiera escrito:
 * `t:<texto>` en callback_data, que Telegram limita a 64 bytes.
 */
function sacarBotones(texto) {
  const opciones = [];
  const cuerpo = String(texto).replace(/\[\[([^\]\n]{1,40})\]\]/g, (_, o) => { opciones.push(o.trim()); return ""; }).trim();
  const validas = opciones.filter((o) => Buffer.byteLength(`t:${o}`) <= 64).slice(0, 4);
  if (!validas.length) return { cuerpo, botones: undefined };
  const filas = [];
  for (let i = 0; i < validas.length; i += 2) filas.push(validas.slice(i, i + 2).map((o) => ({ texto: o, dato: datoDeBoton(o) })));
  return { cuerpo, botones: filas };
}

// [[No es así]] tras apuntar algo (una alergia, quién come) es deshacer lo
// que se acaba de guardar: va directo al deshacer de la casa (casa.js), sin
// que el modelo tenga que entender un «no es así» suelto.
const DESHACER = "Deshaz lo último que has cambiado";
const ES_DESHACER = /^(no es as[ií]|no es correcto|no,? as[ií] no|me he equivocado)$/i;
function datoDeBoton(o) {
  return ES_DESHACER.test(o.trim()) ? `t:${DESHACER}` : `t:${o}`;
}

// Empieza por lo que ofrece, no por la cuenta: quien escribe «somos cuatro»
// ya está dando el alta. La cuenta de la app es un botón para quien ya la usa.
function bienvenida(chatId) {
  return enviar(chatId, [
    "¡Hola! Soy <b>Lola</b> 👩‍🍳 Te preparo el menú de la semana y la lista de la compra, y te lo cambio cuando quieras.",
    "Para empezar, cuéntame <b>quiénes coméis en casa</b> (y la edad de los peques). Escríbemelo o mándame un audio 🎙️",
    "<i>Lo que me cuentes solo sirve para vuestro menú; no se lo paso a nadie.</i>",
  ].join("\n\n"), {
    botones: [[
      { texto: "Es mi primera vez", dato: "cuenta:nuevo:ok" },
      { texto: "Ya uso HoMenu", dato: "cuenta:si" },
    ]],
  });
}

async function pulsado(cq, base) {
  const chatId = String(cq.message.chat.id);
  await llamar("answerCallbackQuery", { callback_query_id: cq.id }).catch(() => {});
  // Un botón se usa una vez: se quitan los del mensaje pulsado para que no
  // se pulsen luego los viejos (en la primera prueba salieron cinco avisos
  // seguidos de «ya está conectado»).
  await llamar("editMessageReplyMarkup", {
    chat_id: cq.message.chat.id,
    message_id: cq.message.message_id,
    reply_markup: { inline_keyboard: [] },
  }).catch(() => {});
  const [chat] = await select("bot_chats", `channel=eq.telegram&chat_id=${eq(chatId)}`, "household_id");

  // Un botón que puso el agente: cuenta como si se hubiera escrito (también en grupo).
  if (cq.data?.startsWith("t:")) {
    if (!chat) return bienvenida(chatId);
    const esGrupo = esGrupoDe(cq.message.chat);
    return enTurno(chatId, itemDe(cq.from, cq.data.slice(2), { responderA: esGrupo ? cq.message.message_id : undefined, inmediato: true }),
      atenderCola({ chatId, householdId: chat.household_id, esGrupo, base }));
  }

  // Quien recibe una receta: guardársela o ponerla en su menú.
  if (cq.data?.startsWith("comp:")) return usarCompartido(cq, chat, base);

  if (esGrupoDe(cq.message.chat)) return;
  if (chat) return enviar(chatId, "Este chat ya está conectado a tu casa. Escríbeme cuando quieras.");

  if (cq.data === "cuenta:si") {
    return enviar(chatId, "Escríbeme el <b>email</b> con el que entras en HoMenu y te mando un código para conectarnos.");
  }
  // «Soy nuevo» pide confirmación: el bot no puede saber que ya tienes cuenta
  // (Telegram no nos da tu email), y crear una vacía por error despista mucho.
  if (cq.data === "cuenta:nuevo") {
    return enviar(chatId, "¿Seguro que no usas HoMenu todavía? Si ya entras en la app (por ejemplo, con Google), conecta esa cuenta para ver tu casa y tu menú.", {
      botones: [[
        { texto: "Ya uso HoMenu", dato: "cuenta:si" },
        { texto: "Es mi primera vez", dato: "cuenta:nuevo:ok" },
      ]],
    });
  }
  if (cq.data === "cuenta:nuevo:ok") return crearCuenta(cq.from, chatId, { base });
}

// Límites de correos de acceso: por persona (no bombardear a nadie desde un
// Telegram) y en total (el SMTP del proyecto admite 30 por hora y lo comparten
// todos los accesos por email de la app).
const TOPE_PERSONA_HORA = 3;
const TOPE_TOTAL_HORA = 20;

async function pedirAcceso(msg, chatId, email, base) {
  const haceUnaHora = encodeURIComponent(new Date(Date.now() - 3600000).toISOString());
  const [mios, todos] = await Promise.all([
    select("bot_codigos", `tipo=eq.vincular&external_id=${eq(msg.from?.id)}&created_at=gt.${haceUnaHora}`, "codigo"),
    select("bot_codigos", `tipo=eq.vincular&created_at=gt.${haceUnaHora}`, "codigo"),
  ]);
  if (mios.length >= TOPE_PERSONA_HORA || todos.length >= TOPE_TOTAL_HORA) {
    return enviar(chatId, "Ya te he mandado varios correos. Espera un rato antes de pedir otro.");
  }

  await crearCodigo({
    tipo: "vincular",
    chatId,
    externalId: msg.from?.id,
    nombre: nombreDe(msg.from),
    email,
    minutos: MIN_VINCULAR,
  });
  const r = await enviarAcceso(email, `${base}/`);
  if (!r.ok && !r.noExiste) {
    console.error("[bot/telegram] enviarAcceso", r.error);
    return enviar(chatId, "No he podido mandarte el correo ahora mismo. Prueba en unos minutos.");
  }
  // La misma respuesta exista o no la cuenta: si no, el bot serviría para
  // averiguar qué emails usan HoMenu.
  // Sin botón de «Soy nuevo» aquí: quien ya ha escrito su email casi seguro
  // tiene cuenta, y ese botón le creaba otra vacía (pasó en la primera prueba).
  return enviar(
    chatId,
    `Si <b>${escaparHtml(email)}</b> tiene cuenta en HoMenu, te acaba de llegar un correo con un <b>código de 6 cifras</b>. Escríbemelo aquí.\n\n¿No te llega? Mira en spam, o escríbeme otra vez el email por si tenía una errata.`,
  );
}

const MAX_INTENTOS = 5;

async function comprobarCodigo(msg, chatId, token) {
  const ahora = encodeURIComponent(new Date().toISOString());
  const [pendiente] = await select(
    "bot_codigos",
    `tipo=eq.vincular&channel=eq.telegram&chat_id=${eq(chatId)}&external_id=${eq(msg.from?.id)}&used_at=is.null&expires_at=gt.${ahora}&order=created_at.desc&limit=1`,
    "codigo,email,intentos",
  );
  if (!pendiente?.email) return bienvenida(chatId);
  if (pendiente.intentos >= MAX_INTENTOS) {
    return enviar(chatId, "Demasiados intentos con ese código. Escríbeme otra vez tu email y te mando uno nuevo.");
  }

  const userId = await verificarCodigoEmail(pendiente.email, token);
  if (!userId) {
    await update("bot_codigos", `codigo=${eq(pendiente.codigo)}`, { intentos: pendiente.intentos + 1 });
    return enviar(chatId, "Ese código no es correcto (o ha caducado). Revísalo y vuelve a escribírmelo.");
  }

  if (!(await gastarCodigo(pendiente.codigo, "vincular"))) return bienvenida(chatId);
  const hogar = await casaPropia(userId);
  if (!hogar) {
    return enviar(chatId, "Tu cuenta no gestiona ninguna casa todavía. Entra en la app de HoMenu para crear la tuya y vuelve a escribirme.");
  }
  const r = await enlazarChat({
    chatId,
    kind: "private",
    householdId: hogar.id,
    userId,
    externalId: msg.from?.id,
    nombre: nombreDe(msg.from),
    lang: msg.from?.language_code,
  });
  if (r.ocupado) return enviar(chatId, "Este chat ya está conectado a otra casa. Solo quien lo conectó puede cambiarlo.");
  return confirmarEnlace(chatId, hogar.id);
}

/**
 * @param {{ texto?: string, msg?: object, base?: string }} [primero]  lo primero que escribió
 *   (o el audio / la foto): se atiende como parte del alta, sin hacerle repetir.
 */
async function crearCuenta(from, chatId, primero = {}) {
  // Si este Telegram ya creó su cuenta, no se crea otra; y siempre su casa
  // PROPIA, nunca la activa (podría ser una ajena en la que es invitado).
  const nacida = await cuentaNacidaAqui(from.id);
  const cuenta = nacida
    ? { userId: nacida.id, householdId: (await casaPropia(nacida.id))?.id }
    : await crearCuentaTelegram({ telegramId: from.id, nombre: nombreDe(from) });
  if (!cuenta.householdId) throw new Error("cuenta sin casa");

  await enlazarChat({
    chatId,
    kind: "private",
    householdId: cuenta.householdId,
    userId: cuenta.userId,
    externalId: from.id,
    nombre: nombreDe(from),
    lang: from.language_code,
  });

  // El alta sigue aquí mismo, hablando: el agente pregunta lo imprescindible
  // (quiénes, alergias, qué comidas) y propone el primer menú. La app queda
  // para ver, con /app cuando se quiera.
  await sembrarCasa(cuenta.householdId);
  let texto = primero.texto ?? null;
  let oido = null;
  let adjunto = null;
  const m = primero.msg;
  if (m?.voice || m?.audio) {
    const t = await transcribir(m.voice ?? m.audio, { idioma: from.language_code, householdId: cuenta.householdId })
      .catch((e) => ({ error: e?.message }));
    if (!t.error) { texto = t.texto; oido = t.texto; }
    else console.error("[voz]", t.error);
  } else if (m?.photo || m?.document) {
    const a = await adjuntoDe(m).catch(() => null);
    if (a && !a.error) { adjunto = a; texto = (m.caption ?? "").trim() || "(te mando esta foto)"; }
  }
  return conversar({
    chatId, householdId: cuenta.householdId, from, esGrupo: false, oido, adjunto, base: primero.base ?? null,
    texto: texto
      ? `[alta] Casa recién creada desde Telegram. Mi primer mensaje: ${texto}`
      : "[alta] Casa recién creada desde Telegram. Ayúdame a montarla.",
  });
}

async function abrirApp(msg, chatId, esGrupo, base) {
  // Solo en privado: en un grupo, cualquiera de dentro recibiría una llave
  // para entrar en la cuenta de otro.
  if (esGrupo) return enviar(chatId, "Eso te lo mando por privado: escríbeme /app allí.");
  // Y solo a cuentas NACIDAS en este Telegram (email sintético de este
  // from.id). Una identidad en bot_identities no prueba que este Telegram sea
  // el dueño de la cuenta: se crea también al enlazar por email o desde un
  // grupo, y dar desde ahí una llave de sesión sería regalar la cuenta entera.
  const cuenta = await cuentaNacidaAqui(msg.from.id);
  if (!cuenta) {
    return enviar(chatId, "Tu cuenta se abre como siempre, con Google o con tu email, desde la app de HoMenu.");
  }
  const codigo = await crearCodigo({ tipo: "entrar", chatId, externalId: msg.from.id, userId: cuenta.id, minutos: MIN_ENTRAR });
  return enviar(chatId, "Aquí tienes (sirve una vez y caduca en 30 minutos):", {
    botones: [[{ texto: "Abrir HoMenu", url: `${base}/?entrar=${codigo}` }]],
  });
}

/**
 * `callado`: viene de un botón de la app con algo pedido. Si el chat ya
 * estaba enlazado, un código gastado da igual, y sobra el «conectado»: lo que
 * toca es atender lo pedido. Devuelve `{ ocupado: true }` si el chat es de
 * otra casa (y entonces no se atiende nada).
 */
async function enlazarDesdeAjustes(msg, chatId, esGrupo, token, { callado = false } = {}) {
  const [fila] = await select("bot_link_tokens", `token=${eq(token)}`, "token,user_id,household_id,expires_at,used_at");
  if (!fila || fila.used_at || Date.parse(fila.expires_at) < Date.now()) {
    if (callado) return null;
    return enviar(chatId, "Ese enlace ya no vale (caduca a los 15 minutos y sirve una sola vez). Pide otro desde la app.");
  }

  // Marcarlo usado ANTES de enlazar: dos pulsaciones seguidas no enlazan dos veces.
  const usados = await update("bot_link_tokens", `token=${eq(token)}&used_at=is.null`, { used_at: new Date().toISOString() });
  if (!usados?.length) return callado ? null : enviar(chatId, "Ese enlace ya se ha usado. Pide otro desde la app.");

  const r = await enlazarChat({
    chatId,
    kind: esGrupo ? "group" : "private",
    householdId: fila.household_id,
    userId: fila.user_id,
    externalId: msg.from?.id,
    nombre: nombreDe(msg.from),
    lang: msg.from?.language_code,
  });
  if (r.ocupado) {
    await enviar(chatId, "Este chat ya está conectado a otra casa. Solo quien lo conectó puede cambiarlo.");
    return { ocupado: true };
  }
  if (callado) return { ok: true };
  return confirmarEnlace(chatId, fila.household_id, esGrupo);
}

function secretoValido(recibido) {
  const secreto = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!secreto || typeof recibido !== "string") return false;
  const a = Buffer.from(recibido);
  const b = Buffer.from(secreto);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
