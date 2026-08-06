import { describe, it, expect } from "vitest";
import {
  validateMenu,
  buildCorrectionMessage,
  applyFallback,
  carbTypeFromText,
  splitAchievableFreqs,
  slotAcceptsRole,
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

describe("slotAcceptsRole (rol ↔ hueco)", () => {
  const quesadillas = recipe({ id: "q", name: "Quesadillas caseras", category: "platos_unicos", mealRole: ["cena"] });
  const lasana = recipe({ id: "l", name: "Lasaña de carne", category: "pasta_arroces", mealRole: ["plato_unico"] });
  const crema = recipe({ id: "c", name: "Crema de calabacín", mealRole: ["primero"] });
  const merluza = recipe({ id: "m", name: "Merluza al horno", mealRole: ["segundo"] });

  it("rechaza un plato de solo cena en un hueco de comida", () => {
    expect(slotAcceptsRole(quesadillas, { mealType: "comida", position: "1" })).toBe(false);
    expect(slotAcceptsRole(quesadillas, { mealType: "comida", position: "2" })).toBe(false);
    expect(slotAcceptsRole(quesadillas, { mealType: "cena" })).toBe(true);
  });

  it("rechaza un plato único como primero de una comida de dos platos", () => {
    // Una lasaña ES la comida entera: como primero dejaba un menú
    // desproporcionado (primero de 562 kcal + un segundo encima).
    expect(slotAcceptsRole(lasana, { mealType: "comida", position: "1" })).toBe(false);
  });

  it("acepta un plato único cuando el hueco ES de plato único", () => {
    expect(slotAcceptsRole(lasana, { mealType: "comida", position: "plato_unico" })).toBe(true);
    expect(slotAcceptsRole(lasana, { mealType: "comida", preferType: "plato_unico" })).toBe(true);
  });

  it("acepta los roles correctos en sus huecos", () => {
    expect(slotAcceptsRole(crema, { mealType: "comida", position: "1" })).toBe(true);
    expect(slotAcceptsRole(merluza, { mealType: "comida", position: "2" })).toBe(true);
  });
});

describe("validateMenu", () => {
  it("REGRESIÓN: detecta Quesadillas (solo cena) como primero de una comida completa", () => {
    // Reportado en producción. Antes devolvía valid:true con CERO violaciones:
    // la restricción de rol vivía solo en applyFallback (camino de reparación),
    // así que nunca se detectaba y por tanto nunca se reparaba.
    const pool = [
      recipe({ id: "quesadillas", name: "Quesadillas caseras", category: "platos_unicos", mealRole: ["cena"] }),
      recipe({ id: "merluza", name: "Merluza al horno", mainProtein: "pescado_blanco", mealRole: ["segundo"] }),
    ];
    const slots = [slot("lun_comida_1"), slot("lun_comida_2")];
    const assignments = [
      { slotId: "lun_comida_1", recipeId: "quesadillas" },
      { slotId: "lun_comida_2", recipeId: "merluza" },
    ];
    const { valid, violations } = validateMenu(assignments, pool, slots);
    expect(valid).toBe(false);
    expect(violations.map((v) => v.rule)).toContain("rol_incompatible_con_hueco");
  });

  it("REGRESIÓN: detecta un plato único servido como primero", () => {
    const pool = [
      recipe({ id: "lasana", name: "Lasaña de carne", category: "pasta_arroces", mealRole: ["plato_unico"] }),
      recipe({ id: "merluza", name: "Merluza al horno", mainProtein: "pescado_blanco", mealRole: ["segundo"] }),
    ];
    const slots = [slot("lun_comida_1"), slot("lun_comida_2")];
    const assignments = [
      { slotId: "lun_comida_1", recipeId: "lasana" },
      { slotId: "lun_comida_2", recipeId: "merluza" },
    ];
    const { violations } = validateMenu(assignments, pool, slots);
    expect(violations.map((v) => v.rule)).toContain("rol_incompatible_con_hueco");
  });

  it("applyFallback repara un rol incompatible sustituyendo por un plato del rol correcto", () => {
    const pool = [
      recipe({ id: "quesadillas", name: "Quesadillas caseras", category: "platos_unicos", mealRole: ["cena"] }),
      recipe({ id: "crema", name: "Crema de calabacín", mainProtein: "none", mealRole: ["primero"] }),
    ];
    const slots = [slot("lun_comida_1")];
    const assignments = [{ slotId: "lun_comida_1", recipeId: "quesadillas" }];
    const violations = [{ rule: "rol_incompatible_con_hueco", slotId: "lun_comida_1", message: "" }];
    const result = applyFallback(assignments, violations, pool, slots);
    expect(result.find((s) => s.slotId === "lun_comida_1")?.recipeId).toBe("crema");
  });

  it("detecta una comida desproporcionada (primero + segundo demasiado contundentes)", () => {
    // Peor caso real del catálogo: pasta contundente de primero + carne
    // grasa de segundo. Ninguno es inválido por separado.
    const pool = [
      recipe({ id: "pesto", name: "Pasta al pesto", mealRole: ["primero"], mainProtein: "none", kcal: 478 }),
      recipe({ id: "costillas", name: "Costillas de cerdo al horno", mealRole: ["segundo"], mainProtein: "cerdo", kcal: 528 }),
    ];
    const slots = [slot("lun_comida_1"), slot("lun_comida_2")];
    const assignments = [
      { slotId: "lun_comida_1", recipeId: "pesto" },
      { slotId: "lun_comida_2", recipeId: "costillas" },
    ];
    const { violations } = validateMenu(assignments, pool, slots);
    expect(violations.map((v) => v.rule)).toContain("comida_desproporcionada");
  });

  it("NO marca una comida normal (macarrones con tomate de primero es válido)", () => {
    // Un tope por plato suelto marcaría estos macarrones como error; por eso
    // la regla mira la pareja, no el plato.
    const pool = [
      recipe({ id: "macarrones", name: "Macarrones con tomate", mealRole: ["primero"], mainProtein: "none", kcal: 412 }),
      recipe({ id: "merluza", name: "Merluza a la plancha", mealRole: ["segundo"], mainProtein: "pescado_blanco", kcal: 286 }),
    ];
    const slots = [slot("lun_comida_1"), slot("lun_comida_2")];
    const assignments = [
      { slotId: "lun_comida_1", recipeId: "macarrones" },
      { slotId: "lun_comida_2", recipeId: "merluza" },
    ];
    const { violations } = validateMenu(assignments, pool, slots);
    expect(violations.map((v) => v.rule)).not.toContain("comida_desproporcionada");
  });

  it("applyFallback aligera la comida sustituyendo el segundo", () => {
    const pool = [
      recipe({ id: "pesto", name: "Pasta al pesto", mealRole: ["primero"], mainProtein: "none", kcal: 478 }),
      recipe({ id: "costillas", name: "Costillas", mealRole: ["segundo"], mainProtein: "cerdo", kcal: 528 }),
      recipe({ id: "merluza", name: "Merluza a la plancha", mealRole: ["segundo"], mainProtein: "pescado_blanco", kcal: 286 }),
    ];
    const slots = [slot("lun_comida_1"), slot("lun_comida_2")];
    const assignments = [
      { slotId: "lun_comida_1", recipeId: "pesto" },
      { slotId: "lun_comida_2", recipeId: "costillas" },
    ];
    const violations = [{ rule: "comida_desproporcionada", slotId: "lun_comida_2", message: "" }];
    const result = applyFallback(assignments, violations, pool, slots);
    expect(result.find((s) => s.slotId === "lun_comida_2")?.recipeId).toBe("merluza");
  });

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

  it("treats wheat-flour bases (pizza, wrap, quesadilla) as the same base as pan", () => {
    // These were invisible to the taxonomy, so a pizza lunch + bocadillo
    // dinner the same day was never flagged as a repeated base.
    expect(carbTypeFromText("Pizza casera")).toBe("pan");
    expect(carbTypeFromText("Wrap de pollo")).toBe("pan");
    expect(carbTypeFromText("Quesadillas caseras")).toBe("pan");
    expect(carbTypeFromText("Crema con sémola")).toBe("cuscus");
    expect(carbTypeFromText("Puré de boniato")).toBe("patatas");
  });

  it("flags arroz as primero and arroz as segundo in the same meal", () => {
    // Reported by a tester: "arroz de primero y arroz de segundo". The rule
    // existed but was only covered for comida vs cena, never for the two
    // courses of the same meal.
    const pool = [
      recipe({ id: "a", mealRole: ["primero"], name: "Arroz tres delicias", ingredients: [{ name: "Arroz" }] }),
      recipe({ id: "b", mealRole: ["segundo"], name: "Paella de pollo", ingredients: [{ name: "Arroz" }] }),
    ];
    const slots = [slot("lun_comida_1"), slot("lun_comida_2")];
    const assignments = [
      { slotId: "lun_comida_1", recipeId: "a" },
      { slotId: "lun_comida_2", recipeId: "b" },
    ];
    const { violations } = validateMenu(assignments, pool, slots);
    expect(violations.map((v) => v.rule)).toContain("guarnicion_repetida");
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

  describe("proteina_repetida_en_comida (same-meal primero+segundo, e.g. revuelto + tortilla)", () => {
    it("flags a huevo-based primero followed by a huevo-based segundo in the same comida", () => {
      const pool = [
        recipe({ id: "revuelto", mainProtein: "huevo", mealRole: ["primero"], name: "Revuelto de champiñones" }),
        recipe({ id: "tortilla", mainProtein: "huevo", mealRole: ["segundo"], name: "Tortilla de patatas" }),
      ];
      const slots = [slot("lun_comida_1"), slot("lun_comida_2")];
      const assignments = [
        { slotId: "lun_comida_1", recipeId: "revuelto" },
        { slotId: "lun_comida_2", recipeId: "tortilla" },
      ];
      const { violations } = validateMenu(assignments, pool, slots);
      expect(violations.map((v) => v.rule)).toContain("proteina_repetida_en_comida");
      expect(violations.find((v) => v.rule === "proteina_repetida_en_comida").slotId).toBe("lun_comida_2");
    });

    it("does not flag a neutral primero (soup/salad) paired with any segundo", () => {
      const pool = [
        recipe({ id: "ensalada", mainProtein: "none", mealRole: ["primero"] }),
        recipe({ id: "tortilla", mainProtein: "huevo", mealRole: ["segundo"] }),
      ];
      const slots = [slot("lun_comida_1"), slot("lun_comida_2")];
      const assignments = [
        { slotId: "lun_comida_1", recipeId: "ensalada" },
        { slotId: "lun_comida_2", recipeId: "tortilla" },
      ];
      const { violations } = validateMenu(assignments, pool, slots);
      expect(violations.map((v) => v.rule)).not.toContain("proteina_repetida_en_comida");
    });

    it("still ignores a same-protein primero vs. CENA the same day (rule 3's intentional relaxation stays intact)", () => {
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
      expect(violations.map((v) => v.rule)).not.toContain("proteina_repetida_en_comida");
      expect(violations.map((v) => v.rule)).not.toContain("proteina_consecutiva");
    });

    it("applyFallback replaces the segundo with something that doesn't repeat the primero's protein", () => {
      const pool = [
        recipe({ id: "revuelto", mainProtein: "huevo", mealRole: ["primero"] }),
        recipe({ id: "tortilla", mainProtein: "huevo", mealRole: ["segundo"] }),
        recipe({ id: "pollo_segundo", mainProtein: "pollo", mealRole: ["segundo"] }),
      ];
      const slots = [slot("lun_comida_1"), slot("lun_comida_2")];
      const assignments = [
        { slotId: "lun_comida_1", recipeId: "revuelto" },
        { slotId: "lun_comida_2", recipeId: "tortilla" },
      ];
      const { violations } = validateMenu(assignments, pool, slots);
      const fixed = applyFallback(assignments, violations, pool, slots);
      const finalSegundo = fixed.find((s) => s.slotId === "lun_comida_2");
      expect(finalSegundo.recipeId).toBe("pollo_segundo");
      const { violations: revalidated } = validateMenu(fixed, pool, slots);
      expect(revalidated.map((v) => v.rule)).not.toContain("proteina_repetida_en_comida");
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

  it("fills the segundo by relaxing carb repetition rather than leaving the meal with one dish", () => {
    // Reported by a tester: "puse dos platos en la comida, pero un día
    // aleatorio me pone solo 1". The only available segundo repeats the
    // primero's carb base — a soft preference. Repeating rice beats showing
    // a one-course lunch when two were configured.
    const pool = [
      recipe({ id: "primero", mealRole: ["primero"], name: "Arroz a la cubana", ingredients: [{ name: "Arroz" }] }),
      recipe({ id: "segundo", mealRole: ["segundo"], name: "Ensalada de arroz", ingredients: [{ name: "Arroz" }] }),
    ];
    const slots = [slot("lun_comida_1"), slot("lun_comida_2")];
    const violations = [{ rule: "slot_faltante", slotId: "lun_comida_2", message: "" }];
    const result = applyFallback(
      [{ slotId: "lun_comida_1", recipeId: "primero" }],
      violations, pool, slots,
    );
    expect(result.find((s) => s.slotId === "lun_comida_2")?.recipeId).toBe("segundo");
  });

  it("relaxes an unrelated guard rather than leaving arroz+arroz in the menu", () => {
    // The core of the tester's "arroz de primero y arroz de segundo" report:
    // the rule DID fire, but applyFallback found no replacement satisfying
    // every cross-guard at once and silently kept the offending dish.
    const pool = [
      recipe({ id: "primero", mealRole: ["primero"], name: "Arroz blanco", ingredients: [{ name: "Arroz" }] }),
      recipe({ id: "malo", mealRole: ["segundo"], name: "Paella", ingredients: [{ name: "Arroz" }] }),
      // Only alternative: fixes the carb clash but is a plato de cuchara like
      // the primero — previously rejected, leaving "Paella" in place.
      recipe({ id: "bueno", mealRole: ["segundo"], name: "Lentejas guisadas", category: "legumbres", ingredients: [{ name: "Lentejas" }] }),
    ];
    const slots = [slot("lun_comida_1"), slot("lun_comida_2")];
    const assignments = [
      { slotId: "lun_comida_1", recipeId: "primero" },
      { slotId: "lun_comida_2", recipeId: "malo" },
    ];
    const violations = [{ rule: "guarnicion_repetida", slotId: "lun_comida_2", message: "" }];
    const result = applyFallback(assignments, violations, pool, slots);
    expect(result.find((s) => s.slotId === "lun_comida_2")?.recipeId).toBe("bueno");
  });

  it("reports a violation it could not repair instead of keeping it silently", () => {
    const pool = [
      recipe({ id: "primero", mealRole: ["primero"], name: "Arroz blanco", ingredients: [{ name: "Arroz" }] }),
      recipe({ id: "malo", mealRole: ["segundo"], name: "Paella", ingredients: [{ name: "Arroz" }] }),
    ];
    const slots = [slot("lun_comida_1"), slot("lun_comida_2")];
    const assignments = [
      { slotId: "lun_comida_1", recipeId: "primero" },
      { slotId: "lun_comida_2", recipeId: "malo" },
    ];
    const violations = [{ rule: "guarnicion_repetida", slotId: "lun_comida_2", message: "" }];
    const result = applyFallback(assignments, violations, pool, slots);
    // No alternative exists, so the dish stays — but the gap is now reported.
    expect(result.find((s) => s.slotId === "lun_comida_2")?.recipeId).toBe("malo");
    expect(result.unfixedViolations.map((v) => v.rule)).toContain("guarnicion_repetida");
  });

  it("still refuses to fill a slot when the only candidate breaks a hard constraint", () => {
    // Relaxation must never reach maxTime/tupper — those are real user needs,
    // not menu-quality preferences.
    const pool = [recipe({ id: "a", mealRole: ["segundo"], time: 90 })];
    const slots = [slot("lun_comida_2", { maxTime: 15 })];
    const violations = [{ rule: "slot_faltante", slotId: "lun_comida_2", message: "" }];
    const result = applyFallback([], violations, pool, slots);
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

  it("relaxes maxTime as a last resort to avoid the SAME dish twice on the SAME day (comida y cena)", () => {
    // Reported by a tester: the same salad showed up for both comida and
    // cena the same day. applyFallback already never relaxes maxTime — so
    // when the only OTHER candidate ran over the time budget, it kept the
    // exact duplicate instead. An identical dish twice in one day is worse
    // than a distinct dish that's a few minutes over, so this is the one
    // case allowed to relax it.
    const pool = [
      recipe({ id: "ensalada_a", mealRole: ["primero", "cena"], time: 10 }),
      recipe({ id: "ensalada_b", mealRole: ["primero", "cena"], time: 35 }), // over budget
    ];
    const slots = [slot("lun_comida_1", { maxTime: 15 }), slot("lun_cena", { maxTime: 15 })];
    const assignments = [
      { slotId: "lun_comida_1", recipeId: "ensalada_a" },
      { slotId: "lun_cena", recipeId: "ensalada_a" },
    ];
    const violations = [
      { rule: "recipeId_repetido", slotId: "lun_cena", firstSlotId: "lun_comida_1", message: "" },
    ];
    const result = applyFallback(assignments, violations, pool, slots);
    expect(result.find((s) => s.slotId === "lun_cena")?.recipeId).toBe("ensalada_b");
  });

  it("does NOT relax maxTime for a repeat across different days — only same-day duplicates", () => {
    const pool = [
      recipe({ id: "ensalada_a", mealRole: ["primero", "cena"], time: 10 }),
      recipe({ id: "ensalada_b", mealRole: ["primero", "cena"], time: 35 }), // over budget
    ];
    const slots = [slot("lun_cena", { maxTime: 15 }), slot("mar_cena", { maxTime: 15 })];
    const assignments = [
      { slotId: "lun_cena", recipeId: "ensalada_a" },
      { slotId: "mar_cena", recipeId: "ensalada_a" },
    ];
    const violations = [
      { rule: "recipeId_repetido", slotId: "mar_cena", firstSlotId: "lun_cena", message: "" },
    ];
    const result = applyFallback(assignments, violations, pool, slots);
    // No in-budget alternative exists, and this isn't a same-day repeat, so
    // the cross-day repeat stands (the normal, tolerable outcome) instead of
    // pulling in the over-time dish.
    expect(result.find((s) => s.slotId === "mar_cena")?.recipeId).toBe("ensalada_a");
    expect(result.unfixedViolations.map((v) => v.rule)).toContain("recipeId_repetido");
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

  describe("cross-rule integration: fixing one violation must not reintroduce another", () => {
    // Bug this guards against: violations are fixed one at a time, in the
    // order validateMenu pushed them (roughly rule 0..11). The replacement
    // search for each violation only checked rule-specific carve-outs gated
    // by `v.rule === "<that rule>"`. So fixing a LATER rule (11,
    // freq_target_not_met) could pick a candidate that reintroduces an
    // EARLIER rule's violation (4b, school_carb_conflict) on the very same
    // cena slot, because nothing re-validated the whole menu between fixes.
    it("does not let a freq_target_not_met fix reintroduce a school_carb_conflict on the same slot", () => {
      const pool = [
        recipe({ id: "pollo_a", mainProtein: "pollo", mealRole: ["cena"] }), // currently assigned, not pescado
        // First pescado candidate in pool order — but its carb base ("arroz")
        // is exactly what the school already served that day.
        recipe({
          id: "pescado_arroz", category: "pescados", mainProtein: "pescado_blanco",
          mealRole: ["cena"], name: "Arroz con pescado", ingredients: [{ name: "Arroz" }],
        }),
        // Second pescado candidate — safe carb base, should be picked instead.
        recipe({
          id: "pescado_patatas", category: "pescados", mainProtein: "pescado_blanco",
          mealRole: ["cena"], name: "Pescado con patatas", ingredients: [{ name: "Patata" }],
        }),
      ];
      const slots = [slot("lun_cena", { schoolCarbsToAvoid: ["arroz"] })];
      const assignments = [{ slotId: "lun_cena", recipeId: "pollo_a" }];
      const violations = [
        { rule: "freq_target_not_met", slotId: "lun_cena", targetKey: "pescado", message: "" },
      ];
      const result = applyFallback(assignments, violations, pool, slots);
      const fixed = result.find((s) => s.slotId === "lun_cena")?.recipeId;
      expect(fixed).toBe("pescado_patatas");
      // Re-validating confirms both the freq deficit AND the school carb
      // rule are satisfied simultaneously, not just the rule that triggered
      // the fix.
      expect(validateMenu(result, pool, slots, [], { pescado: 1 }).valid).toBe(true);
    });

    it("does not let a freq_target_not_met fix reintroduce a legumbres_en_cena violation", () => {
      const pool = [
        recipe({ id: "pollo_a", mainProtein: "pollo", mealRole: ["cena"] }),
        // First legumbres candidate in pool order that would satisfy the
        // "legumbres" freq deficit but is illegal in cena.
        recipe({ id: "lentejas", category: "legumbres", mainProtein: "legumbre", mealRole: ["cena"] }),
        // No other legumbre alternative exists for cena — a huevo dish also
        // matches "legumbres"? No: use a second legumbre dish that IS cena-safe
        // is not realistic (legumbres_en_cena is a hard rule), so the deficit
        // should stay unresolved rather than break the hard rule.
      ];
      const slots = [slot("lun_cena")];
      const assignments = [{ slotId: "lun_cena", recipeId: "pollo_a" }];
      const violations = [
        { rule: "freq_target_not_met", slotId: "lun_cena", targetKey: "legumbres", message: "" },
      ];
      const result = applyFallback(assignments, violations, pool, slots);
      const fixed = result.find((s) => s.slotId === "lun_cena")?.recipeId;
      // The only "legumbres" candidate is illegal in cena, so applyFallback
      // must leave the slot as-is rather than trade one violation for another.
      expect(fixed).toBe("pollo_a");
      expect(validateMenu(result, pool, slots).valid ||
        validateMenu(result, pool, slots).violations.every((v) => v.rule !== "legumbres_en_cena")).toBe(true);
    });
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

describe("legumbres_en_cena por mainProtein (no solo por category)", () => {
  it("flags a legume-based dish filed under another category (crema de lentejas en sopas)", () => {
    const pool = [
      recipe({ id: "crema", category: "sopas_cremas", mainProtein: "legumbre", mealRole: ["cena"] }),
    ];
    const slots = [slot("lun_cena")];
    const assignments = [{ slotId: "lun_cena", recipeId: "crema" }];
    const { violations } = validateMenu(assignments, pool, slots);
    expect(violations.map((v) => v.rule)).toContain("legumbres_en_cena");
  });

  it("applyFallback no reintroduce una legumbre (por mainProtein) al arreglar una cena", () => {
    const pool = [
      recipe({ id: "crema", category: "sopas_cremas", mainProtein: "legumbre", mealRole: ["cena"] }),
      // Alternativa segura para cena que NO es legumbre.
      recipe({ id: "pescado_cena", category: "pescados", mainProtein: "pescado_blanco", mealRole: ["cena"] }),
    ];
    const slots = [slot("lun_cena")];
    const assignments = [{ slotId: "lun_cena", recipeId: "crema" }];
    const { violations } = validateMenu(assignments, pool, slots);
    const fixed = applyFallback(assignments, violations, pool, slots);
    const cena = fixed.find((s) => s.slotId === "lun_cena")?.recipeId;
    expect(cena).toBe("pescado_cena");
    expect(validateMenu(fixed, pool, slots).violations.map((v) => v.rule)).not.toContain("legumbres_en_cena");
  });
});

describe("proteina_repetida_en_dia (primero con proteína ↔ cena el mismo día, por grupo)", () => {
  it("flags a legume primero + legume cena the same day", () => {
    const pool = [
      recipe({ id: "crema_lentejas", category: "sopas_cremas", mainProtein: "legumbre", mealRole: ["primero"] }),
      // Otra legumbre en cena, category no-legumbres para que no la pare la regla 2.
      recipe({ id: "hummus_cena", category: "ensaladas_verduras", mainProtein: "legumbre", mealRole: ["cena"] }),
    ];
    const slots = [slot("lun_comida_1"), slot("lun_cena")];
    const assignments = [
      { slotId: "lun_comida_1", recipeId: "crema_lentejas" },
      { slotId: "lun_cena", recipeId: "hummus_cena" },
    ];
    const { violations } = validateMenu(assignments, pool, slots);
    expect(violations.map((v) => v.rule)).toContain("proteina_repetida_en_dia");
    expect(violations.find((v) => v.rule === "proteina_repetida_en_dia").slotId).toBe("lun_cena");
  });

  it("flags pollo primero + ternera cena the same day (mismo grupo carne)", () => {
    const pool = [
      recipe({ id: "pollo_primero", category: "carnes", mainProtein: "pollo", mealRole: ["primero"] }),
      recipe({ id: "ternera_cena", category: "carnes", mainProtein: "ternera", mealRole: ["cena"] }),
    ];
    const slots = [slot("lun_comida_1"), slot("lun_cena")];
    const assignments = [
      { slotId: "lun_comida_1", recipeId: "pollo_primero" },
      { slotId: "lun_cena", recipeId: "ternera_cena" },
    ];
    const { violations } = validateMenu(assignments, pool, slots);
    expect(violations.map((v) => v.rule)).toContain("proteina_repetida_en_dia");
  });

  it("does NOT flag a neutral primero (mainProtein none) + any cena", () => {
    const pool = [
      recipe({ id: "ensalada", category: "ensaladas_verduras", mainProtein: "none", mealRole: ["primero"] }),
      recipe({ id: "pollo_cena", category: "carnes", mainProtein: "pollo", mealRole: ["cena"] }),
    ];
    const slots = [slot("lun_comida_1"), slot("lun_cena")];
    const assignments = [
      { slotId: "lun_comida_1", recipeId: "ensalada" },
      { slotId: "lun_cena", recipeId: "pollo_cena" },
    ];
    const { violations } = validateMenu(assignments, pool, slots);
    expect(violations.map((v) => v.rule)).not.toContain("proteina_repetida_en_dia");
  });

  it("applyFallback swaps the cena to a different protein group than the day's primero", () => {
    const pool = [
      recipe({ id: "pollo_primero", category: "carnes", mainProtein: "pollo", mealRole: ["primero"] }),
      recipe({ id: "ternera_cena", category: "carnes", mainProtein: "ternera", mealRole: ["cena"] }),
      recipe({ id: "pescado_cena", category: "pescados", mainProtein: "pescado_blanco", mealRole: ["cena"] }),
    ];
    const slots = [slot("lun_comida_1"), slot("lun_cena")];
    const assignments = [
      { slotId: "lun_comida_1", recipeId: "pollo_primero" },
      { slotId: "lun_cena", recipeId: "ternera_cena" },
    ];
    const { violations } = validateMenu(assignments, pool, slots);
    const fixed = applyFallback(assignments, violations, pool, slots);
    expect(fixed.find((s) => s.slotId === "lun_cena")?.recipeId).toBe("pescado_cena");
    expect(validateMenu(fixed, pool, slots).violations.map((v) => v.rule)).not.toContain("proteina_repetida_en_dia");
  });
});

// D2 (Fase 5): legumbres compuestas conservan mainProtein "legumbre" pero
// registran su proteína animal en extraProteins para las reglas de variedad.
describe("extraProteins en legumbres compuestas (variedad mismo día / escolar)", () => {
  it("flags cocido (legumbre + carne) primero + carne cena el mismo día", () => {
    const pool = [
      recipe({
        id: "cocido",
        category: "legumbres",
        mainProtein: "legumbre",
        extraProteins: ["ternera", "cerdo", "pollo"],
        mealRole: ["primero", "plato_unico"],
      }),
      recipe({ id: "pollo_cena", category: "carnes", mainProtein: "pollo", mealRole: ["cena"] }),
    ];
    const slots = [slot("lun_comida_1"), slot("lun_cena")];
    const assignments = [
      { slotId: "lun_comida_1", recipeId: "cocido" },
      { slotId: "lun_cena", recipeId: "pollo_cena" },
    ];
    const { violations } = validateMenu(assignments, pool, slots);
    const v = violations.find((x) => x.rule === "proteina_repetida_en_dia");
    expect(v).toBeTruthy();
    expect(v.slotId).toBe("lun_cena");
  });

  it("NO flags cuando la cena es de otro grupo (pescado) que el cocido no cubre", () => {
    const pool = [
      recipe({
        id: "cocido",
        category: "legumbres",
        mainProtein: "legumbre",
        extraProteins: ["ternera", "cerdo", "pollo"],
        mealRole: ["primero", "plato_unico"],
      }),
      recipe({ id: "merluza_cena", category: "pescados", mainProtein: "pescado_blanco", mealRole: ["cena"] }),
    ];
    const slots = [slot("lun_comida_1"), slot("lun_cena")];
    const assignments = [
      { slotId: "lun_comida_1", recipeId: "cocido" },
      { slotId: "lun_cena", recipeId: "merluza_cena" },
    ];
    const { violations } = validateMenu(assignments, pool, slots);
    expect(violations.map((x) => x.rule)).not.toContain("proteina_repetida_en_dia");
  });

  it("school_protein_conflict detecta la proteína animal secundaria en cena", () => {
    const pool = [
      recipe({
        id: "potaje_bacalao",
        category: "legumbres",
        mainProtein: "legumbre",
        extraProteins: ["pescado_blanco"],
        mealRole: ["cena"],
      }),
    ];
    // El colegio ya cubrió pescado ese día → la cena con bacalao debe chocar,
    // aunque mainProtein siga siendo "legumbre".
    const slots = [slot("lun_cena", { schoolProteinsToAvoid: ["pescado"] })];
    const assignments = [{ slotId: "lun_cena", recipeId: "potaje_bacalao" }];
    const { violations } = validateMenu(assignments, pool, slots);
    // Nota: rule 2 (legumbres_en_cena) también dispara aquí; comprobamos el escolar.
    expect(violations.map((v) => v.rule)).toContain("school_protein_conflict");
  });
});

// D4a (Fase 5): no dos fritos en comidas consecutivas.
describe("dos_fritos_seguidos", () => {
  it("flags dos platos fritos en comidas consecutivas (mismo día)", () => {
    const pool = [
      recipe({ id: "croquetas", category: "platos_unicos", mainProtein: "cerdo", mealRole: ["primero", "plato_unico"], healthFlags: ["frito"] }),
      recipe({ id: "merluza_reboz", category: "pescados", mainProtein: "pescado_blanco", mealRole: ["cena"], healthFlags: ["frito"] }),
    ];
    const slots = [slot("lun_comida_1"), slot("lun_cena")];
    const assignments = [
      { slotId: "lun_comida_1", recipeId: "croquetas" },
      { slotId: "lun_cena", recipeId: "merluza_reboz" },
    ];
    const { violations } = validateMenu(assignments, pool, slots);
    expect(violations.map((v) => v.rule)).toContain("dos_fritos_seguidos");
  });

  it("NO flags cuando solo uno de los dos es frito", () => {
    const pool = [
      recipe({ id: "croquetas", category: "platos_unicos", mainProtein: "cerdo", mealRole: ["primero", "plato_unico"], healthFlags: ["frito"] }),
      recipe({ id: "merluza_plancha", category: "pescados", mainProtein: "pescado_blanco", mealRole: ["cena"], healthFlags: [] }),
    ];
    const slots = [slot("lun_comida_1"), slot("lun_cena")];
    const assignments = [
      { slotId: "lun_comida_1", recipeId: "croquetas" },
      { slotId: "lun_cena", recipeId: "merluza_plancha" },
    ];
    const { violations } = validateMenu(assignments, pool, slots);
    expect(violations.map((v) => v.rule)).not.toContain("dos_fritos_seguidos");
  });

  it("applyFallback sustituye por una alternativa no frita", () => {
    const pool = [
      recipe({ id: "croquetas", category: "platos_unicos", mainProtein: "cerdo", mealRole: ["primero", "plato_unico"], healthFlags: ["frito"] }),
      recipe({ id: "merluza_reboz", category: "pescados", mainProtein: "pescado_blanco", mealRole: ["cena"], healthFlags: ["frito"] }),
      recipe({ id: "merluza_plancha", category: "pescados", mainProtein: "pescado_blanco", mealRole: ["cena"], healthFlags: [] }),
    ];
    const slots = [slot("lun_comida_1"), slot("lun_cena")];
    const assignments = [
      { slotId: "lun_comida_1", recipeId: "croquetas" },
      { slotId: "lun_cena", recipeId: "merluza_reboz" },
    ];
    const { violations } = validateMenu(assignments, pool, slots);
    const fixed = applyFallback(assignments, violations, pool, slots);
    expect(validateMenu(fixed, pool, slots).violations.map((v) => v.rule)).not.toContain("dos_fritos_seguidos");
  });
});

// D4b (Fase 5): no dos platos de cuchara el mismo día.
describe("dos_cuchara_mismo_dia", () => {
  it("flags sopa (primero) + guiso (segundo) el mismo día", () => {
    const pool = [
      recipe({ id: "sopa", category: "sopas_cremas", mainProtein: "none", mealRole: ["primero"] }),
      recipe({ id: "guiso", name: "Guiso de ternera", category: "carnes", mainProtein: "ternera", mealRole: ["segundo"] }),
    ];
    const slots = [slot("lun_comida_1"), slot("lun_comida_2")];
    const assignments = [
      { slotId: "lun_comida_1", recipeId: "sopa" },
      { slotId: "lun_comida_2", recipeId: "guiso" },
    ];
    const { violations } = validateMenu(assignments, pool, slots);
    expect(violations.map((v) => v.rule)).toContain("dos_cuchara_mismo_dia");
  });

  it("NO flags un solo plato de cuchara al día", () => {
    const pool = [
      recipe({ id: "sopa", category: "sopas_cremas", mainProtein: "none", mealRole: ["primero"] }),
      recipe({ id: "filete", category: "carnes", mainProtein: "ternera", mealRole: ["segundo"] }),
    ];
    const slots = [slot("lun_comida_1"), slot("lun_comida_2")];
    const assignments = [
      { slotId: "lun_comida_1", recipeId: "sopa" },
      { slotId: "lun_comida_2", recipeId: "filete" },
    ];
    const { violations } = validateMenu(assignments, pool, slots);
    expect(violations.map((v) => v.rule)).not.toContain("dos_cuchara_mismo_dia");
  });
});
