import QRCode from "qrcode";
import { RECIPES_BY_ID } from "../data/recipes.js";
import { membersOfGroup } from "./groups.js";
import { DAYS, getDayMeals, slotKey } from "./planner.js";
import {
  getSchoolDish,
  hasAnySchoolDish,
  householdHasSchoolMenu,
  SCHOOL_DAYS,
} from "./schoolMenu.js";
import {
  initialsOf,
  memberAvatarColor,
  memberAvatarThumbSrc,
} from "./stages.js";
import {
  formatWeekRangeLabel,
  getWeekDates,
  getWeekDatesByMenuWeek,
  getWeekDatesFromStartISO,
} from "./weekCalendar.js";
import {
  enrichItem,
  isPantryItem,
  itemsByAisle,
  mergeShoppingItems,
} from "./shoppingListUtils.js";

const MONTH_NAMES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

const COLE_COLOR = "#1d6fd8";

export const PDF_WEEKDAY_DAYS = ["Lun", "Mar", "Mié", "Jue", "Vie"];
export const PDF_WEEKEND_DAYS = ["Sáb", "Dom"];
export const PDF_EXPORT_MEALS = ["Desayuno", "Comida", "Cena"];

/** True when any member eats comedor escolar on a weekday. */
export function householdHasColeSchedule(data) {
  const members = data?.members ?? [];
  const schedule = data?.schedule ?? {};
  return members.some((m) => SCHOOL_DAYS.some(
    (day) => schedule[slotKey(m.id, day, "Comida")] === "cole",
  ));
}

/** Meals available for the PDF picker (Desayuno / Comida / Cena). */
export function pdfExportMealOptions(data) {
  const active = new Set(getDayMeals(data));
  return PDF_EXPORT_MEALS.filter((m) => active.has(m));
}

/** True when the household has postre configured for any meal. */
export function householdHasPostre(data) {
  const postre = data?.extraMeals?.postre ?? "off";
  return postre !== "off";
}

/** Groups (with members) that can be shown/hidden in the PDF picker. */
export function pdfExportGroupOptions(data) {
  return (data?.groups ?? [])
    .map((g) => ({
      id: g.id,
      label: g.label,
      color: g.color,
      count: membersOfGroup(g, data?.members ?? []).length,
    }))
    .filter((g) => g.count > 0);
}

/** Sensible defaults for the pre-download sheet. */
export function defaultPdfExportOptions(data) {
  const meals = pdfExportMealOptions(data);
  return {
    dayScope: "weekday",
    meals: meals.length ? meals : ["Comida", "Cena"],
    includePostre: householdHasPostre(data),
    includeSchoolMenu: householdHasSchoolMenu(data?.schoolMenus) && householdHasColeSchedule(data),
    excludedGroups: [],
  };
}

export function normalizePdfExportOptions(exportIn, data) {
  const defaults = defaultPdfExportOptions(data);
  const merged = { ...defaults, ...(exportIn ?? {}) };
  const picked = Array.isArray(merged.meals)
    ? merged.meals.filter((m) => PDF_EXPORT_MEALS.includes(m))
    : defaults.meals;
  merged.meals = picked.length ? picked : defaults.meals;
  merged.dayScope = merged.dayScope === "weekend" ? "weekend" : "weekday";
  merged.includePostre = Boolean(merged.includePostre);
  merged.includeSchoolMenu = Boolean(merged.includeSchoolMenu);
  merged.excludedGroups = Array.isArray(merged.excludedGroups) ? merged.excludedGroups : [];
  return merged;
}

/** Groups left visible once the excluded ones are removed (never empty). */
function visibleGroupsFor(groups, exportOpts) {
  const excluded = new Set(exportOpts?.excludedGroups ?? []);
  const kept = (groups ?? []).filter((g) => !excluded.has(g.id) && !excluded.has(g.label));
  return kept.length ? kept : (groups ?? []);
}

/**
 * How many meal rows a single week strip renders (postre folds into
 * Comida/Cena, so it never adds its own row).
 */
function pdfMealRowCount(exportOpts) {
  return (exportOpts?.meals ?? []).filter((m) => PDF_EXPORT_MEALS.includes(m)).length || 1;
}

// Beyond ~8 "row·group" units per sheet the month pack becomes unreadable, so
// we spill extra weeks onto more sheets instead of shrinking everything.
const MAX_UNITS_PER_SHEET = 8;

/** Weeks that comfortably fit on one sheet for the given density. */
export function weeksPerSheet(groupsCount, exportOpts) {
  const unitsPerWeek = pdfMealRowCount(exportOpts) * Math.max(1, groupsCount);
  return Math.max(1, Math.floor(MAX_UNITS_PER_SHEET / unitsPerWeek));
}

/**
 * Estimate how many A4 sheets the export needs. A single week always fits on
 * one (roomy) sheet; multi-week packs spill once the density is too high.
 */
export function estimatePdfSheets(weekCount, groupsCount, exportOpts) {
  if (weekCount <= 1) return 1;
  return Math.max(1, Math.ceil(weekCount / weeksPerSheet(groupsCount, exportOpts)));
}

// Vertical budget of the "weeks" area on one A4 landscape sheet, in CSS px
// (210mm printable minus header/footer/gaps). Two profiles: full-size (one
// week per sheet) and compact (several weeks stacked).
const SHEET_METRICS = {
  full: { area: 626, dayHead: 30, gap: 0, rowMax: 118, rowMin: 46 },
  compact: { area: 668, dayHead: 18, gap: 6, rowMax: 104, rowMin: 34 },
};

/**
 * Height for each meal row: fills the sheet when content is dense, but is
 * capped so a near-empty sheet doesn't blow every row up to a third of the
 * page. Returns a px number the grid uses as its row track.
 */
export function capRowHeight(mealRows, weeksOnSheet, compact) {
  const m = compact ? SHEET_METRICS.compact : SHEET_METRICS.full;
  const rows = Math.max(1, mealRows);
  const weeks = Math.max(1, weeksOnSheet);
  const usable = m.area - weeks * m.dayHead - (weeks - 1) * m.gap;
  const fill = usable / (weeks * rows);
  return Math.round(Math.max(m.rowMin, Math.min(m.rowMax, fill)));
}

