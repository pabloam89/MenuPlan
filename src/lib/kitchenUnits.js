import { normalizeName } from "./ingredientCategories.js";

/**
 * "Kitchen-friendly" secondary reading for an ingredient shown in grams/ml.
 *
 * The recipe catalog stores everything in precise g/ml (those numbers feed the
 * kcal/macro calculations, so they must NOT be replaced). This module produces
 * an *approximate*, human-readable hint to show ALONGSIDE the exact amount in
 * DishDetail — e.g. "500 g · ≈ 3 muslos", "30 ml · ≈ 2 cucharadas",
 * "3 g · al gusto".
 *
 * Design rules:
 *   - Only ever a complement, never a replacement (grams stay authoritative).
 *   - Only fires for `g` / `ml` units (`ud` and qualitative units already read
 *     naturally, so they get no hint).
 *   - When nothing sensible maps, returns null — we NEVER invent a conversion.
 *
 * Three blocks, checked in this order for grams:
 *   1. Condiments (salt/pepper/herbs/spices) → "al gusto" / "pizca".
 *   2. Piece counting (meat cuts, fruit, veg) → "≈ N filetes / plátanos…", or
 *      a fraction ("≈ ½ tomate") when there's less than one whole piece.
 *   3. Dry volume (flour, sugar, rice…)       → "≈ N cucharadas / tazas".
 * For millilitres, a single liquid-volume block (spoons / cups).
 */

// ── Block 1: condiments ────────────────────────────────────────────
// Salt & pepper are the archetypal "al gusto" ingredients.
const SALT_RE = /\bsal\b|flor de sal/;
// Herbs, spices and dried aromatics: a weighed gram value ("3 g de romero")
// reads worse than the way people actually cook them. Small amounts → "pizca",
// anything bigger → "al gusto". Bare "ajo" is intentionally NOT here (it maps
// to cloves in the piece block); only "ajo en polvo" counts as a spice.
const SPICE_RE =
  /romero|tomillo|oregano|albahaca|perejil|cilantro|eneldo|hierbabuena|menta|salvia|estragon|mejorana|laurel|comino|curcuma|curry|pimenton|paprika|azafran|canela|nuez moscada|jengibre|clavo|\banis\b|hinojo|pimienta|ajo en polvo|cebolla en polvo|guindilla|cayena|chile|hierbas|especias|vainilla/;

// ── Block 2: piece weights (grams per typical piece) ───────────────
// Ingredients whose gram amount is better expressed as a count of pieces.
// Order matters: more specific patterns first (contramuslo before muslo).
// Each entry: [regex, gramsPerPiece, singular, plural].
const PIECE_WEIGHTS = [
  // Aves y carnes por pieza
  [/contramuslo/, 100, "contramuslo", "contramuslos"],
  [/muslo/, 150, "muslo", "muslos"],
  [/alita|alas de pollo/, 45, "alita", "alitas"],
  [/pechuga/, 200, "pechuga", "pechugas"],
  [/chuleta/, 150, "chuleta", "chuletas"],
  [/escalopin/, 80, "escalopín", "escalopines"],
  [/filete|cinta de lomo|lomo de cerdo|secreto|magro de cerdo/, 100, "filete", "filetes"],
  [/salchicha/, 55, "salchicha", "salchichas"],
  // Ajo → dientes (bare "ajo"; "ajo en polvo" is caught by SPICE_RE first)
  [/\bajo\b/, 5, "diente", "dientes"],
  // Fruta
  [/platano|banana/, 120, "plátano", "plátanos"],
  [/manzana/, 150, "manzana", "manzanas"],
  [/naranja/, 200, "naranja", "naranjas"],
  [/\bpera\b|peras/, 170, "pera", "peras"],
  [/aguacate/, 200, "aguacate", "aguacates"],
  [/\bkiwi\b/, 75, "kiwi", "kiwis"],
  [/\bmango\b/, 200, "mango", "mangos"],
  [/melocoton/, 150, "melocotón", "melocotones"],
  // Verdura por pieza
  [/cebolla morada/, 120, "cebolla morada", "cebollas moradas"],
  [/cebolla/, 150, "cebolla", "cebollas"],
  [/zanahoria/, 100, "zanahoria", "zanahorias"],
  [/calabacin/, 350, "calabacín", "calabacines"],
  [/berenjena/, 300, "berenjena", "berenjenas"],
  [/puerro/, 200, "puerro", "puerros"],
  [/pepino/, 200, "pepino", "pepinos"],
  [/patata grande/, 250, "patata grande", "patatas grandes"],
  [/patata/, 200, "patata", "patatas"],
  [/pimiento/, 180, "pimiento", "pimientos"],
  [/boniato/, 200, "boniato", "boniatos"],
  [/remolacha/, 120, "remolacha", "remolachas"],
  [/^tomate$|tomate maduro|tomate natural|tomate de/, 150, "tomate", "tomates"],
];

