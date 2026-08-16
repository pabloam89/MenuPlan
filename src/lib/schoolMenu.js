export const SCHOOL_DAYS = ["Lun", "Mar", "Mié", "Jue", "Vie"];
export const SCHOOL_COURSES = ["Primero", "Segundo", "Postre"];

// ─── Multi-week school menus ───────────────────────────────────────────────
//
// Canonical shape:
//   schoolMenus = {
//     shared:   { "Lun-Primero": "...", ... },   // mirror of weeks[0].shared
//     byMember: { [memberId]: { ... } },           // mirror of weeks[0].byMember
//     weeks: [ { label, shared:{...}, byMember:{...} }, ... ],
//   }
//
// Legacy state only had top-level `shared`/`byMember` (one week). We keep those
// mirroring weeks[0] so every existing consumer (getSchoolDish, exports,
// insights, schedule presets) keeps working untouched, while the planner can
// now pull a *different* school week per generated menu week.

function cloneEntries(map) {
  return map && typeof map === "object" ? { ...map } : {};
}

function cloneByMember(byMember) {
  const out = {};
  if (byMember && typeof byMember === "object") {
    for (const [id, entries] of Object.entries(byMember)) out[id] = cloneEntries(entries);
  }
  return out;
}

/**
 * Normalize any (possibly legacy) schoolMenus object into the canonical
 * multi-week shape. Always returns at least one week; weeks[0] is mirrored to
 * the top-level `shared`/`byMember` for backward compatibility.
 */
export function normalizeSchoolMenus(sm) {
  const base = sm && typeof sm === "object" ? sm : {};
  let weeks = Array.isArray(base.weeks) ? base.weeks : null;
  if (!weeks || weeks.length === 0) {
    weeks = [{ label: "Semana 1", shared: base.shared, byMember: base.byMember }];
  }
  weeks = weeks.map((w, i) => ({
    label: (w && w.label) || `Semana ${i + 1}`,
    shared: cloneEntries(w && w.shared),
    byMember: cloneByMember(w && w.byMember),
    // Preserve parse-time catalog id mapping (keys match the entries dicts).
    catalogIds: (w && w.catalogIds) ? { ...w.catalogIds } : {},
  }));
  return {
    ...base,
    shared: weeks[0].shared,
    byMember: weeks[0].byMember,
    weeks,
  };
}

/** Number of stored school-menu weeks (>= 1). */
export function schoolWeekCount(sm) {
  return normalizeSchoolMenus(sm).weeks.length;
}

/**
 * The single-week { shared, byMember } view for a given week index. Cycles when
 * the index exceeds the number of stored weeks so a 4-week menú can rotate
 * through, e.g. 2 uploaded school weeks.
 */
export function schoolMenusForWeekIndex(sm, idx = 0) {
  const weeks = normalizeSchoolMenus(sm).weeks;
  if (weeks.length === 0) return { shared: {}, byMember: {} };
  const i = ((Math.trunc(idx) % weeks.length) + weeks.length) % weeks.length;
  return { shared: weeks[i].shared, byMember: weeks[i].byMember };
}

/**
 * Replace the whole ordered list of weeks for a given scope with the supplied
 * per-week entry maps (each an "Lun-Primero"→dish object). The other scope's
 * data is preserved where weeks overlap.
 *
 *   scope === "shared"     → sets weeks[i].shared
 *   scope === "individual" → sets weeks[i].byMember[kidId]
 */
export function replaceSchoolWeeks(sm, { scope, kidId, weeksEntries, weeksCatalogIds }) {
  const norm = normalizeSchoolMenus(sm);
  const list = Array.isArray(weeksEntries) ? weeksEntries : [];
  const catList = Array.isArray(weeksCatalogIds) ? weeksCatalogIds : [];
  const out = list.map((entries, i) => {
    const prev = norm.weeks[i] ?? { shared: {}, byMember: {}, catalogIds: {} };
    // Prefer freshly-computed catalog ids; fall back to previously stored ones.
    const catalogIds = catList[i] ?? prev.catalogIds ?? {};
    if (scope === "shared") {
      return { label: `Semana ${i + 1}`, shared: cloneEntries(entries), byMember: cloneByMember(prev.byMember), catalogIds };
    }
    return {
      label: `Semana ${i + 1}`,
      shared: cloneEntries(prev.shared),
      byMember: { ...cloneByMember(prev.byMember), [kidId]: cloneEntries(entries) },
      catalogIds,
    };
  });
  const weeks = out.length ? out : [{ label: "Semana 1", shared: {}, byMember: {}, catalogIds: {} }];
  return { ...norm, shared: weeks[0].shared, byMember: weeks[0].byMember, weeks };
}

/** Set a single cell for a scope + week, adding empty weeks if needed. */
export function setSchoolDishAt(sm, { scope, kidId, weekIndex = 0, day, course, value }) {
  const norm = normalizeSchoolMenus(sm);
  const weeks = norm.weeks.map((w) => ({ label: w.label, shared: cloneEntries(w.shared), byMember: cloneByMember(w.byMember) }));
  while (weeks.length <= weekIndex) {
    weeks.push({ label: `Semana ${weeks.length + 1}`, shared: {}, byMember: {} });
  }
  const trimmed = (value ?? "").trim();
  const key = `${day}-${course}`;
  const target =
    scope === "shared"
      ? weeks[weekIndex].shared
      : (weeks[weekIndex].byMember[kidId] = weeks[weekIndex].byMember[kidId] ?? {});
  if (scope === "shared") {
    if (trimmed) weeks[weekIndex].shared[key] = trimmed;
    else delete weeks[weekIndex].shared[key];
  } else if (kidId) {
    if (trimmed) target[key] = trimmed;
    else delete target[key];
  }
  return { ...norm, shared: weeks[0].shared, byMember: weeks[0].byMember, weeks };
}

