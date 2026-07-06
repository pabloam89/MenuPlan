import { RECIPES_BY_ID } from "../data/recipes.js";
import { membersOfGroup } from "./groups.js";
import { DAYS, getMeals, slotKey } from "./planner.js";
import { getSchoolDish, hasAnySchoolDish } from "./schoolMenu.js";

export const FAMILY_LABELS = {
  pescado: "Pescado",
  carne: "Carne",
  legumbres: "Legumbres",
  huevos: "Huevos",
  verdura: "Verdura",
  pasta: "Pasta",
  arroz: "Arroz",
  otros: "Otros",
};

const EMPTY_MACROS = { protein: 0, carbs: 0, fat: 0, kcal: 0 };

function normalizedText(value) {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function familyFromRecipe(recipe) {
  const iconMap = {
    fish: "pescado",
    meat: "carne",
    egg: "huevos",
    legume: "legumbres",
    pasta: "pasta",
    rice: "arroz",
    greens: "verdura",
    soup: "verdura",
  };
  if (recipe.iconType && iconMap[recipe.iconType]) {
    return iconMap[recipe.iconType];
  }

  const tags = recipe.tags ?? [];
  const name = normalizedText(recipe.name);

  if (tags.includes("pescado") || /pesc|merluza|salmon|bacalao|atun/.test(name)) return "pescado";
  if (tags.includes("carne") || /pollo|ternera|cerdo|carne|lomo|hamburg/.test(name)) return "carne";
  if (tags.includes("legumbres") || /lentej|garbanz|alubia|judia/.test(name)) return "legumbres";
  if (tags.includes("huevos") || /huevo|tortilla|revuelto/.test(name)) return "huevos";
  if (tags.includes("pasta") || /pasta|macarron|lasañ|espaguet/.test(name)) return "pasta";
  if (tags.includes("arroz") || /arroz|paella/.test(name)) return "arroz";
  if (
    tags.includes("verdura") ||
    tags.includes("vegetariano") ||
    tags.includes("crema") ||
    tags.includes("sopa") ||
    /verdur|ensalad|calabac|crema|sopa|guis/.test(name)
  ) {
    return "verdura";
  }
  if (tags.includes("carbos")) return /arroz|paella/.test(name) ? "arroz" : "pasta";
  if (tags.includes("guiso")) {
    if (tags.includes("legumbres")) return "legumbres";
    if (tags.includes("carne")) return "carne";
    return "verdura";
  }
  return "otros";
}

function familyFromSchoolCourses(courses) {
  if (!hasAnySchoolDish(courses)) return "otros";
  const text = normalizedText(
    [courses.primero, courses.segundo, courses.postre].filter(Boolean).join(" ")
  );
  if (/pesc|atun|merluza|salmon|bacalao|lenguado|gallo/.test(text)) return "pescado";
  if (/pollo|pavo|ternera|cerdo|carne|lomo|hamburgues/.test(text)) return "carne";
  if (/lentej|garbanz|alubi|judia|legumbre/.test(text)) return "legumbres";
  if (/huevo|tortilla|revuelto/.test(text)) return "huevos";
  if (/pasta|macarron|espaguet|fideos/.test(text)) return "pasta";
  if (/arroz|paella/.test(text)) return "arroz";
  if (/ensalad|verdur|acelg|espinac|calabac|crema|sopa|guis/.test(text)) return "verdura";
  return "otros";
}

function macrosFromRecipe(recipe) {
  const m = recipe.macros ?? EMPTY_MACROS;
  return {
    protein: m.protein ?? 0,
    carbs: m.carbs ?? 0,
    fat: m.fat ?? 0,
    kcal: recipe.kcal ?? Math.round((m.protein ?? 0) * 4 + (m.carbs ?? 0) * 4 + (m.fat ?? 0) * 9),
  };
}

function estimateSchoolMacros(courses) {
  const macros = { ...EMPTY_MACROS };
  if (courses.primero) {
    macros.protein += 6;
    macros.carbs += 18;
    macros.fat += 5;
    macros.kcal += 150;
  }
  if (courses.segundo) {
    macros.protein += 22;
    macros.carbs += 25;
    macros.fat += 12;
    macros.kcal += 320;
  }
  if (courses.postre) {
    macros.protein += 2;
    macros.carbs += 22;
    macros.fat += 4;
    macros.kcal += 110;
  }
  return macros;
}

function schoolMealLabel(courses) {
  const parts = [courses.primero, courses.segundo, courses.postre].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : "Menú del cole";
}

function addCount(map, key, delta = 1) {
  map[key] = (map[key] ?? 0) + delta;
}

function sumMacros(a, b) {
  return {
    protein: a.protein + b.protein,
    carbs: a.carbs + b.carbs,
    fat: a.fat + b.fat,
    kcal: a.kcal + b.kcal,
  };
}

function mealForMember({ member, group, menuPlan, data, day, meal }) {
  const schedule = data.schedule ?? {};
  const status = schedule[slotKey(member.id, day, meal)] ?? "casa";

  if (status === "off" || status === "fuera") return null;

  if (status === "cole") {
    const courses = getSchoolDish(data.schoolMenus, member.id, day);
    if (!hasAnySchoolDish(courses)) return null;
    return {
      day,
      meal,
      source: "cole",
      name: schoolMealLabel(courses),
      family: familyFromSchoolCourses(courses),
      familyLabel: FAMILY_LABELS[familyFromSchoolCourses(courses)],
      macros: estimateSchoolMacros(courses),
    };
  }

  const slot = menuPlan[group.id]?.[`${day}-${meal}`];
  const recipe = slot ? RECIPES_BY_ID[slot.recipeId] : null;
  if (!recipe) return null;

  const family = familyFromRecipe(recipe);
  return {
    day,
    meal,
    source: status === "tupper" ? "tupper" : "casa",
    name: recipe.name,
    family,
    familyLabel: FAMILY_LABELS[family],
    macros: macrosFromRecipe(recipe),
  };
}

function buildMemberConsumption(member, group, menuPlan, data, meals) {
  const mealLog = [];
  for (const day of DAYS) {
    for (const meal of meals) {
      const entry = mealForMember({ member, group, menuPlan, data, day, meal });
      if (entry) mealLog.push(entry);
    }
  }

  const familyCounts = {};
  const dishCounts = {};
  const macrosWeek = { ...EMPTY_MACROS };
  const macrosByDay = Object.fromEntries(DAYS.map((d) => [d, { ...EMPTY_MACROS, meals: 0 }]));
  const daysWithMeals = new Set();

  for (const entry of mealLog) {
    addCount(familyCounts, entry.family);
    addCount(dishCounts, entry.name);
    Object.assign(macrosWeek, sumMacros(macrosWeek, entry.macros));
    daysWithMeals.add(entry.day);
    const dayRow = macrosByDay[entry.day];
    Object.assign(dayRow, sumMacros(dayRow, entry.macros));
    dayRow.meals += 1;
  }

  const activeDays = daysWithMeals.size || 1;
  const macrosByDayList = DAYS.map((day) => ({
    day,
    ...macrosByDay[day],
  }));

  return {
    memberId: member.id,
    name: member.name,
    mealCount: mealLog.length,
    mealLog,
    familyCounts: Object.entries(familyCounts).map(([key, count]) => ({
      key,
      label: FAMILY_LABELS[key] ?? key,
      count,
    })),
    dishCounts: Object.entries(dishCounts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count),
    macrosWeek,
    macrosByDay: macrosByDayList,
    averages: {
      mealsPerDay: Math.round((mealLog.length / activeDays) * 10) / 10,
      macrosPerDay: {
        protein: Math.round(macrosWeek.protein / activeDays),
        carbs: Math.round(macrosWeek.carbs / activeDays),
        fat: Math.round(macrosWeek.fat / activeDays),
        kcal: Math.round(macrosWeek.kcal / activeDays),
      },
    },
  };
}

function buildFamilyRecipesMap(entries) {
  const maps = {};
  for (const entry of entries) {
    if (!maps[entry.family]) maps[entry.family] = new Map();
    maps[entry.family].set(entry.name, (maps[entry.family].get(entry.name) ?? 0) + 1);
  }
  return Object.fromEntries(
    Object.entries(maps).map(([key, map]) => [
      key,
      [...map.entries()]
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count),
    ])
  );
}

