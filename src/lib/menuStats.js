import { getConsumptionInsights, mergeConsumptionGroups } from "./consumptionInsights.js";
import { indiceDeFecha } from "./dias.js";
import { MENUS_QUE_SE_LEEN } from "./menusGenerados.js";

function weekStart(ts) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  const day = indiceDeFecha(d);
  d.setDate(d.getDate() - day);
  return d.getTime();
}

/** Consecutive weeks (including this one) with at least one menu generated. */
export function computeStreak(history) {
  if (!history?.length) return 0;
  const weeks = new Set(history.map((h) => h.at).map(weekStart));
  let streak = 0;
  let cursor = weekStart(Date.now());
  const WEEK = 7 * 24 * 60 * 60 * 1000;
  while (weeks.has(cursor)) {
    streak += 1;
    cursor -= WEEK;
  }
  return streak;
}

// Solo se leen los últimos MENUS_QUE_SE_LEEN menús (menusGenerados.js): con la lista llena, «60+» y no un total falso.
const HISTORY_CAP = MENUS_QUE_SE_LEEN;

export function countMenusGenerated(history) {
  const count = history?.length ?? 0;
  return { count, isCapped: count >= HISTORY_CAP };
}

/** Most-repeated (meaningful) food family in the current week's menu. */
export function favoriteCategoryThisWeek(menuPlan, groups, data) {
  if (!groups?.length || !menuPlan || Object.keys(menuPlan).length === 0) return null;
  const merged = mergeConsumptionGroups(getConsumptionInsights(menuPlan, groups, data));
  const top = (merged.familyCounts ?? []).find((f) => f.key !== "otros" && f.count > 0);
  if (!top) return null;
  return { key: top.key, label: top.label, count: top.count };
}
