import { describe, it, expect } from "vitest";
import { recipeViolatesDiet } from "./intolerances.js";

function recipe(overrides = {}) {
  return {
    name: "Receta de prueba",
    mainProtein: "none",
    ingredients: [],
    ...overrides,
  };
}

describe("recipeViolatesDiet", () => {
  it("returns false when no diet ids are active", () => {
    expect(recipeViolatesDiet(recipe({ mainProtein: "pollo" }), [])).toBe(false);
    expect(recipeViolatesDiet(recipe({ mainProtein: "pollo" }), null)).toBe(false);
  });

  it("returns false for an unrelated restriction id", () => {
    expect(recipeViolatesDiet(recipe({ mainProtein: "pollo" }), ["lactosa_fina"])).toBe(false);
  });

  describe("vegetariano", () => {
    it("excludes every meat/fish mainProtein", () => {
      for (const p of ["pollo", "pavo", "cerdo", "ternera", "pescado_blanco", "pescado_azul", "marisco"]) {
        expect(recipeViolatesDiet(recipe({ mainProtein: p }), ["vegetariano"])).toBe(true);
      }
    });

    it("allows legumbre/huevo/none mainProtein", () => {
      for (const p of ["legumbre", "huevo", "none"]) {
        expect(recipeViolatesDiet(recipe({ mainProtein: p }), ["vegetariano"])).toBe(false);
      }
    });

    it("catches meat carried only as an extraProtein (e.g. Cocido madrileño: mainProtein legumbre, extraProteins carne)", () => {
      const cocido = recipe({ mainProtein: "legumbre", extraProteins: ["ternera", "cerdo", "pollo"] });
      expect(recipeViolatesDiet(cocido, ["vegetariano"])).toBe(true);
    });

    it("does not exclude dairy or eggs (vegetarian, not vegan)", () => {
      const tortilla = recipe({ mainProtein: "huevo", ingredients: [{ name: "Huevo", amount: 2, unit: "ud" }, { name: "Leche", amount: 50, unit: "ml" }] });
      expect(recipeViolatesDiet(tortilla, ["vegetariano"])).toBe(false);
    });
  });

  describe("vegano", () => {
    it("also excludes meat/fish (implies vegetariano)", () => {
      expect(recipeViolatesDiet(recipe({ mainProtein: "pollo" }), ["vegano"])).toBe(true);
    });

    it("excludes huevo as mainProtein", () => {
      expect(recipeViolatesDiet(recipe({ mainProtein: "huevo" }), ["vegano"])).toBe(true);
    });

    it("excludes huevo carried only as an extraProtein", () => {
      const r = recipe({ mainProtein: "legumbre", extraProteins: ["huevo"] });
      expect(recipeViolatesDiet(r, ["vegano"])).toBe(true);
    });

    it("excludes dairy ingredients even when mainProtein is plant-based", () => {
      const gratin = recipe({
        mainProtein: "none",
        ingredients: [{ name: "Patata", amount: 300, unit: "g" }, { name: "Queso", amount: 50, unit: "g" }],
      });
      expect(recipeViolatesDiet(gratin, ["vegano"])).toBe(true);
    });

    it("excludes honey", () => {
      const r = recipe({ mainProtein: "none", ingredients: [{ name: "Miel", amount: 20, unit: "g" }] });
      expect(recipeViolatesDiet(r, ["vegano"])).toBe(true);
    });

    it("allows a plant-based dish with no dairy/egg/meat/fish", () => {
      const lentejas = recipe({
        mainProtein: "legumbre",
        ingredients: [{ name: "Lentejas", amount: 200, unit: "g" }, { name: "Zanahoria", amount: 80, unit: "g" }],
      });
      expect(recipeViolatesDiet(lentejas, ["vegano"])).toBe(false);
    });
  });
});
