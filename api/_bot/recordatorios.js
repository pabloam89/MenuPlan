/**
 * Recordatorios desde el chat («recuérdame el domingo a las 7 hacer la compra»).
 *
 * Solo los que el usuario acepta: el agente puede OFRECER uno, pero crearlo
 * exige su sí (api/_bot/conocimiento.md). Son tareas de tipo «recordatorio»
 * (bot_tareas, 0122; trozo 34 de #1037: una sola lista de lo pendiente) con el
 * chat donde se pidieron, y los manda /api/bot/recordatorios cuando vencen.
 *
 * Su vida en la tabla: nace `abierta` con `ejecutar_at` y `caduca_at` un día
 * después (la purga de la 0080 caduca lo que no salió a tiempo; el CHECK de la
 * 0122 no deja que caduque antes de su hora). Mandado, `hecha` con `closed_at`;
 * si se repite, sigue abierto con la siguiente hora. Cancelado, `descartada`.
 *
 * Las horas se hablan en hora de España; la tabla guarda UTC.
 */

import { fallaCon } from "./avisar.js";
import { select, insert, update, eq } from "./db.js";
import { paraEscribir, AVISOS_RECORDATORIO, AVISO_RECORDATORIO, REPITES_RECORDATORIO, TIPO_TAREA, ESTADO_TAREA } from "../../src/lib/vocabularios.js";
import { isoDeCasa } from "../../src/lib/dias.js";

const ZONA = "Europe/Madrid";
const MAX_PENDIENTES = 10;
const TABLA = "bot_tareas";
/** Lo que es un recordatorio, y uno pendiente: los filtros de siempre sobre la tabla de tareas. */
const RECORDATORIOS = `tipo=eq.${TIPO_TAREA.RECORDATORIO}`;
const PENDIENTES = `${RECORDATORIOS}&status=eq.${ESTADO_TAREA.ABIERTA}`;
/** Hasta cuándo vale uno que no salió: un día después de su hora (la purga de la 0080 lo caduca). */
const DIA_MS = 86400000;
const caducaTras = (fecha) => new Date(new Date(fecha).getTime() + DIA_MS).toISOString();

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

/** La hora de ahora para el agente, que si no la adivina (las evals pasan otra fecha, #1098). */
export const ahoraEnMadrid = (fecha = new Date()) => new Intl.DateTimeFormat("es-ES", {
  timeZone: ZONA, weekday: "long", day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit",
}).format(fecha);

/**
 * Qué aviso es (bot_tareas.aviso, 0122; AVISOS_RECORDATORIO): «libre» es el texto que alguien pidió y se manda tal
 * cual; «vispera» se monta al vencer con el menú de mañana (vispera.js).
 */
export async function crearRecordatorio({ channel, chatId, householdId }, { texto, cuando, repite, aviso = AVISO_RECORDATORIO.LIBRE }) {
  if (!AVISOS_RECORDATORIO.includes(aviso)) throw new Error(`aviso de recordatorio desconocido: ${aviso}`);
  // Una tarea es de una casa (bot_tareas.household_id not null): un chat sin casa no tiene dónde guardarlo.
  if (!householdId) return "Para guardarte recordatorios, conecta antes este chat a tu casa desde la app.";
  const limpio = String(texto ?? "").trim().slice(0, 300);
  if (!limpio) return "¿Qué quieres que te recuerde?";
  const fecha = madridAUtc(cuando);
  if (!fecha) return `No entiendo la fecha «${cuando}»: dámela como AAAA-MM-DDTHH:MM en hora de España.`;
  if (fecha.getTime() < Date.now() + 60000) return "Esa hora ya ha pasado. ¿Para cuándo lo quieres?";
  if (fecha.getTime() > Date.now() + 366 * 86400000) return "Como mucho, a un año vista.";
  const pendientes = await select(TABLA, `chat_id=${eq(chatId)}&${PENDIENTES}`, "id");
  if (pendientes.length >= MAX_PENDIENTES) return `Ya hay ${MAX_PENDIENTES} recordatorios pendientes en este chat; cancela alguno antes.`;
  const cadaCuanto = REPITES_RECORDATORIO.includes(repite) ? repite : null;
  await insert(TABLA, [{
    channel: paraEscribir("canales", channel), chat_id: String(chatId), household_id: householdId, texto: limpio,
    tipo: TIPO_TAREA.RECORDATORIO, aviso, ejecutar_at: fecha.toISOString(), caduca_at: caducaTras(fecha), repite: cadaCuanto,
    // Sin created_by: el de bot_reminders guardaba el nombre de Telegram de quien lo pidió y nadie lo leía.
  }]);
  const cada = cadaCuanto === "diario" ? ", y luego cada día" : cadaCuanto === "semanal" ? ", y luego cada semana" : "";
  return `Recordatorio creado: «${limpio}», el ${enMadrid(fecha)}${cada}.`;
}

export async function verRecordatorios(chatId) {
  const filas = await select(TABLA, `chat_id=${eq(chatId)}&${PENDIENTES}&order=ejecutar_at.asc`, "id,texto,ejecutar_at,repite");
  if (!filas.length) return "No hay recordatorios pendientes en este chat.";
  return filas.map((f) => `- [${f.id}] «${f.texto}» el ${enMadrid(f.ejecutar_at)}${f.repite ? ` (${f.repite})` : ""}`).join("\n");
}

