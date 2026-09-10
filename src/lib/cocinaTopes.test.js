import { describe, it, expect } from "vitest";
import { MAX_POR_SEMANA, SIEMPRE_ENCENDIDAS, TOPE_POR_COCINA, esAnadido, topeDe } from "./cocinaTopes.js";
import { CAMPOS_POR_ID } from "./notepadFields.js";

describe("italiana no es un añadido: es el bloque de pasta", () => {
  // 52 de sus 62 platos servibles son pasta_arroces. Si se apagara por defecto
  // junto a peruana o india, la casa perdería dos tercios de la pasta el primer
  // día — y encima habría dos mandos sobre los mismos platos, porque la pasta
  // ya tiene su slider en el reparto.
  it("está fuera de la puerta de opt-in", () => {
    expect(esAnadido("italiana")).toBe(false);
    expect(SIEMPRE_ENCENDIDAS.has("italiana")).toBe(true);
  });

  it("y sin tope práctico", () => {
    expect(topeDe("italiana")).toBeGreaterThan(MAX_POR_SEMANA);
  });

  it("todas las demás sí son añadidos y sí tienen tope", () => {
    for (const c of CAMPOS_POR_ID.cocina.dominio.filter((x) => x !== "italiana")) {
      expect(esAnadido(c), c).toBe(true);
      expect(topeDe(c), c).toBeLessThanOrEqual(MAX_POR_SEMANA);
    }
  });
});

describe("los topes salen de lo que el catálogo puede servir", () => {
  it("peruana es la más corta: sus platos son casi todos pescado", () => {
    expect(topeDe("peruana")).toBe(2);
    expect(topeDe("peruana")).toBeLessThan(topeDe("mexicana"));
  });

  it("cubren el dominio entero, sin inventar cocinas", () => {
    expect(Object.keys(TOPE_POR_COCINA).sort())
      .toEqual([...CAMPOS_POR_ID.cocina.dominio].sort());
  });

  it("una cocina sin medir cae al tope general en vez de quedarse sin él", () => {
    expect(topeDe("coreana")).toBe(MAX_POR_SEMANA);
  });

  it("ningún tope es cero: una cocina que no se puede pedir no debería ofrecerse", () => {
    for (const c of Object.keys(TOPE_POR_COCINA)) expect(topeDe(c)).toBeGreaterThan(0);
  });
});
