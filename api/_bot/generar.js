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
import { motor, describirMenu, masParecida, normal, prepararRecetas, DIA_LARGO } from "./menu.js";
import { registrar, rastro, EMBUDO } from "./embudo.js";
import { RASTRO } from "../../src/lib/rastro.js";

const hoyISO = () => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Madrid" }).format(new Date());
const indiceHoy = () => {
  const d = new Intl.DateTimeFormat("en-GB", { weekday: "short", timeZone: "Europe/Madrid" }).format(new Date());
  return ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(d);
};

/**
 * @param {"esta" | "siguiente"} cual
 * @returns {Promise<string>} texto para el agente
 */
// Lo que puede ser un plato pedido para una comida o una cena: ni desayunos,
// ni cosas de bebé, ni lo que acompaña.
const FUERA_DE_PEDIDOS = new Set(["bebes", "desayunos", "meriendas", "postres", "salsas", "guarniciones"]);

/**
 * Los platos que piden por su nombre («un día salmón al horno, otro pollo con
 * patatas») como platos fijos del motor, SOLO para esta generación: se
 * resuelven a una receta (la exacta o la más parecida) y el motor los coloca
 * una vez en la semana, en comida o cena. Antes se generaba y luego se cambiaba
 * plato a plato: cada cambio, otra vuelta del modelo en el chat.
 */
export function platosPedidos(m, casa, fijos = []) {
  const propias = casa.state?.data?.userRecipes ?? [];
  const candidatas = [...propias, ...m.recipeCatalog].filter((r) => r?.name && !FUERA_DE_PEDIDOS.has(r.category));
  return fijos.filter((f) => f?.nombre).map((f) => {
    const q = normal(f.nombre);
    const exacta = candidatas.find((r) => normal(r.name) === q);
    const receta = exacta ?? masParecida(candidatas, f.nombre);
    const roles = receta?.mealRole ?? [];
    const comida = f.comida === "Cena" || f.comida === "Comida" ? f.comida
      : roles.includes("cena") && !roles.includes("segundo") ? "Cena" : "Comida";
    return {
      pedido: f.nombre,
      aproximada: !exacta,
      fijo: { name: receta?.name ?? f.nombre, ...(receta?.id ? { catalogId: receta.id } : {}), timesPerWeek: 1, meals: [comida] },
    };
  });
}

/**
 * La clave del hueco («Lun-Comida») donde está un plato pedido, o null. Solo
 * en los días activos de la semana (`activos`): el motor planifica la semana
 * entera, y un menú hecho un jueves podía dejar lo pedido el lunes, que ya
 * pasó; contaba como puesto, nadie lo veía y no se recolocaba.
 */
function claveDelPedido(fijo, plan, activos = null) {
  if (!fijo.catalogId) return null;
  for (const [gid, huecos] of Object.entries(plan)) {
    if (gid.startsWith("_")) continue;
    for (const [clave, h] of Object.entries(huecos ?? {})) {
      if (activos?.length && !activos.includes(clave.split("-")[0])) continue;
      const ids = [h?.recipeId, h?.firstRecipeId].filter(Boolean).map((id) => String(id).split("__").pop());
      if (ids.includes(fijo.catalogId)) return clave;
    }
  }
  return null;
}

const FINDE = new Set(["Sáb", "Dom"]);
// Por encima de esto, mejor en fin de semana: es donde la casa tiene tiempo.
const MINUTOS_ENTRE_SEMANA = 30;

/**
 * Los platos pedidos que el motor no ha dejado en el plan, colocados a mano en
 * el servidor. Pasa: dos fijos van al mismo día, juntos se pasan del tiempo de
 * una comida entre semana, y la reparación posterior quita uno (las lentejas
 * «no cabían»); con plato único, a veces no se coloca ninguno. Cada uno va a un
 * día sin otro pedido (los largos, antes en fin de semana), en la franja que
 * toca y como primero o como principal según la receta y la estructura de la
 * casa, en todos los grupos que comen esa franja salvo el del bebé. Muta
 * `plan` y `recipes`; devuelve lo que ha colocado.
 */
