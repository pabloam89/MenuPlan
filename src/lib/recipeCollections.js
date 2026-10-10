import { supabase } from "./supabase.js";
import * as ids from "./ids.js";
import { CARPETAS_FIJAS, paraEscribir } from "./vocabularios.js";

/**
 * Carpetas de recetas, dentro de "Mis recetas". Son de dos clases:
 *
 *  - Las 4 FIJAS de Inspíranos (día a día / ocasión especial / cena rápida /
 *    hijos): siempre están, se rellenan solas al swipear y no se renombran ni
 *    se borran. Su id es estable porque el mazo de Inspíranos navega por esas
 *    mismas categorías.
 *  - Las que crea el usuario: id generado, nombre libre, se pueden renombrar y
 *    borrar. Viven en `data.recipeFolders`.
 *
 * La pertenencia (qué receta está en qué carpeta) es la misma estructura para
 * ambas: `data.recipeCollections`, un mapa recipeId → folder ids.
 *
 * Va aparte del VoteEntry de recipeVotes.js a propósito: `makeEntry()` allí
 * reconstruye cada entrada preservando solo `v` y `fav`, así que un tercer
 * campo se perdería en silencio en cada toggle de voto o favorito.
 *
 * @typedef {Record<string, string[]>} CollectionMap  recipeId → folder ids
 * @typedef {{ id: string, name: string, createdAt?: string }} Folder
 */

/** La etiqueta de cada carpeta fija, por su id. Los ids salen de vocabularios.js (CHECK de 0086). */
const ETIQUETA_CARPETA_FIJA = {
  dia_a_dia: "Día a día",
  ocasion_especial: "Ocasión especial",
  cena_rapida: "Cena rápida",
  hijos: "Para mis hijos",
};

// En el orden de la constante; vocabularios.test.js comprueba que cada id tiene su etiqueta.
export const BUILT_IN_COLLECTIONS = CARPETAS_FIJAS.map((id) => ({ id, label: ETIQUETA_CARPETA_FIJA[id] }));

export const BUILT_IN_IDS = CARPETAS_FIJAS;

/**
 * El collection_id que se escribe (#539): una carpeta propia (`fld_…`, el patrón del CHECK)
 * tal cual; una fija, por la lista viva (un retirado pasa a su sucesor, uno sin sucesor da
 * null, uno desconocido lanza FueraDeVocabulario). «Descartados» no se guarda nunca: lanza.
 */
export function carpetaParaEscribir(id) {
  return typeof id === "string" && id.startsWith("fld_") ? id : paraEscribir("carpetas_fijas", id);
}

/**
 * "Descartados" no es una carpeta de este mapa: se pinta como una más en Mis
 * recetas, pero sus ids salen de `data.discards` (los rechazos de menú, que ya
 * excluyen del generador vía activeDiscardIds). Se queda fuera de
 * BUILT_IN_COLLECTIONS a propósito para que nunca aparezca como destino en el
 * selector de "guardar en…": ahí no se guarda, de ahí se recupera.
 */
export const DISCARDED_ID = "descartados";

const BUILT_IN = new Set(BUILT_IN_IDS);

export function isBuiltInCollection(id) {
  return BUILT_IN.has(id);
}

/** Las 4 fijas seguidas de las del usuario, ya etiquetadas para pintar. */
export function allFolders(customFolders = []) {
  return [
    ...BUILT_IN_COLLECTIONS.map((c) => ({ ...c, builtIn: true })),
    ...customFolders.map((f) => ({ id: f.id, label: f.name, builtIn: false })),
  ];
}

export function folderLabel(folderId, customFolders = []) {
  return allFolders(customFolders).find((f) => f.id === folderId)?.label ?? folderId;
}

export function newFolderId() {
  return ids.carpeta.nuevo();
}

// ── Pertenencia (recipeId → folder ids) ──────────────────────────────────────

/** Folder ids a recipe belongs to (empty array when none). */
export function collectionsOf(map, recipeId) {
  return map?.[recipeId] ?? [];
}

