/**
 * Match MenuPlan shopping ingredients → Mercadona store products.
 * Rule-based (token overlap + aliases + category filters). No ML.
 */

import { normalizeName, guessShoppingAisle, isPerishableAisle } from "./ingredientCategories.js";

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
  tirabuzones: ["fusilli", "helices", "espiral"],
  nabo: ["nabo"],
};

const PREPARED_DISH_RE =
  /arroz de|pasta con|paella con|guisado|estofado|lasaña|lasana|croqueta|empanadilla|plato preparado|revuelto|al horno|con setas|con verduras|frito con|preparado de|cocinado|ultracongelado.*hacendado.*arroz/i;

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

/** Cheap bounded edit distance; returns max+1 as soon as it cannot beat `max`. */
function levenshteinAtMost(a, b, max) {
  const m = a.length;
  const n = b.length;
  if (Math.abs(m - n) > max) return max + 1;
  let prev = new Array(n + 1);
  let curr = new Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    let rowMin = curr[0];
    const ca = a.charCodeAt(i - 1);
    for (let j = 1; j <= n; j++) {
      const cost = ca === b.charCodeAt(j - 1) ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
      if (curr[j] < rowMin) rowMin = curr[j];
    }
    if (rowMin > max) return max + 1;
    const tmp = prev;
    prev = curr;
    curr = tmp;
  }
  return prev[n];
}

function tokensNear(a, b) {
  if (a === b) return true;
  if (a.charCodeAt(0) !== b.charCodeAt(0)) return false;
  const maxLen = Math.max(a.length, b.length);
  const lenDiff = Math.abs(a.length - b.length);
  if (maxLen < 4) return false;
  if (maxLen < 7) return lenDiff === 0 && levenshteinAtMost(a, b, 1) <= 1;
  if (lenDiff > 1) return false;
  return levenshteinAtMost(a, b, 2) <= 2;
}

function tokenOverlap(a, b) {
  if (a.size === 0 || b.size === 0) return 0;
  let hit = 0;
  for (const t of a) {
    if (b.has(t)) {
      hit++;
      continue;
    }
    for (const bt of b) {
      if (tokensNear(t, bt)) {
        hit++;
        break;
      }
    }
  }
  return (2 * hit) / (a.size + b.size);
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
  let score = tokenOverlap(probeTokens, cachedTokens(norm));
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

  if (
    /merluza|pescadilla|salmon|atun|dorada|lubina|trucha|bacalao|lenguado/.test(ing) &&
    /papilla|hero|potito|\+6|bebe|infantil|junior|8m|12m/.test(name)
  ) {
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

function searchTermsForIngredient(ingredientName) {
  const id = normalizeName(ingredientName);
  const terms = [ingredientName, ...(MERCADONA_SEARCH_ALIASES[id] ?? [])];
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
  const pool = candidateProducts(products, terms);
  const hits = [];
  const seen = new Set();

  for (const term of terms) {
    for (const product of pool) {
      if (seen.has(product.id)) continue;
      if (shouldSkipProduct(ingredientId, product)) continue;
      const confidence = scoreProductName(product.name, term);
      if (confidence >= minConfidence) {
        seen.add(product.id);
        hits.push({ product, confidence, via: term });
      }
    }
  }

  if (!hits.length) return null;

  hits.sort(
    (a, b) =>
      b.confidence - a.confidence ||
      (Number(a.product.price) || 999) - (Number(b.product.price) || 999),
  );

  return hits[0];
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
  const pool = candidateProducts(products, terms);
  const hits = [];
  const seen = new Set();

  for (const term of terms) {
    for (const product of pool) {
      if (seen.has(product.id)) continue;
      if (shouldSkipProduct(ingredientId, product)) continue;
      const confidence = scoreProductName(product.name, term);
      if (confidence >= minConfidence) {
        seen.add(product.id);
        hits.push({ product, confidence, via: term });
      }
    }
  }

  hits.sort(
    (a, b) =>
      b.confidence - a.confidence ||
      (Number(a.product.price) || 999) - (Number(b.product.price) || 999),
  );

  return hits.slice(0, limit);
}
