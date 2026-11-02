import { describe, expect, it } from "vitest";
import { codificar, compilarEjes } from "./compilar-ejes.mjs";

// Los ejes de receta compilados a números (trozo 30 de #1037).

const tecnica = { n: 23, id: "tecnica", ambito: "receta", tipo: "enum", campo: "tecnica", vocabulario: ["horno", "plancha", "sarten"] };
const alergenos = { n: 75, id: "alergenos", ambito: "receta", tipo: "tags", campo: "allergens", vocabulario: ["gluten", "huevo", "leche"] };
const salsa = { n: 64, id: "llevaSalsa", ambito: "receta", tipo: "booleano", campo: "llevaSalsa", vocabulario: null };
const tiempo = { n: 70, id: "tiempoTotal", ambito: "receta", tipo: "numerico", campo: "time", vocabulario: null };
const coste = { n: 34, id: "coste", ambito: "receta", tipo: "numerico", campo: "costeNivel", vocabulario: ["economico", "medio", "caro"] };

describe("codificar: cada valor, un número; lo que no se sabe, null", () => {
  it("un enum va por la posición en su vocabulario, y fuera de él es null", () => {
    expect([codificar(tecnica, "horno"), codificar(tecnica, "sarten"), codificar(tecnica, "vapor")]).toEqual([0, 2, null]);
  });

  it("las etiquetas van en bits; una sola sin lista es una lista de una", () => {
    expect([codificar(alergenos, ["gluten", "leche"]), codificar(alergenos, []), codificar(alergenos, "huevo")]).toEqual([0b101, 0, 0b010]);
    expect(codificar(alergenos, ["gluten", "marisco"])).toBeNull();
  });

  it("sí/no es 1/0, un número va tal cual y unos niveles numéricos van por posición", () => {
    expect([codificar(salsa, true), codificar(salsa, false), codificar(tiempo, 35), codificar(coste, "caro")]).toEqual([1, 0, 35, 2]);
  });

  it("lo que falta es null, nunca 0: «no lo sé» no es «no»", () => {
    expect([codificar(salsa, undefined), codificar(tiempo, null), codificar(alergenos, undefined)]).toEqual([null, null, null]);
  });
});

describe("compilarEjes: la tabla receta × eje", () => {
  const recetas = [
    { id: "b", tecnica: "sarten", time: 20 },
    { id: "a", tecnica: "horno", time: 45, llevaSalsa: true },
  ];

  it("ordena las recetas por id, venga en el orden que venga, y pone una columna por eje", () => {
    const t = compilarEjes(recetas, [tecnica, tiempo, salsa]);
    expect(t.ids).toEqual(["a", "b"]);
    expect(t.tabla).toEqual({ tecnica: [0, 2], llevaSalsa: [1, null], tiempoTotal: [45, 20] });
    expect(compilarEjes([...recetas].reverse(), [tecnica, tiempo, salsa])).toEqual(t);
  });

  it("lo que no entra se apunta: el eje sin valores o sin vocabulario, y los valores fuera de él", () => {
    const sinVocabulario = { n: 14, id: "cocina", ambito: "receta", tipo: "enum", campo: "cocina", vocabulario: null };
    const conRaro = [...recetas, { id: "c", tecnica: "vapor" }];
    const t = compilarEjes(conRaro, [tecnica, coste, sinVocabulario]);
    expect(t.ejes.map((e) => e.id)).toEqual(["tecnica"]);
    expect(t.sinCompilar).toEqual([
      { id: "cocina", porque: "sin vocabulario" },
      { id: "coste", porque: "ningún valor en los JSON" },
    ]);
    expect(t.fueraDelVocabulario).toEqual({ tecnica: 1 });
  });
});
