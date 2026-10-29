/**
 * Qué semana se genera cuando piden un menú (#905, #907).
 *
 * Antes «la siguiente» era siempre el lunes que viene: un sábado con la semana
 * del 26 ya hecha, «genérame la siguiente semana» rehacía la del 26 en silencio
 * y «a partir del 2 de noviembre» no se podía pedir. Ahora:
 *   · «siguiente» = la primera semana SIN menú a partir del lunes que viene;
 *   · `desde` = la semana de esa fecha (hasta TOPE_SEMANAS por delante);
 *   · una semana que ya tiene menú solo se rehace con `rehacer` explícito;
 *   · rehacer la semana en curso empieza MAÑANA y deja hoy y lo pasado como
 *     estaban (decisión de Álvaro, 24 oct 2026).
 * Puro: sin base ni motor, para probarlo.
 */

import { indiceDeISO, isoDeCasa, MESES_CORTOS } from "../../src/lib/dias.js";
import { leerBotonRehacer, textoRehacer } from "./botones.js";

export const TOPE_SEMANAS = 8;

const DIA_MS = 86400000;
const aFecha = (iso) => new Date(`${iso}T12:00:00Z`);
// A mediodía UTC la fecha de Madrid es la misma: se pasa por isoDeCasa, sin calcularla a mano.
const aISO = (f) => isoDeCasa({ ahora: f });
export const sumarDias = (iso, n) => aISO(new Date(aFecha(iso).getTime() + n * DIA_MS));
export const lunesDe = (iso) => sumarDias(iso, -indiceDeISO(iso));
export const fechaCorta = (iso) => `${Number(iso.slice(8, 10))} ${MESES_CORTOS[Number(iso.slice(5, 7)) - 1]}`;

const MESES_LARGOS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const diaYMes = (iso) => `${Number(iso.slice(8, 10))} de ${MESES_LARGOS[Number(iso.slice(5, 7)) - 1]}`;
/** «1 al 4 de octubre», «28 de septiembre al 4 de octubre». Pura, para el test. */
export const rangoDeFechas = (a, b) => (a.slice(0, 7) === b.slice(0, 7) ? `${Number(a.slice(8, 10))} al ${diaYMes(b)}` : `${diaYMes(a)} al ${diaYMes(b)}`);

/** La semana del menú (de las que no han pasado) que cae entre ese lunes y su domingo. */
export function semanaConMenu(semanas, lunes, hoy) {
  const domingo = sumarDias(lunes, 6);
  return (semanas ?? []).find((w) => w.weekEnd >= hoy && w.weekStart <= domingo && w.weekEnd >= lunes) ?? null;
}

/**
 * @param {{ cual?: "esta"|"siguiente", desde?: string|null, rehacer?: boolean, semanas?: object[], hoy: string }} p
 * @returns {{ offset: number, startDayIdx: number, existente: object|null } | { aviso: string }}
 *   `aviso`: no se genera nada; es el texto para Lola (o la vía rápida pasa a Lola).
 */
