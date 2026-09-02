import { useState } from "react";
import { BellOff, UserPlus, UserCheck, MessageCircle, CornerDownRight, Check } from "lucide-react";
import { Avatar } from "./ui.jsx";
import { acceptFollowRequest, rejectFollowRequest, followUser } from "../lib/social.js";

const GREEN = "#2d5a3d";
const INK = "#142f1d";
const BLUE = "#4a6fd4";

/**
 * La bandeja de la campana. Todo derivado (ver socialNotifications.js): aquí
 * solo se pinta y se actúa.
 *
 * Es un POPOVER anclado a la campana, no una hoja inferior: una hoja que sube
 * desde abajo dice "pantalla nueva", y esto es el desplegable de lo que
 * acabas de tocar. Nace de la esquina de la campana (mp-pop-bell) y se cierra
 * tocando fuera, igual que el menú de tres puntos del feed.
 *
 * Ocupa el ancho de la columna de app: cada fila lleva a la derecha su objeto
 * (la foto del plato) o su acción (aceptar, seguir), y con 318px eso salía
 * apretujado contra el texto.
 *
 * Dos reglas de lectura pensadas para no dar la brasa:
 *  · el corte NUEVAS / ANTES sale de la marca de agua real (prevSeenAt, la de
 *    ANTES de abrir): la campana ya se puso a cero, pero dentro del panel lo
 *    nuevo sigue separado durante esta visita.
 *  · las solicitudes llevan sus botones y NO desaparecen al leerse: leído ≠
 *    resuelto. Se van cuando decides, no cuando miras.
 */
