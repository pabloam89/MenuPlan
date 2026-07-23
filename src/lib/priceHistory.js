import { RECIPES_BY_ID } from "../data/recipes.js";
import { recipeCatalog } from "../data/recipeCatalog.js";
import { normalizeName, guessShoppingAisle } from "./ingredientCategories.js";

// ── Canonical ingredient dictionary ──────────────────────────────────────
// The universe of ingredients we can attribute a price to is (mostly) the set
// of ingredient names used across the REAL recipe catalog (recipeCatalog.js —
// the ~250-recipe bundled/remote catalog also used by the planner, shopping
// list and pantry input matcher in normalizePantryInput.js).
//
// IMPORTANT: this used to read from RECIPES_BY_ID (data/recipes.js), which is
// a tiny ~30-recipe legacy seed catalog kept around for early demo/dev code —
// it doesn't even contain "leche". That silently starved the receipt wizard's
// matching of ~90% of real ingredients ("leche", cuts of meat, fruit...),
// making almost every real ticket line fall to "no lo tenemos identificado"
// even though the exact same ingredient matches fine in "En casa" (which
// correctly reads recipeCatalog.js via normalizePantryInput.js). We still
// merge in RECIPES_BY_ID on top for recipes registered at runtime only
// (AI-generated menus, user's own recipes) that never make it into the static
// catalog, plus a small curated list of common supermarket products (meat/fish
// cuts, milk fat variants, extra fruits...) that aren't literally used as an
// ingredient by any recipe yet, but are still real, nameable pantry items.
//
// The id is the normalized name so it's stable across catalog reorderings and
// human-readable in the stored blob. Built lazily and memoized.
let _dictCache = null;
let _dictSize = 0;

// Curated extras: real supermarket products that either (a) aren't used by
// any recipe yet, so they'd never make it into the catalog-derived dictionary
// above, or (b) exist in the catalog only in a generic form ("leche",
// "chuletas de cerdo") that loses a distinction shoppers care about (fat
// content, specific cut). Keeping this list short and high-value rather than
// exhaustive — it grows over time as real tickets surface more misses.
// Variant "families": a single base ingredient (already in the catalog,
// e.g. "Leche", "Atún") that real shoppers buy in a handful of well-known
// sub-variants the catalog's generic ingredient name doesn't distinguish.
// Modelled as base + modifiers instead of one hand-written flat string per
// combination, so adding a new variant is a one-line change, the full cross
// product is never missing an obvious combo, and a future per-ingredient
// nutrition layer (see priceHistory.test.js discussion re: milk fat / tuna
// oil affecting macros) has one natural place to hang that data on later —
// none of that exists today, so for now this ONLY feeds the receipt/pantry
// matching dictionary and price-tracking granularity, not any macro math.
const VARIANT_INGREDIENTS = [
  { base: "Leche", modifiers: ["entera", "semidesnatada", "desnatada", "sin lactosa"] },
  { base: "Yogur", modifiers: ["griego", "desnatado"] },
  { base: "Queso", modifiers: ["semicurado", "curado", "tierno", "fresco", "rallado", "en lonchas", "parmesano"] },
  {
    // "Atún claro" (light/skipjack tuna) is how most cans are actually
    // labelled, on top of how it's packed — hence the extra prefix axis
    // rather than a second flat base.
    base: "Atún",
    prefixes: ["", "claro "],
    modifiers: ["al natural", "en aceite de oliva", "en aceite de girasol"],
  },
  // Deliberate, scoped pass (2026-07-23): not an audit of every ingredient in
  // the catalog (most produce/spices genuinely have no shopper-meaningful
  // variety), just the handful of staple categories where the real world
  // reliably has a well-known, ticket-common sub-type — the same shape of gap
  // that kept surfacing on real/synthetic receipts for leche/queso/atún/aceite.
  { base: "Arroz", modifiers: ["bomba", "redondo", "basmati", "integral", "vaporizado", "salvaje"] },
  { base: "Sal", modifiers: ["fina", "gruesa", "marina", "en escamas", "yodada"] },
  { base: "Harina", modifiers: ["de trigo", "integral", "de repostería", "de fuerza", "de maíz"] },
  { base: "Aceitunas", modifiers: ["verdes", "negras", "rellenas de anchoa", "sin hueso"] },
  // Same "claro/en aceite/al natural" canned-fish pattern as atún, for the
  // other two canned fish that show up constantly on real tickets.
  { base: "Sardinas", modifiers: ["en aceite de oliva", "en aceite de girasol", "en tomate"] },
  { base: "Caballa", modifiers: ["en aceite de oliva", "en tomate"] },
];

