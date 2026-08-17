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
    // Freezer + cooked-dish axes (see 0014_pantry_freezer_cooked.sql). Absent on
    // a pre-0014 DB → safe defaults (a plain, non-frozen ingredient).
    frozen: Boolean(row.frozen),
    itemType: row.item_type ?? "ingredient",
    portions: row.portions != null ? Number(row.portions) : null,
    recipeRef: row.recipe_ref ?? null,
    cookedAt: row.cooked_at ?? null,
    // Proxy for "fecha de compra" (see 0009_user_pantry_updated_at.sql):
    // bumped by a DB trigger on every qty change, so it's naturally "last
    // time this stock was touched" — new tickets, top-ups, manual edits.
    updatedAt: row.updated_at ?? row.created_at ?? null,
  };
}

// Postgres "undefined_column" — a DB that hasn't run a given migration yet is
// missing one of its columns; we degrade gracefully instead of hard-failing.
const UNDEFINED_COLUMN = "42703";

function isMissingColumn(error) {
  return error?.code === UNDEFINED_COLUMN;
}

// Columns added after the original table. Selected together, dropped as a group
// on a pre-migration DB (see loadPantry's graceful fallbacks).
const BASE_COLS = "id, ingredient_name, ingredient_normalized, qty, unit, source, created_at";
const FREEZER_COLS = "frozen, item_type, portions, recipe_ref, cooked_at";
const RETURN_COLS = `${BASE_COLS}, ${FREEZER_COLS}`;

