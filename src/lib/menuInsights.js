import { paletteForRecipe } from "../assets/dishes/dishVisuals.js";
import { RECIPES_BY_ID } from "../data/recipes.js";
import {
  DAYS,
  getMeals,
  modeForGroupSlot,
} from "./planner.js";

const FREQ_KEYS = ["verdura", "pescado", "legumbres"];
const FREQ_LABELS = { verdura: "Verdura", pescado: "Pescado", legumbres: "Legumbres" };

export function getVisibleMenuSlots(menuPlan, groups) {
  return groups.flatMap((group) => getGroupEntries(menuPlan, group));
}

function getGroupEntries(menuPlan, group) {
  return Object.entries(menuPlan[group.id] ?? {})
    .filter(([, slot]) => Boolean(slot))
    .map(([slotKey, slot]) => ({
      group,
      slotKey,
      slot,
      recipe: RECIPES_BY_ID[slot.recipeId],
    }))
    .filter((entry) => Boolean(entry.recipe));
}

function countCookSlotsForGroup(data, group, meals) {
  let total = 0;
  for (const day of DAYS) {
    for (const meal of meals) {
      const mode = modeForGroupSlot(group, data.members ?? [], data.schedule ?? {}, day, meal);
      if (mode.cook) total++;
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

function formatCookTime(totalMin) {
  if (totalMin <= 0) return "0m";
  const hours = Math.floor(totalMin / 60);
  const mins = totalMin % 60;
  return hours > 0 ? `~${hours}h${mins ? ` ${mins}m` : ""}` : `${totalMin}m`;
}

function buildFreqRows(freqs, entries) {
  const tagCounts = countFreqTags(entries);
  const freqTargets = FREQ_KEYS.filter((k) => (freqs[k] ?? 0) > 0);
  let freqMet = 0;
  const freqRows = freqTargets.map((key) => {
    const target = freqs[key];
    const count = tagCounts[key];
    const met = count >= target;
    if (met) freqMet++;
    return {
      key,
      label: FREQ_LABELS[key],
      count,
      target,
      met,
      missing: Math.max(0, target - count),
    };
  });
  return { freqRows, freqMet, freqTotal: freqTargets.length };
}

function cookTimeByDay(entries) {
  const map = Object.fromEntries(DAYS.map((d) => [d, 0]));
  for (const e of entries) {
    const day = e.slotKey.split("-")[0];
    if (day in map) map[day] += e.recipe.time ?? 0;
  }
  return DAYS.map((day) => ({ day, minutes: map[day] }));
}

function cookTimeByDayMeal(entries, meals) {
  return DAYS.map((day) => {
    const byMeal = Object.fromEntries(meals.map((m) => [m, 0]));
    let total = 0;
    for (const e of entries) {
      const parts = e.slotKey.split("-");
      const d = parts[0];
      const meal = parts.slice(1).join("-");
      if (d === day && meal in byMeal) {
        const mins = e.recipe.time ?? 0;
        byMeal[meal] += mins;
        total += mins;
      }
    }
    return { day, total, byMeal };
  });
}

function buildCookStats(cookByDay) {
  const weekdayRows = cookByDay.filter((d) => d.day !== "Sáb" && d.day !== "Dom");
  const weekendRows = cookByDay.filter((d) => d.day === "Sáb" || d.day === "Dom");
  const weekdayAvg =
    weekdayRows.length > 0
      ? Math.round(weekdayRows.reduce((s, d) => s + d.minutes, 0) / weekdayRows.length)
      : 0;
  const weekendAvg =
    weekendRows.length > 0
      ? Math.round(weekendRows.reduce((s, d) => s + d.minutes, 0) / weekendRows.length)
      : 0;
  const active = cookByDay.filter((d) => d.minutes > 0);
  const heaviestDay = cookByDay.reduce(
    (best, row) => (row.minutes > best.minutes ? row : best),
    { day: DAYS[0], minutes: 0 }
  );
  const lightestDay =
    active.length > 0
      ? active.reduce((best, row) => (row.minutes < best.minutes ? row : best))
      : { day: null, minutes: 0 };
  const maxDayMinutes = Math.max(...cookByDay.map((d) => d.minutes), 1);
  return { weekdayAvg, weekendAvg, heaviestDay, lightestDay, maxDayMinutes };
}

function buildMosaicCells(menuPlan, group, data, meals) {
  const cells = [];
  for (const day of DAYS) {
    for (const meal of meals) {
      const key = `${day}-${meal}`;
      const slot = menuPlan[group.id]?.[key];
      const recipe = slot ? RECIPES_BY_ID[slot.recipeId] : null;
      const mode = modeForGroupSlot(group, data.members ?? [], data.schedule ?? {}, day, meal);
      const palette = recipe ? paletteForRecipe(recipe) : null;
      cells.push({
        day,
        meal,
        accent: palette?.accent ?? null,
        empty: !recipe || !mode.cook,
      });
    }
  }
  return cells;
}

function buildHeatmapCells(menuPlan, groups, data, meals) {
  return DAYS.flatMap((day) =>
    meals.map((meal) => {
      const key = `${day}-${meal}`;
      const layers = groups.map((group) => {
        const slot = menuPlan[group.id]?.[key];
        const recipe = slot ? RECIPES_BY_ID[slot.recipeId] : null;
        const mode = modeForGroupSlot(group, data.members ?? [], data.schedule ?? {}, day, meal);
        return {
          groupId: group.id,
          label: group.label,
          color: group.color,
          minutes: mode.cook && recipe ? recipe.time ?? 0 : 0,
          cooking: mode.cook && Boolean(recipe),
        };
      });
      const totalMinutes = layers.reduce((sum, layer) => sum + layer.minutes, 0);
      const maxLayer = Math.max(...layers.map((l) => l.minutes), 0);
      return { day, meal, layers, totalMinutes, maxLayer };
    })
  );
}

function countSharedBases(menuPlan, groups, meals) {
  let shared = 0;
  for (const day of DAYS) {
    for (const meal of meals) {
      const key = `${day}-${meal}`;
      const ids = groups
        .map((g) => menuPlan[g.id]?.[key]?.recipeId)
        .filter(Boolean);
      if (ids.length >= 2 && new Set(ids).size === 1) shared++;
    }
  }
  return shared;
}

function shoppingProgress(shopping) {
  const items = shopping?.items ?? [];
  if (items.length === 0) return { done: 0, total: 0, pct: 0 };
  const done = items.filter((it) => it.have || it.atHome).length;
  return { done, total: items.length, pct: Math.round((done / items.length) * 100) };
}

function buildDurationBuckets(entries) {
  const buckets = {
    quick: { count: 0, minutes: 0, recipes: new Map() },
    medium: { count: 0, minutes: 0, recipes: new Map() },
    long: { count: 0, minutes: 0, recipes: new Map() },
  };

  for (const e of entries) {
    const t = e.recipe.time ?? 0;
    const key = t < 20 ? "quick" : t <= 40 ? "medium" : "long";
    buckets[key].count += 1;
    buckets[key].minutes += t;
    if (!buckets[key].recipes.has(e.recipe.id)) {
      buckets[key].recipes.set(e.recipe.id, {
        id: e.recipe.id,
        name: e.recipe.name,
        time: t,
        iconType: e.recipe.iconType,
      });
    }
  }

  const pack = (b) => ({
    count: b.count,
    minutes: b.minutes,
    recipes: [...b.recipes.values()].sort((a, c) => a.time - c.time),
  });

  return {
    total: entries.length,
    buckets: {
      quick: pack(buckets.quick),
      medium: pack(buckets.medium),
      long: pack(buckets.long),
    },
  };
}

function buildGroupInsights(menuPlan, group, data, meals) {
  const entries = getGroupEntries(menuPlan, group);
  const mealsAtHome = entries.length;
  const mealsPlanned = countCookSlotsForGroup(data, group, meals);
  const freqs = data?.freqsByGroup?.[group.id] ?? data?.freqs ?? {};
  const { freqRows, freqMet, freqTotal } = buildFreqRows(freqs, entries);

  const cookByDay = cookTimeByDay(entries);
  const cookByDayMeal = cookTimeByDayMeal(entries, meals);
  const cookStats = buildCookStats(cookByDay);
  const maxCookMinutes = cookStats.maxDayMinutes;
  const cookTimeTotalMin = entries.reduce((sum, e) => sum + (e.recipe.time ?? 0), 0);

  const weekdayAvg = cookStats.weekdayAvg;

  const uniqueRecipes = new Set(entries.map((e) => e.recipe.id)).size;
  const quickCount = entries.filter((e) => (e.recipe.time ?? 0) < 20).length;
  const tupperCount = entries.filter((e) => e.recipe.tupperFriendly).length;
  const durationBuckets = buildDurationBuckets(entries);

  const heaviestDay = cookStats.heaviestDay;

  const objectivesOk = freqTotal === 0 ? true : freqMet >= freqTotal;

  return {
    groupId: group.id,
    label: group.label,
    color: group.color,
    memberCount: group.memberIds?.length ?? 0,
    mealsAtHome,
    mealsPlanned,
    freqMet,
    freqTotal,
    freqRows,
    cookTimeLabel: formatCookTime(cookTimeTotalMin),
    cookTimeTotalMin,
    weekdayAvg,
    weekendAvg: cookStats.weekendAvg,
    cookByDay,
    cookByDayMeal,
    cookStats,
    maxCookMinutes,
    mosaicCells: buildMosaicCells(menuPlan, group, data, meals),
    uniqueRecipes,
    quickCount,
    tupperCount,
    durationBuckets,
    heaviestDay,
    objectivesOk,
  };
}

function buildAggregateInsights(menuPlan, groups, data, meals, byGroup, shopping) {
  const entries = getVisibleMenuSlots(menuPlan, groups);
  const mealsAtHome = entries.length;
  const mealsPlanned = groups.reduce(
    (sum, group) => sum + countCookSlotsForGroup(data, group, meals),
    0
  );

  const cookTimeTotalMin = byGroup.reduce((sum, g) => sum + g.cookTimeTotalMin, 0);
  const freqMet = byGroup.reduce((sum, g) => sum + g.freqMet, 0);
  const freqTotal = byGroup.reduce((sum, g) => sum + g.freqTotal, 0);

  const cookByDayStacked = DAYS.map((day) => {
    const segments = byGroup.map((g) => ({
      groupId: g.groupId,
      label: g.label,
      color: g.color,
      minutes: g.cookByDay.find((d) => d.day === day)?.minutes ?? 0,
    }));
    const total = segments.reduce((sum, s) => sum + s.minutes, 0);
    return { day, segments, total };
  });

  const aggregateCookByDay = cookByDayStacked.map((d) => ({ day: d.day, minutes: d.total }));
  const cookByDayMeal = DAYS.map((day) => {
    const byMeal = Object.fromEntries(meals.map((m) => [m, 0]));
    let total = 0;
    for (const e of entries) {
      const parts = e.slotKey.split("-");
      const d = parts[0];
      const meal = parts.slice(1).join("-");
      if (d === day && meal in byMeal) {
        const mins = e.recipe.time ?? 0;
        byMeal[meal] += mins;
        total += mins;
      }
    }
    return { day, total, byMeal };
  });
  const cookStats = buildCookStats(aggregateCookByDay);

  const maxStackedDay = cookStats.maxDayMinutes;
  const heaviestDay = {
    day: cookStats.heaviestDay.day,
    total: cookStats.heaviestDay.minutes,
    minutes: cookStats.heaviestDay.minutes,
    segments: cookByDayStacked.find((d) => d.day === cookStats.heaviestDay.day)?.segments ?? [],
  };
  const lightestDay = cookStats.lightestDay;
  const weekdayAvg = cookStats.weekdayAvg;
  const weekendAvg = cookStats.weekendAvg;

  const uniqueRecipes = new Set(entries.map((e) => e.recipe.id)).size;
  const quickCount = entries.filter((e) => (e.recipe.time ?? 0) < 20).length;
  const tupperCount = entries.filter((e) => e.recipe.tupperFriendly).length;
  const durationBuckets = buildDurationBuckets(entries);
  const sharedBases = countSharedBases(menuPlan, groups, meals);
  const purchase = shoppingProgress(shopping);

  const groupObjectives = byGroup.map((g) => ({
    groupId: g.groupId,
    label: g.label,
    color: g.color,
    ok: g.objectivesOk,
    freqMet: g.freqMet,
    freqTotal: g.freqTotal,
  }));

  return {
    mealsAtHome,
    mealsPlanned,
    freqMet,
    freqTotal,
    cookTimeLabel: formatCookTime(cookTimeTotalMin),
    cookTimeTotalMin,
    weekdayAvg,
    weekendAvg,
    cookByDayStacked,
    cookByDayMeal,
    cookStats,
    lightestDay,
    maxStackedDay,
    heaviestDay,
    heatmapCells: buildHeatmapCells(menuPlan, groups, data, meals),
    uniqueRecipes,
    quickCount,
    tupperCount,
    durationBuckets,
    sharedBases,
    purchase,
    groupObjectives,
    mosaicRows: byGroup.map((g) => ({
      groupId: g.groupId,
      label: g.label,
      color: g.color,
      cells: g.mosaicCells,
    })),
  };
}

export function getMenuInsights(menuPlan, groups, data, shopping = { items: [] }) {
  const meals = getMeals(data);
  const byGroup = groups.map((group) => buildGroupInsights(menuPlan, group, data, meals));
  const hasMenu = byGroup.some((g) => g.mealsAtHome > 0);
  const aggregate = buildAggregateInsights(menuPlan, groups, data, meals, byGroup, shopping);

  return {
    hasMenu,
    meals,
    groups,
    byGroup,
    aggregate,
  };
}

/** @deprecated Use insights.byGroup / insights.aggregate */
export function getLegacyMenuInsights(menuPlan, groups, data) {
  const { aggregate, byGroup } = getMenuInsights(menuPlan, groups, data);
  const first = byGroup[0];
  return {
    mealsAtHome: aggregate.mealsAtHome,
    mealsPlanned: aggregate.mealsPlanned,
    freqMet: aggregate.freqMet,
    freqTotal: aggregate.freqTotal || FREQ_KEYS.length,
    cookTimeLabel: aggregate.cookTimeLabel,
    weekdayAvg: aggregate.weekdayAvg,
    freqRows: first?.freqRows ?? [],
    cookByDay: first?.cookByDay ?? DAYS.map((day) => ({ day, minutes: 0 })),
    maxCookMinutes: first?.maxCookMinutes ?? 0,
  };
}
