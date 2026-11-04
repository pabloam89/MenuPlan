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
