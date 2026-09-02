/**
 * Catálogo canónico de ingredientes y su resolutor desde texto libre.
 *
 * Hoy el mismo producto se escribe de muchas formas por toda la app —
 * "Aceite de oliva" / "Aceite de oliva virgen extra", "Perejil" / "Perejil
 * fresco" — y cada módulo que necesita saber algo de un ingrediente (pasillo,
 * alérgeno, imagen, precio) lo deduce con su propia tabla de palabras clave.
 * Son seis vocabularios distintos que pueden equivocarse por separado.
 *
 * Este módulo es la fuente única: 374 ingredientes con id estable, generados
 * desde el catálogo real por scripts/build-ingredient-catalog.mjs.
 *
 * FASE 1 — NADIE LO CONSUME TODAVÍA, a propósito. Se introduce sin cambiar el
 * comportamiento de nada; los consumidores se migran uno a uno después. Por eso
 * los helpers de conveniencia (ingredientAisleFor, etc.) caen a la heurística
 * de siempre cuando un nombre no está en el catálogo: las recetas de usuario,
 * las generadas por IA y los tickets escaneados traen texto libre que nunca
 * estará aquí, así que el catálogo AÑADE precisión donde la hay y nunca quita
 * cobertura donde no.
 */

import ingredientsJson from "../data/ingredients.json";
import substitutionsJson from "../data/ingredientSubstitutions.json";
import { validateIngredients } from "../data/ingredientSchema.js";
import { createIngredientResolver } from "./ingredientResolver.js";
import { guessShoppingAisle, guessIngredientCategory } from "./ingredientCategories.js";
import { gramsForRecipeQuantity } from "./kitchenUnits.js";

// Mismo criterio que recipeCatalog.js: el JSON va bundleado con la app, así que
// si está roto tiene que fallar de forma ruidosa e incondicional. El generador
// ya valida antes de escribir, y scripts/validate-catalog.mjs lo revalida en
// CI; esto es la última red.
const errors = validateIngredients(ingredientsJson);
if (errors.length > 0) {
  throw new Error(
    `Catálogo de ingredientes inválido (${errors.length} error/es):\n` +
      errors.map((e) => `  - ${e}`).join("\n"),
  );
}

/** @typedef {(typeof ingredientsJson)[number]} Ingredient */

export const ingredientCatalog = ingredientsJson;

// La lógica de resolución vive en ingredientResolver.js para que los scripts de
// Node (que leen el JSON con readFileSync, no con el import de Vite) usen
// exactamente la misma y no haya dos respuestas distintas a "qué ingrediente es
// este texto".
const resolver = createIngredientResolver(ingredientCatalog);

export const ingredientById = resolver.ingredientById;

/** Stems que resolverían a más de un ingrediente y por eso no se usan. */
export const AMBIGUOUS_STEMS = resolver.ambiguousStems;

/**
 * Id canónico de un ingrediente a partir de su nombre en texto libre.
 * @param {string} name
 * @returns {string|null} null si no está en el catálogo — NO es un error.
 */
export const resolveIngredientId = resolver.resolveIngredientId;

/**
 * El ingrediente completo, o null si el nombre no está en el catálogo.
 * @param {string} name
 * @returns {Ingredient|null}
 */
export const resolveIngredient = resolver.resolveIngredient;

// ── Helpers con fallback ─────────────────────────────────────────────────
// La forma en que los consumidores actuales se migrarán: preguntan al catálogo
// y, si no lo conoce, siguen haciendo exactamente lo de hoy.

/** Pasillo de súper, del catálogo si lo conoce y si no por heurística. */
export function ingredientAisleFor(name) {
  return resolveIngredient(name)?.aisle ?? guessShoppingAisle(name);
}

/** Categoría de despensa, del catálogo si lo conoce y si no por heurística. */
export function ingredientCategoryFor(name) {
  return resolveIngredient(name)?.category ?? guessIngredientCategory(name);
}

/**
 * Las líneas de ingrediente de una receta, resueltas contra el catálogo — el
 * equivalente en cliente de la tabla `recipe_ingredients` (Fase 2).
 *
 * `recipes.ingredients` (jsonb) SIGUE SIENDO la fuente de verdad y no se toca:
 * esto es una vista derivada que se calcula al vuelo. Por eso `rawName` se
 * conserva siempre — es lo que hay que pintar, no el nombre canónico. Una
 * receta que dice "Merluza o pescado blanco" tiene que seguir diciendo eso
 * aunque resuelva a `merluza`.
 *
 * `ingredientId` es null cuando el catálogo no conoce el nombre, que es lo
 * normal en recetas de usuario y de IA. No es un error y el llamante debe
 * tratarlo como "no lo sé", nunca como "no tiene".
 *
 * @param {{ingredients?: Array<{name: string, amount?: number, unit?: string}>}} recipe
 * @returns {Array<{position: number, rawName: string, amount: number|null, unit: string|null, ingredientId: string|null, ingredient: Ingredient|null}>}
 */
