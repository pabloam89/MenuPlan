import { useEffect, useMemo, useState } from "react";
import {
  BookOpen,
  Link2,
  RotateCw,
} from "lucide-react";
import { BottomNav, bottomNavSpacer, GoogleButton } from "../components/ui.jsx";
const GREEN = "#2d5a3d";
const INK = "#142f1d";
const BG = "#f4f8f5";
const MUTED = "#5a7262";
const ACTIVE_CARD_BG = "#f8fbf9";
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

function SlotCard({
  slot,
  active,
  userLoggedIn,
  householdLoading,
  onSwitch,
  onJoin,
  onAdvanceSetup,
  onRetry,
  renamingId,
  renameDraft,
  setRenameDraft,
  startRename,
  commitRename,
}) {  const h = slot.household;
  const empty = !h;
  const img = slot.kind === "owner" ? IMG_OWNER : IMG_VIEWER;
  const joinedLabel = h ? formatJoinedAt(h.joinedAt) : null;
  const ownerPending = slot.kind === "owner" && userLoggedIn && empty;
  const roleShort = slot.kind === "owner" ? "Prop" : "Vis";
  let emptyHint = null;
  if (empty && !userLoggedIn) {
    emptyHint = slot.kind === "owner" ? "Inicia sesión" : "Vacío";
  } else if (ownerPending && householdLoading) {
    emptyHint = "Cargando…";
  } else if (ownerPending) {
    emptyHint = "Sin hogar";
  }

  const displayName = h?.name ?? slot.label;

  const titleNode = h && renamingId === h.id ? (    <input
      value={renameDraft}
      onChange={(e) => setRenameDraft(e.target.value)}
      onBlur={() => commitRename(h.id)}
      onKeyDown={(e) => e.key === "Enter" && commitRename(h.id)}
      autoFocus
      style={{
        width: "100%",
        maxWidth: 220,
        fontSize: 13,
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
        fontSize: 22,
        fontWeight: 900,
        color: empty && !ownerPending ? "#9ab0a1" : INK,
        cursor: h?.role === "owner" && h.isOwn ? "pointer" : "default",
        lineHeight: 1.15,
        letterSpacing: "-.4px",
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

  const canSelect = Boolean(h && !active);

  return (
    <div
      role={canSelect ? "button" : undefined}
      tabIndex={canSelect ? 0 : undefined}
      onClick={() => {
        if (canSelect) onSwitch?.(h.id);
      }}
      onKeyDown={(e) => {
        if (canSelect && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          onSwitch?.(h.id);
        }
      }}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        textAlign: "center",
        gap: 10,
        padding: "12px 16px 16px",
        borderRadius: 16,
        background: active && h ? ACTIVE_CARD_BG : "transparent",
        opacity: empty && !ownerPending ? 0.65 : 1,
        cursor: canSelect ? "pointer" : "default",
        outline: "none",
      }}
    >
      {titleNode}

      <div
        style={{
          width: "min(200px, 68vw)",
          display: "flex",
          justifyContent: "center",
          background: empty && !ownerPending ? "#eef4f0" : "transparent",
          borderRadius: empty && !ownerPending ? 16 : 0,
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

      {h && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexWrap: "wrap",
            gap: 8,
          }}
        >
          <span
            style={{
              padding: "3px 10px",
              borderRadius: 999,
              fontSize: 10,
              fontWeight: 800,
              background: slot.kind === "owner" ? GREEN : "#eef4f0",
              color: slot.kind === "owner" ? "#fff" : GREEN,
              lineHeight: 1.3,
            }}
          >
            {roleShort}
          </span>
          {joinedLabel && (
            <span style={{ fontSize: 11, fontWeight: 700, color: MUTED, lineHeight: 1.3, whiteSpace: "nowrap" }}>
              Desde {joinedLabel}
            </span>
          )}
        </div>
      )}

      {emptyHint && (
        <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: "#9ab0a1", lineHeight: 1.35 }}>{emptyHint}</p>
      )}

      {h?.role === "owner" && h.setupStatus === "dormant" && h.isOwn && (
        <button
          type="button"
          onClick={() => onAdvanceSetup?.(h.id, "invite_ready")}
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
          onClick={onJoin}
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
          onClick={onRetry}
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
  readOnly,
  onNav,
  onBack,
  onOpenBiblioteca,
  onRefresh,
  onSwitchHousehold,
  onJoinByToken,
  onRenameHousehold,
  onAdvanceSetup,
  onSignIn,
}) {
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

            <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "center" }}>
              {slots.map((slot) => {
                const isActive = Boolean(slot.household?.id && slot.household.id === effectiveActiveId);
                return (
                  <SlotCard
                    key={slot.kind + (slot.household?.id ?? slot.label)}
                    slot={slot}
                    active={isActive}
                    userLoggedIn={Boolean(user)}
                    householdLoading={householdLoading}
                    onSwitch={onSwitchHousehold}
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
