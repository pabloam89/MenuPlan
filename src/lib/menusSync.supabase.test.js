import { describe, it, expect, vi, beforeEach } from "vitest";

// menusSync.js is a no-op everywhere `supabase` is falsy (see menusSync.test.js),
// which is the only path exercised in this checkout's normal test run (no
// VITE_SUPABASE_URL/VITE_SUPABASE_ANON_KEY configured). That leaves the actual
// query logic — upsert ordering, rollback-on-partial-failure, parallel reads,
// error handling — completely untested. This file mocks the Supabase client to
// exercise that logic directly, without touching a real project.

vi.mock("./supabase.js", () => ({ supabase: {} }));
import { supabase } from "./supabase.js";
import {
  saveMenu,
  loadMenuSummaries,
  loadMenuWeekRanges,
  loadMenuDetail,
  deleteMenu,
  toggleMenuFavorite,
  activateMenu,
} from "./menusSync.js";

// A minimal chainable query-builder stand-in: every method records the call
// and returns `this`; awaiting the chain at any point resolves to whatever
// result was configured for that table (each `from(table)` call pops the
// next queued result, defaulting to `{ data: null, error: null }`).
function makeQuery(result, log, table, _method) {
  const q = {
    select: (...a) => (log.push({ table, method: "select", args: a }), q),
    eq: (...a) => (log.push({ table, method: "eq", args: a }), q),
    order: (...a) => (log.push({ table, method: "order", args: a }), q),
    upsert: (...a) => (log.push({ table, method: "upsert", args: a }), q),
    delete: (...a) => (log.push({ table, method: "delete", args: a }), q),
    update: (...a) => (log.push({ table, method: "update", args: a }), q),
    maybeSingle: () => Promise.resolve(result),
    then: (resolve, reject) => Promise.resolve(result).then(resolve, reject),
  };
  return q;
}

function mockClient(queue) {
  const log = [];
  const remaining = { ...queue };
  const from = (table) => {
    const list = remaining[table];
    const result = Array.isArray(list) && list.length ? list.shift() : { data: null, error: null };
    return makeQuery(result, log, table);
  };
  const rpc = vi.fn(async (name, args) => {
    log.push({ table: `rpc:${name}`, method: "rpc", args: [args] });
    const list = remaining.__rpc;
    return Array.isArray(list) && list.length ? list.shift() : { data: null, error: null };
  });
  return { from, rpc, log };
}

beforeEach(() => {
  Object.keys(supabase).forEach((k) => delete supabase[k]);
});

