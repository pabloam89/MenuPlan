import { useRef, useState } from "react";
import {
  ChevronRight,
  ChevronDown,
  ChevronUp,
  User,
  Users,
  BookOpen,
  SlidersHorizontal,
  Globe,
  Users2,
  Lock,
  LogOut,
  Camera,
  Plus,
  Check,
  ShoppingBasket,
  Info,
  Trash2,
  UserX,
  BookOpenCheck,
  ChefHat,
  Sparkles,
  Settings as SettingsIcon,
} from "lucide-react";
import { Avatar, BottomNav, bottomNavSpacer, GoogleButton } from "../components/ui.jsx";
import { googleInfo } from "./Settings.jsx";
import { memberAvatarColor, migrateHomeRole } from "../lib/stages.js";
import { CookTimeEditor } from "../components/CookTimeEditor.jsx";

const GREEN = "#2d5a3d";
const INK = "#142f1d";
const BG = "#f4f8f5";

// ── Avatar photo upload ─────────────────────────────────────────────────────

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const S = 160;
        const canvas = document.createElement("canvas");
        canvas.width = S; canvas.height = S;
        const ctx = canvas.getContext("2d");
        const scale = Math.max(S / img.width, S / img.height);
        const w = img.width * scale, h = img.height * scale;
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

// ── Primitives ─────────────────────────────────────────────────────────────

function Card({ children, style }) {
  return (
    <div style={{ background: "#fff", border: "1.5px solid #e3ebe6", borderRadius: 16, overflow: "hidden", ...style }}>
      {children}
    </div>
  );
}

// ── Segmented option card (no subcopy) ────────────────────────────────────

function SegOpt({ id, icon: Icon, label, color, bg, border, active, onClick }) {
  return (
    <button
      type="button"
      onClick={() => onClick(id)}
      style={{
        flex: 1, display: "flex", flexDirection: "column", alignItems: "center",
        gap: 6, padding: "12px 6px", borderRadius: 13, cursor: "pointer",
        fontFamily: "inherit", border: `1.5px solid ${active ? border : "#eef3f0"}`,
        background: active ? bg : "#fafcfa", transition: "all .15s",
        position: "relative",
      }}
    >
      <Icon size={18} color={active ? color : "#9ab0a1"} />
      <span style={{ fontSize: 11, fontWeight: 800, color: active ? color : "#7a9485", lineHeight: 1.2, textAlign: "center" }}>
        {label}
      </span>
      {active && (
        <span style={{
          position: "absolute", top: 5, right: 5,
          width: 14, height: 14, borderRadius: 99, background: color,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <Check size={8} color="#fff" strokeWidth={3} />
        </span>
      )}
    </button>
  );
}

// ── Recipe mode options ────────────────────────────────────────────────────

const RECIPE_MODES = [
  { id: "preferred", icon: BookOpen,  label: "Preferir las mías", color: "#2d5a3d", bg: "#e6f3ea", border: "#a8d5b5" },
  { id: "only",      icon: Users2,    label: "Solo las mías",     color: "#7a4e00", bg: "#fff8e7", border: "#f0d090" },
  { id: "catalog",   icon: Globe,     label: "Solo catálogo",     color: "#5a2d7a", bg: "#f5edfc", border: "#c9a0e8" },
];

const VIS_MODES = [
  { id: "public",  icon: Globe,   label: "Pública",  color: "#2d5a3d", bg: "#e6f3ea", border: "#a8d5b5" },
  { id: "friends", icon: Users2,  label: "Amigos",   color: "#7a4e00", bg: "#fff8e7", border: "#f0d090" },
  { id: "private", icon: Lock,    label: "Privada",  color: "#5a2d7a", bg: "#f5edfc", border: "#c9a0e8" },
];

// ── Collapsible section with optional action button in header ──────────────

function Section({ iconEl, iconColor = GREEN, iconBg = "#e6f3ea", title, defaultOpen = false, action, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ marginBottom: 14 }}>
      <div
        style={{
          display: "flex", alignItems: "center", gap: 0,
          background: "#fff", border: "1.5px solid #e3ebe6",
          borderRadius: open ? "14px 14px 0 0" : 14,
          borderBottom: open ? "1.5px solid #f0f4f1" : "1.5px solid #e3ebe6",
          overflow: "hidden",
        }}
      >
        {/* Tap area for expand/collapse */}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          style={{
            flex: 1, display: "flex", alignItems: "center", gap: 10,
            padding: "14px 0 14px 14px", border: "none", background: "transparent",
            cursor: "pointer", fontFamily: "inherit", textAlign: "left", minWidth: 0,
          }}
        >
          <div style={{
            width: 34, height: 34, borderRadius: 10, background: iconBg, flexShrink: 0,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            {iconEl}
          </div>
          <p style={{ margin: 0, fontSize: 14, fontWeight: 800, color: INK, flex: 1, minWidth: 0 }}>{title}</p>
        </button>

        {/* Optional action button (e.g. Gestionar) */}
        {action && (
          <div style={{ paddingRight: 8, flexShrink: 0 }}>
            {action}
          </div>
        )}

        {/* Chevron toggle */}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          style={{
            border: "none", background: "transparent", cursor: "pointer",
            padding: "0 14px 0 4px", height: "100%", display: "flex", alignItems: "center",
          }}
        >
          {open
            ? <ChevronUp size={16} color="#9ab0a1" />
            : <ChevronDown size={16} color="#9ab0a1" />
          }
        </button>
      </div>

      {open && (
        <div style={{
          background: "#fff", border: "1.5px solid #e3ebe6", borderTop: "none",
          borderRadius: "0 0 14px 14px", padding: "14px 16px",
        }}>
          {children}
        </div>
      )}
    </div>
  );
}

// ── Member read-only card (no delete, as in the settings view) ────────────

function MemberCard({ member, allMembers }) {
  const age = member.useBirthDate
    ? null
    : Number.isFinite(member.age) ? member.age : parseInt(member.age, 10) || null;
  const role = migrateHomeRole(member.homeRole ?? "Adulto");

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 12,
      padding: "11px 14px", background: "#fff",
      border: "1.5px solid #e3ebe6", borderRadius: 13,
      boxShadow: "0 1px 4px rgba(20,47,29,.06)",
    }}>
      <Avatar name={member.name} photo={member.photo} size={40} color={memberAvatarColor(member.id, allMembers)} />

      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ margin: 0, fontSize: 14, fontWeight: 800, color: INK, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {member.name}
        </p>
        {age != null && (
          <p style={{ margin: "2px 0 0", fontSize: 12, fontWeight: 600, color: "#7a9485" }}>
            {age} {age === 1 ? "año" : "años"}
          </p>
        )}
      </div>

      <span style={{
        padding: "4px 11px", borderRadius: 20, fontSize: 12, fontWeight: 700,
        background: "#f0f7f2", color: GREEN, border: "1px solid #cde8d6", flexShrink: 0,
      }}>
        {role}
      </span>
    </div>
  );
}

