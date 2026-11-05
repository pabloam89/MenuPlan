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

import { select, insert, update, borrar, eq } from "./db.js";
import { quienesLlevanLaCasa } from "./papel.js";
import { rowToRecipe } from "../../src/lib/userRecipesFila.js";
import { recetaPropia } from "../../src/lib/ids.js";
import { BUILT_IN_COLLECTIONS, carpetaParaEscribir, isBuiltInCollection, newFolderId } from "../../src/lib/carpetas.js";

/**
 * Quita una receta propia que acaba de guardar Lola, al deshacerlo (#958).
 * Como borrar_receta_propia (0094), que pide sesión y el bot no la tiene:
 * primero la lápida y luego la fila. Sin la lápida, un móvil que ya la tenía
 * la volvería a subir.
 */
export async function quitarRecetaGuardada(id, dueno) {
  await insert("user_recipe_deletions", [{ owner_id: dueno, recipe_id: id }], { upsert: true });
  await borrar("user_recipes", `id=${eq(id)}&owner_id=${eq(dueno)}`);
}

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

/** Las recetas propias de una casa ya cargada (sin consultas): las de su tabla (trozo 21). */
export const propiasDe = (casa) => casa?.recetasPropias ?? [];

// ── Lo que la app hace con las recetas y Lola no hacía (trozo 48, parte 1): favoritas y borrar una propia ──

/**
 * Marca o desmarca una receta (del catálogo o propia) como favorita de quien escribe, en `recipe_votes`, la misma
 * fila que escribe la app (saveRecipeVote, src/lib/recipeVotes.js): por (user_id, recipe_id), sin tocar su voto. Sin
 * ámbito (`scope` null): favorita para todos, como el corazón de la app sin elegir grupo.
 */
export async function marcarFavorita(userId, recetaId, favorita) {
  if (favorita) {
    await insert("recipe_votes?on_conflict=user_id,recipe_id", [{ user_id: userId, recipe_id: recetaId, is_favorite: true, scope: null }], { upsert: true });
  } else {
    await update("recipe_votes", `user_id=${eq(userId)}&recipe_id=${eq(recetaId)}`, { is_favorite: false, scope: null });
  }
}

// ── Carpetas de recetas (trozo 48, parte 2): las de cada cuenta, las mismas filas que la app (recipeCollections.js) ──

/** Las carpetas de una cuenta: las 4 fijas y las suyas (`recipe_folders`), como `{ id, nombre, fija }`. Lanza si la base falla. */
export async function carpetasDe(userId) {
  const suyas = await select("recipe_folders", `user_id=${eq(userId)}`, "id,name");
  return [
    ...BUILT_IN_COLLECTIONS.map((c) => ({ id: c.id, nombre: c.label, fija: true })),
    ...suyas.map((f) => ({ id: f.id, nombre: f.name, fija: false })),
  ];
}

/** Una carpeta nueva de la cuenta, con el id de la app (`fld_…`). Devuelve su id. */
export async function crearCarpeta(userId, nombre) {
  const id = newFolderId();
  await insert("recipe_folders", [{ user_id: userId, id, name: nombre }]);
  return id;
}

/**
 * Como deleteRecipeFolder de la app: primero lo que había dentro (collection_id no tiene FK, 0026: nada lo borra en
 * cascada y volvería en la carga siguiente) y luego la carpeta. Las fijas no se borran.
 */
export async function borrarCarpeta(userId, carpetaId) {
  if (isBuiltInCollection(carpetaId)) throw new Error("las carpetas fijas no se borran");
  await borrar("recipe_collections", `user_id=${eq(userId)}&collection_id=${eq(carpetaId)}`);
  await borrar("recipe_folders", `user_id=${eq(userId)}&id=${eq(carpetaId)}`);
}

