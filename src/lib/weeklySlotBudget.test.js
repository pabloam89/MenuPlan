import { describe, expect, it } from "vitest";
import { weeklySlotBudget } from "./planner.js";

/**
 * Los huecos REALES de una semana, que es el número del que cuelgan dos cosas
 * que se calculaban con constantes distintas y ninguna correcta:
 *
 *   · el presupuesto del reparto, que multiplicaba por 14 fijo (ver C2 en
 *     lib/reparto.js) cuando una semana normal tiene 21 huecos;
 *   · el tope del selector de tandas, que asumía siete días siempre
 *     (`DAYS.length * comidas`) aunque la semana fuera de tres.
 *
 * Los dos leen ya de aquí, y esto es el mismo recuento que hace el motor al
 * generar (`ctx.slots.length` en buildGroupContext).
 */
const casa = (extra = {}) => ({
  members: [{ id: "m1", age: 40 }],
  groups: [{ id: "g", memberIds: ["m1"] }],
  meals: ["Comida", "Cena"],
  schedule: {},
  slotType: {},
  ...extra,
});

const fueraTodoElDia = (dias) => {
  const s = {};
  for (const d of dias) { s[`m1|${d}|Comida`] = "fuera"; s[`m1|${d}|Cena`] = "fuera"; }
  return s;
};

describe("weeklySlotBudget", () => {
  it("una semana entera de primero+segundo+cena son 21 huecos, no 14", () => {
    // El número que el reparto daba por bueno era 14. Con 21 huecos y topes que
    // suman 14, siete huecos se quedan sin cuota y cada uno es una violación
    // garantizada de la regla 11.
    const { total, comidaDays, cenaDays } = weeklySlotBudget(casa());
    expect(comidaDays).toBe(7);
    expect(cenaDays).toBe(7);
    expect(total).toBe(21);
  });

  it("una semana partida cuenta solo sus días", () => {
    // Tres días de esta semana y cuatro de la siguiente es una selección que el
    // asistente permite; el selector de tandas seguía creyendo que había siete.
    const tresDias = casa({ schedule: fueraTodoElDia(["Jue", "Vie", "Sáb", "Dom"]) });
    expect(weeklySlotBudget(tresDias).total).toBe(9); // 3 comidas x2 + 3 cenas
  });

  it("si solo se planifican cenas, no se inventan comidas", () => {
    expect(weeklySlotBudget(casa({ meals: ["Cena"] })).total).toBe(7);
  });

  it("el plato único ocupa un hueco, no dos", () => {
    const conUnico = casa({ slotType: { "Lun|Comida": "unico", "Mar|Comida": "unico" } });
    // 21 menos un hueco por cada comida que deja de ser primero+segundo.
    expect(weeklySlotBudget(conUnico).total).toBe(19);
  });

  it("la estructura de un solo plato de la casa vale para toda la semana", () => {
    expect(weeklySlotBudget(casa({ mealStructure: "1_plato" })).total).toBe(14);
  });

  it("nunca baja de 1, aunque nadie coma en casa", () => {
    const nadie = casa({ schedule: fueraTodoElDia(["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"]) });
    expect(weeklySlotBudget(nadie).total).toBe(1);
  });

  it("acepta un grupo concreto, que es como lo llama el motor", () => {
    // Los niños que comen en el cole tienen menos huecos que los adultos, y el
    // reparto se les baja con SU número, no con el de la casa.
    const dosGrupos = casa({
      members: [{ id: "m1", age: 40 }, { id: "k1", age: 8 }],
      groups: [{ id: "ga", memberIds: ["m1"] }, { id: "gk", memberIds: ["k1"] }],
      schedule: { "k1|Lun|Comida": "cole", "k1|Mar|Comida": "cole", "k1|Mié|Comida": "cole" },
    });
    const adultos = weeklySlotBudget(dosGrupos, dosGrupos.groups[0]).total;
    const ninos = weeklySlotBudget(dosGrupos, dosGrupos.groups[1]).total;
    expect(adultos).toBe(21);
    expect(ninos).toBe(15); // tres comidas menos, y cada una valía dos huecos
  });
});
