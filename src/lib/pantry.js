import { supabase } from "./supabase.js";
import { uid } from "./groups.js";
import { convertStockAmount } from "./kitchenUnits.js";

/**
 * Data access for user_pantry (see supabase/migrations/0002_user_pantry.sql +
 * 0006_pantry_quantity.sql). The cloud functions below all require a userId —
 * "Entrar sin cuenta" users instead read/write a localStorage mirror with the
 * same shape (see loadLocalPantry & co.), so the pantry works fully signed
 * out too. mergeLocalPantryIntoCloud folds that local copy into the account
 * the first time a signed-out user logs in.
 *
 * Quantities live in the SAME closed unit set the recipe catalog itself uses
 * (g / ml / ud — see kitchenUnits.js), so a cooked recipe can subtract its
 * ingredient amounts straight from stock with no conversion layer.
 */

function mapRow(row) {
  return {
    id: row.id,
    ingredientName: row.ingredient_name,
    ingredientNormalized: row.ingredient_normalized,
    qty: Number(row.qty) || 0,
    unit: row.unit ?? "ud",
    source: row.source,
    // Proxy for "fecha de compra" (see 0009_user_pantry_updated_at.sql):
    // bumped by a DB trigger on every qty change, so it's naturally "last
    // time this stock was touched" — new tickets, top-ups, manual edits.
    updatedAt: row.updated_at ?? row.created_at ?? null,
  };
}

/** @returns {Promise<{ id: string, ingredientName: string, ingredientNormalized: string, qty: number, unit: string, source: string, updatedAt: string|null }[]>} */
export async function loadPantry(userId) {
  if (!supabase || !userId) return [];
  const { data, error } = await supabase
    .from("user_pantry")
    .select("id, ingredient_name, ingredient_normalized, qty, unit, source, created_at, updated_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });
  if (error) {
    console.error("[pantry] load failed", error);
    return [];
  }
  return (data ?? []).map(mapRow);
}

/**
 * Adds items. An ingredient the user already has (ingredient_normalized is
 * unique per user) gets its quantity TOPPED UP instead of being skipped —
 * buying another kilo of rice should add to what's left, not silently no-op.
 * Returns every affected row, each flagged `isNew` so callers that need to
 * know "did this create a brand-new pantry entry" (e.g. undoing a deleted
 * ticket) can tell a top-up apart from a fresh row.
 * @param {{ name: string, normalized: string, qty?: number, unit?: 'g'|'ml'|'ud', source?: 'manual'|'voice'|'photo' }[]} items
 */
export async function addPantryItems(userId, items) {
  if (!supabase || !userId || items.length === 0) return [];
  const normalizedKeys = items.map((it) => it.normalized);
  const { data: existing, error: fetchError } = await supabase
    .from("user_pantry")
    .select("id, ingredient_normalized, qty, unit")
    .eq("user_id", userId)
    .in("ingredient_normalized", normalizedKeys);
  if (fetchError) console.error("[pantry] add lookup failed", fetchError);
  const existingByKey = new Map((existing ?? []).map((r) => [r.ingredient_normalized, r]));

  const toInsert = [];
  const toUpdate = [];
  for (const it of items) {
    const qty = Number(it.qty) > 0 ? Number(it.qty) : 1;
    const unit = it.unit ?? "ud";
    const found = existingByKey.get(it.normalized);
    if (found) {
      // Add on top of what's there, converting the incoming unit to the stored
      // row's unit when they differ (e.g. 5 ud + 500 g of the same piece
      // ingredient). Only a truly incompatible pair (g↔ml, no density) can't be
      // merged — then we leave the row as-is rather than mixing bad amounts.
      const addQty =
        found.unit === unit ? qty : convertStockAmount(qty, unit, found.unit, it.name);
      const nextQty = addQty != null ? (Number(found.qty) || 0) + addQty : Number(found.qty) || 0;
      toUpdate.push({ id: found.id, qty: nextQty });
    } else {
      toInsert.push({
        user_id: userId,
        ingredient_name: it.name,
        ingredient_normalized: it.normalized,
        qty,
        unit,
        source: it.source ?? "manual",
      });
    }
  }

  const rows = [];
  if (toInsert.length) {
    const { data, error } = await supabase
      .from("user_pantry")
      .insert(toInsert)
      .select("id, ingredient_name, ingredient_normalized, qty, unit, source, updated_at");
    if (error) console.error("[pantry] insert failed", error);
    else rows.push(...(data ?? []).map((r) => ({ ...mapRow(r), isNew: true })));
  }
  for (const u of toUpdate) {
    const { data, error } = await supabase
      .from("user_pantry")
      .update({ qty: u.qty })
      .eq("user_id", userId)
      .eq("id", u.id)
      .select("id, ingredient_name, ingredient_normalized, qty, unit, source, updated_at");
    if (error) console.error("[pantry] top-up failed", error);
    else if (data?.[0]) rows.push({ ...mapRow(data[0]), isNew: false });
  }
  return rows;
}

/** Sets a pantry item's stock to an exact amount, deleting it once it hits 0.
 *  Optional `unit` updates the stored unit in the same write (Pantry row edit). */
export async function setPantryItemQty(userId, id, qty, unit) {
  if (!supabase || !userId) return false;
  if (!(qty > 0)) return removePantryItem(userId, id);
  const patch = unit != null ? { qty, unit } : { qty };
  const { error } = await supabase
    .from("user_pantry")
    .update(patch)
    .eq("user_id", userId)
    .eq("id", id);
  if (error) {
    console.error("[pantry] set qty failed", error);
    return false;
  }
  return true;
}

export async function removePantryItem(userId, id) {
  if (!supabase || !userId) return false;
  const { error } = await supabase
    .from("user_pantry")
    .delete()
    .eq("user_id", userId)
    .eq("id", id);
  if (error) {
    console.error("[pantry] remove failed", error);
    return false;
  }
  return true;
}

export async function clearPantry(userId) {
  if (!supabase || !userId) return false;
  const { error } = await supabase.from("user_pantry").delete().eq("user_id", userId);
  if (error) {
    console.error("[pantry] clear failed", error);
    return false;
  }
  return true;
}

// ── Signed-out mirror (localStorage) ──────────────────────────────────────
// Same row shape as mapRow() above so PantryScreen/PantryInput can treat
// both sources identically and only branch on *which* function to call.

const LOCAL_KEY = "menuplan.pantry.v1";

function readLocalPantry() {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeLocalPantry(items) {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(items));
  } catch {
    // Private-mode Safari / full quota — the in-memory state the caller
    // already updated is still correct for this session, just not persisted.
  }
}

