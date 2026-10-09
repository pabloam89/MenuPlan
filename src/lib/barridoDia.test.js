import { describe, it, expect, vi } from "vitest";

import { barrerDias } from "./barridoDia.js";

// #317: si la carga de la despensa fallaba, loadPantry devolvía [] y el
// barrido del día marcaba el día como barrido «aunque no gaste nada»: el día
// quedaba hecho sin descontar nada y no se volvía a intentar.

const dias = [
  { dayISO: "2026-10-08", dayPlan: { comida: "lentejas" } },
  { dayISO: "2026-10-09", dayPlan: { comida: "arroz" } },
];
const stock = [{ id: "p-1", ingredientName: "Lentejas", qty: 500, unit: "g" }];
// Gasta lo que haya: con la despensa vacía no gasta nada, como buildShoppingList.
const usados = (_plan, s) => s.map((it) => ({ name: it.ingredientName, qty: 100, unit: it.unit }));

describe("barrido del día", () => {
  it("si la despensa no se pudo leer: ningún día barrido y nada descontado", async () => {
    const consumir = vi.fn(async () => ({ deltas: [] }));
    const cargar = async () => ({ data: null, error: { message: "503 Service Unavailable" } });
    const barridos = await barrerDias({ dias, cargar, usados, consumir });
    expect(barridos).toEqual({});
    expect(consumir).not.toHaveBeenCalled();
  });

  it("con la despensa leída, descuenta y marca cada día", async () => {
    const consumir = vi.fn(async (used) => ({ deltas: used }));
    const barridos = await barrerDias({ dias, cargar: async () => ({ data: stock, error: null }), usados, consumir });
    expect(Object.keys(barridos)).toEqual(["2026-10-08", "2026-10-09"]);
    expect(consumir).toHaveBeenCalledTimes(2);
  });

  it("un día que no gasta nada (despensa de verdad vacía) sí queda barrido", async () => {
    const consumir = vi.fn();
    const barridos = await barrerDias({ dias, cargar: async () => ({ data: [], error: null }), usados, consumir });
    expect(barridos).toEqual({ "2026-10-08": [], "2026-10-09": [] });
    expect(consumir).not.toHaveBeenCalled();
  });

  it("si falla un día y el siguiente no, solo se marca el que se leyó", async () => {
    const cargas = [{ data: null, error: { message: "corte" } }, { data: stock, error: null }];
    const barridos = await barrerDias({ dias, cargar: async () => cargas.shift(), usados, consumir: async (u) => ({ deltas: u }) });
    expect(Object.keys(barridos)).toEqual(["2026-10-09"]);
  });
});