export function resolveRecipeIngredients(recipe) {
  return (recipe?.ingredients ?? []).map((line, position) => {
    const ingredient = resolveIngredient(line.name);
    return {
      position,
      rawName: line.name,
      amount: typeof line.amount === "number" ? line.amount : null,
      unit: line.unit ?? null,
      ingredientId: ingredient?.id ?? null,
      ingredient,
    };
  });
}

/**
 * Alérgenos de una receta DERIVADOS de sus ingredientes, en los dos niveles.
 *
 * No sustituye a `recipe.allergens`: ese campo es la declaración revisada y
 * manda siempre. Esto es la segunda opinión, y su utilidad es justamente
 * poder compararlas (`scripts/build-ingredient-catalog.mjs` genera ese informe).
 *
 * `unknownNames` lista los ingredientes que el catálogo no reconoce. Mientras
 * no esté vacío, el resultado es un MÍNIMO, no una lista completa — por eso se
 * devuelve en vez de tragárselo.
 *
 * @returns {{allergens: string[], cookingAllergens: string[], unknownNames: string[]}}
 */
export function deriveRecipeAllergens(recipe) {
  const allergens = new Set();
  const cookingAllergens = new Set();
  const unknownNames = [];

  for (const line of resolveRecipeIngredients(recipe)) {
    if (!line.ingredient) {
      unknownNames.push(line.rawName);
      continue;
    }
    for (const a of line.ingredient.allergens) allergens.add(a);
    for (const a of line.ingredient.cookingAllergens) cookingAllergens.add(a);
  }

  return {
    allergens: [...allergens].sort(),
    // Un alérgeno duro en cualquier ingrediente gana al nivel de cocinado de
    // otro: si el plato ya lleva sulfitos en unas aceitunas, el chorrito de
    // vino no añade nada que el usuario pueda evitar cambiando un producto.
    cookingAllergens: [...cookingAllergens].filter((a) => !allergens.has(a)).sort(),
    unknownNames,
  };
}

// ── Nutrición calculada (Fase 9) ─────────────────────────────────────────
//
// Suma la nutrición por 100g del catálogo (ver ingredientSchema.js#nutrition,
// poblada vía scripts/bedca-nutrition.mjs) sobre los ingredientes de una
// receta que SÍ convierten a gramos (gramsForRecipeQuantity, kitchenUnits.js)
// Y SÍ resuelven a un ingrediente con nutrición BEDCA. Un ingrediente que no
// cumple una de las dos cosas simplemente no suma — nunca lanza, nunca
// inventa un valor.
//
// `coverage` es la fracción de los gramos QUE PUDIMOS PESAR (no de la receta
// completa: un ingrediente en una unidad inconvertible es invisible tanto al
// numerador como al denominador) que además tenía nutrición BEDCA. Es la
// señal que decide si vale la pena sustituir la estimación de la IA
// (generateUserRecipeDraft, userRecipes.js) o dejarla como está.

/**
 * @param {{ingredients?: Array<{name: string, amount?: number, unit?: string}>}} recipe
 * @param {number} servings
 * @returns {{kcal:number, protein_g:number, carbs_g:number, fat_g:number, fiber_g:number|null, sugar_g:number|null, saturated_fat_g:number|null, sodium_mg:number|null, coverage:number} | null}
 *   `null` si no hay servings válidos o ningún ingrediente aportó nutrición.
 */
export function computeRecipeNutrition(recipe, servings) {
  if (!(servings > 0)) return null;

  const totals = { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0, fiber_g: 0, sugar_g: 0, saturated_fat_g: 0, sodium_mg: 0 };
  const hasSecondary = { fiber_g: false, sugar_g: false, saturated_fat_g: false, sodium_mg: false };
  let totalGrams = 0;
  let coveredGrams = 0;

  for (const line of resolveRecipeIngredients(recipe)) {
    const grams = gramsForRecipeQuantity(line.rawName, line.amount, line.unit);
    if (grams == null || grams <= 0) continue;
    totalGrams += grams;

    const nutrition = line.ingredient?.nutrition;
    if (!nutrition) continue;
    coveredGrams += grams;

    const factor = grams / 100;
    totals.kcal += nutrition.kcal100g * factor;
    totals.protein_g += nutrition.protein100g * factor;
    totals.carbs_g += nutrition.carbs100g * factor;
    totals.fat_g += nutrition.fat100g * factor;
    if (nutrition.fiber100g != null) { totals.fiber_g += nutrition.fiber100g * factor; hasSecondary.fiber_g = true; }
    if (nutrition.sugar100g != null) { totals.sugar_g += nutrition.sugar100g * factor; hasSecondary.sugar_g = true; }
    if (nutrition.saturatedFat100g != null) { totals.saturated_fat_g += nutrition.saturatedFat100g * factor; hasSecondary.saturated_fat_g = true; }
    if (nutrition.sodium100g != null) { totals.sodium_mg += nutrition.sodium100g * factor; hasSecondary.sodium_mg = true; }
  }

  if (coveredGrams === 0) return null;

  const perServing = (v, decimals = 1) => {
    const factor = 10 ** decimals;
    return Math.round((v / servings) * factor) / factor;
  };

  return {
    kcal: perServing(totals.kcal, 0),
    protein_g: perServing(totals.protein_g),
    carbs_g: perServing(totals.carbs_g),
    fat_g: perServing(totals.fat_g),
    fiber_g: hasSecondary.fiber_g ? perServing(totals.fiber_g) : null,
    sugar_g: hasSecondary.sugar_g ? perServing(totals.sugar_g) : null,
    saturated_fat_g: hasSecondary.saturated_fat_g ? perServing(totals.saturated_fat_g) : null,
    sodium_mg: hasSecondary.sodium_mg ? perServing(totals.sodium_mg, 0) : null,
    coverage: totalGrams > 0 ? Math.round((coveredGrams / totalGrams) * 1000) / 1000 : 0,
  };
}

