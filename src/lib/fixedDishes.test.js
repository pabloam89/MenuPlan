import { describe, it, expect } from "vitest";
import { enforceFixedDishes } from "./fixedDishes.js";
import { recipeCatalogById } from "../data/recipeCatalog.js";

// carnes_023 "Escalopines de ternera al limón" carries a real declared
// "gluten" allergen in the bundled catalog — used as the "unsafe fallback
// candidate" fixture below.
const UNSAFE_ID = "carnes_023";

const CENA_SLOTS = ["lun_cena", "mar_cena", "mie_cena", "jue_cena", "vie_cena", "sab_cena", "dom_cena"];
const DAYS = ["lun", "mar", "mie", "jue", "vie", "sab", "dom"];

function baseAssignments() {
  return CENA_SLOTS.map((slotId) => ({ slotId, recipeId: "huevos_001" }));
}

// "Ensalada mixta" (mainProtein none) / "Pechugas de pollo a la plancha"
// (mainProtein pollo) — generic filler for a normal two-course comida.
function comidaAssignments({ singleDishDays = [] } = {}) {
  const out = [];
  for (const day of DAYS) {
    out.push({ slotId: `${day}_comida_1`, recipeId: "ensaladas_verduras_001" });
    if (!singleDishDays.includes(day)) {
      out.push({ slotId: `${day}_comida_2`, recipeId: "carnes_002" });
    }
  }
  return out;
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

describe("enforceFixedDishes never force-places a plato_unico-only fixed dish next to an unrelated course", () => {
  // "Arroz al horno" — mealRole: ["plato_unico"] only, no "primero"/"segundo".
  const PLATO_UNICO_ID = "pasta_arroces_004";

  function poolWithPlatoUnico() {
    return {
      [PLATO_UNICO_ID]: recipeCatalogById[PLATO_UNICO_ID],
      ensaladas_verduras_001: recipeCatalogById.ensaladas_verduras_001,
      carnes_002: recipeCatalogById.carnes_002,
    };
  }

  it("does not place it when every day is two-course structured (no single-dish day exists)", () => {
    // Bug this guards against: slotPositionForRecipe used to route a
    // plato_unico-only dish to "2" (segundo), force-placing it alongside an
    // unrelated primero every two-course day — a tester reported exactly
    // this: "Ensalada de lentejas" (primero) + "Arroz al horno" (forced into
    // "segundo"), both meant to be a complete dish on their own.
    const fixedDishesRaw = [
      { name: "Arroz al horno", catalogId: PLATO_UNICO_ID, timesPerWeek: 1, meals: ["Comida"] },
    ];
    const original = comidaAssignments();
    const { slotAssignments } = enforceFixedDishes(original, fixedDishesRaw, poolWithPlatoUnico(), {});
    expect(slotAssignments.some((s) => s.recipeId === PLATO_UNICO_ID)).toBe(false);
    expect(slotAssignments).toEqual(original);
  });

  it("places it on a day already structured as a single dish, leaving two-course days untouched", () => {
    const fixedDishesRaw = [
      { name: "Arroz al horno", catalogId: PLATO_UNICO_ID, timesPerWeek: 1, meals: ["Comida"] },
    ];
    const original = comidaAssignments({ singleDishDays: ["dom"] });
    const { slotAssignments, warnings } = enforceFixedDishes(original, fixedDishesRaw, poolWithPlatoUnico(), {});
    expect(slotAssignments.find((s) => s.slotId === "dom_comida_1")?.recipeId).toBe(PLATO_UNICO_ID);
    const otherDays = slotAssignments.filter((s) => !s.slotId.startsWith("dom_"));
    const originalOtherDays = original.filter((s) => !s.slotId.startsWith("dom_"));
    expect(otherDays).toEqual(originalOtherDays);
    expect(warnings).toEqual([]);
  });
});

describe("enforceFixedDishes avoids a same-comida protein clash with the sibling course (rule 3b)", () => {
  // "Huevos fritos con puntillas" — segundo, cena, mainProtein huevo. (NOT
  // "Huevos rotos con jamón" — a tester correctly pointed out that one is
  // heavy/complete enough to be plato_unico only; its mealRole no longer
  // includes "segundo", see the recipes/huevos.json data fix.)
  const HUEVOS_SEGUNDO_ID = "huevos_007";
  // "Huevos cocidos con ensalada" — primero, mainProtein huevo (same protein).
  const HUEVOS_ENSALADA_ID = "huevos_014";

  function poolWithHuevos() {
    return {
      [HUEVOS_SEGUNDO_ID]: recipeCatalogById[HUEVOS_SEGUNDO_ID],
      [HUEVOS_ENSALADA_ID]: recipeCatalogById[HUEVOS_ENSALADA_ID],
      ensaladas_verduras_001: recipeCatalogById.ensaladas_verduras_001,
      carnes_002: recipeCatalogById.carnes_002,
    };
  }

  function comidaAssignmentsWithPrimeros(primeroByDay) {
    const out = [];
    for (const day of DAYS) {
      out.push({ slotId: `${day}_comida_1`, recipeId: primeroByDay[day] ?? "ensaladas_verduras_001" });
      out.push({ slotId: `${day}_comida_2`, recipeId: "carnes_002" });
    }
    return out;
  }

  it("prefers a day whose primero doesn't share the fixed dish's protein", () => {
    // Bug this guards against: a tester reported two egg dishes (primero +
    // segundo, fixed dish) landing in the same comida — enforceFixedDishes
    // force-placed the fixed dish without ever checking the sibling slot it
    // was about to sit next to.
    const assignments = comidaAssignmentsWithPrimeros({ lun: HUEVOS_ENSALADA_ID });
    const fixedDishesRaw = [
      { name: "Huevos fritos con puntillas", catalogId: HUEVOS_SEGUNDO_ID, timesPerWeek: 1, meals: ["Comida"] },
    ];
    const { slotAssignments, warnings } = enforceFixedDishes(assignments, fixedDishesRaw, poolWithHuevos(), {});
    const placement = slotAssignments.find((s) => s.recipeId === HUEVOS_SEGUNDO_ID);
    expect(placement).toBeTruthy();
    expect(placement.slotId).not.toBe("lun_comida_2");
    expect(warnings).toEqual([]);
  });

  it("places it anyway (with a warning) when every day's primero shares the protein", () => {
    const allEggPrimeros = Object.fromEntries(DAYS.map((d) => [d, HUEVOS_ENSALADA_ID]));
    const assignments = comidaAssignmentsWithPrimeros(allEggPrimeros);
    const fixedDishesRaw = [
      { name: "Huevos fritos con puntillas", catalogId: HUEVOS_SEGUNDO_ID, timesPerWeek: 1, meals: ["Comida"] },
    ];
    const { slotAssignments, warnings } = enforceFixedDishes(assignments, fixedDishesRaw, poolWithHuevos(), {});
    expect(slotAssignments.some((s) => s.recipeId === HUEVOS_SEGUNDO_ID)).toBe(true);
    expect(warnings.some((w) => w.includes("Huevos fritos con puntillas"))).toBe(true);
  });
});

describe("recipe data: Huevos rotos con jamón is plato_unico only, not a segundo", () => {
  it("no longer accepts a comida_2 (segundo) slot", () => {
    // Tester correction: this dish (fried eggs + fried potatoes + ham,
    // 482kcal, already catalogued as type "completo") is heavy/complete
    // enough to stand alone, the same category as "Arroz al horno" earlier —
    // pairing it with a separate primero doesn't make sense.
    const recipe = recipeCatalogById.huevos_003;
    expect(recipe.mealRole).toEqual(["cena", "plato_unico"]);
    expect(recipe.mealRole).not.toContain("segundo");
  });
});
