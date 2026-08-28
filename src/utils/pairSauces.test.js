import { describe, it, expect } from "vitest";
import { pairSauces, sauceForRecipe, sauceOptionsForRecipe } from "./pairSauces.js";

function sauce(overrides) {
  return {
    id: "salsa1",
    name: "Salsa rápida",
    time: 10,
    sauceCompat: ["carne_blanca"],
    ingredients: [{ name: "Aceite de oliva" }],
    ...overrides,
  };
}

function principal(overrides) {
  return {
    id: "p1",
    type: "principal",
    name: "Plato principal",
    category: "carnes",
    mainProtein: "pollo",
    canReceiveSauce: true,
    ingredients: [{ name: "Pollo" }],
    ...overrides,
  };
}

describe("pairSauces", () => {
  it("only pairs a sauce for a recipe marked canReceiveSauce", () => {
    const pool = { p1: principal({ canReceiveSauce: false }) };
    const slots = [{ slotId: "lun_cena", recipeId: "p1" }];
    const result = pairSauces(slots, pool, {}, { sauceCatalog: [sauce()] });
    expect(result[0].sauceId).toBeUndefined();
  });

  it("leaves the slot without a sauce when there's no compatible candidate", () => {
    const pool = { p1: principal() };
    const slots = [{ slotId: "lun_cena", recipeId: "p1" }];
    const result = pairSauces(slots, pool, {}, { sauceCatalog: [sauce({ sauceCompat: ["marisco"] })] });
    expect(result[0].sauceId).toBeUndefined();
  });

  it("always honors a sauce pinned via pinnedByRecipeId, regardless of the weekly cap", () => {
    const pool = { p1: principal() };
    const slots = [{ slotId: "lun_cena", recipeId: "p1" }];
    const result = pairSauces(slots, pool, { p1: "salsa1" }, { sauceCatalog: [sauce({ id: "salsa1" })], maxPerWeek: 0 });
    expect(result[0].sauceId).toBe("salsa1");
  });

  it("honors a sauce already fixed on the recipe (recipe.sauceId) the same way as an explicit pin", () => {
    const pool = { p1: principal({ sauceId: "salsa1" }) };
    const slots = [{ slotId: "lun_cena", recipeId: "p1" }];
    const result = pairSauces(slots, pool, {}, { sauceCatalog: [sauce({ id: "salsa1" })], maxPerWeek: 0 });
    expect(result[0].sauceId).toBe("salsa1");
  });

  it("caps automatic (non-pinned) assignments at maxPerWeek", () => {
    const pool = {
      p1: principal({ id: "p1" }),
      p2: principal({ id: "p2" }),
      p3: principal({ id: "p3" }),
    };
    const slots = [
      { slotId: "lun_cena", recipeId: "p1" },
      { slotId: "mar_cena", recipeId: "p2" },
      { slotId: "mie_cena", recipeId: "p3" },
    ];
    const result = pairSauces(slots, pool, {}, { sauceCatalog: [sauce()], maxPerWeek: 1 });
    const assigned = result.filter((r) => r.sauceId);
    expect(assigned.length).toBe(1);
  });

  it("only offers quick sauces (time <= 15) on weekday slots when a quick option exists", () => {
    const pool = { p1: principal() };
    const slots = [{ slotId: "mar_cena", recipeId: "p1" }];
    const slow = sauce({ id: "lenta", time: 30 });
    const quick = sauce({ id: "rapida", time: 10 });
    const result = pairSauces(slots, pool, {}, { sauceCatalog: [slow, quick], maxPerWeek: 1 });
    expect(result[0].sauceId).toBe("rapida");
  });

  it("allows a slow sauce on a weekend slot (sáb/dom)", () => {
    const pool = { p1: principal() };
    const slots = [{ slotId: "sab_cena", recipeId: "p1" }];
    const slow = sauce({ id: "lenta", time: 30 });
    const result = pairSauces(slots, pool, {}, { sauceCatalog: [slow], maxPerWeek: 1 });
    expect(result[0].sauceId).toBe("lenta");
  });

  it("does not repeat the same sauce within the week when an alternative exists", () => {
    const pool = {
      p1: principal({ id: "p1" }),
      p2: principal({ id: "p2" }),
    };
    const slots = [
      { slotId: "lun_cena", recipeId: "p1" },
      { slotId: "mar_cena", recipeId: "p2" },
    ];
    const a = sauce({ id: "a" });
    const b = sauce({ id: "b" });
    const result = pairSauces(slots, pool, {}, { sauceCatalog: [a, b], maxPerWeek: 2 });
    const ids = result.map((r) => r.sauceId).filter(Boolean);
    expect(new Set(ids).size).toBe(2);
  });
});

describe("sauceForRecipe / sauceOptionsForRecipe", () => {
  it("returns null for a recipe without canReceiveSauce", () => {
    expect(sauceForRecipe(principal({ canReceiveSauce: false }), [sauce()])).toBeNull();
  });

  it("returns the recipe's own sauceId when already set", () => {
    const result = sauceForRecipe(principal({ sauceId: "salsa1" }), [sauce({ id: "salsa1" })]);
    expect(result?.id).toBe("salsa1");
  });

  it("lists every compatible sauce for the picker", () => {
    const options = sauceOptionsForRecipe(principal(), [sauce({ id: "a" }), sauce({ id: "b", sauceCompat: ["marisco"] })]);
    expect(options.map((s) => s.id)).toEqual(["a"]);
  });
});
