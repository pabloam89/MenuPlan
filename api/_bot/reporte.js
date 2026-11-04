/**
 * /fallo (Pablo, 4 nov 2026): un probador responde a un mensaje malo de Lola con `/fallo` (y, si quiere, lo que
 * esperaba detrás); sin responder a nada, es el último de Lola en el chat. Lola pregunta el tipo con botones de
 * TIPOS_REPORTE; si no dijo qué esperaba, se lo pregunta (una línea, un audio o «Nada más»), y dice «Apuntado 👍». Código, sin modelo ni tokens, y fuera de la charla (bot_messages). Solo para
 * BOT_PROBADORES (ids de Telegram; sin ella, BOT_ADMINS): para los demás, /fallo sigue a Lola como cualquier texto.
 *
 * Sin migración: una fila `bot_reporte` en user_events. Lo que dijo la gente va en `texto`, `ultima`, `anterior` y
 * `chat`, las claves que la retención de 0065 (bot_purgar) quita a los eventos `bot_*` a los 15 días; el tipo, el
 * turno enlazado (ruta_id) y los ids se quedan para contar.
 */

import { select, insert, update, eq } from "./db.js";
import { enviar, editar, llamar } from "./telegram.js";
import { transcribir } from "./voz.js";
import { vigente, CADUCA } from "./caducidades.js";
import { duenoDe } from "./embudo.js";
import { seguirCon, fallaCon } from "./avisar.js";
import { deLaCharla } from "./chats.js";
import { TIPOS_REPORTE, CANAL } from "../../src/lib/vocabularios.js";

export const EVENTO_REPORTE = "bot_reporte";

/** Las etiquetas de los botones (el test exige las mismas claves que TIPOS_REPORTE). */
export const ETIQUETAS_REPORTE = Object.freeze({
  no_entendio: "No me entendió",
  hizo_otra_cosa: "Hizo otra cosa",
  dato_mal: "Dato mal",
  formato: "Formato feo",
  lento: "Lento",
  otro: "Otro",
});

/** En qué paso está un reporte (metadata.paso): falta el tipo, espera lo que se esperaba, o cerrado. */
export const PASO_REPORTE = Object.freeze({ TIPO: "tipo", ESPERA: "espera", HECHO: "hecho" });

/** Cómo se encontró el turno del mensaje (metadata.ruta_enlace): por el id que apuntó (msg_lola), por la hora, o el último del chat. */
export const ENLACE_REPORTE = Object.freeze({ MENSAJE: "mensaje", HORA: "hora", ULTIMO: "ultimo" });

export const APUNTADO = "Apuntado 👍";
/** El id de Telegram de Pablo: quien prueba y administra si no se dice otra cosa (también lo usa borrar.js). */
export const ADMIN_POR_DEFECTO = "491628449";

const PREFIJO = "fallo:";
const NADA = "nada";
// Telegram da la fecha de un mensaje en segundos enteros.
const HOLGURA_MS = 1000;
// Hasta cuándo, tras el mensaje, puede acabar el turno que lo escribió.
const VENTANA_TURNO_MS = 10 * 60000;
const corto = (s, n) => (s == null ? null : String(s).slice(0, n));
const iso = (ms) => encodeURIComponent(new Date(ms).toISOString());

/** Los ids de Telegram de quien prueba: BOT_PROBADORES; sin ella, BOT_ADMINS; sin esa, ADMIN_POR_DEFECTO. */
export function probadores(entorno = process.env) {
  return String(entorno.BOT_PROBADORES || entorno.BOT_ADMINS || ADMIN_POR_DEFECTO).split(",").map((s) => s.trim()).filter(Boolean);
}

export const esProbador = (telegramId, entorno = process.env) => telegramId != null && probadores(entorno).includes(String(telegramId));

/** `/fallo` (o `/fallo@bot`) y lo que venga detrás, o null si el texto no es eso. */
export function comandoFallo(texto) {
  const m = String(texto ?? "").trim().match(/^\/fallo(?:@\w+)?(?:\s+([\s\S]*))?$/i);
  return m ? { texto: m[1]?.trim() || null } : null;
}

export const esBotonReporte = (dato) => String(dato ?? "").startsWith(PREFIJO);
export const datoTipo = (tipo, id) => `${PREFIJO}${tipo}:${id}`;
const datoNada = (id) => `${PREFIJO}${NADA}:${id}`;

