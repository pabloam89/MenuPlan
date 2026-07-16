import { getWeekDatesByMenuWeek } from "./weekCalendar.js";

// A "menú" used to mean exactly one calendar week. It can now span several
// weeks generated in one go (`data.menuWeekOffsets`, not necessarily
// consecutive), and a signed-in user can keep several such menús around
// (current + history) instead of always overwriting the one active plan.
// This module holds the small pure helpers around that: ids, date-range
// math, and archive bookkeeping — kept separate from App.jsx so they're
// trivial to unit test.

export const MAX_MENU_WEEKS = 5;

// Fase 8 (multi-week-menus plan): a signed-in account's archive now lives in
// user_menus/user_menu_weeks/user_menu_recipes, not the user_state JSONB blob
// (App.jsx no longer writes data.menus there — see the debounced profile
// push), so the old "unbounded history = unbounded cloud write amplification"
// pressure is gone. This cap now only bounds what stays in memory/localStorage
// per session (still relevant for guests, who have no cloud tables) — raised
// well past real-world usage rather than removed outright, since there's no
// pagination yet for the in-memory Histórico list.
export const MAX_HISTORY_MENUS = 40;

// Favourites and the active menú are never pruned by MAX_HISTORY_MENUS (see
// pruneMenuHistory) — that's the whole point of favouriting one. But nothing
// stopped that set from growing without bound, and each entry carries a full
// week's plan/shopping list; combined with storage.js silently swallowing
// QuotaExceededError, an account with hundreds of favourites could eventually
// lose ALL local state with zero warning. This is a last-resort safety net,
// not a normal product cap — it should essentially never trigger.
export const MAX_PROTECTED_MENUS = 150;

export function clampWeekCount(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return 1;
  return Math.min(MAX_MENU_WEEKS, Math.max(1, Math.round(v)));
}

