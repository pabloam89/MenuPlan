import { RECIPES, RECIPES_BY_ID } from "../data/recipes.js";
import { membersOfGroup } from "./groups.js";
import { getSchoolDish, hasAnySchoolDish } from "./schoolMenu.js";
import { resolveMemberAge, stageForAge } from "./stages.js";
import {
  fixedDishScoreBoost,
  markFixedDishPlaced,
  migrateFixedDishes,
} from "./fixedDishes.js";
import {
  comidaPairConflict,
  dayPastaPenalty,
  dayProteinPenalty,
  isSoloPlato,
  isValidPrimero,
  recipeProteinKey,
  trackDayPasta,
} from "./recipeDiversity.js";
import { maxCookTime } from "./cookTime.js";

export const DAYS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

export const DAY_LABELS = {
  Lun: "Lunes",
  Mar: "Martes",
  Mié: "Miércoles",
  Jue: "Jueves",
  Vie: "Viernes",
  Sáb: "Sábado",
  Dom: "Domingo",
};

export function dayLabel(short) {
  return DAY_LABELS[short] ?? short;
}
export const ALL_DAY_MEALS = ["Desayuno", "Comida", "Cena"];
// Default selection when none stored yet.
export const MEALS = ["Comida", "Cena"];

export function getMeals(data) {
  if (Array.isArray(data?.meals) && data.meals.length > 0) {
    const selected = ALL_DAY_MEALS.filter((m) => data.meals.includes(m));
    if (selected.length > 0) return selected;
  }
  return MEALS;
}

// ── Optional "off-menu" meals (desayuno / merienda / postre) ──────────────
// These live OUTSIDE data.meals so they never inflate the AI slot budget or
// reach the comida/cena LLM planner. They're stored in data.extraMeals and
// planned deterministically from the off-menu recipe pool (see aiPlanner.js).
export const EXTRA_MEAL_LABELS = ["Desayuno", "Merienda", "Postre"];

/** Active optional meals as capitalized labels, in canonical day order. */
export function getExtraMeals(data) {
  const em = data?.extraMeals ?? {};
  const out = [];
  if (em.desayuno && em.desayuno !== "off") out.push("Desayuno");
  if (em.merienda && em.merienda !== "off") out.push("Merienda");
  if (em.postre && em.postre !== "off") out.push("Postre");
  return out;
}

/**
 * Every meal label to RENDER for a day (main + optional), in natural day order
 * — Desayuno, Comida, Merienda, Cena, Postre. Renderers and the shopping list
 * use this; the AI planner keeps using getMeals() so its budget is unchanged.
 */
export function getDayMeals(data) {
  const active = new Set([...getMeals(data), ...getExtraMeals(data)]);
  return ["Desayuno", "Comida", "Merienda", "Cena", "Postre"].filter((m) => active.has(m));
}

export function isLunchMeal(meal) {
  return meal === "Comida";
}

/** First planned meal of the day (Comida if selected, else first chip). */
export function primaryDayMeal(data) {
  const meals = getMeals(data);
  return meals.find(isLunchMeal) ?? meals[0];
}

// Schedule cell values:
//   "casa"   → comen en casa
//   "tupper" → comida para llevar
//   "fuera"  → comen fuera
//   "cole"   → comedor escolar (solo niños)
//   "off"    → no aplica / no come
export const SLOT_VALUES = ["casa", "tupper", "fuera", "cole", "off"];

export function slotKey(memberId, day, meal) {
  return `${memberId}|${day}|${meal}`;
}

/**
 * Determine effective "cooking mode" for a group on a given slot:
 *  - If everybody in the group is "fuera" / "cole" / "off" → skip (no recipe needed).
 *  - If any member is "tupper" and nobody is "casa" → tupper recipe.
 *  - Otherwise cook at home (casa wins; tupper members take a portion home).
 */
