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

import { AsyncLocalStorage } from "node:async_hooks";
import { select, insert, update, rpc, eq } from "./db.js";
import { operacion, quienEscribe, TIPO_OPERACION, QUE_FUE } from "./operacion.js";
import { recetasPropiasDeCasa, quitarRecetaGuardada } from "./propias.js";
import { menuActivoDe } from "../../src/lib/menuActivo.js";
import { isoDeCasa } from "../../src/lib/dias.js";
import { favoritasDeFilas, votosDeFavoritas, descartesDeFilas } from "../../src/lib/recetasDeLaCasa.js";

// En hora de España: a las 00:30 del jueves, «hoy» es jueves, no el miércoles de UTC.
export const hoyISO = () => isoDeCasa();

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
 *   householdId: string, botRev: number, state: any, recetasPropias: object[],
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
/** Lo recordado de la casa ya no vale: se escribió fuera de household_state (una receta en user_recipes). */
export const olvidarCasa = (householdId) => { recientes.delete(householdId); };
export async function cargarCasa(householdId, { fresca = false } = {}) {
  const r = recientes.get(householdId);
  // Siempre una copia: quien la reciba puede tocarla sin estropear la de los demás.
  if (!fresca && r && Date.now() - r.t < RECIENTE_MS) return structuredClone(await r.casa);
  const casa = leerCasa(householdId);
  recientes.set(householdId, { t: Date.now(), casa });
  casa.catch(() => recientes.delete(householdId)); // a propósito: el error le llega a quien espera `casa`, abajo; aquí solo se olvida
  return structuredClone(await casa);
}

/**
 * Las favoritas y los «No me gusta» de la casa, de sus tablas: household_state
 * no los guarda y la app los carga aparte, así que sin esto los menús de Lola
 * no los veían (#939). Si la lectura falla, null: el motor sigue como antes.
 */
async function recetasDeLaCasa(householdId) {
  try {
    const [favoritas, descartes] = await Promise.all([
      select("household_favorites", `household_id=${eq(householdId)}`, "recipe_id,scope"),
      select("household_recipe_discards", `household_id=${eq(householdId)}`, "recipe_id,is_permanent,cooldown_until"),
    ]);
    return { recipeVotes: votosDeFavoritas(favoritasDeFilas(favoritas)), discards: descartesDeFilas(descartes) };
  } catch (e) {
    console.error("[casa] recetas de la casa", e?.message);
    return null;
  }
}

