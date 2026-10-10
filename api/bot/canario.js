/**
 * El canario de Lola (#267): comprueba que el camino del bot funciona aunque
 * nadie lo esté usando. Lo llama el vigía (scripts/vigia.mjs) con
 * `Authorization: Bearer <CANARIO_SECRET>`, un secreto solo suyo: el de los
 * crons (BOT_CRON_SECRET) también manda recordatorios a familias.
 *
 *   POST /api/bot/canario?nivel=salud    sin modelo, en cada pasada (gratis)
 *   POST /api/bot/canario?nivel=modelo   un turno de Lola, cada pocas horas,
 *                                         con tope por hora y por día (cuesta)
 *
 * Salud:
 *   - webhook_guardia: el webhook de Telegram de este despliegue rechaza una
 *     llamada sin secreto (401).
 *   - webhook_vivo: con el secreto, contesta 200 a una actualización sin chat
 *     (sale antes de tocar la base: no deja nada).
 *   - webhook_info: Telegram apunta el webhook aquí, sin cola atascada ni
 *     errores recientes (getWebhookInfo).
 *   - base: se lee la casa de prueba (BOT_CANARIO_CASA); sin ella, una casa
 *     que no existe (contesta «no hay», y eso basta para saber que la base
 *     responde).
 *   - via_rapida: «hoy» por la vía rápida, sin modelo (solo con casa de prueba).
 * Modelo: el bucle de Lola de verdad (ejecutar: mismo modelo, instrucciones y
 * herramientas) con una pregunta de solo lectura. Con casa de prueba, su
 * ficha y SOLO las herramientas de lectura; sin ella, una ficha fija y sin
 * herramientas. No pasa por responder(): no guarda la charla ni suma uso.
 *
 * Todo corre en solo lectura (enSoloLectura, api/_bot/db.js): los registros
 * que dejan las herramientas (eventos de búsqueda, de fallo) se callan sin
 * llegar a la base, y cualquier otra escritura se niega y hace fallar el
 * chequeo como `escribio`. No escribe nada en producción.
 *
 * La URL de este despliegue sale del entorno (APP_URL o VERCEL_URL), nunca de
 * las cabeceras de la petición: con ella viaja el secreto del webhook.
 *
 * Contesta 200 si el secreto vale, con cada chequeo y su motivo de los
 * vocabularios cerrados (src/lib/vocabularios.js): nada de la casa, nada de
 * familias. Deja una línea `canario` en el log.
 */

import crypto from "node:crypto";
import { motivoDe } from "../_bot/avisar.js";
import { enSoloLectura } from "../_bot/db.js";
import { llamar } from "../_bot/telegram.js";
import { cargarCasa } from "../_bot/casa.js";
import { respuestaHoy } from "../_bot/rapido.js";
import { globalLimit } from "../_guard.js";
import { VIGIA } from "../../src/lib/vigia.js";

/** Una casa que no existe: leerla prueba que la base contesta sin tocar ninguna familia. */
const CASA_NINGUNA = "00000000-0000-0000-0000-000000000000";

