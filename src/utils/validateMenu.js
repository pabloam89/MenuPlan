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
  [/pasta|macarr[oó]n|espagueti|tallar[íi]n|fideo|fideu[áa]|penne|lasa[ñn]a|can+elones|ravioli/, "pasta"],
  [/patata|papa\b|boniato|batata/, "patatas"],
  [/quinoa/, "quinoa"],
  [/c[uú]sc[uú]s|couscous|s[ée]mola|bulgur/, "cuscus"],
  // Wheat-flour bases all count as "pan": a pizza for lunch and a bocadillo
  // for dinner is the same repetition the rule exists to prevent, but until
  // these were listed the menu could serve both on the same day undetected.
  // "empanad" (no boundary) catches empanada/empanadilla; "tosta" catches the
  // common short form used throughout the catalog alongside "tostada".
  [/\bpan\b|s[áa]ndwich|bocadillo|tostada|\btosta\b|bruschetta|rebanada|picatoste|pizza|wrap|burrito|quesadilla|empanad|migas|masa quebrada|hojaldre/, "pan"],
  [/avena|porridge/, "avena"],
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

// All protein GROUPS a dish carries — its mainProtein PLUS any secondary
// animal proteins declared in `extraProteins`. This is what lets a compound
// legume dish keep mainProtein "legumbre" (for frequency + the no-legumbre-in-
// cena rule) while its ternera/cerdo/pollo still block a same-day meat dish in
// the variety rules (3c, 4). "none" contributes nothing.
function proteinGroupsOf(recipe) {
  const groups = new Set();
  const add = (p) => {
    if (p && p !== "none") groups.add(proteinGroup(p));
  };
  add(recipe?.mainProtein);
  for (const p of recipe?.extraProteins ?? []) add(p);
  return groups;
}

