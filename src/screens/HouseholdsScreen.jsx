import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  BookOpen,
  Check,
  Home,
  Link2,
  LogOut,
  MoreHorizontal,
  RotateCw,
  Settings,
  Share2,
  Trash2,
  UserMinus,
  Users,
} from "lucide-react";
import {
  Avatar,
  BottomNav,
  GroupAvatarStack,
  bottomNavSpacer,
  GoogleButton,
  groupAvatarFaces,
} from "../components/ui.jsx";
import {
  buildInviteUrl,
  canShareHouseholdInvite,
  extractInviteToken,
  loadHouseholdMembers,
} from "../lib/householdsSync.js";

const GREEN = "#2d5a3d";
const VIEWER_BLUE = "#4a6fd0";
const INK = "#142f1d";
const MUTED = "#5a7262";
const HEADER_BAND = "#e9f4ed";
const IMG_OWNER = "/avatares/hogares/hogar_propietario.png";
const IMG_VIEWER = "/avatares/hogares/hogar_visitante.png";
/** Ilustración join / invitación — vertical y alegre (distinta del carrusel). */
const IMG_JOIN = "/avatares/cards/ninos_findesemana_juntos.jpg";
const JOIN_ASPECT = "3/4";
/** Visible height ≈92% of 4:5 illustration (~8% bottom crop). */
const CARD_ASPECT = "32/37";

function RoleIllustration({ roleLabel }) {
  const isProp = roleLabel === "Propietario";
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 3,
        width: 36,
        flexShrink: 0,
      }}
    >
      <img
        src={isProp ? IMG_OWNER : IMG_VIEWER}
        alt=""
        style={{
          width: 28,
          height: 34,
          borderRadius: 8,
          objectFit: "cover",
          objectPosition: "center top",
          display: "block",
          boxShadow: "0 2px 8px rgba(20,47,29,.12)",
          border: "1px solid #e3ebe6",
        }}
      />
      <span style={{ fontSize: 9, fontWeight: 800, color: isProp ? GREEN : VIEWER_BLUE, lineHeight: 1 }}>
        {isProp ? "Prop" : "Vis"}
      </span>
    </div>
  );
}

function buildSlots(households, activeHousehold, user) {
  let owner =
    households.find((h) => h.role === "owner" && h.isOwn) ??
    households.find((h) => h.role === "owner");
  if (!owner && user && activeHousehold?.role === "owner") {
    owner = activeHousehold;
  }
  const viewers = households.filter((h) => h.role === "viewer");
  return [
    { kind: "owner", household: owner ?? null, label: "Tu hogar", roleLabel: "Propietario" },
    { kind: "viewer", household: viewers[0] ?? null, label: "Hogar visitante 1", roleLabel: "Visitante" },
    { kind: "viewer", household: viewers[1] ?? null, label: "Hogar visitante 2", roleLabel: "Visitante" },
  ];
}

function WhatsAppIcon({ size = 22 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden style={{ display: "block" }}>
      <path
        fill="#25D366"
        d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.435 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"
      />
    </svg>
  );
}

