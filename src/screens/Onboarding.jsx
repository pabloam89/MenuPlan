import React, { Fragment, useContext, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowUpDown,
  Baby,
  BookOpenCheck,
  GitBranch,
  BriefcaseBusiness,
  CalendarDays,
  Check,
  ChefHat,
  ChevronLeft,
  ChevronRight,
  Coffee,
  Sun,
  Sunset,
  Moon,
  ChevronDown,
  ChevronUp,
  Drumstick,
  Expand,
  FileText,
  Grid2X2,
  House,
  Layers2,
  Loader2,
  Minus,
  Plus,
  School,
  Coins,
  Dumbbell,
  Heart,
  RotateCcw,
  Shuffle,
  Sparkles,
  Tag,
  Trash2,
  Upload,
  Zap,
  User,
  UserPlus,
  Users,
  Utensils,
  UtensilsCrossed,
  X,
} from "lucide-react";
import { Chip, SliderInput, Avatar, AvatarStack, ProgressDots } from "../components/ui.jsx";
import { OnboardingProgressContext } from "./onboardingProgressContext.js";
import { HOUSEHOLD_ROLES, stageForAge, suggestHomeRole } from "../lib/stages.js";
import { migrateFixedDishes, normalizeFixedDish } from "../lib/fixedDishes.js";
import { groupsFromModel, membersOfGroup, uid } from "../lib/groups.js";
import {
  ALL_DAY_MEALS,
  DAYS,
  dayLabel,
  getMeals,
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
        padding: "12px 20px 24px",
        minHeight: "100%",
        display: "flex",
        flexDirection: "column",
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

      <div style={{ flex: 1 }}>{children}</div>

      <div style={{ display: "flex", gap: 10, marginTop: 24 }}>
        {onFinish && onNext && (
          <button
            onClick={onFinish}
            style={{
              flex: 1,
              padding: "14px",
              borderRadius: 12,
              border: "1.5px solid #c8ddd0",
              background: "#fff",
              color: "#2d5a3d",
              fontSize: 14,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            {finishLabel}
          </button>
        )}
        {onNext && (
          <button
            onClick={onNext}
            style={{
              flex: onFinish ? 1 : 2,
              padding: "14px",
              borderRadius: 12,
              border: "none",
              background: "#2d5a3d",
              color: "#fff",
              fontSize: 14,
              fontWeight: 700,
              cursor: "pointer",
              boxShadow: "0 4px 18px rgba(45,90,61,.25)",
            }}
          >
            {nextLabel}
          </button>
        )}
        {onFinish && !onNext && (
          <button
            onClick={onFinish}
            style={{
              flex: 2,
              padding: "14px",
              borderRadius: 12,
              border: "none",
              background: "linear-gradient(135deg, #2d5a3d 0%, #4cba6e 100%)",
              color: "#fff",
              fontSize: 14,
              fontWeight: 700,
              cursor: "pointer",
              boxShadow: "0 4px 18px rgba(76,186,110,.35)",
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

const MEMBER_AVATAR_COLORS = ["#2d5a3d", "#4a7c5e", "#1a3a24", "#3d6b4f", "#5a8a6a", "#2a5040"];

const ROLE_ICON_MAP = {
  "Adulto":   User,
  "Pareja":   Heart,
  "Hijo/a":   Baby,
  "Bebé":     Baby,
  "Abuelo/a": User,
  "Compi":    UserPlus,
  "Amigo/a":  Users,
  "Otro":     User,
};

export function OnboardingMembers({ data, setData, onNext, onFinish, onReset }) {
  const [name, setName] = useState("");
  const [ageStr, setAgeStr] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [ageMode, setAgeMode] = useState("number");
  const [roleEditId, setRoleEditId] = useState(null);
  const dateInputRef = useRef(null);

  const trimmedName = name.trim();
  const parsedAge = parseInt(ageStr, 10);
  const ageFromDob = ageFromBirthDate(birthDate);
  const computedAge =
    ageMode === "date" && birthDate
      ? ageFromDob
      : Number.isFinite(parsedAge)
        ? parsedAge
        : NaN;
  const ageProvided = Number.isFinite(computedAge) && computedAge >= 0;
  const canAdd = trimmedName.length > 0 && ageProvided;
  const showCalculatedAge = ageMode === "date" && Boolean(birthDate);
  const hasMembers = data.members.length > 0;

  const addMember = () => {
    if (!canAdd) return;
    setData((d) => ({
      ...d,
      members: [
        ...d.members,
        {
          id: uid(),
          name: trimmedName,
          age: computedAge,
          useBirthDate: ageMode === "date" && Boolean(birthDate),
          birthDate: ageMode === "date" ? birthDate : "",
          homeRole: suggestHomeRole(computedAge),
          stageDetail: "",
          allergies: [],
          dislikes: [],
        },
      ],
    }));
    setName("");
    setAgeStr("");
    setBirthDate("");
    setAgeMode("number");
  };

  const updateMemberHomeRole = (id, homeRole) => {
    setData((d) => ({
      ...d,
      members: d.members.map((m) => (m.id === id ? { ...m, homeRole } : m)),
    }));
    setRoleEditId(null);
  };

  const removeMember = (id) =>
    setData((d) => ({ ...d, members: d.members.filter((m) => m.id !== id) }));

  const fieldH = 44;
  const ageBoxStyle = (active, readonly) => ({
    width: fieldH,
    height: fieldH,
    borderRadius: 10,
    border: `1.5px solid ${active ? "#2d5a3d" : "#ddd"}`,
    background: readonly ? "rgba(45,90,61,.06)" : "#fff",
    fontSize: 15,
    fontWeight: 800,
    textAlign: "center",
    color: "#1a3a24",
    outline: "none",
    flexShrink: 0,
    fontFamily: "inherit",
  });

  return (
    <OnboardingShell
      title="¿Quién come en casa?"
      subtitle="Un nombre y su edad por persona — en un minuto lo tienes."
      onReset={onReset}
      onNext={hasMembers ? onNext : undefined}
      onFinish={hasMembers ? onFinish : undefined}
    >
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
                const current = member?.homeRole ?? suggestHomeRole(memberAge(member));
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
              readOnly={showCalculatedAge}
              value={showCalculatedAge ? String(ageFromDob) : ageStr}
              onChange={(e) => { setAgeStr(e.target.value.replace(/\D/g, "")); setBirthDate(""); setAgeMode("number"); }}
              onFocus={() => { if (showCalculatedAge) { setBirthDate(""); setAgeMode("number"); setAgeStr(""); } }}
              style={ageBoxStyle(ageMode === "number" || showCalculatedAge, showCalculatedAge)}
              onKeyDown={(e) => e.key === "Enter" && addMember()}
            />
            <button
              type="button"
              onClick={() => { try { dateInputRef.current?.showPicker?.(); } catch { dateInputRef.current?.click(); } }}
              style={{
                ...ageBoxStyle(ageMode === "date", false),
                display: "flex", alignItems: "center", justifyContent: "center",
                cursor: "pointer", background: ageMode === "date" ? "rgba(45,90,61,.08)" : "#fff",
                position: "relative",
              }}
            >
              <CalendarDays size={20} color="#2d5a3d" />
              <input
                ref={dateInputRef}
                type="date"
                value={birthDate}
                onChange={(e) => { setBirthDate(e.target.value); setAgeMode("date"); }}
                style={{ position: "absolute", opacity: 0, width: 1, height: 1, pointerEvents: "none" }}
                tabIndex={-1}
              />
            </button>
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
          }}
        >
          <Plus size={16} />
          Añadir
        </button>
      </div>

      <style>{`
        @keyframes memberIn {
          from { opacity: 0; transform: translateY(-8px) scale(0.97); }
          to   { opacity: 1; transform: translateY(0)   scale(1);    }
        }
        .member-enter { animation: memberIn .22s cubic-bezier(.25,.46,.45,.94) both; }
      `}</style>

      {/* Divider */}
      {hasMembers && (
        <div style={{ height: 1, background: "rgba(45,90,61,.1)", margin: "4px 0 8px" }} />
      )}

      {/* Member cards */}
      {data.members.map((m, idx) => {
        const role = m.homeRole ?? suggestHomeRole(memberAge(m));
        const avatarColor = MEMBER_AVATAR_COLORS[idx % MEMBER_AVATAR_COLORS.length];
        const RoleIcon = ROLE_ICON_MAP[role] ?? User;
        const initial = m.name.trim()[0]?.toUpperCase() ?? "?";
        return (
          <div
            key={m.id}
            className="member-enter"
            style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: "10px 12px", background: "#f6f9f7",
              borderRadius: 14, marginBottom: 8,
            }}
          >
            <div style={{ width: 40, height: 40, borderRadius: "50%", background: avatarColor,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 15, fontWeight: 800, color: "#fff", flexShrink: 0 }}>
              {initial}
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

/** Exactly 5 presets in the 2×3 grid; F2C3 is «Otro». */
const GRID_ALLERGY_SLOTS = ["Gluten", "Lactosa", "Frutos secos", "Marisco", "Huevo"];
const GRID_DISLIKE_SLOTS = ["Hígado", "Coliflor", "Cebolla", "Pimiento", "Aceitunas"];

function restrictionTabStyle(active) {
  return {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 6,
    padding: "14px 8px 12px",
    borderRadius: 14,
    border: `1.5px solid ${active ? "#2d5a3d" : "#e3ebe6"}`,
    background: active ? "#2d5a3d" : "#f4f7f5",
    color: active ? "#fff" : "#9ab0a1",
    fontSize: 12,
    fontWeight: 700,
    cursor: "pointer",
    fontFamily: "inherit",
    transition: "all .15s ease",
  };
}

function gridChipStyle(selected) {
  return {
    height: 26,
    padding: "0 4px",
    borderRadius: 7,
    border: `1px solid ${selected ? "rgba(45,90,61,.45)" : "#e5ebe7"}`,
    background: selected ? "rgba(45,90,61,.1)" : "#fff",
    color: selected ? "#1a3a24" : "#777",
    fontSize: 10,
    fontWeight: selected ? 700 : 500,
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

const fixedMealSelectStyle = {
  height: fixedRowH,
  padding: "0 8px",
  borderRadius: 8,
  border: "1px solid #ddd",
  fontSize: 11,
  fontWeight: 600,
  color: "#1a3a24",
  background: "#fff",
  outline: "none",
  flexShrink: 0,
  minWidth: 0,
  maxWidth: 118,
  fontFamily: "inherit",
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

function MealSelect({ meals, mealOptions, onChange }) {
  const comida = mealOptions.find((m) => m.toLowerCase() === "comida") ?? mealOptions[0];
  const cena = mealOptions.find((m) => m.toLowerCase() === "cena") ?? mealOptions[1];
  const value = mealToSelectValue(meals, mealOptions);
  return (
    <select
      value={value}
      onChange={(e) => onChange([e.target.value])}
      style={{ ...fixedMealSelectStyle, width: "100%", maxWidth: "none" }}
      aria-label="Cuándo"
    >
      {comida && <option value={comida}>Comida</option>}
      {cena && cena !== comida && <option value={cena}>Cena</option>}
    </select>
  );
}

function clampTimesPerWeek(n) {
  return Math.min(7, Math.max(1, Math.round(n)));
}

/** Veces/semana: edita como texto y valida al salir del campo (evita saltar a 7 al teclear). */
function FixedTimesInput({ value, onChange }) {
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
    const clamped = clampTimesPerWeek(n);
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

function FixedDishRow({ name, nameValue, onNameChange, times, meals, mealOptions, onTimesChange, onMealsChange, onSubmit, onRemove, canSubmit }) {
  const isNew = onNameChange != null;
  return (
    <div style={{ display: "flex", gap: 6, alignItems: "flex-end" }}>
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
          <p
            style={{
              margin: 0,
              height: fixedRowH,
              lineHeight: `${fixedRowH}px`,
              fontSize: 12,
              fontWeight: 700,
              color: "#1a3a24",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {name}
          </p>
        )}
      </div>
      <div style={{ flexShrink: 0 }}>
        <p style={fieldLbl}>Veces</p>
        <FixedTimesInput value={times} onChange={onTimesChange} />
      </div>
      <div style={{ flex: "0 1 108px", minWidth: 88 }}>
        <p style={fieldLbl}>Cuándo</p>
        <MealSelect meals={meals} mealOptions={mealOptions} onChange={onMealsChange} />
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

function AvoidOptionGrid({ slotLabels, selectedSet, onToggle, onAddClick, addOpen, addValue, onAddValueChange, onAddConfirm, addPlaceholder }) {
  const gridRowH = 26;
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
        {slotLabels.slice(0, 5).map((label) => (
          <button
            key={label}
            type="button"
            onClick={() => onToggle(label)}
            title={label}
            style={{
              ...gridChipStyle(selectedSet.has(label)),
              width: "100%",
              height: gridRowH,
              display: "block",
            }}
          >
            {label}
          </button>
        ))}
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
            placeholder={addPlaceholder}
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

export function OnboardingRestrictions({ data, setData, onNext, onBack, onFinish, onReset }) {
  const mealOptions = getMeals(data);
  const [tab, setTab] = useState("avoid");
  const [allergyMemberId, setAllergyMemberId] = useState(data.members[0]?.id ?? null);
  const [customAllergy, setCustomAllergy] = useState("");
  const [customDislike, setCustomDislike] = useState("");
  const [showAddAllergy, setShowAddAllergy] = useState(false);
  const [showAddDislike, setShowAddDislike] = useState(false);
  const [showMatrix, setShowMatrix] = useState(false);
  const [dish, setDish] = useState("");
  const [newDishTimes, setNewDishTimes] = useState(1);
  const [newDishMeals, setNewDishMeals] = useState(() => {
    const meals = getMeals(data);
    const comida = meals.find((m) => m.toLowerCase() === "comida");
    return [comida ?? meals[0] ?? "Comida"];
  });

  // Valores derivados en render (sin efectos con setState): si el miembro o
  // las comidas seleccionadas dejan de existir, recae en el primer valor válido.
  const validAllergyMemberId = data.members.some((m) => m.id === allergyMemberId)
    ? allergyMemberId
    : data.members[0]?.id ?? null;

  const validNewDishMeals = (() => {
    const valid = newDishMeals.filter((m) => mealOptions.includes(m));
    if (valid.length > 0) return valid;
    const comida = mealOptions.find((x) => x.toLowerCase() === "comida");
    return [comida ?? mealOptions[0]].filter(Boolean);
  })();

  const toggleMember = (id, field, val) =>
    setData((d) => ({
      ...d,
      members: d.members.map((m) =>
        m.id !== id
          ? m
          : {
              ...m,
              [field]: (m[field] ?? []).includes(val)
                ? m[field].filter((v) => v !== val)
                : [...(m[field] ?? []), val],
            }
      ),
    }));

  const toggleHouse = (val) =>
    setData((d) => ({
      ...d,
      dislikes: (d.dislikes ?? []).includes(val)
        ? d.dislikes.filter((v) => v !== val)
        : [...(d.dislikes ?? []), val],
    }));

  const addCustomAllergy = () => {
    const label = titleCase(customAllergy);
    if (!label || !validAllergyMemberId) return;
    setData((d) => ({
      ...d,
      customAllergies: (d.customAllergies ?? []).includes(label)
        ? d.customAllergies
        : [...(d.customAllergies ?? []), label],
    }));
    toggleMember(validAllergyMemberId, "allergies", label);
    setCustomAllergy("");
    setShowAddAllergy(false);
  };

  const addCustomDislike = () => {
    const label = titleCase(customDislike);
    if (!label) return;
    setData((d) => ({
      ...d,
      customDislikes: (d.customDislikes ?? []).includes(label)
        ? d.customDislikes
        : [...(d.customDislikes ?? []), label],
    }));
    toggleHouse(label);
    setCustomDislike("");
    setShowAddDislike(false);
  };

  const allergySelected = new Set(
    data.members.find((m) => m.id === validAllergyMemberId)?.allergies ?? []
  );
  const houseDislikeSelected = new Set(data.dislikes ?? []);

  const hasAnyMarks =
    (data.dislikes ?? []).length > 0 ||
    data.members.some((m) => (m.allergies?.length ?? 0) > 0 || (m.dislikes?.length ?? 0) > 0);

  const addFixedDish = () => {
    const label = normalizeTextValue(dish);
    if (!label || validNewDishMeals.length === 0) return;
    const entry = normalizeFixedDish({
      name: label,
      timesPerWeek: newDishTimes,
      meals: validNewDishMeals,
    });
    if (!entry) return;
    setData((d) => ({
      ...d,
      fixedDishes: [...migrateFixedDishes(d.fixedDishes ?? []), entry],
    }));
    setDish("");
    setNewDishTimes(1);
    const comida = mealOptions.find((m) => m.toLowerCase() === "comida");
    setNewDishMeals([comida ?? mealOptions[0]]);
  };

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

  const fixedList = migrateFixedDishes(data.fixedDishes ?? []);
  const canAddDish = Boolean(normalizeTextValue(dish)) && validNewDishMeals.length > 0;

  const matrixItems = useMemo(() => {
    const items = new Set();
    for (const m of data.members) {
      for (const a of m.allergies ?? []) items.add(a);
      for (const d of m.dislikes ?? []) items.add(d);
    }
    for (const d of data.dislikes ?? []) items.add(d);
    return Array.from(items);
  }, [data.members, data.dislikes]);

  return (
    <OnboardingShell
      title="¿Qué tenemos en cuenta?"
      subtitle="Lo que evitamos y lo que quieres repetir cada semana"
      onBack={onBack}
      onReset={onReset}
      onNext={onNext}
      onFinish={onFinish}
    >
      <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
        <button type="button" onClick={() => setTab("avoid")} style={restrictionTabStyle(tab === "avoid")}>
          <UtensilsCrossed size={20} />
          Evitar
        </button>
        <button type="button" onClick={() => setTab("repeat")} style={restrictionTabStyle(tab === "repeat")}>
          <Heart size={20} />
          Repetir
        </button>
      </div>

      {tab === "avoid" && (
        <>
          <div style={{ background: "#f6f9f7", borderRadius: 10, padding: "10px 12px", marginBottom: 12 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 10 }}>
              <p style={{ fontSize: 13, fontWeight: 800, color: "#1a3a24", margin: 0 }}>Alergias</p>
              <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                {data.members.map((m) => {
                  const sel = m.id === validAllergyMemberId;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setAllergyMemberId(m.id)}
                      title={m.name}
                      style={{
                        border: sel ? "2px solid #2d5a3d" : "2px solid transparent",
                        borderRadius: "50%",
                        padding: 0,
                        background: "transparent",
                        cursor: "pointer",
                      }}
                    >
                      <Avatar name={m.name} size={28} color={sel ? "#2d5a3d" : "#bbb"} />
                    </button>
                  );
                })}
              </div>
            </div>
            <AvoidOptionGrid
              slotLabels={GRID_ALLERGY_SLOTS}
              selectedSet={allergySelected}
              onToggle={(label) => validAllergyMemberId && toggleMember(validAllergyMemberId, "allergies", label)}
              onAddClick={() => setShowAddAllergy((v) => !v)}
              addOpen={showAddAllergy}
              addValue={customAllergy}
              onAddValueChange={setCustomAllergy}
              onAddConfirm={addCustomAllergy}
              addPlaceholder="Otra alergia"
            />
          </div>

          <div style={{ height: 1, background: "#d6e9dc", margin: "4px 0 12px" }} />

          <div style={{ background: "#f6f9f7", borderRadius: 10, padding: "10px 12px", marginBottom: 12 }}>
            <p style={{ fontSize: 13, fontWeight: 800, color: "#1a3a24", margin: "0 0 8px" }}>
              No come nadie en casa
            </p>
            <AvoidOptionGrid
              slotLabels={GRID_DISLIKE_SLOTS}
              selectedSet={houseDislikeSelected}
              onToggle={toggleHouse}
              onAddClick={() => setShowAddDislike((v) => !v)}
              addOpen={showAddDislike}
              addValue={customDislike}
              onAddValueChange={setCustomDislike}
              onAddConfirm={addCustomDislike}
              addPlaceholder="Otro alimento"
            />
          </div>

          {hasAnyMarks && (
            <button
              type="button"
              onClick={() => setShowMatrix((v) => !v)}
              style={{
                width: "100%",
                padding: "10px 12px",
                borderRadius: 10,
                border: "1px solid #d7e1db",
                background: "#f6f9f7",
                color: "#2d5a3d",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                fontWeight: 700,
                fontSize: 12,
                cursor: "pointer",
                marginBottom: showMatrix ? 10 : 0,
              }}
            >
              Ver tabla completa
              <Grid2X2 size={14} />
            </button>
          )}

          {hasAnyMarks && showMatrix && (
            <div style={{ border: "1px solid #e3ebe6", borderRadius: 10, background: "#fff", overflow: "hidden" }}>
              {matrixItems.map((item, idx) => {
                const withAllergy = data.members.filter((m) => (m.allergies ?? []).includes(item));
                return (
                  <div
                    key={item}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 10,
                      padding: "9px 12px",
                      borderTop: idx > 0 ? "1px solid #f0f3f1" : "none",
                    }}
                  >
                    <span style={{ fontSize: 12, fontWeight: 600, color: "#1a3a24", minWidth: 0 }}>{item}</span>
                    {withAllergy.length > 0 ? (
                      <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                        {withAllergy.map((m) => (
                          <Avatar key={m.id} name={m.name} size={22} title={m.name} />
                        ))}
                      </div>
                    ) : (
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 700,
                          color: "#2d5a3d",
                          flexShrink: 0,
                        }}
                      >
                        Todos
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {tab === "repeat" && (
        <>
          <div
            style={{
              background: "#f6f9f7",
              borderRadius: 10,
              padding: "10px",
              marginBottom: 8,
            }}
          >
            <FixedDishRow
              nameValue={dish}
              onNameChange={setDish}
              times={newDishTimes}
              meals={validNewDishMeals}
              mealOptions={mealOptions}
              onTimesChange={setNewDishTimes}
              onMealsChange={setNewDishMeals}
              onSubmit={addFixedDish}
              canSubmit={canAddDish}
            />
          </div>

          {fixedList.map((fd, idx) => (
            <div
              key={`${fd.name}-${idx}`}
              style={{
                background: "#f6f9f7",
                borderRadius: 10,
                padding: "8px 10px",
                marginBottom: 6,
              }}
            >
              <FixedDishRow
                name={fd.name}
                times={fd.timesPerWeek}
                meals={fd.meals}
                mealOptions={mealOptions}
                onTimesChange={(n) => updateFixedDish(idx, { timesPerWeek: n })}
                onMealsChange={(meals) => updateFixedDish(idx, { meals })}
                onRemove={() => removeFixedDish(idx)}
              />
            </div>
          ))}
        </>
      )}
    </OnboardingShell>
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
      desc: "Cada grupo tiene su propio menú — ideal si hay niños con gustos distintos",
    },
  ];

  const pickModel = (modelId) =>
    setData((d) => ({
      ...d,
      menuModel: modelId,
      groups: groupsFromModel(
        d.members.map((m) => ({ ...m, age: memberAge(m) })),
        modelId
      ),
    }));

  const moveMemberToGroup = (memberId, targetGroupId) =>
    setData((d) => {
      const groups = d.groups.map((g) => ({
        ...g,
        memberIds:
          g.id === targetGroupId
            ? Array.from(new Set([...g.memberIds, memberId]))
            : g.memberIds.filter((id) => id !== memberId),
      }));
      return { ...d, groups };
    });

  return (
    <OnboardingShell
      title="¿Cómo coméis en casa?"
      subtitle="Elige cómo organizar el menú familiar"
      onBack={onBack}
      onReset={onReset}
      onNext={onNext}
      onFinish={onFinish}
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

      {data.groups.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {data.members.map((member) => (
            <div key={member.id} style={{ background: "#f7f9f8", borderRadius: 10, padding: "10px 12px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <Avatar name={member.name} size={24} />
                <span style={{ fontSize: 13, fontWeight: 700, color: "#1a3a24" }}>{member.name}</span>
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {data.groups.map((g) => {
                  const selected = g.memberIds.includes(member.id);
                  return (
                    <button
                      key={`${member.id}-${g.id}`}
                      type="button"
                      onClick={() => moveMemberToGroup(member.id, g.id)}
                      style={{
                        padding: "7px 10px",
                        borderRadius: 8,
                        border: `1px solid ${selected ? g.color : "#d9d9d9"}`,
                        background: selected ? `${g.color}20` : "#fff",
                        color: selected ? g.color : "#666",
                        fontSize: 12,
                        fontWeight: 700,
                        cursor: "pointer",
                      }}
                    >
                      {g.label}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
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

export function OnboardingSchedule({ data, setData, onNext, onBack, onFinish, onReset }) {
  const meals = getMeals(data);
  const memberList = useMemo(() => data.members ?? [], [data.members]);
  const [sheetSlot, setSheetSlot] = useState(null);
  const [quickFillOpen, setQuickFillOpen] = useState(false);
  const [qfWeekday, setQfWeekday] = useState("casa");
  const [qfFinde, setQfFinde] = useState("casa");
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
      const main = primaryDayMeal(d);
      for (const id of subjectMemberIds) {
        const member = d.members.find((m) => m.id === id);
        const isKid = member ? stageForAge(memberAge(member)).id !== "adulto" : false;
        for (const day of DAYS) {
          const isWeekend = day === "Sáb" || day === "Dom";
          for (const meal of dayMeals) {
            const isMain = meal === main;
            let value;
            if (!isWeekend) {
              if (qfWeekday === "cole") {
                // Cole only applies to school-age kids; adults stay at home
                value = isMain ? (isKid ? "cole" : "casa") : "casa";
              } else if (qfWeekday === "fuera") {
                value = isMain ? "fuera" : "casa";
              } else {
                value = "casa";
              }
            } else {
              value = qfFinde === "fuera" && isMain ? "fuera" : "casa";
            }
            next[`${id}|${day}|${meal}`] = value;
          }
        }
      }
      return { ...d, schedule: next };
    });
    setQuickFillOpen(false);
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
        {ALL_DAY_MEALS.map((meal) => {
          const sel = meals.includes(meal);
          const MealIcon =
            meal === "Desayuno" ? Coffee : meal === "Comida" ? Sun : Moon;
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
            onClick={() => setQuickFillOpen(true)}
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
              Elige un patrón y lo aplicamos a toda la semana. Después ajusta cada celda en la vista por día.
            </p>

            <div style={{ marginBottom: 22 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#1a3a24", marginBottom: 10 }}>
                Entre semana, ¿dónde coméis?
              </div>
              <QuickFillSegment
                value={qfWeekday}
                onChange={setQfWeekday}
                options={[
                  { value: "casa",  icon: <House size={15} />,           label: "En casa" },
                  ...(allowCole ? [{ value: "cole", icon: <School size={15} />, label: "Niños al cole" }] : []),
                  { value: "fuera", icon: <UtensilsCrossed size={15} />, label: "Fuera" },
                ]}
              />
            </div>

            <div style={{ marginBottom: 28 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#1a3a24", marginBottom: 10 }}>
                El fin de semana, ¿qué hacéis?
              </div>
              <QuickFillSegment
                value={qfFinde}
                onChange={setQfFinde}
                options={[
                  { value: "casa",  icon: <House size={15} />,           label: "En casa" },
                  { value: "fuera", icon: <UtensilsCrossed size={15} />, label: "Salís a comer" },
                ]}
              />
            </div>

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

  // "Todos" cycling — same logic as day view cycleState but for all members
  const allValues = members.map((m) => schedule[`${m.id}|${day}|${meal}`] ?? "casa");
  const todosConsensus = allValues.every((v) => v === allValues[0]) ? allValues[0] : null;
  const cycleTodos = () => {
    const cur = todosConsensus ?? "casa";
    const next = columns[(columns.indexOf(cur === "off" ? "casa" : cur) + 1) % columns.length];
    onSetAllSlot(next);
  };

  // Day-view cell style — identical to DayView cells
  const dayViewCell = (state, onClick, disabled = false) => {
    const conf = SLOT_CONFIG[state] ?? SLOT_CONFIG.casa;
    if (disabled) return (
      <div style={{ flex: 1, height: 56, borderRadius: 14, background: "#f4f7f5", opacity: 0.25 }} />
    );
    return (
      <button
        type="button"
        onClick={onClick}
        style={{
          flex: 1, height: 56, borderRadius: 14, border: "none",
          background: conf.color,
          color: "#fff",
          boxShadow: `0 3px 10px ${conf.color}55`,
          display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center",
          gap: 4, cursor: "pointer", fontFamily: "inherit",
          transition: "background .15s ease, box-shadow .15s ease",
        }}
      >
        {stateIcon(state, 16)}
        <span style={{ fontSize: 10, fontWeight: 800 }}>
          {conf.label}
        </span>
      </button>
    );
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,.45)",
        zIndex: 150, display: "flex", alignItems: "flex-end", justifyContent: "center",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#fff", borderRadius: "20px 20px 0 0",
          width: "100%", maxWidth: 420,
          padding: "14px 16px calc(22px + env(safe-area-inset-bottom, 0px))",
          maxHeight: "75vh", overflowY: "auto",
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

        {/* Todos row — cycling button */}
        {members.length > 1 && (
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 10, fontWeight: 800, color: "#aaa", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>
              Todos
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              {columns.map((s) => dayViewCell(
                s,
                () => onSetAllSlot(s),
                false
              ))}
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
          height: "92vh",
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
                      width: `${Math.round(importProgress * 100)}%`,
                      background: "#2d5a3d",
                      borderRadius: 3,
                      transition: "width .4s ease",
                    }}
                  />
                </div>
                <div
                  style={{
                    fontSize: 11,
                    color: "#8d978f",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {importStatus || "…"}
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
const BASE_FREQS = { legumbres: 2, verdura: 3, pescado: 2 };

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
    "Robot/Thermomix",
    "Olla rápida",
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

      {/* Herramientas — grid estilo alergias */}
      <SectionTitle>Herramientas disponibles</SectionTitle>
      <div style={{ background: "#f6f9f7", borderRadius: 10, padding: "10px 12px", marginBottom: 4 }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
            gap: 6,
          }}
        >
          {availableTools.map((tool) => {
            const isCustom = (data.customKitchenTools ?? []).includes(tool);
            const sel = (data.kitchenTools ?? []).includes(tool);
            return (
              <button
                key={tool}
                type="button"
                onClick={() => (isCustom && sel ? removeCustomTool(tool) : toggleTool(tool))}
                style={{
                  ...gridChipStyle(sel),
                  height: 30,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 4,
                }}
              >
                {isCustom && sel && <X size={9} />}
                {tool}
              </button>
            );
          })}
          {addingTool ? (
            <input
              autoFocus
              value={draftTool}
              onChange={(e) => setDraftTool(e.target.value)}
              onBlur={addCustomTool}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.currentTarget.blur();
                if (e.key === "Escape") { setDraftTool(""); setAddingTool(false); }
              }}
              placeholder="Otra…"
              style={{
                height: 30,
                padding: "0 8px",
                borderRadius: 7,
                border: "1.5px solid #2d5a3d",
                fontSize: 11,
                outline: "none",
                fontFamily: "inherit",
              }}
            />
          ) : (
            <button
              type="button"
              onClick={() => setAddingTool(true)}
              style={{
                ...gridChipStyle(false),
                height: 30,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 4,
                border: "1px dashed #aacbb5",
                color: "#2d5a3d",
                fontWeight: 700,
              }}
            >
              <Plus size={11} /> Añadir
            </button>
          )}
        </div>
      </div>

      <div style={{ height: 1, background: "#d6e9dc", margin: "20px 0" }} />

      {/* Tiempo */}
      <SectionTitle>¿Cuánto tiempo tienes para cocinar?</SectionTitle>
      <SliderInput
        label="Entre semana"
        icon={BriefcaseBusiness}
        value={data.timeWeekday}
        min={10}
        max={90}
        step={5}
        suffix=" min"
        onChange={(v) => setData((d) => ({ ...d, timeWeekday: v }))}
      />
      <SliderInput
        label="El fin de semana"
        icon={Sunset}
        value={data.timeWeekend}
        min={10}
        max={120}
        step={5}
        suffix=" min"
        onChange={(v) => setData((d) => ({ ...d, timeWeekend: v }))}
      />
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
