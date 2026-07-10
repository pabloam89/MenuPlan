import { describe, it, expect } from "vitest";
import { buildShoppingList } from "./shoppingBuilder.js";
import { registerRecipes } from "../data/recipes.js";

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

describe("buildShoppingList adapted-ingredient flag", () => {
  it("flags a renamed ingredient so the UI can call out the swap, so the family buys the right product", () => {
    registerRecipes([
      {
        id: "test_shopping_adapted",
        name: "Puré de patatas sin lactosa",
        servings: 2,
        ingredients: [
          { id: "leche-sin-lactosa", name: "Leche sin lactosa", category: "Lácteos y huevos", qty: 200, unit: "ml" },
          { id: "patata", name: "Patata", category: "Verduras y frutas", qty: 400, unit: "g" },
        ],
        adaptations: [{ from: "Leche", to: "Leche sin lactosa", label: "sin lactosa" }],
      },
    ]);
    const plan = planWith("Lun", "Comida", "test_shopping_adapted");
    const sh = buildShoppingList(plan, GROUPS, ["Comida"]);
    const all = sh.byCategory.flatMap((c) => c.items);
    const milk = all.find((it) => it.name === "Leche sin lactosa");
    const potato = all.find((it) => it.name === "Patata");
    expect(milk.adapted).toBe(true);
    expect(potato.adapted).toBe(false);
  });

  it("does not flag ingredients from a recipe with no adaptations", () => {
    const plan = planWith("Lun", "Comida", "pollo-horno-patatas");
    const sh = buildShoppingList(plan, GROUPS, ["Comida"]);
    const all = sh.byCategory.flatMap((c) => c.items);
    expect(all.every((it) => it.adapted === false)).toBe(true);
  });

  it("a plain pantry entry does NOT discount an adapted line (Fase 5 audit)", () => {
    // A generic "leche" pantry entry means the family has regular milk at
    // home — it does not mean they already have the lactose-free substitute
    // this recipe was adapted to need. Discounting the adapted line here
    // would silently make the shopping list under-buy the one product the
    // `adapted` flag exists to call out.
    registerRecipes([
      {
        id: "test_shopping_adapted_pantry_plain",
        name: "Pure sin lactosa (pantry plain)",
        servings: 2,
        ingredients: [
          { id: "leche-sin-lactosa", name: "Leche sin lactosa", category: "Lácteos y huevos", qty: 200, unit: "ml" },
        ],
        adaptations: [{ from: "Leche", to: "Leche sin lactosa", label: "sin lactosa" }],
      },
    ]);
    const plan = planWith("Lun", "Comida", "test_shopping_adapted_pantry_plain");
    const pantry = [{ ingredientName: "leche", ingredientNormalized: "leche" }];
    const sh = buildShoppingList(plan, GROUPS, ["Comida"], pantry);

    expect(sh.pantryItems.map((it) => it.name)).not.toContain("Leche sin lactosa");
    const remaining = sh.byCategory.flatMap((c) => c.items);
    const milk = remaining.find((it) => it.name === "Leche sin lactosa");
    expect(milk).toBeTruthy();
    expect(milk.adapted).toBe(true);
  });

  it("a pantry entry that names the specific adapted product still discounts it", () => {
    registerRecipes([
      {
        id: "test_shopping_adapted_pantry_exact",
        name: "Pure sin lactosa (pantry exact)",
        servings: 2,
        ingredients: [
          { id: "leche-sin-lactosa", name: "Leche sin lactosa", category: "Lácteos y huevos", qty: 200, unit: "ml" },
        ],
        adaptations: [{ from: "Leche", to: "Leche sin lactosa", label: "sin lactosa" }],
      },
    ]);
    const plan = planWith("Lun", "Comida", "test_shopping_adapted_pantry_exact");
    const pantry = [{ ingredientName: "leche sin lactosa", ingredientNormalized: "leche_sin_lactosa" }];
    const sh = buildShoppingList(plan, GROUPS, ["Comida"], pantry);

    expect(sh.pantryItems.map((it) => it.name)).toContain("Leche sin lactosa");
  });
});

describe("buildShoppingList aggregation across recipes (Fase 5 audit)", () => {
  it("sums the same ingredient (same name/unit) shared by two different recipes into one line", () => {
    registerRecipes([
      {
        id: "test_agg_recipe_a",
        name: "Receta A con tomate",
        servings: 2,
        ingredients: [{ id: "tomate", name: "Tomate", category: "Verduras y frutas", qty: 100, unit: "g" }],
      },
      {
        id: "test_agg_recipe_b",
        name: "Receta B con tomates",
        servings: 2,
        ingredients: [{ id: "tomate", name: "Tomates", category: "Verduras y frutas", qty: 150, unit: "g" }],
      },
    ]);
    const plan = {
      g1: {
        "Lun-Comida": { recipeId: "test_agg_recipe_a", firstRecipeId: null, eaters: 2, mode: "casa", warnings: [] },
        "Mar-Comida": { recipeId: "test_agg_recipe_b", firstRecipeId: null, eaters: 2, mode: "casa", warnings: [] },
      },
    };
    const sh = buildShoppingList(plan, GROUPS, ["Comida"]);
    const all = sh.byCategory.flatMap((c) => c.items);
    // "Tomate" (100 g) and "Tomates" (150 g) must merge into ONE line
    // totaling 250 g before pack-size snapping — not two separate,
    // individually-understated lines.
    const tomateLines = all.filter((it) => it.name === "Tomate" || it.name === "Tomates");
    expect(tomateLines.length).toBe(1);
  });

  it("rounds a fractional 'ud' quantity (not covered by any pack-size rule) up to a whole, purchasable count", () => {
    // Real catalog case: "lentejas-verduras" lists onion/potato/pepper/carrot
    // directly in "ud" (not "g"), so the g→ud PACK_SIZES rules never apply.
    // Scaled down to 1 eater, some lines come out as fractions of a unit
    // (e.g. 0.25 cebolla) — you can't buy a quarter onion.
    const plan = planWith("Lun", "Comida", "lentejas-verduras", 1);
    const sh = buildShoppingList(plan, GROUPS, ["Comida"]);
    const all = sh.byCategory.flatMap((c) => c.items);
    const udItems = all.filter((it) => it.unit === "ud");
    expect(udItems.length).toBeGreaterThan(0);
    for (const it of udItems) {
      expect(Number.isInteger(it.qty)).toBe(true);
      expect(it.qty).toBeGreaterThanOrEqual(1);
    }
  });
});
