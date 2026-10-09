/**
 * Las recetas propias de una casa, las mismas que enseña la app.
 *
 * Su sitio es `user_recipes`, a nombre de quien la creó: la app las lee de
 * ahí (loadUserRecipes) y QUITA `userRecipes` del JSON de la casa en cada
 * guardado (App.jsx). Si el bot las buscaba en `state.data.userRecipes`, una
 * receta creada en la app no existía para Lola: ni al buscar, ni al generar,
 * ni en la ficha. Y si solo miraba las del dueño, las de la cotitular tampoco:
 * son de la casa las de todos los que la llevan (household_members con papel
 * owner o editor), no las de quien solo mira.
 *
 * Lo que aún quede en el JSON (casas de antes, o lo que el bot apuntó ahí) va
 * detrás, solo si su id no está en la tabla. Si la tabla falla, el JSON entero.
 *
 * Las borradas no salen (#355): borrar en la app quita la fila y deja su
 * lápida en `user_recipe_deletions` (0094). Sin mirarla, la copia que quedaba
 * en el JSON volvía como «de antes». Si las lápidas no se pueden leer (o la
 * 0094 aún no está aplicada), todo como antes, con la línea en el log.
 *
 * Se lee una vez al cargar la casa (casa.js) y viaja en `casa.recetasPropias`,
 * fuera de `state`: así no se escribe de vuelta en household_state.
 */

import { select } from "./db.js";
import { quienesLlevanLaCasa } from "./papel.js";
import { rowToRecipe } from "../../src/lib/userRecipesFila.js";

/** Las columnas que lee rowToRecipe, y ni una más. */
const COLUMNAS = [
  "id", "name", "category", "main_protein", "meal_roles", "usage_tags", "type", "base_dish_id",
  "linked_catalog_id", "pinned_garnish_id", "required_appliances", "time_minutes", "difficulty", "season",
  "kcal", "protein_g", "carbs_g", "fat_g", "fiber_g", "sugar_g", "saturated_fat_g", "sodium_mg",
  "nutrition_source", "base_servings", "kid_friendly", "tupper_friendly", "allergens", "ingredients", "steps",
  "steps_rich", "montaje", "apetecible", "can_be_garnish", "main_ingredients", "sauce_id", "description",
  "methods", "photo", "owner_snapshot", "visibility", "copied_from_recipe_id", "copied_from_owner_id", "created_at",
].join(",");

/** Tope de recetas propias por casa: las más recientes, si alguna vez hubiera más. */
export const TOPE_PROPIAS = 500;

/** Tope de lápidas que se leen por casa: las más recientes. */
export const TOPE_LAPIDAS = 2000;

/** Los ids de las recetas borradas de esos autores (vacío si no se pueden leer). */
async function borradasDe(quienes) {
  try {
    const filas = await select(
      "user_recipe_deletions",
      `owner_id=in.(${quienes})&order=created_at.desc&limit=${TOPE_LAPIDAS}`,
      "recipe_id",
    );
    return new Set((filas ?? []).map((f) => f.recipe_id));
  } catch (e) {
    console.error("[propias] user_recipe_deletions", e?.message);
    return new Set();
  }
}

/** Las recetas propias de una casa ya cargada (sin consultas). */
export const propiasDe = (casa) => casa?.recetasPropias ?? casa?.state?.data?.userRecipes ?? [];

/** Quién lleva la casa: el dueño y los de papel owner/editor (la cotitular). */
async function autoresDeCasa(householdId, dueno) {
  let quienes = [];
  try {
    quienes = await quienesLlevanLaCasa(householdId);
  } catch (e) {
    // Sin la lista, al menos las del dueño.
    console.error("[propias] household_members", e?.message);
  }
  return [...new Set([dueno, ...quienes].filter(Boolean))];
}

/**
 * @param {string | null} householdId
 * @param {string | null} dueno  owner_user_id de la casa
 * @param {object[]} delJson     `state.data.userRecipes`, lo de antes
 */
export async function recetasPropiasDeCasa(householdId, dueno, delJson = []) {
  const json = Array.isArray(delJson) ? delJson.filter((r) => r?.id) : [];
  const autores = await autoresDeCasa(householdId, dueno);
  if (!autores.length) return json;
  const quienes = autores.map((u) => encodeURIComponent(u)).join(",");
  const lapidas = borradasDe(quienes);
  let filas;
  try {
    filas = await select("user_recipes", `owner_id=in.(${quienes})&order=created_at.desc&limit=${TOPE_PROPIAS}`, COLUMNAS);
  } catch (e) {
    console.error("[propias] user_recipes", e?.message);
    const borradas = await lapidas;
    return json.filter((r) => !borradas.has(r.id));
  }
  const borradas = await lapidas;
  const viva = (r) => !borradas.has(r.id);
  // Las más recientes bajo el tope, pero en el orden de siempre (de la más antigua).
  const deTabla = [...filas].reverse().map(rowToRecipe).filter(viva);
  const enTabla = new Set(deTabla.map((r) => r.id));
  return [...deTabla, ...json.filter((r) => viva(r) && !enTabla.has(r.id))];
}