/** Adds a recipe to one or more folders, without duplicating. */
export function addToCollections(map, recipeId, folderIds) {
  const clean = (folderIds ?? []).filter((id) => typeof id === "string" && id);
  if (!recipeId || clean.length === 0) return map ?? {};
  const merged = Array.from(new Set([...collectionsOf(map, recipeId), ...clean]));
  return { ...(map ?? {}), [recipeId]: merged };
}

/** Removes a recipe from one folder, dropping the key once it's empty. */
export function removeFromCollection(map, recipeId, folderId) {
  const current = collectionsOf(map, recipeId);
  if (current.length === 0) return map ?? {};
  const next = { ...(map ?? {}) };
  const remaining = current.filter((id) => id !== folderId);
  if (remaining.length === 0) delete next[recipeId];
  else next[recipeId] = remaining;
  return next;
}

/** Replaces the whole folder set of one recipe (used by the folder picker). */
export function setRecipeCollections(map, recipeId, folderIds) {
  const clean = Array.from(new Set((folderIds ?? []).filter((id) => typeof id === "string" && id)));
  const next = { ...(map ?? {}) };
  if (clean.length === 0) delete next[recipeId];
  else next[recipeId] = clean;
  return next;
}

/** @returns {Set<string>} recipe ids filed in the given folder. */
export function collectionRecipeIds(map, folderId) {
  const ids = new Set();
  for (const [recipeId, folders] of Object.entries(map ?? {})) {
    if (folders.includes(folderId)) ids.add(recipeId);
  }
  return ids;
}

/** @returns {Record<string, number>} how many recipes each folder holds. */
export function collectionCounts(map, customFolders = []) {
  const counts = Object.fromEntries(allFolders(customFolders).map((f) => [f.id, 0]));
  for (const folders of Object.values(map ?? {})) {
    for (const id of folders) if (id in counts) counts[id] += 1;
  }
  return counts;
}

/** Drops every membership of a folder that no longer exists. */
export function purgeFolder(map, folderId) {
  const next = {};
  for (const [recipeId, folders] of Object.entries(map ?? {})) {
    const remaining = folders.filter((id) => id !== folderId);
    if (remaining.length) next[recipeId] = remaining;
  }
  return next;
}

/**
 * Merges cloud memberships into local ones. Unlike votes, this is a plain
 * union per recipe: filing something away is additive, so a login must never
 * drop a swipe that hasn't round-tripped to the server yet.
 */
export function mergeCollections(local = {}, remote = {}) {
  const out = { ...local };
  for (const [recipeId, folders] of Object.entries(remote)) {
    out[recipeId] = Array.from(new Set([...(local[recipeId] ?? []), ...folders]));
  }
  return out;
}

/** Union by id, local name winning (it may have been renamed offline). */
export function mergeFolders(local = [], remote = []) {
  const byId = new Map(remote.map((f) => [f.id, f]));
  for (const f of local) byId.set(f.id, f);
  return [...byId.values()];
}

// ── Cloud sync (recipe_folders + recipe_collections, ver 0026) ───────────────
// Mismo patrón que recipeVotes.js: no-op sin sesión, y localStorage sigue
// siendo la fuente de verdad de trabajo.

/**
 * En error, `data` null y `error` (#317): «sin carpetas» no es «no se sabe».
 * @returns {Promise<{ data: CollectionMap|null, error: object|null }>}
 */
export async function loadRecipeCollections(userId) {
  if (!supabase || !userId) return { data: {}, error: null };
  const { data, error } = await supabase
    .from("recipe_collections")
    .select("recipe_id, collection_id")
    .eq("user_id", userId);
  if (error) {
    console.warn("[recipeCollections] load failed", error.message);
    return { data: null, error };
  }
  const map = {};
  for (const row of data ?? []) (map[row.recipe_id] ??= []).push(row.collection_id);
  return { data: map, error: null };
}

/**
 * En error, `data` null y `error` (#317).
 * @returns {Promise<{ data: Folder[]|null, error: object|null }>}
 */
