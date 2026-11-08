import { describe, it, expect, vi, afterEach } from "vitest";
import { priceShoppingList } from "./listPricing.js";
import { resetStoreCatalogCache } from "./storeCatalog.js";

// El total de caja: envases enteros (el €/ración a granel es lib/coste.js).
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

describe("priceShoppingList: lo que se paga en caja", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    resetStoreCatalogCache();
  });

  it("30 ml de aceite son una botella entera", async () => {
    mockCatalog();
    const { estimate } = await priceShoppingList("Mercadona", [{ id: "a", name: "Aceite de oliva", unit: "ml", qty: 30 }]);
    expect(estimate.total).toBe(5);
  });

  it("suma envases enteros de cada línea", async () => {
    mockCatalog();
    const { estimate } = await priceShoppingList("Mercadona", [
      { id: "a", name: "Merluza", unit: "g", qty: 700 },
      { id: "b", name: "Aceite de oliva", unit: "ml", qty: 1000 },
    ]);
    expect(estimate.matched).toBe(2);
    expect(estimate.total).toBe(14); // 2 × 4,5 + 5
  });

  it("sin nada emparejado no inventa un total", async () => {
    mockCatalog();
    const { estimate } = await priceShoppingList("Mercadona", [{ id: "a", name: "Ingrediente inventado xyz", unit: "g", qty: 100 }]);
    expect(estimate.matched).toBe(0);
    expect(estimate.total).toBe(0);
  });

});
