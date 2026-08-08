import { recipeCatalog, recipeCatalogById } from "../data/recipeCatalog.js";
import { recipeViolatesHardSafety } from "../utils/filterRecipes.js";
import { getCarbType } from "../utils/validateMenu.js";

// Mirrors validateMenu.js rule 4's grouping (pollo/pavo/cerdo/ternera -> carne,
// etc.) so enforceFixedDishes can check a cena candidate against the same
// schoolProteinsToAvoid the day's slot context carries — kept as a local copy
// (not imported) because validateMenu.js doesn't export it separately.
const PROTEIN_GROUP_MAP = {
  pollo: "carne", pavo: "carne", cerdo: "carne", ternera: "carne",
  pescado_blanco: "pescado", pescado_azul: "pescado", marisco: "pescado",
  legumbre: "legumbres", huevo: "huevos",
};

/** True when placing `recipe` in the cena slot at `ctx` would reintroduce a
 * protein or carb base the school menu already served that day (validateMenu
 * rules 4 / 4b). Only meaningful for cena — comida slots never carry
 * schoolProteinsToAvoid/schoolCarbsToAvoid. */
function conflictsWithSchoolMenu(recipe, ctx) {
  if (!ctx) return false;
  if (ctx.schoolProteinsToAvoid?.length) {
    const group = PROTEIN_GROUP_MAP[recipe.mainProtein] ?? recipe.mainProtein;
    if (ctx.schoolProteinsToAvoid.includes(group)) return true;
  }
  if (ctx.schoolCarbsToAvoid?.length) {
    const carb = getCarbType(recipe);
    if (carb && ctx.schoolCarbsToAvoid.includes(carb)) return true;
  }
  return false;
}

/** Normalized fixed dish: repetitions per week + which meals.
 * `catalogId` is set when the dish was picked from the catalog browser, so the
 * planner can match it exactly instead of by name. */
export function normalizeFixedDish(raw) {
  if (!raw || typeof raw !== "object") return null;
  const name = String(raw.name ?? "").trim();
  if (!name) return null;

  const catalogId =
    typeof raw.catalogId === "string" && raw.catalogId.trim()
      ? raw.catalogId.trim()
      : undefined;

  // A pinned garnish only makes sense alongside an exact catalog dish.
  const garnishId =
    catalogId && typeof raw.garnishId === "string" && raw.garnishId.trim()
      ? raw.garnishId.trim()
      : undefined;

  const extra = { ...(catalogId ? { catalogId } : {}), ...(garnishId ? { garnishId } : {}) };

  if (typeof raw.timesPerWeek === "number") {
    const rawMeals =
      Array.isArray(raw.meals) && raw.meals.length > 0 ? raw.meals : ["Comida"];
    const meal =
      rawMeals.find((m) => String(m).toLowerCase() === "comida") ??
      rawMeals.find((m) => String(m).toLowerCase() === "cena") ??
      rawMeals[0];
    return {
      name,
      timesPerWeek: Math.min(7, Math.max(1, Math.round(raw.timesPerWeek))),
      meals: [meal],
      ...extra,
    };
  }

  const freq = raw.freq ?? "semanal";
  let timesPerWeek = 1;
  if (freq === "quincenal") timesPerWeek = 1;
  else if (freq === "de vez en cuando") timesPerWeek = 1;

  return { name, timesPerWeek, meals: ["Comida"], ...extra };
}

/** Build a { [catalogRecipeId]: garnishId } map from the user's pinned combos. */
export function pinnedGarnishMap(list) {
  const map = {};
  for (const fd of migrateFixedDishes(list)) {
    if (fd.catalogId && fd.garnishId) map[fd.catalogId] = fd.garnishId;
  }
  return map;
}

export function migrateFixedDishes(list) {
  return (list ?? []).map(normalizeFixedDish).filter(Boolean);
}

