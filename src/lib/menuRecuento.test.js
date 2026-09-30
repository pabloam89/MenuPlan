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
 * bacon» aparecía bajo «Carne» sin decir por qué. Con la familia saliendo de
 * la masa ya no aparece ahí —el bacon es el 12 %—, y lo que queda por explicar
 * es lo otro: por qué un mismo plato sale en DOS familias.
 */
describe("por qué un plato cuenta en una familia", () => {
  const cocido = { familias: ["carne", "legumbres"], familiaCuotas: { carne: 0.22, legumbres: 0.31 } };
  const soloUna = { familias: ["pasta_arroz"], familiaCuotas: { pasta_arroz: 0.46 } };

  it("con una sola familia no hay nada que justificar", () => {
    expect(motivoDeFamilia(soloUna, "pasta_arroz")).toBeNull();
  });

  it("con dos, dice cuánta masa pone en cada una", () => {
    expect(motivoDeFamilia(cocido, "carne")).toBe("22%");
    expect(motivoDeFamilia(cocido, "legumbres")).toBe("31%");
  });

  it("y calla si no hay cuota que enseñar", () => {
    expect(motivoDeFamilia({ familias: ["carne", "verdura"] }, "carne")).toBeNull();
    expect(motivoDeFamilia({}, "carne")).toBeNull();
    expect(motivoDeFamilia(null, "carne")).toBeNull();
  });

  it("la receta que ya trae familias no vuelve a mirar el cajón", () => {
    // `category: pescados` y aun así manda lo derivado: es lo que evita que
    // el panel y la tabla derivada digan cosas distintas.
    const r = recuentoDelMenu(
      plan({ "Lun-Cena": { recipeId: "raro" } }),
      { raro: { name: "Cazuela de fideos", category: "pescados", mainProtein: "marisco", familias: ["pasta_arroz"] } },
    );
    expect(r.familias).toEqual({ pasta_arroz: 1 });
  });
});
