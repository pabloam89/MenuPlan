import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import {
  buildUserMessage,
  buildGroupContext,
  generateGroupMenu,
  generateMenuWithAI,
  AIPlannerError,
  applyGarnishToRecipe,
  pickCatalogReplacement,
  selectReplacementCandidates,
  callModel,
  poolForWeek,
} from "./aiPlanner.js";
import { getCarbType, validateMenu, splitAchievableFreqs, FREQ_KEY_MATCHERS } from "../utils/validateMenu.js";
import { recipeCatalogById } from "../data/recipeCatalog.js";
import { filterRecipes } from "../utils/filterRecipes.js";

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

describe("selectReplacementCandidates (single-dish swap)", () => {
  // Covers the manual "swap this dish" path (pickCatalogReplacement), which
  // picks from a much smaller pool than the full weekly generator and is the
  // one place a recipeId can end up duplicated in the week — validateMenu's
  // rule 6 (recipeId_repetido) never runs on this path.
  const matchesAll = () => true;

  it("prefers unused candidates and never reports a duplicate when some exist", () => {
    const pool = [{ id: "a" }, { id: "b" }];
    const { candidates, reusedDuplicate } = selectReplacementCandidates(
      pool,
      matchesAll,
      new Set(["a"]), // "a" already used elsewhere this week
      "a", // slot being replaced currently holds "a"
    );
    expect(candidates.map((r) => r.id)).toEqual(["b"]);
    expect(reusedDuplicate).toBe(false);
  });

  it("falls back to an already-used recipe (and flags it) when no unused candidate fits", () => {
    // Every structurally-fitting recipe other than the one being replaced is
    // already placed somewhere else in the week.
    const pool = [{ id: "a" }, { id: "b" }];
    const { candidates, reusedDuplicate } = selectReplacementCandidates(
      pool,
      matchesAll,
      new Set(["a", "b"]), // both already used
      "a", // currently in this slot
    );
    expect(candidates.map((r) => r.id)).toEqual(["b"]);
    expect(reusedDuplicate).toBe(true);
  });

  it("never proposes the exact dish being replaced as its own replacement", () => {
    const pool = [{ id: "a" }];
    const { candidates, reusedDuplicate } = selectReplacementCandidates(
      pool,
      matchesAll,
      new Set(["a"]),
      "a",
    );
    expect(candidates).toEqual([]);
    expect(reusedDuplicate).toBe(false);
  });

  it("does not claim a duplicate happened when nothing fits even after relaxing", () => {
    const noMatch = () => false;
    const pool = [{ id: "a" }, { id: "b" }];
    const { candidates, reusedDuplicate } = selectReplacementCandidates(
      pool,
      noMatch,
      new Set(["a"]),
      "a",
    );
    expect(candidates).toEqual([]);
    expect(reusedDuplicate).toBe(false);
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

describe("applyGarnishToRecipe adaptations", () => {
  function baseFr() {
    return {
      id: "r1", name: "Pollo asado", time: 30, kcal: 400,
      macros: { protein: 30, carbs: 10, fat: 15 },
      ingredients: [{ id: "pollo", name: "Pollo", category: "carnes", qty: 200, unit: "g" }],
    };
  }

  function dairyGarnish() {
    return {
      id: "g1", shortName: "puré", time: 10, baseServings: 2,
      kcal: 200, protein_g: 4, carbs_g: 30, fat_g: 6,
      ingredients: [
        { name: "Leche", amount: 100, unit: "ml" },
        { name: "Patata", amount: 300, unit: "g" },
      ],
    };
  }

  it("renames a lactose ingredient in the merged garnish and notes the adaptation, instead of the garnish having been dropped", () => {
    const fr = applyGarnishToRecipe(baseFr(), dairyGarnish(), 2, ["lactosa_fina"]);
    const milk = fr.ingredients.find((i) => i.name.toLowerCase().includes("leche"));
    expect(milk.name.toLowerCase()).toContain("sin lactosa");
    expect(fr.adaptations).toEqual(
      expect.arrayContaining([expect.objectContaining({ from: "Leche", label: "sin lactosa" })]),
    );
  });

  it("leaves garnish ingredients untouched when the restriction isn't active", () => {
    const fr = applyGarnishToRecipe(baseFr(), dairyGarnish(), 2, []);
    expect(fr.ingredients.some((i) => i.name === "Leche")).toBe(true);
    expect(fr.adaptations).toBeUndefined();
  });
});

describe("pool exhaustion from MULTIPLE members' restrictions (filterRecipes error propagation)", () => {
  // Three kids, each contributing a DIFFERENT allergy/intolerance. None of
  // these alone would exhaust the 244-recipe catalog (see the "one member
  // only" contrast test below) — it's specifically the UNION across several
  // children (buildGroupContext's flatMap) that pushes the filtered pool
  // under filterRecipes.js's minRecipes floor. hasKids + a 30-min weekday
  // budget + cookLevel "basic" mirror a realistic family setup rather than an
  // artificial edge case.
  const group = { id: "g1", label: "Niños", memberIds: ["kid1", "kid2", "kid3"] };
  const threeKidsData = {
    members: [
      { id: "kid1", age: 8, allergies: ["Gluten"], intolerances: ["fructosa"] },
      { id: "kid2", age: 6, allergies: ["Leche"], intolerances: ["sorbitol"] },
      { id: "kid3", age: 10, allergies: ["Huevos", "Pescado"] },
    ],
    groups: [group],
    schedule: {},
    timeWeekday: 30,
    timeWeekend: 30,
    cookLevel: "basic",
  };

  it("generateGroupMenu throws an AIPlannerError carrying filterRecipes' pool-exhaustion message", async () => {
    await expect(generateGroupMenu(threeKidsData, group)).rejects.toBeInstanceOf(AIPlannerError);
    await expect(generateGroupMenu(threeKidsData, group)).rejects.toThrow(
      /Solo quedan \d+ recetas tras filtrar/,
    );
  });

  it("does NOT exhaust the pool for just one of the three kids — the exhaustion is genuinely cumulative, not from a single member's restrictions", () => {
    // Checked via filterRecipes directly (not generateGroupMenu) so this stays
    // a pure/offline assertion: a non-exhausted pool would otherwise proceed
    // to call the LLM, which this test suite never mocks.
    const oneKidGroup = { id: "g1", label: "Niños", memberIds: ["kid1"] };
    const oneKidData = { ...threeKidsData, members: [threeKidsData.members[0]], groups: [oneKidGroup] };
    const ctx = buildGroupContext(oneKidData, oneKidGroup);
    const { error } = filterRecipes(ctx.filterOpts);
    expect(error).toBeNull();
  });

  it("generateMenuWithAI (the function App.jsx actually calls) also rejects end-to-end for the same multi-restriction group", async () => {
    await expect(generateMenuWithAI(threeKidsData)).rejects.toBeInstanceOf(AIPlannerError);
    await expect(generateMenuWithAI(threeKidsData)).rejects.toThrow(
      /Solo quedan \d+ recetas tras filtrar/,
    );
  });
});

// ── Multi-domain integration: rules that are only tested in isolation      ──
// elsewhere in this file can still interact when generateGroupMenu runs the
// FULL pipeline (LLM -> retries -> applyFallback -> 3b -> enforceFixedDishes
// -> enforceSlotTypes -> pairGarnishes). These tests mock the LLM to always
// return a deliberately non-compliant answer (so the deterministic machinery
// — not the model — has to do all the work) and assert the FINAL output
// satisfies every active domain simultaneously, via a real validateMenu()
// call on the result. A test that only checked "the freq target is met" or
// only "the school menu is respected" could pass while silently violating
// the other — see the applyFallback/enforceFixedDishes unit tests above for
// the underlying bugs this exercises.
describe("generateGroupMenu: multiple rule domains active at once", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function mockLLMAlwaysReturns(slots) {
    const text = JSON.stringify({ slots });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ content: [{ text }] }),
      }),
    );
  }

  it("satisfies an allergy, a weekly pescado CAP, and the school-menu carb/protein avoidance together — not just whichever rule ran last", async () => {
    // freqs are maximums (see validateMenu.js rule 11): "pescado: 1" means
    // AT MOST one pescado dish all week, not "at least one".
    const group = { id: "g1", label: "Familia", memberIds: ["m1"], days: 2 };
    const data = {
      members: [{ id: "m1", age: 35, allergies: ["Gluten"] }],
      groups: [group],
      schedule: {},
      timeWeekday: 90,
      timeWeekend: 90,
      schoolMenus: {
        shared: {},
        byMember: {
          m1: { "Lun-Primero": "Arroz con verduras", "Lun-Segundo": "Merluza a la plancha" },
        },
      },
      freqs: { pescado: 1 },
    };

    const ctx = buildGroupContext(data, group);
    const { recipes: pool } = filterRecipes(ctx.filterOpts);
    expect(pool.length).toBeGreaterThan(10);

    // Real, gluten-safe candidates, deliberately chosen so the *initial* LLM
    // answer is wrong on two different domains at once: TWO pescado segundos
    // (freq cap of 1 exceeded) and an arroz-based, non-pescado cena on the
    // exact day the school already served arroz+pescado (school_carb_conflict,
    // and would-be school_protein_conflict if a naive pescado-cap fix dumped
    // the excess fish into that same cena instead of respecting the avoidance).
    const usedIds = new Set();
    const pick = (pred) => {
      const r = pool.find((c) => pred(c) && !usedIds.has(c.id));
      expect(r, `no pool candidate matched a fixture predicate`).toBeTruthy();
      usedIds.add(r.id);
      return r;
    };
    const primero = () =>
      pick((r) => r.mealRole.includes("primero") && !r.mealRole.includes("plato_unico") && getCarbType(r) !== "arroz");
    const segundoPescado = () =>
      pick(
        (r) =>
          r.mealRole.includes("segundo") &&
          (r.category === "pescados" || ["pescado_blanco", "pescado_azul", "marisco"].includes(r.mainProtein)),
      );
    const cenaArrozNoPescado = () =>
      pick(
        (r) =>
          r.mealRole.includes("cena") &&
          r.category !== "legumbres" &&
          getCarbType(r) === "arroz" &&
          !["pescado_blanco", "pescado_azul", "marisco"].includes(r.mainProtein),
      );
    const cenaNoPescadoNoArroz = () =>
      pick(
        (r) =>
          r.mealRole.includes("cena") &&
          r.category !== "legumbres" &&
          getCarbType(r) !== "arroz" &&
          !["pescado_blanco", "pescado_azul", "marisco"].includes(r.mainProtein),
      );

    const lunP = primero("lun");
    const lunS = segundoPescado(); // 1st pescado — within cap on its own
    const lunC = cenaArrozNoPescado(); // the deliberately-wrong pick for lun_cena
    const marP = primero("mar");
    const marS = segundoPescado(); // 2nd pescado — pushes the week over the cap of 1
    const marC = cenaNoPescadoNoArroz();

    mockLLMAlwaysReturns([
      { slotId: "lun_comida_1", recipeId: lunP.id },
      { slotId: "lun_comida_2", recipeId: lunS.id },
      { slotId: "lun_cena", recipeId: lunC.id },
      { slotId: "mar_comida_1", recipeId: marP.id },
      { slotId: "mar_comida_2", recipeId: marS.id },
      { slotId: "mar_cena", recipeId: marC.id },
    ]);

    const result = await generateGroupMenu(data, group);
    expect(result.slotAssignments).toHaveLength(6);

    // Nothing in the final menu carries the allergen (guaranteed upstream by
    // filterRecipes, but assert it explicitly since it's one of the three
    // domains under test).
    for (const { recipeId } of result.slotAssignments) {
      const r = recipeCatalogById[recipeId];
      expect((r.allergens ?? []).some((a) => /gluten/i.test(a))).toBe(false);
    }

    // The strongest assertion: re-running validateMenu on the FINAL output
    // (with the same achievable freqs generateGroupMenu itself computed) must
    // report zero violations — every domain holds simultaneously: the pescado
    // cap, the allergen, and the school-avoidance on lun_cena.
    const { achievable } = splitAchievableFreqs(pool, data.freqs);
    const finalCheck = validateMenu(result.slotAssignments, pool, ctx.slots, [], achievable);
    expect(finalCheck.violations).toEqual([]);
    expect(finalCheck.valid).toBe(true);

    const lunCenaFinal = result.slotAssignments.find((s) => s.slotId === "lun_cena");
    const lunCenaRecipe = recipeCatalogById[lunCenaFinal.recipeId];
    expect(getCarbType(lunCenaRecipe)).not.toBe("arroz");
    expect(["pescado_blanco", "pescado_azul", "marisco"]).not.toContain(lunCenaRecipe.mainProtein);

    // The core of the max-semantics fix: the pescado CAP is never exceeded in
    // the final menu, even though the (deliberately wrong) initial LLM answer
    // went over it.
    if (achievable.pescado != null) {
      const pescadoCount = result.slotAssignments.filter(
        (s) => recipeCatalogById[s.recipeId] && FREQ_KEY_MATCHERS.pescado(recipeCatalogById[s.recipeId]),
      ).length;
      expect(pescadoCount).toBeLessThanOrEqual(achievable.pescado);
    }
  });

  it("keeps a fixed dish's forced weekly placements off the exact cena day the school already served its protein — while still honoring an active allergy", async () => {
    const group = { id: "g1", label: "Familia", memberIds: ["m1"], days: 4 };
    // A pollo/cerdo/ternera-family cena dish — deliberately carne-based, so
    // it collides with schoolProteinsToAvoid ["carne"] on the one day (lun)
    // the school served pollo, exercising enforceFixedDishes' school-avoidance
    // carve-out end to end (not just the fixedDishes.test.js unit tests).
    const fixedRecipe = recipeCatalogById.carnes_002;
    expect(fixedRecipe, "fixture depends on carnes_002 existing in the catalog").toBeTruthy();
    expect(fixedRecipe.mealRole).toContain("cena");
    expect(["pollo", "pavo", "cerdo", "ternera"]).toContain(fixedRecipe.mainProtein);

    const data = {
      members: [{ id: "m1", age: 35, allergies: ["Marisco"] }],
      groups: [group],
      schedule: {},
      timeWeekday: 90,
      timeWeekend: 90,
      schoolMenus: {
        shared: {},
        byMember: {
          m1: { "Lun-Primero": "Ensalada mixta", "Lun-Segundo": "Pollo asado" },
        },
      },
      // timesPerWeek 2 with 3 non-conflicting cena days (mar/mie/jue) free —
      // the avoidance carve-out has enough room to satisfy the guarantee
      // without ever falling back onto the conflicting lun_cena slot.
      fixedDishes: [
        { name: fixedRecipe.name, catalogId: fixedRecipe.id, timesPerWeek: 2, meals: ["Cena"] },
      ],
    };

    const ctx = buildGroupContext(data, group);
    const { recipes: pool } = filterRecipes(ctx.filterOpts);
    expect(pool.length).toBeGreaterThan(10);
    expect(ctx.slots.find((s) => s.slotId === "lun_cena")?.schoolProteinsToAvoid).toEqual(["carne"]);

    // A wrong-but-non-repetitive initial LLM answer: distinct, non-carne
    // dishes per slot, so the only violations validateMenu should find are
    // the ones this test deliberately set up (fixed-dish placement + school
    // avoidance), not incidental noise from e.g. recipeId_repetido cascades.
    const notCarneOrFixed = (r) =>
      r.id !== fixedRecipe.id && !["pollo", "pavo", "cerdo", "ternera"].includes(r.mainProtein);
    const used = new Set([fixedRecipe.id]);
    const pickDistinct = (pred) => {
      const r = pool.find((c) => pred(c) && notCarneOrFixed(c) && !used.has(c.id));
      expect(r, "no distinct pool candidate matched a fixture predicate").toBeTruthy();
      used.add(r.id);
      return r;
    };
    mockLLMAlwaysReturns(
      ["lun", "mar", "mie", "jue"].flatMap((d) => [
        {
          slotId: `${d}_comida_1`,
          recipeId: pickDistinct((r) => r.mealRole.includes("primero") && !r.mealRole.includes("plato_unico")).id,
        },
        { slotId: `${d}_comida_2`, recipeId: pickDistinct((r) => r.mealRole.includes("segundo")).id },
        { slotId: `${d}_cena`, recipeId: pickDistinct((r) => r.mealRole.includes("cena")).id },
      ]),
    );

    const result = await generateGroupMenu(data, group);

    // Allergy domain: nothing in the final menu carries a marisco allergen.
    for (const { recipeId } of result.slotAssignments) {
      const r = recipeCatalogById[recipeId];
      expect((r.allergens ?? []).some((a) => /marisco/i.test(a))).toBe(false);
    }

    // Fixed-dish domain: the dish appears exactly timesPerWeek (2) times
    // among the cena slots it was fixed for.
    const fixedCenaPlacements = result.slotAssignments.filter(
      (s) => s.slotId.endsWith("_cena") && s.recipeId === fixedRecipe.id,
    );
    expect(fixedCenaPlacements).toHaveLength(2);

    // School domain: the fixed dish must never land on lun_cena, since that's
    // exactly the day/slot the school's "carne" course already covered.
    const lunCena = result.slotAssignments.find((s) => s.slotId === "lun_cena");
    expect(lunCena.recipeId).not.toBe(fixedRecipe.id);

    // Re-validating the whole final menu confirms every domain holds
    // simultaneously — not just the fixed-dish guarantee in isolation.
    // recipeId_repetido is expected and excluded here: a fixed dish
    // appearing timesPerWeek > 1 times is an intentional, sanctioned repeat
    // that validateMenu's generic rule 6 has no way to distinguish from an
    // accidental one.
    // recipeId_repetido (sanctioned fixed-dish repeat) and the soft style
    // backstops (dos_fritos_seguidos / dos_cuchara_mismo_dia) are best-effort
    // and can survive the post-enforcement steps as warnings; they aren't the
    // domains under test here, so they're excluded like recipeId_repetido.
    const TOLERATED = new Set([
      "recipeId_repetido",
      "dos_fritos_seguidos",
      "dos_cuchara_mismo_dia",
    ]);
    const finalCheck = validateMenu(result.slotAssignments, pool, ctx.slots, [], {});
    const unexpected = finalCheck.violations.filter((v) => !TOLERATED.has(v.rule));
    expect(unexpected).toEqual([]);
  });
});

