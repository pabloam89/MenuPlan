/**
 * Cuántos platos lleva cada hueco es UNA regla (estructuraPlatos.js,
 * platosDelHueco), y la usan el motor (buildGroupContext) y el invariante de
 * completitud (huecosEsperados). Este test recorre las combinaciones y exige
 * que los dos cuenten lo mismo: cuando la regla vivía en dos sitios, ya
 * divergían en el bebé (el motor le daba cena de dos platos; la copia, uno).
 */
import { describe, it, expect } from "vitest";
import { buildGroupContext } from "./aiPlanner.js";
import { huecosEsperados } from "./huecosDelPlan.js";
import { platosDelHueco } from "./estructuraPlatos.js";
import { ESTRUCTURA_PLATOS } from "./vocabularios.js";

const ESTRUCTURAS = [...ESTRUCTURA_PLATOS, undefined];
const TIPOS_DEL_DIA = [undefined, "unico", "rapida"];

/** Una casa de una persona (adulta o bebé) con la combinación dada, solo el lunes. */
function casa({ estructura, estructuraCena, slotType, esBebe }) {
  const miembro = esBebe ? { id: "b1", name: "Bebé", role: "Bebé", age: 1 } : { id: "p1", name: "Ana", age: 35 };
  const grupo = { id: "g1", label: esBebe ? "Bebé" : "Familia", memberIds: [miembro.id], ...(esBebe ? { tipo: "bebe" } : {}) };
  return {
    data: {
      members: [miembro], groups: [grupo], schedule: {}, meals: ["Comida", "Cena"], allergiesReviewed: true,
      mealStructure: estructura, mealStructureCena: estructuraCena,
      slotType: slotType ? { "Lun|Comida": slotType, "Lun|Cena": slotType } : {},
    },
    grupo,
  };
}

/** Platos por hueco («Lun-Comida» → n) que el motor genera. */
function platosDelMotor(data, grupo) {
  const n = {};
  for (const s of buildGroupContext(data, grupo).slots) {
    if (s.day !== "Lun") continue;
    const clave = `${s.day}-${s.mealType === "cena" ? "Cena" : "Comida"}`;
    n[clave] = (n[clave] ?? 0) + 1;
  }
  return n;
}

/** Platos por hueco que el invariante espera. */
function platosEsperados(data) {
  const n = {};
  for (const h of huecosEsperados(data, { activeDays: ["Lun"] })) n[`${h.dia}-${h.comida}`] = (n[`${h.dia}-${h.comida}`] ?? 0) + 1;
  return n;
}

describe("platos por hueco: el motor y el invariante cuentan lo mismo", () => {
  for (const estructura of ESTRUCTURAS) {
    for (const estructuraCena of ESTRUCTURAS) {
      for (const slotType of TIPOS_DEL_DIA) {
        for (const esBebe of [false, true]) {
          const nombre = `comida=${estructura ?? "defecto"} cena=${estructuraCena ?? "defecto"} día=${slotType ?? "normal"}${esBebe ? " bebé" : ""}`;
          it(nombre, () => {
            const { data, grupo } = casa({ estructura, estructuraCena, slotType, esBebe });
            const motor = platosDelMotor(data, grupo);
            expect(Object.keys(motor).sort()).toEqual(["Lun-Cena", "Lun-Comida"]);
            expect(platosEsperados(data)).toEqual(motor);
          });
        }
      }
    }
  }

  it("la regla compartida, directa: bebé a mediodía uno; cena de dos platos salvo rápida, también para el bebé", () => {
    const [dos, uno] = ESTRUCTURA_PLATOS;
    expect(platosDelHueco({ comida: "Comida", estructura: dos, estructuraCena: uno, esBebe: true })).toHaveLength(1);
    expect(platosDelHueco({ comida: "Comida", estructura: dos, estructuraCena: uno })).toHaveLength(2);
    expect(platosDelHueco({ comida: "Comida", estructura: uno, estructuraCena: uno })).toHaveLength(1);
    expect(platosDelHueco({ comida: "Comida", estructura: dos, estructuraCena: uno, slotType: "unico" })).toHaveLength(1);
    expect(platosDelHueco({ comida: "Cena", estructura: dos, estructuraCena: dos })).toHaveLength(2);
    expect(platosDelHueco({ comida: "Cena", estructura: dos, estructuraCena: dos, esBebe: true })).toHaveLength(2);
    expect(platosDelHueco({ comida: "Cena", estructura: dos, estructuraCena: dos, slotType: "rapida" })).toHaveLength(1);
    expect(platosDelHueco({ comida: "Cena", estructura: dos, estructuraCena: uno })).toHaveLength(1);
  });

  it("un hueco de niños que copia el de los adultos espera un plato: la copia pone recipeId con lo que tengan ellos", () => {
    // kidsSlotAction: comedor entre semana «como la familia» → el niño copia el mediodía de los adultos.
    const data = {
      members: [{ id: "a", age: 35 }, { id: "n", age: 7 }],
      groups: [{ id: "ad", label: "Adultos", memberIds: ["a"] }, { id: "ni", label: "Niños", memberIds: ["n"] }],
      schedule: {}, meals: ["Comida", "Cena"],
      kidDinnerConfig: { byMember: { n: { weekdayLunch: "together", dinner: "sameDinner", weekend: "together" } } },
    };
    const ninos = huecosEsperados(data, { activeDays: ["Lun"] }).filter((h) => h.grupo === "ni");
    expect(ninos.map((h) => `${h.comida}:${h.plato}`)).toEqual(["Comida:principal", "Cena:principal"]);
  });
});
