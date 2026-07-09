import { describe, it, expect } from "vitest";
import { findMenuRestrictionConflicts, summarizeMenuRestrictionConflicts } from "./menuConflicts.js";

// Synthetic fixtures only (never real catalog recipes) — this suite tests the
// conflict-detection logic itself, not catalog data quality.
function recipe(id, { name = id, allergens = [], ingredients = [] } = {}) {
  return { id, name, allergens, ingredients: ingredients.map((n) => ({ name: n })) };
}

const GROUP = { id: "g1", label: "Familia", memberIds: ["a", "b"] };

function baseData(members) {
  return { members, groups: [GROUP] };
}

describe("findMenuRestrictionConflicts", () => {
  it("returns no conflicts when no member has a hard restriction", () => {
    const data = baseData([{ id: "a", age: 30 }]);
    const menuPlan = { g1: { "Lun-Comida": { recipeId: "r1" } } };
    const recipesById = { r1: recipe("r1", { allergens: ["gluten"] }) };
    expect(findMenuRestrictionConflicts(data, menuPlan, recipesById)).toEqual([]);
  });

  it("flags a dish whose DECLARED allergen matches a member's allergy", () => {
    const data = baseData([{ id: "a", age: 30, allergies: ["Gluten"] }]);
    const menuPlan = { g1: { "Lun-Comida": { recipeId: "r1" } } };
    const recipesById = { r1: recipe("r1", { name: "Pasta", allergens: ["gluten"] }) };

    const conflicts = findMenuRestrictionConflicts(data, menuPlan, recipesById);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toMatchObject({
      groupId: "g1",
      planKey: "Lun-Comida",
      course: "recipeId",
      recipeId: "r1",
      recipeName: "Pasta",
      restrictionType: "allergy",
      restrictionId: "gluten",
      restrictionLabel: "Gluten",
    });
  });

  it("does not flag a dish that has no relationship to the member's allergy", () => {
    const data = baseData([{ id: "a", age: 30, allergies: ["Gluten"] }]);
    const menuPlan = { g1: { "Lun-Comida": { recipeId: "r1" } } };
    const recipesById = { r1: recipe("r1", { allergens: [], ingredients: ["Arroz", "Pollo"] }) };
    expect(findMenuRestrictionConflicts(data, menuPlan, recipesById)).toEqual([]);
  });

  it("catches an UNDECLARED allergen via the ingredient-name safety net (e.g. soja)", () => {
    const data = baseData([{ id: "a", age: 30, allergies: ["Soja"] }]);
    const menuPlan = { g1: { "Lun-Cena": { recipeId: "r1" } } };
    // "soja" isn't declared but the ingredient list reveals it via tofu.
    const recipesById = { r1: recipe("r1", { name: "Wok de tofu", allergens: [], ingredients: ["Tofu", "Brócoli"] }) };

    const conflicts = findMenuRestrictionConflicts(data, menuPlan, recipesById);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].restrictionId).toBe("soja");
  });

  it("flags a dish that hits a HARD intolerance (e.g. fructosa via miel)", () => {
    const data = baseData([{ id: "a", age: 30, intolerances: ["fructosa"] }]);
    const menuPlan = { g1: { "Mar-Cena": { recipeId: "r1" } } };
    const recipesById = { r1: recipe("r1", { name: "Yogur con miel", ingredients: ["Yogur", "Miel"] }) };

    const conflicts = findMenuRestrictionConflicts(data, menuPlan, recipesById);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toMatchObject({ restrictionType: "intolerance", restrictionId: "fructosa" });
  });

  it("does NOT flag an ADAPTABLE intolerance (lactosa_fina) — those are swapped, not excluded", () => {
    const data = baseData([{ id: "a", age: 30, intolerances: ["lactosa_fina"] }]);
    const menuPlan = { g1: { "Mar-Cena": { recipeId: "r1" } } };
    const recipesById = { r1: recipe("r1", { name: "Crema con nata", ingredients: ["Nata", "Calabacín"] }) };
    expect(findMenuRestrictionConflicts(data, menuPlan, recipesById)).toEqual([]);
  });

  it("treats dietaryStates the same as intolerances (hard exclusion, e.g. embarazo + sushi)", () => {
    const data = baseData([{ id: "a", age: 30, dietaryStates: ["embarazo"] }]);
    const menuPlan = { g1: { "Vie-Cena": { recipeId: "r1" } } };
    const recipesById = { r1: recipe("r1", { name: "Sushi variado", ingredients: ["Arroz", "Salmón crudo"] }) };

    const conflicts = findMenuRestrictionConflicts(data, menuPlan, recipesById);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].restrictionId).toBe("embarazo");
  });

  it("UNIONS restrictions across members of the same group — a dish only one member reacts to is still flagged", () => {
    const data = baseData([
      { id: "a", age: 8, allergies: ["Gluten"] },
      { id: "b", age: 6, allergies: ["Frutos secos"] },
    ]);
    const menuPlan = {
      g1: {
        "Lun-Comida": { recipeId: "gluten-dish" }, // only conflicts with member a
        "Mar-Comida": { recipeId: "nuts-dish" }, // only conflicts with member b
      },
    };
    const recipesById = {
      "gluten-dish": recipe("gluten-dish", { allergens: ["gluten"] }),
      "nuts-dish": recipe("nuts-dish", { allergens: ["frutos_cascara"] }),
    };

    const conflicts = findMenuRestrictionConflicts(data, menuPlan, recipesById);
    const flaggedIds = conflicts.map((c) => c.recipeId).sort();
    expect(flaggedIds).toEqual(["gluten-dish", "nuts-dish"]);
  });

  it("scopes restrictions per group — a conflict for group A's member never leaks into group B", () => {
    const groupA = { id: "gA", label: "Niños", memberIds: ["kid"] };
    const groupB = { id: "gB", label: "Adultos", memberIds: ["adult"] };
    const data = {
      members: [
        { id: "kid", age: 8, allergies: ["Gluten"] },
        { id: "adult", age: 40 }, // no restrictions
      ],
      groups: [groupA, groupB],
    };
    const menuPlan = {
      gA: { "Lun-Comida": { recipeId: "safe-1" } },
      gB: { "Lun-Comida": { recipeId: "gluten-dish" } },
    };
    const recipesById = {
      "safe-1": recipe("safe-1", { allergens: [] }),
      "gluten-dish": recipe("gluten-dish", { allergens: ["gluten"] }),
    };

    expect(findMenuRestrictionConflicts(data, menuPlan, recipesById)).toEqual([]);
  });

  it("checks both firstRecipeId (primero) and recipeId (segundo/cena) courses", () => {
    const data = baseData([{ id: "a", age: 30, allergies: ["Huevos"] }]);
    const menuPlan = { g1: { "Lun-Comida": { firstRecipeId: "egg-soup", recipeId: "safe-main" } } };
    const recipesById = {
      "egg-soup": recipe("egg-soup", { name: "Sopa con huevo", allergens: ["huevos"] }),
      "safe-main": recipe("safe-main", { allergens: [] }),
    };

    const conflicts = findMenuRestrictionConflicts(data, menuPlan, recipesById);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toMatchObject({ course: "firstRecipeId", recipeId: "egg-soup" });
  });

  it("skips gracefully when a slot's recipeId can't be resolved (stale/removed recipe)", () => {
    const data = baseData([{ id: "a", age: 30, allergies: ["Gluten"] }]);
    const menuPlan = { g1: { "Lun-Comida": { recipeId: "ghost-recipe" } } };
    expect(() => findMenuRestrictionConflicts(data, menuPlan, {})).not.toThrow();
    expect(findMenuRestrictionConflicts(data, menuPlan, {})).toEqual([]);
  });

  it("returns [] for an empty/missing menuPlan", () => {
    const data = baseData([{ id: "a", age: 30, allergies: ["Gluten"] }]);
    expect(findMenuRestrictionConflicts(data, {}, {})).toEqual([]);
    expect(findMenuRestrictionConflicts(data, undefined, {})).toEqual([]);
  });
});

