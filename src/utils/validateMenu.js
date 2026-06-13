/**
 * Validate a slot assignment from the LLM against business rules.
 * Returns { valid: true } or { valid: false, violations: [...] }.
 *
 * Each violation: { rule, slotId, message }
 */
export function validateMenu(slotAssignments, filteredPool, slotsContext) {
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
  const usedIds = new Map();
  for (const { slotId, recipeId } of slotAssignments) {
    if (usedIds.has(recipeId)) {
      violations.push({
        rule: "recipeId_repetido",
        slotId,
        message: `recipeId "${recipeId}" ya usado en ${usedIds.get(recipeId)}`,
      });
    } else {
      usedIds.set(recipeId, slotId);
    }
  }

  // 7. Comida structure: primero+segundo or plato_unico
  const comidaByDay = {};
  for (const m of mealOrder) {
    if (m.mealType !== "comida") continue;
    if (!comidaByDay[m.daySlug]) comidaByDay[m.daySlug] = {};
    comidaByDay[m.daySlug][m.position] = m;
  }
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
export function applyFallback(slotAssignments, violations, filteredPool, slotsContext) {
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

    const candidate = filteredPool.find((r) => {
      if (usedIds.has(r.id)) return false;
      if (ctx.maxTime && r.time > ctx.maxTime) return false;
      if (ctx.mode === "tupper" && !r.tupperFriendly) return false;

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

    const replacement = filteredPool.find((r) => {
      if (usedIds.has(r.id) && r.id !== slot.recipeId) return false;
      if (r.id === slot.recipeId) return false;

      if (ctx?.maxTime && r.time > ctx.maxTime) return false;
      if (v.rule === "legumbres_en_cena" && r.category === "legumbres") return false;
      if (v.rule === "tupper_not_friendly" && !r.tupperFriendly) return false;

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