// Names that superficially match a piece pattern but are sold/used by weight,
// not by piece (minced, crushed, canned, grated, in a punnet…). Guards the
// piece block so e.g. "tomate triturado" or "carne picada" never become counts.
const SKIP_PIECE_RE =
  /triturad|frito|cherry|rallad|conserva|desalad|en polvo|molid|picad|choricero|concentrad|\bsalsa\b|cocid|troced|guisar|entero|deshidratad/;

// ── Block 3: dry-solid volume (grams) ──────────────────────────────
// [regex, gramsPerTablespoon|null, gramsPerCup|null]
const DRY_VOLUME = [
  [/harina|maicena/, 9, 120],
  [/pan rallado|panko/, 8, 110],
  [/azucar/, 12, 200],
  [/cacao/, 6, 100],
  [/copos de avena|\bavena\b/, 10, 90],
  [/\barroz\b/, null, 185],
  [/cuscus|semola/, null, 175],
];

const ML_PER_TSP = 5;
const ML_PER_TBSP = 15;
const ML_PER_CUP = 240;

function plural(n, singular, pluralForm) {
  return n === 1 ? singular : pluralForm;
}

// Rounds cups to the nearest half so "≈ 1,5 tazas" is possible but odd
// fractions aren't. Uses a comma as the decimal separator (es-ES).
function formatCups(rawCups) {
  const cups = Math.round(rawCups * 2) / 2;
  if (cups < 0.5) return null;
  const label = plural(cups, "taza", "tazas");
  const text = Number.isInteger(cups) ? String(cups) : String(cups).replace(".", ",");
  return `≈ ${text} ${label}`;
}

// Common kitchen fractions of a whole piece, for amounts smaller than one
// unit ("60 g de tomate" reads better as "≈ ½ tomate" than being dropped).
// Below the smallest one here (⅛), the amount is treated as a garnish-level
// trace that isn't worth expressing as a fraction of a piece.
const PIECE_FRACTIONS = [
  [1 / 8, "⅛"],
  [1 / 4, "¼"],
  [1 / 3, "⅓"],
  [1 / 2, "½"],
  [2 / 3, "⅔"],
  [3 / 4, "¾"],
];
const MIN_PIECE_FRACTION = 0.1;
// Above this ratio, round to a whole piece instead of forcing it into "¾".
const WHOLE_PIECE_THRESHOLD = 0.875;

function closestPieceFraction(ratio) {
  if (ratio < MIN_PIECE_FRACTION) return null;
  let best = null;
  let bestDiff = Infinity;
  for (const [value, label] of PIECE_FRACTIONS) {
    const diff = Math.abs(ratio - value);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = label;
    }
  }
  return best;
}

function pieceHint(normalized, qty) {
  if (SKIP_PIECE_RE.test(normalized)) return null;
  for (const [regex, grams, singular, pluralForm] of PIECE_WEIGHTS) {
    if (!regex.test(normalized)) continue;
    const ratio = qty / grams;
    if (ratio >= WHOLE_PIECE_THRESHOLD) {
      const n = Math.round(ratio);
      if (n > 30) return null;
      return `≈ ${n} ${plural(n, singular, pluralForm)}`;
    }
    const fraction = closestPieceFraction(ratio);
    return fraction ? `≈ ${fraction} ${singular}` : null;
  }
  return null;
}

function dryVolumeHint(normalized, qty) {
  for (const [regex, gPerTbsp, gPerCup] of DRY_VOLUME) {
    if (!regex.test(normalized)) continue;
    if (gPerTbsp && qty <= gPerTbsp * 4) {
      const n = Math.max(1, Math.round(qty / gPerTbsp));
      return `≈ ${n} ${plural(n, "cucharada", "cucharadas")}`;
    }
    if (gPerCup && qty >= gPerCup * 0.5) return formatCups(qty / gPerCup);
    return null;
  }
  return null;
}

function liquidVolumeHint(qty) {
  if (qty <= 7) return "≈ 1 cucharadita";
  if (qty < 60) {
    const n = Math.max(1, Math.round(qty / ML_PER_TBSP));
    return `≈ ${n} ${plural(n, "cucharada", "cucharadas")}`;
  }
  if (qty >= 200) return formatCups(qty / ML_PER_CUP);
  return null;
}

/**
 * @param {string} name  Ingredient display name (e.g. "Muslos de pollo").
 * @param {number|null} qty  Scaled amount in the given unit.
 * @param {string} unit  Storage unit ("g", "ml", "ud", "pizca", …).
 * @returns {string|null}  A short kitchen-friendly hint, or null when none applies.
 */