export function modeForGroupSlot(group, members, schedule, day, meal) {
  const groupMembers = membersOfGroup(group, members);
  if (groupMembers.length === 0) return { cook: false, reason: "sin miembros" };

  const statuses = groupMembers.map((m) => schedule[slotKey(m.id, day, meal)] ?? "casa");
  const hasCasa = statuses.includes("casa");
  const hasTupper = statuses.includes("tupper");
  const allOut = statuses.every((s) => s === "fuera" || s === "cole" || s === "off");

  if (allOut) return { cook: false, reason: "nadie en casa" };
  if (hasCasa) return { cook: true, mode: "casa" };
  if (hasTupper) return { cook: true, mode: "tupper" };
  return { cook: false, reason: "nadie en casa" };
}

/** Family-level: does anyone still need a cooked dish for this slot? */
function familyCooksSlot(members, schedule, day, meal) {
  if (!members || members.length === 0) return true;
  const statuses = members.map((m) => schedule?.[slotKey(m.id, day, meal)] ?? "casa");
  return !statuses.every((s) => s === "fuera" || s === "cole" || s === "off");
}

/**
 * Number of days in each period (weekday / weekend) that actually require
 * cooking, per meal. Used to scale per-slot cook times into weekly totals so
 * the "Semana" view matches the real schedule instead of a fixed 5/2 split.
 */
export function cookDayCounts(data) {
  const members = data?.members ?? [];
  const schedule = data?.schedule ?? {};
  const meals = getMeals(data);
  const counts = { weekday: { Comida: 0, Cena: 0 }, weekend: { Comida: 0, Cena: 0 } };
  for (const day of DAYS) {
    const period = day === "Sáb" || day === "Dom" ? "weekend" : "weekday";
    for (const meal of meals) {
      if (meal !== "Comida" && meal !== "Cena") continue;
      if (familyCooksSlot(members, schedule, day, meal)) counts[period][meal] += 1;
    }
  }
  return counts;
}

function recipeMealType(meal) {
  // Map any user-defined meal label to a recipe mealType. Only "cena"
  // requires the cena tag; everything else (Comida, Desayuno, Almuerzo,
  // Merienda, etc.) reuses "comida" recipes.
  return (meal ?? "").toLowerCase() === "cena" ? "cena" : "comida";
}

const PROTEIN_TAGS = ["pescado", "carne", "legumbres", "huevos"];
const TOOL_TAGS = {
  Horno: ["horno", "pizza", "empanada"],
  Wok: ["wok"],
  Plancha: ["plancha"],
  "Olla rápida": ["guiso", "legumbres"],
  "Robot/Thermomix": ["crema", "sopa"],
  Batidora: ["crema", "puré", "sopa"],
};

