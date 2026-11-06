import { describe, it, expect } from "vitest";
import { comidasFuera, fueraEn, planSinComidas } from "./presentes.js";

const miembros = [{ id: "ana" }, { id: "leo" }];
const FECHAS = { Lun: "2026-11-02", Mar: "2026-11-03" };
const COMIDAS = ["Comida", "Cena"];
const ausencia = (ref, dias, comidas, fecha) => ({
  sujeto: { tipo: "miembro", ref },
  efecto: { tipo: "presente", valor: "fuera" },
  ambito: { dias, comidas },
  vigencia: { desde: fecha, hasta: fecha },
});

describe("las comidas que una persona pasa fuera", () => {
  it("salen del horario de siempre", () => {
    const data = { members: miembros, schedule: { "ana|Lun|Comida": "cole", "ana|Mar|Cena": "fuera", "ana|Lun|Cena": "tupper" } };
    expect(comidasFuera(data, "ana", FECHAS, COMIDAS)).toEqual({ Lun: ["Comida"], Mar: ["Cena"] });
  });

  it("y de lo que se le dijo a Lola, en su fecha y no en otra", () => {
    const data = { members: miembros, schedule: {}, reglas: [ausencia("ana", ["Mar"], ["Cena"], "2026-11-03")] };
    expect(comidasFuera(data, "ana", FECHAS, COMIDAS)).toEqual({ Mar: ["Cena"] });
    expect(comidasFuera(data, "leo", FECHAS, COMIDAS)).toEqual({});
    expect(comidasFuera(data, "ana", { Mar: "2026-11-10" }, COMIDAS)).toEqual({});
  });

  it("coincide con lo que pinta Lola", () => {
    const data = { members: miembros, schedule: {}, reglas: [ausencia("leo", ["Lun"], ["Comida"], "2026-11-02")] };
    expect(fueraEn(data, "2026-11-02", "Lun", "Comida")).toEqual(new Set(["leo"]));
  });
});

describe("el plan de quien no come esas comidas", () => {
  const plan = { g1: { "Lun-Comida": { recipeId: "a" }, "Lun-Cena": { recipeId: "b" } }, g2: { "Lun-Cena": { recipeId: "c" } } };

  it("pierde solo esos huecos, sin tocar el original", () => {
    expect(planSinComidas(plan, { Lun: ["Cena"] })).toEqual({ g1: { "Lun-Comida": { recipeId: "a" } }, g2: {} });
    expect(Object.keys(plan.g1)).toEqual(["Lun-Comida", "Lun-Cena"]);
  });

  it("sin ausencias, igual; sin plan, vacío", () => {
    expect(planSinComidas(plan, {})).toEqual(plan);
    expect(planSinComidas(null, { Lun: ["Cena"] })).toEqual({});
  });
});
