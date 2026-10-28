import { describe, it, expect } from "vitest";
import { aplicarCompra } from "./ajustes.js";
import { supermercadoDe } from "../../src/lib/supermercados.js";

// El súper y el presupuesto se preguntan en Lola y la app los enseña: con
// Mercadona en data.supermarkets, la lista de la compra lleva los precios
// (Shopping.jsx mira esa misma clave).
describe("ajustar_compra: el súper y el presupuesto", () => {
  it("el súper se guarda con el nombre de la lista, aunque lo escriban en minúsculas o sin tilde", () => {
    expect(supermercadoDe("mercadona")).toBe("Mercadona");
    expect(supermercadoDe("el corte ingles")).toBe("El Corte Inglés");
    const r = aplicarCompra({}, { supermercados: ["mercadona", "LIDL"] });
    expect(r.data.supermarkets).toEqual(["Mercadona", "Lidl"]);
    expect(r.texto).toMatch(/precios de Mercadona/);
  });

  it("un súper que no está en la lista se guarda como lo dicen, sin prometer precios", () => {
    const r = aplicarCompra({}, { supermercados: ["Frutería Paco"] });
    expect(r.data.supermarkets).toEqual(["Frutería Paco"]);
    expect(r.texto).not.toMatch(/precios/);
  });

  it("el presupuesto, por semana y en un rango creíble; «sin presupuesto» lo apaga", () => {
    expect(aplicarCompra({}, { presupuesto: 120.4 }).data).toMatchObject({ hasBudget: true, budget: 120 });
    expect(aplicarCompra({}, { presupuesto: 3 }).data).toBeUndefined();
    expect(aplicarCompra({ hasBudget: true, budget: 80 }, { sinPresupuesto: true }).data).toMatchObject({ hasBudget: false });
  });

  it("no toca lo demás de la casa", () => {
    const r = aplicarCompra({ members: [{ id: "a" }], kitchenTools: ["Horno"] }, { supermercados: ["Dia"] });
    expect(r.data.members).toEqual([{ id: "a" }]);
    expect(r.data.kitchenTools).toEqual(["Horno"]);
  });
});