function normalizedText(value) {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function primaryProteinFromRecipe(recipe) {
  return recipe.tags.find((t) => PROTEIN_TAGS.includes(t)) ?? null;
}

function proteinFromSchoolCourses(courses) {
  if (!hasAnySchoolDish(courses)) return null;
  const text = normalizedText(
    [courses.primero, courses.segundo, courses.postre].filter(Boolean).join(" ")
  );
  if (/pesc|atun|merluza|salmon|bacalao|lenguado|gallo/.test(text)) return "pescado";
  if (/pollo|pavo|ternera|cerdo|carne|lomo|hamburgues/.test(text)) return "carne";
  if (/lentej|garbanz|alubi|judia|legumbre/.test(text)) return "legumbres";
  if (/huevo|tortilla|revuelto/.test(text)) return "huevos";
  return null;
}

function daySchoolProteins(data, groupMembers, day) {
  return new Set(
    groupMembers
      .map((m) => proteinFromSchoolCourses(getSchoolDish(data.schoolMenus, m.id, day)))
      .filter(Boolean)
  );
}

function groupTargetKcal(data, group) {
  const base = data.kcalByGroup?.[group.id] ?? data.kcal ?? 2000;
  return Math.max(1200, Math.min(3000, base));
}

function mealKcalTarget(targetKcal, meal) {
  return recipeMealType(meal) === "cena" ? targetKcal * 0.28 : targetKcal * 0.38;
}

function recipeToolIssues(recipe, availableTools) {
  const issues = [];
  const available = new Set(availableTools ?? []);
  for (const [tool, tags] of Object.entries(TOOL_TAGS)) {
    const needsTool = tags.some((tag) => {
      const lowerTag = normalizedText(tag);
      return recipe.tags.some((t) => normalizedText(t) === lowerTag) ||
        normalizedText(recipe.name).includes(lowerTag);
    });
    if (needsTool && !available.has(tool)) issues.push(tool);
  }
  return issues;
}

function recipeScore(recipe, ctx) {
  let score = 0;

  // Meal type match
  if (!recipe.mealTypes.includes(recipeMealType(ctx.meal))) return -Infinity;

  // Allergies: hard exclude
  for (const a of ctx.allergies) {
    if (recipe.allergens.includes(a.toLowerCase())) return -Infinity;
  }

  // Dislikes: soft exclude (tag or name match)
  const lowerName = recipe.name.toLowerCase();
  for (const d of ctx.dislikes) {
    const dl = d.toLowerCase();
    if (lowerName.includes(dl) || recipe.tags.includes(dl)) score -= 50;
  }

  // Tupper mode → boost tupperFriendly, penalize others
  if (ctx.mode === "tupper") {
    score += recipe.tupperFriendly ? 40 : -80;
  }

  // Kids group → boost kidFriendly, penalize big/slow recipes
  if (ctx.groupHasKids) {
    if (recipe.kidFriendly) score += 20;
    else score -= 15;
  }

  // Time constraints (per meal + weekday/weekend)
  const timeBudget = ctx.maxTime ?? 30;
  if (recipe.time > timeBudget) score -= (recipe.time - timeBudget) * 1.4;

  // Cook level
  if (ctx.cookLevel === "basic" && recipe.difficulty === "Me gusta") score -= 30;
  if (ctx.cookLevel === "pro" && recipe.difficulty === "Fácil") score -= 5;

  for (const skill of ctx.cookSkills ?? []) {
    const skillText = normalizedText(skill);
    if (recipe.tags.some((t) => normalizedText(t) === skillText)) score += 8;
    if (normalizedText(recipe.name).includes(skillText)) score += 6;
  }

  const toolIssues = recipeToolIssues(recipe, ctx.kitchenTools);
  if (toolIssues.length > 0) score -= 35 * toolIssues.length;

  const kcalTarget = mealKcalTarget(ctx.targetKcal, ctx.meal);
  score -= Math.min(35, Math.abs(recipe.kcal - kcalTarget) / 22);

  // Goal tags (canonical ids; chip labels can be renamed by the user but the
  // id stays stable for scoring).
  const goalIds = ctx.goalIds ?? [];
  for (const id of goalIds) {
    if (id === "rapido") score += recipe.time <= 25 ? 24 : -Math.min(24, (recipe.time - 25) * 0.9);
    if (id === "economico") {
      score += recipe.kcal <= 550 ? 8 : -4;
      if (recipe.tags.includes("legumbres") || recipe.tags.includes("huevos")) score += 8;
    }
    if (
      id === "sano" &&
      (recipe.tags.includes("verdura") ||
        recipe.tags.includes("pescado") ||
        recipe.tags.includes("legumbres"))
    )
      score += 18;
    if (id === "deportivo" && (recipe.tags.includes("pescado") || recipe.tags.includes("carne"))) score += 12;
    if (id === "variado") score += Math.random() * 10;
  }

  for (const [freqKey, min] of Object.entries(ctx.freqs ?? {})) {
    if (recipe.tags.includes(freqKey)) {
      const remaining = Math.max(0, min - (ctx.typeCount[freqKey] ?? 0));
      score += remaining * 14;
    }
  }

  if (ctx.schoolProteins.has(primaryProteinFromRecipe(recipe))) score -= 22;
  if (ctx.schoolProteins.size > 0 && recipe.tags.includes("verdura")) score += 10;

  score -= dayProteinPenalty(recipe, ctx.dayProteinKeys);
  score -= dayPastaPenalty(recipe, ctx.dayFlags?.hasPasta);

  if (ctx.partnerRecipe) {
    const conflict =
      ctx.partnerRole === "main"
        ? comidaPairConflict(recipe, ctx.partnerRecipe)
        : comidaPairConflict(ctx.partnerRecipe, recipe);
    if (conflict) score -= 200;
  }

  score += fixedDishScoreBoost(recipe, ctx.meal, ctx.fixedTracks ?? []);

  // Avoid repeating same recipe / proteine in same week
  if (ctx.usedIds.has(recipe.id)) score -= 200;
  const protein = primaryProteinFromRecipe(recipe);
  // "Sin repetir proteína" tightens the per-week limit from 2 to 1.
  const proteinLimit = goalIds.includes("no-repetir-proteina") ? 1 : 2;
  if (protein && ctx.proteinCount[protein] >= proteinLimit) score -= 28;

  // Base randomness to avoid deterministic menus
  score += Math.random() * 8;

  return score;
}

export function pickRecipe(ctx) {
  let best = null;
  let bestScore = -Infinity;
  for (const r of RECIPES) {
    const s = recipeScore(r, ctx);
    if (s > bestScore) {
      bestScore = s;
      best = r;
    }
  }
  return best;
}

/** 1º de comida: solo platos ligeros válidos. */
export function pickComidaPrimero(ctx, excludeIds = new Set(), partnerRecipe = null) {
  let best = null;
  let bestScore = -Infinity;
  for (const r of RECIPES) {
    if (excludeIds.has(r.id)) continue;
    if (!isValidPrimero(r)) continue;
    if (partnerRecipe && comidaPairConflict(r, partnerRecipe)) continue;
    let s = recipeScore(r, ctx);
    if (s === -Infinity) continue;
    const tags = r.tags ?? [];
    if (tags.includes("crema") || tags.includes("sopa")) s += 24;
    if (tags.includes("verdura") && !tags.includes("legumbres")) s += 18;
    if (tags.includes("legumbres")) s += 8;
    if (r.kcal > 320) s -= 12;
    if (s > bestScore) {
      bestScore = s;
      best = r;
    }
  }
  return best;
}

/** Pick 2º + 1º con reglas de comida española. */
function pickComidaPair(ctx) {
  const ranked = RECIPES.map((r) => ({ r, s: recipeScore(r, ctx) }))
    .filter(({ s }) => s > -Infinity)
    .sort((a, b) => b.s - a.s);

  for (const { r: main } of ranked.slice(0, 22)) {
    if (isSoloPlato(main)) {
      const primero = pickComidaPrimero(ctx, new Set([main.id]), main);
      return { main, primero: primero ?? null };
    }
    const primero = pickComidaPrimero(ctx, new Set([main.id]), main);
    if (primero) return { main, primero };
  }

  const main = ranked[0]?.r ?? null;
  if (!main) return { main: null, primero: null };
  return { main, primero: pickComidaPrimero(ctx, new Set([main.id]), main) };
}

function trackDayProtein(dayProteinKeys, recipe) {
  const pk = recipeProteinKey(recipe);
  if (pk) dayProteinKeys.add(pk);
}

function trackRecipeUsage(recipe, meal, ctx, usedIds, proteinCount, typeCount, fixedTracks) {
  usedIds.add(recipe.id);
  markFixedDishPlaced(recipe, meal, fixedTracks);
  const protein = primaryProteinFromRecipe(recipe);
  if (protein) proteinCount[protein] = (proteinCount[protein] ?? 0) + 1;
  for (const tag of recipe.tags) typeCount[tag] = (typeCount[tag] ?? 0) + 1;
}

function warningsForRecipe(recipe, ctx) {
  const warnings = [];
  const timeBudget = ctx.maxTime ?? 30;
  if (recipe.time > timeBudget) {
    warnings.push({
      type: "time",
      message: `Supera el tiempo disponible (${recipe.time} min vs ${timeBudget} min).`,
    });
  }
  const toolIssues = recipeToolIssues(recipe, ctx.kitchenTools);
  if (toolIssues.length > 0) {
    warnings.push({
      type: "tool",
      message: `Puede requerir ${toolIssues.join(", ")} y no está marcado como disponible.`,
    });
  }
  const protein = primaryProteinFromRecipe(recipe);
  if (protein && ctx.schoolProteins.has(protein)) {
    warnings.push({
      type: "school-overlap",
      message: `Repite ${protein} tras el menú del cole; se priorizó compensar, pero no había opción mejor.`,
    });
  }
  if (ctx.mode === "tupper" && !recipe.tupperFriendly) {
    warnings.push({
      type: "tupper",
      message: "No es una receta ideal para tupper.",
    });
  }
  const kcalTarget = mealKcalTarget(ctx.targetKcal, ctx.meal);
  if (Math.abs(recipe.kcal - kcalTarget) > 220) {
    warnings.push({
      type: "kcal",
      message: `Se aleja del objetivo calórico suave (${recipe.kcal} kcal vs ${Math.round(kcalTarget)} kcal).`,
    });
  }
  return warnings;
}

/**
 * Generate a menu plan: { [groupId]: { [`${day}-${meal}`]: { recipeId, mode, eaters } | null } }
 */
export function generateMenu(data) {
  const { members, groups, schedule, dislikes, cookLevel } = data;
  const plan = { _warnings: [] };

  const fixedTracks = migrateFixedDishes(data.fixedDishes).map((fd) => ({ ...fd, placed: 0 }));

  for (const group of groups) {
    plan[group.id] = {};
    const groupMembers = membersOfGroup(group, members);
    const groupHasKids = groupMembers.some((m) => {
      const s = stageForAge(resolveMemberAge(m)).id;
      return s === "baby" || s === "infantil" || s === "primaria";
    });

    // Aggregate per-member allergies + dislikes for this group.
    const groupAllergies = Array.from(
      new Set(groupMembers.flatMap((m) => m.allergies ?? []))
    );
    const groupDislikes = Array.from(
      new Set([...(dislikes ?? []), ...groupMembers.flatMap((m) => m.dislikes ?? [])])
    );

    const usedIds = new Set();
    const proteinCount = { pescado: 0, carne: 0, legumbres: 0, huevos: 0 };
    const typeCount = {};

    // Per-group goal ids with global fallback. Members can also bring their
    // own preferences (data.goalsByGroup may also contain memberId entries
    // when the UI starts supporting per-member overrides).
    const groupGoalIds =
      data.goalsByGroup?.[group.id] ?? data.goals ?? [];
    const memberGoalIds = groupMembers.flatMap(
      (m) => data.goalsByGroup?.[m.id] ?? []
    );
    const goalIds = Array.from(new Set([...groupGoalIds, ...memberGoalIds]));
    const freqs = data.freqsByGroup?.[group.id] ?? data.freqs ?? {};
    const targetKcal = groupTargetKcal(data, group);
    const kitchenTools = [
      ...(Array.isArray(data.kitchenTools) ? data.kitchenTools : []),
      ...(Array.isArray(data.customKitchenTools) ? data.customKitchenTools : []),
    ];

    const meals = getMeals(data);
    for (const day of DAYS) {
      const dayProteinKeys = new Set();
      const dayFlags = { hasPasta: false };
      for (const meal of meals) {
        const mode = modeForGroupSlot(group, members, schedule, day, meal);
        const slot = `${day}-${meal}`;
        if (!mode.cook) {
          plan[group.id][slot] = null;
          continue;
        }
        const eaters = groupMembers.filter((m) => {
          const s = schedule[slotKey(m.id, day, meal)] ?? "casa";
          return s === "casa" || s === "tupper";
        }).length;

        const isWeekend = day === "Sáb" || day === "Dom";
        const schoolProteins = daySchoolProteins(data, groupMembers, day);
        const ctx = {
          meal,
          mode: mode.mode,
          groupHasKids,
          isWeekend,
          maxTime: maxCookTime(data, { isWeekend, meal }),
          cookLevel,
          cookSkills: data.cookSkills ?? [],
          kitchenTools,
          targetKcal,
          goalIds,
          freqs,
          allergies: groupAllergies,
          dislikes: groupDislikes,
          usedIds,
          proteinCount,
          typeCount,
          schoolProteins,
          fixedTracks,
          dayProteinKeys,
          dayFlags,
        };
        let recipe;
        let firstRecipeId = null;

        if (isLunchMeal(meal)) {
          const pair = pickComidaPair(ctx);
          recipe = pair.main;
          if (pair.primero) firstRecipeId = pair.primero.id;
        } else {
          recipe = pickRecipe(ctx);
        }

        if (!recipe) {
          plan[group.id][slot] = null;
          plan._warnings.push({
            groupId: group.id,
            groupLabel: group.label,
            day,
            meal,
            type: "no-recipe",
            message: "No hay receta compatible con alergias, restricciones y tipo de comida.",
          });
          continue;
        }

        if (firstRecipeId) {
          const primero = RECIPES_BY_ID[firstRecipeId];
          if (primero) {
            trackRecipeUsage(primero, meal, ctx, usedIds, proteinCount, typeCount, fixedTracks);
            trackDayPasta(primero, dayFlags);
            trackDayProtein(dayProteinKeys, primero);
          }
        }

        trackRecipeUsage(recipe, meal, ctx, usedIds, proteinCount, typeCount, fixedTracks);
        trackDayPasta(recipe, dayFlags);
        trackDayProtein(dayProteinKeys, recipe);
        const slotWarnings = warningsForRecipe(recipe, ctx);
        for (const warning of slotWarnings) {
          plan._warnings.push({
            ...warning,
            groupId: group.id,
            groupLabel: group.label,
            day,
            meal,
          });
        }
        plan[group.id][slot] = {
          recipeId: recipe.id,
          firstRecipeId,
          mode: mode.mode,
          eaters,
          warnings: slotWarnings,
        };
      }
    }
  }

  return plan;
}

/**
 * Pick an alternative recipe for one slot (local catalogue). Updates counts from
 * the rest of the week's plan for that group.
 */
export function replaceMenuSlot(
  data,
  menuPlan,
  { groupId, day, meal, excludeRecipeId, course = "main" }
) {
  const group = (data.groups ?? []).find((g) => g.id === groupId);
  if (!group) return null;

  const { members, schedule, dislikes, cookLevel } = data;
  const groupMembers = membersOfGroup(group, members);
  if (groupMembers.length === 0) return null;

  const mode = modeForGroupSlot(group, members, schedule, day, meal);
  if (!mode.cook) return null;

  const groupHasKids = groupMembers.some((m) => {
    const s = stageForAge(resolveMemberAge(m)).id;
    return s === "baby" || s === "infantil" || s === "primaria";
  });
  const groupAllergies = Array.from(new Set(groupMembers.flatMap((m) => m.allergies ?? [])));
  const groupDislikes = Array.from(
    new Set([...(dislikes ?? []), ...groupMembers.flatMap((m) => m.dislikes ?? [])])
  );
  const groupGoalIds = data.goalsByGroup?.[group.id] ?? data.goals ?? [];
  const memberGoalIds = groupMembers.flatMap((m) => data.goalsByGroup?.[m.id] ?? []);
  const goalIds = Array.from(new Set([...groupGoalIds, ...memberGoalIds]));
  const freqs = data.freqsByGroup?.[group.id] ?? data.freqs ?? {};
  const targetKcal = groupTargetKcal(data, group);
  const kitchenTools = [
    ...(Array.isArray(data.kitchenTools) ? data.kitchenTools : []),
    ...(Array.isArray(data.customKitchenTools) ? data.customKitchenTools : []),
  ];

  const usedIds = new Set(excludeRecipeId ? [excludeRecipeId] : []);
  const proteinCount = { pescado: 0, carne: 0, legumbres: 0, huevos: 0 };
  const typeCount = {};
  const slotKeyStr = `${day}-${meal}`;
  const currentSlot = menuPlan[groupId]?.[slotKeyStr] ?? {};
  const dayPrefix = `${day}-`;
  const dayProteinKeys = new Set();
  const dayFlags = { hasPasta: false };

  for (const [key, slot] of Object.entries(menuPlan[groupId] ?? {})) {
    if (key.startsWith(dayPrefix) && key !== slotKeyStr) {
      if (slot?.firstRecipeId) {
        trackDayProtein(dayProteinKeys, RECIPES_BY_ID[slot.firstRecipeId]);
        trackDayPasta(RECIPES_BY_ID[slot.firstRecipeId], dayFlags);
      }
      if (slot?.recipeId) {
        trackDayProtein(dayProteinKeys, RECIPES_BY_ID[slot.recipeId]);
        trackDayPasta(RECIPES_BY_ID[slot.recipeId], dayFlags);
      }
    }
  }

  const partnerId =
    course === "first" ? currentSlot.recipeId : currentSlot.firstRecipeId ?? null;
  const partnerRecipe = partnerId ? RECIPES_BY_ID[partnerId] : null;

  for (const [key, slot] of Object.entries(menuPlan[groupId] ?? {})) {
    if (key === slotKeyStr) {
      if (course !== "first" && slot?.firstRecipeId) usedIds.add(slot.firstRecipeId);
      if (course !== "main" && slot?.recipeId) usedIds.add(slot.recipeId);
      continue;
    }
    if (slot?.recipeId) {
      usedIds.add(slot.recipeId);
      const r = RECIPES_BY_ID[slot.recipeId];
      if (r) {
        const protein = primaryProteinFromRecipe(r);
        if (protein) proteinCount[protein] = (proteinCount[protein] ?? 0) + 1;
        for (const tag of r.tags) typeCount[tag] = (typeCount[tag] ?? 0) + 1;
      }
    }
    if (slot?.firstRecipeId) {
      usedIds.add(slot.firstRecipeId);
      const r = RECIPES_BY_ID[slot.firstRecipeId];
      if (r) {
        const protein = primaryProteinFromRecipe(r);
        if (protein) proteinCount[protein] = (proteinCount[protein] ?? 0) + 1;
        for (const tag of r.tags) typeCount[tag] = (typeCount[tag] ?? 0) + 1;
      }
    }
  }

  const eaters = groupMembers.filter((m) => {
    const s = schedule[slotKey(m.id, day, meal)] ?? "casa";
    return s === "casa" || s === "tupper";
  }).length;

  const isWeekend = day === "Sáb" || day === "Dom";
  const schoolProteins = daySchoolProteins(data, groupMembers, day);
  const fixedTracks = migrateFixedDishes(data.fixedDishes).map((fd) => ({ ...fd, placed: 0 }));

  const ctx = {
    meal,
    mode: mode.mode,
    groupHasKids,
    isWeekend,
    maxTime: maxCookTime(data, { isWeekend, meal }),
    cookLevel,
    cookSkills: data.cookSkills ?? [],
    kitchenTools,
    targetKcal,
    goalIds,
    freqs,
    allergies: groupAllergies,
    dislikes: groupDislikes,
    usedIds,
    proteinCount,
    typeCount,
    schoolProteins,
    fixedTracks,
    dayProteinKeys,
    dayFlags,
    partnerRecipe,
    partnerRole: partnerRecipe ? (course === "first" ? "main" : "first") : null,
  };

  const pickFn = course === "first" ? pickComidaPrimero : pickRecipe;
  const pickArgs =
    course === "first"
      ? [ctx, new Set([excludeRecipeId].filter(Boolean)), partnerRecipe]
      : [ctx];
  let recipe = pickFn(...pickArgs);
  if (!recipe || recipe.id === excludeRecipeId) {
    let best = null;
    let bestScore = -Infinity;
    for (const r of RECIPES) {
      if (r.id === excludeRecipeId) continue;
      if (course === "first") {
        if (!isValidPrimero(r)) continue;
        if (partnerRecipe && comidaPairConflict(r, partnerRecipe)) continue;
      } else if (partnerRecipe && comidaPairConflict(partnerRecipe, r)) {
        continue;
      }
      const s = recipeScore(r, ctx);
      if (s > bestScore) {
        bestScore = s;
        best = r;
      }
    }
    recipe = best;
  }

  if (!recipe) return null;

  const slotWarnings = warningsForRecipe(recipe, ctx);
  const base = {
    recipeId: currentSlot.recipeId,
    firstRecipeId: currentSlot.firstRecipeId ?? null,
    mode: mode.mode,
    eaters,
    warnings: slotWarnings,
  };
  if (course === "first") base.firstRecipeId = recipe.id;
  else base.recipeId = recipe.id;

  return { recipe, slot: base, course };
}
