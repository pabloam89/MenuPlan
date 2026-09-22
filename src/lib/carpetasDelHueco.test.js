import { describe, expect, it } from "vitest";
import { carpetasDelHueco, facetasDelHueco } from "./carpetasDelHueco.js";

const TODAS = [
  "carnes", "pescados", "legumbres", "ensaladas_verduras", "pasta_arroces",
  "desayunos", "meriendas", "postres", "bebes_cremas", "bebes_solidos",
];

describe("carpetasDelHueco", () => {
  it("sin contexto no esconde nada: eso es mirar el catálogo, no rellenar", () => {
    expect(carpetasDelHueco(TODAS, null)).toEqual(TODAS);
    expect(carpetasDelHueco(TODAS, undefined)).toEqual(TODAS);
  });

  it("en una cena no salen desayunos, meriendas, postres ni bebé", () => {
    const v = carpetasDelHueco(TODAS, { meal: "Cena", esBebe: false });
    for (const fuera of ["desayunos", "meriendas", "postres", "bebes_cremas", "bebes_solidos"]) {
      expect(v).not.toContain(fuera);
    }
  });

  it("cada franja trae la suya, y solo la suya", () => {
    expect(carpetasDelHueco(TODAS, { meal: "Desayuno" })).toContain("desayunos");
    expect(carpetasDelHueco(TODAS, { meal: "Desayuno" })).not.toContain("meriendas");
    expect(carpetasDelHueco(TODAS, { meal: "Merienda" })).toContain("meriendas");
    expect(carpetasDelHueco(TODAS, { meal: "Merienda" })).not.toContain("postres");
    expect(carpetasDelHueco(TODAS, { meal: "Postre" })).toContain("postres");
    expect(carpetasDelHueco(TODAS, { meal: "Postre" })).not.toContain("desayunos");
  });

  it("las de bebé dependen del menú, no de la franja", () => {
    const enComida = carpetasDelHueco(TODAS, { meal: "Comida", esBebe: true });
    expect(enComida).toContain("bebes_cremas");
    expect(enComida).toContain("bebes_solidos");
    // Y en el mismo hueco sin menú de bebé, no.
    expect(carpetasDelHueco(TODAS, { meal: "Comida", esBebe: false })).not.toContain("bebes_cremas");
  });

  it("las categorías de comida se quedan TODAS en cualquier hueco", () => {
    // Esconder «Legumbres» en una cena sería decidir por el usuario qué se
    // cena, que es justo lo que la pizarra existe para no hacer.
    const comida = ["carnes", "pescados", "legumbres", "ensaladas_verduras", "pasta_arroces"];
    for (const meal of ["Desayuno", "Comida", "Merienda", "Cena", "Postre"]) {
      const v = carpetasDelHueco(TODAS, { meal });
      for (const c of comida) expect(v).toContain(c);
    }
  });

  it("respeta el orden que le llega", () => {
    const v = carpetasDelHueco(TODAS, { meal: "Comida" });
    expect(v).toEqual(TODAS.filter((x) => v.includes(x)));
  });

  it("aguanta lo vacío", () => {
    expect(carpetasDelHueco([], { meal: "Cena" })).toEqual([]);
    expect(carpetasDelHueco(undefined, { meal: "Cena" })).toEqual([]);
  });
});

describe("facetasDelHueco", () => {
  it("«Cenas rápidas» solo en la cena", () => {
    expect(facetasDelHueco(["rapido"], { meal: "Cena" })).toEqual(["rapido"]);
    expect(facetasDelHueco(["rapido"], { meal: "Comida" })).toEqual([]);
    expect(facetasDelHueco(["rapido"], { meal: "Desayuno" })).toEqual([]);
  });

  it("sin contexto se queda", () => {
    expect(facetasDelHueco(["rapido"], null)).toEqual(["rapido"]);
  });
});
