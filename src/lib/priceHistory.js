import { RECIPES_BY_ID } from "../data/recipes.js";
import { normalizeName, guessShoppingAisle } from "./ingredientCategories.js";

// ── Canonical ingredient dictionary ──────────────────────────────────────
// The universe of ingredients we can attribute a price to is exactly the set of
// ingredient names used across the recipe catalog (+ user recipes registered
// into RECIPES_BY_ID). A receipt line like "T.TRIT HAC 400G" is matched against
// this dictionary so its price accrues to the canonical "Tomate triturado".
//
// The id is the normalized name so it's stable across catalog reorderings and
// human-readable in the stored blob. Built lazily and memoized — RECIPES_BY_ID
// is populated after the async catalog load, so we can't snapshot at import.
let _dictCache = null;
let _dictSize = 0;

export function ingredientIdFor(name) {
  return normalizeName(name);
}

export function ingredientDictionary() {
  const ids = Object.keys(RECIPES_BY_ID);
  if (_dictCache && _dictSize === ids.length) return _dictCache;
  const map = new Map(); // id -> display name (first seen wins)
  for (const id of ids) {
    const recipe = RECIPES_BY_ID[id];
    for (const ing of recipe?.ingredients ?? []) {
      const key = ingredientIdFor(ing.name);
      if (key && !map.has(key)) map.set(key, ing.name);
    }
  }
  _dictCache = Array.from(map.entries()).map(([id, name]) => ({
    id,
    name,
    tokens: tokenize(id),
  }));
  _dictSize = ids.length;
  return _dictCache;
}

function tokenize(s) {
  return new Set(
    normalizeName(s)
      .split(/\s+/)
      .filter((t) => t.length > 2),
  );
}

function tokenOverlap(a, b) {
  if (a.size === 0 || b.size === 0) return 0;
  let hit = 0;
  for (const t of a) if (b.has(t)) hit++;
  return hit / Math.max(a.size, b.size);
}

/**
 * Match a raw receipt/manual line to a canonical ingredient.
 * Returns { ingredientId, name, confidence } — confidence 0..1.
 * Aliases (previously confirmed by the user) always win with confidence 1.
 */
export function matchReceiptLine(rawName, dict = ingredientDictionary(), aliases = {}) {
  const norm = normalizeName(rawName);
  if (!norm) return { ingredientId: null, name: null, confidence: 0 };

  const aliasId = aliases[norm];
  if (aliasId) {
    const hit = dict.find((d) => d.id === aliasId);
    return { ingredientId: aliasId, name: hit?.name ?? rawName, confidence: 1 };
  }

  // Exact normalized match.
  const exact = dict.find((d) => d.id === norm);
  if (exact) return { ingredientId: exact.id, name: exact.name, confidence: 1 };

  // Fuzzy: best token overlap, with a small boost when one contains the other.
  const lineTokens = tokenize(rawName);
  let best = null;
  let bestScore = 0;
  for (const d of dict) {
    let score = tokenOverlap(lineTokens, d.tokens);
    if (d.id.includes(norm) || norm.includes(d.id)) score = Math.max(score, 0.75);
    if (score > bestScore) {
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
