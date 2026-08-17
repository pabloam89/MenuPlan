/**
 * Platos ya cocinados que viven en el congelador — lógica pura, sin React.
 *
 * Un `cooked_dish` de la despensa (ver lib/pantry.js y la migración
 * 0014_pantry_freezer_cooked.sql) guarda `portions`, `recipe_ref` y `frozen`.
 * Cuando un hueco del menú se cubre con uno de esos tuppers, el slot deja de
 * ser "hay que cocinar esto" y pasa a ser "hay que sacarlo y calentarlo":
 *
 *   · la compra no pide sus ingredientes (ya están cocinados y pagados)
 *   · la ficha pinta thawSteps en lugar de stepsRich
 *   · la card del menú lleva un copo de nieve
 *
 * El caso interesante es el PARCIAL: el congelador tiene 2 raciones y comen 4.
 * Entonces el slot es mixto — `frozenPortions: 2` y `freshPortions: 2` — y hay
 * que comprar ingredientes para 2, no para 4, y mostrar los dos bloques de
 * pasos. Ese reparto lo calcula splitSlotPortions y lo consumen tanto el
 * generador de la compra como la ficha del plato, para que no divergan.
 */

/** Un item de despensa que es una ración cocinada y congelada de una receta. */
export function isFrozenCookedDish(item) {
  return Boolean(item)
    && item.itemType === "cooked_dish"
    && Boolean(item.frozen)
    && Boolean(item.recipeRef);
}

