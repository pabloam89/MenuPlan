import { describe, it, expect } from "vitest";
import { prediceRapida } from "./prediceRapida.js";

// Tras una lista de opciones, las respuestas y ajustes son de Lola: esperar
// al enrutador les costaría 1-1,9 s (#909).
describe("prediceRapida tras una lista de opciones", () => {
  const lista = "👉 Para el segundo del viernes:\n\n• Chuletón\n• Merluza";
  it.each(["sin pescado", "el jueves no", "sí", "vale", "no", "hazme el menú", "quita la merluza", "me gusta la segunda pero con arroz y ensalada"])("%s no se predice rápida", (f) => {
    expect(prediceRapida(f, lista)).toBe(null);
  });
  it("un nombre de plato corto sí", () => {
    expect(prediceRapida("Revuelto de jamón y queso", lista)).toBe("opciones");
  });
});
