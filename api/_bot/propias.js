/**
 * Las recetas propias de una casa, las mismas que enseña la app.
 *
 * Su sitio es `user_recipes`, a nombre del dueño de la casa: la app las lee de
 * ahí (loadUserRecipes) y QUITA `userRecipes` del JSON de la casa en cada
 * guardado (App.jsx). Si el bot las buscaba en `state.data.userRecipes`, una
 * receta creada en la app no existía para Lola: ni al buscar, ni al generar,
 * ni en la ficha.
 *
 * Lo que aún quede en el JSON (casas de antes, o lo que el bot apuntó ahí) va
 * detrás, solo si su id no está en la tabla. Si la tabla falla, el JSON entero.
 *
 * Se lee una vez al cargar la casa (casa.js) y viaja en `casa.recetasPropias`,
 * fuera de `state`: así no se escribe de vuelta en household_state.
 */

import { select, eq } from "./db.js";
import { rowToRecipe } from "../../src/lib/userRecipesFila.js";

/** Las recetas propias de una casa ya cargada (sin consultas). */
export const propiasDe = (casa) => casa?.recetasPropias ?? casa?.state?.data?.userRecipes ?? [];

/**
 * @param {string | null} dueno  owner_user_id de la casa
 * @param {object[]} delJson     `state.data.userRecipes`, lo de antes
 */
export async function recetasPropiasDeCasa(dueno, delJson = []) {
  const json = Array.isArray(delJson) ? delJson.filter((r) => r?.id) : [];
  if (!dueno) return json;
  let filas;
  try {
    filas = await select("user_recipes", `owner_id=${eq(dueno)}&order=created_at.asc`, "*");
  } catch (e) {
    console.error("[propias] user_recipes", e?.message);
    return json;
  }
  const deTabla = filas.map(rowToRecipe);
  const enTabla = new Set(deTabla.map((r) => r.id));
  return [...deTabla, ...json.filter((r) => !enTabla.has(r.id))];
}
