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

/**
 * Stopword-filtered significant words for an arbitrary ingredient name.
 * Exported so other matching needs (e.g. scoring recipes against a saved
 * pantry in filterRecipes.js) reuse this instead of a raw substring check,
 * which would wrongly match "pollo" inside "Repollo".
 */
export function ingredientWords(name) {
  return significantWords(name);
}

/** True if either word list is a whole-word subset of the other. */
export function wordsOverlapEither(a, b) {
  return isWordSubset(a, b) || isWordSubset(b, a);
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
// Returns every catalog entry tied at the best score (word-count distance
// from the token) rather than picking one — a bare "pechuga" matches both
// "Pechuga de pollo" and "Pechuga de pavo" equally well, and there's no way
// to guess which the user meant, so the caller must ask them.
function findCatalogMatches(tokenWords, catalogIndex) {
  if (tokenWords.length === 0) return [];
  let bestScore = Infinity;
  let matches = [];
  for (const entry of catalogIndex) {
    const isMatch = isWordSubset(tokenWords, entry.words) || isWordSubset(entry.words, tokenWords);
    if (!isMatch) continue;
    const score = Math.abs(entry.words.length - tokenWords.length);
    if (score < bestScore) {
      bestScore = score;
      matches = [entry];
    } else if (score === bestScore) {
      matches.push(entry);
    }
  }
  // Dedupe entries that are the same ingredient under singular/plural
  // variance (catalog data has both "Contramuslo de pollo" and "Contramuslos
  // de pollo") — those shouldn't look like two different candidates to
  // choose between. Uses a looser singularized key than the stored
  // `normalized` value just to detect this; genuinely different words
  // ("pollo" vs "pavo") are untouched and still surface as real choices.
  const seen = new Set();
  return matches.filter((m) => {
    const key = m.words.map(singularize).join("_");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function singularize(word) {
  if (word.endsWith("es") && word.length > 4) return word.slice(0, -2);
  if (word.endsWith("s") && word.length > 3) return word.slice(0, -1);
  return word;
}

function splitIntoTokens(input) {
  return input
    .split(/,|\n|\by\b/i)
    .map((t) => t.trim())
    .filter(Boolean);
}

/**
 * @param {string} input Free text, e.g. "tengo pollo, tomates y cebolla"
 * @returns {Array<
 *   | { raw: string, normalized: string, matched: true, ambiguous: false }
 *   | { raw: string, matched: true, ambiguous: true, candidates: { normalized: string, label: string }[] }
 *   | { raw: string, normalized: string, matched: false, ambiguous: false }
 * >}
 */
export function normalizePantryInput(input) {
  const text = String(input ?? "").trim();
  if (!text) return [];

  const catalogIndex = getCatalogIndex();

  return splitIntoTokens(text).map((raw) => {
    const words = significantWords(raw);
    const matches = findCatalogMatches(words, catalogIndex);

    if (matches.length === 1) {
      return { raw, normalized: toKey(matches[0].words), matched: true, ambiguous: false };
    }
    if (matches.length > 1) {
      // Several equally-good catalog ingredients (e.g. "pechuga" matches both
      // "Pechuga de pollo" and "Pechuga de pavo") — let the user pick instead
      // of guessing.
      return {
        raw,
        matched: true,
        ambiguous: true,
        candidates: matches.map((m) => ({ normalized: toKey(m.words), label: m.name })),
      };
    }
    // No catalog match: still return a normalized key (for display/storage)
    // built from the user's own words, since ingredient_normalized is
    // NOT NULL in user_pantry regardless of whether it matched anything.
    return { raw, normalized: toKey(words) || raw.toLowerCase(), matched: false, ambiguous: false };
  });
}