// ── Label with divider ─────────────────────────────────────────────────────

function FieldLabel({ children }) {
  return (
    <p style={{ margin: "0 0 9px", fontSize: 12, fontWeight: 700, color: "#5a7066", letterSpacing: ".1px" }}>
      {children}
    </p>
  );
}

// ── Main screen ─────────────────────────────────────────────────────────────

export function HomeProfileScreen({
  user,
  data,
  setData,
  onNav,
  onSignIn,
  onSignOut,
  onReset,
  onDeleteAccount,
  onEditMembers,
  onOpenPantry,
}) {
  const g = googleInfo(user);
  const fileInputRef = useRef(null);

  const recipeMode = data.recipeMode ?? "preferred";
  const defaultVisibility = data.defaultRecipeVisibility ?? "public";
  const members = data.members ?? [];
  const userRecipes = data.userRecipes ?? [];

  const setField = (key, val) => setData((d) => ({ ...d, [key]: val }));

  const onPhotoSelected = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const url = await fileToDataUrl(file);
      setField("profilePhoto", url);
    } catch { /* ignore */ }
  };

  const profilePhoto = data.profilePhoto ?? g.photo;

  return (
    <div style={{ minHeight: "100dvh", background: BG }}>
      {/* hidden file input */}
      <input ref={fileInputRef} type="file" accept="image/*" onChange={onPhotoSelected} style={{ display: "none" }} />

      <div style={{
        padding: `20px 18px calc(${bottomNavSpacer()} + 18px)`,
        maxWidth: 420, margin: "0 auto", width: "100%", boxSizing: "border-box",
      }}>

        {/* ── Header ─────────────────────────────────── */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
          <div style={{
            width: 38, height: 38, borderRadius: 12, background: "#e6f3ea",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <User size={18} color={GREEN} />
          </div>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 900, color: INK, letterSpacing: "-.3px" }}>
            Mi perfil
          </h1>
        </div>

        {/* ── 1. Perfil / cuenta ─────────────────────── */}
        {user ? (
          <Card style={{ marginBottom: 14, boxShadow: "0 4px 14px -10px rgba(20,47,29,.18)" }}>
            {/* Photo + name row */}
            <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "15px 16px 13px" }}>
              {/* Avatar with upload overlay */}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                style={{ position: "relative", border: "none", background: "transparent", padding: 0, cursor: "pointer", flexShrink: 0, lineHeight: 0 }}
              >
                <Avatar name={g.name} photo={profilePhoto} size={54} color={GREEN} />
                <span style={{
                  position: "absolute", bottom: -2, right: -2,
                  width: 20, height: 20, borderRadius: "50%",
                  background: GREEN, border: "2px solid #fff",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <Camera size={9} color="#fff" />
                </span>
              </button>

              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ margin: "0 0 1px", fontSize: 16, fontWeight: 800, color: INK, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {g.name}
                </p>
                <p style={{ margin: 0, fontSize: 12.5, color: "#7a9485", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {g.email}
                </p>
                <span style={{
                  display: "inline-block", marginTop: 5, padding: "2px 10px",
                  borderRadius: 20, fontSize: 10.5, fontWeight: 800,
                  background: "rgba(45,90,61,.1)", color: GREEN,
                }}>
                  Plan Free
                </span>
              </div>
            </div>

            {/* Divider */}
            <div style={{ height: 1, background: "#f0f4f1", margin: "0 16px" }} />

            {/* Cerrar sesión row */}
            <button
              type="button"
              onClick={onSignOut}
              style={{
                width: "100%", display: "flex", alignItems: "center", gap: 10,
                padding: "12px 16px", border: "none", background: "transparent",
                cursor: "pointer", fontFamily: "inherit", textAlign: "left",
              }}
            >
              <div style={{ width: 32, height: 32, borderRadius: 9, background: "#fff0ee", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <LogOut size={14} color="#c0392b" />
              </div>
              <span style={{ flex: 1, fontSize: 13.5, fontWeight: 700, color: "#c0392b" }}>Cerrar sesión</span>
              <ChevronRight size={15} color="#d0a0a0" />
            </button>
          </Card>
        ) : (
          <Card style={{ marginBottom: 14, padding: "18px 16px" }}>
            <p style={{ margin: "0 0 4px", fontSize: 15, fontWeight: 800, color: INK }}>Guarda tu perfil en la nube</p>
            <p style={{ margin: "0 0 14px", fontSize: 13, color: "#7a9485", lineHeight: 1.5 }}>
              Inicia sesión para sincronizar recetas, familia y preferencias.
            </p>
            <GoogleButton onClick={onSignIn} />
          </Card>
        )}

        {/* ── 2. Tu familia ─────────────────────────── */}
        <Section
          iconEl={<Users size={16} color={GREEN} />}
          iconColor={GREEN}
          iconBg="#e6f3ea"
          title="Tu familia"
          defaultOpen={false}
          action={
            <button
              type="button"
              onClick={onEditMembers}
              style={{
                display: "inline-flex", alignItems: "center", gap: 5,
                padding: "6px 11px", borderRadius: 9,
                border: `1.5px solid ${GREEN}`, background: "#f0f7f2",
                color: GREEN, fontSize: 12, fontWeight: 800,
                cursor: "pointer", fontFamily: "inherit",
              }}
            >
              <SettingsIcon size={12} />
              Gestionar
            </button>
          }
        >
          {members.length === 0 ? (
            <div style={{ textAlign: "center", padding: "10px 0 4px" }}>
              <p style={{ margin: "0 0 12px", fontSize: 13, color: "#9ab0a1", lineHeight: 1.5 }}>
                Añade tu familia para personalizar el menú automáticamente.
              </p>
              <button
                type="button"
                onClick={onEditMembers}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 7,
                  padding: "10px 18px", borderRadius: 11, border: `1.5px solid ${GREEN}`,
                  background: "transparent", color: GREEN, fontSize: 13, fontWeight: 800,
                  cursor: "pointer", fontFamily: "inherit",
                }}
              >
                <Plus size={14} strokeWidth={2.8} /> Añadir primer miembro
              </button>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
              {members.map((m) => (
                <MemberCard key={m.id} member={m} allMembers={members} />
              ))}
            </div>
          )}
        </Section>

        {/* ── 3. Tus ajustes generales ───────────────── */}
        <Section
          iconEl={<BookOpen size={16} color="#9647c9" />}
          iconColor="#9647c9"
          iconBg="#f2e7fb"
          title="Tus ajustes generales"

        >
          <FieldLabel>Recetas en el menú generado</FieldLabel>
          <div style={{ display: "flex", gap: 7, marginBottom: 18 }}>
            {RECIPE_MODES.map((opt) => (
              <SegOpt key={opt.id} {...opt} active={recipeMode === opt.id} onClick={(id) => setField("recipeMode", id)} />
            ))}
          </div>

          <FieldLabel>Visibilidad por defecto al crear recetas</FieldLabel>
          <div style={{ display: "flex", gap: 7 }}>
            {VIS_MODES.map((opt) => (
              <SegOpt key={opt.id} {...opt} active={defaultVisibility === opt.id} onClick={(id) => setField("defaultRecipeVisibility", id)} />
            ))}
          </div>
          {userRecipes.length > 0 && (
            <p style={{ margin: "10px 0 0", fontSize: 11.5, color: "#9ab0a1" }}>
              {userRecipes.length} receta{userRecipes.length === 1 ? "" : "s"} propia{userRecipes.length === 1 ? "" : "s"}.
            </p>
          )}
        </Section>

        {/* ── 4. Preferencias del menú ───────────────── */}
        <Section
          iconEl={<SlidersHorizontal size={16} color="#2f6fb8" />}
          iconColor="#2f6fb8"
          iconBg="#e5eff9"
          title="Preferencias del menú"
        >
          <FieldLabel>¿Quién cocina y cómo?</FieldLabel>
          <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
            {[
              { id: "basic",  Icon: BookOpenCheck, label: "Básico" },
              { id: "normal", Icon: ChefHat,       label: "Normal" },
              { id: "pro",    Icon: Sparkles,       label: "Me gusta cocinar" },
            ].map(({ id, Icon, label }) => {
              const sel = (data.cookLevel ?? "normal") === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setField("cookLevel", id)}
                  style={{
                    flex: 1, display: "flex", flexDirection: "column", alignItems: "center",
                    gap: 6, padding: "14px 8px 12px", borderRadius: 14, cursor: "pointer",
                    background: sel ? "#2d5a3d" : "#f4f7f5",
                    border: `1.5px solid ${sel ? "#2d5a3d" : "#e3ebe6"}`,
                    transition: "all .15s ease", fontFamily: "inherit",
                  }}
                >
                  <Icon size={20} color={sel ? "#fff" : "#9ab0a1"} />
                  <span style={{ fontWeight: 700, fontSize: 12, color: sel ? "#fff" : "#5a7066", textAlign: "center", lineHeight: 1.2 }}>
                    {label}
                  </span>
                </button>
              );
            })}
          </div>

          <FieldLabel>¿Cuánto tiempo tienes para cocinar?</FieldLabel>
          <CookTimeEditor data={data} setData={setData} />
        </Section>

        {/* ── 5. Tu despensa ─────────────────────────── */}
        <div style={{ marginBottom: 14 }}>
          <Card>
            <button
              type="button"
              onClick={onOpenPantry}
              style={{
                width: "100%", display: "flex", alignItems: "center", gap: 12,
                padding: "13px 14px", border: "none", background: "transparent",
                cursor: "pointer", fontFamily: "inherit", textAlign: "left",
              }}
            >
              <div style={{ width: 34, height: 34, borderRadius: 10, background: "#fdece1", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <ShoppingBasket size={15} color="#d9711f" />
              </div>
              <span style={{ flex: 1, fontSize: 14, fontWeight: 700, color: INK }}>Tu despensa</span>
              <ChevronRight size={16} color="#c0cfca" />
            </button>
          </Card>
        </div>

        {/* ── 6. Zona de peligro ─────────────────────── */}
        <Card style={{ borderColor: "#f0d0cc", marginBottom: 8 }}>
          {/* Reiniciar datos */}
          <button
            type="button"
            onClick={onReset}
            style={{
              width: "100%", display: "flex", alignItems: "center", gap: 12,
              padding: "13px 14px", border: "none", background: "transparent",
              cursor: "pointer", fontFamily: "inherit", textAlign: "left",
              borderBottom: "1px solid #fce8e6",
            }}
          >
            <div style={{ width: 34, height: 34, borderRadius: 10, background: "#fff0ee", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Trash2 size={15} color="#c0392b" />
            </div>
            <span style={{ flex: 1, fontSize: 13.5, fontWeight: 700, color: "#c0392b" }}>Reiniciar menú</span>
            <ChevronRight size={15} color="#d0a0a0" />
          </button>

          {/* Eliminar cuenta */}
          <button
            type="button"
            onClick={onDeleteAccount}
            style={{
              width: "100%", display: "flex", alignItems: "center", gap: 12,
              padding: "13px 14px", border: "none", background: "transparent",
              cursor: "pointer", fontFamily: "inherit", textAlign: "left",
            }}
          >
            <div style={{ width: 34, height: 34, borderRadius: 10, background: "#fff0ee", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <UserX size={15} color="#c0392b" />
            </div>
            <span style={{ flex: 1, fontSize: 13.5, fontWeight: 700, color: "#c0392b" }}>Eliminar cuenta</span>
            <ChevronRight size={15} color="#d0a0a0" />
          </button>
        </Card>

        {/* Version */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 5, padding: "12px 0 0", opacity: 0.5 }}>
          <Info size={12} color="#7a9485" />
          <span style={{ fontSize: 11.5, color: "#7a9485", fontWeight: 600 }}>MenuPlan v1.0</span>
        </div>
      </div>

      <BottomNav active="profile" onNav={onNav} context="home" />
    </div>
  );
}
