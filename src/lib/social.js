import { supabase } from "./supabase.js";
import { rowToRecipe } from "./userRecipesSync.js";
import { FIXTURES_ENABLED, FIXTURE_PROFILES, FIXTURE_MENUS, FIXTURE_SUGGESTED, fixtureFeed } from "./socialFixtures.js";

/**
 * Capa de datos del Feed social (ver supabase/migrations/0027_social_feed.sql).
 *
 * Igual que el resto de módulos de sync: sin Supabase o sin sesión no revienta,
 * devuelve vacío. El Feed es la única pantalla de la app que NO funciona
 * offline — no hay copia local de lo que publican otros — así que aquí el
 * estado vacío no es un fallo, es el estado normal de quien no ha entrado.
 *
 * Reglas de visibilidad (las aplica la base de datos, no este fichero):
 *   · 'public'    → lo lee cualquiera.
 *   · 'followers' → lo lee quien te sigue (seguimiento asimétrico, tipo IG).
 *   · 'private'   → solo tú.
 * Las recetas usan además el 'friends' que ya existía en 0003: ese pide
 * seguimiento MUTUO, no basta con que te sigan.
 */

const ok = () => Boolean(supabase);

/** Errores de red/RLS no deben tumbar la pantalla: se avisan y se sigue. */
function warn(where, error) {
  if (error) console.warn(`[social] ${where}`, error.message ?? error);
  return error;
}

// ── Recetas ajenas descartadas ──────────────────────────────────────────────
//
// Un "no me gusta" sobre la receta de OTRO no es un descarte: no está en tu
// biblioteca, así que no hay nada que mandar a Descartados — esa carpeta es de
// lo tuyo, y llenarla de cosas que nunca fueron tuyas la vuelve inútil. Aquí
// solo se apunta "no me la vuelvas a enseñar", y con eso deja de aparecer
// tanto en el Feed como en el mazo de Inspírate.
//
// (El descarte de verdad, con su carpeta y su recuperación, sigue siendo el de
// las recetas del catálogo — ver handleInspireDiscard en App.jsx.)
const HIDDEN_KEY = "hm_social_hidden";

export function readHiddenRecipes() {
  try { return new Set(JSON.parse(localStorage.getItem(HIDDEN_KEY) ?? "[]")); } catch { return new Set(); }
}

export function hideRecipe(id) {
  if (!id) return;
  try {
    const next = readHiddenRecipes();
    next.add(id);
    localStorage.setItem(HIDDEN_KEY, JSON.stringify([...next]));
  } catch { /* modo privado */ }
}

// ── Perfil propio ───────────────────────────────────────────────────────────

/** Fila de social_profiles del usuario, o null si aún no ha hecho opt-in. */
export async function loadMyProfile(userId) {
  if (!ok() || !userId) return null;
  const { data, error } = await supabase
    .from("social_profiles")
    .select("user_id, username, display_name, avatar_url, bio, visibility")
    .eq("user_id", userId)
    .maybeSingle();
  if (warn("loadMyProfile", error)) return null;
  return data ?? null;
}

/**
 * Crea o actualiza el perfil público.
 *
 * `visibility` no se pone aquí: quien no la mande hereda el default de la
 * columna ('followers' desde la migración 0038), y quien ya tenga perfil la
 * conserva, porque un upsert solo escribe las columnas que viajan. Mandarla
 * "por si acaso" desde el cliente es lo que hacía que todo perfil nuevo
 * naciera en 'private' pese al default.
 *
 * Lo que sí sigue siendo un acto explícito del usuario es ABRIRSE: pasar a
 * 'public' solo ocurre tocando la opción en Quién te ve.
 */
export async function saveMyProfile(userId, patch) {
  if (!ok() || !userId) return null;
  const row = { user_id: userId, ...patch };
  const { data, error } = await supabase
    .from("social_profiles")
    .upsert(row, { onConflict: "user_id" })
    .select()
    .maybeSingle();
  // 23505 = unique_violation → el handle ya está cogido. Es un caso de UI, no
  // un error de red: se devuelve marcado para que la pantalla lo cuente.
  if (error?.code === "23505") return { error: "username_taken" };
  if (warn("saveMyProfile", error)) return null;
  return data ?? null;
}

/** ¿Está libre este handle? Comprobación optimista para el formulario. */
export async function isUsernameFree(username) {
  if (!ok() || !username) return false;
  const { data, error } = await supabase
    .from("social_profiles")
    .select("user_id")
    .ilike("username", username)
    .maybeSingle();
  if (error) { warn("isUsernameFree", error); return false; }
  return !data;
}

/**
 * Reglas del handle, en un solo sitio porque las comprueban dos: el formulario
 * (para avisar mientras escribes) y el CHECK de la base (que es el que manda).
 * Si divergen, el formulario diria que si y el guardado fallaria sin explicar.
 */
export const USERNAME_RE = /^[a-z0-9._]{3,24}$/;

