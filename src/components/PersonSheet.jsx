import { useCallback, useEffect, useState } from "react";
import { X, Lock, Clock, ChefHat, CalendarDays, MoreVertical, Ban, Flag } from "lucide-react";
import { Avatar } from "./ui.jsx";
import { personColor } from "../lib/socialUi.js";
import {
  loadProfileById, loadProfileCounts, loadPersonContent,
  loadFollowing, loadSentRequests, followUser, unfollowUser,
  blockUser,
} from "../lib/social.js";
import { FIXTURES_ENABLED, FIXTURE_PROFILES, FIXTURE_RECIPES, FIXTURE_MENUS } from "../lib/socialFixtures.js";
import { ReportSheet } from "./ReportSheet.jsx";

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
export function PersonSheet({ user, userId, profile: seed = null, onClose, onOpenRecipe, onOpenMenu, onBlocked }) {
  const [profile, setProfile] = useState(seed);
  const [counts, setCounts] = useState({ followers: 0, following: 0, recipes: 0, menus: 0 });
  const [content, setContent] = useState({ recipes: [], menus: [] });
  const [rel, setRel] = useState("none"); // none | pending | following
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const [reporting, setReporting] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    const [prof, cts, cont, following, sent] = await Promise.all([
      loadProfileById(userId),
      loadProfileCounts(userId),
      loadPersonContent(userId, { viewerId: user?.id }),
      loadFollowing(user?.id),
      loadSentRequests(user?.id),
    ]);
    const fxProfile = FIXTURES_ENABLED ? FIXTURE_PROFILES[userId] : null;
    setProfile(prof ?? seed ?? fxProfile ?? null);
    setCounts(cts);
    // En dev, si no hay nada real que enseñar, se rellena con sintéticos de esa
    // persona para poder diseñar la pantalla. Ver socialFixtures.js.
    const fxRecipes = FIXTURES_ENABLED ? FIXTURE_RECIPES.filter((r) => r.owner_id === userId) : [];
    const fxMenus = FIXTURES_ENABLED ? FIXTURE_MENUS.filter((m) => m.owner_id === userId) : [];
    setContent({
      recipes: cont.recipes.length ? cont.recipes : fxRecipes,
      menus: cont.menus.length ? cont.menus : fxMenus,
    });
    setRel(following.includes(userId) ? "following" : sent.some((r) => r.followee_id === userId) ? "pending" : "none");
    setLoading(false);
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

  const FOLLOW_LABEL = { none: "Seguir", pending: "Pendiente", following: "Siguiendo" };

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

          <div style={statsCard}>
            <Stat n={counts.followers} label="Seguidores" />
            <span style={divider} />
            <Stat n={counts.recipes} label="Recetas" />
            <span style={divider} />
            <Stat n={counts.menus} label="Menús" />
          </div>

          {userId !== user?.id && (
            <button type="button" onClick={toggleFollow} disabled={busy} style={rel === "none" ? followBtn : followingBtn}>
              {FOLLOW_LABEL[rel]}
            </button>
          )}
        </div>

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
                  ? "Ya has pedido seguirle. Cuando acepte verás sus recetas y sus menús."
                  : "Pídele seguirle para ver lo que cocina."}
              </p>
            </div>
          )}

          {content.menus.length > 0 && (
            <>
              <h3 style={sectionTitle}>Sus menús</h3>
              {content.menus.map((m) => (
                <button key={m.id} type="button" onClick={() => onOpenMenu?.(m)} style={menuRow}>
                  <CalendarDays size={15} strokeWidth={2.5} color={TEAL} />
                  <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 800, color: INK }}>
                    {m.title || weekLabel(m.week_start, m.week_end)}
                  </span>
                  <span style={{ fontSize: 11.5, fontWeight: 700, color: "#8aa294" }}>
                    {(m.payload?.weeks?.[0]?.days ?? []).length} días
                  </span>
                </button>
              ))}
            </>
          )}

          {content.recipes.length > 0 && (
            <>
              <h3 style={sectionTitle}>Sus recetas</h3>
              <div style={grid}>
                {content.recipes.map((r) => (
                  <button key={r.id} type="button" onClick={() => onOpenRecipe?.(r)} style={tile}>
                    <img
                      src={r.photo || FALLBACK}
                      alt=""
                      loading="lazy"
                      style={{ display: "block", width: "100%", aspectRatio: "1 / 1", objectFit: "cover", background: "#f4f7f5" }}
                    />
                    <span style={tileGradient} />
                    <span style={tileName}>{r.name}</span>
                    <span style={tileMeta}>
                      {r.time_minutes != null && <span style={metaItem}><Clock size={10} strokeWidth={2.6} /> {r.time_minutes}′</span>}
                      {r.difficulty && <span style={metaItem}><ChefHat size={10} strokeWidth={2.6} /> {r.difficulty}</span>}
                    </span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {reporting && (
        <ReportSheet user={user} targetType="profile" targetId={userId} onClose={() => setReporting(false)} />
      )}
    </div>
  );
}

function Stat({ n, label }) {
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

const FALLBACK = "/avatares/cards/empty_recetas_propias.jpg";

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

const statsCard = {
  display: "flex", alignItems: "center", width: "100%", maxWidth: 300, marginTop: 14,
  padding: "11px 6px", borderRadius: 14,
  background: "#fff", border: "1.5px solid #e0eae3",
};

const divider = { width: 1, alignSelf: "stretch", background: "#eef3f0" };

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

const menuRow = {
  display: "flex", alignItems: "center", gap: 9, width: "100%",
  padding: "11px 12px", borderRadius: 13, marginBottom: 7,
  border: "1.5px solid #e0eae3", background: "#fff",
  cursor: "pointer", fontFamily: "inherit", textAlign: "left",
};

const grid = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 9 };

const tile = {
  position: "relative", display: "block", padding: 0, overflow: "hidden",
  borderRadius: 14, border: "1.5px solid #e0eae3", background: "#fff",
  cursor: "pointer", fontFamily: "inherit", textAlign: "left",
};

const tileGradient = {
  position: "absolute", inset: 0,
  background: "linear-gradient(to top, rgba(20,47,29,.9) 0%, rgba(20,47,29,.2) 55%, transparent 100%)",
};

const tileName = {
  position: "absolute", left: 9, right: 9, bottom: 21,
  color: "#fff", fontSize: 12, fontWeight: 800, lineHeight: 1.2,
  display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden",
};

const tileMeta = {
  position: "absolute", left: 9, right: 9, bottom: 7,
  display: "flex", gap: 8, color: "rgba(255,255,255,.9)", fontSize: 10, fontWeight: 700,
};

const metaItem = { display: "inline-flex", alignItems: "center", gap: 3 };

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
