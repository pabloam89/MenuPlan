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
import { prepararRecetas, grupos, resolverDia, describirCompra, quienesDe, cambiosDe, FRANJAS, DIA_LARGO, DIAS } from "./menu.js";

// El icono de cada comida sale del catálogo (src/lib/comidas.js).
import { iconoDe } from "../../src/lib/comidas.js";
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

const sumarDias = (iso, n) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
/** La fecha de un día («Jue») dentro de la semana que empieza (o contiene) weekStart. */
function fechaDelDia(weekStart, dia) {
  const lunes = sumarDias(weekStart, -((new Date(`${weekStart}T12:00:00Z`).getUTCDay() + 6) % 7));
  return sumarDias(lunes, DIAS.indexOf(dia));
}
const mayus = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const diaYMes = (iso) => `${Number(iso.slice(8, 10))} de ${MESES[Number(iso.slice(5, 7)) - 1]}`;
/** «1 al 4 de octubre», «28 de septiembre al 4 de octubre». Pura, para el test. */
export const rangoDeFechas = (a, b) => (a.slice(0, 7) === b.slice(0, 7) ? `${Number(a.slice(8, 10))} al ${diaYMes(b)}` : `${diaYMes(a)} al ${diaYMes(b)}`);

/**
 * La cabecera de un día: «📆 Hoy, miércoles 30 de septiembre», «📆 Mañana,
 * jueves 1 de octubre», «📆 Viernes 2 de octubre». Pura, para el test.
 */
export function tituloDelDia(dia, fecha, hoy = hoyISO()) {
  const nombre = DIA_LARGO[dia];
  const cuando = fecha === hoy ? `Hoy, ${nombre}` : fecha === sumarDias(hoy, 1) ? `Mañana, ${nombre}` : mayus(nombre);
  return `📆 <b>${cuando} ${diaYMes(fecha)}</b>`;
}

/**
 * Los platos de un día, por comida, juntando los grupos que comen lo mismo:
 *
 *   🍽️ <b>Comida:</b>
 *   • Crema de calabaza
 *   • Pollo al horno
 *
 * y si los grupos comen distinto, cada uno con su nombre en cursiva y dos
 * puntos. Un bloque por comida; quien lo pinta decide cuánto aire lleva.
 */
function bloquesDelDia(casa, m, dia, { fotos = null, conFotos = false } = {}) {
  const plan = casa.semana?.plan ?? {};
  // Con lo que se ha adaptado para alguien de la casa: «(con pan sin gluten)».
  const nombre = (id) => {
    const r = id ? m.RECIPES_BY_ID[id] ?? m.RECIPES_BY_ID[String(id).split("__").pop()] : null;
    if (!r?.name) return null;
    const c = cambiosDe(r);
    return c ? `${r.name} (${c})` : r.name;
  };
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
      porPlatos.get(clave).quienes.push(quienesDe(g, casa.state?.data?.members ?? []) ?? g.label);
    }
    if (!porPlatos.size) continue;
    const varios = porPlatos.size > 1;
    const partes = [...porPlatos.values()].map(({ platos, quienes }) =>
      `${varios ? `<i>${esc(mayus(quienes.join(" y ")))}:</i>\n` : ""}${platos.map((p) => `• ${esc(p)}`).join("\n")}`);
    bloques.push(`${iconoDe(f)} <b>${f}:</b>\n${partes.join("\n")}`);
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
  const esHoy = rd.fecha === hoyISO();
  return { texto: `${tituloDelDia(rd.dia, rd.fecha)}\n\n${bloques.join("\n\n")}`, fotos, ir: esHoy ? "hoy" : `dia:${rd.dia}` };
}

