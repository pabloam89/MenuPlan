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
import { recetaPropia } from "../../src/lib/ids.js";

/** Las columnas que lee rowToRecipe, y ni una más. */
const COLUMNAS = [
  "id", "name", "category", "main_protein", "meal_roles", "usage_tags", "type", "base_dish_id",
  "linked_catalog_id", "pinned_garnish_id", "required_appliances", "time_minutes", "difficulty", "season",
  "kcal", "protein_g", "carbs_g", "fat_g", "fiber_g", "sugar_g", "saturated_fat_g", "sodium_mg",
  "nutrition_source", "base_servings", "kid_friendly", "tupper_friendly", "allergens", "ingredients", "steps",
  "steps_rich", "montaje", "apetecible", "can_be_garnish", "main_ingredients", "sauce_id", "description",
  "methods", "photo", "owner_snapshot", "visibility", "copied_from_recipe_id", "copied_from_owner_id", "created_at",
  // Y owner_id, que rowToRecipe no lee: cada fila se cruza con las lápidas de su dueño.
  "owner_id",
].join(",");

/** Tope de recetas propias por casa: las más recientes, si alguna vez hubiera más. */
export const TOPE_PROPIAS = 500;

/** Cuántos ids van en cada consulta de lápidas, para no alargar la URL. */
const IDS_POR_CONSULTA = 100;

const pareja = (dueno, id) => `${dueno} ${id}`;

/**
 * Las lápidas de esos autores para esos ids, como parejas «dueño id» (vacío si
 * no se pueden leer). Sin tope de «las N más recientes» a propósito (la app sí
 * lo tiene, TOPE_LAPIDAS en src/lib/userRecipesSync.js): pidiendo solo los ids
 * que hay delante, nadie puede empujar fuera de la ventana una lápida buena
 * llenándola de falsas. Solo los ids con formato de receta propia: los demás
 * no pueden tener lápida (CHECK de la 0094) y romperían el in.(…).
 */
async function lapidasDe(quienes, ids) {
  const conFormato = [...new Set(ids)].filter((id) => recetaPropia.es(id));
  const parejas = new Set();
  try {
    for (let i = 0; i < conFormato.length; i += IDS_POR_CONSULTA) {
      const trozo = conFormato.slice(i, i + IDS_POR_CONSULTA).map((id) => encodeURIComponent(id)).join(",");
      const filas = await select(
        "user_recipe_deletions",
        `owner_id=in.(${quienes})&recipe_id=in.(${trozo})&limit=${IDS_POR_CONSULTA * quienes.split(",").length}`,
        "owner_id,recipe_id",
      );
      for (const f of filas ?? []) parejas.add(pareja(f.owner_id, f.recipe_id));
    }
  } catch (e) {
    console.error("[propias] user_recipe_deletions", e?.message);
    return new Set();
  }
  return parejas;
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
  let filas = null;
  try {
    filas = await select("user_recipes", `owner_id=in.(${quienes})&order=created_at.desc&limit=${TOPE_PROPIAS}`, COLUMNAS);
  } catch (e) {
    console.error("[propias] user_recipes", e?.message);
  }
  const lapidas = await lapidasDe(quienes, [...(filas ?? []).map((f) => f.id), ...json.map((r) => r.id)]);
  // Lo del JSON no dice de quién es: se va si lo borró cualquiera de los que
  // llevan la casa (pueden editarla igual, no es más poder que el que tienen).
  const vivaDelJson = (r) => !autores.some((a) => lapidas.has(pareja(a, r.id)));
  if (!filas) return json.filter(vivaDelJson);
  // Cada fila, solo con las lápidas de SU dueño. Las más recientes bajo el
  // tope, pero en el orden de siempre (de la más antigua).
  const deTabla = [...filas].reverse()
    .filter((f) => !lapidas.has(pareja(f.owner_id, f.id)))
    .map(rowToRecipe);
  const enTabla = new Set(deTabla.map((r) => r.id));
  return [...deTabla, ...json.filter((r) => vivaDelJson(r) && !enTabla.has(r.id))];
}
