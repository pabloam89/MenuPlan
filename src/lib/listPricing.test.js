import { describe, it, expect, vi, afterEach } from "vitest";
import { priceShoppingList } from "./listPricing.js";
import { resetStoreCatalogCache } from "./storeCatalog.js";
import { listaParaMercadona } from "./mercadonaList.js";
import { lineasDeLaCompra } from "./shoppingListUtils.js";

// El total de caja: envases enteros (el €/ración a granel es lib/coste.js).
// Los ids son los que decide productoPorIngrediente.json para la merluza y el
// aceite de oliva: la lista busca el producto decidido por id, no por nombre.
const PRODUCTS = [
  { id: "62113", name: "Merluza en lomos congelada", price: 4.5, unitSize: 500, unitFormat: "g" },
  { id: "4640", name: "Aceite de oliva virgen extra", price: 5, unitSize: 1, unitFormat: "l" },
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

describe("varias semanas: se suma y se redondea una vez", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    resetStoreCatalogCache();
  });

  // Como las pinta Compra con dos semanas marcadas: un fresco, una línea por semana.
  const SEMANAS = [
    { id: "2026-11-09::merluza|g", name: "Merluza", unit: "g", qty: 300 },
    { id: "2026-11-16::merluza|g", name: "Merluza", unit: "g", qty: 300 },
  ];

  it("300 g + 300 g de merluza son dos paquetes de 500 g, no uno", async () => {
    mockCatalog();
    const lineas = lineasDeLaCompra(SEMANAS);
    const { map } = await priceShoppingList("Mercadona", lineas);
    const compra = listaParaMercadona(lineas, map, "x");
    expect(compra.lista.products).toEqual([{ merca_code: "62113", quantity: 2 }]);
    expect(compra.total).toBe(9);
  });

  it("una sola semana sale igual que entra", () => {
    const una = [{ id: "merluza|g", name: "Merluza", unit: "g", qty: 300 }];
    expect(lineasDeLaCompra(una).map((l) => [l.id, l.qty])).toEqual([["merluza|g", 300]]);
  });
});
