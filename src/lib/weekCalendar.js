import { DAYS } from "./planner.js";

/** Monday-based week containing `referenceDate`. */
export function getWeekDates(referenceDate = new Date()) {
  const d = new Date(referenceDate);
  d.setHours(0, 0, 0, 0);
  const dow = d.getDay();
  const toMonday = dow === 0 ? -6 : 1 - dow;
  const monday = new Date(d);
  monday.setDate(d.getDate() + toMonday);

  const dates = {};
  for (let i = 0; i < DAYS.length; i++) {
    const dt = new Date(monday);
    dt.setDate(monday.getDate() + i);
    dates[DAYS[i]] = dt;
  }
  return dates;
}

/**
 * Returns { dates, activeDays } for a menuWeek object.
 * menuWeek = { offset: number (0=this week, 1=next, ...), startDayIdx: number (0=Lun) }
 * When offset>0 all 7 days are active; when offset==0 days before startDayIdx are inactive.
 */
export function getWeekDatesByMenuWeek(menuWeek) {
  const { offset = 0, startDayIdx = 0 } = menuWeek ?? {};
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const referenceDate = new Date(today);
  referenceDate.setDate(today.getDate() + offset * 7);
  const dates = getWeekDates(referenceDate);
  // For the current week (offset==0), only show days from startDayIdx onwards.
  const activeDays = offset === 0
    ? DAYS.filter((_, i) => i >= startDayIdx)
    : [...DAYS];
  return { dates, activeDays };
}

/**
 * Same return shape as getWeekDatesByMenuWeek, but anchored to a week's own
 * absolute startISO (see menuArchive.js's computeWeekRange) instead of
 * "today" — for a menú still being edited, dates are relative to when it's
 * viewed (offset from today); for an archived week, they must stay fixed to
 * the calendar dates it was actually generated for, however long ago that
 * was. Reversing computeWeekRange's own math: startISO is the first ACTIVE
 * day, i.e. startDayIdx days after that week's Monday.
 */
export function getWeekDatesFromStartISO(startISO, startDayIdx = 0) {
  const [y, m, d] = startISO.split("-").map(Number);
  const start = new Date(y, m - 1, d);
  start.setHours(0, 0, 0, 0);
  const monday = new Date(start);
  monday.setDate(start.getDate() - startDayIdx);
  const dates = getWeekDates(monday);
  const activeDays = DAYS.filter((_, i) => i >= startDayIdx);
  return { dates, activeDays };
}

/** Returns the 0-based Monday index of today (0=Lun … 6=Dom). */
export function todayDayIdx() {
  const dow = new Date().getDay(); // 0=Sun
  return dow === 0 ? 6 : dow - 1;
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

export function formatWeekRangeLabel(dates, activeDays) {
  // Reflect exactly the days being covered — if only a few days are active
  // (e.g. current week from today), span from the first to the last of those.
  const days = Array.isArray(activeDays) && activeDays.length > 0 ? activeDays : DAYS;
  const start = dates[days[0]];
  const end = dates[days[days.length - 1]];
  if (!start || !end) return "";
  const startLabel = `${pad2(start.getDate())}/${pad2(start.getMonth() + 1)}`;
  const endLabel = `${pad2(end.getDate())}/${pad2(end.getMonth() + 1)}`;
  return startLabel === endLabel ? startLabel : `${startLabel} – ${endLabel}`;
}

export function calendarDayNumber(day, dates) {
  return dates[day]?.getDate() ?? null;
}
