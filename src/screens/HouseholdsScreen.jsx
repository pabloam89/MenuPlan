import { useMemo, useState } from "react";
import {
  Copy,
  Check,
  LogOut,
  Share2,
  BookOpen,
  CheckCircle2,
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

function buildSlots(households) {
  const owner =
    households.find((h) => h.role === "owner" && h.isOwn) ??
    households.find((h) => h.role === "owner");
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
  members = [],
  showMembers,
  onSwitch,
  onLeave,
  onAdvanceSetup,
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

  return (
    <div
      style={{
        background: "#fff",
        borderRadius: 18,
        border: active ? `2px solid ${GREEN}` : "1.5px solid #e3ebe6",
        padding: 12,
        boxShadow: active ? "0 12px 24px -14px rgba(45,90,61,.4)" : "0 6px 18px -12px rgba(20,47,29,.1)",
        opacity: empty ? 0.68 : 1,
      }}
    >
      <div style={{ display: "flex", gap: 12, alignItems: "stretch" }}>
        {/* Ilustración + badge + activo */}
        <div style={{ width: 92, flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
          <div
            style={{
              width: 72,
              height: 72,
              borderRadius: 16,
              overflow: "hidden",
              border: active ? `2px solid ${GREEN}` : "1.5px solid #e3ebe6",
              background: "#eef4f0",
              filter: empty ? "grayscale(.8)" : "none",
            }}
          >
            <img src={img} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "center top" }} />
          </div>
          <span
            style={{
              padding: "3px 8px",
              borderRadius: 999,
              fontSize: 10,
              fontWeight: 800,
              background: slot.kind === "owner" ? GREEN : "#eef4f0",
              color: slot.kind === "owner" ? "#fff" : GREEN,
              textAlign: "center",
              lineHeight: 1.2,
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
                  gap: 4,
                  padding: "5px 10px",
                  borderRadius: 999,
                  fontSize: 10.5,
                  fontWeight: 800,
                  background: GREEN,
                  color: "#fff",
                  width: "100%",
                  justifyContent: "center",
                  boxSizing: "border-box",
                }}
              >
                <CheckCircle2 size={12} strokeWidth={2.5} />
                Activo
              </span>
            ) : (
              <button
                type="button"
                onClick={() => onSwitch?.(h.id)}
                style={{
                  width: "100%",
                  padding: "5px 8px",
                  borderRadius: 999,
                  border: `1.5px solid ${GREEN}`,
                  background: "#fff",
                  color: GREEN,
                  fontSize: 10.5,
                  fontWeight: 800,
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                Activar
              </button>
            )
          )}
        </div>

        {/* Nombre + estado + acciones */}
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
                fontSize: 15,
                fontWeight: 800,
                border: "1.5px solid #c8ddd0",
                borderRadius: 10,
                padding: "7px 9px",
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
                fontSize: 16,
                fontWeight: 900,
                color: empty ? "#9ab0a1" : INK,
                cursor: h?.role === "owner" ? "pointer" : "default",
                textAlign: "left",
                letterSpacing: "-.3px",
                lineHeight: 1.2,
              }}
            >
              {h?.name ?? slot.label}
            </button>
          )}

          <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 6 }}>
            {statusBadge && (
              <span style={{ fontSize: 10.5, fontWeight: 700, padding: "2px 7px", borderRadius: 999, background: "#fff7e6", color: "#9a6b00" }}>
                {statusBadge}
              </span>
            )}
            {empty && (
              <span style={{ fontSize: 10.5, fontWeight: 700, padding: "2px 7px", borderRadius: 999, background: "#f0f4f1", color: "#7a9485" }}>
                {slot.kind === "owner" ? "Al iniciar sesión" : "Con enlace de invitación"}
              </span>
            )}
          </div>

          {h?.role === "viewer" && (
            <button
              type="button"
              onClick={() => onLeave?.(h.id)}
              style={{
                marginTop: 10,
                alignSelf: "flex-start",
                padding: "7px 10px",
                borderRadius: 10,
                border: "1.5px solid #f0d4d4",
                background: "#fff",
                color: "#b42318",
                fontWeight: 700,
                fontSize: 12,
                cursor: "pointer",
                fontFamily: "inherit",
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
              }}
            >
              <LogOut size={14} />
              Abandonar
            </button>
          )}
          {h?.role === "owner" && h.setupStatus === "dormant" && h.isOwn && (
            <button
              type="button"
              onClick={() => onAdvanceSetup?.(h.id, "invite_ready")}
              style={{
                marginTop: 10,
                alignSelf: "flex-start",
                padding: "7px 10px",
                borderRadius: 10,
                border: "none",
                background: GREEN,
                color: "#fff",
                fontWeight: 700,
                fontSize: 12,
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              Configurar hogar
            </button>
          )}
        </div>

        {/* Miembros (solo hogar activo) */}
        {showMembers && members.length > 0 && (
          <div style={{ flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6, minWidth: 56 }}>
            <p style={{ margin: 0, fontSize: 9.5, fontWeight: 800, color: "#9ab0a1", textTransform: "uppercase", letterSpacing: ".4px" }}>
              Comen
            </p>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
              {members.slice(0, 4).map((m, i) => (
                <div
                  key={m.id}
                  style={{
                    marginTop: i === 0 ? 0 : -8,
                    borderRadius: "50%",
                    border: "2px solid #fff",
                    zIndex: members.length - i,
                    lineHeight: 0,
                    boxShadow: "0 2px 6px rgba(20,47,29,.15)",
                  }}
                >
                  <Avatar name={m.name} photo={memberAvatarThumbSrc(m)} size={30} color={memberAvatarColor(m.id, members)} />
                </div>
              ))}
            </div>
            {members.length > 4 && (
              <span style={{ fontSize: 10, fontWeight: 700, color: "#7a9485" }}>+{members.length - 4}</span>
            )}
          </div>
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
  members = [],
  readOnly,
  canShareInvite,
  inviteUrl,
  onNav,
  onBack,
  onOpenBiblioteca,
  onSwitchHousehold,
  onLeaveHousehold,
  onRenameHousehold,
  onAdvanceSetup,
  onSignIn,
}) {
  const [copied, setCopied] = useState(false);
  const [renamingId, setRenamingId] = useState(null);
  const [renameDraft, setRenameDraft] = useState("");

  const slots = useMemo(() => buildSlots(households), [households]);
  const effectiveActiveId =
    activeHouseholdId ??
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
          padding: `0 18px calc(${bottomNavSpacer()} + 18px)`,
          maxWidth: 420,
          margin: "0 auto",
          width: "100%",
          boxSizing: "border-box",
        }}
      >
        <div
          style={{
            background: MENU_GRADIENT,
            borderRadius: "0 0 26px 26px",
            padding: "20px 18px 22px",
            margin: "0 -18px 18px",
            boxShadow: "0 18px 34px -16px rgba(20,47,29,.55)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <img
              src={IMG_OWNER}
              alt=""
              style={{
                width: 40,
                height: 40,
                borderRadius: 12,
                objectFit: "cover",
                border: "2px solid rgba(255,255,255,.45)",
                flexShrink: 0,
              }}
            />
            <h1 style={{ margin: 0, flex: 1, fontSize: 22, fontWeight: 900, color: "#fff", letterSpacing: "-.4px" }}>
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
                    width: 36,
                    height: 36,
                    borderRadius: 11,
                    border: "1px solid rgba(255,255,255,.35)",
                    background: "rgba(255,255,255,.18)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: "pointer",
                    padding: 0,
                  }}
                >
                  <BookOpen size={17} color="#fff" strokeWidth={2.3} />
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
                    padding: "7px 12px",
                    fontSize: 13,
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
          <div style={{ background: "#fff", border: "1.5px solid #e3ebe6", borderRadius: 16, padding: 16, marginBottom: 16 }}>
            <p style={{ margin: "0 0 12px", fontSize: 14, lineHeight: 1.45 }}>
              Inicia sesión para sincronizar hogares entre dispositivos.
            </p>
            <GoogleButton onClick={onSignIn} />
          </div>
        )}

        {user && (
          <>
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 16 }}>
              {slots.map((slot) => {
                const isActive = slot.household?.id === effectiveActiveId;
                return (
                  <SlotCard
                    key={slot.kind + (slot.household?.id ?? slot.label)}
                    slot={slot}
                    active={isActive}
                    members={members}
                    showMembers={isActive && !!slot.household}
                    onSwitch={onSwitchHousehold}
                    onLeave={onLeaveHousehold}
                    onAdvanceSetup={onAdvanceSetup}
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
              <div style={{ background: "#fff", border: "1.5px solid #e3ebe6", borderRadius: 16, padding: 16, marginBottom: 16 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                  <Share2 size={18} color={GREEN} />
                  <p style={{ margin: 0, fontWeight: 800, fontSize: 15 }}>Compartir hogar</p>
                </div>
                <p style={{ margin: "0 0 12px", fontSize: 13, color: "#5a7262", lineHeight: 1.45 }}>
                  Envía este enlace por WhatsApp. Quien lo abra entrará en solo lectura.
                </p>
                <button
                  type="button"
                  onClick={handleCopyInvite}
                  style={{
                    width: "100%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 8,
                    padding: "12px 14px",
                    borderRadius: 12,
                    border: "none",
                    background: GREEN,
                    color: "#fff",
                    fontWeight: 800,
                    fontSize: 14,
                    cursor: "pointer",
                    fontFamily: "inherit",
                  }}
                >
                  {copied ? <Check size={18} /> : <Copy size={18} />}
                  {copied ? "Enlace copiado" : "Copiar enlace de invitación"}
                </button>
              </div>
            )}

            {readOnly && activeHousehold && (
              <div style={{ background: "#fffdf5", border: "1.5px solid #f5e6b8", borderRadius: 14, padding: 14 }}>
                <p style={{ margin: 0, fontSize: 13, lineHeight: 1.45, color: "#7a5d00" }}>
                  Estás en <strong>{activeHousehold.name}</strong> como visitante (solo lectura).
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
