import {
  addPantryItems,
  addLocalPantryItems,
  setPantryItemQty,
  setLocalPantryItemQty,
} from "./pantry.js";
import { findMatchingPantryItem } from "./shoppingBuilder.js";
import { convertStockAmount } from "./kitchenUnits.js";

/** Cuándo se da por gastado lo de casa que usa el menú. */
export const PANTRY_CONSUME_MODES = ["onGenerate", "onCook", "endOfDay"];

/**
 * Modo de consumo EFECTIVO. Se pregunta en cualquier modo (sencillo incluido),
 * así que aquí no hay más que validar y caer al default seguro. Existe como
 * función única para que generación, "marcar cocinado" y el barrido diario lean
 * exactamente lo mismo: si se desincronizan, se descuenta dos veces.
 */
export function pantryConsumeMode(data) {
  const mode = data?.pantryPrefs?.consume;
  return PANTRY_CONSUME_MODES.includes(mode) ? mode : "onCook";
}

/**
 * Pure "descuenta de la despensa" math — no I/O. Given a list of ingredients
 * to consume and a pantry stock snapshot, returns the resulting stock (as a
 * plain JS array, not persisted) plus the exact per-row deltas removed. Kept
 * unit-aware via convertStockAmount (kg↔g, l↔ml, piece↔weight).
 *
 * Used both by consumeFromPantry (below, which persists the result) and by
 * the multi-week planner's "resta" bias (decisión B: cada semana ve la
 * despensa menos lo que ya "gastó" la semana anterior), which only needs the
 * in-memory projection — nunca escribe en BD.
 *
 * @param {{ name: string, qty: number, unit: string, adapted?: boolean }[]} ingredients
 * @param {{ id: string, ingredientName: string, ingredientNormalized: string, qty: number, unit: string }[]} pantryStock
 * @returns {{ workingStock: object[], deltas: { name: string, normalized: string, qty: number, unit: string }[], updatesById: Map<string, number> }}
 */
export function applyConsumption(ingredients, pantryStock) {
  if (!pantryStock?.length) return { workingStock: pantryStock ?? [], deltas: [], updatesById: new Map() };
  // Working copy so two ingredients that fuzzy-match the same stock row
  // (e.g. «Tomate» + «Tomate maduro») decrement sequentially instead of both
  // subtracting from the original quantity.
  const working = pantryStock.map((p) => ({ ...p }));
  const origById = new Map(pantryStock.map((p) => [p.id, Number(p.qty) || 0]));
  const updatesById = new Map();
  const metaById = new Map();
  for (const ing of ingredients ?? []) {
    const stock = findMatchingPantryItem(ing.name, working, { adapted: Boolean(ing.adapted) });
    if (!stock) continue;
    const consume = convertStockAmount(ing.qty, ing.unit, stock.unit, ing.name);
    if (consume == null) continue;
    const nextQty = Math.max(0, (Number(stock.qty) || 0) - consume);
    stock.qty = nextQty;
    updatesById.set(stock.id, nextQty);
    metaById.set(stock.id, {
      name: stock.ingredientName,
      normalized: stock.ingredientNormalized,
      unit: stock.unit,
    });
  }
  const deltas = [...updatesById.entries()]
    .map(([id, nextQty]) => {
      const removed = (origById.get(id) ?? 0) - nextQty;
      const meta = metaById.get(id);
      return removed > 0 && meta ? { ...meta, qty: removed } : null;
    })
    .filter(Boolean);
  return { workingStock: working, deltas, updatesById };
}

/**
 * Shared "cocinar descuenta de la despensa" logic, used by the dish detail's
 * "Marcar cocinado" and by the "al generar el menú" bulk consumption. Pantry
 * stock is the single source of truth: buying tops it up, cooking/generating
 * spends it. Persists the result (cloud or local) and returns exact per-row
 * deltas so an "undo" can restore the precise amounts even after a row was
 * clamped to 0 or several ingredients hit the same stock row.
 *
 * @param {{ name: string, qty: number, unit: string, adapted?: boolean }[]} ingredients
 * @param {{ id: string, ingredientName: string, ingredientNormalized: string, qty: number, unit: string }[]} pantryStock
 * @param {{ user: { id: string } | null }} ctx
 * @returns {Promise<{ deltas: { name: string, normalized: string, qty: number, unit: string }[], decremented: number }>}
 */
export async function consumeFromPantry(ingredients, pantryStock, { user }) {
  const { deltas, updatesById } = applyConsumption(ingredients, pantryStock);
  if (updatesById.size) {
    const updates = [...updatesById.entries()].map(([id, nextQty]) => ({ id, nextQty }));
    if (user) await Promise.all(updates.map((u) => setPantryItemQty(user.id, u.id, u.nextQty)));
    else for (const u of updates) setLocalPantryItemQty(u.id, u.nextQty);
  }
  return { deltas, decremented: updatesById.size };
}

/**
 * Reverse of consumeFromPantry: re-adds exactly what was subtracted (top-up
 * recreates rows that had hit 0).
 * @returns {Promise<number>} how many rows were restored
 */
export async function restoreToPantry(deltas, { user, householdId = null }) {
  if (!deltas?.length) return 0;
  const items = deltas.map((d) => ({
    name: d.name,
    normalized: d.normalized,
    qty: d.qty,
    unit: d.unit,
    source: "manual",
  }));
  if (user) {
    const saved = await addPantryItems(user.id, items, householdId);
    return saved.length;
  }
  addLocalPantryItems(items);
  return items.length;
}