function aggregateGroupConsumption(membersConsumption) {
  const familyCounts = {};
  const dishCounts = {};
  const macrosWeek = { ...EMPTY_MACROS };
  const allEntries = [];
  const byDay = Object.fromEntries(
    DAYS.map((d) => [d, { day: d, meals: [], familyCounts: {}, macros: { ...EMPTY_MACROS } }])
  );

  for (const member of membersConsumption) {
    for (const entry of member.mealLog) {
      allEntries.push(entry);
      addCount(familyCounts, entry.family);
      addCount(dishCounts, entry.name);
      Object.assign(macrosWeek, sumMacros(macrosWeek, entry.macros));

      const dayRow = byDay[entry.day];
      dayRow.meals.push({ ...entry, memberName: member.name });
      addCount(dayRow.familyCounts, entry.family);
      dayRow.macros = sumMacros(dayRow.macros, entry.macros);
    }
  }

  const familyRecipes = buildFamilyRecipesMap(allEntries);
  const mealCount = membersConsumption.reduce((s, m) => s + m.mealCount, 0);

  return {
    mealCount,
    familyCounts: Object.entries(familyCounts)
      .map(([key, count]) => ({
        key,
        label: FAMILY_LABELS[key] ?? key,
        count,
        recipeCount: familyRecipes[key]?.length ?? 0,
        recipes: familyRecipes[key] ?? [],
      }))
      .sort((a, b) => b.count - a.count),
    familyRecipes,
    dishCounts: Object.entries(dishCounts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count),
    byDay: DAYS.map((day) => ({
      day,
      meals: byDay[day].meals,
      familyCounts: Object.entries(byDay[day].familyCounts).map(([key, count]) => ({
        key,
        label: FAMILY_LABELS[key] ?? key,
        count,
      })),
      macros: byDay[day].macros,
      mealCount: byDay[day].meals.length,
    })),
    macrosWeek,
    macrosByDay: DAYS.map((day) => ({
      day,
      ...byDay[day].macros,
      meals: byDay[day].meals.length,
    })),
  };
}

