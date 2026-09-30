/**
 * Recordatorios desde el chat («recuérdame el domingo a las 7 hacer la compra»).
 *
 * Solo los que el usuario acepta: el agente puede OFRECER uno, pero crearlo
 * exige su sí (api/_bot/conocimiento.md). Se guardan en `bot_reminders` con el
 * chat donde se pidieron, y los manda /api/bot/recordatorios cuando vencen.
 *
 * Las horas se hablan en hora de España; la tabla guarda UTC.
 */

import { select, insert, update, eq } from "./db.js";

const ZONA = "Europe/Madrid";
const MAX_PENDIENTES = 10;

const partesEn = (fecha) => Object.fromEntries(
  new Intl.DateTimeFormat("en-GB", {
    timeZone: ZONA, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(fecha).map((p) => [p.type, p.value]),
);

/** «2026-10-04T19:00» en hora de España → Date (UTC). null si no es válida. */
export function madridAUtc(local) {
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})$/.exec(String(local ?? "").trim());
  if (!m) return null;
  const [, a, mes, d, h, min] = m.map(Number);
  const pretendido = Date.UTC(a, mes - 1, d, h, min);
  // El desfase de España en esa fecha (1 o 2 horas), medido y corregido dos
  // veces para acertar también junto a los cambios de hora.
  let t = pretendido;
  for (let i = 0; i < 2; i++) {
    const p = partesEn(new Date(t));
    const visto = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute);
    t += pretendido - visto;
  }
  return new Date(t);
}

/** «domingo 4 oct, 19:00» */
export const enMadrid = (fecha) => new Intl.DateTimeFormat("es-ES", {
  timeZone: ZONA, weekday: "long", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
}).format(new Date(fecha));

/** La hora de ahora para el agente, que si no la adivina. */
export const ahoraEnMadrid = () => new Intl.DateTimeFormat("es-ES", {
  timeZone: ZONA, weekday: "long", day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit",
}).format(new Date());

export async function crearRecordatorio({ channel, chatId, householdId, autor }, { texto, cuando, repite }) {
  const limpio = String(texto ?? "").trim().slice(0, 300);
  if (!limpio) return "¿Qué quieres que te recuerde?";
  const fecha = madridAUtc(cuando);
  if (!fecha) return `No entiendo la fecha «${cuando}»: dámela como AAAA-MM-DDTHH:MM en hora de España.`;
  if (fecha.getTime() < Date.now() + 60000) return "Esa hora ya ha pasado. ¿Para cuándo lo quieres?";
  if (fecha.getTime() > Date.now() + 366 * 86400000) return "Como mucho, a un año vista.";
  const pendientes = await select("bot_reminders", `chat_id=${eq(chatId)}&status=eq.pending`, "id");
  if (pendientes.length >= MAX_PENDIENTES) return `Ya hay ${MAX_PENDIENTES} recordatorios pendientes en este chat; cancela alguno antes.`;
  await insert("bot_reminders", [{
    channel, chat_id: String(chatId), household_id: householdId, text: limpio,
    due_at: fecha.toISOString(), repite: repite === "diario" || repite === "semanal" ? repite : null,
    created_by: autor ?? null,
  }]);
  const cada = repite === "diario" ? ", y luego cada día" : repite === "semanal" ? ", y luego cada semana" : "";
  return `Recordatorio creado: «${limpio}», el ${enMadrid(fecha)}${cada}.`;
}

export async function verRecordatorios(chatId) {
  const filas = await select("bot_reminders", `chat_id=${eq(chatId)}&status=eq.pending&order=due_at.asc`, "id,text,due_at,repite");
  if (!filas.length) return "No hay recordatorios pendientes en este chat.";
  return filas.map((f) => `- [${f.id}] «${f.text}» el ${enMadrid(f.due_at)}${f.repite ? ` (${f.repite})` : ""}`).join("\n");
}

export async function cancelarRecordatorio(chatId, id) {
  const r = await update("bot_reminders", `id=${eq(id)}&chat_id=${eq(chatId)}&status=eq.pending`, { status: "cancelled" }).catch(() => []);
  return r?.length ? `Cancelado: «${r[0].text}».` : "No encuentro ese recordatorio pendiente en este chat.";
}

/**
 * Manda los vencidos. Cada uno se «reclama» con una escritura condicionada a
 * su due_at, así dos pasadas solapadas no lo mandan dos veces.
 * @param {(r: object) => Promise<void>} mandar
 */
export async function enviarPendientes(mandar) {
  const ahora = new Date().toISOString();
  const vencidos = await select("bot_reminders", `status=eq.pending&due_at=lte.${encodeURIComponent(ahora)}&order=due_at.asc&limit=50`, "*");
  let enviados = 0;
  for (const r of vencidos) {
    const paso = r.repite === "diario" ? 86400000 : r.repite === "semanal" ? 7 * 86400000 : 0;
    let siguiente = Date.parse(r.due_at) + paso;
    // Si estuvo parado, no se manda una vez por cada vuelta perdida.
    while (paso && siguiente <= Date.now()) siguiente += paso;
    const cambios = paso
      ? { due_at: madridMismaHora(r.due_at, siguiente).toISOString(), sent_at: ahora }
      : { status: "sent", sent_at: ahora };
    const reclamado = await update("bot_reminders", `id=${eq(r.id)}&status=eq.pending&due_at=eq.${encodeURIComponent(r.due_at)}`, cambios).catch(() => []);
    if (!reclamado?.length) continue;
    try {
      await mandar(r);
      enviados++;
    } catch (e) {
      console.error("[recordatorios] envío", r.id, e?.message);
    }
  }
  return enviados;
}

// Sumar 24 h o 7 días en UTC mueve la hora una al cruzar el cambio de hora:
// «a las 19:00» tiene que seguir siendo a las 19:00 en España.
function madridMismaHora(original, aprox) {
  const h = partesEn(new Date(original));
  const d = partesEn(new Date(aprox));
  return madridAUtc(`${d.year}-${d.month}-${d.day}T${h.hour}:${h.minute}`) ?? new Date(aprox);
}