function expandVariants(families) {
  const out = [];
  for (const { base, modifiers, prefixes = [""] } of families) {
    for (const prefix of prefixes) {
      for (const mod of modifiers) {
        out.push(`${base} ${prefix}${mod}`.replace(/\s+/g, " ").trim());
      }
    }
  }
  return out;
}

const SUPPLEMENTAL_INGREDIENTS = [
  ...expandVariants(VARIANT_INGREDIENTS),
  "Requesón",
  // Bottled water and olive oil grades: extremely common ticket lines with
  // no recipe to hang off of (nobody lists "agua mineral" as a recipe
  // ingredient), and "aceite de oliva" alone doesn't distinguish the grade
  // almost every ticket actually prints ("virgen extra").
  "Agua mineral",
  "Agua con gas",
  "Aceite de oliva virgen extra",
  "Aceite de oliva virgen",
  "Aceite de oliva suave",
  "Aceite de girasol",
  // Pork cuts.
  "Chuleta de aguja de cerdo",
  "Chuleta de lomo de cerdo",
  "Chuletón de cerdo",
  "Presa ibérica",
  "Pluma ibérica",
  "Careta de cerdo",
  "Codillo de cerdo",
  "Panceta de cerdo",
  // Beef/veal cuts.
  "Chuleta de ternera",
  "Chuletón de ternera",
  "Entraña de ternera",
  "Solomillo de ternera",
  "Filete de ternera",
  "Aguja de ternera",
  "Falda de ternera",
  "Rabo de ternera",
  // Lamb.
  "Chuletas de cordero",
  "Pierna de cordero",
  "Paletilla de cordero",
  // Fish cuts.
  "Filete de bacalao",
  "Lomo de bacalao",
  "Lenguado",
  "Filete de lenguado",
  "Rodajas de merluza",
  // Extra fruit not yet used by any recipe (audit gap: fruit is
  // under-represented in the catalog outside the new desayunos/postres).
  "Arándanos",
  "Frambuesas",
  "Moras",
  "Cerezas",
  "Pera",
  "Kiwi",
  "Melocotón",
  "Ciruelas",
  "Sandía",
  "Mandarina",
  "Piña",
  "Mango",
  "Granada",
  "Higos",
  // Ready-to-eat fridge desserts with NO backing recipe at all (unlike
  // Natillas/Flan/Arroz con leche, which are tagged via `productAliases` on
  // their actual recipe in postres.json — see recipeSchema.js). These two
  // have no homemade-recipe counterpart in the catalog, so they can only
  // ever live here.
  "Mousse de chocolate",
  "Cuajada",
  "Mochi",
  // Coffee: never a recipe ingredient (it's a drink, not a dish component),
  // so it would never appear here otherwise — same blind spot as "agua".
  "Café molido",
  "Café en grano",
  "Café soluble",
  "Cápsulas de café",
  // Pasta shapes the catalog doesn't already cover via a real recipe
  // ingredient (Espaguetis/Macarrones/Fideos/Tallarines already exist from
  // pasta_arroces.json — see the audit in conversation 2026-07-23).
  "Fideos",
  "Penne",
  "Tirabuzones",
  "Lacitos",
  // Tinned legumes are usually rung up as "de bote", not "cocidos" (the
  // wording every legumbre recipe actually uses) — same product, different
  // ticket phrasing, so it needs its own dictionary entry rather than a
  // fuzzy hope that "bote" and "cocidos" look alike.
  "Garbanzos de bote",
  "Lentejas de bote",
  "Alubias de bote",
  // Genuinely rare/exotic — no recipe uses these yet, kept here just so a
  // ticket line resolves to the real thing instead of a random near-miss
  // (see "PITAYA ROJA" matching "Pimiento rojo" in conversation 2026-07-23).
  "Pitaya",
  "Carne de ciervo",
  // Bottled sauces/condiments: only "Salsa de soja" and "Mayonesa" existed as
  // real recipe ingredients, so anything else in the same aisle (a very
  // common ticket category) had nothing to land on except a weak, low-
  // confidence guess — see "SALSA SRIRACHA CONCENT." matching "Sal" before
  // the whole-word boost fix, and still only a 0.4-confidence "Salsa de
  // soja" guess after it (conversation 2026-07-23).
  "Salsa sriracha",
  "Salsa picante",
  "Salsa barbacoa",
  "Kétchup",
  "Alioli",
  // Fresh/specialty pasta: still a raw, home-cooked staple (you boil it
  // yourself, so `kind` is correctly "food" not "prefab"), but a
  // manufactured, flavoured/coloured product in its own right — matching it
  // to the base seasoning ingredient it's flavoured with ("Tinta de
  // calamar", the actual squid-ink condiment used in arroz negro) is a
  // completely different real-world product at a completely different price
  // point. Same "canonical + variety" gap as the staples above, just for a
  // manufactured good instead of a raw commodity.
  "Pasta con tinta de calamar",
  "Pasta fresca",
];

