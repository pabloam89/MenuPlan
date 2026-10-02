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

import { select, insert, update, rpc, eq } from "./db.js";

// En hora de España: a las 00:30 del jueves, «hoy» es jueves, no el miércoles de UTC.
export const hoyISO = () => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Madrid" }).format(new Date());

const aSemana = (s) => ({
  menuId: s.menu_id, weekStart: s.week_start, weekEnd: s.week_end, startDayIdx: s.start_day_idx ?? 0,
  activeDays: s.active_days ?? null, plan: s.plan, shopping: s.shopping,
});

/**
 * La casa con `semana` apuntando a otra semana del menú activo (la de
 * `weekStart`), o null si el menú no la tiene. Las herramientas que cambian un
 * hueco lo usan para escribir en la semana de la FECHA pedida, no en la viva.
 */
export function enSemana(casa, weekStart) {
  const s = (casa?.semanas ?? []).find((w) => w.weekStart === weekStart);
  return s ? { ...casa, semana: s } : null;
}

/**
 * @returns {Promise<null | {
 *   householdId: string, botRev: number, state: any,
 *   menu: null | { id: string, userId: string },
 *   semana: null | { menuId: string, weekStart: string, weekEnd: string, plan: any, shopping: any },
 *   semanas: object[], semanaViva: string | null,
 * }>}
 *   `semana` es la que contiene hoy (si no hay, la primera que no ha pasado, y
 *   si no, la primera), y `semanaViva` su weekStart: la que la app pinta y
 *   refleja en `state.menuPlan`. `semanas`, todas las del menú activo.
 */
// La casa se lee varias veces en un mismo turno (el enrutador, Lola, cada
// herramienta) y son tres consultas cada vez. Se guarda unos segundos en esta
// instancia; cualquier escritura propia la invalida, y conCasa, si choca con
// una escritura ajena, vuelve a leer de verdad.
const RECIENTE_MS = 8000;
const recientes = new Map();
export async function cargarCasa(householdId, { fresca = false } = {}) {
  const r = recientes.get(householdId);
  // Siempre una copia: quien la reciba puede tocarla sin estropear la de los demás.
  if (!fresca && r && Date.now() - r.t < RECIENTE_MS) return structuredClone(await r.casa);
  const casa = leerCasa(householdId);
  recientes.set(householdId, { t: Date.now(), casa });
  casa.catch(() => recientes.delete(householdId));
  return structuredClone(await casa);
}

async function leerCasa(householdId) {
  const [fila] = await select("household_state", `household_id=${eq(householdId)}`, "state,bot_rev,updated_at");
  if (!fila) return null;

  const [menu] = await select(
    "user_menus",
    `household_id=${eq(householdId)}&is_active=eq.true&order=updated_at.desc&limit=1`,
    "id,user_id",
  );

  let semanas = [];
  if (menu) {
    const filas = await select(
      "user_menu_weeks",
      `household_id=${eq(householdId)}&menu_id=${eq(menu.id)}&order=week_start.asc`,
      "menu_id,week_start,week_end,week_offset,start_day_idx,active_days,plan,shopping",
    );
    semanas = filas.map(aSemana);
  }
  const hoy = hoyISO();
  const semana = semanas.find((w) => w.weekStart <= hoy && hoy <= w.weekEnd)
    ?? semanas.find((w) => w.weekEnd >= hoy)
    ?? semanas[0]
    ?? null;

  return {
    householdId,
    botRev: Number(fila.bot_rev ?? 0),
    updatedAt: fila.updated_at,
    state: fila.state ?? {},
    menu: menu ? { id: menu.id, userId: menu.user_id } : null,
    semana,
    semanas,
    semanaViva: semana?.weekStart ?? null,
  };
}

/**
 * @param {Awaited<ReturnType<typeof cargarCasa>>} casa  la que se leyó (da la versión base)
 * @param {{ state?: any, semana?: { plan?: any, shopping?: any } }} cambios
 * @returns {Promise<{ ok: true, botRev: number } | { ok: false, conflicto: true, botRev: number } | { ok: false, error: string }>}
 */
// Cuándo se guardó por última vez cada casa en esta instancia: para saber si
// una herramienta escribió de verdad (agente.js), y no ofrecer «Deshacer»
// tras una que solo contestó «¿quién es?» (deshacería otra cosa anterior).
const ultimaEscritura = new Map();
export const escribioDesde = (householdId, t) => (ultimaEscritura.get(householdId) ?? 0) >= t;

export async function guardarCasa(casa, { state = null, semana = null } = {}, { sinDeshacer = false } = {}) {
  const week = semana && casa.semana
    ? { menu_id: casa.semana.menuId, week_start: casa.semana.weekStart, ...semana }
    : null;
  const r = await rpc("bot_save_casa", {
    p_household_id: casa.householdId,
    p_base_rev: casa.botRev,
    p_state: state,
    p_week: week,
  });
  // Escriba o choque, lo leído ya no vale.
  recientes.delete(casa.householdId);
  if (r?.ok) {
    ultimaEscritura.set(casa.householdId, Date.now());
    if (!sinDeshacer) await guardarFotoPrevia(casa, Number(r.bot_rev)).catch((e) => console.error("[casa] deshacer", e?.message));
    return { ok: true, botRev: Number(r.bot_rev) };
  }
  if (r?.bot_rev != null) return { ok: false, conflicto: true, botRev: Number(r.bot_rev) };
  return { ok: false, error: r?.error ?? "error desconocido" };
}