export function getGroupConsumption(menuPlan, group, data) {
  const meals = getMeals(data);
  const members = membersOfGroup(group, data.members ?? []);
  const membersConsumption = members.map((m) =>
    buildMemberConsumption(m, group, menuPlan, data, meals)
  );
  const aggregate = aggregateGroupConsumption(membersConsumption);

  return {
    groupId: group.id,
    label: group.label,
    color: group.color,
    memberCount: members.length,
    hasMeals: aggregate.mealCount > 0,
    members: membersConsumption,
    ...aggregate,
  };
}

export function filterConsumptionByMeal(consumption, mealFilter) {
  if (!consumption || mealFilter === "all") return consumption;

  const members = consumption.members.map((member) => {
    const mealLog = member.mealLog.filter((e) => e.meal === mealFilter);
    const familyCounts = {};
    const dishCounts = {};
    const macrosWeek = { ...EMPTY_MACROS };
    const daysWithMeals = new Set();

    for (const entry of mealLog) {
      addCount(familyCounts, entry.family);
      addCount(dishCounts, entry.name);
      Object.assign(macrosWeek, sumMacros(macrosWeek, entry.macros));
      daysWithMeals.add(entry.day);
    }

    const familyRecipes = buildFamilyRecipesMap(mealLog);
    const activeDays = daysWithMeals.size || 1;

    return {
      ...member,
      mealLog,
      mealCount: mealLog.length,
      familyCounts: Object.entries(familyCounts).map(([key, count]) => ({
        key,
        label: FAMILY_LABELS[key] ?? key,
        count,
        recipeCount: familyRecipes[key]?.length ?? 0,
        recipes: familyRecipes[key] ?? [],
      })),
      dishCounts: Object.entries(dishCounts)
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count),
      macrosWeek,
      averages: {
        mealsPerDay: Math.round((mealLog.length / activeDays) * 10) / 10,
        macrosPerDay: {
          protein: Math.round(macrosWeek.protein / activeDays),
          carbs: Math.round(macrosWeek.carbs / activeDays),
          fat: Math.round(macrosWeek.fat / activeDays),
          kcal: Math.round(macrosWeek.kcal / activeDays),
        },
      },
    };
  });

  const aggregate = aggregateGroupConsumption(members);
  return {
    ...consumption,
    ...aggregate,
    members,
    hasMeals: aggregate.mealCount > 0,
  };
}

