import { useMemo, useRef } from "react";
import {
  ChevronRight,
  ChevronLeft,
  User,
  SlidersHorizontal,
  Info,
  RotateCcw,
  Users,
  Flame,
  Heart,
  Camera,
  LogOut,
  UtensilsCrossed,
  Ban,
  Wrench,
  Pencil,
  LayoutDashboard,
} from "lucide-react";
import {
  BottomNav,
  Avatar,
  GoogleButton,
  bottomNavSpacer,
} from "../components/ui.jsx";
import { memberAvatarColor, stageLabel, migrateHomeRole } from "../lib/stages.js";
import { computeStreak } from "../lib/menuStats.js";
import { INTOLERANCE_RULES } from "../lib/intolerances.js";

const PAGE_BG = "#f7f9f7";
const GREEN = "#2d5a3d";
const INK = "#142f1d";

const pageTitle = {
  fontSize: 26,
  fontWeight: 900,
  color: INK,
  margin: 0,
  letterSpacing: "-.7px",
};

export function googleInfo(user) {
  const meta = user?.user_metadata ?? {};
  return {
    photo: meta.avatar_url ?? meta.picture ?? null,
    name: meta.full_name ?? meta.name ?? user?.email?.split("@")[0] ?? "Invitado",
    email: user?.email ?? null,
    createdAt: user?.created_at ?? null,
  };
}

// ── Section primitives ────────────────────────────────────────────

function SectionTitle({ icon: Icon, children, action }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        margin: "0 4px 8px",
      }}
    >
      <span style={{ display: "flex", alignItems: "center", gap: 7 }}>
        {Icon && <Icon size={16} color={GREEN} strokeWidth={2.4} />}
        <span style={{ fontSize: 14, fontWeight: 800, color: GREEN, letterSpacing: "-.2px" }}>
          {children}
        </span>
      </span>
      {action}
    </div>
  );
}

function Card({ children, style }) {
  return (
    <div
      style={{
        background: "#fff",
        border: "2px solid #2d5a3d",
        borderRadius: 16,
        padding: 14,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function editLink(onClick) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        border: "none",
        background: "transparent",
        color: GREEN,
        fontSize: 13,
        fontWeight: 700,
        cursor: "pointer",
        fontFamily: "inherit",
        padding: 0,
      }}
    >
      <Pencil size={13} /> Editar
    </button>
  );
}

function Chips({ items, empty }) {
  if (!items || items.length === 0) {
    return <p style={{ margin: 0, fontSize: 13, color: "#9aa89e" }}>{empty}</p>;
  }
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
      {items.map((it, i) => (
        <span
          key={i}
          style={{
            padding: "5px 11px",
            borderRadius: 20,
            fontSize: 12,
            fontWeight: 600,
            background: "rgba(45,90,61,.08)",
            color: GREEN,
            border: "1.5px solid rgba(45,90,61,.18)",
          }}
        >
          {it}
        </span>
      ))}
    </div>
  );
}

// ── Avatar photo helper ───────────────────────────────────────────

function fileToAvatarDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const S = 160;
        const canvas = document.createElement("canvas");
        canvas.width = S;
        canvas.height = S;
        const ctx = canvas.getContext("2d");
        const scale = Math.max(S / img.width, S / img.height);
        const w = img.width * scale;
        const h = img.height * scale;
        ctx.drawImage(img, (S - w) / 2, (S - h) / 2, w, h);
        resolve(canvas.toDataURL("image/jpeg", 0.82));
      };
      img.onerror = reject;
      img.src = reader.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ── Menu streak ───────────────────────────────────────────────────
// (computeStreak now lives in lib/menuStats.js so the dashboard can reuse it)

