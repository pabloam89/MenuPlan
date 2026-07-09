import { describe, it, expect } from "vitest";
import { buildUserMessage, buildGroupContext, generateGroupMenu, pickCatalogReplacement } from "./aiPlanner.js";
import { getCarbType } from "../utils/validateMenu.js";
import { recipeCatalogById } from "../data/recipeCatalog.js";

const SLOTS = [{ slotId: "lun_cena", mealType: "cena", mode: "casa", maxTime: 30 }];
const CONFIG = { targetKcal: 2000, freqs: {}, cookLevel: "normal", cookTime: {} };

describe("buildUserMessage pantry section", () => {
  it("omits the pantry section entirely when the user has no pantry", () => {
    const [, textBlock] = buildUserMessage([], SLOTS, CONFIG, {});
    expect(textBlock.text).not.toContain("INGREDIENTES QUE EL USUARIO YA TIENE EN CASA");
  });

  it("lists pantry ingredients and the secondary-preference instruction when present", () => {
    const [, textBlock] = buildUserMessage(
      [],
      SLOTS,
      CONFIG,
      {},
      [],
      ["pollo", "arroz", "tomate", "cebolla"],
    );
    expect(textBlock.text).toContain("INGREDIENTES QUE EL USUARIO YA TIENE EN CASA");
    expect(textBlock.text).toContain("- pollo");
    expect(textBlock.text).toContain("- arroz");
    expect(textBlock.text).toContain("- tomate");
    expect(textBlock.text).toContain("- cebolla");
    expect(textBlock.text).toContain("SECUNDARIA a todas las demás reglas");
    expect(textBlock.text).toContain("No fuerces recetas que no encajen");
  });
});

describe("buildGroupContext intolerances aggregation", () => {
  const group = { id: "g1", label: "Familia", memberIds: ["m1"] };

  function dataWith(member) {
    return { members: [{ id: "m1", age: 30, ...member }], groups: [group], schedule: {} };
  }

  it("passes through plain intolerances untouched", () => {
    const ctx = buildGroupContext(dataWith({ intolerances: ["lactosa_fina"] }), group);
    expect(ctx.filterOpts.intolerances).toEqual(["lactosa_fina"]);
  });

  it("adds alcohol_cocina automatically when embarazo is active", () => {
    const ctx = buildGroupContext(dataWith({ dietaryStates: ["embarazo"] }), group);
    expect(ctx.filterOpts.intolerances).toEqual(
      expect.arrayContaining(["embarazo", "alcohol_cocina"]),
    );
  });

  it("adds alcohol_cocina automatically when lactancia is active", () => {
    const ctx = buildGroupContext(dataWith({ dietaryStates: ["lactancia"] }), group);
    expect(ctx.filterOpts.intolerances).toEqual(
      expect.arrayContaining(["lactancia", "alcohol_cocina"]),
    );
  });

  it("does not add alcohol_cocina for unrelated intolerances", () => {
    const ctx = buildGroupContext(dataWith({ intolerances: ["fructosa"] }), group);
    expect(ctx.filterOpts.intolerances).toEqual(["fructosa"]);
  });

  it("never lets the user select alcohol_cocina directly (it's not a real dietaryState)", () => {
    const ctx = buildGroupContext(dataWith({}), group);
    expect(ctx.filterOpts.intolerances).toEqual([]);
  });
});

describe("buildGroupContext school menu avoidance (protein + carb)", () => {
  const group = { id: "g1", label: "Familia", memberIds: ["m1"] };

  function dataWithSchoolMenu(courses) {
    return {
      members: [{ id: "m1", age: 10 }],
      groups: [group],
      schedule: {},
      schoolMenus: { shared: {}, byMember: { m1: courses } },
    };
  }

  it("sets schoolCarbsToAvoid on the cena slot when the school served a matching carb base at comida", () => {
    const data = dataWithSchoolMenu({
      "Lun-Primero": "Arroz con tomate",
      "Lun-Segundo": "Merluza a la plancha",
    });
    const ctx = buildGroupContext(data, group);
    const cena = ctx.slots.find((s) => s.slotId === "lun_cena");
    expect(cena.schoolCarbsToAvoid).toEqual(["arroz"]);
  });

  it("does not derive schoolCarbsToAvoid from the postre course alone (e.g. 'Arroz con leche' is a dessert, not a carb-bearing course)", () => {
    const data = dataWithSchoolMenu({
      "Lun-Primero": "Ensalada mixta",
      "Lun-Segundo": "Pollo asado",
      "Lun-Postre": "Arroz con leche",
    });
    const ctx = buildGroupContext(data, group);
    const cena = ctx.slots.find((s) => s.slotId === "lun_cena");
    expect(cena.schoolCarbsToAvoid).toBeUndefined();
    // The protein course (Pollo asado) still correctly avoids "carne" — this
    // confirms the postre exclusion is carb-specific, not a general regression.
    expect(cena.schoolProteinsToAvoid).toEqual(["carne"]);
  });

  it("sets neither schoolProteinsToAvoid nor schoolCarbsToAvoid when there's no school menu data for that day", () => {
    const data = dataWithSchoolMenu({}); // nothing uploaded for Lun
    const ctx = buildGroupContext(data, group);
    const cena = ctx.slots.find((s) => s.slotId === "lun_cena");
    expect(cena.schoolProteinsToAvoid).toBeUndefined();
    expect(cena.schoolCarbsToAvoid).toBeUndefined();
  });
});

