import { useEffect, useState } from "react";
import { X, Users2 } from "lucide-react";
import { Avatar } from "./ui.jsx";
import { personColor } from "../lib/socialUi.js";
import { loadFollowList, loadFollowing, loadSentRequests, followUser } from "../lib/social.js";

const GREEN = "#2d5a3d";
const INK = "#142f1d";

/**
 * Quién sigue a alguien, o a quién sigue.
 *
 * Los números del perfil llevaban a ninguna parte, y en una red social esa
 * lista es el camino natural para descubrir gente: si sigues a alguien que
 * cocina como te gusta, quien le sigue probablemente también.
 *
 * Qué se puede ver y qué no lo decide la base (profile_follow_list, 0036), no
 * esta pantalla: la lista de un perfil privado no se enseña, y de la lista se
 * caen los privados y cualquiera con bloqueo de por medio. Por eso el total
 * de aquí puede ser menor que el contador del perfil — y está bien que lo
 * sea: el contador dice cuántos son, la lista solo puede enseñar a los que se
 * dejan ver.
 */
export function FollowListSheet({ userId, kind = "followers", viewer = null, onChanged, onOpenPerson, onClose }) {
  const [people, setPeople] = useState(null);
  // La relacion del QUE MIRA con cada fila. Sin ella la lista era un
  // listin: nombres sin decir cuales son ya tuyos ni forma de sumar los que
  // no — y esta lista es el camino natural para descubrir gente.
  const [myIds, setMyIds] = useState([]);
  const [pendingIds, setPendingIds] = useState([]);

  useEffect(() => {
    let alive = true;
    Promise.all([
      loadFollowList(userId, kind),
      viewer ? loadFollowing(viewer) : [],
      viewer ? loadSentRequests(viewer) : [],
    ]).then(([r, mine, sent]) => {
      if (!alive) return;
      setPeople(r);
      setMyIds(mine);
      setPendingIds(sent.map((x) => x.followee_id));
    });
    return () => { alive = false; };
  }, [userId, kind, viewer]);

  const follow = async (targetId) => {
    const status = await followUser(viewer, targetId);
    if (!status) return;
    if (status === "accepted") setMyIds((ids) => [...ids, targetId]);
    else setPendingIds((ids) => [...ids, targetId]);
    // El feed de fuera tiene que enterarse: seguir a alguien desde aqui y que
    // su menu no aparezca hasta recargar la app es la desconexion exacta que
    // hacia parecer rota la publicacion de menus.
    onChanged?.();
  };

  const title = kind === "following" ? "Sigue a" : "Seguidores";

  return (
    <div style={overlay} onClick={onClose} className="mp-overlay-in">
      <div style={sheet} onClick={(e) => e.stopPropagation()}>
        <div style={grabber} />
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 18px 12px" }}>
          <Users2 size={16} strokeWidth={2.5} color={GREEN} />
          <h2 style={{ margin: 0, flex: 1, fontSize: 16, fontWeight: 900, color: INK }}>{title}</h2>
          <button type="button" onClick={onClose} aria-label="Cerrar" style={closeBtn}>
            <X size={16} strokeWidth={2.6} />
          </button>
        </div>

        <div style={{ padding: "0 14px 18px", overflowY: "auto", flex: 1 }}>
          {people === null && <p style={hint}>Cargando…</p>}
          {people?.length === 0 && (
            <p style={hint}>
              {kind === "following" ? "Todavía no sigue a nadie." : "Todavía no le sigue nadie."}
            </p>
          )}
          {(people ?? []).map((p) => {
            const name = p.display_name || (p.username ? `@${p.username}` : "Alguien");
            // Cada fila dice SIEMPRE en que punto estas con esa persona: tuya
            // ("Siguiendo"), esperando ("Pendiente") o por sumar ("Seguir").
            // Sin la etiqueta, distinguirlo obligaba a abrir los perfiles de
            // uno en uno. El propio va sin etiqueta: contigo no hay relacion
            // que declarar.
            const isMe = viewer && p.user_id === viewer;
            const state = myIds.includes(p.user_id) ? "following" : pendingIds.includes(p.user_id) ? "pending" : "none";
            return (
              <div key={p.user_id} style={row}>
                <button type="button" onClick={() => onOpenPerson?.(p.user_id)} style={rowMain}>
                  <Avatar name={name} photo={p.avatar_url} size={38} color={personColor(p.user_id)} />
                  <span style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
                    <span style={oneLine}>{name}</span>
                    {p.username && p.display_name && (
                      <span style={{ ...oneLine, fontSize: 11.5, fontWeight: 700, color: "#8aa294" }}>@{p.username}</span>
                    )}
                  </span>
                </button>
                {viewer && !isMe && (
                  state === "none" ? (
                    <button type="button" onClick={() => follow(p.user_id)} style={followBtn}>Seguir</button>
                  ) : (
                    <span style={stateTag}>{state === "pending" ? "Pendiente" : "Siguiendo"}</span>
                  )
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

const overlay = {
  position: "fixed", inset: 0, zIndex: 320,
  background: "rgba(20,47,29,.45)", backdropFilter: "blur(2px)",
  display: "flex", alignItems: "flex-end", justifyContent: "center",
};

const sheet = {
  width: "100%", maxWidth: 420, maxHeight: "72vh",
  display: "flex", flexDirection: "column",
  background: "#f5f9f6", borderRadius: "20px 20px 0 0",
  paddingBottom: "calc(10px + env(safe-area-inset-bottom))",
  boxSizing: "border-box", overflow: "hidden",
};

const grabber = {
  width: 38, height: 4, borderRadius: 999, background: "#dde7e0",
  margin: "8px auto 4px", flexShrink: 0,
};

const closeBtn = {
  display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
  width: 32, height: 32, borderRadius: "50%",
  border: "none", background: "#f0f4f1", color: GREEN, cursor: "pointer",
};

const row = {
  display: "flex", alignItems: "center", gap: 8, width: "100%",
  padding: "8px 10px", marginBottom: 4, borderRadius: 14,
  background: "#fff", border: "1px solid #eef3f0",
  boxSizing: "border-box",
};

const rowMain = {
  display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 0,
  padding: 0, border: "none", background: "none",
  cursor: "pointer", fontFamily: "inherit",
};

const followBtn = {
  flexShrink: 0, padding: "6px 13px", borderRadius: 999, border: "none",
  background: GREEN, color: "#fff", cursor: "pointer",
  fontFamily: "inherit", fontSize: 12, fontWeight: 800,
};

const stateTag = {
  flexShrink: 0, padding: "6px 11px", borderRadius: 999,
  background: "#f0f4f1", color: "#6b7d70",
  fontSize: 11.5, fontWeight: 800,
};

const oneLine = {
  display: "block", fontSize: 13.5, fontWeight: 800, color: INK,
  whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
};

const hint = {
  margin: "14px 4px", fontSize: 12.5, fontWeight: 600,
  color: "#9ab0a1", lineHeight: 1.45, textAlign: "center",
};
