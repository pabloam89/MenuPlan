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

function getCarbType(recipe) {
  const text = [recipe.name, ...recipe.ingredients.map((i) => i.name)]
    .join(" ")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
  for (const [pattern, carbType] of CARB_PATTERNS) {
    if (pattern.test(text)) return carbType;
  }
  return null;
}

export function validateMenu(slotAssignments, filteredPool, slotsContext, activeHealthProfiles = []) {
  const violations = [];
  const poolIds = new Set(filteredPool.map((r) => r.id));
  const poolById = Object.fromEntries(filteredPool.map((r) => [r.id, r]));

  const contextBySlot = Object.fromEntries(
    slotsContext.map((s) => [s.slotId, s]),
  );

  const dayOrder = ["lun", "mar", "mie", "jue", "vie", "sab", "dom"];
  const mealOrder = [];
  for (const { slotId, recipeId } of slotAssignments) {
    const parts = slotId.split("_");
    const daySlug = parts[0];
    const mealType = parts[1];
    const position = parts[2];
    const dayIdx = dayOrder.indexOf(daySlug);
    mealOrder.push({ slotId, recipeId, daySlug, dayIdx, mealType, position });
  }
  mealOrder.sort((a, b) => {
    if (a.dayIdx !== b.dayIdx) return a.dayIdx - b.dayIdx;
    if (a.mealType === "comida" && b.mealType === "cena") return -1;
    if (a.mealType === "cena" && b.mealType === "comida") return 1;
    return (a.position ?? "").localeCompare(b.position ?? "");
  });

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

  // 2. No legumbres in cena slots
  for (const { slotId, recipeId, mealType } of mealOrder) {
    if (mealType !== "cena") continue;
    const recipe = poolById[recipeId];
    if (!recipe) continue;
    if (recipe.category === "legumbres") {
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

  // 3. No repeated mainProtein in consecutive meals
  const mainMeals = mealOrder.filter(
    (m) => !(m.mealType === "comida" && m.position === "1"),
  );
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

  // 4. schoolProteinsToAvoid respected in cena
  for (const { slotId, recipeId, mealType } of mealOrder) {
    if (mealType !== "cena") continue;
    const ctx = contextBySlot[slotId];
    if (!ctx?.schoolProteinsToAvoid?.length) continue;
    const recipe = poolById[recipeId];
    if (!recipe) continue;
    const proteinMap = {
      pollo: "carne", pavo: "carne", cerdo: "carne", ternera: "carne",
      pescado_blanco: "pescado", pescado_azul: "pescado", marisco: "pescado",
      legumbre: "legumbres", huevo: "huevos",
    };
    const recipeProteinGroup = proteinMap[recipe.mainProtein] ?? recipe.mainProtein;
    if (ctx.schoolProteinsToAvoid.includes(recipeProteinGroup)) {
      violations.push({
        rule: "school_protein_conflict",
        slotId,
        message: `"${recipe.name}" tiene proteína "${recipeProteinGroup}" que el menú escolar ya cubrió`,
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

    // For guarnicion_repetida: collect carb types used in this day (excluding current slot)
    const dayCarbsUsed = new Set();
    if (v.rule === "guarnicion_repetida") {
      for (const s of result) {
        if (s.slotId === slot.slotId) continue;
        if (!s.slotId.startsWith(daySlug + "_")) continue;
        const r = poolById[s.recipeId];
        if (r) { const c = getCarbType(r); if (c) dayCarbsUsed.add(c); }
      }
    }

    const replacement = filteredPool.find((r) => {
      if (usedIds.has(r.id) && r.id !== slot.recipeId) return false;
      if (r.id === slot.recipeId) return false;

      if (ctx?.maxTime && r.time > ctx.maxTime) return false;
      if (v.rule === "legumbres_en_cena" && r.category === "legumbres") return false;
      if (v.rule === "tupper_not_friendly" && !r.tupperFriendly) return false;
      if (ctx?.preferType !== "cena_rapida" && r.category === "cenas_rapidas") return false;

      if (mealType === "cena" && !r.mealRole.includes("cena")) return false;
      if (mealType === "comida") {
        const pos = slot.slotId.split("_")[2];
        if (pos === "1" && !r.mealRole.some((role) => role === "primero" || role === "plato_unico")) return false;
        if (pos === "2" && !r.mealRole.includes("segundo")) return false;
      }

      if (ctx?.mode === "tupper" && !r.tupperFriendly) return false;

      if (v.rule === "school_protein_conflict" && ctx?.schoolProteinsToAvoid) {
        const proteinMap = {
          pollo: "carne", pavo: "carne", cerdo: "carne", ternera: "carne",
          pescado_blanco: "pescado", pescado_azul: "pescado", marisco: "pescado",
          legumbre: "legumbres", huevo: "huevos",
        };
        const group = proteinMap[r.mainProtein] ?? r.mainProtein;
        if (ctx.schoolProteinsToAvoid.includes(group)) return false;
      }

      if (v.rule === "guarnicion_repetida") {
        const carb = getCarbType(r);
        if (carb && dayCarbsUsed.has(carb)) return false;
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
