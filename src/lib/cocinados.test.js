import { describe, it, expect } from "vitest";
import { filaDeCocinado } from "./cocinados.js";

const FILA = { semana: "2026-11-02", dia: "Mar", comida: "Cena", receta_id: "lentejas" };

describe("lo cocinado vive en su tabla (trozo 22 de #1037)", () => {
  it("una fila es la de la tabla: lunes, día, comida y receta, del vocabulario; lo demás lanza antes de pedir nada", () => {
    expect(filaDeCocinado(FILA)).toEqual(FILA);
    expect(() => filaDeCocinado({ ...FILA, semana: "2026-11-03" })).toThrow(/lunes/);
    expect(() => filaDeCocinado({ ...FILA, dia: "Tue" })).toThrow(/día/);
    expect(() => filaDeCocinado({ ...FILA, comida: "dinner" })).toThrow(/comida/);
    expect(() => filaDeCocinado({ ...FILA, receta_id: "" })).toThrow(/receta/);
  });
});
