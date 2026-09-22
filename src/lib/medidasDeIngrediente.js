import { normalizeName } from "./ingredientCategories.js";

/**
 * Cómo se mide cada cosa. Una tabla, no un desplegable con todo dentro.
 *
 * ── El problema ───────────────────────────────────────────────────────────
 * Preguntar «¿en qué envase?» con la lista entera del supermercado delante
 * ofrece «brick de ajos» y «cartón de patatas». No son opciones improbables:
 * son opciones IMPOSIBLES, y una lista que las incluye deja de ayudar a
 * elegir — hay que leerla entera para descartar seis cosas absurdas y quedarse
 * con la única que tiene sentido.
 *
 * Aquí cada ingrediente declara en qué se mide de verdad. El ajo va en cabezas
 * o en dientes; la leche en bricks o botellas; las patatas a peso o por
 * unidades. Dos o tres opciones por sitio, y todas se pueden elegir.
 *
 * ── Por qué es una tabla de reglas y no un diccionario ────────────────────
 * Porque el pool de la despensa son doce nombres pero el buscador acepta los
 * quinientos del catálogo, y a un diccionario de doce le falta el 97 %. Las
 * reglas van por familia —lo que se vende en paquete, lo que se vende en
 * botella— así que «espaguetis» hereda de la pasta sin estar escrito.
 *
 * Gana la PRIMERA que encaja, así que el orden manda: el ajo va antes que las
 * verduras y el aceite antes que las conservas.
 *
 * ── Qué es cada cosa ──────────────────────────────────────────────────────
 *   envases   recipientes que además tienen un contenido ("1 paquete de 500 g").
 *             Vacío = esto no viene en envase y se cuenta o se pesa a secas.
 *   unidades  en qué se mide ese contenido, o la cosa misma si no hay envase.
 *             Siempre en el vocabulario de `kitchenUnits`: ud, g, kg, ml, l.
 */

const REGLAS = [
  // ── Lo que se cuenta por pieza, aunque también se pueda pesar ──────────
  { re: /\bajos?\b/, envases: ["cabeza", "diente"], unidades: ["g"] },
  // Los huevos se cuentan, no se empaquetan. Aquí hubo "docena" y "cartón" y
  // era una trampa: con envase, la ficha pregunta cuántos envases Y cuánto
  // trae cada uno, así que "6 huevos" había que decirlo como "media docena
  // de 12", que no lo dice nadie.
  { re: /huevos?\b/, envases: [], unidades: ["ud"] },

  // Antes que las verduras: el limón y el tomate se cuentan, no se pesan.
  { re: /limon|naranja|manzana|platano|pera\b|aguacate|kiwi|mango/, envases: [], unidades: ["ud", "kg", "g"] },

  // ── Lo que se compra a peso pero también viene en bolsa ────────────────
  { re: /patata|cebolla|zanahoria|tomate|pimiento|calabacin|berenjena|puerro|pepino|boniato/,
    envases: [], unidades: ["ud", "kg", "g"] },

  // ── Seco de despensa: paquete, bolsa o bote ────────────────────────────
  { re: /arroz|pasta|macarron|espagueti|fideo|tallarin|cuscus|quinoa|harina|azucar|pan rallado/,
    envases: ["paquete", "bolsa"], unidades: ["g", "kg"] },
  { re: /lenteja|garbanz|alubia|judion|fabes|soja|guisante seco/,
    envases: ["paquete", "bolsa", "bote"], unidades: ["g", "kg"] },

  // ── Líquidos ───────────────────────────────────────────────────────────
  // El aceite va antes que las conservas: el de oliva es "aceite" y también
  // vive en el pasillo de conservas, y allí le tocaría "lata".
  { re: /aceite|vinagre/, envases: ["botella", "garrafa"], unidades: ["ml", "l"] },
  { re: /leche|nata|caldo|bebida de|zumo/, envases: ["brick", "botella"], unidades: ["ml", "l"] },
  { re: /yogur/, envases: ["pack"], unidades: ["ud"] },

  // ── Conservas ──────────────────────────────────────────────────────────
  { re: /atun|sardina|anchoa|mejillon|berberecho|conserva|en lata|\blata\b/,
    envases: ["lata"], unidades: ["g"] },
  { re: /tomate frito|triturado|passata|salsa|mayonesa|ketchup|mostaza|mermelada/,
    envases: ["bote", "brick"], unidades: ["g", "ml"] },

  // ── Fresco al peso ─────────────────────────────────────────────────────
  { re: /pollo|pavo|ternera|cerdo|cordero|carne|salmon|merluza|bacalao|gamba|langostino|queso|jamon|bacon|chorizo/,
    envases: [], unidades: ["g", "kg", "ud"] },
];

/** Lo que se ofrece cuando no sabemos nada del nombre. */
const POR_DEFECTO = { envases: [], unidades: ["ud", "g", "kg", "ml", "l"] };

/**
 * En qué se mide esto.
 *
 * @param {string} nombre  el nombre del ingrediente, como lo escribe el usuario
 * @returns {{envases: string[], unidades: string[]}}
 */
export function medidasDe(nombre) {
  const n = normalizeName(nombre);
  if (!n) return POR_DEFECTO;
  for (const r of REGLAS) {
    if (r.re.test(n)) return { envases: r.envases, unidades: r.unidades };
  }
  return POR_DEFECTO;
}

/**
 * El plural de un envase. Casi todos suman una ese; los que acaban en
 * consonante con tilde la pierden al crecer.
 */
export function enPlural(palabra) {
  if (palabra === "cartón") return "cartones";
  if (palabra === "pack") return "packs";
  return `${palabra}s`;
}
