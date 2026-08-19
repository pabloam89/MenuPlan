import { useEffect, useRef, useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  User,
  Users,
  Camera,
  Check,
  Info,
  ShieldCheck,
} from "lucide-react";
import { Avatar, BottomNav, bottomNavSpacer, EmptyIllustration, GoogleButton } from "../components/ui.jsx";
import { googleInfo } from "./Settings.jsx";
import { findAccountMember, memberAvatarColor, memberAvatarThumbSrc, migrateHomeRole, resolveMemberAge, userAvatarSrc } from "../lib/stages.js";

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


// ── Collapsible section with optional action button in header ──────────────

function Section({ iconEl, iconBg = "#e6f3ea", title, defaultOpen = false, action, children }) {
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
  // Goes through resolveMemberAge (the same source of truth used for
  // baby/child gating everywhere else) instead of reading member.age
  // directly, so a member added via birthDate shows their real age here
  // too instead of silently hiding it.
  const age = resolveMemberAge(member);
  const role = migrateHomeRole(member.homeRole ?? "Adulto");

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 12,
      padding: "11px 14px", background: "#fff",
      border: "1.5px solid #e3ebe6", borderRadius: 13,
      boxShadow: "0 1px 4px rgba(20,47,29,.06)",
    }}>
      <Avatar name={member.name} photo={memberAvatarThumbSrc(member)} size={40} color={memberAvatarColor(member.id, allMembers)} />

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

// ── Family illustration pools by child count ─────────────────────────────────

const FAMILIA_PHOTOS = {
  0: ["/avatares/cards/familia/familia_0.jpg"],
  1: ["/avatares/cards/familia/familia_1_1.jpg", "/avatares/cards/familia/familia_1_2.jpg"],
  2: ["/avatares/cards/familia/familia_2_1.jpg", "/avatares/cards/familia/familia_2_2.jpg"],
  3: ["/avatares/cards/familia/familia_3_1.jpg", "/avatares/cards/familia/familia_3_2.jpg"],
  4: ["/avatares/cards/familia/familia_4.jpg"],
  5: [
    "/avatares/cards/familia/familia_5_1.jpg",
    "/avatares/cards/familia/familia_5_2.jpg",
    "/avatares/cards/familia/familia_5_3.jpg",
    "/avatares/cards/familia/familia_5_4.jpg",
    "/avatares/cards/familia/familia_5_5.jpg",
  ],
  6: ["/avatares/cards/familia/familia_6_1.jpg", "/avatares/cards/familia/familia_6_2.jpg"],
};
const FAMILIA_FALLBACK = ["/avatares/cards/familia/familia_7plus.jpg"];

function familyPhotos(members) {
  const childCount = members.filter((m) => {
    const age = resolveMemberAge(m);
    return age !== null && age < 18;
  }).length;
  return FAMILIA_PHOTOS[Math.min(childCount, 6)] ?? FAMILIA_FALLBACK;
}

// ── Family vertical card (rotating illustration + CTA) ───────────────────────

// ── Compact horizontal nav row (illustration 40% + copy + chevron) ──────────

function FamilyCardV({ members, onEditMembers }) {
  const photos = members.length === 0 ? [] : familyPhotos(members);
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    if (photos.length <= 1) return undefined;
    const t = setInterval(() => setIdx((i) => (i + 1) % photos.length), 5000);
    return () => clearInterval(t);
  }, [photos.length]);

  return (
    <button
      type="button"
      onClick={onEditMembers}
      style={{
        width: "100%", display: "flex", flexDirection: "column",
        padding: 0, overflow: "hidden", marginBottom: 10,
        background: "#fff", border: "1.5px solid #cfe3d8", borderRadius: 16,
        cursor: "pointer", fontFamily: "inherit",
      }}
    >
      {/* Illustration on top — wide/landscape band */}
      <div style={{ width: "100%", aspectRatio: "16 / 9", position: "relative", overflow: "hidden", background: "#0f766e" }}>
        {photos.length === 0 ? (
          <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6, opacity: 0.75 }}>
            <Users size={22} color="#fff" />
            <span style={{ fontSize: 11, color: "#fff", fontWeight: 700 }}>Vacío</span>
          </div>
        ) : (
          photos.map((src, i) => (
            <img
              key={src}
              src={src}
              alt=""
              style={{
                position: "absolute", inset: 0, width: "100%", height: "100%",
                objectFit: "cover", objectPosition: "center top",
                opacity: i === idx ? 1 : 0, transition: "opacity .8s ease", display: "block",
              }}
            />
          ))
        )}
      </div>
      {/* Copy band below, centered */}
      <div style={{ padding: "12px 14px", display: "flex", flexDirection: "column", alignItems: "center", gap: 3, textAlign: "center" }}>
        <p style={{ margin: 0, fontSize: 14, fontWeight: 800, color: INK }}>Gestionar tu familia</p>
        <p style={{ margin: 0, fontSize: 12, color: "#7a9485", lineHeight: 1.4 }}>Edita quién come en casa y sus perfiles.</p>
        <ChevronDown size={16} color="#9ab0a1" style={{ marginTop: 2 }} />
      </div>
    </button>
  );
}

