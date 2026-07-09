import { describe, it, expect } from "vitest";
import { validateMenu, buildCorrectionMessage, applyFallback, carbTypeFromText } from "./validateMenu.js";

function recipe(overrides) {
  return {
    id: "r1",
    name: "Receta",
    category: "carnes",
    mainProtein: "pollo",
    mealRole: ["segundo"],
    time: 30,
    tupperFriendly: true,
    ingredients: [],
    healthFlags: [],
    ...overrides,
  };
}

const slot = (slotId, extra = {}) => ({ slotId, ...extra });

describe("validateMenu", () => {
  it("passes a menu with no violations", () => {
    const pool = [recipe({ id: "a", mealRole: ["primero", "plato_unico"] })];
    const slots = [slot("lun_comida_1")];
    const assignments = [{ slotId: "lun_comida_1", recipeId: "a" }];
    expect(validateMenu(assignments, pool, slots).valid).toBe(true);
  });

  it("flags a missing slot", () => {
    const pool = [recipe({ id: "a" })];
    const slots = [slot("lun_cena"), slot("mar_cena")];
    const assignments = [{ slotId: "lun_cena", recipeId: "a" }];
    const { valid, violations } = validateMenu(assignments, pool, slots);
    expect(valid).toBe(false);
    expect(violations.map((v) => v.rule)).toContain("slot_faltante");
  });

  it("flags a recipeId outside the filtered pool", () => {
    const pool = [recipe({ id: "a" })];
    const slots = [slot("lun_cena")];
    const assignments = [{ slotId: "lun_cena", recipeId: "ghost" }];
    const { violations } = validateMenu(assignments, pool, slots);
    expect(violations.map((v) => v.rule)).toContain("recipeId_not_in_catalog");
  });

  it("flags legumbres assigned to cena", () => {
    const pool = [recipe({ id: "a", category: "legumbres", mealRole: ["cena"] })];
    const slots = [slot("lun_cena")];
    const assignments = [{ slotId: "lun_cena", recipeId: "a" }];
    const { violations } = validateMenu(assignments, pool, slots);
    expect(violations.map((v) => v.rule)).toContain("legumbres_en_cena");
  });

  it("flags cenas_rapidas used outside a cena_rapida slot", () => {
    const pool = [recipe({ id: "a", category: "cenas_rapidas", mealRole: ["cena"] })];
    const slots = [slot("lun_cena")];
    const assignments = [{ slotId: "lun_cena", recipeId: "a" }];
    const { violations } = validateMenu(assignments, pool, slots);
    expect(violations.map((v) => v.rule)).toContain("cena_rapida_no_solicitada");
  });

  it("allows cenas_rapidas when the slot explicitly requests it", () => {
    const pool = [recipe({ id: "a", category: "cenas_rapidas", mealRole: ["cena"] })];
    const slots = [slot("lun_cena", { preferType: "cena_rapida" })];
    const assignments = [{ slotId: "lun_cena", recipeId: "a" }];
    expect(validateMenu(assignments, pool, slots).valid).toBe(true);
  });

  it("flags the same mainProtein repeated in consecutive main meals", () => {
    const pool = [
      recipe({ id: "a", mainProtein: "pollo", mealRole: ["cena"] }),
      recipe({ id: "b", mainProtein: "pollo", mealRole: ["segundo"] }),
    ];
    const slots = [slot("lun_cena"), slot("mar_comida_2")];
    const assignments = [
      { slotId: "lun_cena", recipeId: "a" },
      { slotId: "mar_comida_2", recipeId: "b" },
    ];
    const { violations } = validateMenu(assignments, pool, slots);
    expect(violations.map((v) => v.rule)).toContain("proteina_consecutiva");
  });

  it("flags a school-avoided protein group reused in cena", () => {
    const pool = [recipe({ id: "a", mainProtein: "pollo", mealRole: ["cena"] })];
    const slots = [slot("lun_cena", { schoolProteinsToAvoid: ["carne"] })];
    const assignments = [{ slotId: "lun_cena", recipeId: "a" }];
    const { violations } = validateMenu(assignments, pool, slots);
    expect(violations.map((v) => v.rule)).toContain("school_protein_conflict");
  });

  it("flags a school-avoided carb base reused in cena", () => {
    const pool = [
      recipe({
        id: "a", mainProtein: "pollo", mealRole: ["cena"],
        name: "Arroz con pollo", ingredients: [{ name: "Arroz" }, { name: "Pollo" }],
      }),
    ];
    const slots = [slot("lun_cena", { schoolCarbsToAvoid: ["arroz"] })];
    const assignments = [{ slotId: "lun_cena", recipeId: "a" }];
    const { violations } = validateMenu(assignments, pool, slots);
    expect(violations.map((v) => v.rule)).toContain("school_carb_conflict");
  });

  it("does not flag a cena carb base the school didn't serve", () => {
    const pool = [
      recipe({
        id: "a", mainProtein: "pollo", mealRole: ["cena"],
        name: "Pollo con patatas", ingredients: [{ name: "Patata" }, { name: "Pollo" }],
      }),
    ];
    const slots = [slot("lun_cena", { schoolCarbsToAvoid: ["arroz"] })];
    const assignments = [{ slotId: "lun_cena", recipeId: "a" }];
    expect(validateMenu(assignments, pool, slots).valid).toBe(true);
  });

  it("flags a non-tupperFriendly recipe in a tupper slot", () => {
    const pool = [recipe({ id: "a", tupperFriendly: false, mealRole: ["cena"] })];
    const slots = [slot("lun_cena", { mode: "tupper" })];
    const assignments = [{ slotId: "lun_cena", recipeId: "a" }];
    const { violations } = validateMenu(assignments, pool, slots);
    expect(violations.map((v) => v.rule)).toContain("tupper_not_friendly");
  });

  it("flags a repeated recipeId across the week", () => {
    const pool = [recipe({ id: "a", mealRole: ["cena"] })];
    const slots = [slot("lun_cena"), slot("mar_cena")];
    const assignments = [
      { slotId: "lun_cena", recipeId: "a" },
      { slotId: "mar_cena", recipeId: "a" },
    ];
    const { violations } = validateMenu(assignments, pool, slots);
    expect(violations.map((v) => v.rule)).toContain("recipeId_repetido");
  });

  it("flags a comida with only a primero and no segundo/plato_unico", () => {
    const pool = [recipe({ id: "a", mealRole: ["primero"] })];
    const slots = [slot("lun_comida_1")];
    const assignments = [{ slotId: "lun_comida_1", recipeId: "a" }];
    const { violations } = validateMenu(assignments, pool, slots);
    expect(violations.map((v) => v.rule)).toContain("comida_sin_segundo");
  });

  it("flags a recipe exceeding the slot's maxTime", () => {
    const pool = [recipe({ id: "a", time: 90, mealRole: ["cena"] })];
    const slots = [slot("lun_cena", { maxTime: 30 })];
    const assignments = [{ slotId: "lun_cena", recipeId: "a" }];
    const { violations } = validateMenu(assignments, pool, slots);
    expect(violations.map((v) => v.rule)).toContain("tiempo_excedido");
  });

  it("flags the same carb base repeated within a day", () => {
    const pool = [
      recipe({
        id: "a", mealRole: ["primero", "plato_unico"],
        name: "Sopa de fideos", ingredients: [{ name: "Fideos" }],
      }),
      recipe({ id: "b", mealRole: ["cena"], name: "Espaguetis", ingredients: [{ name: "Espaguetis" }] }),
    ];
    const slots = [slot("lun_comida_1"), slot("lun_cena")];
    const assignments = [
      { slotId: "lun_comida_1", recipeId: "a" },
      { slotId: "lun_cena", recipeId: "b" },
    ];
    const { violations } = validateMenu(assignments, pool, slots);
    expect(violations.map((v) => v.rule)).toContain("guarnicion_repetida");
  });

  describe("health-profile rule", () => {
    it("flags a fried dish when corazon is active", () => {
      const pool = [recipe({ id: "a", mealRole: ["cena"], healthFlags: ["frito"] })];
      const slots = [slot("lun_cena")];
      const assignments = [{ slotId: "lun_cena", recipeId: "a" }];
      const { violations } = validateMenu(assignments, pool, slots, ["corazon"]);
      expect(violations.map((v) => v.rule)).toContain("health_profile_conflict");
    });

    it("does not flag a dish with no risk flags", () => {
      const pool = [recipe({ id: "a", mealRole: ["cena"], healthFlags: [] })];
      const slots = [slot("lun_cena")];
      const assignments = [{ slotId: "lun_cena", recipeId: "a" }];
      expect(validateMenu(assignments, pool, slots, ["corazon"]).valid).toBe(true);
    });

    it("never flags anemia absence — presence-based profile stays pure LLM bias", () => {
      const pool = [recipe({ id: "a", mealRole: ["cena"], healthFlags: [] })];
      const slots = [slot("lun_cena")];
      const assignments = [{ slotId: "lun_cena", recipeId: "a" }];
      expect(validateMenu(assignments, pool, slots, ["anemia"]).valid).toBe(true);
    });

    it("does nothing when no health profiles are active", () => {
      const pool = [recipe({ id: "a", mealRole: ["cena"], healthFlags: ["frito", "embutido"] })];
      const slots = [slot("lun_cena")];
      const assignments = [{ slotId: "lun_cena", recipeId: "a" }];
      expect(validateMenu(assignments, pool, slots, []).valid).toBe(true);
      expect(validateMenu(assignments, pool, slots).valid).toBe(true);
    });
  });
});

