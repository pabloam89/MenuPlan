// Ingredient substitutions that let a recipe STAY in the pool instead of being
// dropped by a dietary restriction. The guiding rule: a swap is only allowed
// when it is invisible to everyone else at the table (the dish tastes/looks the
// same), so we can adapt the family menu without forking an ad-hoc menu.
//
// This covers two cases:
//   - Lactose INTOLERANCE (lactosa_fina): swapping dairy for its lactose-free
//     equivalent changes nothing for the rest of the family. Deliberately does
//     NOT cover the milk ALLERGEN — "sin lactosa" products still contain milk
//     protein, so an allergy must keep hard-excluding.
//   - Cooking alcohol for embarazo/lactancia (alcohol_cocina): real
//     alcohol-free wine/beer/cider are normal supermarket products in Spain,
//     so a splash of wine in a sauce becomes invisible to the rest of the
//     table. This is NOT a claim that it's risk-free (alcohol-free beer/wine
//     in Spain isn't always strictly 0.0%) — it's simply a real, named product
//     swap, same spirit as the lactose case.
//
// Everything else under embarazo/lactancia (raw fish, cured meats, unpasteurized
// cheese, high-mercury fish) and fructosa/sorbitol has no neutral 1:1 swap, so
// those stay as hard exclusions in filterRecipes.

import { INTOLERANCE_RULES } from "./intolerances.js";
import { compileKeywordRegex, normalizeText } from "./recipeText.js";
import { resolveIngredient, substitutionFor } from "./ingredients.js";

/** Append a suffix once (idempotent): "Nata" + "sin lactosa" → "Nata sin lactosa". */
function withSuffix(name, suffix) {
  const norm = normalizeText(name);
  if (norm.includes(normalizeText(suffix))) return name;
  return `${name} ${suffix}`;
}

// Keyed by restriction id (must match a key in INTOLERANCE_RULES).
//
// `keywords` ya NO decide qué se sustituye — eso lo dice el catálogo de
// ingredientes (ver planAdaptations). Se conserva porque sigue haciendo falta
// para detectar el conflicto que vive solo en el NOMBRE del plato, donde no hay
// ingrediente que resolver.
//
// `rename` sí sigue mandando en el texto: conserva la redacción de la receta y
// le añade el sufijo ("Leche entera" → "Leche entera sin lactosa"). El catálogo
// guarda el nombre canónico del producto ("Leche sin lactosa"), que sirve para
// buscarlo en el súper pero perdería el matiz al pintarlo en la receta.
export const SUBSTITUTION_RULES = {
  lactosa_fina: {
    // Short tag surfaced in the UI ("Adaptado: sin lactosa").
    label: "sin lactosa",
    keywords: INTOLERANCE_RULES.lactosa_fina.keywords,
    // Every dairy item has a lactose-free supermarket equivalent, and the label
    // reads naturally appended to any of them ("Nata para cocinar sin lactosa").
    rename: (name) => withSuffix(name, "sin lactosa"),
  },
  alcohol_cocina: {
    label: "sin alcohol",
    keywords: INTOLERANCE_RULES.alcohol_cocina.keywords,
    // "Vino blanco sin alcohol", "Cerveza sin alcohol" — real products, and the
    // rename still reads naturally even when alcohol is the dish's namesake
    // (e.g. "Pollo a la cerveza" → its "Cerveza" line becomes "Cerveza sin alcohol").
    rename: (name) => withSuffix(name, "sin alcohol"),
  },
};

const RULE_RE = Object.fromEntries(
  Object.entries(SUBSTITUTION_RULES).map(([id, rule]) => [id, compileKeywordRegex(rule.keywords)]),
);

/** Restriction ids that this module knows how to adapt (vs. hard-exclude). */
export function isAdaptableRestriction(id) {
  return Boolean(SUBSTITUTION_RULES[id]);
}

/**
 * Work out how to adapt a recipe for a set of adaptable restrictions.
 *
 * Matching is ingredient-level (so we know exactly which line to rename). If a
 * restriction's keyword only appears in the recipe NAME but in no ingredient,
 * there's nothing to rename → the recipe is `blocked` (caller should exclude
 * it), because silently keeping it would misrepresent the dish.
 *
 * @param {Object} recipe - catalog/frontend shape with `ingredients[].name`
 * @param {Iterable<string>} restrictionIds
 * @returns {{ swaps: Array<{from:string,to:string,restriction:string,label:string}>, blocked:boolean }}
 */
export function planAdaptations(recipe, restrictionIds) {
  const swaps = [];
  let blocked = false;

  for (const id of restrictionIds ?? []) {
    const rule = SUBSTITUTION_RULES[id];
    const re = RULE_RE[id];
    if (!rule || !re) continue;

    let matchedIngredient = false;
    for (const ing of recipe?.ingredients ?? []) {
      if (!ing?.name) continue;

      // El choque lo dice el catálogo, no las palabras clave. Antes bastaba con
      // que el nombre contuviera "leche" o "vino", y eso producía adaptaciones
      // inventadas que llegaban al usuario: "Leche de coco sin lactosa" (no
      // lleva lactosa), "Vinagre sin alcohol" (ya fermentó en ácido acético) o
      // "Ron sin alcohol" (no es un producto de súper).
      const ingredient = resolveIngredient(ing.name);
      if (!ingredient?.conflictsWith?.includes(id)) continue;
      matchedIngredient = true;

      // Choca pero no tiene recambio real (mozzarella sin lactosa, ron sin
      // alcohol). Antes se renombraba igual y la receta se daba por adaptada;
      // ahora se bloquea, que es la verdad: no se puede adaptar.
      if (!substitutionFor(ing.name, id)) {
        blocked = true;
        continue;
      }

      const to = rule.rename(ing.name);
      if (normalizeText(to) !== normalizeText(ing.name)) {
        swaps.push({ from: ing.name, to, restriction: id, label: rule.label });
      }
    }

    // Conflict lives only in the dish name (e.g. "Batido de leche" with no
    // itemized "leche") — we can't rename a phantom ingredient, so bail out.
    // Aquí sí siguen mandando las palabras clave: no hay ingrediente que
    // resolver, solo el título del plato.
    if (!matchedIngredient && re.test(normalizeText(recipe?.name))) {
      blocked = true;
    }
  }

  return { swaps, blocked };
}

/**
 * Build a Map<originalName, newName> for the swaps of a recipe, used when
 * rebuilding a recipe's ingredient list during hydration.
 * @param {Object} recipe
 * @param {Iterable<string>} restrictionIds
 * @returns {{ renameByName: Map<string,string>, adaptations: Array<{from:string,to:string,label:string}> }}
 */
export function buildAdaptationMap(recipe, restrictionIds) {
  const { swaps } = planAdaptations(recipe, restrictionIds);
  const renameByName = new Map(swaps.map((s) => [s.from, s.to]));
  const adaptations = swaps.map(({ from, to, label }) => ({ from, to, label }));
  return { renameByName, adaptations };
}
