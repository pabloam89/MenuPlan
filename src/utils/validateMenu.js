/**
 * Validate a slot assignment from the LLM against business rules.
 * Returns { valid: true } or { valid: false, violations: [...] }.
 *
 * Each violation: { rule, slotId, message }
 */

import { HEALTH_PROFILE_BADGE } from "../lib/healthProfileMatch.js";

// Health profiles that trigger a correctable violation below. `anemia` is a
// presence-based profile ("must contain iron-rich flag") rather than
// absence-based ("must not contain risk flag") — treating it the same way
// would flag almost every slot in the week as a violation and fight the
// variety/carb-repetition rules. It stays pure LLM soft-bias, matching the
// "prioriza" (not "excluye") wording in the SYSTEM_PROMPT.
const CORRECTABLE_HEALTH_PROFILES = new Set(
  Object.keys(HEALTH_PROFILE_BADGE).filter((id) => id !== "anemia"),
);

// ── Carb-type extraction ─────────────────────────────────────────
// Used to detect same-day "guarnición" repetition without catalog edits.
// Matches recipe name + ingredient list, most specific pattern first.
const CARB_PATTERNS = [
  [/arroz|paella|risotto/, "arroz"],
  [/pasta|macarr[oó]n|espagueti|tallar[íi]n|fideo|penne|lasa[ñn]a|canelones|ravioli/, "pasta"],
  [/patata|papa\b/, "patatas"],
  [/quinoa/, "quinoa"],
  [/c[uú]sc[uú]s|couscous/, "cuscus"],
  [/\bpan\b|s[áa]ndwich|bocadillo|tostada|rebanada/, "pan"],
];