export function NotificationsPopover({
  user,
  items = [],
  prevSeenAt = null,
  people = {},
  anchor = null,
  followingIds = [],
  pendingIds = [],
  thumbFor,
  onOpenPerson,
  onOpenTarget,
  onChanged,
  onClose,
}) {
  // Decisiones tomadas en esta visita (solicitudes y follow-back): se reflejan
  // al momento sin recargar la lista entera.
  const [decided, setDecided] = useState(() => new Map());
  const [followed, setFollowed] = useState(() => new Map());

  const cut = prevSeenAt ? Date.parse(prevSeenAt) : 0;
  const fresh = items.filter((n) => Date.parse(n.at) > cut);
  const older = items.filter((n) => Date.parse(n.at) <= cut);

  const decide = async (actorId, accept) => {
    setDecided((prev) => new Map(prev).set(actorId, accept ? "ok" : "no"));
    const done = accept
      ? await acceptFollowRequest(user?.id, actorId)
      : await rejectFollowRequest(user?.id, actorId);
    if (done) onChanged?.();
  };

  /**
   * Devolver el seguimiento. El estado final lo decide el servidor, no este
   * botón: si la otra persona tiene el perfil privado, seguir es PEDIR, y
   * request_follow devuelve 'pending'. Por eso se pinta lo que conteste.
   */
  const followBack = async (actorId) => {
    setFollowed((prev) => new Map(prev).set(actorId, "wait"));
    const status = await followUser(user?.id, actorId);
    setFollowed((prev) => new Map(prev).set(actorId, status === "pending" ? "pending" : status ? "following" : "none"));
    if (status) onChanged?.();
  };

  const relOf = (actorId) =>
    followed.get(actorId) ??
    (followingIds.includes(actorId) ? "following" : pendingIds.includes(actorId) ? "pending" : "none");

  // Colgado de la campana de verdad: se mide al abrir, así el panel cae justo
  // debajo aunque la cabecera cambie de alto.
  const pos = anchor
    ? { top: Math.round(anchor.bottom + 10), right: Math.round(window.innerWidth - anchor.right) }
    : { top: 62, right: 16 };

  const rowProps = { people, decided, followed, relOf, onDecide: decide, onFollowBack: followBack, thumbFor, onOpenPerson, onOpenTarget };

  return (
    <div style={overlay} onClick={onClose}>
      <div
        className="mp-pop-bell"
        style={{ ...panel, top: pos.top, right: pos.right }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Notificaciones"
      >
        <span aria-hidden="true" style={caret} />

        {items.length === 0 ? (
          <div style={{ padding: "30px 22px", textAlign: "center" }}>
            <BellOff size={32} strokeWidth={1.8} color="#cdd8d0" />
            <p style={{ margin: "10px 0 0", fontSize: 12.5, fontWeight: 600, color: "#9ab0a1", lineHeight: 1.45 }}>
              Nada nuevo por aquí. Cuando alguien comente lo tuyo o quiera
              seguirte, te lo cuento en esta campana.
            </p>
          </div>
        ) : (
          <div style={{ maxHeight: "62vh", overflowY: "auto", padding: "6px 6px 8px" }}>
            {fresh.length > 0 && (
              <>
                <div style={eyebrow}>Nuevas</div>
                {fresh.map((n) => <Row key={n.key} n={n} isNew {...rowProps} />)}
              </>
            )}
            {older.length > 0 && (
              <>
                {fresh.length > 0 && <div style={{ ...eyebrow, marginTop: 6 }}>Antes</div>}
                {older.map((n) => <Row key={n.key} n={n} {...rowProps} />)}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Una fila: quién · qué ha hecho · y a la derecha o el objeto (la foto del
 * plato) o la acción que toca (aceptar, seguir).
 *
 * El icono del tipo va COLGADO del avatar, no suelto en su propia columna:
 * así "quién" y "qué" se leen como una sola cosa y la columna derecha queda
 * libre para lo único que de verdad se toca.
 */
function Row({ n, people, isNew = false, decided, relOf, onDecide, onFollowBack, thumbFor, onOpenPerson, onOpenTarget }) {
  const person = people[n.actorId];
  const name = person?.display_name || person?.username || "Alguien";
  const { Icon, tint, ink } = KIND[n.kind] ?? KIND.comment;
  const isReq = n.kind === "request";
  const verdict = decided.get(n.actorId);
  // Devolver el seguimiento solo tiene sentido con quien ya te sigue: a quien
  // comenta o te acaba de aceptar no se le "devuelve" nada.
  const canFollowBack = n.kind === "follower" || (isReq && verdict === "ok");
  const rel = relOf(n.actorId);
  const thumb = n.targetType ? thumbFor?.(n.targetType, n.targetId) : null;

  const open = () => {
    if (n.targetType) onOpenTarget?.(n.targetType, n.targetId);
    else onOpenPerson?.(n.actorId);
  };

  return (
    <div style={{ ...row, background: isNew ? "#f2fbf5" : "transparent" }}>
      <button type="button" onClick={() => onOpenPerson?.(n.actorId)} style={{ ...plainBtn, position: "relative", flexShrink: 0 }} aria-label={`Ver a ${name}`}>
        <Avatar name={name} size={38} color={GREEN} photo={person?.avatar_url} />
        <span style={{ ...kindDot, background: tint }}>
          <Icon size={9} strokeWidth={2.8} color={ink} />
        </span>
      </button>

      <button type="button" onClick={open} style={{ ...plainBtn, flex: 1, minWidth: 0, textAlign: "left" }}>
        <span style={{ display: "block", fontSize: 12.5, fontWeight: 600, color: "#5a7066", lineHeight: 1.35 }}>
          <strong style={{ fontWeight: 800, color: INK }}>{name}</strong> {LINE[n.kind]?.(n) ?? ""}
        </span>
        {n.body && <span style={quote}>«{n.body}»</span>}
        <span style={{ display: "block", fontSize: 10.5, fontWeight: 700, color: "#9ab0a1", marginTop: 3 }}>
          {relativeTime(n.at)}
        </span>
      </button>

      <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
        {isReq && !verdict && (
          <>
            <button type="button" onClick={() => onDecide(n.actorId, true)} style={acceptPill}>Aceptar</button>
            <button type="button" onClick={() => onDecide(n.actorId, false)} style={ghostPill}>No</button>
          </>
        )}
        {isReq && verdict === "no" && <span style={mutedState}>Rechazada</span>}

        {canFollowBack && rel === "none" && (
          <button type="button" onClick={() => onFollowBack(n.actorId)} style={acceptPill}>Seguir</button>
        )}
        {canFollowBack && rel === "wait" && <span style={mutedState}>…</span>}
        {canFollowBack && rel === "pending" && <span style={mutedState}>Pendiente</span>}
        {canFollowBack && rel === "following" && (
          <span style={{ ...mutedState, color: GREEN, display: "flex", alignItems: "center", gap: 3 }}>
            <Check size={12} strokeWidth={3} /> Siguiendo
          </span>
        )}

        {/* La foto del plato del que se habla: sin ella, tres comentarios
            seguidos son tres filas de texto idénticas. */}
        {thumb && !isReq && (
          <button type="button" onClick={open} style={plainBtn} aria-label="Ver el contenido">
            <img src={thumb} alt="" loading="lazy" style={thumbImg} />
          </button>
        )}
      </div>
    </div>
  );
}

// Dos familias de color y no cinco: verde = gente, azul = conversación. Es la
// única distinción que ayuda a barrer la lista de un vistazo.
const KIND = {
  request:  { Icon: UserPlus,        tint: "#eaf6ee", ink: GREEN },
  accepted: { Icon: UserCheck,       tint: "#eaf6ee", ink: GREEN },
  follower: { Icon: UserCheck,       tint: "#eaf6ee", ink: GREEN },
  comment:  { Icon: MessageCircle,   tint: "#e6efff", ink: BLUE },
  reply:    { Icon: CornerDownRight, tint: "#e6efff", ink: BLUE },
};

const LINE = {
  request:  () => "quiere seguirte",
  accepted: () => "aceptó tu solicitud",
  follower: () => "empezó a seguirte",
  comment:  (n) => (n.targetType === "menu" ? "comentó tu menú" : "comentó tu receta"),
  reply:    () => "respondió a tu comentario",
};

/** "hace 2 h". Igual que en las tarjetas del feed: se corta en semanas. */
function relativeTime(iso) {
  const mins = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (!Number.isFinite(mins)) return "";
  if (mins < 2) return "ahora";
  if (mins < 60) return `hace ${mins} min`;
  const h = Math.round(mins / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.round(h / 24);
  if (d === 1) return "ayer";
  if (d < 7) return `hace ${d} días`;
  const w = Math.round(d / 7);
  return w === 1 ? "hace 1 semana" : `hace ${w} semanas`;
}

const overlay = { position: "fixed", inset: 0, zIndex: 300 };

// El ancho de la columna de app menos un respiro a cada lado: las filas
// llevan avatar + texto + accion, y con menos se pisan entre ellas.
const panel = {
  position: "fixed",
  width: "min(calc(100vw - 24px), 396px)",
  background: "#fff",
  borderRadius: 18,
  border: "1px solid #e8efe9",
  boxShadow: "0 16px 38px -12px rgba(20,47,29,.38), 0 2px 8px rgba(20,47,29,.06)",
  boxSizing: "border-box",
};

/** El pico que ata el panel a la campana. Solo los dos lados que se ven. */
const caret = {
  position: "absolute", top: -6, right: 15,
  width: 11, height: 11, background: "#fff",
  borderTop: "1px solid #e8efe9", borderLeft: "1px solid #e8efe9",
  transform: "rotate(45deg)", borderRadius: 2,
};

const eyebrow = {
  padding: "8px 12px 4px",
  fontSize: 9.5, fontWeight: 800, color: "#9ab0a1",
  textTransform: "uppercase", letterSpacing: ".7px",
};

const row = {
  display: "flex", alignItems: "center", gap: 10,
  padding: "9px 10px", borderRadius: 13,
};

const kindDot = {
  position: "absolute", right: -3, bottom: -2,
  width: 17, height: 17, borderRadius: "50%",
  display: "flex", alignItems: "center", justifyContent: "center",
  border: "2px solid #fff", boxSizing: "border-box",
};

const quote = {
  display: "block", marginTop: 2,
  fontSize: 11.5, fontWeight: 600, color: "#7a8a7f", lineHeight: 1.35,
  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
};

const plainBtn = {
  border: "none", background: "transparent", padding: 0,
  cursor: "pointer", fontFamily: "inherit",
};

const acceptPill = {
  padding: "6px 13px", borderRadius: 999, border: "none",
  background: GREEN, color: "#fff",
  fontSize: 11.5, fontWeight: 800, cursor: "pointer", fontFamily: "inherit",
};

const ghostPill = {
  padding: "6px 11px", borderRadius: 999,
  border: "1.5px solid #dbe5de", background: "#fff", color: "#5a7066",
  fontSize: 11.5, fontWeight: 800, cursor: "pointer", fontFamily: "inherit",
};

const mutedState = { fontSize: 11, fontWeight: 800, color: "#9ab0a1" };

const thumbImg = {
  width: 40, height: 40, borderRadius: 11, objectFit: "cover",
  display: "block", background: "#eef3f0",
};
