import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  BookOpen,
  Check,
  Link2,
  LogOut,
  MoreHorizontal,
  RotateCw,
  Share2,
  Trash2,
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
import { googleInfo } from "./Settings.jsx";

const GREEN = "#2d5a3d";
const INK = "#142f1d";
const MUTED = "#5a7262";
const MENU_GRADIENT = "linear-gradient(150deg, #1c4a2e 0%, #2d5a3d 46%, #47a066 100%)";
const HEADER_BAND = "#e9f4ed";
const IMG_OWNER = "/avatares/hogares/hogar_propietario.png";
const IMG_VIEWER = "/avatares/hogares/hogar_visitante.png";
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
      <span style={{ fontSize: 9, fontWeight: 800, color: isProp ? GREEN : MUTED, lineHeight: 1 }}>
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

function buildAccessAccounts(h, user) {
  if (!h || !user) return [];
  const g = googleInfo(user);
  const you = {
    id: user.id,
    name: g.name,
    photo: g.photo,
    roleLabel: h.role === "owner" ? "Propietario" : "Visitante",
    isYou: true,
  };
  if (h.role === "viewer") {
    return [
      {
        id: "owner-slot",
        name: "Propietario del hogar",
        photo: null,
        roleLabel: "Propietario",
        isYou: false,
        muted: true,
      },
      you,
    ];
  }
  return [you];
}

