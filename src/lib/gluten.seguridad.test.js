import { describe, it, expect } from "vitest";
import { normalizeAllergenId } from "./allergens.js";
import { filterRecipes, recipeViolatesHardSafety } from "../utils/filterRecipes.js";

// Hueco de seguridad: una persona celíaca no puede recibir una receta con
// gluten porque la casa tiene también la intolerancia «sin_gluten». Hasta que
// haya sustitutos certificados, la alergia al gluten bloquea siempre.

describe("celiaquía como alergia al gluten", () => {
  it.each(["celiaquía", "Celíaca", "celiaco", "celiaquia"])("normaliza «%s» a gluten", (texto) => {
    expect(normalizeAllergenId(texto)).toBe("gluten");
  });
});

describe("alergia al gluten no se desbloquea por sustitución", () => {
  const panConGluten = {
    allergens: ["gluten"],
    ingredients: [{ name: "Pan de molde" }, { name: "Jamón York" }],
  };

  it("bloquea con alergia «gluten» aunque la casa tenga sin_gluten", () => {
    expect(
      recipeViolatesHardSafety(panConGluten, { allergies: ["gluten"], intolerances: ["sin_gluten"] }),
    ).toBe(true);
  });

  it("bloquea con alergia escrita como «celiaquía» y sin_gluten", () => {
    expect(
      recipeViolatesHardSafety(panConGluten, { allergies: ["celiaquía"], intolerances: ["sin_gluten"] }),
    ).toBe(true);
  });

  it("filterRecipes no devuelve ninguna receta con gluten a quien tiene la alergia, con o sin sin_gluten", () => {
    for (const intolerances of [[], ["sin_gluten"]]) {
      const { recipes } = filterRecipes({ allergies: ["celiaquía"], intolerances });
      const conGluten = recipes.filter((r) =>
        (r.allergens ?? []).map(normalizeAllergenId).includes("gluten"),
      );
      expect(conGluten).toEqual([]);
    }
  });
});
