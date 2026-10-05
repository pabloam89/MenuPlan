import { describe, it, expect } from "vitest";
import { RECIPES_BY_ID, registerRecipes } from "../../src/data/recipes.js";
import { recipeCatalogById } from "../../src/data/recipeCatalog.js";
import { recetasDeCasa } from "./menu.js";

// El registro del motor es de toda la instancia (src/data/recipes.js), como en
// Vercel cuando la misma instancia atiende a dos casas seguidas.
const motorFalso = { RECIPES_BY_ID, registerRecipes, recipeCatalogById };
const deSerie = new Set(Object.keys(RECIPES_BY_ID));
const nombres = (m) => Object.values(m.RECIPES_BY_ID).map((r) => r?.name);

describe("recetas de una casa: otra casa no las ve", () => {
  const propiaDeA = { id: "u_pepa01", name: "Croquetas de la abuela Pepa", source: "user", ingredients: [], steps: [] };
  const casaA = recetasDeCasa(motorFalso, deSerie, new Set());
  casaA.registerRecipes([propiaDeA]);

  it("la casa A ve su receta propia, por id y al buscar por nombre", () => {
    expect(casaA.RECIPES_BY_ID.u_pepa01?.name).toBe("Croquetas de la abuela Pepa");
    expect(nombres(casaA)).toContain("Croquetas de la abuela Pepa");
  });

  it("la casa B, en la misma instancia, no la ve ni por id ni por nombre", () => {
    const casaB = recetasDeCasa(motorFalso, deSerie, new Set());
    expect(casaB.RECIPES_BY_ID.u_pepa01).toBeUndefined();
    expect("u_pepa01" in casaB.RECIPES_BY_ID).toBe(false);
    expect(nombres(casaB)).not.toContain("Croquetas de la abuela Pepa");
  });

  it("el catálogo común sí lo ven las dos, aunque lo registrara la otra", () => {
    const delCatalogo = Object.values(recipeCatalogById)[0];
    casaA.registerRecipes([{ id: `familia__${delCatalogo.id}`, name: delCatalogo.name }]);
    const casaB = recetasDeCasa(motorFalso, deSerie, new Set());
    expect(casaB.RECIPES_BY_ID[`familia__${delCatalogo.id}`]?.name).toBe(delCatalogo.name);
  });

  it("lo que registra la casa B pasa a ser suyo, y las funciones del motor siguen", () => {
    const casaB = recetasDeCasa(motorFalso, deSerie, new Set());
    casaB.registerRecipes([{ id: "u_suyab1", name: "Lentejas de Isa", source: "user" }]);
    expect(casaB.RECIPES_BY_ID.u_suyab1?.name).toBe("Lentejas de Isa");
    expect(typeof casaB.recipeCatalogById).toBe("object");
  });
});
