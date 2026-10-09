import { membersOfGroup } from "./groups.js";
import { DIAS, COMIDAS, DONDE_COME } from "./vocabularios.js";
import { DIA_LARGO } from "./dias.js";

// La lista vive en vocabularios.js (fuente única); aquí con su nombre de siempre.
export const DAYS = DIAS;

export const DAY_LABELS = DIA_LARGO;

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
  return COMIDAS.filter((m) => active.has(m));
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
export const SLOT_VALUES = DONDE_COME;

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

/**
 * Cuántos HUECOS de plato tiene la semana: 2 por cada comida que se cocina
 * (primero + segundo), 1 por cada cena, menos 1 por cada comida que sea de un
 * solo plato (plato único marcado a mano, o la estructura "1_plato" de la casa).
 *
 * Es el presupuesto real al que hay que bajar el reparto (`repartoAFreqs`), y
 * cambia por grupo y por semana: una casa con los niños en el cole tres días,
 * o una semana que empieza en miércoles, tienen menos huecos que los 21 de
 * libro. Bajar un porcentaje contra una constante es lo que dejaba siete huecos
 * por semana sin cuota — ver el comentario de `repartoAFreqs`.
 *
 * `aiPlanner` no necesita llamar a esto: al generar ya tiene `ctx.slots.length`,
 * que es este mismo número contado slot a slot. Esto es para quien lo necesita
 * ANTES de generar (la pantalla del reparto, el estilo de comida).
 *
 * @param {object} data
 * @param {object} [group] - grupo concreto; sin él, la casa entera.
 */
export function weeklySlotBudget(data, group = null) {
  const meals = getMeals(data);
  const members = data?.members ?? [];
  const schedule = data?.schedule ?? {};
  const slotType = data?.slotType ?? {};
  const target = group ?? { memberIds: members.map((m) => m.id) };
  const mealStructure =
    data?.mealStructureByGroup?.[group?.id] ?? data?.mealStructure ?? "primero_segundo";
  // La cena tiene estructura propia (ver buildGroupContext): una cena de dos
  // platos son DOS huecos, igual que una comida.
  const estructuraCena =
    data?.mealStructureCenaByGroup?.[group?.id] ?? data?.mealStructureCena ?? "1_plato";

  let comidaDays = 0;
  let cenaDays = 0;
  let cenaDobles = 0;
  let platoUnicoDays = 0;
  for (const day of DAYS) {
    if (meals.includes("Comida") && modeForGroupSlot(target, members, schedule, day, "Comida").cook) {
      comidaDays += 1;
      if (slotType[`${day}|Comida`] === "unico" || mealStructure === "1_plato") platoUnicoDays += 1;
    }
    if (meals.includes("Cena") && modeForGroupSlot(target, members, schedule, day, "Cena").cook) {
      cenaDays += 1;
      if (estructuraCena === "primero_segundo" && slotType[`${day}|Cena`] !== "rapida") cenaDobles += 1;
    }
  }
  return {
    comidaDays,
    cenaDays,
    platoUnicoDays,
    cenaDobles,
    total: Math.max(1, comidaDays * 2 + cenaDays + cenaDobles - platoUnicoDays),
  };
}

// Aquí vivía el planificador local de platos (`generateMenu`, `pickRecipe`,
// `recipeScore` y sus auxiliares) sobre las 29 recetas de prototipo: ya no
// generaba el menú de nadie y solo alimentaba la demo y un test. Retirado el
// 9 oct 2026 (#286): la demo es ahora una lista fija de platos del catálogo
// (src/dev/demoMenu.js) y el motor de verdad es el solver (lib/solver.js).
