import { describe, expect, it } from "vitest";
import {
  MAX_MENU_WEEKS,
  MAX_HISTORY_MENUS,
  clampWeekCount,
  collectMenuRecipeIds,
  computeWeekRange,
  createMenuId,
  foldInNewMenu,
  formatISODateShort,
  formatMenuRangeLabel,
  getActiveMenu,
  orderedWeeks,
  pruneAiRecipes,
  pruneMenuHistory,
  removeMenu,
  sortMenusDesc,
  toggleMenuFavorite,
} from "./menuArchive.js";

describe("clampWeekCount", () => {
  it("clamps below 1 up to 1", () => {
    expect(clampWeekCount(0)).toBe(1);
    expect(clampWeekCount(-3)).toBe(1);
  });
  it("clamps above the max down to the max", () => {
    expect(clampWeekCount(99)).toBe(MAX_MENU_WEEKS);
  });
  it("rounds and passes through valid values", () => {
    expect(clampWeekCount(3)).toBe(3);
    expect(clampWeekCount(2.6)).toBe(3);
  });
  it("falls back to 1 for garbage input", () => {
    expect(clampWeekCount(undefined)).toBe(1);
    expect(clampWeekCount("nope")).toBe(1);
    expect(clampWeekCount(null)).toBe(1);
  });
});

describe("createMenuId", () => {
  it("produces unique-looking string ids", () => {
    const a = createMenuId();
    const b = createMenuId();
    expect(typeof a).toBe("string");
    expect(a).not.toBe(b);
    expect(a.startsWith("menu_")).toBe(true);
  });
});

describe("computeWeekRange", () => {
  it("returns a start/end ISO pair with start <= end", () => {
    const { startISO, endISO, activeDays } = computeWeekRange(1, 0);
    expect(startISO <= endISO).toBe(true);
    expect(activeDays.length).toBe(7);
  });

  it("a full week (offset > 0) spans exactly 7 days", () => {
    const { startISO, endISO } = computeWeekRange(2, 0);
    const start = new Date(startISO);
    const end = new Date(endISO);
    const diffDays = Math.round((end - start) / 86400000);
    expect(diffDays).toBe(6);
  });
});

describe("formatISODateShort", () => {
  it("formats an ISO date as dd/mm", () => {
    expect(formatISODateShort("2026-07-13")).toBe("13/07");
  });
  it("returns an empty string for falsy input", () => {
    expect(formatISODateShort(null)).toBe("");
    expect(formatISODateShort(undefined)).toBe("");
  });
});

describe("formatMenuRangeLabel", () => {
  it("returns empty string when the menú has no weeks", () => {
    expect(formatMenuRangeLabel({ weeks: {} })).toBe("");
    expect(formatMenuRangeLabel(null)).toBe("");
  });

  it("collapses to a single date when start and end match", () => {
    const menu = { weeks: { a: { offset: 0, startISO: "2026-07-13", endISO: "2026-07-13" } } };
    expect(formatMenuRangeLabel(menu)).toBe("13/07");
  });

  it("spans from the earliest week's start to the latest week's end", () => {
    const menu = {
      weeks: {
        w1: { offset: 0, startISO: "2026-07-13", endISO: "2026-07-19" },
        w2: { offset: 1, startISO: "2026-07-20", endISO: "2026-07-26" },
      },
    };
    expect(formatMenuRangeLabel(menu)).toBe("13/07 – 26/07");
  });

  it("is robust to weeks being stored out of order", () => {
    const menu = {
      weeks: {
        w2: { offset: 1, startISO: "2026-07-20", endISO: "2026-07-26" },
        w1: { offset: 0, startISO: "2026-07-13", endISO: "2026-07-19" },
      },
    };
    expect(formatMenuRangeLabel(menu)).toBe("13/07 – 26/07");
  });
});

describe("orderedWeeks", () => {
  it("returns [] for a menú with no weeks", () => {
    expect(orderedWeeks(null)).toEqual([]);
    expect(orderedWeeks({})).toEqual([]);
  });

  it("sorts weeks by offset ascending regardless of storage order", () => {
    const menu = {
      weeks: {
        "2026-07-20": { offset: 1 },
        "2026-07-13": { offset: 0 },
        "2026-07-27": { offset: 2 },
      },
    };
    const result = orderedWeeks(menu);
    expect(result.map((w) => w.offset)).toEqual([0, 1, 2]);
    expect(result.map((w) => w.weekStart)).toEqual(["2026-07-13", "2026-07-20", "2026-07-27"]);
  });
});

describe("sortMenusDesc / getActiveMenu", () => {
  const menus = {
    old: { id: "old", createdAt: 100 },
    new: { id: "new", createdAt: 300 },
    mid: { id: "mid", createdAt: 200 },
  };

  it("sorts newest first", () => {
    expect(sortMenusDesc(menus).map((m) => m.id)).toEqual(["new", "mid", "old"]);
  });

  it("handles an empty/undefined archive", () => {
    expect(sortMenusDesc(undefined)).toEqual([]);
  });

  it("resolves the active menú by id", () => {
    expect(getActiveMenu(menus, "mid")).toBe(menus.mid);
    expect(getActiveMenu(menus, "missing")).toBe(null);
    expect(getActiveMenu(menus, null)).toBe(null);
  });
});

