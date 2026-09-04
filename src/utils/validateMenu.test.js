import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  validateMenu,
  buildCorrectionMessage,
  applyFallback,
  carbTypeFromText,
  splitAchievableFreqs,
  slotAcceptsRole,
  GUARD_FOR_RULE,
} from "./validateMenu.js";

function recipe(overrides) {
  // El nombre por defecto sale del id porque hay reglas que miran el NOMBRE
  // (dos ensaladas, mismo plato dos días seguidos): con "Receta" para todas,
  // cualquier par de fixtures parecía el mismo plato y las pruebas fallaban
  // por algo que no estaban probando.
  const id = overrides?.id ?? "r1";
  return {
    id: "r1",
    name: id,
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

describe("GUARD_FOR_RULE stays in sync with the rules validateMenu actually emits", () => {
  // Meta-test, deliberately reading the source: three keys in this map were
  // wrong or missing (a misspelled "proteina_misma_comida", a
  // "plato_frito_consecutivo" that never existed, plus two rules never mapped
  // at all). Each silently disabled the guard meant to protect that repair, so
  // applyFallback could "fix" a violation by swapping in another dish breaking
  // the same rule — how two egg dishes ended up in one comida. A hand-kept
  // list of rule names would drift the same way, so both sides are extracted
  // from the real source instead.
  const SOURCE = fs.readFileSync(
    path.join(path.dirname(fileURLToPath(import.meta.url)), "validateMenu.js"),
    "utf-8",
  );

  const emittedRuleNames = new Set(
    [...SOURCE.matchAll(/rule:\s*"([A-Za-z_]+)"/g)].map((m) => m[1]),
  );
  const softGuardKeys = new Set(
    [...(SOURCE.match(/const softGuards = \{[\s\S]*?\n {4}\};/) ?? [""])[0].matchAll(
      /^ {6}([a-zA-Z]+):/gm,
    )].map((m) => m[1]),
  );

  it("extracts a plausible set of rule names and guard keys from the source", () => {
    // Guards the regexes themselves: if they silently matched nothing, every
    // assertion below would vacuously pass.
    expect(emittedRuleNames.size).toBeGreaterThan(15);
    expect(softGuardKeys.size).toBeGreaterThan(5);
    expect(emittedRuleNames).toContain("proteina_repetida_en_comida");
    expect(softGuardKeys).toContain("sibling");
  });

  it("every GUARD_FOR_RULE key is a rule name validateMenu really emits", () => {
    const unknown = Object.keys(GUARD_FOR_RULE).filter((r) => !emittedRuleNames.has(r));
    expect(unknown).toEqual([]);
  });

  it("every GUARD_FOR_RULE value is a real softGuards key", () => {
    const unknown = Object.values(GUARD_FOR_RULE)
      .filter((g) => g !== null)
      .filter((g) => !softGuardKeys.has(g));
    expect(unknown).toEqual([]);
  });

  it("maps every rule that has a corresponding guard (no silent gaps)", () => {
    // Rules with no meaningful guard counterpart: structural/hard failures the
    // repair handles by other means, not by relaxing a soft preference.
    const INTENTIONALLY_UNMAPPED = new Set([
      "slot_faltante", "recipeId_not_in_catalog", "rol_incompatible_con_hueco",
      "tiempo_excedido", "tupper_not_friendly", "recipeId_repetido",
      "comida_sin_segundo", "health_profile_conflict", "freq_max_exceeded",
      "school_protein_conflict", "legumbres_en_cena",
    ]);
    const unmapped = [...emittedRuleNames].filter(
      (r) => !(r in GUARD_FOR_RULE) && !INTENTIONALLY_UNMAPPED.has(r),
    );
    expect(unmapped).toEqual([]);
  });
});

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

    it("flags a secondary protein (extraProteins) repeating the neighbor's protein, even with different mainProtein", () => {
      // Tester report: gambas showed up in nearly every slot of the week.
      // Root cause — "Revuelto de gambas y ajetes" (mainProtein huevo,
      // extraProteins ["marisco"]) as comida_2, immediately followed by
      // "Pasta con gambas" (mainProtein marisco) as that same day's cena.
      // Plain mainProtein equality (huevo !== marisco) missed this entirely.
      const pool = [
        recipe({ id: "revuelto_gambas", mainProtein: "huevo", extraProteins: ["marisco"], mealRole: ["segundo"] }),
        recipe({ id: "pasta_gambas", mainProtein: "marisco", mealRole: ["cena"] }),
      ];
      const slots = [slot("lun_comida_2"), slot("lun_cena")];
      const assignments = [
        { slotId: "lun_comida_2", recipeId: "revuelto_gambas" },
        { slotId: "lun_cena", recipeId: "pasta_gambas" },
      ];
      const { violations } = validateMenu(assignments, pool, slots);
      const v = violations.find((x) => x.rule === "proteina_consecutiva");
      expect(v).toBeTruthy();
      expect(v.slotId).toBe("lun_cena");
    });

    it("still allows switching between different meats on consecutive meals (pollo lunch, cerdo dinner)", () => {
      // Regression guard: rule 3 must stay FINE-grained (raw protein value),
      // not collapse to the coarse protein GROUP that rules 3c/15 use —
      // otherwise any two different meats in a row would wrongly collide.
      const pool = [
        recipe({ id: "pollo_comida", mainProtein: "pollo", mealRole: ["segundo"] }),
        recipe({ id: "cerdo_cena", mainProtein: "cerdo", mealRole: ["cena"] }),
      ];
      const slots = [slot("lun_comida_2"), slot("lun_cena")];
      const assignments = [
        { slotId: "lun_comida_2", recipeId: "pollo_comida" },
        { slotId: "lun_cena", recipeId: "cerdo_cena" },
      ];
      const { violations } = validateMenu(assignments, pool, slots);
      expect(violations.map((v) => v.rule)).not.toContain("proteina_consecutiva");
    });

    it("applyFallback resolves the extraProteins collision without reintroducing it", () => {
      const pool = [
        recipe({ id: "revuelto_gambas", mainProtein: "huevo", extraProteins: ["marisco"], mealRole: ["segundo"] }),
        recipe({ id: "pasta_gambas", mainProtein: "marisco", mealRole: ["cena"] }),
        recipe({ id: "pollo_cena", mainProtein: "pollo", mealRole: ["cena"] }),
      ];
      const slots = [slot("lun_comida_2"), slot("lun_cena")];
      const assignments = [
        { slotId: "lun_comida_2", recipeId: "revuelto_gambas" },
        { slotId: "lun_cena", recipeId: "pasta_gambas" },
      ];
      const { violations } = validateMenu(assignments, pool, slots);
      const fixed = applyFallback(assignments, violations, pool, slots);
      expect(fixed.find((s) => s.slotId === "lun_cena")?.recipeId).toBe("pollo_cena");
      expect(validateMenu(fixed, pool, slots).violations.map((v) => v.rule)).not.toContain("proteina_consecutiva");
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

  describe("weekly frequency CAPS (rule 11, config.freqs) — maximums, not minimums", () => {
    it("flags the excess when a category goes OVER its weekly cap", () => {
      // Tester report: "huevos: 2" was read as "at least 2", so 5 egg dishes
      // in one week went completely undetected. freqs are maximums now.
      const pool = [
        recipe({ id: "pollo_a", mainProtein: "pollo", mealRole: ["segundo"] }),
        recipe({ id: "pollo_b", mainProtein: "pollo", mealRole: ["segundo"] }),
      ];
      const slots = [slot("lun_comida_2"), slot("mar_comida_2")];
      const assignments = [
        { slotId: "lun_comida_2", recipeId: "pollo_a" },
        { slotId: "mar_comida_2", recipeId: "pollo_b" },
      ];
      const { violations } = validateMenu(assignments, pool, slots, [], { carne: 1 });
      const freqViolations = violations.filter((v) => v.rule === "freq_max_exceeded");
      expect(freqViolations).toHaveLength(1);
      expect(freqViolations[0].targetKey).toBe("carne");
      // The LATER occurrence is the one flagged as "the extra one".
      expect(freqViolations[0].slotId).toBe("mar_comida_2");
    });

    it("counts a secondary protein (extraProteins) toward its group's cap, not just its own category", () => {
      // Tester report: gambas in egg dishes ("Revuelto de gambas", category
      // huevos, mainProtein huevo, extraProteins ["marisco"]) never counted
      // toward the "pescado" cap, so marisco could stack up unbounded even
      // with pescado: 2 configured — only the (unrelated) huevos cap saw them.
      const pool = [
        recipe({ id: "revuelto_gambas_a", category: "huevos", mainProtein: "huevo", extraProteins: ["marisco"], mealRole: ["segundo"] }),
        recipe({ id: "revuelto_gambas_b", category: "huevos", mainProtein: "huevo", extraProteins: ["marisco"], mealRole: ["segundo"] }),
      ];
      const slots = [slot("lun_comida_2"), slot("mar_comida_2")];
      const assignments = [
        { slotId: "lun_comida_2", recipeId: "revuelto_gambas_a" },
        { slotId: "mar_comida_2", recipeId: "revuelto_gambas_b" },
      ];
      const { violations } = validateMenu(assignments, pool, slots, [], { pescado: 1 });
      const freqViolations = violations.filter((v) => v.rule === "freq_max_exceeded");
      expect(freqViolations).toHaveLength(1);
      expect(freqViolations[0].targetKey).toBe("pescado");
    });

    it("does not flag a category that's under or exactly at its cap", () => {
      const pool = [
        recipe({ id: "pescado_a", category: "pescados", mainProtein: "pescado_blanco", mealRole: ["segundo"] }),
      ];
      const slots = [slot("lun_comida_2")];
      const assignments = [{ slotId: "lun_comida_2", recipeId: "pescado_a" }];
      expect(validateMenu(assignments, pool, slots, [], { pescado: 1 }).valid).toBe(true);
      // Zero of a category is always fine now — no minimum to reach.
      expect(validateMenu(assignments, pool, slots, [], { legumbres: 3 }).valid).toBe(true);
    });

    it("is a no-op when freqs is empty or omitted (backward compatible)", () => {
      const pool = [recipe({ id: "a", mealRole: ["cena"] })];
      const slots = [slot("lun_cena")];
      const assignments = [{ slotId: "lun_cena", recipeId: "a" }];
      expect(validateMenu(assignments, pool, slots).valid).toBe(true);
      expect(validateMenu(assignments, pool, slots, [], {}).valid).toBe(true);
    });

    it("a dish counting toward two capped keys at once is only flagged once, not twice", () => {
      // "counts as both" dishes (e.g. a rice-and-egg plato) exhaust two caps
      // with one slot. Going over on BOTH keys because of the same dish
      // should still be a single violation on that slot, not one per key.
      const pool = [
        recipe({ id: "arroz_huevo", mainProtein: "huevo", category: "pasta_arroces", mealRole: ["segundo"] }),
        recipe({ id: "otro", mainProtein: "pollo", mealRole: ["segundo"] }),
      ];
      const slots = [slot("lun_comida_2"), slot("mar_comida_2")];
      const assignments = [
        { slotId: "lun_comida_2", recipeId: "otro" },
        { slotId: "mar_comida_2", recipeId: "arroz_huevo" },
      ];
      const freqs = { huevos: 0, pasta_arroz: 0 };
      const { violations } = validateMenu(assignments, pool, slots, [], freqs);
      const freqViolations = violations.filter((v) => v.rule === "freq_max_exceeded");
      expect(freqViolations).toHaveLength(1);
      expect(freqViolations[0].slotId).toBe("mar_comida_2");
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

  it("relaxes the kcal cap (weight) before the carb-repetition guard, not the other way round", () => {
    // The tier loop used to slice RELAX_ORDER from the END, relaxing guards in
    // exactly the reverse of the documented intent: `carb` (the "arroz de
    // primero y arroz de segundo" a tester reported) was the FIRST to go and
    // `weight` the last. Here the only two candidates each break one of those:
    // the correct pick is the one that busts the kcal cap while keeping the
    // carb bases distinct.
    const pool = [
      recipe({ id: "primero", mealRole: ["primero"], name: "Arroz blanco", kcal: 400, ingredients: [{ name: "Arroz" }] }),
      recipe({ id: "malo", mealRole: ["segundo"], name: "Pollo asado", kcal: 300, mainProtein: "pollo", ingredients: [] }),
      // Repeats the primero's carb base but is light -> respects `weight`, breaks `carb`.
      recipe({ id: "mismo_arroz", mealRole: ["segundo"], name: "Paella de pollo", kcal: 300, mainProtein: "pollo", ingredients: [{ name: "Arroz" }] }),
      // Different base but heavy -> breaks `weight`, respects `carb`. Preferred.
      recipe({ id: "pesado_distinto", mealRole: ["segundo"], name: "Ternera con patatas", kcal: 600, mainProtein: "ternera", ingredients: [{ name: "Patata" }] }),
    ];
    const slots = [slot("lun_comida_1"), slot("lun_comida_2")];
    const assignments = [
      { slotId: "lun_comida_1", recipeId: "primero" },
      { slotId: "lun_comida_2", recipeId: "malo" },
    ];
    // Repair driven by a rule whose mandatory guard is neither weight nor carb,
    // so both stay merely "soft" and their relaxation ORDER is what decides.
    const violations = [{ rule: "proteina_consecutiva", slotId: "lun_comida_2", message: "" }];
    const result = applyFallback(assignments, violations, pool, slots);
    expect(result.find((s) => s.slotId === "lun_comida_2")?.recipeId).toBe("pesado_distinto");
  });

  it("fixes proteina_repetida_en_comida without trading it for another same-protein dish", () => {
    // Bug: GUARD_FOR_RULE's key was misspelled ("proteina_misma_comida"
    // instead of the real rule name "proteina_repetida_en_comida"), so the
    // "sibling" guard — the one that stops a replacement from carrying the
    // sibling course's protein — was never protected as mandatory and could
    // be dropped like any other soft preference. Reported by a tester: two
    // egg dishes (primero + segundo) in the same comida.
    const pool = [
      recipe({ id: "huevos_primero", mainProtein: "huevo", mealRole: ["primero"] }),
      recipe({ id: "huevos_segundo", mainProtein: "huevo", mealRole: ["segundo"] }), // currently assigned (flagged)
      recipe({ id: "huevos_otro", mainProtein: "huevo", mealRole: ["segundo"] }), // still wrong — earlier in pool order
      recipe({ id: "pollo_segundo", mainProtein: "pollo", mealRole: ["segundo"] }),
    ];
    const slots = [slot("lun_comida_1"), slot("lun_comida_2")];
    const assignments = [
      { slotId: "lun_comida_1", recipeId: "huevos_primero" },
      { slotId: "lun_comida_2", recipeId: "huevos_segundo" },
    ];
    const violations = [
      { rule: "proteina_repetida_en_comida", slotId: "lun_comida_2", message: "" },
    ];
    const result = applyFallback(assignments, violations, pool, slots);
    expect(result.find((s) => s.slotId === "lun_comida_2")?.recipeId).toBe("pollo_segundo");
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

  it("also relaxes maxTime for a repeat across DIFFERENT days of the week (not just same-day)", () => {
    // Reported by a tester: "Pimientos del padrón" showed up as the comida
    // primero on both Monday and Thursday of the same week. A first version
    // of this fix only covered same-day duplicates — widened after the
    // report to any repeat within the week, since a distinct dish running
    // over the time budget still beats reusing a recipeId already in the menu.
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
    expect(result.find((s) => s.slotId === "mar_cena")?.recipeId).toBe("ensalada_b");
  });

  it("still leaves the repeat as unfixed when literally no distinct recipe fits the role at all", () => {
    const pool = [recipe({ id: "ensalada_a", mealRole: ["primero", "cena"], time: 10 })];
    const slots = [slot("lun_cena", { maxTime: 15 }), slot("mar_cena", { maxTime: 15 })];
    const assignments = [
      { slotId: "lun_cena", recipeId: "ensalada_a" },
      { slotId: "mar_cena", recipeId: "ensalada_a" },
    ];
    const violations = [
      { rule: "recipeId_repetido", slotId: "mar_cena", firstSlotId: "lun_cena", message: "" },
    ];
    const result = applyFallback(assignments, violations, pool, slots);
    expect(result.find((s) => s.slotId === "mar_cena")?.recipeId).toBe("ensalada_a");
    expect(result.unfixedViolations.map((v) => v.rule)).toContain("recipeId_repetido");
  });

  it("replaces a freq_max_exceeded violation with a recipe that doesn't ALSO count toward the exceeded key", () => {
    const pool = [
      recipe({ id: "pollo_a", mainProtein: "pollo", mealRole: ["segundo"] }),
      recipe({ id: "pescado_a", category: "pescados", mainProtein: "pescado_blanco", mealRole: ["segundo"] }),
    ];
    const slots = [slot("lun_comida_2")];
    // "pollo_a" is the offender pushing "carne" over its cap.
    const assignments = [{ slotId: "lun_comida_2", recipeId: "pollo_a" }];
    const violations = [
      { rule: "freq_max_exceeded", slotId: "lun_comida_2", targetKey: "carne", message: "" },
    ];
    const result = applyFallback(assignments, violations, pool, slots);
    expect(result.find((s) => s.slotId === "lun_comida_2")?.recipeId).toBe("pescado_a");
  });

  describe("cross-rule integration: fixing one violation must not reintroduce another", () => {
    // Bug this guards against: violations are fixed one at a time, in the
    // order validateMenu pushed them (roughly rule 0..11). The replacement
    // search for each violation only checked rule-specific carve-outs gated
    // by `v.rule === "<that rule>"`. So fixing a LATER rule (11,
    // freq_max_exceeded) could pick a candidate that reintroduces an
    // EARLIER rule's violation (4b, school_carb_conflict) on the very same
    // cena slot, because nothing re-validated the whole menu between fixes.
    it("does not let a freq_max_exceeded fix reintroduce a school_carb_conflict on the same slot", () => {
      const pool = [
        // Currently assigned, the offender pushing "pescado" over its cap.
        recipe({ id: "pescado_original", category: "pescados", mainProtein: "pescado_blanco", mealRole: ["cena"] }),
        // First non-pescado candidate in pool order — but its carb base
        // ("arroz") is exactly what the school already served that day.
        recipe({
          id: "pollo_arroz", mainProtein: "pollo",
          mealRole: ["cena"], name: "Arroz con pollo", ingredients: [{ name: "Arroz" }],
        }),
        // Second non-pescado candidate — safe carb base, should be picked instead.
        recipe({
          id: "pollo_patatas", mainProtein: "pollo",
          mealRole: ["cena"], name: "Pollo con patatas", ingredients: [{ name: "Patata" }],
        }),
      ];
      const slots = [slot("lun_cena", { schoolCarbsToAvoid: ["arroz"] })];
      const assignments = [{ slotId: "lun_cena", recipeId: "pescado_original" }];
      const violations = [
        { rule: "freq_max_exceeded", slotId: "lun_cena", targetKey: "pescado", message: "" },
      ];
      const result = applyFallback(assignments, violations, pool, slots);
      const fixed = result.find((s) => s.slotId === "lun_cena")?.recipeId;
      expect(fixed).toBe("pollo_patatas");
      // Re-validating confirms both the freq cap AND the school carb rule are
      // satisfied simultaneously, not just the rule that triggered the fix.
      expect(validateMenu(result, pool, slots, [], { pescado: 0 }).valid).toBe(true);
    });

    it("does not let a freq_max_exceeded fix reintroduce a legumbres_en_cena violation", () => {
      const pool = [
        // Currently assigned, the offender pushing "carne" over its cap.
        recipe({ id: "pollo_a", mainProtein: "pollo", mealRole: ["cena"] }),
        // The only non-"carne" candidate is a legumbre dish — illegal in
        // cena regardless of its own declared mealRole (hard rule).
        recipe({ id: "lentejas", category: "legumbres", mainProtein: "legumbre", mealRole: ["cena"] }),
      ];
      const slots = [slot("lun_cena")];
      const assignments = [{ slotId: "lun_cena", recipeId: "pollo_a" }];
      const violations = [
        { rule: "freq_max_exceeded", slotId: "lun_cena", targetKey: "carne", message: "" },
      ];
      const result = applyFallback(assignments, violations, pool, slots);
      const fixed = result.find((s) => s.slotId === "lun_cena")?.recipeId;
      // The only non-"carne" candidate is illegal in cena, so applyFallback
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

describe("dos_ensaladas_en_comida", () => {
  it("flags un primero y un segundo ambos llamados \"ensalada\", aunque sean de categorías distintas", () => {
    // Reproduce el caso reportado: la ensalada de rúcula (category
    // ensaladas_verduras, mealRole primero) y la ensalada de pollo asado
    // (category carnes, mealRole segundo/plato_unico — un rol legítimo para
    // una "ensalada completa"). Ni el category ni el mainProtein coinciden,
    // así que ninguna otra regla los pilla — solo el nombre.
    const pool = [
      recipe({ id: "ens_rucula", name: "Ensalada de rúcula, parmesano y piñones", category: "ensaladas_verduras", mainProtein: "none", mealRole: ["primero"] }),
      recipe({ id: "ens_pollo", name: "Ensalada de pollo asado de bolsa con nueces y queso", category: "carnes", mainProtein: "pollo", mealRole: ["segundo", "plato_unico"] }),
    ];
    const slots = [slot("mar_comida_1"), slot("mar_comida_2")];
    const assignments = [
      { slotId: "mar_comida_1", recipeId: "ens_rucula" },
      { slotId: "mar_comida_2", recipeId: "ens_pollo" },
    ];
    const { violations } = validateMenu(assignments, pool, slots);
    expect(violations.map((v) => v.rule)).toContain("dos_ensaladas_en_comida");
    expect(violations.find((v) => v.rule === "dos_ensaladas_en_comida").slotId).toBe("mar_comida_2");
  });

  it("NO flags una sola ensalada de primero con un segundo normal", () => {
    const pool = [
      recipe({ id: "ens_rucula", name: "Ensalada de rúcula, parmesano y piñones", category: "ensaladas_verduras", mainProtein: "none", mealRole: ["primero"] }),
      recipe({ id: "atun", name: "Atún a la plancha", category: "pescados", mainProtein: "pescado_azul", mealRole: ["segundo"] }),
    ];
    const slots = [slot("lun_comida_1"), slot("lun_comida_2")];
    const assignments = [
      { slotId: "lun_comida_1", recipeId: "ens_rucula" },
      { slotId: "lun_comida_2", recipeId: "atun" },
    ];
    const { violations } = validateMenu(assignments, pool, slots);
    expect(violations.map((v) => v.rule)).not.toContain("dos_ensaladas_en_comida");
  });

  it("NO flags un segundo que lleva ensalada de guarnición (\"ensalada\" no está al principio del nombre)", () => {
    // "Salmón a la plancha con ensalada de pepino y eneldo" es un plato de
    // pescado con una ensalada de acompañamiento, no "una ensalada" — muy
    // distinto de "Ensalada de pollo asado..." donde SÍ lo es. Real, del
    // catálogo: 35 segundos contienen "ensalada" en el nombre así.
    const pool = [
      recipe({ id: "ens_rucula", name: "Ensalada de rúcula, parmesano y piñones", category: "ensaladas_verduras", mainProtein: "none", mealRole: ["primero"] }),
      recipe({ id: "salmon", name: "Salmón a la plancha con ensalada de pepino y eneldo", category: "pescados", mainProtein: "pescado_azul", mealRole: ["segundo"] }),
    ];
    const slots = [slot("lun_comida_1"), slot("lun_comida_2")];
    const assignments = [
      { slotId: "lun_comida_1", recipeId: "ens_rucula" },
      { slotId: "lun_comida_2", recipeId: "salmon" },
    ];
    const { violations } = validateMenu(assignments, pool, slots);
    expect(violations.map((v) => v.rule)).not.toContain("dos_ensaladas_en_comida");
  });

  it("applyFallback sustituye el segundo por un plato sin \"ensalada\" en el nombre", () => {
    const pool = [
      recipe({ id: "ens_rucula", name: "Ensalada de rúcula, parmesano y piñones", category: "ensaladas_verduras", mainProtein: "none", mealRole: ["primero"] }),
      recipe({ id: "ens_pollo", name: "Ensalada de pollo asado de bolsa con nueces y queso", category: "carnes", mainProtein: "pollo", mealRole: ["segundo", "plato_unico"] }),
      recipe({ id: "merluza", name: "Merluza al horno", category: "pescados", mainProtein: "pescado_blanco", mealRole: ["segundo"] }),
    ];
    const slots = [slot("mar_comida_1"), slot("mar_comida_2")];
    const assignments = [
      { slotId: "mar_comida_1", recipeId: "ens_rucula" },
      { slotId: "mar_comida_2", recipeId: "ens_pollo" },
    ];
    const { violations } = validateMenu(assignments, pool, slots);
    const fixed = applyFallback(assignments, violations, pool, slots);
    expect(fixed.find((s) => s.slotId === "mar_comida_2")?.recipeId).toBe("merluza");
    expect(validateMenu(fixed, pool, slots).violations.map((v) => v.rule)).not.toContain("dos_ensaladas_en_comida");
  });
});

describe("guarnicion_cena_consecutiva (misma base de hidratos en cenas de días consecutivos)", () => {
  it("flags pasta lun_cena + pasta mar_cena", () => {
    const pool = [
      recipe({ id: "esp_lun", name: "Espaguetis a la boloñesa", category: "pasta_arroces", mainProtein: "ternera", mealRole: ["cena"] }),
      recipe({ id: "mac_mar", name: "Macarrones con tomate", category: "pasta_arroces", mainProtein: "none", mealRole: ["cena"] }),
    ];
    const slots = [slot("lun_cena"), slot("mar_cena")];
    const assignments = [
      { slotId: "lun_cena", recipeId: "esp_lun" },
      { slotId: "mar_cena", recipeId: "mac_mar" },
    ];
    const { violations } = validateMenu(assignments, pool, slots);
    expect(violations.map((v) => v.rule)).toContain("guarnicion_cena_consecutiva");
    expect(violations.find((v) => v.rule === "guarnicion_cena_consecutiva").slotId).toBe("mar_cena");
  });

  it("does NOT flag pasta lun_cena + pasta mié_cena (no son días consecutivos)", () => {
    const pool = [
      recipe({ id: "esp_lun", name: "Espaguetis a la boloñesa", category: "pasta_arroces", mainProtein: "ternera", mealRole: ["cena"] }),
      recipe({ id: "pollo_mar", category: "carnes", mainProtein: "pollo", mealRole: ["cena"] }),
      recipe({ id: "mac_mie", name: "Macarrones con tomate", category: "pasta_arroces", mainProtein: "none", mealRole: ["cena"] }),
    ];
    const slots = [slot("lun_cena"), slot("mar_cena"), slot("mie_cena")];
    const assignments = [
      { slotId: "lun_cena", recipeId: "esp_lun" },
      { slotId: "mar_cena", recipeId: "pollo_mar" },
      { slotId: "mie_cena", recipeId: "mac_mie" },
    ];
    const { violations } = validateMenu(assignments, pool, slots);
    expect(violations.map((v) => v.rule)).not.toContain("guarnicion_cena_consecutiva");
  });

  it("applyFallback swaps the second cena to a different carb base and doesn't reintroduce the clash", () => {
    const pool = [
      recipe({ id: "esp_lun", name: "Espaguetis a la boloñesa", category: "pasta_arroces", mainProtein: "ternera", mealRole: ["cena"] }),
      recipe({ id: "mac_mar", name: "Macarrones con tomate", category: "pasta_arroces", mainProtein: "none", mealRole: ["cena"] }),
      recipe({ id: "tortilla_mar", name: "Tortilla francesa", category: "huevos", mainProtein: "huevo", mealRole: ["cena"] }),
    ];
    const slots = [slot("lun_cena"), slot("mar_cena")];
    const assignments = [
      { slotId: "lun_cena", recipeId: "esp_lun" },
      { slotId: "mar_cena", recipeId: "mac_mar" },
    ];
    const { violations } = validateMenu(assignments, pool, slots);
    const fixed = applyFallback(assignments, violations, pool, slots);
    expect(fixed.find((s) => s.slotId === "mar_cena")?.recipeId).toBe("tortilla_mar");
    expect(validateMenu(fixed, pool, slots).violations.map((v) => v.rule)).not.toContain("guarnicion_cena_consecutiva");
  });
});

describe("proteina_cena_consecutiva (mismo grupo de proteína en cenas de días consecutivos)", () => {
  it("flags huevo lun_cena + huevo mar_cena (el caso reportado: huevos varias noches seguidas)", () => {
    const pool = [
      recipe({ id: "huevos_lun", name: "Huevos rellenos", category: "huevos", mainProtein: "huevo", mealRole: ["cena"] }),
      recipe({ id: "huevos_mar", name: "Huevos fritos con puntillas", category: "huevos", mainProtein: "huevo", mealRole: ["cena"] }),
    ];
    const slots = [slot("lun_cena"), slot("mar_cena")];
    const assignments = [
      { slotId: "lun_cena", recipeId: "huevos_lun" },
      { slotId: "mar_cena", recipeId: "huevos_mar" },
    ];
    const { violations } = validateMenu(assignments, pool, slots);
    expect(violations.map((v) => v.rule)).toContain("proteina_cena_consecutiva");
    expect(violations.find((v) => v.rule === "proteina_cena_consecutiva").slotId).toBe("mar_cena");
  });

  it("flags via extraProteins (cocido de ternera lun_cena + filete de ternera mar_cena)", () => {
    const pool = [
      recipe({
        id: "cocido_lun", name: "Cocido madrileño", category: "legumbres", mainProtein: "legumbre",
        extraProteins: ["ternera"], mealRole: ["cena"],
      }),
      recipe({ id: "filete_mar", name: "Filete de ternera", category: "carnes", mainProtein: "ternera", mealRole: ["cena"] }),
    ];
    const slots = [slot("lun_cena"), slot("mar_cena")];
    const assignments = [
      { slotId: "lun_cena", recipeId: "cocido_lun" },
      { slotId: "mar_cena", recipeId: "filete_mar" },
    ];
    const { violations } = validateMenu(assignments, pool, slots);
    expect(violations.map((v) => v.rule)).toContain("proteina_cena_consecutiva");
  });

  it("does NOT flag huevo lun_cena + huevo mié_cena (no son días consecutivos)", () => {
    const pool = [
      recipe({ id: "huevos_lun", name: "Huevos rellenos", category: "huevos", mainProtein: "huevo", mealRole: ["cena"] }),
      recipe({ id: "pollo_mar", category: "carnes", mainProtein: "pollo", mealRole: ["cena"] }),
      recipe({ id: "huevos_mie", name: "Huevos fritos", category: "huevos", mainProtein: "huevo", mealRole: ["cena"] }),
    ];
    const slots = [slot("lun_cena"), slot("mar_cena"), slot("mie_cena")];
    const assignments = [
      { slotId: "lun_cena", recipeId: "huevos_lun" },
      { slotId: "mar_cena", recipeId: "pollo_mar" },
      { slotId: "mie_cena", recipeId: "huevos_mie" },
    ];
    const { violations } = validateMenu(assignments, pool, slots);
    expect(violations.map((v) => v.rule)).not.toContain("proteina_cena_consecutiva");
  });

  it("applyFallback swaps the second cena to a different protein group and doesn't reintroduce the clash", () => {
    const pool = [
      recipe({ id: "huevos_lun", name: "Huevos rellenos", category: "huevos", mainProtein: "huevo", mealRole: ["cena"] }),
      recipe({ id: "huevos_mar", name: "Huevos fritos con puntillas", category: "huevos", mainProtein: "huevo", mealRole: ["cena"] }),
      recipe({ id: "pescado_mar", name: "Merluza a la plancha", category: "pescados", mainProtein: "pescado_blanco", mealRole: ["cena"] }),
    ];
    const slots = [slot("lun_cena"), slot("mar_cena")];
    const assignments = [
      { slotId: "lun_cena", recipeId: "huevos_lun" },
      { slotId: "mar_cena", recipeId: "huevos_mar" },
    ];
    const { violations } = validateMenu(assignments, pool, slots);
    const fixed = applyFallback(assignments, violations, pool, slots);
    expect(fixed.find((s) => s.slotId === "mar_cena")?.recipeId).toBe("pescado_mar");
    expect(validateMenu(fixed, pool, slots).violations.map((v) => v.rule)).not.toContain("proteina_cena_consecutiva");
  });
});

describe("mismo plato dos días seguidos (regla 3e)", () => {
  // Reportado: hummus el lunes y el martes de primero, y quesadillas el martes
  // y el miércoles. Las quesadillas eran DOS recetas distintas -carnes_120 y
  // ensaladas_verduras_035-, con categoría y proteína distintas, así que no
  // las veía ni la regla de receta repetida ni ninguna de las de proteína.
  const dia = (id, name, roles) => recipe({ id, name, mealRole: roles, mainProtein: "none", category: "ensaladas_verduras" });

  it("caza dos quesadillas en días seguidos aunque sean recetas distintas", () => {
    const pool = [
      dia("q1", "Quesadillas de queso y jamón con guacamole", ["segundo"]),
      dia("q2", "Quesadilla de champiñones y queso", ["primero"]),
      dia("otro", "Crema de calabacín", ["primero"]),
    ];
    const slots = [slot("mar_comida_2"), slot("mie_comida_1")];
    const assignments = [
      { slotId: "mar_comida_2", recipeId: "q1" },
      { slotId: "mie_comida_1", recipeId: "q2" },
    ];
    const { violations } = validateMenu(assignments, pool, slots);
    expect(violations.map((v) => v.rule)).toContain("mismo_plato_seguido");
  });

  it("y lo repara con un plato de otra familia", () => {
    // Con sus segundos: sin ellos saltaría además `comida_sin_segundo` y sería
    // ESA reparación -no la de esta regla- la que moviera los platos.
    const pool = [
      dia("h1", "Hummus de aguacate y lima", ["primero"]),
      dia("h2", "Hummus de guisantes y menta", ["primero"]),
      dia("otro", "Crema de calabacín", ["primero"]),
      recipe({ id: "s1", name: "Filete de ternera", mainProtein: "ternera", mealRole: ["segundo"] }),
      recipe({ id: "s2", name: "Merluza al horno", mainProtein: "pescado_blanco", mealRole: ["segundo"] }),
    ];
    const slots = [slot("lun_comida_1"), slot("lun_comida_2"), slot("mar_comida_1"), slot("mar_comida_2")];
    const assignments = [
      { slotId: "lun_comida_1", recipeId: "h1" },
      { slotId: "lun_comida_2", recipeId: "s1" },
      { slotId: "mar_comida_1", recipeId: "h2" },
      { slotId: "mar_comida_2", recipeId: "s2" },
    ];
    const { violations } = validateMenu(assignments, pool, slots);
    expect(violations.map((v) => v.rule)).toEqual(["mismo_plato_seguido"]);
    const result = applyFallback(assignments, violations, pool, slots);
    expect(result.find((s) => s.slotId === "mar_comida_1")?.recipeId).toBe("otro");
  });

  it("no se queja de dos platos que solo comparten el ingrediente, no el plato", () => {
    const pool = [
      dia("a", "Crema de calabacín", ["primero"]),
      dia("b", "Salteado de calabacín con gambas", ["primero"]),
    ];
    const slots = [slot("lun_comida_1"), slot("mar_comida_1")];
    const assignments = [
      { slotId: "lun_comida_1", recipeId: "a" },
      { slotId: "mar_comida_1", recipeId: "b" },
    ];
    const { violations } = validateMenu(assignments, pool, slots);
    expect(violations.map((v) => v.rule)).not.toContain("mismo_plato_seguido");
  });
});

describe("platos de ocasión entre semana (regla 3f)", () => {
  // "Nadie en España toma cigalas a la plancha un puñetero martes para comer."
  // Y el generador no podía saberlo: para él son un segundo de pescado, fácil
  // y de 15 minutos — igual que un filete.
  const cigalas = recipe({
    id: "cigalas", name: "Cigalas a la plancha con alioli de azafrán",
    category: "pescados", mainProtein: "marisco", mealRole: ["segundo"], occasion: "especial",
  });
  const filete = recipe({
    id: "filete", name: "Filete de ternera a la plancha",
    category: "carnes", mainProtein: "ternera", mealRole: ["segundo"],
  });

  it("las caza de lunes a viernes", () => {
    const slots = [slot("mar_comida_2")];
    const assignments = [{ slotId: "mar_comida_2", recipeId: "cigalas" }];
    const { violations } = validateMenu(assignments, [cigalas, filete], slots);
    expect(violations.map((v) => v.rule)).toContain("plato_ocasion_entre_semana");
  });

  it("y las deja en paz el fin de semana, que es donde viven", () => {
    const slots = [slot("dom_comida_2")];
    const assignments = [{ slotId: "dom_comida_2", recipeId: "cigalas" }];
    const { violations } = validateMenu(assignments, [cigalas, filete], slots);
    expect(violations.map((v) => v.rule)).not.toContain("plato_ocasion_entre_semana");
  });

  it("las cambia por un plato de diario al reparar", () => {
    const slots = [slot("mar_comida_2")];
    const assignments = [{ slotId: "mar_comida_2", recipeId: "cigalas" }];
    const { violations } = validateMenu(assignments, [cigalas, filete], slots);
    const result = applyFallback(assignments, violations, [cigalas, filete], slots);
    expect(result[0].recipeId).toBe("filete");
  });
});