function scopeDays(dayScope) {
  return dayScope === "weekend" ? PDF_WEEKEND_DAYS : PDF_WEEKDAY_DAYS;
}

/**
 * Columns to render for the PDF. We render the whole scope band (all of
 * Lun–Vie for "weekday", or Sáb+Dom for "weekend") so a mid-week menú still
 * lands on its real weekday — the days without menú are drawn dimmed instead
 * of collapsed. Weekend days are never rendered unless the weekend scope is
 * explicitly requested.
 */
export function resolvePdfVisibleDays(exportOpts) {
  return scopeDays(exportOpts?.dayScope ?? "weekday");
}

function longDate(date) {
  if (!date) return "";
  return `${date.getDate()} de ${MONTH_NAMES[date.getMonth()]}`;
}

const DAY_FULL = {
  Lun: "Lunes", Mar: "Martes", Mié: "Miércoles", Jue: "Jueves",
  Vie: "Viernes", Sáb: "Sábado", Dom: "Domingo",
};

export function formatMenuText(data, menuPlan, groups) {
  const dates = getWeekDates();
  const weekLabel = formatWeekRangeLabel(dates);
  // getDayMeals (not getMeals): getMeals only ever returns the two main meals
  // the AI planner budgets for (Comida/Cena) — desayuno/merienda/postre are
  // planned separately (see planExtraMealsForGroup) and were silently dropped
  // from the exported/shared text even when active and shown on screen.
  const meals = getDayMeals(data);
  const multiGroup = groups.length > 1;

  const lines = [`MENÚ SEMANAL — ${weekLabel}`, ""];

  for (const day of DAYS) {
    const date = dates[day];
    const header = date
      ? `${DAY_FULL[day] ?? day}, ${longDate(date)}`
      : (DAY_FULL[day] ?? day);

    const dayLines = [];

    for (const meal of meals) {
      for (const group of groups) {
        const slot = menuPlan[group.id]?.[`${day}-${meal}`];
        if (!slot?.recipeId) continue;

        const groupLabel = multiGroup ? ` [${group.label}]` : "";
        const tupper = slot.mode === "tupper" ? " (tupper)" : "";

        const dishes = [];
        if (slot.firstRecipeId) {
          const first = RECIPES_BY_ID[slot.firstRecipeId];
          if (first) dishes.push(first.name);
        }
        const recipe = RECIPES_BY_ID[slot.recipeId];
        if (recipe) dishes.push(recipe.name);

        if (dishes.length > 0) {
          // Padded to the widest label ("Desayuno"/"Merienda", 8 chars) so every
          // row's colon lines up regardless of which meals are active.
          const mealPad = "  " + meal.padEnd(8);
          dayLines.push(`${mealPad}:${groupLabel} ${dishes.join(" · ")}${tupper}`);
        }
      }
    }

    if (dayLines.length > 0) {
      lines.push(header);
      lines.push(...dayLines);
      lines.push("");
    }
  }

  if (data.members?.length) {
    lines.push(`Familia: ${data.members.map((m) => m.name).join(", ")}`);
  }

  return lines.join("\n").trim();
}

function escapeHtml(text) {
  return String(text ?? "").replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));
}

