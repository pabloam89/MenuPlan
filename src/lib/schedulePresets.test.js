import { describe, it, expect } from "vitest";
import { outStateFor, isHomeState, resolveQuickActions } from "./schedulePresets.js";

const kid = { id: "k1", name: "Leo", age: 8 };
const kid2 = { id: "k2", name: "Sara", age: 6 };
const adult = { id: "a1", name: "Pablo", age: 41 };
const adult2 = { id: "a2", name: "Ana", age: 39 };

const MENUS = {
  shared: { "Lun-Primero": "Lentejas", "Mié-Segundo": "Merluza" },
  byMember: { k1: { "Jue-Postre": "Fruta" } },
};

describe("outStateFor", () => {
  it("marca comedor solo si el niño tiene menú ese día", () => {
    expect(outStateFor(kid, "Lun", "Comida", MENUS)).toBe("cole");
    expect(outStateFor(kid, "Mié", "Comida", MENUS)).toBe("cole");
    // Jueves solo existe en su menú personal, no en el compartido.
    expect(outStateFor(kid, "Jue", "Comida", MENUS)).toBe("cole");
    // Martes y viernes no tienen plato: come fuera, pero no en el comedor.
    expect(outStateFor(kid, "Mar", "Comida", MENUS)).toBe("fuera");
    expect(outStateFor(kid, "Vie", "Comida", MENUS)).toBe("fuera");
  });

  it("nunca marca comedor sin menú subido", () => {
    expect(outStateFor(kid, "Lun", "Comida", null)).toBe("fuera");
    expect(outStateFor(kid, "Lun", "Comida", { shared: {}, byMember: {} })).toBe("fuera");
  });

  it("el comedor es solo de niños, en la comida y en día lectivo", () => {
    expect(outStateFor(adult, "Lun", "Comida", MENUS)).toBe("fuera");
    expect(outStateFor(kid, "Lun", "Cena", MENUS)).toBe("fuera");
    expect(outStateFor(kid, "Lun", "Desayuno", MENUS)).toBe("fuera");
    expect(outStateFor(kid, "Sáb", "Comida", MENUS)).toBe("fuera");
    expect(outStateFor(kid, "Dom", "Comida", MENUS)).toBe("fuera");
  });

  it("un menú compartido cubre a cualquier niño de la casa", () => {
    expect(outStateFor(kid2, "Lun", "Comida", MENUS)).toBe("cole");
    expect(outStateFor(kid2, "Jue", "Comida", MENUS)).toBe("fuera");
  });
});

describe("isHomeState", () => {
  it("trata casa, off y vacío como estar en casa", () => {
    for (const v of ["casa", "off", undefined, null]) expect(isHomeState(v)).toBe(true);
    for (const v of ["fuera", "cole", "tupper"]) expect(isHomeState(v)).toBe(false);
  });
});

const MEMBERS = [adult, adult2, kid, kid2];
const MEALS = ["Comida", "Cena"];
const byId = (list, id) => list.find((a) => a.id === id);
const apply = (action, schedule = {}) => {
  const next = { ...schedule };
  for (const k of action.keys) next[k] = action.value;
  return next;
};

describe("resolveQuickActions", () => {
  it("reparte cada tarjeta entre quien le toca", () => {
    const actions = resolveQuickActions(MEMBERS, MEALS, {});
    expect(actions.map((a) => a.id)).toEqual(["cole", "trabajo", "sabado", "domingo"]);
    expect(byId(actions, "cole").faces.map((f) => f.name)).toEqual(["Leo", "Sara"]);
    expect(byId(actions, "trabajo").faces.map((f) => f.name)).toEqual(["Pablo", "Ana"]);
    // «Mayores cenan fuera» es solo de adultos; el domingo sí es de toda la casa.
    expect(byId(actions, "sabado").faces.map((f) => f.name)).toEqual(["Pablo", "Ana"]);
    expect(byId(actions, "domingo").faces).toHaveLength(4);
  });

  it("las cuatro reglas son disjuntas", () => {
    const actions = resolveQuickActions(MEMBERS, MEALS, {});
    const seen = new Set();
    for (const a of actions) {
      for (const k of a.keys) {
        expect(seen.has(k)).toBe(false);
        seen.add(k);
      }
    }
  });

  it("esconde la del cole si no hay niños", () => {
    const ids = resolveQuickActions([adult, adult2], MEALS, {}).map((a) => a.id);
    expect(ids).not.toContain("cole");
    expect(ids).toContain("trabajo");
  });

  it("esconde la cena del sábado si la cena está desactivada", () => {
    const ids = resolveQuickActions(MEMBERS, ["Comida"], {}).map((a) => a.id);
    expect(ids).not.toContain("sabado");
    expect(ids).toContain("domingo");
  });

  it("pasa de apagada a encendida al aplicar sus propias casillas", () => {
    const off = byId(resolveQuickActions(MEMBERS, MEALS, {}), "cole");
    expect(off.status).toBe("off");
    const schedule = apply(off);
    expect(byId(resolveQuickActions(MEMBERS, MEALS, schedule), "cole").status).toBe("on");
  });

  it("detecta que está a medias si solo se cumple en parte", () => {
    const cole = byId(resolveQuickActions(MEMBERS, MEALS, {}), "cole");
    const partial = { [cole.keys[0]]: "cole" };
    expect(byId(resolveQuickActions(MEMBERS, MEALS, partial), "cole").status).toBe("partial");
  });

  it("se enciende sola si el patrón ya estaba puesto a mano", () => {
    const manual = {};
    for (const day of ["Lun", "Mar", "Mié", "Jue", "Vie"]) {
      manual[`k1|${day}|Comida`] = "cole";
      manual[`k2|${day}|Comida`] = "cole";
    }
    expect(byId(resolveQuickActions(MEMBERS, MEALS, manual), "cole").status).toBe("on");
  });

  it("encender una tarjeta no altera el estado de las demás", () => {
    const before = resolveQuickActions(MEMBERS, MEALS, {});
    const schedule = apply(byId(before, "cole"));
    const after = resolveQuickActions(MEMBERS, MEALS, schedule);
    for (const id of ["trabajo", "sabado", "domingo"]) {
      expect(byId(after, id).status).toBe("off");
    }
  });
});