// Handles que se prestan a hacerse pasar por la app o por su equipo. Lista
// EXACTA + veto por marca (cualquier handle que contenga "homenu" o
// "menuplan"): la lista sola no para "homenu.oficial" ni "soporte_homenu".
//
// Lo comprueban dos, como el formato: este modulo (para avisar mientras
// escribes) y el CHECK de la base (0044, que es el que manda). Si divergen,
// el formulario diria que si y el guardado fallaria sin explicar.
export const RESERVED_USERNAMES = [
  "admin", "administrador", "soporte", "support", "ayuda", "help",
  "info", "contacto", "oficial", "official", "equipo", "staff",
  "moderador", "moderacion", "mod", "seguridad", "security",
  "sistema", "system", "api", "root", "noreply", "news", "legal",
  "privacidad", "terminos",
];
const BRAND_RE = /homenu|menuplan/;

export function usernameError(value) {
  const v = (value ?? "").trim();
  if (!v) return null;                       // vacio es valido: no tener handle
  if (v.length < 3) return "Mínimo 3 caracteres";
  if (v.length > 24) return "Máximo 24 caracteres";
  if (!USERNAME_RE.test(v)) return "Solo minúsculas, números, punto y guion bajo";
  // "..." o "._." pasan el regex pero no identifican a nadie: un handle sin
  // una sola letra o numero solo sirve para confundir.
  if (!/[a-z0-9]/.test(v)) return "Necesita al menos una letra o número";
  if (RESERVED_USERNAMES.includes(v) || BRAND_RE.test(v)) return "Ese nombre está reservado";
  return null;
}

/**
 * Un @usuario a partir del nombre: sin acentos, en minusculas y con puntos en
 * vez de espacios. Nadie deberia tener que inventarse un handle — se le
 * propone uno y ya lo cambia si quiere.
 */
export function deriveUsername(name) {
  const base = (name ?? "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")  // fuera acentos
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ".")                       // todo lo demas, punto
    .replace(/\.+/g, ".")
    .replace(/^\.|\.$/g, "")
    .slice(0, 24);
  // Menos de 3 no pasa el CHECK de la base: se rellena en vez de proponer algo
  // que va a fallar al guardar.
  return base.length >= 3 ? base : (base ? `${base}.cocina`.slice(0, 24) : "");
}

/**
 * El primero libre a partir del nombre: `marta.cocina`, `marta.cocina2`… Es
 * una sugerencia, no una reserva: entre esto y tu "Guardar" alguien puede
 * pillarlo, y de eso se encarga el indice unico.
 */
export async function suggestUsername(name) {
  const base = deriveUsername(name);
  if (!base || !ok()) return base;
  for (let i = 0; i < 6; i++) {
    const candidate = i === 0 ? base : `${base}${i + 1}`.slice(0, 24);
    if (await isUsernameFree(candidate)) return candidate;
  }
  return base;
}

/**
 * Garantiza que esta cuenta EXISTE para el feed: fila de perfil con nombre y
 * handle, creada si no estaba.
 *
 * El modelo es "cuenta activa = te pueden encontrar, salvo que elijas Nadie".
 * Eso exige que la fila nazca al INICIAR SESION, no al abrir el cajon del
 * perfil, que es donde nacia antes: quien usaba HoMenu a diario sin pisar el
 * Feed no existia para la busqueda, y "Encontrar gente" parecia rota estando
 * perfecta — buscaba sobre un censo vacio.
 *
 * La visibilidad NO viaja: la decide el default de la columna ('followers',
 * 0038) o lo que el usuario ya eligiera. Ver saveMyProfile.
 *
 * Si el guardado falla (sin red, migracion sin aplicar) devuelve el derivado
 * marcado `unsaved`: quien llama decide si le vale para pintar, y el proximo
 * inicio de sesion lo reintenta solo.
 */
export async function ensureSocialProfile(userId, fallbackName = "") {
  if (!userId) return null;
  const current = ok() ? await loadMyProfile(userId) : null;
  if (current?.username) return current;
  const display = current?.display_name || fallbackName || "";
  const username = await suggestUsername(display);
  if (!username) return current;
  const saved = ok() ? await saveMyProfile(userId, { display_name: display, username }) : null;
  if (!saved || saved.error) return { user_id: userId, display_name: display, username, unsaved: true };
  return saved;
}

/** El perfil publico de otra persona. */
export async function loadProfileById(userId) {
  if (!ok() || !userId) return null;
  const { data, error } = await supabase
    .from("social_profiles")
    .select("user_id, username, display_name, avatar_url, bio, visibility")
    .eq("user_id", userId)
    .maybeSingle();
  if (warn("loadProfileById", error)) return null;
  return data ?? null;
}

/**
 * Lo que esa persona tiene publicado y tu puedes ver. Las politicas RLS ya
 * deciden: si su perfil es 'followers' y no te ha aceptado, esto vuelve vacio
 * — que es exactamente lo que tiene que pasar, no un error.
 */
