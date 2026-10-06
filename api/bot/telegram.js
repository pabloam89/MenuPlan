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
import { responder, cortarCharla, esCaida, AVISO_LENTO } from "../_bot/agente.js";
import { registrar, rastro, EMBUDO, duenoDe } from "../_bot/embudo.js";
import { RASTRO } from "../../src/lib/rastro.js";
import { pintarMenuEntero } from "../_bot/pintar.js";
import { transcribir } from "../_bot/voz.js";
import { adjuntoDe } from "../_bot/adjuntos.js";
import { enTurno, aSolas, juntar } from "../_bot/turnos.js";
import { clasificar, vaPorLaRapida, permitidoEn } from "../_bot/router.js";
import { esCorreccion } from "../_bot/senales.js";
import { viaRapida, eleccionDe, aplicarEleccion, contextoDe } from "../_bot/turno.js";
import { comidaElegida, quiereApuntar } from "../_bot/plato.js";
import { ahoraEnMadrid } from "../_bot/recordatorios.js";
import { fueraDeLimite, contarUso } from "../_bot/uso.js";
import {
  enlacesReceta, enlacesSemana, botonesCompartir, resolverInvitacion,
  recetaEnTexto, semanaEnTexto, copiarReceta, cuentasDeQuien,
} from "../_bot/compartir.js";
import { motor } from "../_bot/menu.js";
import { sembrarCasa } from "../_bot/ajustes.js";
import { enlazarChat, crearCodigo, gastarCodigo, baseDe, confirmarEnlace, casaPropia, idDePersona, codigoDeGrupo, esCodigoDeGrupo } from "../_bot/enlace.js";
import { papelDeQuien } from "../_bot/papel.js";
import { unirsePorInvitacion, ES_INVITACION } from "../_bot/invitacion.js";
import { traducir } from "../_bot/traducir.js";
import { idiomaDe } from "../_bot/papel.js";
import { puede } from "../../src/lib/papeles.js";
import { hoyISO, cargarCasa } from "../_bot/casa.js";
import { puedeBorrar, borrarCuenta, limpiarPantalla } from "../_bot/borrar.js";
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
  // Por dónde llega la petición: el webhook de staging está en su propio
  // dominio (homenu-staging…). Lo usa /borrarme para saber que no es prod.
  const host = String(req.headers["x-forwarded-host"] || req.headers.host || "");
  const chatId = upd.message?.chat?.id ?? upd.callback_query?.message?.chat?.id;
  // Siempre 200: si no, Telegram reintenta el mismo mensaje una y otra vez.
  if (chatId == null) return res.status(200).json({ ok: true });

  // Se contesta a Telegram al momento y se trabaja después (waitUntil): el
  // agente puede tardar varios segundos entre modelo y herramientas, y si el
  // webhook no responde, Telegram reintenta y el mensaje se atendería dos veces.
  waitUntil((async () => {
    try {
      if (upd.callback_query) await pulsado(upd.callback_query, base, host);
      else if (upd.message) await atender(upd.message, base, host);
    } catch (err) {
      console.error("[bot/telegram]", err?.message);
      await enviar(chatId, "Uy, algo ha fallado. Escríbemelo otra vez en un momento, porfa.").catch(() => {});
    }
  })());
  return res.status(200).json({ ok: true });
}

// Cómo se la nombra al empezar una frase: para saber si le hablan a ella
// (NOMBRADA) y para quitárselo antes de pasarle el resto al agente (SIN_NOMBRE).
const NOMBRADA = /^lola\b/i;
const SIN_NOMBRE = /^lola[\s,:;.!¡¿-]*/i;

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
    || NOMBRADA.test(pie);
}

const nombreDe = (from) => [from?.first_name, from?.last_name].filter(Boolean).join(" ") || null;
const esGrupoDe = (chat) => chat.type === "group" || chat.type === "supergroup";

