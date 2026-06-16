import { RECIPES_BY_ID } from "../data/recipes.js";
import {
  DAYS,
  getMeals,
  modeForGroupSlot,
} from "./planner.js";

const FREQ_KEYS = ["verdura", "pescado", "legumbres"];
const FREQ_LABELS = { verdura: "Verdura", pescado: "Pescado", legumbres: "Legumbres" };

export function getVisibleMenuSlots(menuPlan, groups) {
  return groups.flatMap((group) =>
    Object.entries(menuPlan[group.id] ?? {})
      .filter(([, slot]) => Boolean(slot))
      .map(([slotKey, slot]) => ({
        group,
        slotKey,
        slot,
        recipe: RECIPES_BY_ID[slot.recipeId],
      }))
      .filter((entry) => Boolean(entry.recipe))
  );
}

function countCookSlots(data, groups) {
  const meals = getMeals(data);
  let total = 0;
  for (const group of groups) {
    for (const day of DAYS) {
      for (const meal of meals) {
        const mode = modeForGroupSlot(group, data.members ?? [], data.schedule ?? {}, day, meal);
        if (mode.cook) total++;
      }
    }
  }
  return total;
}

function countFreqTags(entries) {
  const counts = { verdura: 0, pescado: 0, legumbres: 0 };
  for (const { recipe } of entries) {
    for (const key of FREQ_KEYS) {
      if (recipe.tags?.includes(key)) counts[key]++;
    }
  }
  return counts;
}

function cookTimeByDay(entries) {
  const map = Object.fromEntries(DAYS.map((d) => [d, 0]));
  for (const e of entries) {
    const day = e.slotKey.split("-")[0];
    if (day in map) map[day] += e.recipe.time ?? 0;
  }
  return DAYS.map((day) => ({ day, minutes: map[day] }));
}

export function getMenuInsights(menuPlan, groups, data) {
  const entries = getVisibleMenuSlots(menuPlan, groups);
  const mealsAtHome = entries.length;
  const mealsPlanned = countCookSlots(data, groups);

  if (mealsAtHome === 0) {
    return {
      mealsAtHome: 0,
      mealsPlanned,
      freqMet: 0,
      freqTotal: FREQ_KEYS.length,
      cookTimeLabel: "0m",
      weekdayAvg: 0,
      freqRows: [],
      cookByDay: cookTimeByDay([]),
      maxCookMinutes: 0,
    };
  }

  const freqs = data?.freqs ?? {};
  const tagCounts = countFreqTags(entries);
  const freqTargets = FREQ_KEYS.filter((k) => (freqs[k] ?? 0) > 0);
  let freqMet = 0;
  const freqRows = freqTargets.map((key) => {
    const target = freqs[key];
    const count = tagCounts[key];
    const met = count >= target;
    if (met) freqMet++;
    return { key, label: FREQ_LABELS[key], count, target, met };
  });

  const cookByDay = cookTimeByDay(entries);
  const maxCookMinutes = Math.max(...cookByDay.map((d) => d.minutes), 1);

  const cookTimeTotalMin = entries.reduce((sum, e) => sum + (e.recipe.time ?? 0), 0);
  const hours = Math.floor(cookTimeTotalMin / 60);
  const mins = cookTimeTotalMin % 60;
  const cookTimeLabel = hours > 0 ? `~${hours}h${mins ? ` ${mins}m` : ""}` : `${cookTimeTotalMin}m`;

  const weekdaySlots = entries.filter((e) => {
    const day = e.slotKey.split("-")[0];
    return day !== "Sáb" && day !== "Dom";
  });
  const weekdayAvg =
    weekdaySlots.length > 0
      ? Math.round(weekdaySlots.reduce((s, e) => s + e.recipe.time, 0) / weekdaySlots.length)
      : 0;

  return {
    mealsAtHome,
    mealsPlanned,
    freqMet,
    freqTotal: freqTargets.length || FREQ_KEYS.length,
    cookTimeLabel,
    weekdayAvg,
    freqRows,
    cookByDay,
    maxCookMinutes,
  };
}
