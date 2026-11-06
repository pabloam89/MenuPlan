/**
 * Lo de casa se da por gastado al final del día, también si nadie abre la app (#1330). Cada noche, por casa con menú
 * activo y despensa, lo planificado para los días ya pasados baja de `user_pantry`. Lo llama la pasada de caducidades
 * (caducidades.js), con la misma lógica que la app: `diasPorBarrer` y `barrerDias` (src/lib/barridoDia.js).
 *
 * El servidor es el único que barre las casas de la nube: si lo hicieran también los móviles, los dos descontarían lo
 * mismo. Y entre dos pasadas:
 *   · La marca del día (`pantryDayDeltas`) se guarda ANTES de tocar la despensa, con la versión de la casa (conCasa).
 *     Si dos pasadas se cruzan, una choca, relee y ya no ve el día pendiente.
 *   · Si la pasada muere entre la marca y la despensa, ese día se queda sin bajar: sobra algo en la lista, y se ve y se
 *     corrige a mano. Al revés, se descontaría dos veces, y eso no se ve.
 */

import { select, update, borrar, eq } from "./db.js";
import { conCasa } from "./casa.js";
import { grupos, leerDespensa, prepararRecetas } from "./menu.js";
import { avisarFallo } from "./avisar.js";
import { barrerDias, diasPorBarrer, podarMarcas } from "../../src/lib/barridoDia.js";
import { estrenoFinDelDia, makeDeltaBucket } from "../../src/lib/pantryDeltas.js";

const INTENTOS = 3;

/**
 * Lo que toca hacer esta noche en una casa: `null`, nada; `escrituras`, las filas que bajan de la despensa.
 * Una casa con un modo antiguo o sin fecha de inicio solo se prepara: barre desde hoy, en la pasada de mañana. La que
 * aún tiene que devolver cantidades a la despensa («al generar») no se toca: la pasa la app (`estrenoFinDelDia`).
 * @param {{ casa: object, stock: object[], hoy: string, ahoraMs: number,
 *   usados: (dayPlan: object, stock: object[]) => object[],
 *   aplicar: (usados: object[], stock: object[]) => { workingStock: object[], deltas: object[] } }} args
 * @returns {Promise<null | { patch: object, escrituras: { id: any, leida: any, quitar: number }[] }>}
 */
export async function planDeLaNoche({ casa, stock, hoy, ahoraMs, usados, aplicar }) {
  const data = casa.state?.data ?? {};
  const menuId = casa.menu.id;
  const semanas = (casa.semanas ?? []).map((s) => ({ startISO: s.weekStart, endISO: s.weekEnd, plan: s.plan }));
  const estreno = estrenoFinDelDia({ ...data, activeMenuId: menuId, menus: { [menuId]: { weeks: semanas } } }, hoy);
  if (estreno) return estreno.deltas.length ? null : { patch: estreno.patch, escrituras: [] };
  if (!data.pantryEndOfDaySince) return { patch: { pantryEndOfDaySince: hoy }, escrituras: [] };

  const dias = diasPorBarrer({ semanas, ya: data.pantryDayDeltas, desde: data.pantryEndOfDaySince, hoy });
  if (!dias.length) return null;
  let actual = stock;
  const barridos = await barrerDias({
    dias,
    cargar: async () => ({ data: actual, error: null }),
    usados,
    consumir: async (lista, despensa) => {
      const { workingStock, deltas } = aplicar(lista, despensa);
      actual = workingStock;
      return { deltas };
    },
  });
  const marcas = Object.fromEntries(Object.entries(barridos).map(([dia, deltas]) => [dia, makeDeltaBucket(menuId, deltas, ahoraMs)]));
  const quedan = new Map(actual.map((f) => [f.id, Number(f.qty) || 0]));
  const escrituras = stock
    .map((f) => ({ id: f.id, leida: f.qty, quitar: (Number(f.qty) || 0) - (quedan.get(f.id) ?? 0) }))
    .filter((f) => f.quitar > 0);
  return { patch: { pantryDayDeltas: podarMarcas({ ...(data.pantryDayDeltas ?? {}), ...marcas }, hoy) }, escrituras };
}