describe("saveMenu (mocked client)", () => {
  const menu = {
    id: "menu_abc",
    isFavorite: false,
    isActive: true,
    varietyPref: "moderate",
    weeks: { "2026-07-13": { offset: 0, endISO: "2026-07-19", plan: {}, shopping: { items: [] }, schedule: {} } },
  };
  const recipes = [{ id: "carnes_001", name: "Pollo" }];

  it("upserts menu, weeks and recipes in order and returns ok:true", async () => {
    const client = mockClient({
      user_menus: [{ error: null }],
      user_menu_weeks: [{ error: null }],
      user_menu_recipes: [{ error: null }],
    });
    Object.assign(supabase, client);

    const result = await saveMenu("user-1", menu, recipes);
    expect(result).toEqual({ ok: true });

    const upserts = client.log.filter((c) => c.method === "upsert");
    expect(upserts.map((u) => u.table)).toEqual(["user_menus", "user_menu_weeks", "user_menu_recipes"]);
    expect(upserts[0].args[1]).toEqual({ onConflict: "user_id,id" });
    expect(upserts[1].args[1]).toEqual({ onConflict: "user_id,menu_id,week_start" });
    expect(upserts[2].args[1]).toEqual({ onConflict: "user_id,menu_id,recipe_id" });
    // is_active is always false on the initial write, even for an isActive:true menú.
    expect(upserts[0].args[0].is_active).toBe(false);
  });

  it("skips weeks/recipes upserts entirely when there are none", async () => {
    const client = mockClient({ user_menus: [{ error: null }] });
    Object.assign(supabase, client);

    const result = await saveMenu("user-1", { id: "menu_empty", weeks: {} }, []);
    expect(result).toEqual({ ok: true });
    expect(client.log.filter((c) => c.method === "upsert")).toHaveLength(1);
  });

  it("rolls back (deletes the menú) if the weeks upsert fails", async () => {
    const client = mockClient({
      user_menus: [{ error: null }, { error: null }], // menu upsert, then the rollback delete's own "select" chain isn't used but delete() shares the same table
      user_menu_weeks: [{ error: { message: "weeks boom" } }],
    });
    Object.assign(supabase, client);

    const result = await saveMenu("user-1", menu, recipes);
    expect(result).toEqual({ ok: false, error: "weeks boom" });
    expect(client.log.some((c) => c.table === "user_menus" && c.method === "delete")).toBe(true);
    // Recipes are never attempted once weeks failed.
    expect(client.log.some((c) => c.table === "user_menu_recipes")).toBe(false);
  });

  it("rolls back (deletes the menú) if the recipes upsert fails", async () => {
    const client = mockClient({
      user_menus: [{ error: null }, { error: null }],
      user_menu_weeks: [{ error: null }],
      user_menu_recipes: [{ error: { message: "recipes boom" } }],
    });
    Object.assign(supabase, client);

    const result = await saveMenu("user-1", menu, recipes);
    expect(result).toEqual({ ok: false, error: "recipes boom" });
    expect(client.log.some((c) => c.table === "user_menus" && c.method === "delete")).toBe(true);
  });

  it("returns ok:false without rolling back if the menu upsert itself fails", async () => {
    const client = mockClient({ user_menus: [{ error: { message: "menu boom" } }] });
    Object.assign(supabase, client);

    const result = await saveMenu("user-1", menu, recipes);
    expect(result).toEqual({ ok: false, error: "menu boom" });
    expect(client.log.filter((c) => c.method === "delete")).toHaveLength(0);
  });
});

describe("loadMenuSummaries (mocked client)", () => {
  it("maps rows to camelCase summaries", async () => {
    const row = {
      id: "menu_abc", variety_pref: "strict", is_favorite: false, is_active: true,
      created_at: "2026-07-01T00:00:00.000Z", updated_at: "2026-07-01T00:00:00.000Z",
    };
    Object.assign(supabase, mockClient({ user_menus: [{ data: [row], error: null }] }));
    const summaries = await loadMenuSummaries("user-1");
    expect(summaries).toEqual([
      { id: "menu_abc", varietyPref: "strict", isFavorite: false, isActive: true, createdAt: Date.parse(row.created_at), updatedAt: Date.parse(row.updated_at) },
    ]);
  });

  it("returns an empty array on error instead of throwing", async () => {
    Object.assign(supabase, mockClient({ user_menus: [{ data: null, error: { message: "boom" } }] }));
    expect(await loadMenuSummaries("user-1")).toEqual([]);
  });
});

describe("loadMenuWeekRanges (mocked client)", () => {
  it("groups week rows by menu_id, keyed by week_start", async () => {
    const rows = [
      { menu_id: "menu_a", week_start: "2026-07-13", week_end: "2026-07-19", week_offset: 0, start_day_idx: 0 },
      { menu_id: "menu_a", week_start: "2026-07-20", week_end: "2026-07-26", week_offset: 1, start_day_idx: 0 },
      { menu_id: "menu_b", week_start: "2026-06-01", week_end: "2026-06-07", week_offset: 0, start_day_idx: 2 },
    ];
    Object.assign(supabase, mockClient({ user_menu_weeks: [{ data: rows, error: null }] }));
    const result = await loadMenuWeekRanges("user-1");
    expect(result).toEqual({
      menu_a: {
        "2026-07-13": { offset: 0, startDayIdx: 0, startISO: "2026-07-13", endISO: "2026-07-19" },
        "2026-07-20": { offset: 1, startDayIdx: 0, startISO: "2026-07-20", endISO: "2026-07-26" },
      },
      menu_b: {
        "2026-06-01": { offset: 0, startDayIdx: 2, startISO: "2026-06-01", endISO: "2026-06-07" },
      },
    });
    // Deliberately no plan/shopping/schedule keys — that's what makes a week
    // "lazy" for App.jsx's reuseMenu() lazy-fetch check.
    expect(result.menu_a["2026-07-13"]).not.toHaveProperty("plan");
  });

  it("returns an empty object on error", async () => {
    Object.assign(supabase, mockClient({ user_menu_weeks: [{ data: null, error: { message: "boom" } }] }));
    expect(await loadMenuWeekRanges("user-1")).toEqual({});
  });
});

