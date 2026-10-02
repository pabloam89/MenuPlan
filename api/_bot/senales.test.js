import { describe, it, expect } from "vitest";
import { esCorreccion } from "./senales.js";

describe("esCorreccion", () => {
  it("lo explícito corrige siempre", () => {
    expect(esCorreccion("deshaz eso")).toBe(true);
    expect(esCorreccion("Eso no, el jueves", "¿Te lo cambio?")).toBe(true);
    expect(esCorreccion("no era eso lo que quería")).toBe(true);
  });

  it("«no» tras una pregunta de Lola es una respuesta", () => {
    expect(esCorreccion("no", "¿Alguien tiene alergias?")).toBe(false);
    expect(esCorreccion("no, ninguna", "¿Quieres que lo apunte? [[Sí]] [[No]]")).toBe(false);
  });

  it("«no» tras algo que Lola hizo es corrección", () => {
    expect(esCorreccion("no, algo caliente", "Te propongo una ensalada de quinoa.")).toBe(true);
    expect(esCorreccion("¡No! quería pescado", "<b>Hecho</b>: puesto pollo el martes.")).toBe(true);
  });

  it("lo demás no", () => {
    expect(esCorreccion("nos vamos el finde")).toBe(false);
    expect(esCorreccion("genial, gracias")).toBe(false);
    expect(esCorreccion("")).toBe(false);
  });
});
