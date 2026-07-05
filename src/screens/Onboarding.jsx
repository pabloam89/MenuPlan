import React, { Fragment, useContext, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowUpDown,
  Baby,
  Bean,
  Beef,
  BookOpenCheck,
  Egg,
  Fish,
  GitBranch,
  BriefcaseBusiness,
  CalendarDays,
  Check,
  ChefHat,
  Wheat,
  ChevronLeft,
  ChevronRight,
  Coffee,
  Sun,
  Sunset,
  Moon,
  ChevronDown,
  ChevronUp,
  CircleDot,
  Drumstick,
  Expand,
  FileText,
  House,
  Layers2,
  Loader2,
  Minus,
  Plus,
  School,
  Coins,
  Dumbbell,
  Heart,
  HeartPulse,
  Microwave,
  Flame,
  CookingPot,
  Wind,
  Bot,
  Wand2,
  Wrench,
  Shuffle,
  Pizza,
  Repeat,
  Salad,
  SlidersHorizontal,
  Sparkles,
  Tag,
  Trash2,
  Upload,
  Zap,
  User,
  Users,
  Utensils,
  UtensilsCrossed,
  X,
} from "lucide-react";
import {
  Chip,
  SliderInput,
  Avatar,
  AvatarStack,
  ProgressDots,
  GroupScopePicker,
} from "../components/ui.jsx";
import { CookTimeEditor } from "../components/CookTimeEditor.jsx";
import { OnboardingProgressContext } from "./onboardingProgressContext.js";
import { HOUSEHOLD_ROLES, stageForAge, suggestHomeRole, migrateHomeRole, AVATAR_PALETTE, memberAvatarColor } from "../lib/stages.js";
import { migrateFixedDishes, normalizeFixedDish, catalogMatchesForFixedDish } from "../lib/fixedDishes.js";
import { EU_ALLERGENS, normalizeAllergenId } from "../lib/allergens.js";
import { CatalogBrowserSheet, categoryColor } from "./CatalogBrowserSheet.jsx";
import { recipeCatalogById } from "../data/recipeCatalog.js";
import { dishImageUrl } from "../assets/dishes/dishImages.js";
import guarnicionesData from "../data/recipes/guarniciones.json";

const GARNISH_NAME_BY_ID = Object.fromEntries(guarnicionesData.map((g) => [g.id, g.name]));
import {
  canAssignMemberToGroup,
  groupsAvailableForMember,
  groupsFromModel,
  hasBabyMember,
  isBabyMenuGroup,
  memberIsBaby,
  membersOfGroup,
  migrateGroupsForBabies,
  uid,
} from "../lib/groups.js";
import {
  ALL_DAY_MEALS,
  DAYS,
  dayLabel,
  getMeals,
  modeForGroupSlot,
  primaryDayMeal,
} from "../lib/planner.js";
import { SCHOOL_DAYS, SCHOOL_COURSES, hasAnySchoolDish } from "../lib/schoolMenu.js";
import { importSchoolMenuFile, selectBestWeek } from "../lib/schoolMenuImport.js";

function ageFromBirthDate(birthDate) {
  if (!birthDate) return 30;
  const d = new Date(birthDate);
  if (Number.isNaN(d.getTime())) return 30;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const monthDiff = now.getMonth() - d.getMonth();
  const dayDiff = now.getDate() - d.getDate();
  if (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)) age -= 1;
  return Math.max(0, age);
}

function memberAge(member) {
  if (member.useBirthDate) return ageFromBirthDate(member.birthDate);
  return Number.isFinite(member.age) ? member.age : parseInt(member.age, 10) || 30;
}

function normalizeTextValue(input) {
  return (input ?? "").trim().replace(/\s+/g, " ");
}

function titleCase(input) {
  const text = normalizeTextValue(input);
  if (!text) return "";
  return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
}

function stateIcon(value, size = 14) {
  if (value === "casa") return <House size={size} />;
  if (value === "tupper") return <BriefcaseBusiness size={size} />;
  if (value === "cole") return <School size={size} />;
  if (value === "fuera") return <UtensilsCrossed size={size} />;
  return <Minus size={size} />;
}

// ─── Shell ─────────────────────────────────────────────────────

