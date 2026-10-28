/**
 * Respuestas al momento, sin pasar por el modelo, para los botones del
 * teclado fijo que son pura consulta: 🍽️ Hoy, 📅 Semana, 🛒 Compra (y /hoy,
 * /menu, /compra). Salen del menú guardado en menos de un segundo, con el
 * mismo formato que usa Lola (api/_bot/conocimiento.md).
 *
 * Sin menú para lo pedido, lo dicen ellas mismas (sinMenuPara, #931). Si no
 * hay casa, devuelven null y la pregunta sigue hacia Lola, que
 * sabe explicarlo y ofrecer generar.
 *
 * Se guardan en la memoria de la charla como cualquier turno, para que un
 * «¿y mañana?» detrás tenga contexto.
 */

import { insert } from "./db.js";
import { cargarCasa, hoyISO } from "./casa.js";
import { describirCompra } from "./menu.js";
import { pintarMenuEntero } from "./pintar.js";
import { fechasDe, diaDeFecha, sumarDias, indiceDia } from "./cuando.js";
import { estadoDelMenu } from "./estadoMenu.js";
import { fechaLarga } from "./memoria.js";
import { rangoDeFechas } from "./semanaPedida.js";
import { CANAL, paraEscribir } from "../../src/lib/vocabularios.js";

const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const mayus = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);

// Pura y sin dependencias (semanaPedida.js): generar.js también la usa.
export { rangoDeFechas };

/**
 * Cualquier trozo del menú, pintado con pintarMenu (api/_bot/pintar.js): unos
 * días, unas comidas, unos platos, para alguien. Si esos días no tienen menú,
 * lo dice sin modelo (sinMenuPara): antes pasaba a Lola, que contestaba con lo
 * que recordaba de la charla (#931).
 * @param {{ dias: string[], comidas?: string[], platos?: string[], grupo?: string }} filtros
 */
export async function respuestaMenu(householdId, filtros) {
  const casa = await cargarCasa(householdId);
  if (!casa || !filtros?.dias?.length) return null;
  const r = await pintarMenuEntero(casa, filtros);
  if (r.sinGrupo) return { texto: r.texto, fotos: [] };
  const hoy = hoyISO();
  if (!r.conMenu && !r.noPlanificadas.length) return sinMenuPara(casa.semanas ?? [], filtros.dias, hoy);
  const uno = filtros.dias.length === 1 ? filtros.dias[0] : null;
  return {
    texto: r.texto,
    fotos: r.fotos,
    ir: uno ? (uno === hoy ? "hoy" : `dia:${diaDeFecha(uno)}`) : "semana",
  };
}

/**
 * «No hay menú» para esos días, con lo que dice estadoMenu.js: cuándo acabó el
 * último o cuándo empieza el siguiente, y el botón para generarlo si es de
 * esta semana o de la que viene. Sin botón a la app: no hay nada que ver
 * (#935). Pura.
 * @param {Array<{ weekStart: string, weekEnd: string }>} semanas
 * @param {string[]} dias  AAAA-MM-DD, los pedidos
 * @param {string} hoy
 */
export function sinMenuPara(semanas, dias, hoy) {
  const primero = [...dias].sort()[0];
  const ultimo = [...dias].sort().at(-1);
  const e = estadoDelMenu(semanas, primero);
  const cuando = dias.length > 1 ? `Del ${rangoDeFechas(primero, ultimo)}` : primero === hoy ? "Para hoy" : `Para el ${fechaLarga(primero)}`;
  const motivo = e.estado === "despues" ? ` El menú empieza el ${fechaLarga(e.proximoDia)}.`
    : e.estado === "ya_paso" ? ` El último que teníais acababa el ${fechaLarga(e.ultimoDia)}.`
    : " Todavía no tenéis ninguno.";
  // Solo se ofrece la semana que el motor sabe generar: esta o la que viene.
  const domingo = sumarDias(hoy, 6 - indiceDia(hoy));
  const cual = e.estado === "despues" ? null : primero <= domingo ? "esta semana" : primero <= sumarDias(domingo, 7) ? "la semana que viene" : null;
  const oferta = cual ? `

¿Te preparo el menú de ${cual}?
[[Prepárame el menú de ${cual}]]
[[Ahora no]]` : "";
  return { texto: `${cuando} no hay menú.${motivo}${oferta}`, fotos: [], ir: null, sinMenu: e.estado };
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
  // Sin menú de aquí al domingo, la que viene; si tampoco, el «no hay» de esta.
  const deEsta = await respuestaMenu(householdId, { dias: esta });
  if (deEsta && !deEsta.sinMenu) return deEsta;
  const deLaQueViene = await respuestaMenu(householdId, { dias: siguiente });
  return deLaQueViene && !deLaQueViene.sinMenu ? deLaQueViene : deEsta ?? deLaQueViene;
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
export async function recordar({ channel = CANAL.TELEGRAM, chatId, householdId, pregunta, respuesta, extra = null }) {
  // El canal se valida una vez, al entrar. Si no vale, la memoria no se guarda, como cuando
  // falla el insert: la respuesta ya está dada y no se tumba el turno por esto.
  let canal;
  try {
    canal = paraEscribir("canales", channel);
  } catch (e) {
    console.error("[rapido] memoria", e?.message);
    return;
  }
  await insert("bot_messages", [
    { channel: canal, chat_id: String(chatId), household_id: householdId, role: "user", author_id: null, content: { texto: pregunta } },
    // `extra`: p. ej. la propuesta de opciones, para el paso 0 del turno siguiente.
    { channel: canal, chat_id: String(chatId), household_id: householdId, role: "assistant", author_id: null, content: { texto: respuesta, ...(extra ?? {}) } },
  ]).catch((e) => console.error("[rapido] memoria", e?.message));
}
