import { describe, it, expect } from "vitest";
import { motivoDeFamilia, recuentoDelMenu } from "./menuRecuento.js";

/** Un catálogo mínimo con los ejes que el recuento mira. */
const CATALOGO = {
  carnes_001: { category: "carnes", mainProtein: "pollo", tecnica: "horno" },
  pescados_001: { category: "pescados", mainProtein: "pescado_blanco", tecnica: "plancha" },
  pasta_001: { category: "pasta_arroces", mainProtein: "huevo", cocina: "italiana" },
  verdura_001: { category: "sopas_cremas", mainProtein: "none" },
  legumbres_001: { category: "legumbres", mainProtein: "legumbre" },
};

const plan = (slots, groupId = "g1") => ({ [groupId]: slots, _warnings: [] });

describe("cuenta lo que hay en la semana", () => {
  it("una comida con dos platos son dos recetas y un hueco", () => {
    const r = recuentoDelMenu(
      plan({ "Lun-Comida": { firstRecipeId: "verdura_001", recipeId: "carnes_001" } }),
      CATALOGO,
    );
    expect(r.huecos).toBe(1);
    expect(r.familias).toEqual({ verdura: 1, carne: 1 });
  });

  it("un plato que gasta dos cuotas cuenta en las dos", () => {
    // "Arroz a la cubana" es pasta_arroz Y huevos: contarlo en una sola dejaría
    // al bot ciego a la mitad de lo que se está comiendo.
    const r = recuentoDelMenu(plan({ "Lun-Comida": { recipeId: "pasta_001" } }), CATALOGO);
    expect(r.familias).toEqual({ pasta_arroz: 1, huevos: 1 });
  });

  it("recoge cocina y técnica cuando el plato las declara", () => {
    const r = recuentoDelMenu(
      plan({
        "Lun-Comida": { recipeId: "pasta_001" },
        "Lun-Cena": { recipeId: "pescados_001" },
        "Mar-Comida": { recipeId: "carnes_001" },
      }),
      CATALOGO,
    );
    expect(r.cocinas).toEqual({ italiana: 1 });
    expect(r.tecnicas).toEqual({ plancha: 1, horno: 1 });
  });
});

describe("bordes que se dan de verdad", () => {
  it("con varios menús, el prefijo de grupo no despista", () => {
    // Con más de un menú los ids llegan como "g1__carnes_001".
    const r = recuentoDelMenu(
      { g1: { "Lun-Comida": { recipeId: "g1__carnes_001" } } },
      CATALOGO,
    );
    expect(r.familias).toEqual({ carne: 1 });
  });

  it("las claves internas del plan no son un grupo", () => {
    const r = recuentoDelMenu(
      { _warnings: ["algo"], g1: { "Lun-Cena": { recipeId: "legumbres_001" } } },
      CATALOGO,
    );
    expect(r.huecos).toBe(1);
    expect(r.familias).toEqual({ legumbres: 1 });
  });

  it("una receta que no está en el catálogo no rompe el recuento", () => {
    const r = recuentoDelMenu(
      plan({ "Lun-Comida": { recipeId: "inventada_999" }, "Mar-Comida": { recipeId: "carnes_001" } }),
      CATALOGO,
    );
    // El hueco sí existe; lo que no se puede es clasificarlo.
    expect(r.huecos).toBe(2);
    expect(r.familias).toEqual({ carne: 1 });
  });

  it("un hueco vaciado a mano no cuenta como hueco", () => {
    const r = recuentoDelMenu(plan({ "Lun-Comida": { recipeId: null, cleared: true } }), CATALOGO);
    expect(r.huecos).toBe(0);
  });

  it("sin plan devuelve ceros en vez de reventar", () => {
    expect(recuentoDelMenu(null, CATALOGO)).toEqual({ familias: {}, platos: [], platosPorFamilia: {}, cocinas: {}, tecnicas: {}, huecos: 0 });
    expect(recuentoDelMenu({}, undefined)).toEqual({ familias: {}, platos: [], platosPorFamilia: {}, cocinas: {}, tecnicas: {}, huecos: 0 });
  });
});

/*
 * El caso que hizo que el panel pareciera roto: una «Pasta con champiñones y
 * bacon» aparecía bajo «Carne» sin decir por qué, y una «Crema de tres quesos»
 * bajo «Verdura». Las dos están bien contadas; lo que faltaba era decirlo.
 */
describe("por qué un plato cuenta en una familia", () => {
  const pastaConBacon = { category: "pasta_arroces", mainProtein: "cerdo" };
  const filetes = { category: "carnes", mainProtein: "cerdo" };
  const cremaDeQuesos = { category: "sopas_cremas", mainProtein: "none" };
  const ensaladaDeLentejas = { category: "ensaladas_verduras", mainProtein: "legumbre" };

  it("lo evidente no se explica", () => {
    expect(motivoDeFamilia(filetes, "carne")).toBeNull();
    expect(motivoDeFamilia(ensaladaDeLentejas, "verdura")).toBeNull();
  });

  it("si entra por la proteína, lo dice", () => {
    expect(motivoDeFamilia(pastaConBacon, "carne")).toBe("cerdo");
    expect(motivoDeFamilia(ensaladaDeLentejas, "legumbres")).toBe("legumbre");
  });

  it("si la categoría no es la esperada de esa familia, también", () => {
    expect(motivoDeFamilia(cremaDeQuesos, "verdura")).toBe("crema");
  });

  it("la pasta con bacon sale en las DOS, con su motivo en cada una", () => {
    const r = recuentoDelMenu(
      plan({ "Lun-Cena": { recipeId: "pasta_bacon" } }),
      { pasta_bacon: { name: "Pasta con bacon", category: "pasta_arroces", mainProtein: "cerdo" } },
    );
    expect(r.familias).toEqual({ pasta_arroz: 1, carne: 1 });
    // Un plato, dos familias: por eso las familias suman más que los platos.
    expect(r.platos).toHaveLength(1);
    expect(r.platosPorFamilia.carne[0].motivo).toBe("cerdo");
    expect(r.platosPorFamilia.pasta_arroz[0].motivo).toBeNull();
  });
});