function formatDate(ts) {
  if (!ts) return "—";
  return new Date(ts).toLocaleDateString("es-ES", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

// ── Settings screen (the list) ────────────────────────────────────

export function SettingsScreen({
  user,
  data,
  setData,
  onNav,
  onOpenAccount,
  onOpenDashboard,
  onEditPreferences,
  onSignIn,
  onReset,
}) {
  const g = googleInfo(user);
  const rowStyle = {
    display: "flex",
    alignItems: "center",
    gap: 12,
    width: "100%",
    padding: "14px 14px",
    border: "none",
    borderBottom: "1px solid #eef2ef",
    background: "transparent",
    cursor: "pointer",
    fontFamily: "inherit",
    textAlign: "left",
  };

  return (
    <div style={{ background: PAGE_BG, minHeight: "100dvh" }}>
      <div
        style={{
          padding: "20px 16px 0",
          paddingBottom: `calc(${bottomNavSpacer()} + 12px)`,
        }}
      >
        <h2 style={{ ...pageTitle, marginBottom: 18 }}>Ajustes</h2>

        {/* Profile / login card */}
        {user ? (
          <button
            type="button"
            onClick={onOpenAccount}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 14,
              width: "100%",
              padding: 16,
              borderRadius: 18,
              border: "2px solid #2d5a3d",
              background: "#fff",
              cursor: "pointer",
              fontFamily: "inherit",
              marginBottom: 22,
              textAlign: "left",
            }}
          >
            <Avatar name={g.name} photo={g.photo} size={52} color={GREEN} />
            <span style={{ flex: 1, minWidth: 0 }}>
              <span
                style={{
                  display: "block",
                  fontSize: 16,
                  fontWeight: 800,
                  color: INK,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {g.name}
              </span>
              <span
                style={{
                  display: "block",
                  fontSize: 13,
                  color: "#7a8a7f",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {g.email ?? "Ver mi cuenta y perfil"}
              </span>
            </span>
            <ChevronRight size={20} color="#9ab0a1" />
          </button>
        ) : (
          <div
            style={{
              padding: 18,
              borderRadius: 18,
              border: "2px solid #2d5a3d",
              background: "#fff",
              marginBottom: 22,
            }}
          >
            <p style={{ margin: "0 0 4px", fontSize: 16, fontWeight: 800, color: INK }}>
              Guarda tu menú en la nube
            </p>
            <p style={{ margin: "0 0 14px", fontSize: 13, color: "#7a8a7f", lineHeight: 1.5 }}>
              Inicia sesión para sincronizar tu familia y tus menús en todos tus dispositivos.
            </p>
            <GoogleButton onClick={onSignIn} />
          </div>
        )}

        {/* Settings list */}
        <div
          style={{
            background: "#fff",
            border: "1.5px solid #e5ebe7",
            borderRadius: 16,
            overflow: "hidden",
            marginBottom: 16,
          }}
        >
          {user && onOpenDashboard && (
            <button type="button" style={rowStyle} onClick={onOpenDashboard}>
              <LayoutDashboard size={19} color={GREEN} />
              <span style={{ flex: 1, fontSize: 15, fontWeight: 600, color: INK }}>
                Tu panel
              </span>
              <ChevronRight size={18} color="#9ab0a1" />
            </button>
          )}
          {user && (
            <button type="button" style={rowStyle} onClick={onOpenAccount}>
              <User size={19} color={GREEN} />
              <span style={{ flex: 1, fontSize: 15, fontWeight: 600, color: INK }}>
                Mi cuenta y perfil
              </span>
              <ChevronRight size={18} color="#9ab0a1" />
            </button>
          )}
          <button type="button" style={rowStyle} onClick={onEditPreferences}>
            <SlidersHorizontal size={19} color={GREEN} />
            <span style={{ flex: 1, fontSize: 15, fontWeight: 600, color: INK }}>
              Editar preferencias
            </span>
            <ChevronRight size={18} color="#9ab0a1" />
          </button>
          <div style={{ ...rowStyle, borderBottom: "none", cursor: "default" }}>
            <Info size={19} color={GREEN} />
            <span style={{ flex: 1, fontSize: 15, fontWeight: 600, color: INK }}>
              MenúPlan
            </span>
            <span style={{ fontSize: 13, color: "#9ab0a1", fontWeight: 600 }}>v1.0</span>
          </div>
        </div>

        {/* Reset */}
        <button
          type="button"
          onClick={onReset}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            width: "100%",
            padding: "14px",
            borderRadius: 14,
            border: "1.5px solid #f0d0cc",
            background: "#fff",
            color: "#c0392b",
            fontSize: 14,
            fontWeight: 800,
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          <RotateCcw size={16} /> Reiniciar todos los datos
        </button>
      </div>

      <BottomNav active="settings" onNav={onNav} />
    </div>
  );
}

// ── Account screen (rich profile) ─────────────────────────────────

export function AccountScreen({
  user,
  data,
  setData,
  menuPlan,
  setMenuPlan,
  onNav,
  onBack,
  onEditMembers,
  onEditPreferences,
  onSignIn,
  onSignOut,
  onToast,
}) {
  const g = googleInfo(user);
  const fileInputRef = useRef(null);
  const pendingMemberId = useRef(null);

  const members = data.members ?? [];
  const history = data.menuHistory ?? [];
  const streak = useMemo(() => computeStreak(history), [history]);
  const lastMenuAt = history.length ? history[history.length - 1].at : null;

  const kitchenTools = useMemo(
    () => [...(data.kitchenTools ?? []), ...(data.customKitchenTools ?? [])],
    [data.kitchenTools, data.customKitchenTools],
  );
  const allergies = useMemo(
    () => Array.from(new Set(members.flatMap((m) => m.allergies ?? []))),
    [members],
  );
  // Intolerances (lactosa_fina/fructosa/sorbitol) live on member.intolerances,
  // a separate field from member.allergies (see Onboarding.jsx's
  // INTOLERANCE_UI) — a member with ONLY an intolerance used to show "Ninguna
  // alergia registrada" here even though it's saved and respected by the
  // menu generator, since this card never read that field.
  const intolerances = useMemo(
    () =>
      Array.from(new Set(members.flatMap((m) => m.intolerances ?? [])))
        .map((id) => INTOLERANCE_RULES[id]?.label ?? id),
    [members],
  );
  const dislikes = useMemo(
    () => Array.from(new Set([...(data.dislikes ?? []), ...members.flatMap((m) => m.dislikes ?? [])])),
    [data.dislikes, members],
  );

  const menuDays = Object.keys(menuPlan ?? {}).length
    ? Object.values(menuPlan).reduce(
        (max, slots) => Math.max(max, new Set(Object.keys(slots).map((k) => k.split("-")[0])).size),
        0,
      )
    : 0;
  const hasMenu = menuDays > 0;
  const favorite = data.favoriteMenu ?? null;

  const openPhotoPicker = (memberId) => {
    pendingMemberId.current = memberId;
    fileInputRef.current?.click();
  };

  const onPhotoSelected = async (e) => {
    const file = e.target.files?.[0];
    const memberId = pendingMemberId.current;
    e.target.value = "";
    if (!file || !memberId) return;
    try {
      const dataUrl = await fileToAvatarDataUrl(file);
      setData((d) => ({
        ...d,
        members: d.members.map((m) => (m.id === memberId ? { ...m, photo: dataUrl } : m)),
      }));
      onToast?.("Foto actualizada");
    } catch {
      onToast?.("No se pudo cargar la foto");
    }
  };

  const saveFavorite = () => {
    setData((d) => ({
      ...d,
      favoriteMenu: { savedAt: Date.now(), days: menuDays, plan: menuPlan },
    }));
    onToast?.("Menú guardado como favorito");
  };

  const restoreFavorite = () => {
    if (!favorite?.plan) return;
    setMenuPlan(favorite.plan);
    onToast?.("Menú favorito restaurado");
    onNav("menu");
  };

  const removeFavorite = () => {
    setData((d) => ({ ...d, favoriteMenu: null }));
    onToast?.("Favorito eliminado");
  };

  return (
    <div style={{ background: PAGE_BG, minHeight: "100dvh" }}>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={onPhotoSelected}
        style={{ display: "none" }}
      />

      <div
        style={{
          padding: "16px 16px 0",
          paddingBottom: `calc(${bottomNavSpacer()} + 12px)`,
        }}
      >
        {/* Header bar */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
          <button
            type="button"
            onClick={onBack}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              padding: "8px 12px",
              borderRadius: 10,
              border: "1.5px solid #2d5a3d",
              background: "#fff",
              color: GREEN,
              fontSize: 13,
              fontWeight: 700,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            <ChevronLeft size={16} /> Atrás
          </button>
          <h2 style={{ ...pageTitle, fontSize: 22 }}>Mi cuenta</h2>
        </div>

        {/* ① Profile header */}
        {user ? (
          <Card style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 22 }}>
            <Avatar name={g.name} photo={g.photo} size={60} color={GREEN} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 18, fontWeight: 800, color: INK, lineHeight: 1.2 }}>
                {g.name}
              </div>
              {g.email && (
                <div
                  style={{
                    fontSize: 13,
                    color: "#7a8a7f",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {g.email}
                </div>
              )}
              <span
                style={{
                  display: "inline-block",
                  marginTop: 6,
                  padding: "2px 10px",
                  borderRadius: 20,
                  fontSize: 11,
                  fontWeight: 800,
                  background: "rgba(45,90,61,.1)",
                  color: GREEN,
                }}
              >
                Plan Free
              </span>
            </div>
          </Card>
        ) : (
          <Card style={{ marginBottom: 22 }}>
            <p style={{ margin: "0 0 12px", fontSize: 14, color: "#7a8a7f", lineHeight: 1.5 }}>
              Inicia sesión para guardar tu perfil y tus menús.
            </p>
            <GoogleButton onClick={onSignIn} />
          </Card>
        )}

        {/* ② Tu familia */}
        <div style={{ marginBottom: 22 }}>
          <SectionTitle icon={Users} action={editLink(onEditMembers)}>
            Tu familia
          </SectionTitle>
          <Card style={{ padding: 4 }}>
            {members.length === 0 ? (
              <p style={{ margin: 0, padding: 14, fontSize: 13, color: "#9aa89e" }}>
                Aún no has añadido a nadie.
              </p>
            ) : (
              members.map((m, i) => (
                <div
                  key={m.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: "10px 12px",
                    borderBottom: i < members.length - 1 ? "1px solid #eef2ef" : "none",
                  }}
                >
                  <button
                    type="button"
                    onClick={() => openPhotoPicker(m.id)}
                    title="Cambiar foto"
                    style={{
                      position: "relative",
                      border: "none",
                      background: "transparent",
                      padding: 0,
                      cursor: "pointer",
                      lineHeight: 0,
                      flexShrink: 0,
                    }}
                  >
                    <Avatar
                      name={m.name}
                      photo={m.photo}
                      size={42}
                      color={memberAvatarColor(m.id, members)}
                    />
                    <span
                      style={{
                        position: "absolute",
                        right: -2,
                        bottom: -2,
                        width: 18,
                        height: 18,
                        borderRadius: "50%",
                        background: GREEN,
                        border: "2px solid #fff",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Camera size={9} color="#fff" />
                    </span>
                  </button>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 15, fontWeight: 700, color: INK }}>{m.name}</div>
                    <div style={{ fontSize: 12, color: "#7a8a7f" }}>
                      {stageLabel(m)} · {migrateHomeRole(m.homeRole ?? "Adulto")}
                    </div>
                  </div>
                </div>
              ))
            )}
          </Card>
        </div>

        {/* ③ Preferencias activas */}
        <div style={{ marginBottom: 22 }}>
          <SectionTitle icon={SlidersHorizontal} action={editLink(onEditPreferences)}>
            Tus preferencias
          </SectionTitle>
          <Card style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                <Ban size={14} color={GREEN} />
                <span style={{ fontSize: 13, fontWeight: 700, color: INK }}>Alergias</span>
              </div>
              <Chips items={allergies} empty="Ninguna alergia registrada" />
            </div>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                <Ban size={14} color={GREEN} />
                <span style={{ fontSize: 13, fontWeight: 700, color: INK }}>Intolerancias</span>
              </div>
              <Chips items={intolerances} empty="Ninguna intolerancia registrada" />
            </div>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                <UtensilsCrossed size={14} color={GREEN} />
                <span style={{ fontSize: 13, fontWeight: 700, color: INK }}>Alimentos a evitar</span>
              </div>
              <Chips items={dislikes} empty="Nada que evitar" />
            </div>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                <Wrench size={14} color={GREEN} />
                <span style={{ fontSize: 13, fontWeight: 700, color: INK }}>Herramientas</span>
              </div>
              <Chips items={kitchenTools} empty="Sin herramientas seleccionadas" />
            </div>
          </Card>
        </div>

        {/* ④ Racha de menús */}
        <div style={{ marginBottom: 22 }}>
          <SectionTitle icon={Flame}>Racha de menús</SectionTitle>
          <Card style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: 16,
                background: "linear-gradient(135deg, #2d5a3d 0%, #4cba6e 100%)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <Flame size={26} color="#fff" />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 16, fontWeight: 800, color: INK }}>
                {streak > 0
                  ? `${streak} ${streak === 1 ? "semana" : "semanas"} seguidas`
                  : "Sin racha todavía"}
              </div>
              <div style={{ fontSize: 13, color: "#7a8a7f", marginTop: 2 }}>
                {history.length} {history.length === 1 ? "menú generado" : "menús generados"} ·
                último {formatDate(lastMenuAt)}
              </div>
            </div>
          </Card>
        </div>

        {/* ⑤ Menú favorito */}
        <div style={{ marginBottom: 22 }}>
          <SectionTitle icon={Heart}>Menú favorito</SectionTitle>
          <Card>
            {favorite ? (
              <>
                <div style={{ fontSize: 14, fontWeight: 700, color: INK }}>
                  Guardado el {formatDate(favorite.savedAt)}
                </div>
                <div style={{ fontSize: 13, color: "#7a8a7f", margin: "2px 0 14px" }}>
                  {favorite.days} {favorite.days === 1 ? "día" : "días"} de menú
                </div>
                <div style={{ display: "flex", gap: 10 }}>
                  <button
                    type="button"
                    onClick={restoreFavorite}
                    style={{
                      flex: 1,
                      padding: "12px",
                      borderRadius: 12,
                      border: "none",
                      background: GREEN,
                      color: "#fff",
                      fontSize: 14,
                      fontWeight: 800,
                      cursor: "pointer",
                      fontFamily: "inherit",
                    }}
                  >
                    Restaurar
                  </button>
                  <button
                    type="button"
                    onClick={removeFavorite}
                    style={{
                      padding: "12px 16px",
                      borderRadius: 12,
                      border: "1.5px solid #e5ebe7",
                      background: "#fff",
                      color: "#7a8a7f",
                      fontSize: 14,
                      fontWeight: 700,
                      cursor: "pointer",
                      fontFamily: "inherit",
                    }}
                  >
                    Quitar
                  </button>
                </div>
              </>
            ) : (
              <>
                <p style={{ margin: "0 0 14px", fontSize: 13, color: "#7a8a7f", lineHeight: 1.5 }}>
                  Guarda el menú que más te guste para recuperarlo cuando quieras.
                </p>
                <button
                  type="button"
                  onClick={saveFavorite}
                  disabled={!hasMenu}
                  style={{
                    width: "100%",
                    padding: "12px",
                    borderRadius: 12,
                    border: "1.5px solid #c8ddd0",
                    background: "#fff",
                    color: hasMenu ? GREEN : "#b5c4ba",
                    fontSize: 14,
                    fontWeight: 800,
                    cursor: hasMenu ? "pointer" : "not-allowed",
                    fontFamily: "inherit",
                  }}
                >
                  {hasMenu ? "Guardar menú actual como favorito" : "Genera un menú primero"}
                </button>
              </>
            )}
          </Card>
        </div>

        {/* ⑦ Cuenta / sesión */}
        {user && (
          <div style={{ marginBottom: 8 }}>
            <SectionTitle icon={User}>Cuenta</SectionTitle>
            <Card style={{ padding: 0 }}>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "13px 14px", borderBottom: "1px solid #eef2ef" }}>
                <span style={{ fontSize: 13, color: "#7a8a7f" }}>Email</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: INK }}>{g.email}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "13px 14px" }}>
                <span style={{ fontSize: 13, color: "#7a8a7f" }}>Miembro desde</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: INK }}>{formatDate(g.createdAt ? new Date(g.createdAt).getTime() : null)}</span>
              </div>
            </Card>
            <button
              type="button"
              onClick={onSignOut}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                width: "100%",
                marginTop: 12,
                padding: "14px",
                borderRadius: 14,
                border: "1.5px solid #f0d0cc",
                background: "#fff",
                color: "#c0392b",
                fontSize: 14,
                fontWeight: 800,
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              <LogOut size={16} /> Cerrar sesión
            </button>
          </div>
        )}
      </div>

      <BottomNav active="settings" onNav={onNav} />
    </div>
  );
}
