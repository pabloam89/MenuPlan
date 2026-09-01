import { useState } from "react";
import { X, Bell, UserPlus, UserCheck, MessageCircle, CornerDownRight, Check } from "lucide-react";
import { Avatar } from "./ui.jsx";
import { acceptFollowRequest, rejectFollowRequest } from "../lib/social.js";

const GREEN = "#2d5a3d";
const INK = "#142f1d";
const TEAL = "#0f766e";

/**
 * La bandeja de la campana. Todo derivado (ver socialNotifications.js): aquí
 * solo se pinta y se actúa.
 *
 * Dos reglas de lectura, pensadas para no dar la brasa:
 *  · "sin leer" es un tinte, calculado contra la marca de agua de ANTES de
 *    abrir (prevSeenAt): la campana ya se puso a cero al abrir, pero dentro
 *    del panel lo nuevo sigue distinguiéndose en esta visita.
 *  · las solicitudes pendientes llevan botones y NO desaparecen al leerse:
 *    leído ≠ resuelto. Se van cuando decides, no cuando miras.
 */
export function NotificationsSheet({ user, items = [], prevSeenAt = null, people = {}, onOpenPerson, onOpenTarget, onChanged, onClose }) {
  // Solicitudes ya decididas en esta visita: se apagan sin recargar la lista.
  const [decided, setDecided] = useState(() => new Map());

  const cut = prevSeenAt ? Date.parse(prevSeenAt) : 0;
  const nameOf = (id) => people[id]?.display_name || people[id]?.username || "Alguien";

  const decide = async (actorId, accept) => {
    setDecided((prev) => new Map(prev).set(actorId, accept ? "ok" : "no"));
    const done = accept
      ? await acceptFollowRequest(user?.id, actorId)
      : await rejectFollowRequest(user?.id, actorId);
    if (done) onChanged?.();
  };

  const line = (n) => {
    switch (n.kind) {
      case "request": return "quiere seguirte";
      case "accepted": return "aceptó tu solicitud";
      case "follower": return "empezó a seguirte";
      case "comment": return n.targetType === "menu" ? "comentó tu menú" : "comentó tu receta";
      case "reply": return "respondió a tu comentario";
      default: return "";
    }
  };

  const iconFor = (kind) =>
    kind === "request" ? UserPlus
    : kind === "accepted" || kind === "follower" ? UserCheck
    : kind === "reply" ? CornerDownRight
    : MessageCircle;

  return (
    <div style={overlay} onClick={onClose}>
      <div style={sheet} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Bell size={16} strokeWidth={2.5} color={TEAL} />
          <h2 style={{ margin: 0, flex: 1, fontSize: 15, fontWeight: 900, color: INK }}>Notificaciones</h2>
          <button type="button" onClick={onClose} aria-label="Cerrar" style={closeBtn}>
            <X size={15} strokeWidth={2.6} />
          </button>
        </div>

        {items.length === 0 ? (
          <p style={{ margin: "16px 0 6px", fontSize: 12.5, fontWeight: 600, color: "#6b7d70", lineHeight: 1.45 }}>
            Nada nuevo por aquí. Cuando alguien comente lo tuyo o quiera
            seguirte, lo verás en esta bandeja.
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 12, maxHeight: "56vh", overflowY: "auto" }}>
            {items.map((n) => {
              const fresh = Date.parse(n.at) > cut;
              const Icon = iconFor(n.kind);
              const isReq = n.kind === "request";
              const verdict = decided.get(n.actorId);
              const openIt = () => {
                if (isReq) return; // la fila de solicitud actúa con sus botones
                if (n.targetType) onOpenTarget?.(n.targetType, n.targetId);
                else onOpenPerson?.(n.actorId);
              };
              return (
                <div key={n.key} style={{ ...row, background: fresh ? "#eef6f4" : "transparent" }}>
                  <button type="button" onClick={() => onOpenPerson?.(n.actorId)} style={plainBtn} aria-label={`Ver a ${nameOf(n.actorId)}`}>
                    <Avatar name={nameOf(n.actorId)} size={34} color={GREEN} />
                  </button>
                  <button type="button" onClick={openIt} style={{ ...plainBtn, flex: 1, minWidth: 0, textAlign: "left" }}>
                    <span style={{ display: "block", fontSize: 12.5, fontWeight: 600, color: "#42594c", lineHeight: 1.4 }}>
                      <strong style={{ fontWeight: 800, color: INK }}>{nameOf(n.actorId)}</strong>{" "}
                      {line(n)}
                    </span>
                    {n.body && (
                      <span style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#6b7d70", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        «{n.body}»
                      </span>
                    )}
                  </button>
                  {isReq && !verdict && (
                    <span style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                      <button type="button" onClick={() => decide(n.actorId, true)} aria-label="Aceptar" style={{ ...pillBtn, background: GREEN, color: "#fff", border: "none" }}>
                        <Check size={14} strokeWidth={3} />
                      </button>
                      <button type="button" onClick={() => decide(n.actorId, false)} aria-label="Rechazar" style={pillBtn}>
                        <X size={14} strokeWidth={2.8} />
                      </button>
                    </span>
                  )}
                  {isReq && verdict && (
                    <span style={{ flexShrink: 0, fontSize: 11, fontWeight: 800, color: verdict === "ok" ? TEAL : "#8aa294" }}>
                      {verdict === "ok" ? "Aceptada" : "Rechazada"}
                    </span>
                  )}
                  <Icon size={14} strokeWidth={2.4} color="#b7c9be" style={{ flexShrink: 0 }} />
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

const overlay = {
  position: "fixed", inset: 0, zIndex: 310,
  background: "rgba(20,47,29,.45)", backdropFilter: "blur(2px)",
  display: "flex", alignItems: "flex-end", justifyContent: "center",
};

const sheet = {
  width: "100%", maxWidth: 380, background: "#fff",
  borderRadius: "20px 20px 0 0", padding: "16px 18px",
  paddingBottom: "calc(18px + env(safe-area-inset-bottom))",
  boxSizing: "border-box",
};

const closeBtn = {
  display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
  width: 30, height: 30, borderRadius: 10,
  border: "1.5px solid #d5e6da", background: "#fff", color: GREEN, cursor: "pointer",
};

const row = {
  display: "flex", alignItems: "center", gap: 10,
  padding: "8px 10px", borderRadius: 12,
};

const plainBtn = {
  border: "none", background: "transparent", padding: 0,
  cursor: "pointer", fontFamily: "inherit",
};

const pillBtn = {
  display: "flex", alignItems: "center", justifyContent: "center",
  width: 30, height: 30, borderRadius: 999,
  border: "1.5px solid #d5e6da", background: "#fff", color: "#6b7d70", cursor: "pointer",
};
