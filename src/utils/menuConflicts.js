// Detects when an already-generated menuPlan contains a dish that no longer
// respects a HARD restriction (allergy, or non-adaptable intolerance/dietary
// state) currently set on a member of that dish's group.
//
// menuPlan is a snapshot: once generated, nothing re-validates it against
// later edits to data.members. Restrictions CAN be edited after a menu
// exists (e.g. the post-generation "Tu perfil" sheet in Menu.jsx lets the
// user add an allergy and explicitly decline regeneration via "No, solo
// guardar cambios") and, until now, that left the stale menuPlan on screen
// with zero indication that a dish might violate the new restriction. This
// is the deterministic backstop that detects that drift so the UI can warn
// instead of silently continuing to serve a now-unsafe dish.
//
// It intentionally mirrors the exact exclusion logic filterRecipes.js applies
// at generation time (same allergen/intolerance helpers, same hard-vs-adaptable
// split), so "would this dish have been filtered out today?" is answered
// identically here and there — this is not a second, potentially-drifting
// implementation of the safety rules.
//
// Scope: only the two HARD-exclusion axes (allergies, non-adaptable
// intolerances/dietary states) are checked. Health profiles are an
// intentional soft bias, never an exclusion (see aiPlanner.js SYSTEM_PROMPT
// "PERFILES DE SALUD" + validateMenu.js rule 10), and dislikes are a taste
// preference, not a safety concern — neither belongs in a safety warning.
//
// Known limitation (pre-existing, not introduced here): a paired garnish's
// ingredients are merged into the dish's `ingredients` array (see
// aiPlanner.js#applyGarnishToRecipe) but NOT into its declared `allergens`
// array. A garnish-only allergen that isn't ingredient-name-detectable (one of
// the 8 EU allergens outside INGREDIENT_ALLERGEN_KEYWORDS in lib/allergens.js)
// added as a restriction after generation could be missed here. Every
// ingredient-detectable allergen and every intolerance/dietary state is still
// fully covered, since garnish ingredient names ARE included.

import { membersOfGroup } from "../lib/groups.js";
import { normalizeAllergenId, recipeIngredientsHitAllergens, EU_ALLERGENS } from "../lib/allergens.js";
import { recipeHitsIntolerances, INTOLERANCE_RULES } from "../lib/intolerances.js";
import { isAdaptableRestriction } from "../lib/substitutions.js";
import { RECIPES_BY_ID } from "../data/recipes.js";

/**
 * @param {Object} data - app state ({ members, groups })
 * @param {Object} menuPlan - { [groupId]: { [dayMealKey]: { recipeId, firstRecipeId } } }
 * @param {Object<string,Object>} [recipesById] - recipe lookup (defaults to the
 *   live runtime catalogue); overridable so tests never depend on real catalog
 *   data or on registerRecipes() having run.
 * @returns {Array<{
 *   groupId: string, groupLabel: string, planKey: string, course: "firstRecipeId"|"recipeId",
 *   recipeId: string, recipeName: string,
 *   restrictionType: "allergy"|"intolerance", restrictionId: string, restrictionLabel: string,
 * }>}
 */
export function findMenuRestrictionConflicts(data, menuPlan, recipesById = RECIPES_BY_ID) {
  const conflicts = [];
  const groups = data?.groups ?? [];
  const members = data?.members ?? [];

  for (const group of groups) {
    const groupPlan = menuPlan?.[group.id];
    if (!groupPlan || typeof groupPlan !== "object") continue;

    const groupMembers = membersOfGroup(group, members);
    if (groupMembers.length === 0) continue;

    // Same union-of-restrictions the group's menu was (or would be) filtered
    // against — see aiPlanner.js#buildGroupContext.
    const blockedAllergens = new Set(
      groupMembers.flatMap((m) => m.allergies ?? []).map(normalizeAllergenId),
    );
    const hardIntolerances = new Set(
      [
        ...groupMembers.flatMap((m) => m.intolerances ?? []),
        ...groupMembers.flatMap((m) => m.dietaryStates ?? []),
      ].filter((id) => !isAdaptableRestriction(id)),
    );
    if (blockedAllergens.size === 0 && hardIntolerances.size === 0) continue;

    for (const [planKey, slot] of Object.entries(groupPlan)) {
      if (!slot || typeof slot !== "object") continue;

      for (const course of ["firstRecipeId", "recipeId"]) {
        const recipeId = slot[course];
        if (!recipeId) continue;
        const recipe = recipesById[recipeId];
        if (!recipe) continue;

        if (blockedAllergens.size > 0) {
          const declaredHit = (recipe.allergens ?? [])
            .map(normalizeAllergenId)
            .find((id) => blockedAllergens.has(id));
          const names = (recipe.ingredients ?? []).map((ing) => ing.name);
          const ingredientHitId = declaredHit
            ? null
            : Array.from(blockedAllergens).find((id) =>
                recipeIngredientsHitAllergens(names, new Set([id])),
              );
          const hitId = declaredHit ?? ingredientHitId;
          if (hitId) {
            conflicts.push({
              groupId: group.id,
              groupLabel: group.label,
              planKey,
              course,
              recipeId,
              recipeName: recipe.name,
              restrictionType: "allergy",
              restrictionId: hitId,
              restrictionLabel: EU_ALLERGENS[hitId]?.label ?? hitId,
            });
          }
        }

        if (hardIntolerances.size > 0) {
          const hitId = Array.from(hardIntolerances).find((id) =>
            recipeHitsIntolerances(recipe, [id]),
          );
          if (hitId) {
            conflicts.push({
              groupId: group.id,
              groupLabel: group.label,
              planKey,
              course,
              recipeId,
              recipeName: recipe.name,
              restrictionType: "intolerance",
              restrictionId: hitId,
              restrictionLabel: INTOLERANCE_RULES[hitId]?.label ?? hitId,
            });
          }
        }
      }
    }
  }

  return conflicts;
}

/**
 * Human-readable one-liner for the menu banner — deterministic, no LLM.
 * @param {ReturnType<typeof findMenuRestrictionConflicts>} conflicts
 */
export function summarizeMenuRestrictionConflicts(conflicts) {
  if (!conflicts || conflicts.length === 0) return null;
  const dishCount = new Set(conflicts.map((c) => `${c.groupId}:${c.planKey}:${c.course}`)).size;
  const labels = Array.from(new Set(conflicts.map((c) => c.restrictionLabel)));
  const dishWord = dishCount === 1 ? "plato" : "platos";
  return `${dishCount} ${dishWord} del menú actual podría${dishCount === 1 ? "" : "n"} no respetar: ${labels.join(", ")}.`;
}
