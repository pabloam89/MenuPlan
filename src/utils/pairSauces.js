import salsas from "../data/recipes/salsas.json";

// Qué SAUCE_COMPAT_TAGS activa cada plato, a partir de category/mainProtein.
// Deliberadamente NO exhaustivo: solo cubre los ejes que ya existen en el
// esquema (mainProtein, category) — nunca se infiere de texto libre.
const PROTEIN_TAG = {
  ternera: "carne_roja",
  cerdo: "carne_roja",
  pollo: "carne_blanca",
  pavo: "carne_blanca",
  pescado_blanco: "pescado_blanco",
  pescado_azul: "pescado_azul",
  marisco: "marisco",
  huevo: "huevos",
};

function tagsForRecipe(recipe) {
  const tags = new Set();
  const proteinTag = PROTEIN_TAG[recipe?.mainProtein];
  if (proteinTag) tags.add(proteinTag);
  if (recipe?.category === "ensaladas_verduras") {
    tags.add("ensaladas");
    tags.add("verduras");
  }
  return tags;
}

// Hash determinista y estable (mismo plato -> misma salsa sugerida siempre,
// para que no "salte" entre aperturas de la ficha).
function stableIndex(id, length) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h % length;
}

/**
 * Salsa sugerida para un plato, o null si no aplica.
 *
 * Solo actúa sobre recetas con `canReceiveSauce: true` — un flag curado a
 * mano (ver recipeSchema.js) que evita sugerir salsa sobre platos que ya
 * llevan su sabor integrado ("Merluza en salsa verde", "Ensalada César").
 * Respeta `recipe.sauceId` si ya viene fijado; si no, elige entre las salsas
 * de `salsas.json` cuyo `sauceCompat` intersecta con los tags del plato.
 *
 * @param {Object} recipe - receta del catálogo (forma camelCase)
 * @param {Object[]} [catalog] - catálogo de salsas, por defecto salsas.json
 * @returns {Object|null}
 */
export function sauceForRecipe(recipe, catalog = salsas) {
  if (!recipe?.canReceiveSauce) return null;
  if (recipe.sauceId) return catalog.find((s) => s.id === recipe.sauceId) ?? null;

  const tags = tagsForRecipe(recipe);
  if (tags.size === 0) return null;

  const candidates = catalog.filter((s) => s.sauceCompat?.some((t) => tags.has(t)));
  if (candidates.length === 0) return null;

  return candidates[stableIndex(recipe.id, candidates.length)];
}

/**
 * Todas las salsas compatibles con un plato (para un selector "cambiar
 * salsa"), en el mismo orden estable que sauceForRecipe.
 */
export function sauceOptionsForRecipe(recipe, catalog = salsas) {
  if (!recipe?.canReceiveSauce) return [];
  const tags = tagsForRecipe(recipe);
  if (tags.size === 0) return [];
  return catalog.filter((s) => s.sauceCompat?.some((t) => tags.has(t)));
}

const WEEKEND_SLUGS = new Set(["sab", "dom"]);
// Entre semana solo se ofrecen salsas de preparación rápida — una reducción
// de 30 min no encaja en un martes cualquiera. El finde no hay tope: es
// justo el hueco para las que llevan más curro (romesco, Pedro Ximénez...).
const WEEKDAY_MAX_SAUCE_TIME = 15;
// Cuántos platos de la semana reciben salsa AUTOMÁTICA como máximo (no
// cuenta lo que el usuario haya fijado a mano, eso siempre se respeta) — la
// idea es que sea un toque ocasional que se note, no que cada cena de la
// semana lleve salsa y el menú parezca una competición de cocina.
const DEFAULT_MAX_AUTO_SAUCES_PER_WEEK = 3;

/**
 * Empareja platos "canReceiveSauce" con una salsa compatible para toda la
 * semana — mismo patrón que pairGarnishes.js, pero mucho más simple: sin
 * reglas de carbohidrato ni tope de kcal, solo variedad (no repetir salsa en
 * la semana si hay alternativa) y el filtro de tiempo entre semana/finde.
 *
 * Una salsa fijada a mano (fixedDishes.sauceId vía pinnedByRecipeId, o
 * recipe.sauceId ya presente en el plato) siempre gana y no cuenta contra el
 * tope semanal — es una elección explícita del usuario, no una sugerencia.
 *
 * @param {Array<{slotId: string, recipeId: string, garnishId?: string}>} slotAssignments
 * @param {Object} poolById - { [recipeId]: catalogRecipe }
 * @param {Object<string,string>} [pinnedByRecipeId] - { [recipeId]: sauceId }
 * @param {{sauceCatalog?: Object[], maxPerWeek?: number}} [opts]
 * @returns {Array<{slotId: string, recipeId: string, garnishId?: string, sauceId?: string}>}
 */
export function pairSauces(slotAssignments, poolById, pinnedByRecipeId = {}, opts = {}) {
  const { sauceCatalog = salsas, maxPerWeek = DEFAULT_MAX_AUTO_SAUCES_PER_WEEK } = opts;
  const usedSauceIds = new Set();
  let autoAssigned = 0;

  // Orden de consideración aleatorio para que no sean siempre los mismos
  // platos (los primeros del día/semana) los que se llevan la salsa cuando
  // hay más candidatos elegibles que hueco en el tope semanal.
  const order = slotAssignments.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }

  const result = slotAssignments.map((s) => ({ ...s }));

  for (const idx of order) {
    const slot = result[idx];
    const recipe = poolById[slot.recipeId];
    if (!recipe?.canReceiveSauce) continue;

    const pinnedId = pinnedByRecipeId[slot.recipeId] ?? recipe.sauceId;
    if (pinnedId) {
      const sauce = sauceCatalog.find((s) => s.id === pinnedId);
      if (sauce) {
        slot.sauceId = sauce.id;
        usedSauceIds.add(sauce.id);
      }
      continue; // Fijado a mano: siempre se respeta, no cuenta contra el tope.
    }

    if (autoAssigned >= maxPerWeek) continue;

    const daySlug = slot.slotId.split("_")[0];
    const isWeekend = WEEKEND_SLUGS.has(daySlug);
    let candidates = sauceOptionsForRecipe(recipe, sauceCatalog);
    if (!isWeekend) {
      const quick = candidates.filter((s) => (s.time ?? 99) <= WEEKDAY_MAX_SAUCE_TIME);
      if (quick.length > 0) candidates = quick;
    }
    const fresh = candidates.filter((s) => !usedSauceIds.has(s.id));
    const pool = fresh.length > 0 ? fresh : candidates;
    if (pool.length === 0) continue;

    const sauce = pool[Math.floor(Math.random() * pool.length)];
    slot.sauceId = sauce.id;
    usedSauceIds.add(sauce.id);
    autoAssigned++;
  }

  return result;
}
