import { describe, it, expect } from "vitest";
import { recipeToRow, rowToRecipe } from "./userRecipesSync.js";

// Fase 9: fiber_g/sugar_g/saturated_fat_g/sodium_mg/nutritionSource
// (0042_user_recipes_nutrition.sql) — antes de esta migración se calculaban
// en generateUserRecipeDraft pero se perdían al guardar/recargar porque este
// mapeo explícito campo-a-campo no los conocía.
describe("recipeToRow/rowToRecipe — nutrición calculada (Fase 9)", () => {
  it("recipeToRow guarda los 4 campos nuevos y el origen de la nutrición", () => {
    const recipe = {
      id: "user_test",
      kcal: 250,
      fiber_g: 3.2,
      sugar_g: 1.5,
      saturated_fat_g: 0.8,
      sodium_mg: 120,
      nutritionSource: "computed",
    };
    const row = recipeToRow(recipe, "u1");
    expect(row.fiber_g).toBe(3.2);
    expect(row.sugar_g).toBe(1.5);
    expect(row.saturated_fat_g).toBe(0.8);
    expect(row.sodium_mg).toBe(120);
    expect(row.nutrition_source).toBe("computed");
  });

  it("recipeToRow guarda null (no 0) cuando la receta nunca los calculó", () => {
    const row = recipeToRow({ id: "user_test", kcal: 250 }, "u1");
    expect(row.fiber_g).toBeNull();
    expect(row.nutrition_source).toBeNull();
  });

  it("rowToRecipe recupera los 4 campos y el origen tal cual se guardaron", () => {
    const recipe = rowToRecipe({
      id: "user_test",
      fiber_g: 3.2,
      sugar_g: 1.5,
      saturated_fat_g: 0.8,
      sodium_mg: 120,
      nutrition_source: "computed",
    });
    expect(recipe.fiber_g).toBe(3.2);
    expect(recipe.sugar_g).toBe(1.5);
    expect(recipe.saturated_fat_g).toBe(0.8);
    expect(recipe.sodium_mg).toBe(120);
    expect(recipe.nutritionSource).toBe("computed");
  });

  it("rowToRecipe deja los 4 campos en undefined (no 0/null) para una fila anterior a la migración 0042", () => {
    // Sin las columnas nuevas (fila real de antes de 0042) o con ellas a NULL
    // — en ningún caso debe leerse como "el plato no tiene fibra".
    const recipe = rowToRecipe({ id: "user_test" });
    expect(recipe.fiber_g).toBeUndefined();
    expect(recipe.sugar_g).toBeUndefined();
    expect(recipe.saturated_fat_g).toBeUndefined();
    expect(recipe.sodium_mg).toBeUndefined();
    expect(recipe.nutritionSource).toBeUndefined();
  });
});