export function kitchenHint(name, qty, unit) {
  if (typeof qty !== "number" || !Number.isFinite(qty) || qty <= 0) return null;
  const normalized = normalizeName(name);

  if (unit === "g") {
    if (SALT_RE.test(normalized)) return "al gusto";
    if (SPICE_RE.test(normalized)) return qty <= 2 ? "pizca" : "al gusto";
    return pieceHint(normalized, qty) ?? dryVolumeHint(normalized, qty);
  }

  if (unit === "ml") return liquidVolumeHint(qty);

  return null;
}

// ── "Unidades" (shopping) reading ──────────────────────────────────
// Compact, buy-oriented label for the Peso/uds toggle: whole absolute counts
// for countable pieces (you buy whole onions, not "¾"), a bottle-sized volume
// in litres for liquids, and short dry-volume readings otherwise. Kept terse so
// it fits the narrow quantity column without truncation. No "≈" — it's the
// amount to put in the basket, not a cooking approximation.

// Absolute whole count of buyable pieces ("3 cebollas", "1 calabacín").
function pieceUnits(normalized, qty) {
  if (SKIP_PIECE_RE.test(normalized)) return null;
  for (const [regex, grams, singular, pluralForm] of PIECE_WEIGHTS) {
    if (!regex.test(normalized)) continue;
    const n = Math.max(1, Math.round(qty / grams));
    if (n > 40) return null; // absurd counts read better as a weight
    return `${n} ${plural(n, singular, pluralForm)}`;
  }
  return null;
}

// Short dry-volume reading ("2 tazas", "3 cdas") without the "≈".
function dryVolumeUnits(normalized, qty) {
  for (const [regex, gPerTbsp, gPerCup] of DRY_VOLUME) {
    if (!regex.test(normalized)) continue;
    if (gPerCup && qty >= gPerCup * 0.5) {
      const cups = Math.round((qty / gPerCup) * 2) / 2;
      if (cups >= 0.5) {
        const text = Number.isInteger(cups) ? String(cups) : String(cups).replace(".", ",");
        return `${text} ${plural(cups, "taza", "tazas")}`;
      }
    }
    if (gPerTbsp) {
      const n = Math.max(1, Math.round(qty / gPerTbsp));
      return `${n} ${plural(n, "cda", "cdas")}`;
    }
    return null;
  }
  return null;
}

// Liquids as a bottle/can size: litres once it's bottle-sized, ml for a splash.
function liquidUnits(qty) {
  if (qty >= 100) {
    const liters = qty / 1000;
    const text =
      liters >= 1
        ? Number.isInteger(liters)
          ? String(liters)
          : liters.toFixed(1).replace(".", ",")
        : liters.toFixed(2).replace(".", ",").replace(/0$/, "");
    return `${text} L`;
  }
  return `${Math.round(qty)} ml`;
}

/**
 * Compact human display for a stock amount stored in the canonical g/ml/ud
 * domain (despensa, recipe ingredients) — "500 g" stays as-is, but anything
 * ≥1000 g/ml reads as "1 kg"/"1,5 L" since that's how people actually buy and
 * think about bulk stock. Plain "2 ud" for piece counts.
 */
export function formatStockQty(qty, unit) {
  const n = Number(qty) || 0;
  if (unit === "racion") {
    const text = Number.isInteger(n) ? String(n) : n.toFixed(1).replace(".", ",");
    return `${text} ${n === 1 ? "ración" : "raciones"}`;
  }
  if (unit === "ud") return `${Number.isInteger(n) ? n : n.toFixed(1)} ud`;
  if (unit === "g" || unit === "ml") {
    const bigLabel = unit === "g" ? "kg" : "L";
    if (n >= 1000) {
      const big = n / 1000;
      const text = Number.isInteger(big) ? String(big) : big.toFixed(1).replace(/\.0$/, "").replace(".", ",");
      return `${text} ${bigLabel}`;
    }
    return `${Math.round(n)} ${unit}`;
  }
  return `${n}`;
}

/** Converts a friendly entry unit (kg/L) to despensa's canonical g/ml/ud + scaled qty. */
export function toCanonicalStockQty(qty, entryUnit) {
  const n = Number(qty) > 0 ? Number(qty) : 1;
  if (entryUnit === "kg") return { qty: n * 1000, unit: "g" };
  if (entryUnit === "l") return { qty: n * 1000, unit: "ml" };
  if (entryUnit === "g" || entryUnit === "ml") return { qty: n, unit: entryUnit };
  if (entryUnit === "racion") return { qty: n, unit: "racion" };
  return { qty: n, unit: "ud" };
}