export async function loadPersonContent(userId, { viewerId = null } = {}) {
  if (!ok() || !userId) return { recipes: [], menus: [] };
  // Bloqueado en cualquier direccion: ni ves su contenido ni el tuyo (si te
  // hubiera bloqueado a ti) tendria sentido que se lo enseñases a el.
  if (viewerId) {
    const { data } = await supabase.rpc("is_blocked", { a: viewerId, b: userId });
    if (data) return { recipes: [], menus: [] };
  }
  const [recipes, menus] = await Promise.all([
    supabase
      .from("user_recipes")
      // type y los ids de catalogo no son de adorno: sin ellos la ficha no se
      // puede abrir con su forma real y dishImageForRecipe no resuelve foto
      // para las recetas que salen del catalogo (que son casi todas).
      .select("id, owner_id, name, category, type, difficulty, time_minutes, photo, linked_catalog_id, base_dish_id, pinned_garnish_id, created_at")
      .eq("owner_id", userId)
      .neq("visibility", "private")
      .order("created_at", { ascending: false })
      .limit(24),
    supabase
      .from("shared_menus")
      .select("id, owner_id, title, week_start, week_end, payload, created_at")
      .eq("owner_id", userId)
      .neq("visibility", "private")
      .order("created_at", { ascending: false })
      .limit(6),
  ]);
  warn("loadPersonContent/recipes", recipes.error);
  warn("loadPersonContent/menus", menus.error);
  return { recipes: recipes.data ?? [], menus: menus.data ?? [] };
}

// ── Seguir ──────────────────────────────────────────────────────────────────

/**
 * Seguir. Devuelve "accepted" o "pending" segun la privacidad del otro, o
 * null si no se pudo. La decision la toma request_follow() en el servidor: si
 * la tomara el cliente, bastaria con mandar status='accepted' a mano.
 */
export async function followUser(userId, targetId) {
  if (!ok() || !userId || !targetId || userId === targetId) return null;
  const { data, error } = await supabase.rpc("request_follow", { p_target: targetId });
  if (warn("followUser", error)) return null;
  return data ?? "accepted";
}

export async function unfollowUser(userId, targetId) {
  if (!ok() || !userId || !targetId) return false;
  const { error } = await supabase
    .from("user_follows")
    .delete()
    .eq("follower_id", userId)
    .eq("followee_id", targetId);
  return !warn("unfollowUser", error);
}

/** Ids a los que sigue el usuario. Base de todo lo demás, así que se cachea arriba. */
export async function loadFollowing(userId) {
  if (!ok() || !userId) return [];
  const { data, error } = await supabase
    .from("user_follows")
    .select("followee_id")
    .eq("follower_id", userId)
    .eq("status", "accepted");
  if (warn("loadFollowing", error)) return [];
  return (data ?? []).map((r) => r.followee_id);
}

// ── Solicitudes ─────────────────────────────────────────────────────────────

/** Quien ha pedido seguirte y aun no has contestado. */
export async function loadFollowRequests(userId) {
  if (!ok() || !userId) return [];
  const { data, error } = await supabase
    .from("user_follows")
    .select("follower_id, created_at")
    .eq("followee_id", userId)
    .eq("status", "pending")
    .order("created_at", { ascending: false });
  if (warn("loadFollowRequests", error)) return [];
  return data ?? [];
}

export async function acceptFollowRequest(userId, followerId) {
  if (!ok() || !userId || !followerId) return false;
  const { error } = await supabase
    .from("user_follows")
    .update({ status: "accepted", responded_at: new Date().toISOString() })
    .eq("followee_id", userId)
    .eq("follower_id", followerId);
  return !warn("acceptFollowRequest", error);
}

/**
 * Rechazar borra la fila en vez de marcarla: dejarla en 'rejected' seria
 * guardar para siempre que alguien te pidio algo y dijiste que no, y ademas
 * impediria que volviera a pedirlo si cambiais de idea.
 */
export async function rejectFollowRequest(userId, followerId) {
  if (!ok() || !userId || !followerId) return false;
  const { error } = await supabase
    .from("user_follows")
    .delete()
    .eq("followee_id", userId)
    .eq("follower_id", followerId);
  return !warn("rejectFollowRequest", error);
}

/** Quien te sigue (aceptados). Mismo endpoint para "quitar seguidor". */
export async function loadFollowers(userId) {
  if (!ok() || !userId) return [];
  const { data, error } = await supabase
    .from("user_follows")
    .select("follower_id, created_at")
    .eq("followee_id", userId)
    .eq("status", "accepted")
    .order("created_at", { ascending: false });
  if (warn("loadFollowers", error)) return [];
  return data ?? [];
}

/**
 * Lo que TU has pedido y aun no te han contestado. Las rechazadas no salen
 * porque rechazar borra la fila: no se guarda que alguien te dijo que no.
 */
