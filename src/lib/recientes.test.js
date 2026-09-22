import { describe, expect, it } from "vitest";
import { recetasRecientes, VENTANA_SEMANAS } from "./recientes.js";

const semana = (startISO, ids) => ({
  startISO,
  plan: { g1: Object.fromEntries(ids.map((id, i) => [`d${i}`, { recipeId: id }])) },
});
const conMenus = (...semanas) => ({ menus: { m1: { weeks: Object.fromEntries(semanas.map((s) => [s.startISO, s])) } } });

describe("qué has comido últimamente", () => {
  it("lo de la semana pasada pesa más que lo de hace un mes", () => {
    const r = recetasRecientes(conMenus(
      semana("2026-09-14", ["carnes_001"]),
      semana("2026-08-24", ["carnes_002"]),
    ));
    expect(r.get("carnes_001")).toBeGreaterThan(r.get("carnes_002"));
  });

  it("lo que nunca salió no pesa nada", () => {
    const r = recetasRecientes(conMenus(semana("2026-09-14", ["carnes_001"])));
    expect(r.get("pescados_009")).toBeUndefined();
  });

  it("solo mira las últimas semanas, no el archivo entero", () => {
    const muchas = Array.from({ length: VENTANA_SEMANAS + 3 }, (_, i) =>
      semana(`2026-0${9 - Math.floor(i / 4)}-${String(28 - i * 3).padStart(2, "0")}`, [`carnes_00${i}`]));
    const r = recetasRecientes(conMenus(...muchas));
    expect(r.size).toBe(VENTANA_SEMANAS);
  });

  it("las favoritas van exentas: si la marcaste, que repita es lo que querías", () => {
    const r = recetasRecientes(conMenus(semana("2026-09-14", ["carnes_001", "carnes_002"])), {
      exentos: ["carnes_001"],
    });
    expect(r.has("carnes_001")).toBe(false);
    expect(r.has("carnes_002")).toBe(true);
  });

  it("entiende el id con prefijo de grupo que guarda el plan", () => {
    const r = recetasRecientes(conMenus(semana("2026-09-14", ["g1__carnes_001"])));
    expect(r.has("carnes_001")).toBe(true);
  });

  it("cuenta el primero además del segundo", () => {
    const r = recetasRecientes({
      menus: { m: { weeks: { "2026-09-14": { startISO: "2026-09-14", plan: { g1: { "Lun-Comida": { firstRecipeId: "sopas_cremas_003", recipeId: "carnes_001" } } } } } } },
    });
    expect(r.has("sopas_cremas_003")).toBe(true);
    expect(r.has("carnes_001")).toBe(true);
  });

  it("sin menús archivados no se rompe ni inventa", () => {
    expect(recetasRecientes(undefined).size).toBe(0);
    expect(recetasRecientes({ menus: {} }).size).toBe(0);
  });
});