// ── Sustituciones (Fase 3) ───────────────────────────────────────────────
//
// Lo que hoy hace substitutions.js concatenando strings sobre una lista de
// palabras clave, pero como datos revisados: ver scripts/ingredient-
// substitutions.mjs para el porqué de cada entrada y de cada omisión.
//
// AVISO QUE NO SE PUEDE PERDER: `restriction` es siempre un id de
// INTOLERANCE_RULES (`lactosa_fina`, `alcohol_cocina`), NUNCA un alérgeno.
// Un producto "sin lactosa" conserva la proteína láctea: sirve para la
// intolerancia y no sirve para la alergia a la leche, que debe seguir
// excluyendo el plato de forma dura.

/** ingredientId → { restriction → sustitución } */
const substitutionsByIngredient = new Map();
for (const sub of substitutionsJson) {
  if (!substitutionsByIngredient.has(sub.ingredientId)) {
    substitutionsByIngredient.set(sub.ingredientId, new Map());
  }
  substitutionsByIngredient.get(sub.ingredientId).set(sub.restriction, sub);
}

export const ingredientSubstitutions = substitutionsJson;

/**
 * ¿Hay forma de sustituir este ingrediente para esta restricción?
 * @param {string} name - nombre en texto libre
 * @param {string} restriction - id de INTOLERANCE_RULES
 * @returns {{ingredientId: string, restriction: string, replacementLabel: string, note?: string}|null}
 */
export function substitutionFor(name, restriction) {
  const id = resolveIngredientId(name);
  if (!id) return null;
  return substitutionsByIngredient.get(id)?.get(restriction) ?? null;
}

/**
 * Plan de adaptación de una receta: qué líneas hay que cambiar y por cuál.
 *
 * `blocked` reproduce la regla de substitutions.js: si la restricción aparece
 * en el NOMBRE del plato pero en ningún ingrediente, no hay nada que renombrar
 * y mantener la receta sería engañar ("Batido de leche" sin una línea "Leche").
 * El llamante debe excluirla.
 *
 * `unsubstitutable` son los ingredientes que sí chocan con la restricción pero
 * no tienen recambio real (un ron no tiene versión sin alcohol que funcione
 * igual). Se devuelven en vez de ignorarse: una receta con alguno de estos NO
 * se puede adaptar, por muchos otros que sí se sustituyan.
 *
 * @returns {{swaps: Array, unsubstitutable: string[], blocked: boolean}}
 */
export function planIngredientSubstitutions(recipe, restriction) {
  const swaps = [];
  const unsubstitutable = [];
  let matchedAny = false;

  for (const line of resolveRecipeIngredients(recipe)) {
    // El choque se lee de `conflictsWith`, que se deriva de INTOLERANCE_RULES.
    // NO se infiere de los alérgenos: la mantequilla lleva `leche` pero no
    // entra en lactosa_fina, y el vinagre tiene sulfitos pero no alcohol.
    if (!line.ingredient?.conflictsWith?.includes(restriction)) continue;
    matchedAny = true;
    const sub = line.ingredientId
      ? (substitutionsByIngredient.get(line.ingredientId)?.get(restriction) ?? null)
      : null;
    if (sub) {
      swaps.push({
        from: line.rawName,
        to: sub.replacementLabel,
        position: line.position,
        restriction,
        note: sub.note,
      });
    } else {
      unsubstitutable.push(line.rawName);
    }
  }

  return { swaps, unsubstitutable, blocked: !matchedAny };
}

/**
 * Alérgenos de un ingrediente, en los dos niveles.
 *
 * Sin fallback heurístico a propósito: un nombre desconocido devuelve listas
 * VACÍAS, no "no lleva alérgenos". El llamante tiene que seguir aplicando las
 * redes de palabras clave de lib/allergens.js y lib/intolerances.js — este
 * catálogo suma una capa, no sustituye a ninguna.
 *
 * @returns {{allergens: string[], cookingAllergens: string[], known: boolean}}
 */
export function ingredientAllergensFor(name) {
  const ing = resolveIngredient(name);
  if (!ing) return { allergens: [], cookingAllergens: [], known: false };
  return {
    allergens: ing.allergens,
    cookingAllergens: ing.cookingAllergens,
    known: true,
  };
}