/**
 * Grams-per-piece for ingredients typically bought/counted whole (a chicken
 * breast, an onion, an apple…), or null when the ingredient isn't naturally
 * piece-countable (rice, oil…) or is skipped (minced, canned, grated…).
 * Lets any weight-based amount (recipe list OR a scanned ticket line) be
 * converted to the same piece count under the "Unidades" lens.
 */
export function gramsPerPiece(name) {
  const normalized = normalizeName(name);
  if (SKIP_PIECE_RE.test(normalized)) return null;
  for (const [regex, grams] of PIECE_WEIGHTS) {
    if (regex.test(normalized)) return grams;
  }
  return null;
}

/**
 * Convert an amount between the stock/recipe unit domains, returning null when
 * there's no safe conversion (never invents one). Handles:
 *   - same unit (identity)
 *   - kg↔g and l↔ml (pure scale)
 *   - weight↔piece (g/kg ↔ ud) via gramsPerPiece for countable ingredients
 * Deliberately NOT g↔ml (would need a per-ingredient density we don't track).
 * Shared by stock decrement ("Marcar cocinado") and live pantry coverage.
 *
 * @param {number} qty
 * @param {'g'|'kg'|'ml'|'l'|'ud'} fromUnit
 * @param {'g'|'kg'|'ml'|'l'|'ud'} toUnit
 * @param {string} name  Ingredient name (for the piece-weight lookup).
 * @returns {number|null}
 */
export function convertStockAmount(qty, fromUnit, toUnit, name) {
  if (typeof qty !== "number" || !Number.isFinite(qty)) return null;
  if (fromUnit === toUnit) return qty;
  const toBase = (q, u) =>
    u === "kg" ? { q: q * 1000, u: "g" } : u === "l" ? { q: q * 1000, u: "ml" } : { q, u };
  const a = toBase(qty, fromUnit);
  const targetBase = toBase(1, toUnit).u; // g / ml / ud
  const scaleOut = (grams) => (toUnit === "kg" || toUnit === "l" ? grams / 1000 : grams);
  if (a.u === targetBase) return scaleOut(a.q);
  const gpp = gramsPerPiece(name);
  if (gpp) {
    if (a.u === "g" && targetBase === "ud") return a.q / gpp;
    if (a.u === "ud" && targetBase === "g") return scaleOut(a.q * gpp);
  }
  return null;
}

/**
 * Buy-oriented "unidades" label for the shopping/cook quantity column.
 * @returns {string|null} compact label, or null when the amount is best left
 *   as its stored g/ml/ud reading (caller falls back to displayQty).
 */
export function shoppingUnitsLabel(name, qty, unit) {
  if (typeof qty !== "number" || !Number.isFinite(qty) || qty <= 0) return null;
  const normalized = normalizeName(name);

  if (unit === "g") {
    if (SALT_RE.test(normalized)) return "al gusto";
    if (SPICE_RE.test(normalized)) return qty <= 2 ? "pizca" : "al gusto";
    return pieceUnits(normalized, qty) ?? dryVolumeUnits(normalized, qty);
  }

  if (unit === "ml") return liquidUnits(qty);

  return null;
}

/**
 * Generic countable reading for the "Cantidad" column (Pantry) and the "uds"
 * column of the shopping list, where the ingredient name is already shown in
 * its own column. Repeating it there ("3 tomates" next to a row named
 * "Tomate") is redundant — and for longer plurals ("melocotones", "pechugas")
 * it doesn't fit the narrow column. Piece counts collapse to a generic "N ud".
 *
 * Dry-volume readings (tazas/cdas) are intentionally NOT produced here: the
 * grams-per-cup constants are coarse and the result gets rounded to the nearest
 * half-cup, so "3 tazas" for 600 g of rice is only an approximation (~555 g)
 * that reads as wrong. Those weight-measured dry goods just show their exact
 * weight in the Peso column and "—" here. Salt/spice ("al gusto"/"pizca") stay.
 * @returns {string|null}
 */
export function pantryPieceCountLabel(name, qty, unit) {
  if (typeof qty !== "number" || !Number.isFinite(qty) || qty <= 0 || unit !== "g") return null;
  const normalized = normalizeName(name);
  if (SALT_RE.test(normalized)) return "al gusto";
  if (SPICE_RE.test(normalized)) return qty <= 2 ? "pizca" : "al gusto";
  if (!SKIP_PIECE_RE.test(normalized)) {
    for (const [regex, grams] of PIECE_WEIGHTS) {
      if (!regex.test(normalized)) continue;
      const n = Math.max(1, Math.round(qty / grams));
      return n > 40 ? null : `${n} ud`;
    }
  }
  return null;
}
