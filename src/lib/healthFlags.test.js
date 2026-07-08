import { describe, it, expect } from "vitest";
import { deriveHealthFlags } from "./healthFlags.js";

const r = (name, ingredients = [], extra = {}) => ({
  name,
  ingredients: ingredients.map((n) => ({ name: n })),
  ...extra,
});

describe("deriveHealthFlags", () => {
  it("flags fried and high-sodium cured meats", () => {
    const flags = deriveHealthFlags(r("Croquetas de jamón", ["Jamón serrano", "Aceite"]));
    expect(flags).toContain("frito");
    expect(flags).toContain("embutido");
    expect(flags).toContain("alto_sodio");
  });

  it("flags iron-rich legumes and red meat", () => {
    expect(deriveHealthFlags(r("Lentejas", ["Lentejas"], { category: "legumbres" }))).toContain(
      "rico_hierro",
    );
    expect(
      deriveHealthFlags(r("Solomillo de ternera", ["Ternera"], { mainProtein: "ternera" })),
    ).toContain("rico_hierro");
  });

  it("flags added sugar in desserts", () => {
    expect(deriveHealthFlags(r("Flan de huevo", ["Azúcar", "Leche"]))).toContain("azucar_anadido");
  });

  it("keeps a plain grilled fish free of risk flags", () => {
    const flags = deriveHealthFlags(r("Merluza a la plancha", ["Merluza", "Limón"]));
    expect(flags).not.toContain("frito");
    expect(flags).not.toContain("embutido");
  });

  it("merges explicitly declared flags", () => {
    const flags = deriveHealthFlags(r("Plato X", ["Agua"], { healthFlags: ["picante"] }));
    expect(flags).toContain("picante");
  });
});
