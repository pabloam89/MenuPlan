import { supabase } from "./supabase.js";
import { FIXTURES_ENABLED, FIXTURE_NOTIFICATIONS } from "./socialFixtures.js";

/**
 * Notificaciones del Feed (ver 0034_social_notifications.sql).
 *
 * Aquí NO hay tabla de notificaciones: la bandeja se DERIVA de las tablas
 * donde los hechos ya viven (user_follows, social_comments). Una tabla espejo
 * escrita por triggers puede discrepar de la verdad y deja fantasmas — el
 * aviso de un comentario que su autor ya borró. Derivando, borrar el hecho
 * borra el aviso solo.
 *
 * Lo único persistido es una marca de agua (notifications_seen_at en
 * social_profiles): abrir el panel la avanza, y "sin leer" es todo lo más
 * nuevo que tu última mirada. Sin estado leído/no-leído por fila: es el
 * modelo de las historias de IG, y para una app de menús sobra lo demás.
 *
 * Qué avisa y qué no (filosofía de calma):
 *   · te piden seguirte / te aceptaron / alguien empezó a seguirte
 *   · comentaron algo tuyo / respondieron a un comentario tuyo
 *   · NO likes de comentarios (ruido), NO "fulanito publicó" (para eso está
 *     el propio feed).
 */

const ok = () => Boolean(supabase);

function warn(where, error) {
  if (error) console.warn(`[notif] ${where}`, error.message ?? error);
  return error;
}

// ── Construcción pura (testeable sin red) ───────────────────────────────────

/**
 * Junta las cinco fuentes en una lista ordenada de más nueva a más vieja.
 *
 * Cada item: { key, kind, actorId, at, targetType?, targetId?, body? }
 * kinds: "request" | "accepted" | "follower" | "comment" | "reply" | "mention"
 *
 * Decisiones finas, todas a favor de no dar la brasa:
 *  · followers solo cuenta los que llegaron SOLOS (responded_at null = perfil
 *    público, sin solicitud). Si lo aceptaste tú, ya lo supiste al aceptar.
 *  · comments descarta los tuyos (comentar tu propia receta no es noticia).
 *  · replies descarta los que ya están en comments (una respuesta a ti en TU
 *    contenido llega por los dos caminos; con una vez basta).
 */
export function buildNotifications({ requests = [], accepted = [], followers = [], comments = [], replies = [], mentions = [], menus = [], meId = null } = {}) {
  const items = [];

  for (const r of requests) {
    items.push({ key: `req_${r.follower_id}`, kind: "request", actorId: r.follower_id, at: r.created_at });
  }
  for (const a of accepted) {
    items.push({ key: `acc_${a.followee_id}`, kind: "accepted", actorId: a.followee_id, at: a.responded_at });
  }
  // Un amigo ha publicado su menu de la semana.
  //
  // Solo MENUS, no recetas: un menu es un acontecimiento -pasa una vez por
  // semana y caduca con ella-, mientras que las recetas son un goteo. Avisar
  // de cada receta convertiria la campana en el propio feed y la gente
  // dejaria de mirarla, que es como se estropean las notificaciones.
  //
  // Lo tuyo no cuenta: enterarte de que has publicado tu no es una noticia.
  for (const m of menus) {
    if (meId && m.owner_id === meId) continue;
    items.push({ key: `mnu_${m.id}`, kind: "menu", actorId: m.owner_id, at: m.created_at, targetType: "menu", targetId: m.id });
  }
  for (const f of followers) {
    if (f.responded_at != null) continue; // lo aceptaste tú: ya lo sabes
    items.push({ key: `fol_${f.follower_id}`, kind: "follower", actorId: f.follower_id, at: f.created_at });
  }

  const commentIds = new Set();
  for (const c of comments) {
    if (meId && c.author_id === meId) continue;
    commentIds.add(c.id);
    items.push({
      key: `com_${c.id}`, kind: "comment", actorId: c.author_id, at: c.created_at,
      targetType: c.target_type, targetId: c.target_id, body: c.body,
    });
  }
  for (const c of replies) {
    if (commentIds.has(c.id)) continue; // ya está como comentario a lo tuyo
    if (meId && c.author_id === meId) continue;
    items.push({
      key: `rep_${c.id}`, kind: "reply", actorId: c.author_id, at: c.created_at,
      targetType: c.target_type, targetId: c.target_id, body: c.body,
    });
  }

  // Una mencion dentro de un comentario a lo tuyo (o a tu comentario) ya te
  // ha llegado por su camino: avisar dos veces del mismo comentario es lo que
  // convierte una campana en ruido.
  const already = new Set(items.map((i) => i.key.replace(/^(com|rep)_/, "")));
  for (const c of mentions) {
    if (already.has(c.id)) continue;
    if (meId && c.author_id === meId) continue;
    items.push({
      key: `men_${c.id}`, kind: "mention", actorId: c.author_id, at: c.created_at,
      targetType: c.target_type, targetId: c.target_id, body: c.body,
    });
  }

  return items
    .filter((i) => i.at)
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
}

