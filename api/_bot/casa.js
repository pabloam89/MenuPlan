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
import { fallaCon } from "./avisar.js";
import { select, insert, update, rpc, eq } from "./db.js";
import { operacion, quienEscribe, TIPO_OPERACION, QUE_FUE, autorDelTurno, avisarEnElChat, claveDeEscritura } from "./operacion.js";
import { leerFamilia, escribirPersonas, leerCasaConSobre, escribirDato, leerPreferencias, escribirPreferencias } from "./datos.js";
import { conLibretaDeFilas, sinLibreta, cambiosDePreferencias } from "../../src/lib/libretaEnData.js";
import { PreferenciaInvalida } from "../../src/lib/preferencias.js";
import { textoDeChoque } from "../../src/lib/choques.js";
import { cambiosDePersonas, conOrdenDeTodos, textosDeAvisos, revSiguiente } from "../../src/lib/personas.js";
import { CANAL_DATO, REF_OPERACION } from "../../src/lib/vocabularios.js";
import { CAMPOS_CON_AMBITO_CON_SOBRE } from "../../src/lib/estadoDeDato.js";
import { datosDeCambio, familiaDeData } from "../../src/lib/rutina.js";
import { recetasPropiasDeCasa, quitarRecetaGuardada } from "./propias.js";
import { menuActivoDe } from "../../src/lib/menuActivo.js";
import { isoDeCasa } from "../../src/lib/dias.js";
import { favoritasDeFilas, votosDeFavoritas, descartesDeFilas } from "../../src/lib/recetasDeLaCasa.js";
import { sellarCambios } from "../../src/lib/sobreHueco.js";
import { sinRecetasDeTabla } from "../../src/lib/recetasFuente.js";
import { conCompraQueSeVe, semanaParaGuardar } from "./compraDeSemana.js";

// En hora de España: a las 00:30 del jueves, «hoy» es jueves, no el miércoles de UTC.
export const hoyISO = () => isoDeCasa();

