import { describe, it, expect } from "vitest";

import { atwaterCheck, mayContainAlcohol } from "./bedcaAtwater.mjs";
import { statesCompatible, looksLikeOtherFood } from "./bedcaState.mjs";

// Las filas son las REALES de BEDCA que salieron en la pasada del 11 sep 2026.
// No son ejemplos inventados: son los cuatro agujeros por los que se coló algo
// en el dry-run de apply-bedca-nutrition.mjs antes de taparlos.

describe("atwaterCheck", () => {
  it("acepta una fila coherente (Aceituna)", () => {
    const r = atwaterCheck({ kcal100g: 119.9, protein100g: 1.3, carbs100g: 1, fat100g: 12.5 });
    expect(r.ok).toBe(true);
  });

  it("rechaza kcal por debajo de sus propias macros (el Kéfir de 0,8 kcal)", () => {
    const r = atwaterCheck({ kcal100g: 0.8, protein100g: 3.3, carbs100g: 4.5, fat100g: 3.5 });
    expect(r.ok).toBe(false);
    expect(r.motivo).toMatch(/por debajo/);
  });

  // El caso que motivó el filtro de arriba: BEDCA da las kcal del garbanzo SECO
  // con los macros del HERVIDO. Ni el nombre ni el estado lo delatan — la fila
  // se llama "Garbanzo, hervido" y el ingrediente es "Garbanzos cocidos".
  it("rechaza kcal muy por encima de sus macros cuando no hay alcohol que lo explique", () => {
    const r = atwaterCheck(
      { kcal100g: 358.7, protein100g: 8.9, carbs100g: 18.7, fat100g: 2.5 },
      "Garbanzo, hervido", "Garbanzos cocidos",
    );
    expect(r.ok).toBe(false);
    expect(Math.round(r.diff)).toBe(226);
  });

  it("perdona ese mismo exceso a lo que sí lleva alcohol o ácido acético", () => {
    const brandy = atwaterCheck({ kcal100g: 231, protein100g: 0, carbs100g: 0, fat100g: 0 }, "Brandy");
    expect(brandy.ok).toBe(true);
    const vinagre = atwaterCheck({ kcal100g: 18, protein100g: 0.4, carbs100g: 0.1, fat100g: 0 }, "Vinagre");
    expect(vinagre.ok).toBe(true);
  });

  it("el techo físico pilla un kJ etiquetado como kcal", () => {
    expect(atwaterCheck({ kcal100g: 3700, protein100g: 0, carbs100g: 0, fat100g: 100 }).ok).toBe(false);
  });

  it("mayContainAlcohol no se dispara con un alimento normal", () => {
    expect(mayContainAlcohol("Garbanzo, hervido")).toBe(false);
    expect(mayContainAlcohol("Vino tinto")).toBe(true);
  });
});

// Las dos reglas duras que apply-bedca-nutrition.mjs aplica ahora en su camino
// automático. Antes solo las tenía el triaje, y una pasada con el informe de la
// repesca escribía estas cuatro con un ✅.
describe("las reglas que blindan el camino automático", () => {
  it("la trampa crudo/cocido: neutro no es compatible con cocinado", () => {
    expect(statesCompatible("Cebolleta", "Cebolla, hervida")).toBe(false);
    expect(statesCompatible("Boletus", "Seta, plancha")).toBe(false);
    // Neutro SÍ es compatible con crudo: es como el catálogo nombra la compra.
    expect(statesCompatible("Lentejas", "Lenteja, seca, cruda")).toBe(true);
  });

  it("el sinónimo no se sostiene por el nombre: Corvina no es Lubina", () => {
    expect(looksLikeOtherFood("Corvina", "Lubina").other).toBe(true);
    expect(looksLikeOtherFood("Cúrcuma", "Curry").other).toBe(true);
    // Y el orden de BEDCA no engaña al revés: esto SÍ es el mismo alimento.
    expect(looksLikeOtherFood("Panceta", "Cerdo, panceta, cruda").other).toBe(false);
  });
});
