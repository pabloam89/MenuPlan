// Registro de recetas en ejecución (RECIPES_BY_ID) y las categorías de
// ingrediente. El catálogo de recetas está en src/data/recipes/*.json.
//
// Ingredient categories must match the ones used in shoppingBuilder.js.

import { ensureHealthFlags } from "../lib/healthFlags.js";
import { mergeIngredientLines } from "../lib/ingredientUnits.js";

export const INGREDIENT_CATEGORIES = [
  "Verduras y frutas",
  "Carnes y pescados",
  "Legumbres y pasta",
  "Lácteos y huevos",
  "Panadería y cereales",
  "Despensa",
];

/**
 * @typedef {Object} Ingredient
 * @property {string} id
 * @property {string} name
 * @property {"Verduras y frutas"|"Carnes y pescados"|"Legumbres y pasta"|"Lácteos y huevos"|"Panadería y cereales"|"Despensa"} category
 * @property {number} qty            // per servings (see recipe.servings)
 * @property {"g"|"ml"|"ud"} unit
 * @property {number} [pricePerUnit] // EUR per base unit (g/ml/ud)
 * @property {string[]} [allergens]
 */

/**
 * @typedef {Object} Recipe
 * @property {string} id
 * @property {string} name
 * @property {string} emoji
 * @property {string} iconType
 * @property {{protein:number, carbs:number, fat:number}} macros
 * @property {string} prepSummary
 * @property {string[]} steps
 * @property {string} image
 * @property {number} kcal           // per serving
 * @property {number} time           // minutes
 * @property {"Fácil"|"Normal"|"Me gusta"} difficulty
 * @property {string[]} tags         // legumbres, pescado, verdura, carne...
 * @property {("comida"|"cena")[]} mealTypes
 * @property {boolean} tupperFriendly
 * @property {boolean} kidFriendly
 * @property {string[]} allergens
 * @property {number} servings
 * @property {Ingredient[]} ingredients
 */

// Registro VIVO de recetas por id. Arranca vacío: lo llena `registerRecipes` en
// ejecución (recetas del catálogo, de IA y propias). Quien lo lee (planner,
// lista de la compra, fichas) lo hace por este binding y ve lo añadido después.
// Ya no hay recetas escritas a mano aquí (las 29 del prototipo, BASE_RECIPES, se
// retiraron el 9 oct 2026, #286): el catálogo vive en src/data/recipes/*.json.
/** @type {Record<string, Recipe>} */
export const RECIPES_BY_ID = {};

/**
 * Add or replace recipes in the runtime catalogue (RECIPES_BY_ID).
 *
 * @param {Recipe[]} extra
 */
export function registerRecipes(extra) {
  if (!Array.isArray(extra)) return;
  for (const recipe of extra) {
    if (!recipe?.id) continue;
    // Una versión ADAPTADA (sin gluten, sin lactosa: la del menú de quien lo
    // necesita) no la pisa otra sin adaptar con el mismo id. Abrir la ficha
    // del catálogo o recargar las recetas propias hidrata sin restricciones, y
    // en una casa de un solo menú el id es el mismo que el del plan: la compra
    // y la ficha volvían a decir «Espaguetis» para el celíaco. Si alguna vez
    // sobra, sobra en la dirección segura.
    const previa = RECIPES_BY_ID[recipe.id];
    if (previa?.adaptations?.length && !recipe.adaptations?.length) continue;
    // Derive healthFlags defensively so every recipe reachable through
    // RECIPES_BY_ID (dish cards, dish detail) can show an honest health-profile
    // badge, regardless of which caller registered it (own recipe, AI-generated,
    // remote merge...).
    // Y se juntan las lineas de ingrediente repetidas. Aqui y no en quien
    // genera porque por aqui pasa TODO lo que la app puede llegar a pintar:
    // lo que genera la IA, lo que se rehidrata de local, lo que baja de la
    // nube al iniciar sesion y las recetas propias. Estaba solo en el camino
    // local, asi que a quien tenia sesion le seguian saliendo "Aceite de
    // oliva 50 ml" y "Aceite de oliva 60 ml" en dos lineas.
    const stored = ensureHealthFlags({
      ...recipe,
      ...(Array.isArray(recipe.ingredients) ? { ingredients: mergeIngredientLines(recipe.ingredients) } : null),
    });
    RECIPES_BY_ID[recipe.id] = stored;
  }
}
