import { describe, it, expect } from "vitest";
import { componentOfIngredient, dominantComponentOf } from "./dominantComponent.js";
import { recipeCatalog } from "../data/recipeCatalog.js";

const ing = (name, amount, unit = "g") => ({ name, amount, unit });
const recipe = (...ingredients) => ({ ingredients });

describe("componentOfIngredient", () => {
  it("classifies meat, fish, eggs and legumes as proteina", () => {
    expect(componentOfIngredient("Pechuga de pollo")).toBe("proteina");
    expect(componentOfIngredient("Merluza")).toBe("proteina");
    expect(componentOfIngredient("Huevos")).toBe("proteina");
    expect(componentOfIngredient("Garbanzos")).toBe("proteina");
    expect(componentOfIngredient("Tofu")).toBe("proteina");
  });

  it("classifies grains, pasta and potatoes as hidrato", () => {
    expect(componentOfIngredient("Arroz")).toBe("hidrato");
    expect(componentOfIngredient("Espaguetis")).toBe("hidrato");
    expect(componentOfIngredient("Patatas")).toBe("hidrato");
    expect(componentOfIngredient("Pan")).toBe("hidrato");
  });

  it("classifies vegetables as verdura, handling plurals", () => {
    expect(componentOfIngredient("Acelgas")).toBe("verdura");
    expect(componentOfIngredient("Zanahoria")).toBe("verdura");
    expect(componentOfIngredient("Lechuga romana")).toBe("verdura");
  });

  it("disambiguates judía verde (vegetable) from judías (legume/protein)", () => {
    expect(componentOfIngredient("Judías verdes")).toBe("verdura");
    expect(componentOfIngredient("Judía verde")).toBe("verdura");
    expect(componentOfIngredient("Judías blancas")).toBe("proteina");
    expect(componentOfIngredient("Judías pintas")).toBe("proteina");
  });

  it("returns null for condiments, dairy and seasonings", () => {
    expect(componentOfIngredient("Aceite de oliva")).toBeNull();
    expect(componentOfIngredient("Sal")).toBeNull();
    expect(componentOfIngredient("Queso parmesano")).toBeNull();
    expect(componentOfIngredient("Vinagre")).toBeNull();
    expect(componentOfIngredient("Ajo")).toBeNull();
  });
});

describe("dominantComponentOf", () => {
  it("classifies a vegetable-heavy dish as verdura even with a starchy side ingredient", () => {
    // Acelgas rehogadas: 400g acelgas (verdura) vs 100g patata (hidrato)
    const r = recipe(ing("Acelgas", 400), ing("Patata", 100), ing("Aceite de oliva", 20, "ml"));
    expect(dominantComponentOf(r)).toBe("verdura");
  });

  it("classifies a meat-heavy dish as proteina", () => {
    const r = recipe(ing("Pechuga de pollo", 300), ing("Aceite de oliva", 15, "ml"), ing("Sal", 2));
    expect(dominantComponentOf(r)).toBe("proteina");
  });

  it("classifies a carb-heavy dish as hidrato", () => {
    const r = recipe(ing("Arroz", 300), ing("Caldo de pollo", 400, "ml"), ing("Azafrán", 1));
    expect(dominantComponentOf(r)).toBe("hidrato");
  });

  it("classifies a dish with no dominant single component as mixto", () => {
    // Real recipe: "Ensalada César" — 200g lechuga (verdura) + 200g pollo
    // (proteina) + 40g pan (hidrato). Name says "ensalada" but the chicken
    // carries as much weight as the lettuce, so it must NOT be classified
    // as verdura from the name alone.
    const r = recipe(
      ing("Lechuga romana", 200),
      ing("Pechuga de pollo", 200),
      ing("Pan", 40),
      ing("Queso parmesano", 20),
      ing("Mayonesa", 30),
    );
    expect(dominantComponentOf(r)).toBe("mixto");
  });

  it("falls back to mixto when no ingredient carries recognizable weight", () => {
    const r = recipe(ing("Sal", 2), ing("Aceite de oliva", 10, "ml"));
    expect(dominantComponentOf(r)).toBe("mixto");
  });

  it("weighs 'ud' ingredients using an assumed gram estimate, not zero", () => {
    // 3 whole eggs (proteina, "ud") vs a splash of oil — protein should win,
    // not be treated as weighing nothing next to a liquid measured in ml.
    const r = recipe(ing("Huevos", 3, "ud"), ing("Aceite de oliva", 5, "ml"));
    expect(dominantComponentOf(r)).toBe("proteina");
  });

  it("never throws across the full 244-recipe catalog and always returns a valid label", () => {
    const valid = new Set(["proteina", "hidrato", "verdura", "mixto"]);
    expect(recipeCatalog.length).toBeGreaterThan(0);
    for (const r of recipeCatalog) {
      expect(valid.has(dominantComponentOf(r))).toBe(true);
    }
  });
});
