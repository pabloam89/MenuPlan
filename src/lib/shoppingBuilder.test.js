import { describe, it, expect } from "vitest";
import { buildShoppingList } from "./shoppingBuilder.js";

const GROUPS = [{ id: "g1", label: "Familia" }];

function planWith(day, meal, recipeId, eaters = 2) {
  return {
    g1: {
      [`${day}-${meal}`]: { recipeId, firstRecipeId: null, eaters, mode: "casa", warnings: [] },
    },
  };
}

describe("buildShoppingList pantry discount (Phase 6)", () => {
  it("without a pantry, nothing is discounted and pantryItems is empty", () => {
    const plan = planWith("Lun", "Comida", "pollo-horno-patatas");
    const sh = buildShoppingList(plan, GROUPS, ["Comida"]);
    expect(sh.pantryItems).toEqual([]);
    const all = sh.byCategory.flatMap((c) => c.items);
    expect(all.every((it) => it.fromPantry === false)).toBe(true);
    expect(sh.total).toBeGreaterThan(0);
  });

  it("moves matched ingredients to pantryItems and out of byCategory", () => {
    const plan = planWith("Lun", "Comida", "pollo-horno-patatas");
    const pantry = [{ ingredientName: "pollo", ingredientNormalized: "pollo" }];
    const sh = buildShoppingList(plan, GROUPS, ["Comida"], pantry);

    const pantryNames = sh.pantryItems.map((it) => it.name);
    expect(pantryNames).toContain("Pollo entero");

    const remainingNames = sh.byCategory.flatMap((c) => c.items).map((it) => it.name);
    expect(remainingNames).not.toContain("Pollo entero");
    // Other ingredients from the same recipe are untouched.
    expect(remainingNames).toContain("Patatas");
  });

  it("handles simple singular/plural matching (tomate ~ Tomates)", () => {
    const plan = planWith("Mar", "Cena", "tortilla-francesa");
    const pantry = [{ ingredientName: "tomate", ingredientNormalized: "tomate" }];
    const sh = buildShoppingList(plan, GROUPS, ["Cena"], pantry);
    expect(sh.pantryItems.map((it) => it.name)).toContain("Tomates");
  });

  it("does not remove pantry items — they're returned, just excluded from total", () => {
    const plan = planWith("Lun", "Comida", "pollo-horno-patatas");
    const withoutPantry = buildShoppingList(plan, GROUPS, ["Comida"]);
    const withPantry = buildShoppingList(plan, GROUPS, ["Comida"], [
      { ingredientName: "pollo", ingredientNormalized: "pollo" },
    ]);

    const totalItemsWithout =
      withoutPantry.byCategory.flatMap((c) => c.items).length + withoutPantry.pantryItems.length;
    const totalItemsWith =
      withPantry.byCategory.flatMap((c) => c.items).length + withPantry.pantryItems.length;
    expect(totalItemsWith).toBe(totalItemsWithout);

    // Total price drops by exactly the discounted item's price (whole-line
    // discount, no partial quantities per the feature spec).
    const chickenPrice = withoutPantry.byCategory
      .flatMap((c) => c.items)
      .find((it) => it.name === "Pollo entero").price;
    expect(withPantry.total).toBeCloseTo(withoutPantry.total - chickenPrice, 2);
  });

  it("does not false-positive match 'pollo' against unrelated ingredients", () => {
    // "Aceite de oliva" / "Cebolla" / "Limón" share no words with "pollo".
    const plan = planWith("Lun", "Comida", "pollo-horno-patatas");
    const pantry = [{ ingredientName: "cebolla", ingredientNormalized: "cebolla" }];
    const sh = buildShoppingList(plan, GROUPS, ["Comida"], pantry);
    const pantryNames = sh.pantryItems.map((it) => it.name);
    expect(pantryNames).toEqual(["Cebolla"]);
  });
});
