import { useEffect, useMemo, useState } from "react";
import {
  Check,
  Share2,
  Trash2,
  BookOpen,
  Link2,
  RotateCw,
} from "lucide-react";
import { Avatar, BottomNav, bottomNavSpacer, GoogleButton } from "../components/ui.jsx";
import { googleInfo } from "./Settings.jsx";
import { memberAvatarColor, memberAvatarThumbSrc } from "../lib/stages.js";

const GREEN = "#2d5a3d";
const INK = "#142f1d";
const BG = "#f4f8f5";
const MUTED = "#5a7262";
const ACTIVE_CARD_BG = "#f8fbf9";
const PANEL_BG = "#f4f8f5";
const MENU_GRADIENT = "linear-gradient(150deg, #1c4a2e 0%, #2d5a3d 46%, #47a066 100%)";

const IMG_OWNER = "/avatares/hogares/hogar_propietario.png";
const IMG_VIEWER = "/avatares/hogares/hogar_visitante.png";

function formatJoinedAt(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${mm}/${d.getFullYear()}`;
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

function RoleIcon({ role, size = 22 }) {
  const src = role === "owner" ? IMG_OWNER : IMG_VIEWER;
  return (
    <img
      src={src}
      alt=""
      style={{
        width: size,
        height: size,
        borderRadius: 6,
        objectFit: "cover",
        flexShrink: 0,
      }}
    />
  );
}

function MemberRow({ name, role }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
      <RoleIcon role={role} />
      <span
        style={{
          fontSize: 13,
          fontWeight: 800,
          color: INK,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {name}
      </span>
    </div>
  );
}

const ILLU_V_GAP = 6;

function HeaderIconButton({ label, title, onClick, color = GREEN, children }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={title ?? label}
      onClick={onClick}
      style={{
        margin: 0,
        padding: "6px 7px",
        border: "1px solid rgba(45,90,61,.12)",
        borderRadius: 9,
        background: "rgba(45,90,61,.08)",
        cursor: "pointer",
        lineHeight: 0,
        color,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}
    >
      {children}
    </button>
  );
}

function SelectionCheck({ active, onSelect }) {
  return (
    <HeaderIconButton
      label={active ? "Hogar seleccionado" : "Seleccionar hogar"}
      onClick={(e) => {
        e.stopPropagation();
        if (!active) onSelect?.();
      }}
    >
      <span
        style={{
          width: 26,
          height: 26,
          borderRadius: "50%",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          border: active ? "none" : "2px solid #cdd8d0",
          background: active ? GREEN : "#fff",
          boxShadow: active ? "0 2px 8px rgba(45,90,61,.28)" : "none",
          cursor: active ? "default" : "pointer",
        }}
      >
        {active && <Check size={14} color="#fff" strokeWidth={3} />}
      </span>
    </HeaderIconButton>
  );
}

function CardSection({ label, children }) {
  return (
    <div style={{ width: "100%", minWidth: 0 }}>
      <p
        style={{
          margin: "0 0 5px",
          fontSize: 11,
          fontWeight: 800,
          color: GREEN,
          letterSpacing: "-.15px",
          lineHeight: 1.2,
        }}
      >
        {label}
      </p>
      {children}
    </div>
  );
}

function DinerTile({ member, allMembers }) {
  const shortName = member.name?.trim().split(/\s+/)[0] ?? member.name ?? "?";
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, width: 50, minWidth: 0 }}>
      <div style={{ lineHeight: 0, borderRadius: "50%", border: `2px solid ${memberAvatarColor(member.id, allMembers)}33` }}>
        <Avatar
          name={member.name}
          photo={memberAvatarThumbSrc(member)}
          size={34}
          color={memberAvatarColor(member.id, allMembers)}
        />
      </div>
      <span
        style={{
          fontSize: 10,
          fontWeight: 700,
          color: INK,
          textAlign: "center",
          width: "100%",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          lineHeight: 1.1,
        }}
      >
        {shortName}
      </span>
    </div>
  );
}

function SlotCard({
  slot,
  active,
  userName,
  userLoggedIn,
  householdLoading,
  familyMembers = [],
  canShareInvite = false,
  inviteUrl = null,
  inviteCopied = false,
  onCopyInvite,
  onSwitch,
  onLeave,
  onJoin,
  onAdvanceSetup,
  onRetry,
  renamingId,
  renameDraft,
  setRenameDraft,
  startRename,
  commitRename,
}) {
  const h = slot.household;
  const empty = !h;
  const img = slot.kind === "owner" ? IMG_OWNER : IMG_VIEWER;
  const joinedLabel = h ? formatJoinedAt(h.joinedAt) : null;
  const ownerPending = slot.kind === "owner" && userLoggedIn && empty;

  const accessRows = useMemo(() => {
    if (!h || !userName) return [];
    if (h.role === "owner") return [{ name: userName, role: "owner" }];
    return [{ name: userName, role: "viewer" }];
  }, [h, userName]);

  let emptyHint = null;
  if (empty && !userLoggedIn) {
    emptyHint = slot.kind === "owner" ? "Inicia sesión" : "Vacío";
  } else if (ownerPending && householdLoading) {
    emptyHint = "Cargando…";
  } else if (ownerPending) {
    emptyHint = "Sin hogar";
  }

  const displayName = h?.name ?? slot.label;
  const showOwnerPanel = Boolean(h && active && slot.kind === "owner" && h.isOwn);
  const showShare = showOwnerPanel && canShareInvite && inviteUrl;

  const titleNode = h && renamingId === h.id ? (
    <input
      value={renameDraft}
      onChange={(e) => setRenameDraft(e.target.value)}
      onBlur={() => commitRename(h.id)}
      onKeyDown={(e) => e.key === "Enter" && commitRename(h.id)}
      autoFocus
      style={{
        width: "100%",
        fontSize: 12,
        fontWeight: 800,
        border: "1.5px solid #c8ddd0",
        borderRadius: 8,
        padding: "3px 6px",
        fontFamily: "inherit",
        boxSizing: "border-box",
        textAlign: "left",
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
        fontSize: 15.5,
        fontWeight: 900,
        color: empty && !ownerPending ? "#9ab0a1" : INK,
        cursor: h?.role === "owner" && h.isOwn ? "pointer" : "default",
        lineHeight: 1.15,
        letterSpacing: "-.3px",
        width: "100%",
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
        textAlign: "left",
        display: "block",
      }}
    >
      {displayName}
    </button>
  );

  return (
    <div
      style={{
        background: active ? ACTIVE_CARD_BG : "#fff",
        borderRadius: 18,
        border: active ? `2px solid ${GREEN}` : "1.5px solid #e3ebe6",
        padding: "12px 12px 10px 14px",
        boxShadow: active ? "0 10px 22px -14px rgba(45,90,61,.38)" : "0 4px 14px -10px rgba(20,47,29,.08)",
        opacity: empty && !ownerPending ? 0.72 : 1,
      }}
    >
      {/* Cabecera: título + acciones */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 8, marginBottom: h ? 6 : ILLU_V_GAP }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {titleNode}
          {h && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                flexWrap: "wrap",
                gap: 5,
                marginTop: 5,
              }}
            >
              <span
                style={{
                  padding: "2px 8px",
                  borderRadius: 999,
                  fontSize: 9.5,
                  fontWeight: 800,
                  background: slot.kind === "owner" ? GREEN : "#eef4f0",
                  color: slot.kind === "owner" ? "#fff" : GREEN,
                  lineHeight: 1.3,
                }}
              >
                {slot.roleLabel}
              </span>
              {joinedLabel && (
                <span style={{ fontSize: 10, fontWeight: 700, color: MUTED, lineHeight: 1.3, whiteSpace: "nowrap" }}>
                  Desde {joinedLabel}
                </span>
              )}
            </div>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0, paddingTop: 2 }}>
          {showShare && (
            <HeaderIconButton
              label={inviteCopied ? "Enlace copiado" : "Compartir invitación"}
              onClick={(e) => {
                e.stopPropagation();
                onCopyInvite?.();
              }}
            >
              {inviteCopied ? <Check size={16} strokeWidth={2.5} /> : <Share2 size={16} strokeWidth={2.2} />}
            </HeaderIconButton>
          )}
          {h?.role === "viewer" && (
            <HeaderIconButton
              label="Abandonar hogar"
              color="#b42318"
              onClick={(e) => {
                e.stopPropagation();
                onLeave?.(h.id);
              }}
            >
              <Trash2 size={16} strokeWidth={2.2} />
            </HeaderIconButton>
          )}
          {h && (
            <SelectionCheck
              active={active}
              onSelect={() => onSwitch?.(h.id)}
            />
          )}
        </div>
      </div>

      {/* Cuerpo: ilustración | panel info */}
      <div style={{ display: "flex", gap: 10, alignItems: "stretch" }}>
        <div
          style={{
            width: "45%",
            flexShrink: 0,
            display: "flex",
            flexDirection: "column",
            gap: ILLU_V_GAP,
            minWidth: 0,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "center",
              background: empty && !ownerPending ? "#eef4f0" : "transparent",
              borderRadius: empty && !ownerPending ? 14 : 0,
              filter: empty && !ownerPending ? "grayscale(.7)" : "none",
              overflow: "hidden",
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

          {h?.role === "owner" && h.setupStatus === "dormant" && h.isOwn && (
            <button
              type="button"
              onClick={() => onAdvanceSetup?.(h.id, "invite_ready")}
              style={{
                width: "100%",
                padding: "5px 6px",
                borderRadius: 8,
                border: "none",
                background: GREEN,
                color: "#fff",
                fontWeight: 700,
                fontSize: 9.5,
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
              onClick={onJoin}
              style={{
                width: "100%",
                padding: "5px 6px",
                borderRadius: 8,
                border: "none",
                background: GREEN,
                color: "#fff",
                fontSize: 9.5,
                fontWeight: 800,
                cursor: "pointer",
                fontFamily: "inherit",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 4,
              }}
            >
              <Link2 size={10} />
              Unirse
            </button>
          )}

          {ownerPending && !householdLoading && (
            <button
              type="button"
              onClick={onRetry}
              style={{
                width: "100%",
                padding: "4px 6px",
                borderRadius: 8,
                border: `1.5px solid ${GREEN}`,
                background: "#fff",
                color: GREEN,
                fontWeight: 700,
                fontSize: 9,
                cursor: "pointer",
                fontFamily: "inherit",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 4,
              }}
            >
              <RotateCw size={10} />
              Reintentar
            </button>
          )}
        </div>

        <div
          style={{
            flex: 1,
            minWidth: 0,
            background: h ? PANEL_BG : "transparent",
            borderRadius: 12,
            padding: h ? "10px 10px 8px" : 0,
            display: "flex",
            flexDirection: "column",
            gap: 10,
          }}
        >
          {h ? (
            <>
              <CardSection label="Miembros">
                <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                  {accessRows.map((row) => (
                    <MemberRow key={row.role + row.name} name={row.name} role={row.role} />
                  ))}
                </div>
              </CardSection>

              {showOwnerPanel && (
                <CardSection label="Comensales">
                  {familyMembers.length > 0 ? (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                      {familyMembers.slice(0, 6).map((m) => (
                        <DinerTile key={m.id} member={m} allMembers={familyMembers} />
                      ))}
                    </div>
                  ) : (
                    <p style={{ margin: 0, fontSize: 11.5, fontWeight: 600, color: MUTED }}>Ninguno aún</p>
                  )}
                </CardSection>
              )}
            </>
          ) : (
            emptyHint && (
              <p style={{ margin: "auto 0", fontSize: 11, fontWeight: 600, color: "#9ab0a1", lineHeight: 1.35 }}>{emptyHint}</p>
            )
          )}
        </div>
      </div>
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
  onJoinByToken,
  onRenameHousehold,
  onAdvanceSetup,
  onSignIn,
}) {
  const [copied, setCopied] = useState(false);
  const [renamingId, setRenamingId] = useState(null);
  const [renameDraft, setRenameDraft] = useState("");
  const userName = googleInfo(user)?.name ?? user?.email?.split("@")[0] ?? "Tú";

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

  return (
    <div style={{ minHeight: "100dvh", background: BG, color: INK }}>
      <div
        style={{
          flex: 1,
          padding: `0 16px calc(${bottomNavSpacer()} + 10px)`,
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
            margin: "0 -16px 14px",
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

            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {slots.map((slot) => {
                const isActive = Boolean(slot.household?.id && slot.household.id === effectiveActiveId);
                return (
                  <SlotCard
                    key={slot.kind + (slot.household?.id ?? slot.label)}
                    slot={slot}
                    active={isActive}
                    userName={userName}
                    userLoggedIn={Boolean(user)}
                    householdLoading={householdLoading}
                    familyMembers={members}
                    canShareInvite={Boolean(isActive && canShareInvite && inviteUrl && slot.kind === "owner")}
                    inviteUrl={inviteUrl}
                    inviteCopied={copied}
                    onCopyInvite={handleCopyInvite}
                    onSwitch={onSwitchHousehold}
                    onLeave={onLeaveHousehold}
                    onJoin={handleJoin}
                    onAdvanceSetup={onAdvanceSetup}
                    onRetry={() => onRefresh?.()}
                    renamingId={renamingId}
                    renameDraft={renameDraft}
                    setRenameDraft={setRenameDraft}
                    startRename={startRename}
                    commitRename={commitRename}
                  />
                );
              })}
            </div>

            {readOnly && activeHousehold && (
              <div style={{ background: "#fffdf5", border: "1.5px solid #f5e6b8", borderRadius: 12, padding: "10px 12px", marginTop: 14 }}>
                <p style={{ margin: 0, fontSize: 12, lineHeight: 1.4, color: "#7a5d00" }}>
                  Visitante en <strong>{activeHousehold.name}</strong> (solo lectura).
                </p>
              </div>
            )}
          </>
        )}
      </div>
      <BottomNav active="dashboard" onNav={onNav} />
    </div>
  );
}
