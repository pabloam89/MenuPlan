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
import { enviar, enviarFotos, llamar, escaparHtml, nombreDelBot, TECLADO } from "../_bot/telegram.js";
import { responder } from "../_bot/agente.js";
import { registrar, EMBUDO, duenoDe } from "../_bot/embudo.js";
import { transcribir } from "../_bot/voz.js";
import { adjuntoDe } from "../_bot/adjuntos.js";
import { sembrarCasa } from "../_bot/ajustes.js";
import { enlazarChat, crearCodigo, gastarCodigo, baseDe, confirmarEnlace, casaPropia } from "../_bot/enlace.js";
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

  // Notas de voz: se transcriben y siguen el camino del texto. La respuesta
  // empieza con lo que se entendió, para que un error de oído se vea.
  const audio = msg.voice ?? msg.audio;
  if (!texto && audio) {
    await llamar("sendChatAction", { chat_id: chatId, action: "typing" }).catch(() => {});
    const t = await transcribir(audio).catch((e) => ({ error: e?.message }));
    if (t.error) {
      const porque = t.error === "largo" ? "Es un audio muy largo: mándamelo en trozos de menos de dos minutos." : "No he podido entender el audio. ¿Me lo escribes?";
      return enviar(chatId, porque, { responderA: esGrupo ? msg.message_id : undefined });
    }
    return conversar({ base,
      chatId, householdId: chat.household_id, texto: t.texto, from: msg.from, esGrupo,
      responderA: esGrupo ? msg.message_id : undefined,
      oido: t.texto,
    });
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
    return conversar({ base,
      chatId, householdId: chat.household_id, from: msg.from, esGrupo, adjunto,
      texto: pie || (adjunto.tipo === "document" ? "(te mando este PDF)" : "(te mando esta foto)"),
      responderA: esGrupo ? msg.message_id : undefined,
    });
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
  // En un grupo le hablan como «@bot …»: la mención no es parte del mensaje.
  const limpio = COMANDOS[comando] ?? DEL_TECLADO[texto] ?? (texto.replace(/@\w+bot\b/gi, "").trim() || texto);
  return conversar({ base, chatId, householdId: chat.household_id, texto: limpio, from: msg.from, esGrupo, responderA: esGrupo ? msg.message_id : undefined });
}

/** Un turno con el agente, venga de un mensaje o de un botón pulsado. */
async function conversar({ chatId, householdId, texto, from, esGrupo, responderA, oido = null, adjunto = null, base = null }) {
  await llamar("sendChatAction", { chat_id: chatId, action: "typing" }).catch(() => {});
  let r;
  try {
    r = await responder({ chatId, householdId, texto, autor: esGrupo ? nombreDe(from) : null, esGrupo, adjunto });
  } catch (err) {
    // Nunca un error técnico en el chat: una frase y, si cabe, reintentar con
    // un toque (el botón vuelve a mandar lo mismo).
    console.error("[bot/telegram] agente", err?.message);
    await registrar(FALLO, { userId: await duenoDe(householdId).catch(() => null), extra: { error: String(err?.message ?? err).slice(0, 300) } });
    const cabe = Buffer.byteLength(`t:${texto}`) <= 64;
    return enviar(chatId, cabe ? "Uy, algo ha fallado. ¿Lo intento otra vez?" : "Uy, algo ha fallado. ¿Me lo escribes otra vez?", {
      responderA,
      ...(cabe ? { botones: [[{ texto: "🔁 Reintentar", dato: `t:${texto}` }]] } : {}),
    });
  }
  const { cuerpo, botones: propios } = sacarBotones(r.texto);
  // Tras un cambio que se puede deshacer, el botón va solo: no hace falta
  // saber decir «deshaz».
  const botones = [...(propios ?? [])];
  // Lo que se ha visto o cambiado, en su pantalla de la app (en privado: el
  // enlace abre la app de quien lo pulsa, con su sesión).
  const alPie = [];
  if (r.deshacible) alPie.push({ texto: "↩️ Deshacer", dato: "t:Deshaz lo último que has cambiado" });
  if (r.ir && base && !esGrupo) alPie.push({ texto: "📱 Verlo en la app", url: await enlaceApp(base, r.ir, from, chatId) });
  if (alPie.length) botones.push(alPie);
  const eco = oido ? `🎙️ <i>«${escaparHtml(oido)}»</i>\n\n` : "";
  // Las fotos de los platos, antes del texto: así los botones quedan abajo.
  if (r.fotos?.length) await enviarFotos(chatId, r.fotos, { responderA });
  return enviar(chatId, eco + cuerpo, { responderA, botones: botones.length ? botones : undefined, ...(esGrupo ? {} : { teclado: TECLADO }) });
}

/**
 * El enlace a una pantalla de la app (?ir=, formato de App.jsx). A quien nació
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
  for (let i = 0; i < validas.length; i += 2) filas.push(validas.slice(i, i + 2).map((o) => ({ texto: o, dato: `t:${o}` })));
  return { cuerpo, botones: filas };
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
    return conversar({ chatId, householdId: chat.household_id, texto: cq.data.slice(2), from: cq.from, esGrupo, base, responderA: esGrupo ? cq.message.message_id : undefined });
  }

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
    const t = await transcribir(m.voice ?? m.audio).catch((e) => ({ error: e?.message }));
    if (!t.error) { texto = t.texto; oido = t.texto; }
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

async function enlazarDesdeAjustes(msg, chatId, esGrupo, token) {
  const [fila] = await select("bot_link_tokens", `token=${eq(token)}`, "token,user_id,household_id,expires_at,used_at");
  if (!fila || fila.used_at || Date.parse(fila.expires_at) < Date.now()) {
    return enviar(chatId, "Ese enlace ya no vale (caduca a los 15 minutos y sirve una sola vez). Pide otro desde la app.");
  }

  // Marcarlo usado ANTES de enlazar: dos pulsaciones seguidas no enlazan dos veces.
  const usados = await update("bot_link_tokens", `token=${eq(token)}&used_at=is.null`, { used_at: new Date().toISOString() });
  if (!usados?.length) return enviar(chatId, "Ese enlace ya se ha usado. Pide otro desde la app.");

  const r = await enlazarChat({
    chatId,
    kind: esGrupo ? "group" : "private",
    householdId: fila.household_id,
    userId: fila.user_id,
    externalId: msg.from?.id,
    nombre: nombreDe(msg.from),
    lang: msg.from?.language_code,
  });
  if (r.ocupado) return enviar(chatId, "Este chat ya está conectado a otra casa. Solo quien lo conectó puede cambiarlo.");
  return confirmarEnlace(chatId, fila.household_id, esGrupo);
}

function secretoValido(recibido) {
  const secreto = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!secreto || typeof recibido !== "string") return false;
  const a = Buffer.from(recibido);
  const b = Buffer.from(secreto);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
