/**
 * Respuestas al momento, sin pasar por el modelo, para los botones del
 * teclado fijo que son pura consulta: 🍽️ Hoy, 📅 Semana, 🛒 Compra (y /hoy,
 * /menu, /compra). Salen del menú guardado en menos de un segundo, con el
 * mismo formato que usa Lola (api/_bot/conocimiento.md).
 *
 * Si no hay nada claro que enseñar (sin menú, o un menú de una semana que ya
 * pasó), devuelven null y la pregunta sigue su camino normal hacia Lola, que
 * sabe explicarlo y ofrecer generar.
 *
 * Se guardan en la memoria de la charla como cualquier turno, para que un
 * «¿y mañana?» detrás tenga contexto.
 */

import { insert } from "./db.js";
import { cargarCasa, hoyISO } from "./casa.js";
import { prepararRecetas, grupos, resolverDia, describirCompra, FRANJAS, DIA_LARGO, DIAS } from "./menu.js";

const EMOJI = { Desayuno: "☕", Comida: "🍽️", Merienda: "🥪", Cena: "🌙", Postre: "🍮" };
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Los platos de un día, por comida, juntando los grupos que comen lo mismo. */
function bloquesDelDia(casa, m, dia, { fotos = null, conFotos = false } = {}) {
  const plan = casa.semana?.plan ?? {};
  const nombre = (id) => (id ? m.RECIPES_BY_ID[id]?.name ?? m.RECIPES_BY_ID[String(id).split("__").pop()]?.name ?? null : null);
  const bloques = [];
  for (const f of FRANJAS) {
    const porPlatos = new Map();
    for (const g of grupos(casa)) {
      const h = plan[g.id]?.[`${dia}-${f}`];
      if (!h) continue;
      const platos = [nombre(h.firstRecipeId), nombre(h.recipeId)].filter(Boolean);
      if (!platos.length) continue;
      if (conFotos && fotos) {
        for (const id of [h.firstRecipeId, h.recipeId]) {
          const r = id ? m.RECIPES_BY_ID[id] ?? m.RECIPES_BY_ID[String(id).split("__").pop()] : null;
          const url = r ? m.dishImageForRecipe(r) : null;
          if (url && !fotos.some((x) => x.url === url)) fotos.push({ url, pie: r.name });
        }
      }
      const clave = platos.join("\n");
      if (!porPlatos.has(clave)) porPlatos.set(clave, { platos, quienes: [] });
      porPlatos.get(clave).quienes.push(g.label);
    }
    if (!porPlatos.size) continue;
    const varios = porPlatos.size > 1;
    const partes = [...porPlatos.values()].map(({ platos, quienes }) =>
      `${varios ? `<i>${esc(quienes.join(" y "))}</i>\n` : ""}${platos.map((p) => `• ${esc(p)}`).join("\n")}`);
    bloques.push(`${EMOJI[f] ?? "🍽️"} <b>${f}</b>\n${partes.join("\n")}`);
  }
  return bloques;
}

/** 🍽️ Hoy: lo de hoy con fotos. */
export async function respuestaHoy(householdId) {
  return respuestaDia(householdId, "hoy");
}

/** Un día cualquiera («mañana», «el jueves»), por su fecha real, con fotos. */
export async function respuestaDia(householdId, texto) {
  const casa = await cargarCasa(householdId);
  if (!casa?.semana?.plan) return null;
  const rd = resolverDia(casa, texto);
  if (rd.error || !rd.casa?.semana?.plan) return null;
  const m = await prepararRecetas(rd.casa);
  const fotos = [];
  const bloques = bloquesDelDia(rd.casa, m, rd.dia, { fotos, conFotos: true });
  if (!bloques.length) return null;
  const n = Number(rd.fecha.slice(8, 10));
  const esHoy = /^hoy$/i.test(String(texto).trim());
  const nombre = DIA_LARGO[rd.dia];
  const titulo = esHoy ? `Hoy, ${nombre} ${n}` : `${nombre[0].toUpperCase()}${nombre.slice(1)} ${n}`;
  return { texto: `<b>${titulo}</b>\n\n${bloques.join("\n\n")}`, fotos, ir: esHoy ? "hoy" : `dia:${rd.dia}` };
}

/** 📅 Semana: un bloque por día, desde hoy si la semana está en curso. */
export async function respuestaSemana(householdId) {
  const casa = await cargarCasa(householdId);
  const s = casa?.semana;
  if (!s?.plan || s.weekEnd < hoyISO()) return null;
  const m = await prepararRecetas(casa);
  const activos = s.activeDays?.length ? s.activeDays : DIAS.slice(s.startDayIdx ?? 0);
  // Con la semana en curso, de hoy en adelante: lo de ayer ya no interesa.
  const enCurso = s.weekStart <= hoyISO() && hoyISO() <= s.weekEnd;
  const indiceHoy = (new Date(`${hoyISO()}T12:00:00Z`).getUTCDay() + 6) % 7;
  const dias = activos.filter((d) => !enCurso || DIAS.indexOf(d) >= indiceHoy);
  const partes = [];
  for (const d of dias) {
    const b = bloquesDelDia(casa, m, d);
    if (b.length) partes.push(`<b>${DIA_LARGO[d][0].toUpperCase()}${DIA_LARGO[d].slice(1)}</b>\n${b.join("\n")}`);
  }
  if (!partes.length) return null;
  return { texto: partes.join("\n\n"), fotos: [], ir: "semana" };
}

/** 🛒 Compra: lo que falta, por secciones. */
export async function respuestaCompra(householdId) {
  const casa = await cargarCasa(householdId);
  if (!casa) return null;
  const crudo = describirCompra(casa);
  if (/está vacía/.test(crudo)) return { texto: "🛒 La lista de la compra está vacía. Dime qué apunto, o genero el menú y te la hago.", fotos: [], ir: "compra" };
  const lineas = crudo.split("\n").map((l) => {
    if (/^[^•(].*:$/.test(l)) return `<b>${esc(l.slice(0, -1))}</b>`;
    if (/^\(.*\)$/.test(l)) return `<i>${esc(l.slice(1, -1))}</i>`;
    return esc(l);
  });
  return { texto: `🛒 <b>Lo que falta</b>\n\n${lineas.join("\n")}`, fotos: [], ir: "compra" };
}

/** Deja el turno en la memoria de la charla, como si lo hubiera contestado Lola. */
export async function recordar({ channel = "telegram", chatId, householdId, pregunta, respuesta, autor = null, extra = null }) {
  await insert("bot_messages", [
    { channel, chat_id: String(chatId), household_id: householdId, role: "user", author_id: autor, content: { texto: pregunta } },
    // `extra`: p. ej. la propuesta de opciones, para el paso 0 del turno siguiente.
    { channel, chat_id: String(chatId), household_id: householdId, role: "assistant", author_id: null, content: { texto: respuesta, ...(extra ?? {}) } },
  ]).catch((e) => console.error("[rapido] memoria", e?.message));
}
