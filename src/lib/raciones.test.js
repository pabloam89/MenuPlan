import { describe, it, expect } from "vitest";
import { factorRacion, racionesDe } from "./raciones.js";
import { catalogToFrontendRecipe } from "./aiPlanner.js";
import { buildShoppingList } from "./shoppingBuilder.js";
import { registerRecipes } from "../data/recipes.js";
import { recipeCatalogById } from "../data/recipeCatalog.js";

describe("factorRacion", () => {
  it("sin peso ni altura, 1: el menú de quien no los da no cambia", () => {
    expect(factorRacion({}, 40)).toBe(1);
    expect(factorRacion({ pesoKg: 70 }, 40)).toBe(1);
  });
  it("un adulto grande come más que uno pequeño", () => {
    const grande = factorRacion({ pesoKg: 95, alturaCm: 190 }, 35);
    const pequeno = factorRacion({ pesoKg: 55, alturaCm: 158 }, 35);
    expect(grande).toBeGreaterThan(1);
    expect(pequeno).toBeLessThanOrEqual(1);
  });
  it("un niño de 6 años con sus datos come menos que un adulto", () => {
    expect(factorRacion({ pesoKg: 22, alturaCm: 118 }, 6)).toBeCloseTo(0.75, 2);
  });
  it("acotado: nunca menos de 0,4 ni más de 1,8", () => {
    expect(factorRacion({ pesoKg: 8, alturaCm: 70 }, 1)).toBe(0.4);
    expect(factorRacion({ pesoKg: 200, alturaCm: 210 }, 25)).toBe(1.8);
  });
  it("racionesDe suma los de cada uno", () => {
    const casa = [{ pesoKg: 22, alturaCm: 118, edad: 6 }, { edad: 40 }];
    expect(racionesDe(casa, (m) => m.edad)).toBeCloseTo(1.75, 2);
  });
});

describe("las raciones llegan a la receta y a la compra", () => {
  const base = Object.values(recipeCatalogById).find((r) =>
    r.baseServings > 0 && (r.ingredients ?? []).some((i) => i.unit === "g" && i.amount >= 100));
  const ing = base.ingredients.find((i) => i.unit === "g" && i.amount >= 100);
  const cantidad = (sh) => sh.byCategory.flatMap((c) => c.items).concat(sh.pantryItems)
    .filter((it) => it.name.toLowerCase() === ing.name.toLowerCase())
    // Lo que pide la receta (sources), no la fila: esa va redondeada a
    // paquete (300 g y 400 g de lentejas son los dos «500 g»).
    .flatMap((it) => it.sources ?? [])
    .reduce((s, x) => s + (x.qty ?? 0), 0);
  let n = 0;
  const compraCon = (slot, fr) => {
    // Id propio por prueba: con el del catálogo, RECIPES_BY_ID puede servir
    // la receta del catálogo en vez de esta.
    fr = { ...fr, id: `prueba_raciones_${++n}` };
    registerRecipes([fr]);
    return buildShoppingList({ g1: { "Lun-Comida": { recipeId: fr.id, firstRecipeId: null, mode: "casa", warnings: [], ...slot } } }, [{ id: "g1" }], ["Comida"]);
  };

  it("sin raciones, la compra es la de siempre (por cabezas)", () => {
    const fr = catalogToFrontendRecipe(base, 4);
    expect(fr.raciones).toBe(4);
    expect(cantidad(compraCon({ eaters: 4 }, fr))).toBeGreaterThan(0);
  });

  it("4 personas que comen 3 raciones compran 3/4", () => {
    const porCabezas = cantidad(compraCon({ eaters: 4 }, catalogToFrontendRecipe(base, 4)));
    const fr = catalogToFrontendRecipe(base, 4, [], 3);
    expect(fr.servings).toBe(4);
    const porRaciones = cantidad(compraCon({ eaters: 4, raciones: 3 }, fr));
    expect(porRaciones / porCabezas).toBeCloseTo(0.75, 1);
  });

  it("la misma receta en otro hueco con otras raciones compra las de ese hueco", () => {
    const porCabezas = cantidad(compraCon({ eaters: 4 }, catalogToFrontendRecipe(base, 4)));
    // Receta escalada a 3 raciones en su primer hueco; este hueco pide 4,5.
    const fr = catalogToFrontendRecipe(base, 4, [], 3);
    const otra = cantidad(compraCon({ eaters: 4, raciones: 4.5 }, fr));
    expect(otra / porCabezas).toBeCloseTo(4.5 / 4, 1);
  });
});
