/**
 * Plantillas de la vía rápida que miran UN plato o la despensa, sin Lola:
 *
 *   receta    «¿cómo se hace la tortilla del miércoles?», «la receta de la cena de hoy»
 *   calorias  «¿cuántas calorías tiene la cena de hoy?»
 *   falta     «¿qué me falta para las lentejas?», «¿tengo todo para la cena de mañana?»
 *   despensa  «¿qué tengo en la despensa?», «¿qué queda en la nevera?»
 *
 * Y la pregunta que falta: si dicen el día pero no si es comida o cena, la vía
 * rápida pregunta con botones (Cena primero: es lo normal) en vez de mandarlo a
 * Lola. Si ese día solo se planifica una de las dos, no pregunta. La respuesta
 * vuelve por el paso 0 (api/bot/telegram.js) con la propuesta «aclarar».
 *
 * Mismo contrato que turno.js: { texto, fotos, deshacible, ir, propuesta? } o
 * null si no puede (y contesta Lola).
 */

import { select, eq } from "./db.js";
import { cargarCasa } from "./casa.js";
import { resolverDia, prepararRecetas, grupos, normal, DIA_LARGO } from "./menu.js";
import { COMIDAS_PRINCIPALES, articuloDe } from "../../src/lib/comidas.js";

const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const escapar = (w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// ── Encontrar el plato ──────────────────────────────────────────────────────

/** Las comidas de ese día que tiene el menú (de cualquier grupo), en orden. */
export function comidasDelDia(plan, dia) {
  const hay = new Set();
  for (const [gid, huecos] of Object.entries(plan ?? {})) {
    if (gid.startsWith("_")) continue;
    for (const [clave, h] of Object.entries(huecos ?? {})) {
      const [d, comida] = clave.split("-");
      if (d === dia && (h?.recipeId || h?.firstRecipeId) && COMIDAS_PRINCIPALES.includes(comida)) hay.add(comida);
    }
  }
  return COMIDAS_PRINCIPALES.filter((c) => hay.has(c));
}

/** El grupo que se mira: el que nombran, o el primero que no es solo de bebé. */
function grupoDe(casa, para) {
  const gs = grupos(casa);
  if (para) {
    const q = normal(para);
    const g = gs.find((x) => normal(x.label).includes(q) || q.includes(normal(x.label)));
    if (g) return g;
  }
  return gs.find((g) => !/beb/i.test(g.label ?? "")) ?? gs[0] ?? null;
}

/**
 * El plato del que hablan: por su nombre (primero entre los del menú) o por su
 * hueco. Devuelve { receta, dondeTexto } | { preguntar: {dia, fecha} } |
 * { error } | null.
 */
async function platoPedido(casa, x) {
  const m = await prepararRecetas(casa);
  if (x.plato) {
    const q = normal(x.plato);
    const palabras = q.split(/\s+/).filter((w) => w.length > 2);
    const idsDelPlan = [];
    for (const [gid, huecos] of Object.entries(casa.semana?.plan ?? {})) {
      if (gid.startsWith("_")) continue;
      for (const h of Object.values(huecos ?? {})) for (const id of [h?.firstRecipeId, h?.recipeId]) if (id) idsDelPlan.push(id);
    }
    const todas = [...idsDelPlan.map((id) => m.RECIPES_BY_ID[id]).filter(Boolean), ...Object.values(m.RECIPES_BY_ID)];
    const r = todas.find((y) => normal(y?.name) === q)
      ?? todas.find((y) => palabras.length && palabras.every((w) => new RegExp(`\\b${escapar(w)}`).test(normal(y?.name))));
    return r ? { receta: r, dondeTexto: null } : null;
  }
  if (!x.dia) return null;
  const rd = resolverDia(casa, x.dia, x.semana ?? null);
  if (rd.error) return { error: rd.error };
  const plan = rd.casa.semana?.plan;
  let comida = x.comida ?? null;
  if (!comida) {
    const hay = comidasDelDia(plan, rd.dia);
    if (hay.length === 1) comida = hay[0];
    else if (hay.length > 1) return { preguntar: { dia: rd.dia, fecha: rd.fecha } };
    else return null;
  }
  const g = grupoDe(rd.casa, x.para);
  const h = g ? plan?.[g.id]?.[`${rd.dia}-${comida}`] : null;
  const id = x.cual === "primero" ? h?.firstRecipeId : h?.recipeId ?? h?.firstRecipeId;
  const receta = id ? m.RECIPES_BY_ID[id] : null;
  return receta ? { receta, dondeTexto: `${articuloDe(comida)} del ${DIA_LARGO[rd.dia] ?? rd.dia}` } : null;
}

/** La pregunta de comida o cena, con la propuesta para el paso 0. */
export function preguntaComida(modo, x, { dia }) {
  const relativo = /^(hoy|mañana|manana|pasado mañana)$/i.test(String(dia ?? "").trim());
  const cuando = relativo ? `de ${String(dia).toLowerCase()}` : `del ${DIA_LARGO[dia] ?? dia}`;
  return {
    texto: `🤔 ¿Para la <b>comida</b> o la <b>cena</b> ${esc(cuando)}?\n[[Cena]]\n[[Comida]]`,
    fotos: [], deshacible: false, ir: null,
    propuesta: { tipo: "aclarar", modo, datos: { ...x, dia: DIA_LARGO[dia] ?? x.dia } },
  };
}

/**
 * Un cambio que dice el día pero no la comida: si ese día el menú solo tiene
 * una, esa; si tiene las dos, la pregunta. null si no hay menú ese día (Lola).
 * @returns {Promise<{ comida: string } | { pregunta: object } | null>}
 */
export async function huecoSinComida(householdId, modo, x) {
  const casa = await cargarCasa(householdId);
  if (!casa || !x.dia) return null;
  const rd = resolverDia(casa, x.dia, x.semana ?? null);
  if (rd.error) return null;
  const hay = comidasDelDia(rd.casa.semana?.plan, rd.dia);
  if (hay.length === 1) return { comida: hay[0] };
  if (hay.length > 1) return { pregunta: preguntaComida(modo, x, rd) };
  return null;
}

/** ¿Contestan a «¿comida o cena?»? Pura, para el test. */
export function comidaElegida(texto) {
  const t = normal(texto).replace(/[¡!¿?.]/g, "").trim();
  if (/^(la )?cena$|^(de |para )?(la )?cena|^por la noche$|^esta noche$/.test(t)) return "Cena";
  if (/^(la )?comida$|^(de |para )?(la )?comida|^a mediodia$|^al mediodia$|^mediodia$|^almuerzo$/.test(t)) return "Comida";
  return null;
}

// ── Las plantillas ──────────────────────────────────────────────────────────

const en = (dondeTexto) => (dondeTexto ? ` <i>(${esc(dondeTexto)})</i>` : "");

export async function verReceta(householdId, x) {
  const casa = await cargarCasa(householdId);
  if (!casa) return null;
  const p = await platoPedido(casa, x);
  if (!p || p.error) return null;
  if (p.preguntar) return preguntaComida("receta", x, p.preguntar);
  const r = p.receta;
  const datos = [r.time ? `⏱️ ${r.time} min` : "", r.servings || r.baseServings ? `${r.servings ?? r.baseServings} raciones` : ""].filter(Boolean).join(" · ");
  const ing = (r.ingredients ?? []).map((i) => `• ${esc(i.name)}${i.amount ?? i.qty ? ` — ${i.amount ?? i.qty}${i.unit ? ` ${esc(i.unit)}` : ""}` : ""}`);
  const pasos = (r.steps ?? []).map((s, i) => `${i + 1}. ${esc(typeof s === "string" ? s : s?.text ?? "")}`);
  if (!ing.length && !pasos.length) return null;
  return {
    texto: [
      `📖 <b>${esc(r.name)}</b>${en(p.dondeTexto)}${datos ? `\n${datos}` : ""}`,
      ing.length ? `🧺 <b>Ingredientes:</b>\n${ing.join("\n")}` : "",
      pasos.length ? `👩‍🍳 <b>Pasos:</b>\n${pasos.join("\n")}` : "",
    ].filter(Boolean).join("\n\n"),
    fotos: [], deshacible: false, ir: r.id ? `receta:${r.id}` : null,
  };
}

const NIVEL = { ligero: "ligero", medio: "normalito", contundente: "contundente" };

export async function calorias(householdId, x) {
  const casa = await cargarCasa(householdId);
  if (!casa) return null;
  const p = await platoPedido(casa, x);
  if (!p || p.error) return null;
  if (p.preguntar) return preguntaComida("calorias", x, p.preguntar);
  const r = p.receta;
  if (!(r.kcal > 0)) return null; // sin dato: que lo explique Lola
  const nivel = NIVEL[r.caloriasNivel] ? ` Es un plato <b>${NIVEL[r.caloriasNivel]}</b>.` : "";
  const macros = [r.protein_g ? `${Math.round(r.protein_g)} g de proteína` : "", r.carbs_g ? `${Math.round(r.carbs_g)} g de hidratos` : "", r.fat_g ? `${Math.round(r.fat_g)} g de grasa` : ""].filter(Boolean).join(", ");
  return {
    texto: `🔥 <b>${esc(r.name)}</b>${en(p.dondeTexto)}: unas <b>${Math.round(r.kcal)} kcal por ración</b>.${nivel}${macros ? `\n<i>${macros}.</i>` : ""}`,
    fotos: [], deshacible: false, ir: null,
  };
}

/** Lo de la despensa, con su id de ingrediente si la base lo tiene. */
async function filasDespensa(householdId, m) {
  return select("user_pantry", `household_id=${eq(householdId)}`, `${m.COLUMNAS_DESPENSA}, ingredient_id`)
    .catch(() => select("user_pantry", `household_id=${eq(householdId)}`, m.COLUMNAS_DESPENSA))
    .then((fs) => fs.map(m.filaDeDespensa).filter((p) => p.itemType !== "cooked_dish"));
}

// Lo que se da por hecho en cualquier cocina: no se pregunta por ello.
const BASICOS = /^(agua|sal|aceite( de oliva)?( virgen extra)?|pimienta( negra)?)$/;

/**
 * Qué ingredientes de la receta no están en la despensa. Por id cuando lo hay,
 * y si no por nombre con frontera de palabra. Pura, para el test.
 */
export function faltaPara(receta, despensa) {
  const ids = new Set(despensa.map((p) => p.ingredientId).filter(Boolean));
  const nombres = despensa.map((p) => normal(p.ingredientNormalized ?? p.ingredientName));
  const tengo = [];
  const falta = [];
  for (const i of receta.ingredients ?? []) {
    const n = normal(i.name);
    if (BASICOS.test(n)) continue;
    const hay = (i.ingredientId && ids.has(i.ingredientId)) || nombres.some((p) => p && (new RegExp(`\\b${escapar(p)}\\b`).test(n) || new RegExp(`\\b${escapar(n)}\\b`).test(p)));
    (hay ? tengo : falta).push(i.name);
  }
  return { tengo, falta };
}

export async function queFalta(householdId, x) {
  const casa = await cargarCasa(householdId);
  if (!casa) return null;
  const p = await platoPedido(casa, x);
  if (!p || p.error) return null;
  if (p.preguntar) return preguntaComida("falta", x, p.preguntar);
  const m = await prepararRecetas(casa);
  const despensa = await filasDespensa(householdId, m);
  const { tengo, falta } = faltaPara(p.receta, despensa);
  const cab = `🧺 <b>${esc(p.receta.name)}</b>${en(p.dondeTexto)}`;
  if (!falta.length) return { texto: `${cab}\n\n✅ Según la despensa lo tienes <b>todo</b>.`, fotos: [], deshacible: false, ir: null };
  const lista = (xs) => xs.map((n) => `• ${esc(n)}`).join("\n");
  return {
    texto: `${cab}\n\n🛒 <b>Te falta:</b>\n${lista(falta)}${tengo.length ? `\n\n✅ <b>Tienes:</b>\n${lista(tengo)}` : ""}${despensa.length ? "" : "\n\n<i>La despensa está vacía: si tienes cosas en casa, apúntalas y lo miro mejor.</i>"}\n\n¿Lo apunto en la compra?\n[[Apúntalo]]`,
    fotos: [], deshacible: false, ir: null,
    // Para el paso 0: «Apúntalo» añade justo esto a la lista.
    propuesta: { tipo: "apuntar", productos: falta },
  };
}

export async function verDespensaRapido(householdId) {
  const casa = await cargarCasa(householdId);
  if (!casa) return null;
  const m = await prepararRecetas(casa);
  const filas = await filasDespensa(householdId, m);
  if (!filas.length) return { texto: "🥫 La despensa está vacía. Mándame una foto del ticket o dime qué tienes y lo apunto.", fotos: [], deshacible: false, ir: null };
  const linea = (p) => `• ${esc(p.ingredientName)}${p.qty ? ` — ${p.qty} ${esc(p.unit ?? "")}`.trimEnd() : ""}`;
  const congelado = filas.filter((p) => p.frozen);
  const resto = filas.filter((p) => !p.frozen);
  return {
    texto: [
      resto.length ? `🥫 <b>En la despensa y la nevera:</b>\n${resto.map(linea).join("\n")}` : "",
      congelado.length ? `🧊 <b>En el congelador:</b>\n${congelado.map(linea).join("\n")}` : "",
    ].filter(Boolean).join("\n\n"),
    fotos: [], deshacible: false, ir: null,
  };
}

/** ¿Contestan «Apúntalo» a «¿Lo apunto en la compra?»? Pura. */
export const quiereApuntar = (texto) => /^(s[ií],?\s*)?ap[uú]nta(lo|los|las|me)?\b|^s[ií]$|^vale$|^venga$/.test(normal(texto).replace(/[¡!¿?.]/g, "").trim());