export function OnboardingShell({
  title,
  subtitle,
  children,
  onBack,
  onReset,
  onNext,
  onFinish,
  nextLabel = "Afinar menú",
  finishLabel = "Generar menú",
  nextDisabled = false,
  finishDisabled = false,
  bg = "#f5f9f6",
}) {
  const progress = useContext(OnboardingProgressContext);
  const headerBtn = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "8px 14px",
    borderRadius: 10,
    border: "1.5px solid #2d5a3d",
    background: "#fff",
    color: "#2d5a3d",
    fontSize: 13,
    fontWeight: 700,
    cursor: "pointer",
  };

  return (
    <div
      style={{
        padding: "12px 20px 0",
        height: "100dvh",
        boxSizing: "border-box",
        display: "flex",
        flexDirection: "column",
        background: bg,
      }}
    >
      <div
        style={{
          minHeight: 38,
          marginBottom: 6,
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        <div style={{ flex: "0 0 auto", minWidth: onBack ? undefined : 0 }}>
          {onBack && (
            <button type="button" onClick={onBack} style={headerBtn}>
              Atrás
            </button>
          )}
        </div>
        {progress && (
          <div style={{ flex: 1, minWidth: 0, display: "flex", justifyContent: "center" }}>
            <ProgressDots
              current={progress.current}
              total={progress.total}
              onJump={progress.onJump}
              compact
            />
          </div>
        )}
        <div style={{ flex: "0 0 auto" }}>
          {onReset && (
            <button type="button" onClick={onReset} style={headerBtn}>
              Reiniciar
            </button>
          )}
        </div>
      </div>

      {title && (
        <h2 style={{ fontSize: 22, fontWeight: 800, color: "#1a3a24", margin: "0 0 4px" }}>
          {title}
        </h2>
      )}
      {subtitle && (
        <p style={{ color: "#888", fontSize: 13, margin: "0 0 16px" }}>{subtitle}</p>
      )}

      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: "auto",
          marginLeft: -20,
          marginRight: -20,
          paddingLeft: 20,
          paddingRight: 20,
          paddingBottom: 16,
        }}
      >
        {children}
      </div>

      <div
        style={{
          display: "flex",
          gap: 10,
          flexShrink: 0,
          marginLeft: -20,
          marginRight: -20,
          paddingLeft: 20,
          paddingRight: 20,
          paddingTop: 12,
          paddingBottom: "calc(10px + env(safe-area-inset-bottom))",
          background: bg,
          boxShadow: "0 -10px 16px -10px rgba(0,0,0,0.14)",
        }}
      >
        {onFinish && onNext && (
          <button
            onClick={finishDisabled ? undefined : onFinish}
            disabled={finishDisabled}
            style={{
              flex: 1,
              padding: "14px",
              borderRadius: 12,
              border: `1.5px solid ${finishDisabled ? "#e0e8e3" : "#c8ddd0"}`,
              background: finishDisabled ? "#f1f5f2" : "#fff",
              color: finishDisabled ? "#aebcb2" : "#2d5a3d",
              fontSize: 14,
              fontWeight: 700,
              cursor: finishDisabled ? "not-allowed" : "pointer",
            }}
          >
            {finishLabel}
          </button>
        )}
        {onNext && (
          <button
            type="button"
            onClick={onNext}
            disabled={nextDisabled}
            style={{
              flex: onFinish ? 1 : 2,
              padding: "14px",
              borderRadius: 12,
              border: "none",
              background: nextDisabled ? "#c8d9ce" : "#2d5a3d",
              color: "#fff",
              fontSize: 14,
              fontWeight: 700,
              cursor: nextDisabled ? "not-allowed" : "pointer",
              boxShadow: nextDisabled ? "none" : "0 4px 18px rgba(45,90,61,.25)",
              opacity: nextDisabled ? 0.85 : 1,
            }}
          >
            {nextLabel}
          </button>
        )}
        {onFinish && !onNext && (
          <button
            onClick={finishDisabled ? undefined : onFinish}
            disabled={finishDisabled}
            style={{
              flex: 2,
              padding: "14px",
              borderRadius: 12,
              border: "none",
              background: finishDisabled
                ? "#c8d9ce"
                : "linear-gradient(135deg, #2d5a3d 0%, #4cba6e 100%)",
              color: "#fff",
              fontSize: 14,
              fontWeight: 700,
              cursor: finishDisabled ? "not-allowed" : "pointer",
              boxShadow: finishDisabled ? "none" : "0 4px 18px rgba(76,186,110,.35)",
              opacity: finishDisabled ? 0.85 : 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
            }}
          >
            <Sparkles size={15} />
            {finishLabel}
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Members ───────────────────────────────────────────────────

const ROLE_ICON_MAP = {
  "Adulto":   User,
  "Papá":     User,
  "Mamá":     User,
  "Hijo/a":   Baby,
  "Bebé":     Baby,
  "Abuelo/a": User,
  "Amigo/a":  Users,
  "Otro":     User,
};

export function OnboardingMembers({ data, setData, onNext, onFinish, onReset }) {
  const [name, setName] = useState("");
  const [ageStr, setAgeStr] = useState("");
  const [roleEditId, setRoleEditId] = useState(null);
  const [colorPickerId, setColorPickerId] = useState(null);
  const [dismissedBabyHints, setDismissedBabyHints] = useState(new Set());
  const [removingIds, setRemovingIds] = useState(new Set());
  const [addBounce, setAddBounce] = useState(false);

  const trimmedName = name.trim();
  const parsedAge = parseInt(ageStr, 10);
  const computedAge = Number.isFinite(parsedAge) ? parsedAge : NaN;
  const ageProvided = Number.isFinite(computedAge) && computedAge >= 0;
  const canAdd = trimmedName.length > 0 && ageProvided;
  const hasMembers = data.members.length > 0;

  const pendingBabyMember = data.members.find(
    (m) => memberIsBaby(m) && !dismissedBabyHints.has(m.id)
  );

  const addMember = () => {
    if (!canAdd) return;
    setAddBounce(true);
    setTimeout(() => setAddBounce(false), 320);
    setData((d) => ({
      ...d,
      members: [
        ...d.members,
        {
          id: uid(),
          name: trimmedName,
          age: computedAge,
          useBirthDate: false,
          birthDate: "",
          homeRole: suggestHomeRole(computedAge),
          stageDetail: "",
          allergies: [],
          dislikes: [],
        },
      ],
    }));
    setName("");
    setAgeStr("");
  };

  const updateMemberHomeRole = (id, homeRole) => {
    setData((d) => ({
      ...d,
      members: d.members.map((m) => (m.id === id ? { ...m, homeRole } : m)),
    }));
    setRoleEditId(null);
  };

  const updateMemberColor = (id, color) => {
    setData((d) => ({
      ...d,
      members: d.members.map((m) => (m.id === id ? { ...m, color } : m)),
    }));
    setColorPickerId(null);
  };

  const removeMember = (id) => {
    setRemovingIds((s) => new Set([...s, id]));
    setTimeout(() => {
      setData((d) => ({ ...d, members: d.members.filter((m) => m.id !== id) }));
      setRemovingIds((s) => { const n = new Set(s); n.delete(id); return n; });
    }, 260);
  };

  const dismissBabyHint = (id) =>
    setDismissedBabyHints((s) => new Set([...s, id]));

  const promoteBabyToChild = (id) => {
    setData((d) => ({
      ...d,
      members: d.members.map((m) =>
        m.id === id ? { ...m, notBaby: true, homeRole: "Hijo/a" } : m
      ),
    }));
    dismissBabyHint(id);
  };

  const fieldH = 44;
  const ageBoxStyle = {
    width: fieldH,
    height: fieldH,
    borderRadius: 10,
    border: "1.5px solid #ddd",
    background: "#fff",
    fontSize: 15,
    fontWeight: 800,
    textAlign: "center",
    color: "#1a3a24",
    outline: "none",
    flexShrink: 0,
    fontFamily: "inherit",
  };

  return (
    <OnboardingShell
      title="¿Quién come en casa?"
      subtitle="Añade a cada persona. Luego revisa su categoría (Adulto, Bebé…) y toca su avatar para elegir un color."
      onReset={onReset}
      onNext={onNext}
      onFinish={onFinish}
      nextDisabled={!hasMembers}
      finishDisabled={!hasMembers}
    >
      {/* Baby menu modal — explains the baby menu and lets the user promote */}
      <BabyMenuBubble
        member={pendingBabyMember}
        onKeep={() => pendingBabyMember && dismissBabyHint(pendingBabyMember.id)}
        onPromote={() => pendingBabyMember && promoteBabyToChild(pendingBabyMember.id)}
      />

      {/* Role picker overlay */}
      {roleEditId && (
        <div
          onClick={() => setRoleEditId(null)}
          style={{
            position: "fixed", inset: 0, zIndex: 100,
            background: "rgba(0,0,0,.35)",
            display: "flex", alignItems: "flex-end",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%", maxWidth: 420, margin: "0 auto",
              background: "#fff",
              borderRadius: "20px 20px 0 0",
              padding: "20px 20px calc(24px + env(safe-area-inset-bottom, 0px))",
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 800, color: "#888", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 14 }}>
              ¿Quién es en casa?
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
              {HOUSEHOLD_ROLES.map((r) => {
                const member = data.members.find((m) => m.id === roleEditId);
                const current = migrateHomeRole(member?.homeRole ?? suggestHomeRole(memberAge(member)));
                const sel = r === current;
                return (
                  <button
                    key={r}
                    type="button"
                    onClick={() => updateMemberHomeRole(roleEditId, r)}
                    style={{
                      padding: "10px 6px",
                      borderRadius: 10,
                      border: sel ? "2px solid #2d5a3d" : "1.5px solid #e0e8e2",
                      background: sel ? "#eaf2ec" : "#fff",
                      color: sel ? "#1a3a24" : "#555",
                      fontSize: 13,
                      fontWeight: sel ? 800 : 600,
                      cursor: "pointer",
                      fontFamily: "inherit",
                      textAlign: "center",
                    }}
                  >
                    {r}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Add form — columnas verticales: [Nombre] [Edad] [Añadir] */}
      <div style={{ display: "flex", gap: 8, alignItems: "flex-end", marginBottom: 16 }}>

        {/* Nombre column */}
        <div style={{ flex: "1 1 auto", minWidth: 0 }}>
          <div style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.3, color: "#1a3a24", marginBottom: 4 }}>
            Nombre
          </div>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="María"
            style={{
              width: "100%", height: fieldH, padding: "0 12px",
              borderRadius: 10, border: "1.5px solid #ddd",
              fontSize: 14, outline: "none", boxSizing: "border-box", fontFamily: "inherit",
            }}
            onKeyDown={(e) => e.key === "Enter" && addMember()}
          />
        </div>

        {/* Edad column: label centered over number input + calendar button */}
        <div style={{ flexShrink: 0 }}>
          <div style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.3, color: "#3d6b4f", textAlign: "center", marginBottom: 4 }}>
            Edad
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              type="text"
              inputMode="numeric"
              value={ageStr}
              onChange={(e) => setAgeStr(e.target.value.replace(/\D/g, ""))}
              style={ageBoxStyle}
              onKeyDown={(e) => e.key === "Enter" && addMember()}
            />
          </div>
        </div>

        {/* Añadir */}
        <button
          type="button"
          onClick={addMember}
          disabled={!canAdd}
          style={{
            height: fieldH, padding: "0 14px", borderRadius: 10, border: "none",
            background: canAdd ? "#2d5a3d" : "#cdd5d0", color: "#fff",
            fontSize: 13, fontWeight: 800, cursor: canAdd ? "pointer" : "not-allowed",
            display: "inline-flex", alignItems: "center", gap: 6,
            flexShrink: 0, fontFamily: "inherit",
            transform: addBounce ? "scale(0.91)" : "scale(1)",
            transition: "transform .15s cubic-bezier(.34,1.56,.64,1), background .2s",
          }}
        >
          <Plus size={16} />
          Añadir
        </button>
      </div>

      <style>{`
        @keyframes memberIn {
          from { opacity: 0; transform: translateY(-10px) scale(0.95); }
          to   { opacity: 1; transform: translateY(0)     scale(1);    }
        }
        @keyframes memberOut {
          from { opacity: 1; transform: translateX(0)   scale(1);    max-height: 120px; }
          to   { opacity: 0; transform: translateX(12px) scale(0.95); max-height: 0;     }
        }
        @keyframes colorPickerIn {
          from { opacity: 0; transform: scaleY(0.6); transform-origin: top; }
          to   { opacity: 1; transform: scaleY(1);   transform-origin: top; }
        }
        @keyframes swatchPop {
          from { opacity: 0; transform: scale(0.4); }
          to   { opacity: 1; transform: scale(1);   }
        }
        @keyframes hintIn {
          from { opacity: 0; transform: translateY(6px) scale(0.97); }
          to   { opacity: 1; transform: translateY(0)   scale(1);    }
        }
        .member-enter   { animation: memberIn .28s cubic-bezier(.34,1.3,.64,1) both; }
        .member-leaving { animation: memberOut .26s cubic-bezier(.4,0,.2,1) both; overflow: hidden; }
      `}</style>

      {/* Divider */}
      {hasMembers && (
        <div style={{ height: 1, background: "rgba(45,90,61,.1)", margin: "4px 0 8px" }} />
      )}

      {/* Member cards */}
      {data.members.map((m, idx) => {
        const role = migrateHomeRole(m.homeRole ?? suggestHomeRole(memberAge(m)));
        const avatarColor = m.color ?? AVATAR_PALETTE[idx % AVATAR_PALETTE.length];
        const RoleIcon = ROLE_ICON_MAP[role] ?? User;
        const initial = m.name.trim()[0]?.toUpperCase() ?? "?";
        const isPickingColor = colorPickerId === m.id;
        const isLeaving = removingIds.has(m.id);
        return (
          <div
            key={m.id}
            className={isLeaving ? "member-leaving" : "member-enter"}
            style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: "10px 12px", background: "#fff",
              border: "1.5px solid #dfe9e2",
              boxShadow: "0 1px 5px rgba(45,90,61,.07)",
              borderRadius: 14, marginBottom: 8,
              flexWrap: "wrap",
            }}
          >
            {/* Avatar — tap to pick colour */}
            <div style={{ position: "relative", flexShrink: 0 }}>
              <button
                type="button"
                onClick={() => setColorPickerId(isPickingColor ? null : m.id)}
                title="Cambiar color"
                style={{
                  width: 40, height: 40, borderRadius: "50%", background: avatarColor,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 15, fontWeight: 800, color: "#fff",
                  border: isPickingColor ? "2.5px solid #fff" : "none",
                  boxShadow: isPickingColor ? `0 0 0 2.5px ${avatarColor}` : "none",
                  cursor: "pointer", padding: 0, fontFamily: "inherit",
                  transition: "box-shadow .15s ease",
                }}
              >
                {initial}
              </button>
              {/* Pencil badge */}
              <span style={{
                position: "absolute", bottom: -2, right: -2,
                width: 16, height: 16, borderRadius: "50%",
                background: "#fff", border: "1.5px solid #e0e8e3",
                display: "flex", alignItems: "center", justifyContent: "center",
                pointerEvents: "none",
              }}>
                <svg width="8" height="8" viewBox="0 0 10 10" fill="none">
                  <path d="M7 1.5l1.5 1.5-5 5L2 9l.5-2.5 5-5z" fill="#2d5a3d" strokeWidth="0"/>
                </svg>
              </span>
            </div>
            <div style={{ flex: 1, minWidth: 0, fontWeight: 800, fontSize: 14, color: "#1a3a24",
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {m.name}
            </div>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#3d6b4f", width: 32, textAlign: "center", flexShrink: 0 }}>
              {memberAge(m)}
            </div>
            <button
              type="button"
              onClick={() => setRoleEditId(m.id)}
              style={{
                display: "inline-flex", alignItems: "center", gap: 5,
                padding: "5px 10px", borderRadius: 20,
                border: "1.5px solid #d0e0d6", background: "#fff",
                color: "#2d5a3d", fontSize: 12, fontWeight: 700,
                cursor: "pointer", fontFamily: "inherit", flexShrink: 0,
                width: 100, justifyContent: "center",
              }}
            >
              <RoleIcon size={12} />
              {role}
              <ChevronDown size={11} />
            </button>
            <button
              type="button"
              onClick={() => removeMember(m.id)}
              aria-label={`Quitar a ${m.name}`}
              style={{ border: "none", background: "transparent", cursor: "pointer", color: "#c47070",
                display: "flex", alignItems: "center", justifyContent: "center", padding: 4, flexShrink: 0 }}
            >
              <Trash2 size={15} />
            </button>

            {/* Colour picker — inline, full width, no overflow risk */}
            {isPickingColor && (
              <div style={{
                width: "100%",
                display: "flex",
                gap: 10,
                paddingTop: 10,
                borderTop: "1px solid rgba(45,90,61,.1)",
                marginTop: 4,
                justifyContent: "center",
                animation: "colorPickerIn .2s cubic-bezier(.4,0,.2,1) both",
              }}>
                {AVATAR_PALETTE.map((c, si) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => updateMemberColor(m.id, c)}
                    style={{
                      width: 30, height: 30, borderRadius: "50%",
                      background: c,
                      border: avatarColor === c ? "2.5px solid #fff" : "none",
                      boxShadow: avatarColor === c ? `0 0 0 2.5px ${c}` : `0 2px 8px ${c}55`,
                      cursor: "pointer", padding: 0, flexShrink: 0,
                      transform: avatarColor === c ? "scale(1.18)" : "scale(1)",
                      transition: "transform .15s cubic-bezier(.34,1.56,.64,1), box-shadow .15s ease",
                      animation: `swatchPop .25s cubic-bezier(.34,1.4,.64,1) ${si * 28}ms both`,
                    }}
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </OnboardingShell>
  );
}


// ─── Restrictions ───────────────────────────────────────────────

const BASE_ALLERGY_OPTIONS = ["Gluten", "Lactosa", "Frutos secos", "Marisco", "Huevo", "Soja", "Pescado"];
const BASE_DISLIKE_OPTIONS = [
  "Hígado",
  "Coliflor",
  "Cebolla",
  "Pimiento",
  "Aceitunas",
  "Berenjena",
  "Champiñones",
  "Picante",
];

function gridChipStyle(selected) {
  return {
    height: 26,
    padding: "0 4px",
    borderRadius: 7,
    border: `1.5px solid ${selected ? "#2d5a3d" : "#e5ebe7"}`,
    background: selected ? "#4cba6e" : "#fff",
    color: selected ? "#fff" : "#777",
    fontSize: 10,
    fontWeight: selected ? 800 : 500,
    cursor: "pointer",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
    fontFamily: "inherit",
  };
}

const fixedRowH = 36;
const fixedTimesInputStyle = {
  width: 36,
  height: fixedRowH,
  padding: "0 2px",
  borderRadius: 8,
  border: "1px solid #ddd",
  fontSize: 12,
  fontWeight: 700,
  textAlign: "center",
  color: "#1a3a24",
  outline: "none",
  boxSizing: "border-box",
  flexShrink: 0,
  background: "#fff",
};

const fieldLbl = {
  fontSize: 10,
  fontWeight: 700,
  color: "#888",
  margin: "0 0 4px",
  textTransform: "uppercase",
  letterSpacing: 0.2,
};

function mealToSelectValue(meals, mealOptions) {
  const m = meals[0];
  if (m && mealOptions.includes(m)) return m;
  return mealOptions.find((x) => x.toLowerCase() === "comida") ?? mealOptions[0];
}

const MEAL_ICON = { Desayuno: Coffee, Comida: Sun, Cena: Moon };

const TOOL_ICON = {
  Airfryer: Wind,
  Horno: Flame,
  Microondas: Microwave,
  Thermomix: Bot,
  "Olla rápida": CookingPot,
  Vaporera: Layers2,
};

function mealColWidthFor(mealOptions) {
  const n = Math.max(1, mealOptions.length);
  return n * 28 + (n - 1) * 4 + 8;
}

function MealIconToggle({ meals, mealOptions, onChange }) {
  const value = mealToSelectValue(meals, mealOptions);
  return (
    <div
      style={{
        display: "inline-flex",
        gap: 4,
        background: "#eef3f0",
        borderRadius: 9,
        padding: 4,
      }}
      role="group"
      aria-label="Cuándo"
    >
      {mealOptions.map((m) => {
        const active = m === value;
        const Icon = MEAL_ICON[m] ?? Utensils;
        return (
          <button
            key={m}
            type="button"
            onClick={() => onChange([m])}
            title={m}
            aria-label={m}
            aria-pressed={active}
            style={{
              width: 28,
              height: 28,
              borderRadius: 7,
              border: "none",
              cursor: "pointer",
              background: active ? "#2d5a3d" : "transparent",
              color: active ? "#fff" : "#7a9485",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transition: "background .15s ease, color .15s ease",
            }}
          >
            <Icon size={15} />
          </button>
        );
      })}
    </div>
  );
}

function clampTimesPerWeek(n) {
  return Math.min(7, Math.max(1, Math.round(n)));
}

/** Veces/semana: edita como texto y valida al salir del campo (evita saltar a 7 al teclear). */
function FixedTimesInput({ value, onChange, maxAllowed = 7 }) {
  const [draft, setDraft] = useState(() => String(value));
  const [lastValue, setLastValue] = useState(value);

  if (value !== lastValue) {
    setLastValue(value);
    setDraft(String(value));
  }

  const commit = () => {
    const trimmed = draft.trim();
    if (trimmed === "") {
      onChange(1);
      setDraft("1");
      return;
    }
    const n = parseInt(trimmed, 10);
    if (Number.isNaN(n)) {
      onChange(1);
      setDraft("1");
      return;
    }
    // Clamp both to the per-dish max (7) and the remaining weekly capacity.
    const clamped = Math.min(clampTimesPerWeek(n), Math.max(1, maxAllowed));
    onChange(clamped);
    setDraft(String(clamped));
  };

  return (
    <input
      type="text"
      inputMode="numeric"
      pattern="[1-7]*"
      value={draft}
      onChange={(e) => setDraft(e.target.value.replace(/\D/g, "").slice(0, 1))}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") {
          setDraft(String(value));
          e.currentTarget.blur();
        }
      }}
      style={fixedTimesInputStyle}
      aria-label="Veces por semana"
    />
  );
}

function FixedDishRow({ name, garnish, catLabel, catColor, leading, nameValue, onNameChange, times, maxTimes = 7, meals, mealOptions, mealColWidth, onTimesChange, onMealsChange, onSubmit, onRemove, canSubmit }) {
  const isNew = onNameChange != null;
  const mealColW = mealColWidth ?? mealColWidthFor(mealOptions);
  return (
    <div style={{ display: "flex", gap: 8, alignItems: isNew ? "flex-end" : "center" }}>
      {leading}
      <div style={{ flex: 1, minWidth: 0 }}>
        {isNew && <p style={fieldLbl}>Nombre</p>}
        {isNew ? (
          <input
            value={nameValue}
            onChange={(e) => onNameChange(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && onSubmit?.()}
            placeholder="Ej: Tortilla"
            style={{
              width: "100%",
              height: fixedRowH,
              padding: "0 10px",
              borderRadius: 8,
              border: "1px solid #ddd",
              fontSize: 13,
              outline: "none",
              boxSizing: "border-box",
              background: "#fff",
            }}
          />
        ) : (
          <div style={{ minWidth: 0 }}>
            <p
              style={{
                margin: 0,
                fontSize: 12.5,
                fontWeight: 700,
                color: "#1a3a24",
                lineHeight: 1.25,
                display: "-webkit-box",
                WebkitLineClamp: 2,
                WebkitBoxOrient: "vertical",
                overflow: "hidden",
              }}
            >
              {name}
            </p>
            {(catLabel || garnish) && (
              <p
                style={{
                  margin: "2px 0 0",
                  fontSize: 11,
                  fontWeight: 700,
                  color: catColor ?? "#5a7a66",
                  display: "-webkit-box",
                  WebkitLineClamp: 1,
                  WebkitBoxOrient: "vertical",
                  overflow: "hidden",
                }}
              >
                {catLabel}
                {catLabel && garnish ? <span style={{ fontWeight: 600, color: "#5a7a66" }}> · con {garnish}</span> : null}
                {!catLabel && garnish ? <span style={{ fontWeight: 600, color: "#5a7a66" }}>con {garnish}</span> : null}
              </p>
            )}
          </div>
        )}
      </div>
      <div style={{ flexShrink: 0, width: 36 }}>
        {isNew && <p style={{ ...fieldLbl, textAlign: "center" }}>Veces</p>}
        <FixedTimesInput value={times} maxAllowed={maxTimes} onChange={onTimesChange} />
      </div>
      <div style={{ flexShrink: 0, width: mealColW }}>
        {isNew && <p style={{ ...fieldLbl, textAlign: "center" }}>Cuándo</p>}
        <MealIconToggle meals={meals} mealOptions={mealOptions} onChange={onMealsChange} />
      </div>
      {isNew ? (
        <button
          type="button"
          onClick={onSubmit}
          disabled={!canSubmit}
          aria-label="Añadir plato"
          style={{
            width: fixedRowH,
            height: fixedRowH,
            borderRadius: 8,
            border: "none",
            background: canSubmit ? "#2d5a3d" : "#cdd5d0",
            color: "#fff",
            cursor: canSubmit ? "pointer" : "not-allowed",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
            padding: 0,
          }}
        >
          <Plus size={16} />
        </button>
      ) : (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Quitar ${name}`}
          style={{
            width: fixedRowH,
            height: fixedRowH,
            border: "none",
            background: "transparent",
            cursor: "pointer",
            color: "#c47070",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
            padding: 0,
          }}
        >
          <Trash2 size={14} />
        </button>
      )}
    </div>
  );
}

function FixedDishLeading({ fd }) {
  const fromCatalog = Boolean(fd.catalogId);
  const recipe = fromCatalog ? recipeCatalogById[fd.catalogId] : null;
  const photo = fromCatalog ? dishImageUrl(fd.catalogId, fd.garnishId ?? undefined) : null;
  const color = recipe ? categoryColor(recipe.category) : null;

  if (fromCatalog) {
    return (
      <div
        style={{
          width: 46, height: 46, borderRadius: 11, flexShrink: 0, overflow: "hidden",
          boxSizing: "border-box", border: `2.5px solid ${color ?? "#cdd8d0"}`,
          background: `${color ?? "#cdd8d0"}14`,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}
      >
        {photo ? (
          <img src={photo} alt="" loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          <Utensils size={18} color={color ?? "#9ab0a1"} />
        )}
      </div>
    );
  }
  return (
    <div
      style={{
        width: 46, height: 46, borderRadius: 11, flexShrink: 0, boxSizing: "border-box",
        border: "1.5px dashed #cdd8d0", background: "#fff",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}
    >
      <ChefHat size={18} color="#b6c4bb" />
    </div>
  );
}

function FixedDishTable({ items, mealOptions, onTimesChange, onMealsChange, onRemove }) {
  const mealColW = mealColWidthFor(mealOptions);
  const headerLbl = { ...fieldLbl, color: "#2d5a3d", margin: 0 };
  return (
    <div style={{ background: "#f6f9f7", border: "1px solid #dfe9e2", borderRadius: 12, overflow: "hidden" }}>
      {/* header */}
      <div style={{ display: "flex", gap: 8, alignItems: "center", padding: "9px 10px", background: "#dcebe1", borderBottom: "1px solid #c9ddd0" }}>
        <span style={{ width: 46, flexShrink: 0 }} />
        <span style={{ flex: 1, minWidth: 0, ...headerLbl }}>Plato</span>
        <span style={{ width: 36, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", ...headerLbl }}>Veces</span>
        <span style={{ width: mealColW, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", ...headerLbl }}>Cuándo</span>
        <span style={{ width: fixedRowH, flexShrink: 0 }} />
      </div>

      {items.map((fd, idx) => {
        const fromCatalog = Boolean(fd.catalogId);
        const garnishLabel = fd.garnishId ? GARNISH_NAME_BY_ID[fd.garnishId] : null;
        const matches = fromCatalog ? [] : catalogMatchesForFixedDish(fd);
        const noMatchNote = !fromCatalog && matches.length === 0 ? "Sin match exacto en catálogo" : null;
        return (
          <div
            key={`${fd.catalogId ?? fd.name}-${idx}`}
            style={{
              padding: "8px 10px",
              borderBottom: idx < items.length - 1 ? "1px solid #e6eee8" : "none",
              animation: "fixedDishIn .18s ease-out",
            }}
          >
            <FixedDishRow
              leading={<FixedDishLeading fd={fd} />}
              name={fd.name}
              garnish={garnishLabel}
              times={fd.timesPerWeek}
              meals={fd.meals}
              mealOptions={mealOptions}
              mealColWidth={mealColW}
              onTimesChange={(n) => onTimesChange(idx, n)}
              onMealsChange={(meals) => onMealsChange(idx, meals)}
              onRemove={() => onRemove(idx)}
            />
            {noMatchNote && (
              <p style={{ fontSize: 10.5, color: "#b45309", margin: "4px 2px 0 54px", lineHeight: 1.4 }}>
                {noMatchNote}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}

function MemberAvatarSelector({ members, selectedId, onSelect }) {
  const single = members.length <= 1;
  return (
    <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
      {members.map((m) => {
        const sel = single || m.id === selectedId;
        const color = memberAvatarColor(m.id, members);
        return (
          <button
            key={m.id}
            type="button"
            title={m.name}
            aria-pressed={sel}
            onClick={() => onSelect(m.id)}
            className="avoid-avatar"
            style={{
              border: sel ? `2px solid ${color}` : "2px solid transparent",
              borderRadius: "50%",
              padding: 1,
              background: "transparent",
              cursor: single ? "default" : "pointer",
              lineHeight: 0,
              opacity: sel ? 1 : 0.45,
              filter: sel ? "none" : "grayscale(0.4)",
            }}
          >
            <Avatar name={m.name} size={26} color={color} />
          </button>
        );
      })}
    </div>
  );
}

function AllergenRow({ Icon, color, label, checked, checkColor, onToggle, last }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={checked}
      className="avoid-row"
      style={{
        width: "100%", boxSizing: "border-box", display: "flex", alignItems: "center", gap: 8,
        padding: "8px 6px", border: "none", background: "transparent",
        cursor: "pointer", fontFamily: "inherit", textAlign: "left",
        borderBottom: last ? "none" : "1px solid #eef3f0", borderRadius: 8,
      }}
    >
      <span
        style={{
          width: 24, height: 24, borderRadius: 7, flexShrink: 0,
          background: `${color}1a`, color,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}
      >
        <Icon size={13} strokeWidth={2.2} />
      </span>
      <span style={{ flex: 1, minWidth: 0, fontSize: 12, lineHeight: 1.25, fontWeight: checked ? 800 : 700, color: checked ? "#142f1d" : "#3a4a42", overflow: "hidden" }}>{label}</span>
      <span
        className="filter-check"
        style={{
          width: 20, height: 20, borderRadius: 5, flexShrink: 0,
          border: `1.5px solid ${checked ? checkColor : "#cdd8d0"}`,
          background: checked ? checkColor : "#fff", color: "#fff",
          display: "flex", alignItems: "center", justifyContent: "center",
          transition: "background .15s ease, border-color .15s ease",
        }}
      >
        {checked && <Check className="avoid-pill-check" size={12} strokeWidth={3} />}
      </span>
    </button>
  );
}

function AvoidSection({ icon: Icon, accent, title, subtitle, right, children }) {
  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid #ebf0ed",
        borderRadius: 16,
        marginBottom: 12,
        boxShadow: "0 1px 3px rgba(20,47,29,.05)",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "10px 14px",
          background: "#dcebe1",
          borderBottom: "1px solid #c9ddd0",
        }}
      >
        <span
          style={{
            width: 32,
            height: 32,
            borderRadius: 10,
            background: "#2d5a3d",
            color: "#fff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
            boxShadow: "0 2px 6px rgba(45,90,61,.3)",
          }}
        >
          <Icon size={17} strokeWidth={2.2} />
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ margin: 0, fontSize: 14.5, fontWeight: 800, color: "#1a3a24", lineHeight: 1.2 }}>{title}</p>
          {subtitle && <p style={{ margin: "1px 0 0", fontSize: 11.5, color: "#5e7a68", fontWeight: 600 }}>{subtitle}</p>}
        </div>
        {right}
      </div>
      <div style={{ padding: "13px 14px" }}>{children}</div>
    </div>
  );
}

const COMMON_ALLERGEN_IDS = ["gluten", "leche", "huevos", "frutos_cascara", "crustaceos", "pescado"];
const EXTRA_ALLERGEN_IDS = Object.keys(EU_ALLERGENS).filter((id) => !COMMON_ALLERGEN_IDS.includes(id));
// visibleAllergenIds = todos, sin colapso
const EU_ALLERGEN_IDS = new Set(Object.keys(EU_ALLERGENS));

export function OnboardingRestrictions({ data, setData, onNext, onBack, onFinish, onReset, nextLabel }) {
  const [customAllergy, setCustomAllergy] = useState("");
  const [showAddAllergy, setShowAddAllergy] = useState(false);
  const [allergyMemberId, setAllergyMemberId] = useState(data.members[0]?.id ?? null);

  // Miembro al que aplican las alergias marcadas (cae al primero si el actual ya no existe).
  const activeAllergyMemberId = data.members.some((m) => m.id === allergyMemberId)
    ? allergyMemberId
    : data.members[0]?.id ?? null;
  const activeMemberColor = activeAllergyMemberId
    ? memberAvatarColor(activeAllergyMemberId, data.members)
    : "#2d5a3d";

  const memberHasKey = (m, key) =>
    (m.allergies ?? []).some((a) => normalizeAllergenId(a) === key);

  const activeHasKey = (key) => {
    const m = data.members.find((x) => x.id === activeAllergyMemberId);
    return m ? memberHasKey(m, key) : false;
  };

  const toggleRegimen = (id) =>
    setData((d) => ({
      ...d,
      members: d.members.map((m) => (m.id === id ? { ...m, regimen: !m.regimen } : m)),
    }));

  const toggleMemberAllergen = (memberId, key, label) =>
    setData((d) => ({
      ...d,
      members: d.members.map((m) => {
        if (m.id !== memberId) return m;
        const has = (m.allergies ?? []).some((a) => normalizeAllergenId(a) === key);
        const allergies = has
          ? (m.allergies ?? []).filter((a) => normalizeAllergenId(a) !== key)
          : [...(m.allergies ?? []), label];
        return { ...m, allergies };
      }),
    }));

  const addCustomAllergy = () => {
    const label = titleCase(customAllergy);
    if (!label) return;
    setData((d) => ({
      ...d,
      customAllergies: (d.customAllergies ?? []).includes(label)
        ? d.customAllergies
        : [...(d.customAllergies ?? []), label],
    }));
    setCustomAllergy("");
    setShowAddAllergy(false);
  };

  // Alérgenos personalizados: los añadidos a mano + cualquier alergia guardada
  // que no encaje en los 14 oficiales (datos antiguos o intolerancias propias).
  const customAllergenLabels = Array.from(
    new Set([
      ...(data.customAllergies ?? []),
      ...data.members.flatMap((m) => m.allergies ?? []).filter((a) => !EU_ALLERGEN_IDS.has(normalizeAllergenId(a))),
    ])
  );

  const visibleAllergenIds = [...COMMON_ALLERGEN_IDS, ...EXTRA_ALLERGEN_IDS];


  return (
    <OnboardingShell
      title="¿Qué evitamos?"
      subtitle="Alergias y quién necesita un menú más cuidado"
      bg="#f5f9f6"
      onBack={onBack}
      onReset={onReset}
      onNext={onNext}
      onFinish={onFinish}
      {...(nextLabel ? { nextLabel } : {})}
    >
      <>
          <style>{`
            @keyframes avoidCheckPop {
              0%   { transform: scale(0.4); opacity: 0; }
              55%  { transform: scale(1.25); opacity: 1; }
              100% { transform: scale(1); }
            }
            .avoid-pill { transition: background .15s ease, border-color .15s ease, color .15s ease, box-shadow .15s ease, transform .12s ease; }
            .avoid-pill:hover { transform: translateY(-1px); }
            .avoid-pill:active { transform: translateY(0) scale(.97); }
            .avoid-pill-check { animation: avoidCheckPop .22s cubic-bezier(.34,1.5,.6,1) both; }
            .avoid-row { transition: background .15s ease; }
            .avoid-row:hover { background: #f3f7f4; }
            .avoid-avatar { transition: opacity .15s ease, filter .15s ease, transform .12s ease; }
            .avoid-avatar:hover { transform: translateY(-1px); }
            .avoid-avatar:active { transform: scale(.92); }
          `}</style>

          <AvoidSection
            icon={Zap}
            accent="#dd8a2c"
            title="Alergias"
            right={
              <MemberAvatarSelector
                members={data.members}
                selectedId={activeAllergyMemberId}
                onSelect={setAllergyMemberId}
              />
            }
          >
            <div>
              <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", columnGap: 16 }}>
                {visibleAllergenIds.map((id) => {
                  const meta = EU_ALLERGENS[id];
                  return (
                    <AllergenRow
                      key={id}
                      Icon={meta.Icon}
                      color={meta.color}
                      label={meta.label}
                      checked={activeHasKey(id)}
                      checkColor={activeMemberColor}
                      onToggle={() => activeAllergyMemberId && toggleMemberAllergen(activeAllergyMemberId, id, meta.label)}
                    />
                  );
                })}

                {customAllergenLabels.map((label) => {
                  const key = normalizeAllergenId(label);
                  return (
                    <AllergenRow
                      key={`custom-${label}`}
                      Icon={CircleDot}
                      color="#5a7066"
                      label={label}
                      checked={activeHasKey(key)}
                      checkColor={activeMemberColor}
                      onToggle={() => activeAllergyMemberId && toggleMemberAllergen(activeAllergyMemberId, key, label)}
                    />
                  );
                })}
              </div>

              <div style={{ display: "flex", marginTop: 12 }}>
                <button
                  type="button"
                  onClick={() => setShowAddAllergy((v) => !v)}
                  className="avoid-pill"
                  style={{
                    display: "inline-flex", alignItems: "center", gap: 6, height: 36,
                    padding: "0 15px 0 12px", borderRadius: 10, border: "none",
                    background: showAddAllergy ? "#234a31" : "#2d5a3d", color: "#fff",
                    fontSize: 12.5, fontWeight: 800, cursor: "pointer", fontFamily: "inherit",
                    boxShadow: "0 2px 8px rgba(45,90,61,.3)",
                  }}
                >
                  <Plus size={15} strokeWidth={2.6} /> Añadir otra
                </button>
              </div>

              {showAddAllergy && (
                <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                  <input
                    value={customAllergy}
                    onChange={(e) => setCustomAllergy(e.target.value)}
                    placeholder="Otra alergia o intolerancia"
                    style={{ flex: 1, padding: "9px 12px", borderRadius: 10, border: "1.5px solid #dde7e0", fontSize: 12.5, outline: "none", fontFamily: "inherit" }}
                    onKeyDown={(e) => e.key === "Enter" && addCustomAllergy()}
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={addCustomAllergy}
                    aria-label="Añadir alergia"
                    style={{ width: 40, borderRadius: 10, border: "none", background: "#2d5a3d", color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}
                  >
                    <Check size={16} strokeWidth={3} />
                  </button>
                </div>
              )}
            </div>
          </AvoidSection>

          <AvoidSection
            icon={HeartPulse}
            accent="#3f87b0"
            title="¿Alguien a régimen?"
          >
            <div>
              {data.members.map((m, i) => {
                const on = !!m.regimen;
                const memberColor = memberAvatarColor(m.id, data.members);
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => toggleRegimen(m.id)}
                    className="avoid-row"
                    style={{
                      width: "100%", display: "flex", alignItems: "center", gap: 11,
                      padding: "9px 6px", border: "none", background: "transparent",
                      cursor: "pointer", fontFamily: "inherit", textAlign: "left",
                      borderBottom: i === data.members.length - 1 ? "none" : "1px solid #eef3f0",
                      borderRadius: 8,
                    }}
                  >
                    <span style={{ opacity: on ? 1 : 0.5, filter: on ? "none" : "grayscale(0.4)", lineHeight: 0, transition: "opacity .15s ease, filter .15s ease" }}>
                      <Avatar name={m.name} size={28} color={memberColor} />
                    </span>
                    <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: on ? 800 : 600, color: on ? "#142f1d" : "#41524a", transition: "color .15s ease" }}>
                      {m.name}
                    </span>
                    <span
                      aria-hidden
                      style={{
                        width: 40, height: 23, borderRadius: 999, flexShrink: 0,
                        background: on ? "#2d5a3d" : "#d4ddd7", position: "relative",
                        transition: "background .18s ease",
                      }}
                    >
                      <span
                        style={{
                          position: "absolute", top: 2.5, left: on ? 19.5 : 2.5,
                          width: 18, height: 18, borderRadius: "50%", background: "#fff",
                          boxShadow: "0 1px 2px rgba(20,47,29,.3)", transition: "left .18s ease",
                        }}
                      />
                    </span>
                  </button>
                );
              })}
            </div>
          </AvoidSection>

      </>
    </OnboardingShell>
  );
}

export function OnboardingRepeat({ data, setData, onNext, onBack, onFinish, onReset }) {
  const mealOptions = getMeals(data);

  const updateFixedDish = (idx, patch) =>
    setData((d) => {
      const list = migrateFixedDishes(d.fixedDishes ?? []);
      const next = list.map((fd, i) => (i === idx ? normalizeFixedDish({ ...fd, ...patch }) : fd)).filter(Boolean);
      return { ...d, fixedDishes: next };
    });

  const removeFixedDish = (idx) =>
    setData((d) => ({
      ...d,
      fixedDishes: migrateFixedDishes(d.fixedDishes ?? []).filter((_, i) => i !== idx),
    }));

  const addCatalogDish = (recipe) => {
    const comida = mealOptions.find((m) => m.toLowerCase() === "comida") ?? mealOptions[0] ?? "Comida";
    setData((d) => {
      const list = migrateFixedDishes(d.fixedDishes ?? []);
      if (list.some((fd) => fd.catalogId === recipe.id)) return d;
      const entry = normalizeFixedDish({
        name: recipe.name,
        catalogId: recipe.id,
        timesPerWeek: 1,
        meals: [comida],
      });
      if (!entry) return d;
      return { ...d, fixedDishes: [...list, entry] };
    });
  };

  const removeCatalogDish = (catalogId) =>
    setData((d) => ({
      ...d,
      fixedDishes: migrateFixedDishes(d.fixedDishes ?? []).filter((fd) => fd.catalogId !== catalogId),
    }));

  const setCatalogGarnish = (recipe, garnishId) => {
    const comida = mealOptions.find((m) => m.toLowerCase() === "comida") ?? mealOptions[0] ?? "Comida";
    setData((d) => {
      const list = migrateFixedDishes(d.fixedDishes ?? []);
      const exists = list.some((fd) => fd.catalogId === recipe.id);
      if (!exists) {
        const entry = normalizeFixedDish({
          name: recipe.name,
          catalogId: recipe.id,
          timesPerWeek: 1,
          meals: [comida],
          garnishId: garnishId ?? undefined,
        });
        if (!entry) return d;
        return { ...d, fixedDishes: [...list, entry] };
      }
      const next = list.map((fd) =>
        fd.catalogId === recipe.id
          ? normalizeFixedDish({ ...fd, garnishId: garnishId ?? undefined })
          : fd
      );
      return { ...d, fixedDishes: next };
    });
  };

  const fixedList = migrateFixedDishes(data.fixedDishes ?? []);

  const addedCatalogIds = new Set(fixedList.filter((fd) => fd.catalogId).map((fd) => fd.catalogId));
  const addedGarnishByCatalogId = Object.fromEntries(
    fixedList.filter((fd) => fd.catalogId && fd.garnishId).map((fd) => [fd.catalogId, fd.garnishId])
  );

  return (
    <OnboardingShell
      title="¿Qué repetimos?"
      subtitle="Platos que ya cocináis y queréis ver cada semana"
      bg="#f5f9f6"
      onBack={onBack}
      onReset={onReset}
      onNext={onNext}
      onFinish={onFinish}
    >
      <style>{`
        @keyframes fixedDishIn {
          from { opacity: 0; transform: translateY(-6px) scale(0.97); }
          to   { opacity: 1; transform: translateY(0)    scale(1);    }
        }
      `}</style>

      {/* Platos ya elegidos — resumen editable arriba */}
      {fixedList.length > 0 && (
        <>
          <FixedDishTable
            items={fixedList}
            mealOptions={mealOptions}
            onTimesChange={(idx, n) => updateFixedDish(idx, { timesPerWeek: n })}
            onMealsChange={(idx, meals) => updateFixedDish(idx, { meals })}
            onRemove={(idx) => removeFixedDish(idx)}
          />
          <div style={{ height: 1, background: "#eef3f0", margin: "14px 0 6px" }} />
        </>
      )}

      {/* Catálogo embebido — search, filtros y recetas siempre visibles */}
      <CatalogBrowserSheet
        inline
        addedIds={addedCatalogIds}
        garnishByCatalogId={addedGarnishByCatalogId}
        onAdd={addCatalogDish}
        onRemove={removeCatalogDish}
        onSetGarnish={setCatalogGarnish}
      />
    </OnboardingShell>
  );
}

const GROUP_COLUMN_ORDER = ["Adultos", "Niños", "Bebé"];
const GROUP_COLUMN_ABBREV = { Adultos: "A", Niños: "N", "Bebé": "B" };

function orderedMenuGroups(groups) {
  return GROUP_COLUMN_ORDER.map((label) => groups.find((g) => g.label === label)).filter(Boolean);
}

function applyMemberToGroup(groups, members, memberId, targetGroupId) {
  const member = members.find((m) => m.id === memberId);
  const target = groups.find((g) => g.id === targetGroupId);
  if (!member || !target || !canAssignMemberToGroup(member, target)) return groups;
  return groups.map((g) => ({
    ...g,
    memberIds:
      g.id === targetGroupId
        ? Array.from(new Set([...g.memberIds, memberId]))
        : g.memberIds.filter((id) => id !== memberId),
  }));
}

function GroupAssignmentMatrix({ members, groups, onAssign }) {
  const columns = orderedMenuGroups(groups);
  if (columns.length === 0) return null;

  const gridCols = `minmax(92px, 1.15fr) repeat(${columns.length}, minmax(0, 1fr))`;

  return (
    <div
      style={{
        background: "#f7f9f8",
        borderRadius: 12,
        padding: "12px 10px 10px",
      }}
    >
      {/* Column headers — labels verticales alineados con las celdas */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: gridCols,
          gap: 8,
          marginBottom: 8,
          alignItems: "end",
        }}
      >
        <div />
        {columns.map((g) => (
          <div
            key={g.id}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 4,
            }}
          >
            <span
              style={{
                width: 34,
                height: 34,
                borderRadius: 999,
                border: `2px solid ${g.color}`,
                color: g.color,
                fontSize: 13,
                fontWeight: 900,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                background: "#fff",
              }}
            >
              {GROUP_COLUMN_ABBREV[g.label] ?? g.label.charAt(0)}
            </span>
            <span
              style={{
                fontSize: 10,
                fontWeight: 800,
                color: g.color,
                textAlign: "center",
                lineHeight: 1.15,
              }}
            >
              {g.label}
            </span>
          </div>
        ))}
      </div>

      <div style={{ height: 1, background: "#dde8e1", margin: "0 2px 12px" }} />

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {members.map((member) => {
          const assignableIds = new Set(
            groupsAvailableForMember(member, groups).map((g) => g.id)
          );
          return (
            <div
              key={member.id}
              style={{
                display: "grid",
                gridTemplateColumns: gridCols,
                gap: 8,
                alignItems: "center",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 7,
                  minWidth: 0,
                }}
              >
                <Avatar name={member.name} size={24} />
                <span
                  style={{
                    fontSize: 13,
                    fontWeight: 800,
                    color: "#1a3a24",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {member.name}
                </span>
              </div>

              {columns.map((g) => {
                const canAssign = assignableIds.has(g.id);
                const selected = g.memberIds.includes(member.id);
                const abbrev = GROUP_COLUMN_ABBREV[g.label] ?? g.label.charAt(0);

                if (!canAssign) {
                  return (
                    <div
                      key={g.id}
                      style={{
                        height: 52,
                        borderRadius: 14,
                        background: "#f0f4f1",
                        opacity: 0.35,
                      }}
                    />
                  );
                }

                return (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => onAssign(member.id, g.id)}
                    style={{
                      height: 52,
                      borderRadius: 14,
                      border: "none",
                      background: selected ? g.color : "#f4f7f5",
                      color: selected ? "#fff" : g.color,
                      boxShadow: selected ? `0 3px 10px ${g.color}55` : "none",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 3,
                      cursor: "pointer",
                      fontFamily: "inherit",
                      transition: "background .15s ease, box-shadow .15s ease",
                    }}
                  >
                    <span style={{ fontSize: 15, fontWeight: 900, lineHeight: 1 }}>{abbrev}</span>
                    <span
                      style={{
                        fontSize: 9,
                        fontWeight: 800,
                        opacity: selected ? 0.92 : 0.55,
                        lineHeight: 1,
                      }}
                    >
                      {g.label}
                    </span>
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function GroupAssignmentSheet({ members, groups, showBabyHint, onAssign, onConfirm, onCancel }) {
  return (
    <div
      onClick={onCancel}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,.45)",
        zIndex: 150,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px 16px",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#fff",
          borderRadius: 20,
          width: "100%",
          maxWidth: 420,
          padding: "14px 16px 20px",
          maxHeight: "75dvh",
          overflowY: "auto",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 10,
          }}
        >
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: "#1a3a24" }}>
            Asigna cada persona a su menú
          </h3>
          <button
            type="button"
            onClick={onCancel}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "#aaa",
              padding: 4,
              display: "flex",
            }}
          >
            <X size={18} />
          </button>
        </div>

        {showBabyHint && (
          <p
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: "#5a7a66",
              margin: "0 0 12px",
              lineHeight: 1.45,
            }}
          >
            Los bebés tienen menú propio con purés y texturas adaptadas.
          </p>
        )}

        <GroupAssignmentMatrix members={members} groups={groups} onAssign={onAssign} />

        <button
          type="button"
          onClick={onConfirm}
          style={{
            width: "100%",
            marginTop: 16,
            background: "#1a3a24",
            color: "#fff",
            border: "none",
            borderRadius: 14,
            padding: "14px 16px",
            fontSize: 15,
            fontWeight: 800,
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          Listo
        </button>
      </div>
    </div>
  );
}

// Each entry maps to its onboarding step index so the bubble can list only the
// screens the user will actually see (e.g. "Menú del cole" is hidden when there
// are no kids/babies in the house).
const AFINAR_WIZARD_STEPS = [
  { step: 2, Icon: School, label: "Menú del cole", desc: "Sube el PDF o foto del comedor" },
  { step: 3, Icon: CalendarDays, label: "Semana", desc: "Elige qué semana planificar" },
  { step: 4, Icon: House, label: "Horario", desc: "Quién come en casa cada día" },
  { step: 5, Icon: HeartPulse, label: "Estilo", desc: "El tipo de comida que os gusta" },
  { step: 6, Icon: UtensilsCrossed, label: "Alergias y gustos", desc: "Lo que hay que evitar" },
  { step: 7, Icon: Repeat, label: "Platos fijos", desc: "Los que no pueden faltar" },
  { step: 8, Icon: ChefHat, label: "Cocina", desc: "Tu nivel y herramientas" },
];

export function AfinarWizardBubble({ onClose, visibleSteps }) {
  const steps = visibleSteps
    ? AFINAR_WIZARD_STEPS.filter((s) => visibleSteps.includes(s.step))
    : AFINAR_WIZARD_STEPS;
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 200,
        background: "rgba(20,47,29,.32)",
        backdropFilter: "blur(2px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "0 16px",
        animation: "afinarFadeIn .2s ease",
      }}
      onClick={onClose}
    >
      <style>{`
        @keyframes afinarFadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes afinarPop {
          0%   { opacity: 0; transform: translateY(18px) scale(.94); }
          60%  { transform: translateY(-3px) scale(1.01); }
          100% { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes afinarBob {
          0%, 100% { transform: translateY(0) rotate(-4deg); }
          50%      { transform: translateY(-4px) rotate(-4deg); }
        }
      `}</style>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: "relative",
          width: "100%",
          maxWidth: 380,
          background: "#fff",
          borderRadius: 24,
          padding: "22px 20px 18px",
          boxShadow: "0 18px 50px rgba(20,47,29,.32)",
          animation: "afinarPop .38s cubic-bezier(.34,1.56,.5,1) both",
        }}
      >
        {/* cartoon mascot bubble */}
        <div
          style={{
            position: "absolute",
            top: -26,
            left: 22,
            width: 52,
            height: 52,
            borderRadius: "50% 50% 50% 8px",
            background: "linear-gradient(135deg, #2d5a3d, #4cba6e)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "0 6px 16px rgba(45,90,61,.4)",
            animation: "afinarBob 2.4s ease-in-out infinite",
          }}
        >
          <Wand2 size={24} color="#fff" />
        </div>

        <div style={{ marginTop: 14 }}>
          <h3 style={{ margin: "0 0 5px", fontSize: 19, fontWeight: 900, color: "#142f1d", letterSpacing: "-.4px" }}>
            Afinamos tu menú a tu gusto
          </h3>
          <p style={{ margin: "0 0 14px", fontSize: 13, color: "#5a7a66", lineHeight: 1.45 }}>
            Puedes generar el menú ya mismo o afinarlo antes: afinar es totalmente
            opcional, pero cuanto más nos cuentes, más acertaremos con vuestros
            gustos. Esto es lo que puedes afinar:
          </p>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 8,
            marginBottom: 4,
          }}
        >
          {steps.map((s) => (
            <div
              key={s.label}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "7px 9px",
                borderRadius: 11,
                background: "#f4f9f5",
              }}
            >
              <span
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 8,
                  flexShrink: 0,
                  background: "#e4efe7",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <s.Icon size={15} color="#2d5a3d" />
              </span>
              <span style={{ minWidth: 0 }}>
                <span style={{ display: "block", fontSize: 11.5, fontWeight: 800, color: "#142f1d", lineHeight: 1.15 }}>
                  {s.label}
                </span>
                <span style={{ display: "block", fontSize: 9.5, color: "#7a9080", lineHeight: 1.2, marginTop: 1 }}>
                  {s.desc}
                </span>
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// Full-screen modal (same look & feel as AfinarWizardBubble) that appears when
// a member is detected as a baby, explaining the baby menu and offering to
// promote them to "Hijo/a" if they already eat like a kid.
export function BabyMenuBubble({ member, onKeep, onPromote }) {
  if (!member) return null;
  const firstName = (member.name || "").trim().split(/\s+/)[0] || "tu peque";
  const points = [
    {
      Icon: Baby,
      text: (
        <>
          Has marcado a <strong>{firstName}</strong> como <strong>Bebé</strong>.
        </>
      ),
    },
    {
      Icon: UtensilsCrossed,
      text: (
        <>
          Por eso le prepararemos un <strong>menú de bebé</strong>: purés,
          texturas suaves, sin sal añadida ni alérgenos comunes.
        </>
      ),
    },
    {
      Icon: Repeat,
      text: (
        <>
          Si ya come como un niño, cámbialo a <strong>Hijo/a</strong> y comerá
          lo mismo que el resto de la familia.
        </>
      ),
    },
  ];
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 210,
        background: "rgba(20,47,29,.32)",
        backdropFilter: "blur(2px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "0 16px",
        animation: "afinarFadeIn .2s ease",
      }}
      onClick={onKeep}
    >
      <style>{`
        @keyframes afinarFadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes afinarPop {
          0%   { opacity: 0; transform: translateY(18px) scale(.94); }
          60%  { transform: translateY(-3px) scale(1.01); }
          100% { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes afinarBob {
          0%, 100% { transform: translateY(0) rotate(-4deg); }
          50%      { transform: translateY(-4px) rotate(-4deg); }
        }
      `}</style>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: "relative",
          width: "100%",
          maxWidth: 380,
          background: "#fff",
          borderRadius: 24,
          padding: "22px 20px 18px",
          boxShadow: "0 18px 50px rgba(20,47,29,.32)",
          animation: "afinarPop .38s cubic-bezier(.34,1.56,.5,1) both",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: -26,
            left: 22,
            width: 52,
            height: 52,
            borderRadius: "50% 50% 50% 8px",
            background: "linear-gradient(135deg, #2d5a3d, #4cba6e)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "0 6px 16px rgba(45,90,61,.4)",
            animation: "afinarBob 2.4s ease-in-out infinite",
          }}
        >
          <Baby size={24} color="#fff" />
        </div>

        <div style={{ marginTop: 14 }}>
          <h3 style={{ margin: "0 0 5px", fontSize: 19, fontWeight: 900, color: "#142f1d", letterSpacing: "-.4px" }}>
            Menú de bebé para {firstName}
          </h3>
          <p style={{ margin: "0 0 14px", fontSize: 13, color: "#5a7a66", lineHeight: 1.45 }}>
            Lo hemos asignado por defecto según su edad. Para que no haya
            sorpresas, esto es lo que implica:
          </p>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
          {points.map((p, i) => (
            <div
              key={i}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "9px 11px",
                borderRadius: 12,
                background: "#f4f9f5",
              }}
            >
              <span
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: 9,
                  flexShrink: 0,
                  background: "#e4efe7",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <p.Icon size={16} color="#2d5a3d" />
              </span>
              <span style={{ fontSize: 12.5, color: "#33513e", lineHeight: 1.4 }}>
                {p.text}
              </span>
            </div>
          ))}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <button
            type="button"
            onClick={onKeep}
            style={{
              width: "100%",
              padding: "12px 16px",
              borderRadius: 13,
              border: "none",
              background: "linear-gradient(135deg, #2d5a3d, #4cba6e)",
              color: "#fff",
              fontSize: 14.5,
              fontWeight: 800,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            Sí, es un bebé
          </button>
          <button
            type="button"
            onClick={onPromote}
            style={{
              width: "100%",
              padding: "11px 16px",
              borderRadius: 13,
              border: "1.5px solid #cfe0d4",
              background: "#fff",
              color: "#2d5a3d",
              fontSize: 13.5,
              fontWeight: 800,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            Ya come como un niño/a
          </button>
        </div>
      </div>
    </div>
  );
}

export function OnboardingMenuModel({ data, setData, onNext, onBack, onFinish, onReset }) {
  const models = [
    {
      id: "same",
      Icon: Users,
      label: "Todos comemos lo mismo",
      desc: "Un único menú para toda la familia",
    },
    {
      id: "separate",
      Icon: GitBranch,
      label: "Menús separados",
      desc: "Un menú por grupo — adultos, niños y bebé si hace falta",
    },
  ];

  const membersWithAge = data.members.map((m) => ({ ...m, age: memberAge(m) }));
  const showBabyHint = hasBabyMember(membersWithAge);
  const [assignmentOpen, setAssignmentOpen] = useState(false);
  const [draftGroups, setDraftGroups] = useState(null);

  const buildGroups = (members, modelId) =>
    migrateGroupsForBabies(
      members.map((m) => ({ ...m, age: memberAge(m) })),
      groupsFromModel(
        members.map((m) => ({ ...m, age: memberAge(m) })),
        modelId
      ),
      modelId
    );

  const needsAssignmentPopup = (groups, modelId) =>
    modelId === "separate" && groups.length > 1;

  const pickModel = (modelId) => {
    if (modelId === "same") {
      setDraftGroups(null);
      setAssignmentOpen(false);
      setData((d) => ({ ...d, menuModel: "same", groups: buildGroups(d.members, "same") }));
      return;
    }

    // Reuse the already-confirmed assignment when it exists, so reopening
    // this screen (or clicking the card again to review it) never discards
    // manual reassignments — it always lands back on the same menu split.
    const reuseExisting =
      data.menuModel === "separate" && Array.isArray(data.groups) && data.groups.length > 0;
    const groups = reuseExisting ? data.groups : buildGroups(data.members, "separate");

    if (needsAssignmentPopup(groups, "separate")) {
      setDraftGroups(groups);
      setAssignmentOpen(true);
      if (!reuseExisting) setData((d) => ({ ...d, menuModel: null }));
      return;
    }
    setDraftGroups(null);
    setAssignmentOpen(false);
    setData((d) => ({ ...d, menuModel: "separate", groups }));
  };

  const confirmAssignment = () => {
    if (!draftGroups) return;
    setData((d) => ({ ...d, menuModel: "separate", groups: draftGroups }));
    setDraftGroups(null);
    setAssignmentOpen(false);
  };

  const cancelAssignment = () => {
    // Don't touch menuModel/groups: if there was already a confirmed
    // "separate" assignment it stays untouched; if this was a first-time
    // pick, pickModel already cleared menuModel to keep "Siguiente" disabled.
    setDraftGroups(null);
    setAssignmentOpen(false);
  };

  const canProceed = data.menuModel === "same" || data.menuModel === "separate";

  return (
    <OnboardingShell
      title="¿Cómo coméis en casa?"
      subtitle="Elige cómo organizar el menú familiar"
      onBack={onBack}
      onReset={onReset}
      onNext={onNext}
      onFinish={onFinish}
      nextDisabled={!canProceed}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 14, marginBottom: 14 }}>
        {models.map((m) => {
          const sel = data.menuModel === m.id;
          return (
            <button
              key={m.id}
              type="button"
              onClick={() => pickModel(m.id)}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 12,
                width: "100%",
                textAlign: "center",
                padding: "28px 20px",
                borderRadius: 18,
                cursor: "pointer",
                background: sel ? "#2d5a3d" : "#f7f9f8",
                border: `2.5px solid ${sel ? "#2d5a3d" : "#e8ede9"}`,
                boxShadow: sel ? "0 4px 18px rgba(45,90,61,.25)" : "none",
                transition: "all .18s ease",
              }}
            >
              <span
                style={{
                  width: 68,
                  height: 68,
                  borderRadius: 20,
                  background: sel ? "rgba(255,255,255,.18)" : "#edf2ee",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  transition: "background .18s ease",
                }}
              >
                <m.Icon size={36} color={sel ? "#fff" : "#2d5a3d"} />
              </span>
              <span>
                <div style={{ fontWeight: 800, color: sel ? "#fff" : "#1a3a24", fontSize: 16, marginBottom: 4 }}>{m.label}</div>
                <div style={{ fontSize: 13, color: sel ? "rgba(255,255,255,.75)" : "#7a9080", lineHeight: 1.4 }}>{m.desc}</div>
              </span>
              {sel && (
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                    background: "rgba(255,255,255,.2)",
                    color: "#fff",
                    fontSize: 12,
                    fontWeight: 700,
                    padding: "4px 10px",
                    borderRadius: 20,
                  }}
                >
                  <Check size={12} /> Seleccionado
                </span>
              )}
            </button>
          );
        })}
      </div>

      {data.menuModel === "same" && showBabyHint && (
        <p
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: "#5a7a66",
            margin: "0 0 4px",
            lineHeight: 1.45,
            textAlign: "center",
          }}
        >
          Los bebés tendrán menú adaptado automáticamente.
        </p>
      )}

      {data.menuModel === "separate" && !assignmentOpen && (
        <div style={{ display: "flex", justifyContent: "center" }}>
          <button
            type="button"
            onClick={() => pickModel("separate")}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              background: "none",
              border: "none",
              color: "#2d5a3d",
              fontSize: 12.5,
              fontWeight: 800,
              cursor: "pointer",
              fontFamily: "inherit",
              padding: "6px 4px",
            }}
          >
            <GitBranch size={13} /> Editar quién va en cada menú
          </button>
        </div>
      )}

      {assignmentOpen && draftGroups && (
        <GroupAssignmentSheet
          members={data.members}
          groups={draftGroups}
          showBabyHint={showBabyHint}
          onAssign={(memberId, targetGroupId) =>
            setDraftGroups((groups) =>
              applyMemberToGroup(groups, data.members, memberId, targetGroupId)
            )
          }
          onConfirm={confirmAssignment}
          onCancel={cancelAssignment}
        />
      )}
    </OnboardingShell>
  );
}

// ─── Schedule (group + individual editing) ────────────────────

const SLOT_CONFIG = {
  casa:   { label: "En casa",     color: "#4cba6e" },
  tupper: { label: "Tupper",      color: "#c05c3a" },
  fuera:  { label: "Come fuera",  color: "#3d6b8a" },
  cole:   { label: "Comedor",     color: "#c05c3a" },
};

const MIXED_COLOR = "#aaa";

const QF_WEEKDAYS = DAYS.filter((d) => !["Sáb", "Dom"].includes(d));
const QF_WEEKEND = DAYS.filter((d) => ["Sáb", "Dom"].includes(d));
const QF_BLOCKS = [
  { key: "weekday", label: "Entre semana", days: QF_WEEKDAYS },
  { key: "weekend", label: "El finde", days: QF_WEEKEND },
];

/** Guess the quick-fill value for a block + meal from the current schedule. */
function inferQuickFillValue(schedule, memberIds, members, days, meal) {
  const values = [];
  for (const day of days) {
    for (const id of memberIds) {
      const member = members.find((m) => m.id === id);
      const isKid = member ? stageForAge(memberAge(member)).id !== "adulto" : false;
      let v = schedule[`${id}|${day}|${meal}`] ?? "casa";
      if (!isKid && v === "cole") v = "casa";
      values.push(v);
    }
  }
  if (values.length === 0) return "casa";
  if (values.every((v) => v === "cole")) return "cole";
  if (values.every((v) => v === "fuera")) return "fuera";
  return "casa";
}

export function OnboardingSchedule({ data, setData, onNext, onBack, onFinish, onReset }) {
  const meals = getMeals(data);
  const memberList = useMemo(() => data.members ?? [], [data.members]);
  const [sheetSlot, setSheetSlot] = useState(null);
  const [quickFillOpen, setQuickFillOpen] = useState(false);
  // Quick-fill answers keyed by `${blockKey}|${meal}` (e.g. "weekday|Comida").
  const [qf, setQf] = useState({});
  // Which meal the quick-fill sheet is currently editing (Comida / Cena tab).
  const [qfMeal, setQfMeal] = useState("Comida");
  const [dayViewOpen, setDayViewOpen] = useState(false);
  const [dayViewIdx, setDayViewIdx] = useState(0);

  const subjectMemberIds = useMemo(() => memberList.map((m) => m.id), [memberList]);
  const subjectMembers = memberList;
  const allowCole = memberList.some(
    (m) => stageForAge(memberAge(m)).id !== "adulto"
  );

  // Sheet state: { day, meal | null } — when meal is null, the sheet is in
  // "day mode" (only row-level actions, no per-member edition for a slot).
  const [toast, setToast] = useState(null);
  const mainMeal = primaryDayMeal(data);

  const hasSchoolMenuLoaded = useMemo(() => {
    const sm = data.schoolMenus ?? { shared: {}, byMember: {} };
    if (hasAnySchoolDish(sm.shared)) return true;
    return Object.values(sm.byMember ?? {}).some((m) => hasAnySchoolDish(m));
  }, [data.schoolMenus]);

  const showToast = (msg) => {
    setToast(msg);
    window.clearTimeout(showToast._t);
    showToast._t = window.setTimeout(() => setToast(null), 2400);
  };

  const setSlots = (memberIds, day, meal, value) => {
    if (memberIds.length === 0) return;
    setData((d) => {
      const next = { ...d.schedule };
      for (const id of memberIds) {
        next[`${id}|${day}|${meal}`] = value;
      }
      return { ...d, schedule: next };
    });
  };

  const setMemberSlot = (memberId, day, meal, value) => {
    setData((d) => ({
      ...d,
      schedule: { ...d.schedule, [`${memberId}|${day}|${meal}`]: value },
    }));
  };

  const openCell = (day, meal) => {
    if (subjectMemberIds.length === 0) return;
    setSheetSlot({ day, meal });
  };

  const countMixedCells = (memberIds, schedule) => {
    if (memberIds.length <= 1) return 0;
    let count = 0;
    for (const day of DAYS) {
      for (const meal of meals) {
        const states = memberIds.map((id) => schedule[`${id}|${day}|${meal}`] ?? "casa");
        if (states.some((s) => s !== states[0])) count += 1;
      }
    }
    return count;
  };

  const applyPreset = (preset) => {
    if (subjectMemberIds.length === 0) return;
    const overwritten =
      subjectMemberIds.length > 1 ? countMixedCells(subjectMemberIds, data.schedule) : 0;
    setData((d) => {
      const next = { ...d.schedule };
      const colable = subjectMembers.some(
        (m) => stageForAge(memberAge(m)).id !== "adulto"
      );
      const main = primaryDayMeal(d);
      const dayMeals = getMeals(d);
      for (const day of DAYS) {
        const isWeekday = !["Sáb", "Dom"].includes(day);
        for (const meal of dayMeals) {
          const isMain = meal === main;
          let value;
          if (preset === "casa-todo") value = "casa";
          else if (preset === "tupper-laborable")
            value = isWeekday && isMain ? "tupper" : "casa";
          else if (preset === "cole-laborable")
            value = isWeekday && isMain ? (colable ? "cole" : "fuera") : "casa";
          else if (preset === "fuera-finde") value = !isWeekday ? "fuera" : "casa";
          else continue;
          for (const id of subjectMemberIds) {
            next[`${id}|${day}|${meal}`] = value;
          }
        }
      }
      return { ...d, schedule: next };
    });
    if (overwritten > 0) {
      showToast(
        `Se igualaron ${overwritten} ${
          overwritten === 1 ? "celda con variaciones" : "celdas con variaciones"
        }`
      );
    }
  };

  const applyQuickFill = () => {
    setData((d) => {
      const next = { ...d.schedule };
      const dayMeals = getMeals(d);
      for (const id of subjectMemberIds) {
        const member = d.members.find((m) => m.id === id);
        const isKid = member ? stageForAge(memberAge(member)).id !== "adulto" : false;
        for (const block of QF_BLOCKS) {
          for (const day of block.days) {
            for (const meal of dayMeals) {
              const chosen = qf[`${block.key}|${meal}`] ?? "casa";
              const value = chosen === "cole" ? (isKid ? "cole" : "casa") : chosen;
              next[`${id}|${day}|${meal}`] = value;
            }
          }
        }
      }
      return { ...d, schedule: next };
    });
    setQuickFillOpen(false);
  };

  const openQuickFill = () => {
    const next = {};
    for (const block of QF_BLOCKS) {
      for (const meal of meals) {
        next[`${block.key}|${meal}`] = inferQuickFillValue(
          data.schedule,
          subjectMemberIds,
          subjectMembers,
          block.days,
          meal
        );
      }
    }
    setQf(next);
    setQfMeal(meals[0] ?? "Comida");
    setQuickFillOpen(true);
  };

  const toggleDayMeal = (meal) => {
    setData((d) => {
      const cur = getMeals(d);
      const selected = cur.includes(meal);
      if (selected && cur.length <= 1) return d;
      const nextSet = selected ? cur.filter((m) => m !== meal) : [...cur, meal];
      const nextMeals = ALL_DAY_MEALS.filter((m) => nextSet.includes(m));
      return { ...d, meals: nextMeals };
    });
  };

  if (data.members.length === 0) {
    return (
      <OnboardingShell title="Planificación" onBack={onBack}>
        <p style={{ color: "#888" }}>Añade algún miembro primero.</p>
      </OnboardingShell>
    );
  }

  const subjectLabel = "la familia";

  const openDay = (day) => {
    if (subjectMemberIds.length === 0) return;
    setSheetSlot({ day, meal: mainMeal });
  };

  return (
    <OnboardingShell
      title="¿Dónde coméis?"
      subtitle="Marca dónde come cada uno durante la semana"
      onBack={onBack}
      onReset={onReset}
      onNext={onNext}
      onFinish={onFinish}
    >

      <div style={{ height: 1, background: "#d6e9dc", margin: "20px 0" }} />
      <SectionTitle>¿Qué comidas quieres organizar?</SectionTitle>
      <div style={{ display: "flex", gap: 8, marginBottom: 28 }}>
        {ALL_DAY_MEALS.filter((meal) => meal !== "Desayuno").map((meal) => {
          const sel = meals.includes(meal);
          const MealIcon = meal === "Comida" ? Sun : Moon;
          return (
            <button
              key={meal}
              type="button"
              onClick={() => toggleDayMeal(meal)}
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 6,
                padding: "14px 8px 12px",
                borderRadius: 14,
                cursor: "pointer",
                background: sel ? "#2d5a3d" : "#f4f7f5",
                border: `1.5px solid ${sel ? "#2d5a3d" : "#e3ebe6"}`,
                color: sel ? "#fff" : "#9ab0a1",
                transition: "all .15s ease",
                fontFamily: "inherit",
              }}
            >
              <MealIcon size={20} />
              <span style={{ fontSize: 12, fontWeight: 700 }}>{meal}</span>
            </button>
          );
        })}
      </div>

      {hasSchoolMenuLoaded && allowCole && (
        <div
          style={{
            padding: "8px 10px",
            borderRadius: 10,
            background: "rgba(61,122,82,.1)",
            border: "1px solid rgba(45,90,61,.2)",
            fontSize: 11,
            color: "#2d5a3d",
            marginBottom: 12,
            fontWeight: 600,
          }}
        >
          Menú del cole cargado — «Cole L-V» solo aplica a niños/as en {mainMeal.toLowerCase()}.
        </div>
      )}

      <div style={{ height: 1, background: "#d6e9dc", margin: "20px 0 18px" }} />
      <style>{`
        @keyframes qfSlideUp {
          from { transform: translateY(100%); opacity: 0; }
          to   { transform: translateY(0);    opacity: 1; }
        }
        @keyframes qfFadeIn {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
      `}</style>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
        {/* Semana / Día toggle — alineado a la izquierda donde estaba "Tu semana" */}
        <div style={{
          display: "flex", background: "#f0f4f1", borderRadius: 10, padding: 3, gap: 2,
        }}>
          <button
            type="button"
            onClick={() => setDayViewOpen(false)}
            style={{
              padding: "4px 10px", borderRadius: 8, border: "none", fontSize: 11, fontWeight: 700,
              background: !dayViewOpen ? "#fff" : "transparent",
              color: !dayViewOpen ? "#1a3a24" : "#9ab0a1",
              boxShadow: !dayViewOpen ? "0 1px 4px rgba(0,0,0,.1)" : "none",
              cursor: "pointer", fontFamily: "inherit", transition: "all .15s ease",
            }}
          >
            Semana
          </button>
          <button
            type="button"
            onClick={() => { setDayViewIdx(0); setDayViewOpen(true); }}
            style={{
              padding: "4px 10px", borderRadius: 8, border: "none", fontSize: 11, fontWeight: 700,
              background: dayViewOpen ? "#2d5a3d" : "transparent",
              color: dayViewOpen ? "#fff" : "#9ab0a1",
              boxShadow: dayViewOpen ? "0 1px 4px rgba(45,90,61,.3)" : "none",
              cursor: "pointer", fontFamily: "inherit", transition: "all .15s ease",
            }}
          >
            Día
          </button>
        </div>
        <button
            type="button"
            onClick={openQuickFill}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 7,
              padding: "6px 12px 6px 7px",
              borderRadius: 999,
              border: "1.5px solid #d4e6da",
              background: "#f0f7f2",
              color: "#2d5a3d",
              fontSize: 12,
              fontWeight: 700,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            <span style={{
              width: 22, height: 22, borderRadius: "50%",
              background: "#2d5a3d",
              display: "inline-flex", alignItems: "center", justifyContent: "center",
              flexShrink: 0,
            }}>
              <Zap size={12} color="#fff" />
            </span>
            Acciones rápidas
          </button>
      </div>

      {quickFillOpen && (
        <div
          onClick={() => setQuickFillOpen(false)}
          style={{
            position: "fixed", inset: 0,
            background: "rgba(0,0,0,.45)",
            zIndex: 200,
            display: "flex", alignItems: "flex-end", justifyContent: "center",
            animation: "qfFadeIn .2s ease-out",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "#fff",
              borderRadius: "22px 22px 0 0",
              width: "100%", maxWidth: 420,
              padding: "24px 20px calc(28px + env(safe-area-inset-bottom, 0px))",
              animation: "qfSlideUp .28s cubic-bezier(.32,1,.28,1)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{
                  width: 36, height: 36, borderRadius: "50%",
                  background: "#1a3a24",
                  display: "inline-flex", alignItems: "center", justifyContent: "center",
                }}>
                  <Zap size={16} color="#fff" />
                </span>
                <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: "#1a3a24" }}>
                  Semana de la familia
                </h3>
              </div>
              <button
                type="button" onClick={() => setQuickFillOpen(false)}
                style={{ background: "none", border: "none", cursor: "pointer", color: "#aaa", padding: 4, display: "flex" }}
              >
                <X size={20} />
              </button>
            </div>

            <p style={{ fontSize: 13, color: "#999", margin: "0 0 22px", lineHeight: 1.5 }}>
              Dinos dónde coméis en cada momento y rellenamos la semana entera de golpe. Luego puedes retocar días sueltos.
            </p>

            {meals.length > 1 && (
              <div style={{ display: "flex", background: "#f0f4f1", borderRadius: 12, padding: 4, gap: 3, marginBottom: 20 }}>
                {meals.map((meal) => {
                  const active = qfMeal === meal;
                  const MealIcon = meal === "Comida" ? Sun : Moon;
                  return (
                    <button
                      key={meal}
                      type="button"
                      onClick={() => setQfMeal(meal)}
                      style={{
                        flex: 1,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 6,
                        padding: "9px 8px",
                        borderRadius: 9,
                        border: "none",
                        fontSize: 13,
                        fontWeight: 800,
                        cursor: "pointer",
                        fontFamily: "inherit",
                        background: active ? "#2d5a3d" : "transparent",
                        color: active ? "#fff" : "#9ab0a1",
                        boxShadow: active ? "0 2px 8px rgba(45,90,61,.35)" : "none",
                        transition: "all .15s ease",
                      }}
                    >
                      <MealIcon size={14} />
                      {meal}
                    </button>
                  );
                })}
              </div>
            )}

            {QF_BLOCKS.map((block, i) => {
              const isLunch = qfMeal === "Comida";
              const qKey = `${block.key}|${qfMeal}`;
              const verb = qfMeal === "Cena" ? "cenáis" : "coméis";
              const blockText = block.key === "weekday" ? "entre semana" : "el finde";
              const options = [
                { value: "casa", icon: <House size={15} />, label: "En casa" },
                ...(block.key === "weekday" && allowCole && isLunch
                  ? [{ value: "cole", icon: <School size={15} />, label: "Al cole" }]
                  : []),
                { value: "fuera", icon: <UtensilsCrossed size={15} />, label: "Fuera" },
              ];
              return (
                <div key={block.key} style={{ marginBottom: i === QF_BLOCKS.length - 1 ? 26 : 18 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#1a3a24", marginBottom: 10 }}>
                    ¿Dónde {verb} {blockText}?
                  </div>
                  <QuickFillSegment
                    value={qf[qKey] ?? "casa"}
                    onChange={(v) => setQf((prev) => ({ ...prev, [qKey]: v }))}
                    options={options}
                  />
                </div>
              );
            })}

            <button
              type="button"
              onClick={applyQuickFill}
              style={{
                width: "100%",
                background: "#1a3a24",
                color: "#fff",
                border: "none",
                borderRadius: 14,
                padding: "16px",
                fontSize: 15,
                fontWeight: 800,
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              Aplicar a la semana
            </button>
          </div>
        </div>
      )}

      <ScheduleGrid
        meals={meals}
        memberIds={subjectMemberIds}
        schedule={data.schedule}
        onCellClick={openCell}
        onDayClick={openDay}
      />
      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 8, marginBottom: 12 }}>
        <div style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid #e3ebe6", background: "#fafcfb" }}>
          <SheetIconLegend columns={sheetColumns(allowCole)} compact />
        </div>
      </div>

      {sheetSlot && (
        <ScheduleSlotSheet
          day={sheetSlot.day}
          meal={sheetSlot.meal}
          members={subjectMembers}
          schedule={data.schedule}
          allowCole={allowCole}
          onClose={() => setSheetSlot(null)}
          onSetMember={(memberId, value) =>
            setMemberSlot(memberId, sheetSlot.day, sheetSlot.meal, value)
          }
          onSetAllSlot={(value) => {
            setSlots(subjectMemberIds, sheetSlot.day, sheetSlot.meal, value);
          }}
        />
      )}

      {toast && (
        <div
          style={{
            position: "fixed",
            bottom: 80,
            left: "50%",
            transform: "translateX(-50%)",
            background: "#1a3a24",
            color: "#fff",
            padding: "10px 18px",
            borderRadius: 24,
            fontSize: 13,
            fontWeight: 600,
            boxShadow: "0 6px 22px rgba(0,0,0,.2)",
            zIndex: 200,
            maxWidth: 320,
            textAlign: "center",
          }}
        >
          {toast}
        </div>
      )}

      {dayViewOpen && (
        <DayView
          days={DAYS}
          meals={meals}
          members={memberList}
          schedule={data.schedule}
          coleAllowedIds={new Set(memberList.filter((m) => stageForAge(memberAge(m)).id !== "adulto").map((m) => m.id))}
          dayIdx={dayViewIdx}
          onDayChange={setDayViewIdx}
          onClose={() => setDayViewOpen(false)}
          onSetMemberSlot={(memberId, day, meal, value) =>
            setMemberSlot(memberId, day, meal, value)
          }
        />
      )}
    </OnboardingShell>
  );
}

const SLOT_COLUMNS = ["casa", "cole", "fuera"];

function sheetColumns(showCole) {
  return showCole ? SLOT_COLUMNS : SLOT_COLUMNS.filter((s) => s !== "cole");
}

function SheetIconLegend({ columns, compact = false }) {
  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: compact ? "4px 10px" : "6px 12px",
        marginBottom: compact ? 0 : 10,
        justifyContent: compact ? "flex-end" : "flex-start",
      }}
    >
      {columns.map((s) => {
        const c = SLOT_CONFIG[s].color;
        return (
          <span
            key={s}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              fontSize: 10,
              fontWeight: 600,
              color: "#666",
            }}
          >
            <span style={{ color: c, display: "inline-flex" }}>{stateIcon(s, 12)}</span>
            {SLOT_CONFIG[s].label}
          </span>
        );
      })}
    </div>
  );
}

function ScheduleSlotSheet({
  day,
  meal,
  members,
  schedule,
  allowCole,
  onClose,
  onSetMember,
  onSetAllSlot,
}) {
  const dayName = dayLabel(day);
  const columns = sheetColumns(allowCole);
  const title = `${meal} del ${dayName.toLowerCase()}`;

  // "Todos" consensus — highlight only when every member matches
  const allValues = members.map((m) => schedule[`${m.id}|${day}|${meal}`] ?? "casa");
  const todosConsensus = allValues.every((v) => v === allValues[0]) ? allValues[0] : null;

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,.45)",
        zIndex: 150, display: "flex", alignItems: "center", justifyContent: "center",
        padding: "24px 16px",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#fff", borderRadius: 20,
          width: "100%", maxWidth: 420,
          padding: "14px 16px 20px",
          maxHeight: "60dvh", overflowY: "auto",
        }}
      >
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: "#1a3a24", textTransform: "capitalize" }}>
            {title}
          </h3>
          <button type="button" onClick={onClose}
            style={{ background: "none", border: "none", cursor: "pointer", color: "#aaa", padding: 4, display: "flex" }}>
            <X size={18} />
          </button>
        </div>

        {/* Todos row */}
        {members.length > 1 && (
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 10, fontWeight: 800, color: "#aaa", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>
              Todos
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              {columns.map((s) => {
                const conf = SLOT_CONFIG[s] ?? SLOT_CONFIG.casa;
                const selected = todosConsensus === s;
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => onSetAllSlot(s)}
                    style={{
                      flex: 1, height: 56, borderRadius: 14, border: "none",
                      background: selected ? conf.color : "#f4f7f5",
                      color: selected ? "#fff" : "#bbb",
                      boxShadow: selected ? `0 3px 10px ${conf.color}55` : "none",
                      display: "flex", flexDirection: "column",
                      alignItems: "center", justifyContent: "center",
                      gap: 4, cursor: "pointer", fontFamily: "inherit",
                      transition: "background .15s ease",
                    }}
                  >
                    {stateIcon(s, 16)}
                    <span style={{ fontSize: 10, fontWeight: 800, opacity: selected ? 1 : 0.5 }}>
                      {conf.label}
                    </span>
                  </button>
                );
              })}
            </div>
            <div style={{ height: 1, background: "#e8f0ea", margin: "12px 0 0" }} />
          </div>
        )}

        {/* Member rows — same card style as Day View */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {members.map((m) => {
            const raw = schedule[`${m.id}|${day}|${meal}`] ?? "casa";
            const cur = raw === "off" ? "casa" : raw;
            const kid = stageForAge(memberAge(m)).id !== "adulto";
            return (
              <div key={m.id}>
                <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 6 }}>
                  <Avatar name={m.name} size={22} />
                  <span style={{ fontSize: 13, fontWeight: 800, color: "#1a3a24" }}>{m.name}</span>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  {columns.map((s) => {
                    const disabled = s === "cole" && !kid;
                    const conf = SLOT_CONFIG[s] ?? SLOT_CONFIG.casa;
                    const selected = cur === s;
                    if (disabled) return (
                      <div key={s} style={{ flex: 1, height: 56, borderRadius: 14, background: "#f4f7f5", opacity: 0.2 }} />
                    );
                    return (
                      <button
                        key={s}
                        type="button"
                        onClick={() => onSetMember(m.id, s)}
                        style={{
                          flex: 1, height: 56, borderRadius: 14, border: "none",
                          background: selected ? conf.color : "#f4f7f5",
                          color: selected ? "#fff" : "#bbb",
                          boxShadow: selected ? `0 3px 10px ${conf.color}55` : "none",
                          display: "flex", flexDirection: "column",
                          alignItems: "center", justifyContent: "center",
                          gap: 4, cursor: "pointer", fontFamily: "inherit",
                          transition: "background .15s ease",
                        }}
                      >
                        {stateIcon(s, 16)}
                        <span style={{ fontSize: 10, fontWeight: 800, opacity: selected ? 1 : 0.5 }}>
                          {conf.label}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function SlotIconButton({ state, selected, disabled, onClick }) {
  const c = SLOT_CONFIG[state]?.color ?? "#888";
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={disabled ? undefined : onClick}
      title={SLOT_CONFIG[state]?.label}
      aria-label={SLOT_CONFIG[state]?.label}
      style={{
        width: 36,
        height: 36,
        borderRadius: 8,
        border: `1.5px solid ${selected ? c : "#e3ebe6"}`,
        background: disabled ? "transparent" : selected ? `${c}18` : "#fff",
        color: disabled ? "transparent" : selected ? c : "#bbb",
        cursor: disabled ? "default" : "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 0,
        opacity: disabled ? 0 : 1,
      }}
    >
      {!disabled && stateIcon(state, 15)}
    </button>
  );
}

function SlotIconRow({ columns, value, onPick, memberIsKid = true }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(${columns.length}, 36px)`,
        gap: 4,
      }}
    >
      {columns.map((s) => {
        const disabled = s === "cole" && memberIsKid === false;
        return (
          <SlotIconButton
            key={s}
            state={s}
            selected={value === s}
            disabled={disabled}
            onClick={() => onPick(s)}
          />
        );
      })}
    </div>
  );
}

function tabButtonStyle(selected) {
  return {
    flex: 1,
    padding: "9px 10px",
    borderRadius: 10,
    border: `1.5px solid ${selected ? "#2d5a3d" : "#ddd"}`,
    background: selected ? "rgba(45,90,61,.08)" : "#fff",
    color: "#2d5a3d",
    fontSize: 12,
    fontWeight: 700,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  };
}

function QuickFillSegment({ value, onChange, options }) {
  return (
    <div
      style={{
        display: "flex",
        background: "#f0f4f1",
        borderRadius: 12,
        padding: 4,
        gap: 4,
      }}
    >
      {options.map((opt) => {
        const sel = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              padding: "12px 6px",
              borderRadius: 9,
              border: "none",
              background: sel ? "#fff" : "transparent",
              color: sel ? "#1a3a24" : "#8aa092",
              fontWeight: sel ? 800 : 500,
              fontSize: 12,
              cursor: "pointer",
              boxShadow: sel ? "0 1px 6px rgba(0,0,0,.1)" : "none",
              transition: "all .15s ease",
              fontFamily: "inherit",
            }}
          >
            {opt.icon}
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

function SectionTitle({ children }) {
  return (
    <div
      style={{
        fontSize: 11,
        fontWeight: 800,
        color: "#1a3a24",
        textTransform: "uppercase",
        letterSpacing: 1,
        marginBottom: 8,
      }}
    >
      {children}
    </div>
  );
}

function DayHeader() {
  return (
    <>
      <div />
      {DAYS.map((d) => (
        <div
          key={d}
          style={{ textAlign: "center", fontWeight: 700, color: "#888", padding: 4, fontSize: 11 }}
        >
          {d}
        </div>
      ))}
    </>
  );
}

const CELL_SHORT = {
  casa: "Casa",
  tupper: "Tup",
  cole: "Cole",
  fuera: "Fuera",
  mixed: "Mix",
};

function ScheduleCell({ value, states, onClick, size = 14 }) {
  const isMixed = value === "mixed";
  const normalized = value === "off" ? "casa" : value;
  const conf = SLOT_CONFIG[normalized] ?? SLOT_CONFIG.casa;
  const color = isMixed ? MIXED_COLOR : conf.color;
  const Tag = onClick ? "button" : "div";

  // "Casa" (default) stays muted; anything else gets a solid colored fill so
  // the exceptions in the week pop visually.
  const background = isMixed ? "#fff" : color;
  const fg = isMixed ? MIXED_COLOR : "#fff";

  return (
    <Tag
      type={onClick ? "button" : undefined}
      onClick={onClick}
      title={isMixed ? "Distinto por persona — pulsa para editar" : "Pulsa para elegir"}
      style={{
        width: "100%",
        minHeight: 50,
        borderRadius: 12,
        cursor: onClick ? "pointer" : "default",
        background,
        border: isMixed ? `1.5px dashed ${MIXED_COLOR}` : "none",
        boxShadow: isMixed ? "none" : `0 3px 10px ${color}50`,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 3,
        color: fg,
        padding: "5px 2px",
        transition: "transform .1s ease",
        fontFamily: "inherit",
      }}
    >
      {isMixed ? <MixedDots states={states ?? []} /> : stateIcon(normalized, size)}
      <span style={{ fontSize: 9, fontWeight: 800, lineHeight: 1 }}>
        {isMixed ? CELL_SHORT.mixed : CELL_SHORT[normalized] ?? ""}
      </span>
    </Tag>
  );
}

const STATE_ORDER = ["casa", "tupper", "cole", "fuera", "off"];

function MixedDots({ states }) {
  // Sort by canonical order so identical states cluster together visually.
  const sorted = [...states].sort(
    (a, b) => STATE_ORDER.indexOf(a) - STATE_ORDER.indexOf(b)
  );
  // Layout: 1 row up to 4, 2 rows from 5 onwards (3 cols for 5-6, 4 cols for 7+).
  const cols = sorted.length <= 4 ? sorted.length : sorted.length <= 6 ? 3 : 4;
  const dot = 6;
  return (
    <span
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(${cols}, ${dot}px)`,
        gap: 2,
        padding: 1,
      }}
    >
      {sorted.map((s, i) => {
        const c = SLOT_CONFIG[s]?.color ?? MIXED_COLOR;
        return (
          <span
            key={i}
            style={{
              width: dot,
              height: dot,
              borderRadius: dot / 2,
              background: c,
              boxShadow: "0 0 0 1px #fff",
            }}
          />
        );
      })}
    </span>
  );
}

const FULL_DAY_NAMES = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];

function DayView({ days, meals, members, schedule, coleAllowedIds = new Set(), dayIdx, onDayChange, onClose, onSetMemberSlot }) {
  const [touchStartX, setTouchStartX] = useState(null);
  const [slideDir, setSlideDir] = useState("none");
  const [visibleIdx, setVisibleIdx] = useState(dayIdx);
  const animKeyRef = useRef(0);
  const [animKey, setAnimKey] = useState(0);

  const goTo = (newIdx, dir) => {
    if (newIdx < 0 || newIdx >= days.length) return;
    setSlideDir(dir);
    animKeyRef.current += 1;
    setAnimKey(animKeyRef.current);
    setVisibleIdx(newIdx);
    onDayChange(newIdx);
  };

  const handleTouchStart = (e) => setTouchStartX(e.touches[0].clientX);
  const handleTouchEnd = (e) => {
    if (touchStartX === null) return;
    const delta = e.changedTouches[0].clientX - touchStartX;
    if (Math.abs(delta) > 40) {
      delta < 0 ? goTo(visibleIdx + 1, "forward") : goTo(visibleIdx - 1, "backward");
    }
    setTouchStartX(null);
  };

  const cycleState = (memberId, day, meal) => {
    const canCole = coleAllowedIds.has(memberId);
    const states = canCole ? ["casa", "cole", "fuera"] : ["casa", "fuera"];
    const current = schedule[`${memberId}|${day}|${meal}`] ?? "casa";
    const idx = states.indexOf(current === "off" ? "casa" : current);
    const next = states[(idx + 1) % states.length];
    onSetMemberSlot(memberId, day, meal, next);
  };

  const day = days[visibleIdx];
  const slideAnim = slideDir === "forward"
    ? "slideFromRight .22s cubic-bezier(.25,.46,.45,.94) both"
    : slideDir === "backward"
    ? "slideFromLeft .22s cubic-bezier(.25,.46,.45,.94) both"
    : "none";

  const mealIcon = (meal, size = 15) =>
    meal === "Desayuno" ? <Coffee size={size} /> :
    meal === "Comida"   ? <Sun size={size} />    : <Moon size={size} />;

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 250,
        background: "rgba(0,0,0,.5)",
        display: "flex", alignItems: "flex-end", justifyContent: "center",
        animation: "qfFadeIn .2s ease both",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        style={{
          background: "#fff",
          borderRadius: "22px 22px 0 0",
          width: "100%",
          maxWidth: 420,
          height: "92dvh",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          animation: "qfSlideUp .28s cubic-bezier(.25,.46,.45,.94) both",
        }}
      >
        {/* Header */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "14px 16px 8px", flexShrink: 0,
        }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              width: 34, height: 34, borderRadius: "50%", border: "none",
              background: "#f0f4f1", display: "flex", alignItems: "center",
              justifyContent: "center", cursor: "pointer", flexShrink: 0,
            }}
          >
            <X size={16} />
          </button>

          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button
              type="button"
              onClick={() => goTo(visibleIdx - 1, "backward")}
              disabled={visibleIdx === 0}
              style={{
                width: 30, height: 30, borderRadius: "50%", border: "none",
                background: visibleIdx === 0 ? "transparent" : "#f0f4f1",
                color: visibleIdx === 0 ? "#ccc" : "#2d5a3d",
                display: "flex", alignItems: "center", justifyContent: "center",
                cursor: visibleIdx === 0 ? "default" : "pointer",
              }}
            >
              <ChevronLeft size={15} />
            </button>
            <span style={{ fontSize: 18, fontWeight: 900, color: "#142f1d", minWidth: 96, textAlign: "center" }}>
              {FULL_DAY_NAMES[visibleIdx]}
            </span>
            <button
              type="button"
              onClick={() => goTo(visibleIdx + 1, "forward")}
              disabled={visibleIdx === days.length - 1}
              style={{
                width: 30, height: 30, borderRadius: "50%", border: "none",
                background: visibleIdx === days.length - 1 ? "transparent" : "#f0f4f1",
                color: visibleIdx === days.length - 1 ? "#ccc" : "#2d5a3d",
                display: "flex", alignItems: "center", justifyContent: "center",
                cursor: visibleIdx === days.length - 1 ? "default" : "pointer",
              }}
            >
              <ChevronRight size={15} />
            </button>
          </div>

          <div style={{ width: 34 }} />
        </div>

        {/* Day progress bar — same style as top progress bar */}
        <div style={{ display: "flex", gap: 4, padding: "0 20px 10px", flexShrink: 0 }}>
          {days.map((d, i) => {
            const active = i === visibleIdx;
            const wknd = i >= 5;
            return (
              <button
                key={i}
                type="button"
                onClick={() => goTo(i, i > visibleIdx ? "forward" : "backward")}
                style={{
                  flex: 1, height: active ? 5 : 4, borderRadius: 99, border: "none", padding: 0,
                  background: active ? "#4cba6e" : wknd ? "rgba(45,90,61,.4)" : "#d6e6db",
                  boxShadow: active ? "0 0 6px rgba(76,186,110,.6)" : "none",
                  cursor: "pointer",
                  transition: "all .25s ease",
                }}
                title={d}
              />
            );
          })}
        </div>

        {/* Hint */}
        <p style={{
          margin: "0 20px 10px", fontSize: 11, color: "#9ab0a1", fontStyle: "italic",
          flexShrink: 0,
        }}>
          Toca cada celda para rotar entre En casa, {coleAllowedIds.size > 0 ? "Comedor (solo niños) y " : ""}Come fuera.
        </p>

        {/* Grid: rows=members, cols=meals */}
        <div
          key={animKey}
          style={{
            flex: 1, overflow: "auto",
            padding: "0 16px 28px",
            animation: slideAnim,
          }}
        >
          {/* Column headers */}
          <div style={{
            display: "grid",
            gridTemplateColumns: `100px repeat(${meals.length}, 1fr)`,
            gap: 8, marginBottom: 10,
          }}>
            <div />
            {meals.map((meal) => (
              <div key={meal} style={{
                display: "flex", flexDirection: "column", alignItems: "center", gap: 5,
                padding: "10px 4px",
                background: "#2d5a3d", borderRadius: 14,
                color: "#fff", fontSize: 11, fontWeight: 800,
              }}>
                {mealIcon(meal, 16)}
                {meal}
              </div>
            ))}
          </div>

          {/* Rows = members */}
          {members.map((member) => (
            <div
              key={member.id}
              style={{
                display: "grid",
                gridTemplateColumns: `100px repeat(${meals.length}, 1fr)`,
                gap: 8, marginBottom: 10,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "0 4px" }}>
                <Avatar name={member.name} size={28} />
                <span style={{ fontSize: 12, fontWeight: 700, color: "#1a3a24", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {member.name}
                </span>
              </div>

              {meals.map((meal) => {
                const raw = schedule[`${member.id}|${day}|${meal}`] ?? "casa";
                const value = raw === "off" ? "casa" : raw;
                const conf = SLOT_CONFIG[value] ?? SLOT_CONFIG.casa;
                return (
                  <button
                    key={meal}
                    type="button"
                    onClick={() => cycleState(member.id, day, meal)}
                    style={{
                      height: 68, borderRadius: 16, border: "none",
                      background: conf.color,
                      color: "#fff",
                      boxShadow: `0 4px 14px ${conf.color}55`,
                      display: "flex", flexDirection: "column",
                      alignItems: "center", justifyContent: "center",
                      gap: 5, cursor: "pointer", fontFamily: "inherit",
                      transition: "background .15s ease, box-shadow .15s ease",
                    }}
                  >
                    {stateIcon(value, 20)}
                    <span style={{ fontSize: 10, fontWeight: 800 }}>
                      {SLOT_CONFIG[value]?.label ?? "En casa"}
                    </span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ScheduleGrid({ meals, memberIds, schedule, onCellClick, onDayClick }) {
  // Renders one row per meal. For groups, each cell shows the consensus, or a
  // dot stack of every member's state when they diverge. Clicking a consensus
  // cell cycles; clicking a divergent cell opens the slot editor.
  return (
    <div
      style={{
        background: "#fafcfb",
        border: "1px solid #e8efe9",
        borderRadius: 18,
        padding: 10,
      }}
    >
      <div style={{ display: "grid", gridTemplateColumns: "auto repeat(7, 1fr)", gap: 5 }}>
        <div />
        {DAYS.map((d) => {
          const isWeekend = d === "Sáb" || d === "Dom";
          return (
            <button
              key={d}
              type="button"
              onClick={onDayClick ? () => onDayClick(d) : undefined}
              title={onDayClick ? `Igualar todo el ${d}` : undefined}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "0 0 6px",
                background: "transparent",
                border: "none",
                cursor: onDayClick ? "pointer" : "default",
                fontFamily: "inherit",
              }}
            >
              <span
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: "50%",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 10,
                  fontWeight: 800,
                  background: isWeekend ? "#2d5a3d" : "rgba(45,90,61,.1)",
                  color: isWeekend ? "#a8d5b5" : "#2d5a3d",
                }}
              >
                {d.slice(0, 2)}
              </span>
            </button>
          );
        })}
        {meals.map((meal) => (
          <Fragment key={meal}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                paddingRight: 7,
              }}
              title={meal}
            >
              <span style={{ color: "#7a9080", display: "inline-flex" }}>
                {meal === "Desayuno" ? (
                  <Coffee size={15} />
                ) : meal === "Comida" ? (
                  <Sun size={15} />
                ) : (
                  <Moon size={15} />
                )}
              </span>
            </div>
            {DAYS.map((day) => {
              const memberStates = memberIds.map((id) => {
                const raw = schedule[`${id}|${day}|${meal}`] ?? "casa";
                return raw === "off" ? "casa" : raw;
              });
              let value;
              if (memberStates.length === 0) value = "off";
              else if (memberStates.length === 1) value = memberStates[0];
              else
                value = memberStates.every((s) => s === memberStates[0])
                  ? memberStates[0]
                  : "mixed";
              return (
                <ScheduleCell
                  key={`${day}-${meal}`}
                  value={value}
                  states={value === "mixed" ? memberStates : undefined}
                  onClick={() => onCellClick(day, meal)}
                  size={16}
                />
              );
            })}
          </Fragment>
        ))}
      </div>
    </div>
  );
}

const presetStyle = {
  border: "1px solid #d7e1db",
  background: "#fff",
  color: "#2d5a3d",
  padding: "8px 10px",
  borderRadius: 9,
  fontSize: 12,
  fontWeight: 700,
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
};

// ─── School menu ───────────────────────────────────────────────

export function OnboardingSchoolMenu({ data, setData, onNext, onBack, onFinish, onReset }) {
  const schoolKids = data.members.filter(
    (m) => stageForAge(memberAge(m)).id !== "adulto"
  );
  const [scope, setScope] = useState("shared");
  const [activeKidId, setActiveKidId] = useState(schoolKids[0]?.id ?? null);
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [importStatus, setImportStatus] = useState("");
  const [importError, setImportError] = useState(null);
  const [importedFileName, setImportedFileName] = useState("");
  const [parsedWeeks, setParsedWeeks] = useState([]);
  const [selectedWeekIdx, setSelectedWeekIdx] = useState(0);
  const fileInputRef = useRef(null);

  // The AI-parsing step has no real progress signal (it's one request), so a
  // bar frozen at 85% for several seconds reads as stuck. Elapsed-time ticks
  // and rotating copy keep it feeling alive; the bar creeps slowly toward
  // 97% instead of sitting still, and never claims to be done before it is.
  const [importElapsedSec, setImportElapsedSec] = useState(0);
  const [aiParsing, setAiParsing] = useState(false);
  const aiParseStartSecRef = useRef(0);
  // Mirrors importElapsedSec but readable synchronously from the onProgress
  // callback below, which closes over stale state from when handleFile
  // started (it isn't recreated as the interval ticks).
  const importElapsedRef = useRef(0);
  useEffect(() => {
    if (!importing) return undefined;
    const id = setInterval(() => {
      importElapsedRef.current += 1;
      setImportElapsedSec(importElapsedRef.current);
    }, 1000);
    return () => clearInterval(id);
  }, [importing]);

  const AI_PARSE_MESSAGES = [
    "Casi listo, dando los últimos toques…",
    "Organizando los platos de la semana…",
    "Terminando de procesar el menú…",
  ];
  const aiParseElapsed = aiParsing
    ? Math.max(0, importElapsedSec - aiParseStartSecRef.current)
    : 0;
  const displayProgress = aiParsing
    ? Math.min(0.97, 0.85 + aiParseElapsed * 0.015)
    : importProgress;
  const displayStatus = aiParsing
    ? AI_PARSE_MESSAGES[Math.floor(aiParseElapsed / 3) % AI_PARSE_MESSAGES.length]
    : importStatus;

  // Auto-set schedule to "cole" for school days when a menu is uploaded
  useEffect(() => {
    setData((d) => {
      const sm = d.schoolMenus ?? {};
      const schedule = { ...d.schedule };
      let changed = false;
      const kids = (d.members ?? []).filter(
        (m) => stageForAge(memberAge(m)).id !== "adulto"
      );
      for (const kid of kids) {
        for (const day of SCHOOL_DAYS) {
          const key = `${kid.id}|${day}|Comida`;
          const hasShared = SCHOOL_COURSES.some((c) => {
            const v = sm.shared?.[`${day}-${c}`];
            return typeof v === "string" && v.trim();
          });
          const hasOwn = SCHOOL_COURSES.some((c) => {
            const v = sm.byMember?.[kid.id]?.[`${day}-${c}`];
            return typeof v === "string" && v.trim();
          });
          const hasDish = hasShared || hasOwn;
          if (hasDish && schedule[key] !== "cole") {
            schedule[key] = "cole";
            changed = true;
          } else if (!hasDish && schedule[key] === "cole") {
            schedule[key] = "casa";
            changed = true;
          }
        }
      }
      return changed ? { ...d, schedule } : d;
    });
  }, [data.schoolMenus]); // eslint-disable-line react-hooks/exhaustive-deps

  const targetMap =
    scope === "shared"
      ? data.schoolMenus?.shared ?? {}
      : data.schoolMenus?.byMember?.[activeKidId] ?? {};

  const hasAnyDish = Object.keys(targetMap).length > 0;
  const [reviewOpen, setReviewOpen] = useState(hasAnyDish);
  // Whenever the active scope/member already has dishes, auto-open the editor.
  useEffect(() => {
    if (hasAnyDish) setReviewOpen(true);
  }, [hasAnyDish]);

  const replaceDishes = (next) => {
    setData((d) => {
      const sm = d.schoolMenus ?? { shared: {}, byMember: {} };
      if (scope === "shared") {
        return { ...d, schoolMenus: { ...sm, shared: next } };
      }
      if (!activeKidId) return d;
      return {
        ...d,
        schoolMenus: {
          ...sm,
          byMember: { ...(sm.byMember ?? {}), [activeKidId]: next },
        },
      };
    });
  };

  const setDish = (day, course, value) => {
    setData((d) => {
      const sm = d.schoolMenus ?? { shared: {}, byMember: {} };
      const trimmed = value.trim();
      if (scope === "shared") {
        const next = { ...(sm.shared ?? {}) };
        const k = `${day}-${course}`;
        if (trimmed) next[k] = trimmed;
        else delete next[k];
        return { ...d, schoolMenus: { ...sm, shared: next } };
      }
      if (!activeKidId) return d;
      const cur = sm.byMember?.[activeKidId] ?? {};
      const next = { ...cur };
      const k = `${day}-${course}`;
      if (trimmed) next[k] = trimmed;
      else delete next[k];
      return {
        ...d,
        schoolMenus: {
          ...sm,
          byMember: { ...(sm.byMember ?? {}), [activeKidId]: next },
        },
      };
    });
  };

  const clearAll = () => {
    if (!window.confirm("¿Borrar el menú del cole de esta vista?")) return;
    setData((d) => {
      const sm = d.schoolMenus ?? { shared: {}, byMember: {} };
      if (scope === "shared") {
        return { ...d, schoolMenus: { ...sm, shared: {} } };
      }
      if (!activeKidId) return d;
      return {
        ...d,
        schoolMenus: {
          ...sm,
          byMember: { ...(sm.byMember ?? {}), [activeKidId]: {} },
        },
      };
    });
    setImportedFileName("");
    setImportStatus("");
    setImportProgress(0);
    setParsedWeeks([]);
    setSelectedWeekIdx(0);
  };

  const handleFile = async (file) => {
    if (!file) return;
    setImporting(true);
    setImportProgress(0.05);
    setImportError(null);
    setImportStatus("Leyendo archivo…");
    setImportElapsedSec(0);
    importElapsedRef.current = 0;
    setAiParsing(false);
    try {
      const { weeks, entries } = await importSchoolMenuFile(file, {
        onProgress: (p) => {
          if (p.stage === "pdf-text") {
            setImportProgress(0.05 + (p.page / p.total) * 0.45);
            setImportStatus(`Leyendo PDF (${p.page}/${p.total})…`);
          } else if (p.stage === "ocr-fallback") {
            setImportProgress(0.5);
            setImportStatus("PDF sin texto, aplicando OCR…");
          } else if (p.stage === "ocr-page") {
            setImportProgress(0.5 + (p.page / p.total) * 0.3);
            setImportStatus(`OCR página ${p.page}/${p.total}…`);
          } else if (p.stage === "ocr-progress" && p.status) {
            const pct = typeof p.progress === "number" ? Math.round(p.progress * 100) : null;
            setImportProgress(0.5 + (p.progress ?? 0) * 0.3);
            setImportStatus(`OCR · ${p.status}${pct != null ? ` ${pct}%` : ""}`);
          } else if (p.stage === "ai-parse") {
            setImportProgress(0.85);
            setImportStatus("Interpretando con IA…");
            aiParseStartSecRef.current = importElapsedRef.current;
            setAiParsing(true);
          }
        },
      });

      const detected = Object.keys(entries).length;
      if (detected === 0) {
        setImportError(
          "No detecté platos automáticamente. Edita las celdas manualmente abajo."
        );
        setParsedWeeks([]);
      } else {
        setParsedWeeks(weeks);
        const bestIdx = selectBestWeek(weeks);
        setSelectedWeekIdx(bestIdx);
        const selectedEntries = weeks[bestIdx]?.entries ?? entries;
        replaceDishes(selectedEntries);
        setImportedFileName(file.name ?? "");

        if (weeks.length > 1) {
          const daysInWeek = new Set(
            Object.keys(selectedEntries).map((k) => k.split("-")[0])
          ).size;
          setImportStatus(
            `Detectadas ${weeks.length} semanas · Semana ${bestIdx + 1} seleccionada (${daysInWeek}/5 días)`
          );
        } else {
          const daysWithSomething = new Set(
            Object.keys(selectedEntries).map((k) => k.split("-")[0])
          ).size;
          setImportStatus(
            `Detectados ${daysWithSomething}/5 días (${detected} platos) · revisa antes de continuar`
          );
        }
      }
    } catch (err) {
      setImportError(err?.message ?? "No se pudo procesar el archivo");
    } finally {
      setImporting(false);
      setImportProgress(0);
      setAiParsing(false);
    }
  };

  const onPickFile = (e) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    e.target.value = "";
  };

  if (schoolKids.length === 0) {
    return (
      <OnboardingShell
        title="Menú del cole"
        subtitle="No hay niños/as en edad escolar todavía"
        onBack={onBack}
        onReset={onReset}
        onNext={onNext}
        onFinish={onFinish}
      >
        <p style={{ color: "#888", fontSize: 13 }}>
          Cuando añadas un miembro en edad escolar podrás cargar aquí su menú del comedor.
        </p>
      </OnboardingShell>
    );
  }

  return (
    <OnboardingShell
      title="Menú del cole"
      subtitle="Sube el PDF, foto o CSV del comedor"
      onBack={onBack}
      onReset={onReset}
      onNext={onNext}
      onFinish={onFinish}
    >
      <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
        {[
          { value: "shared",     icon: <Users size={20} />, label: "Mismo menú para todos" },
          { value: "individual", icon: <User size={20} />,  label: "Por niño/a" },
        ].map(({ value, icon, label }) => {
          const sel = scope === value;
          return (
            <button
              key={value}
              type="button"
              onClick={() => setScope(value)}
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 6,
                padding: "14px 8px 12px",
                borderRadius: 14,
                border: `1.5px solid ${sel ? "#2d5a3d" : "#e3ebe6"}`,
                background: sel ? "#2d5a3d" : "#f4f7f5",
                color: sel ? "#fff" : "#9ab0a1",
                fontSize: 12,
                fontWeight: 700,
                cursor: "pointer",
                fontFamily: "inherit",
                transition: "all .15s ease",
              }}
            >
              {icon}
              {label}
            </button>
          );
        })}
      </div>

      {scope === "individual" && (
        <div
          style={{
            display: "flex",
            gap: 6,
            overflowX: "auto",
            paddingBottom: 8,
            marginBottom: 10,
          }}
        >
          {schoolKids.map((m) => {
            const sel = m.id === activeKidId;
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => setActiveKidId(m.id)}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  borderRadius: 20,
                  border: "none",
                  padding: "6px 10px 6px 6px",
                  background: sel ? "#2d5a3d" : "#f0f0f0",
                  color: sel ? "#fff" : "#555",
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: "pointer",
                  flexShrink: 0,
                }}
              >
                <Avatar
                  name={m.name}
                  size={22}
                  color={sel ? "rgba(255,255,255,.25)" : "#bbb"}
                />
                {m.name}
              </button>
            );
          })}
        </div>
      )}

      <div style={{ height: 1, background: "#d6e9dc", margin: "16px 0 14px" }} />

      <SectionTitle>Importar menú</SectionTitle>
      <div style={{ display: "flex", gap: 8, marginBottom: 8, alignItems: "stretch" }}>
        <div
          onClick={() => !importing && fileInputRef.current?.click()}
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "6px 12px",
            borderRadius: 10,
            border: "1.5px dashed rgba(45,90,61,.35)",
            background: importing ? "#f6f9f7" : "#fff",
            cursor: importing ? "default" : "pointer",
          }}
        >
          <span
            style={{
              width: 30,
              height: 30,
              borderRadius: 8,
              background: "rgba(45,90,61,.12)",
              color: "#2d5a3d",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            {importing ? <Loader2 size={16} className="rotating" /> : <Upload size={16} />}
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            {importing ? (
              <>
                <div
                  style={{
                    height: 5,
                    borderRadius: 3,
                    background: "#ecf1ed",
                    overflow: "hidden",
                    marginBottom: 5,
                  }}
                >
                  <div
                    style={{
                      height: "100%",
                      width: `${Math.round(displayProgress * 100)}%`,
                      background: "#2d5a3d",
                      borderRadius: 3,
                      transition: "width .8s ease",
                    }}
                  />
                </div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    fontSize: 11,
                    color: "#8d978f",
                  }}
                >
                  <span
                    style={{
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      flex: 1,
                      minWidth: 0,
                    }}
                  >
                    {displayStatus || "…"}
                  </span>
                  <span style={{ flexShrink: 0, fontVariantNumeric: "tabular-nums" }}>
                    {importElapsedSec}s
                  </span>
                </div>
              </>
            ) : (
              <>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#1a3a24" }}>
                  Subir PDF, foto o CSV
                </div>
                {importedFileName && (
                  <div
                    style={{
                      fontSize: 11,
                      color: "#888",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {importedFileName}
                  </div>
                )}
              </>
            )}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf,image/*,.csv,text/csv"
            onChange={onPickFile}
            disabled={importing}
            style={{ display: "none" }}
          />
        </div>

        <button
          type="button"
          onClick={clearAll}
          aria-label="Vaciar menú"
          title="Vaciar"
          style={{
            flexShrink: 0,
            width: 44,
            borderRadius: 10,
            border: "1.5px solid #d7e1db",
            background: "#fff",
            color: "#2d5a3d",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
          }}
        >
          <Trash2 size={16} />
        </button>
      </div>

      {importError && (
        <div
          style={{
            background: "#fff3e6",
            border: "1px solid #f0d0b0",
            color: "#a35a1f",
            borderRadius: 10,
            padding: "8px 10px",
            fontSize: 11,
            marginBottom: 8,
          }}
        >
          {importError}
        </div>
      )}


      {parsedWeeks.length > 1 && !importing && (
        <div style={{ marginBottom: 8 }}>
          <select
            value={selectedWeekIdx}
            onChange={(e) => {
              const i = Number(e.target.value);
              setSelectedWeekIdx(i);
              replaceDishes(parsedWeeks[i].entries);
              const days = new Set(
                Object.keys(parsedWeeks[i].entries).map((k) => k.split("-")[0])
              ).size;
              setImportStatus(
                `Detectadas ${parsedWeeks.length} semanas · Semana ${i + 1} seleccionada (${days}/5 días)`
              );
            }}
            style={{
              padding: "6px 12px",
              borderRadius: 8,
              border: "1.5px solid #2d5a3d",
              background: "#fff",
              color: "#2d5a3d",
              fontSize: 12,
              fontWeight: 700,
              cursor: "pointer",
              width: "100%",
              fontFamily: "inherit",
            }}
          >
            {parsedWeeks.map((w, i) => (
              <option key={i} value={i}>
                {w.weekLabel || `Semana ${i + 1}`}
              </option>
            ))}
          </select>
        </div>
      )}


      <button
        type="button"
        onClick={() => setReviewOpen((v) => !v)}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
          padding: "10px 12px",
          borderRadius: 10,
          border: "1px solid #e3ebe6",
          background: "#fff",
          cursor: "pointer",
          marginBottom: reviewOpen ? 10 : 0,
        }}
        aria-expanded={reviewOpen}
      >
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            fontSize: 11,
            fontWeight: 800,
            color: "#888",
            textTransform: "uppercase",
            letterSpacing: 1,
          }}
        >
          Revisar / editar
        </span>
        {reviewOpen ? (
          <ChevronUp size={16} color="#888" />
        ) : (
          <ChevronDown size={16} color="#888" />
        )}
      </button>

      {reviewOpen && (
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {SCHOOL_DAYS.map((day) => (
          <div
            key={day}
            style={{
              background: "#f6f9f7",
              borderRadius: 10,
              padding: "10px 12px",
            }}
          >
            <div
              style={{
                fontSize: 11,
                fontWeight: 800,
                color: "#2d5a3d",
                textTransform: "uppercase",
                letterSpacing: 1,
                marginBottom: 6,
              }}
            >
              {day}
            </div>
            {SCHOOL_COURSES.map((course) => {
              const k = `${day}-${course}`;
              const value = targetMap[k] ?? "";
              const labels = {
                Primero: { short: "1º", placeholder: "Primer plato (ej: lentejas)" },
                Segundo: { short: "2º", placeholder: "Segundo plato (ej: tortilla)" },
                Postre:  { short: "P",  placeholder: "Postre (fruta, yogur…)" },
              };
              const meta = labels[course];
              return (
                <div
                  key={course}
                  style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}
                >
                  <span
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: 6,
                      background: "#fff",
                      border: "1px solid #e3ebe6",
                      fontSize: 11,
                      fontWeight: 800,
                      color: "#2d5a3d",
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    {meta.short}
                  </span>
                  <input
                    value={value}
                    onChange={(e) => setDish(day, course, e.target.value)}
                    placeholder={meta.placeholder}
                    style={{
                      flex: 1,
                      padding: "8px 10px",
                      borderRadius: 8,
                      border: "1.5px solid #e3ebe6",
                      fontSize: 13,
                      outline: "none",
                      background: "#fff",
                    }}
                  />
                </div>
              );
            })}
          </div>
        ))}
      </div>
      )}
    </OnboardingShell>
  );
}

// ─── Fixed dishes ──────────────────────────────────────────────

export function OnboardingFixedDishes({ data, setData, onNext, onBack, onFinish, onReset }) {
  const [dish, setDish] = useState("");
  const add = () => {
    if (dish.trim()) {
      setData((d) => ({
        ...d,
        fixedDishes: [...d.fixedDishes, { name: dish.trim(), freq: "semanal" }],
      }));
      setDish("");
    }
  };
  const remove = (i) =>
    setData((d) => ({ ...d, fixedDishes: d.fixedDishes.filter((_, j) => j !== i) }));
  const setFreq = (i, f) =>
    setData((d) => ({
      ...d,
      fixedDishes: d.fixedDishes.map((dd, j) => (j === i ? { ...dd, freq: f } : dd)),
    }));
  const freqs = ["semanal", "quincenal", "de vez en cuando"];
  return (
    <OnboardingShell
      title="Platos fijos"
      subtitle="Platos que no pueden faltar en tu menú"
      onBack={onBack}
      onReset={onReset}
      onNext={onNext}
      onFinish={onFinish}
    >
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <input
          value={dish}
          onChange={(e) => setDish(e.target.value)}
          placeholder="Ej: Tortilla de patatas"
          style={{
            flex: 1,
            padding: "12px 14px",
            borderRadius: 10,
            border: "1.5px solid #ddd",
            fontSize: 14,
            outline: "none",
          }}
          onKeyDown={(e) => e.key === "Enter" && add()}
        />
        <button
          onClick={add}
          style={{
            background: "#2d5a3d",
            color: "#fff",
            border: "none",
            borderRadius: 10,
            width: 44,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Plus size={18} />
        </button>
      </div>
      {data.fixedDishes.map((d, i) => (
        <div
          key={i}
          style={{ background: "#f6f9f7", borderRadius: 12, padding: "12px 16px", marginBottom: 8 }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
            <span style={{ fontWeight: 700, color: "#1a3a24" }}>{d.name}</span>
            <button
              type="button"
              onClick={() => remove(i)}
              style={{ cursor: "pointer", color: "#ccc", border: "none", background: "transparent" }}
            >
              <Minus size={16} />
            </button>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            {freqs.map((f) => (
              <Chip key={f} label={f} selected={d.freq === f} onClick={() => setFreq(i, f)} />
            ))}
          </div>
        </div>
      ))}
    </OnboardingShell>
  );
}

// ─── Goals / Cooking / Budget ──────────────────────────────────

// Default catalogue of goals. The user can rename labels (which are stored
// in `data.goalDefs`) and add custom ones; the planner always reads ids.
const DEFAULT_GOAL_DEFS = [
  {
    id: "sano",
    label: "Sano",
    profile: { kcal: 1900, freqs: { verdura: 5, pescado: 3, legumbres: 3 } },
  },
  {
    id: "economico",
    label: "Económico",
    profile: { kcal: 1950, freqs: { legumbres: 4, pescado: 1 } },
  },
  { id: "rapido", label: "Rápido", profile: { freqs: { verdura: 4 } } },
  {
    id: "deportivo",
    label: "Deportivo",
    profile: { kcal: 2400, freqs: { pescado: 3, verdura: 4, legumbres: 3 } },
  },
  { id: "variado", label: "Variado", profile: {} },
];

const GOAL_GRID_IDS = ["sano", "economico", "rapido", "deportivo", "variado"];

const GOAL_ICON_MAP = {
  sano: Heart,
  economico: Coins,
  rapido: Zap,
  deportivo: Dumbbell,
  variado: Shuffle,
};

function goalsManualKey(subjectId) {
  return subjectId ?? "__global__";
}

const BASE_KCAL = 2000;
const BASE_FREQS = { carne: 3, pescado: 2, legumbres: 2, pasta_arroz: 2, huevos: 2, verdura: 3 };

function combinedGoalProfile(goalIds, goalDefs) {
  const ids = new Set(goalIds);
  const kcalOffsets = [];
  const freqs = { ...BASE_FREQS };

  for (const id of ids) {
    const profile = goalDefs.find((g) => g.id === id)?.profile ?? {};
    if (typeof profile.kcal === "number") kcalOffsets.push(profile.kcal - BASE_KCAL);
    for (const [key, value] of Object.entries(profile.freqs ?? {})) {
      freqs[key] = Math.max(freqs[key] ?? 0, value);
    }
  }

  if (ids.has("rapido")) {
    freqs.verdura = Math.max(freqs.verdura ?? 0, 4);
  }
  if (ids.has("economico")) {
    freqs.legumbres = Math.max(freqs.legumbres ?? 0, 4);
    freqs.pescado = Math.min(freqs.pescado ?? 2, 2);
  }
  if (ids.has("deportivo")) {
    freqs.carne = Math.max(freqs.carne ?? 0, 2);
    freqs.huevos = Math.max(freqs.huevos ?? 0, 2);
  }
  if (ids.has("no-repetir-proteina")) {
    freqs.pescado = Math.max(freqs.pescado ?? 0, 2);
    freqs.legumbres = Math.max(freqs.legumbres ?? 0, 2);
  }

  const kcal =
    kcalOffsets.length === 0
      ? BASE_KCAL
      : BASE_KCAL + Math.round(kcalOffsets.reduce((sum, value) => sum + value, 0) / kcalOffsets.length / 100) * 100;

  return { kcal: Math.max(1200, Math.min(3000, kcal)), freqs };
}

const FREQ_LABELS = {
  legumbres: "Legumbres",
  verdura: "Verdura",
  pescado: "Pescado",
};

function goalGridCellStyle(selected) {
  return {
    ...gridChipStyle(selected),
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    height: 36,
    padding: "4px 2px",
    width: "100%",
  };
}

function GoalOptionGrid({
  goalDefs,
  selectedIds,
  onToggle,
  onAddClick,
  addOpen,
  addValue,
  onAddValueChange,
  onAddConfirm,
}) {
  const gridRowH = 36;
  const gridGap = 6;

  return (
    <div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
          gridTemplateRows: `repeat(2, ${gridRowH}px)`,
          gap: gridGap,
        }}
      >
        {GOAL_GRID_IDS.map((id) => {
          const def = goalDefs.find((g) => g.id === id);
          if (!def) return <div key={id} />;
          const selected = selectedIds.includes(id);
          return (
            <button
              key={id}
              type="button"
              onClick={() => onToggle(id)}
              title={def.label}
              style={goalGridCellStyle(selected)}
            >
              <GoalIcon id={id} selected={selected} />
              <span style={{ fontSize: 9, fontWeight: 700, lineHeight: 1.1 }}>{def.label}</span>
            </button>
          );
        })}
        <button
          type="button"
          onClick={onAddClick}
          style={{
            ...gridChipStyle(addOpen),
            width: "100%",
            height: gridRowH,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 0,
            fontSize: 10,
            fontWeight: 600,
            color: "#2d5a3d",
          }}
        >
          Otro
        </button>
      </div>
      {addOpen && (
        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <input
            value={addValue}
            onChange={(e) => onAddValueChange(e.target.value)}
            placeholder="Tu objetivo"
            style={{ flex: 1, padding: "8px 10px", borderRadius: 8, border: "1px solid #ddd", fontSize: 12 }}
            onKeyDown={(e) => e.key === "Enter" && onAddConfirm()}
            autoFocus
          />
          <button
            type="button"
            onClick={onAddConfirm}
            style={{
              width: 34,
              borderRadius: 8,
              border: "none",
              background: "#2d5a3d",
              color: "#fff",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Check size={14} />
          </button>
        </div>
      )}
    </div>
  );
}

function slugifyGoalLabel(label) {
  return String(label ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

// Meal styles = friendly presets. Each maps to a weekly freqs profile the
// planner reads. Users think in "styles", never in raw numbers.
// Icon + color per food group, for the weekly-variety breakdown under each style.
const FOOD_META = {
  carne: { label: "Carne", Icon: Beef, color: "#c0562f" },
  pescado: { label: "Pescado", Icon: Fish, color: "#2f7dc0" },
  pasta_arroz: { label: "Pasta y arroz", Icon: Wheat, color: "#ca8a04" },
  legumbres: { label: "Legumbres", Icon: Bean, color: "#a06b2f" },
  huevos: { label: "Huevos", Icon: Egg, color: "#d6a01f" },
  verdura: { label: "Verdura", Icon: Salad, color: "#3f8f5b" },
};

const FOOD_ORDER = ["carne", "pescado", "pasta_arroz", "legumbres", "huevos", "verdura"];

export const MEAL_STYLES = [
  {
    id: "de_todo",
    label: "De todo",
    desc: "Pasta, arroz y carne al frente. Familiar y del gusto de los peques.",
    Icon: Pizza,
    freqs: { pasta_arroz: 4, carne: 4, huevos: 2, verdura: 2, pescado: 1, legumbres: 1 },
  },
  {
    id: "equilibrado",
    label: "Equilibrado",
    desc: "Un poco de todo, sin que destaque nada. El punto medio.",
    Icon: HeartPulse,
    freqs: { carne: 3, pescado: 3, verdura: 3, legumbres: 2, pasta_arroz: 2, huevos: 2 },
  },
  {
    id: "ligero",
    label: "Ligero y saludable",
    desc: "Mucha verdura, pescado y legumbre; poca pasta y carne roja.",
    Icon: Salad,
    freqs: { verdura: 6, pescado: 4, legumbres: 3, huevos: 2, carne: 1, pasta_arroz: 1 },
  },
  {
    id: "personalizado",
    label: "A tu gusto",
    desc: "Reparte tú mismo los platos de la semana.",
    Icon: SlidersHorizontal,
    freqs: { carne: 3, pescado: 3, verdura: 3, legumbres: 2, pasta_arroz: 2, huevos: 2 },
  },
];

export const DEFAULT_MEAL_STYLE = "equilibrado";

/**
 * Scales a preset's freqs (weights, not absolute counts) to fit exactly the
 * number of "platos principales" slots actually available that week, so the
 * menu never runs out of — or overflows — real cooking slots.
 */
export function scaleFreqsToSlots(freqs, totalSlots) {
  const entries = Object.entries(freqs);
  const weightSum = entries.reduce((acc, [, v]) => acc + v, 0) || 1;
  const scaled = {};
  entries.forEach(([key, weight]) => {
    scaled[key] = Math.max(0, Math.round((weight / weightSum) * totalSlots));
  });
  // Fix rounding drift against the heaviest categories first, so totals add up exactly.
  let diff = totalSlots - Object.values(scaled).reduce((a, b) => a + b, 0);
  const byWeight = [...entries].sort((a, b) => b[1] - a[1]).map(([k]) => k);
  let guard = 0;
  while (diff !== 0 && byWeight.length > 0 && guard < 100) {
    const key = byWeight[guard % byWeight.length];
    if (diff > 0) {
      scaled[key] += 1;
      diff -= 1;
    } else if (scaled[key] > 0) {
      scaled[key] -= 1;
      diff += 1;
    }
    guard += 1;
  }
  return scaled;
}

function freqsShallowEqual(a, b) {
  const ak = Object.keys(a ?? {});
  const bk = Object.keys(b ?? {});
  if (ak.length !== bk.length) return false;
  return ak.every((k) => a[k] === b[k]);
}

/**
 * Counts real cooking slots for a group this week, from the household
 * schedule: 2 per comida day (primero + segundo) plus 1 per cena day, minus
 * 1 per "plato único" comida (which merges primero+segundo into one dish).
 * This is what config.freqs should sum to, so the LLM never gets asked for
 * more (or fewer) dishes than the week actually has room for.
 */
function computeGroupSlotBudget(data, group) {
  const meals = getMeals(data);
  const members = data.members ?? [];
  const schedule = data.schedule ?? {};
  const slotType = data.slotType ?? {};
  const effectiveGroup = group ?? { memberIds: members.map((m) => m.id) };
  let comidaDays = 0;
  let cenaDays = 0;
  let platoUnicoDays = 0;
  DAYS.forEach((day) => {
    if (meals.includes("Comida")) {
      const mode = modeForGroupSlot(effectiveGroup, members, schedule, day, "Comida");
      if (mode.cook) {
        comidaDays += 1;
        if (slotType[`${day}|Comida`] === "unico") platoUnicoDays += 1;
      }
    }
    if (meals.includes("Cena")) {
      const mode = modeForGroupSlot(effectiveGroup, members, schedule, day, "Cena");
      if (mode.cook) cenaDays += 1;
    }
  });
  const total = Math.max(1, comidaDays * 2 + cenaDays - platoUnicoDays);
  return { comidaDays, cenaDays, platoUnicoDays, total };
}

export function useGroupSlotBudget(data, group) {
  return useMemo(
    () => computeGroupSlotBudget(data, group),
    [data.meals, data.members, data.schedule, data.slotType, group],
  );
}

/** Editable "veces/semana" number for the "Personalizado" style rows — typed
 * directly (like a text field), clamped on blur by the caller's onChange. */
function FreqNumberInput({ value, color, onChange }) {
  const [draft, setDraft] = useState(() => String(value));
  const [lastValue, setLastValue] = useState(value);

  if (value !== lastValue) {
    setLastValue(value);
    setDraft(String(value));
  }

  const commit = () => {
    const trimmed = draft.trim();
    const n = trimmed === "" ? 0 : parseInt(trimmed, 10);
    const next = Number.isNaN(n) ? value : n;
    onChange(next);
    setDraft(String(next));
  };

  return (
    <input
      type="text"
      inputMode="numeric"
      pattern="[0-9]*"
      value={draft}
      onChange={(e) => setDraft(e.target.value.replace(/\D/g, "").slice(0, 2))}
      onFocus={(e) => e.target.select()}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") {
          setDraft(String(value));
          e.currentTarget.blur();
        }
      }}
      aria-label="Veces por semana"
      style={{
        width: 34,
        height: 26,
        borderRadius: 8,
        border: `1.5px solid ${color}`,
        background: "#fff",
        color: "#1a3a24",
        fontSize: 12.5,
        fontWeight: 800,
        fontFamily: "inherit",
        textAlign: "center",
        outline: "none",
        padding: 0,
      }}
    />
  );
}

export function mealStyleCardStyle(selected) {
  return {
    position: "relative",
    flex: 1,
    minWidth: 0,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    padding: "12px 4px 10px",
    borderRadius: 15,
    border: `1.5px solid ${selected ? "#2d5a3d" : "#e0eae3"}`,
    background: selected ? "#2d5a3d" : "#fff",
    cursor: "pointer",
    fontFamily: "inherit",
    transition: "all .16s ease",
    boxShadow: selected ? "0 6px 18px rgba(45,90,61,.22)" : "0 1px 2px rgba(0,0,0,.04)",
  };
}

export function mealStyleIconStyle(selected) {
  return {
    width: 32,
    height: 32,
    borderRadius: 10,
    flexShrink: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: selected ? "rgba(255,255,255,.18)" : "#eef5f0",
    color: selected ? "#fff" : "#2d5a3d",
  };
}

export function OnboardingMealStyle({ data, setData, onNext, onBack, onFinish, onReset }) {
  // Seed groups if the user skipped MenuModel, so per-menu tabs have anchors.
  useEffect(() => {
    if (!Array.isArray(data.groups) || data.groups.length === 0) {
      const seeded = groupsFromModel(data.members ?? [], data.menuModel ?? "same");
      if (seeded.length > 0) setData((d) => ({ ...d, groups: seeded }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const groups = useMemo(
    () => (Array.isArray(data.groups) ? data.groups : []),
    [data.groups],
  );
  // The baby menu doesn't vary by food-group style, so it never gets a tab here.
  const styleableGroups = useMemo(
    () => groups.filter((g) => !isBabyMenuGroup(g, data.members ?? [])),
    [groups, data.members],
  );
  const hasMultipleGroups = styleableGroups.length > 1;

  const [activeGroupId, setActiveGroupId] = useState(null);
  const autoSelectedGroupRef = useRef(false);
  useEffect(() => {
    if (!autoSelectedGroupRef.current && styleableGroups.length > 0) {
      autoSelectedGroupRef.current = true;
      setActiveGroupId(styleableGroups[0].id);
      return;
    }
    if (activeGroupId != null && !styleableGroups.some((g) => g.id === activeGroupId)) {
      setActiveGroupId(styleableGroups[0]?.id ?? null);
    }
  }, [styleableGroups, activeGroupId]);

  const subjectId = activeGroupId;
  const styleKey = subjectId ?? "__global__";
  const activeStyle = data.mealStyleByGroup?.[styleKey] ?? DEFAULT_MEAL_STYLE;
  const isCustom = activeStyle === "personalizado";

  // Real cooking slots this week for the active menu, from the schedule grid —
  // freqs get scaled to this so the plan never asks for more dishes than fit.
  const activeGroup = styleableGroups.find((g) => g.id === activeGroupId) ?? null;
  const slotBudget = useGroupSlotBudget(data, activeGroup);

  // Keep the saved freqs in sync with the slot budget: if the user goes back
  // and changes the schedule (or a plato único), rescale automatically so the
  // menu stays coherent with the chosen style's proportions.
  useEffect(() => {
    // "Personalizado" keeps the user's manual freqs — never auto-rescale it.
    if (isCustom) return;
    const preset = MEAL_STYLES.find((s) => s.id === activeStyle);
    if (!preset) return;
    const scaled = scaleFreqsToSlots(preset.freqs, slotBudget.total);
    setData((d) => {
      const current = subjectId ? d.freqsByGroup?.[subjectId] : d.freqs;
      if (freqsShallowEqual(current, scaled)) return d;
      if (subjectId) {
        return { ...d, freqsByGroup: { ...(d.freqsByGroup ?? {}), [subjectId]: scaled } };
      }
      return { ...d, freqs: scaled };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeStyle, slotBudget.total, subjectId, isCustom]);

  // Manual editing of a single food category in "Personalizado" mode.
  // Clamped to ≥0. If bumping this category would push the week's total past
  // the real slot budget, randomly trims other categories to compensate so
  // the total never exceeds it — no need to manually free up room first.
  const setCustomFreq = (key, next) => {
    setData((d) => {
      const cur = (subjectId ? d.freqsByGroup?.[subjectId] : d.freqs) ?? {};
      const base = {};
      FOOD_ORDER.forEach((k) => {
        base[k] = Math.max(0, cur[k] ?? 0);
      });
      base[key] = Math.max(0, Math.min(99, Math.round(next)));

      let over = FOOD_ORDER.reduce((s, k) => s + base[k], 0) - slotBudget.total;
      if (over > 0) {
        const others = FOOD_ORDER.filter((k) => k !== key);
        let guard = 0;
        while (over > 0 && guard < 200) {
          const shuffled = [...others].sort(() => Math.random() - 0.5);
          const trimmable = shuffled.filter((k) => base[k] > 0);
          if (trimmable.length === 0) break;
          const pick = trimmable[0];
          base[pick] -= 1;
          over -= 1;
          guard += 1;
        }
        // Nothing left to trim elsewhere (all other categories at 0) — cap
        // this one instead so the total still never exceeds the budget.
        if (over > 0) base[key] = Math.max(0, base[key] - over);
      }

      if (subjectId) {
        return { ...d, freqsByGroup: { ...(d.freqsByGroup ?? {}), [subjectId]: base } };
      }
      return { ...d, freqs: base };
    });
  };

  // ── Cenas rápidas (weekly exceptions) ──
  // Live on the household week (data.slotType), independent of the menu tab.
  // Edited from a dedicated pop-up so the main screen stays focused on styles.
  const slotTypeMap = data.slotType ?? {};
  const hasCena = getMeals(data).includes("Cena");
  const rapidaDays = DAYS.filter((d) => slotTypeMap[`${d}|Cena`] === "rapida");
  const anyRapida = rapidaDays.length > 0;
  const [cenasSheetOpen, setCenasSheetOpen] = useState(false);
  const [overBudgetInfoOpen, setOverBudgetInfoOpen] = useState(false);

  const toggleCenaRapida = (day) => {
    setData((d) => {
      const key = `${day}|Cena`;
      const next = { ...(d.slotType ?? {}) };
      if (next[key]) delete next[key];
      else next[key] = "rapida";
      return { ...d, slotType: next };
    });
  };

  const WEEKEND_DAYS = ["Vie", "Sáb", "Dom"];
  const weekendActive =
    WEEKEND_DAYS.every((d) => slotTypeMap[`${d}|Cena`] === "rapida") &&
    rapidaDays.length === WEEKEND_DAYS.length;

  const setWeekendRapidas = () => {
    setData((d) => {
      const next = { ...(d.slotType ?? {}) };
      DAYS.forEach((day) => {
        if (next[`${day}|Cena`] === "rapida") delete next[`${day}|Cena`];
      });
      if (!weekendActive) WEEKEND_DAYS.forEach((day) => (next[`${day}|Cena`] = "rapida"));
      return { ...d, slotType: next };
    });
  };

  const selectStyle = (styleId) => {
    const preset = MEAL_STYLES.find((s) => s.id === styleId);
    if (!preset) return;
    setData((d) => {
      const nextStyleMap = { ...(d.mealStyleByGroup ?? {}), [styleKey]: styleId };
      // Personalizado starts from whatever freqs are already in effect (the
      // previous style, scaled), so the user tweaks a real base — not from zero.
      let scaled;
      if (styleId === "personalizado") {
        const cur = subjectId ? d.freqsByGroup?.[subjectId] : d.freqs;
        const seed = cur && Object.keys(cur).length
          ? cur
          : scaleFreqsToSlots(preset.freqs, slotBudget.total);
        scaled = {};
        FOOD_ORDER.forEach((k) => {
          scaled[k] = Math.max(0, seed[k] ?? 0);
        });
      } else {
        scaled = scaleFreqsToSlots(preset.freqs, slotBudget.total);
      }
      if (subjectId) {
        return {
          ...d,
          mealStyleByGroup: nextStyleMap,
          freqsByGroup: {
            ...(d.freqsByGroup ?? {}),
            [subjectId]: scaled,
          },
        };
      }
      return { ...d, mealStyleByGroup: nextStyleMap, freqs: scaled };
    });
  };

  // Block progressing while any "Personalizado" menu asks for more dishes
  // than the week actually has slots for — the plan couldn't honor it anyway.
  const customOverBudget = useMemo(() => {
    const subjects = styleableGroups.length > 0
      ? styleableGroups.map((g) => ({ key: g.id, group: g }))
      : [{ key: "__global__", group: null }];
    return subjects.some(({ key, group }) => {
      const style = data.mealStyleByGroup?.[key] ?? DEFAULT_MEAL_STYLE;
      if (style !== "personalizado") return false;
      const freqs = (key === "__global__" ? data.freqs : data.freqsByGroup?.[key]) ?? {};
      const used = FOOD_ORDER.reduce((s, k) => s + Math.max(0, freqs[k] ?? 0), 0);
      const budget = computeGroupSlotBudget(data, group);
      return used > budget.total;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [styleableGroups, data.mealStyleByGroup, data.freqsByGroup, data.freqs, data.meals, data.members, data.schedule, data.slotType]);

  return (
    <OnboardingShell
      title="¿Cómo os gusta comer?"
      subtitle="Elige el estilo de cada menú. Podrás cambiarlo cuando quieras."
      nextDisabled={customOverBudget}
      onBack={onBack}
      onReset={onReset}
      onNext={onNext}
      onFinish={onFinish}
      bg="#f5f9f6"
    >
      {hasMultipleGroups && (
        <div style={{ marginBottom: 20 }}>
          <SectionTitle>Menú</SectionTitle>
          <GroupScopePicker
            groups={styleableGroups}
            scope={activeGroupId ?? "all"}
            onChange={(scopeId) => setActiveGroupId(scopeId === "all" ? null : scopeId)}
          />
        </div>
      )}

      <div style={{ height: 1, background: "#dfe9e2", margin: "0 0 16px" }} />
      <style>{`
        @keyframes mealFreqIn {
          from { opacity: 0; transform: translateY(-6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes cenasFadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes cenasSlideUp {
          from { opacity: 0; transform: translateY(16px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
      <div style={{ display: "flex", gap: 6 }}>
        {MEAL_STYLES.map((s) => {
          const sel = activeStyle === s.id;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => selectStyle(s.id)}
              style={mealStyleCardStyle(sel)}
            >
              {sel && (
                <span style={{ position: "absolute", top: 6, right: 6, display: "flex" }}>
                  <Check size={11} color="#fff" />
                </span>
              )}
              <div style={mealStyleIconStyle(sel)}>
                <s.Icon size={16} />
              </div>
              <div
                style={{
                  fontSize: 10.5,
                  fontWeight: 800,
                  color: sel ? "#fff" : "#142f1d",
                  textAlign: "center",
                  lineHeight: 1.2,
                }}
              >
                {s.label}
              </div>
            </button>
          );
        })}
      </div>

      {(() => {
        const activeStyleObj = MEAL_STYLES.find((s) => s.id === activeStyle);
        if (!activeStyleObj) return null;
        const storedFreqs = (subjectId ? data.freqsByGroup?.[subjectId] : data.freqs) ?? {};
        const displayFreqs = isCustom
          ? FOOD_ORDER.reduce((acc, k) => ({ ...acc, [k]: Math.max(0, storedFreqs[k] ?? 0) }), {})
          : scaleFreqsToSlots(activeStyleObj.freqs, slotBudget.total);
        const maxN = Math.max(1, ...Object.values(displayFreqs));
        const allocated = FOOD_ORDER.reduce((s, k) => s + (displayFreqs[k] ?? 0), 0);
        const remainingSlots = slotBudget.total - allocated;
        const over = remainingSlots < 0;
        return (
          <div
            style={{
              marginTop: 12,
              animation: "mealFreqIn .22s cubic-bezier(.32,1,.28,1) both",
            }}
          >
            <p style={{ fontSize: 12.5, color: "#6b7d70", margin: "0 0 12px", lineHeight: 1.45 }}>
              {activeStyleObj.desc}
            </p>
            {isCustom && (() => {
              const comidaSlots = Math.max(0, slotBudget.comidaDays * 2 - slotBudget.platoUnicoDays);
              const cenaSlots = Math.max(0, slotBudget.cenaDays);
              const showComida = getMeals(data).includes("Comida");
              const showCena = hasCena;
              const slotCard = (Icon, value, label) => (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    background: "#fff",
                    border: "1.5px solid #bcdcc7",
                    borderRadius: 10,
                    padding: "5px 9px",
                    flex: "0 0 auto",
                  }}
                >
                  <span
                    style={{
                      width: 20,
                      height: 20,
                      borderRadius: 6,
                      flexShrink: 0,
                      background: "#eef5f0",
                      color: "#2d5a3d",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Icon size={11} />
                  </span>
                  <span style={{ fontSize: 11.5, fontWeight: 800, color: "#142f1d", whiteSpace: "nowrap" }}>
                    {value} {label}
                  </span>
                </div>
              );
              return (
                <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
                  {showComida && slotCard(Sun, comidaSlots, "comidas")}
                  {showCena && slotCard(Moon, cenaSlots, "cenas")}
                </div>
              );
            })()}

            {overBudgetInfoOpen && (
              <div
                onClick={() => setOverBudgetInfoOpen(false)}
                style={{
                  position: "fixed",
                  inset: 0,
                  zIndex: 200,
                  background: "rgba(20,47,29,.32)",
                  backdropFilter: "blur(2px)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: "0 20px",
                }}
              >
                <div
                  onClick={(e) => e.stopPropagation()}
                  style={{
                    width: "100%",
                    maxWidth: 340,
                    background: "#fff",
                    borderRadius: 20,
                    padding: "20px 20px 18px",
                    boxShadow: "0 18px 50px rgba(20,47,29,.32)",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                    <span
                      style={{
                        width: 34,
                        height: 34,
                        borderRadius: 10,
                        flexShrink: 0,
                        background: "#fbe4de",
                        color: "#c0392b",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <AlertTriangle size={18} />
                    </span>
                    <h3 style={{ margin: 0, fontSize: 15.5, fontWeight: 900, color: "#142f1d" }}>
                      Te has pasado de sitio
                    </h3>
                  </div>
                  <p style={{ margin: "0 0 16px", fontSize: 12.5, color: "#5a7262", lineHeight: 1.5 }}>
                    La semana solo tiene {slotBudget.total} platos disponibles y
                    ahora mismo tienes {allocated} repartidos. Puedes generar el
                    menú igualmente, pero no podrás seguir afinándolo hasta que
                    bajes alguna categoría para que cuadre.
                  </p>
                  <button
                    type="button"
                    onClick={() => setOverBudgetInfoOpen(false)}
                    style={{
                      width: "100%",
                      padding: "11px 16px",
                      borderRadius: 13,
                      border: "none",
                      background: "#2d5a3d",
                      color: "#fff",
                      fontSize: 13.5,
                      fontWeight: 800,
                      cursor: "pointer",
                      fontFamily: "inherit",
                    }}
                  >
                    Entendido
                  </button>
                </div>
              </div>
            )}
            {isCustom && (
              <style>{`
                .sl-freq { -webkit-appearance: none; appearance: none; width: 100%; height: 16px; background: transparent; outline: none; cursor: pointer; position: relative; z-index: 1; margin: 0; padding: 0; }
                .sl-freq::-webkit-slider-runnable-track { background: transparent; height: 7px; }
                .sl-freq::-moz-range-track { background: transparent; height: 7px; border: none; }
                .sl-freq::-webkit-slider-thumb { -webkit-appearance: none; width: 13px; height: 13px; border-radius: 50%; background: #fff; box-shadow: 0 1px 4px rgba(0,0,0,.25), 0 0 0 1.5px var(--thumb-color, #2d5a3d); cursor: pointer; margin-top: -3px; }
                .sl-freq::-moz-range-thumb { width: 13px; height: 13px; border: 1.5px solid var(--thumb-color, #2d5a3d); border-radius: 50%; background: #fff; box-shadow: 0 1px 4px rgba(0,0,0,.25); cursor: pointer; }
              `}</style>
            )}
            <div
              style={{
                background: "#fff",
                border: "1px solid #e2ede6",
                borderRadius: 14,
                padding: "12px 14px",
              }}
            >
              <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      paddingBottom: 8,
                      marginBottom: 4,
                      borderBottom: "1px solid #dbe7df",
                    }}
                  >
                    <span style={{ width: 26, flexShrink: 0 }} />
                    <span
                      style={{
                        flex: 1,
                        fontSize: 10,
                        fontWeight: 800,
                        color: "#8aa294",
                        textTransform: "uppercase",
                        letterSpacing: 0.5,
                      }}
                    >
                      Alimento
                    </span>
                    <span
                      style={{
                        width: 62,
                        flexShrink: 0,
                        textAlign: "center",
                        fontSize: 10,
                        fontWeight: 800,
                        color: "#8aa294",
                        textTransform: "uppercase",
                        letterSpacing: 0.5,
                      }}
                    >
                      Veces
                    </span>
                  </div>
                  <div>
                    {FOOD_ORDER.map((key, i) => {
                      const n = displayFreqs[key] ?? 0;
                      const meta = FOOD_META[key];
                      // Fill % and the slider's own max share the same scale (maxN,
                      // the tallest category right now) so the thumb always lands
                      // exactly where the fill ends — a mismatch here reads as a
                      // broken slider. maxN recomputes from live state on every
                      // render, so dragging a category past the current tallest one
                      // raises maxN with it in real time; nothing is ever unreachable.
                      const pct = Math.round((n / maxN) * 100);
                      return (
                        <div
                          key={key}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 10,
                            padding: "9px 0",
                            borderBottom:
                              i < FOOD_ORDER.length - 1 ? "1px solid #e4ede7" : "none",
                          }}
                        >
                          <span
                            style={{
                              width: 26,
                              height: 26,
                              borderRadius: 8,
                              background: `${meta.color}1a`,
                              color: meta.color,
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              flexShrink: 0,
                            }}
                          >
                            <meta.Icon size={15} />
                          </span>
                          <span
                            style={{
                              width: 84,
                              flexShrink: 0,
                              fontSize: 12,
                              fontWeight: 700,
                              color: "#3a4a40",
                              lineHeight: 1.2,
                            }}
                          >
                            {meta.label}
                          </span>
                          {isCustom ? (
                            <span style={{ flex: 1, position: "relative", height: 16, display: "flex", alignItems: "center" }}>
                              <span
                                style={{
                                  position: "absolute",
                                  left: 0,
                                  right: 0,
                                  height: 7,
                                  borderRadius: 4,
                                  background: "#e4ede7",
                                  overflow: "hidden",
                                  pointerEvents: "none",
                                }}
                              >
                                <span
                                  style={{
                                    display: "block",
                                    height: "100%",
                                    width: `${pct}%`,
                                    background: meta.color,
                                    borderRadius: 4,
                                    transition: "width .3s ease",
                                  }}
                                />
                              </span>
                              <input
                                className="sl-freq"
                                type="range"
                                min={0}
                                max={maxN}
                                step={1}
                                value={n}
                                onChange={(e) => setCustomFreq(key, +e.target.value)}
                                aria-label={`${meta.label}: veces por semana`}
                                style={{ "--thumb-color": meta.color }}
                              />
                            </span>
                          ) : (
                            <span
                              style={{
                                flex: 1,
                                height: 7,
                                borderRadius: 4,
                                background: "#e4ede7",
                                overflow: "hidden",
                              }}
                            >
                              <span
                                style={{
                                  display: "block",
                                  height: "100%",
                                  width: `${pct}%`,
                                  background: meta.color,
                                  borderRadius: 4,
                                  transition: "width .3s ease",
                                }}
                              />
                            </span>
                          )}
                          <span
                            style={{
                              width: 62,
                              flexShrink: 0,
                              display: "flex",
                              justifyContent: "center",
                            }}
                          >
                            {isCustom ? (
                              <FreqNumberInput
                                value={n}
                                color={meta.color}
                                onChange={(v) => setCustomFreq(key, v)}
                              />
                            ) : (
                              <span
                                style={{
                                  fontSize: 11,
                                  fontWeight: 800,
                                  color: "#3a4a40",
                                  background: "#f3f8f4",
                                  border: `1px solid ${meta.color}`,
                                  borderRadius: 8,
                                  padding: "3px 8px",
                                }}
                              >
                                {n}/sem
                              </span>
                            )}
                          </span>
                        </div>
                      );
                    })}
                  </div>
            </div>

            {isCustom && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  background: "#fff",
                  border: `2.5px solid ${over ? "#e8a999" : "#bcdcc7"}`,
                  borderRadius: 14,
                  padding: "13px 14px",
                  marginTop: 8,
                }}
              >
                <span style={{ width: 26, flexShrink: 0 }} />
                <span style={{ flex: 1, fontSize: 14, fontWeight: 900, color: "#142f1d" }}>
                  Total
                </span>
                {over && (
                  <button
                    type="button"
                    onClick={() => setOverBudgetInfoOpen(true)}
                    aria-label="Por qué no puedo afinar el menú"
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      width: 20,
                      height: 20,
                      borderRadius: "50%",
                      border: "none",
                      background: "#fbe4de",
                      color: "#c0392b",
                      cursor: "pointer",
                      padding: 0,
                      flexShrink: 0,
                    }}
                  >
                    <AlertTriangle size={12} />
                  </button>
                )}
                <span
                  style={{
                    width: 62,
                    flexShrink: 0,
                    display: "flex",
                    justifyContent: "center",
                  }}
                >
                  <span
                    style={{
                      minWidth: 36,
                      height: 30,
                      borderRadius: 9,
                      border: `2.5px solid ${over ? "#c0392b" : "#2d5a3d"}`,
                      background: "#fff",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      padding: "0 7px",
                      fontSize: 13.5,
                      fontWeight: 900,
                      color: over ? "#c0392b" : "#1a3a24",
                    }}
                  >
                    {allocated}
                  </span>
                </span>
              </div>
            )}
          </div>
        );
      })()}

      {hasCena && (
        <div style={{ marginTop: 26 }}>
          <SectionTitle>Otras opciones</SectionTitle>
          <button
            type="button"
            onClick={() => setCenasSheetOpen(true)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              width: "100%",
              padding: "12px 14px",
              borderRadius: 16,
              border: "1.5px solid #e0eae3",
              background: "#fff",
              cursor: "pointer",
              fontFamily: "inherit",
              transition: "all .15s ease",
              boxShadow: "0 1px 2px rgba(0,0,0,.04)",
            }}
          >
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: 12,
                flexShrink: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: anyRapida ? "#2f7dc0" : "#eef5f0",
                color: anyRapida ? "#fff" : "#2d5a3d",
              }}
            >
              <Zap size={20} />
            </div>
            <div style={{ flex: 1, textAlign: "left" }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: "#142f1d" }}>
                Cenas rápidas
              </div>
              <div style={{ fontSize: 12, color: "#6b7d70", marginTop: 2, lineHeight: 1.35 }}>
                {anyRapida
                  ? `${rapidaDays.length} ${rapidaDays.length === 1 ? "noche marcada" : "noches marcadas"} · algo ligero`
                  : "Marca noches ligeras y sin complicaciones"}
              </div>
            </div>
            <ChevronRight size={18} color="#b6c4bb" />
          </button>
        </div>
      )}

      {cenasSheetOpen && (
        <div
          onClick={() => setCenasSheetOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,.45)",
            zIndex: 150,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "24px 16px",
            animation: "cenasFadeIn .2s ease both",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "#fff",
              borderRadius: 20,
              width: "100%",
              maxWidth: 420,
              padding: "14px 16px 18px",
              maxHeight: "70dvh",
              overflowY: "auto",
              animation: "cenasSlideUp .28s cubic-bezier(.32,1,.28,1) both",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 6,
              }}
            >
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: "#1a3a24" }}>
                Cenas rápidas
              </h3>
              <button
                type="button"
                onClick={() => setCenasSheetOpen(false)}
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  color: "#aaa",
                  padding: 4,
                  display: "flex",
                }}
              >
                <X size={18} />
              </button>
            </div>
            <p style={{ fontSize: 12.5, color: "#6b7d70", margin: "0 0 14px", lineHeight: 1.45 }}>
              Toca las noches que quieras <b>ligeras y sin complicaciones</b>.
            </p>

            <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 10 }}>
              <button
                type="button"
                onClick={setWeekendRapidas}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "7px 11px",
                  borderRadius: 9,
                  border: `1px solid ${weekendActive ? "#2d5a3d" : "#d7e1db"}`,
                  background: weekendActive ? "#2d5a3d" : "#fff",
                  color: weekendActive ? "#fff" : "#2d5a3d",
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: "pointer",
                  fontFamily: "inherit",
                  transition: "all .15s ease",
                }}
              >
                <CalendarDays size={13} /> Solo findes
              </button>
            </div>

            <div
              style={{
                background: "#fafcfb",
                border: "1px solid #e8efe9",
                borderRadius: 18,
                padding: 12,
              }}
            >
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "auto repeat(7, 1fr)",
                  gap: 5,
                  alignItems: "center",
                }}
              >
                <div />
                {DAYS.map((d) => {
                  const isWeekend = d === "Sáb" || d === "Dom";
                  return (
                    <div
                      key={`h-${d}`}
                      style={{ display: "flex", justifyContent: "center", paddingBottom: 6 }}
                    >
                      <span
                        style={{
                          width: 28,
                          height: 28,
                          borderRadius: "50%",
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: 10,
                          fontWeight: 800,
                          background: isWeekend ? "#2d5a3d" : "rgba(45,90,61,.1)",
                          color: isWeekend ? "#a8d5b5" : "#2d5a3d",
                        }}
                      >
                        {d.slice(0, 2)}
                      </span>
                    </div>
                  );
                })}

                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    paddingRight: 7,
                    color: "#7a9080",
                  }}
                  title="Cena"
                >
                  <Moon size={15} />
                </div>
                {DAYS.map((d) => {
                  const active = slotTypeMap[`${d}|Cena`] === "rapida";
                  return (
                    <button
                      key={d}
                      type="button"
                      onClick={() => toggleCenaRapida(d)}
                      title={`Cena del ${dayLabel(d).toLowerCase()}`}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        width: "100%",
                        minHeight: 44,
                        borderRadius: 12,
                        border: active ? "none" : "1.5px solid #e6efe9",
                        background: active ? "#2f7dc0" : "#fff",
                        color: active ? "#fff" : "#c0ccc4",
                        cursor: "pointer",
                        fontFamily: "inherit",
                        transition: "all .15s ease",
                        boxShadow: active ? "0 3px 10px rgba(47,125,192,.32)" : "none",
                      }}
                    >
                      {active ? <Zap size={17} /> : <Moon size={14} />}
                    </button>
                  );
                })}
              </div>
            </div>

            <button
              type="button"
              onClick={() => setCenasSheetOpen(false)}
              style={{
                marginTop: 16,
                width: "100%",
                height: 46,
                borderRadius: 12,
                border: "none",
                background: "#2d5a3d",
                color: "#fff",
                fontSize: 14,
                fontWeight: 800,
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              Listo
            </button>
          </div>
        </div>
      )}
    </OnboardingShell>
  );
}