// ── Deshacer (0060) ─────────────────────────────────────────────────────────
// Cada escritura del bot guarda cómo estaba la casa ANTES. «Deshaz» restaura
// la última, un solo nivel: basta para «uy, no», y más niveles obligarían a
// saber qué cambios de la app hubo entre medias.

const FOTOS_POR_CASA = 5;

async function guardarFotoPrevia(casa, botRevDespues) {
  await insert("bot_deshacer", [{
    household_id: casa.householdId,
    bot_rev_despues: botRevDespues,
    antes: {
      state: casa.state,
      menuActivo: casa.menu?.id ?? null,
      semana: casa.semana ? { menuId: casa.semana.menuId, weekStart: casa.semana.weekStart, plan: casa.semana.plan, shopping: casa.semana.shopping } : null,
    },
  }]);
  const viejas = await select("bot_deshacer", `household_id=${eq(casa.householdId)}&order=created_at.desc&offset=${FOTOS_POR_CASA}`, "id");
  if (viejas.length) {
    const { url, headers } = (await import("./db.js")).config();
    await fetch(`${url}/rest/v1/bot_deshacer?id=in.(${viejas.map((v) => v.id).join(",")})`, { method: "DELETE", headers });
  }
}

/**
 * Deshace la última escritura del bot en la casa.
 * @returns {Promise<string>} qué ha pasado, para el agente
 */
export async function deshacer(householdId) {
  const [foto] = await select("bot_deshacer", `household_id=${eq(householdId)}&usado_at=is.null&order=created_at.desc&limit=1`, "id,bot_rev_despues,antes,created_at");
  if (!foto) return "No hay ningún cambio mío reciente que deshacer.";
  // De la base: deshacer compara versiones y lo recordado podría ser viejo.
  const casa = await cargarCasa(householdId, { fresca: true });
  if (!casa) return "Esta casa no tiene datos en la nube.";
  if (casa.botRev !== Number(foto.bot_rev_despues)) return "Ya no puedo deshacerlo: después hubo otros cambios míos.";
  // La app pone updated_at al guardar: si es posterior a mi cambio (con un
  // margen para el propio guardado), alguien tocó la casa desde la app y
  // restaurar pisaría lo suyo.
  if (Date.parse(casa.updatedAt) - Date.parse(foto.created_at) > 5000) {
    return "No lo deshago: desde ese cambio alguien ha tocado la casa en la app, y lo pisaría. Dime qué quieres volver a dejar como estaba y lo cambio a mano.";
  }

  const { antes } = foto;
  // Si lo último fue generar un menú, vuelve a estar activo el anterior (el
  // generado se queda en el historial de la app).
  if (antes.menuActivo && casa.menu?.id && antes.menuActivo !== casa.menu.id) {
    await update("user_menus", `household_id=${eq(householdId)}&is_active=eq.true`, { is_active: false });
    await update("user_menus", `household_id=${eq(householdId)}&id=${eq(antes.menuActivo)}`, { is_active: true });
  }
  // La semana que se tocó, que no tiene por qué ser la de hoy.
  const tocada = antes.semana ? enSemana(casa, antes.semana.weekStart) : null;
  const mismaSemana = tocada && antes.semana.menuId === tocada.semana.menuId;
  const r = await guardarCasa(mismaSemana ? tocada : casa, {
    state: antes.state,
    semana: mismaSemana ? { plan: antes.semana.plan, shopping: antes.semana.shopping } : null,
  }, { sinDeshacer: true });
  if (!r.ok) return `No he podido deshacerlo: ${r.error ?? "se cruzó otro cambio"}.`;
  await update("bot_deshacer", `id=eq.${foto.id}`, { usado_at: new Date().toISOString() });
  return antes.menuActivo && antes.menuActivo !== casa.menu?.id
    ? "Deshecho: vuelve a estar activo el menú anterior (el nuevo queda en el historial)."
    : "Deshecho: la casa está como antes de mi último cambio.";
}

/**
 * Leer → cambiar → guardar, reintentando si otra escritura del bot se cruza.
 * `cambiar` recibe la casa fresca y devuelve los cambios para `guardarCasa`
 * (o null para no escribir nada). Si el cambio es en otra semana del menú,
 * devuelve también `casa` apuntando a ella (enSemana), y se guarda ahí.
 * `sinDeshacer: true` en los cambios: no deja foto para «deshaz» (un tachón
 * de la compra no debe tapar el último cambio de Lola).
 */
export async function conCasa(householdId, cambiar, intentos = 5) {
  for (let i = 0; i < intentos; i++) {
    // Tras un choque, una espera corta y AL AZAR antes de releer: sin ella, dos
    // escrituras que chocaron volvían a chocar en el mismo instante y agotaban
    // los intentos juntas (staging, 2 oct 2026: «conflicto persistente»).
    if (i > 0) await new Promise((r) => setTimeout(r, 40 * i + Math.random() * 120 * i));
    // Al reintentar tras un choque, de la base: lo recordado es justo lo viejo.
    const casa = await cargarCasa(householdId, { fresca: i > 0 });
    if (!casa) return { ok: false, error: "sin casa en la nube" };
    const cambios = await cambiar(casa);
    if (!cambios) return { ok: true, casa, sinCambios: true };
    const r = await guardarCasa(cambios.casa ?? casa, cambios, { sinDeshacer: !!cambios.sinDeshacer });
    if (!r.conflicto) return { ...r, casa };
  }
  return { ok: false, error: "conflicto persistente" };
}
