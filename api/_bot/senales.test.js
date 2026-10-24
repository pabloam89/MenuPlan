import { describe, it, expect } from "vitest";
import { esCorreccion } from "./senales.js";

describe("esCorreccion", () => {
  it("lo explícito corrige siempre", () => {
    expect(esCorreccion("deshaz eso")).toBe(true);
    expect(esCorreccion("Eso no, el jueves", "¿Te lo cambio?")).toBe(true);
    expect(esCorreccion("no era eso lo que quería")).toBe(true);
    expect(esCorreccion("No es así", "✅ Apuntado: A, celiaco. [[No es así]] ¿B tiene alguna alergia?")).toBe(true);
  });

  it("«no» tras una pregunta de Lola es una respuesta", () => {
    expect(esCorreccion("no", "¿Alguien tiene alergias?")).toBe(false);
    expect(esCorreccion("no, ninguna", "¿Quieres que lo apunte? [[Sí]] [[No]]")).toBe(false);
  });

  it("«no» tras algo que Lola hizo es corrección", () => {
    expect(esCorreccion("no, algo caliente", "Te propongo una ensalada de quinoa.")).toBe(true);
    expect(esCorreccion("¡No! quería pescado", "<b>Hecho</b>: puesto pollo el martes.")).toBe(true);
  });

  // #910, revisión de Lola 19–24 oct 2026: la medida de «turnos corregidos» contaba mal.
  it("«No quiero…» es una petición nueva, no una corrección", () => {
    expect(esCorreccion("No quiero más de dos ensaladas a la semana", "Hecho: menú de la semana del 26.")).toBe(false);
    expect(esCorreccion("No me gusta el pescado azul", "Hecho: puesto salmón el martes.")).toBe(false);
    expect(esCorreccion("no tengo tiempo el jueves", "Hecho: puesto pollo el jueves.")).toBe(false);
  });

  it("«te estoy diciendo…» y «reházme / rehaz» corrigen", () => {
    expect(esCorreccion("No, no, te estoy diciendo que me generes la semana a partir del 2 de noviembre", "Hecho: menú de la semana del 26.")).toBe(true);
    expect(esCorreccion("Reházme la semana que viene entera teniendo en cuenta lo que te acabo de decir", "Hecho: menú de la semana del 26.")).toBe(true);
    expect(esCorreccion("rehaz el menú", "Hecho: menú de la semana del 26.")).toBe(true);
    expect(esCorreccion("Te estoy diciendo que es el jueves", "Hecho: puesto pollo el miércoles.")).toBe(true);
  });

  it("«te estoy diciendo» corrige aunque Lola acabara de preguntar", () => {
    // Si Lola acababa de preguntar, «no» a secas es una respuesta; «te estoy diciendo» no.
    expect(esCorreccion("no, te estoy diciendo que el jueves", "¿Qué día lo quieres?")).toBe(true);
  });

  it("«no» a secas, con coma o admiración, sigue siendo corrección tras algo que Lola hizo", () => {
    expect(esCorreccion("No.", "Hecho: puesto pollo el martes.")).toBe(true);
    expect(esCorreccion("que no, que el jueves", "Hecho: puesto pollo el martes.")).toBe(true);
    expect(esCorreccion("que no quiero pollo", "Hecho: puesto pollo el martes.")).toBe(false);
  });

  it("lo demás no", () => {
    expect(esCorreccion("nos vamos el finde")).toBe(false);
    expect(esCorreccion("genial, gracias")).toBe(false);
    expect(esCorreccion("")).toBe(false);
  });
});
