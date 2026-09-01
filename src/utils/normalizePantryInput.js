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
  "de", "del", "con", "en", "a",
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

/**
 * True only if every word of `words` appears in `of` (one-directional —
 * unlike `wordsOverlapEither`, `of` being a subset of `words` does NOT
 * count). Used where a looser either-direction match would be wrong, e.g.
 * matching a dietary-adaptation shopping line ("Leche sin lactosa") against a
 * saved pantry entry: the pantry entry must itself mention the specific
 * product, not just the base ingredient — a generic "leche" pantry entry
 * shouldn't silently swallow the lactose-free line (see shoppingBuilder.js).
 */
export function isWordSubsetOf(words, of) {
  return isWordSubset(words, of);
}

let catalogIndexCache = null;

// Bare supermarket words that rarely appear as ingredient names themselves
// ("pasta" vs "Espaguetis" / "Macarrones"). When the strict word-subset
// match finds nothing, we expand these into related catalog hits and ask
// the user to pick — same "¿Cuál?" path as "queso" / "pechuga".
const CATEGORY_SEEDS = {
  pasta: ["pasta", "espagueti", "macarron", "fideo", "tallarin", "lasaña", "lasana", "ñoqui", "noqui", "noodle", "penne", "fusilli", "tortellini", "ravioli"],
  arroz: ["arroz", "risotto", "basmati", "jazmin"],
  carne: ["carne", "ternera", "cerdo", "pollo", "pavo", "cordero", "vacuno", "picada"],
  pescado: ["pescado", "merluza", "salmon", "bacalao", "atun", "gamba", "langostino"],
  queso: ["queso"],
  leche: ["leche"],
  yogur: ["yogur", "yogurt"],
  pan: ["pan", "barra", "chapata", "baguette", "molde"],
  zumo: ["zumo", "jugo"],
  aceite: ["aceite"],
  conserva: ["conserva", "enlatad", "bote", "lata"],
  encurtido: ["encurtido", "pepini", "aceituna", "pepinillo"],
  legumbre: ["lenteja", "garbanzo", "alubi", "judia", "habas", "legumbre"],
  verdura: ["verdura", "hortaliza"],
  fruta: ["fruta"],
};

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

function seedsForTokenWords(tokenWords) {
  const seeds = new Set();
  for (const w of tokenWords) {
    const base = singularize(w);
    if (CATEGORY_SEEDS[base]) {
      for (const s of CATEGORY_SEEDS[base]) seeds.add(s);
    }
    // Also allow the bare word itself as a seed so "espagueti" still finds
    // "Espaguetis" via singularization even outside CATEGORY_SEEDS keys.
    seeds.add(base);
    seeds.add(w);
  }
  return [...seeds];
}

function entryMatchesSeeds(entry, seeds) {
  return entry.words.some((w) =>
    seeds.some((s) => wordsEqual(w, s) || w.startsWith(s) || s.startsWith(w)),
  );
}

function dedupeCatalogEntries(matches) {
  const seen = new Set();
  return matches.filter((m) => {
    const key = m.words.map(singularize).join("_");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
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
  return dedupeCatalogEntries(matches);
}

// When the strict match finds nothing, expand category-ish tokens ("pasta")
// into related catalog ingredients and let the UI ask ¿Cuál?
function findRelatedCatalogMatches(tokenWords, catalogIndex) {
  if (tokenWords.length === 0) return [];
  const seeds = seedsForTokenWords(tokenWords);
  // Only fire the broad net when at least one token is a known category key
  // (or equals a seed list name) — otherwise every unmatched word would dump
  // half the catalog into a picker.
  const hasCategoryKey = tokenWords.some((w) => CATEGORY_SEEDS[singularize(w)]);
  if (!hasCategoryKey) return [];

  const matches = catalogIndex.filter((entry) => entryMatchesSeeds(entry, seeds));
  return dedupeCatalogEntries(matches).slice(0, 16);
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
    let matches = findCatalogMatches(words, catalogIndex);
    // A bare category word ("pasta", "carne"...) whose only catalog hits are
    // generic multi-word entries (e.g. a recipe just calling for "Pasta
    // corta") should still surface the full category breakdown — otherwise
    // that partial match short-circuits the search before it ever reaches
    // the specific options CATEGORY_SEEDS exists to offer. Skipped when
    // there's already an exact single-word hit ("Arroz"): that's
    // unambiguous on its own and doesn't need the broader net — and
    // skipping it matters, since the net is coarse (substring-ish) and can
    // pull in unrelated entries.
    const isExactHit = matches.length > 0 && matches[0].words.length === words.length;
    const isBareCategoryWord = words.length === 1 && Boolean(CATEGORY_SEEDS[singularize(words[0])]);
    if (matches.length === 0 || (isBareCategoryWord && !isExactHit)) {
      const related = findRelatedCatalogMatches(words, catalogIndex);
      if (related.length > 0) matches = dedupeCatalogEntries([...matches, ...related]);
    }

    if (matches.length === 1) {
      return { raw, normalized: toKey(matches[0].words), matched: true, ambiguous: false };
    }
    if (matches.length > 1) {
      // Several equally-good catalog ingredients (e.g. "pechuga" matches both
      // "Pechuga de pollo" and "Pechuga de pavo") — let the user pick instead
      // of guessing. Same for bare categories like "pasta".
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
