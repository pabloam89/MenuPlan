import { describe, it, expect } from "vitest";
import { quitarPersona, huerfanosDe, QUE_LIMPIA, MAPAS_POR_GRUPO } from "./quitarPersona.js";

// Una casa con todo lo que puede colgar de una persona (Leo) y de su grupo.
const casa = () => ({
  members: [{ id: "ana" }, { id: "leo" }],
  groups: [{ id: "familia", memberIds: ["ana"] }, { id: "peques", memberIds: ["leo"] }],
  schedule: { "ana|Lun|Comida": "casa", "leo|Lun|Comida": "cole", "leo|Mar|Cena": "fuera" },
  kidDinnerConfig: { byMember: { leo: { modo: "aparte" } } },
  schoolMenus: { shared: {}, byMember: { leo: {} }, weeks: [{ shared: {}, byMember: { leo: { "Lun-Primero": "x" } } }] },
  accountMemberIdByUser: { u1: "ana", u2: "leo" },
  accountMemberId: "leo",
  reglas: [
    { id: "r1", sujeto: { tipo: "miembro", ref: "leo" } },
    { id: "r2", sujeto: { tipo: "grupo", ref: "peques" } },
    { id: "r3", sujeto: { tipo: "casa" } },
  ],
  mealStructureByGroup: { familia: "primero_segundo", peques: "1_plato" },
  kcalByGroup: { peques: 1400 },
});

describe("quitarPersona (#958): una persona fuera, sin dejar nada colgando", () => {
  it("no deja huérfanos de ninguna clase", () => {
    const d = quitarPersona(casa(), "leo");
    expect(huerfanosDe(d)).toEqual(Object.fromEntries(QUE_LIMPIA.map((k) => [k, 0])));
  });

  it("y lo de los demás se queda como estaba", () => {
    const d = quitarPersona(casa(), "leo");
    expect(d.members).toEqual([{ id: "ana" }]);
    expect(d.groups).toEqual([{ id: "familia", memberIds: ["ana"] }]);
    expect(d.schedule).toEqual({ "ana|Lun|Comida": "casa" });
    expect(d.accountMemberIdByUser).toEqual({ u1: "ana" });
    expect(d.accountMemberId).toBeNull();
    expect(d.reglas.map((r) => r.id)).toEqual(["r3"]);
    expect(d.mealStructureByGroup).toEqual({ familia: "primero_segundo" });
    expect(d.kcalByGroup).toEqual({});
  });

  it("es pura: la casa de entrada no cambia", () => {
    const antes = casa();
    const copia = JSON.parse(JSON.stringify(antes));
    quitarPersona(antes, "leo");
    expect(antes).toEqual(copia);
  });

  it("el último grupo no se borra aunque se quede vacío", () => {
    const d = quitarPersona({ members: [{ id: "a" }], groups: [{ id: "g", memberIds: ["a"] }], mealStructureByGroup: { g: "1_plato" } }, "a");
    expect(d.groups).toEqual([{ id: "g", memberIds: [] }]);
    expect(d.mealStructureByGroup).toEqual({ g: "1_plato" });
  });

  it("lo que la casa no tenía no se crea", () => {
    const d = quitarPersona({ members: [{ id: "a" }, { id: "b" }] }, "b");
    expect(Object.keys(d).sort()).toEqual(["members"]);
  });

  it("los mapas por grupo salen del registro (un dato nuevo así entra solo)", () => {
    expect(MAPAS_POR_GRUPO).toEqual(expect.arrayContaining(["mealStructureByGroup", "kcalByGroup", "freqsByGroup"]));
  });
});
