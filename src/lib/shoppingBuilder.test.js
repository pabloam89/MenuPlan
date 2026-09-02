import { describe, it, expect } from "vitest";
import { buildShoppingList, findMatchingPantryItem } from "./shoppingBuilder.js";
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

  // Fase 8: match exacto por id canónico, además del solape de palabras.
  // "Fabes de la granja secas" / "Judiones" son alias reales del mismo
  // ingrediente (alubia-grande) sin ninguna palabra en común — el
  // word-overlap por sí solo no los cruzaría.
  it("discounts via ingredientId when the pantry name shares no words with the recipe's", () => {
    registerRecipes([
      {
        id: "test_shopping_exact_id",
        name: "Fabada",
        servings: 2,
        ingredients: [
          { id: "fabes", name: "Fabes de la granja secas", category: "Legumbres", qty: 400, unit: "g" },
        ],
      },
    ]);
    const plan = planWith("Lun", "Comida", "test_shopping_exact_id");
    const pantry = [{ ingredientName: "Judiones", ingredientNormalized: "judiones", ingredientId: "alubia-grande" }];
    const sh = buildShoppingList(plan, GROUPS, ["Comida"], pantry);
    expect(sh.pantryItems.map((it) => it.name)).toContain("Fabes de la granja secas");
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

describe("buildShoppingList slots del congelador", () => {
  // Plato principal + guarnición ya fusionada, tal como la deja
  // applyGarnishToRecipe: los ingredientes de la guarnición van con id
  // "garnish-…" dentro de la misma receta.
  function registerDishWithGarnish() {
    registerRecipes([
      {
        id: "test_freezer_dish",
        name: "Albóndigas con puré",
        servings: 2,
        ingredients: [
          { id: "carne", name: "Carne picada", category: "Carnes", qty: 200, unit: "g" },
          { id: "garnish-patata", name: "Patata guarnición", category: "Verduras y frutas", qty: 300, unit: "g" },
        ],
      },
    ]);
  }

  function freezerPlan(slotPatch, eaters = 4) {
    return {
      g1: {
        "Lun-Comida": {
          recipeId: "test_freezer_dish",
          firstRecipeId: null,
          eaters,
          mode: "casa",
          warnings: [],
          ...slotPatch,
        },
      },
    };
  }

  const lineFor = (sh, name) =>
    [...sh.byCategory.flatMap((c) => c.items), ...sh.pantryItems].find((it) => it.name === name);

  it("un slot cubierto del todo no pide el plato, pero sí la guarnición", () => {
    registerDishWithGarnish();
    const sh = buildShoppingList(
      freezerPlan({ fromFreezer: true, frozenPortions: 4, freshPortions: 0 }),
      GROUPS,
      ["Comida"],
    );
    // La carne ya está cocinada en el congelador: nada que comprar.
    expect(lineFor(sh, "Carne picada")).toBeUndefined();
    // El puré se hace fresco para los 4 comensales (300 g × 4/2 = 600 g).
    expect(lineFor(sh, "Patata guarnición")?.qty).toBe(600);
  });

  it("un slot parcial compra solo las raciones que faltan por cocinar", () => {
    registerDishWithGarnish();
    const sh = buildShoppingList(
      freezerPlan({ fromFreezer: true, frozenPortions: 2, freshPortions: 2 }),
      GROUPS,
      ["Comida"],
    );
    // 2 de 4 raciones salen del congelador → carne para 2 (200 g × 2/2).
    expect(lineFor(sh, "Carne picada")?.qty).toBe(200);
    // La guarnición sigue siendo para los 4.
    expect(lineFor(sh, "Patata guarnición")?.qty).toBe(600);
  });

  it("sin fromFreezer se compra todo, como siempre", () => {
    registerDishWithGarnish();
    const sh = buildShoppingList(freezerPlan({}), GROUPS, ["Comida"]);
    expect(lineFor(sh, "Carne picada")?.qty).toBe(400);
    expect(lineFor(sh, "Patata guarnición")?.qty).toBe(600);
  });

  it("fromFreezer con 0 raciones no descuenta nada (flag inconsistente)", () => {
    registerDishWithGarnish();
    const sh = buildShoppingList(
      freezerPlan({ fromFreezer: true, frozenPortions: 0, freshPortions: 4 }),
      GROUPS,
      ["Comida"],
    );
    expect(lineFor(sh, "Carne picada")?.qty).toBe(400);
  });

  it("congelar el segundo no toca los ingredientes del primero", () => {
    registerRecipes([
      {
        id: "test_freezer_primero",
        name: "Sopa de picadillo",
        servings: 2,
        ingredients: [{ id: "fideos", name: "Fideos finos", category: "Despensa", qty: 80, unit: "g" }],
      },
      {
        id: "test_freezer_segundo",
        name: "Estofado",
        servings: 2,
        ingredients: [{ id: "morcillo", name: "Morcillo de ternera", category: "Carnes", qty: 200, unit: "g" }],
      },
    ]);
    const base = {
      firstRecipeId: "test_freezer_primero",
      recipeId: "test_freezer_segundo",
      eaters: 4,
      mode: "casa",
      warnings: [],
    };
    const normal = buildShoppingList({ g1: { "Lun-Comida": base } }, GROUPS, ["Comida"]);
    const sh = buildShoppingList(
      {
        g1: {
          "Lun-Comida": {
            ...base,
            fromFreezer: true,
            frozenRecipeId: "test_freezer_segundo",
            frozenPortions: 4,
            freshPortions: 0,
          },
        },
      },
      GROUPS,
      ["Comida"],
    );
    // El estofado sale del congelador…
    expect(lineFor(normal, "Morcillo de ternera")).toBeDefined();
    expect(lineFor(sh, "Morcillo de ternera")).toBeUndefined();
    // …y la sopa se compra exactamente igual que sin congelador.
    expect(lineFor(sh, "Fideos finos")?.qty).toBe(lineFor(normal, "Fideos finos")?.qty);
  });

  it("el precio del slot congelado baja al no incluir el plato", () => {
    registerRecipes([
      {
        id: "test_freezer_price",
        name: "Guiso congelable",
        servings: 2,
        ingredients: [
          { id: "carne", name: "Morcillo", category: "Carnes", qty: 200, unit: "g", pricePerUnit: 0.02 },
        ],
      },
    ]);
    const base = {
      recipeId: "test_freezer_price", firstRecipeId: null, eaters: 4, mode: "casa", warnings: [],
    };
    const normal = buildShoppingList({ g1: { "Lun-Comida": base } }, GROUPS, ["Comida"]);
    const frozen = buildShoppingList(
      { g1: { "Lun-Comida": { ...base, fromFreezer: true, frozenPortions: 4, freshPortions: 0 } } },
      GROUPS,
      ["Comida"],
    );
    expect(normal.total).toBeGreaterThan(0);
    expect(frozen.total).toBe(0);
  });
});

describe("findMatchingPantryItem", () => {
  it("uses the same fuzzy subset rules as shopping pantry discount", () => {
    const stock = [
      { id: "1", ingredientName: "Pollo", ingredientNormalized: "pollo", qty: 500, unit: "g" },
      { id: "2", ingredientName: "Tomate", ingredientNormalized: "tomate", qty: 400, unit: "g" },
    ];
    // Short pantry key is a subset of the recipe name words.
    expect(findMatchingPantryItem("Pollo entero", stock)?.id).toBe("1");
    expect(findMatchingPantryItem("Tomate maduro", stock)?.id).toBe("2");
  });

  it("matches when recipe words are a subset of a longer pantry key", () => {
    const stock = [
      { id: "3", ingredientName: "Pechuga de pollo", ingredientNormalized: "pechuga_pollo", qty: 300, unit: "g" },
    ];
    expect(findMatchingPantryItem("Pechuga de pollo", stock)?.id).toBe("3");
  });

  it("returns null when nothing overlaps", () => {
    expect(
      findMatchingPantryItem("Aceite de oliva", [
        { id: "1", ingredientNormalized: "tomate", qty: 1, unit: "ud" },
      ]),
    ).toBeNull();
  });

  // Fase 8: match exacto por ingredientId, cuando el word-overlap por sí solo
  // no llegaría. "Fabes de la granja secas" / "Judiones" son alias reales del
  // mismo ingrediente canónico (alubia-grande) sin ninguna palabra en común.
  it("matches via ingredientId even when the words share nothing", () => {
    const stock = [
      { id: "9", ingredientName: "Judiones", ingredientNormalized: "judiones", ingredientId: "alubia-grande", qty: 500, unit: "g" },
    ];
    expect(findMatchingPantryItem("Fabes de la granja secas", stock)?.id).toBe("9");
  });

  it("never uses the ingredientId shortcut on an adapted (dietary swap) line", () => {
    // A base ingredient's id must never satisfy an adapted line's stricter
    // rule — that's precisely the false-positive the adapted path exists to
    // prevent (see matchesPantry's comment).
    const stock = [
      { id: "1", ingredientName: "Leche", ingredientNormalized: "leche", ingredientId: "leche", qty: 1, unit: "l" },
    ];
    expect(findMatchingPantryItem("Leche sin lactosa", stock, { adapted: true })).toBeNull();
  });

  it("a pantry row without ingredientId falls back to word-overlap, never throws", () => {
    const stock = [
      { id: "1", ingredientName: "Pollo", ingredientNormalized: "pollo", qty: 500, unit: "g" },
    ];
    expect(findMatchingPantryItem("Pollo entero", stock)?.id).toBe("1");
  });
});