function MembersSheet({ open, onClose, accounts, householdName, isOwner }) {
  if (!open) return null;

  return createPortal(
    <div
      onClick={onClose}
      className="mp-overlay-in"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        background: "rgba(15,30,20,.38)",
        backdropFilter: "blur(4px)",
        WebkitBackdropFilter: "blur(4px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
      }}
    >
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
                background: "#eef6f0",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <Users size={18} color={GREEN} strokeWidth={2.4} />
            </span>
            <div style={{ minWidth: 0, textAlign: "left" }}>
              <h2
                style={{
                  margin: 0,
                  fontSize: 17,
                  fontWeight: 900,
                  color: INK,
                  letterSpacing: "-.25px",
                  lineHeight: 1.2,
                }}
              >
                Miembros de
              </h2>
              <p
                style={{
                  margin: "2px 0 0",
                  fontSize: 14,
                  fontWeight: 800,
                  color: MUTED,
                  lineHeight: 1.25,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {householdName}
              </p>
            </div>
          </div>
        </div>

        <div
          aria-hidden
          style={{ height: 1, background: "linear-gradient(90deg, transparent, #c8d9ce 8%, #c8d9ce 92%, transparent)" }}
        />

        <div style={{ padding: "14px 18px 18px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {accounts.map((acc) => (
              <div
                key={acc.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "auto 1fr auto",
                  alignItems: "center",
                  gap: 12,
                  padding: "2px 0",
                }}
              >
                <Avatar
                  name={acc.name}
                  photo={acc.photo}
                  size={42}
                  color={acc.muted ? "#9ab0a1" : GREEN}
                />
                <span
                  style={{
                    fontSize: 14,
                    fontWeight: 800,
                    color: acc.muted ? MUTED : INK,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    textAlign: "left",
                  }}
                >
                  {acc.name}
                </span>
                <RoleIllustration roleLabel={acc.roleLabel} />
              </div>
            ))}
          </div>

          {isOwner && accounts.length <= 1 && (
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
      style={{
        position: "absolute",
        top: 10,
        right: 10,
        zIndex: 4,
        display: "flex",
        flexDirection: "row-reverse",
        alignItems: "center",
        gap: 6,
      }}
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
          display: "flex",
          alignItems: "center",
          gap: 6,
          overflow: "hidden",
          maxWidth: open ? actions.length * 44 : 0,
          opacity: open ? 1 : 0,
          transition:
            "max-width 0.38s cubic-bezier(0.34, 1.2, 0.64, 1), opacity 0.22s ease",
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
              transform: open ? "scale(1) translateX(0)" : "scale(0.6) translateX(8px)",
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
  canShareInvite,
  inviteUrl,
  inviteCopied,
  onCopyInvite,
  onLeave,
  onDestroy,
  onActivate,
  onJoin,
  onAdvanceSetup,
  onRetry,
  renamingId,
  renameDraft,
  setRenameDraft,
  startRename,
  commitRename,
}) {
  const [accountsOpen, setAccountsOpen] = useState(false);
  const h = slot.household;
  const empty = !h;
  const img = slot.kind === "owner" ? IMG_OWNER : IMG_VIEWER;
  const ownerPending = slot.kind === "owner" && userLoggedIn && empty;

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
  const accessAccounts = useMemo(() => buildAccessAccounts(h, user), [h, user]);

  const menuActions = useMemo(() => {
    if (!h) return [];
    const items = [];
    if (h.role === "owner" && h.isOwn && isGlobalActive && canShareInvite && inviteUrl) {
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
          if (window.confirm("¿Vaciar este hogar? Se borrarán los datos compartidos.")) {
            onDestroy?.(h.id);
          }
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
          if (window.confirm("¿Abandonar este hogar?")) onLeave?.(h.id);
        },
      });
    }
    return items;
  }, [
    h,
    isGlobalActive,
    canShareInvite,
    inviteUrl,
    inviteCopied,
    onCopyInvite,
    onDestroy,
    onLeave,
  ]);

  const titleNode = h && renamingId === h.id ? (
    <input
      value={renameDraft}
      onChange={(e) => setRenameDraft(e.target.value)}
      onBlur={() => commitRename(h.id)}
      onKeyDown={(e) => e.key === "Enter" && commitRename(h.id)}
      autoFocus
      style={{
        width: "100%",
        maxWidth: 260,
        fontSize: 14,
        fontWeight: 800,
        border: "1.5px solid #c8ddd0",
        borderRadius: 8,
        padding: "4px 8px",
        fontFamily: "inherit",
        boxSizing: "border-box",
        textAlign: "center",
      }}
    />
  ) : (
    <button
      type="button"
      onClick={() => h?.role === "owner" && h.isOwn && startRename(h)}
      style={{
        margin: 0,
        padding: 0,
        border: "none",
        background: "transparent",
        font: "inherit",
        fontSize: 26,
        fontWeight: 900,
        color: empty && !ownerPending ? "#9ab0a1" : INK,
        cursor: h?.role === "owner" && h.isOwn ? "pointer" : "default",
        lineHeight: 1.12,
        letterSpacing: "-.5px",
        maxWidth: "100%",
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
        textAlign: "center",
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
      {titleNode}

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

        {showMemberAvatars && (
          <div style={{ position: "absolute", top: 10, left: 10, zIndex: 3, lineHeight: 0 }}>
            <GroupAvatarStack faces={avatarFaces} size={32} active max={3} />
          </div>
        )}

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

        <CardOverflowMenu actions={menuActions} />
      </div>

      {h && (
        <span
          style={{
            padding: "3px 11px",
            borderRadius: 999,
            fontSize: 10,
            fontWeight: 800,
            background: slot.kind === "owner" ? GREEN : "#eef4f0",
            color: slot.kind === "owner" ? "#fff" : GREEN,
            lineHeight: 1.3,
            marginTop: 2,
          }}
        >
          {slot.roleLabel}
        </span>
      )}

      {canActivate && (
        <p style={{ margin: 0, fontSize: 11, fontWeight: 700, color: GREEN, lineHeight: 1.3 }}>
          Toca para activar este hogar
        </p>
      )}

      {emptyHint && (
        <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: "#9ab0a1", lineHeight: 1.35 }}>{emptyHint}</p>
      )}

      {h?.role === "owner" && h.setupStatus === "dormant" && h.isOwn && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onAdvanceSetup?.(h.id, "invite_ready");
          }}
          style={{
            padding: "6px 14px",
            borderRadius: 8,
            border: "none",
            background: GREEN,
            color: "#fff",
            fontWeight: 700,
            fontSize: 11,
            cursor: "pointer",
            fontFamily: "inherit",
            lineHeight: 1.2,
          }}
        >
          Configurar hogar
        </button>
      )}

      {empty && slot.kind === "viewer" && userLoggedIn && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onJoin();
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
        accounts={accessAccounts}
        householdName={displayName}
        isOwner={h?.role === "owner" && h?.isOwn}
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
  canShareInvite,
  inviteUrl,
  inviteCopied,
  onCopyInvite,
  onLeave,
  onDestroy,
  onActivate,
  onJoin,
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
                  canShareInvite={canShareInvite}
                  inviteUrl={inviteUrl}
                  inviteCopied={inviteCopied}
                  onCopyInvite={onCopyInvite}
                  onLeave={onLeave}
                  onDestroy={onDestroy}
                  onActivate={onActivate}
                  onJoin={onJoin}
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
  canShareInvite,
  inviteUrl,
  onNav,
  onBack,
  onOpenBiblioteca,
  onRefresh,
  onSwitchHousehold,
  onLeaveHousehold,
  onDestroyHousehold,
  onJoinByToken,
  onRenameHousehold,
  onAdvanceSetup,
  onSignIn,
}) {
  const [copied, setCopied] = useState(false);
  const [renamingId, setRenamingId] = useState(null);
  const [renameDraft, setRenameDraft] = useState("");

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

  const handleJoin = async () => {
    const raw = window.prompt("Pega el enlace de invitación de otro hogar:");
    if (!raw?.trim()) return;
    let token = raw.trim();
    try {
      const url = new URL(raw.trim());
      token = url.searchParams.get("join") ?? token;
    } catch {
      /* plain token */
    }
    await onJoinByToken?.(token);
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
      <div
        style={{
          flex: 1,
          padding: `0 12px calc(${bottomNavSpacer()} + 44px)`,
          maxWidth: 420,
          margin: "0 auto",
          width: "100%",
          boxSizing: "border-box",
        }}
      >
        <div
          style={{
            background: MENU_GRADIENT,
            borderRadius: "0 0 22px 22px",
            padding: "16px 16px 18px",
            margin: "0 -12px 18px",
            boxShadow: "0 14px 28px -16px rgba(20,47,29,.5)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <img
              src={IMG_OWNER}
              alt=""
              style={{
                width: 38,
                height: 38,
                borderRadius: 11,
                objectFit: "cover",
                border: "2px solid rgba(255,255,255,.45)",
                flexShrink: 0,
              }}
            />
            <h1 style={{ margin: 0, flex: 1, fontSize: 21, fontWeight: 900, color: "#fff", letterSpacing: "-.4px" }}>
              Hogares
            </h1>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
              {onOpenBiblioteca && user && (
                <button
                  type="button"
                  onClick={onOpenBiblioteca}
                  aria-label="Biblioteca"
                  title="Tu biblioteca"
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: 10,
                    border: "1px solid rgba(255,255,255,.35)",
                    background: "rgba(255,255,255,.18)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: "pointer",
                    padding: 0,
                  }}
                >
                  <BookOpen size={16} color="#fff" strokeWidth={2.3} />
                </button>
              )}
              {onBack && (
                <button
                  type="button"
                  onClick={onBack}
                  style={{
                    border: "1px solid rgba(255,255,255,.35)",
                    background: "rgba(255,255,255,.16)",
                    color: "#fff",
                    borderRadius: 10,
                    padding: "6px 11px",
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

            <HouseholdCarousel
              slots={slots}
              effectiveActiveId={effectiveActiveId}
              user={user}
              members={members}
              userLoggedIn={Boolean(user)}
              householdLoading={householdLoading}
              canShareInvite={canShareInvite}
              inviteUrl={inviteUrl}
              inviteCopied={copied}
              onCopyInvite={handleCopyInvite}
              onLeave={onLeaveHousehold}
              onDestroy={onDestroyHousehold}
              onActivate={handleActivate}
              onJoin={handleJoin}
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
      <BottomNav active="dashboard" onNav={onNav} dissolved={navDissolved} />
    </div>
  );
}