describe("buildCorrectionMessage", () => {
  it("lists every violation with its rule, slot and message", () => {
    const msg = buildCorrectionMessage([
      { rule: "tiempo_excedido", slotId: "lun_cena", message: "demasiado larga" },
    ]);
    expect(msg).toContain("tiempo_excedido");
    expect(msg).toContain("lun_cena");
    expect(msg).toContain("demasiado larga");
  });
});

describe("applyFallback", () => {
  it("fills a missing slot from the filtered pool", () => {
    const pool = [recipe({ id: "a", mealRole: ["cena"] })];
    const slots = [slot("lun_cena")];
    const violations = [{ rule: "slot_faltante", slotId: "lun_cena", message: "" }];
    const result = applyFallback([], violations, pool, slots);
    expect(result.find((s) => s.slotId === "lun_cena")?.recipeId).toBe("a");
  });

  it("leaves a missing slot unfilled when nothing in the pool satisfies its constraints", () => {
    const pool = [recipe({ id: "a", mealRole: ["cena"], time: 90 })];
    const slots = [slot("lun_cena", { maxTime: 10 })];
    const violations = [{ rule: "slot_faltante", slotId: "lun_cena", message: "" }];
    const result = applyFallback([], violations, pool, slots);
    // Documents the known contract: applyFallback never invents a candidate
    // out of thin air. It's aiPlanner.js's job (not applyFallback's) to catch
    // a still-missing slot afterwards and drop it with a warning instead of
    // letting hydration resolve it against the unfiltered catalog.
    expect(result).toEqual([]);
  });

  it("replaces a legumbres_en_cena violation with a non-legumbre alternative", () => {
    const pool = [
      recipe({ id: "a", category: "legumbres", mealRole: ["cena"] }),
      recipe({ id: "b", category: "carnes", mealRole: ["cena"] }),
    ];
    const slots = [slot("lun_cena")];
    const assignments = [{ slotId: "lun_cena", recipeId: "a" }];
    const violations = [{ rule: "legumbres_en_cena", slotId: "lun_cena", message: "" }];
    const result = applyFallback(assignments, violations, pool, slots);
    expect(result.find((s) => s.slotId === "lun_cena")?.recipeId).toBe("b");
  });

  it("replaces a health_profile_conflict violation with a compliant alternative", () => {
    const pool = [
      recipe({ id: "a", mealRole: ["cena"], healthFlags: ["frito"] }),
      recipe({ id: "b", mealRole: ["cena"], healthFlags: [] }),
    ];
    const slots = [slot("lun_cena")];
    const assignments = [{ slotId: "lun_cena", recipeId: "a" }];
    const violations = [{ rule: "health_profile_conflict", slotId: "lun_cena", message: "" }];
    const result = applyFallback(assignments, violations, pool, slots, ["corazon"]);
    expect(result.find((s) => s.slotId === "lun_cena")?.recipeId).toBe("b");
  });

  it("does not swap to another candidate that also violates the active profile", () => {
    const pool = [
      recipe({ id: "a", mealRole: ["cena"], healthFlags: ["frito"] }),
      recipe({ id: "b", mealRole: ["cena"], healthFlags: ["embutido"] }),
    ];
    const slots = [slot("lun_cena")];
    const assignments = [{ slotId: "lun_cena", recipeId: "a" }];
    const violations = [{ rule: "health_profile_conflict", slotId: "lun_cena", message: "" }];
    const result = applyFallback(assignments, violations, pool, slots, ["corazon"]);
    // "b" also violates corazon (embutido) — the carve-out must reject it too,
    // leaving the original pick rather than trading one violation for another.
    expect(result.find((s) => s.slotId === "lun_cena")?.recipeId).toBe("a");
  });

  it("never blocks the menu: an unresolvable violation just leaves the slot as-is", () => {
    const pool = [recipe({ id: "a", mealRole: ["cena"], healthFlags: ["frito"] })];
    const slots = [slot("lun_cena")];
    const assignments = [{ slotId: "lun_cena", recipeId: "a" }];
    const violations = [{ rule: "health_profile_conflict", slotId: "lun_cena", message: "" }];
    const result = applyFallback(assignments, violations, pool, slots, ["corazon"]);
    expect(result).toHaveLength(1);
    expect(result[0].recipeId).toBe("a");
  });

  it("replaces a school_carb_conflict violation with a different carb base", () => {
    const pool = [
      recipe({
        id: "a", mealRole: ["cena"],
        name: "Arroz con verduras", ingredients: [{ name: "Arroz" }],
      }),
      recipe({
        id: "b", mealRole: ["cena"],
        name: "Pasta con tomate", ingredients: [{ name: "Pasta" }],
      }),
    ];
    const slots = [slot("lun_cena", { schoolCarbsToAvoid: ["arroz"] })];
    const assignments = [{ slotId: "lun_cena", recipeId: "a" }];
    const violations = [{ rule: "school_carb_conflict", slotId: "lun_cena", message: "" }];
    const result = applyFallback(assignments, violations, pool, slots);
    expect(result.find((s) => s.slotId === "lun_cena")?.recipeId).toBe("b");
  });
});

describe("carbTypeFromText", () => {
  it("classifies common carb bases from free text", () => {
    expect(carbTypeFromText("Arroz con tomate")).toBe("arroz");
    expect(carbTypeFromText("Macarrones con queso")).toBe("pasta");
    expect(carbTypeFromText("Puré de patata")).toBe("patatas");
    expect(carbTypeFromText("Cuscús con verduras")).toBe("cuscus");
  });

  it("returns null for text with no recognizable carb base", () => {
    expect(carbTypeFromText("Ensalada mixta")).toBeNull();
    expect(carbTypeFromText("Merluza a la plancha")).toBeNull();
    expect(carbTypeFromText("")).toBeNull();
    expect(carbTypeFromText(undefined)).toBeNull();
  });
});
