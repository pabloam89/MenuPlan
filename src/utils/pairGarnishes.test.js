import { describe, it, expect } from "vitest";
import { pairGarnishes } from "./pairGarnishes.js";

function garnish(overrides) {
  return {
    id: "safe1",
    name: "Guarnición segura",
    shortName: "guarnicion segura",
    time: 10,
    ingredients: [{ name: "Aceite de oliva" }],
    ...overrides,
  };
}

function principal(overrides) {
  return {
    id: "p1",
    type: "principal",
    name: "Plato principal",
    ingredients: [{ name: "Pollo" }],
    ...overrides,
  };
}

describe("pairGarnishes", () => {
  it("only assigns a garnish from the safe list passed in", () => {
    const pool = { p1: principal() };
    const slots = [{ slotId: "lun_cena", recipeId: "p1" }];
    const safe = [garnish({ id: "safe1" })];
    const result = pairGarnishes(slots, pool, {}, safe);
    expect(result[0].garnishId).toBe("safe1");
  });

  it("leaves the slot without a garnish when the safe list is empty, never falling back to the raw catalog", () => {
    const pool = { p1: principal() };
    const slots = [{ slotId: "lun_cena", recipeId: "p1" }];
    const result = pairGarnishes(slots, pool, {}, []);
    expect(result[0].garnishId).toBeUndefined();
  });

  it("does not pair a garnish for a non-principal recipe", () => {
    const pool = { p1: { ...principal(), type: "guarnicion" } };
    const slots = [{ slotId: "lun_cena", recipeId: "p1" }];
    const result = pairGarnishes(slots, pool, {}, [garnish()]);
    expect(result[0].garnishId).toBeUndefined();
  });

  it("does not pair a garnish for comida_1 (primero) slots", () => {
    const pool = { p1: principal() };
    const slots = [{ slotId: "lun_comida_1", recipeId: "p1" }];
    const result = pairGarnishes(slots, pool, {}, [garnish()]);
    expect(result[0].garnishId).toBeUndefined();
  });

  it("respects the cena time cap even within the safe list", () => {
    const pool = { p1: principal() };
    const slots = [{ slotId: "lun_cena", recipeId: "p1" }];
    const safe = [garnish({ id: "slow", time: 30 })];
    const result = pairGarnishes(slots, pool, {}, safe);
    expect(result[0].garnishId).toBeUndefined();
  });

  it("a user-pinned garnish wins even when excluded from the safe list (explicit choice overrides automatic filtering)", () => {
    // guarniciones_003 "Puré de patatas" carries a real declared "lactosa"
    // allergen in the bundled catalog — simulating a pin made before this
    // group had a dairy allergy, or a deliberate exception the user wants.
    const pool = { p1: principal() };
    const slots = [{ slotId: "lun_cena", recipeId: "p1" }];
    const result = pairGarnishes(slots, pool, { p1: "guarniciones_003" }, []);
    expect(result[0].garnishId).toBe("guarniciones_003");
  });
});