export function colocarPedidos(m, data, plan, recipes, pedidos, activeDays) {
  const colocados = [];
  const ocupados = new Set(pedidos.map((p) => claveDelPedido(p.fijo, plan, activeDays)?.split("-")[0]).filter(Boolean));
  for (const p of pedidos) {
    if (claveDelPedido(p.fijo, plan, activeDays)) continue;
    const receta = m.recipeCatalogById?.[p.fijo.catalogId] ?? (data.userRecipes ?? []).find((r) => r.id === p.fijo.catalogId);
    if (!receta) continue;
    const franja = p.fijo.meals?.[0] ?? "Comida";
    const largo = (receta.time ?? 0) > MINUTOS_ENTRE_SEMANA;
    const dias = largo ? [...activeDays.filter((d) => FINDE.has(d)), ...activeDays.filter((d) => !FINDE.has(d))] : activeDays;
    const roles = receta.mealRole ?? [];
    for (const d of dias) {
      if (ocupados.has(d)) continue;
      let puesto = false;
      for (const [gid, huecos] of Object.entries(plan)) {
        const clave = `${d}-${franja}`;
        const h = gid.startsWith("_") ? null : huecos?.[clave];
        if (!h || /(^|__)bebes_/.test(h.recipeId ?? "")) continue;
        const course = h.firstRecipeId && roles.includes("primero") && !roles.includes("segundo") ? "first" : "main";
        const el = m.pickCatalogReplacement(data, plan, { groupId: gid, day: d, meal: franja, course, forcedRecipe: receta });
        if (!el?.recipeId) continue;
        plan[gid][clave] = { ...h, [course === "first" ? "firstRecipeId" : "recipeId"]: el.recipeId, warnings: [] };
        m.registerRecipes([el.frontendRecipe]);
        recipes.push(el.frontendRecipe);
        puesto = true;
      }
      if (puesto) {
        ocupados.add(d);
        colocados.push(p.pedido);
        break;
      }
    }
  }
  return colocados;
}

/** Dónde ha quedado cada plato pedido en el plan, en palabras. */
export function dondeQuedaron(pedidos, plan, activos = null) {
  return pedidos.map(({ pedido, aproximada, fijo }) => {
    const clave = claveDelPedido(fijo, plan, activos);
    const [d, franja] = clave ? clave.split("-") : [];
    const donde = clave ? `${DIA_LARGO[d] ?? d}, ${franja.toLowerCase()}` : null;
    return donde
      ? `«${pedido}» → ${fijo.name} (${donde})${aproximada ? ", lo más parecido que hay" : ""}`
      : `«${pedido}» no ha cabido en la semana: ofrece ponerlo con cambiar_plato`;
  });
}

