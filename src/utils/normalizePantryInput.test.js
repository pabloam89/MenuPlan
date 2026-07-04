import { describe, it, expect } from "vitest";
import { normalizePantryInput } from "./normalizePantryInput.js";

describe("normalizePantryInput", () => {
  it("matches plain generic terms against the catalog", () => {
    const result = normalizePantryInput("pollo, arroz, tomates y cebolla");
    expect(result).toEqual([
      { raw: "pollo", normalized: "pollo", matched: true },
      { raw: "arroz", normalized: "arroz", matched: true },
      { raw: "tomates", normalized: "tomate", matched: true },
      { raw: "cebolla", normalized: "cebolla", matched: true },
    ]);
  });

  it("strips filler words ('tengo', 'un poco de') before matching", () => {
    const result = normalizePantryInput("tengo pechuga y un poco de queso");
    expect(result).toHaveLength(2);
    expect(result[0].raw).toBe("tengo pechuga");
    expect(result[0].matched).toBe(true);
    // "Pechuga" alone is genuinely ambiguous — the catalog has both "Pechuga
    // de pollo" and "Pechuga de pavo" — so just assert it resolved to one of
    // them deterministically, not which one.
    expect(result[0].normalized.startsWith("pechuga_")).toBe(true);
    expect(result[1].matched).toBe(true);
    expect(result[1].raw).toBe("un poco de queso");
    // Several "Queso ..." catalog variants tie for a bare "queso" — same idea.
    expect(result[1].normalized.startsWith("queso_")).toBe(true);
  });

  it("flags ingredients not in the catalog as unmatched", () => {
    const result = normalizePantryInput("aguacate, quinoa, kale");
    // Aguacate and quinoa are actually in this catalog (guacamole, ensaladas);
    // kale genuinely isn't — the spec's own example assumed none would be.
    expect(result.find((r) => r.raw === "aguacate")?.matched).toBe(true);
    expect(result.find((r) => r.raw === "quinoa")?.matched).toBe(true);
    const kale = result.find((r) => r.raw === "kale");
    expect(kale).toEqual({ raw: "kale", normalized: "kale", matched: false });
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
    if (result[0].matched) {
      expect(result[0].normalized).not.toBe("pollo");
    }
  });
});