function sheetOverlayStyle(zIndex = 1000) {
  return {
    position: "fixed",
    inset: 0,
    zIndex,
    background: "rgba(15,30,20,.38)",
    backdropFilter: "blur(4px)",
    WebkitBackdropFilter: "blur(4px)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  };
}

function ConfirmSheet({
  open,
  title,
  message,
  confirmLabel = "Confirmar",
  cancelLabel = "Cancelar",
  danger = false,
  busy = false,
  onConfirm,
  onClose,
}) {
  if (!open) return null;

  const accent = danger ? "#b42318" : GREEN;
  const bandBg = danger ? "#fff5f5" : HEADER_BAND;

  return createPortal(
    <div onClick={onClose} className="mp-overlay-in" style={sheetOverlayStyle(1001)}>
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="hog-confirm-title"
        aria-describedby="hog-confirm-msg"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 320,
          maxWidth: "calc(100vw - 40px)",
          background: "#fff",
          borderRadius: 22,
          border: `1px solid ${danger ? "#f0d4d4" : "#dce8e1"}`,
          boxShadow: "0 24px 48px rgba(20,47,29,.2)",
          overflow: "hidden",
          animation: "hogSheetIn .24s cubic-bezier(.4,0,.2,1) both",
        }}
      >
        <div style={{ background: bandBg, padding: "18px 18px 14px" }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
            <span
              style={{
                width: 36,
                height: 36,
                borderRadius: 11,
                background: danger ? "#fde8e8" : "#eef6f0",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              {danger ? (
                <Trash2 size={18} color={accent} strokeWidth={2.3} />
              ) : (
                <LogOut size={18} color={accent} strokeWidth={2.3} />
              )}
            </span>
            <h2
              id="hog-confirm-title"
              style={{
                margin: 0,
                flex: 1,
                fontSize: 17,
                fontWeight: 900,
                color: INK,
                letterSpacing: "-.25px",
                lineHeight: 1.25,
                textAlign: "left",
              }}
            >
              {title}
            </h2>
          </div>
        </div>

        <p
          id="hog-confirm-msg"
          style={{
            margin: 0,
            padding: "14px 18px 18px",
            fontSize: 13.5,
            fontWeight: 600,
            color: MUTED,
            lineHeight: 1.45,
            textAlign: "left",
          }}
        >
          {message}
        </p>

        <div style={{ display: "flex", gap: 8, padding: "0 18px 18px" }}>
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            style={{
              flex: 1,
              padding: "11px 12px",
              borderRadius: 12,
              border: "1.5px solid #d5e6da",
              background: "#fff",
              color: MUTED,
              fontSize: 13,
              fontWeight: 700,
              cursor: busy ? "wait" : "pointer",
              fontFamily: "inherit",
            }}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onConfirm}
            style={{
              flex: 1.2,
              padding: "11px 12px",
              borderRadius: 12,
              border: "none",
              background: busy ? "#9ab0a1" : accent,
              color: "#fff",
              fontSize: 13,
              fontWeight: 800,
              cursor: busy ? "wait" : "pointer",
              fontFamily: "inherit",
            }}
          >
            {busy ? "Un momento…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function JoinSheet({ open, onClose, onJoin, joining, joinError }) {
  const [linkDraft, setLinkDraft] = useState("");
  const inputRef = useRef(null);

  useEffect(() => {
    if (!open) {
      setLinkDraft("");
      return;
    }
    inputRef.current?.focus();
    if (typeof navigator !== "undefined" && navigator.clipboard?.readText) {
      navigator.clipboard.readText().then((text) => {
        if (text?.includes("join=")) setLinkDraft((prev) => prev || text.trim());
      }).catch(() => {});
    }
  }, [open]);

  if (!open) return null;

  const handleJoin = () => {
    const token = extractInviteToken(linkDraft);
    if (token) onJoin?.(token);
  };

  return createPortal(
    <div onClick={onClose} className="mp-overlay-in" style={sheetOverlayStyle()}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Unirse a un hogar"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 320,
          maxWidth: "calc(100vw - 40px)",
          background: "#fff",
          borderRadius: 24,
          border: `3px solid ${GREEN}`,
          boxShadow: "0 24px 48px rgba(20,47,29,.2)",
          overflow: "hidden",
          animation: "hogSheetIn .24s cubic-bezier(.4,0,.2,1) both",
        }}
      >
        <img
          src={IMG_JOIN}
          alt=""
          style={{
            width: "100%",
            aspectRatio: JOIN_ASPECT,
            objectFit: "cover",
            objectPosition: "center 18%",
            display: "block",
          }}
        />
        <div style={{ padding: "18px 18px 20px", textAlign: "center" }}>
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 999,
              background: "#e8faf0",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              marginBottom: 12,
              boxShadow: "0 2px 10px rgba(37,211,102,.15)",
            }}
          >
            <WhatsAppIcon size={24} />
          </div>
          <p style={{ margin: "0 0 14px", fontSize: 13, fontWeight: 600, color: MUTED, lineHeight: 1.45 }}>
            Pega el enlace de invitación que te han enviado
          </p>
          <input
            ref={inputRef}
            type="url"
            inputMode="url"
            autoComplete="off"
            placeholder="https://…?join=…"
            value={linkDraft}
            onChange={(e) => setLinkDraft(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleJoin()}
            style={{
              width: "100%",
              boxSizing: "border-box",
              border: "1.5px solid #d5e6da",
              borderRadius: 12,
              padding: "11px 12px",
              fontSize: 13,
              fontFamily: "inherit",
              color: INK,
              marginBottom: 12,
              background: "#fafcfb",
            }}
          />
          {joinError && (
            <p style={{ margin: "0 0 10px", fontSize: 12, fontWeight: 600, color: "#b42318", lineHeight: 1.35 }}>
              {joinError}
            </p>
          )}
          <button
            type="button"
            disabled={!linkDraft.trim() || joining}
            onClick={handleJoin}
            style={{
              width: "100%",
              padding: "12px 16px",
              borderRadius: 12,
              border: "none",
              background: joining ? "#9ab0a1" : GREEN,
              color: "#fff",
              fontSize: 14,
              fontWeight: 800,
              cursor: joining ? "wait" : "pointer",
              fontFamily: "inherit",
            }}
          >
            {joining ? "Uniéndote…" : "Unirse"}
          </button>
        </div>
      </div>
      <style>{`
        @keyframes hogSheetIn {
          from { opacity: 0; transform: translateY(12px) scale(.97); }
          to { opacity: 1; transform: none; }
        }
      `}</style>
    </div>,
    document.body,
  );
}

