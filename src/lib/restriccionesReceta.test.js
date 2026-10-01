import { describe, it, expect } from "vitest";
import { choquesDeReceta, textoDeChoque } from "./restriccionesReceta.js";

const persona = (name, extra = {}) => ({ id: name, name, allergies: [], intolerances: [], dietaryStates: [], ...extra });
const textos = (receta, data) => choquesDeReceta(receta, data).map(textoDeChoque);

describe("choquesDeReceta", () => {
  it("alergia por el campo de la receta y por un ingrediente que la delata", () => {
    const data = { members: [persona("Lucas", { allergies: ["Frutos de cáscara"] }), persona("Ana", { allergies: ["Soja"] })] };
    expect(textos({ allergens: ["frutos_cascara"], ingredients: [] }, data)).toEqual(["⚠️ lleva frutos de cáscara (Lucas)"]);
    // La soja no está en `allergens`, pero el tofu la delata (red de ingredientes).
    expect(textos({ allergens: [], ingredients: [{ name: "tofu firme" }] }, data)).toEqual(["⚠️ lleva soja (Ana)"]);
  });

  it("embarazo: el jamón serrano no es apto; el vino se adapta", () => {
    const data = { members: [persona("Marta", { dietaryStates: ["embarazo"] })] };
    const r = { allergens: [], ingredients: [{ name: "jamón serrano" }, { name: "vino blanco" }], name: "Guisantes con jamón" };
    expect(textos(r, data)).toEqual(["⚠️ no apta en embarazo (Marta)", "se adapta: sin alcohol (Marta)"]);
  });

  it("lactosa fina se adapta; fructosa excluye; vegetariano mira la proteína", () => {
    const data = { members: [persona("Isa", { intolerances: ["lactosa_fina", "fructosa"] }), persona("Leo", { intolerances: ["vegetariano"] })] };
    const r = { allergens: [], mainProtein: "pollo", ingredients: [{ name: "nata" }, { name: "manzana" }] };
    expect(textos(r, data)).toEqual([
      "se adapta: sin lactosa (Isa)",
      "⚠️ no apta: intolerancia a la fructosa (Isa)",
      "⚠️ no es vegetariano (Leo)",
    ]);
  });

  it("varias personas con lo mismo, en una sola línea", () => {
    const data = { members: [persona("Lucas", { allergies: ["Huevos"] }), persona("Vega", { allergies: ["huevo"] })] };
    expect(textos({ allergens: ["huevos"], ingredients: [] }, data)).toEqual(["⚠️ lleva huevos (Lucas, Vega)"]);
  });

  it("bebé: sólidos para quien aún toma cremas, sí; cremas o etapa de sólidos, nada", () => {
    const solido = { category: "bebes", etapaBebe: "solidos", allergens: [], ingredients: [] };
    expect(textos(solido, { members: [], etapaBebe: "cremas" })).toEqual(["⚠️ aún no: el bebé toma cremas"]);
    expect(textos(solido, { members: [], etapaBebe: "solidos" })).toEqual([]);
    expect(textos({ ...solido, etapaBebe: "cremas" }, { members: [], etapaBebe: "cremas" })).toEqual([]);
  });

  it("sin restricciones, nada", () => {
    expect(choquesDeReceta({ allergens: ["gluten"], ingredients: [{ name: "pan" }] }, { members: [persona("Pablo")] })).toEqual([]);
  });
});
