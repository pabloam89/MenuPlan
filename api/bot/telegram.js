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
 *   · «Ya tengo cuenta»: el bot pide el email y Supabase manda el enlace de
 *     acceso; al abrirlo, la app confirma y llama a api/bot/vincular.js.
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
import { select, update, eq } from "../_bot/db.js";
import { enviar, llamar, escaparHtml } from "../_bot/telegram.js";
import { cargarCasa } from "../_bot/casa.js";
import { enlazarChat, crearCodigo, baseDe, confirmarEnlace, casaPropia } from "../_bot/enlace.js";
import { enviarAcceso, crearCuentaTelegram, cuentaNacidaAqui } from "../_bot/cuentas.js";

const EMAIL_RE = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]{2,}$/;
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

  try {
    if (upd.callback_query) await pulsado(upd.callback_query, base);
    else if (upd.message) await atender(upd.message, base);
  } catch (err) {
    console.error("[bot/telegram]", err?.message);
    await enviar(chatId, "Uy, algo ha fallado por mi lado. Prueba otra vez en un momento.").catch(() => {});
  }
  return res.status(200).json({ ok: true });
}

const nombreDe = (from) => [from?.first_name, from?.last_name].filter(Boolean).join(" ") || null;
const esGrupoDe = (chat) => chat.type === "group" || chat.type === "supergroup";

async function atender(msg, base) {
  const chatId = String(msg.chat.id);
  const esGrupo = esGrupoDe(msg.chat);
  const texto = (msg.text ?? "").trim();

  // /start <código> o, en grupo, /start@HoMenuBot <código>
  const start = texto.match(/^\/start(?:@\w+)?(?:\s+(\S+))?$/);
  if (start?.[1]) return enlazarDesdeAjustes(msg, chatId, esGrupo, start[1]);

  const [chat] = await select("bot_chats", `channel=eq.telegram&chat_id=${eq(chatId)}`, "household_id");

  if (/^\/app(?:@\w+)?$/.test(texto)) return abrirApp(msg, chatId, esGrupo, base);

  if (!chat) {
    if (esGrupo) {
      return enviar(chatId, "Este grupo aún no está conectado a ninguna casa. Conéctalo desde la app de HoMenu, en <b>Ajustes → Conectar Telegram</b>.");
    }
    if (EMAIL_RE.test(texto)) return pedirAcceso(msg, chatId, texto.toLowerCase(), base);
    return bienvenida(chatId);
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

function bienvenida(chatId) {
  return enviar(chatId, "¡Hola! Soy <b>HoMenu</b> 👋 Te ayudo con el menú de casa, la compra y las recetas.\n\n¿Ya usas HoMenu?", {
    botones: [[
      { texto: "Ya tengo cuenta", dato: "cuenta:si" },
      { texto: "Soy nuevo", dato: "cuenta:nuevo" },
    ]],
  });
}

async function pulsado(cq, base) {
  const chatId = String(cq.message.chat.id);
  await llamar("answerCallbackQuery", { callback_query_id: cq.id }).catch(() => {});
  if (esGrupoDe(cq.message.chat)) return;

  const [chat] = await select("bot_chats", `channel=eq.telegram&chat_id=${eq(chatId)}`, "household_id");
  if (chat) return enviar(chatId, "Este chat ya está conectado a tu casa. Escríbeme cuando quieras.");

  if (cq.data === "cuenta:si") {
    return enviar(chatId, "Escríbeme el <b>email</b> con el que entras en HoMenu y te mando un enlace para conectarnos.");
  }
  if (cq.data === "cuenta:nuevo") return crearCuenta(cq.from, chatId, base);
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

  const codigo = await crearCodigo({
    tipo: "vincular",
    chatId,
    externalId: msg.from?.id,
    nombre: nombreDe(msg.from),
    minutos: MIN_VINCULAR,
  });
  const r = await enviarAcceso(email, `${base}/?vincular=${codigo}`);
  if (!r.ok && !r.noExiste) {
    console.error("[bot/telegram] enviarAcceso", r.error);
    return enviar(chatId, "No he podido mandarte el correo ahora mismo. Prueba en unos minutos.");
  }
  // La misma respuesta exista o no la cuenta: si no, el bot serviría para
  // averiguar qué emails usan HoMenu.
  return enviar(
    chatId,
    `Si <b>${escaparHtml(email)}</b> tiene cuenta en HoMenu, te acaba de llegar un correo. Ábrelo y pulsa el enlace: entrarás en la app y te pediré confirmar que conectamos este chat con tu casa.\n\n¿No te llega nada? Revisa el email o empieza desde cero:`,
    { botones: [[{ texto: "Soy nuevo", dato: "cuenta:nuevo" }]] },
  );
}

async function crearCuenta(from, chatId, base) {
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

  const codigo = await crearCodigo({ tipo: "entrar", chatId, externalId: from.id, userId: cuenta.userId, minutos: MIN_ENTRAR });
  return enviar(
    chatId,
    "¡Hecho! Ya tienes tu casa en HoMenu 🏡\n\nPara el primer menú necesito conocer a tu familia. De momento eso se hace en la app (muy pronto también por aquí): pulsa el botón y entrarás ya dentro, sin contraseñas.\n\nSi más adelante quieres volver a entrar, escríbeme /app.",
    { botones: [[{ texto: "Abrir HoMenu", url: `${base}/?entrar=${codigo}` }]] },
  );
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

function contarPlatos(plan) {
  let n = 0;
  for (const [grupo, huecos] of Object.entries(plan ?? {})) {
    if (grupo.startsWith("_")) continue;
    for (const h of Object.values(huecos ?? {})) if (h?.recipeId || h?.firstRecipeId) n++;
  }
  return n;
}
