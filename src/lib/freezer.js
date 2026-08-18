/**
 * Platos ya cocinados en nevera o congelador — lógica pura, sin React.
 *
 * Un `cooked_dish` de la despensa (ver lib/pantry.js y la migración
 * 0014_pantry_freezer_cooked.sql) guarda `portions`, `recipe_ref`, `frozen`
 * y opcionalmente `garnish_ref` (0016). Cuando un hueco del menú se cubre con
 * uno de esos tuppers, el slot deja de ser "hay que cocinar esto" y pasa a ser
 * "hay que sacarlo y calentarlo":
 *
 *   · la compra no pide sus ingredientes (ya están cocinados y pagados)
 *   · la ficha pinta thawSteps / recalentar en lugar de stepsRich
 *   · la card del menú lleva un icono (nevera o copo de nieve)
 *
 * El caso interesante es el PARCIAL: hay 2 raciones y comen 4. Entonces el
 * slot es mixto — `*Portions: 2` y `freshPortions: 2` — y hay que comprar
 * ingredientes para 2, no para 4. Ese reparto lo calcula splitSlotPortions.
 */

/** Un item de despensa que es una ración cocinada y congelada de una receta. */
export function isFrozenCookedDish(item) {
  return Boolean(item)
    && item.itemType === "cooked_dish"
    && Boolean(item.frozen)
    && Boolean(item.recipeRef);
}

/** Plato cocinado en nevera (no congelado). */
export function isFridgeCookedDish(item) {
  return Boolean(item)
    && item.itemType === "cooked_dish"
    && !item.frozen
    && Boolean(item.recipeRef);
}

/** Nevera o congelador con raciones disponibles. */
export function isPreparedCookedDish(item) {
  return isFrozenCookedDish(item) || isFridgeCookedDish(item);
}

