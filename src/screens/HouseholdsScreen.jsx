import { useEffect, useMemo, useState } from "react";
import {
  Copy,
  Check,
  LogOut,
  Share2,
  BookOpen,
  CheckCircle2,
  Link2,
  RotateCw,
} from "lucide-react";
import { Avatar, BottomNav, bottomNavSpacer, GoogleButton } from "../components/ui.jsx";
import { memberAvatarColor, memberAvatarThumbSrc } from "../lib/stages.js";

const GREEN = "#2d5a3d";
const INK = "#142f1d";
const BG = "#f4f8f5";
const MENU_GRADIENT = "linear-gradient(150deg, #1c4a2e 0%, #2d5a3d 46%, #47a066 100%)";

const IMG_OWNER = "/avatares/hogares/hogar_propietario.jpg";
const IMG_VIEWER = "/avatares/hogares/hogar_visitante.jpg";

function setupBadge(status) {
  if (status === "active") return null;
  if (status === "invite_ready") return "Listo para invitar";
  return "Sin configurar";
}

function formatJoinedAt(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("es-ES", { month: "long", year: "numeric" });
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

function SlotMeta({ joinedLabel, members, showMembers }) {
  return (
    <div
      style={{
        flexShrink: 0,
        width: 88,
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-end",
        justifyContent: "center",
        gap: 6,
        textAlign: "right",
      }}
    >
      {joinedLabel && (
        <p style={{ margin: 0, fontSize: 10, fontWeight: 700, color: "#9ab0a1", lineHeight: 1.25 }}>
          Desde {joinedLabel}
        </p>
      )}
      {showMembers && members.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
          <p style={{ margin: 0, fontSize: 9, fontWeight: 800, color: "#9ab0a1", textTransform: "uppercase", letterSpacing: ".35px" }}>
            Comen
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "flex-end", gap: 4, maxWidth: 88 }}>
            {members.slice(0, 5).map((m) => (
              <div
                key={m.id}
                style={{
                  borderRadius: "50%",
                  border: "1.5px solid #e3ebe6",
                  lineHeight: 0,
                  boxShadow: "0 1px 4px rgba(20,47,29,.12)",
                }}
              >
                <Avatar name={m.name} photo={memberAvatarThumbSrc(m)} size={26} color={memberAvatarColor(m.id, members)} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function SlotCard({
  slot,
  active,
  userLoggedIn,
  householdLoading,
  members = [],
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
  const statusBadge = h ? setupBadge(h.setupStatus) : null;
  const joinedLabel = h ? formatJoinedAt(h.joinedAt) : null;
  const ownerPending = slot.kind === "owner" && userLoggedIn && empty;

  let emptyHint = null;
  if (empty && !userLoggedIn) {
    emptyHint = slot.kind === "owner" ? "Inicia sesión" : "Vacío";
  } else if (ownerPending && householdLoading) {
    emptyHint = "Cargando tu hogar…";
  } else if (ownerPending) {
    emptyHint = "Sin hogar en la nube";
  }

  return (
    <div
      style={{
        background: "#fff",
        borderRadius: 18,
        border: active ? `2px solid ${GREEN}` : "1.5px solid #e3ebe6",
        padding: "11px 12px",
        boxShadow: active ? "0 10px 22px -14px rgba(45,90,61,.38)" : "0 4px 14px -10px rgba(20,47,29,.08)",
        opacity: empty && !ownerPending ? 0.75 : 1,
      }}
    >
      <div style={{ display: "flex", gap: 11, alignItems: "stretch" }}>
        <div style={{ width: 80, flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: 14,
              overflow: "hidden",
              border: active ? `2px solid ${GREEN}` : "1.5px solid #e3ebe6",
              background: "#eef4f0",
              filter: empty && !ownerPending ? "grayscale(.75)" : "none",
            }}
          >
            <img src={img} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "center top" }} />
          </div>
          <span
            style={{
              padding: "2px 7px",
              borderRadius: 999,
              fontSize: 9.5,
              fontWeight: 800,
              background: slot.kind === "owner" ? GREEN : "#eef4f0",
              color: slot.kind === "owner" ? "#fff" : GREEN,
            }}
          >
            {slot.roleLabel}
          </span>
          {h && (
            active ? (
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 3,
                  padding: "4px 8px",
                  borderRadius: 999,
                  fontSize: 10,
                  fontWeight: 800,
                  background: GREEN,
                  color: "#fff",
                  width: "100%",
                  justifyContent: "center",
                  boxSizing: "border-box",
                }}
              >
                <CheckCircle2 size={11} strokeWidth={2.5} />
                Activo
              </span>
            ) : (
              <button
                type="button"
                onClick={() => onSwitch?.(h.id)}
                style={{
                  width: "100%",
                  padding: "4px 7px",
                  borderRadius: 999,
                  border: `1.5px solid ${GREEN}`,
                  background: "#fff",
                  color: GREEN,
                  fontSize: 10,
                  fontWeight: 800,
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                Activar
              </button>
            )
          )}
          {empty && slot.kind === "viewer" && userLoggedIn && (
            <button
              type="button"
              onClick={onJoin}
              style={{
                width: "100%",
                padding: "4px 7px",
                borderRadius: 999,
                border: "none",
                background: GREEN,
                color: "#fff",
                fontSize: 10,
                fontWeight: 800,
                cursor: "pointer",
                fontFamily: "inherit",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 3,
              }}
            >
              <Link2 size={11} />
              Unirse
            </button>
          )}
        </div>

        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", justifyContent: "center" }}>
          {h && renamingId === h.id ? (
            <input
              value={renameDraft}
              onChange={(e) => setRenameDraft(e.target.value)}
              onBlur={() => commitRename(h.id)}
              onKeyDown={(e) => e.key === "Enter" && commitRename(h.id)}
              autoFocus
              style={{
                width: "100%",
                fontSize: 14,
                fontWeight: 800,
                border: "1.5px solid #c8ddd0",
                borderRadius: 10,
                padding: "6px 8px",
                fontFamily: "inherit",
                boxSizing: "border-box",
              }}
            />
          ) : (
            <button
              type="button"
              onClick={() => h?.role === "owner" && startRename(h)}
              style={{
                margin: 0,
                padding: 0,
                border: "none",
                background: "transparent",
                font: "inherit",
                fontSize: 15,
                fontWeight: 900,
                color: empty && !ownerPending ? "#9ab0a1" : INK,
                cursor: h?.role === "owner" ? "pointer" : "default",
                textAlign: "left",
                letterSpacing: "-.25px",
                lineHeight: 1.2,
              }}
            >
              {h?.name ?? slot.label}
            </button>
          )}

          <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 5 }}>
            {statusBadge && (
              <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 6px", borderRadius: 999, background: "#fff7e6", color: "#9a6b00" }}>
                {statusBadge}
              </span>
            )}
            {emptyHint && (
              <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 6px", borderRadius: 999, background: "#f0f4f1", color: "#7a9485" }}>
                {emptyHint}
              </span>
            )}
          </div>

          {ownerPending && !householdLoading && (
            <button
              type="button"
              onClick={onRetry}
              style={{
                marginTop: 8,
                alignSelf: "flex-start",
                padding: "6px 10px",
                borderRadius: 9,
                border: `1.5px solid ${GREEN}`,
                background: "#fff",
                color: GREEN,
                fontWeight: 700,
                fontSize: 11,
                cursor: "pointer",
                fontFamily: "inherit",
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
              }}
            >
              <RotateCw size={12} />
              Reintentar
            </button>
          )}

          {h?.role === "viewer" && (
            <button
              type="button"
              onClick={() => onLeave?.(h.id)}
              style={{
                marginTop: 8,
                alignSelf: "flex-start",
                padding: "6px 10px",
                borderRadius: 9,
                border: "1.5px solid #f0d4d4",
                background: "#fff",
                color: "#b42318",
                fontWeight: 700,
                fontSize: 11,
                cursor: "pointer",
                fontFamily: "inherit",
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
              }}
            >
              <LogOut size={13} />
              Abandonar
            </button>
          )}
          {h?.role === "owner" && h.setupStatus === "dormant" && h.isOwn && (
            <button
              type="button"
              onClick={() => onAdvanceSetup?.(h.id, "invite_ready")}
              style={{
                marginTop: 8,
                alignSelf: "flex-start",
                padding: "6px 10px",
                borderRadius: 9,
                border: "none",
                background: GREEN,
                color: "#fff",
                fontWeight: 700,
                fontSize: 11,
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              Configurar hogar
            </button>
          )}
        </div>

        {(h || (active && members.length > 0)) && (
          <SlotMeta
            joinedLabel={joinedLabel}
            members={members}
            showMembers={active && slot.kind === "owner"}
          />
        )}
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
                    userLoggedIn={Boolean(user)}
                    householdLoading={householdLoading}
                    members={members}
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

            {canShareInvite && inviteUrl && (
              <div style={{ background: "#fff", border: "1.5px solid #e3ebe6", borderRadius: 14, padding: "12px 14px", marginTop: 14 }}>
                <button
                  type="button"
                  onClick={handleCopyInvite}
                  style={{
                    width: "100%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 8,
                    padding: "10px 12px",
                    borderRadius: 11,
                    border: "none",
                    background: GREEN,
                    color: "#fff",
                    fontWeight: 800,
                    fontSize: 13,
                    cursor: "pointer",
                    fontFamily: "inherit",
                  }}
                >
                  {copied ? <Check size={16} /> : <Copy size={16} />}
                  {copied ? "Enlace copiado" : "Copiar enlace de invitación"}
                </button>
              </div>
            )}

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
