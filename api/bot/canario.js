/**
 * El canario de Lola (#267): comprueba que el camino del bot funciona aunque
 * nadie lo esté usando. Lo llama el vigía (scripts/vigia.mjs) con
 * `Authorization: Bearer <BOT_CRON_SECRET>`, como el cron de recordatorios.
 *
 *   POST /api/bot/canario?nivel=salud    sin modelo, en cada pasada (gratis)
 *   POST /api/bot/canario?nivel=modelo   un turno de Lola, cada pocas horas
 *
 * Salud:
 *   - webhook_guardia: el webhook de Telegram de este despliegue rechaza una
 *     llamada sin secreto (401).
 *   - webhook_vivo: con el secreto, contesta 200 a una actualización sin chat
 *     (sale antes de tocar la base: no deja nada).
 *   - webhook_info: Telegram apunta el webhook aquí, sin cola atascada ni
 *     errores recientes (getWebhookInfo).
 *   - base: se lee la casa de prueba (BOT_CANARIO_CASA); sin ella, una
 *     consulta vacía a la base.
 *   - via_rapida: «hoy» por la vía rápida, sin modelo (solo con casa de prueba).
 * Modelo: el bucle de Lola de verdad (ejecutar: mismo modelo, instrucciones y
 * herramientas) con una pregunta de solo lectura. Con casa de prueba, su
 * ficha y SOLO las herramientas de lectura; sin ella, una ficha fija y sin
 * herramientas. Comprueba que contesta, a tiempo y sin escribir nada en la
 * base (contandoEscrituras). No pasa por responder(): no guarda la charla ni
 * suma uso a la casa, y por eso no deja basura.
 *
 * Contesta siempre 200 si el secreto vale, con cada chequeo y su motivo de
 * los vocabularios cerrados (src/lib/vocabularios.js): nada de la casa, nada
 * de familias. Deja una línea `canario` en el log.
 */

import crypto from "node:crypto";
import { motivoDe } from "../_bot/avisar.js";
import { select } from "../_bot/db.js";
import { llamar } from "../_bot/telegram.js";
import { baseDe } from "../_bot/enlace.js";
import { cargarCasa } from "../_bot/casa.js";
import { respuestaHoy } from "../_bot/rapido.js";
import { VIGIA } from "../../src/lib/vigia.js";