/** Inline Lucide-style SVG (print HTML can't mount React icons). */
function lucideIcon(nodes, color, size = 18, cls = "meal-icon") {
  const body = nodes.map((d) => (
    d.startsWith("<") ? d : `<path d="${d}" />`
  )).join("");
  return `<svg class="${cls}" xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
}

const MONTH_ABBR = [
  "ene", "feb", "mar", "abr", "may", "jun",
  "jul", "ago", "sep", "oct", "nov", "dic",
];

/** "3 – 28 ago" when the same month, else "28 ago – 2 sep". */
function formatDateSpan(start, end) {
  if (!start || !end) return "";
  const d = (x) => x.getDate();
  const m = (x) => MONTH_ABBR[x.getMonth()];
  if (start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear()) {
    return d(start) === d(end) ? `${d(start)} ${m(end)}` : `${d(start)} – ${d(end)} ${m(end)}`;
  }
  return `${d(start)} ${m(start)} – ${d(end)} ${m(end)}`;
}

function chunkArray(arr, size) {
  const n = Math.max(1, size);
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out.length ? out : [[]];
}

// Lucide paths for the header chips.
const CHIP_ICONS = {
  calendar: ['<rect width="18" height="18" x="3" y="4" rx="2" />', "M3 10h18", "M8 2v4", "M16 2v4"],
  layers: [
    "m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z",
    "m6.08 9.5-3.48 1.59a1 1 0 0 0 0 1.81l8.58 3.9a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.81L17.92 9.5",
    "m6.08 14.5-3.48 1.59a1 1 0 0 0 0 1.81l8.58 3.9a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.81l-3.48-1.59",
  ],
  weekday: ['<rect width="20" height="14" x="2" y="7" rx="2" ry="2" />', "M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"],
  weekend: [
    '<circle cx="12" cy="12" r="4" />',
    "M12 2v2", "M12 20v2", "m4.93 4.93 1.41 1.41", "m17.66 17.66 1.41 1.41",
    "M2 12h2", "M20 12h2", "m6.34 17.66-1.41 1.41", "m19.07 4.93-1.41 1.41",
  ],
};

function chipHtml(iconKey, text) {
  if (!text) return "";
  const icon = CHIP_ICONS[iconKey]
    ? lucideIcon(CHIP_ICONS[iconKey], "#2d5a3d", 13, "chip-icon")
    : "";
  return `<span class="chip">${icon}<span>${escapeHtml(text)}</span></span>`;
}

// Classic Lucide paths — Coffee / Salad / UtensilsCrossed / Sun / Cookie / Moon / IceCreamCone
const ROW_META = {
  Desayuno: {
    tone: "#c98a3a",
    bg: "#fbf3e8",
    icon: (c, size = 18) => lucideIcon([
      "M10 2v2", "M14 2v2", "M6 2v2",
      "M16 8a1 1 0 0 1 1 1v8a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V9a1 1 0 0 1 1-1h14a4 4 0 1 1 0 8h-1",
    ], c, size),
  },
  Primero: {
    tone: "#2f9e5a",
    bg: "#e8f7ee",
    icon: (c, size = 18) => lucideIcon([
      "M7 21h10",
      "M12 21a9 9 0 0 0 9-9H3a9 9 0 0 0 9 9Z",
      "M11.38 12a2.4 2.4 0 0 1-.4-4.77 2.4 2.4 0 0 1 3.2-2.77 2.4 2.4 0 0 1 3.47-.63 2.4 2.4 0 0 1 3.37 3.37 2.4 2.4 0 0 1-1.1 3.7 2.51 2.51 0 0 1 .03 1.1",
      "m13 12 4-4",
      "M10.9 7.25A3.99 3.99 0 0 0 4 10c0 .73.2 1.41.54 2",
    ], c, size),
  },
  Segundo: {
    tone: "#2d5a3d",
    bg: "#e7f0ea",
    icon: (c, size = 18) => lucideIcon([
      "m16 2-2.3 2.3a3 3 0 0 0 0 4.2l1.8 1.8a3 3 0 0 0 4.2 0L22 8",
      "M15 15 3.3 3.3a4.2 4.2 0 0 0 0 6l7.3 7.3c.7.7 2 .7 2.8 0L15 15Zm0 0 7 7",
      "m2.1 21.8 6.4-6.3",
      "m19 5-7 7",
    ], c, size),
  },
  Comida: {
    tone: "#d4a017",
    bg: "#fbf6e8",
    icon: (c, size = 18) => lucideIcon([
      '<circle cx="12" cy="12" r="4" />',
      "M12 2v2", "M12 20v2",
      "m4.93 4.93 1.41 1.41", "m17.66 17.66 1.41 1.41",
      "M2 12h2", "M20 12h2",
      "m6.34 17.66-1.41 1.41", "m19.07 4.93-1.41 1.41",
    ], c, size),
  },
  Merienda: {
    tone: "#b86b4a",
    bg: "#f8efe9",
    icon: (c, size = 18) => lucideIcon([
      "M12 2a10 10 0 1 0 10 10 4 4 0 0 1-5-5 4 4 0 0 1-5-5",
      "M8.5 8.5v.01", "M16 15.5v.01", "M12 12v.01", "M11 17v.01", "M7 14v.01",
    ], c, size),
  },
  Cena: {
    tone: "#3a5a72",
    bg: "#eef3f7",
    icon: (c, size = 18) => lucideIcon([
      "M20.985 12.486a9 9 0 1 1-9.473-9.472c.405-.022.617.46.402.803a6 6 0 0 0 8.268 8.268c.344-.215.825-.004.803.401",
    ], c, size),
  },
  Postre: {
    tone: "#8a4a6a",
    bg: "#f7eef3",
    icon: (c, size = 18) => lucideIcon([
      "m7 11 4.08 10.35a1 1 0 0 0 1.84 0L17 11",
      "M17 7A5 5 0 0 0 7 7",
      "M17 7a2 2 0 0 1 0 4H7a2 2 0 0 1 0-4",
    ], c, size),
  },
};

function assetUrl(base, path) {
  if (!path) return "";
  if (path.startsWith("data:") || path.startsWith("http://") || path.startsWith("https://")) return path;
  if (!base) return path;
  return `${String(base).replace(/\/$/, "")}${path}`;
}

/** Dish name for a print row course: "first" (primero) or "main" (segundo / plato único). */
function slotCourseName(slot, course) {
  if (!slot?.recipeId) return null;
  if (course === "first") {
    if (!slot.firstRecipeId) return null;
    return RECIPES_BY_ID[slot.firstRecipeId]?.name ?? null;
  }
  return RECIPES_BY_ID[slot.recipeId]?.name ?? null;
}

/**
 * Print rows as fridge blocks:
 *  - Comida folds primero + segundo + postre-de-comida into one Sun-labeled row
 *  - Cena folds plato + postre-de-cena the same way
 *  - Desayuno / Merienda stay their own rows
 */
function buildPrintRows(data, mealFilter, includePostre = true) {
  const meals = getDayMeals(data);
  const allowed = mealFilter?.length
    ? new Set(mealFilter)
    : null;
  const postreWhen = includePostre ? (data?.extraMeals?.postre ?? "off") : "off";
  const postreWithComida = postreWhen === "comida" || postreWhen === "ambas";
  const postreWithCena = postreWhen === "cena" || postreWhen === "ambas";

  const rows = [];
  for (const meal of meals) {
    if (allowed && !allowed.has(meal)) continue;
    if (meal === "Postre") continue; // folded into Comida / Cena below

    if (meal === "Comida") {
      const parts = [
        { meal: "Comida", course: "first", kind: "primero" },
        { meal: "Comida", course: "main", kind: "segundo" },
      ];
      if (postreWithComida) parts.push({ meal: "Postre", course: "main", kind: "postre" });
      rows.push({ id: "Comida", label: "Comida", parts });
      continue;
    }

    if (meal === "Cena") {
      const parts = [{ meal: "Cena", course: "main", kind: "plato" }];
      if (postreWithCena) parts.push({ meal: "Postre", course: "main", kind: "postre" });
      rows.push({ id: "Cena", label: "Cena", parts });
      continue;
    }

    rows.push({
      id: meal,
      label: meal,
      parts: [{ meal, course: "main", kind: "plato" }],
    });
  }
  return rows;
}

function dishFontSize(rowCount, multiGroup, weekCount = 1, dayCount = 5) {
  const stacked = weekCount > 1;
  let base;
  if (stacked) {
    if (rowCount <= 2) base = multiGroup ? 7.5 : 8.5;
    else if (rowCount === 3) base = multiGroup ? 7 : 8;
    else base = multiGroup ? 6.5 : 7.5;
  } else if (rowCount <= 2) {
    base = multiGroup ? 11.5 : 13;
  } else if (rowCount === 3) {
    base = multiGroup ? 10.5 : 12;
  } else if (rowCount === 4) {
    base = multiGroup ? 9.5 : 10.5;
  } else {
    base = multiGroup ? 8.5 : 9.5;
  }
  // Fewer day columns → much wider cells, so the base size (tuned for a full
  // Lun–Vie band) looks tiny and lost. Bump it up for narrow scopes like the
  // weekend (2 cols) so the dishes actually fill the space.
  const widthBoost = dayCount <= 2 ? 1.6
    : dayCount === 3 ? 1.32
      : dayCount === 4 ? 1.12
        : 1;
  return Math.round(base * widthBoost * 10) / 10;
}

function familyPeopleHtml(members, assetBase) {
  const list = (members ?? []).filter((m) => m?.name);
  if (!list.length) return "";
  return list.map((m) => {
    const thumb = memberAvatarThumbSrc(m);
    const src = thumb ? assetUrl(assetBase, thumb) : "";
    const color = m.color || memberAvatarColor(m.id, list);
    const first = (m.name ?? "").trim().split(/\s+/)[0] || m.name;
    const avatar = src
      ? `<img class="av" src="${escapeHtml(src)}" alt="" width="32" height="32" style="border-color:${escapeHtml(color)}" />`
      : `<span class="av init" style="background:${escapeHtml(color)};border-color:${escapeHtml(color)}">${escapeHtml(initialsOf(m.name))}</span>`;
    return `<span class="person">${avatar}<span class="pname">${escapeHtml(first)}</span></span>`;
  }).join("");
}

/** Members of a group eating at school (comedor) for this day/meal. */
function coleMembers(group, members, schedule, day, meal) {
  return membersOfGroup(group, members).filter((m) => {
    const status = schedule?.[slotKey(m.id, day, meal)] ?? "casa";
    return status === "cole";
  });
}

/**
 * School-menu lines for a Comida block (primero / segundo / postre cole).
 * Returns [{ name, cole: true }].
 */
function schoolEntriesForComida(data, schedule, group, day) {
  const atCole = coleMembers(group, data.members ?? [], schedule, day, "Comida");
  if (!atCole.length) return [];

  const seen = new Set();
  const out = [];
  for (const m of atCole) {
    const courses = getSchoolDish(data.schoolMenus, m.id, day);
    if (!hasAnySchoolDish(courses)) continue;
    for (const n of [courses.primero, courses.segundo, courses.postre].filter(Boolean)) {
      const key = n.toLocaleLowerCase("es");
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ name: n, cole: true });
    }
  }
  return out;
}

function resolveWeekCalendar(week, fallbackMenuWeek) {
  if (week?.startISO) {
    return getWeekDatesFromStartISO(week.startISO, week.startDayIdx ?? 0);
  }
  const menuWeek = week
    ? { offset: week.offset ?? 0, startDayIdx: week.startDayIdx ?? 0 }
    : (fallbackMenuWeek ?? { offset: 0, startDayIdx: 0 });
  return getWeekDatesByMenuWeek(menuWeek);
}

function monthBanner(weeks) {
  if (!weeks?.length) return "";
  const first = weeks[0];
  const { dates } = resolveWeekCalendar(first, null);
  const d = dates.Lun ?? Object.values(dates)[0];
  if (!d) return "";
  const label = `${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`;
  return weeks.length > 1
    ? `${label} · ${weeks.length} semanas`
    : "";
}

/** One compact week strip (label + grid) — no page header; stacked in one A4. */
function renderWeekBlock({
  data,
  menuPlan,
  groups,
  schedule,
  dates,
  visibleDays,
  activeDays,
  weekTotal,
  compact,
  mealFilter,
  includePostre,
  includeSchoolMenu,
  labelColPx,
  rowHeightPx,
}) {
  const multiGroup = groups.length > 1;
  const days = visibleDays?.length ? visibleDays : DAYS;
  const activeSet = new Set(activeDays?.length ? activeDays : DAYS);
  const printRows = buildPrintRows(data, mealFilter, includePostre);
  const dishPx = dishFontSize(printRows.length || 2, multiGroup, weekTotal, days.length);
  const iconSize = compact ? 14 : 18;
  const colPx = labelColPx ?? (compact ? 64 : 86);

  const dayHeads = days.map((day) => {
    const date = dates[day];
    const num = date ? date.getDate() : "";
    const inactive = !activeSet.has(day);
    const dayName = compact ? day : (DAY_FULL[day] ?? day);
    // Día + número en la misma línea para ahorrar altura en el pack mensual.
    return `<div class="day-head${inactive ? " inactive" : ""}"><span class="day-name">${escapeHtml(dayName)}</span> <span class="day-num">${escapeHtml(String(num))}</span></div>`;
  }).join("");

  const mealRows = printRows.map((row) => {
    const meta = ROW_META[row.id] ?? ROW_META.Comida;
    const iconHtml = meta.icon(meta.tone, iconSize);
    const isComida = row.id === "Comida";

    const cells = days.map((day) => {
      if (!activeSet.has(day)) {
        return `<div class="cell inactive"><span class="empty">—</span></div>`;
      }

      const bits = [];
      for (const group of groups) {
        const groupTag = multiGroup
          ? `<span class="group">${escapeHtml(group.label)}</span>`
          : "";

        const homeLines = [];
        let tupper = false;
        for (const part of row.parts) {
          // Postre only rides along when the parent meal is actually cooked
          // that day (no phantom dessert on a "fuera"/empty comida or cena).
          if (part.kind === "postre") {
            const parent = menuPlan[group.id]?.[`${day}-${row.id}`];
            if (!parent?.recipeId && !parent?.firstRecipeId) continue;
          }
          const slot = menuPlan[group.id]?.[`${day}-${part.meal}`];
          const name = slotCourseName(slot, part.course);
          if (!name) continue;
          if (slot?.mode === "tupper") tupper = true;
          homeLines.push(name);
        }

        if (homeLines.length) {
          bits.push(
            `<div class="slot">${groupTag}` +
            homeLines.map((n) => `<span class="dish">${escapeHtml(n)}</span>`).join("") +
            `${tupper ? `<span class="tupper">tupper</span>` : ""}</div>`,
          );
        }

        if (isComida && includeSchoolMenu) {
          const school = schoolEntriesForComida(data, schedule, group, day);
          const homeSet = new Set(homeLines.map((n) => n.toLocaleLowerCase("es")));
          const schoolLines = school.filter((s) => !homeSet.has(s.name.toLocaleLowerCase("es")));
          if (schoolLines.length) {
            bits.push(
              `<div class="slot cole">${groupTag}` +
              schoolLines.map((s) =>
                `<span class="dish"><span class="cole-dot" title="Menú del cole"></span>${escapeHtml(s.name)}</span>`,
              ).join("") +
              `${compact ? "" : `<span class="cole-tag">cole</span>`}</div>`,
            );
          }
        }
      }

      const inner = bits.length ? bits.join("") : `<span class="empty">—</span>`;
      return `<div class="cell">${inner}</div>`;
    }).join("");

    const iconOnly = row.id === "Comida" || row.id === "Cena";
    const labelHtml = iconOnly
      ? ""
      : `<span class="meal-name">${escapeHtml(row.label)}</span>`;

    return `<div class="meal-row" style="--meal-tone:${meta.tone};--meal-bg:${meta.bg}">
      <div class="meal-label${iconOnly ? " icon-only" : ""}">
        <span class="glyph">${iconHtml}</span>
        ${labelHtml}
      </div>
      ${cells}
    </div>`;
  }).join("");

  const rowTrack = rowHeightPx
    ? `minmax(0, ${rowHeightPx}px)`
    : "minmax(0, 1fr)";

  return `<section class="week-block">
    <div class="grid" style="--dish-size:${dishPx}px;--label-col:${colPx}px;--day-cols:${days.length};grid-template-columns:var(--label-col) repeat(var(--day-cols),minmax(0,1fr));grid-template-rows:auto repeat(${Math.max(1, printRows.length)},${rowTrack})">
      <div class="corner"></div>
      ${dayHeads}
      ${mealRows}
    </div>
  </section>`;
}

/**
 * Fridge-magnet menu on a single A4 landscape page. Several weeks stack as
 * compact strips under one shared header (brand / familia / QR) — not one
 * full menu per page.
 *
 * @param {object} [opts]
 * @param {string} [opts.assetBase]
 * @param {string} [opts.qrDataUrl]
 * @param {string} [opts.appUrl]
 * @param {Array}  [opts.weeks] orderedWeeks(activeMenu) — multi-week export
 */
export function buildMenuPrintHtml(data, menuPlan, groups, opts = {}) {
  const assetBase = opts.assetBase ?? "";
  const qrDataUrl = opts.qrDataUrl ?? "";
  const appUrl = opts.appUrl ?? "";

  const exportOpts = normalizePdfExportOptions(opts.export, data);
  // Only groups that actually have members count — an empty ghost group must not
  // inflate the density (and force needless extra folios) or draw stray labels.
  const groupsWithMembers = (groups ?? []).filter(
    (g) => membersOfGroup(g, data.members ?? []).length > 0,
  );
  const realGroups = groupsWithMembers.length ? groupsWithMembers : (groups ?? []);
  const visibleGroups = visibleGroupsFor(realGroups, exportOpts);

  // Header avatars only show members of the groups we actually print.
  const includedMemberIds = new Set(
    visibleGroups.flatMap((g) => membersOfGroup(g, data.members ?? []).map((m) => m.id)),
  );
  const headerMembers = (data.members ?? []).filter((m) => includedMemberIds.has(m.id));
  const peopleHtml = familyPeopleHtml(headerMembers, assetBase);

  const weeksIn = Array.isArray(opts.weeks) && opts.weeks.length > 0
    ? opts.weeks
    : [{
        plan: menuPlan,
        offset: data.menuWeek?.offset ?? 0,
        startDayIdx: data.menuWeek?.startDayIdx ?? 0,
        startISO: null,
        schedule: data.schedule,
      }];

  const weekTotal = weeksIn.length;
  const isMonth = weekTotal > 1;
  const monthLabel = monthBanner(weeksIn);

  // Split weeks across sheets when the density would make one page unreadable.
  const perSheet = weeksPerSheet(visibleGroups.length, exportOpts);
  const pages = isMonth ? chunkArray(weeksIn, perSheet) : [weeksIn];
  const maxWeeksPerSheet = pages.length > 1 ? perSheet : weekTotal;
  const compact = maxWeeksPerSheet > 1;

  const visibleDays = resolvePdfVisibleDays(exportOpts);
  const scopeLabel = exportOpts.dayScope === "weekend" ? "Fin de semana" : "Entre semana";
  const scopeIcon = exportOpts.dayScope === "weekend" ? "weekend" : "weekday";

  const spanDatesForWeek = (week) => {
    const cal = resolveWeekCalendar(week, data.menuWeek);
    const active = new Set(cal.activeDays?.length ? cal.activeDays : DAYS);
    const labelDays = visibleDays.filter((d) => active.has(d));
    const useDays = labelDays.length ? labelDays : visibleDays;
    const dts = useDays.map((d) => cal.dates[d]).filter(Boolean);
    return dts.length ? { start: dts[0], end: dts[dts.length - 1] } : null;
  };

  // Full span from the first day of the first week to the last day of the last.
  const firstSpan = spanDatesForWeek(weeksIn[0]);
  const lastSpan = spanDatesForWeek(weeksIn[weeksIn.length - 1]);
  const fullRange = firstSpan && lastSpan
    ? formatDateSpan(firstSpan.start, lastSpan.end)
    : "";

  const chipsFor = () => {
    if (isMonth) {
      return [
        fullRange ? chipHtml("calendar", fullRange) : "",
        chipHtml("layers", `${weekTotal} semanas`),
      ].join("");
    }
    return [
      chipHtml(scopeIcon, scopeLabel),
      fullRange ? chipHtml("calendar", fullRange) : "",
    ].join("");
  };

  const showColeLegend = exportOpts.includeSchoolMenu;
  const title = isMonth ? "Menú del mes" : "Menú semanal";

  // Cap meal-row height so a sparse sheet (e.g. one week alone) doesn't stretch
  // its rows across the whole A4, leaving huge empty cells. Rows fill the page
  // when content is dense and centre vertically when it isn't.
  const mealRows = pdfMealRowCount(exportOpts);
  const rowHeightPx = capRowHeight(mealRows, maxWeeksPerSheet, compact);

  const deco = (path, cls) => {
    const src = assetUrl(assetBase, path);
    return src
      ? `<img class="deco ${cls}" src="${escapeHtml(src)}" alt="" />`
      : "";
  };

  const qrBlock = qrDataUrl
    ? `<div class="qr-wrap">
        <img class="qr" src="${escapeHtml(qrDataUrl)}" alt="QR MenuPlan" width="${compact ? 46 : 60}" height="${compact ? 46 : 60}" />
        <span class="qr-cap">Escanéame</span>
      </div>`
    : "";

  const totalPages = pages.length;
  const sheetsHtml = pages.map((pageWeeks, pageIdx) => {
    const weekBlocks = pageWeeks.map((week) => {
      const plan = week.plan ?? menuPlan;
      const schedule = week.schedule ?? data.schedule ?? {};
      const { dates, activeDays } = resolveWeekCalendar(week, data.menuWeek);
      return renderWeekBlock({
        data,
        menuPlan: plan,
        groups: visibleGroups,
        schedule,
        dates,
        visibleDays,
        activeDays,
        weekTotal: maxWeeksPerSheet,
        compact,
        mealFilter: exportOpts.meals,
        includePostre: exportOpts.includePostre,
        includeSchoolMenu: exportOpts.includeSchoolMenu,
        rowHeightPx,
      });
    }).join("\n");

    const folioTag = totalPages > 1
      ? `<span class="folio">Folio ${pageIdx + 1} de ${totalPages}</span>`
      : "";
    const legendTag = showColeLegend
      ? `<span class="legend"><span class="cole-dot"></span> Menú del cole</span>`
      : "";
    const footerHtml = (legendTag || folioTag)
      ? `<footer class="footer">${legendTag || "<span></span>"}${folioTag}</footer>`
      : "";

    return `<div class="sheet${compact ? " compact" : ""}">
    ${deco("/categories/frutas.png", "tl")}
    ${deco("/categories/verduras.png", "tr")}
    ${deco("/categories/panaderia.png", "bl")}
    ${deco("/categories/huevos.png", "br")}

    <header class="header">
      <div class="header-left">
        <span class="brand">MenuPlan</span>
        <h1>${escapeHtml(title)}</h1>
      </div>
      <div class="header-mid">
        <div class="chips">${chipsFor()}</div>
        ${peopleHtml ? `<div class="people">${peopleHtml}</div>` : ""}
      </div>
      ${qrBlock}
    </header>

    <div class="weeks">
      ${weekBlocks}
    </div>

    ${footerHtml}
  </div>`;
  }).join("\n");

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>${escapeHtml(title)}${monthLabel ? ` — ${escapeHtml(monthLabel)}` : ""}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,600;9..144,700&family=Nunito:wght@600;700;800&display=swap" rel="stylesheet">
<style>
  @page { size: A4 landscape; margin: 7mm; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; height: 100%; }
  body {
    font-family: "Nunito", "Segoe UI", Helvetica, Arial, sans-serif;
    color: #142f1d;
    background: #f3eee4;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .sheet {
    position: relative;
    width: 100%;
    height: calc(210mm - 14mm);
    max-height: calc(210mm - 14mm);
    padding: ${compact ? "6px 8px 4px" : "12px 14px 10px"};
    overflow: hidden;
    display: flex;
    flex-direction: column;
    gap: ${compact ? "4px" : "8px"};
    background:
      radial-gradient(120% 80% at 0% 0%, rgba(76,186,110,.12), transparent 55%),
      radial-gradient(90% 70% at 100% 100%, rgba(201,138,58,.10), transparent 50%),
      linear-gradient(180deg, #fbf8f1 0%, #f3eee4 100%);
  }
  .sheet + .sheet { margin-top: 18px; }
  .deco {
    position: absolute;
    width: ${compact ? "88px" : "120px"};
    height: ${compact ? "88px" : "120px"};
    object-fit: contain;
    opacity: .08;
    pointer-events: none;
    z-index: 0;
  }
  .deco.tl { top: -16px; left: -8px; transform: rotate(-8deg); }
  .deco.tr { top: -6px; right: 90px; transform: rotate(12deg); }
  .deco.bl { bottom: 4px; left: 4px; transform: rotate(6deg); }
  .deco.br { bottom: -2px; right: -4px; transform: rotate(-10deg); }

  .header, .weeks, .footer { position: relative; z-index: 1; }

  .header {
    display: grid;
    grid-template-columns: auto 1fr auto;
    gap: 10px;
    align-items: center;
    flex-shrink: 0;
  }
  .header-left { min-width: 0; }
  .header-mid {
    display: flex;
    flex-direction: row;
    flex-wrap: wrap;
    align-items: center;
    justify-content: center;
    gap: ${compact ? "6px" : "8px"};
    min-width: 0;
  }
  .chips {
    display: inline-flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: center;
    gap: ${compact ? "5px" : "7px"};
  }
  .chip {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: ${compact ? "3px 9px" : "4px 11px"};
    border-radius: 999px;
    background: #fff;
    border: 1.5px solid rgba(45,90,61,.16);
    color: #2d5a3d;
    font-size: ${compact ? "10.5px" : "12px"};
    font-weight: 800;
    white-space: nowrap;
    box-shadow: 0 1px 2px rgba(20,47,29,.05);
  }
  .chip-icon { display: block; flex-shrink: 0; }
  .brand {
    font-family: "Fraunces", Georgia, serif;
    font-weight: 700;
    font-size: ${compact ? "10px" : "12px"};
    letter-spacing: .05em;
    text-transform: uppercase;
    color: #2d5a3d;
  }
  .brand::before {
    content: "";
    display: inline-block;
    width: 8px; height: 8px;
    margin-right: 6px;
    border-radius: 50%;
    background: linear-gradient(135deg, #2d5a3d, #4cba6e);
    vertical-align: middle;
  }
  h1 {
    font-family: "Fraunces", Georgia, serif;
    font-weight: 700;
    font-size: ${compact ? "16px" : "26px"};
    margin: 0;
    letter-spacing: -.02em;
    color: #142f1d;
    line-height: 1.05;
  }
  .pill {
    display: inline-flex;
    align-items: center;
    padding: 4px 11px;
    border-radius: 999px;
    background: rgba(45,90,61,.10);
    color: #2d5a3d;
    font-size: ${compact ? "11px" : "12px"};
    font-weight: 800;
    white-space: nowrap;
  }
  .people {
    display: inline-flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: center;
    gap: ${compact ? "6px" : "9px"};
    padding: ${compact ? "3px 10px 3px 6px" : "4px 12px 4px 7px"};
    border-radius: 999px;
    background: rgba(45,90,61,.06);
    border: 1.5px solid rgba(45,90,61,.12);
  }
  .person { display: inline-flex; align-items: center; gap: 5px; }
  .av {
    width: ${compact ? "26px" : "32px"};
    height: ${compact ? "26px" : "32px"};
    border-radius: 50%;
    object-fit: cover;
    display: block;
    border: 2.5px solid #2d5a3d;
    background: #e8eee9;
    box-shadow: 0 1px 2px rgba(20,47,29,.12);
  }
  .av.init {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: ${compact ? "9px" : "11px"};
    font-weight: 800;
    color: #fff;
  }
  .pname {
    font-size: ${compact ? "12px" : "14px"};
    font-weight: 800;
    color: #142f1d;
  }

  .qr-wrap {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1px;
    padding: ${compact ? "3px 5px" : "6px 8px"};
    border-radius: 12px;
    background: rgba(255,255,255,.72);
    border: 1px solid rgba(45,90,61,.14);
  }
  .qr { display: block; border-radius: 5px; }
  .qr-cap { font-size: 8.5px; font-weight: 800; color: #2d5a3d; }
  .qr-url { font-size: 7.5px; font-weight: 600; color: #7a8a7f; max-width: 90px; text-align: center; word-break: break-all; }

  .weeks {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: ${compact ? "6px" : "0"};
  }
  .week-block {
    flex: 0 0 auto;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }

  .grid {
    flex: 0 0 auto;
    min-height: 0;
    display: grid;
    /* grid-template-columns set inline per week (--label-col / --day-cols) */
    /* grid-template-rows set inline per week (auto day-head + 1fr meal rows) */
    border: 1.5px solid rgba(45,90,61,.22);
    border-radius: ${compact ? "10px" : "16px"};
    overflow: hidden;
    background: rgba(255,255,255,.55);
  }
  .corner {
    background: linear-gradient(135deg, #2d5a3d, #3f7a52);
    min-height: 0;
  }
  .day-head {
    display: flex;
    flex-direction: row;
    align-items: center;
    justify-content: center;
    gap: 4px;
    padding: ${compact ? "1px 3px" : "3px 4px"};
    background: linear-gradient(180deg, #2d5a3d 0%, #244a32 100%);
    color: #fff;
    text-align: center;
    white-space: nowrap;
    line-height: 1.1;
    min-height: 0;
  }
  .day-head.inactive {
    background: linear-gradient(180deg, #9aaba0 0%, #87968c 100%);
    color: rgba(255,255,255,.72);
  }
  .day-name {
    font-size: ${compact ? "7.5px" : "9.5px"};
    font-weight: 800;
    letter-spacing: .04em;
    text-transform: uppercase;
    opacity: .92;
  }
  .day-num {
    font-family: "Fraunces", Georgia, serif;
    font-size: ${compact ? "10px" : "13px"};
    font-weight: 700;
    line-height: 1;
  }

  .meal-row { display: contents; }
  .meal-label {
    display: flex;
    flex-direction: ${compact ? "row" : "column"};
    align-items: center;
    justify-content: ${compact ? "flex-start" : "center"};
    gap: ${compact ? "5px" : "6px"};
    padding: ${compact ? "3px 5px" : "10px 6px"};
    background: #fff;
    border-top: 1px solid rgba(45,90,61,.12);
    border-right: 3px solid var(--meal-tone);
    color: var(--meal-tone);
    text-align: ${compact ? "left" : "center"};
  }
  .meal-label.icon-only {
    justify-content: center;
    flex-direction: column;
    padding: ${compact ? "2px 3px" : "8px 4px"};
  }
  .glyph {
    width: ${compact ? "22px" : "38px"};
    height: ${compact ? "22px" : "38px"};
    border-radius: 50%;
    background: var(--meal-bg);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    box-shadow: inset 0 0 0 1.5px color-mix(in srgb, var(--meal-tone) 28%, transparent);
  }
  .meal-icon { display: block; flex-shrink: 0; }
  .meal-name {
    font-size: ${compact ? "7.5px" : "9.5px"};
    font-weight: 800;
    letter-spacing: .04em;
    text-transform: uppercase;
    line-height: 1.05;
  }
  .cell {
    border-top: 1px solid rgba(45,90,61,.12);
    border-left: 1px solid rgba(45,90,61,.10);
    padding: ${compact ? "2px 3px" : "7px 6px"};
    background: rgba(255,255,255,.72);
    min-height: 0;
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: ${compact ? "2px" : "5px"};
    overflow: hidden;
  }
  .cell.inactive {
    background: repeating-linear-gradient(
      -45deg, #eef1ef, #eef1ef 5px, #e6ebe7 5px, #e6ebe7 10px
    );
    opacity: .7;
  }
  .slot { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
  .dish {
    font-size: var(--dish-size, 12px);
    font-weight: 700;
    line-height: 1.15;
    color: #142f1d;
    overflow-wrap: anywhere;
  }
  .cole-dot {
    display: inline-block;
    width: ${compact ? "5px" : "7px"};
    height: ${compact ? "5px" : "7px"};
    border-radius: 50%;
    background: ${COLE_COLOR};
    margin-right: 4px;
    vertical-align: middle;
    box-shadow: 0 0 0 1.5px rgba(29,111,216,.18);
  }
  .cole-tag {
    align-self: flex-start;
    font-size: 7.5px;
    font-weight: 800;
    letter-spacing: .04em;
    text-transform: uppercase;
    color: ${COLE_COLOR};
    background: rgba(29,111,216,.10);
    border-radius: 999px;
    padding: 0 5px;
  }
  .group {
    font-size: ${compact ? "6.5px" : "8px"};
    font-weight: 800;
    letter-spacing: .03em;
    text-transform: uppercase;
    color: #2d5a3d;
    opacity: .75;
  }
  .tupper {
    align-self: flex-start;
    font-size: 7px;
    font-weight: 800;
    text-transform: uppercase;
    color: #3a5a72;
    background: #e8eef3;
    border-radius: 999px;
    padding: 0 5px;
  }
  .empty {
    color: #c5cdc7;
    font-size: ${compact ? "10px" : "14px"};
    font-weight: 700;
    text-align: center;
  }

  .footer {
    flex-shrink: 0;
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0 2px;
    font-size: ${compact ? "9px" : "10.5px"};
    font-weight: 700;
    color: #7a8a7f;
    gap: 10px;
  }
  .footer strong { color: #2d5a3d; }
  .legend {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    color: ${COLE_COLOR};
    font-weight: 800;
  }
  .folio {
    display: inline-flex;
    align-items: center;
    padding: 2px 9px;
    border-radius: 999px;
    background: rgba(45,90,61,.08);
    color: #2d5a3d;
    font-weight: 800;
  }

  @media print {
    html, body { height: auto; }
    body { background: #fff; }
    .sheet {
      height: auto;
      max-height: none;
      min-height: calc(210mm - 14mm);
      padding: 0;
      background: #fbf8f1;
    }
    .sheet + .sheet { margin-top: 0; page-break-before: always; break-before: page; }
  }
</style>
</head>
<body>
  ${sheetsHtml}
</body>
</html>`;
}


export function formatShoppingText(shopping) {
  const rawItems = shopping?.items ?? [];
  if (!rawItems.length) return "La lista de la compra está vacía.";

  const merged = mergeShoppingItems(rawItems);
  const shoppingItems = merged.filter((it) => !isPantryItem(it)).map(enrichItem);
  const pantryItems = merged
    .filter(isPantryItem)
    .sort((a, b) => a.name.localeCompare(b.name));
  const groups = itemsByAisle(shoppingItems);

  const lines = ["LISTA DE LA COMPRA", ""];

  for (const { aisle, items } of groups) {
    if (!items?.length) continue;
    lines.push(aisle.toUpperCase());
    for (const it of items) {
      const check = it.have || it.atHome ? "✓" : "·";
      lines.push(`  ${check} ${it.name} — ${it.displayQty ?? it.qty}`);
    }
    lines.push("");
  }

  if (pantryItems.length > 0) {
    lines.push("YA LO TIENES EN CASA");
    for (const it of pantryItems) {
      lines.push(`  · ${it.name} — ${it.displayQty ?? it.qty}`);
    }
    lines.push("");
  }

  return lines.join("\n").trim();
}

async function shareText(title, text) {
  if (typeof navigator !== "undefined" && navigator.share) {
    try {
      await navigator.share({ title, text });
      return { method: "share" };
    } catch (err) {
      if (err?.name === "AbortError") return { method: "cancelled" };
    }
  }

  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return { method: "clipboard" };
  }

  return { method: "none" };
}

