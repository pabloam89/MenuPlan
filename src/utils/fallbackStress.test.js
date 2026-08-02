// Stress test: can the DETERMINISTIC layer alone produce a complete, safe menu?
//
// Simulates the worst realistic failure — the LLM returns nothing at all — and
// checks that validateMenu + applyFallback still fill every slot of a full week
// for a range of real-world restriction profiles.
//
// This is the "bulletproof" contract, in decreasing order of severity:
//   1. SAFETY   — never a dish outside the allergen/intolerance-filtered pool.
//   2. COMPLETE — never an empty slot (a hole is always worse than repetition).
//   3. HONEST   — anything it cannot fix is reported, never silently shipped.
//
// Quality rules (variety, no repeated base…) are explicitly best-effort here:
// with a tiny pool they are impossible to satisfy, and this test asserts the
// system degrades in that order rather than breaking a stronger guarantee.

import { describe, it, expect } from "vitest";
import { validateMenu, applyFallback } from "./validateMenu.js";
import { recipeCatalog } from "../data/recipeCatalog.js";
import { filterRecipes } from "./filterRecipes.js";

const DAYS = ["lun", "mar", "mie", "jue", "vie", "sab", "dom"];

// A full week: comida (primero + segundo) + cena, like the default config.
function buildWeekSlots({ maxTime = 60, mode = "normal" } = {}) {
  const slots = [];
  for (const daySlug of DAYS) {
    const primeroMaxTime = Math.max(10, Math.round(maxTime * 0.4));
    const segundoMaxTime = Math.max(10, maxTime - primeroMaxTime);
    slots.push({ slotId: `${daySlug}_comida_1`, daySlug, mealType: "comida", position: "primero", maxTime: primeroMaxTime, mode });
    slots.push({ slotId: `${daySlug}_comida_2`, daySlug, mealType: "comida", position: "segundo", maxTime: segundoMaxTime, mode });
    slots.push({ slotId: `${daySlug}_cena`, daySlug, mealType: "cena", maxTime, mode });
  }
  return slots;
}

// Restriction profiles, from permissive to punishing. The last few are
// deliberately near-infeasible: they exist to pin down HOW the system fails.
const PROFILES = [
  { name: "sin restricciones", opts: {}, slotOpts: {} },
  { name: "alergia a lactosa", opts: { allergies: ["lacteos"] }, slotOpts: {} },
  { name: "alergia a gluten", opts: { allergies: ["gluten"] }, slotOpts: {} },
  { name: "gluten + lacteos", opts: { allergies: ["gluten", "lacteos"] }, slotOpts: {} },
  { name: "frutos secos + huevo + pescado", opts: { allergies: ["frutos_secos", "huevo", "pescado"] }, slotOpts: {} },
  { name: "intolerancia fructosa", opts: { intolerances: ["fructosa"] }, slotOpts: {} },
  { name: "con niños (sin alcohol)", opts: { hasKids: true }, slotOpts: {} },
  { name: "tiempo justo (30 min)", opts: {}, slotOpts: { maxTime: 30 } },
  { name: "tiempo muy justo (20 min)", opts: {}, slotOpts: { maxTime: 20 } },
  { name: "modo tupper", opts: {}, slotOpts: { mode: "tupper" } },
  { name: "gluten + 30 min + tupper", opts: { allergies: ["gluten"] }, slotOpts: { maxTime: 30, mode: "tupper" } },
  { name: "extremo: 4 alergias + 25 min + tupper", opts: { allergies: ["gluten", "lacteos", "huevo", "pescado"] }, slotOpts: { maxTime: 25, mode: "tupper" } },
];

function runProfile(profile) {
  const slots = buildWeekSlots(profile.slotOpts);
  // filterRecipes reads the catalog itself and returns { recipes, error }.
  // `error` is the existing up-front feasibility guard: it refuses to generate
  // a menu at all when the surviving pool is too small/monotonous, which is
  // exactly the case no fallback could rescue anyway.
  const { recipes: filteredPool, error: poolError } = filterRecipes({
    maxTime: profile.slotOpts.maxTime ?? 120,
    ...profile.opts,
  });

  // Worst case: the LLM produced nothing at all.
  let assignments = [];
  // Mirror the real loop: validate, then let the deterministic layer repair.
  const { violations } = validateMenu(assignments, filteredPool, slots);
  assignments = applyFallback(assignments, violations, filteredPool, slots);

  const poolIds = new Set(filteredPool.map((r) => r.id));
  return {
    filteredPool,
    poolError,
    slots,
    assignments,
    filled: assignments.length,
    total: slots.length,
    outsidePool: assignments.filter((s) => !poolIds.has(s.recipeId)),
    unfixed: assignments.unfixedViolations ?? [],
  };
}

describe("fallback stress: LLM total failure, deterministic layer alone", () => {
  for (const profile of PROFILES) {
    describe(profile.name, () => {
      const r = runProfile(profile);

      it("GUARANTEE 1 — never assigns a dish outside the safe pool", () => {
        expect(r.outsidePool).toEqual([]);
      });

      it("GUARANTEE 2 — fills every slot, or the pool was rejected up front", () => {
        // A hole is only acceptable when filterRecipes already refused to
        // generate (poolError). If it green-lit the pool, the deterministic
        // layer must be able to complete the week on its own.
        if (!r.poolError) {
          expect(r.filled).toBe(r.total);
        }
      });

      it("GUARANTEE 3 — any repetition it had to use is reported", () => {
        // Repetition is allowed to keep the week complete, but never silently:
        // the UI needs to explain it, so it must be listed.
        const repeated = r.assignments.repeatedForCompleteness ?? [];
        const distinct = new Set(r.assignments.map((s) => s.recipeId)).size;
        const duplicates = r.assignments.length - distinct;
        expect(repeated.length).toBeGreaterThanOrEqual(duplicates);
      });
    });
  }

  it("documents the real coverage of every profile (visible in test output)", () => {
    const report = PROFILES.map((p) => {
      const r = runProfile(p);
      return {
        perfil: p.name,
        pool: r.filteredPool.length,
        cobertura: `${r.filled}/${r.total}`,
        huecos: r.total - r.filled,
        rechazado: r.poolError ? "sí" : "no",
      };
    });
    // eslint-disable-next-line no-console
    console.table(report);
    expect(report.length).toBe(PROFILES.length);
  });
});