export function HouseholdInviteBanner({ pendingInvite, accepting, onAccept, onDismiss }) {
  if (!pendingInvite) return null;

  return (
    <div
      style={{
        margin: "0 0 14px",
        borderRadius: 18,
        border: `2px solid ${GREEN}`,
        background: "linear-gradient(180deg, #f4fbf6 0%, #fff 100%)",
        padding: "14px 16px",
        boxShadow: "0 8px 24px -12px rgba(45,90,61,.35)",
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
        <img
          src={IMG_JOIN}
          alt=""
          style={{
            width: 48,
            height: 64,
            borderRadius: 12,
            objectFit: "cover",
            objectPosition: "center 20%",
            flexShrink: 0,
            border: "1px solid #e3ebe6",
          }}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ margin: 0, fontSize: 11, fontWeight: 700, color: MUTED, textTransform: "uppercase", letterSpacing: ".04em" }}>
            Invitación
          </p>
          <p style={{ margin: "4px 0 0", fontSize: 15, fontWeight: 900, color: INK, lineHeight: 1.25 }}>
            Te han invitado a <span style={{ color: GREEN }}>{pendingInvite.householdName}</span>
          </p>
          <p style={{ margin: "6px 0 0", fontSize: 12, fontWeight: 600, color: MUTED, lineHeight: 1.4 }}>
            Podrás ver menú, compra y despensa en solo lectura.
          </p>
        </div>
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
        <button
          type="button"
          onClick={onDismiss}
          disabled={accepting}
          style={{
            flex: 1,
            padding: "10px 12px",
            borderRadius: 11,
            border: "1.5px solid #d5e6da",
            background: "#fff",
            color: MUTED,
            fontSize: 13,
            fontWeight: 700,
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          Ahora no
        </button>
        <button
          type="button"
          onClick={onAccept}
          disabled={accepting}
          style={{
            flex: 1.4,
            padding: "10px 12px",
            borderRadius: 11,
            border: "none",
            background: accepting ? "#9ab0a1" : GREEN,
            color: "#fff",
            fontSize: 13,
            fontWeight: 800,
            cursor: accepting ? "wait" : "pointer",
            fontFamily: "inherit",
          }}
        >
          {accepting ? "Uniéndote…" : "Aceptar invitación"}
        </button>
      </div>
    </div>
  );
}

function MembersSheet({
  open,
  onClose,
  householdId,
  householdName,
  userId,
  isOwner,
  canShare,
  inviteUrl,
  onRemoveMember,
}) {
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  const [removingId, setRemovingId] = useState(null);
  const [removeConfirm, setRemoveConfirm] = useState(null);

  useEffect(() => {
    if (!open || !householdId) {
      setAccounts([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    loadHouseholdMembers(householdId, userId).then((rows) => {
      if (!cancelled) {
        setAccounts(rows);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [open, householdId, userId]);

  const refreshMembers = useCallback(async () => {
    if (!householdId) return;
    const rows = await loadHouseholdMembers(householdId, userId);
    setAccounts(rows);
  }, [householdId, userId]);

  const handleShare = async () => {
    if (!inviteUrl) return;
    const text = `Únete a mi hogar en MenuPlan: ${inviteUrl}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: "Invitación MenuPlan", text, url: inviteUrl });
        return;
      }
    } catch {
      /* fall through */
    }
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 2000);
    } catch {
      window.prompt("Copia este enlace:", inviteUrl);
    }
  };

  const handleRemove = (memberId, memberName) => {
    if (!householdId || !onRemoveMember) return;
    setRemoveConfirm({ id: memberId, name: memberName });
  };

  const confirmRemove = async () => {
    if (!removeConfirm || !householdId || !onRemoveMember) return;
    setRemovingId(removeConfirm.id);
    const ok = await onRemoveMember(householdId, removeConfirm.id);
    setRemovingId(null);
    setRemoveConfirm(null);
    if (ok) await refreshMembers();
  };

  if (!open && !removeConfirm) return null;

  const viewerCount = accounts.filter((a) => a.roleLabel === "Visitante").length;

  const sheet = open
    ? createPortal(
    <div onClick={onClose} className="mp-overlay-in" style={sheetOverlayStyle()}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Miembros de ${householdName}`}
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 320,
          maxWidth: "calc(100vw - 40px)",
          background: "#fff",
          borderRadius: 22,
          border: "1px solid #dce8e1",
          boxShadow: "0 24px 48px rgba(20,47,29,.2)",
          overflow: "hidden",
          animation: "hogSheetIn .24s cubic-bezier(.4,0,.2,1) both",
        }}
      >
        <div style={{ background: HEADER_BAND, padding: "18px 18px 16px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span
              style={{
                width: 36,
                height: 36,
                borderRadius: 11,
                background: "#dce8ff",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <Users size={18} color="#3b5bdb" strokeWidth={2.4} />
            </span>
            <h2
              style={{
                margin: 0,
                flex: 1,
                minWidth: 0,
                fontSize: 17,
                fontWeight: 900,
                color: INK,
                letterSpacing: "-.25px",
                lineHeight: 1.25,
                textAlign: "left",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              Miembros de {householdName}
            </h2>
          </div>
        </div>

        <div
          aria-hidden
          style={{ height: 1, background: "linear-gradient(90deg, transparent, #c8d9ce 8%, #c8d9ce 92%, transparent)" }}
        />

        <div style={{ padding: "14px 18px 18px" }}>
          {loading ? (
            <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: MUTED, textAlign: "center", padding: "8px 0" }}>
              Cargando…
            </p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {accounts.map((acc) => (
                <div
                  key={acc.id}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "auto 1fr auto auto",
                    alignItems: "center",
                    gap: 10,
                    padding: "2px 0",
                  }}
                >
                  <Avatar name={acc.name} photo={acc.photo} size={42} color={GREEN} />
                  <span
                    style={{
                      fontSize: 14,
                      fontWeight: 800,
                      color: INK,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      textAlign: "left",
                    }}
                  >
                    {acc.name}
                  </span>
                  <RoleIllustration roleLabel={acc.roleLabel} />
                  {isOwner && acc.roleLabel === "Visitante" && !acc.isYou && onRemoveMember && (
                    <button
                      type="button"
                      aria-label={`Quitar a ${acc.name}`}
                      disabled={removingId === acc.id}
                      onClick={() => handleRemove(acc.id, acc.name)}
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: 10,
                        border: "1.5px solid #f0d4d4",
                        background: "#fff5f5",
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        cursor: removingId === acc.id ? "wait" : "pointer",
                        padding: 0,
                        flexShrink: 0,
                      }}
                    >
                      <UserMinus size={15} color="#b42318" strokeWidth={2.3} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {isOwner && canShare && inviteUrl && (
            <button
              type="button"
              onClick={handleShare}
              style={{
                width: "100%",
                marginTop: 14,
                padding: "11px 14px",
                borderRadius: 12,
                border: "none",
                background: shareCopied ? "#eef6f0" : GREEN,
                color: shareCopied ? GREEN : "#fff",
                fontSize: 13,
                fontWeight: 800,
                cursor: "pointer",
                fontFamily: "inherit",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
              }}
            >
              {shareCopied ? <Check size={16} /> : <Share2 size={16} />}
              {shareCopied ? "Enlace copiado" : "Compartir enlace"}
            </button>
          )}

          {isOwner && !loading && viewerCount === 0 && (
            <p
              style={{
                margin: "14px 0 0",
                fontSize: 11,
                fontWeight: 600,
                color: MUTED,
                lineHeight: 1.45,
                textAlign: "center",
              }}
            >
              Cuando alguien acepte tu invitación, aparecerá aquí.
            </p>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
    : null;

  return (
    <>
      {sheet}
      <ConfirmSheet
        open={Boolean(removeConfirm)}
        title="¿Quitar acceso?"
        message={
          removeConfirm
            ? `${removeConfirm.name} dejará de ver menú, compra y despensa de este hogar.`
            : ""
        }
        confirmLabel="Quitar acceso"
        cancelLabel="Cancelar"
        danger
        busy={Boolean(removingId)}
        onConfirm={confirmRemove}
        onClose={() => !removingId && setRemoveConfirm(null)}
      />
    </>
  );
}

function CardOverflowMenu({ actions }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const close = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);

  if (!actions.length) return null;

  return (
    <div
      ref={rootRef}
      style={{ position: "relative", flexShrink: 0 }}
      onClick={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        aria-label={open ? "Cerrar acciones" : "Acciones del hogar"}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        style={{
          width: 34,
          height: 34,
          borderRadius: 999,
          border: "none",
          background: "rgba(255,255,255,.92)",
          boxShadow: "0 2px 10px rgba(20,47,29,.14)",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "pointer",
          padding: 0,
          flexShrink: 0,
          transition: "transform 0.25s ease, background 0.25s ease",
          transform: open ? "rotate(90deg)" : "rotate(0deg)",
        }}
      >
        <MoreHorizontal size={18} color={GREEN} strokeWidth={2.4} />
      </button>

      <div
        style={{
          position: "absolute",
          top: "calc(100% + 6px)",
          right: 0,
          zIndex: 6,
          display: "flex",
          flexDirection: "column",
          alignItems: "stretch",
          gap: 6,
          overflow: "hidden",
          maxHeight: open ? actions.length * 44 + (actions.length - 1) * 6 : 0,
          opacity: open ? 1 : 0,
          pointerEvents: open ? "auto" : "none",
          transition:
            "max-height 0.34s cubic-bezier(0.34, 1.2, 0.64, 1), opacity 0.22s ease",
        }}
      >
        {actions.map(({ id, icon: Icon, label, color = GREEN, onClick }, i) => (
          <button
            key={id}
            type="button"
            aria-label={label}
            title={label}
            onClick={() => {
              onClick?.();
              setOpen(false);
            }}
            style={{
              width: 36,
              height: 36,
              borderRadius: 999,
              border: "none",
              background: "#fff",
              boxShadow: "0 2px 10px rgba(20,47,29,.12)",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              padding: 0,
              flexShrink: 0,
              transform: open ? "scale(1) translateY(0)" : "scale(0.6) translateY(-6px)",
              opacity: open ? 1 : 0,
              transition: `transform 0.32s cubic-bezier(0.34, 1.25, 0.64, 1) ${i * 0.05}s, opacity 0.22s ease ${i * 0.04}s`,
            }}
          >
            <Icon size={17} color={color} strokeWidth={2.3} />
          </button>
        ))}
      </div>
    </div>
  );
}

function SlotCard({
  slot,
  isGlobalActive,
  user,
  members = [],
  effectiveActiveId,
  userLoggedIn,
  householdLoading,
  inviteCopied,
  onCopyInvite,
  onLeave,
  onDestroy,
  onActivate,
  onOpenJoinSheet,
  onRemoveMember,
  onEditMembers,
  onAdvanceSetup,
  onRetry,
  renamingId,
  renameDraft,
  setRenameDraft,
  startRename,
  commitRename,
}) {
  const [accountsOpen, setAccountsOpen] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const h = slot.household;
  const empty = !h;
  const img = slot.kind === "owner" ? IMG_OWNER : IMG_VIEWER;
  const ownerPending = slot.kind === "owner" && userLoggedIn && empty;
  const slotInviteUrl = h?.inviteToken ? buildInviteUrl(h.inviteToken) : null;
  const slotCanShare = Boolean(h && h.role === "owner" && h.isOwn && canShareHouseholdInvite(h));
  const needsSetup = Boolean(h && h.role === "owner" && h.isOwn && h.setupStatus === "dormant");

  let emptyHint = null;
  if (empty && !userLoggedIn) {
    emptyHint = slot.kind === "owner" ? "Inicia sesión" : "Vacío";
  } else if (ownerPending && householdLoading) {
    emptyHint = "Cargando…";
  } else if (ownerPending) {
    emptyHint = "Sin hogar";
  }

  const displayName = h?.name ?? slot.label;
  const showMemberAvatars =
    Boolean(h && slot.kind === "owner" && h.id === effectiveActiveId && members.length > 0);
  const avatarFaces = showMemberAvatars ? groupAvatarFaces(members, members) : [];
  const canEditComensales = showMemberAvatars && isGlobalActive && Boolean(onEditMembers);

  const menuActions = useMemo(() => {
    if (!h) return [];
    const items = [];
    if (h.role === "owner" && h.isOwn && isGlobalActive && slotCanShare && slotInviteUrl) {
      items.push({
        id: "share",
        icon: inviteCopied ? Check : Share2,
        label: inviteCopied ? "Enlace copiado" : "Invitar",
        onClick: onCopyInvite,
      });
    }
    if (h.role === "owner" && h.isOwn && isGlobalActive) {
      items.push({
        id: "destroy",
        icon: Trash2,
        label: "Vaciar hogar",
        color: "#b42318",
        onClick: () => {
          setConfirm({
            title: "¿Vaciar este hogar?",
            message: "Se borrarán los datos compartidos de menú, compra y despensa.",
            confirmLabel: "Vaciar hogar",
            danger: true,
            onConfirm: () => {
              onDestroy?.(h.id);
              setConfirm(null);
            },
          });
        },
      });
    }
    if (h.role === "viewer") {
      items.push({
        id: "leave",
        icon: LogOut,
        label: "Abandonar",
        color: "#b42318",
        onClick: () => {
          setConfirm({
            title: "¿Abandonar este hogar?",
            message: "Dejarás de ver el menú, la compra y la despensa compartidos.",
            confirmLabel: "Abandonar",
            danger: true,
            onConfirm: () => {
              onLeave?.(h.id);
              setConfirm(null);
            },
          });
        },
      });
    }
    return items;
  }, [
    h,
    isGlobalActive,
    slotCanShare,
    slotInviteUrl,
    inviteCopied,
    onCopyInvite,
    onDestroy,
    onLeave,
  ]);

  const cardTitleNode = h && renamingId === h.id ? (
    <input
      value={renameDraft}
      onChange={(e) => setRenameDraft(e.target.value)}
      onBlur={() => commitRename(h.id)}
      onKeyDown={(e) => e.key === "Enter" && commitRename(h.id)}
      onClick={(e) => e.stopPropagation()}
      autoFocus
      style={{
        width: "100%",
        fontSize: 15,
        fontWeight: 800,
        border: "1.5px solid rgba(255,255,255,.55)",
        borderRadius: 8,
        padding: "3px 8px",
        fontFamily: "inherit",
        boxSizing: "border-box",
        textAlign: "center",
        background: "rgba(20,47,29,.28)",
        color: "#fff",
      }}
    />
  ) : (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        if (h?.role === "owner" && h.isOwn) startRename(h);
      }}
      style={{
        margin: 0,
        padding: 0,
        border: "none",
        background: "transparent",
        font: "inherit",
        fontSize: 20,
        fontWeight: 900,
        color: empty && !ownerPending ? "rgba(255,255,255,.72)" : "#fff",
        cursor: h?.role === "owner" && h.isOwn ? "pointer" : "default",
        lineHeight: 1.15,
        letterSpacing: "-.3px",
        width: "100%",
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
        textAlign: "center",
        textShadow: "0 1px 6px rgba(20,47,29,.45)",
      }}
    >
      {displayName}
    </button>
  );

  const canActivate = Boolean(h && !isGlobalActive);

  return (
    <div
      role={canActivate ? "button" : undefined}
      tabIndex={canActivate ? 0 : undefined}
      onClick={() => {
        if (canActivate) onActivate?.(h.id);
      }}
      onKeyDown={(e) => {
        if (canActivate && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          onActivate?.(h.id);
        }
      }}
      style={{
        position: "relative",
        width: "100%",
        maxWidth: 380,
        margin: "0 auto",
        padding: "0 4px 2px",
        border: "none",
        background: "transparent",
        boxShadow: "none",
        opacity: empty && !ownerPending ? 0.7 : 1,
        cursor: canActivate ? "pointer" : "default",
        outline: "none",
        boxSizing: "border-box",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        textAlign: "center",
        gap: 8,
      }}
    >
      <div
        style={{
          position: "relative",
          width: "min(310px, 88vw)",
          marginBottom: 0,
        }}
      >
        <div
          style={{
            borderRadius: 20,
            overflow: "hidden",
            aspectRatio: CARD_ASPECT,
            filter: empty && !ownerPending ? "grayscale(.7)" : "none",
            background: empty && !ownerPending ? "#e3ebe6" : "transparent",
          }}
        >
          <img
            src={img}
            alt=""
            style={{
              width: "100%",
              height: "auto",
              display: "block",
            }}
          />
        </div>

        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            zIndex: 5,
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "10px 10px 18px",
            background: "linear-gradient(180deg, rgba(20,47,29,.55) 0%, rgba(20,47,29,.08) 72%, transparent 100%)",
            borderRadius: "20px 20px 0 0",
            boxSizing: "border-box",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div style={{ flexShrink: 0, width: showMemberAvatars ? "auto" : 34, minHeight: 34 }}>
            {showMemberAvatars && (
              <button
                type="button"
                aria-label="Editar comensales"
                disabled={!canEditComensales}
                onClick={(e) => {
                  e.stopPropagation();
                  if (canEditComensales) onEditMembers?.();
                }}
                style={{
                  lineHeight: 0,
                  border: "none",
                  padding: 0,
                  background: "transparent",
                  cursor: canEditComensales ? "pointer" : "default",
                }}
              >
                <GroupAvatarStack faces={avatarFaces} size={32} active max={3} />
              </button>
            )}
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>{cardTitleNode}</div>

          <div style={{ flexShrink: 0, width: menuActions.length ? "auto" : 34 }}>
            <CardOverflowMenu actions={menuActions} />
          </div>
        </div>

        {h && (
          <button
            type="button"
            aria-label="Ver miembros con acceso"
            onClick={(e) => {
              e.stopPropagation();
              setAccountsOpen(true);
            }}
            style={{
              position: "absolute",
              bottom: 10,
              left: 10,
              zIndex: 3,
              width: 40,
              height: 40,
              borderRadius: 999,
              border: "none",
              background: "rgba(255,255,255,.94)",
              boxShadow: "0 3px 14px rgba(20,47,29,.18)",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              padding: 0,
            }}
          >
            <Users size={19} color={GREEN} strokeWidth={2.35} />
          </button>
        )}
      </div>

      {h && (
        <span
          style={{
            padding: "3px 11px",
            borderRadius: 999,
            fontSize: 10,
            fontWeight: 800,
            background: slot.kind === "owner" ? GREEN : VIEWER_BLUE,
            color: "#fff",
            lineHeight: 1.3,
            marginTop: 2,
          }}
        >
          {slot.roleLabel}
        </span>
      )}

      {needsSetup && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 6,
            marginTop: 2,
            maxWidth: 280,
          }}
        >
          <p style={{ margin: 0, fontSize: 11, fontWeight: 600, color: "#6b8575", lineHeight: 1.35, textAlign: "center" }}>
            Activa invitaciones para compartir el menú con tu familia.
          </p>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onAdvanceSetup?.(h.id, "invite_ready");
            }}
            style={{
              padding: "7px 16px",
              borderRadius: 10,
              border: "none",
              background: GREEN,
              color: "#fff",
              fontSize: 12,
              fontWeight: 800,
              cursor: "pointer",
              fontFamily: "inherit",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              boxShadow: "0 2px 10px rgba(45,106,79,.22)",
            }}
          >
            <Settings size={14} strokeWidth={2.4} />
            Configurar hogar
          </button>
        </div>
      )}

      {canActivate && (
        <p style={{ margin: 0, fontSize: 11, fontWeight: 700, color: GREEN, lineHeight: 1.3 }}>
          Toca para activar este hogar
        </p>
      )}

      {emptyHint && (
        <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: "#9ab0a1", lineHeight: 1.35 }}>{emptyHint}</p>
      )}

      {empty && slot.kind === "viewer" && userLoggedIn && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onOpenJoinSheet?.();
          }}
          style={{
            padding: "6px 14px",
            borderRadius: 8,
            border: "none",
            background: GREEN,
            color: "#fff",
            fontSize: 11,
            fontWeight: 800,
            cursor: "pointer",
            fontFamily: "inherit",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 4,
          }}
        >
          <Link2 size={12} />
          Unirse
        </button>
      )}

      {ownerPending && !householdLoading && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRetry();
          }}
          style={{
            padding: "5px 12px",
            borderRadius: 8,
            border: `1.5px solid ${GREEN}`,
            background: "#fff",
            color: GREEN,
            fontWeight: 700,
            fontSize: 10,
            cursor: "pointer",
            fontFamily: "inherit",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 4,
          }}
        >
          <RotateCw size={11} />
          Reintentar
        </button>
      )}

      <MembersSheet
        open={accountsOpen}
        onClose={() => setAccountsOpen(false)}
        householdId={h?.id}
        householdName={displayName}
        userId={user?.id}
        isOwner={Boolean(h?.role === "owner" && h?.isOwn)}
        canShare={slotCanShare}
        inviteUrl={slotInviteUrl}
        onRemoveMember={onRemoveMember}
      />

      <ConfirmSheet
        open={Boolean(confirm)}
        title={confirm?.title ?? ""}
        message={confirm?.message ?? ""}
        confirmLabel={confirm?.confirmLabel ?? "Confirmar"}
        cancelLabel="Cancelar"
        danger={confirm?.danger}
        onConfirm={() => confirm?.onConfirm?.()}
        onClose={() => setConfirm(null)}
      />
    </div>
  );
}

function HouseholdCarousel({
  slots,
  effectiveActiveId,
  user,
  members,
  userLoggedIn,
  householdLoading,
  inviteCopied,
  onCopyInvite,
  onLeave,
  onDestroy,
  onActivate,
  onOpenJoinSheet,
  onRemoveMember,
  onEditMembers,
  onAdvanceSetup,
  onRetry,
  slideIndex,
  onSlideChange,
  renamingId,
  renameDraft,
  setRenameDraft,
  startRename,
  commitRename,
}) {
  const touchX = useRef(null);

  const go = useCallback(
    (delta) => {
      onSlideChange((i) => Math.max(0, Math.min(slots.length - 1, i + delta)));
    },
    [onSlideChange, slots.length],
  );

  const onTouchStart = (e) => {
    touchX.current = e.touches[0].clientX;
  };

  const onTouchEnd = (e) => {
    if (touchX.current == null) return;
    const dx = e.changedTouches[0].clientX - touchX.current;
    touchX.current = null;
    if (dx <= -48) go(1);
    else if (dx >= 48) go(-1);
  };

  return (
    <div style={{ width: "100%", paddingBottom: 4 }}>
      <div
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        style={{ overflow: "hidden", width: "100%", touchAction: "pan-y" }}
      >
        <div
          style={{
            display: "flex",
            transform: `translateX(-${slideIndex * 100}%)`,
            transition: "transform 0.38s cubic-bezier(0.4, 0, 0.2, 1)",
          }}
        >
          {slots.map((slot) => {
            const h = slot.household;
            const isGlobalActive = Boolean(h?.id && h.id === effectiveActiveId);
            return (
              <div
                key={slot.kind + (h?.id ?? slot.label)}
                style={{
                  minWidth: "100%",
                  flexShrink: 0,
                  padding: "0 4px",
                  boxSizing: "border-box",
                }}
              >
                <SlotCard
                  slot={slot}
                  isGlobalActive={isGlobalActive}
                  user={user}
                  members={members}
                  effectiveActiveId={effectiveActiveId}
                  userLoggedIn={userLoggedIn}
                  householdLoading={householdLoading}
                  inviteCopied={inviteCopied}
                  onCopyInvite={onCopyInvite}
                  onLeave={onLeave}
                  onDestroy={onDestroy}
                  onActivate={onActivate}
                  onOpenJoinSheet={onOpenJoinSheet}
                  onRemoveMember={onRemoveMember}
                  onEditMembers={onEditMembers}
                  onAdvanceSetup={onAdvanceSetup}
                  onRetry={onRetry}
                  renamingId={renamingId}
                  renameDraft={renameDraft}
                  setRenameDraft={setRenameDraft}
                  startRename={startRename}
                  commitRename={commitRename}
                />
              </div>
            );
          })}
        </div>
      </div>

      {slots.length > 1 && (
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            gap: 6,
            marginTop: 6,
            marginBottom: 28,
            position: "relative",
            zIndex: 2,
          }}
        >
          {slots.map((slot, i) => (
            <button
              key={slot.kind + (slot.household?.id ?? slot.label)}
              type="button"
              aria-label={`Hogar ${i + 1}`}
              onClick={() => onSlideChange(i)}
              style={{
                width: i === slideIndex ? 18 : 7,
                height: 7,
                borderRadius: 999,
                border: "none",
                padding: 0,
                background: i === slideIndex ? GREEN : "#d4e0d8",
                cursor: "pointer",
                transition: "width 0.25s ease, background 0.25s ease",
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function HouseholdsScreen({
  user,
  households = [],
  activeHousehold,
  activeHouseholdId,
  householdLoading = false,
  householdError = null,
  members = [],
  readOnly,
  inviteUrl,
  pendingInvite,
  acceptingInvite = false,
  onAcceptPendingInvite,
  onDismissPendingInvite,
  onNav,
  onBack,
  onOpenBiblioteca,
  onEditMembers,
  onAdvanceSetup,
  onRefresh,
  onSwitchHousehold,
  onLeaveHousehold,
  onDestroyHousehold,
  onJoinByToken,
  onRemoveMember,
  onRenameHousehold,
  onSignIn,
}) {
  const [copied, setCopied] = useState(false);
  const [renamingId, setRenamingId] = useState(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [joinSheetOpen, setJoinSheetOpen] = useState(false);
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState(null);

  useEffect(() => {
    if (user?.id) onRefresh?.();
  }, [user?.id, onRefresh]);

  const slots = useMemo(
    () => buildSlots(households, activeHousehold, user),
    [households, activeHousehold, user],
  );

  const effectiveActiveId =
    activeHouseholdId ??
    activeHousehold?.id ??
    households.find((h) => h.role === "owner" && h.isOwn)?.id ??
    households[0]?.id ??
    null;

  const activeSlideIndex = useMemo(() => {
    const i = slots.findIndex((s) => s.household?.id === effectiveActiveId);
    return i >= 0 ? i : 0;
  }, [slots, effectiveActiveId]);

  const [slideIndex, setSlideIndex] = useState(activeSlideIndex);

  useEffect(() => {
    setSlideIndex(activeSlideIndex);
  }, [activeSlideIndex]);

  const viewedSlot = slots[slideIndex] ?? slots[0];
  const viewedHousehold = viewedSlot?.household;
  const navDissolved = !viewedHousehold || viewedHousehold.id !== effectiveActiveId;

  const handleCopyInvite = async () => {
    if (!inviteUrl) return;
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("Copia este enlace:", inviteUrl);
    }
  };

  const handleJoinFromSheet = async (token) => {
    setJoining(true);
    setJoinError(null);
    const result = await onJoinByToken?.(token);
    setJoining(false);
    if (!result) {
      setJoinError("No se pudo unir al hogar. Comprueba el enlace.");
      return;
    }
    setJoinSheetOpen(false);
    setJoinError(null);
    onRefresh?.();
  };

  const startRename = (h) => {
    setRenamingId(h.id);
    setRenameDraft(h.name);
  };

  const commitRename = async (id) => {
    const targetId = id ?? renamingId;
    if (!targetId || !renameDraft.trim()) {
      setRenamingId(null);
      return;
    }
    await onRenameHousehold?.(targetId, renameDraft.trim());
    setRenamingId(null);
  };

  const handleActivate = (id) => {
    onSwitchHousehold?.(id);
  };

  return (
    <div style={{ minHeight: "100dvh", background: "#fff", color: INK }}>
      <div style={{ background: HEADER_BAND }}>
        <div
          style={{
            padding: "20px 16px 14px",
            maxWidth: 420,
            margin: "0 auto",
            width: "100%",
            boxSizing: "border-box",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 10,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 9, minWidth: 0 }}>
            <span
              style={{
                width: 36,
                height: 36,
                borderRadius: 11,
                background: "#e8f5ec",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <Home size={18} color={GREEN} strokeWidth={2.4} />
            </span>
            <h1 style={{ margin: 0, fontSize: 20, fontWeight: 900, color: INK, letterSpacing: "-.3px" }}>
              Hogares
            </h1>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
            {onOpenBiblioteca && user && (
              <button
                type="button"
                onClick={onOpenBiblioteca}
                aria-label="Biblioteca"
                title="Tu biblioteca"
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 12,
                  border: "1.5px solid #d5e6da",
                  background: "#fff",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                  padding: 0,
                  color: GREEN,
                }}
              >
                <BookOpen size={16} strokeWidth={2.3} />
              </button>
            )}
            {onBack && (
              <button
                type="button"
                onClick={onBack}
                style={{
                  border: "1.5px solid #d5e6da",
                  background: "#fff",
                  color: GREEN,
                  borderRadius: 12,
                  padding: "7px 12px",
                  fontSize: 12.5,
                  fontWeight: 700,
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                Atrás
              </button>
            )}
          </div>
        </div>
      </div>

      <div
        style={{
          flex: 1,
          padding: `12px 12px calc(${bottomNavSpacer()} + 44px)`,
          maxWidth: 420,
          margin: "0 auto",
          width: "100%",
          boxSizing: "border-box",
        }}
      >
        {!user && (
          <div style={{ background: "#fff", border: "1.5px solid #e3ebe6", borderRadius: 16, padding: 14 }}>
            <p style={{ margin: "0 0 10px", fontSize: 13.5, lineHeight: 1.45 }}>
              Inicia sesión para sincronizar hogares entre dispositivos.
            </p>
            <GoogleButton onClick={onSignIn} />
          </div>
        )}

        {user && (
          <>
            {householdError && (
              <p style={{ margin: "0 0 10px", fontSize: 12, color: "#b42318", fontWeight: 600, textAlign: "center" }}>
                {householdError}
              </p>
            )}

            {pendingInvite && (
              <HouseholdInviteBanner
                pendingInvite={pendingInvite}
                accepting={acceptingInvite}
                onAccept={onAcceptPendingInvite}
                onDismiss={onDismissPendingInvite}
              />
            )}

            <HouseholdCarousel
              slots={slots}
              effectiveActiveId={effectiveActiveId}
              user={user}
              members={members}
              userLoggedIn={Boolean(user)}
              householdLoading={householdLoading}
              inviteCopied={copied}
              onCopyInvite={handleCopyInvite}
              onLeave={onLeaveHousehold}
              onDestroy={onDestroyHousehold}
              onActivate={handleActivate}
              onOpenJoinSheet={() => {
                setJoinError(null);
                setJoinSheetOpen(true);
              }}
              onRemoveMember={onRemoveMember}
              onEditMembers={onEditMembers}
              onAdvanceSetup={onAdvanceSetup}
              onRetry={() => onRefresh?.()}
              slideIndex={slideIndex}
              onSlideChange={setSlideIndex}
              renamingId={renamingId}
              renameDraft={renameDraft}
              setRenameDraft={setRenameDraft}
              startRename={startRename}
              commitRename={commitRename}
            />

            {readOnly && activeHousehold && (
              <div
                style={{
                  background: "#fffdf5",
                  border: "1.5px solid #f5e6b8",
                  borderRadius: 12,
                  padding: "10px 12px",
                  marginTop: 16,
                }}
              >
                <p style={{ margin: 0, fontSize: 12, lineHeight: 1.4, color: "#7a5d00" }}>
                  Visitante en <strong>{activeHousehold.name}</strong> (solo lectura).
                </p>
              </div>
            )}
          </>
        )}
      </div>
      <JoinSheet
        open={joinSheetOpen}
        onClose={() => {
          setJoinSheetOpen(false);
          setJoinError(null);
        }}
        onJoin={handleJoinFromSheet}
        joining={joining}
        joinError={joinError}
      />
      <BottomNav active="dashboard" onNav={onNav} dissolved={navDissolved} />
    </div>
  );
}