// Regression test for a bug where planExtraMealsForGroup called
// isBabyMenuGroup(group) with only one argument (missing `data.members`),
// which crashed with "Cannot read properties of undefined (reading 'filter')"
// inside membersOfGroup for EVERY non-baby group — i.e. on virtually every
// real menu generation, since baby groups are the only ones that short-circuit
// before reaching membersOfGroup. Covered end-to-end via generateMenuWithAI
// (the function App.jsx actually calls) so a regression here fails loudly.
describe("generateMenuWithAI extra meals (desayuno/merienda/postre) for a normal group", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("plans desayuno/merienda/postre for a regular (non-baby) group instead of crashing", async () => {
    const group = { id: "g1", label: "Familia", memberIds: ["m1", "kid1"], days: 1 };
    const data = {
      members: [
        { id: "m1", age: 35 },
        { id: "kid1", age: 8 },
      ],
      groups: [group],
      schedule: {},
      extraMeals: { desayuno: "variado", merienda: "semana", postre: "cena" },
    };

    const ctx = buildGroupContext(data, group);
    const { recipes: pool } = filterRecipes(ctx.filterOpts);
    const primero = pool.find((r) => r.mealRole.includes("primero") && !r.mealRole.includes("plato_unico"));
    const segundo = pool.find((r) => r.mealRole.includes("segundo") && r.id !== primero?.id);
    const cena = pool.find((r) => r.mealRole.includes("cena"));
    expect(primero && segundo && cena, "fixture setup: expected primero/segundo/cena candidates").toBeTruthy();

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          content: [
            {
              text: JSON.stringify({
                slots: [
                  { slotId: "lun_comida_1", recipeId: primero.id },
                  { slotId: "lun_comida_2", recipeId: segundo.id },
                  { slotId: "lun_cena", recipeId: cena.id },
                ],
              }),
            },
          ],
        }),
      }),
    );

    const { plan } = await generateMenuWithAI(data);
    const groupPlan = plan[group.id];
    // Extra meals are planned for the full week regardless of group.days, so
    // every day should have Desayuno + Postre; Merienda too since the group
    // has a child.
    expect(groupPlan["Lun-Desayuno"]).toBeTruthy();
    expect(groupPlan["Lun-Merienda"]).toBeTruthy();
    expect(groupPlan["Lun-Postre"]).toBeTruthy();
    expect(groupPlan["Dom-Desayuno"]).toBeTruthy();
    expect(groupPlan["Dom-Postre"]).toBeTruthy();
  });
});

