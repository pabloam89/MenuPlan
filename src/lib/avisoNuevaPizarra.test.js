import { describe, it, expect } from "vitest";
import { avisoAlEmpezar, platosEnPlan } from "./avisoNuevaPizarra.js";

const conPlato = { Lun: { comida: { recipeId: "r1" }, cena: { empty: true } }, _warnings: [] };
const vacio = { Lun: { comida: { empty: true } } };

describe("el aviso antes de empezar una pizarra en blanco", () => {
  it("cuenta solo los huecos con plato", () => {
    expect(platosEnPlan(conPlato)).toBe(1);
    expect(platosEnPlan(vacio)).toBe(0);
    expect(platosEnPlan(null)).toBe(0);
  });

  it("con platos y cuenta, avisa de que el de ahora queda guardado", () => {
    expect(avisoAlEmpezar({ plan: conPlato, conCuenta: true }).texto).toMatch(/queda en «Menús»/);
  });

  it("con platos y sin cuenta, avisa de que el de ahora se borra", () => {
    expect(avisoAlEmpezar({ plan: conPlato, conCuenta: false }).texto).toMatch(/se borra/);
  });

  it("sin platos no hay nada que perder: sin aviso", () => {
    expect(avisoAlEmpezar({ plan: vacio, conCuenta: true })).toBeNull();
  });
});