export function OnboardingGoals({ data, setData, onNext, onBack, onFinish, onReset }) {
  // Auto-create groups if the user skipped MenuModel; otherwise the per-group
  // banner has nothing to anchor to.
  useEffect(() => {
    if (!Array.isArray(data.groups) || data.groups.length === 0) {
      const seeded = groupsFromModel(data.members ?? [], data.menuModel ?? "same");
      if (seeded.length > 0) setData((d) => ({ ...d, groups: seeded }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const goalDefs = useMemo(
    () =>
      Array.isArray(data.goalDefs) && data.goalDefs.length > 0
        ? data.goalDefs
        : DEFAULT_GOAL_DEFS.map((g) => ({ ...g, isCustom: false })),
    [data.goalDefs]
  );

  const groups = useMemo(
    () => (Array.isArray(data.groups) ? data.groups : []),
    [data.groups]
  );
  const hasMultipleGroups = groups.length > 1;

  const [activeGroupId, setActiveGroupId] = useState(groups[0]?.id ?? null);
  useEffect(() => {
    if (activeGroupId == null && groups.length > 0) {
      setActiveGroupId(groups[0].id);
      return;
    }
    if (activeGroupId != null && !groups.some((g) => g.id === activeGroupId)) {
      setActiveGroupId(groups[0]?.id ?? null);
    }
  }, [groups, activeGroupId]);

  const subjectId = activeGroupId;

  // Per-subject reads with fallback to the global defaults so existing data
  // keeps working when groups are introduced for the first time.
  const activeGoals =
    (subjectId && data.goalsByGroup?.[subjectId]) ?? data.goals ?? [];
  const activeFreqs =
    (subjectId && data.freqsByGroup?.[subjectId]) ?? data.freqs ?? { ...BASE_FREQS };
  const [addingGoal, setAddingGoal] = useState(false);
  const [draftGoal, setDraftGoal] = useState("");

  // ── Toast (lifecycle-safe; timer cleared on unmount) ──
  const [toast, setToast] = useState(null);
  const toastTimerRef = useRef(null);
  const showToast = (msg) => {
    setToast(msg);
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToast(null), 2400);
  };
  useEffect(
    () => () => {
      if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    },
    []
  );

  // ── Per-subject writers ──
  const markGoalsManual = (d) => ({
    ...d,
    goalsManualByGroup: {
      ...(d.goalsManualByGroup ?? {}),
      [goalsManualKey(subjectId)]: true,
    },
  });

  const writeSubjectFreqs = (newFreqs) => {
    setData((d) => {
      const next = markGoalsManual(d);
      if (subjectId) {
        return {
          ...next,
          freqsByGroup: { ...(next.freqsByGroup ?? {}), [subjectId]: newFreqs },
        };
      }
      return { ...next, freqs: newFreqs };
    });
  };
  // Toggling needs to fire `showToast` AFTER the state is computed — keeping
  // it inside the `setData` updater would run twice under React 19 strict
  // mode and trigger a setState during render, which made the screen
  // collapse when chaining presets.
  const toggleGoal = (goalId) => {
    const manualKey = goalsManualKey(subjectId);
    let toastMsg = "";
    setData((d) => {
      const defs = d.goalDefs ?? goalDefs;
      const currentGoals =
        (subjectId && d.goalsByGroup?.[subjectId]) ?? d.goals ?? [];
      const isActive = currentGoals.includes(goalId);
      const newGoalIds = isActive
        ? currentGoals.filter((g) => g !== goalId)
        : [...currentGoals, goalId];
      const manual = Boolean(d.goalsManualByGroup?.[manualKey]);
      const profile = combinedGoalProfile(newGoalIds, defs);
      const label = defs.find((g) => g.id === goalId)?.label ?? "";

      if (manual) {
        toastMsg = isActive ? `Quitado «${label}»` : `Añadido «${label}»`;
        if (subjectId) {
          return {
            ...d,
            goalsByGroup: { ...(d.goalsByGroup ?? {}), [subjectId]: newGoalIds },
          };
        }
        return { ...d, goals: newGoalIds };
      }

      toastMsg = isActive ? `Quitado «${label}»` : `Añadido «${label}»`;
      const patch = {
        goals: newGoalIds,
        kcal: profile.kcal,
        freqs: profile.freqs,
        goalsManualByGroup: { ...(d.goalsManualByGroup ?? {}), [manualKey]: false },
      };
      if (subjectId) {
        return {
          ...d,
          goalsByGroup: { ...(d.goalsByGroup ?? {}), [subjectId]: newGoalIds },
          kcalByGroup: { ...(d.kcalByGroup ?? {}), [subjectId]: profile.kcal },
          freqsByGroup: { ...(d.freqsByGroup ?? {}), [subjectId]: profile.freqs },
          goalsManualByGroup: patch.goalsManualByGroup,
        };
      }
      return { ...d, ...patch };
    });
    if (toastMsg) showToast(toastMsg);
  };

  const removeGoalDef = (id) => {
    setData((d) => {
      const def = (d.goalDefs ?? []).find((g) => g.id === id);
      if (!def?.isCustom) return d;
      const nextGoalDefs = (d.goalDefs ?? []).filter((g) => g.id !== id);
      const nextGoals = (d.goals ?? []).filter((g) => g !== id);
      const nextGoalsByGroup = {};
      for (const [k, ids] of Object.entries(d.goalsByGroup ?? {})) {
        nextGoalsByGroup[k] = (ids ?? []).filter((g) => g !== id);
      }
      return {
        ...d,
        goalDefs: nextGoalDefs,
        goals: nextGoals,
        goalsByGroup: nextGoalsByGroup,
      };
    });
  };

  const addCustomGoal = () => {
    const v = draftGoal.trim();
    setAddingGoal(false);
    setDraftGoal("");
    if (!v) return;
    if (goalDefs.some((g) => g.label.toLowerCase() === v.toLowerCase())) return;
    const baseId = slugifyGoalLabel(v) || `custom-${Math.random().toString(36).slice(2, 8)}`;
    let newId = baseId;
    let i = 2;
    while (goalDefs.some((g) => g.id === newId)) {
      newId = `${baseId}-${i++}`;
    }
    setData((d) => {
      const currentGoals =
        (subjectId && d.goalsByGroup?.[subjectId]) ?? d.goals ?? [];
      const goalDefs = [
        ...(d.goalDefs ?? []),
        { id: newId, label: v, profile: {}, isCustom: true },
      ];
      if (subjectId) {
        return {
          ...d,
          goalDefs,
          goalsByGroup: {
            ...(d.goalsByGroup ?? {}),
            [subjectId]: [...currentGoals, newId],
          },
        };
      }
      return { ...d, goalDefs, goals: [...currentGoals, newId] };
    });
    showToast(`Añadido «${v}»`);
  };

  const setFreqValue = (key, v) =>
    writeSubjectFreqs({ ...activeFreqs, [key]: v });

  const removeFreq = (key) => {
    const next = { ...activeFreqs };
    delete next[key];
    writeSubjectFreqs(next);
  };
  const [addingFreq, setAddingFreq] = useState(false);
  const [draftFreq, setDraftFreq] = useState("");
  const addFreq = () => {
    const raw = draftFreq.trim();
    setAddingFreq(false);
    setDraftFreq("");
    if (!raw) return;
    const key = raw.toLowerCase();
    if (key in activeFreqs) return;
    writeSubjectFreqs({ ...activeFreqs, [key]: 2 });
  };
  const renameFreq = (oldKey, newLabel) => {
    const v = newLabel.trim();
    if (!v) return;
    const newKey = v.toLowerCase();
    if (newKey === oldKey || newKey in activeFreqs) return;
    const next = {};
    for (const [k, val] of Object.entries(activeFreqs)) {
      next[k === oldKey ? newKey : k] = val;
    }
    writeSubjectFreqs(next);
  };

  const freqEntries = Object.entries(activeFreqs);
  const activeGroupLabel =
    groups.find((g) => g.id === activeGroupId)?.label ?? "todos";

  return (
    <OnboardingShell
      title="¿Qué queréis comer?"
      subtitle="Elige objetivos y cuántas veces por semana"
      onBack={onBack}
      onReset={onReset}
      onNext={onNext}
      onFinish={onFinish}
    >
      {hasMultipleGroups && (
        <div style={{ marginBottom: 18 }}>
          <SectionTitle>Aplicar a</SectionTitle>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {groups.map((g) => {
              const sel = g.id === activeGroupId;
              const memberCount = membersOfGroup(g, data.members ?? []).length;
              return (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => setActiveGroupId(g.id)}
                  style={subjectPillStyle(sel, g.color)}
                >
                  <Users size={12} /> {g.label}
                  <span style={{ opacity: 0.7, fontWeight: 500 }}>· {memberCount}</span>
                </button>
              );
            })}
          </div>
          <p style={{ fontSize: 11, color: "#888", marginTop: 6 }}>
            Cada grupo guarda sus propios objetivos y frecuencias.
          </p>
        </div>
      )}

      <SectionTitle>
        {hasMultipleGroups ? `Objetivos · ${activeGroupLabel}` : "Objetivos"}
      </SectionTitle>
      <div style={{ marginBottom: 16 }}>
        <GoalOptionGrid
          goalDefs={goalDefs}
          selectedIds={activeGoals}
          onToggle={toggleGoal}
          onAddClick={() => setAddingGoal((v) => !v)}
          addOpen={addingGoal}
          addValue={draftGoal}
          onAddValueChange={setDraftGoal}
          onAddConfirm={addCustomGoal}
        />
        {goalDefs.some((g) => g.isCustom) && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
            {goalDefs
              .filter((g) => g.isCustom)
              .map((def) => (
                <GoalChip
                  key={def.id}
                  def={def}
                  selected={activeGoals.includes(def.id)}
                  onToggle={() => toggleGoal(def.id)}
                  onRemove={() => removeGoalDef(def.id)}
                />
              ))}
          </div>
        )}
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 10,
        }}
      >
        <span style={{ fontSize: 13, fontWeight: 700, color: "#555" }}>
          Frecuencia mínima semanal
        </span>
        {!addingFreq && (
          <button
            type="button"
            onClick={() => setAddingFreq(true)}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              padding: "5px 10px",
              borderRadius: 16,
              border: "1.5px dashed #2d5a3d",
              background: "#fff",
              color: "#2d5a3d",
              fontSize: 11,
              fontWeight: 700,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            <Plus size={11} /> Añadir tipo
          </button>
        )}
      </div>

      {addingFreq && (
        <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
          <input
            autoFocus
            value={draftFreq}
            onChange={(e) => setDraftFreq(e.target.value)}
            onBlur={addFreq}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
              if (e.key === "Escape") {
                setDraftFreq("");
                setAddingFreq(false);
              }
            }}
            placeholder="Carne, fruta, huevos…"
            style={{
              flex: 1,
              padding: "8px 12px",
              borderRadius: 10,
              border: "1.5px solid #2d5a3d",
              fontSize: 13,
              outline: "none",
              fontFamily: "inherit",
            }}
          />
        </div>
      )}

      {freqEntries.length === 0 && !addingFreq && (
        <p style={{ fontSize: 12, color: "#aaa", margin: "4px 0 12px" }}>
          Sin tipos definidos. Pulsa «Añadir tipo».
        </p>
      )}

      {freqEntries.map(([key, value]) => (
        <FreqRow
          key={key}
          freqKey={key}
          value={value ?? 2}
          onChange={(v) => setFreqValue(key, v)}
          onRename={(v) => renameFreq(key, v)}
          onRemove={() => removeFreq(key)}
        />
      ))}

      {toast && (
        <div
          style={{
            position: "fixed",
            bottom: 80,
            left: "50%",
            transform: "translateX(-50%)",
            background: "#1a3a24",
            color: "#fff",
            padding: "10px 18px",
            borderRadius: 24,
            fontSize: 13,
            fontWeight: 600,
            boxShadow: "0 6px 22px rgba(0,0,0,.2)",
            zIndex: 200,
            maxWidth: 320,
            textAlign: "center",
          }}
        >
          {toast}
        </div>
      )}
    </OnboardingShell>
  );
}

