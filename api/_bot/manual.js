/**
 * El texto del sistema de Lola: el manual (conocimiento.md) con sus marcas rellenas desde el mapa de
 * capacidades (src/lib/capacidades.js) y las fichas de las herramientas (agente.js), para que lo que dice
 * de sí misma no se quede viejo (trozo 43 del plan de fichas).
 *
 * Puro y sin importar nada del bot: agente.js le pasa sus fichas y el mapa, porque capacidades.js importa
 * agente.js y al revés sería un ciclo. Con las mismas fichas y el mismo mapa sale el mismo texto en cada
 * turno, así que la caché del prompt no se rompe.
 */
import { DESHACE } from "../../src/lib/vocabularios.js";
import { CAMINOS } from "../../src/lib/caminos.js";

/** Las marcas del manual y de dónde sale cada una. */
export const MARCAS_MANUAL = Object.freeze({
  QUE_SABES_HACER: "lo que se hace con tus herramientas (las capacidades con algo en Lola)",
  SOLO_EN_LA_APP: "lo que la app hace y tú no (las capacidades sin nada en Lola y con la app encendida)",
  QUE_SE_DESHACE: "lo que «deshaz» no vuelve atrás (las capacidades cuyas herramientas no se deshacen)",
  CAMINOS: "los tres caminos de antes de cada menú, con su botón, qué pasa y un ejemplo (src/lib/caminos.js)",
});

/** Un camino como lo enseña Lola: el botón, qué pasa, cuánto se tarda y un ejemplo de respuesta. */
const lineaDeCamino = (c) => `[[${c.titulo}]]: ${c.resumen.replace(/.$/, "")} (${c.minutos} min). Ej.: «${c.ejemplo}».`;

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
    CAMINOS: CAMINOS.map(lineaDeCamino).join("\n"),
  };
}

/**
 * El manual con sus marcas rellenas. Lanza si queda una marca que no existe o si una marca no está en el
 * manual: un texto a medias no se le da al modelo.
 * @param {string} manual
 * @param {{ capacidades: readonly object[], fichas: Map<string, object> }} o
 */
export function armarManual(manual, o) {
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
