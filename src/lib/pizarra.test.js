import { describe, it, expect } from "vitest";
import { planVacio, huecosDelPlan, conHuecosAlDia } from "./pizarra.js";
import { DAYS, getDayMeals, slotKey } from "./planner.js";

const ADULTOS = [
  { id: "a1", name: "Pablo", age: 36 },
  { id: "a2", name: "Ana", age: 34 },
];
const NINA = { id: "n1", name: "Lucía", age: 7 };

const grupoCon = (miembros, label = "Familia") => ({
  id: "g1",
  label,
  memberIds: miembros.map((m) => m.id),
});

/** Una casa normal: comida y cena, nadie come fuera. */
const casaBase = (members = ADULTOS, extra = {}) => ({
  members,
  meals: ["Comida", "Cena"],
  schedule: {},
  ...extra,
});

describe("el esqueleto tiene los huecos de la semana, y todos vacíos", () => {
  it("abre un hueco por día y franja", () => {
    const data = casaBase();
    const plan = planVacio(data, [grupoCon(ADULTOS)]);
    expect(huecosDelPlan(plan)).toBe(DAYS.length * getDayMeals(data).length);
    expect(Object.keys(plan.g1)).toContain("Lun-Comida");
    expect(Object.keys(plan.g1)).toContain("Dom-Cena");
  });

  it("marca cada hueco `cleared`, que es lo que lo hace tocable", () => {
    const plan = planVacio(casaBase(), [grupoCon(ADULTOS)]);
    for (const slot of Object.values(plan.g1)) {
      expect(slot.cleared).toBe(true);
      expect(slot.recipeId).toBeNull();
      expect(slot.firstRecipeId).toBeNull();
    }
  });

  it("lleva `_warnings` como cualquier plan, para que nadie tenga que mirar si está", () => {
    expect(planVacio(casaBase(), [grupoCon(ADULTOS)])._warnings).toEqual([]);
  });
});

describe("`eaters`: el dato que escala el plato que coloques", () => {
  // pickCatalogReplacement lee `currentSlot.eaters ?? 2`, así que un hueco sin
  // este número no falla — escala todo para dos y no lo dice.
  it("cuenta a quien come en casa", () => {
    const plan = planVacio(casaBase(), [grupoCon(ADULTOS)]);
    expect(plan.g1["Mar-Comida"].eaters).toBe(2);
  });

  it("el tupper cuenta (se cocina para él) y el que come fuera no", () => {
    const data = casaBase(ADULTOS, {
      schedule: {
        [slotKey("a1", "Mar", "Comida")]: "tupper",
        [slotKey("a2", "Mar", "Comida")]: "fuera",
      },
    });
    const plan = planVacio(data, [grupoCon(ADULTOS)]);
    expect(plan.g1["Mar-Comida"].eaters).toBe(1);
    expect(plan.g1["Mar-Comida"].mode).toBe("tupper");
  });

  it("si no come nadie no hay hueco, en vez de un hueco para cero", () => {
    const data = casaBase(ADULTOS, {
      schedule: {
        [slotKey("a1", "Vie", "Cena")]: "fuera",
        [slotKey("a2", "Vie", "Cena")]: "fuera",
      },
    });
    const plan = planVacio(data, [grupoCon(ADULTOS)]);
    expect(plan.g1["Vie-Cena"]).toBeUndefined();
    expect(plan.g1["Vie-Comida"]).toBeDefined();
  });
});