function chipStyle(selected) {
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "6px 14px",
    borderRadius: 20,
    fontSize: 13,
    cursor: "pointer",
    fontWeight: 500,
    transition: "all .2s",
    background: selected ? "#2d5a3d" : "rgba(45,90,61,.08)",
    color: selected ? "#fff" : "#2d5a3d",
    border: `1.5px solid ${selected ? "#2d5a3d" : "rgba(45,90,61,.2)"}`,
    fontFamily: "inherit",
  };
}

function subjectPillStyle(selected, color = "#2d5a3d") {
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "9px 12px",
    borderRadius: 12,
    fontSize: 12,
    fontWeight: 800,
    cursor: "pointer",
    background: selected ? color : "#f7faf8",
    color: selected ? "#fff" : color,
    border: `1.5px solid ${selected ? color : `${color}55`}`,
    fontFamily: "inherit",
    boxShadow: selected ? `0 4px 14px ${color}22` : "none",
  };
}

function goalChipStyle(selected) {
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    padding: "8px 14px",
    borderRadius: 20,
    fontSize: 13,
    fontWeight: 700,
    cursor: "pointer",
    fontFamily: "inherit",
    border: `1.5px solid ${selected ? "#2d5a3d" : "rgba(45,90,61,.25)"}`,
    background: selected ? "#2d5a3d" : "rgba(45,90,61,.08)",
    color: selected ? "#fff" : "#2d5a3d",
    transition: "background .15s, border-color .15s",
  };
}

