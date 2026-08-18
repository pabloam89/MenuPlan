import { describe, it, expect, vi, afterEach } from "vitest";
import { generateUserRecipeDraft, patchUserRecipeClassification } from "./userRecipes.js";

function mockAIResponse(payload) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ content: [{ text: JSON.stringify(payload) }] }),
    }),
  );
}

const VALID_DRAFT_FIELDS = {
  name: "Ensalada de prueba",
  category: "ensaladas_verduras",
  mainProtein: "none",
  mealRole: ["primero"],
  usageTags: ["plato_normal"],
  type: "principal",
  time: 15,
  difficulty: "facil",
  kcal: 200,
  protein_g: 5,
  carbs_g: 20,
  fat_g: 8,
  baseServings: 4,
  kidFriendly: true,
  tupperFriendly: true,
  allergens: [],
  season: "all",
  steps: ["Lavar la lechuga", "Cortar el tomate", "Mezclar y aliñar"],
  description: "Una ensalada sencilla.",
};

describe("generateUserRecipeDraft ingredients", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses the user's own ingredient list even if the model echoes it back faithfully", async () => {
    const userIngredients = [
      { name: "Lechuga", amount: 200, unit: "g" },
      { name: "Tomate", amount: 2, unit: "ud" },
    ];
    mockAIResponse({
      ...VALID_DRAFT_FIELDS,
      ingredients: userIngredients,
    });

    const draft = await generateUserRecipeDraft({
      name: "Ensalada de prueba",
      baseServings: 4,
      time: 15,
      ingredients: userIngredients,
    });

    expect(draft.ingredients).toEqual(userIngredients);
  });

  it("ignores a hallucinated extra ingredient with an invalid unit instead of failing the whole draft", async () => {
    const userIngredients = [
      { name: "Lechuga", amount: 200, unit: "g" },
      { name: "Tomate", amount: 2, unit: "ud" },
    ];
    mockAIResponse({
      ...VALID_DRAFT_FIELDS,
      // The model added two extra ingredients the user never entered, with a
      // unit ("manojo") outside INGREDIENT_UNITS — this used to fail Zod
      // validation for the entire draft (ingredients.2.unit / ingredients.3.unit).
      ingredients: [
        ...userIngredients,
        { name: "Cebollino", amount: 1, unit: "manojo" },
        { name: "Aceite de oliva", amount: 1, unit: "manojo" },
      ],
    });

    const draft = await generateUserRecipeDraft({
      name: "Ensalada de prueba",
      baseServings: 4,
      time: 15,
      ingredients: userIngredients,
    });

    expect(draft.ingredients).toEqual(userIngredients);
  });

  it("omits amount for qualitative units (al gusto/pizca/c-n) instead of trusting a model-invented number", async () => {
    const userIngredients = [{ name: "Sal", unit: "al gusto" }];
    mockAIResponse({
      ...VALID_DRAFT_FIELDS,
      // Model invents an amount for a qualitative unit despite the prompt
      // explicitly forbidding it.
      ingredients: [{ name: "Sal", amount: 3, unit: "al gusto" }],
    });

    const draft = await generateUserRecipeDraft({
      name: "Ensalada de prueba",
      baseServings: 4,
      time: 15,
      ingredients: userIngredients,
    });

    expect(draft.ingredients).toEqual([{ name: "Sal", unit: "al gusto" }]);
  });
});

describe("patchUserRecipeClassification", () => {
  it("maps cena rápida to category and cena role", () => {
    const base = {
      id: "user_test",
      category: "pasta_arroces",
      usageTags: ["plato_normal"],
      type: "principal",
      mealRole: ["segundo"],
    };
    const next = patchUserRecipeClassification(base, { quickDinner: true, mealRole: ["segundo", "cena"] });
    expect(next.category).toBe("cenas_rapidas");
    expect(next.mealRole).toContain("cena");
  });
});
