import { describe, it, expect } from "vitest";
import { motivosNoAptoNinos, frasesMotivos } from "./aptoNinos.js";

const ings = (...names) => names.map((name) => ({ name }));

describe("motivosNoAptoNinos", () => {
  it("encuentra el alcohol y el picante, y dice qué ingrediente es", () => {
    const motivos = motivosNoAptoNinos(ings("Pechuga de pollo", "Vino blanco", "Guindilla", "Cebolla"));
    expect(motivos).toEqual([
      { ingrediente: "Vino blanco", motivo: "alcohol" },
      { ingrediente: "Guindilla", motivo: "picante" },
    ]);
  });

  it("el vinagre no es alcohol", () => {
    expect(motivosNoAptoNinos(ings("Vinagre de vino", "Vinagre de Jerez", "Tomate"))).toEqual([]);
  });

  it("sin motivos, lista vacía", () => {
    expect(motivosNoAptoNinos(ings("Patata", "Huevo", "Aceite de oliva"))).toEqual([]);
    expect(motivosNoAptoNinos(undefined)).toEqual([]);
  });
});

describe("frasesMotivos", () => {
  it("junta los motivos en una frase", () => {
    expect(frasesMotivos([{ ingrediente: "Vino blanco", motivo: "alcohol" }])).toBe("vino blanco (alcohol)");
    expect(
      frasesMotivos([
        { ingrediente: "Vino blanco", motivo: "alcohol" },
        { ingrediente: "Cayena", motivo: "picante" },
        { ingrediente: "Tabasco", motivo: "picante" },
      ]),
    ).toBe("vino blanco (alcohol), cayena (picante) y tabasco (picante)");
  });
});
