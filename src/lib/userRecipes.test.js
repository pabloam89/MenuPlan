import { describe, it, expect, vi, afterEach } from "vitest";
import {
  generateUserRecipeDraft,
  isOwnCreatedRecipe,
  patchUserRecipeClassification,
} from "./userRecipes.js";

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
  it("maps cena rápida to the montaje axis and the cena role, leaving category alone", () => {
    const base = {
      id: "user_test",
      category: "pasta_arroces",
      usageTags: ["plato_normal"],
      type: "principal",
      mealRole: ["segundo"],
    };
    const next = patchUserRecipeClassification(base, { quickDinner: true, mealRole: ["segundo", "cena"] });
    // "Cena rápida" ya no secuestra `category`: es su propio eje. Que el plato
    // siga siendo de pasta y ADEMÁS sea cena rápida es justo lo que el enum de
    // valor único no podía expresar.
    expect(next.montaje).toBe(true);
    expect(next.category).toBe("pasta_arroces");
    expect(next.mealRole).toContain("cena");
  });

  it("keeps the deprecated category on recipes that already carried it", () => {
    // Las recetas de usuario ya guardadas nunca se migran (el enum de Postgres
    // conserva el valor), así que reclasificarlas no debe reescribir su
    // category — solo añadir el eje nuevo.
    const legacy = {
      id: "user_legacy",
      category: "cenas_rapidas",
      usageTags: ["plato_normal"],
      type: "principal",
      mealRole: ["cena"],
    };
    const next = patchUserRecipeClassification(legacy, {});
    expect(next.montaje).toBe(true);
    expect(next.category).toBe("cenas_rapidas");
  });
});

describe("isOwnCreatedRecipe", () => {
  const user = { id: "u1" };

  it("accepts recipes saved via Crear receta (user_* + owner)", () => {
    expect(isOwnCreatedRecipe({
      id: "user_abc",
      source: "user",
      owner: { id: "u1", name: "Pablo" },
    }, user)).toBe(true);
  });

  it("rejects ownerless rows (legacy catalog shortcuts)", () => {
    expect(isOwnCreatedRecipe({
      id: "user_abc",
      source: "user",
      type: "guarnicion",
      name: "Ensalada César",
    }, user)).toBe(false);
  });

  it("rejects catalog dish+garnish combo clones", () => {
    expect(isOwnCreatedRecipe({
      id: "user_abc",
      source: "user",
      owner: { id: "u1" },
      linkedCatalogId: "carnes_003",
      pinnedGarnishId: "guarniciones_001",
    }, user)).toBe(false);
  });
});
