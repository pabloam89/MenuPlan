/**
 * Match MenuPlan shopping ingredients → Mercadona store products.
 * Rule-based (token overlap + aliases + category filters). No ML.
 */

import { normalizeName, guessShoppingAisle, isPerishableAisle } from "./ingredientCategories.js";
import productoBuscadoJson from "../data/productoBuscado.json";

/** @typedef {{ id: string, name: string, price?: number|null, unitSize?: number|null, unitFormat?: string|null, section?: string, category?: string, subcategory?: string }} StoreProduct */

export const MERCADONA_SEARCH_ALIASES = {
  boniato: ["batata"],
  espaguetis: ["spaghetti"],
  cuscus: ["cous cous"],
  calamares: ["calamar"],
  gambas: ["gamba"],
  judiones: ["alubia grande", "alubia blanca"],
  fabes: ["alubia grande", "fabada"],
  "fideos n°2": ["fideo mediano", "fideo grueso"],
  "escalopines de ternera": ["escalopin de vacuno", "escalopin"],
  "pescadilla en lomos": ["pescadilla de merluza", "pescadilla"],
  "rosada en lomos": ["merluza en lomos", "lomo de merluza"],
  lombarda: ["col lombarda", "repollo morado"],
  maicena: ["fecula de maiz", "maizena"],
  "alubias de bote": ["alubia cocida blanca", "alubia cocida"],
  "pan de hamburguesa": ["pan de burger", "pan burger"],
  huevo: ["huevos"],
  // Mercadona lo escribe con b y el catálogo con v. Es la misma hortaliza, y
  // un alias es más honrado que enseñarle al emparejador que la b y la v son
  // intercambiables, porque no lo son: «baca» y «vaca» tampoco.
  endivia: ["endibia", "endibias"],
  tirabuzones: ["fusilli", "helices", "espiral"],
  nabo: ["nabo"],
};

// «preparado de» lleva un hueco a propósito: Mercadona llama «Preparado de
// carne picada cerdo» a la carne picada CRUDA, que es exactamente lo que pide
// la receta, y no un plato cocinado. Sin la excepción, las siete referencias
// de picada del catálogo quedaban fuera y «Carne picada de cerdo» acababa en
// «Tocino de cerdo» al 0,57 — el mismo producto que ya se llevaba las manitas
// y el tocino, o sea un imán de tres ingredientes. Los otros cinco
// «Preparado de …» del súper (paella, verdura para cocido, coco, medallones
// marinados) sí son platos y siguen fuera.
const PREPARED_DISH_RE =
  /arroz de|pasta con|paella con|guisado|estofado|lasaña|lasana|croqueta|empanadilla|plato preparado|revuelto|al horno|con setas|con verduras|frito con|preparado de (?!carne picada)|cocinado|ultracongelado.*hacendado.*arroz/i;

/** Comida para bebés: potitos, papillas, leches de continuación y bolsitas. */
const ES_INFANTIL =
  /papilla|potito|tarrito|nutriben|blevit|almiron|puleva peques|hero baby|hero solo|bebe|infantil|junior|\+\s*\d+\s*mes|continuacion|crecimiento/i;

export const MATCH_MIN = 0.4;
export const MATCH_HIGH = 0.7;

function tokenize(s) {
  return new Set(
    normalizeName(s)
      .split(/\s+/)
      .map((t) => t.replace(/[^a-z0-9]/g, ""))
      .filter((t) => t.length > 1),
  );
}

const TOKEN_CACHE = new Map();
function cachedTokens(s) {
  let t = TOKEN_CACHE.get(s);
  if (!t) {
    t = tokenize(s);
    TOKEN_CACHE.set(s, t);
  }
  return t;
}

/**
 * Dos tokens son el mismo alimento cuando lo único que cambia es el número:
 * «gamba» y «gambas», «hélice» y «hélices», «fideo» y «fideos». El plural
 * AÑADE letras al final y no toca la raíz.
 *
 * Lo que aquí había antes era distancia de edición, y la distancia de edición
 * no sabe distinguir eso de una palabra distinta que se le parece:
 *
 *   gamba / gambas      1 edición   el mismo marisco
 *   hueso / huevo       1 edición   ni siquiera la misma parte del animal
 *   fresca / fresas     1 edición   un adjetivo y una fruta
 *   morcilla / morcillo 1 edición   un embutido y un corte de ternera
 *   granja / granola    2 ediciones nada que ver
 *
 * Los cuatro últimos estaban pasando, y salían en la lista de la compra. El
 * criterio morfológico —solo sufijo, raíz intacta— acepta el primero y rechaza
 * los otros cuatro sin necesidad de excepciones caso a caso.
 */