/** Lo que dice un botón de /fallo: `{ tipo, id }`, `{ nada: true, id }`, o `{ invalido: true }` (tipo fuera de TIPOS_REPORTE, id no numérico). */
export function leerBoton(dato) {
  if (!esBotonReporte(dato)) return null;
  const [, tipo, id, ...resto] = String(dato).split(":");
  if (resto.length || !/^\d+$/.test(id ?? "")) return { invalido: true };
  if (tipo === NADA) return { nada: true, id };
  return TIPOS_REPORTE.includes(tipo) ? { tipo, id } : { invalido: true };
}

/** Los botones de los tipos, de dos en dos. */
export function botonesTipo(id) {
  const filas = [];
  for (let i = 0; i < TIPOS_REPORTE.length; i += 2) {
    filas.push(TIPOS_REPORTE.slice(i, i + 2).map((t) => ({ texto: ETIQUETAS_REPORTE[t], dato: datoTipo(t, id) })));
  }
  return filas;
}

/**
 * Pura. El turno (fila bot_route) que escribió un mensaje de Lola (`mensaje`: id y fecha en ms), entre las del chat.
 * Primero, la que apuntó ese id (msg_lola); si no, la que lo abarca: empezó (created_at − ms) antes del mensaje y acabó
 * después (se escribe al final del turno); entre varias, la primera en acabar. Las de sombra no contestaron. O null.
 */
export function turnoDelMensaje(filas, { id = null, fechaMs }) {
  const vivas = (filas ?? []).filter((f) => !f.metadata?.sombra);
  const exacta = id != null ? vivas.find((f) => f.metadata?.msg_lola != null && String(f.metadata.msg_lola) === String(id)) : null;
  if (exacta) return { fila: exacta, enlace: ENLACE_REPORTE.MENSAJE };
  const abarcan = vivas
    .map((f) => ({ f, fin: Date.parse(f.created_at), ms: Number(f.metadata?.ms) || 0 }))
    .filter((x) => x.fin >= fechaMs - HOLGURA_MS && x.fin - x.ms <= fechaMs + HOLGURA_MS)
    .sort((a, b) => a.fin - b.fin);
  return abarcan.length ? { fila: abarcan[0].f, enlace: ENLACE_REPORTE.HORA } : null;
}

// Lo de fuera, para probarlo sin red; al llamar y no al cargar, que hay tests que mockean estos módulos a medias.
const IO = () => ({ select, insert, update, enviar, editar, llamar, transcribir, duenoDe });

/** /fallo de un probador: apunta lo reportado (al que responde si es de un bot; si no, lo último de Lola) y pregunta el tipo. */
export async function abrirReporte({ msg, chatId, householdId = null, texto = null }, io = IO()) {
  const chat = String(chatId);
  const resp = msg.reply_to_message?.from?.is_bot ? msg.reply_to_message : null;
  const mensaje = resp ? { id: resp.message_id, fechaMs: resp.date * 1000 } : null;
  const ruta = `event=eq.bot_route&metadata->>sombra=is.null&metadata->>chat=${eq(chat)}`;
  // La pregunta y la respuesta de un turno se guardan juntas al acabarlo
  // (memoria.js): las de ese mensaje son el primer par desde él; sin mensaje, el último par.
  const [rutas, charla] = await Promise.all([
    io.select("user_events", mensaje
      ? `${ruta}&created_at=gte.${iso(mensaje.fechaMs - HOLGURA_MS)}&created_at=lte.${iso(mensaje.fechaMs + VENTANA_TURNO_MS)}&order=created_at.asc&limit=20`
      : `${ruta}&order=created_at.desc&limit=1`, "id,created_at,metadata").catch(fallaCon("reporte_ruta", [])),
    householdId
      ? io.select("bot_messages", `${deLaCharla(CANAL.TELEGRAM, chat, householdId)}&${mensaje
        ? `created_at=gte.${iso(mensaje.fechaMs - HOLGURA_MS)}&order=created_at.asc,id.asc`
        : "order=created_at.desc,id.desc"}&limit=2`, "role,content").catch(fallaCon("reporte_charla", []))
      : [],
  ]);
  const turno = mensaje ? turnoDelMensaje(rutas, mensaje) : rutas[0] ? { fila: rutas[0], enlace: ENLACE_REPORTE.ULTIMO } : null;
  const de = (rol) => charla.find((f) => f.role === rol)?.content?.texto ?? null;
  const reportado = mensaje?.id ?? turno?.fila.metadata?.msg_lola ?? null;
  const metadata = {
    canal: CANAL.TELEGRAM,
    telegram_id: String(msg.from.id),
    quien: msg.from.first_name ?? null,
    chat,
    paso: PASO_REPORTE.TIPO,
    msg_reportado: reportado,
    ruta_id: turno?.fila.id ?? null,
    ruta_enlace: turno?.enlace ?? null,
    ultima: corto(resp ? resp.text ?? resp.caption : de("assistant"), 1500),
    anterior: corto(turno?.fila.metadata?.texto ?? de("user"), 500),
    texto: corto(texto, 500),
  };
  let fila;
  try {
    [fila] = await io.insert("user_events", [{ user_id: householdId ? await io.duenoDe(householdId) : null, event: EVENTO_REPORTE, metadata }]);
  } catch (e) {
    console.error("[reporte] apuntar", e?.message);
  }
  // Sin fila no hay «Apuntado»: se dice.
  if (!fila?.id) return io.enviar(chat, "No he podido apuntar el fallo. Prueba otra vez en un rato.", { responderA: msg.message_id });
  return io.enviar(chat, "¿Qué ha fallado?", { responderA: reportado ?? msg.message_id, botones: botonesTipo(fila.id) });
}

