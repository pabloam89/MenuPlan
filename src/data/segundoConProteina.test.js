import { describe, it, expect } from "vitest";
import { recipeCatalog } from "./recipeCatalog.js";
import { PROTEIN_GROUP_BY_MAIN_PROTEIN } from "./recipeSchema.js";

// #893 (fondo #891, caso #892): un plato con mealRole «segundo» tiene que
// traer proteína principal —carne, pescado, marisco o huevo— en `mainProtein`
// o en `extraProteins`. Si no, el solver lo pone de segundo y la comida se
// queda sin proteína (la ensalada de lentejas con feta de segundo tras un
// primero de verduras). La legumbre sola no cuenta: es de primero o plato único.
//
// La familia sale de PROTEIN_GROUP_BY_MAIN_PROTEIN (la fuente única); aquí
// solo se dice qué familias son «principales».
const FAMILIAS_PRINCIPALES = new Set(["carne", "pescado", "huevos"]);

// Excepciones declaradas: id -> motivo. Vacía a propósito; añadir una exige
// motivo escrito y lo ve el juez en el diff.
const EXCEPCIONES = {};

const esPrincipal = (p) => FAMILIAS_PRINCIPALES.has(PROTEIN_GROUP_BY_MAIN_PROTEIN[p]);

describe("catálogo: segundo con proteína principal (#893)", () => {
  it("ningún segundo sin carne, pescado, marisco ni huevo, salvo excepción con motivo", () => {
    const malos = recipeCatalog
      .filter((r) => [].concat(r.mealRole ?? []).includes("segundo"))
      .filter((r) => !esPrincipal(r.mainProtein) && !(r.extraProteins ?? []).some(esPrincipal))
      .filter((r) => !EXCEPCIONES[r.id])
      .map((r) => `${r.id} ${r.name} (mainProtein ${r.mainProtein})`);
    expect(malos).toEqual([]);
  });

  it("cada excepción existe, sigue siendo segundo y lleva motivo", () => {
    for (const [id, motivo] of Object.entries(EXCEPCIONES)) {
      const r = recipeCatalog.find((x) => x.id === id);
      expect(r, id).toBeTruthy();
      expect([].concat(r.mealRole ?? [])).toContain("segundo");
      expect(String(motivo).trim().length).toBeGreaterThan(10);
    }
  });
});