const PLURALES = ["s", "es"];
function mismoLema(a, b) {
  if (a === b) return true;
  const [corto, largo] = a.length <= b.length ? [a, b] : [b, a];
  if (corto.length < 4) return false;
  if (!largo.startsWith(corto)) return false;
  return PLURALES.includes(largo.slice(corto.length));
}

/**
 * Concordancia: la misma raíz con otro género o número —«ibérica»/«ibérico»,
 * «desalado»/«desaladas»—. En castellano el adjetivo concuerda con su nombre,
 * así que la misma etiqueta cambia de terminación según a qué acompañe.
 *
 * El problema es que «morcilla»/«morcillo» es EXACTAMENTE el mismo cambio y
 * son dos alimentos distintos. No se puede distinguir mirando la palabra. Sí
 * se puede mirando qué más casa: por eso la concordancia SUMA pero no sirve
 * de núcleo. «Presa ibérica» vive porque además casa «presa»; «Morcilla» se
 * queda sin nada, que es lo correcto.
 */
const DESINENCIAS = /(?:os|as|es|o|a|s)$/;
function concuerda(a, b) {
  const ra = a.replace(DESINENCIAS, "");
  return ra.length >= 5 && ra === b.replace(DESINENCIAS, "");
}

/**
 * Palabras que describen el alimento pero no lo nombran: dicen CÓMO viene, no
 * QUÉ es. No pueden ser lo único que sostenga una coincidencia, porque si lo
 * son el emparejador produce cosas como estas, todas medidas en el catálogo:
 *
 *   Atún fresco, Chile fresco, Menta fresca, Salmón fresco  → Butifarra fresca
 *   Filetes de ternera, Filetes de pez espada               → Filetes de dorada
 *   Carne picada de ternera, Carne para mechar              → Botifarrón de carne
 *
 * Seis ingredientes distintos apuntando a la misma butifarra: la palabra que
 * casaba era siempre el adjetivo.
 */
const MODIFICADORES = new Set([
  "fresco", "fresca", "frescos", "frescas",
  "congelado", "congelada", "congelados", "congeladas", "ultracongelado",
  "cocido", "cocida", "cocidos", "cocidas", "crudo", "cruda",
  "picado", "picada", "rallado", "rallada", "troceado", "troceada",
  "molido", "molida", "laminado", "laminada", "pelado", "pelada",
  "entero", "entera", "enteros", "enteras", "natural", "naturales",
  "grande", "grandes", "pequeno", "pequena", "pequenos", "pequenas",
  "mediano", "mediana", "fino", "fina", "finos", "finas", "grueso", "gruesa",
  "filete", "filetes", "loncha", "lonchas", "trozo", "trozos",
  "tira", "tiras", "rodaja", "rodajas", "taco", "tacos", "dado", "dados",
  "carne", "pieza", "piezas", "bandeja", "bolsa", "pack", "lata", "bote",
  "seco", "seca", "secos", "secas", "dulce", "salado", "salada",
  "light", "extra", "ecologico", "ecologica", "bio",
  // Preposiciones y artículos: el filtro de longitud de `tokenize` deja pasar
  // las de dos letras, y «Filetes de ternera» casaba «Filetes de dorada» con
  // dos aciertos de tres —«filetes» y «de»— sin nombrar ni una vez al animal.
  "de", "la", "el", "en", "al", "lo", "un",
  "con", "sin", "del", "las", "los", "para", "una", "que", "por",
]);

/**
 * @returns {{score: number, nucleo: number}} `nucleo` cuenta solo los aciertos
 * sobre palabras que nombran al alimento, ignorando los modificadores.
 */
function tokenOverlap(a, b) {
  if (a.size === 0 || b.size === 0) return { score: 0, nucleo: 0 };
  let hit = 0;
  let nucleo = 0;
  for (const t of a) {
    let lema = b.has(t);
    if (!lema) for (const bt of b) if (mismoLema(t, bt)) { lema = true; break; }
    let apoyo = false;
    if (!lema) for (const bt of b) if (concuerda(t, bt)) { apoyo = true; break; }
    if (!lema && !apoyo) continue;
    hit++;
    if (lema && !MODIFICADORES.has(t)) nucleo++;
  }
  return { score: (2 * hit) / (a.size + b.size), nucleo };
}

