import { recipeCatalog } from "../data/recipeCatalog.js";

/**
 * Turns free-text pantry input ("tengo pollo, tomates y cebolla") into a list
 * of ingredients matched against the recipe catalog, deterministically (no
 * LLM) so it's fast, free, and reproducible.
 *
 * Matching is word-set based rather than raw substring matching: "pollo" as
 * a plain substring check would also match inside "Repollo" (cabbage), which
 * is wrong. Comparing whole, stopword-filtered words avoids that.
 */

// Single-word fillers stripped before matching. Broader than just "articles"
// (el/la/los/las/un/una/unos/unas) because free text like "un poco de queso"
// needs "poco"/"de" gone too to isolate the actual ingredient.
const STOPWORDS = new Set([
  "el", "la", "los", "las", "un", "una", "unos", "unas",
  "de", "del", "con", "en",
  "tengo", "hay", "poco", "algo", "hago",
]);

function stripAccents(str) {
  return str.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

function significantWords(str) {
  return stripAccents(String(str ?? "").toLowerCase())
    .split(/\s+/)
    .map((w) => w.replace(/[.,;:!?¡¿]/g, ""))
    .filter((w) => w && !STOPWORDS.has(w));
}

// Treats simple singular/plural pairs as equal ("tomates" ~ "tomate") without
// pulling in a stemming library for what's otherwise exact-word matching.
function wordsEqual(a, b) {
  if (a === b) return true;
  if (`${a}s` === b || `${b}s` === a) return true;
  if (`${a}es` === b || `${b}es` === a) return true;
  return false;
}

function isWordSubset(words, of) {
  return words.length > 0 && words.every((w) => of.some((o) => wordsEqual(w, o)));
}

function toKey(words) {
  return words.join("_");
}

let catalogIndexCache = null;

/** Unique ingredient names across the whole catalog, pre-split into words. */
function buildCatalogIndex() {
  const names = new Set();
  for (const recipe of recipeCatalog) {
    for (const ing of recipe.ingredients ?? []) {
      if (ing?.name) names.add(ing.name);
    }
  }
  // Sorted so tied matches (several "Queso ..." variants for a bare "queso")
  // resolve to the same entry every time instead of depending on catalog
  // iteration order.
  return [...names].sort().map((name) => ({ name, words: significantWords(name) }));
}

function getCatalogIndex() {
  if (!catalogIndexCache) catalogIndexCache = buildCatalogIndex();
  return catalogIndexCache;
}

/** Exposed for tests only — the cache is invalidated if the catalog changes shape. */
export function _resetCatalogIndexCache() {
  catalogIndexCache = null;
}

// A match requires every word on the shorter side to appear on the longer
// side ("pollo" ⊆ "pechuga de pollo", or "pechuga de pollo" ⊇ "pechuga").
// Among ties, prefers the catalog name whose word count is closest to the
// token's, so a bare "pollo" prefers the plain "Pollo" entry over a specific
// cut when both would otherwise match equally well.
function findBestCatalogMatch(tokenWords, catalogIndex) {
  if (tokenWords.length === 0) return null;
  let best = null;
  for (const entry of catalogIndex) {
    const matches = isWordSubset(tokenWords, entry.words) || isWordSubset(entry.words, tokenWords);
    if (!matches) continue;
    const score = Math.abs(entry.words.length - tokenWords.length);
    if (!best || score < best.score) best = { entry, score };
  }
  return best?.entry ?? null;
}

function splitIntoTokens(input) {
  return input
    .split(/,|\n|\by\b/i)
    .map((t) => t.trim())
    .filter(Boolean);
}

/**
 * @param {string} input Free text, e.g. "tengo pollo, tomates y cebolla"
 * @returns {{ raw: string, normalized: string, matched: boolean }[]}
 */
export function normalizePantryInput(input) {
  const text = String(input ?? "").trim();
  if (!text) return [];

  const catalogIndex = getCatalogIndex();

  return splitIntoTokens(text).map((raw) => {
    const words = significantWords(raw);
    const match = findBestCatalogMatch(words, catalogIndex);
    if (match) {
      return { raw, normalized: toKey(match.words), matched: true };
    }
    // No catalog match: still return a normalized key (for display/storage)
    // built from the user's own words, since ingredient_normalized is
    // NOT NULL in user_pantry regardless of whether it matched anything.
    return { raw, normalized: toKey(words) || raw.toLowerCase(), matched: false };
  });
}