export async function generarMenu(householdId, cual = "esta", fijos = [], out = null) {
  const casa = await cargarCasa(householdId);
  if (!casa) return "Esta casa todavía no tiene datos en la nube.";
  const m = await motor();
  // Las recetas propias de la casa, registradas para resolver los pedidos.
  if (fijos.length) await prepararRecetas(casa).catch(() => {});

  const base = m.resolveModeData(casa.state?.data ?? {});
  const pedidos = platosPedidos(m, casa, fijos);
  const working = pedidos.length ? { ...base, fixedDishes: [...(base.fixedDishes ?? []), ...pedidos.map((p) => p.fijo)] } : base;
  const miembros = working.members ?? [];
  let groups = working.groups ?? [];
  const conGente = (gs) => gs.some((g) => m.membersOfGroup(g, miembros).length > 0);
  // Una casa del chat sin modelo de menú es de antes de «todos comen lo
  // mismo»: el reparto por edades que tiene no lo eligió nadie. Al generar
  // (el plan es nuevo, no se pierde nada) pasa a un solo menú. Un reparto
  // elegido (menuModel puesto, o menús individuales) no se toca.
  const modeloElegido = Boolean(casa.state?.data?.menuModel);
  const soloPorEdades = groups.length > 1 && groups.every((g) => !g.adHoc && ["Adultos", "Niños", "Bebé"].includes(g.label));
  const vivas = (casa.semanas ?? []).filter((w) => w.weekEnd >= hoyISO());
  // Si otra semana del menú se queda, sus huecos van con los ids de ahora: no
  // se reagrupa (se hará cuando se rehaga esa).
  const quedaOtra = cual === "siguiente" ? vivas.some((w) => w.weekStart <= hoyISO()) : vivas.some((w) => w.weekStart > hoyISO());
  if (!modeloElegido && soloPorEdades && !quedaOtra) groups = [];
  const modelo = working.menuModel ?? "same";
  if (miembros.length && (!groups.length || !conGente(groups))) groups = m.groupsFromModel(miembros, modelo);
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
  // Lo pedido que el motor no haya dejado, antes de la compra (que sale del plan).
  if (pedidos.length) colocarPedidos(m, { schedule: {}, ...working, groups }, plan, recipes, pedidos, activeDays);
  const sh = m.buildShoppingList(plan, groups, m.getDayMeals(weekData), despensa);
  // Lo apuntado a mano y sin comprar («apunta leche y pan», con o sin menú)
  // pasa a la lista nueva: generar un menú no puede borrarlo.
  const aMano = (casa.semana?.shopping?.items ?? casa.state?.shopping?.items ?? []).filter((it) => it.manual && !it.have);
  const shopping = { items: [...sh.byCategory.flatMap((c) => c.items), ...(sh.pantryItems ?? []), ...aMano] };

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
    // Los grupos, si se sacaron del modelo aquí: sin ellos en la casa, el plan
    // tiene grupos que nadie conoce y proponer o cambiar un plato salen vacíos
    // (pasaba en todas las casas creadas desde el chat).
    data: { ...(casa.state?.data ?? {}), activeMenuId: menu.id, menuModel: casa.state?.data?.menuModel ?? "same", ...(groups !== (working.groups ?? []) ? { groups } : {}) },
    menuPlan: deHoy && !(startISO <= hoy && hoy <= endISO) ? deHoy.plan : plan,
    shopping: deHoy && !(startISO <= hoy && hoy <= endISO) ? deHoy.shopping : shopping,
    aiRecipes: [...porId.values()],
  };
  let r = await guardarCasa(casa, { state });
  // Otra escritura se cruzó (del bot o, desde la 0068, cualquier toque en la
  // app: tachar algo de la compra). El menú ya está guardado y activo en sus
  // tablas, que es lo que la app lee al cargar; falta la foto de la casa. Se
  // reintenta sobre la casa fresca, con lo que tocó esta generación y nada más.
  for (let i = 0; i < 3 && !r.ok && r.conflicto; i++) {
    const fresca = await cargarCasa(householdId, { fresca: true });
    if (!fresca) break;
    const d = fresca.state?.data ?? {};
    r = await guardarCasa(fresca, { state: {
      ...fresca.state,
      data: { ...d, activeMenuId: menu.id, menuModel: state.data.menuModel, ...(state.data.groups ? { groups: state.data.groups } : {}) },
      menuPlan: state.menuPlan, shopping: state.shopping, aiRecipes: state.aiRecipes,
    } });
  }
  if (!r.ok) console.error("[generar] la foto de la casa no se guardó", r.error ?? "conflicto");

  if (!previos.length) await registrar(EMBUDO.PRIMER_MENU, { userId: dueno, unaVez: true });

  const platos = Object.entries(plan).filter(([k]) => !k.startsWith("_")).reduce((n, [, h]) => n + Object.values(h ?? {}).filter((x) => x?.recipeId).length, 0);
  const avisos = (plan._warnings ?? []).length;
  const conservadas = semanasQueSeQuedan.map((w) => `del ${w.week_start} al ${w.week_end}`);
  // La semana generada va en la propia respuesta: sin ella, el modelo llamaba
  // a ver_menu justo después (y otra vez tras cada cambio), y un «hazme el
  // menú con salmón un día» tardaba casi un minuto en seis vueltas.
  const semana = await describirMenu({ ...casa, menu: null, semanas: null, semana: { plan, weekStart: startISO, weekEnd: endISO, activeDays, startDayIdx, shopping } }).catch(() => "");
  // Para la vía rápida del enrutador (api/_bot/turno.js): lo generado, en datos.
  if (out) Object.assign(out, {
    ok: true, desde: startISO, hasta: endISO, platos, avisos, conservadas,
    pedidos: pedidos.length ? dondeQuedaron(pedidos, plan, activeDays) : [],
    // Dónde quedó cada plato pedido («Jue-Comida»), para destacarlo al pintar.
    colocados: pedidos.map((p) => claveDelPedido(p.fijo, plan, activeDays)).filter(Boolean),
  });
  await rastro(householdId, RASTRO.MENU_GENERADO, { menuId: menu.id, weekStart: startISO, weekEnd: endISO, slots: platos, pedidos: pedidos.length });
  return `Menú nuevo generado y activado: del ${startISO} al ${endISO}, ${platos} huecos con plato${avisos ? ` (${avisos} avisos del motor: huecos que no encajaban del todo)` : ""}.`
    + (conservadas.length ? ` Se conserva tal cual la semana ${conservadas.join(" y ")}.` : "")
    + (pedidos.length ? `\nLo que pidieron, ya puesto (no hace falta cambiar_plato):\n${dondeQuedaron(pedidos, plan, activeDays).join("\n")}` : "")
    + (semana
      ? `\n\nLa semana SALE PINTADA debajo de tu mensaje, con lo pedido destacado: NO la escribas ni llames a ver_menu; di en una o dos frases qué has hecho y dónde ha quedado lo que pidieron. Para que lo sepas (no lo copies):\n${semana}`
      : " La semana la ven con el botón que sale solo: resume en 3-4 líneas qué has hecho.");
}
