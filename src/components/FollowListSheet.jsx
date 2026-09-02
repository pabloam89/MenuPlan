import { useEffect, useState } from "react";
import { X, Users2 } from "lucide-react";
import { Avatar } from "./ui.jsx";
import { personColor } from "../lib/socialUi.js";
import { loadFollowList } from "../lib/social.js";

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
export function FollowListSheet({ userId, kind = "followers", onOpenPerson, onClose }) {
  const [people, setPeople] = useState(null);

  useEffect(() => {
    let alive = true;
    loadFollowList(userId, kind).then((r) => { if (alive) setPeople(r); });
    return () => { alive = false; };
  }, [userId, kind]);

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
            return (
              <button key={p.user_id} type="button" onClick={() => onOpenPerson?.(p.user_id)} style={row}>
                <Avatar name={name} photo={p.avatar_url} size={38} color={personColor(p.user_id)} />
                <span style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
                  <span style={oneLine}>{name}</span>
                  {p.username && p.display_name && (
                    <span style={{ ...oneLine, fontSize: 11.5, fontWeight: 700, color: "#8aa294" }}>@{p.username}</span>
                  )}
                </span>
              </button>
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
  display: "flex", alignItems: "center", gap: 10, width: "100%",
  padding: "8px 10px", marginBottom: 4, borderRadius: 14,
  background: "#fff", border: "1px solid #eef3f0",
  cursor: "pointer", fontFamily: "inherit",
};

const oneLine = {
  display: "block", fontSize: 13.5, fontWeight: 800, color: INK,
  whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
};

const hint = {
  margin: "14px 4px", fontSize: 12.5, fontWeight: 600,
  color: "#9ab0a1", lineHeight: 1.45, textAlign: "center",
};
