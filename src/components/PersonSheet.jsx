import { useCallback, useEffect, useState } from "react";
import { X, Lock, CalendarDays, MoreVertical, Ban, Flag } from "./icons.jsx";
import { Avatar } from "./ui.jsx";
import { RecipePoster } from "./SwipeCard.jsx";
import { personColor, relativeTime } from "../lib/socialUi.js";
import {
  loadProfileById, loadProfileCounts, loadPersonContent, loadRelations,
  loadFollowing, loadSentRequests, followUser, unfollowUser,
  blockUser, loadRecipeStats,
} from "../lib/social.js";
import { FIXTURES_ENABLED, FIXTURE_PROFILES, FIXTURE_RECIPES, FIXTURE_MENUS, FIXTURE_COOKINGS } from "../lib/socialFixtures.js";
import { loadOwnerCookings } from "../lib/cookingsSync.js";
import { dishImageForRecipe } from "../assets/dishes/dishImages.js";
import { deckImg } from "../lib/dishPhotoOptimize.js";
import { recipeCatalogById } from "../data/recipeCatalog.js";
import { ReportSheet } from "./ReportSheet.jsx";
import { FollowListSheet } from "./FollowListSheet.jsx";

const GREEN = "#2d5a3d";
const INK = "#142f1d";
const TEAL = "#0f766e";

/**
 * El perfil de otra persona.
 *
 * Mismo formato "asomarse" que el menú (pantalla completa que crece), porque
 * es el mismo gesto: entrar un momento en el sitio de alguien y volver. Y
 * misma regla de privacidad, aplicada por la base y no por esta pantalla: si
 * su perfil pide seguimiento y no te ha aceptado, el contenido vuelve vacío y
 * aquí se explica por qué en vez de enseñar una lista en blanco.
 */
