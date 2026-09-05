import { describe, it, expect, vi, afterEach } from "vitest";
import {
  filterMyLibraryRecipes,
  generateUserRecipeDraft,
  isOwnCreatedRecipe,
  patchUserRecipeClassification,
} from "./userRecipes.js";
import { ingredientById } from "./ingredients.js";

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

// Bug real: "Merienda"/"Postre" (RecipePlanner.jsx, paso "¿Cuándo se sirve?")
// no estaban en el enum de mealRole — se descartaban en silencio y marcar
// esas casillas no guardaba nada.
describe("generateUserRecipeDraft mealRole merienda/postre", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("acepta merienda y postre como mealRole válidos", async () => {
    mockAIResponse({ ...VALID_DRAFT_FIELDS, mealRole: ["merienda", "postre"] });
    const draft = await generateUserRecipeDraft({
      name: "Macedonia de frutas",
      baseServings: 4,
      time: 10,
      ingredients: [{ name: "Fruta variada", amount: 500, unit: "g" }],
    });
    expect(draft.mealRole).toEqual(["merienda", "postre"]);
  });
});

// Fase 9: nutrición fiable. El catálogo real no tiene nutrición BEDCA
// todavía, así que estos tests inyectan `nutrition` a mano sobre "ajo" (misma
// técnica que ingredients.test.js: ingredientById devuelve la referencia
// compartida que usa el resolver) y la restauran después.
describe("generateUserRecipeDraft nutrición calculada (Fase 9)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    ingredientById.ajo.nutrition = null;
  });

  it("sustituye los macros de la IA por el cálculo real cuando la cobertura es alta", async () => {
    ingredientById.ajo.nutrition = {
      kcal100g: 100, protein100g: 20, carbs100g: 10, fat100g: 5,
      fiber100g: 2, sugar100g: 1, saturatedFat100g: 0.5, sodium100g: 50,
    };
    // 20 dientes × 5g/diente (PIECE_WEIGHTS) = 100g, cobertura total.
    const ingredients = [{ name: "Ajo", amount: 20, unit: "diente" }];
    mockAIResponse({ ...VALID_DRAFT_FIELDS, ingredients, kcal: 9999 });

    const draft = await generateUserRecipeDraft({
      name: "Receta de ajo",
      baseServings: 4,
      time: 15,
      ingredients,
    });

    expect(draft.nutritionSource).toBe("computed");
    // 100g de un ingrediente a 100kcal/100g = 100kcal totales / 4 raciones = 25.
    expect(draft.kcal).toBeCloseTo(25, 0);
    expect(draft.kcal).not.toBe(9999);
    expect(draft.fiber_g).toBeCloseTo(0.5, 1);
    // 50mg/100g × 100g / 4 raciones = 12.5, Math.round → 13.
    expect(draft.sodium_mg).toBe(13);
  });

  it("deja la estimación de la IA intacta cuando la cobertura es baja (sin catálogo BEDCA para el ingrediente)", async () => {
    // "ajo" se queda sin nutrición (afterEach ya lo limpió) — cobertura 0.
    const ingredients = [{ name: "Ajo", amount: 20, unit: "diente" }];
    mockAIResponse({ ...VALID_DRAFT_FIELDS, ingredients, kcal: 123 });

    const draft = await generateUserRecipeDraft({
      name: "Receta de ajo",
      baseServings: 4,
      time: 15,
      ingredients,
    });

    expect(draft.nutritionSource).toBe("ai");
    expect(draft.kcal).toBe(123);
    expect(draft.fiber_g).toBeUndefined();
  });
});

// Fase 6: canReceiveSauce/canBeGarnish, propuestos por la IA igual que
// usageTags — sin gate ex-ante sobre si la clasificación "tiene sentido". La
// única corrección que se aplica es de CONSISTENCIA INTERNA (dos campos de la
// misma respuesta que se contradicen), nunca un juicio de gusto.
describe("generateUserRecipeDraft canReceiveSauce/canBeGarnish", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const userIngredients = [{ name: "Merluza", amount: 200, unit: "g" }];

  it("respeta canReceiveSauce:true cuando no hay contradicción con los pasos", async () => {
    mockAIResponse({
      ...VALID_DRAFT_FIELDS,
      ingredients: userIngredients,
      canReceiveSauce: true,
      canBeGarnish: false,
    });

    const draft = await generateUserRecipeDraft({
      name: "Merluza a la plancha",
      baseServings: 4,
      time: 15,
      ingredients: userIngredients,
    });

    expect(draft.canReceiveSauce).toBe(true);
    expect(draft.canBeGarnish).toBe(false);
  });

  // El caso que motivó la corrección: la propia receta etiqueta un paso como
  // "ya hago mi salsa aparte" (part:"salsa") pero el modelo también dice que
  // el plato necesita que le empareje OTRA salsa — contradicción interna, se
  // corrige a false sin preguntar si la receta "tiene sentido".
  it("fuerza canReceiveSauce a false si algún paso ya es part:salsa, aunque el modelo diga true", async () => {
    mockAIResponse({
      ...VALID_DRAFT_FIELDS,
      ingredients: userIngredients,
      canReceiveSauce: true,
      steps: [
        { text: "Picar el ajo y el perejil.", minutes: 3, kind: "prep", part: "salsa" },
        { text: "Mezclar con aceite para el chimichurri.", minutes: 2, kind: "prep", part: "salsa" },
        { text: "Hacer la merluza a la plancha.", minutes: 6, kind: "activo", part: "principal" },
        { text: "Servir la merluza con el chimichurri por encima.", minutes: 1, kind: "emplatado", part: "combinado" },
      ],
    });

    const draft = await generateUserRecipeDraft({
      name: "Merluza con chimichurri",
      baseServings: 4,
      time: 15,
      ingredients: userIngredients,
    });

    expect(draft.canReceiveSauce).toBe(false);
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

describe("filterMyLibraryRecipes", () => {
  const user = { id: "u1" };
  const mine = { id: "user_mia", source: "user", owner: { id: "u1", name: "Pablo" } };
  // Copiada de Gente: la fila es tuya, pero sigue firmada por su autor.
  const copied = {
    id: "user_copia",
    source: "user",
    owner: { id: "u2", name: "Marta" },
    copiedFromRecipeId: "user_original",
  };

  it("incluye las copiadas del Feed, que isOwnCreatedRecipe deja fuera", () => {
    expect(isOwnCreatedRecipe(copied, user)).toBe(false);
    expect(filterMyLibraryRecipes([mine, copied], user)).toEqual([mine, copied]);
  });

  it("sigue dejando fuera lo que ni escribiste ni copiaste", () => {
    const ajena = { id: "user_otra", source: "user", owner: { id: "u2" } };
    expect(filterMyLibraryRecipes([mine, ajena], user)).toEqual([mine]);
  });
});