export function ingredientIdFor(name) {
  return normalizeName(name);
}

function collectInto(map, ingredients) {
  for (const ing of ingredients ?? []) {
    const key = ingredientIdFor(ing.name);
    if (key && !map.has(key)) map.set(key, ing.name);
  }
}

// Some dishes are, in real life, bought ready-made far more often than
// cooked from scratch (Natillas, Gazpacho, Hummus...) — see `productAliases`
// in recipeSchema.js. Their own ingredient list (leche/huevo/azúcar,
// tomate/pan/ajo...) never contains the finished product's own name, so the
// store-bought version would never match anything without this.
function collectAliasesInto(map, recipe) {
  for (const alias of recipe?.productAliases ?? []) {
    const key = ingredientIdFor(alias);
    if (key && !map.has(key)) map.set(key, alias);
  }
}

export function ingredientDictionary() {
  const runtimeIds = Object.keys(RECIPES_BY_ID);
  // Cheap combined cache key: catalog is static per session (loaded once at
  // import), runtime ids only grow as recipes get registered.
  const sizeKey = recipeCatalog.length * 100000 + runtimeIds.length;
  if (_dictCache && _dictSize === sizeKey) return _dictCache;
  const map = new Map(); // id -> display name (first seen wins)
  for (const recipe of recipeCatalog) {
    collectInto(map, recipe?.ingredients);
    collectAliasesInto(map, recipe);
  }
  for (const id of runtimeIds) {
    collectInto(map, RECIPES_BY_ID[id]?.ingredients);
    collectAliasesInto(map, RECIPES_BY_ID[id]);
  }
  for (const name of SUPPLEMENTAL_INGREDIENTS) {
    const key = ingredientIdFor(name);
    if (key && !map.has(key)) map.set(key, name);
  }
  _dictCache = Array.from(map.entries()).map(([id, name]) => ({
    id,
    name,
    tokens: tokenize(id),
  }));
  _dictSize = sizeKey;
  return _dictCache;
}

// Very small Spanish singularizer — just enough for token-overlap matching to
// treat "chuletas"/"chuleta", "tomates"/"tomate" as the same word. Doesn't
// need to be linguistically perfect, only consistent between dictionary
// tokens and ticket-line tokens.
function singularize(w) {
  if (w.length > 4 && w.endsWith("es")) return w.slice(0, -2);
  if (w.length > 3 && w.endsWith("s")) return w.slice(0, -1);
  return w;
}

function tokenize(s) {
  return new Set(
    normalizeName(s)
      .split(/\s+/)
      .filter((t) => t.length > 2)
      .map(singularize),
  );
}

// Strips trailing/embedded quantity-and-unit noise from an OCR'd product
// name ("ARANDANO 500 GR" -> "ARANDANO", "LECHE 1L" -> "LECHE") so it doesn't
// dilute name matching, and so the cleaned name is what the user edits/sees
// as the product identity — the quantity itself already lives in the line's
// own qty/unit fields and is handled on the next (coincidencias) step.
const QTY_NOISE_RE =
  // "grs?"/"gramos?" cover "500 GR"/"500 GRAMOS", but a bare "g" with no "r"
  // ("500g", no space) needs its own alternative — it used to fall through
  // this whole regex untouched, leaving the weight stuck in the product name.
  /\b\d+([.,]\d+)?\s*(kgs?|grs?|gramos?|g|mls?|cls?|litros?|l|ud[s]?|uds?|unid(ades)?|paq(uete)?|x\s?\d+)\b\.?/gi;

// Bare pack-count / pack-code suffixes that (unlike QTY_NOISE_RE above) have
// no leading quantity digit to anchor on — "NATILLA VAINILLA X 4" (4 units,
// the "X" comes first) or "ATUN CLARO OLIVA PK6" (a supermarket pack code).
// Neither carries product-identity information, just noise the same way
// "500 GR" is. The optional trailing `uds?` handles "(x6uds)" glued with no
// space — QTY_NOISE_RE can't reach it either, since its own `\b\d+` requires
// a boundary BEFORE the digit, which "x6" doesn't have (x and 6 are both
// word chars, so there's no boundary between them).
const PACK_CODE_RE = /\b(?:x\s?\d{1,3}(?:\s?uds?)?|pk\s?\d{1,3}|pack\s?\d{1,3})\b\.?/gi;