// Normalize a dish name for keyword scans (lowercase, strip accents), matching
// carbTypeFromText's approach so the "plato de cuchara" detector below stays
// consistent with the carb classifier.
function normName(text) {
  return String(text ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

// A "frito" dish carries the derived/declared health flag (see
// lib/healthFlags.js). Used by rule 12 to avoid two fried mains in a row.
function isFrito(recipe) {
  return (recipe?.healthFlags ?? []).includes("frito");
}

// "Plato de cuchara": soups/creams, legume stews, and any name that reads as a
// stew/broth. Used by rule 13 to avoid two spoon dishes on the same day.
const CUCHARA_NAME_RE = /\b(guiso|estofad|potaje|cocido|caldo|fabada|marmitako|puchero|olla)/;
function isPlatoCuchara(recipe) {
  if (!recipe) return false;
  if (recipe.category === "sopas_cremas" || recipe.category === "legumbres") return true;
  if (recipe.mainProtein === "legumbre") return true;
  return CUCHARA_NAME_RE.test(normName(recipe.name));
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

// Soft ceiling for primero + segundo of the same comida (see rule 7b).
// Derived from this catalog: median comida ≈ 606 kcal, p90+p90 ≈ 862, worst
// possible pairing ≈ 1006. 850 sits above the normal range and only catches
// two-main-sized-dishes-at-once. Tune here if the catalog's balance shifts.
// It's a QUALITY preference: applyFallback relaxes it before leaving a hole.
export const COMIDA_KCAL_SOFT_CAP = 850;

/**
 * Does this recipe's mealRole fit the slot it's been placed in?
 *
 * SINGLE SOURCE OF TRUTH, shared by the validation rule below and by
 * applyFallback's candidate searches. Keeping them in one function is the
 * whole point: this constraint used to live ONLY inside applyFallback, so a
 * cena-only dish (e.g. "Quesadillas caseras") placed in a comida slot was
 * never flagged as a violation — and because nothing flagged it, the repair
 * that knew perfectly well how to fix it never ran. It shipped to the user.
 *
 * `plato_unico` is deliberately NOT accepted for a "primero" slot: a plato
 * único IS the whole meal (lasaña 562 kcal, carbonara 548…), so allowing it
 * as a first course produced a first course as heavy as a main, plus a second
 * course on top. It stays valid only where the slot itself is a single-dish
 * meal (user-marked "plato único", or the 1_plato structure).
 *
 * @param {{ mealRole?: string[] }} recipe
 * @param {{ mealType?: string, position?: string, preferType?: string }} slot
 *   `position` accepts both the semantic form used by aiPlanner's slot
 *   objects ("primero" | "segundo" | "plato_unico") and the raw form parsed
 *   out of a slotId ("1" | "2"), since callers have one or the other.
 */
export function slotAcceptsRole(recipe, slot = {}) {
  const roles = recipe?.mealRole ?? [];
  const { mealType, position, preferType } = slot;

  if (mealType === "cena") return roles.includes("cena");
  if (position === "plato_unico" || preferType === "plato_unico") {
    return roles.includes("plato_unico");
  }
  if (position === "primero" || position === "1") return roles.includes("primero");
  if (position === "segundo" || position === "2") return roles.includes("segundo");
  // Unknown/!unconstrained slot shape — don't invent a restriction.
  return true;
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

  // 1b. The dish's mealRole must fit the slot it landed in. Without this rule
  // a cena-only dish could sit as a comida's primero and nothing complained:
  // the constraint existed solely in applyFallback, i.e. only on the repair
  // path, so it was never detected and therefore never repaired.
  for (const { slotId, recipeId } of slotAssignments) {
    const recipe = poolById[recipeId];
    if (!recipe) continue; // already flagged by rule 1
    const parts = slotId.split("_");
    const ctx = contextBySlot[slotId] ?? {};
    const slotShape = {
      mealType: ctx.mealType ?? parts[1],
      position: ctx.position ?? parts[2],
      preferType: ctx.preferType,
    };
    if (!slotAcceptsRole(recipe, slotShape)) {
      violations.push({
        rule: "rol_incompatible_con_hueco",
        slotId,
        message: `"${recipe.name}" (${(recipe.mealRole ?? []).join("/") || "sin rol"}) no encaja en ${slotId}`,
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
    if (!r1) continue;
    // Group SET (mainProtein + extraProteins) so a compound legume primero
    // like "Cocido madrileño" (legumbre + ternera/cerdo/pollo) also blocks a
    // same-day meat cena, not just another legume.
    const g1set = proteinGroupsOf(r1);
    if (g1set.size === 0) continue;
    for (const m of mealOrder) {
      if (m.daySlug !== daySlug || m.mealType !== "cena") continue;
      const r2 = poolById[m.recipeId];
      if (!r2) continue;
      const shared = [...proteinGroupsOf(r2)].find((g) => g1set.has(g));
      if (shared) {
        violations.push({
          rule: "proteina_repetida_en_dia",
          slotId: m.slotId,
          message: `"${r2.name}" repite el grupo de proteína "${shared}" del primero ("${r1.name}") el mismo día (${daySlug})`,
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
    const clash = [...proteinGroupsOf(recipe)].find((g) => ctx.schoolProteinsToAvoid.includes(g));
    if (clash) {
      violations.push({
        rule: "school_protein_conflict",
        slotId,
        message: `"${recipe.name}" tiene proteína "${clash}" que el menú escolar ya cubrió`,
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

  // 7b. Primero + segundo shouldn't add up to a disproportionate comida.
  //
  // This is a PROPORTION heuristic for menu balance, not a nutritional target:
  // it only asks that a two-course lunch not be built from two main-sized
  // dishes at once. A cap on either dish alone would be wrong — "macarrones
  // con tomate" (412 kcal) is a perfectly normal Spanish primero — so the
  // rule looks at the pair. The threshold comes from this catalog's own
  // distribution: a typical comida is ~606 kcal (median primero 228 + median
  // segundo 378) and the heaviest possible pairing reaches ~1006. See
  // COMIDA_KCAL_SOFT_CAP — it's a starting value, meant to be tuned.
  for (const [daySlug, positions] of Object.entries(comidaByDay)) {
    const first = positions["1"];
    const second = positions["2"];
    if (!first || !second) continue;
    const r1 = poolById[first.recipeId];
    const r2 = poolById[second.recipeId];
    if (!r1 || !r2) continue;
    const total = (r1.kcal ?? 0) + (r2.kcal ?? 0);
    if (total > COMIDA_KCAL_SOFT_CAP) {
      violations.push({
        rule: "comida_desproporcionada",
        // Points at the segundo: swapping the main is the less disruptive fix
        // (the primero is usually the lighter, more "structural" half).
        slotId: second.slotId,
        message: `${daySlug}: "${r1.name}" + "${r2.name}" suman ${total} kcal, demasiado para una comida de dos platos`,
      });
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

  // 12. No two fried mains in consecutive meals — soft style backstop. Uses the
  // same mainMeals chronological sequence as rule 3 so "seguidos" means the same
  // thing (across the day boundary too). The `frito` flag is derived/declared in
  // lib/healthFlags.js.
  for (let i = 1; i < mainMeals.length; i++) {
    const prevR = poolById[mainMeals[i - 1].recipeId];
    const currR = poolById[mainMeals[i].recipeId];
    if (!prevR || !currR) continue;
    if (isFrito(prevR) && isFrito(currR)) {
      violations.push({
        rule: "dos_fritos_seguidos",
        slotId: mainMeals[i].slotId,
        message: `"${currR.name}" es un frito justo después de otro frito ("${prevR.name}")`,
      });
    }
  }

  // 13. No two "platos de cuchara" (soups/stews/legumes) on the same day — soft
  // style backstop so a day doesn't end up all spoon dishes.
  const dayCuchara = {};
  for (const m of mealOrder) {
    const recipe = poolById[m.recipeId];
    if (!recipe || !isPlatoCuchara(recipe)) continue;
    if (dayCuchara[m.daySlug]) {
      violations.push({
        rule: "dos_cuchara_mismo_dia",
        slotId: m.slotId,
        message: `"${recipe.name}" es un segundo plato de cuchara el ${m.daySlug} (también en ${dayCuchara[m.daySlug]})`,
      });
    } else {
      dayCuchara[m.daySlug] = m.slotId;
    }
  }

  // 14. Same carb type in consecutive cenas across days — e.g. pasta Monday
  // cena followed by pasta Tuesday cena. Uses DAY_ORDER adjacency so only
  // back-to-back days are compared, not arbitrary pairings.
  const cenaByDay = {};
  for (const m of mealOrder) {
    if (m.mealType !== "cena") continue;
    const recipe = poolById[m.recipeId];
    if (!recipe) continue;
    const carb = getCarbType(recipe);
    if (carb) cenaByDay[m.daySlug] = { carb, slotId: m.slotId, name: recipe.name };
  }
  for (let i = 1; i < DAY_ORDER.length; i++) {
    const prev = cenaByDay[DAY_ORDER[i - 1]];
    const curr = cenaByDay[DAY_ORDER[i]];
    if (!prev || !curr) continue;
    if (prev.carb === curr.carb) {
      violations.push({
        rule: "guarnicion_cena_consecutiva",
        slotId: curr.slotId,
        message: `"${curr.name}" tiene base "${curr.carb}" igual que la cena del ${DAY_ORDER[i - 1]} ("${prev.name}")`,
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
export function applyFallback(slotAssignments, violations, filteredPool, slotsContext, activeHealthProfiles = []) {
  const result = slotAssignments.map((s) => ({ ...s }));
  const poolById = Object.fromEntries(filteredPool.map((r) => [r.id, r]));
  const contextBySlot = Object.fromEntries(
    slotsContext.map((s) => [s.slotId, s]),
  );
  const usedIds = new Set(result.map((s) => s.recipeId));
  // Violations this pass could not repair — attached to the returned array as
  // `unfixedViolations` so aiPlanner can warn instead of silently shipping a
  // menu that still breaks a rule.
  const unfixed = [];
  // Slots filled by reusing a dish already in the menu because no distinct
  // compatible recipe was left. Surfaced so the UI can suggest relaxing the
  // constraint that caused it instead of the repetition looking like a bug.
  const repeatedForCompleteness = [];

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
    let dayHasCuchara = false;
    for (const s of result) {
      if (!s.slotId.startsWith(daySlug + "_")) continue;
      const r = poolById[s.recipeId];
      if (r) {
        const c = getCarbType(r); if (c) dayCarbsUsed.add(c);
        if (isPlatoCuchara(r)) dayHasCuchara = true;
      }
    }

    // Hard constraints: never relaxed. These are real user needs (tiempo
    // máximo, tupper) or structural correctness (rol del plato, sin repetir
    // receta). filteredPool is already allergen/intolerance-safe.
    const satisfiesHard = (r) => {
      if (usedIds.has(r.id)) return false;
      if (ctx.maxTime && r.time > ctx.maxTime) return false;
      if (ctx.mode === "tupper" && !r.tupperFriendly) return false;
      // Shared with the validation rule (see slotAcceptsRole) so repair can
      // never accept something detection would reject, or vice versa.
      return slotAcceptsRole(r, {
        mealType: ctx.mealType ?? mealType,
        position: ctx.position ?? position,
        preferType: ctx.preferType,
      });
    };

    // Soft preferences: quality-of-menu nice-to-haves. Insisting on all of them
    // used to leave the slot EMPTY when no candidate satisfied every single one
    // — the user then saw a day with one dish instead of the two they'd
    // configured, silently. A slightly repetitive second course beats a missing
    // one, so relax these progressively instead of giving up.
    const carbOk = (r) => { const c = getCarbType(r); return !(c && dayCarbsUsed.has(c)); };
    const cucharaOk = (r) => !(dayHasCuchara && isPlatoCuchara(r));
    const typeOk = (r) => ctx.preferType === "cena_rapida" || r.category !== "cenas_rapidas";

    const tiers = [
      (r) => carbOk(r) && cucharaOk(r) && typeOk(r), // ideal
      (r) => cucharaOk(r) && typeOk(r),              // permite repetir base
      (r) => typeOk(r),                              // permite dos de cuchara
      () => true,                                    // lo que sea válido
    ];

    let candidate;
    for (const softOk of tiers) {
      candidate = filteredPool.find((r) => satisfiesHard(r) && softOk(r));
      if (candidate) break;
    }

    // Last resort: reuse a dish already in the menu. With a tight time budget
    // the catalog can genuinely lack enough DISTINCT recipes for the week —
    // e.g. a 20-min comida leaves the segundo ~10 min, and only 3 segundos in
    // the whole catalog are that quick, against 7 slots to fill. Repeating a
    // dish is normal in a real household; an empty slot reads as a broken app.
    // Hard constraints still apply — only the "no repeats" rule is dropped.
    if (!candidate) {
      const timesUsed = new Map();
      for (const s of result) timesUsed.set(s.recipeId, (timesUsed.get(s.recipeId) ?? 0) + 1);
      const reusable = filteredPool
        .filter((r) => {
          const wasUsed = usedIds.has(r.id);
          usedIds.delete(r.id);            // temporarily ignore the no-repeat rule
          const ok = satisfiesHard(r);
          if (wasUsed) usedIds.add(r.id);
          return ok;
        })
        // Spread repeats: pick whichever compatible dish appears least so far.
        .sort((a, b) => (timesUsed.get(a.id) ?? 0) - (timesUsed.get(b.id) ?? 0));
      candidate = reusable[0];
      if (candidate) repeatedForCompleteness.push({ slotId: v.slotId, recipeId: candidate.id });
    }

    if (candidate) {
      result.push({ slotId: v.slotId, recipeId: candidate.id });
      usedIds.add(candidate.id);
    } else {
      unfixed.push(v);
    }
  }

  // Fix other violations by replacing offending recipes
  const otherViolations = violations.filter((v) => v.rule !== "slot_faltante");
  for (const v of otherViolations) {
    const idx = result.findIndex((s) => s.slotId === v.slotId);
    if (idx === -1) continue;
    // `comida_sin_segundo` reports the PRIMERO's slotId, but the actual defect
    // is the missing SEGUNDO. When that segundo was in slotsContext it already
    // fired `slot_faltante` and got filled by the loop above, leaving this
    // violation stale — repairing it here would swap out a perfectly good first
    // course for no reason. Only act on it when the day still lacks a segundo
    // (i.e. it's genuinely a single-dish comida that isn't a plato único).
    if (v.rule === "comida_sin_segundo") {
      const day = v.slotId.split("_")[0];
      const hasSegundo = result.some((s) => s.slotId === `${day}_comida_2`);
      if (hasSegundo) continue;
    }
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
    // Rule 13 cross-safety: does another dish this day already read as a plato
    // de cuchara? If so, the replacement must not be one too.
    let dayHasCuchara = false;
    for (const s of result) {
      if (s.slotId === slot.slotId) continue;
      if (!s.slotId.startsWith(daySlug + "_")) continue;
      const r = poolById[s.recipeId];
      if (r) {
        const c = getCarbType(r); if (c) dayCarbsUsed.add(c);
        if (isPlatoCuchara(r)) dayHasCuchara = true;
      }
    }
    // Rule 14 cross-safety: also forbid carb types used by the immediately
    // adjacent cenas (prev/next day) so a cena replacement never reintroduces
    // guarnicion_cena_consecutiva while fixing an unrelated violation.
    if (mealType === "cena") {
      const dayIdx = DAY_ORDER.indexOf(daySlug);
      for (const delta of [-1, 1]) {
        const neighborDay = DAY_ORDER[dayIdx + delta];
        if (!neighborDay) continue;
        const neighborCena = result.find((s) => {
          const p = s.slotId.split("_");
          return p[0] === neighborDay && p[1] === "cena";
        });
        if (!neighborCena) continue;
        const nr = poolById[neighborCena.recipeId];
        const carb = nr && getCarbType(nr);
        if (carb) dayCarbsUsed.add(carb);
      }
    }

    // Same rationale as dayCarbsUsed above, for rule 3 (proteina_consecutiva):
    // always mirror the neighbor(s) — prev and next in the current mainMeals
    // sequence — the same way rule 3 itself finds them, using the live
    // `result` so earlier fixes in this same pass are reflected. Always
    // enforced below so fixing an unrelated later violation can never
    // reintroduce a same-protein collision that already passed.
    const neighborProteins = new Set();
    // Rule 12 cross-safety: is a consecutive main-meal neighbor fried? If so,
    // the replacement must not be fried either.
    let neighborFrito = false;
    {
      const order = mainMealsOf(buildMealOrder(result), poolById);
      const orderIdx = order.findIndex((m) => m.slotId === slot.slotId);
      if (orderIdx !== -1) {
        for (const neighbor of [order[orderIdx - 1], order[orderIdx + 1]]) {
          if (!neighbor) continue;
          const nr = poolById[neighbor.recipeId];
          if (!nr) continue;
          if (nr.mainProtein !== "none") neighborProteins.add(nr.mainProtein);
          if (isFrito(nr)) neighborFrito = true;
        }
      }
    }

    // Same-comida sibling (primero<->segundo) protein — mirrors rule 3b: a
    // replacement for either half of a comida must never reintroduce the
    // exact protein its sibling already carries this same meal.
    let siblingProtein = null;
    // Kcal of the other half of this comida, so a replacement can keep the
    // pair under COMIDA_KCAL_SOFT_CAP (rule 7b). null = not a two-course
    // comida, so there's no pair to balance.
    let siblingKcal = null;
    {
      const pos = slot.slotId.split("_")[2];
      if (mealType === "comida" && (pos === "1" || pos === "2")) {
        const siblingSlotId = `${daySlug}_comida_${pos === "1" ? "2" : "1"}`;
        const siblingRecipeId = result.find((s) => s.slotId === siblingSlotId)?.recipeId;
        const siblingRecipe = siblingRecipeId ? poolById[siblingRecipeId] : null;
        if (siblingRecipe && siblingRecipe.mainProtein !== "none") siblingProtein = siblingRecipe.mainProtein;
        if (siblingRecipe) siblingKcal = siblingRecipe.kcal ?? 0;
      }
    }

    // Same-day comida_1 primero protein GROUP — mirrors rule 3c: when replacing
    // a cena, never reintroduce the protein group already carried by that day's
    // primero (e.g. don't pick a legumbre cena when the comida_1 is a lentil
    // cream). Enforced unconditionally for the same cross-rule-safety reason as
    // the guards above.
    let sameDayPrimeroGroups = null;
    if (mealType === "cena") {
      const primeroRecipeId = result.find((s) => s.slotId === `${daySlug}_comida_1`)?.recipeId;
      const primeroRecipe = primeroRecipeId ? poolById[primeroRecipeId] : null;
      if (primeroRecipe) {
        const g = proteinGroupsOf(primeroRecipe);
        if (g.size) sameDayPrimeroGroups = g;
      }
    }

    // Cross-safety guards are split out from the hard constraints so they can
    // be relaxed if — and only if — insisting on all of them at once would
    // otherwise leave the offending dish in place. Keeping a KNOWN violation
    // (e.g. arroz de primero + arroz de segundo, reported by a tester) is worse
    // than a replacement that's merely suboptimal on an unrelated axis.
    // The guard that corresponds to the violation being fixed is never relaxed
    // — relaxing it would defeat the whole repair.
    const softGuards = {
      carb: (r) => {
        const carb = getCarbType(r);
        return !(carb && dayCarbsUsed.has(carb));
      },
      protein: (r) => !neighborProteins.has(r.mainProtein),
      sibling: (r) => !(siblingProtein && r.mainProtein === siblingProtein),
      primeroGroup: (r) =>
        !(sameDayPrimeroGroups && [...proteinGroupsOf(r)].some((g) => sameDayPrimeroGroups.has(g))),
      frito: (r) => !(neighborFrito && isFrito(r)),
      cuchara: (r) => !(dayHasCuchara && isPlatoCuchara(r)),
      cenaRapida: (r) => ctx?.preferType === "cena_rapida" || r.category !== "cenas_rapidas",
      weight: (r) => siblingKcal === null || (r.kcal ?? 0) + siblingKcal <= COMIDA_KCAL_SOFT_CAP,
    };

    // Which guard IS the violation being repaired — mandatory in every tier.
    const GUARD_FOR_RULE = {
      guarnicion_repetida: "carb",
      guarnicion_cena_consecutiva: "carb",
      school_carb_conflict: "carb",
      proteina_consecutiva: "protein",
      proteina_misma_comida: "sibling",
      plato_frito_consecutivo: "frito",
      comida_desproporcionada: "weight",
      legumbres_en_cena: null,
    };
    const mandatoryGuard = GUARD_FOR_RULE[v.rule] ?? null;

    // Progressively drop the optional guards, most-expendable last-resort last.
    // `weight` goes early: menu balance matters less than variety/repetition,
    // and it must never be the reason a slot can't be filled.
    const RELAX_ORDER = ["weight", "cenaRapida", "frito", "cuchara", "primeroGroup", "sibling", "protein", "carb"];
    const guardTiers = [];
    for (let drop = 0; drop <= RELAX_ORDER.length; drop++) {
      const dropped = new Set(RELAX_ORDER.slice(RELAX_ORDER.length - drop));
      dropped.delete(mandatoryGuard);
      guardTiers.push(dropped);
    }

    const findReplacement = (droppedGuards) => filteredPool.find((r) => {
      if (usedIds.has(r.id) && r.id !== slot.recipeId) return false;
      if (r.id === slot.recipeId) return false;

      for (const [key, ok] of Object.entries(softGuards)) {
        if (droppedGuards.has(key)) continue;
        if (!ok(r)) return false;
      }

      // ── Hard constraints: never relaxed ──────────────────────────────
      if (ctx?.maxTime && r.time > ctx.maxTime) return false;
      if (mealType === "cena" && (r.category === "legumbres" || r.mainProtein === "legumbre")) return false;
      if (v.rule === "tupper_not_friendly" && !r.tupperFriendly) return false;

      // Same shared helper as the validation rule — see slotAcceptsRole.
      if (!slotAcceptsRole(r, {
        mealType: ctx?.mealType ?? mealType,
        position: ctx?.position ?? slot.slotId.split("_")[2],
        preferType: ctx?.preferType,
      })) return false;

      if (ctx?.mode === "tupper" && !r.tupperFriendly) return false;

      if (mealType === "cena" && ctx?.schoolProteinsToAvoid) {
        if ([...proteinGroupsOf(r)].some((g) => ctx.schoolProteinsToAvoid.includes(g))) return false;
      }

      if (mealType === "cena" && ctx?.schoolCarbsToAvoid) {
        const carb = getCarbType(r);
        if (carb && ctx.schoolCarbsToAvoid.includes(carb)) return false;
      }

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

    let replacement;
    for (const dropped of guardTiers) {
      replacement = findReplacement(dropped);
      if (replacement) break;
    }

    if (replacement) {
      usedIds.delete(slot.recipeId);
      slot.recipeId = replacement.id;
      usedIds.add(replacement.id);
    } else {
      // Nothing in the pool can fix this slot even with every optional guard
      // dropped. The offending dish stays (removing it would leave a hole),
      // but record it so the caller can surface the gap instead of shipping a
      // known-violating menu silently.
      unfixed.push(v);
    }
  }

  // Non-enumerable so the return value still compares as a plain array of
  // assignments (callers and tests treat it as one); this is extra diagnostic
  // metadata riding along, not part of the list.
  Object.defineProperty(result, "unfixedViolations", {
    value: unfixed,
    enumerable: false,
  });
  Object.defineProperty(result, "repeatedForCompleteness", {
    value: repeatedForCompleteness,
    enumerable: false,
  });
  return result;
}
