import { describe, it, expect } from "vitest";
import { deriveUsername, usernameError } from "./social.js";

describe("deriveUsername", () => {
  it("quita acentos y pasa a minúsculas con puntos", () => {
    expect(deriveUsername("Pablo Artiñano")).toBe("pablo.artinano");
    expect(deriveUsername("Ana y Rubén")).toBe("ana.y.ruben");
  });

  it("no deja puntos sueltos al principio, al final ni repetidos", () => {
    expect(deriveUsername("  ¡Marta!  ")).toBe("marta");
    expect(deriveUsername("José--Luis")).toBe("jose.luis");
  });

  it("rellena los nombres demasiado cortos en vez de proponer algo que no se puede guardar", () => {
    // El CHECK de la base exige 3 caracteres: sugerir "jo" seria proponer algo
    // que falla al guardar.
    expect(usernameError(deriveUsername("Jo"))).toBeNull();
    expect(deriveUsername("Jo")).toBe("jo.cocina");
  });

  it("respeta el tope de 24 que impone la base", () => {
    const long = deriveUsername("Maria del Carmen Fernandez de la Torre");
    expect(long.length).toBeLessThanOrEqual(24);
    expect(usernameError(long)).toBeNull();
  });

  it("devuelve vacío sin nombre, en vez de inventarse uno", () => {
    expect(deriveUsername("")).toBe("");
    expect(deriveUsername(null)).toBe("");
  });
});

describe("usernameError", () => {
  it("acepta vacío: no tener handle es válido", () => {
    expect(usernameError("")).toBeNull();
  });

  it("replica el CHECK de la base", () => {
    expect(usernameError("ab")).toMatch(/Mínimo/);
    expect(usernameError("Marta Cocina")).toMatch(/minúsculas/);
    expect(usernameError("marta.cocina")).toBeNull();
    expect(usernameError("a".repeat(25))).toMatch(/Máximo/);
  });
});
