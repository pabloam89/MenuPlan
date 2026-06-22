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

/** Returns the 0-based Monday index of today (0=Lun … 6=Dom). */
export function todayDayIdx() {
  const dow = new Date().getDay(); // 0=Sun
  return dow === 0 ? 6 : dow - 1;
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

export function formatWeekRangeLabel(dates) {
  const start = dates[DAYS[0]];
  const end = dates[DAYS[6]];
  if (!start || !end) return "";
  return `${pad2(start.getDate())}/${pad2(start.getMonth() + 1)} – ${pad2(end.getDate())}/${pad2(end.getMonth() + 1)}`;
}

export function calendarDayNumber(day, dates) {
  return dates[day]?.getDate() ?? null;
}
