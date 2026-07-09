import { describe, it, expect } from "vitest";
import { buildUserMessage, buildGroupContext, generateGroupMenu, applyGarnishToRecipe } from "./aiPlanner.js";

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
