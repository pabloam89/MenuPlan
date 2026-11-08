import { describe, it, expect } from "vitest";
import { relinkStepMarkers, stripStepMarkers } from "./recipeSteps.js";

const INGS = ["Patata", "Aceite de oliva", "Pan", "Panceta", "Cebolla"];

// El editor enseña el paso sin llaves y lo devuelve así: se prueba con el texto
// que sale de stripStepMarkers, que es exactamente lo que ve el usuario.
const ida = (text) => stripStepMarkers(text);

describe("relinkStepMarkers", () => {
  it("sin tocar nada, devuelve los mismos marcadores", () => {
    const previo = "Pelar y cortar {{Patata}} en dados y freír en {{@Sartén}} con {{Aceite de oliva|chorrito}}.";
    expect(relinkStepMarkers(ida(previo), previo, INGS)).toBe(previo);
  });

  it("el usuario cambia el texto alrededor y los marcadores se quedan", () => {
    const previo = "Pelar y cortar {{Patata}} en dados.";
    const editado = "Pelar y cortar patata en rodajas finas.";
    expect(relinkStepMarkers(editado, previo, INGS)).toBe("Pelar y cortar {{Patata}} en rodajas finas.");
  });

  it("enlaza la primera mención de un ingrediente nuevo, no las siguientes", () => {
    const editado = "Pochar la cebolla y, cuando la cebolla esté dorada, apartar.";
    expect(relinkStepMarkers(editado, "", INGS)).toBe(
      "Pochar {{Cebolla}} y, cuando la cebolla esté dorada, apartar.",
    );
  });

  it("«pan» no se cuela dentro de «panceta»", () => {
    expect(relinkStepMarkers("Dorar la panceta.", "", INGS)).toBe("Dorar {{Panceta}}.");
    expect(relinkStepMarkers("Tostar el pan.", "", INGS)).toBe("Tostar {{Pan}}.");
    // Sin «Panceta» en la lista que la reclame antes, «pan» sigue sin colarse.
    expect(relinkStepMarkers("Dorar la panceta.", "", ["Pan"])).toBe("Dorar la panceta.");
    expect(relinkStepMarkers("Añadir el ñame.", "", ["ame"])).toBe("Añadir el ñame.");
  });

  it("el artículo de delante se va: el marcador se pinta con su cantidad", () => {
    // «Picar la {{Cebolla}}» se leería «Picar la 2 cebollas».
    expect(relinkStepMarkers("Picar la cebolla y reservar con el agua.", "", ["Cebolla", "Agua"])).toBe(
      "Picar {{Cebolla}} y reservar con {{Agua}}.",
    );
    expect(relinkStepMarkers("Añadir al caldo y cubrir del agua.", "", ["Caldo", "Agua"])).toBe(
      "Añadir a {{Caldo}} y cubrir de {{Agua}}.",
    );
    // Un utensilio se pinta con su nombre: el artículo se queda.
    expect(relinkStepMarkers("Calentar la sartén.", "Calentar {{@Sartén}}.", [])).toBe("Calentar la {{@Sartén}}.");
  });

  it("si el usuario borró el ingrediente, su marcador se va", () => {
    const previo = "Freír {{Patata}} en {{Aceite de oliva|chorrito}}.";
    expect(relinkStepMarkers("Freír en abundante aceite.", previo, INGS)).toBe("Freír en abundante aceite.");
  });
});
