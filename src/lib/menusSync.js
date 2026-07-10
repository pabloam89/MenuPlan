import { supabase } from "./supabase.js";

/**
 * Cloud persistence for multi-week menús (see 0005_multiweek_menus.sql:
 * user_menus / user_menu_weeks / user_menu_recipes). Maps the camelCase
 * shape lib/menuArchive.js already works with (menu.weeks keyed by
 * startISO, see App.jsx's newMenu construction) to/from the normalized
 * snake_case rows.
 *
 * Fase 1 of the multi-week-menus plan: access layer only, no behavior
 * change — nothing in App.jsx calls this yet. The localStorage/user_state
 * blob (data.menus) stays the actual source of truth until later phases
 * wire dual-write/read-preference in.
 *
 * All functions degrade gracefully: no Supabase / no session → no-op (or an
 * empty/null result), matching lib/userRecipesSync.js's convention.
 */

// ── Row <-> camelCase mapping (pure, exported for direct unit testing) ────

export function menuToRow(menu, userId) {
  return {
    id: menu.id,
    user_id: userId,
    variety_pref: menu.varietyPref ?? "strict",
    is_favorite: Boolean(menu.isFavorite),
    // Activation is always a separate, explicit step (see activateMenu) —
    // never set true here, so a menú that fails partway through saveMenu
    // (weeks or recipes) can never end up "active" with missing data.
    is_active: false,
  };
}

export function rowToMenuSummary(row) {
  return {
    id: row.id,
    varietyPref: row.variety_pref ?? "strict",
    isFavorite: Boolean(row.is_favorite),
    isActive: Boolean(row.is_active),
    createdAt: row.created_at ? Date.parse(row.created_at) : Date.now(),
    updatedAt: row.updated_at ? Date.parse(row.updated_at) : Date.now(),
  };
}

export function weekToRow(userId, menuId, startISO, week) {
  return {
    user_id: userId,
    menu_id: menuId,
    week_start: startISO,
    week_end: week.endISO,
    week_offset: week.offset,
    start_day_idx: week.startDayIdx ?? 0,
    plan: week.plan ?? {},
    shopping: week.shopping ?? { items: [] },
    schedule: week.schedule ?? {},
  };
}

export function rowToWeek(row) {
  return {
    offset: row.week_offset,
    startDayIdx: row.start_day_idx,
    startISO: row.week_start,
    endISO: row.week_end,
    plan: row.plan ?? {},
    shopping: row.shopping ?? { items: [] },
    schedule: row.schedule ?? {},
  };
}

// ── Public API ──────────────────────────────────────────────────────────

/**
 * Persists a menú (metadata + every week + every referenced recipe
 * snapshot) as a single logical write, always inserted inactive — call
 * activateMenu() afterwards if it should become the active one, so a
 * partially-written menú is never live (see activate_user_menu RPC).
 *
 * On any failure partway through, the rows already written for this menú
 * are deleted (cascades weeks/recipes) so the cloud never holds a broken
 * menú — the caller's localStorage copy is unaffected either way.
 *
 * @param {string} userId
 * @param {Object} menu - camelCase shape from menuArchive.js (id, createdAt,
 *   isFavorite, isActive, varietyPref, weeks: { [startISO]: {...} })
 * @param {Object[]} [recipes] - frontend recipe objects referenced by this
 *   menú's weeks; the caller decides which ones (e.g. the `allRecipes`
 *   array already collected during generation — see App.jsx)
 * @returns {Promise<{ ok: boolean, error?: string }>}
 */
