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

describe("handles reservados (0044)", () => {
  it("veta los nombres de confianza y cualquier cosa con la marca dentro", () => {
    // La lista exacta no basta: "homenu.oficial" no está en ninguna lista y
    // es exactamente el handle con el que alguien se haría pasar por la app.
    for (const u of ["soporte", "admin", "ayuda", "homenu", "homenu.oficial", "soporte_homenu", "menuplan2"]) {
      expect(usernameError(u), u).toBe("Ese nombre está reservado");
    }
  });

  it("exige al menos una letra o número", () => {
    // "..." pasa el regex de formato (3-24 de [a-z0-9._]) y no identifica a
    // nadie. Salió al auditar, no de la imaginación.
    expect(usernameError("...")).toBe("Necesita al menos una letra o número");
    expect(usernameError("._.")).toBe("Necesita al menos una letra o número");
  });

  it("los handles normales siguen pasando", () => {
    for (const u of ["pablo.artinano2", "marta.cocina", "javidcasa", "ana_ru"]) {
      expect(usernameError(u), u).toBeNull();
    }
  });
});