export function PersonSheet({ user, userId, profile: seed = null, initialTab = "cookings", onClose, onOpenRecipe, onOpenMenu, onOpenPerson, onBlocked, onChanged }) {
  const [profile, setProfile] = useState(seed);
  const [counts, setCounts] = useState({ followers: 0, following: 0, recipes: 0, menus: 0 });
  const [content, setContent] = useState({ recipes: [], menus: [], cookings: [] });
  // Historias / Recetas / Menús. Arranca en historias: es lo más reciente y lo
  // más visual, y en un perfil de cocina la comida manda sobre las listas.
  //
  // El objeto se sigue llamando `cooking` en el código y en la tabla, y es a
  // propósito: "historia" describe el FORMATO (efímero, a pantalla completa) y
  // el modelo describe lo que la cosa ES (una vez que alguien cocinó algo). Si
  // mañana cambia la etiqueta —y probablemente cambie— no hay que tocar ni la
  // base ni una migración.
  const [tab, setTab] = useState(initialTab);
  const [rel, setRel] = useState("none"); // none | pending | following
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [stats, setStats] = useState({});
  const [listKind, setListKind] = useState(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    const [prof, cts, cont, following, sent, rel, cooks] = await Promise.all([
      loadProfileById(userId),
      loadProfileCounts(userId),
      loadPersonContent(userId, { viewerId: user?.id }),
      loadFollowing(user?.id),
      loadSentRequests(user?.id),
      loadRelations(userId),
      loadOwnerCookings(userId),
    ]);
    const fxProfile = FIXTURES_ENABLED ? FIXTURE_PROFILES[userId] : null;
    setProfile(prof ?? seed ?? fxProfile ?? null);
    // Amigos y seguidores salen de las MISMAS listas que abre el numero, asi
    // que nunca dicen mas de lo que la lista puede ensenar (profile_follow_list
    // se deja fuera a privados y bloqueos).
    setCounts({ ...cts, friends: rel.friends.length, onlyFollowers: rel.followers.length });
    // En dev, si no hay nada real que enseñar, se rellena con sintéticos de esa
    // persona para poder diseñar la pantalla. Ver socialFixtures.js.
    const fxRecipes = FIXTURES_ENABLED ? FIXTURE_RECIPES.filter((r) => r.owner_id === userId) : [];
    const fxMenus = FIXTURES_ENABLED ? FIXTURE_MENUS.filter((m) => m.owner_id === userId) : [];
    const fxCooks = FIXTURES_ENABLED ? FIXTURE_COOKINGS.filter((c) => c.ownerId === userId) : [];
    setContent({
      recipes: cont.recipes.length ? cont.recipes : fxRecipes,
      menus: cont.menus.length ? cont.menus : fxMenus,
      cookings: cooks.length ? cooks : fxCooks,
    });
    setRel(following.includes(userId) ? "following" : sent.some((r) => r.followee_id === userId) ? "pending" : "none");
    setLoading(false);
    // Los numeros van despues y aparte, como en el feed: son un adorno de la
    // tarjeta y no deben retrasar la pintura de lo que si es contenido.
    const shown = cont.recipes.length ? cont.recipes : fxRecipes;
    setStats(await loadRecipeStats(shown.map((r) => r.id)));
  }, [userId, user?.id, seed]);

  useEffect(() => { refresh(); }, [refresh]);

  const toggleFollow = async () => {
    setBusy(true);
    if (rel === "none") {
      const status = await followUser(user?.id, userId);
      setRel(status === "accepted" ? "following" : status === "pending" ? "pending" : "none");
    } else {
      // Dejar de seguir y retirar una solicitud son el mismo borrado.
      await unfollowUser(user?.id, userId);
      setRel("none");
    }
    setBusy(false);
    // Sin esto, el feed de detras seguia con la lista de seguidos VIEJA:
    // seguias a alguien desde su perfil y su menu no aparecia hasta recargar
    // la app entera. Parecia que publicar menus no funcionaba.
    onChanged?.();
  };

  const doBlock = async () => {
    setMenuOpen(false);
    // Sin confirmación intermedia: bloquear es reversible (se desbloquea
    // desde Mi perfil → Cuentas bloqueadas) y añadir un "¿seguro?" a algo que
    // se puede deshacer es fricción sin beneficio, justo cuando alguien
    // quiere quitarse a esta persona de encima ya.
    await blockUser(user?.id, userId);
    onBlocked?.(userId);
    onClose();
  };

  const name = profile?.display_name || (profile?.username ? `@${profile.username}` : "Alguien");
  const gated = !loading && content.recipes.length === 0 && content.menus.length === 0 && rel !== "following";

  // El gesto depende de SU cuenta: a una abierta te suscribes ("Seguir",
  // instantaneo); con una cerrada CONECTAS — pides, acepta, y la conexion
  // queda hecha en los dos sentidos (accept_follow, 0046).
  const abierta = profile?.visibility === "public";
  const FOLLOW_LABEL = abierta
    ? { none: "Seguir", pending: "Pendiente", following: "Siguiendo" }
    : { none: "Agregar", pending: "Pendiente", following: "Amigos" };

  return (
    <div style={backdrop} onClick={onClose}>
      <div className="mp-peek-in" style={screen} onClick={(e) => e.stopPropagation()}>
        <div style={header}>
          <button type="button" onClick={onClose} aria-label="Cerrar" style={closeBtn}>
            <X size={17} strokeWidth={2.6} />
          </button>
          {/* Bloquear/reportar viven fuera de la vista a propósito: son la
              acción que casi nadie usa, y ponerlas junto a Seguir las haría
              tan visibles como seguir a alguien — justo lo contrario del
              peso que deben tener. */}
          {userId !== user?.id && (
            <div style={{ position: "absolute", top: 14, left: 14 }}>
              {/* closeBtn trae su propio position:absolute (top/right) para
                  anclarse solo; aqui ya lo ancla el div padre, asi que hace
                  falta una variante sin esa parte. */}
              <button type="button" onClick={() => setMenuOpen((v) => !v)} aria-label="Más opciones" style={menuBtn}>
                <MoreVertical size={17} strokeWidth={2.6} />
              </button>
              {menuOpen && (
                <div style={miniMenu}>
                  <button type="button" onClick={() => { setMenuOpen(false); setReporting(true); }} style={miniMenuItem}>
                    <Flag size={13} strokeWidth={2.5} /> Reportar perfil
                  </button>
                  <button type="button" onClick={doBlock} style={{ ...miniMenuItem, color: "#c0392b" }}>
                    <Ban size={13} strokeWidth={2.5} /> Bloquear
                  </button>
                </div>
              )}
            </div>
          )}
          <Avatar name={name} photo={profile?.avatar_url} size={72} color={personColor(userId)} />
          <div style={{ fontSize: 19, fontWeight: 900, color: INK, marginTop: 10 }}>{name}</div>
          {profile?.username && profile?.display_name && (
            <div style={{ fontSize: 12.5, fontWeight: 700, color: "#8aa294" }}>@{profile.username}</div>
          )}
          {profile?.bio && (
            <p style={{ margin: "8px 0 0", fontSize: 12.5, color: "#42594c", textAlign: "center", lineHeight: 1.4, maxWidth: 300 }}>
              {profile.bio}
            </p>
          )}

          {/* ── El grafo, en una línea ────────────────────────────────
              Baja de caja a texto a propósito: en el perfil de alguien que
              cocina, lo que decide si te quedas es su comida, no cuánta gente
              le sigue. Sigue llevando a la lista, que era su único trabajo. */}
          <p style={graphLine}>
            <button type="button" onClick={() => setListKind("friends")} style={graphBtn}>
              <b>{counts.friends ?? 0}</b> amigos
            </button>
            <span style={{ color: "#c2cfc7" }}>·</span>
            <button type="button" onClick={() => setListKind("followers")} style={graphBtn}>
              <b>{counts.onlyFollowers ?? 0}</b> seguidores
            </button>
          </p>

          {userId !== user?.id && (
            <button type="button" onClick={toggleFollow} disabled={busy} style={rel === "none" ? followBtn : followingBtn}>
              {FOLLOW_LABEL[rel]}
            </button>
          )}
        </div>

        {/* ── Las tres pestañas ─────────────────────────────────────────
            Su número va DENTRO y no en una caja aparte: te dice cuánto hay en
            cada sitio justo cuando estás decidiendo a cuál ir, que es la única
            decisión que ese número sirve para tomar. Como caja suelta arriba
            no decidía nada — de hecho ni siquiera se podía tocar. */}
        {!gated && (
          <div style={tabsWrap}>
            <div style={tabsRail}>
              {[
                ["cookings", "Historias", content.cookings.length],
                ["recipes", "Recetas", content.recipes.length],
                ["menus", "Menús", content.menus.length],
              ].map(([id, label, n]) => {
                const on = tab === id;
                return (
                  <button
                    key={id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setTab(id)}
                    style={{ ...tabBtn, background: on ? "#fff" : "transparent", color: on ? INK : "#8aa294", boxShadow: on ? "0 1px 4px rgba(0,0,0,.1)" : "none" }}
                  >
                    {label}
                    <span style={{ ...tabCount, background: on ? "#eaf3ed" : "transparent", color: on ? TEAL : "#a8b8ad" }}>{n}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div style={{ padding: "6px 18px 26px", maxWidth: 420, margin: "0 auto", width: "100%", boxSizing: "border-box" }}>
          {loading && <p style={hint}>Cargando…</p>}

          {/* No es una lista vacía: es una puerta cerrada, y decirlo evita que
              parezca que esta persona no ha publicado nada. */}
          {gated && (
            <div style={gate}>
              <Lock size={18} strokeWidth={2.4} color="#8aa294" />
              <p style={{ margin: "8px 0 0", fontSize: 13, fontWeight: 800, color: INK }}>Esta cuenta es privada</p>
              <p style={{ margin: "4px 0 0", fontSize: 12.5, color: "#6b7d70", lineHeight: 1.4 }}>
                {rel === "pending"
                  ? "Ya le has pedido ser amigos. Cuando acepte verás sus recetas y sus menús."
                  : "Agrégale para ver lo que cocina."}
              </p>
            </div>
          )}

          {/* ── Cocinadas: mosaico ───────────────────────────────────────
              Aquí es donde lo efímero deja de perderse. En la fila de Gente
              caducan a las 48 h; este es el archivo, y por eso no se corta por
              fecha (ver loadOwnerCookings). Cuadrícula, como cualquier álbum:
              la foto manda y el nombre del plato queda de apoyo. */}
          {!gated && tab === "cookings" && (
            content.cookings.length > 0 ? (
              <div style={mosaic}>
                {content.cookings.map((c) => {
                  const fallback = c.draft ? null : dishImageForRecipe(recipeCatalogById[c.recipeId] ?? { id: c.recipeId });
                  const img = c.photo ?? (fallback ? deckImg(fallback, 240) : null);
                  return (
                    <button
                      key={c.id}
                      type="button"
                      title={c.recipeName}
                      onClick={() => onOpenRecipe?.({ id: c.recipeId, name: c.recipeName })}
                      style={mosaicTile}
                    >
                      {img
                        ? <img src={img} alt="" loading="lazy" style={mosaicImg} />
                        : <span style={{ ...mosaicImg, background: "#eef3f0", display: "block" }} />}
                      <span style={mosaicName}>{c.recipeName}</span>
                    </button>
                  );
                })}
              </div>
            ) : <p style={hint}>Todavía no ha subido ninguna foto.</p>
          )}

          {/* ── Menús: una fila por semana, con la comida a la vista ──────
              No la tarjeta grande de Siguiendo: aquella es una PORTADA para
              convencer a un desconocido de entrar, y aquí no hay a quién
              convencer. Además, a una tarjeta por semana, veinte semanas son
              un scroll eterno. Lo que sí cambia respecto a antes: donde ponía
              "5 días" —que no dice nada— van las miniaturas de los platos,
              que es lo que de verdad identifica una semana. */}
          {!gated && tab === "menus" && (
            content.menus.length > 0 ? (
              content.menus.map((m) => {
                const dias = m.payload?.weeks?.[0]?.days ?? [];
                const platos = dias
                  .map((d) => d.meals?.[0]?.dishes?.[0])
                  .filter((d) => d?.recipeId)
                  .slice(0, 5);
                return (
                  <button key={m.id} type="button" onClick={() => onOpenMenu?.(m)} style={menuRow}>
                    <span style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
                      <span style={{ display: "block", fontSize: 13, fontWeight: 800, color: INK }}>
                        {m.title || weekLabel(m.week_start, m.week_end)}
                      </span>
                      <span style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#8aa294", marginTop: 2 }}>
                        {dias.length} {dias.length === 1 ? "día" : "días"}
                      </span>
                    </span>
                    <span style={{ display: "flex", gap: 3, flexShrink: 0 }}>
                      {platos.map((d, i) => {
                        const img = dishImageForRecipe(recipeCatalogById[d.recipeId] ?? { id: d.recipeId });
                        return img
                          ? <img key={i} src={deckImg(img, 80)} alt="" loading="lazy" style={weekThumb} />
                          : <span key={i} style={{ ...weekThumb, background: "#eef3f0" }} />;
                      })}
                    </span>
                  </button>
                );
              })
            ) : <p style={hint}>Todavía no ha publicado ningún menú.</p>
          )}

          {!gated && tab === "recipes" && content.recipes.length > 0 && (
            <>
              <h3 style={sectionTitle}>Sus recetas</h3>
              <div style={recipeCol}>
                {content.recipes.map((r) => (
                  // El MISMO cartel que en el feed y en el mazo: si las recetas
                  // de alguien se vieran distintas aqui, pareceria otro
                  // catalogo. Trae dificultad, tiempo, numeros y el boton de
                  // la ficha sin que esta pantalla tenga que repintarlos.
                  <RecipePoster
                    key={r.id}
                    recipe={{
                      id: r.id,
                      name: r.name,
                      category: r.category,
                      difficulty: r.difficulty,
                      time: r.time_minutes,
                      photo: r.photo,
                      linkedCatalogId: r.linked_catalog_id ?? null,
                      baseRecipeId: r.base_dish_id ?? null,
                      pinnedGarnishId: r.pinned_garnish_id ?? null,
                    }}
                    showOwner={false}
                    when={relativeTime(r.created_at)}
                    stats={stats[r.id] ?? null}
                    onInfo={() => onOpenRecipe?.(r)}
                    style={{ aspectRatio: "4 / 5", cursor: "pointer", boxShadow: "0 6px 20px rgba(20,47,29,.14)" }}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {listKind && (
        <FollowListSheet
          userId={userId}
          kind={listKind}
          viewer={user?.id}
          onChanged={onChanged}
          onOpenPerson={(id) => { setListKind(null); onOpenPerson?.(id); }}
          onClose={() => setListKind(null)}
        />
      )}

      {reporting && (
        <ReportSheet user={user} targetType="profile" targetId={userId} onClose={() => setReporting(false)} />
      )}
    </div>
  );
}

function Stat({ n, label, onClick }) {
  if (onClick) {
    return (
      <button type="button" onClick={onClick} style={{ flex: 1, textAlign: "center", border: "none", background: "none", padding: 0, cursor: "pointer", fontFamily: "inherit" }}>
        <div style={{ fontSize: 19, fontWeight: 900, color: INK, lineHeight: 1.1 }}>{n}</div>
        <div style={{ fontSize: 10, fontWeight: 700, color: TEAL, marginTop: 2 }}>{label}</div>
      </button>
    );
  }
  return _Stat({ n, label });
}

function _Stat({ n, label }) {
  return (
    <div style={{ flex: 1, textAlign: "center" }}>
      <div style={{ fontSize: 18, fontWeight: 900, color: INK, lineHeight: 1.1 }}>{n}</div>
      <div style={{ fontSize: 10, fontWeight: 700, color: "#8aa294", marginTop: 2 }}>{label}</div>
    </div>
  );
}

function weekLabel(a, b) {
  if (!a) return "Menú";
  const f = (s) => s.slice(8, 10) + "/" + s.slice(5, 7);
  return b ? `${f(a)} – ${f(b)}` : f(a);
}


const backdrop = {
  position: "fixed", inset: 0, zIndex: 255,
  background: "rgba(20,47,29,.5)", backdropFilter: "blur(3px)",
  display: "flex", alignItems: "stretch", justifyContent: "center",
};

const screen = {
  width: "100%", maxWidth: 420, background: "#fff",
  display: "flex", flexDirection: "column", overflowY: "auto",
  boxShadow: "0 0 60px rgba(0,0,0,.35)",
};

const header = {
  position: "relative",
  display: "flex", flexDirection: "column", alignItems: "center",
  padding: "26px 20px 18px",
  background: "linear-gradient(180deg, #e9f4ed 0%, #fff 100%)",
};

const closeBtn = {
  position: "absolute", top: 14, right: 14,
  display: "flex", alignItems: "center", justifyContent: "center",
  width: 36, height: 36, borderRadius: 12,
  border: "1.5px solid #d5e6da", background: "#fff", color: GREEN, cursor: "pointer",
};



const followBtn = {
  marginTop: 14, padding: "11px 30px", borderRadius: 12, border: "none",
  background: TEAL, color: "#fff", fontSize: 13.5, fontWeight: 800,
  cursor: "pointer", fontFamily: "inherit",
};

const followingBtn = { ...followBtn, background: "#fff", color: TEAL, border: `1.5px solid ${TEAL}` };

const sectionTitle = {
  margin: "18px 0 9px", fontSize: 10.5, fontWeight: 900, color: "#7a9485",
  letterSpacing: ".6px", textTransform: "uppercase",
};

const graphLine = {
  display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
  margin: "12px 0 0", fontSize: 13, color: "#5a7066",
};
const graphBtn = {
  border: "none", background: "none", padding: 0, cursor: "pointer",
  fontSize: 13, fontWeight: 600, color: "#5a7066", fontFamily: "inherit",
};

// La pista de las pestañas es el mismo segmented control que Siguiendo /
// Descubrir en el feed: si el mismo gesto se viera distinto en dos pantallas,
// habría que aprenderlo dos veces.
const tabsWrap = { padding: "14px 18px 0", maxWidth: 420, margin: "0 auto", width: "100%", boxSizing: "border-box" };
const tabsRail = {
  display: "flex", gap: 4, padding: 4, borderRadius: 999, background: "#f0f4f1",
};
const tabBtn = {
  flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
  padding: "9px 4px", borderRadius: 999, border: "none", cursor: "pointer",
  fontSize: 12.5, fontWeight: 800, fontFamily: "inherit",
  transition: "background .15s ease, color .15s ease",
};
const tabCount = { padding: "1px 7px", borderRadius: 999, fontSize: 11, fontWeight: 900 };

const mosaic = { display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 3 };
const mosaicTile = {
  position: "relative", aspectRatio: "1 / 1", border: "none", padding: 0,
  background: "#eef3f0", cursor: "pointer", overflow: "hidden", borderRadius: 3,
  fontFamily: "inherit",
};
const mosaicImg = { width: "100%", height: "100%", objectFit: "cover", display: "block" };
const mosaicName = {
  position: "absolute", left: 0, right: 0, bottom: 0, padding: "14px 5px 5px",
  background: "linear-gradient(to top, rgba(10,20,14,.82), rgba(10,20,14,0))",
  color: "#fff", fontSize: 9, fontWeight: 800, lineHeight: 1.15, textAlign: "left",
  display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden",
};
const weekThumb = { width: 30, height: 30, borderRadius: 7, objectFit: "cover", display: "block" };
const menuRow = {
  display: "flex", alignItems: "center", gap: 9, width: "100%",
  padding: "11px 12px", borderRadius: 13, marginBottom: 7,
  border: "1.5px solid #e0eae3", background: "#fff",
  cursor: "pointer", fontFamily: "inherit", textAlign: "left",
};

const recipeCol = { display: "flex", flexDirection: "column", gap: 16 };






const miniMenu = {
  position: "absolute", top: 40, left: 0, zIndex: 3,
  width: 168, padding: 5, borderRadius: 13,
  background: "#fff", border: "1.5px solid #e0eae3",
  boxShadow: "0 10px 30px rgba(20,47,29,.18)",
};

const miniMenuItem = {
  display: "flex", alignItems: "center", gap: 8, width: "100%",
  padding: "9px 10px", borderRadius: 9, border: "none", background: "none",
  fontSize: 12.5, fontWeight: 700, color: INK, cursor: "pointer",
  fontFamily: "inherit", textAlign: "left",
};

const menuBtn = {
  display: "flex", alignItems: "center", justifyContent: "center",
  width: 36, height: 36, borderRadius: 12,
  border: "1.5px solid #d5e6da", background: "#fff", color: GREEN, cursor: "pointer",
};

const gate = {
  display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center",
  padding: "26px 20px", marginTop: 10, borderRadius: 16,
  border: "1.5px dashed #cfe0d6", background: "#f7fbf8",
};

const hint = { margin: "14px 0", fontSize: 12.5, fontWeight: 600, color: "#8aa294", textAlign: "center" };
