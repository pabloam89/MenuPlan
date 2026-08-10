export const COOK_TIME_DEFAULTS = {
  mode: "shared",
  weekday: { Comida: 30, Cena: 30 },
  weekend: { Comida: 60, Cena: 60 },
};

// Qualitative "cooking pace" levels shown in the editor instead of a raw slider
// (people never dial an exact number — time is variable). Each maps to a per-slot
// minute budget the planner already understands through maxCookTime, so nothing
// downstream changes. Minutes are distinct so the selected chip can be inferred
// back from stored minutes (keeps back-compat with the old slider + imports).
export const COOK_LEVELS = [
  { id: "con_prisa",  label: "Con prisa",       sub: "Voy con el tiempo justo",    minutes: 20 },
  { id: "normal",     label: "Normal",          sub: "Sencillo pero decente",      minutes: 35 },
  { id: "con_tiempo", label: "Con tiempo",      sub: "Tengo un rato para cocinar", minutes: 75 },
  { id: "depende",    label: "Depende del día", sub: "Unos días sí y otros no",    minutes: 55 },
];

export function cookLevelMinutes(id) {
  return (COOK_LEVELS.find((l) => l.id === id) ?? COOK_LEVELS[1]).minutes;
}

/** Nearest level to a stored minute budget (for highlighting the active chip). */
export function cookLevelForMinutes(minutes) {
  let bestId = COOK_LEVELS[1].id;
  let bestDist = Infinity;
  for (const l of COOK_LEVELS) {
    const d = Math.abs(l.minutes - (minutes ?? 0));
    if (d < bestDist) { bestDist = d; bestId = l.id; }
  }
  return bestId;
}

// Fallback day counts when the real schedule isn't available (5 weekdays,
// 2 weekend days). The editor passes the real per-meal counts derived from the
// schedule so weekly totals match what the family actually cooks.
export const COOK_PERIOD_DAYS = { weekday: 5, weekend: 2 };

export function daysInCookPeriod(period) {
  return COOK_PERIOD_DAYS[period] ?? 5;
}

/** Days that a given meal is cooked in a period (real schedule → fallback). */
function daysForMeal(period, meal, dayCounts) {
  const real = dayCounts?.[period]?.[meal];
  if (typeof real === "number") return real;
  return daysInCookPeriod(period);
}

/**
 * Weekly scale for a per-slot cook time:
 *  - shared: one slider covers every planned meal in the period → sum of the
 *    days each of those meals is cooked.
 *  - per-meal: just the days that specific meal is cooked.
 */
export function weekCookScale(period, mealTargets, { shared = false, meal, dayCounts } = {}) {
  const targets = mealTargets && mealTargets.length ? mealTargets : ["Comida"];
  if (shared) {
    return targets.reduce((sum, m) => sum + daysForMeal(period, m, dayCounts), 0);
  }
  return daysForMeal(period, meal ?? targets[0], dayCounts);
}

export function toDisplayCookMinutes(perSlotMinutes, period, mealTargets, unit, opts = {}) {
  if (unit !== "week") return perSlotMinutes;
  return perSlotMinutes * weekCookScale(period, mealTargets, opts);
}

export function fromDisplayCookMinutes(displayMinutes, period, mealTargets, unit, opts = {}) {
  if (unit !== "week") return displayMinutes;
  const scale = weekCookScale(period, mealTargets, opts) || 1;
  return Math.round(displayMinutes / scale);
}

export function displayCookBounds(min, max, period, mealTargets, unit, opts = {}) {
  if (unit !== "week") return { min, max };
  const scale = weekCookScale(period, mealTargets, opts);
  return { min: min * scale, max: max * scale };
}

/** Display label for cook-time sliders: under 60 min → "45 min"; 60+ → "1h" / "4h10" (optional "/sem"). */
export function formatCookDurationLabel(minutes, unit = "day") {
  const weekly = unit === "week";
  if (minutes < 60) {
    return weekly ? `${minutes} min/sem` : `${minutes} min`;
  }
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  const core = mins > 0 ? `${hours}h${mins}` : `${hours}h`;
  return weekly ? `${core}/sem` : core;
}

export function migrateCookTime(data) {
  let weekday;
  let weekend;
  if (
    data?.cookTime?.weekday &&
    typeof data.cookTime.weekday.Comida === "number" &&
    typeof data.cookTime.weekday.Cena === "number"
  ) {
    weekday = {
      Comida: data.cookTime.weekday.Comida,
      Cena: data.cookTime.weekday.Cena,
    };
    weekend = {
      Comida: data.cookTime.weekend?.Comida ?? COOK_TIME_DEFAULTS.weekend.Comida,
      Cena: data.cookTime.weekend?.Cena ?? COOK_TIME_DEFAULTS.weekend.Cena,
    };
  } else {
    const wd = data?.timeWeekday ?? COOK_TIME_DEFAULTS.weekday.Comida;
    const we = data?.timeWeekend ?? COOK_TIME_DEFAULTS.weekend.Comida;
    weekday = { Comida: wd, Cena: wd };
    weekend = { Comida: we, Cena: we };
  }

  const inferredSplit = weekday.Comida !== weekday.Cena || weekend.Comida !== weekend.Cena;
  const mode =
    data?.cookTime?.mode === "split" || data?.cookTime?.mode === "shared"
      ? data.cookTime.mode
      : inferredSplit
        ? "split"
        : "shared";

  return { mode, weekday, weekend };
}

/** Max minutes for a slot (Comida / Cena / Desayuno → Comida budget). */
export function maxCookTime(data, { isWeekend, meal }) {
  const block = isWeekend ? migrateCookTime(data).weekend : migrateCookTime(data).weekday;
  if (meal === "Cena") return block.Cena;
  return block.Comida;
}

export function maxCookTimeFilter(data) {
  const ct = migrateCookTime(data);
  return Math.max(
    ct.weekday.Comida,
    ct.weekday.Cena,
    ct.weekend.Comida,
    ct.weekend.Cena,
  );
}

export function formatCookTimeSummary(data) {
  const ct = migrateCookTime(data);
  const fmtBlock = (block, label) => {
    if (block.Comida === block.Cena) return `${block.Comida} min ${label}`;
    return `${block.Comida} min comida · ${block.Cena} min cena (${label})`;
  };
  return `${fmtBlock(ct.weekday, "L-V")} · ${fmtBlock(ct.weekend, "finde")}`;
}

export function writeCookTimePeriod(data, period, patch) {
  const cur = migrateCookTime(data);
  return {
    ...data,
    cookTime: {
      ...cur,
      [period]: { ...cur[period], ...patch },
    },
  };
}

export function writeCookTimeMode(data, mode) {
  const cur = migrateCookTime(data);
  if (mode === cur.mode) return data;

  if (mode === "shared") {
    const sync = (block) => {
      const v = Math.max(block.Comida, block.Cena);
      return { Comida: v, Cena: v };
    };
    return {
      ...data,
      cookTime: {
        mode: "shared",
        weekday: sync(cur.weekday),
        weekend: sync(cur.weekend),
      },
    };
  }

  return { ...data, cookTime: { ...cur, mode: "split" } };
}

export function writeCookTimeShared(data, period, value) {
  return writeCookTimePeriod(data, period, { Comida: value, Cena: value });
}