/** @returns {Promise<{ id: string, ingredientName: string, ingredientNormalized: string, qty: number, unit: string, source: string, updatedAt: string|null }[]>} */
export async function loadPantry(userId) {
  if (!supabase || !userId) return [];
  const run = (cols) =>
    supabase
      .from("user_pantry")
      .select(cols)
      .eq("user_id", userId)
      .order("created_at", { ascending: true });

  // Newest schema first, then fall back column-group by column-group so the
  // pantry still loads on a DB that hasn't run 0014 (freezer) or 0009 (updated_at).
  let { data, error } = await run(`${BASE_COLS}, updated_at, ${FREEZER_COLS}`);
  if (!error) return (data ?? []).map(mapRow);

  if (isMissingColumn(error)) {
    let retry = await run(`${BASE_COLS}, updated_at`);
    if (!retry.error) return (retry.data ?? []).map(mapRow);
    if (isMissingColumn(retry.error)) {
      retry = await run(BASE_COLS);
      if (!retry.error) return (retry.data ?? []).map(mapRow);
    }
    error = retry.error;
  }

  console.error("[pantry] load failed", error);
  return [];
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

  const ingredients = items.filter((it) => (it.itemType ?? "ingredient") !== "cooked_dish");
  const cooked = items.filter((it) => (it.itemType ?? "ingredient") === "cooked_dish");

  const toInsert = [];
  const toUpdate = [];

  // Ingredients: top-up an existing row of the SAME normalized name AND the
  // same frozen state (fresh chicken and frozen chicken are two rows). Cooked
  // dishes are never touched by this lookup (they're never merged).
  if (ingredients.length) {
    const normalizedKeys = ingredients.map((it) => it.normalized);
    const { data: existing, error: fetchError } = await supabase
      .from("user_pantry")
      .select("id, ingredient_normalized, qty, unit, frozen")
      .eq("user_id", userId)
      .eq("item_type", "ingredient")
      .in("ingredient_normalized", normalizedKeys);
    if (fetchError) console.error("[pantry] add lookup failed", fetchError);
    const keyOf = (normalized, frozen) => `${normalized}|${frozen ? 1 : 0}`;
    const existingByKey = new Map((existing ?? []).map((r) => [keyOf(r.ingredient_normalized, r.frozen), r]));

    for (const it of ingredients) {
      const qty = Number(it.qty) > 0 ? Number(it.qty) : 1;
      const unit = it.unit ?? "ud";
      const frozen = Boolean(it.frozen);
      const found = existingByKey.get(keyOf(it.normalized, frozen));
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
          frozen,
          item_type: "ingredient",
          source: it.source ?? "manual",
        });
      }
    }
  }

  // Cooked dishes: every batch is its own row (a second tupper of lentils is
  // not the same stock as the first — different cooked_at, own portions).
  for (const it of cooked) {
    const portions = Number(it.portions ?? it.qty) > 0 ? Number(it.portions ?? it.qty) : 1;
    toInsert.push({
      user_id: userId,
      ingredient_name: it.name,
      ingredient_normalized: it.normalized,
      qty: portions,
      unit: "racion",
      frozen: Boolean(it.frozen),
      item_type: "cooked_dish",
      portions,
      recipe_ref: it.recipeRef ?? null,
      cooked_at: it.cookedAt ?? new Date().toISOString(),
      source: it.source ?? "manual",
    });
  }

  const rows = [];
  if (toInsert.length) {
    const { data, error } = await supabase
      .from("user_pantry")
      .insert(toInsert)
      .select(RETURN_COLS);
    if (error) console.error("[pantry] insert failed", error);
    else rows.push(...(data ?? []).map((r) => ({ ...mapRow(r), isNew: true })));
  }
  // Top-ups fire together rather than one after another. Each row needs its own
  // statement (a different qty per id), but awaiting them in sequence made a
  // receipt scan cost one full round-trip PER already-owned product — a 30-item
  // shop meant 30 chained requests, several seconds of staring at a spinner on
  // mobile. Concurrently it's one round-trip's worth of waiting.
  const updated = await Promise.all(
    toUpdate.map((u) =>
      supabase
        .from("user_pantry")
        .update({ qty: u.qty })
        .eq("user_id", userId)
        .eq("id", u.id)
        .select(RETURN_COLS),
    ),
  );
  for (const { data, error } of updated) {
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

/**
 * Suma o resta raciones a un plato cocinado, borrando la fila cuando se agota.
 * Un `cooked_dish` guarda las raciones DOS veces (`portions` es la fuente y
 * `qty` su espejo, para que la despensa pueda contar filas sin saber de tipos),
 * así que las dos columnas tienen que moverse juntas — setPantryItemQty solo
 * toca `qty` y dejaría el plato con las raciones descuadradas.
 *
 * @param {number} delta negativo para consumir (descongelar), positivo para devolver
 * @returns {Promise<number|null>} raciones que quedan (0 si se borró), null si falló
 */
export async function adjustCookedDishPortions(userId, id, delta) {
  if (!supabase || !userId || !id) return null;
  const { data: row, error: readError } = await supabase
    .from("user_pantry")
    .select("portions, qty")
    .eq("user_id", userId)
    .eq("id", id)
    .maybeSingle();
  if (readError || !row) {
    if (readError) console.error("[pantry] cooked portions read failed", readError);
    return null;
  }
  const current = Number(row.portions ?? row.qty) || 0;
  const next = Math.max(0, current + Number(delta || 0));
  if (next <= 0) {
    const ok = await removePantryItem(userId, id);
    return ok ? 0 : null;
  }
  const { error } = await supabase
    .from("user_pantry")
    .update({ portions: next, qty: next })
    .eq("user_id", userId)
    .eq("id", id);
  if (error) {
    console.error("[pantry] cooked portions update failed", error);
    return null;
  }
  return next;
}

/** Espejo local de adjustCookedDishPortions para usuarios sin cuenta. */
export function adjustLocalCookedDishPortions(id, delta) {
  const current = readLocalPantry();
  const row = current.find((it) => it.id === id);
  if (!row) return null;
  const now = new Date().toISOString();
  const next = Math.max(0, (Number(row.portions ?? row.qty) || 0) + Number(delta || 0));
  if (next <= 0) {
    writeLocalPantry(current.filter((it) => it.id !== id));
    return 0;
  }
  writeLocalPantry(
    current.map((it) =>
      it.id === id ? { ...it, portions: next, qty: next, updatedAt: now } : it,
    ),
  );
  return next;
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

/** Same top-up-by-(name,frozen) semantics as addPantryItems, just synchronous.
 *  Cooked dishes are always appended as a fresh row (never merged). */
export function addLocalPantryItems(items) {
  const next = readLocalPantry();
  const keyOf = (normalized, frozen) => `${normalized}|${frozen ? 1 : 0}`;
  const ingredientByKey = new Map(
    next
      .filter((it) => (it.itemType ?? "ingredient") !== "cooked_dish")
      .map((it) => [keyOf(it.ingredientNormalized, it.frozen), it]),
  );
  const now = new Date().toISOString();
  for (const it of items) {
    const isCooked = (it.itemType ?? "ingredient") === "cooked_dish";
    if (isCooked) {
      const portions = Number(it.portions ?? it.qty) > 0 ? Number(it.portions ?? it.qty) : 1;
      next.push({
        id: `local_${uid()}`,
        ingredientName: it.name,
        ingredientNormalized: it.normalized,
        qty: portions,
        unit: "racion",
        source: it.source ?? "manual",
        frozen: Boolean(it.frozen),
        itemType: "cooked_dish",
        portions,
        recipeRef: it.recipeRef ?? null,
        cookedAt: it.cookedAt ?? now,
        updatedAt: now,
      });
      continue;
    }
    const qty = Number(it.qty) > 0 ? Number(it.qty) : 1;
    const unit = it.unit ?? "ud";
    const frozen = Boolean(it.frozen);
    const existing = ingredientByKey.get(keyOf(it.normalized, frozen));
    if (existing) {
      const addQty =
        existing.unit === unit ? qty : convertStockAmount(qty, unit, existing.unit, it.name);
      if (addQty != null) {
        existing.qty = (Number(existing.qty) || 0) + addQty;
        existing.updatedAt = now;
      }
    } else {
      const row = {
        id: `local_${uid()}`,
        ingredientName: it.name,
        ingredientNormalized: it.normalized,
        qty,
        unit,
        source: it.source ?? "manual",
        frozen,
        itemType: "ingredient",
        updatedAt: now,
      };
      ingredientByKey.set(keyOf(it.normalized, frozen), row);
      next.push(row);
    }
  }
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
      frozen: it.frozen,
      itemType: it.itemType,
      portions: it.portions,
      recipeRef: it.recipeRef,
      cookedAt: it.cookedAt,
    })),
  );
  writeLocalPantry([]);
  return true;
}
