import { describe, it, expect } from "vitest";
import { puedeRegenerarDia } from "./regenerarDia.js";

describe("el «Regenerar» de cada día", () => {
  it("no sale en la pizarra: allí un plato se cambia con sus «…» y lo demás se pide a Lola", () => {
    expect(puedeRegenerarDia({ soloLectura: false, esPizarra: true })).toBe(false);
  });
  it("fuera de la pizarra sigue saliendo", () => {
    expect(puedeRegenerarDia({ soloLectura: false, esPizarra: false })).toBe(true);
  });
  it("en una casa de solo lectura, nunca", () => {
    expect(puedeRegenerarDia({ soloLectura: true, esPizarra: false })).toBe(false);
  });
});
