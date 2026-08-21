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

function levenshtein(a, b) {
  const m = a.length;
  const n = b.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

function tokensNear(a, b) {
  if (a === b) return true;
  const maxLen = Math.max(a.length, b.length);
  const lenDiff = Math.abs(a.length - b.length);
  if (maxLen < 4) return false;
  if (maxLen < 7) return lenDiff === 0 && levenshtein(a, b) <= 1;
  if (lenDiff > 1) return false;
  return levenshtein(a, b) <= 2;
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
  const probeTokens = tokenize(probeId);
  if (!norm || probeTokens.size === 0) return 0;
  let score = tokenOverlap(probeTokens, tokenize(norm));
  if (containsWholePhrase(norm, probeId) || containsWholePhrase(probeId, norm)) {
    score = Math.max(score, 0.75);
  }
  return Math.min(0.95, score);
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

  const hits = [];
  const seen = new Set();

  for (const term of searchTermsForIngredient(ingredientName)) {
    for (const product of products) {
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
  const hits = [];
  const seen = new Set();

  for (const term of searchTermsForIngredient(ingredientName)) {
    for (const product of products) {
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