export async function saveMenu(userId, menu, recipes = []) {
  if (!supabase || !userId || !menu?.id) return { ok: false, error: "no-op" };

  const { error: menuError } = await supabase
    .from("user_menus")
    .upsert(menuToRow(menu, userId), { onConflict: "user_id,id" });
  if (menuError) {
    console.warn("[menusSync] save menu failed", menuError.message);
    return { ok: false, error: menuError.message };
  }

  const weekRows = Object.entries(menu.weeks ?? {}).map(([startISO, week]) =>
    weekToRow(userId, menu.id, startISO, week),
  );
  if (weekRows.length > 0) {
    const { error: weeksError } = await supabase
      .from("user_menu_weeks")
      .upsert(weekRows, { onConflict: "user_id,menu_id,week_start" });
    if (weeksError) {
      console.warn("[menusSync] save weeks failed", weeksError.message);
      await deleteMenu(userId, menu.id);
      return { ok: false, error: weeksError.message };
    }
  }

  const recipeRows = recipes
    .filter((r) => r?.id)
    .map((r) => ({ user_id: userId, menu_id: menu.id, recipe_id: r.id, recipe_snapshot: r }));
  if (recipeRows.length > 0) {
    const { error: recipesError } = await supabase
      .from("user_menu_recipes")
      .upsert(recipeRows, { onConflict: "user_id,menu_id,recipe_id" });
    if (recipesError) {
      console.warn("[menusSync] save recipes failed", recipesError.message);
      await deleteMenu(userId, menu.id);
      return { ok: false, error: recipesError.message };
    }
  }

  return { ok: true };
}

/** Lightweight list for a history screen: metadata only, no weeks/recipes. */
export async function loadMenuSummaries(userId) {
  if (!supabase || !userId) return [];
  const { data, error } = await supabase
    .from("user_menus")
    .select("id, variety_pref, is_favorite, is_active, created_at, updated_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) {
    console.warn("[menusSync] load summaries failed", error.message);
    return [];
  }
  return (data ?? []).map(rowToMenuSummary);
}

/**
 * Full menú (every week + every recipe snapshot) for opening one history
 * entry. Returns null if not found or on any read failure.
 * @returns {Promise<{ menu: Object, recipes: Object[] } | null>}
 */
export async function loadMenuDetail(userId, menuId) {
  if (!supabase || !userId || !menuId) return null;

  const [menuRes, weeksRes, recipesRes] = await Promise.all([
    supabase.from("user_menus").select("*").eq("user_id", userId).eq("id", menuId).maybeSingle(),
    supabase.from("user_menu_weeks").select("*").eq("user_id", userId).eq("menu_id", menuId).order("week_offset"),
    supabase.from("user_menu_recipes").select("recipe_id, recipe_snapshot").eq("user_id", userId).eq("menu_id", menuId),
  ]);

  if (menuRes.error || weeksRes.error || recipesRes.error || !menuRes.data) {
    if (menuRes.error) console.warn("[menusSync] load menu failed", menuRes.error.message);
    if (weeksRes.error) console.warn("[menusSync] load weeks failed", weeksRes.error.message);
    if (recipesRes.error) console.warn("[menusSync] load recipes failed", recipesRes.error.message);
    return null;
  }

  const weeks = {};
  for (const row of weeksRes.data ?? []) weeks[row.week_start] = rowToWeek(row);

  return {
    menu: { ...rowToMenuSummary(menuRes.data), weeks },
    recipes: (recipesRes.data ?? []).map((r) => r.recipe_snapshot),
  };
}

/** Deletes a menú; its weeks and recipe snapshots cascade with it. */
export async function deleteMenu(userId, menuId) {
  if (!supabase || !userId || !menuId) return;
  const { error } = await supabase.from("user_menus").delete().eq("user_id", userId).eq("id", menuId);
  if (error) console.warn("[menusSync] delete menu failed", error.message);
}

export async function toggleMenuFavorite(userId, menuId, isFavorite) {
  if (!supabase || !userId || !menuId) return;
  const { error } = await supabase
    .from("user_menus")
    .update({ is_favorite: isFavorite })
    .eq("user_id", userId)
    .eq("id", menuId);
  if (error) console.warn("[menusSync] toggle favorite failed", error.message);
}

/**
 * Atomically makes `menuId` the one active menú for the signed-in user (see
 * activate_user_menu RPC — deactivates whatever was active first, in the
 * same statement, so the uq_user_menus_one_active partial index is never
 * violated).
 */
export async function activateMenu(menuId) {
  if (!supabase || !menuId) return { ok: false, error: "no-op" };
  const { error } = await supabase.rpc("activate_user_menu", { p_menu_id: menuId });
  if (error) {
    console.warn("[menusSync] activate failed", error.message);
    return { ok: false, error: error.message };
  }
  return { ok: true };
}
