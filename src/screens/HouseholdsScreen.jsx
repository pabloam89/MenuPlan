import { useMemo, useState } from "react";
import {
  ChevronDown,
  Copy,
  Home,
  LogOut,
  Share2,
  Users,
  Check,
} from "lucide-react";
import { BottomNav, bottomNavSpacer, GoogleButton } from "../components/ui.jsx";
import { googleInfo } from "./Settings.jsx";

const GREEN = "#2d5a3d";
const INK = "#142f1d";
const BG = "#f4f8f5";

function roleLabel(h) {
  if (h.role === "owner") return h.isOwn ? "Tu hogar" : "Propietario";
  return "Solo lectura";
}

function setupBadge(status) {
  if (status === "active") return null;
  if (status === "invite_ready") return "Listo para invitar";
  return "Sin configurar";
}

function Card({ children, style }) {
  return (
    <div style={{ background: "#fff", border: "1.5px solid #e3ebe6", borderRadius: 16, overflow: "hidden", ...style }}>
      {children}
    </div>
  );
}

export function HouseholdsScreen({
  user,
  households = [],
  activeHousehold,
  activeHouseholdId,
  readOnly,
  canShareInvite,
  inviteUrl,
  onNav,
  onSwitchHousehold,
  onLeaveHousehold,
  onRenameHousehold,
  onAdvanceSetup,
  onSignIn,
  personalRecipes = [],
  personalFavoriteCount = 0,
}) {
  const [copied, setCopied] = useState(false);
  const [renamingId, setRenamingId] = useState(null);
  const [renameDraft, setRenameDraft] = useState("");

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

  const commitRename = async () => {
    if (!renamingId || !renameDraft.trim()) {
      setRenamingId(null);
      return;
    }
    await onRenameHousehold?.(renamingId, renameDraft.trim());
    setRenamingId(null);
  };

  return (
    <div style={{ minHeight: "100dvh", background: BG, color: INK }}>
      <div style={{ padding: "20px 18px 0", maxWidth: 480, margin: "0 auto" }}>
        <h1 style={{ margin: 0, fontSize: 26, fontWeight: 900, letterSpacing: "-.5px" }}>Hogares</h1>
        <p style={{ margin: "6px 0 0", fontSize: 14, color: "#5a7262", lineHeight: 1.45 }}>
          Cambia de hogar, invita a tu familia o revisa tu biblioteca personal.
        </p>

        {!user && (
          <Card style={{ marginTop: 20, padding: 16 }}>
            <p style={{ margin: "0 0 12px", fontSize: 14, lineHeight: 1.45 }}>
              Inicia sesión para sincronizar hogares entre dispositivos.
            </p>
            <GoogleButton onClick={onSignIn} />
          </Card>
        )}

        {user && (
          <>
            <div style={{ marginTop: 20, display: "flex", flexDirection: "column", gap: 10 }}>
              {households.map((h) => {
                const active = h.id === activeHouseholdId;
                const badge = setupBadge(h.setupStatus);
                return (
                  <Card key={h.id} style={{ padding: 14 }}>
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                      <div
                        style={{
                          width: 42,
                          height: 42,
                          borderRadius: 12,
                          background: active ? GREEN : "#e6f3ea",
                          color: active ? "#fff" : GREEN,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          flexShrink: 0,
                        }}
                      >
                        {h.role === "owner" ? <Home size={20} /> : <Users size={20} />}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        {renamingId === h.id ? (
                          <input
                            value={renameDraft}
                            onChange={(e) => setRenameDraft(e.target.value)}
                            onBlur={commitRename}
                            onKeyDown={(e) => e.key === "Enter" && commitRename()}
                            autoFocus
                            style={{
                              width: "100%",
                              fontSize: 16,
                              fontWeight: 800,
                              border: "1.5px solid #c8ddd0",
                              borderRadius: 10,
                              padding: "8px 10px",
                              fontFamily: "inherit",
                            }}
                          />
                        ) : (
                          <button
                            type="button"
                            onClick={() => h.role === "owner" && startRename(h)}
                            style={{
                              margin: 0,
                              padding: 0,
                              border: "none",
                              background: "transparent",
                              font: "inherit",
                              fontSize: 16,
                              fontWeight: 800,
                              color: INK,
                              cursor: h.role === "owner" ? "pointer" : "default",
                              textAlign: "left",
                            }}
                          >
                            {h.name}
                          </button>
                        )}
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
                          <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 8px", borderRadius: 999, background: "#eef4f0", color: GREEN }}>
                            {roleLabel(h)}
                          </span>
                          {badge && (
                            <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 8px", borderRadius: 999, background: "#fff7e6", color: "#9a6b00" }}>
                              {badge}
                            </span>
                          )}
                          {active && (
                            <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 8px", borderRadius: 999, background: "#e6f3ea", color: GREEN }}>
                              Activo
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
                      {!active && (
                        <button
                          type="button"
                          onClick={() => onSwitchHousehold?.(h.id)}
                          style={{
                            flex: 1,
                            minWidth: 120,
                            padding: "10px 12px",
                            borderRadius: 12,
                            border: "1.5px solid #c8ddd0",
                            background: "#fff",
                            fontWeight: 700,
                            fontSize: 13,
                            cursor: "pointer",
                            fontFamily: "inherit",
                          }}
                        >
                          Usar este hogar
                        </button>
                      )}
                      {h.role === "viewer" && (
                        <button
                          type="button"
                          onClick={() => onLeaveHousehold?.(h.id)}
                          style={{
                            padding: "10px 12px",
                            borderRadius: 12,
                            border: "1.5px solid #f0d4d4",
                            background: "#fff",
                            color: "#b42318",
                            fontWeight: 700,
                            fontSize: 13,
                            cursor: "pointer",
                            fontFamily: "inherit",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 6,
                          }}
                        >
                          <LogOut size={15} />
                          Abandonar
                        </button>
                      )}
                      {h.role === "owner" && h.setupStatus === "dormant" && h.isOwn && (
                        <button
                          type="button"
                          onClick={() => onAdvanceSetup?.(h.id, "invite_ready")}
                          style={{
                            flex: 1,
                            minWidth: 120,
                            padding: "10px 12px",
                            borderRadius: 12,
                            border: "none",
                            background: GREEN,
                            color: "#fff",
                            fontWeight: 700,
                            fontSize: 13,
                            cursor: "pointer",
                            fontFamily: "inherit",
                          }}
                        >
                          Configurar hogar
                        </button>
                      )}
                    </div>
                  </Card>
                );
              })}
            </div>

            {canShareInvite && inviteUrl && (
              <Card style={{ marginTop: 16, padding: 16 }}>
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
              </Card>
            )}

            {readOnly && activeHousehold && (
              <Card style={{ marginTop: 16, padding: 14, background: "#fffdf5", borderColor: "#f5e6b8" }}>
                <p style={{ margin: 0, fontSize: 13, lineHeight: 1.45, color: "#7a5d00" }}>
                  Estás en <strong>{activeHousehold.name}</strong> en modo solo lectura.
                </p>
              </Card>
            )}

            <div style={{ marginTop: 24 }}>
              <h2 style={{ margin: "0 0 10px", fontSize: 18, fontWeight: 900 }}>Tu biblioteca</h2>
              <Card>
                <div style={{ padding: "14px 16px", borderBottom: "1px solid #eef2ef" }}>
                  <p style={{ margin: 0, fontWeight: 800 }}>Mis favoritas personales</p>
                  <p style={{ margin: "4px 0 0", fontSize: 12, color: "#5a7262" }}>
                    {personalFavoriteCount} recetas guardadas
                  </p>
                </div>
                <div style={{ padding: "14px 16px" }}>
                  <p style={{ margin: 0, fontWeight: 800 }}>Mis recetas creadas</p>
                  <p style={{ margin: "4px 0 0", fontSize: 12, color: "#5a7262" }}>
                    {personalRecipes.length} recetas
                  </p>
                </div>
              </Card>
            </div>

            <Card style={{ marginTop: 16, padding: 14, marginBottom: 24 }}>
              <p style={{ margin: "0 0 4px", fontSize: 12, color: "#5a7262" }}>Cuenta</p>
              <p style={{ margin: 0, fontWeight: 700, fontSize: 14 }}>{googleInfo(user)?.name ?? user.email}</p>
            </Card>
          </>
        )}
      </div>
      <div style={bottomNavSpacer} />
      <BottomNav active="dashboard" onNav={onNav} />
    </div>
  );
}

export function HouseholdSwitcher({ households, activeHousehold, onOpenHouseholds, onSwitchHousehold }) {
  const [open, setOpen] = useState(false);
  if (!households?.length || !activeHousehold) return null;

  return (
    <div style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => (households.length > 1 ? setOpen((v) => !v) : onOpenHouseholds?.())}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          padding: "6px 10px",
          borderRadius: 999,
          border: "1.5px solid rgba(255,255,255,.35)",
          background: "rgba(255,255,255,.14)",
          color: "#fff",
          fontWeight: 700,
          fontSize: 12,
          cursor: "pointer",
          fontFamily: "inherit",
          maxWidth: 180,
        }}
      >
        <Home size={14} />
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {activeHousehold.name}
        </span>
        {households.length > 1 && <ChevronDown size={14} />}
      </button>
      {open && (
        <>
          <div role="presentation" onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 40 }} />
          <div
            style={{
              position: "absolute",
              top: "calc(100% + 8px)",
              left: 0,
              zIndex: 50,
              minWidth: 220,
              background: "#fff",
              border: "1.5px solid #e3ebe6",
              borderRadius: 14,
              boxShadow: "0 12px 32px -12px rgba(20,47,29,.35)",
              overflow: "hidden",
            }}
          >
            {households.map((h) => (
              <button
                key={h.id}
                type="button"
                onClick={() => {
                  setOpen(false);
                  if (h.id !== activeHousehold.id) onSwitchHousehold?.(h.id);
                }}
                style={{
                  display: "block",
                  width: "100%",
                  padding: "12px 14px",
                  border: "none",
                  borderBottom: "1px solid #f0f4f1",
                  background: h.id === activeHousehold.id ? "#f4f8f5" : "#fff",
                  textAlign: "left",
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                <span style={{ display: "block", fontWeight: 800, fontSize: 14, color: INK }}>{h.name}</span>
                <span style={{ display: "block", marginTop: 2, fontSize: 11, fontWeight: 600, color: "#5a7262" }}>
                  {roleLabel(h)}
                </span>
              </button>
            ))}
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onOpenHouseholds?.();
              }}
              style={{
                display: "block",
                width: "100%",
                padding: "12px 14px",
                border: "none",
                background: "#fff",
                textAlign: "left",
                cursor: "pointer",
                fontFamily: "inherit",
                fontWeight: 700,
                fontSize: 13,
                color: GREEN,
              }}
            >
              Gestionar hogares…
            </button>
          </div>
        </>
      )}
    </div>
  );
}