function downloadText(text, filename) {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export async function shareMenu(data, menuPlan, groups) {
  const text = formatMenuText(data, menuPlan, groups);
  const result = await shareText("Menú semanal", text);
  if (result.method !== "none") return result;
  return downloadMenu(data, menuPlan, groups);
}

export async function downloadMenu(data, menuPlan, groups) {
  const text = formatMenuText(data, menuPlan, groups);
  const filename = `menu-${formatWeekRangeLabel(getWeekDates()).replace(/\s+/g, "")}.txt`;
  downloadText(text, filename);
  return { method: "download" };
}

/**
 * Printable fridge PDF on a single A4. Pass opts.weeks (from
 * orderedWeeks(activeMenu)) to stack every week as compact strips under one
 * shared header.
 */
export async function downloadMenuPdf(data, menuPlan, groups, opts = {}) {
  const win = typeof window !== "undefined" ? window.open("", "_blank") : null;
  if (!win) return downloadMenu(data, menuPlan, groups);

  const assetBase = typeof window !== "undefined" ? (window.location?.origin ?? "") : "";
  const appUrl = assetBase || "";
  let qrDataUrl = "";
  try {
    qrDataUrl = await QRCode.toDataURL(appUrl || "https://menuplan.app", {
      width: 176,
      margin: 1,
      color: { dark: "#142f1d", light: "#ffffff" },
      errorCorrectionLevel: "M",
    });
  } catch {
    qrDataUrl = "";
  }

  const html = buildMenuPrintHtml(data, menuPlan, groups, {
    assetBase,
    qrDataUrl,
    appUrl,
    weeks: opts.weeks,
    export: opts.export,
  });
  win.document.open();
  win.document.write(html);
  win.document.close();

  await new Promise((resolve) => {
    if (win.document.readyState === "complete") resolve();
    else win.addEventListener("load", resolve, { once: true });
  });

  const imgs = [...(win.document.images ?? [])];
  await Promise.all(
    imgs.map((img) => {
      if (img.complete) return Promise.resolve();
      return new Promise((resolve) => {
        img.addEventListener("load", resolve, { once: true });
        img.addEventListener("error", resolve, { once: true });
      });
    }),
  );

  await new Promise((r) => setTimeout(r, 280));
  if (win.document.fonts?.ready) {
    try { await win.document.fonts.ready; } catch { /* ignore */ }
  }

  win.focus();
  win.print();
  return { method: "print" };
}

export async function shareShoppingList(shopping) {
  const text = formatShoppingText(shopping);
  const result = await shareText("Lista de la compra", text);
  if (result.method !== "none") return result;
  const filename = `lista-compra.txt`;
  downloadText(text, filename);
  return { method: "download" };
}

export async function exportMenu(data, menuPlan, groups) {
  return shareMenu(data, menuPlan, groups);
}
