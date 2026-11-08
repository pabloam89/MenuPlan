import { describe, it, expect } from "vitest";
import { ingredientesReconocidos, recetaParaGuardar } from "./userRecipes.js";
import { ingredientStem } from "./ingredientCategories.js";

const forma = (n) => ingredientStem(n);

describe("ingredientesReconocidos", () => {
  it("propone lo que conocemos y descarta lo que no", () => {
    const out = ingredientesReconocidos(["Perejil", "Salsa de mi abuela"], ["Patata"]);
    expect(out.map(forma)).toEqual([forma("Perejil")]);
  });

  it("no propone lo que ya está en la lista, aunque se escriba distinto", () => {
    expect(ingredientesReconocidos(["Perejil"], ["Perejil fresco"])).toEqual([]);
    expect(ingredientesReconocidos(["perejil"], ["Perejil"])).toEqual([]);
  });

  it("compara la palabra entera: «pan» no es «panceta»", () => {
    const out = ingredientesReconocidos(["Pan"], ["Panceta"]);
    expect(out.map(forma)).toEqual([forma("Pan")]);
    expect(ingredientesReconocidos(["Panceta"], ["Pan"]).map(forma)).toEqual([forma("Panceta")]);
  });

  it("sin repetidos, y tolera lo que no es una lista", () => {
    expect(ingredientesReconocidos(["Perejil", "perejil", "PEREJIL"], []).length).toBe(1);
    expect(ingredientesReconocidos(undefined, [])).toEqual([]);
    expect(ingredientesReconocidos("Perejil", [])).toEqual([]);
  });
});

describe("recetaParaGuardar", () => {
  it("no guarda `mencionados`, que es del asistente y no de la receta", () => {
    const receta = recetaParaGuardar({
      name: "Tosta",
      ingredients: [{ name: "Pan", amount: 100, unit: "g" }],
      usageTags: ["plato_normal"],
      time: 10,
      difficulty: "facil",
      mencionados: ["Perejil"],
    });
    expect("mencionados" in receta).toBe(false);
    expect(receta.name).toBe("Tosta");
  });
});