function autorizado(cabecera) {
  const secreto = process.env.BOT_CRON_SECRET || process.env.CRON_SECRET;
  if (!secreto) return false;
  const a = Buffer.from(String(cabecera ?? ""));
  const b = Buffer.from(`Bearer ${secreto}`);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** Corre un chequeo con su reloj. Un error es un fallo con el motivo de avisar.js. */
async function chequear(chequeo, correr) {
  const t0 = Date.now();
  try {
    const motivo = await correr();
    return { chequeo, ok: !motivo, ...(motivo ? { motivo } : {}), ms: Date.now() - t0 };
  } catch (e) { // a propósito: el error es el resultado del chequeo; sale con su motivo en la línea `canario` del log
    return { chequeo, ok: false, motivo: motivoDe(e), ms: Date.now() - t0 };
  }
}

const conPlazo = (ms) => AbortSignal.timeout(ms);

/** El webhook de este despliegue, llamado como lo llamaría Telegram. */
async function llamarWebhook(base, conSecreto) {
  const headers = { "Content-Type": "application/json" };
  if (conSecreto) headers["X-Telegram-Bot-Api-Secret-Token"] = process.env.TELEGRAM_WEBHOOK_SECRET ?? "";
  // Sin `message` ni `callback_query`: el webhook contesta 200 sin abrir la base.
  const res = await fetch(`${base}/api/bot/telegram`, { method: "POST", headers, body: JSON.stringify({ update_id: 0 }), signal: conPlazo(10_000) });
  return res.status;
}

/**
 * Lo que dice Telegram del webhook, en un motivo o null si está bien. Pura,
 * para el test. `hosts`: los nombres con que se llega a este despliegue.
 */
export function motivoDelWebhook(info, { hosts = [], ahora = Date.now(), config = VIGIA.canario } = {}) {
  let host = null;
  try { host = info?.url ? new URL(info.url).host : null; } catch { host = null; } // a propósito: una URL rota es «otra url», abajo
  if (!host || !hosts.includes(host) || !/\/api\/bot\/telegram$/.test(new URL(info.url).pathname)) return "webhook_otra_url";
  if ((info.pending_update_count ?? 0) > config.colaMaxima) return "webhook_atascado";
  if (info.last_error_date && ahora - info.last_error_date * 1000 < config.errorRecienteMin * 60_000) return "webhook_con_errores";
  return null;
}

async function salud(req) {
  const base = baseDe(req);
  const hosts = [...new Set([new URL(base).host, req.headers["x-forwarded-host"], req.headers.host].filter(Boolean).map(String))];
  const casa = process.env.BOT_CANARIO_CASA || null;
  return Promise.all([
    chequear("webhook_guardia", async () => ((await llamarWebhook(base, false)) === 401 ? null : "respuesta_inesperada")),
    chequear("webhook_vivo", async () => {
      const status = await llamarWebhook(base, true);
      return status === 200 ? null : motivoDe({ status });
    }),
    chequear("webhook_info", async () => motivoDelWebhook(await llamar("getWebhookInfo", {}), { hosts })),
    chequear("base", async () => {
      if (casa) return (await cargarCasa(casa, { fresca: true })) ? null : "respuesta_vacia";
      // Sin casa de prueba: que la base conteste, sin leer ninguna fila.
      return Array.isArray(await select("households", "limit=0", "id")) ? null : "respuesta_inesperada";
    }),
    ...(casa ? [chequear("via_rapida", async () => {
      // Sin menú de hoy devuelve null, y también vale: lo que se mira es que el camino no rompa.
      const r = await respuestaHoy(casa);
      return r === null || (typeof r?.texto === "string" && r.texto.trim()) ? null : "respuesta_vacia";
    })] : []),
  ]);
}

/** La ficha fija sin casa de prueba: la familia de ejemplo de scripts/bot-evals.mjs, sin menú. */
const FICHA_FIJA = {
  estable: ["SEGURIDAD", "- Ana, Pablo, Leo: ninguna.", "CASA", "- Ana 38 · Pablo 40 · Leo 6.", "- Todos comen lo mismo."].join("\n"),
  delDia: "MENÚ: no hay menú esta semana.",
};

async function modelo() {
  const t0 = Date.now();
  const { ejecutar, herramientas, conQuienEscribe, SOLO_LECTURA } = await import("../_bot/agente.js");
  const { montarFicha } = await import("../_bot/ficha.js");
  const { contandoEscrituras } = await import("../_bot/db.js");
  const casaId = process.env.BOT_CANARIO_CASA || null;
  const pregunta = VIGIA.canario.pregunta;
  let medida = null;
  const resultado = await chequear("modelo", async () => {
    let ficha = conQuienEscribe(FICHA_FIJA, "viewer");
    let tools = [];
    if (casaId) {
      const casa = await cargarCasa(casaId, { fresca: true });
      if (!casa) return "respuesta_vacia";
      // Como lector y solo con lo que lee: el canario no puede cambiar nada.
      const chat = { channel: "telegram", chatId: "canario", householdId: casaId, autor: null, adjunto: null, texto: pregunta, fotos: [], ir: null, compartir: null, pintar: null, puerta: null, esGrupo: false, papel: "viewer", userId: null, idioma: null, tareas: [], casaData: casa.state?.data ?? {}, anterior: "" };
      tools = (await herramientas(chat)).filter((t) => SOLO_LECTURA.has(t.name));
      ficha = conQuienEscribe(montarFicha(casa, { nevera: [], avisos: [] }), "viewer");
    }
    const { r, escribio } = await contandoEscrituras(() => ejecutar({ historia: [], entrada: pregunta, tools, ficha }));
    const u = r.uso ?? {};
    medida = {
      modelo: r.modelo, plan_b: Boolean(r.planB), vueltas: r.vueltas ?? null, corregido: Boolean(r.corregido),
      uso: { in: u.input_tokens ?? 0, out: u.output_tokens ?? 0, cr: u.cache_read_input_tokens ?? 0, cw: u.cache_creation_input_tokens ?? 0 },
    };
    if (escribio) return "escribio";
    if (String(r.dicho ?? "").trim().length < 10) return "respuesta_vacia";
    if (Date.now() - t0 > VIGIA.canario.lentoMs) return "lento";
    return null;
  });
  return { chequeos: [resultado], medida };
}

export default async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "POST") return res.status(405).end();
  if (!autorizado(req.headers.authorization)) return res.status(401).end();
  const nivel = req.query?.nivel === "modelo" ? "modelo" : "salud";
  const t0 = Date.now();
  const { chequeos, medida = null } = nivel === "modelo" ? await modelo() : { chequeos: await salud(req) };
  const ok = chequeos.every((c) => c.ok);
  const cuerpo = { ok, nivel, chequeos, ms: Date.now() - t0, casa_de_prueba: Boolean(process.env.BOT_CANARIO_CASA), ...(medida ?? {}) };
  // Una línea por pasada, para contarlas: sin texto de Lola ni de la casa.
  console.log(JSON.stringify({ evento: "canario", nivel, ok, fallan: chequeos.filter((c) => !c.ok).map((c) => `${c.chequeo}:${c.motivo}`), ms: cuerpo.ms, ...(medida ? { modelo: medida.modelo, plan_b: medida.plan_b, vueltas: medida.vueltas, corregido: medida.corregido, uso: medida.uso } : {}) }));
  return res.status(200).json(cuerpo);
}
