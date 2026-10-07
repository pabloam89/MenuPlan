import { supabase } from "./supabase.js";
import { uploadRecipePhoto, deleteRecipePhoto, isDataUrl } from "./recipePhotos.js";
import { recipeToRow, rowToRecipe } from "./userRecipesFila.js";

/**
 * Cloud persistence for user-created recipes (see user_recipes in
 * supabase/migrations/0003_user_data.sql). The wizard builds recipe objects in
 * the same shape as the bundled catalog (see lib/userRecipes.js); this module
 * maps that camelCase shape to/from the snake_case DB row.
 *
 * Note: this is separate from lib/userRecipes.js (which is the AI-draft
 * generator). Here we only persist/read already-built recipes.
 *
 * All functions degrade gracefully: no Supabase / no session → no-op, so
 * localStorage (data.userRecipes) stays the working source of truth offline.
 */

export { recipeToRow, rowToRecipe };

/** Loads all recipes owned by the user. */
export async function loadUserRecipes(userId) {
  if (!supabase || !userId) return [];
  const { data, error } = await supabase
    .from("user_recipes")
    .select("*")
    .eq("owner_id", userId)
    .order("created_at", { ascending: true });
  if (error) {
    console.warn("[userRecipes] load failed", error.message);
    return [];
  }
  return (data ?? []).map(rowToRecipe);
}

/**
 * Una receta ajena que este usuario puede leer: la RLS de user_recipes deja
 * pasar las 'public' a cualquiera y las 'friends' a seguidores mutuos. Si no
 * tienes permiso no da error, devuelve null — y el que copia se entera de
 * que ya no está disponible, no de que existe.
 */
export async function loadPublicRecipe(recipeId) {
  if (!supabase || !recipeId) return null;
  const { data, error } = await supabase
    .from("user_recipes")
    .select("*")
    .eq("id", recipeId)
    .maybeSingle();
  if (error) {
    console.warn("[userRecipes] public load failed", error.message);
    return null;
  }
  return data ? rowToRecipe(data) : null;
}

/**
 * Abrir una receta desde un enlace compartido (ver lib/shareLink.js). Pasa
 * por recipe_from_link (0055), que aplica la llave y las políticas de 0046 en
 * el servidor y contesta una de tres cosas:
 *
 *   { status: "ok", recipe }        la receta entera
 *   { status: "locked", preview }   publicada para conexiones: nombre, foto y
 *                                   de quién es, para poder pedir conexión
 *   { status: "gone" }              no existe, privada sin llave, o bloqueo
 *
 * "error" es aparte: sin red o sin Supabase no es que la receta no esté, es
 * que no se ha podido preguntar.
 */
export async function loadRecipeFromLink(recipeId, token = null) {
  if (!supabase || !recipeId) return { status: "error" };
  // La sesión se restaura de localStorage en segundo plano al arrancar, y un
  // enlace se atiende justo al arrancar: sin esperar, la petición saldría
  // como anónima y una conexión aceptada vería "cerrada" su propia receta.
  await supabase.auth.getSession().catch(() => null);
  const { data, error } = await supabase.rpc("recipe_from_link", {
    p_recipe: recipeId,
    p_token: token || null,
  });
  if (error) {
    console.warn("[userRecipes] link load failed", error.message);
    return { status: "error" };
  }
  if (data?.status === "ok" && data.recipe) return { status: "ok", recipe: rowToRecipe(data.recipe) };
  if (data?.status === "locked" && data.preview) return { status: "locked", preview: data.preview };
  return { status: "gone" };
}

/**
 * La llave de una receta mía para el enlace "cualquiera con el enlace". La
 * crea el servidor la primera vez y devuelve siempre la misma después
 * (recipe_share_token, 0055). Null si la receta aún no está en la nube o no
 * es mía.
 */
export async function createRecipeShareToken(recipeId) {
  if (!supabase || !recipeId) return null;
  const { data, error } = await supabase.rpc("recipe_share_token", { p_recipe: recipeId });
  if (error) {
    console.warn("[userRecipes] share token failed", error.message);
    return null;
  }
  return data ?? null;
}

/** Inserts or updates a single recipe. */
export async function upsertUserRecipe(userId, recipe) {
  if (!supabase || !userId || !recipe?.id) return;
  // La foto va a Storage y en la fila queda su URL. Se hace aqui, en el unico
  // sitio por el que pasan TODAS las escrituras, para que ninguna via -el
  // asistente, una edicion, una copia del feed- pueda volver a incrustar dos
  // megas de imagen dentro de la fila. Ver lib/recipePhotos.js.
  const photo = await uploadRecipePhoto(userId, recipe.id, recipe.photo);
  const { error } = await supabase
    .from("user_recipes")
    .upsert(recipeToRow({ ...recipe, photo }, userId), { onConflict: "id" });
  if (error) console.warn("[userRecipes] upsert failed", error.message);
  return photo;
}

/** Backfills several local-only recipes to the cloud (first login on device). */
export async function upsertUserRecipes(userId, recipes) {
  if (!supabase || !userId || !recipes?.length) return;
  // De una en una y no en paralelo: cada foto son un par de megas y disparar
  // diez subidas a la vez desde un movil es la mejor forma de que fallen.
  const withPhotos = [];
  for (const r of recipes) {
    withPhotos.push(isDataUrl(r.photo)
      ? { ...r, photo: await uploadRecipePhoto(userId, r.id, r.photo) }
      : r);
  }
  const rows = withPhotos.map((r) => recipeToRow(r, userId));
  const { error } = await supabase
    .from("user_recipes")
    .upsert(rows, { onConflict: "id" });
  if (error) console.warn("[userRecipes] bulk upsert failed", error.message);
}

/** Patches just the visibility of one recipe (avoids resending the whole row). */
export async function updateRecipeVisibility(userId, recipeId, visibility) {
  if (!supabase || !userId || !recipeId) return;
  const { error } = await supabase
    .from("user_recipes")
    .update({ visibility })
    .eq("id", recipeId)
    .eq("owner_id", userId);
  if (error) console.warn("[userRecipes] visibility update failed", error.message);
}

export async function deleteUserRecipe(userId, recipeId) {
  if (!supabase || !userId || !recipeId) return false;
  // Primero el fichero: si se borra la fila y falla esto, la foto se queda
  // para siempre en el cubo sin nadie que sepa a que receta pertenecia.
  await deleteRecipePhoto(userId, recipeId);
  const { error } = await supabase
    .from("user_recipes")
    .delete()
    .eq("id", recipeId)
    .eq("owner_id", userId);
  if (error) {
    console.warn("[userRecipes] delete failed", error.message);
    return false;
  }
  return true;
}