async function atender(msg, base, host = "") {
  const chatId = String(msg.chat.id);
  const esGrupo = esGrupoDe(msg.chat);
  let texto = (msg.text ?? "").trim();
  let oidoDeGrupo = null; // si una nota de voz del grupo ya se transcribió para saber si era para Lola

  // En un grupo: al entrar, se presenta; y solo contesta cuando le hablan a
  // ella (un comando, una mención, una respuesta a un mensaje suyo, o un
  // mensaje que empieza por «Lola»). Para oír lo de «Lola, …» sin mención el
  // bot necesita el modo privacidad apagado (BotFather → /setprivacy).
  if (esGrupo) {
    const yo = (await nombreDelBot().catch(() => "")).toLowerCase();
    if (msg.new_chat_members?.some((m) => m.is_bot && m.username?.toLowerCase() === yo)) return saludoGrupo(chatId);
    if (!meHablan(msg, yo)) {
      // Una nota de voz no lleva texto ni pie: sin escucharla no hay forma de
      // saber si empieza por «Lola». Se transcribe solo para decidir esto; si
      // no es para ella, se tira tal cual (nadie contesta ni queda rastro).
      const audio = !msg.caption && (msg.voice ?? msg.audio);
      if (!audio) return;
      llamar("sendChatAction", { chat_id: chatId, action: "typing" }).catch(() => {});
      const [paraOir] = await select("bot_chats", `channel=eq.telegram&chat_id=${eq(chatId)}`, "household_id");
      oidoDeGrupo = await transcribir(audio, { householdId: paraOir?.household_id }).catch(() => null);
      if (!oidoDeGrupo?.texto || !NOMBRADA.test(oidoDeGrupo.texto.trim())) return;
      // `texto` sigue vacío a propósito: lo de más abajo («Notas de voz») la
      // trata como la nota de voz que es, con su «oído: …», reutilizando esto.
    } else {
      texto = texto.replace(SIN_NOMBRE, "").trim() || texto;
    }
  }

  // /start <código> o, en grupo, /start@HoMenuBot <código>
  const start = texto.match(/^\/start(?:@\w+)?(?:\s+(\S+))?$/);
  // `c123456`: el botón del correo de «ya tengo cuenta» abre Telegram y manda
  // el código solo (la plantilla de Supabase lo pone en el enlace t.me).
  const desdeCorreo = start?.[1]?.match(/^c(\d{6})$/);
  if (desdeCorreo && !esGrupo) return comprobarCodigo(msg, chatId, desdeCorreo[1]);
  // Una invitación a una casa (la asistenta entra sin la app): api/_bot/invitacion.js.
  const invitacion = start?.[1]?.match(ES_INVITACION);
  if (invitacion && !esGrupo) {
    const r = await unirsePorInvitacion({ from: msg.from, chatId, token: invitacion[1], nombre: nombreDe(msg.from) })
      .catch((e) => { console.error("[invitación]", e?.message); return null; });
    return enviar(chatId, r?.texto ?? "No he podido usar esa invitación ahora mismo. Prueba en unos minutos.");
  }
  if (start?.[1] && /^(rc|ru|m)_/.test(start[1]) && !esGrupo) {
    const hecho = await recibirCompartido(chatId, start[1], msg.from);
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
  // `grupo`: el botón de un grupo sin casa abre el privado con esto. Con casa,
  // el enlace para meter a Lola en el grupo; sin ella, primero el alta.
  if (start?.[1] === "grupo" && !esGrupo) {
    const [suyo] = await select("bot_chats", `channel=eq.telegram&chat_id=${eq(chatId)}`, "household_id");
    return suyo ? enlaceGrupo(chatId, false, suyo.household_id, msg.from) : bienvenida(chatId);
  }
  if (start?.[1]) return enlazarDesdeAjustes(msg, chatId, esGrupo, start[1]);

  // Borrar la pantalla del chat (lo de las últimas 48 h: Telegram no deja más):
  // solo para probar, staging y administradores (api/_bot/borrar.js).
  if (/^\/limpiar(?:@\w+)?$/.test(texto) && !esGrupo && puedeBorrar(msg.from?.id, process.env, host)) {
    await limpiarPantalla(chatId, msg.message_id);
    return;
  }
  // Borrar la cuenta entera (api/_bot/borrar.js): cualquiera, en su chat
  // privado, y solo pulsando «Sí» en el aviso. Es su derecho, como «Eliminar
  // cuenta» en la app (Pablo, 2 oct 2026). /borrarme se queda como sinónimo.
  if (/^\/(borrarcuenta|borrarme)(?:@\w+)?$/.test(texto) && !esGrupo) {
    // Si este Telegram está conectado a una cuenta que NO nació aquí, es la
    // de la app (Google o email): se dice, que no parezca una de prueba.
    const [ident] = await select("bot_identities", `channel=eq.telegram&external_id=${eq(msg.from?.id)}`, "user_id").catch(() => []);
    const deLaApp = ident?.user_id && !(await cuentaNacidaAqui(msg.from.id).catch(() => null));
    const ojo = deLaApp ? "\n\n<b>Ojo: es tu cuenta de la app</b>, la que abres con Google o con tu email, no solo lo de Telegram." : "";
    return enviar(chatId, `⚠️ <b>Borrar tu cuenta entera</b>\n\nSe borran tu cuenta de HoMenu (también en la app), tu casa, menús, compra, recetas y despensa, y todo lo que guardo de nuestras charlas. No se puede deshacer.${ojo}`, {
      botones: [[{ texto: "Sí, bórralo todo", dato: "borrar:si" }, { texto: "No", dato: "borrar:no" }]],
    });
  }

  let [chat] = await select("bot_chats", `channel=eq.telegram&chat_id=${eq(chatId)}`, "household_id");

  // Un Telegram que ya es una cuenta (bot_identities) no vuelve a pasar por el
  // alta: se reengancha a su casa. Si no, «somos cuatro» le crearía otra cuenta
  // nacida aquí que pisaría su identidad (enlace.js, apuntarIdentidad).
  if (!chat && !esGrupo) {
    const vuelve = await reconocer(msg.from, chatId).catch(() => null);
    if (vuelve?.varias) return enviar(chatId, "¡Hola de nuevo! Llevas más de una casa en HoMenu: conecta la que quieras desde la app, en Ajustes → Conectar Telegram.");
    if (vuelve) {
      chat = { household_id: vuelve.householdId };
      // /start (o nada que leer) es un saludo; lo demás, /app incluido, se atiende ya.
      if (start || (!texto && !(msg.voice || msg.audio || msg.photo || msg.document))) return holaDeNuevo(chatId, vuelve.householdId);
    }
  }

  if (/^\/app(?:@\w+)?$/.test(texto)) return abrirApp(msg, chatId, esGrupo, base);

  if (!chat) {
    if (esGrupo) return grupoSinCasa(msg, chatId);
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

  if (/^\/grupo(?:@\w+)?$/.test(texto)) return enlaceGrupo(chatId, esGrupo, chat.household_id, msg.from);
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
    // La del filtro de grupo ya se transcribió para saber si era para ella:
    // no se vuelve a pagar Groq por el mismo audio.
    const t = oidoDeGrupo ?? await (async () => {
      llamar("sendChatAction", { chat_id: chatId, action: "typing" }).catch(() => {});
      return transcribir(audio, { householdId: chat.household_id }).catch((e) => ({ error: e?.message }));
    })();
    if (t.error) {
      // Sin esto, «no he podido entender el audio» no dejaba rastro de por qué.
      console.error("[voz]", t.error, { segundos: audio.duration, tipo: audio.mime_type });
      // «No te he oído» solo si de verdad no había nada que oír; un fallo
      // nuestro no es culpa del audio.
      const porque = t.error === "largo" ? "Es un audio muy largo: mándamelo en trozos de menos de dos minutos."
        : t.error === "vacío" ? "No te he oído bien. ¿Me lo repites?"
          : "Ahora mismo no puedo escuchar audios. ¿Me lo escribes?";
      return enviar(chatId, porque, { responderA: esGrupo ? msg.message_id : undefined });
    }
    // Lo que se le dice A ella no lleva su nombre delante; lo que se enseña
    // como «oído: …» sí, tal cual se dijo, para que un error de oído se vea.
    const dicho = t.texto.replace(SIN_NOMBRE, "").trim() || t.texto;
    return enTurno(chatId, itemDe(msg.from, dicho, { oido: t.texto, responderA: esGrupo ? msg.message_id : undefined }),
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
    }), atenderCola({ chatId, householdId: chat.household_id, esGrupo, base }),
    () => enviar(chatId, "Estoy terminando otra cosa en este chat. Mándamela otra vez en un momento, porfa.", {
      responderA: esGrupo ? msg.message_id : undefined,
    }));
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
      // Todos los que escriben en el turno: su papel en la casa es el más bajo.
      desde: items.map((i) => idDePersona(i.from)).filter(Boolean),
      responderA: ultimo.responderA,
      variosAutores: Boolean(variosAutores),
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
//
// En los chats de grupo, además, BOT_ROUTER_GRUPOS (off | sombra | on; por
// defecto sombra): en sombra decide y lo apunta, pero contesta Lola. Qué va
// por la rápida en grupo lo dice la tabla POLITICA de router.js, no un if.
const MODO_ROUTER = () => (["sombra", "on"].includes(process.env.BOT_ROUTER) ? process.env.BOT_ROUTER : "off");
const MODO_ROUTER_GRUPOS = () => (["off", "on"].includes(process.env.BOT_ROUTER_GRUPOS) ? process.env.BOT_ROUTER_GRUPOS : "sombra");
// BOT_PISTA (on | off; por defecto off, ver abajo): con el enrutador en on, si el turno es
// de Lola y el enrutador ha visto una lectura con sus datos, Lola recibe lo
// que dedujo y la lectura ya hecha, para contestar en una llamada
// (api/_bot/pista.js). Medido el 1 oct 2026 con frases que van a Lola: donde
// se usa, una vuelta menos y el primer texto ~1,5-2,5 s antes (ideas en grupo
// de 4-6 s a 2,3-3,2 s; «qué me falta y apúntalo» de 3 vueltas a 2); donde no,
// nada cambia, porque Lola no la espera.
// APAGADA por defecto (BOT_PISTA=on para encenderla): cuando Lola acepta la
// pista contestando sin herramientas, lo leído ya no trae su álbum (el texto
// sale en vivo antes), y en las ideas en grupo eso quita las fotos que hoy sí
// salen. Lo decide Pablo (revisión del 1-2 oct 2026).
const PISTA = () => process.env.BOT_PISTA === "on";
const RUTA = "bot_route";

/** Lo último que dijo Lola en este chat (y su propuesta de opciones, si la hubo). */
async function ultimaDeLola(chatId) {
  // Pregunta y respuesta comparten created_at: el id desempata (memoria.js).
  const filas = await select("bot_messages", `channel=eq.telegram&chat_id=${eq(chatId)}&order=created_at.desc,id.desc&limit=2`, "role,content").catch(() => []);
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

export async function turno({ chatId, householdId, esGrupo, base, texto, oido = null, from, desde = null, responderA, variosAutores = false }) {
  const modo = MODO_ROUTER();
  const modoGrupos = MODO_ROUTER_GRUPOS();
  desde ??= from ? [idDePersona(from)].filter(Boolean) : [];
  // Los turnos que contesta Lola sin pasar por el enrutador (apagado, en
  // sombra, o porque quien escribe eligió inglés) también se apuntan, con sus
  // tiempos y dónde ocurren: antes no dejaban bot_route y eran invisibles al
  // medir, justo los de los grupos con el enrutador apagado (3 oct 2026).
  const soloLola = async (porQue, desdeMs = Date.now()) => {
    const medir = {};
    await conversar({ base, chatId, householdId, esGrupo, texto, oido, from, desde, responderA, medir });
    return apuntarRuta(householdId, {
      chat: String(chatId), esGrupo: Boolean(esGrupo), variosAutores: Boolean(variosAutores),
      modo: "lola", rapida: false, sin_enrutador: porQue, ms: Date.now() - desdeMs, ...medida(medir, {}, desdeMs),
    });
  };
  if (modo === "off" || (esGrupo && modoGrupos === "off")) return soloLola("apagado");
  // En grupo, su propio interruptor: en sombra se decide y se apunta, contesta Lola.
  const sombra = modo === "sombra" || (esGrupo && modoGrupos === "sombra");
  // El papel de quien escribe (api/_bot/papel.js), a la vez que el contexto:
  // la vía rápida tampoco escribe por un lector o por alguien sin cuenta.
  const papelP = papelDeQuien({ householdId, chatId, esGrupo, desde }).catch(() => ({ papel: "ajeno" }));
  const chatDe = { esGrupo, variosAutores, papel: "ajeno" };
  // Quién lo pidió, para decirlo en las respuestas que escriben (en grupo).
  const autor = esGrupo && from ? nombreDe(from) : null;
  const t0 = Date.now();
  // Dónde ocurre el turno, en TODO lo que se apunta de él: para separar
  // privado de grupo al medir (scripts/lib/bot-semana.mjs, porLugar).
  const donde = { chat: String(chatId), esGrupo: Boolean(esGrupo), variosAutores: Boolean(variosAutores) };
  const marca = (que) => process.env.BOT_TIEMPOS && console.log(`[turno] ${que}: ${Date.now() - t0} ms`);
  // Lo último que dijo Lola y la casa (quién hay, si hay menú). Se probó a
  // quitar la casa para ahorrar 0,3 s y el enrutador perdió confianza donde
  // importa: sin saber que hay menú dudaba en «cambia la cena del jueves», y
  // sin saber que hay un bebé mandaba «¿qué le hago al bebé?» a Lola
  // (scripts/router-evals.mjs, 84/92 frente a 135/138).
  // El idioma de quien escribe y el límite del mes se piden YA, a la vez que
  // lo demás: antes iban en fila (el idioma tras el contexto, el límite tras
  // el enrutador), y cada uno era una ida y vuelta a la base que retrasaba al
  // enrutador y a Lola en TODOS los turnos (3 oct 2026).
  const idiomaP = papelP.then((q) => (q.userId ? idiomaDe(q.userId) : null)).catch(() => null);
  const limiteP = fueraDeLimite(householdId).catch(() => null);
  const [ultima, contexto, quien, idioma] = await Promise.all([ultimaDeLola(chatId), contextoDe(householdId), papelP, idiomaP]);
  chatDe.papel = quien.papel;
  // Lo que tarda el turno en estar listo para arrancar al enrutador y a Lola
  // (bot_route contexto_ms): es tiempo que suma al primer texto de todos.
  const contextoMs = Date.now() - t0;
  // Quien eligió inglés: contesta Lola, que traduce. La vía rápida y sus
  // plantillas están en castellano.
  if (idioma === "en") return soloLola("idioma", t0);
  marca("contexto");

  // 0. Estado: contestar a una pregunta de la vía rápida.
  //    · «¿Comida o cena?» (api/_bot/plato.js): con la respuesta se hace lo que
  //      estaba pedido, sin pasar por el enrutador.
  //    · «¿Lo apunto en la compra?» tras «qué me falta»: «Apúntalo» apunta eso.
  const prop = !sombra ? ultima?.propuesta : null;
  if (prop?.tipo === "aclarar" && permitidoEn(prop.modo, chatDe)) {
    const comida = comidaElegida(texto);
    if (comida) {
      const r = await viaRapida({ modo: prop.modo, datos: { ...prop.datos, comida } }, householdId, { autor }).catch(() => null);
      marca("aclaración aplicada");
      if (r) {
        await entregarRapida({ chatId, householdId, esGrupo, base, from, responderA, oido, texto, r });
        return apuntarRuta(householdId, { modo: `aclarar:${prop.modo}`, rapida: true, ms: Date.now() - t0, ...donde });
      }
    }
  }
  if (prop?.tipo === "apuntar" && permitidoEn("compra_anadir", chatDe) && quiereApuntar(texto)) {
    const r = await viaRapida({ modo: "compra_anadir", datos: { productos: prop.productos ?? [] } }, householdId, { autor }).catch(() => null);
    if (r) {
      await entregarRapida({ chatId, householdId, esGrupo, base, from, responderA, oido, texto, r });
      return apuntarRuta(householdId, { modo: "apuntar_falta", rapida: true, ms: Date.now() - t0, ...donde });
    }
  }

  // 0. Estado: elegir una de las opciones que acaba de dar.
  if (!sombra && permitidoEn("eleccion", chatDe) && ultima?.propuesta) {
    const eleccion = eleccionDe(texto, ultima.propuesta);
    if (eleccion) {
      const r = await aplicarEleccion(eleccion, ultima.propuesta, householdId).catch(() => null);
      marca("elección aplicada");
      if (r) {
        await entregarRapida({ chatId, householdId, esGrupo, base, from, responderA, oido, texto, r });
        marca("entregado");
        return apuntarRuta(householdId, { modo: "eleccion", rapida: true, ms: Date.now() - t0, ...donde });
      }
    }
  }

  const decisionP = clasificar({ texto, contexto: { ...contexto, ahora: ahoraEnMadrid(), ultimaDeLola: ultima?.texto ?? null, anteriorDelUsuario: ultima?.anteriorDelUsuario ?? null } });

  if (sombra) {
    decisionP.then((d) => apuntarRuta(householdId, {
      sombra: true, modo: d.modo, confianza: d.confianza, rapida: vaPorLaRapida(d, chatDe), ms: d.ms, error: d.error,
      texto: String(texto).slice(0, 120), datos: d.datos, chat: String(chatId), esGrupo: Boolean(esGrupo), variosAutores: Boolean(variosAutores),
    }));
    // El turno de verdad (el que ve la persona) lo contesta Lola: se mide aparte.
    return soloLola("sombra", t0);
  }

  // on: Lola arranca ya, con la puerta cerrada.
  let abrir;
  const puerta = new Promise((r) => { abrir = r; });
  const ctrl = new AbortController();
  // Lo que se mide del turno (scripts/bot-medidas.mjs): primer texto visto,
  // lo de Lola (modelo, vueltas, tokens, herramientas) y si se canceló.
  const medir = {};
  // La pista (BOT_PISTA): la decisión del enrutador, solo si el turno no va por
  // la vía rápida. Lola no la espera: si llega a tiempo, la usa (pista.js).
  const pista = PISTA() ? decisionP.then((d) => (vaPorLaRapida(d, chatDe) ? null : d)) : null;
  // El aviso de lo que va a tardar, en cuanto el enrutador sabe qué se pide y
  // no cuando Lola llega a llamar a la herramienta (ver avisoDelModo).
  const aviso = decisionP.then((d) => (vaPorLaRapida(d, chatDe) ? null : avisoDelModo(d))).catch(() => null);
  const lola = conversar({ base, chatId, householdId, esGrupo, texto, oido, from, desde, responderA, puerta, signal: ctrl.signal, medir, pista, aviso });

  const d = await decisionP;
  marca(`enrutador (${d.modo} ${d.confianza}, ${d.ms} ms)`);
  // Lo que hace falta para convertir un turno real en un caso de
  // scripts/router-evals.json (scripts/router-feedback.mjs): la frase, lo que
  // acababa de decir Lola, los datos sacados y el chat, para ver qué vino después.
  // `corrige` (api/_bot/senales.js) se apunta ya, sin texto: así sigue
  // midiéndose cuando la retención borre la frase (scripts/bot-semanal.mjs).
  const paraEvals = { texto: String(texto).slice(0, 200), ultima: ultima?.texto ? String(ultima.texto).slice(0, 300) : null, anterior: ultima?.anteriorDelUsuario ?? null, datos: d.datos, chat: String(chatId), esGrupo, variosAutores, corrige: esCorreccion(texto, ultima?.texto) };
  if (vaPorLaRapida(d, chatDe) && !(await limiteP)) {
    // Lo que tarda también por la vía rápida (generar: 3-5 s de motor, medido
    // el 3 oct 2026) avisa igual que con Lola: la frase sale al decidir el
    // enrutador y la plantilla la sustituye en el mismo mensaje.
    const fraseRapida = avisoDelModo(d);
    const vivoRapida = fraseRapida ? mensajeVivo(chatId, { responderA, eco: oido ? `🎙️ «${oido}»

` : "" }) : null;
    const avisadoMs = vivoRapida ? Date.now() - t0 : null;
    vivoRapida?.escribir(fraseRapida, { aviso: true });
    const r = await viaRapida(d, householdId, { autor }).catch((e) => { console.error("[router] vía rápida", e?.message); return null; });
    marca("vía rápida hecha");
    await vivoRapida?.parar();
    // Sin plantilla el turno pasa a Lola, que escribe en su propio mensaje.
    if (!r) await vivoRapida?.quitarAviso();
    if (r) {
      abrir(false);
      ctrl.abort();
      // La plantilla sale YA, sin esperar a que Lola acabe de cancelarse: con
      // la puerta cerrada no puede escribir en el chat ni en la casa, y si
      // estaba en medio de una lectura (una búsqueda, hasta 1,5 s) esa espera
      // se la comía quien solo preguntó «¿qué cenamos?». Se la espera después,
      // para su medida y para no soltar el turno con ella viva.
      const lolaCancelada = lola.catch(() => {});
      await entregarRapida({ chatId, householdId, esGrupo, base, from, responderA, oido, texto, r, vivo: vivoRapida });
      // Si el aviso llegó a salir, eso fue lo primero que se vio (como con Lola).
      const avisado = Boolean(vivoRapida?.id());
      const primer = avisado ? avisadoMs : Date.now() - t0;
      await lolaCancelada;
      await contarUso(householdId, d.uso ?? {}).catch(() => {});
      return apuntarRuta(householdId, { ...paraEvals, modo: d.modo, confianza: d.confianza, rapida: true, ms: Date.now() - t0, router_ms: d.ms, contexto_ms: contextoMs, ...(avisado ? { aviso: HERRAMIENTA_LENTA_DEL_MODO[d.modo] } : {}), ...medida(medir, d, t0, primer) });
    }
  }
  abrir(true);
  // Con el tiempo total del turno de Lola (hasta su respuesta entregada): sin
  // él no había forma de saber cuánto tarda de verdad lo que no es vía rápida.
  await lola.catch(() => {});
  return apuntarRuta(householdId, { ...paraEvals, modo: d.modo, confianza: d.confianza, rapida: false, ms: Date.now() - t0, router_ms: d.ms, contexto_ms: contextoMs, error: d.error, ...medida(medir, d, t0) });
}

/**
 * Lo que se apunta en bot_route para medir un turno, sin texto de nadie (eso
 * lo borra la retención a los 15 días; esto se queda). Tokens y no euros: el
 * precio se aplica al leerlo (scripts/bot-medidas.mjs), así un cambio de
 * tarifa no obliga a reescribir nada.
 */
function medida(medir, d, t0, primer = null) {
  const l = medir.lola;
  return {
    primer_ms: primer ?? (medir.primerTexto ? medir.primerTexto - t0 : null),
    // El aviso por tiempo (AVISO_ESPERA) no cuenta como primer texto: va aparte.
    ...(medir.espera ? { espera_ms: medir.espera - t0 } : {}),
    router_uso: d.uso ? { in: d.uso.input_tokens ?? 0, out: d.uso.output_tokens ?? 0, cr: d.uso.cache_read_input_tokens ?? 0, cw: d.uso.cache_creation_input_tokens ?? 0 } : null,
    lola_cancelada: !!medir.cancelada,
    lola: l ? {
      modelo: l.modelo, planB: !!l.planB, vueltas: l.vueltas ?? null, ms: l.ms, corregido: !!l.corregido,
      uso: l.uso ? { in: l.uso.input_tokens ?? 0, out: l.uso.output_tokens ?? 0, cr: l.uso.cache_read_input_tokens ?? 0, cw: l.uso.cache_creation_input_tokens ?? 0 } : null,
      primera: l.primera ? { in: l.primera.input_tokens, cr: l.primera.cache_read_input_tokens, cw: l.primera.cache_creation_input_tokens } : null,
      herramientas: (l.herramientas ?? []).map((h) => [h.n, h.ms]),
      llamadas: l.llamadas ?? null,
      // BOT_PISTA: qué se adelantó, cuánto tardó y si hubo que cortarla.
      pista: l.pista ?? null,
      // BOT_AVISO_LENTO: la herramienta lenta cuyo aviso salió (primer_ms es entonces el del aviso).
      aviso: l.aviso ?? null,
    } : null,
  };
}

/** Entrega una respuesta de la vía rápida y la deja en la memoria de la charla. */
async function entregarRapida({ chatId, householdId, esGrupo, base, from, responderA, oido, texto, r, vivo = null }) {
  await entregar({ chatId, householdId, esGrupo, base, from, responderA, oido, r: { compartir: null, deshacible: false, ...r }, vivo });
  await recordar({
    chatId, householdId, pregunta: texto, respuesta: r.texto, autor: esGrupo ? nombreDe(from) : null,
    extra: r.propuesta ? { propuesta: r.propuesta, via: "rapida" } : { via: "rapida" },
  });
}

// Qué herramienta lenta acaba usando Lola en cada modo del enrutador: su aviso
// (AVISO_LENTO, agente.js) puede salir antes de que Lola la pida.
const HERRAMIENTA_LENTA_DEL_MODO = { generar: "generar_menu" };
// Por debajo de esto el enrutador duda de qué se pide, y avisar de algo que
// luego no pasa es peor que no avisar.
const CONFIANZA_PARA_AVISAR = 0.7;

/**
 * La frase que puede salir en cuanto el enrutador decide, cuando el turno es de
 * Lola y lo pedido tarda («prepárame el menú de la semana que viene»). Antes
 * esa frase solo salía al arrancar generar_menu, es decir, tras la primera
 * llamada de Lola al modelo: varios segundos con el chat en silencio (Álvaro,
 * 3 oct 2026). Lo que Lola escriba después la sustituye en el mismo mensaje,
 * así que si al final pregunta en vez de generar, no queda rastro.
 * @param {{ modo?: string, confianza?: number }} d  la decisión del enrutador
 * @returns {string | null}
 */
export function avisoDelModo(d) {
  if (process.env.BOT_AVISO_LENTO === "off") return null;
  if (!(Number(d?.confianza) >= CONFIANZA_PARA_AVISAR)) return null;
  const frase = AVISO_LENTO[HERRAMIENTA_LENTA_DEL_MODO[d?.modo]];
  return typeof frase === "string" ? frase : null;
}

// El aviso por tiempo: si a los 3 s Lola no ha puesto nada en pantalla, sale
// esta frase, y lo que escriba después la sustituye en el mismo mensaje. Es
// para los turnos en que el enrutador no sabe qué avisar (varias peticiones
// en un mensaje: `lola` 0,6, y 25 s en silencio el 3 oct 2026). No depende del
// enrutador y no cuenta como primer texto (bot_route espera_ms).
// BOT_AVISO_ESPERA_MS cambia la espera; BOT_AVISO_LENTO=off lo apaga.
export const AVISO_ESPERA = "Dame un momento, que lo miro";
const esperaMs = () => (process.env.BOT_AVISO_LENTO === "off" ? null : Number(process.env.BOT_AVISO_ESPERA_MS) || 3000);

/** Un turno con el agente, venga de un mensaje o de un botón pulsado. */
async function conversar({ chatId, householdId, texto, from, desde = null, esGrupo, responderA, oido = null, adjunto = null, base = null, puerta = null, signal = null, medir = null, pista = null, aviso = null }) {
  await llamar("sendChatAction", { chat_id: chatId, action: "typing" }).catch(() => {});
  const eco = oido ? `🎙️ «${oido}»\n\n` : "";
  const vivo = mensajeVivo(chatId, { responderA, eco });
  // Turno especulativo: lo que Lola va escribiendo no sale hasta que el turno
  // es suyo (puerta → true). Se guarda lo último y se suelta al abrir.
  let pendiente = null;
  let abierta = !puerta;
  // `medir` (de turno()): cuándo vio la persona el primer texto, y lo que midió Lola.
  let algoVisto = false;
  const visto = () => { algoVisto = true; if (medir) medir.primerTexto ??= Date.now(); };
  // Si Lola ya ha escrito algo suyo, el aviso del enrutador llega tarde y sobra.
  let haEscrito = false;
  puerta?.then((suyo) => {
    abierta = suyo;
    if (suyo && pendiente) { visto(); vivo.escribir(...pendiente); }
  });
  // El aviso del enrutador (avisoDelModo): con el turno ya de Lola y sin nada
  // suyo en pantalla, sale al momento. Nunca rompe el turno.
  if (puerta && aviso) {
    Promise.all([puerta, aviso]).then(([suyo, frase]) => {
      if (!suyo || !frase || haEscrito || signal?.aborted) return;
      visto();
      vivo.escribir(frase, { aviso: true });
    }).catch(() => {});
  }
  const alEscribir = (parcial, extra) => {
    haEscrito = true;
    return abierta ? (visto(), vivo.escribir(parcial, extra)) : (pendiente = [parcial, extra]);
  };
  // El aviso por tiempo (AVISO_ESPERA): solo con el turno ya de Lola y sin
  // nada en pantalla, ni suyo ni del aviso del enrutador.
  const tope = esperaMs();
  let contestado = false;
  const reloj = tope == null ? null : setTimeout(() => {
    Promise.resolve(puerta ?? true).then((suyo) => {
      if (!suyo || contestado || algoVisto || haEscrito || signal?.aborted) return;
      if (medir) medir.espera ??= Date.now();
      vivo.escribir(AVISO_ESPERA, { aviso: true });
    }).catch(() => {});
  }, tope);
  let r;
  try {
    // Si vino en audio, Lola lo sabe: los nombres nuevos pueden venir mal oídos
    // y los confirma (conocimiento.md, «Fotos y voz»). En el alta va dentro,
    // para que el mensaje siga empezando por «[alta]».
    const paraLola = !oido ? texto
      : texto.startsWith("[alta]") ? texto.replace("Mi primer mensaje:", "Mi primer mensaje (nota de voz):")
        : `[nota de voz] ${texto}`;
    r = await responder({ chatId, householdId, texto: paraLola, autor: esGrupo ? nombreDe(from) : null, esGrupo, desde: desde ?? (from ? [idDePersona(from)].filter(Boolean) : []), adjunto, alEscribir, puerta, signal, pista }).finally(() => { contestado = true; clearTimeout(reloj); });
    if (puerta && !(await puerta)) { if (medir) { medir.cancelada = true; medir.lola = r?.medida ?? null; } return; } // el turno fue de la vía rápida
  } catch (err) {
    // Cancelada porque el turno era de la vía rápida: nada que decir.
    if (signal?.aborted || (puerta && !(await puerta))) { if (medir) medir.cancelada = true; await vivo.parar(); return; }
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
  const entregado = await entregar({ chatId, householdId, esGrupo, base, from, responderA, oido, r, vivo });
  if (medir) { visto(); medir.lola = r.medida ?? null; }
  // La charla se guarda mientras se entregaba (agente.js `guardado`): se espera
  // aquí, antes de soltar el turno, para que el siguiente mensaje la vea.
  await r.guardado;
  return entregado;
}

/**
 * La respuesta, con todo lo que la acompaña: fotos (un álbum, antes del
 * texto), botones que puso Lola, «Deshacer», el de su pantalla en la app, los
 * de compartir, y el teclado fijo en privado. Sirve igual para
 * lo que contesta Lola que para las respuestas directas (api/_bot/rapido.js).
 * Si el texto ya se estaba escribiendo en vivo, se termina ese mismo mensaje.
 */
export async function entregar({ chatId, householdId, esGrupo, base, from, responderA, oido = null, r, vivo = null }) {
  const { cuerpo: frase, botones: propiosCrudos } = sacarBotones(r.texto);
  // Lo que se ha generado, cambiado o pedido ver, pintado debajo de la frase
  // (api/_bot/pintar.js): el modelo nunca escribe la lista de platos.
  let pintado = "";
  if (r.pintar) {
    const casa = await cargarCasa(householdId).catch(() => null);
    const p = casa ? await pintarMenuEntero(casa, r.pintar).catch(() => null) : null;
    if (p?.texto) {
      pintado = p.texto;
      if (!r.fotos?.length && p.fotos.length) r = { ...r, fotos: p.fotos };
    }
  }
  // Quien eligió inglés (0073): Lola ya contesta en inglés; lo pintado por el
  // código y los pies de las fotos se traducen aquí, en un lote (traducir.js).
  if (r.idioma === "en" && (pintado || r.fotos?.length)) {
    const fotos = r.fotos ?? [];
    const [enIngles, ...pies] = await traducir([pintado, ...fotos.map((f) => f.pie ?? "")], "en");
    pintado = enIngles;
    r = { ...r, fotos: fotos.map((f, i) => ({ ...f, pie: pies[i] })) };
  }
  const cuerpo = pintado ? `${frase}\n\n${pintado}`.trim() : frase;
  // No hay botón de deshacer (decisión de Pablo): [[No es así]] vuelve a Lola
  // como lo que dice, y ella decide (deshacer, o corregir).
  const propios = propiosCrudos?.map((fila) => fila.map((b) => (b.dato === `t:${DESHACER}` ? { ...b, dato: `t:${b.texto}` } : b)));
  const botones = [...(propios ?? [])];
  // Lo que se ha visto o cambiado, en su pantalla de la app (en privado: el
  // enlace abre la app de quien lo pulsa, con su sesión).
  const alPie = [];
  // Todo se abre en la app, en su pantalla (?ir=). En privado el enlace puede
  // llevar la llave de entrada de quien lo pide; en un grupo la pulsaría
  // cualquiera, así que va SIN llave: cada uno entra con su cuenta (quien ya
  // tiene la sesión abierta, directo; si no, inicia sesión y la app le lleva
  // igual a esa pantalla, que ?ir= se guarda en sessionStorage). Pablo, 2 oct
  // 2026: «el inicio de sesión tarda nada».
  if (r.ir && base) {
    alPie.push({ texto: textoBotonApp(r.ir, r.idioma), url: esGrupo ? `${base}/?ir=${encodeURIComponent(r.ir)}` : await enlaceApp(base, r.ir, from, chatId) });
  }
  if (alPie.length) botones.push(alPie);
  if (r.compartir && base) {
    const enlaces = r.compartir.tipo === "semana"
      ? await enlacesSemana(householdId, base).catch((e) => { console.error("[compartir]", e?.message); return null; })
      : await enlacesReceta(householdId, r.compartir.recetaId, base).catch((e) => { console.error("[compartir]", e?.message); return null; });
    if (enlaces) botones.push(...botonesCompartir(enlaces, r.compartir.tipo));
  }
  const eco = oido ? `🎙️ <i>«${escaparHtml(oido)}»</i>\n\n` : "";
  // Si en pantalla solo quedó un aviso de espera y hay fotos, fuera el aviso:
  // así el álbum sale antes del texto, como en un mensaje nuevo.
  // Si el álbum ya salió (con el propio aviso), no se borra ni se repite.
  if (vivo?.provisional() && !vivo.fotosEnviadas() && fotosDelTurno(r.fotos).length) await vivo.quitarAviso();
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
// Con 40 caracteres el primer texto tardaba en salir; con 20 ya hay media
// frase («¡Claro! Te propongo…») y se ve que Lola está en ello.
const MINIMO = 20;
export function mensajeVivo(chatId, { responderA, eco = "" }) {
  let id = null;
  let ultimo = "";
  let ultimaVez = 0;
  let pendiente = null;
  let cadena = Promise.resolve();
  let parado = false;
  let fotosEnviadas = false;
  // Lo que hay en pantalla es un aviso de espera (agente.js AVISO_LENTO), no
  // lo que ha escrito Lola: si después llegan fotos, el aviso se borra y sale
  // el álbum antes del texto, como siempre (un álbum no se mete delante de un
  // mensaje que ya existe).
  let provisional = false;

  const limpiar = (t) => String(t ?? "")
    .replace(/\[\[[^\]\n]*\]\]/g, "")
    .replace(/\[\[[^\]\n]*$/, "")
    .replace(/<[^>]*>?/g, "")
    .trim();

  const quitarAviso = async () => {
    if (!id || !provisional) return;
    // Si Telegram no deja borrarlo, se queda el id y se edita encima: mejor
    // sin álbum que con un aviso huérfano encima de la respuesta.
    const borrado = await llamar("deleteMessage", { chat_id: chatId, message_id: id }).then(() => true, () => false);
    if (!borrado) return;
    id = null;
    provisional = false;
  };

  const volcar = (texto, fotos, aviso = false) => {
    cadena = cadena.then(async () => {
      if (parado || texto === ultimo) return;
      if (provisional && !fotosEnviadas && fotosDelTurno(fotos ?? []).length) await quitarAviso();
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
      provisional = aviso;
    });
    return cadena;
  };

  return {
    id: () => id,
    /** ¿Lo que hay en pantalla es solo un aviso de espera? */
    provisional: () => provisional,
    /** ¿Ya salió un álbum con este mensaje? (entonces no se repite) */
    fotosEnviadas: () => fotosEnviadas,
    /** Borra el aviso de espera (si es lo que hay), para empezar de nuevo con fotos. */
    quitarAviso: () => (cadena = cadena.then(quitarAviso)),
    /**
     * @param {string} parcial  lo escrito hasta ahora en esta vuelta del modelo
     * @param {{ fotos?: object[], aviso?: boolean }} [extra]  aviso: es un aviso de espera
     */
    escribir(parcial, { fotos, aviso = false } = {}) {
      if (parado) return;
      const texto = limpiar(parcial);
      if (texto.length < MINIMO) return;
      clearTimeout(pendiente);
      const espera = Math.max(0, CADA_MS - (Date.now() - ultimaVez));
      pendiente = setTimeout(() => volcar(texto, fotos, aviso), id ? espera : 0);
    },
    async parar() {
      parado = true;
      clearTimeout(pendiente);
      await cadena;
    },
  };
}

/** Lo que dice el botón que lleva a la app, según a qué pantalla lleva. */
const BOTON_APP_EN = { semana: "📅 See the week in the app", compra: "🛒 Open the list in the app", dia: "🍽️ See the day in the app", receta: "📖 See the recipe in the app", recetas: "📚 Open the recipes", otro: "📱 See it in the app" };
export function textoBotonApp(ir, idioma = null) {
  if (idioma === "en") {
    const k = ir === "hoy" || String(ir).startsWith("dia:") ? "dia" : String(ir).startsWith("receta:") ? "receta" : String(ir).startsWith("recetas") ? "recetas" : BOTON_APP_EN[ir] ? ir : "otro";
    return BOTON_APP_EN[k];
  }
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
async function recibirCompartido(chatId, param, from) {
  const [chat] = await select("bot_chats", `channel=eq.telegram&chat_id=${eq(chatId)}`, "household_id");
  const usuarios = await cuentasDeQuien({ fromId: idDePersona(from), householdId: chat?.household_id }).catch(() => []);
  const inv = await resolverInvitacion(param, { usuarios }).catch(() => null);
  if (!inv) return enviar(chatId, "Ese enlace ya no funciona 🙈 Pídele que te lo vuelva a mandar.");
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
  // Guardar una receta en la casa o ponerla en el menú es cambiar la casa.
  const { papel } = await papelDeQuien({ householdId: chat.household_id, chatId, esGrupo: esGrupoDe(cq.message.chat), desde: [idDePersona(cq.from)].filter(Boolean) });
  if (!puede(papel, "editar_casa")) {
    return enviar(chatId, "Guardar recetas o cambiar el menú lo hace quien gestiona la casa: pídeselo a esa persona 🙂");
  }
  const usuarios = await cuentasDeQuien({ fromId: idDePersona(cq.from), householdId: chat.household_id }).catch(() => []);
  const inv = await resolverInvitacion(param, { usuarios }).catch(() => null);
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
    chat ? "" : "Aún no sé de qué casa sois: quien use HoMenu, que me escriba aquí «Lola, conecta el grupo» y lo conecto a su casa.",
  ].filter(Boolean).join("\n\n"), chat ? {} : { botones: await botonAlPrivado() });
}

// ── Un grupo sin casa ──────────────────────────────────────────────────────
// Antes se decía «escríbeme /grupo por privado», sin botón, y se escribía
// /grupo en el grupo una y otra vez (Pablo, 2 oct 2026). Ahora: si quien
// escribe ya lleva una casa con Lola, se conecta aquí con un botón que solo
// puede pulsar esa persona; si no, un botón que abre el privado con el enlace.

/** El botón que abre el chat privado con Lola en el paso de conectar un grupo. */
async function botonAlPrivado() {
  return [[{ texto: "💬 Conectarlo por privado", url: `https://t.me/${await nombreDelBot()}?start=grupo` }]];
}

/**
 * La casa que esta persona LLEVA (dueña o coeditora; no lectora), si es una
 * sola. Por su identidad de Telegram, que solo se crea en privado y con prueba
 * (api/_bot/enlace.js, apuntarIdentidad): un nombre o un grupo no bastan.
 */
async function casaQueLleva(from) {
  const ext = idDePersona(from);
  if (!ext) return null;
  const [ident] = await select("bot_identities", `channel=eq.telegram&external_id=${eq(ext)}`, "user_id");
  if (!ident?.user_id) return null;
  const filas = await select("household_members", `user_id=${eq(ident.user_id)}&role=in.(owner,editor)`, "household_id");
  const casas = [...new Set(filas.map((f) => f.household_id))];
  return casas.length === 1 ? { householdId: casas[0], userId: ident.user_id } : null;
}

/**
 * Quien abre el privado y su Telegram ya es una cuenta: se enlaza este chat a
 * la casa que lleva, sin preguntar si es su primera vez. Solo en SU privado
 * (en Telegram el id del chat privado es el de la persona); la identidad ya
 * tuvo su prueba, así que aquí solo se enlaza el chat (identidad: null).
 * Sin identidad, null: quien llega de fuera es nuevo casi siempre, y quien
 * ya usa la app tiene el botón «Ya uso HoMenu».
 */
async function reconocer(from, chatId) {
  const ext = idDePersona(from);
  if (!ext || ext !== String(chatId)) return null;
  const [ident] = await select("bot_identities", `channel=eq.telegram&external_id=${eq(ext)}`, "user_id");
  if (!ident?.user_id) return null;
  const filas = await select("household_members", `user_id=${eq(ident.user_id)}&role=in.(owner,editor)`, "household_id");
  const casas = [...new Set(filas.map((f) => f.household_id))];
  if (casas.length > 1) return { varias: true };
  // Sin casa que lleve (solo lectora, o se quedó sin ella): el alta de siempre.
  if (!casas.length) return null;
  const casa = { householdId: casas[0], userId: ident.user_id };
  const r = await enlazarChat({
    chatId, kind: "private", householdId: casa.householdId, userId: casa.userId,
    externalId: ext, nombre: nombreDe(from), lang: from?.language_code, identidad: null,
  });
  return r.ok ? casa : null;
}

async function holaDeNuevo(chatId, householdId) {
  const [hogar] = await select("households", `id=${eq(householdId)}`, "name");
  const casa = hogar?.name ? ` Sigo con <b>${escaparHtml(hogar.name)}</b>, como lo dejamos.` : "";
  return enviar(chatId, `¡Hola de nuevo! 👋${casa} Escríbeme o mándame un audio cuando quieras.`, { teclado: TECLADO });
}

async function grupoSinCasa(msg, chatId) {
  const casa = await casaQueLleva(msg.from).catch(() => null);
  if (casa) {
    return enviar(chatId, `${escaparHtml(nombreDe(msg.from) ?? "")}, ¿conecto este grupo a tu casa? Así aquí os enseño vuestro menú y la compra, y me podéis pedir cambios.`, {
      responderA: msg.message_id,
      botones: [[{ texto: "Sí, conectar este grupo", dato: `cg:${msg.from.id}` }]],
    });
  }
  return enviar(chatId, "Este grupo aún no está conectado a ninguna casa. Quien use HoMenu, que pulse aquí: hablamos por privado y le doy el enlace para conectarlo.", {
    botones: await botonAlPrivado(),
  });
}

/** El botón «Sí, conectar este grupo»: solo quien lo pidió, y comprobando otra vez que lleva esa casa. */
async function conectarGrupo(cq, chatId) {
  const casa = await casaQueLleva(cq.from).catch(() => null);
  if (!casa) return enviar(chatId, "No encuentro tu casa. Escríbeme por privado y lo vemos.", { botones: await botonAlPrivado() });
  // El permiso, con la misma regla que /grupo y la app (src/lib/papeles.js).
  const ext = idDePersona(cq.from);
  const { papel, userId } = await papelDeQuien({ householdId: casa.householdId, chatId: ext, esGrupo: false, desde: [ext] });
  if (!puede(papel, "enlazar_grupo") || !userId) {
    return enviar(chatId, "Meterme en el grupo de la familia lo hace quien gestiona la casa: pídeselo a esa persona.");
  }
  const r = await enlazarChat({
    chatId, kind: "group", householdId: casa.householdId, userId,
    externalId: idDePersona(cq.from), nombre: nombreDe(cq.from), lang: cq.from?.language_code, identidad: null,
  });
  if (r.ocupado) return enviar(chatId, "Este chat ya está conectado a otra casa. Solo quien lo conectó puede cambiarlo.");
  return confirmarEnlace(chatId, casa.householdId, true);
}

// /grupo, en privado: el enlace para meter a Lola en el grupo de la familia,
// con un código de un solo uso (el mismo que da la app en Ajustes).
const VALIDEZ_GRUPO_MS = 15 * 60 * 1000;
async function enlaceGrupo(chatId, esGrupo, householdId, from) {
  // En un grupo que ya tiene casa (los que no, van antes a grupoSinCasa).
  if (esGrupo) return enviar(chatId, "Este grupo ya está conectado a vuestra casa. Si quieres meterme en otro grupo, pulsa aquí y te paso el enlace.", { botones: await botonAlPrivado() });
  // Lo pide el titular o un cotitular, y el enlace va firmado con SU cuenta
  // (antes con la del titular: quien lo pulsara quedaba como él).
  const { papel, userId } = await papelDeQuien({ householdId, chatId, esGrupo: false, desde: [idDePersona(from)].filter(Boolean) });
  if (!puede(papel, "enlazar_grupo") || !userId) {
    return enviar(chatId, "Meterme en el grupo de la familia lo hace quien gestiona la casa: pídeselo a esa persona.");
  }
  const token = codigoDeGrupo();
  await insert("bot_link_tokens", [{ token, user_id: userId, household_id: householdId, expires_at: new Date(Date.now() + VALIDEZ_GRUPO_MS).toISOString() }]);
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
// ya está dando el alta. A quien ya conocemos por su Telegram ni se le
// pregunta (reconocer); uno que nunca se ha conectado es nuevo casi siempre, y
// quien ya usa la app entra por «Conecta con Lola» en Inicio (o escribe aquí su
// email: pedirAcceso lo sigue atendiendo, sin botón que lo anuncie).
// A quien prefiere tocar a escribir, un botón secundario: el alta de la app
// (altaEnLaApp). El texto sigue invitando a escribir; el botón es la otra vía.
function bienvenida(chatId) {
  return enviar(chatId, [
    "¡Hola! Soy <b>Lola</b> 👩‍🍳 Te preparo el menú de la semana y la lista de la compra, y te lo cambio cuando quieras.",
    "Para empezar, cuéntame <b>quiénes coméis en casa</b> (y la edad de los peques). Escríbemelo o mándame un audio 🎙️",
    "<i>Lo que me cuentes solo sirve para vuestro menú; no se lo paso a nadie.</i>",
  ].join("\n\n"), {
    botones: [[{ texto: "Prefiero rellenarlo en la app", dato: "alta:app" }]],
  });
}

async function pulsado(cq, base, host = "") {
  const chatId = String(cq.message.chat.id);
  // Conectar un grupo a su casa: solo quien lo pidió (grupoSinCasa).
  const conecta = cq.data?.startsWith("cg:") ? cq.data.slice(3) : null;
  if (conecta && String(cq.from?.id) !== conecta) {
    await llamar("answerCallbackQuery", { callback_query_id: cq.id, text: "Solo puede conectarlo quien lo pidió." }).catch(() => {});
    return;
  }
  await llamar("answerCallbackQuery", { callback_query_id: cq.id }).catch(() => {});
  // Un botón se usa una vez: se quitan los del mensaje pulsado para que no
  // se pulsen luego los viejos (en la primera prueba salieron cinco avisos
  // seguidos de «ya está conectado»).
  await llamar("editMessageReplyMarkup", {
    chat_id: cq.message.chat.id,
    message_id: cq.message.message_id,
    reply_markup: { inline_keyboard: [] },
  }).catch(() => {});
  if (conecta) return conectarGrupo(cq, chatId);
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

  // /limpiar: las mismas dos llaves al pulsar, no solo al pedirlo.
  if (cq.data === "limpiar" && !esGrupoDe(cq.message.chat) && puedeBorrar(cq.from?.id, process.env, host)) {
    await limpiarPantalla(chatId, cq.message.message_id);
    return;
  }
  // Borrar la cuenta: cualquiera, en privado; se borra la cuenta de quien
  // PULSA (por su identidad de Telegram), nunca la de otro (borrar.js).
  if (cq.data?.startsWith("borrar:") && !esGrupoDe(cq.message.chat)) {
    if (cq.data !== "borrar:si") return enviar(chatId, "Vale, no toco nada.");
    const r = await borrarCuenta({ chatId, telegramId: cq.from.id }).catch((e) => {
      console.error("[borrarcuenta]", e?.message);
      return { ok: false, motivo: "algo ha fallado a medias. Vuelve a pedírmelo en un rato, o bórrala desde la app (Ajustes → Eliminar cuenta)" };
    });
    if (!r.ok) return enviar(chatId, `No he borrado la cuenta: ${r.motivo}.`);
    if (r.sinCuenta) return enviar(chatId, "No tenías cuenta conmigo. He borrado lo que guardaba de este chat. Si usas HoMenu en la app con otra cuenta, bórrala allí (Ajustes → Eliminar cuenta).");
    // Con cotitular, la casa no se borra: pasa a esa persona (prepare_account_deletion).
    const casa = r.pasadas ? "Tu casa sigue para quien la llevaba contigo; tu cuenta y lo nuestro, borrados." : "Ya no hay cuenta, ni casa, ni nada guardado de nuestras charlas.";
    const lectores = r.lectores ? `\n\n${r.lectores === 1 ? "La persona que veía tu casa ha perdido" : `Las ${r.lectores} personas que veían tu casa han perdido`} el acceso.` : "";
    return enviar(chatId, `🗑️ <b>Borrado.</b> ${casa}${lectores}\n\nLos mensajes de este chat siguen en tu Telegram: bórralos desde el chat si quieres. Cuando quieras empezar de nuevo, escríbeme.`, {
      ...(puedeBorrar(cq.from?.id, process.env, host) ? { botones: [[{ texto: "Limpiar la pantalla", dato: "limpiar" }]] } : {}),
    });
  }

  if (esGrupoDe(cq.message.chat)) return;
  // Antes que el «ya está conectado»: pulsarlo otra vez (el enlace caducó) da
  // otro enlace. Solo en el privado de quien pulsa: la cuenta es la suya. Y
  // con el chat ya enlazado a una cuenta de la app (Google, email), no: se le
  // crearía otra.
  if (cq.data === "alta:app" && chatId === idDePersona(cq.from) && (!chat || await cuentaNacidaAqui(cq.from.id))) {
    return altaEnLaApp(cq.from, chatId, base);
  }
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
    externalId: idDePersona(msg.from),
    nombre: nombreDe(msg.from),
    lang: msg.from?.language_code,
    identidad: "email",
  });
  if (r.ocupado) return enviar(chatId, "Este chat ya está conectado a otra casa. Solo quien lo conectó puede cambiarlo.");
  return confirmarEnlace(chatId, hogar.id);
}

/**
 * La cuenta nacida en este Telegram (la crea si no la hay), con su casa
 * sembrada y este chat enlazado. Si este Telegram ya creó su cuenta, no se
 * crea otra; y siempre su casa PROPIA, nunca la activa (podría ser una ajena
 * en la que es invitado).
 */
async function cuentaYChat(from, chatId) {
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
    externalId: idDePersona(from),
    nombre: nombreDe(from),
    lang: from.language_code,
    identidad: "nacida",
  });
  await sembrarCasa(cuenta.householdId);
  return cuenta;
}