export function resolverSemana({ cual = "esta", desde = null, rehacer = false, semanas = [], hoy }) {
  const lunesHoy = lunesDe(hoy);
  const indiceHoy = indiceDeISO(hoy);
  let offset;
  if (desde) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(desde))) return { aviso: `Fecha no válida (${desde}): pásala como AAAA-MM-DD.` };
    offset = Math.round((aFecha(lunesDe(desde)) - aFecha(lunesHoy)) / (7 * DIA_MS));
    if (offset < 0) return { aviso: `La semana del ${fechaCorta(lunesDe(desde))} ya ha pasado: no se genera.` };
    if (offset > TOPE_SEMANAS) return { aviso: `Solo genero hasta ${TOPE_SEMANAS} semanas por delante; la del ${fechaCorta(lunesDe(desde))} queda más lejos.` };
  } else if (cual === "siguiente") {
    offset = null;
    for (let o = 1; o <= TOPE_SEMANAS; o++) {
      if (!semanaConMenu(semanas, sumarDias(lunesHoy, 7 * o), hoy)) { offset = o; break; }
    }
    if (offset == null) return { aviso: `Ya hay menú para las próximas ${TOPE_SEMANAS} semanas: no hay ninguna libre que generar.` };
  } else {
    offset = 0;
  }
  const lunes = sumarDias(lunesHoy, 7 * offset);
  const existente = semanaConMenu(semanas, lunes, hoy);
  if (existente && !rehacer) {
    const libre = resolverSemana({ cual: "siguiente", semanas, hoy });
    const otra = libre.aviso ? "" : ` o generar la del ${fechaCorta(sumarDias(lunesHoy, 7 * libre.offset))}`;
    return { aviso: `YA HAY MENÚ del ${existente.weekStart} al ${existente.weekEnd}: NO lo he rehecho ni he cambiado nada. Pregunta si quieren rehacer esa (generar_menu con rehacer: true)${otra}.` };
  }
  if (offset > 0) return { offset, startDayIdx: 0, existente };
  // La semana en curso: si se rehace, desde mañana; hoy y lo pasado no se tocan.
  const startDayIdx = existente ? indiceHoy + 1 : indiceHoy;
  if (startDayIdx > 6) return { aviso: "De esta semana solo queda hoy, y lo de hoy no se rehace: NO he cambiado nada. Ofrece la semana siguiente." };
  return { offset, startDayIdx, existente };
}

/**
 * Al rehacer la semana en curso: los huecos de los días anteriores a
 * `desdeIdx` (hoy y lo pasado) vuelven del plan viejo al nuevo, en los grupos
 * que siguen existiendo. Muta `plan`; devuelve las claves conservadas.
 */
export function conservarDiasPrevios(plan, viejo, desdeIdx, DIAS) {
  const previos = new Set(DIAS.slice(0, desdeIdx));
  const conservadas = [];
  for (const [gid, huecos] of Object.entries(viejo ?? {})) {
    if (gid.startsWith("_") || !plan[gid]) continue;
    for (const [clave, h] of Object.entries(huecos ?? {})) {
      if (!previos.has(clave.split("-")[0])) continue;
      plan[gid][clave] = h;
      conservadas.push(`${gid}:${clave}`);
    }
  }
  return conservadas;
}

/**
 * La etiqueta exacta del botón que ofrece rehacer tras un ajuste (#907), para
 * que Lola no tenga que calcular lunes: la semana que viene si ya tiene menú
 * y, si no, la de ahora mientras quede algo que no sea hoy. Null si no hay
 * nada que rehacer.
 */
export function botonRehacer(semanas, hoy) {
  const lunesHoy = lunesDe(hoy);
  if (semanaConMenu(semanas, sumarDias(lunesHoy, 7), hoy)) return `Rehacer la del ${fechaCorta(sumarDias(lunesHoy, 7)).replace(/ (\p{L})/u, (m, a) => ` ${a.toUpperCase()}`)}`; // ROJO A PROPÓSITO
  if (semanaConMenu(semanas, lunesHoy, hoy) && indiceDeISO(hoy) < 6) return textoRehacer(lunesHoy);
  return null;
}

/**
 * ¿Es el texto del botón de botonRehacer? Entonces se rehace, lo diga o no el
 * modelo. En castellano o en inglés («Redo the week of 26 Oct», botones.js, #958).
 */
export const esBotonRehacer = (texto) => leerBotonRehacer(texto) != null;

/**
 * El lunes que nombra el botón («Rehacer la del 26 oct» → 2026-10-26), o
 * null. Pulsado el botón, la semana y el rehacer salen de aquí y no del
 * modelo: en las evals, a veces pedía «siguiente» y eso es la primera libre.
 */
export function desdeDelBoton(texto, hoy) {
  const b = leerBotonRehacer(texto);
  if (!b) return null;
  let anio = Number(hoy.slice(0, 4));
  const iso = (a) => `${a}-${String(b.mes + 1).padStart(2, "0")}-${String(b.dia).padStart(2, "0")}`;
  if (iso(anio) < sumarDias(hoy, -180)) anio += 1;
  return iso(anio);
}
