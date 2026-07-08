import { describe, it, expect } from "vitest";
import {
  buildAdaptationMap,
  isAdaptableRestriction,
  planAdaptations,
} from "./substitutions.js";

const recipe = (name, ingredientNames = []) => ({
  name,
  ingredients: ingredientNames.map((n) => ({ name: n })),
});

describe("isAdaptableRestriction", () => {
  it("knows lactose and cooking alcohol are adaptable but other restrictions are not", () => {
    expect(isAdaptableRestriction("lactosa_fina")).toBe(true);
    expect(isAdaptableRestriction("alcohol_cocina")).toBe(true);
    expect(isAdaptableRestriction("fructosa")).toBe(false);
    expect(isAdaptableRestriction("embarazo")).toBe(false);
    expect(isAdaptableRestriction("lactancia")).toBe(false);
    expect(isAdaptableRestriction("unknown")).toBe(false);
  });
});

describe("planAdaptations (alcohol_cocina)", () => {
  it("swaps wine/beer for their alcohol-free versions", () => {
    const { swaps, blocked } = planAdaptations(
      recipe("Merluza en salsa verde", ["Merluza", "Vino blanco", "Perejil"]),
      ["alcohol_cocina"],
    );
    expect(blocked).toBe(false);
    expect(swaps).toEqual([
      { from: "Vino blanco", to: "Vino blanco sin alcohol", restriction: "alcohol_cocina", label: "sin alcohol" },
    ]);
  });

  it("adapts even when alcohol is the dish's namesake ingredient", () => {
    const { swaps, blocked } = planAdaptations(
      recipe("Pollo a la cerveza", ["Pollo troceado", "Cerveza", "Cebolla"]),
      ["alcohol_cocina"],
    );
    expect(blocked).toBe(false);
    expect(swaps).toEqual([
      { from: "Cerveza", to: "Cerveza sin alcohol", restriction: "alcohol_cocina", label: "sin alcohol" },
    ]);
  });

  it("does not false-positive on sherry VINEGAR (jerez keyword was dropped)", () => {
    const { swaps, blocked } = planAdaptations(
      recipe("Gazpacho andaluz", ["Tomate maduro", "Pepino", "Vinagre de Jerez"]),
      ["alcohol_cocina"],
    );
    expect(swaps).toEqual([]);
    expect(blocked).toBe(false);
  });

  it("combines with lactosa_fina independently in the same recipe", () => {
    const { swaps } = planAdaptations(
      recipe("Crema de setas al vino", ["Nata", "Vino blanco", "Setas"]),
      ["lactosa_fina", "alcohol_cocina"],
    );
    expect(swaps).toEqual(
      expect.arrayContaining([
        { from: "Nata", to: "Nata sin lactosa", restriction: "lactosa_fina", label: "sin lactosa" },
        { from: "Vino blanco", to: "Vino blanco sin alcohol", restriction: "alcohol_cocina", label: "sin alcohol" },
      ]),
    );
    expect(swaps.length).toBe(2);
  });
});

describe("planAdaptations (lactosa_fina)", () => {
  it("swaps each dairy ingredient for its lactose-free version", () => {
    const { swaps, blocked } = planAdaptations(
      recipe("Lasaña", ["Leche entera", "Nata para cocinar", "Carne picada"]),
      ["lactosa_fina"],
    );
    expect(blocked).toBe(false);
    expect(swaps).toEqual(
      expect.arrayContaining([
        { from: "Leche entera", to: "Leche entera sin lactosa", restriction: "lactosa_fina", label: "sin lactosa" },
        { from: "Nata para cocinar", to: "Nata para cocinar sin lactosa", restriction: "lactosa_fina", label: "sin lactosa" },
      ]),
    );
    // The non-dairy ingredient is untouched.
    expect(swaps.some((s) => /carne/i.test(s.from))).toBe(false);
  });

  it("leaves recipes with no dairy untouched", () => {
    const { swaps, blocked } = planAdaptations(
      recipe("Merluza a la plancha", ["Merluza", "Limón"]),
      ["lactosa_fina"],
    );
    expect(swaps).toEqual([]);
    expect(blocked).toBe(false);
  });

  it("does NOT touch tolerated cured cheese / butter (not in the keyword list)", () => {
    const { swaps } = planAdaptations(
      recipe("Tostada", ["Queso curado", "Mantequilla"]),
      ["lactosa_fina"],
    );
    expect(swaps).toEqual([]);
  });

  it("is idempotent for an already lactose-free ingredient", () => {
    const { swaps } = planAdaptations(recipe("Batido", ["Leche sin lactosa"]), ["lactosa_fina"]);
    expect(swaps).toEqual([]);
  });

  it("blocks when the conflict is only in the dish name (nothing to rename)", () => {
    const { swaps, blocked } = planAdaptations(
      recipe("Batido de leche", ["Plátano", "Hielo"]),
      ["lactosa_fina"],
    );
    expect(swaps).toEqual([]);
    expect(blocked).toBe(true);
  });

  it("ignores non-adaptable restriction ids", () => {
    const { swaps, blocked } = planAdaptations(
      recipe("Pescado", ["Vino blanco"]),
      ["embarazo", "fructosa"],
    );
    expect(swaps).toEqual([]);
    expect(blocked).toBe(false);
  });
});

describe("buildAdaptationMap", () => {
  it("returns a rename map and a compact adaptations list", () => {
    const { renameByName, adaptations } = buildAdaptationMap(
      recipe("Crema", ["Nata", "Puerro"]),
      ["lactosa_fina"],
    );
    expect(renameByName.get("Nata")).toBe("Nata sin lactosa");
    expect(renameByName.has("Puerro")).toBe(false);
    expect(adaptations).toEqual([{ from: "Nata", to: "Nata sin lactosa", label: "sin lactosa" }]);
  });
});