export function mergeConsumptionGroups(groups) {
  const active = groups.filter((g) => g.hasMeals);
  if (active.length === 0) {
    return {
      groupId: "all",
      label: "Todos",
      color: "#2d5a3d",
      hasMeals: false,
      mealCount: 0,
      familyCounts: [],
      dishCounts: [],
      byDay: DAYS.map((day) => ({ day, meals: [], familyCounts: [], macros: { ...EMPTY_MACROS }, mealCount: 0 })),
      macrosWeek: { ...EMPTY_MACROS },
      macrosByDay: DAYS.map((day) => ({ day, ...EMPTY_MACROS, meals: 0 })),
      members: [],
      memberCount: 0,
    };
  }

  const familyCounts = {};
  const dishCounts = {};
  const familyRecipeMaps = {};
  const macrosWeek = { ...EMPTY_MACROS };
  const byDay = Object.fromEntries(
    DAYS.map((d) => [d, { day: d, meals: [], familyCounts: {}, macros: { ...EMPTY_MACROS } }])
  );
  const members = [];
  let mealCount = 0;

  for (const group of active) {
    mealCount += group.mealCount;
    for (const { key, count } of group.familyCounts) addCount(familyCounts, key, count);
    for (const { name, count } of group.dishCounts) addCount(dishCounts, name, count);
    for (const [key, recipes] of Object.entries(group.familyRecipes ?? {})) {
      if (!familyRecipeMaps[key]) familyRecipeMaps[key] = new Map();
      for (const { name, count } of recipes) {
        familyRecipeMaps[key].set(name, (familyRecipeMaps[key].get(name) ?? 0) + count);
      }
    }
    macrosWeek.protein += group.macrosWeek.protein;
    macrosWeek.carbs += group.macrosWeek.carbs;
    macrosWeek.fat += group.macrosWeek.fat;
    macrosWeek.kcal += group.macrosWeek.kcal;
    members.push(...group.members);

    for (const dayRow of group.byDay) {
      const target = byDay[dayRow.day];
      target.meals.push(...dayRow.meals);
      for (const { key, count } of dayRow.familyCounts) addCount(target.familyCounts, key, count);
      target.macros = sumMacros(target.macros, dayRow.macros);
    }
  }

  const familyRecipes = Object.fromEntries(
    Object.entries(familyRecipeMaps).map(([key, map]) => [
      key,
      [...map.entries()]
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count),
    ])
  );

  return {
    groupId: "all",
    label: "Todos",
    color: "#2d5a3d",
    hasMeals: mealCount > 0,
    memberCount: members.length,
    members,
    mealCount,
    familyCounts: Object.entries(familyCounts)
      .map(([key, count]) => ({
        key,
        label: FAMILY_LABELS[key] ?? key,
        count,
        recipeCount: familyRecipes[key]?.length ?? 0,
        recipes: familyRecipes[key] ?? [],
      }))
      .sort((a, b) => b.count - a.count),
    familyRecipes,
    dishCounts: Object.entries(dishCounts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count),
    byDay: DAYS.map((day) => ({
      day,
      meals: byDay[day].meals,
      familyCounts: Object.entries(byDay[day].familyCounts).map(([key, count]) => ({
        key,
        label: FAMILY_LABELS[key] ?? key,
        count,
      })),
      macros: byDay[day].macros,
      mealCount: byDay[day].meals.length,
    })),
    macrosWeek,
    macrosByDay: DAYS.map((day) => ({
      day,
      ...byDay[day].macros,
      meals: byDay[day].meals.length,
    })),
  };
}

export function getConsumptionInsights(menuPlan, groups, data) {
  return groups.map((group) => getGroupConsumption(menuPlan, group, data));
}
