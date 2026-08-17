/**
 * Pantry consumption deltas: shape + menú-attribution + reconciliation.
 *
 * Cuando el menú descuenta de la despensa (al generar, en el barrido diario o al
 * marcar cocinado) guardamos los "deltas" exactos que restó, para poder
 * deshacerlos. Antes iban indexados solo por fecha, así que no se sabía a qué
 * menú pertenecía cada gasto: al borrar o reemplazar un menú, su consumo quedaba
 * aplicado para siempre (stock huérfano). Aquí:
 *
 *  - F1 (trazabilidad): cada bucket lleva su `menuId` — { menuId, at, deltas }.
 *    Los `cookedDeltas` ya lo llevan en el prefijo de su clave, así que solo
 *    envolvemos gen/day.
 *  - F2 (reconciliación): dado un menú, recogemos todos sus deltas (de los tres
 *    buckets) para devolverlos a la despensa y limpiamos sus entradas.
 *
 * Un `Delta` es { name, normalized, qty, unit } (ver cookPantry.js).
 */

/** Deltas de un bucket, tolerando la forma legacy (array pelado). */
export function bucketDeltas(bucket) {
  if (Array.isArray(bucket)) return bucket;
  return bucket?.deltas ?? [];
}

/** menuId de un bucket; null en buckets legacy (sin atribución). */
export function bucketMenuId(bucket) {
  if (Array.isArray(bucket)) return null;
  return bucket?.menuId ?? null;
}

/** Construye un bucket con atribución de menú. */
export function makeDeltaBucket(menuId, deltas, at = Date.now()) {
  return { menuId: menuId ?? null, at, deltas: Array.isArray(deltas) ? deltas : [] };
}

/**
 * Normaliza un mapa de buckets a la forma { menuId, at, deltas }. Un array
 * pelado (legacy) se convierte en { menuId: null, at: 0, deltas }. Idempotente.
 */
export function normalizeDeltaBucketMap(map) {
  if (!map || typeof map !== "object" || Array.isArray(map)) return {};
  const out = {};
  for (const [k, b] of Object.entries(map)) {
    if (Array.isArray(b)) {
      out[k] = { menuId: null, at: 0, deltas: b };
    } else if (b && typeof b === "object") {
      out[k] = {
        menuId: b.menuId ?? null,
        at: Number(b.at) || 0,
        deltas: Array.isArray(b.deltas) ? b.deltas : [],
      };
    }
    // cualquier otra cosa (null, número suelto…) se descarta silenciosamente
  }
  return out;
}

/**
 * menuId embebido en una cookedKey `${menuId}:${offset}::${day}::${meal}::${recipeId}`.
 * (createMenuId nunca contiene ':', así que el prefijo hasta el primer ':' es el id.)
 */
export function cookedKeyMenuId(key) {
  const s = String(key);
  const i = s.indexOf(":");
  return i === -1 ? null : s.slice(0, i);
}

/**
 * Recoge todos los deltas atribuidos a `menuId` en los tres buckets y devuelve
 * los mapas ya sin esas entradas. Puro (no toca despensa ni estado).
 *
 * @param {{ pantryGenDeltas?: object, pantryDayDeltas?: object, cookedDeltas?: object }} data
 * @param {string} menuId
 * @returns {{ deltas: object[], genOut: object, dayOut: object, cookedOut: object }}
 */
export function collectMenuPantryDeltas(data, menuId) {
  const gen = data?.pantryGenDeltas ?? {};
  const day = data?.pantryDayDeltas ?? {};
  const cooked = data?.cookedDeltas ?? {};
  const deltas = [];
  const genOut = {};
  const dayOut = {};
  const cookedOut = {};
  // Nunca reconciliamos por menuId null: protege los buckets legacy sin
  // atribución de que una llamada con menuId real los arrastre por error.
  const match = menuId != null;
  for (const [k, b] of Object.entries(gen)) {
    if (match && bucketMenuId(b) === menuId) deltas.push(...bucketDeltas(b));
    else genOut[k] = b;
  }
  for (const [k, b] of Object.entries(day)) {
    if (match && bucketMenuId(b) === menuId) deltas.push(...bucketDeltas(b));
    else dayOut[k] = b;
  }
  for (const [k, arr] of Object.entries(cooked)) {
    if (match && cookedKeyMenuId(k) === menuId) deltas.push(...(Array.isArray(arr) ? arr : []));
    else cookedOut[k] = arr;
  }
  return { deltas, genOut, dayOut, cookedOut };
}

/**
 * Igual que collectMenuPantryDeltas pero para varios menús a la vez (p. ej. el
 * invitado que reemplaza su menú y pierde todos los anteriores del histórico).
 */
export function reconcileMenusRemoval(data, menuIds) {
  let cur = {
    pantryGenDeltas: data?.pantryGenDeltas ?? {},
    pantryDayDeltas: data?.pantryDayDeltas ?? {},
    cookedDeltas: data?.cookedDeltas ?? {},
  };
  const deltas = [];
  for (const id of menuIds ?? []) {
    const r = collectMenuPantryDeltas(cur, id);
    deltas.push(...r.deltas);
    cur = { pantryGenDeltas: r.genOut, pantryDayDeltas: r.dayOut, cookedDeltas: r.cookedOut };
  }
  return { deltas, genOut: cur.pantryGenDeltas, dayOut: cur.pantryDayDeltas, cookedOut: cur.cookedDeltas };
}

/** Quita de la lista de platos cocinados los que pertenecían a un menú. */
export function stripCookedDishesForMenu(cookedDishes, menuId) {
  if (!Array.isArray(cookedDishes)) return [];
  return cookedDishes.filter((k) => cookedKeyMenuId(k) !== menuId);
}

/** Igual, para varios menús. */
export function stripCookedDishesForMenuList(cookedDishes, menuIds) {
  if (!Array.isArray(cookedDishes)) return [];
  const set = new Set(menuIds ?? []);
  return cookedDishes.filter((k) => !set.has(cookedKeyMenuId(k)));
}