/** Raciones utilizables de un item (portions es la fuente; qty es el espejo). */
export function itemPortions(item) {
  const n = Number(item?.portions ?? item?.qty);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

/**
 * Índice recipeRef → items congelados de esa receta, ordenados por antigüedad
 * (lo que lleva más tiempo dentro se gasta antes, que es lo que uno querría de
 * un congelador). Las recetas sin ninguna ración no aparecen en el mapa.
 *
 * @param {Array<object>} pantryStock filas tal cual las devuelve loadPantry
 * @returns {Map<string, Array<object>>}
 */
export function indexFrozenDishes(pantryStock) {
  const byRecipe = new Map();
  for (const item of pantryStock ?? []) {
    if (!isFrozenCookedDish(item) || itemPortions(item) <= 0) continue;
    const list = byRecipe.get(item.recipeRef) ?? [];
    list.push(item);
    byRecipe.set(item.recipeRef, list);
  }
  for (const list of byRecipe.values()) {
    list.sort((a, b) => String(a.cookedAt ?? "").localeCompare(String(b.cookedAt ?? "")));
  }
  return byRecipe;
}

/** Raciones congeladas totales de una receta. */
export function frozenPortionsFor(pantryStock, recipeId) {
  if (!recipeId) return 0;
  let total = 0;
  for (const item of pantryStock ?? []) {
    if (isFrozenCookedDish(item) && item.recipeRef === recipeId) {
      total += itemPortions(item);
    }
  }
  return total;
}

/**
 * El item congelado que usaría un slot de esta receta: el más antiguo con
 * raciones. Null si no hay nada de esa receta en el congelador.
 */
export function pickFrozenItem(pantryStock, recipeId) {
  return indexFrozenDishes(pantryStock).get(recipeId)?.[0] ?? null;
}

/**
 * Reparte los comensales de un slot entre lo que sale del congelador y lo que
 * hay que cocinar. Es la única función que decide ese reparto: la compra la usa
 * para escalar ingredientes y la ficha para saber si además de descongelar hay
 * que cocinar.
 *
 * `eaters` nunca baja de 1 y las raciones congeladas se topean a los comensales
 * (sacar 4 tuppers para 2 personas no tiene sentido; el resto se queda dentro).
 *
 * @returns {{ frozenPortions: number, freshPortions: number }}
 */
export function splitSlotPortions(eaters, availablePortions) {
  const total = Math.max(1, Number(eaters) || 1);
  const frozen = Math.max(0, Math.min(total, Math.floor(Number(availablePortions) || 0)));
  return { frozenPortions: frozen, freshPortions: total - frozen };
}

/**
 * ¿Este slot se cubre (total o parcialmente) con algo del congelador?
 * Un slot marcado con 0 raciones congeladas no cuenta como del congelador —
 * evita que un flag mal puesto haga desaparecer ingredientes de la compra.
 *
 * Un hueco puede llevar DOS platos (primero y segundo), y solo uno de ellos
 * puede venir del congelador, así que la marca guarda a qué receta aplica. Con
 * `recipeId` la comprobación se limita a ese plato; sin él responde "¿hay algo
 * del congelador en este hueco?". Los slots viejos (marcados antes de guardar
 * `frozenRecipeId`) se interpretan como el plato principal, que es donde el
 * flujo empezó y el único que podía marcarse entonces.
 */
export function slotUsesFreezer(slot, recipeId = undefined) {
  if (!slot?.fromFreezer || !(Number(slot.frozenPortions) > 0)) return false;
  if (recipeId === undefined) return true;
  const target = slot.frozenRecipeId ?? slot.recipeId;
  return recipeId === target;
}

/**
 * Comensales que hay que COCINAR de verdad de un plato del hueco, ya descontado
 * lo que sale del congelador. Un plato normal devuelve los comensales del hueco.
 *
 * Es el número con el que la compra escala los ingredientes: si 2 de 4 raciones
 * salen del congelador, se compra para 2.
 */
export function cookedEatersFor(slot, recipeId = undefined) {
  const eaters = Math.max(1, Number(slot?.eaters) || 1);
  if (!slotUsesFreezer(slot, recipeId)) return eaters;
  const fresh = Number(slot.freshPortions);
  return Number.isFinite(fresh) && fresh > 0 ? Math.min(eaters, fresh) : 0;
}

/**
 * Marca un plato del slot como cubierto por el congelador, guardando de qué
 * item sale, a qué receta aplica y el reparto congelado/fresco. Puro.
 */
export function assignFreezerToSlot(slot, frozenItem, recipeId = undefined) {
  const available = itemPortions(frozenItem);
  if (!frozenItem || available <= 0) return slot;
  const { frozenPortions, freshPortions } = splitSlotPortions(slot?.eaters, available);
  if (frozenPortions <= 0) return slot;
  return {
    ...slot,
    fromFreezer: true,
    frozenItemId: frozenItem.id,
    frozenRecipeId: recipeId ?? slot?.recipeId ?? null,
    frozenPortions,
    freshPortions,
  };
}

/** Deshace assignFreezerToSlot: el plato vuelve a cocinarse entero. */
export function clearFreezerFromSlot(slot) {
  if (!slot?.fromFreezer) return slot;
  const {
    fromFreezer: _fromFreezer,
    frozenItemId: _frozenItemId,
    frozenRecipeId: _frozenRecipeId,
    frozenPortions: _frozenPortions,
    freshPortions: _freshPortions,
    ...rest
  } = slot;
  return rest;
}

/** Id de catálogo de una receta del plan: los menús multi-grupo prefijan
 *  "<groupId>__" al id, y el congelador guarda la referencia sin prefijo. */
export function catalogIdOfPlanRecipe(recipeId) {
  const id = String(recipeId ?? "");
  const sep = id.indexOf("__");
  return sep === -1 ? id : id.slice(sep + 2);
}

/**
 * Reparte las raciones del congelador entre los huecos del menú recién generado.
 *
 * Va en pasada determinista DESPUÉS de que el modelo asigne recetas, no dentro
 * del prompt: el LLM decide bien QUÉ plato pega en cada hueco, pero repartir un
 * stock finito sin pasarse es aritmética, y aquí no puede equivocarse. Recorre
 * los huecos en orden (lunes → domingo, comida antes que cena) y va gastando un
 * pool en memoria, así que dos huecos del mismo plato no reclaman el mismo
 * tupper: el primero se lo lleva y el segundo se cocina normal.
 *
 * Muta `plan` en el sitio (igual que el resto de pasadas del generador) y
 * devuelve el número de huecos marcados.
 *
 * @param {Record<string, Record<string, object>>} plan menuPlan por grupo
 * @param {Array<object>} pantryStock filas de loadPantry
 * @param {{ days?: string[], mealLabels?: string[] }} [opts]
 */
export function assignFreezerToPlan(plan, pantryStock, opts = {}) {
  const days = opts.days ?? [];
  const mealLabels = opts.mealLabels ?? [];
  // Pool gastable: raciones por receta, del tupper más antiguo al más nuevo.
  const pool = new Map();
  for (const [recipeRef, items] of indexFrozenDishes(pantryStock)) {
    pool.set(
      recipeRef,
      items.map((it) => ({ id: it.id, left: itemPortions(it) })),
    );
  }
  if (pool.size === 0) return 0;

  let marked = 0;
  const slotKeys = days.flatMap((day) => mealLabels.map((meal) => `${day}-${meal}`));

  for (const groupId of Object.keys(plan)) {
    if (groupId.startsWith("_")) continue;
    const slots = plan[groupId];
    if (!slots) continue;
    for (const key of slotKeys) {
      const slot = slots[key];
      if (!slot || slot.fromFreezer) continue;
      // Solo el plato principal del hueco: es el que se congela en tupper, y
      // marcar el primero además obligaría a llevar dos repartos en un slot.
      const recipeRef = catalogIdOfPlanRecipe(slot.recipeId);
      const tuppers = pool.get(recipeRef);
      if (!tuppers?.length) continue;
      const available = tuppers.reduce((s, t) => s + t.left, 0);
      const { frozenPortions, freshPortions } = splitSlotPortions(slot.eaters, available);
      if (frozenPortions <= 0) continue;

      // Gasta del pool en el mismo orden en que lo hará la ficha al confirmar.
      let pending = frozenPortions;
      let sourceId = null;
      for (const t of tuppers) {
        if (pending <= 0) break;
        if (t.left <= 0) continue;
        const take = Math.min(t.left, pending);
        t.left -= take;
        pending -= take;
        sourceId ??= t.id;
      }

      slots[key] = {
        ...slot,
        fromFreezer: true,
        frozenItemId: sourceId,
        frozenRecipeId: slot.recipeId,
        frozenPortions,
        freshPortions,
      };
      marked++;
    }
  }
  return marked;
}

/**
 * Texto corto para el banner de la ficha y el tooltip del copo.
 * Ej: "2 raciones en el congelador" · "1 ración en el congelador".
 */
export function portionsLabel(n) {
  const count = Math.max(0, Math.floor(Number(n) || 0));
  return count === 1 ? "1 ración" : `${count} raciones`;
}

/** Días transcurridos desde que se cocinó (para "cocinado hace X días"). */
export function daysSinceCooked(cookedAt) {
  if (!cookedAt) return null;
  const then = Date.parse(cookedAt);
  if (!Number.isFinite(then)) return null;
  const days = Math.floor((Date.now() - then) / 86400000);
  return days >= 0 ? days : null;
}

/** "hoy" · "ayer" · "hace 5 días". Null cuando no hay fecha fiable. */
export function cookedAgoLabel(cookedAt) {
  const days = daysSinceCooked(cookedAt);
  if (days == null) return null;
  if (days === 0) return "hoy";
  if (days === 1) return "ayer";
  return `hace ${days} días`;
}