describe("pickCatalogReplacement respects school-menu avoidance", () => {
  // Real catalog stats (see audit): 101 cena-eligible recipes; 17 are
  // carne-group (pollo/pavo/cerdo/ternera) under the 30min weekday default,
  // 76 are not. This gives enough non-carne candidates that, absent the
  // school-avoidance guard, random selection would very likely (>99.999%
  // over 60 trials) pick a carne dish at least once.
  const group = { id: "g1", label: "Familia", memberIds: ["m1"] };

  function dataWithSchoolMenu(courses, extra = {}) {
    return {
      members: [{ id: "m1", age: 35 }],
      groups: [group],
      schedule: {},
      schoolMenus: { shared: {}, byMember: { m1: courses } },
      ...extra,
    };
  }

  function baseMenuPlan(recipeId = "carnes_002") {
    return { [group.id]: { "Lun-Cena": { recipeId, eaters: 2 } } };
  }

  it("never proposes a cena dish whose protein group matches what the school already served that day", () => {
    const data = dataWithSchoolMenu({
      "Lun-Primero": "Ensalada mixta",
      "Lun-Segundo": "Pollo asado",
    });
    const menuPlan = baseMenuPlan();

    for (let i = 0; i < 60; i++) {
      const result = pickCatalogReplacement(data, menuPlan, {
        groupId: group.id,
        day: "Lun",
        meal: "Cena",
        course: "main",
      });
      expect(result).toBeTruthy();
      const catalogRecipe = recipeCatalogById[result.recipeId] ?? recipeCatalogById[result.frontendRecipe.baseRecipeId];
      expect(["pollo", "pavo", "cerdo", "ternera"]).not.toContain(catalogRecipe.mainProtein);
    }
  });

  it("never proposes a cena dish whose carb base matches what the school already served that day", () => {
    const data = dataWithSchoolMenu(
      { "Lun-Primero": "Arroz con verduras", "Lun-Segundo": "Merluza al horno" },
      { timeWeekday: 60 }, // widen the pool so real arroz-base cena candidates are in range
    );
    const menuPlan = baseMenuPlan("__placeholder_not_in_catalog__");

    for (let i = 0; i < 150; i++) {
      const result = pickCatalogReplacement(data, menuPlan, {
        groupId: group.id,
        day: "Lun",
        meal: "Cena",
        course: "main",
      });
      expect(result).toBeTruthy();
      const catalogRecipe = recipeCatalogById[result.recipeId] ?? recipeCatalogById[result.frontendRecipe.baseRecipeId];
      expect(getCarbType(catalogRecipe)).not.toBe("arroz");
    }
  });

  it("does not apply school-cena avoidance to a comida slot replacement", () => {
    // Sanity check on scoping: schoolProteinsToAvoid/schoolCarbsToAvoid only
    // ever apply to cena (see buildGroupContext) — a comida replacement must
    // not be constrained by them.
    const data = dataWithSchoolMenu({
      "Lun-Primero": "Ensalada mixta",
      "Lun-Segundo": "Pollo asado",
    });
    const menuPlan = {
      [group.id]: {
        "Lun-Comida": { recipeId: "carnes_002", firstRecipeId: null, eaters: 2 },
      },
    };
    const result = pickCatalogReplacement(data, menuPlan, {
      groupId: group.id,
      day: "Lun",
      meal: "Comida",
      course: "main",
    });
    expect(result).toBeTruthy();
  });
});

describe("generateGroupMenu baby group", () => {
  // Baby groups skip the LLM entirely (generateBabyMenuDeterministic), so this
  // is safe to call directly without mocking callModel/network.
  const group = { id: "g1", label: "Bebé", memberIds: ["baby1"] };

  function babyData(memberOverrides) {
    return {
      members: [{ id: "baby1", age: 1, ...memberOverrides }],
      groups: [group],
      schedule: {},
    };
  }

  it("passes the group's intolerances through as `restrictions`, so hydration can adapt ingredients (e.g. lactose-free) for baby-only menus", async () => {
    const result = await generateGroupMenu(babyData({ intolerances: ["lactosa_fina"] }), group);
    expect(result.restrictions).toEqual(["lactosa_fina"]);
  });

  it("returns an empty warnings array for baby groups", async () => {
    const result = await generateGroupMenu(babyData({}), group);
    expect(result.warnings).toEqual([]);
  });
});