export async function loadSentRequests(userId) {
  if (!ok() || !userId) return [];
  const { data, error } = await supabase
    .from("user_follows")
    .select("followee_id, created_at, status")
    .eq("follower_id", userId)
    .eq("status", "pending")
    .order("created_at", { ascending: false });
  if (warn("loadSentRequests", error)) return [];
  return data ?? [];
}

/** Retirar una solicitud que enviaste. Es el mismo unfollow. */
export async function cancelSentRequest(userId, targetId) {
  return unfollowUser(userId, targetId);
}

/**
 * Tus recetas publicadas con sus numeros: me gusta, no me gusta, veces que ha
 * entrado en un menu y comentarios recibidos. Es "como le va a lo que
 * publico", que es lo unico que un autor mira dos veces.
 */
export async function loadMyRecipeStats(userId) {
  if (!ok() || !userId) return [];
  const { data, error } = await supabase
    .from("user_recipes")
    .select("id, name, photo, visibility, created_at")
    .eq("owner_id", userId)
    .neq("visibility", "private")
    .order("created_at", { ascending: false })
    .limit(40);
  if (warn("loadMyRecipeStats", error)) return [];

  const rows = data ?? [];
  if (rows.length === 0) return [];

  // Los comentarios se cuentan aqui y no con un count() por receta: son N+1
  // peticiones frente a una sola que trae los ids y se agrupa en cliente.
  const [stats, comments] = await Promise.all([
    loadRecipeStats(rows.map((r) => r.id)),
    supabase
      .from("social_comments")
      .select("target_id")
      .eq("target_owner_id", userId)
      .eq("target_type", "recipe"),
  ]);
  warn("loadMyRecipeStats/comments", comments.error);

  const byRecipe = {};
  for (const c of comments.data ?? []) byRecipe[c.target_id] = (byRecipe[c.target_id] ?? 0) + 1;

  return rows.map((r) => ({
    ...r,
    likes: stats[r.id]?.likes ?? 0,
    dislikes: stats[r.id]?.dislikes ?? 0,
    used: stats[r.id]?.used ?? 0,
    comments: byRecipe[r.id] ?? 0,
  }));
}

// ── Comentarios ─────────────────────────────────────────────────────────────

