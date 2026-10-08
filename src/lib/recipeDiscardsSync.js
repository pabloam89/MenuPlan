// Descartes de recetas («No me gusta» y enfriamientos): solo la mezcla.
//
// La nube va en householdDiscardsSync.js, contra `household_recipe_discards`
// (0017; escriben titular y cotitular desde la 0071). Antes, sin casa activa,
// se escribía en `user_recipe_discards` (0010), pero esa tabla nunca llegó a
// producción y los descartes son de la casa, no de cada usuario
// (docs/datos/PRINCIPIOS.md §1). La copia local (`data.discards`) sigue siendo
// la de trabajo.

/** @typedef {{ forever: string[], cooldownUntil: Record<string, number> }} DiscardsState */

/**
 * Merges cloud discards into local ones. Forever is a pure union (if either
 * side ever marked a recipe permanently discarded, it stays discarded — a
 * merge should never silently un-discard something). Cooldowns take the
 * later expiry per id, so a merge never shortens an active cooldown.
 */
export function mergeDiscards(local = { forever: [], cooldownUntil: {} }, remote = { forever: [], cooldownUntil: {} }) {
  const forever = Array.from(new Set([...(local.forever ?? []), ...(remote.forever ?? [])]));
  const cooldownUntil = { ...(local.cooldownUntil ?? {}) };
  for (const [id, ts] of Object.entries(remote.cooldownUntil ?? {})) {
    cooldownUntil[id] = Math.max(cooldownUntil[id] ?? 0, ts);
  }
  return { forever, cooldownUntil };
}
