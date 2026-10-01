import { describe, it, expect, vi } from "vitest";
import { chocaConHueco, itemValido } from "./excluirHueco.js";
import { buildGroupContext } from "./aiPlanner.js";
import { candidatosDeHueco } from "./solver.js";
import { validateMenu, applyFallback } from "../utils/validateMenu.js";
import { filterRecipes } from "../utils/filterRecipes.js";
import { GRUPOS } from "./rasgosBusqueda.js";
import { recipeCatalogById } from "../data/recipeCatalog.js";

vi.setConfig({ testTimeout: 20000 });

describe("chocaConHueco", () => {
  it("grupo por proteína e ingredientes, técnica, e ingrediente con frontera de palabra", () => {
    const lentejasConChorizo = { category: "legumbres", mainProtein: "legumbre", tecnica: "olla", ingredients: [{ name: "Chorizo" }, { name: "Lentejas" }] };
    expect(chocaConHueco(lentejasConChorizo, ["grupo:carne"])).toBe("grupo:carne");
    expect(chocaConHueco(lentejasConChorizo, ["tecnica:olla"])).toBe("tecnica:olla");
    expect(chocaConHueco(lentejasConChorizo, ["tecnica:sarten", "grupo:pescado"])).toBeNull();
    expect(chocaConHueco({ ingredients: [{ name: "Repollo" }] }, ["pollo"])).toBeNull();
    expect(chocaConHueco({ ingredients: [{ name: "Pechuga de pollo" }] }, ["pollo"])).toBe("pollo");
  });

  it("solo se guarda lo que se sabe aplicar", () => {
    expect(itemValido("grupo:carne")).toBe(true);
    expect(itemValido("tecnica:sarten")).toBe(true);
    expect(itemValido("coliflor")).toBe(true);
    expect(itemValido("grupo:dinosaurio")).toBe(false);
    expect(itemValido("tecnica:microondas")).toBe(false);
    expect(itemValido("")).toBe(false);
  });
});

// Con los huecos y el pool de verdad del motor: «los lunes, sin carne».
describe("«los lunes, sin carne» en el motor", () => {
  const group = { id: "g1", label: "Familia", memberIds: ["m1", "m2"], days: 2 };
  const data = {
    members: [{ id: "m1", age: 40 }, { id: "m2", age: 38 }],
    groups: [group],
    schedule: {},
    mealStructure: "1_plato",
    excluirPorHueco: { "Lun|Cena": ["grupo:carne"] },
  };
  const ctx = buildGroupContext(data, group);
  const { recipes: pool } = filterRecipes(ctx.filterOpts);
  const lunCena = ctx.slots.find((s) => s.slotId === "lun_cena");
  const marCena = ctx.slots.find((s) => s.slotId === "mar_cena");
  const carneCena = pool.find((r) => GRUPOS.carne.es(r) && candidatosDeHueco([r], lunCena ?? {}).length === 0 && candidatosDeHueco([r], marCena ?? {}).length === 1);

  it("el motor cuelga la exclusión SOLO del hueco que toca", () => {
    expect(lunCena?.excluirHueco).toEqual(["grupo:carne"]);
    expect(marCena?.excluirHueco).toBeUndefined();
  });

  it("el solver no ofrece carne el lunes por la noche, y el martes sí", () => {
    expect(carneCena, "hace falta una cena de carne válida el martes").toBeTruthy();
    expect(candidatosDeHueco(pool, lunCena).some((r) => GRUPOS.carne.es(r))).toBe(false);
    expect(candidatosDeHueco(pool, marCena).some((r) => GRUPOS.carne.es(r))).toBe(true);
  });

  it("el validador lo marca y la reparación lo cambia por algo sin carne", () => {
    const asignacion = [{ slotId: "lun_cena", recipeId: carneCena.id }, { slotId: "mar_cena", recipeId: carneCena.id === pool[0].id ? pool[1].id : pool[0].id }];
    const { violations } = validateMenu(asignacion, pool, ctx.slots);
    const suya = violations.filter((v) => v.rule === "excluido_en_hueco");
    expect(suya.map((v) => v.slotId)).toEqual(["lun_cena"]);
    const arreglado = applyFallback(asignacion, suya, pool, ctx.slots);
    const nueva = arreglado.find((s) => s.slotId === "lun_cena").recipeId;
    expect(nueva).not.toBe(carneCena.id);
    expect(GRUPOS.carne.es(recipeCatalogById[nueva] ?? pool.find((r) => r.id === nueva))).toBe(false);
  });
});
