/**
 * El invariante de completitud del menú (#1029): qué huecos debe tener y
 * cuáles se han quedado sin plato. Misma regla de platos por hueco que
 * buildGroupContext (aiPlanner.js).
 */
import { describe, it, expect } from "vitest";
import { huecosEsperados, huecosVacios, describirHuecos, PLATOS_DEL_HUECO } from "./huecosDelPlan.js";

const familia = { id: "g1", label: "Familia", memberIds: ["p1", "p2"] };
const miembros = [{ id: "p1", name: "Ana" }, { id: "p2", name: "Luis" }];
const casa = (extra = {}) => ({ members: miembros, groups: [familia], schedule: {}, meals: ["Comida", "Cena"], ...extra });
const resumen = (hs) => hs.map((h) => `${h.dia}-${h.comida}:${h.plato}`);

describe("huecosEsperados: día activo × comida que se cocina × platos de la estructura", () => {
  it("por defecto, comida de dos platos y cena de uno", () => {
    const hs = huecosEsperados(casa(), { activeDays: ["Lun"] });
    expect(resumen(hs)).toEqual(["Lun-Comida:primero", "Lun-Comida:principal", "Lun-Cena:principal"]);
    expect(hs.every((h) => h.grupo === "g1")).toBe(true);
    expect(hs.every((h) => PLATOS_DEL_HUECO.includes(h.plato))).toBe(true);
  });

  it("solo los días activos, en el orden de la semana", () => {
    const hs = huecosEsperados(casa({ mealStructure: "1_plato" }), { activeDays: ["Vie", "Jue"] });
    expect(resumen(hs)).toEqual(["Jue-Comida:principal", "Jue-Cena:principal", "Vie-Comida:principal", "Vie-Cena:principal"]);
  });

  it("estructura de un plato en la comida (global o del grupo): un solo plato", () => {
    expect(resumen(huecosEsperados(casa({ mealStructure: "1_plato" }), { activeDays: ["Lun"] })))
      .toEqual(["Lun-Comida:principal", "Lun-Cena:principal"]);
    expect(resumen(huecosEsperados(casa({ mealStructureByGroup: { g1: "1_plato" } }), { activeDays: ["Lun"] })))
      .toEqual(["Lun-Comida:principal", "Lun-Cena:principal"]);
  });

  it("cena de dos platos: primero y principal también por la noche", () => {
    const hs = huecosEsperados(casa({ mealStructureCena: "primero_segundo" }), { activeDays: ["Lun"] });
    expect(resumen(hs)).toEqual(["Lun-Comida:primero", "Lun-Comida:principal", "Lun-Cena:primero", "Lun-Cena:principal"]);
  });

  it("plato único o rápida ese día: un plato aunque la estructura sea de dos", () => {
    const data = casa({ mealStructureCena: "primero_segundo", slotType: { "Lun|Comida": "unico", "Mar|Comida": "rapida", "Mar|Cena": "rapida" } });
    expect(resumen(huecosEsperados(data, { activeDays: ["Lun", "Mar"] }))).toEqual([
      "Lun-Comida:principal", "Lun-Cena:primero", "Lun-Cena:principal",
      "Mar-Comida:principal", "Mar-Cena:principal",
    ]);
  });

  it("nadie en casa ese día: la comida no se espera", () => {
    const schedule = { "p1|Mar|Comida": "fuera", "p2|Mar|Comida": "fuera", "p1|Mar|Cena": "fuera", "p2|Mar|Cena": "tupper" };
    const hs = huecosEsperados(casa({ schedule }), { activeDays: ["Lun", "Mar"] });
    // El martes a mediodía todos fuera: nada. La cena, uno con tupper: se cocina.
    expect(resumen(hs)).toEqual(["Lun-Comida:primero", "Lun-Comida:principal", "Lun-Cena:principal", "Mar-Cena:principal"]);
  });

  it("solo las comidas que la casa planifica", () => {
    expect(resumen(huecosEsperados(casa({ meals: ["Cena"] }), { activeDays: ["Lun"] }))).toEqual(["Lun-Cena:principal"]);
  });

  it("el grupo del bebé: un plato por hueco; un grupo sin gente no cuenta", () => {
    const data = casa({
      members: [...miembros, { id: "b1", name: "Bebé" }],
      groups: [familia, { id: "gb", label: "Bebé", tipo: "bebe", memberIds: ["b1"] }, { id: "gx", label: "Nadie", memberIds: [] }],
    });
    const hs = huecosEsperados(data, { activeDays: ["Lun"] });
    expect(hs.filter((h) => h.grupo === "gb").map((h) => `${h.comida}:${h.plato}`)).toEqual(["Comida:principal", "Cena:principal"]);
    expect(hs.some((h) => h.grupo === "gx")).toBe(false);
  });
});

describe("huecosVacios: lo esperado que el plan no tiene", () => {
  const esperados = huecosEsperados(casa(), { activeDays: ["Lun", "Mar"] });

  it("un plan completo no deja huecos", () => {
    const plan = {
      g1: {
        "Lun-Comida": { firstRecipeId: "a", recipeId: "b" }, "Lun-Cena": { recipeId: "c" },
        "Mar-Comida": { firstRecipeId: "d", recipeId: "e" }, "Mar-Cena": { recipeId: "f" },
      },
    };
    expect(huecosVacios(plan, esperados)).toEqual([]);
  });

  it("falta un primero, falta un principal, falta una cena entera, y «_» no es un plato", () => {
    const plan = {
      g1: {
        "Lun-Comida": { firstRecipeId: null, recipeId: "b" },
        "Lun-Cena": { recipeId: "c" },
        "Mar-Comida": { firstRecipeId: "_", recipeId: null },
      },
    };
    expect(resumen(huecosVacios(plan, esperados))).toEqual(["Lun-Comida:primero", "Mar-Comida:primero", "Mar-Comida:principal", "Mar-Cena:principal"]);
  });

  it("un plan sin ese grupo: todo vacío", () => {
    expect(huecosVacios({ otro: {} }, esperados)).toHaveLength(esperados.length);
    expect(huecosVacios({}, [])).toEqual([]);
  });
});

describe("describirHuecos: en castellano corto y en orden de semana", () => {
  it("un hueco entero se dice sin plato; uno a medias, con cuál", () => {
    const esperados = huecosEsperados(casa(), { activeDays: ["Vie", "Sáb"] });
    const plan = { g1: { "Vie-Comida": { firstRecipeId: "a", recipeId: "b" }, "Sáb-Comida": { firstRecipeId: "a", recipeId: null }, "Sáb-Cena": { recipeId: "c" } } };
    expect(describirHuecos(huecosVacios(plan, esperados))).toBe("viernes cena, sábado comida (2º)");
  });

  it("si falta el primero, lo dice; una cena de un plato que falta no lleva ordinal", () => {
    const esperados = huecosEsperados(casa(), { activeDays: ["Mié"] });
    const plan = { g1: { "Mié-Comida": { firstRecipeId: null, recipeId: "b" } } };
    expect(describirHuecos(huecosVacios(plan, esperados))).toBe("miércoles comida (1º), miércoles cena");
  });

  it("con varios grupos se dice de quién es cada hueco", () => {
    const vacios = [
      { grupo: "g2", dia: "Dom", comida: "Cena", plato: "principal", de: 1 },
      { grupo: "g1", dia: "Lun", comida: "Cena", plato: "principal", de: 1 },
    ];
    expect(describirHuecos(vacios)).toBe("lunes cena [g1], domingo cena [g2]");
    expect(describirHuecos([])).toBe("");
  });
});
