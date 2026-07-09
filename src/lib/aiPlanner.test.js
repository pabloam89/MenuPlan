import { describe, it, expect } from "vitest";
import {
  buildUserMessage,
  buildGroupContext,
  generateGroupMenu,
  selectReplacementCandidates,
} from "./aiPlanner.js";

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