/** Raciones utilizables de un item (portions es la fuente; qty es el espejo). */
export function itemPortions(item) {
  const n = Number(item?.portions ?? item?.qty);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

function indexCookedDishesByRecipe(pantryStock, predicate) {
  const byRecipe = new Map();
  for (const item of pantryStock ?? []) {
    if (!predicate(item) || itemPortions(item) <= 0) continue;
    const list = byRecipe.get(item.recipeRef) ?? [];
    list.push(item);
    byRecipe.set(item.recipeRef, list);
  }
  for (const list of byRecipe.values()) {
    list.sort((a, b) => String(a.cookedAt ?? "").localeCompare(String(b.cookedAt ?? "")));
  }
  return byRecipe;
}

/**
 * Índice recipeRef → items congelados de esa receta, ordenados por antigüedad
 * (lo que lleva más tiempo dentro se gasta antes).
 */
export function indexFrozenDishes(pantryStock) {
  return indexCookedDishesByRecipe(pantryStock, isFrozenCookedDish);
}

/** Índice recipeRef → items de nevera, ordenados por antigüedad (FIFO). */
export function indexFridgeDishes(pantryStock) {
  return indexCookedDishesByRecipe(pantryStock, isFridgeCookedDish);
}

function preparedPortionsForRecipe(pantryStock, recipeId, frozen) {
  if (!recipeId) return 0;
  const pred = frozen ? isFrozenCookedDish : isFridgeCookedDish;
  let total = 0;
  for (const item of pantryStock ?? []) {
    if (pred(item) && item.recipeRef === recipeId) total += itemPortions(item);
  }
  return total;
}

/** Raciones congeladas totales de una receta. */
export function frozenPortionsFor(pantryStock, recipeId) {
  return preparedPortionsForRecipe(pantryStock, recipeId, true);
}

/** Raciones en nevera totales de una receta. */
export function fridgePortionsFor(pantryStock, recipeId) {
  return preparedPortionsForRecipe(pantryStock, recipeId, false);
}

function pickPreparedItem(pantryStock, recipeId, frozen) {
  const index = frozen ? indexFrozenDishes : indexFridgeDishes;
  return index(pantryStock).get(recipeId)?.[0] ?? null;
}

/** El item congelado más antiguo con raciones de esta receta. */
export function pickFrozenItem(pantryStock, recipeId) {
  return pickPreparedItem(pantryStock, recipeId, true);
}

/** El tupper de nevera más antiguo con raciones de esta receta. */
export function pickFridgeItem(pantryStock, recipeId) {
  return pickPreparedItem(pantryStock, recipeId, false);
}

/**
 * Reparte los comensales de un slot entre lo preparado y lo que hay que cocinar.
 * @returns {{ frozenPortions: number, freshPortions: number }}
 */
export function splitSlotPortions(eaters, availablePortions) {
  const total = Math.max(1, Number(eaters) || 1);
  const frozen = Math.max(0, Math.min(total, Math.floor(Number(availablePortions) || 0)));
  return { frozenPortions: frozen, freshPortions: total - frozen };
}

export function slotUsesFreezer(slot, recipeId = undefined) {
  if (!slot?.fromFreezer || !(Number(slot.frozenPortions) > 0)) return false;
  if (recipeId === undefined) return true;
  const target = slot.frozenRecipeId ?? slot.recipeId;
  return recipeId === target;
}

export function slotUsesFridge(slot, recipeId = undefined) {
  if (!slot?.fromFridge || !(Number(slot.fridgePortions) > 0)) return false;
  if (recipeId === undefined) return true;
  const target = slot.fridgeRecipeId ?? slot.recipeId;
  return recipeId === target;
}

/** ¿Este slot se cubre (total o parcialmente) con nevera o congelador? */
export function slotUsesPrepared(slot, recipeId = undefined) {
  return slotUsesFreezer(slot, recipeId) || slotUsesFridge(slot, recipeId);
}

/** Raciones del tupper (nevera o congelador) que cubren este plato del hueco. */
export function preparedPortionsFor(slot, recipeId = undefined) {
  if (slotUsesFreezer(slot, recipeId)) return Number(slot.frozenPortions) || 0;
  if (slotUsesFridge(slot, recipeId)) return Number(slot.fridgePortions) || 0;
  return 0;
}

/**
 * Comensales que hay que COCINAR de verdad de un plato del hueco, ya descontado
 * lo que sale de nevera/congelador.
 */
export function cookedEatersFor(slot, recipeId = undefined) {
  const eaters = Math.max(1, Number(slot?.eaters) || 1);
  if (!slotUsesPrepared(slot, recipeId)) return eaters;
  const fresh = Number(slot.freshPortions);
  return Number.isFinite(fresh) && fresh > 0 ? Math.min(eaters, fresh) : 0;
}

/** ¿La guarnición va incluida en el tupper de este hueco? */
export function slotGarnishInTupper(slot, recipeId = undefined) {
  if (!slotUsesPrepared(slot, recipeId) || !slot.preparedGarnishRef) return false;
  return preparedPortionsFor(slot, recipeId) > 0;
}

function assignPreparedToSlot(slot, item, recipeId, source) {
  const available = itemPortions(item);
  if (!item || available <= 0) return slot;
  const { frozenPortions, freshPortions } = splitSlotPortions(slot?.eaters, available);
  if (frozenPortions <= 0) return slot;
  const targetRecipeId = recipeId ?? slot?.recipeId ?? null;
  const garnishRef = item.garnishRef ?? null;
  if (source === "freezer") {
    return {
      ...slot,
      fromFreezer: true,
      frozenItemId: item.id,
      frozenRecipeId: targetRecipeId,
      frozenPortions,
      freshPortions,
      ...(garnishRef ? { preparedGarnishRef: garnishRef } : {}),
    };
  }
  return {
    ...slot,
    fromFridge: true,
    fridgeItemId: item.id,
    fridgeRecipeId: targetRecipeId,
    fridgePortions: frozenPortions,
    freshPortions,
    ...(garnishRef ? { preparedGarnishRef: garnishRef } : {}),
  };
}

/** Marca un plato del slot como cubierto por el congelador. */
export function assignFreezerToSlot(slot, frozenItem, recipeId = undefined) {
  return assignPreparedToSlot(slot, frozenItem, recipeId, "freezer");
}

/** Marca un plato del slot como cubierto por la nevera. */
export function assignFridgeToSlot(slot, fridgeItem, recipeId = undefined) {
  return assignPreparedToSlot(slot, fridgeItem, recipeId, "fridge");
}

export function clearFreezerFromSlot(slot) {
  if (!slot?.fromFreezer) return slot;
  const {
    fromFreezer: _fromFreezer,
    frozenItemId: _frozenItemId,
    frozenRecipeId: _frozenRecipeId,
    frozenPortions: _frozenPortions,
    freshPortions: _freshPortions,
    preparedGarnishRef: _preparedGarnishRef,
    ...rest
  } = slot;
  return rest;
}

export function clearFridgeFromSlot(slot) {
  if (!slot?.fromFridge) return slot;
  const {
    fromFridge: _fromFridge,
    fridgeItemId: _fridgeItemId,
    fridgeRecipeId: _fridgeRecipeId,
    fridgePortions: _fridgePortions,
    freshPortions: _freshPortions,
    preparedGarnishRef: _preparedGarnishRef,
    ...rest
  } = slot;
  return rest;
}

/** Deshace cobertura de nevera o congelador. */
export function clearPreparedFromSlot(slot) {
  return clearFridgeFromSlot(clearFreezerFromSlot(slot));
}

/** Id de catálogo de una receta del plan: los menús multi-grupo prefijan
 *  "<groupId>__" al id, y la despensa guarda la referencia sin prefijo. */
export function catalogIdOfPlanRecipe(recipeId) {
  const id = String(recipeId ?? "");
  const sep = id.indexOf("__");
  return sep === -1 ? id : id.slice(sep + 2);
}

const SLOT_KEYS = {
  freezer: {
    from: "fromFreezer",
    itemId: "frozenItemId",
    recipeId: "frozenRecipeId",
    portions: "frozenPortions",
  },
  fridge: {
    from: "fromFridge",
    itemId: "fridgeItemId",
    recipeId: "fridgeRecipeId",
    portions: "fridgePortions",
  },
};

function buildPool(pantryStock, frozen) {
  const index = frozen ? indexFrozenDishes : indexFridgeDishes;
  const pool = new Map();
  const garnishByItemId = new Map();
  for (const [recipeRef, items] of index(pantryStock)) {
    pool.set(
      recipeRef,
      items.map((it) => {
        garnishByItemId.set(it.id, it.garnishRef ?? null);
        return { id: it.id, left: itemPortions(it), garnishRef: it.garnishRef ?? null };
      }),
    );
  }
  return { pool, garnishByItemId };
}

function assignFromPool(plan, pantryStock, frozen, days, mealLabels) {
  const { pool } = buildPool(pantryStock, frozen);
  if (pool.size === 0) return 0;
  const keys = SLOT_KEYS[frozen ? "freezer" : "fridge"];
  const otherFrom = frozen ? "fromFridge" : "fromFreezer";
  let marked = 0;
  const slotKeys = days.flatMap((day) => mealLabels.map((meal) => `${day}-${meal}`));

  for (const groupId of Object.keys(plan)) {
    if (groupId.startsWith("_")) continue;
    const slots = plan[groupId];
    if (!slots) continue;
    for (const key of slotKeys) {
      const slot = slots[key];
      if (!slot || slot[keys.from] || slot[otherFrom]) continue;
      const recipeRef = catalogIdOfPlanRecipe(slot.recipeId);
      const tuppers = pool.get(recipeRef);
      if (!tuppers?.length) continue;
      const available = tuppers.reduce((s, t) => s + t.left, 0);
      const { frozenPortions, freshPortions } = splitSlotPortions(slot.eaters, available);
      if (frozenPortions <= 0) continue;

      let pending = frozenPortions;
      let sourceId = null;
      let garnishRef = null;
      for (const t of tuppers) {
        if (pending <= 0) break;
        if (t.left <= 0) continue;
        const take = Math.min(t.left, pending);
        t.left -= take;
        pending -= take;
        sourceId ??= t.id;
        garnishRef ??= t.garnishRef;
      }

      slots[key] = {
        ...slot,
        [keys.from]: true,
        [keys.itemId]: sourceId,
        [keys.recipeId]: slot.recipeId,
        [keys.portions]: frozenPortions,
        freshPortions,
        ...(garnishRef ? { preparedGarnishRef: garnishRef } : {}),
      };
      marked++;
    }
  }
  return marked;
}

/**
 * Reparte tuppers de nevera (primero) y congelador entre los huecos del menú.
 * Nevera va antes porque caduca antes.
 */
export function assignPreparedToPlan(plan, pantryStock, opts = {}) {
  const days = opts.days ?? [];
  const mealLabels = opts.mealLabels ?? [];
  let marked = 0;
  marked += assignFromPool(plan, pantryStock, false, days, mealLabels);
  marked += assignFromPool(plan, pantryStock, true, days, mealLabels);
  return marked;
}

/** @deprecated alias — asigna nevera y congelador */
export function assignFreezerToPlan(plan, pantryStock, opts = {}) {
  return assignPreparedToPlan(plan, pantryStock, opts);
}

export function portionsLabel(n) {
  const count = Math.max(0, Math.floor(Number(n) || 0));
  return count === 1 ? "1 ración" : `${count} raciones`;
}

export function daysSinceCooked(cookedAt) {
  if (!cookedAt) return null;
  const then = Date.parse(cookedAt);
  if (!Number.isFinite(then)) return null;
  const days = Math.floor((Date.now() - then) / 86400000);
  return days >= 0 ? days : null;
}

export function cookedAgoLabel(cookedAt) {
  const days = daysSinceCooked(cookedAt);
  if (days == null) return null;
  if (days === 0) return "hoy";
  if (days === 1) return "ayer";
  return `hace ${days} días`;
}
