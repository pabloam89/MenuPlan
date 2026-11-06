import { describe, expect, it } from "vitest";
import { compararLista, erroresDeLista, leerGuardada } from "./mercadonaLista.mjs";

describe("erroresDeLista", () => {
  it("acepta una lista normal, también con código con punto", () => {
    const lista = { name: "Semana", products: [{ merca_code: "82380.1", quantity: 2 }] };
    expect(erroresDeLista(lista)).toEqual([]);
  });

  it("rechaza lista vacía, código raro y cantidad imposible", () => {
    expect(erroresDeLista({ name: "x", products: [] })).toEqual(["la lista no tiene productos"]);
    const mala = {
      name: "x",
      products: [
        { merca_code: "../cart", quantity: 1 },
        { merca_code: "1", quantity: 0 },
      ],
    };
    expect(erroresDeLista(mala)).toEqual(["código raro: ../cart", "cantidad rara: 1"]);
  });
});

describe("compararLista", () => {
  const enviados = [{ merca_code: "1" }, { merca_code: "2.5" }];

  it("todo dentro: no falta nada", () => {
    expect(compararLista(enviados, ["1", "2.5"])).toEqual({ entraron: 2, faltan: [] });
  });

  it("dice qué producto no entró", () => {
    expect(compararLista(enviados, ["1"])).toEqual({ entraron: 1, faltan: ["2.5"] });
  });
});

describe("leerGuardada", () => {
  it("lee los códigos como texto", () => {
    expect(leerGuardada({ products: [{ id: "7" }, { id: 8 }] })).toEqual(["7", "8"]);
  });

  it.each([[null], [{}], [{ products: [{}] }]])("otra forma lanza: %j", (r) => {
    expect(() => leerGuardada(r)).toThrow("forma esperada");
  });
});

describe("erroresDeLista con lo que manda otro", () => {
  const productos = [{ merca_code: "1", quantity: 1 }];

  it("un nombre que no es texto es un error, no una excepción", () => {
    expect(erroresDeLista({ name: 123, products: productos })).toContain("la lista no tiene nombre");
  });

  it("un nombre sin tope no entra", () => {
    expect(erroresDeLista({ name: "x".repeat(81), products: productos }).join()).toContain("nombre de más de");
  });

  it("un código en una lista no pasa por número", () => {
    expect(erroresDeLista({ name: "x", products: [{ merca_code: ["1"], quantity: 1 }] }).join()).toContain("código raro");
  });

  it("un código numérico sigue valiendo", () => {
    expect(erroresDeLista({ name: "x", products: [{ merca_code: 12.3, quantity: 1 }] })).toEqual([]);
  });
});