function norm(s) {
  return String(s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

export function recipeMatchesFixedDish(recipe, fixedDish) {
  // Exact match when the dish was chosen from the catalog browser.
  if (fixedDish?.catalogId) return recipe?.id === fixedDish.catalogId;
  const wanted = norm(fixedDish?.name);
  if (!wanted) return false;
  const name = norm(recipe?.name);
  return name.includes(wanted) || wanted.includes(name);
}

export function fixedDishScoreBoost(recipe, meal, tracks) {
  let boost = 0;
  for (const ft of tracks) {
    if ((ft.placed ?? 0) >= ft.timesPerWeek) continue;
    if (!ft.meals.includes(meal)) continue;
    if (recipeMatchesFixedDish(recipe, ft)) boost = Math.max(boost, 85);
  }
  return boost;
}

export function markFixedDishPlaced(recipe, meal, tracks) {
  for (const ft of tracks) {
    if ((ft.placed ?? 0) >= ft.timesPerWeek) continue;
    if (!ft.meals.includes(meal)) continue;
    if (recipeMatchesFixedDish(recipe, ft)) {
      ft.placed = (ft.placed ?? 0) + 1;
      return;
    }
  }
}

export function formatFixedDishesForAI(list) {
  return migrateFixedDishes(list).map((fd) => ({
    name: fd.name,
    timesPerWeek: fd.timesPerWeek,
    meals: fd.meals,
    catalogMatches: catalogMatchesForFixedDish(fd).map((r) => ({ id: r.id, name: r.name })),
  }));
}

/** Pick `k` items evenly spread across the list (e.g. Mon/Wed/Fri, not Mon/Tue/Wed). */
function pickEvenlySpread(items, k) {
  if (k <= 0) return [];
  if (k >= items.length) return [...items];
  const out = [];
  const step = items.length / k;
  for (let i = 0; i < k; i++) out.push(items[Math.floor(i * step)]);
  return out;
}

/**
 * Choose the comida position ("1" primero / "2" segundo) or cena that matches
 * the dish's culinary role, so a vegetable primero never lands in the main
 * protein slot (and vice versa).
 *
 * plato_unico routes to "1", same as primero — NOT "2" as an earlier version
 * had it. A plato_unico (paella, lasaña…) IS the whole comida on its own;
 * routing it to "2" force-placed it as a "segundo" alongside whatever
 * unrelated primero the day already had (a tester reported exactly this:
 * "Ensalada de lentejas" + "Arroz al horno" as primero+segundo — both meant
 * to be a complete dish on their own). The day-selection loop below only lets
 * a plato_unico land on a day ALREADY structured as one dish (no comida_2),
 * same as it already did for "1"/primero in the other direction.
 */
function slotPositionForRecipe(recipe, targetMealType) {
  if (targetMealType === "cena") return null; // cena has a single slot
  const roles = recipe.mealRole ?? [];
  if (roles.includes("segundo")) return "2";
  if (roles.includes("primero")) return "1";
  if (roles.includes("plato_unico")) return "1";
  return "2";
}

/** True when placing `recipe` in the OTHER comida course's slot (its
 * primero/segundo sibling on the same day) would give that sibling the exact
 * same mainProtein (validateMenu rule 3b, proteina_repetida_en_comida). Only
 * meaningful when the sibling slot is already occupied. */
function conflictsWithComidaSibling(recipe, slotId, bySlot, poolById) {
  if (!recipe.mainProtein || recipe.mainProtein === "none") return false;
  const [day, meal, pos] = slotId.split("_");
  if (meal !== "comida" || (pos !== "1" && pos !== "2")) return false;
  const siblingSlotId = `${day}_comida_${pos === "1" ? "2" : "1"}`;
  const siblingRecipeId = bySlot.get(siblingSlotId)?.recipeId;
  if (!siblingRecipeId) return false;
  const siblingRecipe = poolById[siblingRecipeId];
  return Boolean(siblingRecipe) && siblingRecipe.mainProtein === recipe.mainProtein;
}

/**
 * Deterministically forces each fixed dish to appear exactly `timesPerWeek`
 * times, in the meal the user picked AND in the slot position that matches the
 * dish's culinary role (primero/segundo/cena). Placements are spread across the
 * week so a repeated dish doesn't pile up on consecutive days. The LLM is asked
 * to do this too, but only this step is a hard guarantee.
 *
 * Runs after the LLM/fallback assignment and before garnish pairing. Mutates
 * `poolById` to include any forced recipe so downstream steps can resolve it.
 *
 * @param {Array<{slotId: string, recipeId: string, garnishId?: string}>} slotAssignments
 * @param {Array} fixedDishesRaw - raw fixed dishes from user data
 * @param {Object} poolById - { [recipeId]: catalogRecipe }, mutated in place
 * @param {Object} [filterOpts] - the group's filterRecipes() options (allergies,
 *   intolerances, hasKids, isBabyGroup), used to gate the full-catalog fallback
 *   below so a fixed dish can never reintroduce a hard safety violation just
 *   because it dropped out of the group's filtered pool.
 * @param {Array} [slotsContext] - the group's slot context (ctx.slots from
 *   buildGroupContext), used so a cena placement never reintroduces the
 *   protein/carb base the school menu already served that day (validateMenu
 *   rules 4 / 4b) — this step runs AFTER applyFallback and the 3b safety net,
 *   so nothing else re-checks those rules once a fixed dish is force-placed.
 * @returns {{ slotAssignments: Array, warnings: string[] }}
 */
export function enforceFixedDishes(slotAssignments, fixedDishesRaw, poolById, filterOpts = {}, slotsContext = []) {
  const fixedDishes = migrateFixedDishes(fixedDishesRaw);
  if (fixedDishes.length === 0) return { slotAssignments, warnings: [] };

  const bySlot = new Map(slotAssignments.map((s) => [s.slotId, { ...s }]));
  const locked = new Set(); // slots already owned by a fixed dish — never evict
  const warnings = [];
  const ctxBySlot = Object.fromEntries(slotsContext.map((s) => [s.slotId, s]));

  for (const fd of fixedDishes) {
    const meal = String(fd.meals?.[0] ?? "Comida").toLowerCase();
    const targetMealType = meal === "cena" ? "cena" : "comida";

    // Resolve the target recipe (pool first, then full catalog). The pool is
    // already safe by construction; a full-catalog fallback candidate is not
    // — it may have dropped out of the pool precisely because it violates an
    // allergy/intolerance/kid-safety rule, so it must pass the same hard
    // check before we're willing to inject it.
    let recipe = poolById[fd.catalogId] ?? null;
    if (!recipe && fd.catalogId) {
      const candidate = recipeCatalogById[fd.catalogId] ?? null;
      if (candidate && recipeViolatesHardSafety(candidate, filterOpts)) {
        warnings.push(
          `El plato fijado "${fd.name}" ya no cumple las restricciones del grupo (alergias/intolerancias) y se ha omitido esta semana.`,
        );
      } else {
        recipe = candidate;
      }
    }
    if (!recipe && !fd.catalogId) {
      recipe = Object.values(poolById).find((r) => recipeMatchesFixedDish(r, fd)) ?? null;
      if (!recipe) {
        const candidate = recipeCatalog.find((r) => recipeMatchesFixedDish(r, fd)) ?? null;
        if (candidate && recipeViolatesHardSafety(candidate, filterOpts)) {
          warnings.push(
            `El plato fijado "${fd.name}" ya no cumple las restricciones del grupo (alergias/intolerancias) y se ha omitido esta semana.`,
          );
        } else {
          recipe = candidate;
        }
      }
    }
    if (!recipe) continue;

    // Ensure downstream steps (garnish pairing, hydration) can resolve it.
    if (!poolById[recipe.id]) poolById[recipe.id] = recipe;

    // Only touch slots of the correct meal AND position for this dish's role.
    const wantPosition = slotPositionForRecipe(recipe, targetMealType);
    // A dish whose ONLY comida role is plato_unico must land on a day that's
    // ALREADY single-dish-structured — never inject it as position "1" next
    // to an existing, unrelated comida_2 (or, as it used to route, as "2"
    // next to an unrelated comida_1 — either way stranding a course this
    // dish was never meant to share a comida with).
    const isPlatoUnicoOnly =
      wantPosition === "1" &&
      (recipe.mealRole ?? []).includes("plato_unico") &&
      !(recipe.mealRole ?? []).includes("primero");
    const slotByDay = new Map(); // day -> slotId (one candidate slot per day)
    for (const slotId of bySlot.keys()) {
      const [day, slotMeal, pos] = slotId.split("_");
      if (targetMealType === "cena") {
        if (slotMeal === "cena") slotByDay.set(day, slotId);
      } else if (slotMeal === "comida" && pos === wantPosition) {
        const dayHasSegundo = bySlot.has(`${day}_comida_2`);
        if (isPlatoUnicoOnly) {
          if (dayHasSegundo) continue; // only single-dish days qualify
        } else if (wantPosition === "1" && !dayHasSegundo) {
          // A genuine primero must not replace a plato_unico day (would leave no main).
          continue;
        }
        slotByDay.set(day, slotId);
      }
    }
    const days = [...slotByDay.keys()];
    if (days.length === 0) continue;

    // Existing placements already count (one per day).
    const daysWithDish = new Set();
    for (const [day, slotId] of slotByDay) {
      if (bySlot.get(slotId)?.recipeId === recipe.id) {
        daysWithDish.add(day);
        locked.add(slotId);
      }
    }

    const target = Math.min(fd.timesPerWeek, days.length);
    const need = target - daysWithDish.size;
    if (need <= 0) continue;

    // Inject into free days (not already holding the dish, not owned by another
    // fixed dish), spread evenly across the week.
    const freeDays = days.filter(
      (day) => !daysWithDish.has(day) && !locked.has(slotByDay.get(day)),
    );

    // Prefer days where this cena placement doesn't collide with what the
    // school already served (validateMenu rules 4 / 4b). Only relevant for
    // cena — comida slots carry no schoolProteinsToAvoid/schoolCarbsToAvoid.
    // Soft guardrail like the other deterministic carve-outs in this codebase
    // (see aiPlanner.js#pickCatalogReplacement): relaxed back to the full
    // freeDays list rather than under-placing the dish, since "the fixed dish
    // appears exactly timesPerWeek times" is documented as a hard guarantee.
    let chosenFreeDays = freeDays;
    if (targetMealType === "cena") {
      const safeFreeDays = freeDays.filter(
        (day) => !conflictsWithSchoolMenu(recipe, ctxBySlot[slotByDay.get(day)]),
      );
      if (safeFreeDays.length >= need) {
        chosenFreeDays = safeFreeDays;
      } else if (safeFreeDays.length < freeDays.length) {
        warnings.push(
          `El plato fijado "${fd.name}" coincide con la proteína o base del menú escolar en algún día de esta semana; se ha mantenido igualmente para cumplir la repetición semanal solicitada.`,
        );
      }
    } else {
      // Same soft-preference pattern for the comida sibling protein clash
      // (validateMenu rule 3b) — a tester reported "Huevos cocidos con
      // ensalada" (primero) + "Huevos rotos con jamón" (segundo, fixed dish)
      // landing in the same comida. This step runs after the LLM/fallback
      // validation pass and nothing re-checks it afterward except a silent
      // warning, so the force-placement itself must avoid the clash.
      const safeFreeDays = chosenFreeDays.filter(
        (day) => !conflictsWithComidaSibling(recipe, slotByDay.get(day), bySlot, poolById),
      );
      if (safeFreeDays.length >= need) {
        chosenFreeDays = safeFreeDays;
      } else if (safeFreeDays.length < chosenFreeDays.length) {
        warnings.push(
          `El plato fijado "${fd.name}" repite la misma proteína que el otro plato de esa comida en algún día de esta semana; se ha mantenido igualmente para cumplir la repetición semanal solicitada.`,
        );
      }
    }

    for (const day of pickEvenlySpread(chosenFreeDays, need)) {
      const slotId = slotByDay.get(day);
      bySlot.set(slotId, { slotId, recipeId: recipe.id });
      locked.add(slotId);
    }
  }

  // Preserve original slot order.
  return { slotAssignments: slotAssignments.map((s) => bySlot.get(s.slotId) ?? s), warnings };
}

export function catalogMatchesForFixedDish(fixedDish, catalog = recipeCatalog) {
  if (fixedDish?.catalogId) {
    const exact = catalog.find((r) => r.id === fixedDish.catalogId);
    return exact ? [exact] : [];
  }
  if (!fixedDish?.name) return [];
  return catalog.filter((r) => recipeMatchesFixedDish(r, fixedDish));
}