describe("summarizeMenuRestrictionConflicts", () => {
  it("returns null when there are no conflicts", () => {
    expect(summarizeMenuRestrictionConflicts([])).toBeNull();
    expect(summarizeMenuRestrictionConflicts(undefined)).toBeNull();
  });

  it("summarizes distinct dishes and restriction labels, singular phrasing for one dish", () => {
    const conflicts = [
      { groupId: "g1", planKey: "Lun-Comida", course: "recipeId", restrictionLabel: "Gluten" },
    ];
    expect(summarizeMenuRestrictionConflicts(conflicts)).toBe(
      "1 plato del menú actual podría no respetar: Gluten.",
    );
  });

  it("summarizes multiple dishes/labels with plural phrasing and no duplicate labels", () => {
    const conflicts = [
      { groupId: "g1", planKey: "Lun-Comida", course: "recipeId", restrictionLabel: "Gluten" },
      { groupId: "g1", planKey: "Mar-Comida", course: "recipeId", restrictionLabel: "Gluten" },
      { groupId: "g1", planKey: "Mié-Cena", course: "recipeId", restrictionLabel: "Frutos de cáscara" },
    ];
    const summary = summarizeMenuRestrictionConflicts(conflicts);
    expect(summary).toBe("3 platos del menú actual podrían no respetar: Gluten, Frutos de cáscara.");
  });
});