/**
 * «Prefiero rellenarlo en la app»: la cuenta, y un enlace que entra ya dentro
 * (la llave de /app) directo al alta de la app (`ir=alta`, destinoBot.js). Al
 * acabarla, la app avisa y Lola lo dice aquí (api/bot/link.js).
 */
async function altaEnLaApp(from, chatId, base) {
  const cuenta = await cuentaYChat(from, chatId);
  const codigo = await crearCodigo({ tipo: "entrar", chatId, externalId: from.id, userId: cuenta.userId, minutos: MIN_ENTRAR });
  return enviar(chatId, "¡Genial! Ábrelo aquí y cuéntame quiénes sois desde la app. Cuando acabes, te espero aquí 🙂\n\n<i>El enlace sirve una vez y caduca en 30 minutos.</i>", {
    botones: [[{ texto: "📱 Rellenar en la app", url: `${base}/?entrar=${codigo}&ir=alta` }]],
  });
}

/**
 * @param {{ texto?: string, msg?: object, base?: string }} [primero]  lo primero que escribió
 *   (o el audio / la foto): se atiende como parte del alta, sin hacerle repetir.
 */
async function crearCuenta(from, chatId, primero = {}) {
  const cuenta = await cuentaYChat(from, chatId);

  // El alta sigue aquí mismo, hablando: el agente pregunta lo imprescindible
  // (quiénes, alergias, qué comidas) y propone el primer menú. La app queda
  // para ver, con /app cuando se quiera.
  let texto = primero.texto ?? null;
  let oido = null;
  let adjunto = null;
  const m = primero.msg;
  if (m?.voice || m?.audio) {
    const t = await transcribir(m.voice ?? m.audio, { householdId: cuenta.householdId })
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
  // En un grupo, la app sin llave (cualquiera de dentro recibiría la de otro):
  // cada uno entra con su cuenta. Quien la creó aquí, en Telegram, no tiene
  // email ni contraseña: su llave, por privado.
  if (esGrupo) {
    return enviar(chatId, "Cada uno entra con su cuenta. Si la tuya la creaste aquí conmigo, escríbeme /app por privado y te mando tu entrada.", {
      botones: [[{ texto: "Abrir HoMenu", url: `${base}/` }]],
    });
  }
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
  // El de /grupo lo firma el titular pero lo pide cualquiera con el privado
  // enlazado: usado en un privado, enlazaría ese Telegram a la casa como si
  // fuera el titular. Solo vale para meter a Lola en un grupo.
  if (!esGrupo && esCodigoDeGrupo(token)) {
    if (callado) return null;
    return enviar(chatId, "Ese enlace es para meterme en un grupo: púlsalo y elige el grupo de la familia.");
  }

  // Quien lo firmó sigue en la casa (pudieron quitarle en estos 15 minutos), y
  // un grupo solo lo enlaza el titular o un cotitular.
  const [miembro] = await select("household_members", `household_id=${eq(fila.household_id)}&user_id=${eq(fila.user_id)}`, "role");
  if (!miembro || (esGrupo && !puede(miembro.role, "enlazar_grupo"))) {
    if (callado) return null;
    return enviar(chatId, "Ese enlace ya no vale. Pide otro a quien gestiona la casa.");
  }

  // Marcarlo usado ANTES de enlazar: dos pulsaciones seguidas no enlazan dos veces.
  const usados = await update("bot_link_tokens", `token=${eq(token)}&used_at=is.null`, { used_at: new Date().toISOString() });
  if (!usados?.length) return callado ? null : enviar(chatId, "Ese enlace ya se ha usado. Pide otro desde la app.");

  const r = await enlazarChat({
    chatId,
    kind: esGrupo ? "group" : "private",
    householdId: fila.household_id,
    userId: fila.user_id,
    externalId: idDePersona(msg.from),
    nombre: nombreDe(msg.from),
    lang: msg.from?.language_code,
    // Solo en privado (enlazarChat lo vuelve a mirar): en un grupo, quien
    // pulsa no tiene por qué ser quien sacó el enlace.
    identidad: esGrupo ? null : "ajustes",
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