describe("foldInNewMenu", () => {
  const existing = {
    prev: { id: "prev", isActive: true, createdAt: 100 },
    older: { id: "older", isActive: false, createdAt: 50 },
  };
  const fresh = { id: "fresh", isActive: true, createdAt: 200 };

  it("keeps history for signed-in users, archiving the previous active menú", () => {
    const result = foldInNewMenu(existing, fresh, { keepHistory: true });
    expect(result.prev.isActive).toBe(false);
    expect(result.older.isActive).toBe(false);
    expect(result.fresh).toBe(fresh);
    expect(Object.keys(result).sort()).toEqual(["fresh", "older", "prev"]);
  });

  it("replaces the whole archive with a single menú for guests", () => {
    const result = foldInNewMenu(existing, fresh, { keepHistory: false });
    expect(Object.keys(result)).toEqual(["fresh"]);
  });

  it("caps history so signed-in archives can't grow without bound", () => {
    // Build an archive already at the cap of plain inactive menús...
    const menus = {};
    for (let i = 0; i < MAX_HISTORY_MENUS; i++) {
      menus[`m${i}`] = { id: `m${i}`, isActive: false, isFavorite: false, createdAt: i };
    }
    const newMenu = { id: "fresh", isActive: true, isFavorite: false, createdAt: 999 };
    const result = foldInNewMenu(menus, newMenu, { keepHistory: true });
    expect(Object.keys(result).length).toBe(MAX_HISTORY_MENUS);
    expect(result.fresh).toBe(newMenu);
    // The oldest plain menú (m0) is the one dropped.
    expect(result.m0).toBeUndefined();
    expect(result.m1).toBeDefined();
  });
});

describe("pruneMenuHistory", () => {
  it("never drops the active menú or favourites, even past the cap", () => {
    const menus = {
      active: { id: "active", isActive: true, isFavorite: false, createdAt: 10 },
      fav1: { id: "fav1", isActive: false, isFavorite: true, createdAt: 1 },
      fav2: { id: "fav2", isActive: false, isFavorite: true, createdAt: 2 },
      old1: { id: "old1", isActive: false, isFavorite: false, createdAt: 3 },
      old2: { id: "old2", isActive: false, isFavorite: false, createdAt: 4 },
    };
    const result = pruneMenuHistory(menus, 3);
    // active + 2 favourites already fill the 3 protected slots -> plain ones go.
    expect(result.active).toBeDefined();
    expect(result.fav1).toBeDefined();
    expect(result.fav2).toBeDefined();
    expect(result.old1).toBeUndefined();
    expect(result.old2).toBeUndefined();
  });

  it("keeps the newest trimmable menús when there is room", () => {
    const menus = {
      a: { id: "a", isActive: false, isFavorite: false, createdAt: 1 },
      b: { id: "b", isActive: false, isFavorite: false, createdAt: 2 },
      c: { id: "c", isActive: false, isFavorite: false, createdAt: 3 },
    };
    const result = pruneMenuHistory(menus, 2);
    expect(Object.keys(result).sort()).toEqual(["b", "c"]);
  });

  it("is a no-op below the cap", () => {
    const menus = { a: { id: "a", isActive: false, isFavorite: false, createdAt: 1 } };
    expect(Object.keys(pruneMenuHistory(menus, 5))).toEqual(["a"]);
  });
});

describe("collectMenuRecipeIds", () => {
  it("gathers recipe + firstRecipe ids across every week and group, skipping _warnings", () => {
    const menus = {
      m1: {
        weeks: {
          "2026-07-13": {
            plan: {
              g1: { "Lunes-Comida": { recipeId: "r1", firstRecipeId: "r0" }, "Lunes-Cena": { recipeId: "r2" } },
              _warnings: ["ignored"],
            },
          },
          "2026-07-20": {
            plan: { g1: { "Martes-Cena": { recipeId: "r3" } } },
          },
        },
      },
      m2: {
        weeks: { "2026-06-01": { plan: { g2: { "Lunes-Comida": { recipeId: "r4" } } } } },
      },
    };
    const ids = collectMenuRecipeIds(menus);
    expect([...ids].sort()).toEqual(["r0", "r1", "r2", "r3", "r4"]);
  });

  it("returns an empty set for an empty/undefined archive", () => {
    expect(collectMenuRecipeIds(undefined).size).toBe(0);
    expect(collectMenuRecipeIds({}).size).toBe(0);
  });
});

describe("pruneAiRecipes", () => {
  const cache = [{ id: "r1" }, { id: "r2" }, { id: "r3" }, { badly: "no-id" }];

  it("keeps only recipes still referenced by a retained menú", () => {
    const result = pruneAiRecipes(cache, new Set(["r1", "r3"]));
    expect(result.map((r) => r.id)).toEqual(["r1", "r3"]);
  });

  it("honours extraKeep for ids referenced by live state not yet archived", () => {
    const result = pruneAiRecipes(cache, new Set(["r1"]), new Set(["r2"]));
    expect(result.map((r) => r.id).sort()).toEqual(["r1", "r2"]);
  });

  it("drops entries without an id and tolerates garbage input", () => {
    expect(pruneAiRecipes(cache, new Set()).length).toBe(0);
    expect(pruneAiRecipes(null, new Set())).toEqual([]);
  });
});

describe("removeMenu / toggleMenuFavorite", () => {
  const menus = { a: { id: "a", isFavorite: false }, b: { id: "b", isFavorite: true } };

  it("removes a menú by id without mutating the input", () => {
    const result = removeMenu(menus, "a");
    expect(result.a).toBeUndefined();
    expect(result.b).toBe(menus.b);
    expect(menus.a).toBeDefined();
  });

  it("toggles the favorite flag on the target menú only", () => {
    const result = toggleMenuFavorite(menus, "a");
    expect(result.a.isFavorite).toBe(true);
    expect(result.b.isFavorite).toBe(true);
    expect(menus.a.isFavorite).toBe(false);
  });

  it("is a no-op for an unknown id", () => {
    expect(toggleMenuFavorite(menus, "missing")).toBe(menus);
  });
});
