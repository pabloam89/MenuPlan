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
 * Ya NO existe un flag `canReceiveSauce`: el catálogo no combina nada. Los
 * platos son los que son y, si llevan salsa, la llevan escrita dentro (73 del
 * Recetario Estrella la traen en el propio nombre). Lo único que queda es
 * respetar la que la receta declare suya en `sauceId`, y ofrecer alternativas
 * compatibles cuando el usuario abre el selector de "cambiar salsa" — que es
 * una elección explícita suya, no una sugerencia de la app.
 *
 * @param {Object} recipe - receta del catálogo (forma camelCase)
 * @param {Object[]} [catalog] - catálogo de salsas, por defecto salsas.json
 * @returns {Object|null}
 */
export function sauceForRecipe(recipe, catalog = salsas) {
  if (!recipe) return null;
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
  if (!recipe) return [];
  const tags = tagsForRecipe(recipe);
  if (tags.size === 0) return [];
  return catalog.filter((s) => s.sauceCompat?.some((t) => tags.has(t)));
}

/**
 * Aplica al menú las salsas FIJADAS: las que el usuario eligió a mano para un
 * plato (fixedDishes.sauceId, vía pinnedByRecipeId) y las que la propia receta
 * declara suyas en `sauceId`.
 *
 * Ya no empareja nada por su cuenta. El emparejado automático existía cuando
 * el catálogo se montaba combinando piezas; el Recetario Estrella no funciona
 * así — cada plato viene escrito entero — y añadirle una salsa producía cosas
 * como "Lenguado meunière con mantequilla y limón con alcachofas confitadas".
 * Quien quiera "algo con salsa" tiene 73 platos que ya la llevan dentro.
 *
 * @param {Array<{slotId: string, recipeId: string, garnishId?: string}>} slotAssignments
 * @param {Object} poolById - { [recipeId]: catalogRecipe }
 * @param {Object<string,string>} [pinnedByRecipeId] - { [recipeId]: sauceId }
 * @param {{sauceCatalog?: Object[], maxPerWeek?: number}} [opts]
 * @returns {Array<{slotId: string, recipeId: string, garnishId?: string, sauceId?: string}>}
 */
export function pairSauces(slotAssignments, poolById, pinnedByRecipeId = {}, opts = {}) {
  const { sauceCatalog = salsas } = opts;
  const result = slotAssignments.map((s) => ({ ...s }));

  for (const slot of result) {
    const recipe = poolById[slot.recipeId];
    if (!recipe) continue;
    // SOLO lo fijado a mano. La salsa que se pone el usuario (o la que la
    // receta declara suya en `sauceId`) se respeta siempre; la app no añade
    // ninguna por su cuenta.
    const pinnedId = pinnedByRecipeId[slot.recipeId] ?? recipe.sauceId;
    if (!pinnedId) continue;
    const sauce = sauceCatalog.find((s) => s.id === pinnedId);
    if (sauce) slot.sauceId = sauce.id;
  }

  return result;
}
