import { describe, it, expect } from "vitest";
import { convertStockAmount, gramsForRecipeQuantity } from "./kitchenUnits.js";

describe("convertStockAmount", () => {
  it("is the identity for the same unit", () => {
    expect(convertStockAmount(500, "g", "g")).toBe(500);
    expect(convertStockAmount(3, "ud", "ud")).toBe(3);
  });

  it("scales kg↔g and l↔ml without guessing", () => {
    expect(convertStockAmount(2, "kg", "g")).toBe(2000);
    expect(convertStockAmount(1000, "g", "kg")).toBe(1);
    expect(convertStockAmount(1.5, "l", "ml")).toBe(1500);
    expect(convertStockAmount(500, "ml", "l")).toBe(0.5);
  });

  it("converts weight↔piece for countable ingredients", () => {
    // "cebolla" is 150 g/pieza in the piece-weight table.
    expect(convertStockAmount(300, "g", "ud", "Cebolla")).toBeCloseTo(2);
    expect(convertStockAmount(2, "ud", "g", "Cebolla")).toBeCloseTo(300);
    // kg also normalizes through grams first.
    expect(convertStockAmount(0.3, "kg", "ud", "Cebolla")).toBeCloseTo(2);
  });

  it("returns null when there's no safe conversion", () => {
    // g↔ml needs a density we deliberately don't track.
    expect(convertStockAmount(100, "g", "ml", "Leche")).toBeNull();
    // Rice has no piece weight, so g↔ud can't be guessed.
    expect(convertStockAmount(200, "g", "ud", "Arroz")).toBeNull();
    // Non-finite input never converts.
    expect(convertStockAmount(NaN, "g", "g", "Arroz")).toBeNull();
    expect(convertStockAmount(null, "g", "kg", "Arroz")).toBeNull();
  });
});

// Fase 9: convertir cualquier unidad de receta a gramos, para poder escalar
// una nutrición por 100g (computeRecipeNutrition, ingredients.js).
describe("gramsForRecipeQuantity", () => {
  it("g/kg/ml/l son directos (kg y l por 1000, ml/g tal cual)", () => {
    expect(gramsForRecipeQuantity("Pollo", 500, "g")).toBe(500);
    expect(gramsForRecipeQuantity("Pollo", 2, "kg")).toBe(2000);
    expect(gramsForRecipeQuantity("Leche", 250, "ml")).toBe(250);
    expect(gramsForRecipeQuantity("Leche", 1, "l")).toBe(1000);
  });

  it("ud/diente usan el peso por pieza ya conocido (PIECE_WEIGHTS)", () => {
    expect(gramsForRecipeQuantity("Cebolla", 2, "ud")).toBeCloseTo(300);
    expect(gramsForRecipeQuantity("Ajo", 3, "diente")).toBeCloseTo(15);
  });

  it("cucharada/cucharadita/taza de un ingrediente seco conocido usan DRY_VOLUME", () => {
    expect(gramsForRecipeQuantity("Harina", 1, "taza")).toBeCloseTo(120);
    expect(gramsForRecipeQuantity("Azucar", 1, "cucharadita")).toBeCloseTo(4);
    expect(gramsForRecipeQuantity("Harina", 2, "cucharada")).toBeCloseTo(18);
  });

  it("cucharada/cucharadita/taza de algo NO seco cae al supuesto líquido (~1 g/ml)", () => {
    expect(gramsForRecipeQuantity("Aceite de oliva", 2, "cucharada")).toBeCloseTo(30);
    expect(gramsForRecipeQuantity("Vino blanco", 1, "taza")).toBeCloseTo(240);
  });

  it("devuelve null sin inventar nada: unidad cualitativa, o ud sin peso por pieza conocido", () => {
    expect(gramsForRecipeQuantity("Sal", null, "al gusto")).toBeNull();
    expect(gramsForRecipeQuantity("Ingrediente inventado xyz", 3, "ud")).toBeNull();
    expect(gramsForRecipeQuantity("Arroz", NaN, "g")).toBeNull();
  });
});
