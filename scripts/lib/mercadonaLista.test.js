import { describe, expect, it } from "vitest";
import { compararLista, erroresDeLista, lineasGuardadas, MOTIVO_LINEA } from "./mercadonaLista.mjs";

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
  const enviados = [
    { merca_code: "1", quantity: 1 },
    { merca_code: "2", quantity: 3 },
    { merca_code: "3", quantity: 1 },
  ];

  it("cuenta lo que entró y dice por qué falló el resto", () => {
    const r = compararLista(enviados, [
      { merca_code: "1", quantity: 1 },
      { merca_code: "2", quantity: 2 },
    ]);
    expect(r.entraron).toBe(1);
    expect(r.problemas).toEqual([
      { merca_code: "2", motivo: MOTIVO_LINEA.CANTIDAD_DISTINTA },
      { merca_code: "3", motivo: MOTIVO_LINEA.NO_ENTRO },
    ]);
  });

  it("sin cantidad en la respuesta, no inventa un fallo", () => {
    expect(compararLista([{ merca_code: "1", quantity: 2 }], [{ merca_code: "1", quantity: null }])).toEqual({
      entraron: 1,
      problemas: [],
    });
  });
});

describe("lineasGuardadas", () => {
  it("lee el código tanto suelto como dentro de product", () => {
    expect(lineasGuardadas({ products: [{ product: { id: 7 }, quantity: 2 }] })).toEqual([
      { merca_code: "7", quantity: 2 },
    ]);
    expect(lineasGuardadas({ items: [{ merca_code: "8" }] })).toEqual([{ merca_code: "8", quantity: null }]);
    expect(lineasGuardadas(null)).toEqual([]);
  });
});