/**
 * Mete una receta en una carpeta, en `recipe_collections`, con el id que se escribe (carpetaParaEscribir: una fija
 * retirada sin sucesor no se escribe y lanza), o la saca con el id con que está guardada.
 */
export async function enCarpeta(userId, recetaId, carpetaId, meter) {
  if (!meter) {
    await borrar("recipe_collections", `user_id=${eq(userId)}&recipe_id=${eq(recetaId)}&collection_id=${eq(carpetaId)}`);
    return;
  }
  if (carpetaParaEscribir(carpetaId) == null) throw new Error(`la carpeta ${carpetaId} ya no se usa`);
  await insert("recipe_collections?on_conflict=user_id,recipe_id,collection_id", [{ user_id: userId, recipe_id: recetaId, collection_id: carpetaParaEscribir(carpetaId) }], { upsert: true });
}

/**
 * Saca una receta de «Descartados» (la carpeta que la app pinta con los descartes de la casa): quita su fila de
 * `household_recipe_discards`, como deleteHouseholdDiscard de la app, y el motor vuelve a poder ponerla. Devuelve
 * false si la casa no la tenía descartada. Lanza si la base falla.
 */
export async function recuperarDescartada(householdId, recetaId) {
  const filtro = `household_id=${eq(householdId)}&recipe_id=${eq(recetaId)}`;
  const [fila] = await select("household_recipe_discards", filtro, "recipe_id");
  if (!fila) return false;
  await borrar("household_recipe_discards", filtro);
  return true;
}

/**
 * Borra una receta propia de la casa, la de quien la creó (cualquiera de los que llevan la casa): como
 * quitarRecetaGuardada, primero la lápida y luego la fila. Devuelve false si no es una receta propia de esta casa.
 * Si no puede leer quién lleva la casa, lanza: es el freno del borrado, y sin la lista una receta de la cotitular
 * saldría «no es de esta casa» (no como autoresDeCasa, que sigue con las del dueño).
 */
export async function borrarRecetaDeCasa(householdId, dueno, recetaId) {
  const autores = [...new Set([dueno, ...(await quienesLlevanLaCasa(householdId))].filter(Boolean))];
  if (!autores.length) return false;
  const [fila] = await select("user_recipes", `id=${eq(recetaId)}&owner_id=in.(${autores.map((u) => encodeURIComponent(u)).join(",")})`, "id,owner_id");
  if (!fila) return false;
  await quitarRecetaGuardada(fila.id, fila.owner_id);
  return true;
}

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
 * Las recetas propias de una casa: solo las de `user_recipes` (trozo 21). La copia del documento
 * (`state.data.userRecipes`) ya no se lee: el 3 nov 2026 ninguna de las 37 casas la tenía, y era la que traía de vuelta
 * recetas borradas (#958 G). Sin poder leer la tabla, la casa no se lee (como sin las preferencias): sin sus recetas,
 * Lola diría que no hay ninguna.
 * @param {string | null} householdId
 * @param {string | null} dueno  owner_user_id de la casa
 */
export async function recetasPropiasDeCasa(householdId, dueno) {
  const autores = await autoresDeCasa(householdId, dueno);
  if (!autores.length) return [];
  const quienes = autores.map((u) => encodeURIComponent(u)).join(",");
  let filas;
  try {
    filas = await select("user_recipes", `owner_id=in.(${quienes})&order=created_at.desc&limit=${TOPE_PROPIAS}`, COLUMNAS);
  } catch (e) {
    throw new Error(`no he podido leer las recetas propias de la casa (user_recipes): ${e?.message}`);
  }
  const lapidas = await lapidasDe(quienes, (filas ?? []).map((f) => f.id));
  // Cada fila, solo con las lápidas de SU dueño. Las más recientes bajo el
  // tope, pero en el orden de siempre (de la más antigua).
  return [...(filas ?? [])].reverse()
    .filter((f) => !lapidas.has(pareja(f.owner_id, f.id)))
    .map(rowToRecipe);
}
