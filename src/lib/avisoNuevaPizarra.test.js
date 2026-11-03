import { describe, it, expect } from "vitest";
import { avisoAlEmpezar } from "./avisoNuevaPizarra.js";

// La forma del plan de verdad: por grupo, y cada hueco con su «día-comida».
const conPlato = { g1: { "Lun-comida": { recipeId: "r1" }, "Lun-cena": { empty: true } }, _warnings: [] };
const soloPrimero = { g1: { "Lun-comida": { firstRecipeId: "r1" } } };
const vacio = { g1: { "Lun-comida": { empty: true } } };

describe("el aviso antes de empezar una pizarra en blanco", () => {
  it("con platos y cuenta, avisa de que el de ahora queda guardado", () => {
    expect(avisoAlEmpezar({ plan: conPlato, conCuenta: true }).texto).toMatch(/queda en «Menús»/);
  });

  it("con platos y sin cuenta, avisa de que el de ahora se borra", () => {
    expect(avisoAlEmpezar({ plan: conPlato, conCuenta: false }).texto).toMatch(/se borra/);
  });

  it("un hueco con solo el primero también es un menú que perder", () => {
    expect(avisoAlEmpezar({ plan: soloPrimero, conCuenta: true })).not.toBeNull();
  });

  it("el título es el mismo con cuenta y sin ella", () => {
    expect(avisoAlEmpezar({ plan: conPlato, conCuenta: true }).titulo).toBe(avisoAlEmpezar({ plan: conPlato, conCuenta: false }).titulo);
  });

  it("sin platos no hay nada que perder: sin aviso", () => {
    expect(avisoAlEmpezar({ plan: vacio, conCuenta: true })).toBeNull();
    expect(avisoAlEmpezar({ plan: null, conCuenta: false })).toBeNull();
  });
});