export function createMenuId() {
  return `menu_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
}

function isoDate(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Resolves a week (given as an offset from "today", the same way
 * data.menuWeek already works) into its absolute calendar bounds, captured
 * as ISO date strings. Must be called at GENERATION time — offsets are
 * relative to "today", so they stop being meaningful once time has passed
 * and are useless for a menú viewed later in the history list.
 */
export function computeWeekRange(offset, startDayIdx = 0) {
  const { dates, activeDays } = getWeekDatesByMenuWeek({ offset, startDayIdx });
  const first = dates[activeDays[0]];
  const last = dates[activeDays[activeDays.length - 1]];
  return {
    startISO: isoDate(first),
    endISO: isoDate(last),
    activeDays,
  };
}

export function formatISODateShort(iso) {
  if (!iso) return "";
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
}

/** "07/07 – 21/07" style label spanning every week stored on the menú. */
export function formatMenuRangeLabel(menu) {
  const weeks = menu?.weeks ? Object.values(menu.weeks) : [];
  if (weeks.length === 0) return "";
  const sorted = [...weeks].sort((a, b) => a.offset - b.offset);
  const start = sorted[0]?.startISO;
  const end = sorted[sorted.length - 1]?.endISO;
  if (!start) return "";
  const startLabel = formatISODateShort(start);
  const endLabel = formatISODateShort(end);
  return startLabel === endLabel ? startLabel : `${startLabel} – ${endLabel}`;
}

/** Menús sorted newest-first by creation time (undefined-safe). */
export function sortMenusDesc(menus) {
  return Object.values(menus ?? {}).sort((a, b) => (b?.createdAt ?? 0) - (a?.createdAt ?? 0));
}

export function getActiveMenu(menus, activeMenuId) {
  if (!activeMenuId) return null;
  return menus?.[activeMenuId] ?? null;
}

/** Weeks of a menú ordered by offset (0 = first/earliest). */
export function orderedWeeks(menu) {
  if (!menu?.weeks) return [];
  return Object.entries(menu.weeks)
    .map(([weekStart, w]) => ({ weekStart, ...w }))
    .sort((a, b) => a.offset - b.offset);
}

/**
 * Trims the archive to at most MAX_HISTORY_MENUS entries. Never drops the
 * active menú; favourites are also kept regardless of MAX_HISTORY_MENUS, but
 * are still subject to the MAX_PROTECTED_MENUS safety net below. Plain
 * inactive menús are the normal trim candidates, removed oldest-first (by
 * createdAt). Pure — returns a new map.
 */
export function pruneMenuHistory(menus, max = MAX_HISTORY_MENUS) {
  const all = Object.values(menus ?? {});
  const active = all.filter((m) => m.isActive);
  let favorites = all.filter((m) => !m.isActive && m.isFavorite);

  // Safety net: if favourites alone blow past MAX_PROTECTED_MENUS, demote the
  // oldest excess ones (unfavourite, don't delete outright) back into the
  // normal trimmable pool instead of letting the archive grow forever.
  let demoted = [];
  if (favorites.length > MAX_PROTECTED_MENUS) {
    favorites = [...favorites].sort((a, b) => (b?.createdAt ?? 0) - (a?.createdAt ?? 0));
    demoted = favorites.slice(MAX_PROTECTED_MENUS).map((m) => ({ ...m, isFavorite: false }));
    favorites = favorites.slice(0, MAX_PROTECTED_MENUS);
  }

  const protectedMenus = [...active, ...favorites];
  const trimmable = [...all.filter((m) => !m.isActive && !m.isFavorite), ...demoted].sort(
    (a, b) => (b?.createdAt ?? 0) - (a?.createdAt ?? 0),
  );
  const keepTrimmable = Math.max(0, max - protectedMenus.length);
  const kept = [...protectedMenus, ...trimmable.slice(0, keepTrimmable)];
  return Object.fromEntries(kept.map((m) => [m.id, m]));
}

/**
 * Folds a freshly generated menú into the existing archive.
 * - Signed-in users keep history: the previous active menú (if any) is kept
 *   in the map, just flagged inactive, then the archive is capped (see
 *   pruneMenuHistory) so it can't grow without bound.
 * - Guests never keep history (single active menú, per product decision):
 *   the archive is replaced outright with only the new menú.
 */
export function foldInNewMenu(menus, newMenu, { keepHistory }) {
  if (!keepHistory) return { [newMenu.id]: newMenu };
  const next = {};
  for (const [id, m] of Object.entries(menus ?? {})) {
    next[id] = m.isActive ? { ...m, isActive: false } : m;
  }
  next[newMenu.id] = newMenu;
  return pruneMenuHistory(next);
}

/** Recipe ids referenced by a single week's plan (main + primero slots). */
function planRecipeIds(plan, into) {
  if (!plan || typeof plan !== "object") return;
  for (const slots of Object.values(plan)) {
    // Skip non-slot-map entries like plan._warnings.
    if (!slots || typeof slots !== "object" || Array.isArray(slots)) continue;
    for (const slot of Object.values(slots)) {
      if (!slot || typeof slot !== "object") continue;
      if (slot.recipeId) into.add(slot.recipeId);
      if (slot.firstRecipeId) into.add(slot.firstRecipeId);
    }
  }
}

/**
 * Every recipe id referenced by any week of any menú in the archive. Used to
 * prune the AI-generated recipe cache down to what's still reachable, so it
 * doesn't accumulate dishes from menús that have since been trimmed.
 */
export function collectMenuRecipeIds(menus) {
  const ids = new Set();
  for (const menu of Object.values(menus ?? {})) {
    for (const week of Object.values(menu?.weeks ?? {})) {
      planRecipeIds(week?.plan, ids);
    }
  }
  return ids;
}

/**
 * Drops AI recipes no longer referenced by any retained menú. `keepIds` is the
 * set from collectMenuRecipeIds; `extraKeep` covers ids referenced by live
 * state not yet in the archive (e.g. the just-materialized active week).
 */
export function pruneAiRecipes(aiRecipes, keepIds, extraKeep = null) {
  if (!Array.isArray(aiRecipes)) return [];
  return aiRecipes.filter((r) => {
    if (!r?.id) return false;
    return keepIds.has(r.id) || (extraKeep ? extraKeep.has(r.id) : false);
  });
}

export function removeMenu(menus, menuId) {
  const next = { ...(menus ?? {}) };
  delete next[menuId];
  return next;
}

export function toggleMenuFavorite(menus, menuId) {
  const menu = menus?.[menuId];
  if (!menu) return menus;
  return { ...menus, [menuId]: { ...menu, isFavorite: !menu.isFavorite } };
}
