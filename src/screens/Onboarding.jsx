import { Fragment, createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowUpDown,
  BookOpenCheck,
  BriefcaseBusiness,
  CalendarDays,
  Check,
  ChefHat,
  ChevronDown,
  ChevronUp,
  Drumstick,
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
  Users,
  Utensils,
  UtensilsCrossed,
  X,
} from "lucide-react";
import { Chip, SliderInput, Avatar, AvatarStack, ProgressDots } from "../components/ui.jsx";
import { HOUSEHOLD_ROLES, stageForAge, stageLabel, suggestHomeRole } from "../lib/stages.js";
import { migrateFixedDishes, normalizeFixedDish } from "../lib/fixedDishes.js";
import { groupsFromModel, membersOfGroup, uid } from "../lib/groups.js";
import {
  ALL_DAY_MEALS,
  DAYS,
  dayLabel,
  getMeals,
  isLunchMeal,
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

export const OnboardingProgressContext = createContext(null);

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
        {onFinish && (
          <button
            onClick={onFinish}
            style={{
              flex: 1,
              padding: "14px",
              borderRadius: 12,
              border: "1.5px solid #2d5a3d",
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
      </div>
    </div>
  );
}

// ─── Members ───────────────────────────────────────────────────

export function OnboardingMembers({ data, setData, onNext, onFinish, onReset }) {
  const [name, setName] = useState("");
  const [ageStr, setAgeStr] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [ageMode, setAgeMode] = useState("number");
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
  const showPersonas = trimmedName.length > 0 || hasMembers;

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

  const updateMemberAge = (id, val) => {
    const age = parseInt(val.replace(/\D/g, ""), 10);
    setData((d) => ({
      ...d,
      members: d.members.map((m) =>
        m.id === id
          ? {
              ...m,
              age: Number.isFinite(age) ? age : 0,
              useBirthDate: false,
              birthDate: "",
              homeRole: suggestHomeRole(Number.isFinite(age) ? age : memberAge(m)),
            }
          : m
      ),
    }));
  };

  const updateMemberHomeRole = (id, homeRole) =>
    setData((d) => ({
      ...d,
      members: d.members.map((m) => (m.id === id ? { ...m, homeRole } : m)),
    }));

  const removeMember = (id) =>
    setData((d) => ({ ...d, members: d.members.filter((m) => m.id !== id) }));

  const colHdr = {
    fontSize: 11,
    fontWeight: 800,
    textTransform: "uppercase",
    letterSpacing: 0.3,
  };
  const cellText = { fontSize: 11, fontWeight: 700, color: "#1a3a24" };
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
  });
  const gridCols = "minmax(0, 1fr) 40px minmax(72px, 1fr) 28px";

  return (
    <OnboardingShell
      title="¿Quién come en casa?"
      subtitle="Un nombre y su edad por persona — en un minuto lo tienes."
      onReset={onReset}
      onNext={hasMembers ? onNext : undefined}
      onFinish={hasMembers ? onFinish : undefined}
    >
      <div style={{ marginBottom: 16 }}>
        <div
          style={{
            display: "flex",
            gap: 8,
            alignItems: "flex-end",
            marginBottom: 4,
          }}
        >
          <span style={{ ...colHdr, color: "#1a3a24", flex: "1 1 168px", maxWidth: 168 }}>
            Nombre
          </span>
          <span style={{ ...colHdr, color: "#3d6b4f", width: 96 }}>Edad</span>
          <span style={{ flex: 1 }} />
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="María"
            style={{
              flex: "1 1 168px",
              maxWidth: 168,
              minWidth: 0,
              height: fieldH,
              padding: "0 12px",
              borderRadius: 10,
              border: "1.5px solid #ddd",
              fontSize: 14,
              outline: "none",
              boxSizing: "border-box",
            }}
            onKeyDown={(e) => e.key === "Enter" && addMember()}
          />
          <input
            type="text"
            inputMode="numeric"
            readOnly={showCalculatedAge}
            value={showCalculatedAge ? String(ageFromDob) : ageStr}
            onChange={(e) => {
              setAgeStr(e.target.value.replace(/\D/g, ""));
              setBirthDate("");
              setAgeMode("number");
            }}
            onFocus={() => {
              if (showCalculatedAge) {
                setBirthDate("");
                setAgeMode("number");
                setAgeStr("");
              }
            }}
            style={ageBoxStyle(ageMode === "number" || showCalculatedAge, showCalculatedAge)}
            onKeyDown={(e) => e.key === "Enter" && addMember()}
          />
          <button
            type="button"
            onClick={() => dateInputRef.current?.showPicker?.() ?? dateInputRef.current?.click()}
            style={{
              ...ageBoxStyle(ageMode === "date", false),
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              background: ageMode === "date" ? "rgba(45,90,61,.08)" : "#fff",
              position: "relative",
            }}
          >
            <CalendarDays size={20} color="#2d5a3d" />
            <input
              ref={dateInputRef}
              type="date"
              value={birthDate}
              onChange={(e) => {
                setBirthDate(e.target.value);
                setAgeMode("date");
              }}
              style={{
                position: "absolute",
                opacity: 0,
                width: 1,
                height: 1,
                pointerEvents: "none",
              }}
              tabIndex={-1}
            />
          </button>
          <div style={{ flex: 1, minWidth: 8 }} />
          <button
            type="button"
            onClick={addMember}
            disabled={!canAdd}
            style={{
              height: fieldH,
              padding: "0 14px",
              borderRadius: 10,
              border: "none",
              background: canAdd ? "#2d5a3d" : "#cdd5d0",
              color: "#fff",
              fontSize: 13,
              fontWeight: 800,
              cursor: canAdd ? "pointer" : "not-allowed",
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              flexShrink: 0,
              fontFamily: "inherit",
            }}
          >
            <Plus size={16} />
            Añadir
          </button>
        </div>
      </div>

      {showPersonas && (
        <div
          style={{
            marginTop: 28,
            paddingTop: 20,
            borderTop: "1px solid rgba(45,90,61,.12)",
          }}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: gridCols,
              gap: 8,
              alignItems: "center",
              marginBottom: 6,
              padding: "0 4px",
            }}
          >
            <span style={{ ...colHdr, color: "#1a3a24" }}>Nombre</span>
            <span style={{ ...colHdr, color: "#3d6b4f", textAlign: "center" }}>Edad</span>
            <span style={{ ...colHdr, color: "#5a7a4a" }}>En casa es</span>
            <span />
          </div>

          {trimmedName && (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: gridCols,
                gap: 8,
                alignItems: "center",
                marginBottom: 6,
                padding: "8px 10px",
                borderRadius: 10,
                border: "1.5px dashed rgba(45,90,61,.35)",
                background: "rgba(45,90,61,.03)",
              }}
            >
              <span style={{ ...cellText, color: "#3d6b4f" }}>{trimmedName}</span>
              <span style={{ ...cellText, textAlign: "center", color: "#888" }}>
                {ageProvided ? computedAge : "—"}
              </span>
              <span style={{ ...cellText, color: "#888" }}>
                {ageProvided ? suggestHomeRole(computedAge) : "—"}
              </span>
              <span />
            </div>
          )}

          {data.members.map((m) => (
            <div
              key={m.id}
              style={{
                display: "grid",
                gridTemplateColumns: gridCols,
                gap: 8,
                alignItems: "center",
                marginBottom: 6,
                background: "#f6f9f7",
                borderRadius: 10,
                padding: "8px 10px",
              }}
            >
              <span
                style={{
                  ...cellText,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {m.name}
              </span>
              <input
                inputMode="numeric"
                value={String(memberAge(m))}
                onChange={(e) => updateMemberAge(m.id, e.target.value)}
                style={{
                  width: "100%",
                  padding: "5px 2px",
                  borderRadius: 8,
                  border: "1px solid #ddd",
                  ...cellText,
                  textAlign: "center",
                  boxSizing: "border-box",
                }}
              />
              <select
                value={m.homeRole ?? suggestHomeRole(memberAge(m))}
                onChange={(e) => updateMemberHomeRole(m.id, e.target.value)}
                style={{
                  width: "100%",
                  padding: "5px 4px",
                  borderRadius: 8,
                  border: "1px solid #ddd",
                  ...cellText,
                  background: "#fff",
                  boxSizing: "border-box",
                }}
              >
                {HOUSEHOLD_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => removeMember(m.id)}
                aria-label={`Quitar a ${m.name}`}
                style={{
                  border: "none",
                  background: "transparent",
                  cursor: "pointer",
                  color: "#c47070",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: 0,
                }}
              >
                <Trash2 size={15} />
              </button>
            </div>
          ))}
        </div>
      )}
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
    padding: "8px 12px",
    borderRadius: 10,
    border: `1.5px solid ${active ? "#2d5a3d" : "#e0e6e2"}`,
    background: active ? "rgba(45,90,61,.08)" : "#fff",
    color: active ? "#2d5a3d" : "#888",
    fontSize: 12,
    fontWeight: 700,
    cursor: "pointer",
    fontFamily: "inherit",
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
        <input
          type="number"
          min={1}
          max={7}
          value={times}
          onChange={(e) => onTimesChange(Math.min(7, Math.max(1, parseInt(e.target.value, 10) || 1)))}
          style={fixedTimesInputStyle}
          aria-label="Veces por semana"
        />
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

  useEffect(() => {
    if (!data.members.some((m) => m.id === allergyMemberId)) {
      setAllergyMemberId(data.members[0]?.id ?? null);
    }
  }, [data.members, allergyMemberId]);

  useEffect(() => {
    setNewDishMeals((cur) => {
      const m = cur[0];
      if (m && mealOptions.includes(m)) return [m];
      const comida = mealOptions.find((x) => x.toLowerCase() === "comida");
      return [comida ?? mealOptions[0]];
    });
  }, [mealOptions.join("|")]);

  const allergyOptions = useMemo(
    () => [...BASE_ALLERGY_OPTIONS, ...(data.customAllergies ?? [])],
    [data.customAllergies]
  );
  const dislikeOptions = useMemo(
    () => [...BASE_DISLIKE_OPTIONS, ...(data.customDislikes ?? [])],
    [data.customDislikes]
  );

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
    if (!label || !allergyMemberId) return;
    setData((d) => ({
      ...d,
      customAllergies: (d.customAllergies ?? []).includes(label)
        ? d.customAllergies
        : [...(d.customAllergies ?? []), label],
    }));
    toggleMember(allergyMemberId, "allergies", label);
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
    data.members.find((m) => m.id === allergyMemberId)?.allergies ?? []
  );
  const houseDislikeSelected = new Set(data.dislikes ?? []);

  const hasAnyMarks =
    (data.dislikes ?? []).length > 0 ||
    data.members.some((m) => (m.allergies?.length ?? 0) > 0 || (m.dislikes?.length ?? 0) > 0);

  const addFixedDish = () => {
    const label = normalizeTextValue(dish);
    if (!label || newDishMeals.length === 0) return;
    const entry = normalizeFixedDish({
      name: label,
      timesPerWeek: newDishTimes,
      meals: newDishMeals,
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
  const canAddDish = Boolean(normalizeTextValue(dish)) && newDishMeals.length > 0;

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
          Evitar
        </button>
        <button type="button" onClick={() => setTab("repeat")} style={restrictionTabStyle(tab === "repeat")}>
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
                  const sel = m.id === allergyMemberId;
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
              onToggle={(label) => allergyMemberId && toggleMember(allergyMemberId, "allergies", label)}
              onAddClick={() => setShowAddAllergy((v) => !v)}
              addOpen={showAddAllergy}
              addValue={customAllergy}
              onAddValueChange={setCustomAllergy}
              onAddConfirm={addCustomAllergy}
              addPlaceholder="Otra alergia"
            />
          </div>

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
              meals={newDishMeals}
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
      icon: <Users size={18} color="#fff" />,
      label: "Todos comemos lo mismo",
      desc: "Un único menú para toda la familia",
    },
    {
      id: "variation",
      icon: <Layers2 size={18} color="#fff" />,
      label: "Base común + variaciones",
      desc: "Misma base, ajustes para casos concretos",
    },
    {
      id: "separate",
      icon: <ArrowUpDown size={18} color="#fff" />,
      label: "Grupos separados",
      desc: "Dos menús en paralelo",
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
      title="Modelo de menú"
      subtitle="Elige modelo base y ajusta personas entre grupos"
      onBack={onBack}
      onReset={onReset}
      onNext={onNext}
      onFinish={onFinish}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 14 }}>
        {models.map((m) => {
          const sel = data.menuModel === m.id;
          return (
            <button
              key={m.id}
              type="button"
              onClick={() => pickModel(m.id)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                width: "100%",
                textAlign: "left",
                padding: "12px 14px",
                borderRadius: 12,
                cursor: "pointer",
                background: sel ? "rgba(45,90,61,.08)" : "#f8f8f8",
                border: `2px solid ${sel ? "#2d5a3d" : "transparent"}`,
              }}
            >
              <span
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: 8,
                  background: "#2d5a3d",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {m.icon}
              </span>
              <span style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, color: "#1a3a24", fontSize: 14 }}>{m.label}</div>
                <div style={{ fontSize: 12, color: "#888" }}>{m.desc}</div>
              </span>
              {sel && <Check size={16} color="#2d5a3d" />}
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
  casa: { label: "Casa", color: "#2d5a3d" },
  tupper: { label: "Tupper", color: "#c67030" },
  fuera: { label: "Fuera", color: "#5a7ea8" },
  cole: { label: "Cole", color: "#3d7a52" },
};

const MIXED_COLOR = "#aaa";

function consensusState(memberIds, schedule, day, meal) {
  if (memberIds.length === 0) return "off";
  const states = memberIds.map((id) => schedule[`${id}|${day}|${meal}`] ?? "casa");
  return states.every((s) => s === states[0]) ? states[0] : "mixed";
}

export function OnboardingSchedule({ data, setData, onNext, onBack, onFinish, onReset }) {
  const meals = getMeals(data);
  const memberList = data.members ?? [];
  const defaultMode = memberList.length > 1 ? "all" : "single";
  const [subjectMode, setSubjectMode] = useState(defaultMode);
  const [activeMemberId, setActiveMemberId] = useState(memberList[0]?.id ?? null);

  useEffect(() => {
    if (!memberList.find((m) => m.id === activeMemberId)) {
      setActiveMemberId(memberList[0]?.id ?? null);
    }
  }, [memberList, activeMemberId]);

  const activeMember = data.members.find((m) => m.id === activeMemberId);

  const subjectMemberIds = useMemo(() => {
    if (subjectMode === "all") return memberList.map((m) => m.id);
    return activeMember ? [activeMember.id] : [];
  }, [subjectMode, activeMember, memberList]);

  const subjectMembers = useMemo(
    () => subjectMemberIds.map((id) => data.members.find((m) => m.id === id)).filter(Boolean),
    [subjectMemberIds, data.members]
  );
  const allowCole = subjectMembers.some(
    (m) => stageForAge(memberAge(m)).id !== "adulto"
  );

  // Sheet state: { day, meal | null } — when meal is null, the sheet is in
  // "day mode" (only row-level actions, no per-member edition for a slot).
  const [sheetSlot, setSheetSlot] = useState(null);
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

  const subjectLabel =
    subjectMode === "all" ? "familia" : (activeMember?.name ?? "individual");

  const openDay = (day) => {
    if (subjectMemberIds.length === 0) return;
    setSheetSlot({ day, meal: mainMeal });
  };

  return (
    <OnboardingShell
      title="¿Dónde coméis?"
      subtitle="Marca dónde come cada uno · toca una celda para elegir"
      onBack={onBack}
      onReset={onReset}
      onNext={onNext}
      onFinish={onFinish}
    >
      {memberList.length > 1 && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ display: "flex", gap: 8, marginBottom: subjectMode === "single" ? 10 : 0 }}>
            <button
              type="button"
              onClick={() => setSubjectMode("all")}
              style={tabButtonStyle(subjectMode === "all")}
            >
              <AvatarStack
                names={memberList.map((m) => m.name)}
                size={20}
                max={4}
                color={subjectMode === "all" ? "rgba(255,255,255,.35)" : "#bbb"}
              />
              Familia
            </button>
            <button
              type="button"
              onClick={() => setSubjectMode("single")}
              style={tabButtonStyle(subjectMode === "single")}
            >
              <User size={14} />
              Individual
            </button>
          </div>
          {subjectMode === "single" && (
            <div
              style={{
                display: "flex",
                gap: 6,
                overflowX: "auto",
                paddingTop: 10,
                WebkitOverflowScrolling: "touch",
              }}
            >
              {memberList.map((m) => {
                const sel = m.id === activeMemberId;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setActiveMemberId(m.id)}
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
                      fontFamily: "inherit",
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
        </div>
      )}

      <SectionTitle>Comidas del día</SectionTitle>
      <p style={{ fontSize: 11, color: "#888", margin: "0 0 8px" }}>
        Marca las que quieres cubrir en el menú
      </p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
        {ALL_DAY_MEALS.map((meal) => (
          <Chip
            key={meal}
            label={meal}
            selected={meals.includes(meal)}
            onClick={() => toggleDayMeal(meal)}
          />
        ))}
      </div>

      <SectionTitle>Acciones rápidas · {subjectLabel}</SectionTitle>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
        <button type="button" onClick={() => applyPreset("casa-todo")} style={presetStyle}>
          <House size={13} /> Casa siempre
        </button>
        <button type="button" onClick={() => applyPreset("tupper-laborable")} style={presetStyle}>
          <BriefcaseBusiness size={13} /> Tupper L-V
        </button>
        {allowCole && (
          <button type="button" onClick={() => applyPreset("cole-laborable")} style={presetStyle}>
            <School size={13} /> Cole L-V
          </button>
        )}
        <button type="button" onClick={() => applyPreset("fuera-finde")} style={presetStyle}>
          <UtensilsCrossed size={13} /> Finde fuera
        </button>
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

      <SectionTitle>Calendario</SectionTitle>
      <p style={{ fontSize: 11, color: "#888", margin: "0 0 8px" }}>
        Pulsa un día para igualar · pulsa una celda para elegir
      </p>
      <ScheduleGrid
        meals={meals}
        memberIds={subjectMemberIds}
        schedule={data.schedule}
        onCellClick={openCell}
        onDayClick={openDay}
      />
      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 8, marginBottom: 12 }}>
        <div
          style={{
            padding: "8px 10px",
            borderRadius: 8,
            border: "1px solid #e3ebe6",
            background: "#fafcfb",
          }}
        >
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
    </OnboardingShell>
  );
}

