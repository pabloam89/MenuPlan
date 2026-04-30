import { Fragment, useEffect, useMemo, useRef, useState } from "react";
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
  Sparkles,
  Upload,
  User,
  Users,
  Utensils,
  UtensilsCrossed,
  X,
} from "lucide-react";
import { Chip, SliderInput, Avatar } from "../components/ui.jsx";
import { stageForAge, stageLabel } from "../lib/stages.js";
import { groupsFromModel, membersOfGroup, uid } from "../lib/groups.js";
import { DAYS, getMeals } from "../lib/planner.js";
import { SCHOOL_DAYS, SCHOOL_COURSES } from "../lib/schoolMenu.js";
import { importSchoolMenuFile } from "../lib/schoolMenuImport.js";

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
  return (
    <div
      style={{
        padding: "12px 20px 24px",
        minHeight: "100%",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div style={{ minHeight: 38, marginBottom: 6, display: "flex", justifyContent: "space-between" }}>
        <div>
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              style={{
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
              }}
            >
              Atrás
            </button>
          )}
        </div>
        <div>
          {onReset && (
            <button
              type="button"
              onClick={onReset}
              style={{
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
              }}
            >
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
  const [inputMode, setInputMode] = useState("age");
  const [age, setAge] = useState("");
  const [birthDate, setBirthDate] = useState("");

  const trimmedName = name.trim();
  const useBirthDate = inputMode === "birthDate";
  const parsedAge = parseInt(age, 10);
  const ageFromDob = ageFromBirthDate(birthDate);
  const ageProvided = useBirthDate
    ? Boolean(birthDate) && Number.isFinite(ageFromDob) && ageFromDob >= 0
    : Number.isFinite(parsedAge) && parsedAge >= 0;
  const canAdd = trimmedName.length > 0 && ageProvided;

  const addMember = () => {
    if (!canAdd) return;
    const computedAge = useBirthDate ? ageFromDob : parsedAge;
    setData((d) => ({
      ...d,
      members: [
        ...d.members,
        {
          id: uid(),
          name: trimmedName,
          age: computedAge,
          useBirthDate,
          birthDate: useBirthDate ? birthDate : "",
          stageDetail: "",
          allergies: [],
          dislikes: [],
        },
      ],
    }));
    setName("");
    setAge("");
    setBirthDate("");
  };

  const updateMemberMode = (id, mode) =>
    setData((d) => ({
      ...d,
      members: d.members.map((m) =>
        m.id !== id
          ? m
          : {
              ...m,
              useBirthDate: mode === "birthDate",
              birthDate: mode === "birthDate" ? m.birthDate ?? "" : "",
            }
      ),
    }));

  const updateMemberAge = (id, val) =>
    setData((d) => ({
      ...d,
      members: d.members.map((m) => (m.id === id ? { ...m, age: parseInt(val, 10) || 0 } : m)),
    }));

  const updateMemberBirthDate = (id, val) =>
    setData((d) => ({
      ...d,
      members: d.members.map((m) =>
        m.id === id ? { ...m, birthDate: val, age: ageFromBirthDate(val) } : m
      ),
    }));

  const removeMember = (id) =>
    setData((d) => ({ ...d, members: d.members.filter((m) => m.id !== id) }));

  const hasMembers = data.members.length > 0;

  return (
    <OnboardingShell
      title="¿Quién come en casa?"
      subtitle="Añade personas con edad o fecha de nacimiento"
      onReset={onReset}
      onNext={hasMembers ? onNext : undefined}
      onFinish={hasMembers ? onFinish : undefined}
    >
      <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nombre"
          style={{
            flex: 1,
            minWidth: 0,
            padding: "12px 14px",
            borderRadius: 10,
            border: "1.5px solid #ddd",
            fontSize: 14,
            outline: "none",
          }}
          onKeyDown={(e) => e.key === "Enter" && addMember()}
        />
        <button
          type="button"
          onClick={addMember}
          disabled={!canAdd}
          aria-label="Añadir"
          title={
            !trimmedName
              ? "Indica un nombre"
              : !ageProvided
              ? useBirthDate
                ? "Indica la fecha de nacimiento"
                : "Indica la edad"
              : "Añadir"
          }
          style={{
            background: canAdd ? "#2d5a3d" : "#cdd5d0",
            color: "#fff",
            border: "none",
            borderRadius: 10,
            width: 44,
            height: 44,
            flexShrink: 0,
            cursor: canAdd ? "pointer" : "not-allowed",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Plus size={18} />
        </button>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <button
          type="button"
          onClick={() => setInputMode("age")}
          style={{
            flex: 1,
            padding: "10px 12px",
            borderRadius: 10,
            border: `1.5px solid ${inputMode === "age" ? "#2d5a3d" : "#ddd"}`,
            background: inputMode === "age" ? "rgba(45,90,61,.08)" : "#fff",
            color: "#2d5a3d",
            fontSize: 13,
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          Edad
        </button>
        <button
          type="button"
          onClick={() => setInputMode("birthDate")}
          style={{
            flex: 1,
            padding: "10px 12px",
            borderRadius: 10,
            border: `1.5px solid ${inputMode === "birthDate" ? "#2d5a3d" : "#ddd"}`,
            background: inputMode === "birthDate" ? "rgba(45,90,61,.08)" : "#fff",
            color: "#2d5a3d",
            fontSize: 13,
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          Fecha nacimiento
        </button>
      </div>

      {inputMode === "age" ? (
        <input
          value={age}
          onChange={(e) => setAge(e.target.value.replace(/\D/g, ""))}
          placeholder="Edad"
          style={{
            width: "100%",
            marginBottom: 6,
            padding: "12px 14px",
            borderRadius: 10,
            border: "1.5px solid #ddd",
            fontSize: 14,
            outline: "none",
            textAlign: "center",
          }}
          onKeyDown={(e) => e.key === "Enter" && addMember()}
        />
      ) : (
        <input
          type="date"
          value={birthDate}
          onChange={(e) => setBirthDate(e.target.value)}
          style={{
            width: "100%",
            marginBottom: 6,
            padding: "12px 14px",
            borderRadius: 10,
            border: "1.5px solid #ddd",
            fontSize: 14,
            outline: "none",
          }}
        />
      )}

      <div
        style={{
          fontSize: 11,
          color: canAdd ? "#2d5a3d" : "#a85a7e",
          marginBottom: 12,
          minHeight: 16,
          fontWeight: 600,
        }}
      >
        {!trimmedName && !age && !birthDate
          ? "Añade un nombre y la edad o fecha de nacimiento."
          : !trimmedName
          ? "Falta el nombre."
          : !ageProvided
          ? useBirthDate
            ? "Falta la fecha de nacimiento."
            : "Falta la edad."
          : "Listo · pulsa + para añadir."}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 12 }}>
        {data.members.map((m) => (
          <div
            key={m.id}
            style={{
              background: "#f6f9f7",
              borderRadius: 12,
              padding: "10px 12px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <Avatar name={m.name} size={30} />
              <span style={{ fontWeight: 700, color: "#1a3a24", flex: 1 }}>{m.name}</span>
              <span
                style={{
                  background: "#fff",
                  border: "1px solid #e0e6e2",
                  color: "#555",
                  fontSize: 11,
                  fontWeight: 700,
                  padding: "4px 8px",
                  borderRadius: 8,
                }}
              >
                {memberAge(m)} años
              </span>
              <span
                style={{
                  background: "#e8f0ea",
                  color: "#2d5a3d",
                  fontSize: 10,
                  fontWeight: 700,
                  padding: "4px 8px",
                  borderRadius: 8,
                  textTransform: "uppercase",
                }}
              >
                {stageLabel({ ...m, age: memberAge(m) })}
              </span>
              <button
                type="button"
                onClick={() => removeMember(m.id)}
                style={{
                  cursor: "pointer",
                  color: "#bbb",
                  border: "none",
                  background: "transparent",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Minus size={18} />
              </button>
            </div>
            <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
              <button
                type="button"
                onClick={() => updateMemberMode(m.id, "age")}
                style={{
                  flex: 1,
                  padding: "7px 9px",
                  borderRadius: 8,
                  border: `1px solid ${!m.useBirthDate ? "#2d5a3d" : "#ddd"}`,
                  background: !m.useBirthDate ? "rgba(45,90,61,.08)" : "#fff",
                  color: "#2d5a3d",
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                Edad
              </button>
              <button
                type="button"
                onClick={() => updateMemberMode(m.id, "birthDate")}
                style={{
                  flex: 1,
                  padding: "7px 9px",
                  borderRadius: 8,
                  border: `1px solid ${m.useBirthDate ? "#2d5a3d" : "#ddd"}`,
                  background: m.useBirthDate ? "rgba(45,90,61,.08)" : "#fff",
                  color: "#2d5a3d",
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                Fecha
              </button>
            </div>
            {m.useBirthDate ? (
              <input
                type="date"
                value={m.birthDate ?? ""}
                onChange={(e) => updateMemberBirthDate(m.id, e.target.value)}
                style={{
                  width: "100%",
                  marginTop: 8,
                  padding: "8px 10px",
                  borderRadius: 8,
                  border: "1px solid #ddd",
                }}
              />
            ) : (
              <input
                type="text"
                inputMode="numeric"
                value={String(m.age ?? "")}
                onChange={(e) => updateMemberAge(m.id, e.target.value.replace(/\D/g, ""))}
                style={{
                  width: "100%",
                  marginTop: 8,
                  padding: "8px 10px",
                  borderRadius: 8,
                  border: "1px solid #ddd",
                }}
              />
            )}
          </div>
        ))}
      </div>
    </OnboardingShell>
  );
}

// ─── Restrictions (per-member + custom + matrix) ──────────────

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

export function OnboardingRestrictions({ data, setData, onNext, onBack, onFinish, onReset }) {
  const [activeId, setActiveId] = useState("house");
  const [customAllergy, setCustomAllergy] = useState("");
  const [customDislike, setCustomDislike] = useState("");
  const [showMatrix, setShowMatrix] = useState(false);
  const [showAddAllergy, setShowAddAllergy] = useState(false);
  const [showAddDislike, setShowAddDislike] = useState(false);
  const [dish, setDish] = useState("");

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

  const addCustom = (type) => {
    const raw = type === "allergy" ? customAllergy : customDislike;
    const label = titleCase(raw);
    if (!label) return;
    if (type === "allergy") {
      setData((d) => ({
        ...d,
        customAllergies: (d.customAllergies ?? []).includes(label)
          ? d.customAllergies
          : [...(d.customAllergies ?? []), label],
      }));
      if (allergyTargetId) toggleMember(allergyTargetId, "allergies", label);
      setCustomAllergy("");
      return;
    }
    setData((d) => ({
      ...d,
      customDislikes: (d.customDislikes ?? []).includes(label)
        ? d.customDislikes
        : [...(d.customDislikes ?? []), label],
    }));
    if (activeId === "house") toggleHouse(label);
    else toggleMember(activeId, "dislikes", label);
    setCustomDislike("");
  };

  const peopleColumns = [
    ...data.members.map((m) => ({ id: m.id, label: m.name })),
    { id: "house", label: "Casa" },
  ];
  const allergyTargetId = activeId === "house" ? (data.members[0]?.id ?? null) : activeId;
  const visibleAllergyOptions = allergyOptions.slice(0, 5);
  const visibleDislikeOptions = dislikeOptions.slice(0, 5);
  const hasAnyMarks =
    (data.dislikes ?? []).length > 0 ||
    data.members.some((m) => (m.allergies?.length ?? 0) > 0 || (m.dislikes?.length ?? 0) > 0);
  const fixedFreqs = ["semanal", "quincenal", "de vez en cuando"];
  const addFixedDish = () => {
    const label = normalizeTextValue(dish);
    if (!label) return;
    setData((d) => ({
      ...d,
      fixedDishes: [...(d.fixedDishes ?? []), { name: label, freq: "semanal" }],
    }));
    setDish("");
  };
  const removeFixedDish = (idx) =>
    setData((d) => ({
      ...d,
      fixedDishes: (d.fixedDishes ?? []).filter((_, i) => i !== idx),
    }));
  const setFixedDishFreq = (idx, freq) =>
    setData((d) => ({
      ...d,
      fixedDishes: (d.fixedDishes ?? []).map((fd, i) => (i === idx ? { ...fd, freq } : fd)),
    }));

  return (
    <OnboardingShell
      title="Restricciones"
      subtitle="Alergias, no come y platos fijos"
      onBack={onBack}
      onReset={onReset}
      onNext={onNext}
      onFinish={onFinish}
    >
      <div
        style={{
          display: "flex",
          gap: 6,
          overflowX: "auto",
          paddingBottom: 8,
          marginBottom: 12,
        }}
      >
        {data.members.map((m) => {
          const sel = m.id === activeId;
          return (
            <button
              key={m.id}
              type="button"
              onClick={() => setActiveId(m.id)}
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
              <Avatar name={m.name} size={22} color={sel ? "rgba(255,255,255,.25)" : "#bbb"} />
              {m.name}
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => setActiveId("house")}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            borderRadius: 20,
            border: "none",
            padding: "6px 12px",
            background: activeId === "house" ? "#2d5a3d" : "#f0f0f0",
            color: activeId === "house" ? "#fff" : "#555",
            fontSize: 12,
            fontWeight: 700,
            cursor: "pointer",
            flexShrink: 0,
          }}
        >
          <House size={13} />
          Toda la casa
        </button>
      </div>

      <div style={{ background: "#f6f9f7", borderRadius: 10, padding: "10px 12px", marginBottom: 10 }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: "#555", marginBottom: 6 }}>
            Alergias
          </p>
          {activeId === "house" && (
            <p style={{ fontSize: 11, color: "#888", margin: "0 0 8px" }}>
              Selecciona una persona para editar alergias individuales.
            </p>
          )}
          <div style={{ marginBottom: 10 }}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                gap: 8,
                alignItems: "center",
              }}
            >
              {Array.from({ length: 5 }, (_, idx) => visibleAllergyOptions[idx] ?? null).map((a, idx) =>
                a ? (
                <button
                  key={`${a}-${idx}`}
                  type="button"
                  onClick={() => allergyTargetId && toggleMember(allergyTargetId, "allergies", a)}
                  style={{
                    width: "100%",
                    height: 38,
                    padding: "6px 8px",
                    borderRadius: 19,
                    border: `1.5px solid ${
                      data.members.find((m) => m.id === allergyTargetId)?.allergies?.includes(a)
                        ? "#2d5a3d"
                        : "rgba(45,90,61,.2)"
                    }`,
                    background: data.members.find((m) => m.id === allergyTargetId)?.allergies?.includes(a)
                      ? "#2d5a3d"
                      : "rgba(45,90,61,.08)",
                    color: data.members.find((m) => m.id === allergyTargetId)?.allergies?.includes(a)
                      ? "#fff"
                      : "#2d5a3d",
                    fontSize: 12,
                    fontWeight: 500,
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {a}
                </button>
                ) : (
                  <div key={`allergy-empty-${idx}`} />
                )
              )}
              <button
                type="button"
                onClick={() => setShowAddAllergy((v) => !v)}
                style={{
                  background: "#2d5a3d",
                  color: "#fff",
                  border: "none",
                  borderRadius: 19,
                  width: "100%",
                  height: 38,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Plus size={16} />
              </button>
            </div>
          </div>
          {showAddAllergy && (
            <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
              <input
                value={customAllergy}
                onChange={(e) => setCustomAllergy(e.target.value)}
                placeholder="Añadir alergia"
                style={{
                  flex: 1,
                  padding: "10px 12px",
                  borderRadius: 10,
                  border: "1.5px solid #ddd",
                  fontSize: 13,
                }}
              />
              <button
                type="button"
                onClick={() => addCustom("allergy")}
                style={{
                  width: 38,
                  borderRadius: 10,
                  border: "none",
                  background: "#2d5a3d",
                  color: "#fff",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Check size={16} />
              </button>
            </div>
          )}
        </div>

      <div style={{ background: "#f6f9f7", borderRadius: 10, padding: "10px 12px", marginBottom: 10 }}>
        <p style={{ fontSize: 13, fontWeight: 700, color: "#555", marginBottom: 8 }}>
          {activeId === "house" ? "No come nadie en casa" : "No come"}
        </p>
        <div style={{ marginBottom: 10 }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
              gap: 8,
              alignItems: "center",
            }}
          >
            {Array.from({ length: 5 }, (_, idx) => visibleDislikeOptions[idx] ?? null).map((d, idx) =>
              d ? (
                <button
                  key={`${d}-${idx}`}
                  type="button"
                  onClick={() =>
                    activeId === "house" ? toggleHouse(d) : toggleMember(activeId, "dislikes", d)
                  }
                  style={{
                    width: "100%",
                    height: 38,
                    padding: "6px 8px",
                    borderRadius: 19,
                    border: `1.5px solid ${
                      (
                        activeId === "house"
                          ? (data.dislikes ?? []).includes(d)
                          : data.members.find((m) => m.id === activeId)?.dislikes?.includes(d)
                      )
                        ? "#2d5a3d"
                        : "rgba(45,90,61,.2)"
                    }`,
                    background:
                      activeId === "house"
                        ? (data.dislikes ?? []).includes(d)
                          ? "#2d5a3d"
                          : "rgba(45,90,61,.08)"
                        : data.members.find((m) => m.id === activeId)?.dislikes?.includes(d)
                        ? "#2d5a3d"
                        : "rgba(45,90,61,.08)",
                    color:
                      activeId === "house"
                        ? (data.dislikes ?? []).includes(d)
                          ? "#fff"
                          : "#2d5a3d"
                        : data.members.find((m) => m.id === activeId)?.dislikes?.includes(d)
                        ? "#fff"
                        : "#2d5a3d",
                    fontSize: 12,
                    fontWeight: 500,
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {d}
                </button>
              ) : (
                <div key={`dislike-empty-${idx}`} />
              )
            )}
            <button
              type="button"
              onClick={() => setShowAddDislike((v) => !v)}
              style={{
                background: "#2d5a3d",
                color: "#fff",
                border: "none",
                borderRadius: 19,
                width: "100%",
                height: 38,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Plus size={16} />
            </button>
          </div>
        </div>
        {showAddDislike && (
          <div style={{ display: "flex", gap: 8, marginBottom: 4 }}>
            <input
              value={customDislike}
              onChange={(e) => setCustomDislike(e.target.value)}
              placeholder="Añadir alimento"
              style={{
                flex: 1,
                padding: "10px 12px",
                borderRadius: 10,
                border: "1.5px solid #ddd",
                fontSize: 13,
              }}
            />
            <button
              type="button"
              onClick={() => addCustom("dislike")}
              style={{
                width: 38,
                borderRadius: 10,
                border: "none",
                background: "#2d5a3d",
                color: "#fff",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Check size={16} />
            </button>
          </div>
        )}
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
          }}
        >
          Matriz de marcas
          <Grid2X2 size={14} />
        </button>
      )}

      {hasAnyMarks && showMatrix && (
        <div
          style={{
            overflowX: "auto",
            marginTop: 10,
            border: "1px solid #e3ebe6",
            borderRadius: 10,
            background: "#fff",
          }}
        >
          <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 360 }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", padding: "8px", fontSize: 11, color: "#666" }}>Ítem</th>
                {peopleColumns.map((p) => (
                  <th key={p.id} style={{ textAlign: "center", padding: "8px", fontSize: 11, color: "#666" }}>
                    {p.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...allergyOptions, ...dislikeOptions].map((item) => (
                <tr key={item} style={{ borderTop: "1px solid #f0f3f1" }}>
                  <td style={{ padding: "8px", fontSize: 12, color: "#444", fontWeight: 600 }}>{item}</td>
                  {peopleColumns.map((p) => {
                    const checked =
                      p.id === "house"
                        ? (data.dislikes ?? []).includes(item)
                        : (data.members.find((m) => m.id === p.id)?.allergies ?? []).includes(item) ||
                          (data.members.find((m) => m.id === p.id)?.dislikes ?? []).includes(item);
                    return (
                      <td key={`${item}-${p.id}`} style={{ textAlign: "center", padding: "8px" }}>
                        {checked ? <Check size={13} color="#2d5a3d" /> : <Minus size={13} color="#ccc" />}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p style={{ fontSize: 13, fontWeight: 700, color: "#555", margin: "14px 0 8px" }}>
        Platos fijos
      </p>
      <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
        <input
          value={dish}
          onChange={(e) => setDish(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addFixedDish()}
          placeholder="Ej: Tortilla de patatas"
          style={{
            flex: 1,
            padding: "10px 12px",
            borderRadius: 10,
            border: "1.5px solid #ddd",
            fontSize: 13,
          }}
        />
        <button
          type="button"
          onClick={addFixedDish}
          style={{
            width: 38,
            borderRadius: 10,
            border: "none",
            background: "#2d5a3d",
            color: "#fff",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Plus size={16} />
        </button>
      </div>
      {(data.fixedDishes ?? []).map((fd, idx) => (
        <div
          key={`${fd.name}-${idx}`}
          style={{
            background: "#f6f9f7",
            borderRadius: 10,
            padding: "10px 12px",
            marginBottom: 8,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: "#1a3a24" }}>{fd.name}</span>
            <button
              type="button"
              onClick={() => removeFixedDish(idx)}
              style={{ border: "none", background: "transparent", cursor: "pointer", color: "#bbb" }}
            >
              <Minus size={15} />
            </button>
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {fixedFreqs.map((freq) => (
              <Chip
                key={`${fd.name}-${freq}`}
                label={freq}
                selected={fd.freq === freq}
                onClick={() => setFixedDishFreq(idx, freq)}
              />
            ))}
          </div>
        </div>
      ))}
    </OnboardingShell>
  );
}

// ─── Menu model (with simple manual move) ─────────────────────

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
  cole: { label: "Cole", color: "#a85a7e" },
  off: { label: "Sin", color: "#888" },
};

const MIXED_COLOR = "#aaa";

function nextSlotValue(current, allowCole) {
  const order = allowCole
    ? ["casa", "tupper", "cole", "fuera", "off"]
    : ["casa", "tupper", "fuera", "off"];
  const safe = current === "mixed" ? "casa" : current ?? "casa";
  const idx = order.indexOf(safe);
  return order[(idx + 1) % order.length];
}

function consensusState(memberIds, schedule, day, meal) {
  if (memberIds.length === 0) return "off";
  const states = memberIds.map((id) => schedule[`${id}|${day}|${meal}`] ?? "casa");
  return states.every((s) => s === states[0]) ? states[0] : "mixed";
}

export function OnboardingSchedule({ data, setData, onNext, onBack, onFinish, onReset }) {
  const meals = getMeals(data);
  // Default to group editing whenever the menu model has groups; fall back to
  // individual when there's a single person or no groups defined yet.
  const defaultMode =
    data.groups.length >= 1 && data.members.length > 1 ? "group" : "single";
  const [subjectMode, setSubjectMode] = useState(defaultMode);
  const [activeGroupId, setActiveGroupId] = useState(data.groups[0]?.id ?? null);
  const [activeMemberId, setActiveMemberId] = useState(data.members[0]?.id ?? null);

  // Keep active subject pointers valid when groups/members change.
  if (!data.groups.find((g) => g.id === activeGroupId)) {
    const nextGroupId = data.groups[0]?.id ?? null;
    if (activeGroupId !== nextGroupId) setActiveGroupId(nextGroupId);
  }
  if (!data.members.find((m) => m.id === activeMemberId)) {
    const nextMemberId = data.members[0]?.id ?? null;
    if (activeMemberId !== nextMemberId) setActiveMemberId(nextMemberId);
  }

  const activeGroup = data.groups.find((g) => g.id === activeGroupId);
  const activeMember = data.members.find((m) => m.id === activeMemberId);

  // Member ids affected by the current subject (a group's members, or a single member).
  const subjectMemberIds = useMemo(() => {
    if (subjectMode === "group") return activeGroup?.memberIds ?? [];
    return activeMember ? [activeMember.id] : [];
  }, [subjectMode, activeGroup, activeMember]);

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

  const setAllForDay = (day, value) => {
    if (subjectMemberIds.length === 0) return;
    setData((d) => {
      const next = { ...d.schedule };
      for (const meal of meals) {
        for (const id of subjectMemberIds) {
          next[`${id}|${day}|${meal}`] = value;
        }
      }
      return { ...d, schedule: next };
    });
  };

  const cycle = (day, meal) => {
    if (subjectMemberIds.length === 0) return;
    const cur =
      subjectMode === "group"
        ? consensusState(subjectMemberIds, data.schedule, day, meal)
        : data.schedule[`${subjectMemberIds[0]}|${day}|${meal}`] ?? "casa";
    // For groups with diverging members, open the editor instead of cycling
    // — that way we never overwrite individual variations by accident.
    if (cur === "mixed") {
      setSheetSlot({ day, meal });
      return;
    }
    setSlots(subjectMemberIds, day, meal, nextSlotValue(cur, allowCole));
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
      subjectMode === "group" ? countMixedCells(subjectMemberIds, data.schedule) : 0;
    setData((d) => {
      const next = { ...d.schedule };
      const colable = subjectMembers.some(
        (m) => stageForAge(memberAge(m)).id !== "adulto"
      );
      for (const day of DAYS) {
        const isWeekday = !["Sáb", "Dom"].includes(day);
        for (const meal of meals) {
          const isLunch = meal.toLowerCase() === "comida";
          let value;
          if (preset === "casa-todo") value = "casa";
          else if (preset === "tupper-laborable")
            value = isWeekday && isLunch ? "tupper" : "casa";
          else if (preset === "cole-laborable")
            value = isWeekday && isLunch ? (colable ? "cole" : "fuera") : "casa";
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

  // Meal editor
  const renameMeal = (idx, value) => {
    setData((d) => {
      const oldName = (d.meals ?? meals)[idx];
      const newName = value.trim();
      if (!newName || newName === oldName) return d;
      const newMeals = (d.meals ?? meals).map((m, i) => (i === idx ? newName : m));
      // Migrate schedule keys "memberId|day|<old>" → "memberId|day|<new>".
      const newSchedule = {};
      for (const [k, v] of Object.entries(d.schedule)) {
        const parts = k.split("|");
        if (parts.length === 3 && parts[2] === oldName) {
          newSchedule[`${parts[0]}|${parts[1]}|${newName}`] = v;
        } else {
          newSchedule[k] = v;
        }
      }
      return { ...d, meals: newMeals, schedule: newSchedule };
    });
  };
  const removeMeal = (idx) => {
    if (meals.length <= 1) return;
    const target = meals[idx];
    if (!window.confirm(`¿Quitar "${target}"? Se perderán las marcas de ese momento.`)) return;
    setData((d) => {
      const newMeals = (d.meals ?? meals).filter((_, i) => i !== idx);
      const newSchedule = {};
      for (const [k, v] of Object.entries(d.schedule)) {
        const parts = k.split("|");
        if (parts.length === 3 && parts[2] === target) continue;
        newSchedule[k] = v;
      }
      return { ...d, meals: newMeals, schedule: newSchedule };
    });
  };
  const addMeal = () => {
    setData((d) => {
      const cur = d.meals ?? meals;
      const candidates = ["Desayuno", "Almuerzo", "Merienda", "Picoteo"];
      const fresh = candidates.find((c) => !cur.includes(c)) ?? `Comida ${cur.length + 1}`;
      return { ...d, meals: [...cur, fresh] };
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
    subjectMode === "group"
      ? activeGroup?.label ?? "grupo"
      : activeMember?.name ?? "persona";

  return (
    <OnboardingShell
      title="¿Cuándo coméis en casa?"
      subtitle="Edita por grupo o persona; los presets se aplican al sujeto activo"
      onBack={onBack}
      onReset={onReset}
      onNext={onNext}
      onFinish={onFinish}
    >
      <SectionTitle>Comidas del día</SectionTitle>
      <MealEditor
        meals={meals}
        onRename={renameMeal}
        onRemove={removeMeal}
        onAdd={addMeal}
      />

      <SectionTitle>Editar por</SectionTitle>
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <button
          type="button"
          onClick={() => setSubjectMode("group")}
          style={tabButtonStyle(subjectMode === "group")}
        >
          <Users size={14} />
          Por grupo ({data.groups.length})
        </button>
        <button
          type="button"
          onClick={() => setSubjectMode("single")}
          style={tabButtonStyle(subjectMode === "single")}
        >
          <User size={14} />
          Individual ({data.members.length})
        </button>
      </div>

      <div
        style={{
          display: "flex",
          gap: 6,
          overflowX: "auto",
          paddingBottom: 8,
          marginBottom: 10,
        }}
      >
        {subjectMode === "group" &&
          data.groups.map((g) => {
            const sel = g.id === activeGroupId;
            const groupMembers = membersOfGroup(g, data.members);
            return (
              <button
                key={g.id}
                type="button"
                onClick={() => setActiveGroupId(g.id)}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  borderRadius: 20,
                  border: "none",
                  padding: "6px 12px 6px 8px",
                  background: sel ? g.color : "#f0f0f0",
                  color: sel ? "#fff" : "#555",
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: "pointer",
                  flexShrink: 0,
                }}
              >
                <span
                  style={{
                    fontSize: 10,
                    background: sel ? "rgba(255,255,255,.25)" : "rgba(0,0,0,.06)",
                    padding: "1px 6px",
                    borderRadius: 6,
                  }}
                >
                  {groupMembers.length}
                </span>
                {g.label}
              </button>
            );
          })}
        {subjectMode === "single" &&
          data.members.map((m) => {
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
                }}
              >
                <Avatar name={m.name} size={22} color={sel ? "rgba(255,255,255,.25)" : "#bbb"} />
                {m.name}
              </button>
            );
          })}
      </div>

      <SectionTitle>Acciones rápidas · {subjectLabel}</SectionTitle>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
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

      <SectionTitle>Calendario</SectionTitle>
      <ScheduleGrid
        meals={meals}
        memberIds={subjectMemberIds}
        schedule={data.schedule}
        onCellClick={cycle}
        onDayClick={
          subjectMode === "group" && subjectMemberIds.length > 1
            ? (day) => setSheetSlot({ day, meal: null })
            : undefined
        }
      />

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
          onSetAllDay={(value) => {
            setAllForDay(sheetSlot.day, value);
            setSheetSlot(null);
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

function ScheduleSlotSheet({
  day,
  meal,
  members,
  schedule,
  allowCole,
  onClose,
  onSetMember,
  onSetAllSlot,
  onSetAllDay,
}) {
  // When `meal` is null we render in "day mode": only the row-level actions are
  // shown (per-member editing requires a specific meal context).
  const dayMode = !meal;
  const allowedStates = useMemo(
    () => (allowCole ? ["casa", "tupper", "cole", "fuera", "off"] : ["casa", "tupper", "fuera", "off"]),
    [allowCole]
  );

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
          maxHeight: "85vh",
          overflowY: "auto",
          padding: "18px 18px 22px",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            justifyContent: "space-between",
            marginBottom: 14,
          }}
        >
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: "#1a3a24" }}>
            {dayMode ? day : `${day} · ${meal}`}
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            style={{
              background: "transparent",
              border: "none",
              color: "#888",
              fontSize: 24,
              cursor: "pointer",
              padding: 4,
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>

        {!dayMode && (
          <>
            <SectionTitle>Por persona</SectionTitle>
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 18 }}>
              {members.map((m) => {
                const cur = schedule[`${m.id}|${day}|${meal}`] ?? "casa";
                const memberAllowsCole = stageForAge(memberAge(m)).id !== "adulto";
                const memberStates = memberAllowsCole
                  ? ["casa", "tupper", "cole", "fuera", "off"]
                  : ["casa", "tupper", "fuera", "off"];
                return (
                  <div
                    key={m.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "8px 10px",
                      background: "#f7f9f8",
                      borderRadius: 10,
                    }}
                  >
                    <Avatar name={m.name} size={28} />
                    <span
                      style={{
                        flex: 1,
                        minWidth: 0,
                        fontSize: 13,
                        fontWeight: 700,
                        color: "#1a3a24",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {m.name}
                    </span>
                    <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                      {memberStates.map((s) => {
                        const sel = cur === s;
                        const c = SLOT_CONFIG[s].color;
                        return (
                          <button
                            key={s}
                            type="button"
                            onClick={() => onSetMember(m.id, s)}
                            title={SLOT_CONFIG[s].label}
                            aria-label={SLOT_CONFIG[s].label}
                            style={{
                              width: 30,
                              height: 30,
                              borderRadius: 8,
                              border: `1.5px solid ${sel ? c : "#e3ebe6"}`,
                              background: sel ? `${c}1a` : "#fff",
                              color: sel ? c : "#bbb",
                              cursor: "pointer",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              padding: 0,
                            }}
                          >
                            {stateIcon(s, 14)}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>

            <SectionTitle>Igualar todos en {meal}</SectionTitle>
            <StatePillRow states={allowedStates} onClick={onSetAllSlot} />
            <div style={{ height: 18 }} />
          </>
        )}

        <SectionTitle>{dayMode ? `Igualar todo el ${day}` : `Igualar TODO el ${day}`}</SectionTitle>
        <StatePillRow
          states={allowedStates}
          onClick={(value) => {
            onSetAllDay(value);
          }}
        />
        <p style={{ fontSize: 11, color: "#888", marginTop: 8, marginBottom: 0 }}>
          Aplica a todas las comidas del {day} para todos los miembros.
        </p>
      </div>
    </div>
  );
}

function StatePillRow({ states, onClick }) {
  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
      {states.map((s) => {
        const c = SLOT_CONFIG[s].color;
        return (
          <button
            key={s}
            type="button"
            onClick={() => onClick(s)}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "8px 12px",
              borderRadius: 10,
              border: `1.5px solid ${c}`,
              background: `${c}10`,
              color: c,
              fontSize: 12,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            {stateIcon(s, 13)}
            {SLOT_CONFIG[s].label}
          </button>
        );
      })}
    </div>
  );
}

function MealEditor({ meals, onRename, onRemove, onAdd }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 14 }}>
      {meals.map((meal, idx) => (
        <MealChip
          key={`${meal}-${idx}`}
          value={meal}
          onCommit={(v) => onRename(idx, v)}
          onRemove={meals.length > 1 ? () => onRemove(idx) : null}
        />
      ))}
      <button
        type="button"
        onClick={onAdd}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
          padding: "6px 12px",
          borderRadius: 19,
          height: 32,
          border: "1.5px dashed #2d5a3d",
          background: "#fff",
          color: "#2d5a3d",
          fontSize: 12,
          fontWeight: 700,
          cursor: "pointer",
        }}
      >
        <Plus size={13} /> Añadir
      </button>
    </div>
  );
}

function MealChip({ value, onCommit, onRemove }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [lastValue, setLastValue] = useState(value);
  if (value !== lastValue) {
    setLastValue(value);
    setDraft(value);
  }

  const commit = () => {
    setEditing(false);
    if (draft.trim() && draft !== value) onCommit(draft);
    else setDraft(value);
  };

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: editing ? "0 6px 0 10px" : "0 4px 0 12px",
        borderRadius: 19,
        height: 32,
        background: "rgba(45,90,61,.08)",
        border: "1px solid #d7e1db",
      }}
    >
      <Utensils size={11} color="#2d5a3d" />
      {editing ? (
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
            if (e.key === "Escape") {
              setDraft(value);
              setEditing(false);
            }
          }}
          style={{
            border: "none",
            background: "transparent",
            outline: "none",
            fontSize: 12,
            fontWeight: 700,
            color: "#2d5a3d",
            width: Math.max(60, draft.length * 7.5),
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
            color: "#2d5a3d",
            fontSize: 12,
            fontWeight: 700,
            cursor: "pointer",
            padding: 0,
            fontFamily: "inherit",
          }}
        >
          {value}
        </button>
      )}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Quitar ${value}`}
          style={{
            border: "none",
            background: "transparent",
            color: "#888",
            cursor: "pointer",
            padding: 0,
            width: 22,
            height: 22,
            borderRadius: 11,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <X size={12} />
        </button>
      )}
    </span>
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

function ScheduleCell({ value, states, onClick, size = 16 }) {
  const isMixed = value === "mixed";
  const conf = SLOT_CONFIG[value] ?? SLOT_CONFIG.casa;
  const isOff = value === "off";
  const color = isMixed ? MIXED_COLOR : conf.color;
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      type={onClick ? "button" : undefined}
      onClick={onClick}
      title={isMixed ? "Variaciones individuales — pulsa para editar" : undefined}
      style={{
        width: "100%",
        aspectRatio: "1",
        borderRadius: 8,
        cursor: onClick ? "pointer" : "default",
        background: isMixed ? "#fafafa" : "#f8fbf9",
        border: `1.5px ${isMixed ? "dashed" : "solid"} ${
          isOff ? "#e3ebe6" : `${color}55`
        }`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: isOff ? "#bbb" : color,
        padding: 0,
      }}
    >
      {isMixed ? <MixedDots states={states ?? []} /> : stateIcon(value, size)}
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
            const memberStates = memberIds.map(
              (id) => schedule[`${id}|${day}|${meal}`] ?? "casa"
            );
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
  };

  const handleFile = async (file) => {
    if (!file) return;
    setImporting(true);
    setImportError(null);
    setImportStatus("Leyendo archivo…");
    try {
      const { entries } = await importSchoolMenuFile(file, {
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
          }
        },
      });
      const detected = Object.keys(entries).length;
      const daysWithSomething = new Set(
        Object.keys(entries).map((k) => k.split("-")[0])
      ).size;
      if (detected === 0) {
        setImportError(
          "No detecté platos automáticamente. Edita las celdas manualmente abajo."
        );
      } else {
        applyDishes(entries);
        setImportedFileName(file.name ?? "");
        setImportStatus(
          `Detectados ${daysWithSomething}/5 días (${detected} platos) · revisa antes de continuar`
        );
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
            border: `1.5px solid ${scope === "shared" ? "#a85a7e" : "#ddd"}`,
            background: scope === "shared" ? "rgba(168,90,126,.08)" : "#fff",
            color: "#a85a7e",
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
            border: `1.5px solid ${scope === "individual" ? "#a85a7e" : "#ddd"}`,
            background: scope === "individual" ? "rgba(168,90,126,.08)" : "#fff",
            color: "#a85a7e",
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
                  background: sel ? "#a85a7e" : "#f0f0f0",
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
          border: "1.5px dashed #c9b1bd",
          background: importing ? "#fbf3f7" : "#fff",
          cursor: importing ? "default" : "pointer",
          marginBottom: 8,
        }}
      >
        <span
          style={{
            width: 36,
            height: 36,
            borderRadius: 10,
            background: "rgba(168,90,126,.12)",
            color: "#a85a7e",
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
            {importing
              ? importStatus || "…"
              : importedFileName
              ? importedFileName
              : "Detección 1º · 2º · postre, L-V"}
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
            background: "rgba(168,90,126,.08)",
            border: "1px solid #e6c8d5",
            color: "#a85a7e",
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

      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
        <button
          type="button"
          onClick={clearAll}
          style={{
            padding: "6px 10px",
            borderRadius: 8,
            border: "1.5px solid #e6c8d5",
            background: "#fff",
            color: "#a85a7e",
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
                color: "#a85a7e",
                background: "rgba(168,90,126,.12)",
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
                color: "#a85a7e",
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
                      color: "#a85a7e",
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
    profile: { freqs: { legumbres: 4, pescado: 1 } },
  },
  { id: "rapido", label: "Rápido", profile: {} },
  {
    id: "deportivo",
    label: "Deportivo",
    profile: { kcal: 2400, freqs: { pescado: 3, verdura: 4, legumbres: 3 } },
  },
  { id: "variado", label: "Variado", profile: {} },
  { id: "no-repetir-proteina", label: "Sin repetir proteína", profile: {} },
];

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
  carne: "Carne",
  huevos: "Huevos",
  fruta: "Fruta",
};

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
  const activeKcal =
    (subjectId && data.kcalByGroup?.[subjectId]) ?? data.kcal ?? 2000;
  const activeFreqs =
    (subjectId && data.freqsByGroup?.[subjectId]) ?? data.freqs ?? {};

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
  const writeSubjectKcal = (newKcal) => {
    setData((d) => {
      if (subjectId) {
        return {
          ...d,
          kcalByGroup: { ...(d.kcalByGroup ?? {}), [subjectId]: newKcal },
        };
      }
      return { ...d, kcal: newKcal };
    });
  };
  const writeSubjectFreqs = (newFreqs) => {
    setData((d) => {
      if (subjectId) {
        return {
          ...d,
          freqsByGroup: { ...(d.freqsByGroup ?? {}), [subjectId]: newFreqs },
        };
      }
      return { ...d, freqs: newFreqs };
    });
  };
  // Toggling needs to fire `showToast` AFTER the state is computed — keeping
  // it inside the `setData` updater would run twice under React 19 strict
  // mode and trigger a setState during render, which made the screen
  // collapse when chaining presets.
  const toggleGoal = (goalId) => {
    let selectedLabel = "";
    setData((d) => {
      const currentGoals =
        (subjectId && d.goalsByGroup?.[subjectId]) ?? d.goals ?? [];
      const isActive = currentGoals.includes(goalId);
      const newGoalIds = isActive
        ? currentGoals.filter((g) => g !== goalId)
        : [...currentGoals, goalId];
      selectedLabel = goalDefs.find((g) => g.id === goalId)?.label ?? "";
      const profile = combinedGoalProfile(newGoalIds, d.goalDefs ?? goalDefs);

      if (subjectId) {
        return {
          ...d,
          goalsByGroup: { ...(d.goalsByGroup ?? {}), [subjectId]: newGoalIds },
          kcalByGroup: { ...(d.kcalByGroup ?? {}), [subjectId]: profile.kcal },
          freqsByGroup: { ...(d.freqsByGroup ?? {}), [subjectId]: profile.freqs },
        };
      }
      return { ...d, goals: newGoalIds, kcal: profile.kcal, freqs: profile.freqs };
    });
    if (selectedLabel) {
      showToast(`Objetivos recalculados con "${selectedLabel}"`);
    }
  };

  // ── Edit / add / remove chips ──
  const renameGoalDef = (id, newLabel) => {
    const v = newLabel.trim();
    if (!v) return;
    setData((d) => ({
      ...d,
      goalDefs: (d.goalDefs ?? []).map((g) =>
        g.id === id ? { ...g, label: v } : g
      ),
    }));
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

  const [addingGoal, setAddingGoal] = useState(false);
  const [draftGoal, setDraftGoal] = useState("");
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
  };

  // ── Frequencies (per-subject) ──
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
      subtitle="Toca un objetivo y los sliders se ajustan al perfil"
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
            Cada grupo guarda sus propios objetivos, kcal y frecuencias.
          </p>
        </div>
      )}

      <SectionTitle>
        {hasMultipleGroups ? `Objetivos · ${activeGroupLabel}` : "Objetivos"}
      </SectionTitle>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 20 }}>
        {goalDefs.map((def) => (
          <GoalChip
            key={def.id}
            def={def}
            selected={activeGoals.includes(def.id)}
            onToggle={() => toggleGoal(def.id)}
            onRename={(v) => renameGoalDef(def.id, v)}
            onRemove={def.isCustom ? () => removeGoalDef(def.id) : null}
          />
        ))}
        {addingGoal ? (
          <input
            autoFocus
            value={draftGoal}
            onChange={(e) => setDraftGoal(e.target.value)}
            onBlur={addCustomGoal}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
              if (e.key === "Escape") {
                setDraftGoal("");
                setAddingGoal(false);
              }
            }}
            placeholder="Tu objetivo"
            style={{
              padding: "6px 14px",
              borderRadius: 20,
              border: "1.5px solid #2d5a3d",
              fontSize: 13,
              outline: "none",
              background: "#fff",
              color: "#2d5a3d",
              fontFamily: "inherit",
              minWidth: 110,
            }}
          />
        ) : (
          <button
            type="button"
            onClick={() => setAddingGoal(true)}
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
        label="Objetivo calórico"
        value={activeKcal}
        min={1200}
        max={3000}
        step={100}
        suffix=" kcal"
        onChange={(v) => writeSubjectKcal(v)}
      />

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
          Sin tipos definidos. Pulsa "Añadir tipo".
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

function GoalChip({ def, selected, onToggle, onRename, onRemove }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(def.label);
  // Keep the editor draft in sync if the label changes externally. Using
  // render-time state adjustment is the React-recommended replacement for
  // a `useEffect` that just calls `setState` to mirror a prop.
  const [lastLabel, setLastLabel] = useState(def.label);
  if (def.label !== lastLabel) {
    setLastLabel(def.label);
    setDraft(def.label);
  }
  const commit = () => {
    setEditing(false);
    if (draft.trim() && draft.trim() !== def.label) onRename(draft.trim());
    else setDraft(def.label);
  };
  if (editing) {
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
          padding: "6px 14px",
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
  const hasProfile = Object.keys(def.profile ?? {}).length > 0;
  return (
    <span style={{ ...chipStyle(selected), paddingRight: onRemove ? 6 : 10 }}>
      {hasProfile && (
        <Sparkles size={11} color={selected ? "#fff" : "#2d5a3d"} />
      )}
      <span onClick={onToggle} style={{ cursor: "pointer" }}>
        {def.label}
      </span>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setEditing(true);
        }}
        aria-label={`Editar ${def.label}`}
        style={iconBtnStyle(selected)}
      >
        <FileText size={11} />
      </button>
      {onRemove && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          aria-label={`Quitar ${def.label}`}
          style={iconBtnStyle(selected)}
        >
          <X size={12} />
        </button>
      )}
    </span>
  );
}

function iconBtnStyle(selected) {
  return {
    border: "none",
    background: "transparent",
    color: selected ? "rgba(255,255,255,.85)" : "#2d5a3d",
    cursor: "pointer",
    padding: 0,
    width: 18,
    height: 18,
    borderRadius: 9,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
  };
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

export function OnboardingCooking({ data, setData, onNext, onBack, onFinish, onReset }) {
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
