import { normalizeName } from "./ingredientCategories.js";

/**
 * Cómo se mide cada cosa. Una tabla, no un desplegable con todo dentro.
 *
 * ── El problema ───────────────────────────────────────────────────────────
 * Preguntar «¿en qué envase?» con la lista entera del supermercado delante
 * ofrece «brick de ajos» y «cartón de patatas». No son opciones improbables:
 * son opciones IMPOSIBLES, y una lista que las incluye deja de ayudar a
 * elegir — hay que leerla entera para descartar seis cosas absurdas.
 *
 * ── Una medida sabe lo que vale ───────────────────────────────────────────
 * Y esa es la otra mitad. Una cabeza de ajo ya ES una cantidad: pedir «1
 * cabeza DE 60 g» es hacer decir dos veces lo mismo, y encima la segunda no la
 * sabe nadie. Así que cada medida declara su equivalencia:
 *
 *   { id: "cabeza", base: "g", por: 60 }   1 cabeza son 60 g, y no se pregunta
 *   { id: "g",      base: "g", por: 1 }    la unidad a secas
 *   { id: "paquete", base: "g", por: 500, abierto: true }
 *
 * Solo las ABIERTAS preguntan el contenido, porque solo en ellas cambia: un
 * paquete de arroz es de medio kilo o de kilo según cuál cojas, pero una
 * cabeza de ajo es una cabeza. Las demás son dos huecos en vez de cuatro, que
 * además es lo único que cabe en el ancho del panel.
 *
 * ── Por qué reglas y no un diccionario ────────────────────────────────────
 * El pool de la despensa son doce nombres pero el buscador acepta los
 * quinientos del catálogo, y a un diccionario de doce le falta el 97 %. Las
 * reglas van por familia, así que «espaguetis» hereda de la pasta sin estar
 * escrito. Gana la PRIMERA que encaja: el ajo va antes que las verduras y el
 * aceite antes que las conservas, con las que comparte pasillo.
 *
 * `base` siempre es g, ml o ud — el vocabulario de `kitchenUnits`, que es lo
 * que se guarda y lo que cruza con la lista de la compra.
 */

const UD = { id: "ud", base: "ud", por: 1 };
const G = { id: "g", base: "g", por: 1 };
const KG = { id: "kg", base: "g", por: 1000 };
const ML = { id: "ml", base: "ml", por: 1 };
const L = { id: "l", base: "ml", por: 1000 };

const REGLAS = [
  // ── Lo que trae su propia medida ───────────────────────────────────────
  {
    re: /\bajos?\b/,
    medidas: [
      { id: "cabeza", base: "g", por: 60 },
      { id: "diente", base: "g", por: 5 },
      G,
    ],
  },

  // Los huevos se cuentan y ya. Aquí hubo "docena" y era una trampa: con
  // contenido abierto habría que decir "media docena de 12".
  { re: /huevos?\b/, medidas: [UD] },

  // Antes que las verduras: la fruta se cuenta.
  { re: /limon|naranja|manzana|platano|pera\b|aguacate|kiwi|mango|melocoton/, medidas: [UD, KG, G] },
  {
    re: /patata|cebolla|zanahoria|tomate|pimiento|calabacin|berenjena|puerro|pepino|boniato|calabaza/,
    medidas: [UD, KG, G],
  },

  // ── Seco de despensa ───────────────────────────────────────────────────
  {
    re: /arroz|pasta|macarron|espagueti|fideo|tallarin|cuscus|quinoa|harina|azucar|pan rallado/,
    medidas: [
      { id: "paquete", base: "g", por: 500, abierto: true, unidades: ["g", "kg"] },
      { id: "bolsa", base: "g", por: 1000, abierto: true, unidades: ["g", "kg"] },
      G, KG,
    ],
  },
  {
    re: /lenteja|garbanz|alubia|judion|fabes|soja|guisante seco/,
    medidas: [
      { id: "paquete", base: "g", por: 500, abierto: true, unidades: ["g", "kg"] },
      { id: "bote", base: "g", por: 400, abierto: true, unidades: ["g"] },
      G, KG,
    ],
  },

  // ── Líquidos ───────────────────────────────────────────────────────────
  // El aceite antes que las conservas: el de oliva vive en ese pasillo y allí
  // le tocaría "lata".
  {
    re: /aceite|vinagre/,
    medidas: [
      { id: "botella", base: "ml", por: 1000, abierto: true, unidades: ["ml", "l"] },
      { id: "garrafa", base: "ml", por: 5000, abierto: true, unidades: ["l"] },
      ML, L,
    ],
  },
  {
    re: /leche|nata|caldo|bebida de|zumo/,
    medidas: [
      { id: "brick", base: "ml", por: 1000, abierto: true, unidades: ["ml", "l"] },
      { id: "botella", base: "ml", por: 1000, abierto: true, unidades: ["ml", "l"] },
      ML, L,
    ],
  },
  { re: /yogur/, medidas: [UD, { id: "pack", base: "ud", por: 4 }] },

  // ── Conservas ──────────────────────────────────────────────────────────
  { re: /atun|sardina|anchoa|mejillon|berberecho|conserva|en lata|\blata\b/,
    medidas: [{ id: "lata", base: "g", por: 80, abierto: true, unidades: ["g"] }, G] },
  {
    re: /tomate frito|triturado|passata|salsa|mayonesa|ketchup|mostaza|mermelada/,
    medidas: [{ id: "bote", base: "g", por: 400, abierto: true, unidades: ["g"] }, G],
  },

  // ── Fresco al peso ─────────────────────────────────────────────────────
  {
    re: /pollo|pavo|ternera|cerdo|cordero|carne|salmon|merluza|bacalao|gamba|langostino|queso|jamon|bacon|chorizo/,
    medidas: [G, KG, UD],
  },
];

/** Lo que se ofrece cuando no sabemos nada del nombre. */
const POR_DEFECTO = [UD, G, KG, ML, L];

/**
 * En qué se mide esto.
 *
 * @param {string} nombre  el nombre del ingrediente, como lo escribe el usuario
 * @returns {Array<{id: string, base: string, por: number, abierto?: boolean, unidades?: string[]}>}
 */
export function medidasDe(nombre) {
  const n = normalizeName(nombre);
  if (!n) return POR_DEFECTO;
  for (const r of REGLAS) {
    if (r.re.test(n)) return r.medidas;
  }
  return POR_DEFECTO;
}

/** Una medida concreta por su id, o la primera de la lista si no está. */
export function medidaPorId(medidas, id) {
  return medidas.find((m) => m.id === id) ?? medidas[0];
}

/** Las unidades sueltas, que no necesitan que nadie diga cuánto traen. */
export const UNIDAD_SUELTA = new Set(["ud", "g", "kg", "ml", "l"]);

/**
 * El plural de una medida. Casi todas suman una ese; las unidades no se
 * pluralizan porque ya son abreviaturas — «2 g», no «2 gs».
 */
export function enPlural(id) {
  if (UNIDAD_SUELTA.has(id)) return id;
  if (id === "cartón") return "cartones";
  return `${id}s`;
}
