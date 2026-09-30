/**
 * Generar un menú desde el chat, igual que la app.
 *
 * La preparación de la semana (modo básico, reglas, cena de los niños,
 * reparto) es el MISMO código que usa la app (`src/lib/prepararGeneracion.js`,
 * sacado de regenerateMenu el 30 sep 2026), y el motor es el solver. Luego se
 * guarda como lo guarda la app (`saveMenu` + `activate_household_menu`):
 * user_menus + user_menu_weeks + user_menu_recipes, y se activa. Por último se
 * sube `bot_rev` para que la app abierta recargue en vez de pisarlo.
 *
 * Despensa: igual que la app con sesión. Se lee `user_pantry` de la casa con
 * la misma forma (`mapRow`), sesga el menú según `pantryMode` y SIEMPRE se
 * pasa a la compra para marcar «ya en casa». La app con sesión no descuenta
 * stock al generar (lo hace al cocinar o al cerrar el día), así que aquí
 * tampoco.
 *
 * Diferencia con la app, a propósito: una sola semana por petición («esta»
 * desde hoy, o «la que viene»).
 */

// Las fechas de la semana (computeWeekRange) se calculan en hora local: en el
// servidor, la de España, no UTC.
process.env.TZ = "Europe/Madrid";

import { select, insert, update, eq } from "./db.js";
import { cargarCasa, guardarCasa } from "./casa.js";
import { motor } from "./menu.js";
import { registrar, EMBUDO } from "./embudo.js";

const hoyISO = () => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Madrid" }).format(new Date());
const indiceHoy = () => {
  const d = new Intl.DateTimeFormat("en-GB", { weekday: "short", timeZone: "Europe/Madrid" }).format(new Date());
  return ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(d);
};

/**
 * @param {"esta" | "siguiente"} cual
 * @returns {Promise<string>} texto para el agente
 */