// ── Vertical action card (illustration on top, copy + chevron below) ─────────

function ActionCardV({ img, title, accent, onClick }) {
  return (
    <div style={{ flex: 1, minWidth: 0, display: "flex" }}>
      <EmptyIllustration
        img={img}
        imgAspect="1 / 1"
        imgPosition="center top"
        accent={accent}
        maxWidth={200}
        bandPadding="8px 8px 10px"
        onClick={onClick}
      >
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2, width: "100%" }}>
          <p style={{ margin: 0, fontSize: 13, fontWeight: 800, color: INK, lineHeight: 1.25, textAlign: "center" }}>
            {title}
          </p>
          <ChevronDown size={15} color="#9ab0a1" style={{ flexShrink: 0 }} />
        </div>
      </EmptyIllustration>
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
  onBack,
  onSignIn,
  onSignOut,
  onReset,
  onDeleteAccount,
  onEditMembers,
  activeHousehold,
  householdReadOnly = false,
}) {
  const g = googleInfo(user);
  const fileInputRef = useRef(null);
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

  const profilePhoto = userAvatarSrc({
    profilePhoto: data.profilePhoto,
    member: findAccountMember(members, g.name),
    googlePhoto: g.photo,
  });

  return (
    <div style={{ minHeight: "100dvh", background: BG }}>
      {/* hidden file input */}
      <input ref={fileInputRef} type="file" accept="image/*" onChange={onPhotoSelected} style={{ display: "none" }} />

      <div style={{
        padding: `20px 18px calc(${bottomNavSpacer()} + 18px)`,
        maxWidth: 420, margin: "0 auto", width: "100%", boxSizing: "border-box",
      }}>

        {/* ── Header ─────────────────────────────────── */}
        {/* No longer a bottom-nav tab (see BottomNav in ui.jsx) — reached as a
            header icon from "Inicio", so it needs its own explicit way back. */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              style={{
                border: "1px solid #e0eae3", background: "#fff", color: GREEN,
                borderRadius: 10, padding: "7px 12px", fontSize: 13, fontWeight: 700,
                cursor: "pointer", fontFamily: "inherit", flexShrink: 0,
              }}
            >
              Atrás
            </button>
          )}
          <div style={{
            width: 38, height: 38, borderRadius: 12, background: "#e6f3ea",
            display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
          }}>
            <User size={18} color={GREEN} />
          </div>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 900, color: INK, letterSpacing: "-.3px" }}>
            Mi perfil
          </h1>
          {activeHousehold && (
            <span style={{
              marginLeft: "auto", padding: "4px 10px", borderRadius: 999,
              fontSize: 10.5, fontWeight: 800, flexShrink: 0,
              background: householdReadOnly ? "#fff7e6" : "rgba(45,90,61,.1)",
              color: householdReadOnly ? "#9a6b00" : GREEN,
            }}>
              {householdReadOnly ? "Visitante" : "Propietario"}
            </span>
          )}
        </div>

        {activeHousehold && (
          <p style={{ margin: "0 0 16px", fontSize: 13, fontWeight: 700, color: "#7a9485" }}>
            Hogar activo: {activeHousehold.name}
          </p>
        )}

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
        <FamilyCardV members={members} onEditMembers={onEditMembers} />

        {/* ── Cuenta y datos ─────────────────────── */}
        <div style={{ display: "flex", gap: 10, alignItems: "stretch" }}>
          <ActionCardV
            img="/avatares/cards/cerrar_sesion.jpg"
            title="Cerrar sesión"
            accent={GREEN}
            onClick={onSignOut}
          />
          <ActionCardV
            img="/avatares/cards/reiniciar_menu.jpg"
            title="Reiniciar menú"
            accent="#c0392b"
            onClick={onReset}
          />
          <ActionCardV
            img="/avatares/cards/eliminar_cuenta.jpg"
            title="Eliminar cuenta"
            accent="#c0392b"
            onClick={onDeleteAccount}
          />
        </div>

        {/* Política de privacidad */}
        <a
          href="/privacidad.html"
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
            marginTop: 14, padding: "10px 0", textDecoration: "none",
          }}
        >
          <ShieldCheck size={13} color="#7a9485" />
          <span style={{ fontSize: 12.5, color: "#7a9485", fontWeight: 700 }}>Política de privacidad</span>
        </a>

        {/* Version */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 5, padding: "0 0 0", opacity: 0.5 }}>
          <Info size={12} color="#7a9485" />
          <span style={{ fontSize: 11.5, color: "#7a9485", fontWeight: 600 }}>MenuPlan v1.0</span>
        </div>
      </div>

      <BottomNav active="dashboard" onNav={onNav} />
    </div>
  );
}
