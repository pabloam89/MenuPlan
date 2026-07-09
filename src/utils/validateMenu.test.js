import { describe, it, expect } from "vitest";
import {
  validateMenu,
  buildCorrectionMessage,
  applyFallback,
  carbTypeFromText,
  splitAchievableFreqs,
} from "./validateMenu.js";

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

  describe("proteina_consecutiva across day boundaries and plato_unico", () => {
    it("catches cena(day N) -> comida_2(day N+1) as consecutive in a realistic full week (not just an isolated 2-slot input)", () => {
      const pool = [
        recipe({ id: "primero_neutral", mainProtein: "none", mealRole: ["primero"] }),
        recipe({ id: "pollo_segundo", mainProtein: "pollo", mealRole: ["segundo"] }),
        recipe({ id: "pollo_cena", mainProtein: "pollo", mealRole: ["cena"] }),
        recipe({ id: "pescado_segundo", mainProtein: "pescado_blanco", mealRole: ["segundo"] }),
      ];
      const slots = [
        slot("lun_comida_1"), slot("lun_comida_2"), slot("lun_cena"),
        slot("mar_comida_1"), slot("mar_comida_2"), slot("mar_cena"),
      ];
      // lun_cena and mar_comida_2 both "pollo" — adjacent once comida_1 (primero) is filtered out.
      const assignments = [
        { slotId: "lun_comida_1", recipeId: "primero_neutral" },
        { slotId: "lun_comida_2", recipeId: "pescado_segundo" },
        { slotId: "lun_cena", recipeId: "pollo_cena" },
        { slotId: "mar_comida_1", recipeId: "primero_neutral" },
        { slotId: "mar_comida_2", recipeId: "pollo_segundo" },
        { slotId: "mar_cena", recipeId: "pescado_segundo" },
      ];
      const { violations } = validateMenu(assignments, pool, slots);
      const proteinViolations = violations.filter((v) => v.rule === "proteina_consecutiva");
      expect(proteinViolations).toHaveLength(1);
      expect(proteinViolations[0].slotId).toBe("mar_comida_2");
    });

    it("treats a plato_unico in comida_1 as a main meal, not an invisible primero", () => {
      // Bug: comida_1 is normally excluded from the consecutive-protein check
      // (it's usually a light primero with mainProtein "none"), but a
      // plato_unico (paella, cocido...) also lives in the comida_1 slotId and
      // DOES carry the day's real protein — it must stay visible to rule 3.
      const pool = [
        recipe({ id: "paella", mainProtein: "marisco", mealRole: ["plato_unico"] }),
        recipe({ id: "pescado_cena", mainProtein: "marisco", mealRole: ["cena"] }),
      ];
      const slots = [slot("lun_comida_1"), slot("lun_cena")];
      const assignments = [
        { slotId: "lun_comida_1", recipeId: "paella" },
        { slotId: "lun_cena", recipeId: "pescado_cena" },
      ];
      const { violations } = validateMenu(assignments, pool, slots);
      expect(violations.map((v) => v.rule)).toContain("proteina_consecutiva");
    });

    it("still ignores a genuine (non plato_unico) primero in comida_1", () => {
      // Regression guard: a real starter (soup/salad) must stay excluded from
      // the consecutive-protein check, exactly like before the plato_unico fix.
      const pool = [
        recipe({ id: "sopa", mainProtein: "legumbre", mealRole: ["primero"] }),
        recipe({ id: "legumbre_cena", mainProtein: "legumbre", mealRole: ["cena"] }),
      ];
      const slots = [slot("lun_comida_1"), slot("lun_cena")];
      const assignments = [
        { slotId: "lun_comida_1", recipeId: "sopa" },
        { slotId: "lun_cena", recipeId: "legumbre_cena" },
      ];
      const { violations } = validateMenu(assignments, pool, slots);
      expect(violations.map((v) => v.rule)).not.toContain("proteina_consecutiva");
    });
  });

  describe("weekly frequency targets (rule 11, config.freqs)", () => {
    it("flags a category whose weekly target isn't met", () => {
      const pool = [
        recipe({ id: "pollo_a", mainProtein: "pollo", mealRole: ["segundo"] }),
        recipe({ id: "pollo_b", mainProtein: "pollo", mealRole: ["segundo"] }),
      ];
      const slots = [slot("lun_comida_2"), slot("mar_comida_2")];
      const assignments = [
        { slotId: "lun_comida_2", recipeId: "pollo_a" },
        { slotId: "mar_comida_2", recipeId: "pollo_b" },
      ];
      const { violations } = validateMenu(assignments, pool, slots, [], { pescado: 1 });
      const freqViolations = violations.filter((v) => v.rule === "freq_target_not_met");
      expect(freqViolations).toHaveLength(1);
      expect(freqViolations[0].targetKey).toBe("pescado");
    });

    it("does not flag a category whose target is already met", () => {
      const pool = [
        recipe({ id: "pescado_a", category: "pescados", mainProtein: "pescado_blanco", mealRole: ["segundo"] }),
      ];
      const slots = [slot("lun_comida_2")];
      const assignments = [{ slotId: "lun_comida_2", recipeId: "pescado_a" }];
      expect(validateMenu(assignments, pool, slots, [], { pescado: 1 }).valid).toBe(true);
    });

    it("is a no-op when freqs is empty or omitted (backward compatible)", () => {
      const pool = [recipe({ id: "a", mealRole: ["cena"] })];
      const slots = [slot("lun_cena")];
      const assignments = [{ slotId: "lun_cena", recipeId: "a" }];
      expect(validateMenu(assignments, pool, slots).valid).toBe(true);
      expect(validateMenu(assignments, pool, slots, [], {}).valid).toBe(true);
    });

    it("picks a donor slot that has no target of its own over one that would create a new deficit", () => {
      const pool = [
        recipe({ id: "verdura_a", category: "ensaladas_verduras", mainProtein: "none", mealRole: ["primero"] }),
        recipe({ id: "pollo_a", mainProtein: "pollo", mealRole: ["segundo"] }),
      ];
      const slots = [slot("lun_comida_1"), slot("lun_comida_2")];
      const assignments = [
        { slotId: "lun_comida_1", recipeId: "verdura_a" }, // meets verdura:1 exactly — no slack
        { slotId: "lun_comida_2", recipeId: "pollo_a" }, // "carne" isn't tracked — free/neutral donor
      ];
      const freqs = { verdura: 1, pescado: 1 };
      const { violations } = validateMenu(assignments, pool, slots, [], freqs);
      const freqViolations = violations.filter((v) => v.rule === "freq_target_not_met");
      expect(freqViolations).toHaveLength(1);
      expect(freqViolations[0].slotId).toBe("lun_comida_2");
    });
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

  it("actually resolves a proteina_consecutiva violation instead of trading it for another same-protein dish", () => {
    // Bug: the generic replacement search had no rule-specific awareness of
    // proteina_consecutiva, so it could pick the first structurally-valid
    // candidate even if it STILL shared mainProtein with the neighbor that
    // triggered the violation, silently shipping an unresolved conflict.
    const pool = [
      recipe({ id: "pollo_cena", mainProtein: "pollo", mealRole: ["cena"] }),
      recipe({ id: "pollo_a", mainProtein: "pollo", mealRole: ["segundo"] }), // currently assigned (flagged)
      recipe({ id: "pollo_c", mainProtein: "pollo", mealRole: ["segundo"] }), // another same-protein dish, earlier in pool order
      recipe({ id: "pescado_segundo", mainProtein: "pescado_blanco", mealRole: ["segundo"] }),
    ];
    const slots = [slot("lun_cena"), slot("mar_comida_2")];
    const assignments = [
      { slotId: "lun_cena", recipeId: "pollo_cena" },
      { slotId: "mar_comida_2", recipeId: "pollo_a" },
    ];
    const violations = [
      { rule: "proteina_consecutiva", slotId: "mar_comida_2", message: "" },
    ];
    const result = applyFallback(assignments, violations, pool, slots);
    const fixed = result.find((s) => s.slotId === "mar_comida_2")?.recipeId;
    expect(fixed).toBe("pescado_segundo");
    // Re-validating confirms the conflict is actually gone, not just relabeled.
    expect(validateMenu(result, pool, slots).valid).toBe(true);
  });

  it("replaces a freq_target_not_met violation with a recipe matching the deficit category", () => {
    const pool = [
      recipe({ id: "pollo_a", mainProtein: "pollo", mealRole: ["segundo"] }),
      recipe({ id: "pescado_a", category: "pescados", mainProtein: "pescado_blanco", mealRole: ["segundo"] }),
    ];
    const slots = [slot("lun_comida_2")];
    const assignments = [{ slotId: "lun_comida_2", recipeId: "pollo_a" }];
    const violations = [
      { rule: "freq_target_not_met", slotId: "lun_comida_2", targetKey: "pescado", message: "" },
    ];
    const result = applyFallback(assignments, violations, pool, slots);
    expect(result.find((s) => s.slotId === "lun_comida_2")?.recipeId).toBe("pescado_a");
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

describe("splitAchievableFreqs", () => {
  it("keeps a key when the filtered pool has enough matching recipes", () => {
    const pool = [
      recipe({ id: "a", category: "pescados", mainProtein: "pescado_blanco" }),
      recipe({ id: "b", category: "pescados", mainProtein: "pescado_azul" }),
    ];
    const { achievable, warnings } = splitAchievableFreqs(pool, { pescado: 2 });
    expect(achievable).toEqual({ pescado: 2 });
    expect(warnings).toEqual([]);
  });

  it("drops a key and returns a warning when the pool can't satisfy it", () => {
    const pool = [recipe({ id: "a", category: "pescados", mainProtein: "pescado_blanco" })];
    const { achievable, warnings } = splitAchievableFreqs(pool, { pescado: 3 });
    expect(achievable).toEqual({});
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("pescado");
    expect(warnings[0]).toContain("3");
  });

  it("handles a mix of achievable and unachievable keys independently", () => {
    const pool = [
      recipe({ id: "a", category: "carnes", mainProtein: "pollo" }),
      recipe({ id: "b", category: "carnes", mainProtein: "pavo" }),
      recipe({ id: "c", category: "pescados", mainProtein: "pescado_blanco" }),
    ];
    const { achievable, warnings } = splitAchievableFreqs(pool, { carne: 2, pescado: 5 });
    expect(achievable).toEqual({ carne: 2 });
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("pescado");
  });

  it("ignores zero/undefined targets and unknown keys without crashing", () => {
    const pool = [recipe({ id: "a" })];
    const { achievable, warnings } = splitAchievableFreqs(pool, { carne: 0, misterio: 5 });
    expect(achievable).toEqual({});
    expect(warnings).toEqual([]);
  });

  it("never blocks: an empty pool just returns warnings for every target, not a throw", () => {
    expect(() => splitAchievableFreqs([], { carne: 1, pescado: 1 })).not.toThrow();
    const { achievable, warnings } = splitAchievableFreqs([], { carne: 1, pescado: 1 });
    expect(achievable).toEqual({});
    expect(warnings).toHaveLength(2);
  });
});
