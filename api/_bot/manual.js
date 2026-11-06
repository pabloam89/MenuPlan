/**
 * El texto del sistema de Lola: el manual (conocimiento.md) con sus marcas rellenas desde el mapa de
 * capacidades (src/lib/capacidades.js) y las fichas de las herramientas (agente.js), para que lo que dice
 * de sí misma no se quede viejo (trozo 43 del plan de fichas).
 *
 * Puro y sin importar nada del bot: agente.js le pasa sus fichas y el mapa, porque capacidades.js importa
 * agente.js y al revés sería un ciclo. Con las mismas fichas y el mismo mapa sale el mismo texto en cada
 * turno, así que la caché del prompt no se rompe.
 */
import { DESHACE, CANAL } from "../../src/lib/vocabularios.js";
import { CAMINOS } from "../../src/lib/caminos.js";
import { formatoParaElManual } from "./formatoMensaje.js";

/**
 * El orden fijo del manual (trozo 58 del plan de fichas): primero quién es y lo que manda, los límites arriba (lo
 * que va al principio pesa más), luego la ficha, las situaciones, los ejemplos, la forma de su canal y, al final,
 * un recordatorio corto de lo crítico. Los bloques, en ese orden.
 */
export const BLOQUES_MANUAL = Object.freeze(["identidad", "principios", "limites", "ficha", "situaciones", "ejemplos", "forma", "recordatorio"]);

/**
 * Los apartados «# » del manual, en su orden, con su bloque. La forma va por canal: entra la del canal del turno
 * (armarManual). manualEstructura.test.js falla si los títulos de conocimiento.md no siguen esta lista.
 */
export const ORDEN_MANUAL = Object.freeze([
  { titulo: "Quién eres", bloque: "identidad" },
  { titulo: "Cómo trabajas (esto manda sobre todo lo demás)", bloque: "principios" },
  { titulo: "Seguridad: alergias e intolerancias", bloque: "limites" },
  { titulo: "Lo que no haces", bloque: "limites" },
  { titulo: "La ficha de la casa", bloque: "ficha" },
  { titulo: "El menú", bloque: "situaciones" },
  { titulo: "Después del primer menú", bloque: "situaciones" },
  { titulo: "Configurar la casa hablando", bloque: "situaciones" },
  { titulo: "Recetas", bloque: "situaciones" },
  { titulo: "Fotos y voz", bloque: "situaciones" },
  { titulo: "Recordatorios", bloque: "situaciones" },
  { titulo: "Cocina y nutrición: contesta, y bien", bloque: "situaciones" },
  { titulo: "Charla nueva, grupos y versión gratis", bloque: "situaciones" },
  { titulo: "Qué sabes hacer", bloque: "situaciones" },
  { titulo: "Preguntas frecuentes de HoMenu", bloque: "situaciones" },
  { titulo: "Cómo se habla de verdad", bloque: "ejemplos" },
  { titulo: "Forma en Telegram", bloque: "forma", canal: CANAL.TELEGRAM },
  { titulo: "Antes de mandar", bloque: "recordatorio" },
]);

