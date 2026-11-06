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
