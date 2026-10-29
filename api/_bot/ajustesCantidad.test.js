import { describe, it, expect } from "vitest";
import { conCantidades } from "./ajustes.js";

// «Menos de dos» sale del intérprete (cantidadDe), no del modelo (#958).
describe("ajustar_gustos: la cantidad dicha con palabras", () => {
  it("«menos de dos veces de carne roja» es como mucho 1 a la semana", () => {
    const r = conCantidades([{ campo: "freqs", valor: "carne", op: "menos", cantidad: "menos de dos veces a la semana" }]);
    expect(r.ajustes).toEqual([{ campo: "freqs", valor: "carne", op: "menos", n: 1 }]);
  });
  it("«como mucho tres», «al menos una»", () => {
    expect(conCantidades([{ campo: "freqs", valor: "pescado", op: "mas", cantidad: "al menos una vez" }]).ajustes[0].n).toBe(1);
    expect(conCantidades([{ campo: "freqs", valor: "pasta_arroz", op: "menos", cantidad: "como mucho tres" }]).ajustes[0].n).toBe(3);
  });
  it("una cantidad que no se entiende, o fuera de freqs, es una pregunta", () => {
    expect(conCantidades([{ campo: "freqs", valor: "carne", op: "menos", cantidad: "un montón" }]).duda).toMatch(/Cuántas/);
    expect(conCantidades([{ campo: "excluidos", valor: "cerdo", op: "nunca", cantidad: "dos" }]).duda).toMatch(/freqs/);
  });
  it("sin cantidad, el ajuste pasa tal cual", () => {
    expect(conCantidades([{ campo: "freqs", valor: "carne", op: "menos", n: 2 }]).ajustes).toEqual([{ campo: "freqs", valor: "carne", op: "menos", n: 2 }]);
  });
});