async function leerCasa(householdId) {
  // El dueño, a la vez que la casa: hace falta para sus recetas propias.
  const [[fila], [hogar]] = await Promise.all([
    select("household_state", `household_id=${eq(householdId)}`, "state,bot_rev,updated_at"),
    select("households", `id=${eq(householdId)}`, "owner_user_id").catch((e) => {
      console.error("[casa] households", e?.message);
      return [];
    }),
  ]);
  if (!fila) return null;

  const [activos, recetasPropias, deLaCasa] = await Promise.all([
    select(
      "user_menus",
      `household_id=${eq(householdId)}&is_active=eq.true&order=updated_at.desc&limit=5`,
      "id,user_id,is_active,updated_at",
    ),
    recetasPropiasDeCasa(householdId, hogar?.owner_user_id ?? null, fila.state?.data?.userRecipes),
    recetasDeLaCasa(householdId),
  ]);
  // El mismo lector que la app (menuActivo.js): si hubiera dos activos, los
  // dos eligen el de updated_at más reciente.
  // La consulta ya filtra is_active.
  const filasActivas = (activos ?? []).map((m) => ({ ...m, is_active: true }));
  const idActivo = menuActivoDe(filasActivas);
  const menu = filasActivas.find((m) => m.id === idActivo) ?? null;

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
    // Fuera de `state`: no se escriben de vuelta en household_state (propias.js).
    recetasPropias,
    deLaCasa,
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

// `activar`: id de un menú de la casa que queda activo en la MISMA transacción
// (0069). Generar y deshacer lo usan: o cambian el menú y la casa, o nada.
export async function guardarCasa(casa, { state = null, semana = null, activar = null } = {}, { sinDeshacer = false } = {}) {
  const week = semana && casa.semana
    ? { menu_id: casa.semana.menuId, week_start: casa.semana.weekStart, ...semana }
    : null;
  const r = await rpc(activar ? "bot_save_casa_activando" : "bot_save_casa", {
    p_household_id: casa.householdId,
    p_base_rev: casa.botRev,
    p_state: state,
    p_week: week,
    ...(activar ? { p_menu_id: activar } : {}),
  });
  // Escriba o choque, lo leído ya no vale.
  recientes.delete(casa.householdId);
  if (r?.ok) {
    ultimaEscritura.set(casa.householdId, Date.now());
    const op = operacion();
    if (op) op.guardadosCasa++;
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

// Varias personas y chats por casa (#958): cada una tiene su «lo último».
const FOTOS_POR_CASA = 10;

// Las operaciones que no dejan foto de la casa (despensa, tareas…) se apuntan
// con esta versión, que no es de nadie: un deshacer de antes de #958 (o el de
// producción mientras no se suba) la ve, compara versiones y se niega («hubo
// otros cambios»), en vez de restaurar nada.
export const SIN_VERSION = -1;

async function apuntarDeshacer(householdId, botRevDespues, antes) {
  const op = operacion();
  // Quién lo hizo y con qué herramienta: «deshaz» solo toca lo suyo.
  const quien = quienEscribe();
  const tambien = op?.tambien?.length ? op.tambien.splice(0) : [];
  await insert("bot_deshacer", [{
    household_id: householdId,
    bot_rev_despues: botRevDespues,
    descripcion: op?.herramienta ?? null,
    antes: { ...antes, ...(quien ? { quien } : {}), ...(op?.herramienta ? { herramienta: op.herramienta } : {}), ...(tambien.length ? { tambien } : {}) },
  }]);
  const viejas = await select("bot_deshacer", `household_id=${eq(householdId)}&order=created_at.desc&offset=${FOTOS_POR_CASA}`, "id");
  if (viejas.length) {
    const { url, headers } = (await import("./db.js")).config();
    await fetch(`${url}/rest/v1/bot_deshacer?id=in.(${viejas.map((v) => v.id).join(",")})`, { method: "DELETE", headers });
  }
}

async function guardarFotoPrevia(casa, botRevDespues) {
  const op = operacion();
  if (op) op.fotos++;
  await apuntarDeshacer(casa.householdId, botRevDespues, {
    tipo: TIPO_OPERACION.CASA,
    state: casa.state,
    menuActivo: casa.menu?.id ?? null,
    semana: casa.semana ? { menuId: casa.semana.menuId, weekStart: casa.semana.weekStart, plan: casa.semana.plan, shopping: casa.semana.shopping } : null,
  });
}

/**
 * Una operación que escribió fuera de la casa (sin foto): se apunta para que
 * «deshaz» sepa que fue lo último de esa persona. `tipo` de TIPO_OPERACION.
 */
export async function apuntarOperacion(householdId, tipo) {
  await apuntarDeshacer(householdId, SIN_VERSION, { tipo });
}

/**
 * El filtro de «lo último de quien lo pide»: su chat y, si se sabe, su
 * persona. Las fotos de antes de #958 no llevan autor y no salen: no se sabe
 * de quién son, y deshacer lo de otro es justo lo que había que evitar.
 * Sin quién (fuera de un turno), toda la casa, como antes.
 */
export function filtroDeQuien(quien) {
  if (!quien?.chat) return "";
  return `&antes->quien->>chat=${eq(quien.chat)}${quien.persona ? `&antes->quien->>persona=${eq(quien.persona)}` : ""}`;
}

/** Lo que hay que deshacer además de la casa (`antes.tambien`). Devuelve lo que no se pudo. */
async function deshacerPasos(pasos = []) {
  const fallidos = [];
  for (const p of pasos) {
    try {
      if (p.tipo === TIPO_OPERACION.RECETA && p.id && p.dueno) await quitarRecetaGuardada(p.id, p.dueno);
      else fallidos.push(p.tipo);
    } catch (e) {
      console.error("[casa] deshacer paso", p.tipo, e?.message);
      fallidos.push(p.tipo);
    }
  }
  return fallidos;
}

/**
 * Deshace la última escritura del bot de QUIEN LO PIDE (su chat y su persona,
 * operacion.js), no la última de la casa (#958).
 * `freno(ahora, antes)` (el del supervisor, frenoDeshacer) decide si restaurar
 * quitaría protección sin confirmarlo; si devuelve texto, no se deshace nada.
 * Se inyecta para no importar el supervisor aquí (ciclo con menu.js).
 * @returns {Promise<string>} qué ha pasado, para el agente
 */
export async function deshacer(householdId, { freno = null, quien = quienEscribe() } = {}) {
  const [foto] = await select("bot_deshacer", `household_id=${eq(householdId)}&usado_at=is.null${filtroDeQuien(quien)}&order=created_at.desc&limit=1`, "id,bot_rev_despues,antes,created_at");
  if (!foto) return quien ? "No hay ningún cambio reciente tuyo que pueda deshacer (lo de otras personas, o de otro chat, no lo deshago)." : "No hay ningún cambio mío reciente que deshacer.";
  const tipo = foto.antes?.tipo ?? TIPO_OPERACION.CASA;
  // Lo último suyo no fue un cambio de la casa: no se restaura una foto más
  // vieja (reactivaría el menú anterior diciendo «Deshecho»). Si lo que hizo
  // se sabe deshacer (una receta guardada), se deshace; si no, se dice.
  if (tipo !== TIPO_OPERACION.CASA) {
    const pasos = foto.antes?.tambien ?? [];
    if (pasos.length) {
      const fallidos = await deshacerPasos(pasos);
      if (!fallidos.length) {
        await update("bot_deshacer", `id=eq.${foto.id}`, { usado_at: new Date().toISOString() });
        return `Deshecho: ${QUE_FUE[tipo] ?? "lo último"} ya no está.`;
      }
    }
    return `Lo último que me pediste fue ${QUE_FUE[tipo] ?? QUE_FUE[TIPO_OPERACION.OTRO]}, y eso no lo deshago yo sola. NO he deshecho nada. Dime qué quieres quitar o cambiar y lo hago.`;
  }
  // De la base: deshacer compara versiones y lo recordado podría ser viejo.
  const casa = await cargarCasa(householdId, { fresca: true });
  if (!casa) return "Esta casa no tiene datos en la nube.";
  if (casa.botRev !== Number(foto.bot_rev_despues)) return "Ya no puedo deshacerlo: después hubo otros cambios en la casa.";
  // La app pone updated_at al guardar: si es posterior a mi cambio (con un
  // margen para el propio guardado), alguien tocó la casa desde la app y
  // restaurar pisaría lo suyo.
  if (Date.parse(casa.updatedAt) - Date.parse(foto.created_at) > 5000) {
    return "No lo deshago: desde ese cambio alguien ha tocado la casa en la app, y lo pisaría. Dime qué quieres volver a dejar como estaba y lo cambio a mano.";
  }

  const { antes } = foto;
  const frenado = freno?.(casa.state?.data ?? {}, antes?.state?.data ?? {});
  if (frenado) return frenado;
  // Si lo último fue generar un menú, vuelve a estar activo el anterior (el
  // generado se queda en el historial de la app). En la misma transacción que
  // la casa: antes se activaba primero y, si el guardado chocaba, el menú
  // activo y la casa quedaban sin cuadrar.
  const reactivar = antes.menuActivo && casa.menu?.id && antes.menuActivo !== casa.menu.id ? antes.menuActivo : null;
  // La semana que se tocó, que no tiene por qué ser la de hoy.
  const tocada = antes.semana ? enSemana(casa, antes.semana.weekStart) : null;
  const mismaSemana = tocada && antes.semana.menuId === tocada.semana.menuId;
  const r = await guardarCasa(mismaSemana ? tocada : casa, {
    state: antes.state,
    semana: mismaSemana ? { plan: antes.semana.plan, shopping: antes.semana.shopping } : null,
    activar: reactivar,
  }, { sinDeshacer: true });
  if (!r.ok) return `No he podido deshacerlo: ${r.error ?? "se cruzó otro cambio"}.`;
  await update("bot_deshacer", `id=eq.${foto.id}`, { usado_at: new Date().toISOString() });
  // Lo que se escribió fuera de la casa con ese mismo cambio (la fila de una
  // receta guardada): antes se quedaba y la receta seguía en la app (#958).
  const fallidos = await deshacerPasos(antes.tambien ?? []);
  const aviso = fallidos.length ? " Ojo: la receta sigue en el recetario, no he podido quitarla; bórrala desde la app." : "";
  // El primer menú: antes no había otro que reactivar y el nuevo seguía activo
  // (la app lo enseñaba). No hay RPC que desactive en la misma transacción
  // (0069 solo activa), así que va justo después; si falla, se dice.
  const primerMenu = !antes.menuActivo && casa.menu?.id;
  if (primerMenu) {
    try {
      await update("user_menus", `household_id=${eq(householdId)}&id=${eq(casa.menu.id)}`, { is_active: false });
    } catch (e) {
      console.error("[casa] deshacer: desactivar el primer menú", e?.message);
      return "He deshecho la casa, pero el menú nuevo sigue activo en la app: no he podido quitarlo. Bórralo desde Menús en la app.";
    }
    return `Deshecho: el menú nuevo ya no está activo (queda en el historial de la app).${aviso}`;
  }
  return (antes.menuActivo && antes.menuActivo !== casa.menu?.id
    ? "Deshecho: vuelve a estar activo el menú anterior (el nuevo queda en el historial)."
    : "Deshecho: la casa está como antes de mi último cambio.") + aviso;
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
  return enFila(householdId, () => leerCambiarGuardar(householdId, cambiar, intentos));
}

// Las escrituras de una misma casa, en fila dentro de este proceso. Lola llama
// a varias herramientas a la vez («Nat no come el finde» → 5 fuera_de_casa):
// en paralelo chocaban, cada choque releía la casa entera, y con 3 intentos
// las últimas se rendían («conflicto persistente») y se perdía lo dicho
// (medido el 2 oct 2026: 2 de 5, y hasta 9 s por llamada). En fila no chocan.
// Entre procesos distintos sigue mandando el bot_rev de guardarCasa.
const filas = new Map();
const dentro = new AsyncLocalStorage();
function enFila(householdId, fn) {
  // Un conCasa dentro de otro de la misma casa no espera: se esperaría a sí mismo.
  if (dentro.getStore()?.has(householdId)) return fn();
  const ambito = new Set([...(dentro.getStore() ?? []), householdId]);
  const previa = filas.get(householdId) ?? Promise.resolve();
  const esta = previa.then(() => dentro.run(ambito, fn));
  const cola = esta.catch(() => {}); // a propósito: el error le llega a quien llamó, con esta; la fila solo espera su turno
  filas.set(householdId, cola);
  cola.then(() => { if (filas.get(householdId) === cola) filas.delete(householdId); });
  return esta;
}

async function leerCambiarGuardar(householdId, cambiar, intentos) {
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