describe("las franjas de fuera de menú siguen las reglas del generador", () => {
  const conExtras = { extraMeals: { desayuno: "variado", merienda: "semana", postre: "comida" } };

  it("una casa de adultos no tiene merienda", () => {
    const data = casaBase(ADULTOS, conExtras);
    const plan = planVacio(data, [grupoCon(ADULTOS)]);
    expect(plan.g1["Lun-Desayuno"]).toBeDefined();
    expect(plan.g1["Lun-Postre"]).toBeDefined();
    expect(plan.g1["Lun-Merienda"]).toBeUndefined();
  });

  it("con niños sí la tiene", () => {
    const miembros = [...ADULTOS, NINA];
    const data = casaBase(miembros, conExtras);
    const plan = planVacio(data, [grupoCon(miembros)]);
    expect(plan.g1["Lun-Merienda"]).toBeDefined();
    expect(plan.g1["Lun-Merienda"].eaters).toBe(3);
  });

  it("el menú de bebé no lleva ninguna", () => {
    const bebe = { id: "b1", name: "Mar", age: 1 };
    const data = casaBase([bebe], conExtras);
    const plan = planVacio(data, [grupoCon([bebe], "Bebé")]);
    expect(plan.g1["Lun-Desayuno"]).toBeUndefined();
    expect(plan.g1["Lun-Postre"]).toBeUndefined();
    expect(plan.g1["Lun-Comida"]).toBeDefined();
  });
});

describe("cambiar las comidas sobre la marcha", () => {
  const grupo = grupoCon(ADULTOS);

  it("añade los huecos de la comida que enciendes", () => {
    const plan = planVacio(casaBase(), [grupo]);
    expect(plan.g1["Lun-Desayuno"]).toBeUndefined();
    const conDesayuno = conHuecosAlDia(plan, casaBase(ADULTOS, { meals: ["Desayuno", "Comida", "Cena"] }), [grupo]);
    expect(conDesayuno.g1["Lun-Desayuno"]).toBeDefined();
    expect(conDesayuno.g1["Lun-Desayuno"].cleared).toBe(true);
  });

  it("NO toca lo que ya habías colocado", () => {
    const plan = planVacio(casaBase(), [grupo]);
    plan.g1["Lun-Comida"] = { ...plan.g1["Lun-Comida"], recipeId: "r-lentejas", cleared: false };
    const next = conHuecosAlDia(plan, casaBase(ADULTOS, { meals: ["Desayuno", "Comida", "Cena"] }), [grupo]);
    expect(next.g1["Lun-Comida"].recipeId).toBe("r-lentejas");
    expect(next.g1["Lun-Comida"].cleared).toBe(false);
  });

  it("apagar una comida no borra sus platos: si la enciendes, siguen ahí", () => {
    const conTodo = casaBase(ADULTOS, { meals: ["Desayuno", "Comida", "Cena"] });
    const plan = planVacio(conTodo, [grupo]);
    plan.g1["Lun-Desayuno"] = { ...plan.g1["Lun-Desayuno"], recipeId: "r-tostada", cleared: false };
    // Se apaga el desayuno: el plan no cambia, solo deja de pintarse.
    const apagado = conHuecosAlDia(plan, casaBase(), [grupo]);
    expect(apagado.g1["Lun-Desayuno"].recipeId).toBe("r-tostada");
    // Y al volver a encenderlo sigue estando.
    const encendido = conHuecosAlDia(apagado, conTodo, [grupo]);
    expect(encendido.g1["Lun-Desayuno"].recipeId).toBe("r-tostada");
  });

  it("sin nada que añadir devuelve el MISMO plan, para no repintar de balde", () => {
    const data = casaBase();
    const plan = planVacio(data, [grupo]);
    expect(conHuecosAlDia(plan, data, [grupo])).toBe(plan);
  });
});

describe("grupos", () => {
  it("un grupo sin miembros queda vacío, no a medias", () => {
    const plan = planVacio(casaBase(), [{ id: "g9", label: "Vacío", memberIds: [] }]);
    expect(plan.g9).toEqual({});
  });

  it("cada grupo tiene su propio juego de huecos", () => {
    const miembros = [...ADULTOS, NINA];
    const data = casaBase(miembros);
    const plan = planVacio(data, [
      { id: "adultos", label: "Adultos", memberIds: ["a1", "a2"] },
      { id: "ninos", label: "Niños", memberIds: ["n1"] },
    ]);
    expect(plan.adultos["Lun-Comida"].eaters).toBe(2);
    expect(plan.ninos["Lun-Comida"].eaters).toBe(1);
  });
});
