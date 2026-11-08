import { describe, it, expect } from "vitest";
import { RECIPES_BY_ID, registerRecipes } from "../../src/data/recipes.js";
import { recipeCatalogById } from "../../src/data/recipeCatalog.js";
import { catalogToFrontendRecipe } from "../../src/lib/aiPlanner.js";
import { recetaComun } from "./compartir.js";

// Misma instancia que ya atendió a otra casa: su receta privada está en el registro global.
const motorFalso = { RECIPES_BY_ID, registerRecipes, recipeCatalogById, catalogToFrontendRecipe };
const deSerie = new Set(Object.keys(RECIPES_BY_ID));
registerRecipes([{ id: "u_pepa02", name: "Croquetas privadas de Pepa", source: "user", ingredients: [], steps: [] }]);

describe("enlace rc_: solo catálogo común, nunca recetas propias de otra casa", () => {
  it("un rc_ con el id de una receta privada registrada por otra casa no la enseña", () => {
    expect(RECIPES_BY_ID.u_pepa02?.name).toBe("Croquetas privadas de Pepa");
    expect(recetaComun(motorFalso, deSerie, "u_pepa02")).toBeNull();
  });

  it("un rc_ del catálogo común sí funciona", () => {
    const delCatalogo = Object.values(recipeCatalogById)[0];
    expect(recetaComun(motorFalso, deSerie, delCatalogo.id)?.name).toBe(delCatalogo.name);
  });
});