/** Cuántos son posteriores a la última mirada. Sin marca, todos son nuevos. */
export function countUnread(items, seenAt) {
  const cut = seenAt ? Date.parse(seenAt) : 0;
  return items.filter((i) => Date.parse(i.at) > cut).length;
}

// ── Carga ───────────────────────────────────────────────────────────────────

/**
 * Las cinco fuentes en paralelo + la marca de agua. Con sesión vacía o sin
 * Supabase devuelve la bandeja vacía sin quejarse, como el resto de social.js.
 */
export async function loadNotifications(userId, { limit = 40 } = {}) {
  if (!ok() || !userId) {
    return FIXTURES_ENABLED
      ? { items: FIXTURE_NOTIFICATIONS, seenAt: null }
      : { items: [], seenAt: null };
  }

  const [reqs, accs, fols, coms, reps, mens, mnus, prof] = await Promise.all([
    supabase.from("user_follows")
      .select("follower_id, created_at")
      .eq("followee_id", userId).eq("status", "pending")
      .order("created_at", { ascending: false }).limit(20),
    supabase.from("user_follows")
      .select("followee_id, responded_at")
      .eq("follower_id", userId).eq("status", "accepted")
      .not("responded_at", "is", null)
      .order("responded_at", { ascending: false }).limit(15),
    supabase.from("user_follows")
      .select("follower_id, created_at, responded_at")
      .eq("followee_id", userId).eq("status", "accepted")
      .order("created_at", { ascending: false }).limit(20),
    supabase.from("social_comments")
      .select("id, target_type, target_id, author_id, body, created_at")
      .eq("target_owner_id", userId)
      .order("created_at", { ascending: false }).limit(30),
    supabase.rpc("my_reply_inbox", { p_limit: 30 }),
    supabase.rpc("my_mention_inbox", { p_limit: 20 }),
    // Los menus que puedes ver: la RLS ya deja pasar solo los de tus amigos
    // (o los de cuentas abiertas), asi que no hace falta cruzarlos aqui con
    // tu lista de amistades — filtrar dos veces lo mismo es como acaban
    // desincronizandose el filtro y la politica.
    supabase.from("shared_menus")
      .select("id, owner_id, created_at")
      .neq("visibility", "private")
      .order("created_at", { ascending: false }).limit(15),
    supabase.from("social_profiles")
      .select("notifications_seen_at")
      .eq("user_id", userId).maybeSingle(),
  ]);
  for (const [where, r] of [["requests", reqs], ["accepted", accs], ["followers", fols], ["comments", coms], ["replies", reps], ["mentions", mens], ["menus", mnus], ["seen", prof]]) {
    warn(where, r.error);
  }

  const items = buildNotifications({
    requests: reqs.data ?? [],
    accepted: accs.data ?? [],
    followers: fols.data ?? [],
    comments: coms.data ?? [],
    replies: reps.data ?? [],
    mentions: mens.data ?? [],
    menus: mnus.data ?? [],
    meId: userId,
  }).slice(0, limit);

  // Sintéticos solo en dev y solo con la bandeja real vacía, como el resto.
  if (FIXTURES_ENABLED && items.length === 0) {
    return { items: FIXTURE_NOTIFICATIONS, seenAt: prof.data?.notifications_seen_at ?? null };
  }
  return { items, seenAt: prof.data?.notifications_seen_at ?? null };
}

/** Avanza la marca de agua a ahora. Se llama al ABRIR el panel, no al cerrar. */
export async function markNotificationsSeen(userId) {
  if (!ok() || !userId) return false;
  const { error } = await supabase
    .from("social_profiles")
    .update({ notifications_seen_at: new Date().toISOString() })
    .eq("user_id", userId);
  return !warn("markSeen", error);
}
