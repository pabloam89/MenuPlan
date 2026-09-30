import { describe, it, expect } from "vitest";
import { eleccionDe } from "./turno.js";

const propuesta = {
  conMenu: true, dia: "Jue", franja: "Cena",
  opciones: [
    { id: "a", nombre: "Merluza en salsa verde con almejas y patatas panaderas" },
    { id: "b", nombre: "Tortilla de calabacín" },
    { id: "c", nombre: "Crema de puerros" },
  ],
};

describe("eleccionDe: el paso 0 del turno", () => {
  it("el botón (nombre recortado con …) elige esa opción", () => {
    expect(eleccionDe("Merluza en salsa verde con almejas y p…", propuesta)?.opcion.id).toBe("a");
  });
  it("el nombre escrito tal cual, o una palabra que solo está en una", () => {
    expect(eleccionDe("Tortilla de calabacín", propuesta)?.opcion.id).toBe("b");
    expect(eleccionDe("la merluza", propuesta)?.opcion.id).toBe("a");
    expect(eleccionDe("ponme la crema", propuesta)?.opcion.id).toBe("c");
  });
  it("«Elige tú» y parecidos", () => {
    expect(eleccionDe("Elige tú", propuesta)).toEqual({ eligeTu: true });
    expect(eleccionDe("me da igual", propuesta)).toEqual({ eligeTu: true });
  });
  it("lo que no es elegir, no lo es", () => {
    expect(eleccionDe("¿y para el viernes?", propuesta)).toBeNull();
    expect(eleccionDe("apunta leche", propuesta)).toBeNull();
    expect(eleccionDe("la", propuesta)).toBeNull();
    expect(eleccionDe("Tortilla", null)).toBeNull();
  });
});