/** Lo que te han comentado, de lo mas reciente a lo mas viejo. */
export async function loadCommentInbox(userId, { limit = 30 } = {}) {
  if (!ok() || !userId) return [];
  const { data, error } = await supabase
    .from("social_comments")
    .select("id, target_type, target_id, author_id, body, created_at")
    .eq("target_owner_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (warn("loadCommentInbox", error)) return [];
  return data ?? [];
}

/** Los comentarios de una receta o de un menu concreto. */
export async function loadComments(targetType, targetId, { limit = 60 } = {}) {
  if (!ok() || !targetId) return [];
  const { data, error } = await supabase
    .from("social_comments")
    .select("id, author_id, body, created_at, parent_id")
    .eq("target_type", targetType)
    .eq("target_id", String(targetId))
    .order("created_at", { ascending: true })
    .limit(limit);
  if (warn("loadComments", error)) return [];
  return data ?? [];
}

/**
 * Me gusta de un puñado de comentarios, y si tu ya lo diste. Por RPC: la
 * politica de social_comment_likes solo deja ver TUS filas, asi que contar
 * desde el cliente daria 0 o 1 siempre.
 */
export async function loadCommentLikes(ids) {
  const unique = [...new Set((ids ?? []).filter(Boolean))];
  if (!ok() || unique.length === 0) return {};
  const { data, error } = await supabase.rpc("comment_like_counts", { p_ids: unique });
  if (warn("loadCommentLikes", error)) return {};
  return Object.fromEntries(
    (data ?? []).map((r) => [r.comment_id, { likes: Number(r.likes ?? 0), mine: Boolean(r.liked_by_me) }]),
  );
}

export async function toggleCommentLike(userId, commentId, on) {
  if (!ok() || !userId || !commentId) return false;
  if (on) {
    const { error } = await supabase
      .from("social_comment_likes")
      .upsert({ comment_id: commentId, user_id: userId }, { onConflict: "comment_id,user_id" });
    return !warn("toggleCommentLike/on", error);
  }
  const { error } = await supabase
    .from("social_comment_likes")
    .delete()
    .eq("comment_id", commentId)
    .eq("user_id", userId);
  return !warn("toggleCommentLike/off", error);
}

/**
 * `targetOwnerId` viaja desde el cliente porque la politica de lectura lo
 * necesita en la propia fila (ver el porque en 0028). No es un agujero: la
 * politica de escritura solo comprueba que el autor seas tu, y mentir sobre el
 * dueno solo consigue que el comentario no lo lea nadie.
 */
/**
 * Comentar. `targetOwnerId` va NULO en las recetas del catalogo: son de la
 * casa y no tienen dueño (ver 0036). No es un descuido, es el caso normal
 * para casi todo lo que se comenta.
 */
export async function postComment(userId, { targetType, targetId, targetOwnerId = null, body, parentId = null }) {
  const text = (body ?? "").trim();
  if (!ok() || !userId || !targetId || !text) return null;
  const { data, error } = await supabase
    .from("social_comments")
    .insert({
      target_type: targetType,
      target_id: String(targetId),
      target_owner_id: targetOwnerId,
      author_id: userId,
      body: text.slice(0, 500),
      parent_id: parentId,
    })
    .select()
    .maybeSingle();
  if (warn("postComment", error)) return null;
  return data ?? null;
}

/**
 * Editar un comentario propio. Deja constancia en `edited_at` para que la
 * interfaz pueda decir "editado": cambiar en silencio lo que otro ya leyo es
 * una forma barata de mentir.
 */
export async function updateComment(commentId, body) {
  const text = (body ?? "").trim();
  if (!ok() || !commentId || !text) return false;
  const { error } = await supabase
    .from("social_comments")
    .update({ body: text.slice(0, 500), edited_at: new Date().toISOString() })
    .eq("id", commentId);
  return !warn("updateComment", error);
}

export async function deleteComment(commentId) {
  if (!ok() || !commentId) return false;
  const { error } = await supabase.from("social_comments").delete().eq("id", commentId);
  return !warn("deleteComment", error);
}

// ── Descubrir ───────────────────────────────────────────────────────────────

/** Búsqueda por handle o nombre. Vía RPC: ver el porqué en la migración. */
export async function searchProfiles(query) {
  if (!ok() || (query ?? "").trim().length < 2) return [];
  const { data, error } = await supabase.rpc("search_social_profiles", { p_query: query });
  if (warn("searchProfiles", error)) return [];
  return data ?? [];
}

/**
 * A quién seguir: gente a la que sigue la gente que sigues (ver
 * 0035_social_suggestions.sql). Trae el porqué — cuántos conocidos en común y
 * el nombre de uno — porque una sugerencia sin motivo es una lista de
 * desconocidos.
 *
 * Nunca sugiere perfiles privados, ni a quien ya sigues o has pedido seguir,
 * ni a nadie con bloqueo de por medio: eso lo garantiza la propia función.
 */
export async function loadSuggestedProfiles(userId, { limit = 12 } = {}) {
  if (!ok() || !userId) return FIXTURES_ENABLED ? FIXTURE_SUGGESTED : [];
  const { data, error } = await supabase.rpc("suggested_profiles", { p_limit: limit });
  if (warn("loadSuggestedProfiles", error)) return [];
  const rows = data ?? [];
  return rows.length === 0 && FIXTURES_ENABLED ? FIXTURE_SUGGESTED : rows;
}


/**
 * Los ultimos en llegar a HoMenu que puedes encontrar y aun no sigues.
 *
 * Es la pata de ARRANQUE del descubridor: las otras tres secciones dependen
 * de un grafo (follows, feed publico) que en una red recien estrenada no
 * existe, y sin esto la unica forma de descubrir a alguien era saberse su
 * nombre y escribirlo. Exclusiones y tope en el SQL (0045), no aqui.
 */
export async function loadRecentProfiles(userId, { limit = 12 } = {}) {
  if (!ok() || !userId) return [];
  const { data, error } = await supabase.rpc("recent_profiles", { p_limit: limit });
  if (warn("loadRecentProfiles", error)) return [];
  return data ?? [];
}

/**
 * La lista de seguidores (o de seguidos) de alguien. Por RPC porque las
 * politicas de user_follows solo dejan ver tus propias filas.
 *
 * La de un perfil privado no se enseña ni de refilon; eso lo decide la
 * funcion, no esta pantalla.
 */
export async function loadFollowList(userId, kind = "followers") {
  if (!ok() || !userId) return [];
  const { data, error } = await supabase.rpc("profile_follow_list", { p_user: userId, p_kind: kind });
  if (warn("loadFollowList", error)) return [];
  return data ?? [];
}

/**
 * Sumar uno al contador de copias de un menu ajeno. La copia en si pasa
 * entera en el cliente; esto es solo el contador, que la fila es de otro.
 */
export async function countMenuCopy(menuId) {
  if (!ok() || !menuId) return false;
  const { error } = await supabase.rpc("count_menu_copy", { p_menu: menuId });
  return !warn("countMenuCopy", error);
}

export async function loadProfileCounts(userId) {
  if (!ok() || !userId) return { followers: 0, following: 0, recipes: 0, menus: 0 };
  const { data, error } = await supabase.rpc("social_profile_counts", { p_user: userId });
  if (warn("loadProfileCounts", error)) return { followers: 0, following: 0, recipes: 0, menus: 0 };
  const row = Array.isArray(data) ? data[0] : data;
  return {
    followers: Number(row?.followers ?? 0),
    following: Number(row?.following ?? 0),
    recipes: Number(row?.recipes ?? 0),
    menus: Number(row?.menus ?? 0),
  };
}

/**
 * Me gusta / no me gusta / veces incluida en un menú, para una tanda de
 * recetas. Vía RPC porque las políticas de recipe_votes y user_menu_recipes
 * solo dejan ver TUS filas: contado desde el cliente daría 0 o 1 siempre.
 *
 * Devuelve agregados, nunca quién votó qué.
 */
export async function loadRecipeStats(ids) {
  const unique = [...new Set((ids ?? []).filter(Boolean))];
  if (!ok() || unique.length === 0) return {};
  const { data, error } = await supabase.rpc("recipe_social_stats", { p_ids: unique });
  if (warn("loadRecipeStats", error)) return {};
  return Object.fromEntries(
    (data ?? []).map((r) => [r.recipe_id, {
      likes: Number(r.likes ?? 0),
      dislikes: Number(r.dislikes ?? 0),
      used: Number(r.used ?? 0),
      comments: Number(r.comments ?? 0),
    }]),
  );
}

// ── Bloquear ─────────────────────────────────────────────────────────────
//
// Bloquear cierra lo que la base ya sabe cerrar (seguir, comentar, ver
// contenido 'followers') a través de is_blocked() en 0033. Lo que la base NO
// filtra es el contenido 'public': esas politicas dejan pasar a cualquiera a
// proposito (para eso es publico), asi que aqui se filtra en cliente contra
// tu lista de bloqueados — mismo patron que readHiddenRecipes.

export async function blockUser(userId, targetId) {
  if (!ok() || !userId || !targetId) return false;
  const { error } = await supabase.rpc("block_user", { p_target: targetId });
  return !warn("blockUser", error);
}

export async function unblockUser(userId, targetId) {
  if (!ok() || !userId || !targetId) return false;
  const { error } = await supabase.rpc("unblock_user", { p_target: targetId });
  return !warn("unblockUser", error);
}

/** Solo los ids: lo que necesitan los filtros de feed, mazo y búsqueda. */
export async function loadBlockedIds(userId) {
  if (!ok() || !userId) return [];
  const { data, error } = await supabase
    .from("blocked_users")
    .select("blocked_id")
    .eq("blocker_id", userId);
  if (warn("loadBlockedIds", error)) return [];
  return (data ?? []).map((r) => r.blocked_id);
}

/** Con perfil, para poder pintar "Bloqueados" en Mi perfil y desbloquear. */
export async function loadBlockedUsers(userId) {
  const ids = await loadBlockedIds(userId);
  if (ids.length === 0) return [];
  const profiles = await loadProfilesByIds(ids);
  return ids.map((id) => ({ user_id: id, ...(profiles[id] ?? {}) }));
}

// ── Reportar ─────────────────────────────────────────────────────────────

export const REPORT_REASONS = [
  { id: "spam", label: "Spam o publicidad" },
  { id: "inappropriate", label: "Contenido inapropiado" },
  { id: "harassment", label: "Acoso o insultos" },
  { id: "other", label: "Otro motivo" },
];

/**
 * `targetType` es "recipe" | "menu" | "comment" | "profile". Sin owner: a
 * diferencia de los comentarios, el reporte no necesita saber de quien es el
 * contenido para la politica de lectura — solo tu lo lees (ver 0033), y quien
 * SI necesita saber el dueño es moderacion, no esta funcion.
 */
export async function reportContent(userId, { targetType, targetId, reason, note = "" }) {
  if (!ok() || !userId || !targetId || !reason) return false;
  const { error } = await supabase.from("content_reports").insert({
    reporter_id: userId,
    target_type: targetType,
    target_id: String(targetId),
    reason,
    note: note.trim() ? note.trim().slice(0, 500) : null,
  });
  return !warn("reportContent", error);
}

// ── El feed ─────────────────────────────────────────────────────────────────

const FEED_PAGE = 20;

/**
 * Recetas y menús que este usuario puede ver, mezclados y ordenados por fecha.
 *
 * No hay un `union` en el servidor todavía: se piden las dos listas y se
 * intercalan aquí. Con los volúmenes de ahora sobra; cuando el feed crezca
 * esto tiene que pasar a una RPC paginada (dos SELECT + merge en cliente no
 * pagina bien, porque cada lista trae sus 20 más recientes por separado).
 *
 * Las políticas RLS ya filtran por quién eres: aquí no se decide nada de
 * permisos, solo se pide y se ordena.
 */
export async function loadFeed({
  viewerId = null,
  scope = "all",
  followingIds = null,
  cursor = null,
  limit = FEED_PAGE,
} = {}) {
  if (!ok()) return { items: [], cursor: null, done: true };

  // "Siguiendo" necesita saber a quien sigues. Si no sigues a nadie devuelve
  // vacio A PROPOSITO: caer en silencio a lo publico haria que seguir a
  // alguien no cambiase nada de lo que ves, que es justo el problema que esta
  // pestaña viene a arreglar.
  const following = scope === "following"
    ? (followingIds ?? (viewerId ? await loadFollowing(viewerId) : []))
    : null;
  if (scope === "following" && following.length === 0) {
    return { items: [], cursor: null, done: true, empty: "following" };
  }

  const blocked = viewerId ? new Set(await loadBlockedIds(viewerId)) : new Set();

  // Paginacion por FECHA y no por offset: con offset, publicar algo mientras
  // alguien baja por el feed le repite filas y le esconde otras. El cursor es
  // la fecha del ultimo visto, asi que la ventana no se mueve bajo sus pies.
  // Descubrir = lo publico de quien AUN NO sigues. Si trajera tambien a tus
  // seguidos, las dos pestañas enseñarian casi lo mismo y cambiar de una a
  // otra no significaria nada. Lo tuyo tampoco sale: descubrir tu propia
  // receta no es descubrir.
  const exclude = scope === "all" && viewerId
    ? [...new Set([...(followingIds ?? await loadFollowing(viewerId)), viewerId])]
    : [];

  const page = (q) => {
    let out = q.neq("visibility", "private").order("created_at", { ascending: false }).limit(limit);
    if (cursor) out = out.lt("created_at", cursor);
    if (following) out = out.in("owner_id", following);
    if (exclude.length) out = out.not("owner_id", "in", `(${exclude.join(",")})`);
    return out;
  };

  // Solo recetas. Los menus son de una semana concreta y caducan con ella,
  // asi que viven en el carrusel de arriba (loadWeeklyMenus) y no en el rio.
  // Antes se pedian aqui tambien -con su payload entero, todos los platos de
  // la semana- en CADA pagina del feed, para luego no pintarlos en ningun
  // sitio: era la peticion mas pesada de la pantalla y no se veia jamas.
  const recipes = await page(supabase.from("user_recipes").select(
    "id, owner_id, name, category, type, time_minutes, difficulty, photo, linked_catalog_id, base_dish_id, pinned_garnish_id, visibility, created_at"));

  warn("loadFeed/recipes", recipes.error);

  // Lo descartado con "no me la ensenes mas" no vuelve ni aqui ni en el mazo:
  // el mismo filtro en los dos sitios por donde entran recetas ajenas.
  const hidden = readHiddenRecipes();

  const merged = (recipes.data ?? [])
    .filter((r) => !hidden.has(r.id) && !blocked.has(r.owner_id))
    .map((r) => ({ kind: "recipe", id: r.id, ownerId: r.owner_id, createdAt: r.created_at, recipe: r }));

  // En dev, si no hay nada real que enseñar (la migración 0027 aún no está
  // aplicada, o todavía no sigues a nadie), se rellena con sintéticos para
  // poder diseñar la pantalla. Nunca en producción — ver socialFixtures.js.
  if (merged.length === 0 && !cursor && FIXTURES_ENABLED) {
    return { items: fixtureFeed().slice(0, limit), cursor: null, done: true };
  }

  const items = merged;
  const last = items[items.length - 1];
  // Si la consulta devolvio menos de lo que cabia, no hay mas paginas.
  const done = (recipes.data ?? []).length < limit;
  return { items, cursor: done ? null : last?.createdAt ?? null, done };
}

/**
 * Los perfiles de los autores que aparecen en una tanda del feed. Se piden de
 * golpe (un `in`) en vez de uno por tarjeta: si no, un feed de 20 son 20
 * peticiones.
 */
export async function loadProfilesByIds(ids) {
  const unique = [...new Set((ids ?? []).filter(Boolean))];
  if (!ok() || unique.length === 0) return {};
  const { data, error } = await supabase
    .from("social_profiles")
    .select("user_id, username, display_name, avatar_url, visibility")
    .in("user_id", unique);
  const real = Object.fromEntries((data ?? []).map((p) => [p.user_id, p]));
  if (warn("loadProfilesByIds", error) || FIXTURES_ENABLED) {
    // Los ids de mentira empiezan por fx_ y no existen en la tabla; se
    // resuelven aquí para que las tarjetas sintéticas tengan cara.
    for (const id of unique) if (!real[id] && FIXTURE_PROFILES[id]) real[id] = FIXTURE_PROFILES[id];
  }
  return real;
}

/**
 * La fila de arriba: menús de esta semana, uno por autor (el más reciente).
 * Es lo único del feed que caduca de verdad — un menú semanal deja de tener
 * sentido el lunes siguiente — así que se filtra por fecha, no por antigüedad.
 */
export async function loadWeeklyMenus({ viewerId = null, scope = "all", followingIds = null, today = new Date() } = {}) {
  if (!ok()) return [];
  const blocked = viewerId ? new Set(await loadBlockedIds(viewerId)) : new Set();
  const iso = today.toISOString().slice(0, 10);

  // La fila de arriba obedece a la misma pestaña que el rio: estar en
  // "Siguiendo" y ver desconocidos ahi arriba contradecia la eleccion que
  // acababas de hacer dos centimetros mas abajo.
  const mine = scope === "following" && viewerId
    ? (followingIds ?? await loadFollowing(viewerId))
    : null;
  if (scope === "following" && (mine?.length ?? 0) === 0) return [];

  let q = supabase
    .from("shared_menus")
    .select("id, owner_id, title, week_start, week_end, payload, created_at")
    .neq("visibility", "private")
    .lte("week_start", iso)
    .gte("week_end", iso);
  if (mine) q = q.in("owner_id", mine);
  const { data, error } = await q.order("created_at", { ascending: false });
  // Ojo al orden: si la tabla no existe (migración sin aplicar) esto salía
  // antes de llegar al relleno de dev, y la fila de arriba no aparecía nunca.
  if (warn("loadWeeklyMenus", error)) return FIXTURES_ENABLED ? FIXTURE_MENUS : [];

  const seen = new Set();
  const rows = (data ?? []).filter((m) => {
    if (blocked.has(m.owner_id)) return false;
    if (seen.has(m.owner_id)) return false;
    seen.add(m.owner_id);
    return true;
  });
  if (rows.length === 0 && FIXTURES_ENABLED) return FIXTURE_MENUS;
  return rows;
}

/**
 * Recetas de otra gente que este usuario puede leer, ya en la forma del
 * catálogo y firmadas con el perfil de su autor.
 *
 * Esto es lo que hace que el mazo de Inspírate mezcle catálogo y gente: allí
 * decides platos, y de dónde salga el plato es lo de menos. El Feed, en
 * cambio, va de personas — por eso el swipe vive en Inspírate y no aquí.
 *
 * Las políticas RLS ya deciden qué se ve: 'public' cualquiera, 'friends' solo
 * seguimiento mutuo. Aquí solo se pide y se firma.
 */
export async function loadSocialRecipes({ excludeOwnerId = null, limit = 60 } = {}) {
  if (!ok()) return [];
  let q = supabase
    .from("user_recipes")
    .select("*")
    .neq("visibility", "private")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (excludeOwnerId) q = q.neq("owner_id", excludeOwnerId);

  const [{ data, error }, blockedIds] = await Promise.all([
    q,
    excludeOwnerId ? loadBlockedIds(excludeOwnerId) : Promise.resolve([]),
  ]);
  if (warn("loadSocialRecipes", error)) return [];

  const hidden = readHiddenRecipes();
  const blocked = new Set(blockedIds);
  const rows = (data ?? []).filter((r) => !hidden.has(r.id) && !blocked.has(r.owner_id));
  const profiles = await loadProfilesByIds(rows.map((r) => r.owner_id));
  return rows.map((row) => {
    const p = profiles[row.owner_id];
    return {
      ...rowToRecipe(row),
      ownerId: row.owner_id,
      // La firma que pinta la carta. Sin perfil todavía (no ha hecho opt-in o
      // la migración no está aplicada) se queda en "Alguien" — nunca en el
      // logo de HoMenu, que firmaría como nuestra la receta de otro.
      owner: {
        name: p?.display_name || (p?.username ? `@${p.username}` : "Alguien"),
        avatar: p?.avatar_url ?? null,
      },
    };
  });
}

// ── Publicar un menú ────────────────────────────────────────────────────────

export const SHARED_MENU_PAYLOAD_VERSION = 1;

/**
 * Publica (o republica) un menú. `payload` lo construye el llamante con
 * buildSharedMenuPayload — ver el contrato en la migración: platos por día y
 * avatares anónimos, NUNCA compra, presupuesto, horarios ni nombres.
 *
 * `onConflict` sobre (owner_id, menu_id): republicar el mismo menú lo
 * actualiza en vez de llenar el feed de duplicados.
 */
export async function publishMenu(userId, { menuId, title, weekStart, weekEnd, payload, visibility = "followers" }) {
  if (!ok() || !userId || !menuId) return null;
  const { data, error } = await supabase
    .from("shared_menus")
    .upsert(
      {
        owner_id: userId,
        menu_id: menuId,
        title: title ?? null,
        week_start: weekStart ?? null,
        week_end: weekEnd ?? null,
        payload,
        visibility,
      },
      { onConflict: "owner_id,menu_id" },
    )
    .select()
    .maybeSingle();
  if (warn("publishMenu", error)) return null;
  return data ?? null;
}

export async function unpublishMenu(userId, menuId) {
  if (!ok() || !userId || !menuId) return false;
  const { error } = await supabase
    .from("shared_menus")
    .delete()
    .eq("owner_id", userId)
    .eq("menu_id", menuId);
  return !warn("unpublishMenu", error);
}

/** Los menús que este usuario tiene publicados, por menu_id, para pintar el estado del botón. */
export async function loadMyPublishedMenus(userId) {
  if (!ok() || !userId) return {};
  const { data, error } = await supabase
    .from("shared_menus")
    .select("id, menu_id, visibility, copy_count, created_at")
    .eq("owner_id", userId);
  if (warn("loadMyPublishedMenus", error)) return {};
  return Object.fromEntries((data ?? []).map((m) => [m.menu_id, m]));
}
