import { describe, it, expect } from "vitest";
import { personaPorNombre, noEncuentro } from "./ajustes.js";

const casa = (...nombres) => ({ members: nombres.map((name, i) => ({ id: `m${i}`, name })) });

describe("personaPorNombre: nunca se queda con la primera que empiece igual", () => {
  it("el nombre exacto gana", () => {
    expect(personaPorNombre(casa("Anabel", "Ana"), "Ana")?.name).toBe("Ana");
  });
  it("el primer nombre exacto gana a un prefijo", () => {
    expect(personaPorNombre(casa("Anabel", "Ana Belén"), "Ana")?.name).toBe("Ana Belén");
  });
  it("un prefijo único vale", () => {
    expect(personaPorNombre(casa("Leonor", "Pablo"), "Leo")?.name).toBe("Leonor");
  });
  it("con varias candidatas no elige: null y pregunta cuál", () => {
    const d = casa("Anabel", "Anastasia");
    expect(personaPorNombre(d, "Ana")).toBe(null);
    expect(noEncuentro(d, "Ana")).toMatch(/Anabel.*Anastasia|Anastasia.*Anabel/);
    const dos = casa("Ana López", "Ana García");
    expect(personaPorNombre(dos, "Ana")).toBe(null);
    expect(noEncuentro(dos, "Ana")).toMatch(/¿Te refieres a/);
  });
  it("sin nadie que encaje, «no encuentro»", () => {
    expect(personaPorNombre(casa("Pablo"), "Isa")).toBe(null);
    expect(noEncuentro(casa("Pablo"), "Isa")).toMatch(/No encuentro a Isa/);
    expect(personaPorNombre(casa("Pablo"), "")).toBe(null);
  });
});