describe("callModel retry on transient overload", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("retries on a 529 (overloaded) and succeeds once the API recovers", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 529, json: async () => ({ error: "Overloaded" }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ content: [{ text: "hola" }] }) });
    vi.stubGlobal("fetch", fetchMock);

    const promise = callModel({ model: "m", max_tokens: 10, system: "s", messages: [] });
    await vi.runAllTimersAsync();
    expect(await promise).toBe("hola");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("gives up after exhausting retries on repeated 529s", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: false, status: 529, json: async () => ({ error: "Overloaded" }) });
    vi.stubGlobal("fetch", fetchMock);

    const promise = callModel({ model: "m", max_tokens: 10, system: "s", messages: [] });
    const assertion = expect(promise).rejects.toThrow(AIPlannerError);
    await vi.runAllTimersAsync();
    await assertion;
    // Initial attempt + 2 retries (RETRY_DELAYS_MS has 2 entries).
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("does not retry a non-retryable client error (e.g. 400)", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: false, status: 400, json: async () => ({ error: "Bad request" }) });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      callModel({ model: "m", max_tokens: 10, system: "s", messages: [] }),
    ).rejects.toThrow(AIPlannerError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

// D4c (Fase 5): "strict" ("cosas distintas cada semana") reparte el pool en
// buckets disjuntos best-effort, sin dependencia entre semanas (paralelizable).
describe("poolForWeek — variedad multi-semana", () => {
  const pool = Array.from({ length: 60 }, (_, i) => ({ id: `r${i}` }));
  const slotCount = 6;

  it("no toca el pool sin crossWeek o con una sola semana", () => {
    expect(poolForWeek(pool, null, slotCount)).toBe(pool);
    expect(poolForWeek(pool, { weekIndex: 0, weekCount: 1, varietyPref: "strict" }, slotCount)).toBe(pool);
    expect(poolForWeek(pool, { weekIndex: 0, weekCount: 3, varietyPref: "relaxed" }, slotCount)).toBe(pool);
  });

  it("strict: las semanas quedan disjuntas cuando el pool es holgado", () => {
    const weekCount = 3;
    const weeks = [0, 1, 2].map((weekIndex) =>
      new Set(poolForWeek(pool, { weekIndex, weekCount, varietyPref: "strict" }, slotCount).map((r) => r.id)),
    );
    for (let a = 0; a < weeks.length; a++) {
      for (let b = a + 1; b < weeks.length; b++) {
        const overlap = [...weeks[a]].filter((id) => weeks[b].has(id));
        expect(overlap).toEqual([]);
      }
    }
    // Cada semana conserva bastantes recetas para tener margen de elección.
    for (const w of weeks) expect(w.size).toBeGreaterThanOrEqual(slotCount);
  });

  it("strict con pool ajustado: hace top-up best-effort sin fallar (no lanza)", () => {
    const small = Array.from({ length: 14 }, (_, i) => ({ id: `s${i}` }));
    expect(() =>
      [0, 1].map((weekIndex) =>
        poolForWeek(small, { weekIndex, weekCount: 2, varietyPref: "strict" }, slotCount),
      ),
    ).not.toThrow();
    const w0 = poolForWeek(small, { weekIndex: 0, weekCount: 2, varietyPref: "strict" }, slotCount);
    expect(w0.length).toBeGreaterThanOrEqual(slotCount);
  });
});
