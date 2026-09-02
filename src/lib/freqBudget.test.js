import { describe, it, expect } from "vitest";
import { applyFreqWithinBudget } from "./freqBudget.js";

const ORDER = ["carnes", "pescados", "legumbres", "verduras", "pasta"];

describe("applyFreqWithinBudget", () => {
  // LA regla: un formulario cuyos valores cambian distinto cada vez que
  // repites la misma accion vuelve loco a cualquiera. Este es el test que
  // impide que vuelva el Math.random() que habia aqui.
  it("la misma entrada da SIEMPRE la misma salida", () => {
    const cur = { carnes: 3, pescados: 3, legumbres: 3, verduras: 3, pasta: 2 };
    const runs = Array.from({ length: 25 }, () =>
      JSON.stringify(applyFreqWithinBudget(cur, "carnes", 8, ORDER, 14)),
    );
    expect(new Set(runs).size).toBe(1);
  });

  it("respeta el presupuesto", () => {
    const out = applyFreqWithinBudget(
      { carnes: 3, pescados: 3, legumbres: 3, verduras: 3, pasta: 2 },
      "carnes", 8, ORDER, 14,
    );
    expect(ORDER.reduce((s, k) => s + out[k], 0)).toBe(14);
    expect(out.carnes).toBe(8);
  });

  it("recorta a quien mas tiene, no al primero que pasa", () => {
    const out = applyFreqWithinBudget(
      { carnes: 0, pescados: 1, legumbres: 6, verduras: 1, pasta: 1 },
      "carnes", 3, ORDER, 9,
    );
    // Sobran 3: los tres salen de legumbres, que iba muy por delante.
    expect(out.legumbres).toBe(3);
    expect(out.pescados).toBe(1);
    expect(out.verduras).toBe(1);
  });

  it("a igualdad de valor recorta por el orden canonico, no al azar", () => {
    const out = applyFreqWithinBudget(
      { carnes: 0, pescados: 2, legumbres: 2, verduras: 2, pasta: 2 },
      "carnes", 2, ORDER, 9,
    );
    expect(out.pescados).toBe(1);
    expect(out.legumbres).toBe(2);
  });

  it("si no cabe, no toca nada", () => {
    const cur = { carnes: 2, pescados: 2, legumbres: 2, verduras: 1, pasta: 1 };
    const out = applyFreqWithinBudget(cur, "carnes", 3, ORDER, 20);
    expect(out).toEqual({ ...cur, carnes: 3 });
  });

  it("con el resto a cero, se limita la propia categoria", () => {
    const out = applyFreqWithinBudget(
      { carnes: 0, pescados: 0, legumbres: 0, verduras: 0, pasta: 0 },
      "carnes", 10, ORDER, 4,
    );
    expect(out.carnes).toBe(4);
  });

  it("nunca devuelve negativos ni decimales", () => {
    const out = applyFreqWithinBudget(
      { carnes: -5, pescados: 2.6, legumbres: 1, verduras: 0, pasta: 0 },
      "carnes", 2.4, ORDER, 10,
    );
    for (const k of ORDER) {
      expect(out[k]).toBeGreaterThanOrEqual(0);
      expect(Number.isInteger(out[k])).toBe(true);
    }
  });
});
