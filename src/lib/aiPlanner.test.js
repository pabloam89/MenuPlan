import { describe, it, expect } from "vitest";
import { buildUserMessage, buildGroupContext, generateGroupMenu, generateMenuWithAI, AIPlannerError } from "./aiPlanner.js";
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
