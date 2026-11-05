import { describe, it, expect } from "vitest";
import { falta } from "./siguientePregunta.js";
import { ESTADOS_DATO } from "./vocabularios.js";

describe("falta: qué cuenta como no dicho", () => {
  it("sin leer, vacío o por defecto falta", () => {
    expect(falta(null)).toBe(true);
    expect(falta({ estado: "vacio" })).toBe(true);
    expect(falta({ estado: "por_defecto" })).toBe(true);
  });

  it("lo dicho, supuesto o aprendido no se pregunta", () => {
    for (const estado of ESTADOS_DATO.filter((e) => !["vacio", "por_defecto"].includes(e))) expect(falta({ estado }), estado).toBe(false);
  });

  it("lo caducado sí, aunque estuviera dicho", () => {
    expect(falta({ estado: "dicho", caducado: true })).toBe(true);
  });

  it("un dato bloqueado (no quiere decirlo) no se vuelve a preguntar", () => {
    expect(falta({ estado: "vacio", bloqueado: true })).toBe(false);
  });
});
