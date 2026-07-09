import { describe, it, expect } from "vitest";
import { enforceFixedDishes } from "./fixedDishes.js";
import { recipeCatalogById } from "../data/recipeCatalog.js";

// carnes_023 "Escalopines de ternera al limón" carries a real declared
// "gluten" allergen in the bundled catalog — used as the "unsafe fallback
// candidate" fixture below.
const UNSAFE_ID = "carnes_023";

const CENA_SLOTS = ["lun_cena", "mar_cena", "mie_cena", "jue_cena", "vie_cena", "sab_cena", "dom_cena"];

function baseAssignments() {
  return CENA_SLOTS.map((slotId) => ({ slotId, recipeId: "huevos_001" }));
}

describe("enforceFixedDishes hard-safety gate on the full-catalog fallback", () => {
  it("refuses to inject a fixed dish that violates the group's allergy, and warns instead", () => {
    // Empty pool simulates: carnes_023 was excluded from the filtered pool by
    // the group's Gluten allergy.
    const poolById = {};
    const fixedDishesRaw = [{ name: "Escalopines", catalogId: UNSAFE_ID, timesPerWeek: 1, meals: ["Cena"] }];
    const { slotAssignments, warnings } = enforceFixedDishes(
      baseAssignments(),
      fixedDishesRaw,
      poolById,
      { allergies: ["Gluten"] },
    );
    expect(slotAssignments.some((s) => s.recipeId === UNSAFE_ID)).toBe(false);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("Escalopines");
  });

  it("still falls back to the full catalog when the dish is outside the pool for a non-safety reason", () => {
    const poolById = {}; // e.g. dropped out of a tight cook-time budget, no allergies active
    const fixedDishesRaw = [{ name: "Escalopines", catalogId: UNSAFE_ID, timesPerWeek: 1, meals: ["Cena"] }];
    const { slotAssignments, warnings } = enforceFixedDishes(
      baseAssignments(),
      fixedDishesRaw,
      poolById,
      {},
    );
    expect(slotAssignments.some((s) => s.recipeId === UNSAFE_ID)).toBe(true);
    expect(warnings).toEqual([]);
  });

  it("injects normally when the fixed dish is already inside the filtered pool (no fallback, no re-check)", () => {
    const poolById = { [UNSAFE_ID]: recipeCatalogById[UNSAFE_ID] };
    const fixedDishesRaw = [{ name: "Escalopines", catalogId: UNSAFE_ID, timesPerWeek: 1, meals: ["Cena"] }];
    const { slotAssignments, warnings } = enforceFixedDishes(
      baseAssignments(),
      fixedDishesRaw,
      poolById,
      { allergies: ["Gluten"] },
    );
    expect(slotAssignments.some((s) => s.recipeId === UNSAFE_ID)).toBe(true);
    expect(warnings).toEqual([]);
  });

  it("applies the same safety gate to name-matched fixed dishes (no catalogId)", () => {
    const poolById = {};
    const fixedDishesRaw = [
      { name: "Escalopines de ternera al limón", timesPerWeek: 1, meals: ["Cena"] },
    ];
    const { slotAssignments, warnings } = enforceFixedDishes(
      baseAssignments(),
      fixedDishesRaw,
      poolById,
      { allergies: ["Gluten"] },
    );
    expect(slotAssignments.some((s) => s.recipeId === UNSAFE_ID)).toBe(false);
    expect(warnings).toHaveLength(1);
  });

  it("returns an empty warnings array and unchanged assignments when there are no fixed dishes", () => {
    const { slotAssignments, warnings } = enforceFixedDishes(baseAssignments(), [], {}, {});
    expect(warnings).toEqual([]);
    expect(slotAssignments).toEqual(baseAssignments());
  });
});
