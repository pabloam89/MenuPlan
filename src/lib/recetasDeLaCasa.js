/**
 * Las favoritas y los descartes de la casa, de sus filas a la forma que lee el
 * motor (`data.recipeVotes`, `data.discards`). Puro y sin dependencias: lo
 * usan la app (householdFavoritesSync.js, householdDiscardsSync.js) y Lola
 * (api/_bot/casa.js), para que los dos lean la misma fuente igual (#939).
 *
 * La fuente son las tablas de la casa, `household_favorites` y
 * `household_recipe_discards`. household_state no las guarda: si Lola no las
 * cargaba, sus menús no veían las favoritas ni los «No me gusta».
 */

// household_favorites.scope es texto, no text[] como recipe_votes.scope: null
// es «todos» y una lista de grupos va separada por comas (así la copió 0018).
// La app trabaja con "all" | string[] (favScopeOf), y aquí se traduce.

/** "all" | string[] | null → valor de la columna (null = todos). */
export function scopeToColumn(favScope) {
  return Array.isArray(favScope) && favScope.length ? favScope.join(",") : null;
}

/** Valor de la columna → "all" | string[]. */
export function columnToScope(scope) {
  const grupos = typeof scope === "string"
    ? scope.split(",").map((s) => s.trim()).filter(Boolean)
    : [];
  return grupos.length ? grupos : "all";
}

/**
 * Filas de household_favorites → { recipeId: { scope } }.
 * @param {{ recipe_id: string, scope?: string|null }[]} filas
 */
export function favoritasDeFilas(filas) {
  /** @type {Record<string, { scope?: string|null }>} */
  const out = {};
  for (const row of filas ?? []) out[row.recipe_id] = { scope: row.scope ?? null };
  return out;
}

/**
 * Las favoritas de la casa con la forma que lee recipeVotes.js ({ v, fav }).
 * La casa no guarda notas: `v` se toma de `personal` para que la mezcla (en
 * la que este mapa manda) no borre el 👍/👎 propio de esas recetas.
 * @param {Record<string, { scope?: string|null }>} favorites
 * @param {Record<string, any>} [personal]  el recipeVotes de la persona
 * @param {(entry: any) => ('up'|'down'|null)} [notaDe]  voteOf de recipeVotes.js
 * @returns {Record<string, { v?: 'up'|'down', fav: 'all'|string[] }>}
 */
export function votosDeFavoritas(favorites, personal = {}, notaDe = () => null) {
  const out = {};
  for (const [recipeId, meta] of Object.entries(favorites ?? {})) {
    out[recipeId] = { v: notaDe(personal?.[recipeId]) ?? undefined, fav: columnToScope(meta?.scope) };
  }
  return out;
}

/**
 * La casa de Lola (api/_bot/casa.js) como la lee el motor: su data, más sus
 * favoritas y descartes (`casa.deLaCasa`). Solo para elegir platos: lo que se
 * guarda sigue siendo `casa.state.data`, que no los lleva. Sin `deLaCasa` (la
 * lectura falló), la data tal cual: el motor sigue como antes.
 */
export const datosDelMotor = (casa) => ({ ...(casa?.state?.data ?? {}), ...(casa?.deLaCasa ?? {}) });

/**
 * Filas de household_recipe_discards → { forever, cooldownUntil }. Un descarte
 * temporal ya pasado no cuenta.
 * @param {{ recipe_id: string, is_permanent?: boolean, cooldown_until?: string|null }[]} filas
 * @param {number} [ahora]
 */
export function descartesDeFilas(filas, ahora = Date.now()) {
  const forever = [];
  /** @type {Record<string, number>} */
  const cooldownUntil = {};
  for (const row of filas ?? []) {
    if (row.is_permanent) {
      forever.push(row.recipe_id);
    } else if (row.cooldown_until) {
      const ts = new Date(row.cooldown_until).getTime();
      if (ts > ahora) cooldownUntil[row.recipe_id] = ts;
    }
  }
  return { forever, cooldownUntil };
}
