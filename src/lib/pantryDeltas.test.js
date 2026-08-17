import { describe, it, expect } from "vitest";
import {
  bucketDeltas,
  bucketMenuId,
  makeDeltaBucket,
  normalizeDeltaBucketMap,
  cookedKeyMenuId,
  collectMenuPantryDeltas,
  reconcileMenusRemoval,
  stripCookedDishesForMenu,
  stripCookedDishesForMenuList,
} from "./pantryDeltas.js";

const d = (name, qty) => ({ name, normalized: name, qty, unit: "u" });

describe("bucket helpers", () => {
  it("reads deltas/menuId from both shapes", () => {
    const legacy = [d("arroz", 1)];
    expect(bucketDeltas(legacy)).toBe(legacy);
    expect(bucketMenuId(legacy)).toBe(null);
    const tagged = makeDeltaBucket("menu_x", [d("arroz", 1)], 123);
    expect(tagged).toEqual({ menuId: "menu_x", at: 123, deltas: [d("arroz", 1)] });
    expect(bucketDeltas(tagged)).toHaveLength(1);
    expect(bucketMenuId(tagged)).toBe("menu_x");
  });

  it("makeDeltaBucket tolerates null menuId / non-array deltas", () => {
    const b = makeDeltaBucket(null, null, 0);
    expect(b).toEqual({ menuId: null, at: 0, deltas: [] });
  });
});

describe("normalizeDeltaBucketMap", () => {
  it("wraps legacy arrays and keeps tagged buckets (idempotent)", () => {
    const input = {
      "2026-01-05": [d("arroz", 2)],
      "2026-01-12": { menuId: "menu_a", at: 999, deltas: [d("pasta", 1)] },
    };
    const out = normalizeDeltaBucketMap(input);
    expect(out["2026-01-05"]).toEqual({ menuId: null, at: 0, deltas: [d("arroz", 2)] });
    expect(out["2026-01-12"]).toEqual({ menuId: "menu_a", at: 999, deltas: [d("pasta", 1)] });
    // idempotent
    expect(normalizeDeltaBucketMap(out)).toEqual(out);
  });

  it("returns {} for non-objects and drops garbage entries", () => {
    expect(normalizeDeltaBucketMap(null)).toEqual({});
    expect(normalizeDeltaBucketMap([1, 2, 3])).toEqual({});
    const out = normalizeDeltaBucketMap({ ok: [d("x", 1)], bad: null, num: 5 });
    expect(Object.keys(out)).toEqual(["ok"]);
    expect(out.ok.deltas).toHaveLength(1);
  });
});

describe("cookedKeyMenuId", () => {
  it("extracts the menú prefix before the first colon", () => {
    expect(cookedKeyMenuId("menu_abc123:0::mon::lunch::rec_1")).toBe("menu_abc123");
    expect(cookedKeyMenuId("live:2::tue::dinner::rec_2")).toBe("live");
    expect(cookedKeyMenuId("nocolon")).toBe(null);
  });
});

describe("collectMenuPantryDeltas", () => {
  const data = {
    pantryGenDeltas: {
      "2026-01-05": makeDeltaBucket("menu_a", [d("arroz", 2)]),
      "2026-01-12": makeDeltaBucket("menu_b", [d("pasta", 1)]),
      "2025-12-01": [d("legacy", 9)], // legacy, menuId null
    },
    pantryDayDeltas: {
      "2026-01-06": makeDeltaBucket("menu_a", [d("tomate", 3)]),
      "2026-01-13": makeDeltaBucket("menu_b", [d("cebolla", 1)]),
    },
    cookedDeltas: {
      "menu_a:0::mon::lunch::rec_1": [d("pollo", 1)],
      "menu_b:0::tue::dinner::rec_2": [d("ternera", 1)],
    },
  };

  it("gathers all deltas for one menú across the three buckets and strips them", () => {
    const r = collectMenuPantryDeltas(data, "menu_a");
    expect(r.deltas).toEqual([d("arroz", 2), d("tomate", 3), d("pollo", 1)]);
    // menu_a entries removed, others (incl. legacy) preserved
    expect(Object.keys(r.genOut)).toEqual(["2026-01-12", "2025-12-01"]);
    expect(Object.keys(r.dayOut)).toEqual(["2026-01-13"]);
    expect(Object.keys(r.cookedOut)).toEqual(["menu_b:0::tue::dinner::rec_2"]);
  });

  it("never matches legacy (null) buckets even when asked for null", () => {
    const r = collectMenuPantryDeltas(data, null);
    expect(r.deltas).toEqual([]);
    // nothing stripped
    expect(Object.keys(r.genOut)).toHaveLength(3);
  });

  it("tolerates missing buckets", () => {
    const r = collectMenuPantryDeltas({}, "menu_a");
    expect(r.deltas).toEqual([]);
    expect(r.genOut).toEqual({});
    expect(r.dayOut).toEqual({});
    expect(r.cookedOut).toEqual({});
  });
});

describe("reconcileMenusRemoval", () => {
  it("accumulates deltas across several dropped menús and leaves the rest", () => {
    const data = {
      pantryGenDeltas: {
        w1: makeDeltaBucket("menu_a", [d("arroz", 1)]),
        w2: makeDeltaBucket("menu_b", [d("pasta", 1)]),
        w3: makeDeltaBucket("menu_c", [d("mijo", 1)]),
      },
      pantryDayDeltas: {},
      cookedDeltas: {},
    };
    const r = reconcileMenusRemoval(data, ["menu_a", "menu_b"]);
    expect(r.deltas).toEqual([d("arroz", 1), d("pasta", 1)]);
    expect(Object.keys(r.genOut)).toEqual(["w3"]);
  });

  it("empty menú list is a no-op passthrough", () => {
    const data = { pantryGenDeltas: { w1: makeDeltaBucket("menu_a", [d("x", 1)]) }, pantryDayDeltas: {}, cookedDeltas: {} };
    const r = reconcileMenusRemoval(data, []);
    expect(r.deltas).toEqual([]);
    expect(r.genOut).toEqual(data.pantryGenDeltas);
  });
});

describe("stripCookedDishes", () => {
  const keys = [
    "menu_a:0::mon::lunch::rec_1",
    "menu_b:0::tue::dinner::rec_2",
    "menu_a:1::wed::lunch::rec_3",
  ];
  it("removes one menú's cooked flags", () => {
    expect(stripCookedDishesForMenu(keys, "menu_a")).toEqual(["menu_b:0::tue::dinner::rec_2"]);
  });
  it("removes several menús' cooked flags", () => {
    expect(stripCookedDishesForMenuList(keys, ["menu_a", "menu_b"])).toEqual([]);
  });
  it("tolerates non-arrays", () => {
    expect(stripCookedDishesForMenu(undefined, "menu_a")).toEqual([]);
    expect(stripCookedDishesForMenuList(null, ["menu_a"])).toEqual([]);
  });
});
