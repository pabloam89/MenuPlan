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
