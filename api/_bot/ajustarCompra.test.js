import { describe, it, expect } from "vitest";
import { aplicarCompra } from "./ajustes.js";
import { supermercadoDe } from "../../src/lib/supermercados.js";
import { SUPERMERCADOS_CASA } from "../../src/lib/vocabularios.js";

// El súper y el presupuesto se preguntan en Lola y la app los enseña: con
// Mercadona en data.supermarkets, la lista de la compra lleva los precios
// (Shopping.jsx mira esa misma clave).
describe("ajustar_compra: el súper y el presupuesto", () => {
  it("el súper se guarda con el nombre de la lista, aunque lo escriban en minúsculas o sin tilde", () => {
    expect(supermercadoDe("mercadona")).toBe("Mercadona");
    expect(supermercadoDe("el corte ingles")).toBe("El Corte Inglés");
    const r = aplicarCompra({}, { supermercadosMas: ["mercadona", "LIDL"] });
    expect(r.data.supermarkets).toEqual(["Mercadona", "Lidl"]);
    expect(r.texto).toMatch(/precios de Mercadona/);
  });

  it("sin lista entera: un «supermercados» que llegue no sustituye a los demás (#958 C)", () => {
    expect(aplicarCompra({ supermarkets: ["Mercadona"] }, { supermercados: ["Dia"] })).toEqual({ texto: "No había nada que cambiar." });
  });

  it("uno que no está en la lista va como «Otro» con su nota, sin prometer precios; otro se suma a la nota", () => {
    const r = aplicarCompra({ supermarkets: ["Lidl"] }, { supermercadoOtro: "Frutería Paco" });
    expect(r.data).toMatchObject({ supermarkets: ["Lidl", "Otro"], supermarketsNota: "Frutería Paco" });
    expect(r.texto).toMatch(/súper: Lidl, Frutería Paco/);
    expect(r.texto).not.toMatch(/precios/);
    const r2 = aplicarCompra(r.data, { supermercadosMas: ["mercadona", "el mercado"] });
    expect(r2.data).toMatchObject({ supermarkets: ["Lidl", "Otro", "Mercadona"], supermarketsNota: "Frutería Paco, el mercado" });
    // Todo lo que se guarda en la lista es del vocabulario: escribirDato no rechaza ninguno.
    expect(r2.data.supermarkets.every((s) => SUPERMERCADOS_CASA.includes(s))).toBe(true);
  });

  it("«ya no vamos a la frutería» la quita de la nota, y con la nota vacía se va «Otro»; supermercadoOtro vacío quita los de fuera", () => {
    const casa = { supermarkets: ["Dia", "Otro"], supermarketsNota: "Frutería Paco, el mercado" };
    expect(aplicarCompra(casa, { supermercadosMenos: ["frutería paco"] }).data).toMatchObject({ supermarkets: ["Dia", "Otro"], supermarketsNota: "el mercado" });
    expect(aplicarCompra({ ...casa, supermarketsNota: "Frutería Paco" }, { supermercadosMenos: ["Frutería Paco"] }).data).toMatchObject({ supermarkets: ["Dia"], supermarketsNota: null });
    expect(aplicarCompra(casa, { supermercadoOtro: "" }).data).toMatchObject({ supermarkets: ["Dia"], supermarketsNota: null });
    expect("supermarketsNota" in aplicarCompra({}, { supermercadosMas: ["Dia"] }).data).toBe(false);
  });

  it("un nombre de fuera guardado antes de la lista cerrada pasa a «Otro» con su nota cuando la casa cambia sus súper", () => {
    const r = aplicarCompra({ supermarkets: ["Frutería Paco", "Mercadona"] }, { supermercadosMas: ["Dia"] });
    expect(r.data).toMatchObject({ supermarkets: ["Mercadona", "Dia", "Otro"], supermarketsNota: "Frutería Paco" });
  });

  it("el presupuesto, por semana y en un rango creíble; «sin presupuesto» lo apaga", () => {
    expect(aplicarCompra({}, { presupuesto: 120.4 }).data).toEqual({ presupuesto: 120 });
    expect(aplicarCompra({}, { presupuesto: 3 }).data).toBeUndefined();
    // Un solo dato (trozo 12 de #1037, PR 8): el par de antes no se escribe, y una casa que lo traía lo pierde al cambiarlo.
    expect(aplicarCompra({ hasBudget: true, budget: 80 }, { sinPresupuesto: true }).data).toEqual({ presupuesto: null });
    expect(aplicarCompra({ hasBudget: false, budget: 80 }, { presupuesto: 45 }).data).toEqual({ presupuesto: 45 });
  });

  it("no toca lo demás de la casa", () => {
    const r = aplicarCompra({ members: [{ id: "a" }], kitchenTools: ["Horno"] }, { supermercadosMas: ["Dia"] });
    expect(r.data.members).toEqual([{ id: "a" }]);
    expect(r.data.kitchenTools).toEqual(["Horno"]);
  });
});
