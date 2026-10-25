import { describe, it, expect } from "vitest";
import { esCorreccionRuta, esCorreccionMedida } from "./senales.js";

// Lo que comparten los dos criterios.
describe.each([["esCorreccionRuta", esCorreccionRuta], ["esCorreccionMedida", esCorreccionMedida]])("%s: lo común", (_nombre, esCorreccion) => {
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

  it("lo demás no", () => {
    expect(esCorreccion("nos vamos el finde")).toBe(false);
    expect(esCorreccion("genial, gracias")).toBe(false);
    expect(esCorreccion("")).toBe(false);
  });
});

// #910, revisión de Lola 19–24 oct 2026: la medida de «turnos corregidos» contaba mal.
describe("esCorreccionMedida: el criterio estrecho, solo para contar", () => {
  it("«No quiero…» es una petición nueva, no una corrección", () => {
    expect(esCorreccionMedida("No quiero más de dos ensaladas a la semana", "Hecho: menú de la semana del 26.")).toBe(false);
    expect(esCorreccionMedida("No me gusta el pescado azul", "Hecho: puesto salmón el martes.")).toBe(false);
    expect(esCorreccionMedida("no tengo tiempo el jueves", "Hecho: puesto pollo el jueves.")).toBe(false);
  });

  it("«te estoy diciendo…» y «reházme / rehaz» corrigen", () => {
    expect(esCorreccionMedida("No, no, te estoy diciendo que me generes la semana a partir del 2 de noviembre", "Hecho: menú de la semana del 26.")).toBe(true);
    expect(esCorreccionMedida("Reházme la semana que viene entera teniendo en cuenta lo que te acabo de decir", "Hecho: menú de la semana del 26.")).toBe(true);
    expect(esCorreccionMedida("rehaz el menú", "Hecho: menú de la semana del 26.")).toBe(true);
    expect(esCorreccionMedida("Te estoy diciendo que es el jueves", "Hecho: puesto pollo el miércoles.")).toBe(true);
  });

  it("«te estoy diciendo» corrige aunque Lola acabara de preguntar", () => {
    // Si Lola acababa de preguntar, «no» a secas es una respuesta; «te estoy diciendo» no.
    expect(esCorreccionMedida("no, te estoy diciendo que el jueves", "¿Qué día lo quieres?")).toBe(true);
  });

  it("«no» a secas, con coma o admiración, sigue siendo corrección tras algo que Lola hizo", () => {
    expect(esCorreccionMedida("No.", "Hecho: puesto pollo el martes.")).toBe(true);
    expect(esCorreccionMedida("que no, que el jueves", "Hecho: puesto pollo el martes.")).toBe(true);
    expect(esCorreccionMedida("que no quiero pollo", "Hecho: puesto pollo el martes.")).toBe(false);
  });
});

// El criterio de la ruta no se toca desde un PR de medición: ante la duda, a Lola.
describe("esCorreccionRuta: el criterio amplio de siempre, intacto", () => {
  it("«No quiero…» sigue contando (así «No quiero pescado, hazme el menú» va a Lola, que lo lee)", () => {
    expect(esCorreccionRuta("No quiero más de dos ensaladas, genérame la semana", "Hecho: menú de la semana del 26.")).toBe(true);
    expect(esCorreccionRuta("No quiero pescado, hazme el menú de esta semana", "Hecho: menú de la semana del 26.")).toBe(true);
  });

  it("lo que solo detecta la medida (reházme, te estoy diciendo sin «no» delante) no cambia la ruta", () => {
    expect(esCorreccionRuta("Reházme la semana que viene entera", "Hecho: menú de la semana del 26.")).toBe(false);
    expect(esCorreccionRuta("Te estoy diciendo que es el jueves", "Hecho: puesto pollo el miércoles.")).toBe(false);
  });
});