describe("loadMenuDetail (mocked client)", () => {
  it("assembles menu + weeks + recipe snapshots from the three parallel reads", async () => {
    const menuRow = {
      id: "menu_abc", variety_pref: "relaxed", is_favorite: true, is_active: false,
      created_at: "2026-07-01T00:00:00.000Z", updated_at: "2026-07-01T00:00:00.000Z",
    };
    const weekRow = {
      week_start: "2026-07-13", week_end: "2026-07-19", week_offset: 0, start_day_idx: 0,
      plan: { "Lun-Comida": { recipeId: "carnes_001" } }, shopping: { items: [] }, schedule: {},
    };
    const recipeRow = { recipe_id: "carnes_001", recipe_snapshot: { id: "carnes_001", name: "Pollo" } };

    Object.assign(supabase, mockClient({
      user_menus: [{ data: menuRow, error: null }],
      user_menu_weeks: [{ data: [weekRow], error: null }],
      user_menu_recipes: [{ data: [recipeRow], error: null }],
    }));

    const detail = await loadMenuDetail("user-1", "menu_abc");
    expect(detail.menu.id).toBe("menu_abc");
    expect(detail.menu.weeks["2026-07-13"]).toEqual({
      offset: 0, startDayIdx: 0, startISO: "2026-07-13", endISO: "2026-07-19",
      plan: weekRow.plan, shopping: weekRow.shopping, schedule: weekRow.schedule,
    });
    expect(detail.recipes).toEqual([recipeRow.recipe_snapshot]);
  });

  it("returns null if the menu row is missing (not found / wrong user)", async () => {
    Object.assign(supabase, mockClient({
      user_menus: [{ data: null, error: null }],
      user_menu_weeks: [{ data: [], error: null }],
      user_menu_recipes: [{ data: [], error: null }],
    }));
    expect(await loadMenuDetail("user-1", "menu_missing")).toBeNull();
  });

  it("returns null if any of the three parallel reads errors", async () => {
    Object.assign(supabase, mockClient({
      user_menus: [{ data: { id: "menu_abc" }, error: null }],
      user_menu_weeks: [{ data: null, error: { message: "boom" } }],
      user_menu_recipes: [{ data: [], error: null }],
    }));
    expect(await loadMenuDetail("user-1", "menu_abc")).toBeNull();
  });
});

describe("deleteMenu / toggleMenuFavorite / activateMenu (mocked client)", () => {
  it("deleteMenu scopes the delete to user_id + id", async () => {
    const client = mockClient({ user_menus: [{ error: null }] });
    Object.assign(supabase, client);
    await deleteMenu("user-1", "menu_abc");
    const del = client.log.find((c) => c.method === "delete");
    expect(del).toBeTruthy();
    const eqs = client.log.filter((c) => c.method === "eq").map((c) => c.args);
    expect(eqs).toEqual([["user_id", "user-1"], ["id", "menu_abc"]]);
  });

  it("toggleMenuFavorite sends the new value scoped to user_id + id", async () => {
    const client = mockClient({ user_menus: [{ error: null }] });
    Object.assign(supabase, client);
    await toggleMenuFavorite("user-1", "menu_abc", true);
    const upd = client.log.find((c) => c.method === "update");
    expect(upd.args[0]).toEqual({ is_favorite: true });
  });

  it("activateMenu calls the RPC and reports failure without throwing", async () => {
    const client = mockClient({ __rpc: [{ error: { message: "not found" } }] });
    Object.assign(supabase, client);
    const result = await activateMenu("menu_missing");
    expect(result).toEqual({ ok: false, error: "not found" });
    expect(client.rpc).toHaveBeenCalledWith("activate_user_menu", { p_menu_id: "menu_missing" });
  });

  it("activateMenu reports success", async () => {
    Object.assign(supabase, mockClient({ __rpc: [{ error: null }] }));
    expect(await activateMenu("menu_abc")).toEqual({ ok: true });
  });
});
