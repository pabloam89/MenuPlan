import { describe, it, expect } from "vitest";
import { normalizePantryInput } from "./normalizePantryInput.js";

describe("normalizePantryInput", () => {
  it("matches plain generic terms against the catalog", () => {
    const result = normalizePantryInput("pollo, arroz, tomates y cebolla");
    expect(result).toEqual([
      { raw: "pollo", normalized: "pollo", matched: true, ambiguous: false },
      { raw: "arroz", normalized: "arroz", matched: true, ambiguous: false },
      { raw: "tomates", normalized: "tomate", matched: true, ambiguous: false },
      { raw: "cebolla", normalized: "cebolla", matched: true, ambiguous: false },
    ]);
  });

  it("strips filler words ('tengo', 'un poco de') before matching", () => {
    const result = normalizePantryInput("tengo pechuga y un poco de queso");
    expect(result).toHaveLength(2);
    expect(result[0].raw).toBe("tengo pechuga");
    expect(result[1].raw).toBe("un poco de queso");
  });

  it("asks the user to disambiguate instead of guessing a tied match", () => {
    const [pechuga, queso] = normalizePantryInput("pechuga, queso");

    // "Pechuga" matches "Pechuga de pollo", "Pechuga de pavo" and "Pechuga de
    // pato" (Pappardelle con ragú de pato) equally well — the caller must let
    // the user pick, not silently assume one.
    expect(pechuga.matched).toBe(true);
    expect(pechuga.ambiguous).toBe(true);
    expect(pechuga.normalized).toBeUndefined();
    expect(pechuga.candidates.map((c) => c.normalized).sort()).toEqual([
      "pechuga_pato",
      "pechuga_pavo",
      "pechuga_pollo",
    ]);
    expect(pechuga.candidates.every((c) => typeof c.label === "string")).toBe(true);

    // Same story for "queso" — several "Queso ..." catalog variants tie.
    expect(queso.matched).toBe(true);
    expect(queso.ambiguous).toBe(true);
    expect(queso.candidates.length).toBeGreaterThan(1);
    expect(queso.candidates.every((c) => c.normalized.startsWith("queso_"))).toBe(true);
  });

  it("does not treat singular/plural catalog duplicates as separate candidates", () => {
    // Catalog has both "Contramuslo de pollo" and "Contramuslos de pollo" —
    // same ingredient. A bare "contramuslo" shouldn't present that as a
    // 2-way choice.
    const [result] = normalizePantryInput("contramuslo");
    expect(result.matched).toBe(true);
    expect(result.ambiguous).toBe(false);
  });

  it("asks which pasta when the user types a bare category word", () => {
    const [pasta] = normalizePantryInput("pasta");
    expect(pasta.matched).toBe(true);
    expect(pasta.ambiguous).toBe(true);
    expect(pasta.candidates.length).toBeGreaterThan(1);
    const labels = pasta.candidates.map((c) => c.label.toLowerCase()).join(" ");
    expect(labels).toMatch(/espagueti|macarron|fideo|lasaña|ñoqui/);
  });

  it("flags ingredients not in the catalog as unmatched", () => {
    const result = normalizePantryInput("aguacate, quinoa, durian");
    // Aguacate and quinoa are actually in this catalog (guacamole, ensaladas);
    // durian (an exotic fruit with no place in Spanish home cooking) genuinely
    // isn't — the spec's own example used "kale", which the catalog has grown
    // to include for real (Ensalada de col kale con manzana y nueces).
    expect(result.find((r) => r.raw === "aguacate")?.matched).toBe(true);
    expect(result.find((r) => r.raw === "quinoa")?.matched).toBe(true);
    const durian = result.find((r) => r.raw === "durian");
    expect(durian).toEqual({ raw: "durian", normalized: "durian", matched: false, ambiguous: false });
  });

  it("returns an empty array for empty input", () => {
    expect(normalizePantryInput("")).toEqual([]);
    expect(normalizePantryInput("   ")).toEqual([]);
    expect(normalizePantryInput(null)).toEqual([]);
    expect(normalizePantryInput(undefined)).toEqual([]);
  });

  it("does not false-positive match 'pollo' inside 'Repollo'", () => {
    const result = normalizePantryInput("repollo");
    expect(result[0].raw).toBe("repollo");
    if (result[0].matched && !result[0].ambiguous) {
      expect(result[0].normalized).not.toBe("pollo");
    }
  });
});
