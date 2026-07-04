import { describe, it, expect } from "vitest";
import { filterRecipes, decisionCatalog, scorePantryMatch } from "./filterRecipes.js";

function recipe(ingredientNames) {
  return { ingredients: ingredientNames.map((name) => ({ name })) };
}

describe("scorePantryMatch", () => {
  it("returns 0 when the pantry is empty or absent", () => {
    const r = recipe(["Pechuga de pollo", "Arroz", "Cebolla"]);
    expect(scorePantryMatch(r, [])).toBe(0);
    expect(scorePantryMatch(r, undefined)).toBe(0);
  });

  it("scores the proportion of recipe ingredients the user already has", () => {
    const r = recipe(["Pechuga de pollo", "Arroz", "Cebolla", "Ajo"]);
    // Has 2 of 4 ingredients (via whole-word overlap, not the exact catalog string)
    expect(scorePantryMatch(r, ["pollo", "arroz"])).toBe(0.5);
  });

  it("does not false-positive match 'pollo' inside 'Repollo'", () => {
    const r = recipe(["Repollo", "Zanahoria"]);
    expect(scorePantryMatch(r, ["pollo"])).toBe(0);
  });

  it("matches a specific cut against its generic pantry entry and vice versa", () => {
    const r = recipe(["Pechuga de pollo"]);
    expect(scorePantryMatch(r, ["pollo"])).toBe(1);
    expect(scorePantryMatch(r, ["pechuga_pollo"])).toBe(1);
  });

  it("does not double count one pantry ingredient matching two recipe ingredients", () => {
    // "pollo" matches both chicken ingredients, but the denominator is still
    // the recipe's total ingredient count, and the numerator counts pantry
    // items with at least one match — not every ingredient pair.
    const r = recipe(["Pechuga de pollo", "Muslos de pollo", "Arroz"]);
    expect(scorePantryMatch(r, ["pollo"])).toBeCloseTo(1 / 3);
  });
});

describe("filterRecipes pantry integration", () => {
  const baseOpts = { maxTime: 999, cookLevel: "pro" };

  it("never changes which recipes survive filtering", () => {
    const without = filterRecipes(baseOpts).recipes.map((r) => r.id);
    const withPantry = filterRecipes({ ...baseOpts, pantryIngredients: ["pollo", "tomate"] }).recipes.map((r) => r.id);
    expect(withPantry).toEqual(without);
  });

  it("attaches pantryScore only when pantryIngredients is provided", () => {
    const { recipes: withoutPantry } = filterRecipes(baseOpts);
    expect(withoutPantry.every((r) => r.pantryScore === undefined)).toBe(true);

    const { recipes: withPantry } = filterRecipes({ ...baseOpts, pantryIngredients: ["pollo"] });
    const scored = withPantry.filter((r) => r.pantryScore > 0);
    expect(scored.length).toBeGreaterThan(0);
  });
});

describe("decisionCatalog pantryScore", () => {
  it("omits pantryScore when zero, includes it (rounded) when positive", () => {
    const { recipes } = filterRecipes({ maxTime: 999, cookLevel: "pro", pantryIngredients: ["pollo"] });
    const entries = decisionCatalog(recipes);
    for (const entry of entries) {
      const recipe = recipes.find((r) => r.id === entry.id);
      if (recipe.pantryScore > 0) {
        expect(entry.pantryScore).toBeCloseTo(recipe.pantryScore, 1);
      } else {
        expect(entry.pantryScore).toBeUndefined();
      }
    }
  });
});
