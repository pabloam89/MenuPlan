import { describe, it, expect } from "vitest";
import { formatMenuText } from "./menuExport.js";
import { registerRecipes } from "../data/recipes.js";

const group = { id: "g1", label: "Familia" };

function baseData(extra = {}) {
  return {
    members: [{ id: "m1", name: "Ana" }],
    groups: [group],
    meals: ["Comida", "Cena"],
    ...extra,
  };
}

describe("formatMenuText includes active off-menu meals (desayuno/merienda/postre)", () => {
  it("previously dropped postre/desayuno/merienda entirely — it only ever walked getMeals() (Comida/Cena)", () => {
    registerRecipes([
      { id: "test_comida", name: "Lentejas" },
      { id: "test_cena", name: "Tortilla francesa" },
      { id: "test_desayuno", name: "Tostada con tomate" },
      { id: "test_postre", name: "Macedonia de fruta" },
    ]);
    const data = baseData({ extraMeals: { desayuno: "variado", postre: "cena" } });
    const menuPlan = {
      [group.id]: {
        "Lun-Comida": { recipeId: "test_comida", eaters: 2 },
        "Lun-Cena": { recipeId: "test_cena", eaters: 2 },
        "Lun-Desayuno": { recipeId: "test_desayuno", eaters: 2, extraMeal: "desayuno" },
        "Lun-Postre": { recipeId: "test_postre", eaters: 2, extraMeal: "postre" },
      },
    };

    const text = formatMenuText(data, menuPlan, [group]);

    expect(text).toContain("Lentejas");
    expect(text).toContain("Tortilla francesa");
    expect(text).toContain("Tostada con tomate");
    expect(text).toContain("Macedonia de fruta");
  });

  it("still exports a plain Comida/Cena menu unchanged when no extra meals are active", () => {
    registerRecipes([
      { id: "test_comida2", name: "Arroz con pollo" },
      { id: "test_cena2", name: "Crema de calabacín" },
    ]);
    const data = baseData();
    const menuPlan = {
      [group.id]: {
        "Lun-Comida": { recipeId: "test_comida2", eaters: 2 },
        "Lun-Cena": { recipeId: "test_cena2", eaters: 2 },
      },
    };

    const text = formatMenuText(data, menuPlan, [group]);
    expect(text).toContain("Arroz con pollo");
    expect(text).toContain("Crema de calabacín");
    expect(text).not.toContain("Desayuno");
    expect(text).not.toContain("Postre");
  });
});
