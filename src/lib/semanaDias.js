/**
 * Qué días de qué semanas entran en un menú.
 *
 * ── Por qué es una librería y no un trozo de pantalla ─────────────────────
 * Esto vivía entero dentro de `OnboardingWeek` (Onboarding.jsx), y mientras
 * fue la única pantalla que elegía días, estaba bien donde estaba. La pizarra
 * hace la misma pregunta desde otro sitio, y esta regla es de las que no
 * admiten dos copias: no es "qué días marca el usuario" sino cómo esa marca
 * se baja a los TRES campos que lee el resto de la app, que no son
 * independientes entre sí.
 *
 *   · `menuWeekDays`    — lo explícito, la única fuente de verdad. Va por el
 *                         LUNES de cada semana, nunca por offset (ver
 *                         mondayISOForOffset: el "1" que hoy es la semana que
 *                         viene, en siete días es otra).
 *   · `menuWeekOffsets` — derivado: las semanas que tienen algún día.
 *   · `menuWeek`        — derivado: la semana ancla y por qué día empieza.
 *
 * Escribir uno sin recalcular los otros dos deja el menú apuntando a una
 * semana que el usuario no eligió, y el síntoma aparece lejos: días vacíos en
 * el deck, o una semana entera que no se genera.
 */

import { DAYS } from "./planner.js";
import { weekEntry } from "./menuArchive.js";
import { mondayISOForOffset, todayDayIdx } from "./weekCalendar.js";

/**
 * Las `count` semanas del calendario a partir de la de hoy, cada una con su
 * lunes y sus siete fechas. Es lo que se dibuja, no lo que se elige.
 */
export function buildCalendarWeeks(count = 4) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dow = today.getDay();
  const toMonday = dow === 0 ? -6 : 1 - dow;
  const thisMonday = new Date(today);
  thisMonday.setDate(today.getDate() + toMonday);

  return Array.from({ length: count }, (_, i) => {
    const monday = new Date(thisMonday);
    monday.setDate(thisMonday.getDate() + i * 7);
    const days = Array.from({ length: 7 }, (__, j) => {
      const d = new Date(monday);
      d.setDate(monday.getDate() + j);
      return d;
    });
    return { offset: i, monday, days };
  });
}

/**
 * Los días de una semana que nadie ha tocado a mano: la de hoy empieza hoy
 * —no tiene sentido planificar un día que ya pasó— y las demás van enteras.
 */
export function diasPorDefecto(offset, todayIdx = todayDayIdx()) {
  return offset === 0 ? DAYS.filter((_, i) => i >= todayIdx) : [...DAYS];
}

/**
 * Los días elegidos de una semana. Lo explícito manda; si esa semana nunca se
 * tocó, cae al criterio legado a partir de `menuWeekOffsets`/`menuWeek`, para
 * que un menú guardado antes de que existiera la selección por días se siga
 * viendo exactamente igual.
 */
export function diasDeSemana(data, offset, todayIdx = todayDayIdx()) {
  const explicit = weekEntry(data?.menuWeekDays, offset);
  if (Array.isArray(explicit)) return explicit;
  const legacyOffsets = Array.isArray(data?.menuWeekOffsets) && data.menuWeekOffsets.length
    ? data.menuWeekOffsets
    : [data?.menuWeek?.offset ?? 0];
  return legacyOffsets.includes(offset) ? diasPorDefecto(offset, todayIdx) : [];
}

/**
 * Deja una semana con exactamente estos días y recalcula los dos derivados.
 * Función pura: devuelve el `data` siguiente, o el mismo si la operación
 * dejaría el menú sin un solo día (siempre tiene que quedar algo que cocinar).
 *
 * `allOffsets` son las semanas que el calendario está enseñando: fuera de esa
 * ventana no se decide nada, así que tampoco se borra nada.
 */
export function aplicarDiasDeSemana(data, offset, days, { allOffsets, todayIdx = todayDayIdx() } = {}) {
  const ventana = allOffsets ?? buildCalendarWeeks().map((w) => w.offset);
  const clave = mondayISOForOffset(offset);
  const menuWeekDays = { ...(data.menuWeekDays ?? {}) };
  // La clave numérica vieja se borra por si quedaba alguna sin migrar: si no,
  // reaparecería por el fallback de `weekEntry`.
  delete menuWeekDays[offset];
  if (days.length > 0) menuWeekDays[clave] = days;
  else delete menuWeekDays[clave];

  const nextOffsets = ventana.filter((o) =>
    o === offset ? days.length > 0 : diasDeSemana(data, o, todayIdx).length > 0
  );
  if (nextOffsets.length === 0) return data;

  const anchor = nextOffsets[0];
  const anchorDays = anchor === offset ? days : diasDeSemana(data, anchor, todayIdx);
  const startDayIdx = anchor === 0 ? DAYS.indexOf(anchorDays[0] ?? DAYS[todayIdx]) : 0;

  return {
    ...data,
    menuWeekDays,
    menuWeekOffsets: nextOffsets,
    menuWeek: { offset: anchor, startDayIdx },
  };
}

/** Marca o desmarca UN día, con la misma contabilidad. */
export function conDiaMarcado(data, offset, dayCode, selected, opts = {}) {
  const todayIdx = opts.todayIdx ?? todayDayIdx();
  const current = new Set(diasDeSemana(data, offset, todayIdx));
  if (selected) current.add(dayCode);
  else current.delete(dayCode);
  return aplicarDiasDeSemana(data, offset, DAYS.filter((d) => current.has(d)), { ...opts, todayIdx });
}

/** Enciende o apaga una semana entera de un toque. */
export function conSemanaCompleta(data, offset, opts = {}) {
  const todayIdx = opts.todayIdx ?? todayDayIdx();
  const full = diasPorDefecto(offset, todayIdx);
  const puestos = diasDeSemana(data, offset, todayIdx).length;
  return aplicarDiasDeSemana(data, offset, puestos === full.length ? [] : full, { ...opts, todayIdx });
}
