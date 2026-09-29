/**
 * Leer y escribir una casa desde el bot.
 *
 * La app guarda la casa en dos sitios y el bot tiene que respetar los dos:
 *   · household_state.state  → { data, menuPlan, shopping, aiRecipes, onbStep }
 *   · user_menu_weeks         → plan y compra de cada semana del menú activo,
 *                               que es lo que la app LEE al cargar el menú.
 *
 * Toda escritura pasa por `bot_save_casa` (0057): comprueba la versión que el
 * bot leyó, escribe en una transacción y sube `bot_rev`, que es lo que hace que
 * la app recargue en vez de pisar el cambio. Si otra escritura del bot se ha
 * cruzado, vuelve `conflicto` y quien llama relee y repite.
 */

import { select, rpc, eq } from "./db.js";

const hoyISO = () => new Date().toISOString().slice(0, 10);

/**
 * @returns {Promise<null | {
 *   householdId: string, botRev: number, state: any,
 *   menu: null | { id: string, userId: string },
 *   semana: null | { menuId: string, weekStart: string, weekEnd: string, plan: any, shopping: any },
 * }>}
 */
export async function cargarCasa(householdId) {
  const [fila] = await select("household_state", `household_id=${eq(householdId)}`, "state,bot_rev");
  if (!fila) return null;

  const [menu] = await select(
    "user_menus",
    `household_id=${eq(householdId)}&is_active=eq.true&order=updated_at.desc&limit=1`,
    "id,user_id",
  );

  let semana = null;
  if (menu) {
    const semanas = await select(
      "user_menu_weeks",
      `household_id=${eq(householdId)}&menu_id=${eq(menu.id)}&order=week_offset.asc`,
      "menu_id,week_start,week_end,plan,shopping",
    );
    // La semana que contiene hoy; si no hay, la primera (igual que la app).
    const hoy = hoyISO();
    const s = semanas.find((w) => w.week_start <= hoy && hoy <= w.week_end) ?? semanas[0];
    if (s) semana = { menuId: s.menu_id, weekStart: s.week_start, weekEnd: s.week_end, plan: s.plan, shopping: s.shopping };
  }

  return {
    householdId,
    botRev: Number(fila.bot_rev ?? 0),
    state: fila.state ?? {},
    menu: menu ? { id: menu.id, userId: menu.user_id } : null,
    semana,
  };
}

/**
 * @param {Awaited<ReturnType<typeof cargarCasa>>} casa  la que se leyó (da la versión base)
 * @param {{ state?: any, semana?: { plan?: any, shopping?: any } }} cambios
 * @returns {Promise<{ ok: true, botRev: number } | { ok: false, conflicto: true, botRev: number } | { ok: false, error: string }>}
 */
export async function guardarCasa(casa, { state = null, semana = null } = {}) {
  const week = semana && casa.semana
    ? { menu_id: casa.semana.menuId, week_start: casa.semana.weekStart, ...semana }
    : null;
  const r = await rpc("bot_save_casa", {
    p_household_id: casa.householdId,
    p_base_rev: casa.botRev,
    p_state: state,
    p_week: week,
  });
  if (r?.ok) return { ok: true, botRev: Number(r.bot_rev) };
  if (r?.bot_rev != null) return { ok: false, conflicto: true, botRev: Number(r.bot_rev) };
  return { ok: false, error: r?.error ?? "error desconocido" };
}

/**
 * Leer → cambiar → guardar, reintentando si otra escritura del bot se cruza.
 * `cambiar` recibe la casa fresca y devuelve los cambios para `guardarCasa`
 * (o null para no escribir nada).
 */
export async function conCasa(householdId, cambiar, intentos = 3) {
  for (let i = 0; i < intentos; i++) {
    const casa = await cargarCasa(householdId);
    if (!casa) return { ok: false, error: "sin casa en la nube" };
    const cambios = await cambiar(casa);
    if (!cambios) return { ok: true, casa, sinCambios: true };
    const r = await guardarCasa(casa, cambios);
    if (!r.conflicto) return { ...r, casa };
  }
  return { ok: false, error: "conflicto persistente" };
}
