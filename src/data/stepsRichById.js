/**
 * Índice id → stepsRich leído directamente de los JSON del bundle.
 *
 * recipeCatalog.js se evalúa una sola vez (top-level await + Supabase gate),
 * así que en dev los cambios a ensaladas_verduras.json etc. no siempre
 * invalidan recipeCatalogById. Este módulo usa import.meta.glob: Vite recarga
 * el índice en cuanto cambia cualquier fichero de receta.
 */
const recipeModules = import.meta.glob("./recipes/*.json", { eager: true });

function isValidRichSteps(steps) {
  return Array.isArray(steps)
    && steps.length > 0
    && steps.every((s) => s && typeof s.text === "string" && s.text.length > 0);
}

function buildIndex() {
  const rich = {};
  const plain = {};
  for (const mod of Object.values(recipeModules)) {
    const recipes = mod.default ?? mod;
    if (!Array.isArray(recipes)) continue;
    for (const r of recipes) {
      if (isValidRichSteps(r.stepsRich)) rich[r.id] = r.stepsRich;
      if (Array.isArray(r.steps) && r.steps.length > 0) plain[r.id] = r.steps;
    }
  }
  return { rich, plain };
}

const { rich: richIndex, plain: plainIndex } = buildIndex();
export const stepsRichById = richIndex;
export const stepsPlainById = plainIndex;

/**
 * Pasos rich del bundle. Prueba, por orden: el propio objeto y el id de
 * catálogo. NUNCA el nombre: 75 nombres (212 recetas) se repiten en el catálogo
 * y 53 de ellos mezclan Estrella y fondo («puré de calabaza» era un puré de
 * bebé o una guarnición de adultos con jengibre según quién ganara). Sin id de
 * catálogo ni pasos propios, devuelve null y la ficha usa los pasos planos del
 * objeto: menos pasos antes que los de otro plato. Lo vigila stepsRichById.test.js.
 */
export function resolveRichSteps(recipeId, recipeObj = null) {
  if (isValidRichSteps(recipeObj?.stepsRich)) return recipeObj.stepsRich;
  if (recipeId && isValidRichSteps(stepsRichById[recipeId])) return stepsRichById[recipeId];
  return null;
}

/** Pasos planos del plato principal; evita listas fusionadas con guarnición en menús viejos. */
export function resolvePlainSteps(recipeId, recipeObj = null, { garnishLinked = false } = {}) {
  const catalog = recipeId ? stepsPlainById[recipeId] ?? null : null;
  const fromRecipe = recipeObj?.steps ?? [];
  if (garnishLinked && catalog?.length && fromRecipe.length > catalog.length) return catalog;
  if (fromRecipe.length > 0) return fromRecipe;
  return catalog ?? [];
}
