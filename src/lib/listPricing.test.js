import { describe, it, expect, vi, afterEach } from "vitest";
import { estimateRecipeCost } from "./listPricing.js";
import { resetStoreCatalogCache } from "./storeCatalog.js";

const PRODUCTS = [
  { id: "1", name: "Merluza en lomos congelada", price: 4.5, unitSize: 500, unitFormat: "g" },
  { id: "2", name: "Aceite de oliva virgen extra", price: 5, unitSize: 1, unitFormat: "l" },
];

function mockCatalog(products = PRODUCTS) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ store: "mercadona", fetchedAt: "2026-09-01", productCount: products.length, products }),
    }),
  );
}

describe("estimateRecipeCost", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    resetStoreCatalogCache();
  });

  it("returns null for a recipe with no ingredients", async () => {
    expect(await estimateRecipeCost({ ingredients: [] }, 4)).toBeNull();
  });

  it("returns null when servings is not positive", async () => {
    mockCatalog();
    const recipe = { ingredients: [{ id: "a", name: "Merluza", unit: "g", qtyScaled: 500 }] };
    expect(await estimateRecipeCost(recipe, 0)).toBeNull();
  });

  it("estimates cost per serving from ingredients matched in the store catalog", async () => {
    mockCatalog();
    const recipe = {
      ingredients: [
        { id: "a", name: "Merluza", unit: "g", qtyScaled: 500 },
        { id: "b", name: "Aceite de oliva", unit: "ml", qtyScaled: 1000 },
      ],
    };
    const result = await estimateRecipeCost(recipe, 4);
    expect(result).not.toBeNull();
    expect(result.matchedCount).toBe(2);
    expect(result.totalCount).toBe(2);
    expect(result.confidence).toBe(1);
    // (4.5 + 5) / 4 raciones
    expect(result.perServing).toBeCloseTo(2.38, 2);
  });

  it("never invents a cost when nothing in the recipe matches the catalog", async () => {
    mockCatalog([]);
    const recipe = { ingredients: [{ id: "a", name: "Ingrediente inventado xyz", unit: "g", qtyScaled: 100 }] };
    // Empty catalog product list makes loadStoreCatalog throw ("empty"),
    // which priceShoppingList/priceOneItem fall back from — with no priceObs
    // either, nothing matches.
    expect(await estimateRecipeCost(recipe, 2)).toBeNull();
  });

  it("uses qty (not qtyScaled) as a fallback for qualitative units without breaking", async () => {
    mockCatalog();
    // "al gusto" ingredients carry qtyScaled: null — must not throw or return NaN.
    const recipe = {
      ingredients: [
        { id: "a", name: "Merluza", unit: "g", qty: 500, qtyScaled: null },
      ],
    };
    const result = await estimateRecipeCost(recipe, 4);
    expect(result).not.toBeNull();
    expect(Number.isFinite(result.perServing)).toBe(true);
  });
});
