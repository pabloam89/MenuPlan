import { describe, it, expect } from "vitest";
import { registerRecipes, RECIPES_BY_ID } from "./recipes.js";

describe("registerRecipes", () => {
  it("derives healthFlags for a recipe that doesn't declare them, so its badge is never wrong by omission", () => {
    registerRecipes([
      {
        id: "test_fried_chorizo",
        name: "Costillas fritas con chorizo",
        ingredients: [{ name: "Costillas" }, { name: "Chorizo" }],
      },
    ]);
    const registered = RECIPES_BY_ID["test_fried_chorizo"];
    expect(registered.healthFlags).toContain("frito");
    expect(registered.healthFlags).toContain("embutido");
  });

  it("leaves already-derived healthFlags untouched", () => {
    registerRecipes([
      {
        id: "test_predeclared",
        name: "Receta con flags propios",
        ingredients: [{ name: "Chorizo" }],
        healthFlags: ["custom_flag"],
      },
    ]);
    expect(RECIPES_BY_ID["test_predeclared"].healthFlags).toEqual(["custom_flag"]);
  });

  it("re-derives healthFlags when an existing entry is re-registered without them", () => {
    registerRecipes([{ id: "test_reregister", name: "Flan casero", ingredients: [] }]);
    expect(RECIPES_BY_ID["test_reregister"].healthFlags).toContain("azucar_anadido");
  });
});