const aSemana = (s) => ({
  menuId: s.menu_id, weekStart: s.week_start, weekEnd: s.week_end, startDayIdx: s.start_day_idx ?? 0,
  // El offset con el que se generó (0 = la semana en curso entonces): sin él
  // no se sabe si `startDayIdx` recorta la semana o no (diasDeLaSemana, menu.js).
  offset: s.week_offset ?? 0,
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

  // La familia, de sus filas (0108, trozo 10): el documento ya no la lleva. Sin la 0108, null: sigue en el
  // documento, como antes. Sin poder leerla por otra cosa, leerFamilia lanza (FamiliaSinLeer) y la casa no se
  // lee: con una familia a medias se generaría un menú sin las alergias, o se borraría a quien no salió.
  // Los datos de la casa con sobre (trozos 12 y 13), de ficha_casa v2; sin poder leerlos, la casa no se lee.
  // Las preferencias (trozo 14), de sus filas; sin poder leerlas (también sin la RPC), la casa no se lee.
  const [familia, conSobre, preferencias, activos, recetasPropias, deLaCasa] = await Promise.all([
    leerFamilia(householdId),
    leerCasaConSobre(householdId),
    leerPreferencias(householdId),
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

  // La compra de cada semana que guarda marcas, como se ve: derivada del menú con las marcas encima (trozo 18).
  return conCompraQueSeVe({
    householdId,
    botRev: Number(fila.bot_rev ?? 0),
    updatedAt: fila.updated_at,
    // members y groups, los de las filas (en la forma de siempre, para sus lectores); lo que el documento aún
    // guarde de antes del corte no se lee.
    state: conPreferencias(conDatosConSobre(familia ? conFamilia(fila.state ?? {}, familia) : (fila.state ?? {}), conSobre), preferencias, hoy),
    // La familia tal como se leyó: de ella sale lo que cambia al guardar (guardarCasa). null: vive en el
    // documento (base sin la 0108) y se guarda con él.
    familia: familia ? structuredClone(familia) : null,
    // Los datos con sobre tal como se leyeron (`{ campo: { valor, conSobre } }`): de ellos sale lo que cambia al
    // guardar.
    conSobre,
    // Las filas de preferencia tal como se leyeron (de ellas, los ids de lo que cambia al guardar).
    preferencias: preferencias.preferencias,
    // Fuera de `state`: no se escriben de vuelta en household_state (propias.js).
    recetasPropias,
    deLaCasa,
    menu: menu ? { id: menu.id, userId: menu.user_id } : null,
    semana,
    semanas,
    semanaViva: semana?.weekStart ?? null,
  });
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

/** El documento con la familia de las filas en data.members y data.groups (las de antes del corte, fuera). */
export function conFamilia(state, { members, groups }) {
  return { ...state, data: { ...(state?.data ?? {}), members, groups } };
}

/** Pura. El documento con la libreta de sus filas de preferencia y su proyección en `data`. */
function conPreferencias(state, preferencias, hoy) {
  return { ...state, data: conLibretaDeFilas(state?.data ?? {}, preferencias.preferencias, { hoy }) };
}

/**
 * Pura. Un estado para guardar sin la libreta ni su proyección (viven en filas de preferencia), y lo que cambió de
 * la libreta respecto a la leída, como la lista de escribir_preferencias. Un escritor que no trae la libreta no la
 * cambia. Las reglas de veto y sesgo, igual (cambiosDePreferencias). Lanza PreferenciaInvalida si un apunte o una
 * regla no cabe en una fila (un ámbito sin su grupo), antes de guardar nada.
 */
function separarPreferencias(state, casa) {
  if (!state?.data) return { documento: state, preferencias: [] };
  const preferencias = cambiosDePreferencias(casa.state?.data, state.data, casa.preferencias);
  return { documento: { ...state, data: sinLibreta(state.data) }, preferencias };
}

/** Pura. El documento con los datos con sobre leídos en `data` (lo que el documento aún guarde de ellos, fuera). */
function conDatosConSobre(state, conSobre) {
  const valores = Object.fromEntries(Object.entries(conSobre).map(([campo, l]) => [campo, l.valor]));
  return { ...state, data: { ...(state?.data ?? {}), ...valores } };
}

/**
 * Pura. Un estado para guardar sin los datos con sobre (no van al documento), y los que cambiaron respecto a los
 * leídos, cada uno con lo que va a escribirDato: `{ campo, dato }`, o `{ campo, datos }` con un dato por hueco que
 * cambia en un mapa con ámbito (CAMPOS_CON_AMBITO_CON_SOBRE, datosDeCambio). Un escritor que no trae el campo no
 * lo cambia. `familia`, la que queda tras el cambio (familiaDeData): los huecos de quien ya no está no se escriben.
 * Lanza DatoInvalido si un hueco no cuadra con el registro, antes de guardar nada.
 */
function separarConSobre(state, conSobre, familia) {
  if (!state?.data) return { documento: state, cambios: [] };
  // cargarCasa los lee siempre (o la casa no se lee): una casa sin ellos guardaría en el documento lo que va al sobre.
  if (!conSobre) throw new Error("guardarCasa: la casa no trae sus datos con sobre (cargarCasa)");
  const data = { ...state.data };
  const cambios = [];
  for (const [campo, leido] of Object.entries(conSobre)) {
    const valor = data[campo];
    delete data[campo];
    if (valor === undefined || JSON.stringify(valor) === JSON.stringify(leido.valor)) continue;
    if (!CAMPOS_CON_AMBITO_CON_SOBRE.includes(campo)) {
      cambios.push({ campo, dato: { campo, valor: valor ?? null, origen: "dicho" } });
      continue;
    }
    const datos = datosDeCambio(campo, leido.valor, valor, { origen: "dicho", familia });
    if (datos.length) cambios.push({ campo, datos });
  }
  return { documento: { ...state, data }, cambios };
}

/**
 * Pura. Un estado para guardar, partido en lo que va al documento (sin members ni groups: la familia ya no vive
 * ahí) y la familia de ahora, o null si el estado no la trae (un escritor que no toca la familia, o que no trae
 * data). Si trae solo una de las dos listas, la otra es la leída.
 */
export function separarFamilia(state, leida) {
  if (!state?.data) return { documento: state, familia: null };
  const { members, groups, ...data } = state.data;
  const trae = Array.isArray(members) || Array.isArray(groups);
  return {
    documento: { ...state, data },
    familia: trae ? { members: Array.isArray(members) ? members : leida?.members, groups: Array.isArray(groups) ? groups : leida?.groups } : null,
  };
}

/**
 * Por qué no se puede escribir la familia o un dato con sobre en este turno, o null. Se mira ANTES de guardar nada:
 * la tubería firma con una persona de la casa y sale de un mensaje; sin ellos no escribiría, y el documento
 * quedaría a medias.
 */
function faltaParaEscribir() {
  const op = operacion();
  if (!autorDelTurno()?.user_id) return "no sé qué persona de la casa lo pide (en un grupo, que lo diga una sola persona); no he cambiado nada";
  if (!op?.mid) return "no sé de qué mensaje sale el cambio; no he cambiado nada";
  return null;
}

/** Los cambios de la familia, por la tubería (escribir_persona). Lo que devuelve, en operarPersonas. */
function escribirFamilia(casa, cambios) {
  const op = operacion();
  const autor = autorDelTurno();
  const accion = op.herramienta ?? "guardar_casa";
  return escribirPersonas({
    casa: casa.householdId,
    // El mismo mensaje, la misma herramienta y los mismos cambios: la misma clave, y un reintento sale `repetida`.
    clave: claveDeEscritura(`familia:${accion}`, cambios),
    accion,
    canal: autor.canal ?? CANAL_DATO.TELEGRAM,
    ref: { tipo: REF_OPERACION.MENSAJE, id: op.mid },
    autor: { user_id: autor.user_id },
    ...cambios,
  }, { papel: autor.papel });
}

/** Los cambios de la libreta (separarPreferencias), por la tubería (escribir_preferencias). Lo que devuelve, en operarPreferencias. */
function escribirLibreta(casa, preferencias) {
  const op = operacion();
  const autor = autorDelTurno();
  const accion = op.herramienta ?? "guardar_casa";
  return escribirPreferencias({
    casa: casa.householdId,
    clave: claveDeEscritura(`preferencias:${accion}`, preferencias),
    accion,
    canal: autor.canal ?? CANAL_DATO.TELEGRAM,
    ref: { tipo: REF_OPERACION.MENSAJE, id: op.mid },
    autor: { user_id: autor.user_id },
    preferencias,
  }, { papel: autor.papel });
}

/** Un dato con sobre, o los huecos de un mapa con ámbito (separarConSobre), por la tubería (aplicar_operacion). Lo que devuelve, en operar. */
function escribirDatoDeCasa(casa, { campo, ...cambio }) {
  const op = operacion();
  const autor = autorDelTurno();
  const accion = op.herramienta ?? "guardar_casa";
  return escribirDato({
    casa: casa.householdId,
    clave: claveDeEscritura(`dato:${campo}:${accion}`, cambio.dato ?? cambio.datos),
    accion,
    canal: autor.canal ?? CANAL_DATO.TELEGRAM,
    ref: { tipo: REF_OPERACION.MENSAJE, id: op.mid },
    autor: { user_id: autor.user_id },
    ...cambio,
  }, { papel: autor.papel });
}

// `activar`: id de un menú de la casa que queda activo en la MISMA transacción
// (0069). Generar y deshacer lo usan: o cambian el menú y la casa, o nada.
// La familia (trozo 10) no va al documento: lo que cambió respecto a la leída va a escribir_persona, después del
// documento (que es el que mira la versión: si choca, no se ha escrito nada y conCasa repite entero). Lo que no
// viaja tal cual se dice en el chat (avisarEnElChat). Con la familia en el documento (`casa.familia` null, base
// sin la 0108), va en él, como antes. Los datos con sobre (trozo 12), igual: lo que cambió va a escribirDato,
// uno tras otro y detrás de la familia (un hueco de una persona o un grupo nuevos necesita su fila). Un mapa con
// ámbito (trozo 13), en una operación por campo.
export async function guardarCasa(casa, { state = null, semana = null, activar = null } = {}, { sinDeshacer = false } = {}) {
  const familiaTras = familiaDeData({ ...(casa.state?.data ?? {}), ...(state?.data ?? {}) });
  // La libreta (trozo 14): lo que cambió va a escribir_preferencias, detrás de la familia (un ámbito de un grupo
  // nuevo necesita su fila).
  let sinPreferencias;
  let preferencias;
  try {
    ({ documento: sinPreferencias, preferencias } = separarPreferencias(state, casa));
  } catch (e) {
    if (!(e instanceof PreferenciaInvalida)) throw e;
    return { ok: false, error: `no he podido apuntarlo: ${e.message}; no he cambiado nada` };
  }
  const { documento: sinSobre, cambios: datos } = separarConSobre(sinPreferencias, casa.conSobre, familiaTras);
  const { documento: conRecetas, familia } = casa.familia ? separarFamilia(sinSobre, casa.familia) : { documento: sinSobre, familia: null };
  // Las recetas de tabla no van al documento (recetasFuente.js, trozo 21); las propias, aún sí: hay casas cuyas recetas
  // viejas solo están en el documento y Lola las lee de ahí (propias.js) hasta medirlas y llevarlas a su tabla.
  const documento = conRecetas?.data ? { ...conRecetas, data: sinRecetasDeTabla(conRecetas.data, { salvo: ["userRecipes"] }) } : conRecetas;
  let cambios = null;
  if (familia) {
    const c = cambiosDePersonas(casa.familia, familia);
    for (const t of textosDeAvisos(c.avisos)) avisarEnElChat(t);
    cambios = conOrdenDeTodos(c.cambios, casa.familia, familia);
  }
  const falta = cambios || datos.length || preferencias.length ? faltaParaEscribir() : null;
  if (falta) return { ok: false, error: falta };

  // Un plato que cambia Lola lleva su sobre: el canal del turno, quién y cuándo (sobreHueco.js, trozo 18).
  const semanaSellada = semana?.plan && casa.semana ? { ...semana, plan: sellarCambios(casa.semana.plan, semana.plan, sobreDelTurno()) } : semana;
  // Una semana que guarda marcas vuelve a guardar marcas, no la lista que se ve (trozo 18).
  const semanaGuardada = semanaSellada && casa.semana ? await semanaParaGuardar(casa, semanaSellada) : null;
  const week = semanaGuardada
    ? { menu_id: casa.semana.menuId, week_start: casa.semana.weekStart, ...semanaGuardada }
    : null;
  const r = await rpc(activar ? "bot_save_casa_activando" : "bot_save_casa", {
    p_household_id: casa.householdId,
    p_base_rev: casa.botRev,
    p_state: documento,
    p_week: week,
    ...(activar ? { p_menu_id: activar } : {}),
  });
  // Escriba o choque, lo leído ya no vale.
  recientes.delete(casa.householdId);
  if (r?.ok) {
    let botRev = Number(r.bot_rev);
    // escribir_persona no falla en silencio: si no guarda, el error vuelve a la herramienta (sin la 0108,
    // rpc_ausente). El documento ya se guardó y se cuenta como guardado (y deja su foto).
    const persona = cambios ? await escribirFamilia(casa, cambios) : null;
    // Solo si es la siguiente a la del documento: si otro escribió entremedias, la foto lleva la del documento y
    // deshacer, al ver una versión posterior, se niega («hubo otros cambios») en vez de pisar lo de ese otro.
    const trasFamilia = persona?.guardado ? revSiguiente(botRev, persona.rev) : null;
    if (trasFamilia != null) botRev = trasFamilia;
    // Cada dato, igual: su versión es la de Lola solo si es la siguiente. Tras un salto (otro escribió), ya no.
    let seguida = !persona || trasFamilia != null;
    const sinGuardar = [];
    for (const dato of datos) {
      const r = await escribirDatoDeCasa(casa, dato);
      if (!r.guardado) { sinGuardar.push(`${dato.campo}: ${r.fallo ?? r.error ?? r.estado ?? "sin motivo"}`); continue; }
      const tras = seguida ? revSiguiente(botRev, r.rev) : null;
      if (tras != null) botRev = tras;
      else seguida = false;
    }
    if (preferencias.length) {
      const r = await escribirLibreta(casa, preferencias);
      // Lo que chocó con lo que ya tenía la casa (método de choques): Lola lo dice o lo pregunta, no se calla.
      for (const c of r.choques ?? []) {
        const texto = textoDeChoque(c, preferencias[c.nueva]);
        if (texto) avisarEnElChat(texto);
      }
      // Si no se escribió nada porque todo chocó, no es un fallo: el aviso de arriba dice qué pasó. Si solo chocó una
      // parte y lo demás no se guardó, sí lo es, y se dice.
      const todoChoco = !r.fallo && r.apartadas?.length === preferencias.length;
      if (!r.guardado) {
        if (!todoChoco) sinGuardar.push(`las preferencias: ${r.fallo ?? r.error ?? r.estado ?? "sin motivo"}`);
      } else {
        const tras = seguida ? revSiguiente(botRev, r.rev) : null;
        if (tras != null) botRev = tras;
      }
    }
    ultimaEscritura.set(casa.householdId, Date.now());
    const op = operacion();
    if (op) op.guardadosCasa++;
    // La foto con la versión de después de la familia: deshacer compara con ella.
    if (!sinDeshacer) await guardarFotoPrevia(casa, botRev).catch(fallaCon("casa_deshacer"));
    if (persona && !persona.guardado) {
      return { ok: false, error: `no he podido guardar los cambios de la familia (${persona.fallo ?? persona.error ?? persona.estado ?? "sin motivo"}); lo demás sí se guardó` };
    }
    if (sinGuardar.length) return { ok: false, error: `no he podido guardar ${sinGuardar.join(", ")}; lo demás sí se guardó` };
    return { ok: true, botRev };
  }
  if (r?.bot_rev != null) return { ok: false, conflicto: true, botRev: Number(r.bot_rev) };
  return { ok: false, error: r?.error ?? "error desconocido" };
}

/** El sobre de lo que escribe Lola en este turno: su canal y quién habla; fuera de un turno (un cron), el sistema. */
// Fuera de un turno (crons, scripts) escribe el sistema. En un turno, el canal es el del autor: sin él se falla, no
// se firma como el menú automático lo que pidió una persona.
function sobreDelTurno() {
  const autor = autorDelTurno();
  if (autor && !autor.canal) throw new Error("sobre del hueco: el autor del turno no dice por qué canal habla");
  return { canal: autor?.canal ?? CANAL_DATO.SISTEMA, cuando: new Date().toISOString(), quien: autor?.user_id ?? null };
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
    antes: { ...antes, ...(quien ? { quien } : {}), ...(op?.herramienta ? { herramienta: op.herramienta } : {}), ...(tambien.length ? { tambien } : {}) },
  }]);
  const viejas = await select("bot_deshacer", `household_id=${eq(householdId)}&order=created_at.desc&offset=${FOTOS_POR_CASA}`, "id");
  if (viejas.length) {
    const { url, headers } = (await import("./db.js")).config();
    await fetch(`${url}/rest/v1/bot_deshacer?id=in.(${viejas.map((v) => v.id).join(",")})`, { method: "DELETE", headers });
  }
}

async function guardarFotoPrevia(casa, botRevDespues) {
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
    // Una receta que no se supo si era nueva (sinSaber) no se borra a ciegas.
    const quitable = p.tipo === TIPO_OPERACION.RECETA && p.id && p.dueno && !p.sinSaber;
    const hecho = quitable && (await quitarRecetaGuardada(p.id, p.dueno).then(() => true).catch(fallaCon("deshacer_paso", false)));
    if (!hecho) fallidos.push(p.tipo);
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
    const quitado = await update("user_menus", `household_id=${eq(householdId)}&id=${eq(casa.menu.id)}`, { is_active: false })
      .then(() => true).catch(fallaCon("deshacer_primer_menu", false));
    if (!quitado) return "He deshecho la casa, pero el menú nuevo sigue activo en la app: no he podido quitarlo. Bórralo desde Menús en la app.";
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
