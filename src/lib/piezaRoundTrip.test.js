import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { pieceGramsFor } from "./ingredients.js";
import { gramsPerPiece, shoppingUnitsLabel, kitchenHint } from "./kitchenUnits.js";
import { buildShoppingList } from "./shoppingBuilder.js";
import { registerRecipes } from "../data/recipes.js";

/**
 * Dos verdades sobre cuánto pesa una pieza (`ingrediente.pieza` en el catálogo
 * y PIECE_WEIGHTS en kitchenUnits) y, hasta hace poco, dos caminos que las
 * leían distinto: la agregación de la compra preguntaba a las dos y la lente
 * "Unidades" solo a la segunda. Resultado: una línea en `ud` con `pieza` pero
 * sin regex salía a gramos y no podía volver — "16 uds de placas de canelones"
 * → "128 g" para siempre. Pasó de verdad, con 1706 tests en verde.
 *
 * Ahora kitchenUnits ve el catálogo (registerPieceCatalog, inyectado desde
 * ingredients.js) y la agregación solo convierte cuando el ingrediente aparece
 * en las dos unidades. Estos tests fijan las dos cosas.
 */
const ingredientes = JSON.parse(
  readFileSync(new URL("../data/ingredients.json", import.meta.url), "utf8"),
);

describe("peso por pieza: una sola verdad", () => {
  it("todo `pieza` del catálogo es lo que ve kitchenUnits", () => {
    const discrepan = ingredientes
      .filter((i) => i.pieza)
      .filter((i) => gramsPerPiece(i.name) !== i.pieza.g || pieceGramsFor(i.name) !== i.pieza.g)
      .map((i) => `${i.id}: pieza ${i.pieza.g} g, kitchenUnits ${gramsPerPiece(i.name)}, pieceGramsFor ${pieceGramsFor(i.name)}`);
    expect(discrepan).toEqual([]);
  });

  it("la lente 'Unidades' vuelve a piezas todo lo que el catálogo sabe pesar", () => {
    const ciegas = ingredientes
      .filter((i) => i.pieza)
      .filter((i) => shoppingUnitsLabel(i.name, i.pieza.g * 3, "g") == null)
      .map((i) => i.id);
    expect(ciegas).toEqual([]);
  });

  it("nombra la pieza del catálogo, no un 'ud' genérico", () => {
    expect(kitchenHint("Huevo", 180, "g")).toBe("≈ 3 huevos");
    expect(shoppingUnitsLabel("Ajo", 15, "g")).toBe("3 dientes");
    expect(shoppingUnitsLabel("Limón", 240, "g")).toBe("2 limones");
  });
});

describe("agregación de la compra: ud→g solo si hay algo que fusionar", () => {
  const GROUPS = [{ id: "g1", label: "Familia" }];
  registerRecipes([
    {
      id: "test-solo-ud",
      name: "Huevos al plato (prueba)",
      servings: 2,
      ingredients: [{ id: "huevos", name: "Huevo", category: "Lácteos y huevos", qty: 4, unit: "ud", pricePerUnit: 0.2 }],
    },
    {
      id: "test-mixto",
      name: "Guacamole (prueba)",
      servings: 2,
      ingredients: [
        { id: "aguacate-ud", name: "Aguacate", category: "Verduras y frutas", qty: 1, unit: "ud", pricePerUnit: 1 },
        { id: "aguacate-g", name: "Aguacate", category: "Verduras y frutas", qty: 150, unit: "g", pricePerUnit: 0.01 },
      ],
    },
  ]);
  const plan = (rid) => ({ g1: { "Lun-Comida": { recipeId: rid, firstRecipeId: null, eaters: 2, mode: "casa", warnings: [] } } });
  const lineas = (sh) => sh.byCategory.flatMap((c) => c.items);

  it("un ingrediente que solo se pide por piezas se queda en piezas", () => {
    const huevo = lineas(buildShoppingList(plan("test-solo-ud"), GROUPS, ["Comida"])).find((l) => l.name === "Huevo");
    expect(huevo.unit).toBe("ud");
    // 4 → 6: el redondeo a media docena de snapToPackSize, que SOLO se aplica
    // a las líneas en `ud`. Es justo lo que se perdía al mandarlas a gramos.
    expect(huevo.qty).toBe(6);
  });

  it("el mismo ingrediente en ud y en g se fusiona en una sola fila de gramos", () => {
    const filas = lineas(buildShoppingList(plan("test-mixto"), GROUPS, ["Comida"])).filter((l) => l.name === "Aguacate");
    expect(filas).toHaveLength(1);
    expect(filas[0].unit).toBe("g");
    expect(filas[0].qty).toBe(200 + 150);
  });
});