function autorizado(cabecera) {
  const secreto = process.env.CANARIO_SECRET;
  if (!secreto) return false;
  const a = Buffer.from(String(cabecera ?? ""));
  const b = Buffer.from(`Bearer ${secreto}`);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/**
 * Este despliegue, solo del entorno. Los hosts valen para comparar con el
 * webhook de Telegram: el dominio de la app y los que pone Vercel.
 */
export function esteDespliegue(env = process.env) {
  const conEsquema = (h) => (h ? (/^https?:\/\//.test(h) ? h : `https://${h}`).replace(/\/$/, "") : null);
  const base = conEsquema(env.APP_URL) ?? conEsquema(env.VERCEL_URL);
  const hosts = [env.APP_URL, env.VERCEL_URL, env.VERCEL_BRANCH_URL, env.VERCEL_PROJECT_PRODUCTION_URL]
    .map(conEsquema).filter(Boolean).map((u) => new URL(u).host);
  return { base, hosts: [...new Set(hosts)] };
}

/** Corre un chequeo con su reloj y en solo lectura. Un error es un fallo con el motivo de avisar.js. */
async function chequear(chequeo, correr) {
  const t0 = Date.now();
  try {
    const { r: motivo, negadas } = await enSoloLectura(correr);
    const fallo = negadas.length ? "escribio" : motivo;
    return { chequeo, ok: !fallo, ...(fallo ? { motivo: fallo } : {}), ms: Date.now() - t0 };
  } catch (e) { // a propósito: el error es el resultado del chequeo; sale con su motivo en la línea `canario` del log
    return { chequeo, ok: false, motivo: e?.soloLectura ? "escribio" : motivoDe(e), ms: Date.now() - t0 };
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
  let url = null;
  try { url = info?.url ? new URL(info.url) : null; } catch { url = null; } // a propósito: una URL rota es «otra url», abajo
  if (!url || !hosts.includes(url.host) || !/\/api\/bot\/telegram$/.test(url.pathname)) return "webhook_otra_url";
  if ((info.pending_update_count ?? 0) > config.colaMaxima) return "webhook_atascado";
  if (info.last_error_date && ahora - info.last_error_date * 1000 < config.errorRecienteMin * 60_000) return "webhook_con_errores";
  return null;
}

async function salud() {
  const { base, hosts } = esteDespliegue();
  const casa = process.env.BOT_CANARIO_CASA || null;
  const sinBase = async () => "sin_configurar";
  return Promise.all([
    chequear("webhook_guardia", !base ? sinBase : async () => ((await llamarWebhook(base, false)) === 401 ? null : "respuesta_inesperada")),
    chequear("webhook_vivo", !base ? sinBase : async () => {
      const status = await llamarWebhook(base, true);
      return status === 200 ? null : motivoDe({ status });
    }),
    chequear("webhook_info", async () => motivoDelWebhook(await llamar("getWebhookInfo", {}), { hosts })),
    chequear("base", async () => {
      if (casa) return (await cargarCasa(casa, { fresca: true })) ? null : "respuesta_vacia";
      // Sin casa de prueba: por el módulo dueño (casa.js), una casa que no hay.
      return (await cargarCasa(CASA_NINGUNA, { fresca: true })) === null ? null : "respuesta_inesperada";
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

/** La ficha y las herramientas del canario: como lector y solo con lo que lee. */
export async function preparar(casaId, pregunta) {
  const { herramientas, conQuienEscribe, SOLO_LECTURA } = await import("../_bot/agente.js");
  if (!casaId) return { ficha: conQuienEscribe(FICHA_FIJA, "viewer"), tools: [] };
  const { montarFicha } = await import("../_bot/ficha.js");
  const casa = await cargarCasa(casaId, { fresca: true });
  if (!casa) return null;
  // `canario`: el chat no es de nadie; userId null, para que nada se apunte a una persona.
  const chat = { channel: "telegram", chatId: "canario", householdId: casaId, autor: null, adjunto: null, texto: pregunta, fotos: [], ir: null, compartir: null, pintar: null, puerta: null, esGrupo: false, papel: "viewer", userId: null, idioma: null, tareas: [], casaData: casa.state?.data ?? {}, anterior: "", canario: true };
  const tools = (await herramientas(chat)).filter((t) => SOLO_LECTURA.has(t.name));
  return { ficha: conQuienEscribe(montarFicha(casa, { nevera: [], avisos: [] }), "viewer"), tools };
}

async function modelo() {
  const t0 = Date.now();
  const { ejecutar } = await import("../_bot/agente.js");
  const pregunta = VIGIA.canario.pregunta;
  let medida = null;
  const resultado = await chequear("modelo", async () => {
    const listo = await preparar(process.env.BOT_CANARIO_CASA || null, pregunta);
    if (!listo) return "respuesta_vacia";
    const r = await ejecutar({ historia: [], entrada: pregunta, tools: listo.tools, ficha: listo.ficha });
    const u = r.uso ?? {};
    medida = {
      modelo: r.modelo, plan_b: Boolean(r.planB), vueltas: r.vueltas ?? null, corregido: Boolean(r.corregido),
      uso: { in: u.input_tokens ?? 0, out: u.output_tokens ?? 0, cr: u.cache_read_input_tokens ?? 0, cw: u.cache_creation_input_tokens ?? 0 },
    };
    if (String(r.dicho ?? "").trim().length < 10) return "respuesta_vacia";
    if (Date.now() - t0 > VIGIA.canario.lentoMs) return "lento";
    return null;
  });
  return { chequeos: [resultado], medida };
}

/** ¿Cabe otro turno con modelo? Tope por hora y por día, para todos (no por IP). */
async function caboUnTurno() {
  const { topeModeloHora, topeModeloDia } = VIGIA.canario;
  const hora = await globalLimit({ bucket: "canario_modelo_hora", limit: topeModeloHora, windowSec: 3600 });
  if (!hora.ok) return false;
  return (await globalLimit({ bucket: "canario_modelo_dia", limit: topeModeloDia, windowSec: 86400 })).ok;
}

export default async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "POST") return res.status(405).end();
  if (!autorizado(req.headers.authorization)) return res.status(401).end();
  const nivel = req.query?.nivel === "modelo" ? "modelo" : "salud";
  if (nivel === "modelo" && !(await caboUnTurno())) {
    console.log(JSON.stringify({ evento: "canario", nivel, ok: false, fallan: ["modelo:limite"] }));
    return res.status(429).json({ ok: false, nivel, chequeos: [{ chequeo: "modelo", ok: false, motivo: "limite" }] });
  }
  const t0 = Date.now();
  const { chequeos, medida = null } = nivel === "modelo" ? await modelo() : { chequeos: await salud() };
  const ok = chequeos.every((c) => c.ok);
  const cuerpo = { ok, nivel, chequeos, ms: Date.now() - t0, casa_de_prueba: Boolean(process.env.BOT_CANARIO_CASA), ...(medida ?? {}) };
  // Una línea por pasada, para contarlas: sin texto de Lola ni de la casa.
  console.log(JSON.stringify({ evento: "canario", nivel, ok, fallan: chequeos.filter((c) => !c.ok).map((c) => `${c.chequeo}:${c.motivo}`), ms: cuerpo.ms, ...(medida ? { modelo: medida.modelo, plan_b: medida.plan_b, vueltas: medida.vueltas, corregido: medida.corregido, uso: medida.uso } : {}) }));
  return res.status(200).json(cuerpo);
}
