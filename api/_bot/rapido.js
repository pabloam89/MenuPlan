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
import { describirCompra } from "./menu.js";
import { pintarMenuEntero } from "./pintar.js";
import { fechasDe, diaDeFecha } from "./cuando.js";

const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const mayus = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const diaYMes = (iso) => `${Number(iso.slice(8, 10))} de ${MESES[Number(iso.slice(5, 7)) - 1]}`;

/** «1 al 4 de octubre», «28 de septiembre al 4 de octubre». Pura, para el test. */
export const rangoDeFechas = (a, b) => (a.slice(0, 7) === b.slice(0, 7) ? `${Number(a.slice(8, 10))} al ${diaYMes(b)}` : `${diaYMes(a)} al ${diaYMes(b)}`);

/**
 * Cualquier trozo del menú, pintado con pintarMenu (api/_bot/pintar.js): unos
 * días, unas comidas, unos platos, para alguien. Null si no hay nada que
 * enseñar (ningún día con menú y nada que decir): entonces contesta Lola y
 * ofrece generarlo.
 * @param {{ dias: string[], comidas?: string[], platos?: string[], grupo?: string }} filtros
 */
export async function respuestaMenu(householdId, filtros) {
  const casa = await cargarCasa(householdId);
  if (!casa || !filtros?.dias?.length) return null;
  const r = await pintarMenuEntero(casa, filtros);
  if (r.sinGrupo) return { texto: r.texto, fotos: [] };
  if (!r.conMenu && !r.noPlanificadas.length) return null;
  const hoy = hoyISO();
  const uno = filtros.dias.length === 1 ? filtros.dias[0] : null;
  return {
    texto: r.texto,
    fotos: r.fotos,
    ir: uno ? (uno === hoy ? "hoy" : `dia:${diaDeFecha(uno)}`) : "semana",
  };
}

/** 🍽️ Hoy: lo de hoy con fotos. */
export async function respuestaHoy(householdId) {
  return respuestaMenu(householdId, { dias: [hoyISO()] });
}

/** Un día cualquiera («mañana», «el jueves»), por su fecha real, con fotos. */
export async function respuestaDia(householdId, texto) {
  const dias = fechasDe({ cuando: /^hoy$/i.test(String(texto).trim()) ? "hoy" : /^ma(ñ|n)ana$/i.test(String(texto).trim()) ? "manana" : "dia", dia: texto }, hoyISO());
  return dias ? respuestaMenu(householdId, { dias }) : null;
}

/** 📅 Semana: de hoy al domingo (lo pasado ya no interesa). El domingo, o si
 *  de aquí al domingo no hay nada, la que viene: es la que van a mirar. */
export async function respuestaSemana(householdId) {
  const hoy = hoyISO();
  const esta = fechasDe({ cuando: "esta_semana" }, hoy);
  const siguiente = fechasDe({ cuando: "semana_que_viene" }, hoy);
  if (esta.length === 1) return respuestaMenu(householdId, { dias: [...esta, ...siguiente] });
  return (await respuestaMenu(householdId, { dias: esta })) ?? respuestaMenu(householdId, { dias: siguiente });
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

/**
 * Deja el turno en la memoria de la charla, como si lo hubiera contestado Lola.
 * `autor` se sigue aceptando pero no se guarda: author_id llevaba el nombre de
 * Telegram de quien escribió y nadie lo leía (memoria() no lo pide).
 */
export async function recordar({ channel = "telegram", chatId, householdId, pregunta, respuesta, extra = null }) {
  await insert("bot_messages", [
    { channel, chat_id: String(chatId), household_id: householdId, role: "user", author_id: null, content: { texto: pregunta } },
    // `extra`: p. ej. la propuesta de opciones, para el paso 0 del turno siguiente.
    { channel, chat_id: String(chatId), household_id: householdId, role: "assistant", author_id: null, content: { texto: respuesta, ...(extra ?? {}) } },
  ]).catch((e) => console.error("[rapido] memoria", e?.message));
}
