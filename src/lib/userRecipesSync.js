import { supabase } from "./supabase.js";
import { uploadRecipePhoto, deleteRecipePhoto, isDataUrl } from "./recipePhotos.js";
import { recipeToRow, rowToRecipe } from "./userRecipesFila.js";
import { mergeUserRecipesAfterCloudLoad } from "./profileMerge.js";
import { withoutDeletedRecipes } from "./deletedRecipeIds.js";
import { recetaPropia } from "./ids.js";

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

/**
 * Las recetas del usuario. Si la lectura falla, `data` es null y `error` lo
 * dice: «no tienes ninguna en la nube» y «no se ha podido mirar» no son lo
 * mismo, y tratarlos igual subía todas las locales encima de las de la nube
 * (#316). Quien suba algo comparando con esto mira antes `error`.
 * @returns {Promise<{ data: object[]|null, error: object|null }>}
 */
export async function loadUserRecipes(userId) {
  if (!supabase || !userId) return { data: [], error: null };
  const { data, error } = await supabase
    .from("user_recipes")
    .select("*")
    .eq("owner_id", userId)
    .order("created_at", { ascending: true });
  if (error) {
    console.warn("[userRecipes] load failed", error.message);
    return { data: null, error };
  }
  return { data: (data ?? []).map(rowToRecipe), error: null };
}

// ── Lápidas en la nube (user_recipe_deletions, 0094, #355) ──────────────
//
// Al borrar, borrar_receta_propia quita la fila y deja la lápida en la misma
// transacción. Cada dispositivo las lee al cargar y quita su copia local: si
// no, el que no borró la volvía a subir como «solo local». La base, además,
// no deja volver a entrar un id con lápida (trigger user_recipes_no_revivir).

/**
 * Tope de lápidas que se leen: las más recientes. No se purgan (0094): si
 * algún dueño se acerca, se revisa. Lola no usa tope: pide solo las lápidas
 * de los ids que tiene delante (api/_bot/propias.js).
 */
export const TOPE_LAPIDAS = 2000;

// Sin la 0094 aplicada, PostgREST contesta que la tabla o la función no
// existen. Eso no es un fallo de red: es «todavía no hay lápidas en la nube»,
// y todo sigue como antes (plan B).
const NO_EXISTE = new Set(["PGRST205", "PGRST202", "42P01", "42883"]);
const noExiste = (error) => NO_EXISTE.has(error?.code);

/**
 * Los ids de las recetas propias borradas, según la nube.
 * - Bien: `{ data: Set, error: null }`.
 * - Sin la 0094 aplicada: `{ data: Set vacío, error: null }`, como hasta ahora.
 * - Fallo de lectura: `{ data: null, error }`; quien suba algo mira `error`.
 * @returns {Promise<{ data: Set<string>|null, error: object|null }>}
 */
export async function loadRecetasBorradas(userId) {
  if (!supabase || !userId) return { data: new Set(), error: null };
  const { data, error } = await supabase
    .from("user_recipe_deletions")
    .select("recipe_id")
    .eq("owner_id", userId)
    .order("created_at", { ascending: false })
    .limit(TOPE_LAPIDAS);
  if (error) {
    if (noExiste(error)) return { data: new Set(), error: null };
    console.warn("[userRecipes] deletions load failed", error.message);
    return { data: null, error };
  }
  return { data: new Set((data ?? []).map((f) => f.recipe_id).filter(Boolean)), error: null };
}

/**
 * Las lápidas con las que trabaja la carga: las de este dispositivo más las
 * de la nube (si se pudieron leer).
 * @param {Set<string>} locales  las de deletedRecipeIds.js
 * @param {{ data: Set<string>|null }} [cargaLapidas]  lo de loadRecetasBorradas
 */
export function lapidasDeRecetas(locales, cargaLapidas) {
  const nube = cargaLapidas?.data;
  if (!nube?.size) return locales ?? new Set();
  return new Set([...(locales ?? []), ...nube]);
}

/**
 * Las recetas que se quedan tras cargar: las de la nube y las solo locales,
 * sin ninguna con lápida (ni la copia local de una que se borró en otro
 * dispositivo).
 */
export function recetasTrasCarga(local, remote, lapidas) {
  return mergeUserRecipesAfterCloudLoad(
    withoutDeletedRecipes(local ?? [], lapidas),
    withoutDeletedRecipes(remote ?? [], lapidas),
    lapidas,
  );
}

/**
 * Sube las recetas que este dispositivo tiene y la nube no (primer login en
 * el dispositivo, o creadas sin red). `carga` es lo que acaba de devolver
 * loadUserRecipes: si falló, no sube nada (#317). Con la nube «vacía» por un
 * 5xx, todas las locales parecían solo locales y el upsert por id pisaba la
 * versión editada en otro dispositivo. Las borradas aquí (`deletedIds`) no se
 * suben. Devuelve cuántas ha mandado subir.
 *
 * @param {{ userId: string, local: object[], carga: { data: object[]|null, error: object|null },
 *   deletedIds?: Set<string> }} args
 */
export async function subirRecetasSoloLocales({ userId, local, carga, cargaLapidas, deletedIds = new Set() }) {
  if (!carga || carga.error || !carga.data) return 0;
  // Sin poder leer las lápidas de la nube no se sabe si una «solo local» es
  // nueva o la borró otro dispositivo (#355): mejor no subir nada esta vez.
  if (cargaLapidas?.error) return 0;
  const enNube = new Set(carga.data.map((r) => r.id));
  const soloLocales = (local ?? []).filter(
    (r) => r.id && !enNube.has(r.id) && !deletedIds.has(r.id ?? r.name),
  );
  if (soloLocales.length) await upsertUserRecipes(userId, soloLocales);
  return soloLocales.length;
}

/**
 * Una receta ajena que este usuario puede leer: la RLS de user_recipes deja
 * pasar las 'public' a cualquiera y las 'friends' a seguidores mutuos. Si no
 * tienes permiso no da error, `data` es null — y el que copia se entera de
 * que ya no está disponible, no de que existe. Si la lectura falla, viene
 * además `error`, para decir «sin conexión» y no «ya no está» (#317).
 * @returns {Promise<{ data: object|null, error: object|null }>}
 */
export async function loadPublicRecipe(recipeId) {
  if (!supabase || !recipeId) return { data: null, error: null };
  const { data, error } = await supabase
    .from("user_recipes")
    .select("*")
    .eq("id", recipeId)
    .maybeSingle();
  if (error) {
    console.warn("[userRecipes] public load failed", error.message);
    return { data: null, error };
  }
  return { data: data ? rowToRecipe(data) : null, error: null };
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
  // Borra y deja la lápida en la nube en una sola transacción (0094, #355),
  // para que los demás dispositivos no la vuelvan a subir.
  // Un id fuera del formato de ids.recetaPropia no cabe en la lápida (CHECK
  // de la 0094): ese va directo al borrado de siempre.
  if (recetaPropia.es(recipeId)) {
    const borrado = await supabase.rpc("borrar_receta_propia", { p_receta: recipeId });
    if (!borrado.error) return true;
    if (!noExiste(borrado.error)) {
      console.warn("[userRecipes] delete failed", borrado.error.message);
      return false;
    }
  }
  // Plan B: sin la 0094 aplicada (o con un id viejo fuera de formato), el
  // borrado de siempre, sin lápida en la nube.
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