/** Los títulos «# » de un manual, en el orden en que salen. */
export const titulosDelManual = (manual) => [...manual.matchAll(/^# (.+)$/gm)].map((m) => m[1]);

/** Las marcas del manual y de dónde sale cada una. */
export const MARCAS_MANUAL = Object.freeze({
  QUE_SABES_HACER: "lo que se hace con tus herramientas (las capacidades con algo en Lola)",
  SOLO_EN_LA_APP: "lo que la app hace y tú no (las capacidades sin nada en Lola y con la app encendida)",
  QUE_SE_DESHACE: "lo que «deshaz» no vuelve atrás (las capacidades cuyas herramientas no se deshacen)",
  CAMINOS: "los tres caminos de antes de cada menú: una línea por camino con su botón en negrita, y un ejemplo de cada uno (src/lib/caminos.js)",
  FORMATO: "las reglas de forma de un mensaje (REGLAS_FORMATO, formatoMensaje.js): las mismas que mide el revisor",
  USAN_UN_HUECO: "las herramientas que trabajan sobre un hueco del menú, tras las que un ver_menu no se pinta (USAN_UN_HUECO)",
});

// Las que trabajan sobre UN hueco del menú (un día y una comida): un ver_menu antes de ellas era para
// encontrarlo, y no se pinta (callarConsultas, agente.js). Vive aquí porque el manual la nombra.
export const USAN_UN_HUECO = Object.freeze(new Set(["proponer_platos", "cambiar_plato", "por_que_plato"]));

/** «a, b o c»: unos nombres dichos como los diría Lola. */
export const oNombres = (nombres) => {
  const xs = [...nombres];
  return xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} o ${xs.at(-1)}`;
};

/**
 * Un camino como lo enseña Lola: su botón en negrita, qué pasa y cuánto se tarda. El botón de verdad ([[…]]) va
 * aparte, solo en su línea: dentro de la frase el chat se lo lleva y la línea se queda en «:» (trozo 60 de #1037).
 */
export const lineaDeCamino = (c) => `<b>${c.titulo}</b>: ${c.enChat.replace(/\.$/, "")} (${c.minutos} min)`;

/** Un ejemplo de respuesta por camino, para cuando preguntan qué es cada uno. */
const ejemplosDeCaminos = () => `Si preguntan qué es cada uno, un ejemplo de respuesta: ${CAMINOS.map((c) => `${c.titulo}, «${c.ejemplo}»`).join("; ")}.`;

const MARCA = /\{\{([A-Z_]+)\}\}/g;
const lista = (caps) => caps.map((c) => `• ${c.accion}`).join("\n");
const enApp = (c) => Boolean(c.app && !c.app.apagada);

/**
 * Las listas, de las capacidades (con su `lola`, de capacidades.js) y las fichas (FICHAS de agente.js).
 * @param {{ capacidades: readonly object[], fichas: Map<string, object> }} o
 */
export function rellenos({ capacidades, fichas }) {
  const deLola = capacidades.filter((c) => c.lola.length > 0);
  // No se deshace una capacidad cuyas herramientas que escriben no tienen cómo; deshacer mismo no cuenta.
  const sinDeshacer = deLola.filter((c) => c.verbo !== "deshacer" && (() => {
    const escriben = c.lola.map((n) => fichas.get(n)).filter((f) => f && !f.soloLectura);
    return escriben.length > 0 && escriben.every((f) => f.deshace === DESHACE.NO);
  })());
  return {
    QUE_SABES_HACER: lista(deLola),
    SOLO_EN_LA_APP: lista(capacidades.filter((c) => c.lola.length === 0 && enApp(c))),
    QUE_SE_DESHACE: lista(sinDeshacer),
    CAMINOS: [...CAMINOS.map(lineaDeCamino), ejemplosDeCaminos()].join("\n"),
    FORMATO: formatoParaElManual(),
    USAN_UN_HUECO: oNombres(USAN_UN_HUECO),
  };
}

/**
 * El manual con sus marcas rellenas, para el canal del turno. Lanza si queda una marca que no existe, si una marca
 * no está en el manual o si el canal no tiene su apartado de forma: un texto a medias no se le da al modelo (con
 * WhatsApp, Lola no escribiría con la forma de Telegram sin que nadie se entere).
 * @param {string} manual
 * @param {{ capacidades: readonly object[], fichas: Map<string, object>, canal: string }} o
 */
export function armarManual(manual, o) {
  const forma = ORDEN_MANUAL.find((a) => a.bloque === "forma" && a.canal === o.canal);
  if (!forma || !titulosDelManual(manual).includes(forma.titulo)) throw new Error(`manual: sin forma para el canal ${o.canal}`);
  const r = rellenos(o);
  const vistas = new Set([...manual.matchAll(MARCA)].map((m) => m[1]));
  const desconocidas = [...vistas].filter((m) => !(m in MARCAS_MANUAL));
  if (desconocidas.length) throw new Error(`manual: marcas que no existen: ${desconocidas.join(", ")}`);
  const faltan = Object.keys(MARCAS_MANUAL).filter((m) => !vistas.has(m));
  if (faltan.length) throw new Error(`manual: marcas sin poner: ${faltan.join(", ")}`);
  return manual.replace(MARCA, (_, m) => r[m]);
}

// ── Las partes que solo entran cuando hacen falta (trozo 44) ────────────────────────────────────────────────
// Cada una con su disparador exacto, que el código ve sin preguntar al modelo. Van en un bloque de sistema
// aparte, detrás de los fijos (agente.js, unaVuelta): el manual fijo y la ficha siguen saliendo de caché.

/** Las marcas que el código pone en lo que llega a Lola, y de las que salen los disparadores. */
export const MARCAS_DEL_TURNO = Object.freeze({
  // El primer mensaje de una casa nueva (api/bot/telegram.js).
  ALTA: "[alta]",
  // Una nota de voz pasada a texto (telegram.js); en el alta va dentro del primer mensaje.
  VOZ: "[nota de voz]",
  VOZ_EN_EL_ALTA: "(nota de voz)",
  // Lo que se guarda en la charla de un mensaje con adjunto (agente.js, bot_messages).
  FOTO: "[foto]",
  PDF: "[PDF]",
  // La ficha de una casa sin nadie todavía (ficha.js, montarFicha).
  PARA_EMPEZAR: "PARA EMPEZAR FALTA",
});
const M = MARCAS_DEL_TURNO;

/** Las partes, por nombre (su fichero es api/_bot/manual/<nombre>.md), con cuándo entra cada una. */
export const PARTES_MANUAL = Object.freeze({
  // Una casa vacía: el primer mensaje del alta, o la ficha que dice que falta todo. Lo de después del primer
  // menú no va aquí: llega con la casa ya con gente, y se queda en el manual fijo.
  alta: ({ entrada, ficha }) => entrada.startsWith(M.ALTA) || Boolean(ficha?.estable?.includes(M.PARA_EMPEZAR)),
  // Una foto o un PDF en este mensaje o en el anterior de la persona (la confirmación del ticket, para quién es
  // el menú del cole), o una nota de voz.
  fotos: ({ entrada, adjunto, historia }) => {
    const previo = historia.findLast((m) => m.role === "user")?.content;
    // includes y no startsWith: la memoria le pone delante «[Escrito el …]» si es de otro día (memoria.js).
    const conAdjunto = (t) => typeof t === "string" && (t.includes(M.FOTO) || t.includes(M.PDF));
    return Boolean(adjunto) || conAdjunto(previo) || entrada.includes(M.VOZ) || entrada.includes(M.VOZ_EN_EL_ALTA);
  },
});

/**
 * Las partes que entran en este turno, en el orden de PARTES_MANUAL.
 * @param {{ entrada?: string, adjunto?: object|null, historia?: {role: string, content: unknown}[], ficha?: {estable?: string}|null }} turno
 * @returns {string[]}
 */
export function partesDelTurno({ entrada = "", adjunto = null, historia = [], ficha = null } = {}) {
  const t = { entrada: String(entrada ?? ""), adjunto, historia: historia ?? [], ficha };
  return Object.keys(PARTES_MANUAL).filter((p) => PARTES_MANUAL[p](t));
}
