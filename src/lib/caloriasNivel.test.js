import { describe, it, expect } from "vitest";
import { nivelCalorias, escalaDe } from "./caloriasNivel.js";
import { recipeCatalog } from "../data/recipeCatalog.js";

describe("nivelCalorias", () => {
  it("la escala depende del papel del plato", () => {
    expect(nivelCalorias({ kcal: 400, mealRole: ["primero"] })).toBe("medio");
    expect(nivelCalorias({ kcal: 470, mealRole: ["primero"] })).toBe("contundente");
    expect(nivelCalorias({ kcal: 400, mealRole: ["segundo"] })).toBe("medio");
    expect(nivelCalorias({ kcal: 300, mealRole: ["cena"] })).toBe("ligero");
    expect(nivelCalorias({ kcal: 600, mealRole: ["plato_unico"] })).toBe("contundente");
  });
  it("un plato que vale de primero y de cena se mide como principal", () => {
    expect(escalaDe({ mealRole: ["primero", "cena"] })).toBe("principal");
  });
  it("los purés de bebé van en su propia escala", () => {
    expect(escalaDe({ category: "bebes", mealRole: ["plato_unico"] })).toBe("pequeno");
  });
  it("sin kcal no se inventa", () => {
    expect(nivelCalorias({ mealRole: ["segundo"] })).toBeNull();
  });
  it("todo el Recetario Estrella queda etiquetado, y ningún nivel se queda vacío", () => {
    const estrella = recipeCatalog.filter((r) => r.estrella);
    expect(estrella.every((r) => ["ligero", "medio", "contundente"].includes(r.caloriasNivel))).toBe(true);
    const cuenta = {};
    for (const r of estrella) cuenta[r.caloriasNivel] = (cuenta[r.caloriasNivel] ?? 0) + 1;
    for (const n of ["ligero", "medio", "contundente"]) expect(cuenta[n]).toBeGreaterThan(estrella.length * 0.1);
  });
});