export async function loadRecipeFolders(userId) {
  if (!supabase || !userId) return { data: [], error: null };
  const { data, error } = await supabase
    .from("recipe_folders")
    .select("id, name, created_at")
    .eq("user_id", userId);
  if (error) {
    console.warn("[recipeCollections] folders load failed", error.message);
    return { data: null, error };
  }
  return { data: (data ?? []).map((r) => ({ id: r.id, name: r.name, createdAt: r.created_at })), error: null };
}

export async function saveRecipeFolder(userId, folder) {
  if (!supabase || !userId || !folder?.id) return;
  const { error } = await supabase
    .from("recipe_folders")
    .upsert({ user_id: userId, id: folder.id, name: folder.name }, { onConflict: "id" });
  if (error) console.warn("[recipeCollections] folder save failed", error.message);
}

/**
 * Borra una carpeta del usuario y, con ella, sus pertenencias en
 * recipe_collections (collection_id no tiene FK, ver 0026: nada las borra en
 * cascada). Sin esto, loadRecipeCollections las volvía a traer en la carga
 * siguiente y deshacía el purgeFolder local. Las 4 fijas no se borran.
 */
export async function deleteRecipeFolder(userId, folderId) {
  if (!supabase || !userId || !folderId || isBuiltInCollection(folderId)) return;
  const { error: membersError } = await supabase
    .from("recipe_collections")
    .delete()
    .eq("user_id", userId)
    .eq("collection_id", folderId);
  if (membersError) console.warn("[recipeCollections] folder members delete failed", membersError.message);
  const { error } = await supabase
    .from("recipe_folders")
    .delete()
    .eq("user_id", userId)
    .eq("id", folderId);
  if (error) console.warn("[recipeCollections] folder delete failed", error.message);
}

/**
 * Sin filas repetidas (receta y carpeta): tras traducir, un retirado y su sucesor son la
 * misma fila, y el upsert no deja tocar una fila dos veces en la misma orden.
 */
function sinRepetidas(rows) {
  const vistas = new Set();
  return rows.filter((r) => {
    const k = `${r.recipe_id}\u0000${r.collection_id}`;
    if (vistas.has(k)) return false;
    vistas.add(k);
    return true;
  });
}

/**
 * Las filas de las carpetas de una receta, cada una por la lista viva. Una carpeta que no se
 * puede escribir (desconocida, o «Descartados») se salta sola y se avisa; una retirada sin
 * sucesor ya la quitó paraEscribir con su línea. Así una carpeta mala no se lleva las buenas.
 */
function filasDeCarpetas(userId, recipeId, folderIds) {
  const rows = [];
  const saltadas = [];
  for (const id of folderIds ?? []) {
    try {
      rows.push({ user_id: userId, recipe_id: recipeId, collection_id: carpetaParaEscribir(id) });
    } catch {
      saltadas.push(id);
    }
  }
  if (saltadas.length) console.warn("[recipeCollections] carpetas fuera del vocabulario, no se guardan", [...new Set(saltadas)]);
  return sinRepetidas(rows.filter((r) => r.collection_id != null));
}

/** Replaces the stored folder set of one recipe (picker save). */
export async function saveRecipeCollections(userId, recipeId, folderIds) {
  if (!supabase || !userId || !recipeId) return;
  // Las filas, antes de borrar: lo que no se puede escribir ya está fuera, y el upsert no
  // falla después del delete (antes una carpeta mala dejaba la receta sin ninguna).
  const rows = filasDeCarpetas(userId, recipeId, folderIds);
  const { error: delError } = await supabase
    .from("recipe_collections")
    .delete()
    .eq("user_id", userId)
    .eq("recipe_id", recipeId);
  if (delError) console.warn("[recipeCollections] save (clear) failed", delError.message);
  if (rows.length === 0) return;
  const { error } = await supabase
    .from("recipe_collections")
    .upsert(rows, { onConflict: "user_id,recipe_id,collection_id" });
  if (error) console.warn("[recipeCollections] save failed", error.message);
}