/** Un botón de /fallo: solo el de quien lo abrió, y un tipo fuera de TIPOS_REPORTE no se apunta. @returns {Promise<{ apuntado: boolean, motivo?: string }>} */
export async function pulsarReporte(cq, io = IO(), entorno = process.env) {
  const contestar = (text) => io.llamar("answerCallbackQuery", { callback_query_id: cq.id, ...(text ? { text } : {}) })
    .catch(seguirCon("boton_responder")); // a propósito: contestar al toque es adorno
  const b = leerBoton(cq.data);
  if (!b || b.invalido) { await contestar("Ese botón no lo conozco."); return { apuntado: false, motivo: "fuera_de_lista" }; }
  if (!esProbador(cq.from?.id, entorno)) { await contestar(); return { apuntado: false, motivo: "no_probador" }; }
  const [fila] = await io.select("user_events", `id=eq.${b.id}&event=eq.${EVENTO_REPORTE}`, "id,metadata");
  if (!fila || fila.metadata?.telegram_id !== String(cq.from.id)) {
    await contestar("Este fallo lo apuntó otra persona.");
    return { apuntado: false, motivo: "de_otro" };
  }
  await contestar();
  const [chat, mid] = [cq.message.chat.id, cq.message.message_id];
  // Sin lo que esperaba (ni detrás de /fallo), se pregunta; «Nada más» cierra sin ello.
  const paso = b.nada || fila.metadata?.texto ? PASO_REPORTE.HECHO : PASO_REPORTE.ESPERA;
  await io.update("user_events", `id=eq.${fila.id}`, { metadata: { ...fila.metadata, ...(b.tipo ? { tipo: b.tipo } : {}), paso } });
  if (paso === PASO_REPORTE.HECHO) await io.editar(chat, mid, APUNTADO);
  else await io.editar(chat, mid, `${ETIQUETAS_REPORTE[b.tipo]}. ¿Qué esperabas? Una línea o un audio.`, { botones: [[{ texto: "Nada más", dato: datoNada(fila.id) }]] });
  return { apuntado: true };
}

/**
 * El mensaje de un probador que tiene un reporte esperando en este chat (y sin caducar, CADUCA.REPORTE): es lo que
 * esperaba, en texto o en audio (se transcribe como cualquier nota de voz). true si era eso y ya está contestado.
 */
export async function completarReporte({ msg, chatId, householdId = null }, io = IO(), ahoraMs = Date.now()) {
  const chat = String(chatId);
  const [fila] = await io.select("user_events", `event=eq.${EVENTO_REPORTE}&metadata->>telegram_id=${eq(String(msg.from.id))}&metadata->>chat=${eq(chat)}&metadata->>paso=eq.${PASO_REPORTE.ESPERA}&order=created_at.desc&limit=1`, "id,created_at,metadata")
    .catch(fallaCon("reporte_espera", []));
  if (!fila || !vigente(CADUCA.REPORTE, fila.created_at, ahoraMs)) return false;
  let texto = String(msg.text ?? "").trim();
  const audio = msg.voice ?? msg.audio;
  if (!texto && audio) {
    const t = await io.transcribir(audio, { householdId }).catch((e) => ({ error: e?.message })); // a propósito: el error se apunta abajo
    if (t.error) {
      console.error("[reporte] voz", t.error);
      await io.enviar(chat, "No te he podido oír. ¿Me lo escribes?");
      return true;
    }
    texto = t.texto;
  }
  if (!texto) return false;
  await io.update("user_events", `id=eq.${fila.id}`, { metadata: { ...fila.metadata, texto: corto(texto, 500), paso: PASO_REPORTE.HECHO } });
  await io.enviar(chat, APUNTADO);
  return true;
}
