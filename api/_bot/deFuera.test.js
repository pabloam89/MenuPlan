/**
 * Quien viene de fuera se filtra EXACTAMENTE igual que alguien de la casa,
 * con el motor y el catálogo de verdad. Caso de staging (2 oct 2026): cena con
 * amigos, una embarazada y otro celíaco.
 */
import { describe, it, expect } from "vitest";
import { pickCatalogReplacement } from "../../src/lib/aiPlanner.js";
import { recipeHitsIntolerances } from "../../src/lib/intolerances.js";
import { restriccionesDeFuera, conQuienViene, describirDeFuera } from "./deFuera.js";

const familia = { id: "g1", label: "Familia", memberIds: ["m1", "m2"] };
const casa = {
  members: [{ id: "m1", name: "Ana", age: 38 }, { id: "m2", name: "Luis", age: 40 }],
  groups: [familia],
  schedule: {},
};
const plan = { g1: { "Vie-Cena": { recipeId: "carnes_002", eaters: 6 } } };
const ids = (data) => (pickCatalogReplacement(data, plan, { groupId: "g1", day: "Vie", meal: "Cena", course: "main", candidatos: 400 })?.candidatos ?? []).map((r) => r.id).sort();

describe("restriccionesDeFuera", () => {
  it("normaliza lo que dice Lola y tira lo que el motor no sabe filtrar", () => {
    expect(restriccionesDeFuera({ alergias: ["Gluten", "inventada"], estados: ["embarazo", "resaca"] }))
      .toEqual({ alergias: ["gluten"], intolerancias: [], estados: ["embarazo"] });
    expect(restriccionesDeFuera({ alergias: [], estados: [] })).toBeNull();
    expect(restriccionesDeFuera(null)).toBeNull();
  });

  it("se puede decir en la respuesta", () => {
    expect(describirDeFuera(restriccionesDeFuera({ alergias: ["gluten"], estados: ["embarazo"] }))).toBe("sin gluten, embarazo");
  });
});

describe("conQuienViene: el motor filtra como si fuera de la casa", () => {
  const r = restriccionesDeFuera({ alergias: ["gluten"], estados: ["embarazo"] });

  it("mismas candidatas que con esa persona en casa", () => {
    const conInvitado = ids(conQuienViene(casa, ["g1"], r));
    const comoDeCasa = ids({
      ...casa,
      members: [...casa.members, { id: "m3", name: "Marta", age: 33, allergies: ["gluten"], dietaryStates: ["embarazo"] }],
      groups: [{ ...familia, memberIds: [...familia.memberIds, "m3"] }],
    });
    expect(conInvitado.length).toBeGreaterThan(0);
    expect(conInvitado).toEqual(comoDeCasa);
  });

  it("de verdad quita platos, y ninguno choca con el embarazo", () => {
    const sin = ids(casa);
    const con = pickCatalogReplacement(conQuienViene(casa, ["g1"], r), plan, { groupId: "g1", day: "Vie", meal: "Cena", course: "main", candidatos: 400 }).candidatos;
    expect(con.length).toBeLessThan(sin.length);
    for (const receta of con) expect(recipeHitsIntolerances(receta, ["embarazo"])).toBe(false);
  });

  it("sin restricciones, la casa tal cual (y nada se guarda en ella)", () => {
    expect(conQuienViene(casa, ["g1"], null)).toBe(casa);
    conQuienViene(casa, ["g1"], r);
    expect(casa.members).toHaveLength(2);
    expect(casa.groups[0].memberIds).toEqual(["m1", "m2"]);
  });
});