function containsWholePhrase(haystack, needle) {
  if (!needle) return false;
  const esc = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|\\s)${esc}(?:\\s|$)`).test(haystack);
}

/**
 * Score how well a product name matches a search probe (ingredient or alias).
 */
export function scoreProductName(productName, probeId) {
  const norm = normalizeName(productName);
  const probeTokens = cachedTokens(probeId);
  if (!norm || probeTokens.size === 0) return 0;
  const { score: solape, nucleo } = tokenOverlap(probeTokens, cachedTokens(norm));
  // Si el ingrediente tiene alguna palabra que lo nombre, esa palabra tiene que
  // aparecer. Cuando el nombre entero son modificadores no hay núcleo que pedir
  // y se puntúa como antes.
  const pideNucleo = [...probeTokens].some((t) => !MODIFICADORES.has(t));
  let score = pideNucleo && nucleo === 0 ? 0 : solape;
  if (containsWholePhrase(norm, probeId) || containsWholePhrase(probeId, norm)) {
    score = Math.max(score, 0.75);
  }
  return Math.min(0.95, score);
}

const INDEX_CACHE = new WeakMap();

function pushIndex(map, key, product) {
  let arr = map.get(key);
  if (!arr) map.set(key, (arr = []));
  arr.push(product);
}

/** Token + 3-char prefix index so we don't score 3k SKUs per ingredient. */
export function productIndexFor(products) {
  if (!products?.length) return null;
  let idx = INDEX_CACHE.get(products);
  if (idx) return idx;
  const byToken = new Map();
  const byPrefix = new Map();
  for (const product of products) {
    const tokens = cachedTokens(normalizeName(product?.name ?? ""));
    for (const tok of tokens) {
      pushIndex(byToken, tok, product);
      if (tok.length >= 3) pushIndex(byPrefix, tok.slice(0, 3), product);
    }
  }
  idx = { byToken, byPrefix };
  INDEX_CACHE.set(products, idx);
  return idx;
}

function candidateProducts(products, terms) {
  const idx = productIndexFor(products);
  if (!idx) return products;
  const seen = new Set();
  const out = [];
  const add = (arr) => {
    if (!arr) return;
    for (const p of arr) {
      if (seen.has(p)) continue;
      seen.add(p);
      out.push(p);
    }
  };
  for (const term of terms) {
    for (const tok of cachedTokens(term)) {
      add(idx.byToken.get(tok));
      if (tok.length >= 3) add(idx.byPrefix.get(tok.slice(0, 3)));
    }
  }
  return out.length ? out : products;
}

/**
 * Drop obvious false positives (baby food, wrong aisle, prepared dishes).
 */
export function shouldSkipProduct(ingredientId, product) {
  const ing = normalizeName(ingredientId);
  const name = normalizeName(product?.name ?? "");
  if (!name) return true;

  // Alimentación infantil. La regla vieja solo protegía al pescado, y por eso
  // «Cereales» y «Miel» acababan los dos en la misma bolsita de postre lácteo
  // «+12 meses»: la palabra casaba de verdad, el producto no. Una receta para
  // adultos nunca compra un potito, así que la puerta se cierra entera.
  if (!/papilla|potito|tarrito|infantil|bebe/.test(ing) && ES_INFANTIL.test(name)) {
    return true;
  }

  if (/gamba|calamar|langostin|mejillon/.test(ing)) {
    if (/fideo|pasta|spaghetti|macarron|tallarines|helices|risotto|paella/.test(name)) {
      return true;
    }
  }

  if (/caldo/.test(ing) && /pan |barra|molde|hogaza|picos/.test(name) && !/caldo/.test(name)) {
    return true;
  }

  if (
    (/atun/.test(ing) && /conserva|lata|natural|aceite/.test(ing)) ||
    ing === "atun en conserva" ||
    ing === "atun en lata"
  ) {
    if (/tomate|salsa/.test(name) && !/tomate/.test(ing)) return true;
  }

  if (!/pan|hogaza|chapata|baguette|molde|tostada|fuet|picos|regana|crouton/.test(ing)) {
    if (/panecillo|barra de pan|pan sin sal|pan de centeno|pan de molde/.test(name)) {
      return true;
    }
  }

  if (/leche|yogur|queso|mantequilla/.test(ing) && /chocolate|galleta|bizcocho|postre/.test(name)) {
    return true;
  }

  if (/^arroz$|^pasta$|^fideos|^espagueti/.test(ing) && /salsa|preparado|plato|lasaña/.test(name)) {
    return true;
  }

  // Raw meat/fish/produce → not a prepared ready-meal from another aisle.
  const aisle = guessShoppingAisle(ingredientId);
  if (
    isPerishableAisle(aisle) ||
    /carne|pollo|ternera|cerdo|merluza|atun|emperador|pescad|lomo|secreto|gamb|calamar|bonito|salmon/.test(ing)
  ) {
    if (PREPARED_DISH_RE.test(name)) return true;
    if (/arroz|pasta|fideos|cous|spaghetti|macarron|lasaña/.test(name) && !/arroz|pasta|fideos|cous|spaghetti|macarron|lasaña/.test(ing)) {
      return true;
    }
  }

  if (/^ajo\b|^ajos\b/.test(ing) && /picatost|crouton|tostad|frito con ajo/.test(name) && !/^ajo/.test(name)) {
    return true;
  }

  // Eggs: only cartons of eggs, not chocolate/pasta/sandwiches that mention "huevo".
  if (/^huevo?s?$/.test(ing)) {
    if (!/^huevos?\b/.test(name)) return true;
    if (/chocolate|sorpresa|helado|pasta|macarron|spaghetti|sandwich|merluza|filete|nido|revuelto|mini/.test(name)) {
      return true;
    }
  }

  // Burger buns: not a barra de pan or prepared snack.
  if (/hamburguesa|\bburger\b/.test(ing)) {
    if (/empanadilla|cheese burger|sandwich/.test(name)) return true;
    if (/barra de pan|pan de molde|hogaza|chapata|baguette/.test(name) && !/burger|hamburguesa/.test(name)) {
      return true;
    }
  }

  return false;
}

/**
 * Cómo llama el súper a cada ingrediente cuando no lo llama por su nombre.
 * Decisiones tomadas a mano y con motivo escrito, en src/data/productoBuscado.json.
 */
export const PRODUCTO_BUSCADO = Object.fromEntries(
  Object.entries(productoBuscadoJson)
    .filter(([clave]) => !clave.startsWith("_"))
    .map(([clave, v]) => [clave, v.buscar]),
);

/**
 * Puntúa cada producto candidato con SU MEJOR término, y los devuelve ordenados.
 *
 * Aquí había un `seen` que descartaba el producto en cuanto un término lo había
 * puntuado, así que mandaba el término que llegaba primero y no el que mejor
 * casaba. Como el nombre del ingrediente siempre va el primero de la lista,
 * ningún alias podía mejorar una puntuación ya puesta: «Solomillo de vacuno»
 * se quedaba en el 0,67 que le daba «solomillo de ternera» y perdía el desempate
 * por precio contra «Solomillos de pollo», que sacaba el mismo 0,67. Con el
 * alias puntuando de verdad saca 0,95 y no hay desempate que valga.
 */
function coincidencias(ingredientId, terms, pool, minConfidence) {
  const mejor = new Map();
  for (const product of pool) {
    if (shouldSkipProduct(ingredientId, product)) continue;
    for (const term of terms) {
      const confidence = scoreProductName(product.name, term);
      if (confidence < minConfidence) continue;
      const previo = mejor.get(product.id);
      if (!previo || confidence > previo.confidence) {
        mejor.set(product.id, { product, confidence, via: term });
      }
    }
  }
  return [...mejor.values()].sort(
    (a, b) =>
      b.confidence - a.confidence ||
      (Number(a.product.price) || 999) - (Number(b.product.price) || 999),
  );
}

function searchTermsForIngredient(ingredientName) {
  const id = normalizeName(ingredientName);
  const terms = [
    ingredientName,
    ...(MERCADONA_SEARCH_ALIASES[id] ?? []),
    ...(PRODUCTO_BUSCADO[id] ?? []),
  ];
  return [...new Set(terms.map((t) => normalizeName(t)).filter(Boolean))];
}

/**
 * Best Mercadona SKU for a shopping-list ingredient.
 * @returns {{ product: StoreProduct, confidence: number, via: string } | null}
 */
export function matchProductForIngredient(ingredientName, products = [], { minConfidence = MATCH_MIN } = {}) {
  const ingredientId = normalizeName(ingredientName);
  if (!ingredientId || !products.length) return null;

  const terms = searchTermsForIngredient(ingredientName);
  const hits = coincidencias(ingredientId, terms, candidateProducts(products, terms), minConfidence);
  return hits[0] ?? null;
}

/**
 * @param {string} ingredientName
 * @param {StoreProduct[]} products
 * @param {{ limit?: number, minConfidence?: number }} [opts]
 */
export function matchProductsForIngredient(ingredientName, products = [], opts = {}) {
  const { limit = 3, minConfidence = MATCH_MIN } = opts;
  const ingredientId = normalizeName(ingredientName);
  const terms = searchTermsForIngredient(ingredientName);
  const hits = coincidencias(ingredientId, terms, candidateProducts(products, terms), minConfidence);
  return hits.slice(0, limit);
}