export async function generarMenu(householdId, cual = "esta") {
  const casa = await cargarCasa(householdId);
  if (!casa) return "Esta casa todavía no tiene datos en la nube.";
  const m = await motor();

  const working = m.resolveModeData(casa.state?.data ?? {});
  const miembros = working.members ?? [];
  let groups = working.groups ?? [];
  const conGente = (gs) => gs.some((g) => m.membersOfGroup(g, miembros).length > 0);
  if (miembros.length && (!groups.length || !conGente(groups))) groups = m.groupsFromModel(miembros, working.menuModel);
  if (!groups.length || !conGente(groups)) return "Antes de generar necesito saber quién come en casa: añade al menos una persona.";

  // «Esta semana» empieza hoy (no tiene sentido planificar el lunes pasado);
  // «la siguiente», el lunes que viene y entera.
  const offset = cual === "siguiente" ? 1 : 0;
  const startDayIdx = offset === 0 ? Math.max(0, indiceHoy()) : 0;
  const days = m.explicitDaysForOffset(working, offset);
  const { startISO, endISO, activeDays } = m.computeWeekRange(offset, startDayIdx, days);
  const varietyPref = ["strict", "moderate", "relaxed"].includes(working.menuVarietyPref) ? working.menuVarietyPref : "strict";

  const { weekData, crossWeek, weekSchedule } = m.prepararSemana(working, {
    groups, offset, w: 0, startDayIdx, days, activeDays, startISO, endISO,
    weekOffsets: [offset], sameForAllWeeks: true, varietyPref, weekCount: 1, hoy: hoyISO(),
  });

  const filasDespensa = await select("user_pantry", `household_id=${eq(householdId)}&order=created_at.asc`, m.COLUMNAS_DESPENSA).catch(() => []);
  const despensa = filasDespensa.map(m.filaDeDespensa);
  const pantryMode = ["strict", "only", "prefer", "off"].includes(working.pantryMode) ? working.pantryMode : "off";
  const pantryIngredients = pantryMode === "off" ? [] : despensa;

  const { plan, recipes } = await m.generateMenuWithAI(weekData, { pantryIngredients, pantryMode, crossWeek });
  m.registerRecipes(recipes);
  const sh = m.buildShoppingList(plan, groups, m.getDayMeals(weekData), despensa);
  const shopping = { items: [...sh.byCategory.flatMap((c) => c.items), ...(sh.pantryItems ?? [])] };

  const week = { offset, startDayIdx, days, startISO, endISO, plan, shopping, schedule: weekSchedule };
  const menu = { id: m.createMenuId(), createdAt: Date.now(), isFavorite: false, isActive: true, activatedAt: null, varietyPref, weeks: { [startISO]: week } };

  // Como saveMenu: primero el menú INACTIVO con sus semanas y recetas; solo
  // si todo entra, se activa. Un menú a medias nunca queda activo.
  const [hogar] = await select("households", `id=${eq(householdId)}`, "owner_user_id");
  const dueno = hogar?.owner_user_id;
  if (!dueno) return "No encuentro quién gestiona esta casa.";
  const previos = await select("user_menus", `household_id=${eq(householdId)}&limit=1`, "id");

  // Las otras semanas del menú activo que no han pasado y no chocan con la
  // nueva se quedan: pedir la semana que viene no puede borrar la cena de
  // hoy (pasó el 30 sep 2026). Van copiadas al menú nuevo, con sus recetas,
  // así que el anterior sigue intacto en el historial y deshacer lo reactiva.
  const hoy = hoyISO();
  const seQuedan = casa.menu
    ? (casa.semanas ?? []).filter((w) => w.weekEnd >= hoy && (w.weekEnd < startISO || w.weekStart > endISO))
    : [];
  const COLUMNAS_SEMANA = "user_id,household_id,week_start,week_end,week_offset,start_day_idx,active_days,plan,shopping,schedule";
  const semanasQueSeQuedan = seQuedan.length
    ? (await select("user_menu_weeks", `household_id=${eq(householdId)}&menu_id=${eq(casa.menu.id)}`, COLUMNAS_SEMANA))
      .filter((w) => seQuedan.some((s) => s.weekStart === w.week_start))
    : [];
  const recetasQueSeQuedan = semanasQueSeQuedan.length
    ? await select("user_menu_recipes", `household_id=${eq(householdId)}&menu_id=${eq(casa.menu.id)}`, "recipe_id,recipe_snapshot")
    : [];

  await insert("user_menus", [m.menuToRow(menu, dueno, householdId)]);
  await insert("user_menu_weeks", [
    m.weekToRow(dueno, menu.id, startISO, week, householdId),
    ...semanasQueSeQuedan.map((w) => ({ ...w, menu_id: menu.id })),
  ]);
  const porReceta = new Map(recetasQueSeQuedan.map((f) => [f.recipe_id, f.recipe_snapshot]));
  for (const r of recipes) if (r?.id) porReceta.set(r.id, r);
  const filas = [...porReceta].filter(([, snap]) => snap).map(([recipe_id, recipe_snapshot]) => ({
    user_id: dueno, household_id: householdId, menu_id: menu.id, recipe_id, recipe_snapshot,
  }));
  if (filas.length) await insert("user_menu_recipes", filas, { upsert: true });

  // activate_household_menu, hecho desde el servidor: uno activo por casa.
  await update("user_menus", `household_id=${eq(householdId)}&is_active=eq.true`, { is_active: false });
  await update("user_menus", `household_id=${eq(householdId)}&id=${eq(menu.id)}`, { is_active: true });

  // La foto de la casa: plan y compra vivos, recetas registradas y el puntero
  // al menú activo. Sube bot_rev, así que la app abierta recarga.
  const porId = new Map((casa.state?.aiRecipes ?? []).map((r) => [r.id, r]));
  for (const r of recipes) porId.set(r.id, r);
  // La foto viva es la semana de hoy: si la que se queda es la de hoy (se ha
  // pedido la siguiente), sigue siendo esa.
  const deHoy = semanasQueSeQuedan.find((w) => w.week_start <= hoy && hoy <= w.week_end);
  const state = {
    ...casa.state,
    data: { ...(casa.state?.data ?? {}), activeMenuId: menu.id },
    menuPlan: deHoy && !(startISO <= hoy && hoy <= endISO) ? deHoy.plan : plan,
    shopping: deHoy && !(startISO <= hoy && hoy <= endISO) ? deHoy.shopping : shopping,
    aiRecipes: [...porId.values()],
  };
  const r = await guardarCasa(casa, { state });
  if (!r.ok && r.conflicto) {
    // Otra escritura del bot se cruzó: el menú ya está guardado y activo en
    // sus tablas, que es lo que la app lee al cargar. Se reintenta la foto.
    const fresca = await cargarCasa(householdId);
    await guardarCasa(fresca, { state: { ...fresca.state, data: { ...fresca.state.data, activeMenuId: menu.id }, menuPlan: state.menuPlan, shopping: state.shopping, aiRecipes: state.aiRecipes } });
  }

  if (!previos.length) await registrar(EMBUDO.PRIMER_MENU, { userId: dueno, unaVez: true });

  const platos = Object.entries(plan).filter(([k]) => !k.startsWith("_")).reduce((n, [, h]) => n + Object.values(h ?? {}).filter((x) => x?.recipeId).length, 0);
  const avisos = (plan._warnings ?? []).length;
  const conservadas = semanasQueSeQuedan.map((w) => `del ${w.week_start} al ${w.week_end}`);
  return `Menú nuevo generado y activado: del ${startISO} al ${endISO}, ${platos} huecos con plato${avisos ? ` (${avisos} avisos del motor: huecos que no encajaban del todo)` : ""}.`
    + (conservadas.length ? ` Se conserva tal cual la semana ${conservadas.join(" y ")}.` : "")
    + ` Enséñaselo con ver_menu${cual === "siguiente" ? " (semana: siguiente)" : ""}.`;
}