/**
 * Baja una fila solo si sigue con la cantidad leída; si alguien la cambió entretanto (Lola, un ticket), resta sobre la
 * nueva. Una fila que llega a cero se borra, como en la app (setPantryItemQty). Devuelve si ha quedado hecho.
 */
export async function escribirGasto({ id, leida, quitar }) {
  let actual = leida;
  for (let i = 0; i < INTENTOS; i++) {
    const nueva = (Number(actual) || 0) - quitar;
    const filtro = `id=${eq(id)}&qty=${actual == null ? "is.null" : eq(actual)}`;
    if (nueva <= 0) await borrar("user_pantry", filtro);
    else if ((await update("user_pantry", filtro, { qty: nueva }))?.length) return true;
    // Un borrado no dice si tocó algo: lo que cuenta es si la fila sigue ahí.
    const [fila] = await select("user_pantry", `id=${eq(id)}`, "qty");
    if (!fila) return true; // ya no está: no queda nada que gastar
    actual = fila.qty;
  }
  return false;
}

async function barrerCasa(householdId, { hoy, ahoraMs }) {
  let plan = null;
  const r = await conCasa(householdId, async (casa) => {
    plan = null;
    if (!casa.menu) return null;
    // El motor con las recetas de esta casa: sin ellas ningún plato del menú tiene ingredientes y no bajaría nada.
    const m = await prepararRecetas(casa);
    const stock = await leerDespensa(m, householdId);
    // Sin leer la despensa no se sabe qué gastar, y marcar el día lo dejaría sin bajar para siempre (#317).
    if (stock == null) return null;
    const data = casa.state?.data ?? {};
    const gs = grupos(casa);
    const comidas = m.getDayMeals(data);
    plan = await planDeLaNoche({
      casa, stock, hoy, ahoraMs,
      usados: (dayPlan, despensa) => (m.buildShoppingList(dayPlan, gs, comidas, despensa).pantryItems ?? [])
        .map((it) => ({ name: it.name, qty: it.qty, unit: it.unit })),
      aplicar: m.applyConsumption,
    });
    return plan ? { state: { ...casa.state, data: { ...data, ...plan.patch } }, sinDeshacer: true } : null;
  });
  if (!r.ok) throw new Error(r.error ?? "sin guardar");
  if (r.sinCambios || !plan) return { filas: 0, sinBajar: 0 };
  let sinBajar = 0;
  for (const e of plan.escrituras) if (!(await escribirGasto(e))) sinBajar++;
  return { filas: plan.escrituras.length, sinBajar };
}

/**
 * La pasada de la noche. Cada casa por su cuenta: si una falla, las demás siguen, y sus días pendientes se recogen la
 * noche siguiente. Solo las casas con menú activo y algo en la despensa: sin eso no hay nada que bajar.
 */
export async function barrerDespensa({ hoy, ahoraMs = Date.now() }) {
  const menus = await select("user_menus", "is_active=eq.true&household_id=not.is.null", "household_id");
  const out = { casas: 0, filas: 0, sinBajar: 0, fallos: 0 };
  for (const householdId of new Set(menus.map((f) => f.household_id))) {
    try {
      const [conDespensa] = await select("user_pantry", `household_id=${eq(householdId)}&limit=1`, "id");
      if (!conDespensa) continue;
      const r = await barrerCasa(householdId, { hoy, ahoraMs });
      out.casas++;
      out.filas += r.filas;
      out.sinBajar += r.sinBajar;
    } catch (e) {
      out.fallos++;
      avisarFallo("despensa_noche", e, { grave: false });
    }
  }
  return out;
}