function GoalIcon({ id, selected }) {
  const Icon = GOAL_ICON_MAP[id] ?? Tag;
  return <Icon size={15} strokeWidth={2.2} color={selected ? "#fff" : "#2d5a3d"} />;
}

function GoalChip({ def, selected, onToggle, onRename, onRemove }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(def.label);
  const [lastLabel, setLastLabel] = useState(def.label);
  if (def.label !== lastLabel) {
    setLastLabel(def.label);
    setDraft(def.label);
  }
  const commit = () => {
    setEditing(false);
    if (onRename && draft.trim() && draft.trim() !== def.label) onRename(draft.trim());
    else setDraft(def.label);
  };
  if (editing && onRename) {
    return (
      <input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") {
            setDraft(def.label);
            setEditing(false);
          }
        }}
        style={{
          padding: "8px 14px",
          borderRadius: 20,
          border: "1.5px solid #2d5a3d",
          fontSize: 13,
          outline: "none",
          fontFamily: "inherit",
          minWidth: 100,
        }}
      />
    );
  }
  return (
    <button
      type="button"
      onClick={onToggle}
      onDoubleClick={onRename ? () => setEditing(true) : undefined}
      title={onRename ? `${def.label} · doble clic para renombrar` : def.label}
      style={goalChipStyle(selected)}
    >
      <GoalIcon id={def.id} selected={selected} />
      {def.label}
      {onRemove && (
        <span
          role="button"
          tabIndex={0}
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.stopPropagation();
              onRemove();
            }
          }}
          aria-label={`Quitar ${def.label}`}
          style={{
            marginLeft: 2,
            display: "inline-flex",
            opacity: 0.85,
          }}
        >
          <X size={12} />
        </span>
      )}
    </button>
  );
}