export async function cancelarRecordatorio(chatId, id) {
  // Un fallo de la base no es «no lo encuentro»: lo segundo hace que Lola diga
  // que no existe uno que sigue pendiente y va a sonar.
  let r;
  try {
    const ahora = new Date().toISOString();
    r = await update(TABLA, `id=${eq(id)}&chat_id=${eq(chatId)}&${PENDIENTES}`, { status: ESTADO_TAREA.DESCARTADA, closed_at: ahora, updated_at: ahora });
  } catch (e) {
    console.error("[recordatorios] cancelar", e?.message);
    return "NO CANCELADO: no he podido cancelarlo ahora, sigue pendiente. Se puede volver a intentar.";
  }
  return r?.length ? `Cancelado: «${r[0].texto}».` : "No encuentro ese recordatorio pendiente en este chat.";
}

// Un envío que falla se suelta para la pasada siguiente, salvo si Telegram dice
// que no tiene arreglo (bot expulsado o bloqueado, chat que no existe) o si el
// recordatorio ya lleva tanto vencido que llegaría a destiempo (#958).
const REINTENTAR_HASTA_MS = 6 * 3600000;
const sinArreglo = (e) => [400, 403].includes(Number(e?.status));

/**
 * Manda los vencidos. Cada uno se «reclama» con una escritura condicionada a
 * su ejecutar_at, así dos pasadas solapadas no lo mandan dos veces. Si el envío
 * falla, se devuelve como estaba (condicionado a lo que escribió el reclamo):
 * antes quedaba marcado como enviado y se perdía para siempre (#958).
 * @param {(r: object) => Promise<void>} mandar
 */
export async function enviarPendientes(mandar, ahoraMs = Date.now()) {
  const ahora = new Date(ahoraMs).toISOString();
  const vencidos = await select(TABLA, `${PENDIENTES}&ejecutar_at=lte.${encodeURIComponent(ahora)}&order=ejecutar_at.asc&limit=50`, "id,channel,chat_id,household_id,texto,aviso,ejecutar_at,repite,caduca_at");
  let enviados = 0;
  for (const r of vencidos) {
    const siguiente = siguienteVez(r.ejecutar_at, r.repite, ahoraMs);
    const cambios = siguiente
      ? { ejecutar_at: siguiente.toISOString(), caduca_at: caducaTras(siguiente), updated_at: ahora }
      : { status: ESTADO_TAREA.HECHA, closed_at: ahora, updated_at: ahora };
    const reclamado = await update(TABLA, `id=${eq(r.id)}&${PENDIENTES}&ejecutar_at=eq.${encodeURIComponent(r.ejecutar_at)}`, cambios).catch(fallaCon("recordatorios_reclamar", []));
    if (!reclamado?.length) continue;
    try {
      await mandar(r);
      enviados++;
    } catch (e) {
      console.error("[recordatorios] envío", r.id, e?.message);
      if (sinArreglo(e) || ahoraMs - Date.parse(r.ejecutar_at) > REINTENTAR_HASTA_MS) continue;
      // Solo si nadie lo ha tocado desde el reclamo (cancelado entretanto, otra pasada).
      const reclamo = siguiente
        ? `id=${eq(r.id)}&${PENDIENTES}&ejecutar_at=eq.${encodeURIComponent(cambios.ejecutar_at)}`
        : `id=${eq(r.id)}&${RECORDATORIOS}&status=eq.${ESTADO_TAREA.HECHA}&closed_at=eq.${encodeURIComponent(ahora)}`;
      await update(TABLA, reclamo, { status: ESTADO_TAREA.ABIERTA, closed_at: null, ejecutar_at: r.ejecutar_at, caduca_at: r.caduca_at, updated_at: ahora })
        .catch(fallaCon("recordatorios_soltar", []));
    }
  }
  return enviados;
}

/** «AAAA-MM-DD» + n días, en calendario (sin horas: no le afecta el cambio de hora). */
function masDias(iso, n) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  // Las 12:00 UTC leídas en UTC: el mismo día del calendario.
  return isoDeCasa({ ahora: d, zona: "UTC" });
}

/**
 * La siguiente vez de uno que se repite, a la misma hora de España, o null si
 * no se repite. Se cuenta en DÍAS del calendario de Madrid, no en horas: antes
 * se sumaban 24 h en UTC y se volvía a leer el día, y en la noche del cambio de
 * hora de octubre uno de entre las 00:00 y las 00:59 caía en el mismo due_at y
 * se mandaba en cada pasada del cron durante un día; en marzo se saltaba uno (#958).
 * Si estuvo parado, no se manda una vez por cada vuelta perdida. Pura.
 */
export function siguienteVez(dueAt, repite, ahoraMs = Date.now()) {
  const dias = repite === "diario" ? 1 : repite === "semanal" ? 7 : 0;
  if (!dias) return null;
  const p = partesEn(new Date(dueAt));
  const hora = `${p.hour}:${p.minute}`;
  const antes = Date.parse(dueAt);
  let dia = `${p.year}-${p.month}-${p.day}`;
  for (let i = 0; i < 800; i++) {
    dia = masDias(dia, dias);
    const t = madridAUtc(`${dia}T${hora}`);
    // Siempre hacia delante: una hora que no existe (las 02:30 del día del
    // cambio de marzo) no puede devolver una fecha igual o anterior.
    if (t && t.getTime() > antes && t.getTime() > ahoraMs) return t;
  }
  return null;
}
