import { describe, it, expect } from "vitest";
import { prediceRapida } from "./prediceRapida.js";

describe("prediceRapida (#909)", () => {
  it("las órdenes cortas de generar la semana se predicen rápidas", () => {
    for (const t of ["Genérame la siguiente semana", "Rehacer esta semana", "Hazme el menú de esta semana."]) expect(prediceRapida(t, null)).toBe("generar");
  });
  it("una frase corta tras una lista de opciones se predice rápida", () => {
    expect(prediceRapida("Revuelto de jamón y queso", "👉 Para el segundo del viernes:\n\n• Chuletón")).toBe("opciones");
    expect(prediceRapida("Mmm prefiero pasta la verdad, dame opciones", "👉 Para la comida de hoy")).toBe("opciones");
  });
  it("lo que lleva condiciones, preguntas o es largo es de Lola", () => {
    expect(prediceRapida("Reházme la semana que viene entera teniendo en cuenta lo que te acabo de decir", "🎉 ¡Menú listo!")).toBe(null);
    expect(prediceRapida("¿Cuáles son las preferencias que he puesto para generar este menú?", null)).toBe(null);
    expect(prediceRapida("Genérame la semana pero sin pescado", null)).toBe(null);
    expect(prediceRapida("¿cuál me recomiendas?", "👉 Para hoy")).toBe(null);
    expect(prediceRapida("x".repeat(80), "👉 Para hoy")).toBe(null);
  });
  it("sin señal (la última no era una lista) no se predice", () => {
    expect(prediceRapida("El menú de los niños es el mismo", "Ya está arreglado 👉 te dejo elegir")).toBe(null);
    expect(prediceRapida("Hola Lola", "¡Hola! 😊")).toBe(null);
  });
});