/**
 * 📅 Semana: un bloque por día, desde hoy si la semana está en curso. Cada día
 * con su fecha, las comidas con dos puntos, y una línea en blanco entre días
 * para que se vea dónde empieza cada uno.
 */
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
  let primero = null, ultimo = null;
  for (const d of dias) {
    const b = bloquesDelDia(casa, m, d);
    if (!b.length) continue;
    const fecha = fechaDelDia(s.weekStart, d);
    primero ??= fecha;
    ultimo = fecha;
    partes.push(`${tituloDelDia(d, fecha)}\n${b.join("\n")}`);
  }
  if (!partes.length) return null;
  const titulo = enCurso ? "Lo que queda de semana" : "Vuestro menú";
  const cabecera = primero === ultimo
    ? `📅 <b>${titulo}</b>`
    : `📅 <b>${titulo}</b>\n<i>Del ${rangoDeFechas(primero, ultimo)}</i>`;
  return { texto: `${cabecera}\n\n${partes.join("\n\n")}`, fotos: [], ir: "semana" };
}

// Un icono por sección de la lista (las categorías de la app: «Verduras y
// frutas», «Carnes y pescados», «Lácteos y huevos»…). Por palabra, porque
// las listas antiguas traen nombres sueltos («carnes», «legumbres»).
const ICONO_SECCION = [
  [/carn|embutid|charcut/, "🥩"], [/pesc|marisc/, "🐟"], [/frutos secos/, "🥜"], [/verdur|frut/, "🥬"],
  [/lacte|huevo|queso|refrigerad/, "🥛"], [/\bpan|cereal|bolleria/, "🥖"], [/legumbre|pasta|arroz/, "🫘"],
  [/congel/, "🧊"], [/bebida/, "🧃"], [/despensa|conserva|aceite|especia|salsa/, "🫙"], [/bebe/, "🍼"],
  [/limpieza|drogueria|higiene/, "🧴"],
];
const sinAcentos = (s) => String(s).normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
export const iconoSeccion = (nombre) => ICONO_SECCION.find(([re]) => re.test(sinAcentos(nombre)))?.[1] ?? "🛍️";

/** 🛒 Compra: lo que falta, por secciones (icono, nombre en negrita y dos puntos). */
export async function respuestaCompra(householdId) {
  const casa = await cargarCasa(householdId);
  if (!casa) return null;
  const crudo = describirCompra(casa);
  if (/está vacía/.test(crudo)) return { texto: "🛒 La lista de la compra está vacía. Dime qué apunto, o genero el menú y te la hago.", fotos: [], ir: "compra" };
  let quedan = 0;
  const lineas = crudo.split("\n").flatMap((l) => {
    if (/^[^•(].*:$/.test(l)) return [`${iconoSeccion(l)} <b>${esc(mayus(l.slice(0, -1)))}:</b>`];
    // «(3 comprados, 1 ya en casa)»: es para Lola; aquí basta con lo que queda.
    if (/^\(.*\)$/.test(l)) return [];
    if (l.startsWith("• ")) quedan++;
    return [esc(l)];
  });
  while (lineas.length && !lineas.at(-1).trim()) lineas.pop();
  const cuantos = quedan ? `\n\n<i>${quedan === 1 ? "Queda 1 cosa" : `Quedan ${quedan} cosas`} por comprar.</i>` : "";
  return { texto: `🛒 <b>Lo que falta</b>\n\n${lineas.join("\n")}${cuantos}`, fotos: [], ir: "compra" };
}

/** Deja el turno en la memoria de la charla, como si lo hubiera contestado Lola. */
export async function recordar({ channel = "telegram", chatId, householdId, pregunta, respuesta, autor = null, extra = null }) {
  await insert("bot_messages", [
    { channel, chat_id: String(chatId), household_id: householdId, role: "user", author_id: autor, content: { texto: pregunta } },
    // `extra`: p. ej. la propuesta de opciones, para el paso 0 del turno siguiente.
    { channel, chat_id: String(chatId), household_id: householdId, role: "assistant", author_id: null, content: { texto: respuesta, ...(extra ?? {}) } },
  ]).catch((e) => console.error("[rapido] memoria", e?.message));
}
