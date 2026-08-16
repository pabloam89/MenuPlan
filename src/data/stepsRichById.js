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

function normalizeName(name) {
  return String(name ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+con\s+.*$/i, "") // "Escalope de pollo con puré…" → "escalope de pollo"
    .trim();
}

function buildIndex() {
  const rich = {};
  const plain = {};
  const richByName = {};
  const plainByName = {};
  for (const mod of Object.values(recipeModules)) {
    const recipes = mod.default ?? mod;
    if (!Array.isArray(recipes)) continue;
    for (const r of recipes) {
      const nameKey = normalizeName(r.name);
      if (isValidRichSteps(r.stepsRich)) {
        rich[r.id] = r.stepsRich;
        if (nameKey) richByName[nameKey] = r.stepsRich;
      }
      if (Array.isArray(r.steps) && r.steps.length > 0) {
        plain[r.id] = r.steps;
        if (nameKey) plainByName[nameKey] = r.steps;
      }
    }
  }
  return { rich, plain, richByName, plainByName };
}

const { rich: richIndex, plain: plainIndex, richByName, plainByName } = buildIndex();
export const stepsRichById = richIndex;
export const stepsPlainById = plainIndex;

/**
 * Pasos rich del bundle. Prueba, por orden: el propio objeto, id de catálogo,
 * y por último el nombre normalizado (sin "… con guarnición"), para cubrir
 * menús persistidos cuyo id lleva prefijo de grupo o quedó desalineado.
 */
export function resolveRichSteps(recipeId, recipeObj = null) {
  if (isValidRichSteps(recipeObj?.stepsRich)) return recipeObj.stepsRich;
  if (recipeId && isValidRichSteps(stepsRichById[recipeId])) return stepsRichById[recipeId];
  const nameKey = normalizeName(recipeObj?.name);
  if (nameKey && isValidRichSteps(richByName[nameKey])) return richByName[nameKey];
  return null;
}

/** Pasos planos del plato principal; evita listas fusionadas con guarnición en menús viejos. */
export function resolvePlainSteps(recipeId, recipeObj = null, { garnishLinked = false } = {}) {
  const nameKey = normalizeName(recipeObj?.name);
  const catalog = (recipeId ? stepsPlainById[recipeId] : null) ?? (nameKey ? plainByName[nameKey] : null);
  const fromRecipe = recipeObj?.steps ?? [];
  if (garnishLinked && catalog?.length && fromRecipe.length > catalog.length) return catalog;
  if (fromRecipe.length > 0) return fromRecipe;
  return catalog ?? [];
}