/** True when a single entry map (shared or per-kid) holds any dish. */
function mapHasDish(map) {
  return Boolean(map && Object.keys(map).some((k) => String(map[k] ?? "").trim()));
}

/**
 * Clear one week's dishes for a scope (shared → weeks[i].shared; individual →
 * weeks[i].byMember[kidId]), then drop any week left fully empty across both
 * scopes. Always keeps at least one (empty) week.
 */
export function clearSchoolWeek(sm, { scope, kidId, weekIndex = 0 }) {
  const norm = normalizeSchoolMenus(sm);
  const weeks = norm.weeks.map((w) => ({ label: w.label, shared: cloneEntries(w.shared), byMember: cloneByMember(w.byMember) }));
  if (weeks[weekIndex]) {
    if (scope === "shared") weeks[weekIndex].shared = {};
    else if (kidId) delete weeks[weekIndex].byMember[kidId];
  }
  const pruned = weeks.filter((w) => mapHasDish(w.shared) || Object.values(w.byMember).some(mapHasDish));
  const out = pruned.length ? pruned : [{ label: "Semana 1", shared: {}, byMember: {} }];
  return { ...norm, shared: out[0].shared, byMember: out[0].byMember, weeks: out };
}

/**
 * Clear *every* week for a scope (shared or one member), then prune weeks left
 * fully empty across both scopes. Preserves the other scope's dishes. This is
 * the "vaciar menú" (empty the whole menu) action, distinct from clearing a
 * single week.
 */
export function clearSchoolScope(sm, { scope, kidId }) {
  const norm = normalizeSchoolMenus(sm);
  const weeks = norm.weeks.map((w) => ({ label: w.label, shared: cloneEntries(w.shared), byMember: cloneByMember(w.byMember) }));
  for (const w of weeks) {
    if (scope === "shared") w.shared = {};
    else if (kidId) delete w.byMember[kidId];
  }
  const pruned = weeks.filter((w) => mapHasDish(w.shared) || Object.values(w.byMember).some(mapHasDish));
  const out = pruned.length ? pruned : [{ label: "Semana 1", shared: {}, byMember: {} }];
  return { ...norm, shared: out[0].shared, byMember: out[0].byMember, weeks: out };
}

// ─── Per-cell category overrides ───────────────────────────────────────────
// The stored dish is just free text, so we can't always guess the right
// category illustration. These let the review UI persist a manual category
// choice per cell without touching the dish-name maps every consumer reads.
export function schoolIconOverrideKey({ weekIndex = 0, scope, kidId, day, course }) {
  const who = scope === "shared" ? "shared" : kidId || "";
  return `${weekIndex}|${scope}|${who}|${day}-${course}`;
}

export function getSchoolIconOverride(sm, args) {
  const norm = normalizeSchoolMenus(sm);
  return norm.iconOverrides?.[schoolIconOverrideKey(args)] ?? null;
}

export function setSchoolIconOverride(sm, { value, ...args }) {
  const norm = normalizeSchoolMenus(sm);
  const overrides = { ...(norm.iconOverrides ?? {}) };
  const key = schoolIconOverrideKey(args);
  if (value) overrides[key] = value;
  else delete overrides[key];
  return { ...norm, iconOverrides: overrides };
}

/**
 * Lookup the courses (1º / 2º / Postre) for a given member on a given school
 * day. Per-member entries take precedence over the family-wide "shared" map.
 * `weekIndex` selects which stored school week to read (default: first).
 *
 * Returns: { primero: string, segundo: string, postre: string }
 */
export function getSchoolDish(schoolMenus, memberId, day, weekIndex = 0) {
  if (!schoolMenus) return { primero: "", segundo: "", postre: "" };
  const { shared, byMember } = schoolMenusForWeekIndex(schoolMenus, weekIndex);
  const out = { primero: "", segundo: "", postre: "" };
  const own = byMember?.[memberId] ?? {};
  for (const course of SCHOOL_COURSES) {
    const k = `${day}-${course}`;
    const value =
      (typeof own[k] === "string" && own[k].trim()) ||
      (typeof shared[k] === "string" && shared[k].trim()) ||
      "";
    out[course.toLowerCase()] = value;
  }
  return out;
}

export function hasAnySchoolDish(courses) {
  return Boolean(courses && (courses.primero || courses.segundo || courses.postre));
}

/** True when a single entry map (shared or per-kid) holds any dish. */
function entryMapHasDish(map) {
  return Boolean(map && Object.keys(map).some((k) => String(map[k] ?? "").trim()));
}

/** True when the household has uploaded any school dish (any week, any scope). */
export function householdHasSchoolMenu(schoolMenus) {
  if (!schoolMenus || typeof schoolMenus !== "object") return false;
  const weeks = normalizeSchoolMenus(schoolMenus).weeks;
  for (const w of weeks) {
    if (entryMapHasDish(w.shared)) return true;
    for (const courses of Object.values(w.byMember ?? {})) {
      if (entryMapHasDish(courses)) return true;
    }
  }
  return false;
}