export function stripQtyNoise(text) {
  return String(text ?? "")
    .replace(QTY_NOISE_RE, " ")
    .replace(PACK_CODE_RE, " ")
    // Whatever punctuation is left at this point is leftover ticket noise —
    // a trailing abbreviation dot ("VIRG.", "EXT."), parentheses left empty
    // once the pack code inside them is gone, stray commas — never part of
    // the product identity. Drop it before tokens get compared to the
    // dictionary, where a literal "virg." never equals "virgen" and "sopa,"
    // never equals "sopa". (Real decimal points like "1.5L" are already
    // consumed above, by QTY_NOISE_RE itself, so this can't touch those.)
    .replace(/[().,;:]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Small connector words that should stay lowercase mid-name ("Chuleta de
// aguja", not "Chuleta De Aguja").
const LOWERCASE_WORDS = new Set(["de", "del", "la", "el", "los", "las", "y", "en", "con", "sin", "al", "a"]);

// Ticket OCR frequently comes back SHOUTING IN ALL CAPS (thermal-printer
// receipts are often printed that way). A matched ingredient always displays
// its clean dictionary name ("Nata", "Pollo"...), but an unmatched line fell
// back to the raw ticket text verbatim, so the "Aclara productos" step showed
// a jarring mix of nicely-cased and ALL-CAPS rows. Normalizes to a sane Title
// Case instead, purely for display/editing — matching itself already works
// on the case-insensitive normalized form.
export function toDisplayCase(text) {
  const cleaned = String(text ?? "")
    .trim()
    .replace(/\.+$/, ""); // drop a trailing OCR abbreviation dot ("HACE.")
  if (!cleaned) return cleaned;
  return cleaned
    .toLowerCase()
    .split(/\s+/)
    .map((word, i) => (i > 0 && LOWERCASE_WORDS.has(word) ? word : word.charAt(0).toUpperCase() + word.slice(1)))
    .join(" ");
}

// Tickets abbreviate a handful of very common qualifiers ("SEMI", "DESN")
// that change WHICH product it is (fat content is not a minor detail for a
// lot of shoppers) but that the tokenizer would otherwise just discard as
// unrelated noise. Expanding them onto the full word lets a generic dictionary
// entry ("Leche") lose to a more specific one ("Leche semidesnatada") when
// both exist, without resorting to broad prefix-matching (which would risk
// false positives like "salmón" vs "salmonete").
const ABBREVIATION_EXPANSIONS = [
  [/\bsemi\b/g, "semidesnatada"],
  [/\bdes(n|nat)?\b/g, "desnatada"],
  // "ACEITE VIRG. EXT." → olive oil tickets almost always abbreviate
  // "virgen extra" down to these two truncated words (and often never even
  // print "oliva" at all), so without expanding them the line shares zero
  // meaningful tokens with any olive-oil dictionary entry.
  [/\bvirg\b/g, "virgen"],
  [/\bext\b/g, "extra"],
];

export function expandAbbreviations(norm) {
  let out = norm;
  for (const [re, full] of ABBREVIATION_EXPANSIONS) out = out.replace(re, full);
  return out;
}

// Plain Levenshtein edit distance, used only to tolerate the odd 1-letter OCR
// misread ("ATÚN" scanned as "ATON" — the accented Ú is a common miss) so a
// near-identical word still counts as the same token. Kept conservative:
// only applied to words of 4+ letters, with a stricter budget for shorter
// ones, so it doesn't start conflating genuinely different short words
// ("sal"/"sol") — see tokensNear.
function levenshtein(a, b) {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp = new Array(n + 1);
  for (let j = 0; j <= n; j++) dp[j] = j;
  for (let i = 1; i <= m; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j];
      dp[j] = a[i - 1] === b[j - 1] ? prev : 1 + Math.min(prev, dp[j], dp[j - 1]);
      prev = tmp;
    }
  }
  return dp[n];
}

function tokensNear(a, b) {
  if (a === b) return true;
  const maxLen = Math.max(a.length, b.length);
  const lenDiff = Math.abs(a.length - b.length);
  if (maxLen < 4) return false;
  // Short/medium words (under 7 letters) only tolerate a same-length
  // substitution — the shape of a real OCR misread ("ATON" for "ATÚN", one
  // glyph swapped for a similar-looking one). Allowing a length difference
  // here too is how "AGUA" (water) ended up fuzzy-matching "AGUJA" (a beef
  // cut) — one Levenshtein edit apart, but two real, unrelated Spanish
  // words, not a typo of each other. Longer words (7+) still tolerate a
  // 1-letter insertion/deletion, where the odds of an accidental collision
  // between two genuinely different words are much lower.
  if (maxLen < 7) return lenDiff === 0 && levenshtein(a, b) <= 1;
  if (lenDiff > 1) return false;
  return levenshtein(a, b) <= 2;
}

// Dice coefficient (2·hit / (|a|+|b|)) instead of hit/max(|a|,|b|). The old
// max-based formula divided by whichever side had MORE words — which meant a
// receipt line padded with brand/cut noise the OCR can't help but capture
// ("PASTA ESPAGUETI HACE. 500g" → hace is a truncated "Hacendado") tanked the
// score even when the dictionary term ("Espaguetis", 1 token) was fully
// present: hit=1, max(3,1)=3 → 0.33, below the 0.4 gate, so a perfectly
// findable ingredient silently became "no lo tenemos identificado" with zero
// suggestions. Dice still grows with how much of the (usually short) dict
// term is covered, but no longer collapses just because the ticket line is
// long — same example now scores 2·1/(3+1) = 0.5, clearing the gate.
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

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Whether `needle` appears in `haystack` as a whole word/phrase — bounded by
// spaces or the string edges, not just anywhere inside a longer word. Plain
// `.includes()` doesn't know the difference between "leche" prefixing "leche
// entera" (a real, meaningful containment) and "sal" prefixing "salchichas"
// (three letters that happen to line up, but a completely unrelated
// product). The latter used to earn "Sal" a free 0.75-confidence "auto"
// match on any sausage/sauce/salmon line that didn't already have a better
// dictionary entry to beat it with.
function containsWholePhrase(haystack, needle) {
  if (!needle) return false;
  return new RegExp(`(?:^|\\s)${escapeRegExp(needle)}(?:\\s|$)`).test(haystack);
}

/**
 * Match a raw receipt/manual line to a canonical ingredient.
 * Returns { ingredientId, name, confidence } — confidence 0..1.
 * Aliases (previously confirmed by the user) always win with confidence 1.
 */
export function matchReceiptLine(rawName, dict = ingredientDictionary(), aliases = {}) {
  const norm = expandAbbreviations(normalizeName(stripQtyNoise(rawName)));
  if (!norm) return { ingredientId: null, name: null, confidence: 0 };

  const aliasId = aliases[norm];
  if (aliasId) {
    const hit = dict.find((d) => d.id === aliasId);
    return { ingredientId: aliasId, name: hit?.name ?? rawName, confidence: 1 };
  }

  // Exact normalized match.
  const exact = dict.find((d) => d.id === norm);
  if (exact) return { ingredientId: exact.id, name: exact.name, confidence: 1 };

  // Fuzzy: best token overlap, with a small boost when one whole-word
  // contains the other (e.g. "Leche" inside "leche entera pascual").
  const lineTokens = tokenize(norm);
  let best = null;
  let bestScore = 0;
  for (const d of dict) {
    let score = tokenOverlap(lineTokens, d.tokens);
    if (containsWholePhrase(norm, d.id) || containsWholePhrase(d.id, norm)) score = Math.max(score, 0.75);
    // On a tie, prefer the more specific (more-token) entry — e.g. "Queso
    // semicurado" over generic "Queso" when both fully cover the line —
    // instead of whichever happened to iterate first.
    if (score > bestScore || (score === bestScore && score > 0 && d.tokens.size > (best?.tokens.size ?? 0))) {
      bestScore = score;
      best = d;
    }
  }
  if (best && bestScore >= 0.4) {
    return { ingredientId: best.id, name: best.name, confidence: Math.min(0.95, bestScore) };
  }
  return { ingredientId: null, name: null, confidence: 0 };
}

/**
 * A parsed receipt line is "auto" (>=0.7 — trust the match, skip clarifying)
 * or "pending" (anything less, including no match — ask the user in the
 * "Aclara productos" step).
 */
export function classifyConfidence(confidence) {
  return confidence >= 0.7 ? "auto" : "pending";
}

// ── Aggregations for the Gasto view ──────────────────────────────────────

export function unitPrice(o) {
  const qty = Number(o?.qty) || 0;
  const price = Number(o?.price) || 0;
  return qty > 0 ? price / qty : price;
}

export function monthKey(iso) {
  const d = iso ? new Date(iso) : new Date();
  if (isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function totalSpend(obs = []) {
  return round2(obs.reduce((s, o) => s + (Number(o.price) || 0), 0));
}

/** [{ month:"2026-07", total }] sorted ascending. */
export function spendByMonth(obs = []) {
  const m = new Map();
  for (const o of obs) {
    const k = monthKey(o.purchasedAt);
    if (!k) continue;
    m.set(k, (m.get(k) ?? 0) + (Number(o.price) || 0));
  }
  return Array.from(m.entries())
    .map(([month, total]) => ({ month, total: round2(total) }))
    .sort((a, b) => a.month.localeCompare(b.month));
}

/** [{ aisle, total }] sorted by spend desc. */
export function spendByAisle(obs = []) {
  const m = new Map();
  for (const o of obs) {
    const aisle = o.name ? guessShoppingAisle(o.name) : "Otros";
    m.set(aisle, (m.get(aisle) ?? 0) + (Number(o.price) || 0));
  }
  return Array.from(m.entries())
    .map(([aisle, total]) => ({ aisle, total: round2(total) }))
    .sort((a, b) => b.total - a.total);
}

const UNIT_LABEL = {
  ud: "ud", g: "g", kg: "kg", ml: "ml", cl: "cl", l: "L",
  bote: "bote", lata: "lata", paquete: "paquete", bolsa: "bolsa",
  brick: "brick", pack: "pack", docena: "docena", sobre: "sobre",
};

/** Human measure for one observation, e.g. "1 ud", "2 bote · 50 cl", "500 g". */
export function measureLabel(o) {
  const q = Number(o?.qty) > 0 ? Number(o.qty) : 1;
  const u = UNIT_LABEL[o?.unit] ?? o?.unit ?? "ud";
  let s = `${q} ${u}`;
  if (Number(o?.sizeQty) > 0 && o?.sizeUnit) {
    const su = UNIT_LABEL[o.sizeUnit] ?? o.sizeUnit;
    s += ` · ${o.sizeQty} ${su}`;
  }
  return s;
}

/**
 * Per-aisle breakdown for the expandable rows: one line per observation with its
 * measure + amount, so a chevron can reveal exactly what was bought.
 * { [aisle]: [{ id, name, measure, total }] } sorted by spend desc.
 */
export function spendByAisleDetail(obs = []) {
  const byAisle = {};
  for (const o of obs) {
    const aisle = o.name ? guessShoppingAisle(o.name) : "Otros";
    (byAisle[aisle] ??= []).push({
      id: o.id,
      name: o.name || "Otros",
      measure: measureLabel(o),
      total: round2(Number(o.price) || 0),
    });
  }
  for (const k of Object.keys(byAisle)) byAisle[k].sort((a, b) => b.total - a.total);
  return byAisle;
}

/** Median unit price for one ingredient (optionally a specific unit). */
export function medianUnitPrice(obs = [], ingredientId, unit = null) {
  const vals = obs
    .filter((o) => o.ingredientId === ingredientId && (unit == null || o.unit === unit))
    .map(unitPrice)
    .filter((v) => v > 0)
    .sort((a, b) => a - b);
  if (vals.length === 0) return null;
  const mid = Math.floor(vals.length / 2);
  return vals.length % 2 ? vals[mid] : (vals[mid - 1] + vals[mid]) / 2;
}

// Unit → base-unit conversion so prices are only ever combined within the same
// physical family (mass/volume/count). Anything not listed (ud, bote, lata…) is
// treated as a countable unit.
const UNIT_BASE = {
  g: { family: "mass", k: 1 },
  kg: { family: "mass", k: 1000 },
  ml: { family: "vol", k: 1 },
  cl: { family: "vol", k: 10 },
  l: { family: "vol", k: 1000 },
};

function toBase(qty, unit) {
  const u = String(unit ?? "ud").toLowerCase();
  const meta = UNIT_BASE[u];
  const n = Number(qty) || 0;
  return meta ? { value: n * meta.k, family: meta.family } : { value: n, family: "count" };
}

// Effective quantity of one observation in base units, honouring the compound
// "2 botes de 50 cl" reading (count × pack size) when present.
function obsBaseQty(o) {
  if (Number(o?.sizeQty) > 0 && o?.sizeUnit) {
    const b = toBase(o.sizeQty, o.sizeUnit);
    return { value: (Number(o.qty) || 1) * b.value, family: b.family };
  }
  return toBase(o?.qty, o?.unit);
}

/**
 * Median price-per-base-unit for an ingredient within a physical family, built
 * ONLY from the user's own observations (uploaded/entered) — nothing inferred.
 */
export function basePricePerUnit(obs = [], ingredientId, family) {
  const vals = [];
  for (const o of obs) {
    if (o.ingredientId !== ingredientId) continue;
    const b = obsBaseQty(o);
    if (b.family !== family || !(b.value > 0)) continue;
    const price = Number(o.price) || 0;
    if (price > 0) vals.push(price / b.value);
  }
  if (vals.length === 0) return null;
  vals.sort((a, b) => a - b);
  const mid = Math.floor(vals.length / 2);
  return vals.length % 2 ? vals[mid] : (vals[mid - 1] + vals[mid]) / 2;
}

/**
 * Estimate what a set of shopping items would cost, using ONLY prices the user
 * has actually recorded, and only where the units are compatible (no cross-unit
 * inference like €/ud × ml). Returns { total, matched, count }.
 */
export function estimateListCost(items = [], obs = []) {
  let total = 0;
  let matched = 0;
  for (const it of items) {
    const id = ingredientIdFor(it.name);
    const b = toBase(it.qty, it.unit);
    if (!(b.value > 0)) continue;
    const ppu = basePricePerUnit(obs, id, b.family);
    if (ppu == null) continue;
    total += ppu * b.value;
    matched++;
  }
  return { total: round2(total), matched, count: items.length };
}

// ── Period / store / time-series aggregations for the richer Gasto view ───

const DAY_MS = 24 * 60 * 60 * 1000;
export const WEEKDAY_LABELS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

function tsOf(o) {
  const t = o?.purchasedAt ? new Date(o.purchasedAt).getTime() : o?.createdAt;
  return typeof t === "number" && !isNaN(t) ? t : NaN;
}

/** Keep only records purchased within the last `days` days (null/"all" → all). */
export function filterByDays(records = [], days = null) {
  if (!days || days === "all") return records;
  const n = Number(days);
  if (!(n > 0)) return records;
  const cutoff = Date.now() - n * DAY_MS;
  return records.filter((r) => {
    const t = tsOf(r);
    return isNaN(t) || t >= cutoff; // keep undated rows rather than hide spend
  });
}

// Shared "fecha" bucket vocabulary + matcher for any single-item date filter
// (as opposed to filterByDays/filterByRange above, which filter a whole
// array at once) — used by both Pantry's "Fecha de compra" filter and the
// Gasto "Histórico" ticket filter, so the two read identically instead of
// drifting into two subtly different pickers.
export const DATE_BUCKET_OPTIONS = [
  ["all", "Todas"],
  ["today", "Último día"],
  ["3d", "Últimos 3 días"],
  ["week", "Última semana"],
  ["month", "Último mes"],
  ["older", "+1 mes"],
];

// `custom` ignores the bucket entirely and checks an explicit from/to range
// instead (both plain "yyyy-mm-dd" strings from <input type="date">).
export function matchesDateBucket(iso, filter, customRange) {
  if (filter === "all") return true;
  if (filter === "custom") {
    if (!iso || !customRange?.from) return false;
    const t = new Date(iso).getTime();
    const from = new Date(`${customRange.from}T00:00:00`).getTime();
    const to = customRange.to ? new Date(`${customRange.to}T23:59:59`).getTime() : Date.now();
    return t >= from && t <= to;
  }
  if (!iso) return filter === "older";
  const days = (Date.now() - new Date(iso).getTime()) / 86400000;
  if (filter === "today") return days <= 1;
  if (filter === "3d") return days <= 3;
  if (filter === "week") return days <= 7;
  if (filter === "month") return days <= 30;
  return days > 30;
}

/**
 * Keep only records within an explicit [from, to] calendar-date range (both
 * plain "yyyy-mm-dd" strings from <input type="date">, `to` optional →
 * defaults to now). Companion to filterByDays for the "Fechas" ad-hoc option
 * in the Gasto period picker.
 */
export function filterByRange(records = [], from = null, to = null) {
  if (!from) return records;
  const fromMs = new Date(`${from}T00:00:00`).getTime();
  const toMs = to ? new Date(`${to}T23:59:59`).getTime() : Date.now();
  return records.filter((r) => {
    const t = tsOf(r);
    return isNaN(t) || (t >= fromMs && t <= toMs); // keep undated rows rather than hide spend
  });
}

/** [{ store, total, count }] desc by total; missing store → "Sin súper". */
export function spendByStore(obs = []) {
  const m = new Map();
  for (const o of obs) {
    const store = o.store?.trim() || "Sin súper";
    const cur = m.get(store) ?? { total: 0, count: 0 };
    cur.total += Number(o.price) || 0;
    cur.count += 1;
    m.set(store, cur);
  }
  return Array.from(m.entries())
    .map(([store, v]) => ({ store, total: round2(v.total), count: v.count }))
    .sort((a, b) => b.total - a.total);
}

function startOfWeek(d) {
  const x = new Date(d);
  const dow = (x.getDay() + 6) % 7; // Monday = 0
  x.setDate(x.getDate() - dow);
  x.setHours(0, 0, 0, 0);
  return x;
}

/**
 * Spend bucketed over time. granularity: "day" | "week" | "month".
 * Returns [{ key, label, total }] ascending by time.
 */
export function spendOverTime(obs = [], granularity = "month") {
  const m = new Map(); // key -> { total, label }
  for (const o of obs) {
    const d = o.purchasedAt ? new Date(o.purchasedAt) : null;
    if (!d || isNaN(d.getTime())) continue;
    let key;
    let label;
    if (granularity === "day") {
      key = d.toISOString().slice(0, 10);
      label = d.toLocaleDateString("es-ES", { day: "numeric", month: "short" });
    } else if (granularity === "week") {
      const wk = startOfWeek(d);
      key = wk.toISOString().slice(0, 10);
      label = wk.toLocaleDateString("es-ES", { day: "numeric", month: "short" });
    } else {
      key = monthKey(d.toISOString());
      const [y, mo] = key.split("-");
      label = new Date(Number(y), Number(mo) - 1, 1).toLocaleDateString("es-ES", { month: "short" });
    }
    const cur = m.get(key) ?? { total: 0, label };
    cur.total += Number(o.price) || 0;
    m.set(key, cur);
  }
  return Array.from(m.entries())
    .map(([key, v]) => ({ key, label: v.label, total: round2(v.total) }))
    .sort((a, b) => a.key.localeCompare(b.key));
}

/**
 * Headline habits used by the "Hábitos de gasto" card: totals, ticket average
 * and the leading store / category / weekday, all from the user's own data.
 */
export function spendStats(obs = [], receipts = []) {
  const total = totalSpend(obs);
  const ticketCount = receipts.length;
  const receiptSum = receipts.reduce((s, r) => s + (Number(r.total) || 0), 0);
  const avgTicket = ticketCount > 0 ? round2(receiptSum / ticketCount) : 0;
  const byStore = spendByStore(obs);
  const byAisle = spendByAisle(obs);

  // "Which weekday do you spend most on" turned out to be a dead stat — it's
  // mostly just "whichever day you happen to do the big weekly shop", not an
  // actual habit. "Más comprado" (the ingredient you've bought the most
  // separate times) is a more genuinely interesting one: it's the closest
  // thing to "your staple".
  const freq = new Map();
  for (const o of obs) {
    const key = o.name?.trim();
    if (!key) continue;
    freq.set(key, (freq.get(key) ?? 0) + 1);
  }
  let topIngredient = null;
  let topFreqVal = 0;
  for (const [name, count] of freq) {
    if (count > topFreqVal) {
      topFreqVal = count;
      topIngredient = { name, count };
    }
  }

  // "Gastado" (total) counts every recorded price, tickets AND manual
  // entries added without a ticket (e.g. from "Añadir gasto"). "Media por
  // ticket" only ever looks at actual uploaded receipts. The two numbers can
  // legitimately disagree — 1 ticket for 38€ plus a manual 3€ entry gives
  // "Gastado: 41€" — so we surface the gap explicitly instead of leaving it
  // looking like a bug.
  const manualTotal = Math.max(0, round2(total - receiptSum));

  return {
    total,
    ticketCount,
    avgTicket,
    manualTotal,
    itemCount: obs.length,
    topStore: byStore[0] ?? null,
    topAisle: byAisle[0] ?? null,
    topIngredient,
  };
}

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

export function formatEuro(n) {
  const v = Number(n) || 0;
  return `${v.toFixed(2).replace(".", ",")} €`;
}

/** Whole-euro formatting (no decimals) for headline numbers. */
export function formatEuro0(n) {
  return `${Math.round(Number(n) || 0)} €`;
}

/** A friendly ± range around an estimate (prices vary by store/brand). */
export function formatEuroRange(n, spread = 0.15) {
  const v = Number(n) || 0;
  if (v <= 0) return "—";
  const lo = v * (1 - spread);
  const hi = v * (1 + spread);
  return `${lo.toFixed(0)}–${hi.toFixed(0)} €`;
}