const SLOT_COLUMNS = ["casa", "tupper", "cole", "fuera"];

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
  const title = `${dayName} · ${meal}`;

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,.45)",
        zIndex: 150,
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#fff",
          borderRadius: "20px 20px 0 0",
          width: "100%",
          maxWidth: 420,
          padding: "12px 14px 18px",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 8,
          }}
        >
          <h3 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: "#1a3a24" }}>{title}</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            style={{
              background: "transparent",
              border: "none",
              color: "#888",
              fontSize: 22,
              cursor: "pointer",
              padding: 4,
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>

        <SheetIconLegend columns={columns} />

        {members.length > 1 && (
          <>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                width: "100%",
                padding: "10px 12px",
                borderRadius: 10,
                background: "rgba(45,90,61,.1)",
                border: "1.5px solid rgba(45,90,61,.28)",
                marginBottom: 0,
              }}
            >
              <span
                style={{
                  flex: 1,
                  fontSize: 13,
                  fontWeight: 800,
                  color: "#2d5a3d",
                  minWidth: 0,
                }}
              >
                Todos
              </span>
              <SlotIconRow columns={columns} value={null} onPick={onSetAllSlot} />
            </div>
            <div
              style={{
                height: 1,
                background: "#e3ebe6",
                margin: "12px 0",
                width: "100%",
              }}
            />
          </>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {members.map((m) => {
            const raw = schedule[`${m.id}|${day}|${meal}`] ?? "casa";
            const cur = raw === "off" ? "casa" : raw;
            const kid = stageForAge(memberAge(m)).id !== "adulto";
            return (
              <div
                key={m.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  width: "100%",
                }}
              >
                <div
                  style={{
                    flex: 1,
                    minWidth: 0,
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  <Avatar name={m.name} size={24} />
                  <span
                    style={{
                      fontSize: 13,
                      fontWeight: 700,
                      color: "#1a3a24",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {m.name}
                  </span>
                </div>
                <SlotIconRow
                  columns={columns}
                  value={cur}
                  onPick={(s) => onSetMember(m.id, s)}
                  memberIsKid={kid}
                />
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

function SectionTitle({ children }) {
  return (
    <div
      style={{
        fontSize: 11,
        fontWeight: 800,
        color: "#888",
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
  return (
    <Tag
      type={onClick ? "button" : undefined}
      onClick={onClick}
      title={isMixed ? "Distinto por persona — pulsa para editar" : "Pulsa para elegir"}
      style={{
        width: "100%",
        minHeight: 48,
        borderRadius: 8,
        cursor: onClick ? "pointer" : "default",
        background: isMixed ? "#fafafa" : "#f8fbf9",
        border: `1.5px ${isMixed ? "dashed" : "solid"} ${color}55`,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 2,
        color,
        padding: "4px 2px",
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

function ScheduleGrid({ meals, memberIds, schedule, onCellClick, onDayClick }) {
  // Renders one row per meal. For groups, each cell shows the consensus, or a
  // dot stack of every member's state when they diverge. Clicking a consensus
  // cell cycles; clicking a divergent cell opens the slot editor.
  return (
    <div style={{ display: "grid", gridTemplateColumns: "auto repeat(7, 1fr)", gap: 4 }}>
      <div />
      {DAYS.map((d) => (
        <button
          key={d}
          type="button"
          onClick={onDayClick ? () => onDayClick(d) : undefined}
          title={onDayClick ? `Igualar todo el ${d}` : undefined}
          style={{
            textAlign: "center",
            fontWeight: 700,
            color: "#888",
            padding: 4,
            fontSize: 11,
            background: "transparent",
            border: "none",
            cursor: onDayClick ? "pointer" : "default",
            borderRadius: 6,
            fontFamily: "inherit",
          }}
        >
          {d}
        </button>
      ))}
      {meals.map((meal) => (
        <Fragment key={meal}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              fontWeight: 600,
              color: "#555",
              fontSize: 11,
              paddingRight: 6,
            }}
          >
            {meal}
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

  const applyDishes = (next) => {
    setData((d) => {
      const sm = d.schoolMenus ?? { shared: {}, byMember: {} };
      if (scope === "shared") {
        return { ...d, schoolMenus: { ...sm, shared: { ...(sm.shared ?? {}), ...next } } };
      }
      if (!activeKidId) return d;
      const cur = sm.byMember?.[activeKidId] ?? {};
      return {
        ...d,
        schoolMenus: {
          ...sm,
          byMember: { ...(sm.byMember ?? {}), [activeKidId]: { ...cur, ...next } },
        },
      };
    });
  };

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
    setParsedWeeks([]);
    setSelectedWeekIdx(0);
  };

  const handleFile = async (file) => {
    if (!file) return;
    setImporting(true);
    setImportError(null);
    setImportStatus("Leyendo archivo…");
    try {
      const { weeks, entries } = await importSchoolMenuFile(file, {
        onProgress: (p) => {
          if (p.stage === "pdf-text") {
            setImportStatus(`Leyendo PDF (${p.page}/${p.total})…`);
          } else if (p.stage === "ocr-fallback") {
            setImportStatus("PDF sin texto, aplicando OCR…");
          } else if (p.stage === "ocr-page") {
            setImportStatus(`OCR página ${p.page}/${p.total}…`);
          } else if (p.stage === "ocr-progress" && p.status) {
            const pct = typeof p.progress === "number" ? Math.round(p.progress * 100) : null;
            setImportStatus(`OCR · ${p.status}${pct != null ? ` ${pct}%` : ""}`);
          } else if (p.stage === "ai-parse") {
            setImportStatus("Usando IA para interpretar el menú…");
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
        <button
          type="button"
          onClick={() => setScope("shared")}
          style={{
            flex: 1,
            padding: "9px 10px",
            borderRadius: 10,
            border: `1.5px solid ${scope === "shared" ? "#2d5a3d" : "#ddd"}`,
            background: scope === "shared" ? "rgba(45,90,61,.08)" : "#fff",
            color: "#2d5a3d",
            fontSize: 12,
            fontWeight: 700,
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
          }}
        >
          <School size={14} />
          Mismo menú para todos
        </button>
        <button
          type="button"
          onClick={() => setScope("individual")}
          style={{
            flex: 1,
            padding: "9px 10px",
            borderRadius: 10,
            border: `1.5px solid ${scope === "individual" ? "#2d5a3d" : "#ddd"}`,
            background: scope === "individual" ? "rgba(45,90,61,.08)" : "#fff",
            color: "#2d5a3d",
            fontSize: 12,
            fontWeight: 700,
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
          }}
        >
          <User size={14} />
          Por niño/a
        </button>
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

      <SectionTitle>Importar menú</SectionTitle>
      <div
        onClick={() => !importing && fileInputRef.current?.click()}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "14px 14px",
          borderRadius: 12,
          border: "1.5px dashed rgba(45,90,61,.35)",
          background: importing ? "#f6f9f7" : "#fff",
          cursor: importing ? "default" : "pointer",
          marginBottom: 8,
        }}
      >
        <span
          style={{
            width: 36,
            height: 36,
            borderRadius: 10,
            background: "rgba(45,90,61,.12)",
            color: "#2d5a3d",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          {importing ? <Loader2 size={18} className="rotating" /> : <Upload size={18} />}
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#1a3a24" }}>
            {importing ? "Procesando…" : "Subir PDF, foto o CSV"}
          </div>
          <div
            style={{
              fontSize: 11,
              color: "#888",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {importing ? importStatus || "…" : importedFileName || ""}
          </div>
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

      {!importing && !importError && importStatus && importedFileName && (
        <div
          style={{
            background: "rgba(45,90,61,.08)",
            border: "1px solid #d7e1db",
            color: "#2d5a3d",
            borderRadius: 10,
            padding: "8px 10px",
            fontSize: 11,
            marginBottom: 8,
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <FileText size={13} />
          {importStatus}
        </div>
      )}

      {parsedWeeks.length > 1 && !importing && (
        <div
          style={{
            display: "flex",
            gap: 6,
            overflowX: "auto",
            paddingBottom: 4,
            marginBottom: 8,
          }}
        >
          {parsedWeeks.map((w, i) => {
            const sel = i === selectedWeekIdx;
            return (
              <button
                key={i}
                type="button"
                onClick={() => {
                  setSelectedWeekIdx(i);
                  replaceDishes(w.entries);
                  const days = new Set(
                    Object.keys(w.entries).map((k) => k.split("-")[0])
                  ).size;
                  setImportStatus(
                    `Detectadas ${parsedWeeks.length} semanas · Semana ${i + 1} seleccionada (${days}/5 días)`
                  );
                }}
                style={{
                  padding: "6px 12px",
                  borderRadius: 8,
                  border: `1.5px solid ${sel ? "#2d5a3d" : "#ddd"}`,
                  background: sel ? "rgba(45,90,61,.08)" : "#fff",
                  color: "#2d5a3d",
                  fontSize: 11,
                  fontWeight: 700,
                  cursor: "pointer",
                  flexShrink: 0,
                  whiteSpace: "nowrap",
                }}
              >
                {w.weekLabel || `Semana ${i + 1}`}
              </button>
            );
          })}
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
        <button
          type="button"
          onClick={clearAll}
          style={{
            padding: "6px 10px",
            borderRadius: 8,
            border: "1.5px solid #d7e1db",
            background: "#fff",
            color: "#2d5a3d",
            fontSize: 11,
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          Vaciar
        </button>
      </div>

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
          {hasAnyDish && (
            <span
              style={{
                fontSize: 10,
                fontWeight: 800,
                color: "#2d5a3d",
                background: "rgba(45,90,61,.12)",
                padding: "2px 6px",
                borderRadius: 6,
                letterSpacing: 0,
              }}
            >
              {Object.keys(targetMap).length} platos
            </span>
          )}
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
  const skills = ["Pasta", "Arroces", "Horno", "Salsas", "Wok", "Repostería", "Guisos", "Plancha"];
  const tools = [
    "Airfryer",
    "Horno",
    "Microondas",
    "Robot/Thermomix",
    "Olla rápida",
    "Batidora",
  ];
  const availableTools = [...tools, ...(data.customKitchenTools ?? [])];
  const [addingTool, setAddingTool] = useState(false);
  const [draftTool, setDraftTool] = useState("");
  const toggleSkill = (s) =>
    setData((d) => ({
      ...d,
      cookSkills: d.cookSkills.includes(s)
        ? d.cookSkills.filter((v) => v !== s)
        : [...d.cookSkills, s],
    }));
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
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 20 }}>
        {levels.map((l) => (
          <div
            key={l.id}
            onClick={() => setData((d) => ({ ...d, cookLevel: l.id }))}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "14px 16px",
              borderRadius: 12,
              cursor: "pointer",
              background: data.cookLevel === l.id ? "rgba(45,90,61,.08)" : "#f8f8f8",
              border: `2px solid ${data.cookLevel === l.id ? "#2d5a3d" : "transparent"}`,
            }}
          >
            <span style={{ color: "#2d5a3d" }}>{l.icon}</span>
            <div>
              <div style={{ fontWeight: 700, color: "#1a3a24", fontSize: 14 }}>{l.label}</div>
              <div style={{ fontSize: 12, color: "#888" }}>{l.desc}</div>
            </div>
          </div>
        ))}
      </div>
      <p style={{ fontSize: 13, fontWeight: 700, color: "#555", marginBottom: 10 }}>
        ¿Qué se te da bien?
      </p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 20 }}>
        {skills.map((s) => (
          <Chip key={s} label={s} selected={data.cookSkills.includes(s)} onClick={() => toggleSkill(s)} />
        ))}
      </div>
      <p style={{ fontSize: 13, fontWeight: 700, color: "#555", marginBottom: 10 }}>
        Herramientas disponibles
      </p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 20 }}>
        {availableTools.map((tool) => (
          <Chip
            key={tool}
            label={tool}
            selected={(data.kitchenTools ?? []).includes(tool)}
            removable={(data.customKitchenTools ?? []).includes(tool)}
            onClick={() =>
              (data.customKitchenTools ?? []).includes(tool) &&
              (data.kitchenTools ?? []).includes(tool)
                ? removeCustomTool(tool)
                : toggleTool(tool)
            }
          />
        ))}
        {addingTool ? (
          <input
            autoFocus
            value={draftTool}
            onChange={(e) => setDraftTool(e.target.value)}
            onBlur={addCustomTool}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
              if (e.key === "Escape") {
                setDraftTool("");
                setAddingTool(false);
              }
            }}
            placeholder="Otra herramienta"
            style={{
              padding: "6px 14px",
              borderRadius: 20,
              border: "1.5px solid #2d5a3d",
              fontSize: 13,
              outline: "none",
              fontFamily: "inherit",
              minWidth: 130,
            }}
          />
        ) : (
          <button
            type="button"
            onClick={() => setAddingTool(true)}
            style={{
              ...chipStyle(false),
              border: "1.5px dashed #2d5a3d",
              cursor: "pointer",
              fontWeight: 700,
            }}
          >
            <Plus size={12} /> Añadir
          </button>
        )}
      </div>
      <SliderInput
        label="Tiempo entre semana"
        value={data.timeWeekday}
        min={10}
        max={90}
        step={5}
        suffix=" min"
        onChange={(v) => setData((d) => ({ ...d, timeWeekday: v }))}
      />
      <SliderInput
        label="Tiempo finde"
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
