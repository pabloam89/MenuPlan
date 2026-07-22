import { describe, it, expect } from "vitest";
import { convertStockAmount } from "./kitchenUnits.js";

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
