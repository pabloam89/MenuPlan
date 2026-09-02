import { describe, it, expect, afterEach, vi } from "vitest";
import { saveState } from "./storage.js";

const BIG_PHOTO = "data:image/jpeg;base64," + "A".repeat(2_000_000);
const HOSTED_PHOTO = "https://cdn.example.com/photo.jpg";

function baseState(overrides = {}) {
  return {
    screen: "menu",
    onbStep: 0,
    data: { userRecipes: [], menus: {}, priceObs: [], receipts: [], ...overrides.data },
    menuPlan: {},
    shopping: { items: [] },
    aiRecipes: [],
    ...overrides,
  };
}

// Simulates a real browser's QuotaExceededError without depending on jsdom's
// own localStorage quota behavior — any write over `limit` bytes throws, same
// as a full device would.
function mockQuotaLimitedStorage(limit) {
  const store = new Map();
  vi.stubGlobal("localStorage", {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => {
      if (value.length > limit) throw new DOMException("Quota exceeded", "QuotaExceededError");
      store.set(key, value);
    },
    removeItem: (key) => store.delete(key),
  });
  return store;
}

describe("saveState quota recovery", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("succeeds on the first attempt when everything fits", () => {
    mockQuotaLimitedStorage(10_000_000);
    const result = saveState(baseState());
    expect(result.ok).toBe(true);
    expect(result.pruned).toBe(false);
  });

  it("strips embedded data: recipe photos (not hosted-URL ones) as the hard-tier fallback, so the write then succeeds", () => {
    // Tester report: saving a recipe in production failed with "memoria
    // llena" — root cause was an AI-generated photo (a multi-hundred-KB to
    // multi-MB data: URL) stored directly on the recipe, and saveState never
    // touched userRecipes at any compaction tier, so it had nothing real to
    // free and always fell straight through to "ok: false".
    mockQuotaLimitedStorage(1_000_000);
    const state = baseState({
      data: {
        userRecipes: [
          { id: "r1", name: "Con foto IA", photo: BIG_PHOTO },
          { id: "r2", name: "Con foto propia", photo: HOSTED_PHOTO },
          { id: "r3", name: "Sin foto" },
        ],
        menus: {},
        priceObs: [],
        receipts: [],
      },
    });
    const result = saveState(state);
    expect(result.ok).toBe(true);
    expect(result.pruned).toBe(true);
    const saved = result.saved.data.userRecipes;
    expect(saved.find((r) => r.id === "r1").photo).toBeUndefined();
    expect(saved.find((r) => r.id === "r2").photo).toBe(HOSTED_PHOTO);
    expect(saved.find((r) => r.id === "r3").photo).toBeUndefined();
    // Everything else about the recipes survives — only the photo is dropped.
    expect(saved.map((r) => r.id)).toEqual(["r1", "r2", "r3"]);
  });

  it("gives up cleanly (ok:false, saved:null) when even the hard tier can't fit", () => {
    mockQuotaLimitedStorage(50);
    const result = saveState(baseState());
    expect(result).toEqual({ ok: false, pruned: false, saved: null });
  });
});
