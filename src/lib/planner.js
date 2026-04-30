import { RECIPES } from "../data/recipes.js";
import { membersOfGroup } from "./groups.js";
import { getSchoolDish, hasAnySchoolDish } from "./schoolMenu.js";
import { stageForAge } from "./stages.js";

export const DAYS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
// Default meals; can be overridden by data.meals (editable per family).
export const MEALS = ["Comida", "Cena"];

export function getMeals(data) {
  return Array.isArray(data?.meals) && data.meals.length > 0 ? data.meals : MEALS;
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

function groupTargetKcal(data, group, goalIds) {
  const base = data.kcalByGroup?.[group.id] ?? data.kcal ?? 2000;
  let target = base;
  if (goalIds.includes("sano")) target -= 100;
  if (goalIds.includes("deportivo")) target += 250;
  if (goalIds.includes("economico")) target -= 50;
  return Math.max(1200, Math.min(3000, target));
}

function mealKcalTarget(targetKcal, meal) {
  return recipeMealType(meal) === "cena" ? targetKcal * 0.28 : targetKcal * 0.38;
}

function recipeMatchesFixedDish(recipe, fixedDish) {
  const wanted = normalizedText(fixedDish?.name);
  if (!wanted) return false;
  const name = normalizedText(recipe.name);
  return name.includes(wanted) || wanted.includes(name);
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

  // Time constraints (weekday vs weekend)
  const timeBudget = ctx.isWeekend ? ctx.timeWeekend : ctx.timeWeekday;
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

  const fixedDishHit = (ctx.fixedDishes ?? []).some((fd) => recipeMatchesFixedDish(recipe, fd));
  if (fixedDishHit) score += 70;

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

function warningsForRecipe(recipe, ctx) {
  const warnings = [];
  const timeBudget = ctx.isWeekend ? ctx.timeWeekend : ctx.timeWeekday;
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
  const { members, groups, schedule, dislikes, cookLevel, timeWeekday, timeWeekend } = data;
  const plan = { _warnings: [] };

  for (const group of groups) {
    plan[group.id] = {};
    const groupMembers = membersOfGroup(group, members);
    const groupHasKids = groupMembers.some((m) => {
      const s = stageForAge(m.age).id;
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
    const targetKcal = groupTargetKcal(data, group, goalIds);
    const kitchenTools = [
      ...(Array.isArray(data.kitchenTools) ? data.kitchenTools : []),
      ...(Array.isArray(data.customKitchenTools) ? data.customKitchenTools : []),
    ];

    const meals = getMeals(data);
    for (const day of DAYS) {
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
          timeWeekday,
          timeWeekend,
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
          fixedDishes: data.fixedDishes ?? [],
        };
        const recipe = pickRecipe(ctx);
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
        usedIds.add(recipe.id);
        const protein = primaryProteinFromRecipe(recipe);
        if (protein) proteinCount[protein] = (proteinCount[protein] ?? 0) + 1;
        for (const tag of recipe.tags) {
          typeCount[tag] = (typeCount[tag] ?? 0) + 1;
        }
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
          mode: mode.mode,
          eaters,
          warnings: slotWarnings,
        };
      }
    }
  }

  return plan;
}
