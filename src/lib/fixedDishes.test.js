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

describe("enforceFixedDishes respects the school menu on cena placements (rules 4 / 4b)", () => {
  // Synthetic dish that carries both a "carne" protein group AND an "arroz"
  // carb base — enough to collide with either a schoolProteinsToAvoid or a
  // schoolCarbsToAvoid entry.
  const FIXED_RECIPE = {
    id: "fake_pollo_arroz",
    name: "Pollo con arroz",
    category: "carnes",
    mainProtein: "pollo",
    mealRole: ["cena"],
    ingredients: [{ name: "Arroz" }, { name: "Pollo" }],
    tupperFriendly: true,
    healthFlags: [],
  };

  function poolWithFixedRecipe() {
    return { [FIXED_RECIPE.id]: FIXED_RECIPE, huevos_001: recipeCatalogById.huevos_001 };
  }

  it("avoids injecting a fixed dish into a cena day whose school menu already served that carb base, when a conflict-free day is available", () => {
    // Bug this guards against: enforceFixedDishes runs AFTER applyFallback and
    // the 3b safety net (see aiPlanner.js), so nothing downstream re-validates
    // rules 4/4b once a fixed dish is force-placed. Without slotsContext wired
    // through, a fixed "Pollo con arroz" dish could land on mar/jue even
    // though the school already served arroz those exact days.
    const fixedDishesRaw = [
      { name: "Pollo con arroz", catalogId: FIXED_RECIPE.id, timesPerWeek: 2, meals: ["Cena"] },
    ];
    const slotsContext = [
      { slotId: "mar_cena", schoolCarbsToAvoid: ["arroz"] },
      { slotId: "jue_cena", schoolCarbsToAvoid: ["arroz"] },
    ];
    const { slotAssignments, warnings } = enforceFixedDishes(
      baseAssignments(),
      fixedDishesRaw,
      poolWithFixedRecipe(),
      {},
      slotsContext,
    );
    const daysWithFixedDish = slotAssignments
      .filter((s) => s.recipeId === FIXED_RECIPE.id)
      .map((s) => s.slotId);
    expect(daysWithFixedDish).toHaveLength(2);
    expect(daysWithFixedDish).not.toContain("mar_cena");
    expect(daysWithFixedDish).not.toContain("jue_cena");
    expect(warnings).toEqual([]);
  });

  it("avoids a school-avoided protein group on cena placements the same way", () => {
    const fixedDishesRaw = [
      { name: "Pollo con arroz", catalogId: FIXED_RECIPE.id, timesPerWeek: 1, meals: ["Cena"] },
    ];
    const slotsContext = CENA_SLOTS.filter((s) => s !== "vie_cena").map((slotId) => ({
      slotId,
      schoolProteinsToAvoid: ["carne"],
    }));
    const { slotAssignments, warnings } = enforceFixedDishes(
      baseAssignments(),
      fixedDishesRaw,
      poolWithFixedRecipe(),
      {},
      slotsContext,
    );
    const daysWithFixedDish = slotAssignments
      .filter((s) => s.recipeId === FIXED_RECIPE.id)
      .map((s) => s.slotId);
    expect(daysWithFixedDish).toEqual(["vie_cena"]);
    expect(warnings).toEqual([]);
  });

  it("falls back to a school-conflicting day (with a warning) rather than under-placing the fixed dish", () => {
    // Every cena day conflicts — the "appears exactly timesPerWeek times" hard
    // guarantee wins, but the user must be told why.
    const fixedDishesRaw = [
      { name: "Pollo con arroz", catalogId: FIXED_RECIPE.id, timesPerWeek: 3, meals: ["Cena"] },
    ];
    const slotsContext = CENA_SLOTS.map((slotId) => ({ slotId, schoolCarbsToAvoid: ["arroz"] }));
    const { slotAssignments, warnings } = enforceFixedDishes(
      baseAssignments(),
      fixedDishesRaw,
      poolWithFixedRecipe(),
      {},
      slotsContext,
    );
    const daysWithFixedDish = slotAssignments.filter((s) => s.recipeId === FIXED_RECIPE.id);
    expect(daysWithFixedDish).toHaveLength(3);
    expect(warnings.some((w) => w.includes("Pollo con arroz"))).toBe(true);
  });

  it("is backward compatible when slotsContext is omitted (no crash, no filtering)", () => {
    const fixedDishesRaw = [
      { name: "Pollo con arroz", catalogId: FIXED_RECIPE.id, timesPerWeek: 1, meals: ["Cena"] },
    ];
    const { slotAssignments, warnings } = enforceFixedDishes(
      baseAssignments(),
      fixedDishesRaw,
      poolWithFixedRecipe(),
      {},
    );
    expect(slotAssignments.some((s) => s.recipeId === FIXED_RECIPE.id)).toBe(true);
    expect(warnings).toEqual([]);
  });
});
