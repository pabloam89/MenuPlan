import { describe, it, expect } from "vitest";
import {
  menuToRow,
  rowToMenuSummary,
  weekToRow,
  rowToWeek,
  saveMenu,
  loadMenuSummaries,
  loadMenuWeekRanges,
  loadMenuDetail,
  deleteMenu,
  toggleMenuFavorite,
  activateMenu,
} from "./menusSync.js";

// This checkout's .env has no VITE_SUPABASE_URL/VITE_SUPABASE_ANON_KEY (see
// lib/supabase.js), so `supabase` is null here — every public function must
// degrade to a no-op/empty result instead of throwing. The row<->camelCase
// mapping helpers are pure and exported specifically so they're testable
// without a live/mocked client.

describe("menuToRow", () => {
  it("maps a menú to a user_menus row, always inactive regardless of menu.isActive", () => {
    const menu = { id: "menu_abc", varietyPref: "moderate", isFavorite: true, isActive: true };
    expect(menuToRow(menu, "user-1")).toEqual({
      id: "menu_abc",
      user_id: "user-1",
      variety_pref: "moderate",
      is_favorite: true,
      is_active: false,
    });
  });

  it("defaults varietyPref to strict and isFavorite to false when absent", () => {
    const row = menuToRow({ id: "menu_x" }, "user-1");
    expect(row.variety_pref).toBe("strict");
    expect(row.is_favorite).toBe(false);
  });
});

describe("rowToMenuSummary", () => {
  it("maps a user_menus row back to camelCase", () => {
    const row = {
      id: "menu_abc",
      variety_pref: "relaxed",
      is_favorite: true,
      is_active: false,
      created_at: "2026-07-01T10:00:00.000Z",
      updated_at: "2026-07-02T10:00:00.000Z",
    };
    const summary = rowToMenuSummary(row);
    expect(summary.id).toBe("menu_abc");
    expect(summary.varietyPref).toBe("relaxed");
    expect(summary.isFavorite).toBe(true);
    expect(summary.isActive).toBe(false);
    expect(summary.createdAt).toBe(Date.parse(row.created_at));
    expect(summary.updatedAt).toBe(Date.parse(row.updated_at));
  });
});

describe("weekToRow / rowToWeek round-trip", () => {
  it("round-trips a week object through row shape and back", () => {
    const week = {
      offset: 1,
      startDayIdx: 0,
      startISO: "2026-07-13",
      endISO: "2026-07-19",
      plan: { "Lun-Comida": { recipeId: "carnes_001" } },
      shopping: { items: [{ id: "pollo", name: "Pollo" }] },
      schedule: { "m1|Lun|Comida": "casa" },
    };
    const row = weekToRow("user-1", "menu_abc", week.startISO, week);
    expect(row).toEqual({
      user_id: "user-1",
      menu_id: "menu_abc",
      week_start: "2026-07-13",
      week_end: "2026-07-19",
      week_offset: 1,
      start_day_idx: 0,
      plan: week.plan,
      shopping: week.shopping,
      schedule: week.schedule,
    });

    // Simulate what a real Supabase row looks like (week_start comes back as
    // the primary-key column, not nested in the row's own fields).
    const dbRow = { ...row, week_start: "2026-07-13" };
    const back = rowToWeek(dbRow);
    expect(back).toEqual({
      offset: week.offset,
      startDayIdx: week.startDayIdx,
      startISO: week.startISO,
      endISO: week.endISO,
      plan: week.plan,
      shopping: week.shopping,
      schedule: week.schedule,
    });
  });

  it("defaults missing plan/shopping/schedule to empty shapes", () => {
    const row = weekToRow("user-1", "menu_abc", "2026-07-13", { offset: 0, endISO: "2026-07-19" });
    expect(row.plan).toEqual({});
    expect(row.shopping).toEqual({ items: [] });
    expect(row.schedule).toEqual({});
  });
});

describe("public API degrades to no-op without a Supabase session (no client configured in this env)", () => {
  it("saveMenu returns ok:false without throwing", async () => {
    const result = await saveMenu("user-1", { id: "menu_abc", weeks: {} }, []);
    expect(result.ok).toBe(false);
  });

  it("loadMenuSummaries returns an empty array", async () => {
    expect(await loadMenuSummaries("user-1")).toEqual([]);
  });

  it("loadMenuWeekRanges returns an empty object", async () => {
    expect(await loadMenuWeekRanges("user-1")).toEqual({});
  });

  it("loadMenuDetail returns null", async () => {
    expect(await loadMenuDetail("user-1", "menu_abc")).toBeNull();
  });

  it("deleteMenu resolves without throwing", async () => {
    await expect(deleteMenu("user-1", "menu_abc")).resolves.toBeUndefined();
  });

  it("toggleMenuFavorite resolves without throwing", async () => {
    await expect(toggleMenuFavorite("user-1", "menu_abc", true)).resolves.toBeUndefined();
  });

  it("activateMenu returns ok:false without throwing", async () => {
    const result = await activateMenu("menu_abc");
    expect(result.ok).toBe(false);
  });

  it("every function is also a no-op with a missing userId/menuId", async () => {
    expect((await saveMenu(null, { id: "x", weeks: {} })).ok).toBe(false);
    expect(await loadMenuSummaries(null)).toEqual([]);
    expect(await loadMenuDetail("user-1", null)).toBeNull();
    expect((await activateMenu(null)).ok).toBe(false);
  });
});
