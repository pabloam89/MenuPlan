import { describe, it, expect, vi } from "vitest";

import { barrerDias, diasPorBarrer, podarMarcas, VENTANA_BARRIDO_DIAS } from "./barridoDia.js";
import { sumarDiasISO } from "./dias.js";

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

describe("los días por barrer", () => {
  const HOY = "2026-11-05"; // jueves
  const plan = { g1: { "Lun-comida": 1, "Lun-cena": 2, "Mar-comida": 3, "Jue-comida": 4 }, g2: { "Mar-cena": 5 } };
  const semana = { startISO: "2026-11-02", endISO: "2026-11-08", plan };
  const fechas = (r) => r.map((d) => d.dayISO);

  it("solo los cerrados, cada uno con lo suyo de cada grupo", () => {
    const r = diasPorBarrer({ semanas: [semana], ya: {}, desde: "2026-11-02", hoy: HOY });
    expect(fechas(r)).toEqual(["2026-11-02", "2026-11-03", "2026-11-04"]);
    expect(r[0].dayPlan).toEqual({ g1: { "Lun-comida": 1, "Lun-cena": 2 } });
    expect(r[1].dayPlan).toEqual({ g1: { "Mar-comida": 3 }, g2: { "Mar-cena": 5 } });
    expect(r[2].dayPlan).toEqual({});
  });

  it("nada anterior a su inicio, ni lo ya barrido", () => {
    expect(fechas(diasPorBarrer({ semanas: [semana], ya: {}, desde: "2026-11-04", hoy: HOY }))).toEqual(["2026-11-04"]);
    expect(fechas(diasPorBarrer({ semanas: [semana], ya: { "2026-11-02": {} }, desde: "2026-11-02", hoy: HOY }))).toEqual(["2026-11-03", "2026-11-04"]);
  });

  it("sin fecha de inicio, nada", () => {
    expect(diasPorBarrer({ semanas: [semana], ya: {}, desde: null, hoy: HOY })).toEqual([]);
  });

  it("el nombre del día sale de la fecha: una semana que empieza en miércoles", () => {
    const r = diasPorBarrer({ semanas: [{ startISO: "2026-11-04", endISO: "2026-11-08", plan: { g1: { "Mié-comida": 1 } } }], ya: {}, desde: "2026-11-04", hoy: HOY });
    expect(r).toEqual([{ dayISO: "2026-11-04", dayPlan: { g1: { "Mié-comida": 1 } } }]);
  });

  it("sin fecha de fin, siete días; sin fecha de inicio o sin plan, la semana no cuenta", () => {
    const larga = diasPorBarrer({ semanas: [{ startISO: "2026-10-01", plan }], ya: {}, desde: "2026-10-01", hoy: HOY });
    expect(larga).toHaveLength(7);
    expect(diasPorBarrer({ semanas: [{ plan }, { startISO: "2026-11-02" }], ya: {}, desde: "2026-11-02", hoy: HOY })).toEqual([]);
  });

  it("una semana con fecha imposible no cuenta, y con fin imposible son siete días", () => {
    expect(diasPorBarrer({ semanas: [{ startISO: "2026-13-45", endISO: "2026-11-08", plan }], ya: {}, desde: "2026-11-02", hoy: HOY })).toEqual([]);
    expect(diasPorBarrer({ semanas: [{ startISO: "2026-10-01", endISO: "2026-13-45", plan }], ya: {}, desde: "2026-10-01", hoy: HOY })).toHaveLength(7);
  });

  it("la ventana del barrido y la de las marcas son la misma: lo barrible conserva su marca", () => {
    const primero = sumarDiasISO(HOY, -VENTANA_BARRIDO_DIAS);
    const antes = sumarDiasISO(primero, -1);
    const semanas = [{ startISO: antes, endISO: primero, plan }];
    expect(fechas(diasPorBarrer({ semanas, ya: {}, desde: antes, hoy: HOY }))).toEqual([primero]);
    expect(Object.keys(podarMarcas({ [antes]: {}, [primero]: {} }, HOY))).toEqual([primero]);
  });
});