export function loadLocalPantry() {
  return readLocalPantry();
}

/** Same top-up-by-normalized-name semantics as addPantryItems, just synchronous. */
export function addLocalPantryItems(items) {
  const current = readLocalPantry();
  const byKey = new Map(current.map((it) => [it.ingredientNormalized, it]));
  const now = new Date().toISOString();
  for (const it of items) {
    const qty = Number(it.qty) > 0 ? Number(it.qty) : 1;
    const unit = it.unit ?? "ud";
    const existing = byKey.get(it.normalized);
    if (existing) {
      const addQty =
        existing.unit === unit ? qty : convertStockAmount(qty, unit, existing.unit, it.name);
      if (addQty != null) {
        existing.qty = (Number(existing.qty) || 0) + addQty;
        existing.updatedAt = now;
      }
    } else {
      byKey.set(it.normalized, {
        id: `local_${uid()}`,
        ingredientName: it.name,
        ingredientNormalized: it.normalized,
        qty,
        unit,
        source: it.source ?? "manual",
        updatedAt: now,
      });
    }
  }
  const next = Array.from(byKey.values());
  writeLocalPantry(next);
  return next;
}

export function setLocalPantryItemQty(id, qty, unit) {
  const current = readLocalPantry();
  const now = new Date().toISOString();
  const next = qty > 0
    ? current.map((it) =>
        it.id === id
          ? { ...it, qty, ...(unit != null ? { unit } : {}), updatedAt: now }
          : it,
      )
    : current.filter((it) => it.id !== id);
  writeLocalPantry(next);
  return next;
}

export function removeLocalPantryItem(id) {
  const next = readLocalPantry().filter((it) => it.id !== id);
  writeLocalPantry(next);
  return next;
}

export function clearLocalPantry() {
  writeLocalPantry([]);
  return [];
}

/**
 * First-login backfill: folds whatever a "Entrar sin cuenta" user stocked up
 * locally into their new account (same top-up-by-name merge addPantryItems
 * already does for the cloud), then wipes the local copy — leaving it in
 * place would silently double the quantities on the next login.
 * @returns {Promise<boolean>} true when something was merged
 */
export async function mergeLocalPantryIntoCloud(userId) {
  if (!supabase || !userId) return false;
  const local = readLocalPantry();
  if (local.length === 0) return false;
  await addPantryItems(
    userId,
    local.map((it) => ({
      name: it.ingredientName,
      normalized: it.ingredientNormalized,
      qty: it.qty,
      unit: it.unit,
      source: it.source,
    })),
  );
  writeLocalPantry([]);
  return true;
}