function FreqRow({ freqKey, value, onChange, onRename, onRemove }) {
  const [editing, setEditing] = useState(false);
  const initial = FREQ_LABELS[freqKey] ?? capitalize(freqKey);
  const [draft, setDraft] = useState(initial);
  const [lastKey, setLastKey] = useState(freqKey);
  if (freqKey !== lastKey) {
    setLastKey(freqKey);
    setDraft(FREQ_LABELS[freqKey] ?? capitalize(freqKey));
  }

  const commit = () => {
    setEditing(false);
    if (draft.trim() && draft.trim().toLowerCase() !== freqKey.toLowerCase()) {
      onRename(draft);
    } else {
      setDraft(FREQ_LABELS[freqKey] ?? capitalize(freqKey));
    }
  };

  return (
    <div style={{ marginBottom: 16 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 8,
          marginBottom: 6,
        }}
      >
        {editing ? (
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
              if (e.key === "Escape") {
                setDraft(FREQ_LABELS[freqKey] ?? capitalize(freqKey));
                setEditing(false);
              }
            }}
            style={{
              flex: 1,
              padding: "4px 8px",
              borderRadius: 6,
              border: "1.5px solid #2d5a3d",
              fontSize: 13,
              color: "#555",
              outline: "none",
              fontFamily: "inherit",
            }}
          />
        ) : (
          <button
            type="button"
            onClick={() => setEditing(true)}
            style={{
              border: "none",
              background: "transparent",
              fontSize: 13,
              color: "#555",
              cursor: "pointer",
              padding: 0,
              fontFamily: "inherit",
              textAlign: "left",
              flex: 1,
            }}
          >
            {FREQ_LABELS[freqKey] ?? capitalize(freqKey)}
          </button>
        )}
        <span style={{ fontSize: 13, fontWeight: 700, color: "#2d5a3d", minWidth: 28, textAlign: "right" }}>
          {value}x
        </span>
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Quitar ${freqKey}`}
          style={{
            border: "none",
            background: "transparent",
            color: "#bbb",
            cursor: "pointer",
            padding: 4,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <X size={14} />
        </button>
      </div>
      <input
        type="range"
        min={0}
        max={7}
        step={1}
        value={value}
        onChange={(e) => onChange(+e.target.value)}
        style={{ width: "100%", accentColor: "#2d5a3d" }}
      />
    </div>
  );
}

function capitalize(text) {
  if (!text) return "";
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function OnboardingCooking({ data, setData, onNext, onBack, onFinish, onReset, finishLabel }) {
  const levels = [
    { id: "basic", icon: <BookOpenCheck size={20} />, label: "Básico", desc: "Lo justo para sobrevivir" },
    { id: "normal", icon: <ChefHat size={20} />, label: "Normal", desc: "Me defiendo bien" },
    { id: "pro", icon: <Sparkles size={20} />, label: "Me gusta cocinar", desc: "Disfruto experimentando" },
  ];
  const tools = [
    "Airfryer",
    "Horno",
    "Microondas",
    "Thermomix",
    "Olla rápida",
    "Vaporera",
  ];
  const availableTools = [...tools, ...(data.customKitchenTools ?? [])];
  const [addingTool, setAddingTool] = useState(false);
  const [draftTool, setDraftTool] = useState("");
  const toggleTool = (tool) =>
    setData((d) => ({
      ...d,
      kitchenTools: (d.kitchenTools ?? []).includes(tool)
        ? (d.kitchenTools ?? []).filter((v) => v !== tool)
        : [...(d.kitchenTools ?? []), tool],
    }));
  const addCustomTool = () => {
    const label = titleCase(draftTool);
    setAddingTool(false);
    setDraftTool("");
    if (!label) return;
    setData((d) => {
      const customKitchenTools = (d.customKitchenTools ?? []).includes(label)
        ? d.customKitchenTools ?? []
        : [...(d.customKitchenTools ?? []), label];
      const kitchenTools = (d.kitchenTools ?? []).includes(label)
        ? d.kitchenTools ?? []
        : [...(d.kitchenTools ?? []), label];
      return { ...d, customKitchenTools, kitchenTools };
    });
  };
  const removeCustomTool = (tool) =>
    setData((d) => ({
      ...d,
      customKitchenTools: (d.customKitchenTools ?? []).filter((v) => v !== tool),
      kitchenTools: (d.kitchenTools ?? []).filter((v) => v !== tool),
    }));
  return (
    <OnboardingShell
      title="¿Quién cocina y cómo?"
      subtitle="Para ajustar las recetas a tu nivel"
      onBack={onBack}
      onReset={onReset}
      onNext={onNext}
      onFinish={onFinish}
      finishLabel={finishLabel}
    >
      {/* Nivel de cocina — mismo estilo que comida/cena/desayuno */}
      <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
        {levels.map((l) => {
          const sel = data.cookLevel === l.id;
          return (
            <button
              type="button"
              key={l.id}
              onClick={() => setData((d) => ({ ...d, cookLevel: l.id }))}
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 6,
                padding: "14px 8px 12px",
                borderRadius: 14,
                cursor: "pointer",
                background: sel ? "#2d5a3d" : "#f4f7f5",
                border: `1.5px solid ${sel ? "#2d5a3d" : "#e3ebe6"}`,
                color: sel ? "#fff" : "#9ab0a1",
                transition: "all .15s ease",
                fontFamily: "inherit",
              }}
            >
              {l.icon}
              <span style={{ fontWeight: 700, fontSize: 12 }}>{l.label}</span>
            </button>
          );
        })}
      </div>

      <div style={{ height: 1, background: "#d6e9dc", margin: "4px 0 20px" }} />

      {/* Herramientas — modelo tipo alergias */}
      <style>{`
        @keyframes avoidCheckPop {
          0%   { transform: scale(0.4); opacity: 0; }
          55%  { transform: scale(1.25); opacity: 1; }
          100% { transform: scale(1); }
        }
        .avoid-pill { transition: background .15s ease, border-color .15s ease, color .15s ease, box-shadow .15s ease, transform .12s ease; }
        .avoid-pill:hover { transform: translateY(-1px); }
        .avoid-pill:active { transform: translateY(0) scale(.97); }
        .avoid-pill-check { animation: avoidCheckPop .22s cubic-bezier(.34,1.5,.6,1) both; }
        .avoid-row { transition: background .15s ease; }
        .avoid-row:hover { background: #f3f7f4; }
      `}</style>

      <AvoidSection icon={Utensils} accent="#2d5a3d" title="Herramientas disponibles">
        <div>
          <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", columnGap: 16 }}>
            {availableTools.map((tool) => {
              const isCustom = (data.customKitchenTools ?? []).includes(tool);
              const sel = (data.kitchenTools ?? []).includes(tool);
              return (
                <AllergenRow
                  key={tool}
                  Icon={TOOL_ICON[tool] ?? Wrench}
                  color="#2d5a3d"
                  label={tool}
                  checked={sel}
                  checkColor="#2d5a3d"
                  onToggle={() => (isCustom && sel ? removeCustomTool(tool) : toggleTool(tool))}
                />
              );
            })}
          </div>

          <div style={{ display: "flex", marginTop: 12 }}>
            <button
              type="button"
              onClick={() => setAddingTool((v) => !v)}
              className="avoid-pill"
              style={{
                display: "inline-flex", alignItems: "center", gap: 6, height: 36,
                padding: "0 15px 0 12px", borderRadius: 10, border: "none",
                background: addingTool ? "#234a31" : "#2d5a3d", color: "#fff",
                fontSize: 12.5, fontWeight: 800, cursor: "pointer", fontFamily: "inherit",
                boxShadow: "0 2px 8px rgba(45,90,61,.3)",
              }}
            >
              <Plus size={15} strokeWidth={2.6} /> Añadir otra
            </button>
          </div>

          {addingTool && (
            <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
              <input
                autoFocus
                value={draftTool}
                onChange={(e) => setDraftTool(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") addCustomTool();
                  if (e.key === "Escape") { setDraftTool(""); setAddingTool(false); }
                }}
                placeholder="Otra herramienta"
                style={{ flex: 1, padding: "9px 12px", borderRadius: 10, border: "1.5px solid #dde7e0", fontSize: 12.5, outline: "none", fontFamily: "inherit" }}
              />
              <button
                type="button"
                onClick={addCustomTool}
                aria-label="Añadir herramienta"
                style={{ width: 40, borderRadius: 10, border: "none", background: "#2d5a3d", color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}
              >
                <Check size={16} strokeWidth={3} />
              </button>
            </div>
          )}
        </div>
      </AvoidSection>

      <div style={{ height: 1, background: "#d6e9dc", margin: "20px 0" }} />

      {/* Tiempo */}
      <SectionTitle>¿Cuánto tiempo tienes para cocinar?</SectionTitle>
      <CookTimeEditor data={data} setData={setData} />
    </OnboardingShell>
  );
}

// ── Week selector ────────────────────────────────────────────────────────────

const WEEK_DAY_SHORT = ["L", "M", "X", "J", "V", "S", "D"];
const MONTH_NAMES_ES = [
  "Enero","Febrero","Marzo","Abril","Mayo","Junio",
  "Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre",
];

function todayMondayIdx() {
  const d = new Date().getDay();
  return d === 0 ? 6 : d - 1;
}

function buildCalendarWeeks(count = 6) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dow = today.getDay();
  const toMonday = dow === 0 ? -6 : 1 - dow;
  const thisMonday = new Date(today);
  thisMonday.setDate(today.getDate() + toMonday);

  return Array.from({ length: count }, (_, i) => {
    const monday = new Date(thisMonday);
    monday.setDate(thisMonday.getDate() + i * 7);
    const days = Array.from({ length: 7 }, (__, j) => {
      const d = new Date(monday);
      d.setDate(monday.getDate() + j);
      return d;
    });
    return { offset: i, monday, days };
  });
}

function isSameDay(a, b) {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
}

export function OnboardingWeek({ data, setData, onNext, onBack, onReset, onFinish }) {
  const todayIdx = todayMondayIdx();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const menuWeek = data.menuWeek ?? { offset: 0, startDayIdx: todayIdx };
  const selectedOffset = menuWeek.offset ?? 0;

  const selectWeek = (offset) => {
    const startDayIdx = offset === 0 ? todayIdx : 0;
    setData((d) => ({ ...d, menuWeek: { offset, startDayIdx } }));
  };

  const weeks = buildCalendarWeeks(4);

  // Active days count for hint
  const selectedWeek = weeks[selectedOffset] ?? weeks[0];
  const activeDayCount = selectedOffset === 0
    ? selectedWeek.days.filter((d) => d >= today).length
    : 7;

  return (
    <OnboardingShell
      title="¿Para cuándo quieres el menú?"
      subtitle="Toca la semana que quieres planificar"
      onBack={onBack}
      onReset={onReset}
      onNext={onNext}
      onFinish={onFinish}
      finishLabel="Generar menú"
    >
      {/* Day-of-week header */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(7, 1fr) 32px",
        gap: 0,
        padding: "0 4px",
        marginBottom: 4,
      }}>
        {WEEK_DAY_SHORT.map((d) => (
          <div key={d} style={{
            textAlign: "center",
            fontSize: 12,
            fontWeight: 800,
            color: "#4a6b55",
            letterSpacing: ".5px",
            padding: "6px 0",
          }}>{d}</div>
        ))}
        <div />
      </div>

      {/* Calendar grid */}
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {weeks.map(({ offset, monday, days }, weekIdx) => {
          const isSelected = offset === selectedOffset;
          const showMonthLabel =
            weekIdx === 0 ||
            monday.getMonth() !== weeks[weekIdx - 1].monday.getMonth();

          return (
            <div key={offset}>
              {/* Month label */}
              {showMonthLabel && (
                <div style={{
                  fontSize: 11,
                  fontWeight: 800,
                  color: "#2d5a3d",
                  letterSpacing: ".8px",
                  textTransform: "uppercase",
                  padding: "10px 4px 6px",
                  marginTop: weekIdx === 0 ? 0 : 6,
                }}>
                  {MONTH_NAMES_ES[monday.getMonth()]} {monday.getFullYear()}
                </div>
              )}

              {/* Week row */}
              <button
                type="button"
                onClick={() => selectWeek(offset)}
                style={{
                  width: "100%",
                  border: "none",
                  borderRadius: 14,
                  background: isSelected ? "rgba(45,90,61,.07)" : "transparent",
                  cursor: "pointer",
                  padding: "3px 4px",
                  fontFamily: "inherit",
                  outline: "none",
                  position: "relative",
                  transition: "background .15s ease",
                }}
              >
                {/* Left accent bar for selected */}
                {isSelected && (
                  <span style={{
                    position: "absolute",
                    left: 0,
                    top: "50%",
                    transform: "translateY(-50%)",
                    width: 3,
                    height: "70%",
                    borderRadius: 99,
                    background: "#2d5a3d",
                  }} />
                )}

                <div style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(7, 1fr) 32px",
                  gap: 0,
                  alignItems: "center",
                }}>
                  {days.map((dayDate, i) => {
                    const isToday = isSameDay(dayDate, today);
                    const isPast = dayDate < today && !isToday;
                    return (
                      <div key={i} style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        height: 38,
                      }}>
                        <span style={{
                          width: 30,
                          height: 30,
                          borderRadius: 999,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: 14,
                          fontWeight: isToday ? 900 : isPast ? 400 : 600,
                          background: isToday ? "#f59e0b" : "transparent",
                          color: isToday ? "#fff" : isPast ? "#ccc" : isSelected ? "#142f1d" : "#333",
                          boxShadow: isToday ? "0 2px 8px #f59e0b55" : "none",
                          transition: "all .15s ease",
                        }}>
                          {dayDate.getDate()}
                        </span>
                      </div>
                    );
                  })}

                  {/* Select indicator */}
                  <div style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}>
                    <span style={{
                      width: 20,
                      height: 20,
                      borderRadius: 999,
                      border: `2px solid ${isSelected ? "#2d5a3d" : "#d0dbd3"}`,
                      background: isSelected ? "#2d5a3d" : "transparent",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      transition: "all .15s ease",
                      flexShrink: 0,
                    }}>
                      {isSelected && (
                        <svg width="9" height="7" viewBox="0 0 9 7" fill="none">
                          <path d="M1 3.5l2.5 2.5 5-5" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      )}
                    </span>
                  </div>
                </div>
              </button>
            </div>
          );
        })}
      </div>

      {/* Hint — only when current week and fewer than 7 days */}
      {selectedOffset === 0 && activeDayCount < 7 && (
        <p style={{ fontSize: 12, color: "#9aaa9e", margin: "14px 0 0", textAlign: "center" }}>
          {`Menú de ${activeDayCount} día${activeDayCount !== 1 ? "s" : ""} (desde hoy)`}
        </p>
      )}
    </OnboardingShell>
  );
}

export function OnboardingBudget({ data, setData, onBack, onFinish, onReset }) {
  const supers = ["Mercadona", "Carrefour", "Lidl", "Dia", "Alcampo", "Otro"];
  const toggle = (s) =>
    setData((d) => ({
      ...d,
      supermarkets: d.supermarkets.includes(s)
        ? d.supermarkets.filter((v) => v !== s)
        : [...d.supermarkets, s],
    }));
  return (
    <OnboardingShell
      title="Presupuesto y supermercado"
      subtitle="Último paso para afinar el menú"
      onBack={onBack}
      onReset={onReset}
      onFinish={onFinish}
    >
      <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>
        <div
          onClick={() => setData((d) => ({ ...d, hasBudget: false }))}
          style={{
            flex: 1,
            padding: "14px",
            borderRadius: 12,
            textAlign: "center",
            cursor: "pointer",
            background: !data.hasBudget ? "rgba(45,90,61,.08)" : "#f8f8f8",
            border: `2px solid ${!data.hasBudget ? "#2d5a3d" : "transparent"}`,
            fontWeight: 600,
            color: "#1a3a24",
            fontSize: 14,
          }}
        >
          Sin límite
        </div>
        <div
          onClick={() => setData((d) => ({ ...d, hasBudget: true }))}
          style={{
            flex: 1,
            padding: "14px",
            borderRadius: 12,
            textAlign: "center",
            cursor: "pointer",
            background: data.hasBudget ? "rgba(45,90,61,.08)" : "#f8f8f8",
            border: `2px solid ${data.hasBudget ? "#2d5a3d" : "transparent"}`,
            fontWeight: 600,
            color: "#1a3a24",
            fontSize: 14,
          }}
        >
          Con presupuesto
        </div>
      </div>
      {data.hasBudget && (
        <SliderInput
          label="Presupuesto semanal"
          value={data.budget}
          min={30}
          max={200}
          step={5}
          suffix=" €"
          onChange={(v) => setData((d) => ({ ...d, budget: v }))}
        />
      )}
      <p style={{ fontSize: 13, fontWeight: 700, color: "#555", marginBottom: 10 }}>
        ¿Dónde compras?
      </p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
        {supers.map((s) => (
          <Chip key={s} label={s} selected={data.supermarkets.includes(s)} onClick={() => toggle(s)} />
        ))}
      </div>
    </OnboardingShell>
  );
}