// Text-only carb classifier — exported so aiPlanner.js can classify the
// school menu's free-text dish names (which have no ingredients array) with
// the exact same taxonomy used below, instead of a second regex list that
// could drift out of sync.
export function carbTypeFromText(text) {
  const normalized = String(text ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
  for (const [pattern, carbType] of CARB_PATTERNS) {
    if (pattern.test(normalized)) return carbType;
  }
  return null;
}

export function getCarbType(recipe) {
  return carbTypeFromText([recipe.name, ...recipe.ingredients.map((i) => i.name)].join(" "));
}

// ── Meal ordering (chronological across the whole week) ─────────
// Shared by rule 3 (consecutive-protein) below and by applyFallback's
// targeted fix for that same rule, so both agree on what "adjacent meal"
// means — a slot's neighbors in this array are always its true chronological
// prev/next main meal, including across a day boundary (cena day N ->
// comida day N+1).
const DAY_ORDER = ["lun", "mar", "mie", "jue", "vie", "sab", "dom"];

// Coarse protein grouping shared by the school-conflict rule (4), the new
// same-day clash rule (3c) and applyFallback, so "no repetir carne/pescado el
// mismo día" means the same thing everywhere. Anything not mapped (e.g.
// "none") falls through to its raw value.
const PROTEIN_GROUP_MAP = {
  pollo: "carne", pavo: "carne", cerdo: "carne", ternera: "carne",
  pescado_blanco: "pescado", pescado_azul: "pescado", marisco: "pescado",
  legumbre: "legumbres", huevo: "huevos",
};

function proteinGroup(mainProtein) {
  return PROTEIN_GROUP_MAP[mainProtein] ?? mainProtein;
}

function buildMealOrder(slotAssignments) {
  const mealOrder = [];
  for (const { slotId, recipeId } of slotAssignments) {
    const parts = slotId.split("_");
    const daySlug = parts[0];
    const mealType = parts[1];
    const position = parts[2];
    const dayIdx = DAY_ORDER.indexOf(daySlug);
    mealOrder.push({ slotId, recipeId, daySlug, dayIdx, mealType, position });
  }
  mealOrder.sort((a, b) => {
    if (a.dayIdx !== b.dayIdx) return a.dayIdx - b.dayIdx;
    if (a.mealType === "comida" && b.mealType === "cena") return -1;
    if (a.mealType === "cena" && b.mealType === "comida") return 1;
    return (a.position ?? "").localeCompare(b.position ?? "");
  });
  return mealOrder;
}

// A "comida_1" slot is normally a light primero (soup/salad, mainProtein
// "none") that shouldn't collide-check against segundo/cena — EXCEPT when it
// holds a plato_unico (paella, cocido...), which carries the day's actual
// protein just like any other main dish and must stay visible to rule 3.
// Recipes that don't resolve in `poolById` (already flagged by rule 1) are
// treated as non-main, same as before.
function mainMealsOf(mealOrder, poolById) {
  return mealOrder.filter((m) => {
    if (!(m.mealType === "comida" && m.position === "1")) return true;
    const r = poolById[m.recipeId];
    return Boolean(r?.mealRole?.includes("plato_unico"));
  });
}

// ── Weekly frequency targets (config.freqs) ──────────────────────
// Mirrors the SYSTEM_PROMPT's "OBJETIVOS SEMANALES (config.freqs)" mapping
// exactly (aiPlanner.js), so the deterministic check enforces the same
// categories the LLM is asked to aim for. A recipe can count toward more
// than one key (e.g. a chicken-and-rice dish is both "carne" and
// "pasta_arroz"), matching the prompt's own per-bullet "category X OR
// mainProtein Y" wording.
export const FREQ_KEY_MATCHERS = {
  carne: (r) =>
    r.category === "carnes" || ["pollo", "pavo", "cerdo", "ternera"].includes(r.mainProtein),
  pescado: (r) =>
    r.category === "pescados" ||
    ["pescado_blanco", "pescado_azul", "marisco"].includes(r.mainProtein),
  legumbres: (r) => r.category === "legumbres" || r.mainProtein === "legumbre",
  huevos: (r) => r.category === "huevos" || r.mainProtein === "huevo",
  pasta_arroz: (r) => r.category === "pasta_arroces",
  verdura: (r) => r.category === "ensaladas_verduras" || r.category === "sopas_cremas",
};

/**
 * Split a freqs target into the keys the filtered pool can realistically
 * satisfy vs. the ones it can't — e.g. `{ pescado: 2 }` when only one pescado
 * recipe survived the allergy/preference filter. Retrying the LLM (or the
 * deterministic fallback) can never fix an unachievable key, since there
 * simply aren't enough matching recipes in the pool to place — so callers
 * should only feed `achievable` into validateMenu's rule 11, and surface
 * `warnings` to the user instead of silently shipping an unbalanced week.
 *
 * @param {Object[]} filteredPool
 * @param {Object} freqs - e.g. { carne: 3, pescado: 2, ... }
 * @returns {{ achievable: Object, warnings: string[] }}
 */
export function splitAchievableFreqs(filteredPool, freqs) {
  const achievable = {};
  const warnings = [];
  for (const [key, target] of Object.entries(freqs ?? {})) {
    if (!target || target <= 0) continue;
    const matcher = FREQ_KEY_MATCHERS[key];
    if (!matcher) continue; // unknown/custom key — ignore rather than crash
    const available = filteredPool.filter(matcher).length;
    if (available < target) {
      warnings.push(
        `El objetivo semanal de "${key}" (${target}/semana) no es alcanzable: solo hay ${available} receta(s) de esa categoría tras aplicar alergias/preferencias. Se ha omitido ese objetivo para no bloquear el menú.`,
      );
    } else {
      achievable[key] = target;
    }
  }
  return { achievable, warnings };
}

export function validateMenu(
  slotAssignments,
  filteredPool,
  slotsContext,
  activeHealthProfiles = [],
  freqs = {},
) {
  const violations = [];
  const poolIds = new Set(filteredPool.map((r) => r.id));
  const poolById = Object.fromEntries(filteredPool.map((r) => [r.id, r]));

  const contextBySlot = Object.fromEntries(
    slotsContext.map((s) => [s.slotId, s]),
  );

  const mealOrder = buildMealOrder(slotAssignments);

  const returnedIds = new Set(slotAssignments.map((s) => s.slotId));

  // Build comidaByDay once — reused by rules 7 and future macro checks
  const comidaByDay = {};
  for (const m of mealOrder) {
    if (m.mealType !== "comida") continue;
    if (!comidaByDay[m.daySlug]) comidaByDay[m.daySlug] = {};
    comidaByDay[m.daySlug][m.position] = m;
  }

  // 0. Missing slots — every expected slot must be covered
  for (const ctx of slotsContext) {
    if (!returnedIds.has(ctx.slotId)) {
      violations.push({
        rule: "slot_faltante",
        slotId: ctx.slotId,
        message: `El LLM no devolvió asignación para ${ctx.slotId}`,
      });
    }
  }

  // 1. All recipeIds must exist in filtered pool
  for (const { slotId, recipeId } of slotAssignments) {
    if (!poolIds.has(recipeId)) {
      violations.push({
        rule: "recipeId_not_in_catalog",
        slotId,
        message: `recipeId "${recipeId}" no existe en el catálogo filtrado`,
      });
    }
  }

  // 2. No legumbres in cena slots — matched by category OR mainProtein, so a
  // legume-based dish filed under another category (e.g. "Crema de lentejas"
  // in sopas_cremas, mainProtein "legumbre") is caught too, aligning with the
  // SYSTEM_PROMPT and with FREQ_KEY_MATCHERS.legumbres.
  for (const { slotId, recipeId, mealType } of mealOrder) {
    if (mealType !== "cena") continue;
    const recipe = poolById[recipeId];
    if (!recipe) continue;
    if (recipe.category === "legumbres" || recipe.mainProtein === "legumbre") {
      violations.push({
        rule: "legumbres_en_cena",
        slotId,
        message: `"${recipe.name}" es legumbre y no debería ir en cena`,
      });
    }
  }

  // 2b. "cenas_rapidas" only allowed in slots the user explicitly marked cena_rapida
  for (const { slotId, recipeId } of slotAssignments) {
    const recipe = poolById[recipeId];
    if (!recipe || recipe.category !== "cenas_rapidas") continue;
    const ctx = contextBySlot[slotId];
    if (ctx?.preferType === "cena_rapida") continue;
    violations.push({
      rule: "cena_rapida_no_solicitada",
      slotId,
      message: `"${recipe.name}" es de category "cenas_rapidas" pero el slot no fue marcado como cena rápida`,
    });
  }

  // 3. No repeated mainProtein in consecutive meals (including across a day
  // boundary: cena day N and comida_2 day N+1 are adjacent in mainMeals once
  // comida_1 primeros are filtered out — see mainMealsOf above for the
  // plato_unico carve-in).
  const mainMeals = mainMealsOf(mealOrder, poolById);
  for (let i = 1; i < mainMeals.length; i++) {
    const prev = mainMeals[i - 1];
    const curr = mainMeals[i];
    const prevR = poolById[prev.recipeId];
    const currR = poolById[curr.recipeId];
    if (!prevR || !currR) continue;
    if (
      prevR.mainProtein !== "none" &&
      currR.mainProtein !== "none" &&
      prevR.mainProtein === currR.mainProtein
    ) {
      violations.push({
        rule: "proteina_consecutiva",
        slotId: curr.slotId,
        message: `Proteína "${currR.mainProtein}" repetida entre ${prev.slotId} y ${curr.slotId}`,
      });
    }
  }

  // 3b. Same mainProtein for BOTH primero and segundo of the SAME comida —
  // e.g. a huevo-based primero (revuelto) followed by a huevo-based segundo
  // (tortilla) on the exact same meal. Rule 3 above deliberately keeps a
  // genuine primero (soup/salad) out of the cross-meal/cross-day sequence
  // (see mainMealsOf) so a light starter never blocks an unrelated dinner —
  // but that relaxation was never meant to allow the identical protein twice
  // within ONE comida. Scoped to same-day primero+segundo only, so it can
  // never re-flag the comida_1-vs-cena case rule 3 intentionally allows.
  for (const [daySlug, positions] of Object.entries(comidaByDay)) {
    const slot1 = positions["1"];
    const slot2 = positions["2"];
    if (!slot1 || !slot2) continue;
    const r1 = poolById[slot1.recipeId];
    const r2 = poolById[slot2.recipeId];
    if (!r1 || !r2) continue;
    if (r1.mainProtein !== "none" && r1.mainProtein === r2.mainProtein) {
      violations.push({
        rule: "proteina_repetida_en_comida",
        slotId: slot2.slotId,
        message: `"${r2.name}" repite la proteína "${r2.mainProtein}" del primero ("${r1.name}") de la misma comida (${daySlug})`,
      });
    }
  }

  // 3c. Same-day protein-group clash from the comida_1 primero. Rule 3 filters
  // comida_1 primeros out of the consecutive sequence and rule 3b only compares
  // the two halves of a comida by *exact* protein — so a primero that actually
  // carries a protein (e.g. "Crema de lentejas", mainProtein "legumbre") could
  // share the day with a same-group cena undetected. Compared by protein GROUP
  // (carne/pescado/legumbres/huevos), scoped to comida_1 ↔ cena of the same day
  // so it never re-flags the comida_1-vs-cena "light starter" case rule 3
  // intentionally allows for a *neutral* (mainProtein "none") primero.
  for (const [daySlug, positions] of Object.entries(comidaByDay)) {
    const primero = positions["1"];
    if (!primero) continue;
    const r1 = poolById[primero.recipeId];
    if (!r1 || r1.mainProtein === "none") continue;
    const g1 = proteinGroup(r1.mainProtein);
    for (const m of mealOrder) {
      if (m.daySlug !== daySlug || m.mealType !== "cena") continue;
      const r2 = poolById[m.recipeId];
      if (!r2 || r2.mainProtein === "none") continue;
      if (proteinGroup(r2.mainProtein) === g1) {
        violations.push({
          rule: "proteina_repetida_en_dia",
          slotId: m.slotId,
          message: `"${r2.name}" repite el grupo de proteína "${g1}" del primero ("${r1.name}") el mismo día (${daySlug})`,
        });
      }
    }
  }

  // 4. schoolProteinsToAvoid respected in cena
  for (const { slotId, recipeId, mealType } of mealOrder) {
    if (mealType !== "cena") continue;
    const ctx = contextBySlot[slotId];
    if (!ctx?.schoolProteinsToAvoid?.length) continue;
    const recipe = poolById[recipeId];
    if (!recipe) continue;
    const recipeProteinGroup = proteinGroup(recipe.mainProtein);
    if (ctx.schoolProteinsToAvoid.includes(recipeProteinGroup)) {
      violations.push({
        rule: "school_protein_conflict",
        slotId,
        message: `"${recipe.name}" tiene proteína "${recipeProteinGroup}" que el menú escolar ya cubrió`,
      });
    }
  }

  // 4b. schoolCarbsToAvoid respected in cena — same idea as rule 4 above but
  // for the carbohydrate base (e.g. school served arroz at lunch, so dinner
  // shouldn't also be arroz-based). Reuses the same carb taxonomy as rule 9's
  // same-day guarnición-repetida check below, via getCarbType.
  for (const { slotId, recipeId, mealType } of mealOrder) {
    if (mealType !== "cena") continue;
    const ctx = contextBySlot[slotId];
    if (!ctx?.schoolCarbsToAvoid?.length) continue;
    const recipe = poolById[recipeId];
    if (!recipe) continue;
    const carb = getCarbType(recipe);
    if (carb && ctx.schoolCarbsToAvoid.includes(carb)) {
      violations.push({
        rule: "school_carb_conflict",
        slotId,
        message: `"${recipe.name}" tiene base "${carb}" que el menú escolar ya cubrió`,
      });
    }
  }

  // 5. tupperFriendly in tupper slots
  for (const { slotId, recipeId } of slotAssignments) {
    const ctx = contextBySlot[slotId];
    if (!ctx || ctx.mode !== "tupper") continue;
    const recipe = poolById[recipeId];
    if (!recipe) continue;
    if (!recipe.tupperFriendly) {
      violations.push({
        rule: "tupper_not_friendly",
        slotId,
        message: `"${recipe.name}" no es apta para tupper pero el slot lo requiere`,
      });
    }
  }

  // 6. No repeated recipeId in the week
  const usedRecipeIds = new Map();
  for (const { slotId, recipeId } of slotAssignments) {
    if (usedRecipeIds.has(recipeId)) {
      violations.push({
        rule: "recipeId_repetido",
        slotId,
        message: `recipeId "${recipeId}" ya usado en ${usedRecipeIds.get(recipeId)}`,
      });
    } else {
      usedRecipeIds.set(recipeId, slotId);
    }
  }

  // 7. Comida structure: primero+segundo or plato_unico
  for (const [daySlug, positions] of Object.entries(comidaByDay)) {
    const slot1 = positions["1"];
    const slot2 = positions["2"];
    if (slot1 && !slot2) {
      const recipe = poolById[slot1.recipeId];
      if (recipe && !recipe.mealRole.includes("plato_unico")) {
        violations.push({
          rule: "comida_sin_segundo",
          slotId: slot1.slotId,
          message: `${daySlug}: solo hay primero "${recipe.name}" sin segundo, y no es plato_unico`,
        });
      }
    }
  }

  // 8. Time constraint: recipe.time must be ≤ slot maxTime
  for (const { slotId, recipeId } of slotAssignments) {
    const ctx = contextBySlot[slotId];
    if (!ctx?.maxTime) continue;
    const recipe = poolById[recipeId];
    if (!recipe) continue;
    if (recipe.time > ctx.maxTime) {
      violations.push({
        rule: "tiempo_excedido",
        slotId,
        message: `"${recipe.name}" (${recipe.time}min) excede el límite de ${ctx.maxTime}min`,
      });
    }
  }

  // 9. Same carb base within the same day (comida_1 + comida_2 + cena)
  // Catches cases like: sopa de fideos (pasta) + espaguetis (pasta) the same day
  const dayUsedCarbs = {};
  for (const m of mealOrder) {
    const recipe = poolById[m.recipeId];
    if (!recipe) continue;
    const carb = getCarbType(recipe);
    if (!carb) continue;
    if (!dayUsedCarbs[m.daySlug]) dayUsedCarbs[m.daySlug] = new Map();
    const dayCarbs = dayUsedCarbs[m.daySlug];
    if (dayCarbs.has(carb)) {
      violations.push({
        rule: "guarnicion_repetida",
        slotId: m.slotId,
        message: `"${recipe.name}" tiene base "${carb}" repetida el ${m.daySlug} (también en ${dayCarbs.get(carb)})`,
      });
    } else {
      dayCarbs.set(carb, m.slotId);
    }
  }

  // 10. Health-profile conflicts — reuses the exact rules the dish-detail
  // badge uses (matchingHealthProfiles), so a violation here means "the badge
  // would show this dish as non-compliant for an active profile". Soft and
  // correctable like every other rule above, never a hard block (see
  // applyFallback's carve-out): this is the deterministic backstop for the
  // SYSTEM_PROMPT's "PERFILES DE SALUD" instruction, which the LLM can ignore.
  const activeProfileIds = Array.from(new Set(activeHealthProfiles ?? [])).filter((id) =>
    CORRECTABLE_HEALTH_PROFILES.has(id),
  );
  if (activeProfileIds.length > 0) {
    for (const { slotId, recipeId } of slotAssignments) {
      const recipe = poolById[recipeId];
      if (!recipe) continue;
      const flags = recipe.healthFlags ?? [];
      const violated = activeProfileIds.filter((id) => !HEALTH_PROFILE_BADGE[id].matches(flags));
      if (violated.length > 0) {
        violations.push({
          rule: "health_profile_conflict",
          slotId,
          message: `"${recipe.name}" no cumple el/los perfil(es) de salud activos: ${violated.join(", ")}`,
        });
      }
    }
  }

  // 11. Weekly frequency targets (config.freqs) — soft, correctable quotas
  // for how many times each food-group key (carne/pescado/legumbres/huevos/
  // pasta_arroz/verdura) should appear across the week. `freqs` is expected
  // to already be the *achievable* subset (see splitAchievableFreqs) — every
  // key here is one the filtered pool has enough recipes for, so a violation
  // is always in principle fixable by swapping some other slot. Soft and
  // correctable like every other rule above: retried through the LLM, then a
  // deterministic carve-out in applyFallback, never a hard block — this is
  // the deterministic backstop for the SYSTEM_PROMPT's "OBJETIVOS SEMANALES"
  // instruction, which today is pure LLM soft-bias with no code-side check.
  if (freqs && Object.keys(freqs).length > 0) {
    const freqCounts = {};
    for (const key of Object.keys(freqs)) freqCounts[key] = 0;
    const matchedKeysBySlot = {};
    for (const { slotId, recipeId } of slotAssignments) {
      const recipe = poolById[recipeId];
      if (!recipe) continue;
      const matched = new Set();
      for (const key of Object.keys(freqs)) {
        const matcher = FREQ_KEY_MATCHERS[key];
        if (matcher?.(recipe)) {
          freqCounts[key]++;
          matched.add(key);
        }
      }
      matchedKeysBySlot[slotId] = matched;
    }

    const claimedDonors = new Set();
    for (const [key, target] of Object.entries(freqs)) {
      const missing = target - (freqCounts[key] ?? 0);
      if (missing <= 0) continue;

      // Donor slots: not already claimed by another deficit this pass, don't
      // already count toward THIS key, and — for every other key their
      // current dish does count toward — that key has slack (count > target),
      // so donating them away doesn't just trade one deficit for another.
      // Walked in mealOrder for a stable, deterministic pick.
      const donors = mealOrder.filter((m) => {
        if (claimedDonors.has(m.slotId)) return false;
        const matched = matchedKeysBySlot[m.slotId];
        if (!matched) return false;
        if (matched.has(key)) return false;
        for (const k of matched) {
          if ((freqCounts[k] ?? 0) <= (freqs[k] ?? 0)) return false;
        }
        return true;
      });

      for (const donor of donors.slice(0, missing)) {
        claimedDonors.add(donor.slotId);
        const donorRecipe = poolById[donor.recipeId];
        violations.push({
          rule: "freq_target_not_met",
          slotId: donor.slotId,
          targetKey: key,
          message: `Objetivo semanal "${key}" no alcanzado (actual ${freqCounts[key]}/${target}). Sustituye "${donorRecipe?.name ?? donor.recipeId}" (${donor.slotId}) por una receta de esa categoría si encaja en el hueco.`,
        });
      }
    }
  }

  return { valid: violations.length === 0, violations };
}

/**
 * Build a correction prompt from validation violations.
 */
export function buildCorrectionMessage(violations) {
  const lines = violations.map(
    (v) => `- [${v.rule}] ${v.slotId}: ${v.message}`,
  );
  return `Tu asignación viola estas reglas:\n${lines.join("\n")}\n\nCorrige SOLO los slots afectados y devuelve el JSON completo {"slots":[...]} con TODOS los slots (corregidos y no corregidos).`;
}

/**
 * Deterministic fallback: fix violations by replacing offending recipes
 * with the first valid alternative from the filtered pool.
 * Also fills missing slots that the LLM omitted.
 */
export function applyFallback(slotAssignments, violations, filteredPool, slotsContext, activeHealthProfiles = []) {
  const result = slotAssignments.map((s) => ({ ...s }));
  const poolById = Object.fromEntries(filteredPool.map((r) => [r.id, r]));
  const contextBySlot = Object.fromEntries(
    slotsContext.map((s) => [s.slotId, s]),
  );
  const usedIds = new Set(result.map((s) => s.recipeId));

  // Fill missing slots first
  const missingViolations = violations.filter((v) => v.rule === "slot_faltante");
  for (const v of missingViolations) {
    const ctx = contextBySlot[v.slotId];
    if (!ctx) continue;
    const mealType = v.slotId.split("_")[1];
    const position = v.slotId.split("_")[2];
    const daySlug = v.slotId.split("_")[0];

    // Carb types already used this day (to avoid creating new guarnicion_repetida)
    const dayCarbsUsed = new Set();
    for (const s of result) {
      if (!s.slotId.startsWith(daySlug + "_")) continue;
      const r = poolById[s.recipeId];
      if (r) { const c = getCarbType(r); if (c) dayCarbsUsed.add(c); }
    }

    const candidate = filteredPool.find((r) => {
      if (usedIds.has(r.id)) return false;
      if (ctx.maxTime && r.time > ctx.maxTime) return false;
      if (ctx.mode === "tupper" && !r.tupperFriendly) return false;
      if (ctx.preferType !== "cena_rapida" && r.category === "cenas_rapidas") return false;
      const carb = getCarbType(r);
      if (carb && dayCarbsUsed.has(carb)) return false;

      if (mealType === "cena") return r.mealRole.includes("cena");
      if (position === "1") return r.mealRole.some((role) => role === "primero" || role === "plato_unico");
      if (position === "2") return r.mealRole.includes("segundo");
      return true;
    });

    if (candidate) {
      result.push({ slotId: v.slotId, recipeId: candidate.id });
      usedIds.add(candidate.id);
    }
  }

  // Fix other violations by replacing offending recipes
  const otherViolations = violations.filter((v) => v.rule !== "slot_faltante");
  for (const v of otherViolations) {
    const idx = result.findIndex((s) => s.slotId === v.slotId);
    if (idx === -1) continue;
    const slot = result[idx];
    const ctx = contextBySlot[slot.slotId];
    const mealType = slot.slotId.split("_")[1];
    const daySlug = slot.slotId.split("_")[0];

    // Carb types already used this day (excluding current slot) — always
    // computed and always enforced below, not just when the violation being
    // fixed IS guarnicion_repetida. Rationale: violations are processed one
    // at a time in rule order, so a fix applied for a LATER rule (e.g. rule
    // 11 freq_target_not_met) must not reintroduce a violation of an EARLIER
    // rule (e.g. rule 9 guarnicion_repetida) that already passed. Since
    // nothing re-validates the whole menu between fixes within this same
    // pass, every candidate search has to independently respect every
    // context-derived constraint, regardless of which rule triggered it.
    const dayCarbsUsed = new Set();
    for (const s of result) {
      if (s.slotId === slot.slotId) continue;
      if (!s.slotId.startsWith(daySlug + "_")) continue;
      const r = poolById[s.recipeId];
      if (r) { const c = getCarbType(r); if (c) dayCarbsUsed.add(c); }
    }

    // Same rationale as dayCarbsUsed above, for rule 3 (proteina_consecutiva):
    // always mirror the neighbor(s) — prev and next in the current mainMeals
    // sequence — the same way rule 3 itself finds them, using the live
    // `result` so earlier fixes in this same pass are reflected. Always
    // enforced below so fixing an unrelated later violation can never
    // reintroduce a same-protein collision that already passed.
    const neighborProteins = new Set();
    {
      const order = mainMealsOf(buildMealOrder(result), poolById);
      const orderIdx = order.findIndex((m) => m.slotId === slot.slotId);
      if (orderIdx !== -1) {
        for (const neighbor of [order[orderIdx - 1], order[orderIdx + 1]]) {
          if (!neighbor) continue;
          const nr = poolById[neighbor.recipeId];
          if (nr && nr.mainProtein !== "none") neighborProteins.add(nr.mainProtein);
        }
      }
    }

    // Same-comida sibling (primero<->segundo) protein — mirrors rule 3b: a
    // replacement for either half of a comida must never reintroduce the
    // exact protein its sibling already carries this same meal.
    let siblingProtein = null;
    {
      const pos = slot.slotId.split("_")[2];
      if (mealType === "comida" && (pos === "1" || pos === "2")) {
        const siblingSlotId = `${daySlug}_comida_${pos === "1" ? "2" : "1"}`;
        const siblingRecipeId = result.find((s) => s.slotId === siblingSlotId)?.recipeId;
        const siblingRecipe = siblingRecipeId ? poolById[siblingRecipeId] : null;
        if (siblingRecipe && siblingRecipe.mainProtein !== "none") siblingProtein = siblingRecipe.mainProtein;
      }
    }

    // Same-day comida_1 primero protein GROUP — mirrors rule 3c: when replacing
    // a cena, never reintroduce the protein group already carried by that day's
    // primero (e.g. don't pick a legumbre cena when the comida_1 is a lentil
    // cream). Enforced unconditionally for the same cross-rule-safety reason as
    // the guards above.
    let sameDayPrimeroGroup = null;
    if (mealType === "cena") {
      const primeroRecipeId = result.find((s) => s.slotId === `${daySlug}_comida_1`)?.recipeId;
      const primeroRecipe = primeroRecipeId ? poolById[primeroRecipeId] : null;
      if (primeroRecipe && primeroRecipe.mainProtein !== "none") {
        sameDayPrimeroGroup = proteinGroup(primeroRecipe.mainProtein);
      }
    }

    const replacement = filteredPool.find((r) => {
      if (usedIds.has(r.id) && r.id !== slot.recipeId) return false;
      if (r.id === slot.recipeId) return false;

      if (siblingProtein && r.mainProtein === siblingProtein) return false;

      if (ctx?.maxTime && r.time > ctx.maxTime) return false;
      // legumbres_en_cena, school_protein_conflict, school_carb_conflict,
      // guarnicion_repetida and proteina_consecutiva below are enforced
      // unconditionally (not gated to `v.rule === "..."`) for the same
      // cross-rule-safety reason as dayCarbsUsed/neighborProteins above: a
      // replacement picked to fix violation N must never reintroduce a
      // violation of rule M that was already resolved (or never triggered)
      // earlier in this same pass.
      if (mealType === "cena" && (r.category === "legumbres" || r.mainProtein === "legumbre")) return false;
      if (v.rule === "tupper_not_friendly" && !r.tupperFriendly) return false;
      if (ctx?.preferType !== "cena_rapida" && r.category === "cenas_rapidas") return false;

      if (mealType === "cena" && !r.mealRole.includes("cena")) return false;
      if (mealType === "comida") {
        const pos = slot.slotId.split("_")[2];
        if (pos === "1" && !r.mealRole.some((role) => role === "primero" || role === "plato_unico")) return false;
        if (pos === "2" && !r.mealRole.includes("segundo")) return false;
      }

      if (ctx?.mode === "tupper" && !r.tupperFriendly) return false;

      if (mealType === "cena" && ctx?.schoolProteinsToAvoid) {
        if (ctx.schoolProteinsToAvoid.includes(proteinGroup(r.mainProtein))) return false;
      }

      // Rule 3c cross-safety: a cena replacement must not share the protein
      // group of the same day's comida_1 primero.
      if (sameDayPrimeroGroup && r.mainProtein !== "none" && proteinGroup(r.mainProtein) === sameDayPrimeroGroup) {
        return false;
      }

      if (mealType === "cena" && ctx?.schoolCarbsToAvoid) {
        const carb = getCarbType(r);
        if (carb && ctx.schoolCarbsToAvoid.includes(carb)) return false;
      }

      {
        const carb = getCarbType(r);
        if (carb && dayCarbsUsed.has(carb)) return false;
      }

      if (neighborProteins.has(r.mainProtein)) return false;

      if (v.rule === "freq_target_not_met" && v.targetKey) {
        const matcher = FREQ_KEY_MATCHERS[v.targetKey];
        if (matcher && !matcher(r)) return false;
      }

      // Prefer a profile-compliant replacement, but only for the violation
      // that's actually about health profiles — never reject an otherwise-fine
      // replacement for a legumbres_en_cena/tupper/etc. violation just because
      // it also happens to be non-compliant with an unrelated active profile.
      if (v.rule === "health_profile_conflict") {
        const profileIds = Array.from(new Set(activeHealthProfiles ?? [])).filter((id) =>
          CORRECTABLE_HEALTH_PROFILES.has(id),
        );
        const flags = r.healthFlags ?? [];
        if (profileIds.some((id) => !HEALTH_PROFILE_BADGE[id].matches(flags))) return false;
      }

      return true;
    });

    if (replacement) {
      usedIds.delete(slot.recipeId);
      slot.recipeId = replacement.id;
      usedIds.add(replacement.id);
    }
  }

  return result;
}
