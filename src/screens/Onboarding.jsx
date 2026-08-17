import React, { Fragment, Suspense, lazy, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowUpDown,
  Baby,
  Bean,
  Beef,
  Egg,
  Fish,
  GitBranch,
  BriefcaseBusiness,
  Ban,
  CalendarDays,
  Camera,
  Check,
  ChefHat,
  Wheat,
  ChevronLeft,
  ChevronRight,
  Clock,
  Coffee,
  Sun,
  Sunset,
  Moon,
  Apple,
  IceCream,
  ChevronDown,
  CircleDot,
  Drumstick,
  Expand,
  FileText,
  House,
  Refrigerator,
  Layers2,
  Loader2,
  Minus,
  Plus,
  School,
  Leaf,
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
  Star,
  Tag,
  Trash2,
  Eraser,
  Upload,
  Zap,
  User,
  Users,
  PersonStanding,
  Venus,
  Mars,
  Glasses,
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
  ScopeCircle,
  ScopeCirclePicker,
  GroupAvatarStack,
  groupAvatarFaces,
  ToggleSwitch,
  WizardSheet,
} from "../components/ui.jsx";
import { MAX_MENU_WEEKS } from "../lib/menuArchive.js";
import { getWeekDatesByMenuWeek, calendarDayNumber, formatWeekRangeLabel } from "../lib/weekCalendar.js";
import { CookTimeEditor } from "../components/CookTimeEditor.jsx";
import { OnboardingProgressContext } from "./onboardingProgressContext.js";
import { HOUSEHOLD_ROLES, stageForAge, suggestHomeRole, migrateHomeRole, AVATAR_PALETTE, AVATAR_FOLDER, memberAvatarColor, memberAvatarSrc, memberAvatarThumbSrc, avatarThumbSrcByKey } from "../lib/stages.js";
import { migrateFixedDishes, normalizeFixedDish, catalogMatchesForFixedDish } from "../lib/fixedDishes.js";
import { EU_ALLERGENS, normalizeAllergenId } from "../lib/allergens.js";
import { CatalogBrowserSheet, categoryColor } from "./CatalogBrowserSheet.jsx";
import { favoriteRecipeIds } from "../lib/recipeVotes.js";
import { recipeCatalogById } from "../data/recipeCatalog.js";
import { dishImageUrl } from "../assets/dishes/dishImages.js";
import guarnicionesData from "../data/recipes/guarniciones.json";

const GARNISH_NAME_BY_ID = Object.fromEntries(guarnicionesData.map((g) => [g.id, g.name]));
import {
  canAssignMemberToGroup,
  canSplitMenus,
  groupsAvailableForMember,
  groupsFromModel,
  hasBabyMember,
  isBabyMenuGroup,
  memberIsBaby,
  membersOfGroup,
  migrateGroupsForBabies,
  reconcileTierGroups,
  resolveMemberAge,
  tierForMember,
  uid,
} from "../lib/groups.js";
import {
  ALL_DAY_MEALS,
  DAYS,
  dayLabel,
  getMeals,
  modeForGroupSlot,
  primaryDayMeal,
  slotKey,
} from "../lib/planner.js";
import { mealTimeColor } from "../lib/mealTimes.js";
import { POSTRE_TIPOS, POSTRE_INMEDIATO_KINDS } from "../lib/postres.js";
import { SCHOOL_DAYS, SCHOOL_COURSES, hasAnySchoolDish, householdHasSchoolMenu, normalizeSchoolMenus, replaceSchoolWeeks, setSchoolDishAt, clearSchoolWeek, clearSchoolScope, getSchoolIconOverride, setSchoolIconOverride } from "../lib/schoolMenu.js";
import { outStateFor, isHomeState, resolveQuickActions } from "../lib/schedulePresets.js";
import { importSchoolMenuFile, selectBestWeek } from "../lib/schoolMenuImport.js";
import { SchoolMenuDeck } from "./SchoolMenuDeck.jsx";

const MEAL_STRUCTURE_CARDS = [
  {
    id: "primero_segundo",
    title: "Primero y segundo",
    subtitle: "Dos platos",
    img: "/avatares/cards/estructura_primero_segundo.png",
  },
  {
    id: "1_plato",
    title: "Plato combinado",
    subtitle: "Un solo plato",
    img: "/avatares/cards/estructura_plato_combinado.png",
  },
];

const DESPENSA_OPTS = [
  { id: "strict", label: "Solo con lo de casa", subtitle: "Sin comprar: menú solo con nevera, despensa y congelador.", img: "/avatares/cards/casa_solo.jpg" },
  { id: "only", label: "Partir de lo que tengo", subtitle: "El menú se monta con lo de casa y se completa en la compra.", img: "/avatares/cards/casa_partir.jpg" },
  { id: "prefer", label: "Tenerlo en cuenta", subtitle: "Priorizo recetas que aprovechan lo que ya tienes.", img: "/avatares/cards/casa_encuenta.jpg" },
  { id: "off", label: "Menú libre", subtitle: "Planifico sin mirar el stock. En compra sigo marcando lo que tienes.", img: "/avatares/cards/casa_libre.jpg" },
];
const DESAYUNO_OPTS = [
  { id: "variado", label: "Variado", subtitle: "Cada día algo distinto", img: "/avatares/cards/desayuno_variado.jpg" },
  { id: "findes", label: "Igual entre semana", subtitle: "Diferente el finde", img: "/avatares/cards/desayuno_lunes_viernes.jpg" },
  { id: "igual", label: "Siempre igual", subtitle: "La misma rutina", img: "/avatares/cards/desayuno_igual.jpg" },
];
const MERIENDA_OPTS = [
  { id: "off", label: "Sin merienda", Icon: X },
  { id: "semana", label: "Toda la semana", Icon: CalendarDays },
  { id: "laborables", label: "Solo L–V", Icon: BriefcaseBusiness },
];

const PantryScreen = lazy(() =>
  import("./Pantry.jsx").then((m) => ({ default: m.PantryScreen })),
);

// Delegates to the single source of truth (lib/stages.js's resolveMemberAge,
// re-exported via lib/groups.js) instead of re-deriving the birthDate math
// here — a second implementation is exactly how this and the onboarding form
// could silently drift apart.
function memberAge(member) {
  return resolveMemberAge(member);
}

function normalizeTextValue(input) {
  return (input ?? "").trim().replace(/\s+/g, " ");
}

const FAMILY_ROLES_SET = new Set(["papa", "mama", "hijo", "hija", "bebe", "abuelo", "abuela"]);
function isFamilyGroup(members) {
  return members.some((m) =>
    FAMILY_ROLES_SET.has(migrateHomeRole(m.homeRole ?? suggestHomeRole(memberAge(m))))
  );
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
  bodyRef = null,
  heightOverride = null,
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
        // En demo (carrusel) fijamos la altura al frame para que el scroll ocurra
        // DENTRO del body (como una pantalla real) y no haya saltos raros.
        height: heightOverride ?? "100dvh",
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
              Salir
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
        ref={bodyRef}
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

// Palette of profile types for the "family list" builder — a 2×5 grid. Each
// profile has its own icon + colour, a friendly default name and a sensible
// default age (null = adult, age stays optional). `role` maps to a valid
// HOUSEHOLD_ROLES value so downstream menu grouping keeps working even when two
// profiles share a role (Hijo/Hija → "Hijo/a", Abuelo/Abuela → "Abuelo/a").
const FAMILY_PROFILES = [
  { key: "papa",   label: "Papá",    role: "Papá",     icon: Mars,           tint: "#039be5", age: null },
  { key: "mama",   label: "Mamá",    role: "Mamá",     icon: Venus,          tint: "#d81b60", age: null },
  { key: "hijo",   label: "Hijo",    role: "Hijo/a",   icon: PersonStanding, tint: "#43a047", age: 8 },
  { key: "hija",   label: "Hija",    role: "Hijo/a",   icon: PersonStanding, tint: "#8e24aa", age: 8 },
  { key: "bebe",   label: "Bebé",    role: "Bebé",     icon: Baby,           tint: "#fb8c00", age: 1 },
  { key: "abuelo", label: "Abuelo",  role: "Abuelo/a", icon: Glasses,        tint: "#3949ab", age: 70 },
  { key: "abuela", label: "Abuela",  role: "Abuelo/a", icon: Glasses,        tint: "#00897b", age: 70 },
  { key: "amigo",  label: "Amigo/a", role: "Amigo/a",  icon: Heart,          tint: "#e53935", age: null },
  { key: "adulto", label: "Adulto",  role: "Adulto",   icon: Users,          tint: "#607d8b", age: null },
  { key: "otro",   label: "Otro",    role: "Otro",     icon: User,           tint: "#78909c", age: null },
];

const profileByKey = (key) => FAMILY_PROFILES.find((p) => p.key === key) ?? null;

const AVATAR_COUNTS = {
  papa: 13, mama: 10, hijo: 14, hija: 14,
  bebe: 4, abuelo: 3, abuela: 5, adulto: 14, amigo: 14, otro: 0,
};
// Which avatar to show by default when a profile is first added.
const DEFAULT_AVATAR = {
  papa: "papa_4", mama: "mama_5", amigo: "hijo_9", adulto: "hija_7",
};
const avatarSrc = (profileKey, avatarKey) =>
  memberAvatarSrc({ profileKey, avatarKey });

// Read a picked image and downscale it to a 160px square JPEG data URL, so
// member avatars stay tiny in localStorage. Mirrors HomeProfileScreen's helper.
function fileToAvatarDataUrl(file) {
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

export function OnboardingMembers({ data, setData, onNext, onFinish, onReset, onBack, nextLabel, showMenuModel = false, demoName = null, demoAge = null }) {
  const [name, setName] = useState("");
  const [ageStr, setAgeStr] = useState("");
  const [roleEditId, setRoleEditId] = useState(null);
  const [colorPickerId, setColorPickerId] = useState(null);
  const [dismissedBabyHints, setDismissedBabyHints] = useState(new Set());
  const [removingIds, setRemovingIds] = useState(new Set());
  const [addBounce, setAddBounce] = useState(false);
  const [colorExpanded, setColorExpanded] = useState(false);
  const [avatarExpanded, setAvatarExpanded] = useState(false);
  // "family" = the drag-a-profile builder shown to real users. The classic
  // name+age+Añadir form is kept only for the scripted ValueProps demo, which
  // passes demoName/demoAge; there is no user-facing toggle anymore.
  const builderMode = demoName != null ? "clasico" : "family";
  // Member whose name/age/colour mini-popup is open (family builder).
  const [editingMemberId, setEditingMemberId] = useState(null);
  // Set when the open popup belongs to a just-dropped profile, so tapping
  // outside discards it ("si no te gusta, pulsas fuera y ya"). Editing an
  // existing member instead just closes.
  const [justAddedId, setJustAddedId] = useState(null);

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

  // Add a member from a palette profile (family-list builder): drop it into the
  // family list up top and immediately open the name/age mini-popup.
  const addProfile = (profile) => {
    setAddBounce(true);
    setTimeout(() => setAddBounce(false), 320);
    const id = uid();
    const defFolder = AVATAR_FOLDER[profile.key];
    const defAvatar = DEFAULT_AVATAR[profile.key] ?? (defFolder ? `${defFolder}_1` : null);
    setData((d) => ({
      ...d,
      members: [
        ...d.members,
        {
          id,
          name: "",
          age: profile.age ?? null,
          useBirthDate: false,
          birthDate: "",
          homeRole: profile.role,
          profileKey: profile.key,
          color: profile.tint,
          avatarKey: defAvatar,
          stageDetail: "",
          allergies: [],
          dislikes: [],
        },
      ],
    }));
    setJustAddedId(id);
    setEditingMemberId(id);
  };

  const updateMemberName = (id, name) => {
    setData((d) => ({
      ...d,
      members: d.members.map((m) => (m.id === id ? { ...m, name } : m)),
    }));
  };

  const updateMemberPhoto = (id, photo) => {
    setData((d) => ({
      ...d,
      members: d.members.map((m) => (m.id === id ? { ...m, photo } : m)),
    }));
  };

  const updateMemberAvatar = (id, avatarKey) => {
    setData((d) => ({
      ...d,
      members: d.members.map((m) => (m.id === id ? { ...m, avatarKey } : m)),
    }));
  };

  const photoInputRef = useRef(null);
  const handlePhotoPick = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !editingMemberId) return;
    try {
      const url = await fileToAvatarDataUrl(file);
      updateMemberPhoto(editingMemberId, url);
    } catch {
      /* ignore unreadable images */
    }
  };

  const updateMemberAge = (id, ageStr) => {
    const n = parseInt(ageStr, 10);
    const age = Number.isFinite(n) ? n : null;
    setData((d) => ({
      ...d,
      members: d.members.map((m) => (m.id === id ? { ...m, age } : m)),
    }));
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
    // 16px es el mínimo para que Safari/iOS no haga zoom automático al
    // enfocar el campo (ver index.css: regla global para inputs/textarea).
    fontSize: 16,
    fontWeight: 800,
    textAlign: "center",
    color: "#1a3a24",
    outline: "none",
    flexShrink: 0,
    fontFamily: "inherit",
  };

  // Shared member card. `editable` (family mode) turns name + age into inline
  // inputs; classic mode keeps them read-only. Avatar colour, role chip and
  // remove behave the same in both.
  const renderMemberCard = (m, idx, editable) => {
    const role = migrateHomeRole(m.homeRole ?? suggestHomeRole(memberAge(m)));
    const avatarColor = m.color ?? AVATAR_PALETTE[idx % AVATAR_PALETTE.length];
    const RoleIcon = ROLE_ICON_MAP[role] ?? User;
    const initial = (m.name ?? "").trim()[0]?.toUpperCase() ?? "?";
    const isPickingColor = colorPickerId === m.id;
    const isLeaving = removingIds.has(m.id);
    const ageValue = m.age === 0 || Number.isFinite(Number(m.age)) ? String(m.age ?? "") : "";
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

        {editable ? (
          <input
            value={m.name}
            onChange={(e) => updateMemberName(m.id, e.target.value)}
            placeholder="Nombre"
            aria-label="Nombre"
            style={{
              flex: 1, minWidth: 0, fontWeight: 800, fontSize: 16, color: "#1a3a24",
              border: "none", borderBottom: "1.5px solid transparent",
              background: "transparent", outline: "none", fontFamily: "inherit",
              padding: "2px 0", transition: "border-color .15s ease",
            }}
            onFocus={(e) => { e.target.style.borderBottomColor = "#cfe0d5"; }}
            onBlur={(e) => { e.target.style.borderBottomColor = "transparent"; }}
          />
        ) : (
          <div style={{ flex: 1, minWidth: 0, fontWeight: 800, fontSize: 14, color: "#1a3a24",
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {m.name}
          </div>
        )}

        {editable ? (
          <input
            type="text"
            inputMode="numeric"
            value={ageValue}
            onChange={(e) => updateMemberAge(m.id, e.target.value.replace(/\D/g, ""))}
            placeholder="—"
            aria-label="Edad (opcional)"
            title="Edad (opcional)"
            style={{
              width: 40, height: 34, textAlign: "center", borderRadius: 9,
              border: "1.5px solid #e0e8e2", background: "#fff",
              fontSize: 16, fontWeight: 700, color: "#3d6b4f",
              outline: "none", fontFamily: "inherit", flexShrink: 0, padding: 0,
            }}
          />
        ) : (
          <div style={{ fontSize: 14, fontWeight: 700, color: "#3d6b4f", width: 32, textAlign: "center", flexShrink: 0 }}>
            {memberAge(m)}
          </div>
        )}

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
            flexWrap: "wrap",
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
  };

  return (
    <OnboardingShell
      title="¿Quién come en casa?"
      subtitle="Añade a cada persona. Luego tócala para elegir su personaje, su color y su edad."
      onReset={onReset}
      onBack={onBack}
      onNext={onNext}
      onFinish={onFinish}
      nextLabel={nextLabel}
      nextDisabled={!hasMembers}
      finishDisabled={!hasMembers}
    >
      {/* Baby menu modal — explains the baby menu and lets the user promote.
          Held back while the name/age mini-popup is open so they don't stack. */}
      <BabyMenuBubble
        member={editingMemberId ? null : pendingBabyMember}
        onKeep={() => pendingBabyMember && dismissBabyHint(pendingBabyMember.id)}
        onPromote={() => pendingBabyMember && promoteBabyToChild(pendingBabyMember.id)}
      />

      {/* Name + age mini-popup (family builder) — compact: name + age on one
          line, colours below, minimalist "Listo". No remove button: tapping
          outside a just-dropped profile discards it; editing an existing one
          just closes. */}
      {builderMode === "family" && editingMemberId && (() => {
        const editing = data.members.find((m) => m.id === editingMemberId);
        if (!editing) return null;
        const prof = profileByKey(editing.profileKey);
        const EIcon = prof?.icon ?? ROLE_ICON_MAP[migrateHomeRole(editing.homeRole)] ?? User;
        const color = editing.color ?? prof?.tint ?? "#2d5a3d";
        const ageVal = editing.age != null && Number.isFinite(Number(editing.age)) ? String(editing.age) : "";
        // Editing an existing member (tapped its avatar) unlocks photo + colour;
        // the quick add popup (just-dropped profile) stays minimal.
        const isEdit = editingMemberId !== justAddedId;
        const catLabel = prof?.label ?? migrateHomeRole(editing.homeRole);
        const closePopup = () => { setEditingMemberId(null); setJustAddedId(null); setAvatarExpanded(false); setColorExpanded(false); };
        const dismiss = () => {
          if (editingMemberId === justAddedId) removeMember(editingMemberId);
          closePopup();
        };
        return (
          <div
            onClick={dismiss}
            style={{
              position: "fixed", inset: 0, zIndex: 120,
              background: "rgba(15,30,20,.34)",
              backdropFilter: "blur(2px)", WebkitBackdropFilter: "blur(2px)",
              display: "flex", alignItems: "center", justifyContent: "center",
              padding: 20, animation: "miniPopFade .18s ease both",
            }}
          >
            <div
              role="dialog"
              aria-modal="true"
              onClick={(e) => e.stopPropagation()}
              style={{
                width: 400, maxWidth: "calc(100vw - 20px)",
                background: "#fff", borderRadius: 20,
                border: "1px solid #e5eee8",
                boxShadow: "0 24px 60px rgba(20,47,29,.26)",
                padding: "22px 22px 28px",
                animation: "memberIn .22s cubic-bezier(.34,1.3,.64,1) both",
              }}
            >
              {/* Two-column layout ─────────────────────────────────────── */}
              {(() => {
                const folder = AVATAR_FOLDER[editing.profileKey];
                const count  = AVATAR_COUNTS[editing.profileKey] ?? 0;
                const imgSrc = editing.photo || avatarSrc(editing.profileKey, editing.avatarKey);
                const keys   = folder && count > 0
                  ? Array.from({ length: count }, (_, i) => `${folder}_${i + 1}`)
                  : [];
                return (
                  <div style={{ display: "flex", alignItems: "stretch", gap: 0 }}>

                    {/* ── LEFT: catLabel · avatar · colour box ──────────── */}
                    <div style={{
                      display: "flex", flexDirection: "column", alignItems: "center",
                      gap: 10, paddingRight: 14, marginRight: 14,
                      borderRight: "1.5px solid #e8f0eb", flexShrink: 0, width: 72,
                    }}>
                      {/* Category label centred above avatar */}
                      <span style={{ fontSize: 9, fontWeight: 800, color: "#9ab0a1", textTransform: "uppercase", letterSpacing: ".3px", lineHeight: 1 }}>
                        {catLabel}
                      </span>
                      {/* Current avatar */}
                      <span style={{
                        width: 46, height: 46, borderRadius: 999, overflow: "hidden",
                        display: "inline-flex", alignItems: "center", justifyContent: "center",
                        background: color, color: "#fff", flexShrink: 0,
                        boxShadow: `0 4px 14px ${color}44`,
                      }}>
                        {imgSrc
                          ? <img src={imgSrc} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                          : <EIcon size={20} strokeWidth={2.2} />}
                      </span>
                      {/* Colour — pill box so it looks clearly tappable */}
                      <button
                        type="button"
                        onClick={() => setColorExpanded((v) => !v)}
                        aria-label="Cambiar color"
                        style={{
                          width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
                          padding: "6px 8px", borderRadius: 8, cursor: "pointer",
                          border: colorExpanded ? `1.5px solid ${color}` : "1.5px solid #e0e8e3",
                          background: colorExpanded ? `${color}15` : "#f4f8f5",
                          transition: "border-color .15s ease, background .15s ease",
                          fontFamily: "inherit",
                        }}
                      >
                        <span style={{ width: 14, height: 14, borderRadius: 999, background: color, flexShrink: 0 }} />
                        <ChevronDown size={12} color="#9ab0a1" strokeWidth={2.5} />
                      </button>
                    </div>

                    {/* ── RIGHT: top row (name · age → ✓ 🗑️) + avatar strip ─ */}
                    <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 14 }}>
                      {/* Top row */}
                      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                        <input
                          value={editing.name}
                          onChange={(e) => updateMemberName(editing.id, e.target.value)}
                          placeholder="Nombre"
                          autoFocus={!isEdit}
                          style={{ flex: 1, minWidth: 0, height: 34, padding: "0 10px", borderRadius: 9, border: "1.5px solid #ddd", fontSize: 13, outline: "none", boxSizing: "border-box", fontFamily: "inherit" }}
                        />
                        <input
                          type="text"
                          inputMode="numeric"
                          value={ageVal}
                          onChange={(e) => updateMemberAge(editing.id, e.target.value.replace(/\D/g, ""))}
                          placeholder="Edad"
                          aria-label="Edad (opcional)"
                          style={{ width: 42, flexShrink: 0, height: 34, padding: "0 4px", borderRadius: 9, border: "1.5px solid #ddd", fontSize: 12, fontWeight: 700, textAlign: "center", color: "#3d6b4f", outline: "none", boxSizing: "border-box", fontFamily: "inherit" }}
                        />
                        {isEdit ? (
                          // Editar: el ✓ "Listo" era redundante (tocar fuera cierra
                          // y guarda), así que solo dejamos 🗑️. Un único botón, igual
                          // que "Añadir", para que el input de nombre respire lo mismo.
                          <button
                            type="button"
                            onClick={() => { const id = editing.id; closePopup(); removeMember(id); }}
                            aria-label="Eliminar"
                            title="Eliminar"
                            style={{ width: 34, height: 34, flexShrink: 0, borderRadius: 9, border: "1.5px solid #f3c6c6", background: "#fff5f5", color: "#c62828", cursor: "pointer", fontFamily: "inherit", display: "inline-flex", alignItems: "center", justifyContent: "center" }}
                          >
                            <Trash2 size={15} strokeWidth={2.3} />
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={closePopup}
                            aria-label="Añadir"
                            title="Añadir"
                            style={{ width: 34, height: 34, flexShrink: 0, borderRadius: 9, border: "none", background: "#2d5a3d", color: "#fff", cursor: "pointer", fontFamily: "inherit", display: "inline-flex", alignItems: "center", justifyContent: "center" }}
                          >
                            <Plus size={17} strokeWidth={2.8} />
                          </button>
                        )}
                      </div>

                      {/* Avatar strip — exactamente 3 caben a la vez y el resto
                          pide scroll a la derecha. El fade + chevron de la derecha
                          indica que hay más avatares. */}
                      {keys.length > 0 && (
                        <div style={{ position: "relative" }}>
                          <div style={{ display: "flex", gap: 10, overflowX: "auto", padding: "4px 0", scrollSnapType: "x proximity", scrollbarWidth: "none" }}>
                          {keys.map((k) => {
                            const sel = editing.avatarKey === k;
                            return (
                              <button
                                key={k}
                                type="button"
                                onClick={() => updateMemberAvatar(editing.id, k)}
                                style={{
                                    flex: "0 0 calc((100% - 20px) / 3)", aspectRatio: "1",
                                    scrollSnapAlign: "start",
                                    padding: 0, cursor: "pointer",
                                  borderRadius: 999, overflow: "hidden",
                                  border: sel ? `2.5px solid ${color}` : "2.5px solid #e5eee8",
                                  boxShadow: sel ? `0 3px 10px ${color}55` : "0 1px 3px rgba(0,0,0,.06)",
                                  background: "transparent",
                                    transform: sel ? "scale(1.06)" : "scale(1)",
                                  transition: "transform .14s cubic-bezier(.34,1.56,.64,1), box-shadow .14s ease, border-color .14s ease",
                                }}
                              >
                                <img src={avatarThumbSrcByKey(k)} alt="" loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                              </button>
                            );
                          })}
                          </div>
                          {/* Fade + chevron hint — only when there are more than 3 avatars */}
                          {keys.length > 3 && (
                            <div style={{
                              position: "absolute", top: 0, right: 0, bottom: 0,
                              width: 32, pointerEvents: "none",
                              background: "linear-gradient(90deg, transparent, rgba(255,255,255,.95))",
                              display: "flex", alignItems: "center", justifyContent: "flex-end",
                              paddingRight: 2,
                            }}>
                              <ChevronRight size={14} color="#9ab0a1" strokeWidth={2.5} />
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()}

              {/* Colour palette — full-width, expands below when pill is tapped */}
              {colorExpanded && (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 8, justifyItems: "center", marginTop: 12 }}>
                  {AVATAR_PALETTE.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => { updateMemberColor(editing.id, c); setColorExpanded(false); }}
                      style={{
                        width: 26, height: 26, borderRadius: 999, background: c,
                        border: color === c ? "2.5px solid #fff" : "none",
                        boxShadow: color === c ? `0 0 0 2.5px ${c}` : `0 2px 7px ${c}55`,
                        cursor: "pointer", padding: 0,
                        transform: color === c ? "scale(1.15)" : "scale(1)",
                        transition: "transform .15s cubic-bezier(.34,1.56,.64,1), box-shadow .15s ease",
                      }}
                    />
                  ))}
                </div>
              )}

              {isEdit && editing.photo && (
                <div style={{ textAlign: "right", marginTop: 8 }}>
                  <button
                    type="button"
                    onClick={() => updateMemberPhoto(editing.id, "")}
                    style={{ border: "none", background: "transparent", color: "#a0587a", cursor: "pointer", fontFamily: "inherit", fontSize: 11.5, fontWeight: 700 }}
                  >
                    Quitar foto
                  </button>
                </div>
              )}

              <input ref={photoInputRef} type="file" accept="image/*" onChange={handlePhotoPick} style={{ display: "none" }} />
            </div>
          </div>
        );
      })()}

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
        @keyframes miniPopFade { from { opacity: 0; } to { opacity: 1; } }
        .member-enter   { animation: memberIn .28s cubic-bezier(.34,1.3,.64,1) both; }
        .member-leaving { animation: memberOut .26s cubic-bezier(.4,0,.2,1) both; overflow: hidden; }
        .palette-cell { transition: transform .12s cubic-bezier(.34,1.56,.64,1), box-shadow .15s ease, border-color .15s ease; }
        .palette-cell:hover { box-shadow: 0 4px 14px rgba(45,90,61,.12); }
        .palette-cell:active { transform: scale(0.95); }
        .fam-chip { transition: transform .12s cubic-bezier(.34,1.56,.64,1); }
        .fam-chip:active { transform: scale(0.94); }
      `}</style>

      {builderMode === "family" ? (
        <>
          {/* TOP — header above card */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 7, flexShrink: 0 }}>
              <span style={{ width: 24, height: 24, borderRadius: 7, background: "#eaf3ee", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
                <Users size={13} strokeWidth={2.4} color="#2d5a3d" />
              </span>
              <span style={{ fontSize: 13, fontWeight: 900, color: "#15301f", letterSpacing: "-.2px" }}>Tu familia</span>
            </span>
            <span style={{ flex: 1, borderTop: "1px dashed #cfdcd4" }} />
            <span style={{ minWidth: 22, height: 22, borderRadius: 999, background: "#eaf3ee", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 800, color: "#2d5a3d", padding: "0 6px" }}>
              {data.members.length}
            </span>
          </div>
          <div style={{
            background: "#fff",
            border: "1px solid #e6efe9", borderRadius: 20,
            padding: hasMembers ? "16px 18px 20px" : 18, marginBottom: 18,
            boxShadow: "0 8px 24px rgba(45,90,61,.08)",
          }}>
            {hasMembers ? (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "8px 4px" }}>
                {data.members.map((m, idx) => {
                  const prof = profileByKey(m.profileKey);
                  const Icon = prof?.icon ?? ROLE_ICON_MAP[migrateHomeRole(m.homeRole)] ?? User;
                  const color = m.color ?? prof?.tint ?? AVATAR_PALETTE[idx % AVATAR_PALETTE.length];
                  const isLeaving = removingIds.has(m.id);
                  const showAge = m.age != null && m.age !== "" && Number.isFinite(Number(m.age));
                  return (
                    <button
                      key={m.id}
                      type="button"
                      className={`fam-chip ${isLeaving ? "member-leaving" : "member-enter"}`}
                      onClick={() => { setJustAddedId(null); setEditingMemberId(m.id); }}
                      style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 5, width: "100%", border: "none", background: "transparent", cursor: "pointer", fontFamily: "inherit", padding: 0 }}
                    >
                      {/* Avatar: coloured disc behind the illustrated character */}
                      {!m.photo && m.avatarKey ? (
                        <span style={{ position: "relative", width: 66, height: 66, display: "inline-block" }}>
                          <span style={{
                            position: "absolute", top: 8, left: 5, right: 5, bottom: 2,
                            borderRadius: 999,
                            background: `linear-gradient(145deg, ${color}, ${color}cc)`,
                            boxShadow: `0 5px 14px ${color}44`,
                          }} />
                          <img
                            src={avatarSrc(m.profileKey, m.avatarKey)}
                            alt=""
                            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "contain", filter: "drop-shadow(0 2px 5px rgba(0,0,0,.18))", transform: m.profileKey === "bebe" ? "scale(0.78)" : "scale(1)", transformOrigin: "center center" }}
                          />
                          <span style={{ position: "absolute", bottom: 1, right: 1, width: 16, height: 16, borderRadius: 999, background: "#fff", border: "1.5px solid #e0e8e3", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1 }}>
                            <svg width="8" height="8" viewBox="0 0 10 10" fill="none"><path d="M7 1.5l1.5 1.5-5 5L2 9l.5-2.5 5-5z" fill="#2d5a3d" /></svg>
                          </span>
                        </span>
                      ) : (
                        <span style={{ position: "relative", width: 54, height: 54, borderRadius: 999, overflow: "hidden", display: "inline-flex", alignItems: "center", justifyContent: "center", color: "#fff", border: "3px solid #fff", boxShadow: `0 5px 14px ${color}55`, ...(m.photo ? { backgroundImage: `url(${m.photo})`, backgroundSize: "cover", backgroundPosition: "center" } : { background: `linear-gradient(145deg, ${color}, ${color}cc)` }) }}>
                          {!m.photo && <Icon size={22} strokeWidth={2.2} />}
                          <span style={{ position: "absolute", bottom: -2, right: -2, width: 16, height: 16, borderRadius: 999, background: "#fff", border: "1.5px solid #e0e8e3", display: "flex", alignItems: "center", justifyContent: "center" }}>
                            <svg width="8" height="8" viewBox="0 0 10 10" fill="none"><path d="M7 1.5l1.5 1.5-5 5L2 9l.5-2.5 5-5z" fill="#2d5a3d" /></svg>
                          </span>
                        </span>
                      )}
                      <span style={{ fontSize: 11, fontWeight: 700, color: "#25402f", letterSpacing: "-.1px", maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textAlign: "center" }}>
                        {m.name || prof?.label || "—"}
                      </span>
                      {showAge && (
                        <span style={{ fontSize: 10, fontWeight: 700, color: "#9ab0a1", marginTop: -2 }}>{m.age} años</span>
                      )}
                    </button>
                  );
                })}
              </div>
            ) : (
              <div style={{ position: "relative", textAlign: "center", color: "#8aa093", fontSize: 12.5, fontWeight: 600, padding: "14px 0 6px" }}>
                Toca un perfil de abajo para empezar a construir tu familia.
              </div>
            )}
          </div>

          {/* BOTTOM — 2×5 palette of profiles */}
          <div style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.4, color: "#3d6b4f", marginBottom: 10 }}>
            Añade a alguien
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            {FAMILY_PROFILES.map((p) => {
              const Icon = p.icon;
              return (
                <button
                  key={p.key}
                  type="button"
                  className="palette-cell"
                  onClick={() => addProfile(p)}
                  style={{
                    display: "flex", alignItems: "center", gap: 11,
                    padding: "10px 12px", borderRadius: 14,
                    border: `1.5px solid ${p.tint}33`, background: "#fff",
                    cursor: "pointer", fontFamily: "inherit", textAlign: "left",
                    boxShadow: "0 1px 4px rgba(45,90,61,.05)",
                  }}
                >
                  <span style={{ width: 36, height: 36, borderRadius: 999, overflow: "hidden", background: p.tint, color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0, boxShadow: `0 3px 10px ${p.tint}44` }}>
                    {AVATAR_FOLDER[p.key] ? (
                      <img src={avatarThumbSrcByKey(DEFAULT_AVATAR[p.key] ?? `${AVATAR_FOLDER[p.key]}_1`)} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    ) : (
                      <Icon size={18} strokeWidth={2.3} />
                    )}
                  </span>
                  <span style={{ flex: 1, fontSize: 13, fontWeight: 700, color: "#25402f", letterSpacing: "-.1px" }}>{p.label}</span>
                  <Plus size={16} strokeWidth={2.8} color={p.tint} />
                </button>
              );
            })}
          </div>
        </>
      ) : (
        <>
          {/* Classic add form — columnas verticales: [Nombre] [Edad] [Añadir] */}
          <div style={{ display: "flex", gap: 8, alignItems: "flex-end", marginBottom: 16 }}>

            {/* Nombre column */}
            <div style={{ flex: "1 1 auto", minWidth: 0 }}>
              <div style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.3, color: "#1a3a24", marginBottom: 4 }}>
                Nombre
              </div>
              <input
                value={demoName ?? name}
                onChange={(e) => setName(e.target.value)}
                placeholder="María"
                style={{
                  width: "100%", height: fieldH, padding: "0 12px",
                  borderRadius: 10, border: "1.5px solid #ddd",
                  fontSize: 16, outline: "none", boxSizing: "border-box", fontFamily: "inherit",
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
                  value={demoAge ?? ageStr}
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

          {/* Divider */}
          {hasMembers && (
            <div style={{ height: 1, background: "rgba(45,90,61,.1)", margin: "4px 0 8px" }} />
          )}

          {data.members.map((m, idx) => renderMemberCard(m, idx, false))}
        </>
      )}

      {/* Standalone "Gestionar familia" only: same-menu-or-not, indexed here
          instead of forcing a trip through menu generation to set it. */}
      {showMenuModel && hasMembers && canSplitMenus(data.members) && (
        <FamilyMenuModelSection data={data} setData={setData} />
      )}
    </OnboardingShell>
  );
}

// Inline "¿coméis todos el mismo menú?" control for the standalone family
// editor. Mirrors OnboardingMenuModel's same/separate logic (incl. the group
// assignment bubble) but as a compact segmented control instead of a full
// onboarding step, so it can live at the bottom of "Gestionar familia".
function FamilyMenuModelSection({ data, setData }) {
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

  const pickModel = (modelId) => {
    if (modelId === "same") {
      setDraftGroups(null);
      setAssignmentOpen(false);
      setData((d) => ({ ...d, menuModel: "same", groups: buildGroups(d.members, "same") }));
      return;
    }
    const reuseExisting =
      data.menuModel === "separate" && Array.isArray(data.groups) && data.groups.length > 0;
    const groups = reuseExisting
      ? reconcileTierGroups(data.members, data.groups)
      : buildGroups(data.members, "separate");

    if (groups.length > 1) {
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
    setDraftGroups(null);
    setAssignmentOpen(false);
  };

  const selected = data.menuModel === "separate" ? "separate" : data.menuModel === "same" ? "same" : null;

  return (
    <div style={{ marginTop: 22, paddingTop: 18, borderTop: "1px solid #eef3f0" }}>
      <p style={{ margin: "0 0 10px", fontSize: 13.5, fontWeight: 800, color: "#1a3a24" }}>
        ¿Coméis todos el mismo menú?
      </p>
      <div style={{ display: "flex", background: "#eef3f0", borderRadius: 12, padding: 3, gap: 3 }}>
        {[
          { id: "same", label: "Sí, el mismo" },
          { id: "separate", label: "No, distintos" },
        ].map((opt) => {
          const active = selected === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => pickModel(opt.id)}
              style={{
                flex: 1, padding: "10px 0", borderRadius: 9, border: "none",
                background: active ? "#2d5a3d" : "transparent",
                color: active ? "#fff" : "#5a7066",
                fontSize: 13.5, fontWeight: 800, cursor: "pointer", fontFamily: "inherit",
                transition: "all .15s ease",
              }}
            >
              {opt.label}
            </button>
          );
        })}
      </div>

      {selected === "same" && showBabyHint && (
        <p style={{ fontSize: 12, fontWeight: 600, color: "#5a7a66", margin: "10px 0 0", lineHeight: 1.45, textAlign: "center" }}>
          Los bebés tendrán menú adaptado automáticamente.
        </p>
      )}

      {selected === "separate" && !assignmentOpen && (
        <div style={{ display: "flex", justifyContent: "center", marginTop: 10 }}>
          <button
            type="button"
            onClick={() => pickModel("separate")}
            style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              background: "none", border: "none", color: "#2d5a3d",
              fontSize: 12.5, fontWeight: 800, cursor: "pointer", fontFamily: "inherit", padding: "6px 4px",
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
            setDraftGroups((groups) => applyMemberToGroup(groups, data.members, memberId, targetGroupId))
          }
          onConfirm={confirmAssignment}
          onCancel={cancelAssignment}
        />
      )}
    </div>
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
  width: 40,
  height: fixedRowH,
  padding: "0 2px",
  borderRadius: 8,
  border: "1px solid #ddd",
  fontSize: 16,
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

// Color natural de cada franja horaria: coral de amanecer, dorado de mediodía,
// azul de noche. Es información (qué comida es), no decoración, así que puede
// llevar su propio color sin quitarle al verde su papel de "esto se pulsa".
// Buscamos rojo-amarillo-azul (máxima separación de tono): el desayuno va a un
// coral claramente más rojo que el dorado del mediodía para que no se confundan
// dos cálidos vecinos. Comida y Cena coinciden con el MealGlyph del calendario
// (Menu.jsx) para que la app hable un mismo idioma.

const TOOL_ICON = {
  Airfryer: Wind,
  Horno: Flame,
  Microondas: Microwave,
  Thermomix: Bot,
  "Olla rápida": CookingPot,
  Vaporera: Layers2,
};

// Color por herramienta para que la rejilla no sea un bloque verde monótono:
// cada aparato tiene su tono (calor rojo/ámbar, frío azul, tech morado, vapor
// verde…). Las herramientas personalizadas caen al verde de marca.
const TOOL_COLOR = {
  Airfryer: "#e08a2b",
  Horno: "#e0654f",
  Microondas: "#5a7a9a",
  Thermomix: "#7a5bd6",
  "Olla rápida": "#c9820a",
  Vaporera: "#2d8a4e",
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
            <Icon size={15} color={active ? "#fff" : mealTimeColor(m)} strokeWidth={2.4} />
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
              fontSize: 16,
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

const FAMILIA_TARGET = "__familia__";

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

function AvoidSection({ icon: Icon, title, subtitle, right, children }) {
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
          gap: 9,
          padding: "9px 14px",
          background: "#dcebe1",
          borderBottom: "1px solid #c9ddd0",
        }}
      >
        <span
          style={{
            width: 27,
            height: 27,
            borderRadius: 9,
            background: "#2d5a3d",
            color: "#fff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
            boxShadow: "0 2px 6px rgba(45,90,61,.3)",
          }}
        >
          <Icon size={14} strokeWidth={2.2} />
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ margin: 0, fontSize: 13, fontWeight: 800, color: "#1a3a24", lineHeight: 1.2 }}>{title}</p>
          {subtitle && <p style={{ margin: "1px 0 0", fontSize: 11, color: "#5e7a68", fontWeight: 600 }}>{subtitle}</p>}
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

// Predefined intolerances (stored on member.intolerances) — hard exclusions
// distinct from the "Leche" allergen: "fina" tolerates cured cheese, etc.
const INTOLERANCE_UI = [
  { id: "lactosa_fina", label: "Lactosa (intolerancia)", Icon: CircleDot, color: "#4a7ab8" },
  { id: "fructosa", label: "Fructosa", Icon: CircleDot, color: "#c0562f" },
  { id: "sorbitol", label: "Sorbitol", Icon: CircleDot, color: "#8a5a28" },
  // Hard exclusions like the intolerances above, but matched structurally
  // against mainProtein/extraProteins instead of by keyword — see
  // recipeViolatesDiet in lib/intolerances.js.
  { id: "vegetariano", label: "Vegetariano", Icon: Salad, color: "#4a8a3a" },
  { id: "vegano", label: "Vegano", Icon: Leaf, color: "#2f7a4a" },
];

// "Menú más cuidado" — per member (member.healthProfiles[]). Soft bias only.
// "Crónico" tab: structural conditions, no end date. Kept as a single flat
// bias per condition — e.g. diabetes tipo 1/2/gestacional all want the same
// food-level guidance (moderar carbs/azúcar), so splitting by subtype would
// add UI weight without changing what the planner actually does.
const HEALTH_PROFILE_UI = [
  { id: "glucemico", label: "Diabetes", Icon: Zap, color: "#dd8a2c" },
  { id: "corazon", label: "Corazón y colesterol", Icon: HeartPulse, color: "#c0562f" },
  { id: "bajo_sodio", label: "Bajo en sal", Icon: CircleDot, color: "#3f87b0" },
  { id: "reflux", label: "Digestión / reflujo", Icon: Flame, color: "#a06b2f" },
  { id: "anemia", label: "Anemia (más hierro)", Icon: Beef, color: "#b0303f" },
];

// Temporary states (member.dietaryStates) — situations with an implicit end
// date. Embarazo/lactancia are hard exclusions (see intolerances.js).
// "Dieta blanda" has no group-wide rule on purpose: it's too restrictive to
// impose on the shared family menu, so it's the trigger for the ad-hoc
// single-person menu (deferred feature) — stored here, wired up there.
const DIETARY_STATE_UI = [
  { id: "embarazo", label: "Embarazo", Icon: Baby, color: "#c86a9e" },
  { id: "lactancia", label: "Lactancia", Icon: Heart, color: "#7a5ab8" },
  { id: "dieta_blanda", label: "Dieta blanda", Icon: CookingPot, color: "#7a8a3a" },
];

export function OnboardingRestrictions({
  data,
  setData,
  onNext,
  onBack,
  onFinish,
  onReset,
  nextLabel,
  finishLabel,
  // Optional demo hooks (first-run value-prop carousel): preset the visible tab
  // and edit scope, and optionally auto-cycle through them. All default to the
  // normal interactive behaviour and are never passed in the real onboarding.
  initialTab = null,
  initialScopeId = null,
  autoplay = false,
}) {
  const [customAllergy, setCustomAllergy] = useState("");
  const [showAddAllergy, setShowAddAllergy] = useState(false);
  const [allergyMemberId, setAllergyMemberId] = useState(
    initialScopeId ?? data.members[0]?.id ?? null,
  );
  const [mainTab, setMainTab] = useState(initialTab ?? "alergias");

  // Demo autoplay: walk allergens → health (pregnancy) → health (diabetes),
  // switching the edit scope so each highlighted member's chips light up.
  useEffect(() => {
    if (!autoplay) return undefined;
    const plan = [
      { tab: "alergias", idx: 0 },
      { tab: "salud", idx: 1 },
      { tab: "salud", idx: 2 },
    ];
    let k = 0;
    const apply = () => {
      const p = plan[k % plan.length];
      const m = data.members[p.idx] ?? data.members[0];
      setMainTab(p.tab);
      setAllergyMemberId(m?.id ?? null);
    };
    apply();
    const id = setInterval(() => {
      k += 1;
      apply();
    }, 2100);
    return () => clearInterval(id);
  }, [autoplay, data.members]);

  // Edit target: a real member, or FAMILIA_TARGET to edit everyone at once.
  // Falls back to the first member if the stored id is stale.
  const isFamilia = allergyMemberId === FAMILIA_TARGET;
  const activeAllergyMemberId = isFamilia
    ? FAMILIA_TARGET
    : data.members.some((m) => m.id === allergyMemberId)
      ? allergyMemberId
      : data.members[0]?.id ?? null;
  const activeMemberColor = isFamilia
    ? "#2d5a3d"
    : activeAllergyMemberId
      ? memberAvatarColor(activeAllergyMemberId, data.members)
      : "#2d5a3d";

  // Members the current selection writes to (all of them in "Familia" scope).
  const inScope = (m) => isFamilia || m.id === activeAllergyMemberId;
  const scopeMembers = data.members.filter(inScope);

  const memberHasKey = (m, key) =>
    (m.allergies ?? []).some((a) => normalizeAllergenId(a) === key);

  // In Familia scope a row reads as "checked" only when EVERY member has it.
  const allScopeHave = (pred) => scopeMembers.length > 0 && scopeMembers.every(pred);

  // Toggle a set-membership field across the whole scope: if everyone already
  // has it, remove it from all; otherwise add it to those missing it.
  const toggleScopeMembership = (getList, setList, value, matches) =>
    setData((d) => {
      const targets = d.members.filter(inScope);
      const allHave = targets.length > 0 && targets.every((m) => getList(m).some((v) => matches(v, value)));
      return {
        ...d,
        members: d.members.map((m) => {
          if (!inScope(m)) return m;
          const list = getList(m);
          const has = list.some((v) => matches(v, value));
          if (allHave) return setList(m, list.filter((v) => !matches(v, value)));
          return has ? m : setList(m, [...list, value]);
        }),
      };
    });

  const eq = (a, b) => a === b;

  const activeHasKey = (key) => allScopeHave((m) => memberHasKey(m, key));
  const toggleMemberAllergen = (_target, key, label) =>
    setData((d) => {
      const targets = d.members.filter(inScope);
      const allHave = targets.length > 0 && targets.every((m) => memberHasKey(m, key));
      return {
        ...d,
        members: d.members.map((m) => {
          if (!inScope(m)) return m;
          const has = memberHasKey(m, key);
          if (allHave) return { ...m, allergies: (m.allergies ?? []).filter((a) => normalizeAllergenId(a) !== key) };
          return has ? m : { ...m, allergies: [...(m.allergies ?? []), label] };
        }),
      };
    });

  const activeHasIntolerance = (id) => allScopeHave((m) => (m.intolerances ?? []).includes(id));
  const toggleIntolerance = (_target, id) =>
    toggleScopeMembership((m) => m.intolerances ?? [], (m, list) => ({ ...m, intolerances: list }), id, eq);

  const activeHasState = (id) => allScopeHave((m) => (m.dietaryStates ?? []).includes(id));
  const toggleDietaryState = (_target, id) =>
    toggleScopeMembership((m) => m.dietaryStates ?? [], (m, list) => ({ ...m, dietaryStates: list }), id, eq);

  const activeHasHealthProfile = (id) => allScopeHave((m) => (m.healthProfiles ?? []).includes(id));
  const toggleHealthProfile = (_target, id) =>
    toggleScopeMembership((m) => m.healthProfiles ?? [], (m, list) => ({ ...m, healthProfiles: list }), id, eq);

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
      {...(finishLabel ? { finishLabel } : {})}
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

          {data.members.length > 1 && (
            <div style={{ marginBottom: 16 }}>
              <ScopeCirclePicker
                value={activeAllergyMemberId}
                onChange={setAllergyMemberId}
                allMembers={data.members}
                style={{ marginBottom: 0 }}
                options={[
                  { id: FAMILIA_TARGET, label: isFamilyGroup(data.members) ? "Familia" : "Todos", abbrev: isFamilyGroup(data.members) ? "F" : "T", Icon: Users, color: "#2d5a3d", members: data.members },
                  ...data.members.map((m) => ({
                    id: m.id,
                    label: m.name,
                    abbrev: (m.name ?? "?").trim().charAt(0).toUpperCase() || "?",
                    color: memberAvatarColor(m.id, data.members),
                    members: [m],
                  })),
                ]}
              />
            </div>
          )}

          {/* Two top cards act as the section switcher so only one panel is
              visible at a time — keeps the whole step above the fold. */}
          <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
            <RestrictionTabCard
              Icon={Zap}
              img="/avatares/cards/cook_alergias.jpg"
              title="Alergias"
              subtitle="e intolerancias"
              accent={CARD_ACCENT_TEAL}
              active={mainTab === "alergias"}
              onClick={() => setMainTab("alergias")}
            />
            <RestrictionTabCard
              Icon={HeartPulse}
              images={[
                "/avatares/cards/cook_salud_sano.jpg",
                "/avatares/cards/cook_salud_embarazada.jpg",
                "/avatares/cards/cook_salud_enfermo.jpg",
              ]}
              title="Salud"
              subtitle="crónico y temporal"
              accent={CARD_ACCENT_TEAL}
              active={mainTab === "salud"}
              onClick={() => setMainTab("salud")}
            />
          </div>

          {mainTab === "alergias" ? (
            <div style={panelCardStyle}>
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

                {INTOLERANCE_UI.map((opt) => (
                  <AllergenRow
                    key={opt.id}
                    Icon={opt.Icon}
                    color={opt.color}
                    label={opt.label}
                    checked={activeHasIntolerance(opt.id)}
                    checkColor={activeMemberColor}
                    onToggle={() => activeAllergyMemberId && toggleIntolerance(activeAllergyMemberId, opt.id)}
                  />
                ))}

                <button
                  type="button"
                  onClick={() => setShowAddAllergy((v) => !v)}
                  className="avoid-row"
                  style={{
                    width: "100%", boxSizing: "border-box", display: "flex", alignItems: "center", gap: 8,
                    padding: "8px 6px", border: "none", background: "transparent",
                    cursor: "pointer", fontFamily: "inherit", textAlign: "left", borderRadius: 8,
                  }}
                >
                  <span
                    style={{
                      width: 24, height: 24, borderRadius: 7, flexShrink: 0,
                      background: "#2d5a3d", color: "#fff",
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}
                  >
                    <Plus size={14} strokeWidth={2.6} />
                  </span>
                  <span style={{ flex: 1, minWidth: 0, fontSize: 12, fontWeight: 800, color: "#2d5a3d" }}>Añadir otra</span>
                </button>
              </div>

              {showAddAllergy && (
                <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                  <input
                    value={customAllergy}
                    onChange={(e) => setCustomAllergy(e.target.value)}
                    placeholder="Otra alergia o intolerancia"
                    style={{ flex: 1, padding: "9px 12px", borderRadius: 10, border: "1.5px solid #dde7e0", fontSize: 16, outline: "none", fontFamily: "inherit" }}
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
          ) : (
            <div style={panelCardStyle}>
              <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={healthColHeaderStyle}>Crónico</p>
                  {HEALTH_PROFILE_UI.map((opt, i) => (
                    <AllergenRow
                      key={opt.id}
                      Icon={opt.Icon}
                      color={opt.color}
                      label={opt.label}
                      checked={activeHasHealthProfile(opt.id)}
                      checkColor={activeMemberColor}
                      onToggle={() => activeAllergyMemberId && toggleHealthProfile(activeAllergyMemberId, opt.id)}
                      last={i === HEALTH_PROFILE_UI.length - 1}
                    />
                  ))}
                </div>

                <div style={{ width: 1, alignSelf: "stretch", background: "#eef3f0", flexShrink: 0 }} />

                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={healthColHeaderStyle}>Temporal</p>
                  {DIETARY_STATE_UI.map((opt, i) => (
                    <AllergenRow
                      key={opt.id}
                      Icon={opt.Icon}
                      color={opt.color}
                      label={opt.label}
                      checked={activeHasState(opt.id)}
                      checkColor={activeMemberColor}
                      onToggle={() => activeAllergyMemberId && toggleDietaryState(activeAllergyMemberId, opt.id)}
                      last={i === DIETARY_STATE_UI.length - 1}
                    />
                  ))}
                </div>
              </div>

              <p style={{ margin: "12px 2px 0", fontSize: 10.5, lineHeight: 1.4, color: "#8a9a90" }}>
                Orientación general para la planificación. No sustituye el consejo de un profesional sanitario.
              </p>
            </div>
          )}

      </>
    </OnboardingShell>
  );
}

const panelCardStyle = {
  background: "#fff",
  border: "1.5px solid #2d5a3d",
  borderRadius: 16,
  padding: "14px 14px",
  boxShadow: "0 1px 3px rgba(20,47,29,.05)",
};

const healthColHeaderStyle = {
  margin: "0 0 8px",
  padding: "5px 0",
  borderRadius: 8,
  background: "#2d5a3d",
  fontSize: 11,
  fontWeight: 800,
  letterSpacing: ".04em",
  textTransform: "uppercase",
  color: "#fff",
  textAlign: "center",
};

// One of the two top switch cards (Alergias vs Menú cuidado). Mirrors the
// meal-style cards (icon on top, label below, green fill + check when active).
// Ilustración que rota cada `interval` ms con un pequeño slide hacia la derecha
// (la entrante aparece desde la izquierda y avanza a su sitio) + crossfade. Las
// imágenes están todas en el DOM (precargadas) para que el cambio sea instantáneo,
// y respeta prefers-reduced-motion dejando una fija.
function RotatingCardImage({ images, interval = 2500, alt = "" }) {
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    if (!images || images.length <= 1) return undefined;
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return undefined;
    const t = setInterval(() => setIdx((v) => (v + 1) % images.length), interval);
    return () => clearInterval(t);
  }, [images, interval]);
  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
      {images.map((src, i) => (
        <img
          key={src}
          src={src}
          alt={i === idx ? alt : ""}
          loading="lazy"
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "contain",
            opacity: i === idx ? 1 : 0,
            transform: i === idx ? "translateX(0)" : "translateX(-22px)",
            transition: "opacity .45s ease, transform .55s cubic-bezier(.34,1.08,.5,1)",
          }}
        />
      ))}
    </div>
  );
}

/** Forest green for nested choices; teal for top section switchers (Alergias, Comidas…). */
const CARD_ACCENT = "#2d5a3d";
const CARD_ACCENT_TEAL = "#0f766e";

function RestrictionTabCard({
  Icon,
  img,
  images,
  title,
  subtitle,
  active,
  onClick,
  imgRatio = "1 / 1",
  imgHeight,
  textOverlay = false,
  accent = CARD_ACCENT,
}) {
  const illustrated = Boolean(img || (images && images.length));
  if (illustrated) {
    const shadow = active
      ? accent === CARD_ACCENT_TEAL
        ? "0 6px 18px rgba(15,118,110,.22)"
        : "0 6px 18px rgba(45,90,61,.22)"
      : "0 1px 2px rgba(0,0,0,.04)";
    return (
      <button
        type="button"
        onClick={onClick}
        aria-pressed={active}
        style={{
          position: "relative",
          flex: 1,
          minWidth: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "stretch",
          padding: 0,
          overflow: "hidden",
          borderRadius: 15,
          border: `2px solid ${active ? accent : "#e0eae3"}`,
          background: active ? accent : "#fff",
          cursor: "pointer",
          fontFamily: "inherit",
          transition: "all .16s ease",
          boxShadow: shadow,
        }}
      >
        {active && (
          <span
            style={{
              position: "absolute", top: 8, right: 8, zIndex: 2,
              width: 20, height: 20, borderRadius: "50%", background: accent,
              display: "flex", alignItems: "center", justifyContent: "center",
              boxShadow: "0 1px 4px rgba(20,47,29,.3)",
            }}
          >
            <Check size={12} color="#fff" strokeWidth={3} />
          </span>
        )}
        <div style={{ position: "relative", width: "100%", ...(imgHeight ? { height: imgHeight } : { aspectRatio: imgRatio }), background: "#f4f7f5", overflow: "hidden" }}>
          {images && images.length > 1 ? (
            <RotatingCardImage images={images} alt={title} />
          ) : (
            <img
              src={img ?? images?.[0]}
              alt=""
              loading="lazy"
              style={{
                width: "100%",
                height: "100%",
                objectFit: imgHeight ? "cover" : imgRatio === "1 / 1" ? "contain" : "cover",
                objectPosition: "center 28%",
                display: "block",
              }}
            />
          )}
          {textOverlay && (
            <div style={{
              position: "absolute", inset: 0,
              background: "linear-gradient(to top, rgba(0,0,0,.62) 0%, rgba(0,0,0,.18) 55%, transparent 100%)",
              display: "flex", flexDirection: "column", justifyContent: "flex-end",
              padding: "0 8px 8px",
              textAlign: "center",
            }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: "#fff", lineHeight: 1.2 }}>{title}</div>
            </div>
          )}
        </div>
        {!textOverlay && (
          <div
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
              padding: "8px 6px 9px",
              background: active ? accent : "#fff",
              textAlign: "center",
              color: active ? "#fff" : "#142f1d",
            }}
          >
            <div style={{ fontSize: 12, fontWeight: 800 }}>{title}</div>
            <div style={{ fontSize: 10, fontWeight: 600, marginTop: 1, opacity: 0.9 }}>{subtitle}</div>
          </div>
        )}
      </button>
    );
  }
  return (
    <button type="button" onClick={onClick} aria-pressed={active} style={mealStyleCardStyle(active, accent)}>
      {active && (
        <span style={{ position: "absolute", top: 6, right: 6, display: "flex" }}>
          <Check size={11} color="#fff" />
        </span>
      )}
      <div style={mealStyleIconStyle(active, accent)}>
        <Icon size={16} />
      </div>
      <div style={{ textAlign: "center", lineHeight: 1.2, color: active ? "#fff" : "#142f1d" }}>
        <div style={{ fontSize: 12, fontWeight: 800 }}>{title}</div>
        <div style={{ fontSize: 10, fontWeight: 600, marginTop: 1 }}>{subtitle}</div>
      </div>
    </button>
  );
}

export function OnboardingRepeat({
  data,
  setData,
  user = null,
  priceObs = [],
  pantryEpoch = 0,
  onNext,
  onBack,
  onFinish,
  onReset,
}) {
  const mealOptions = getMeals(data);
  // Same pattern as «¿Qué evitamos?» (Alergias / Salud): two top cards switch
  // which panel is visible so the step stays scannable.
  const [mainTab, setMainTab] = useState("casa");

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

  // Same browsing model as "Recetas" (categories first, then a Favoritas
  // filter) — minus the ability to mark new favorites here, since that's not
  // this screen's job. "Favoritas" just surfaces whatever's already starred.
  const [catalogTab, setCatalogTab] = useState("catalogo");
  const favoriteIds = useMemo(
    () => new Set(favoriteRecipeIds(data.recipeVotes)),
    [data.recipeVotes],
  );

  return (
    <OnboardingShell
      title="¿Qué repetimos?"
      subtitle="Lo que hay en casa y los platos que ya os gustan"
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

      <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
        <RestrictionTabCard
          Icon={Refrigerator}
          title="En casa"
          subtitle="nevera, despensa y congelador"
          accent={CARD_ACCENT_TEAL}
          active={mainTab === "casa"}
          onClick={() => setMainTab("casa")}
        />
        <RestrictionTabCard
          Icon={Star}
          title="Favoritas"
          subtitle="y platos fijos"
          accent={CARD_ACCENT_TEAL}
          active={mainTab === "favoritas"}
          onClick={() => setMainTab("favoritas")}
        />
      </div>

      {mainTab === "casa" ? (
        <div>
          <Suspense
            fallback={
              <p style={{ margin: 0, padding: "12px 2px", fontSize: 13, color: "#9ab0a1" }}>
                Cargando…
              </p>
            }
          >
            {/* El toggle "usar despensa" vive ahora en «¿Cómo completamos el
                menú?» (segmented control de despensa), no aquí, para no
                duplicarlo. */}
            <PantryScreen
              embedded
              user={user}
              priceObs={priceObs}
              pantryEpoch={pantryEpoch}
            />
          </Suspense>
        </div>
      ) : (
        <>
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

          <div style={{ display: "flex", background: "#e8efe9", borderRadius: 12, padding: 3, marginBottom: 12 }}>
            {[
              { id: "catalogo", label: "Catálogo" },
              { id: "favoritas", label: "Favoritas", count: favoriteIds.size },
            ].map((t) => {
              const sel = catalogTab === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setCatalogTab(t.id)}
                  style={{
                    flex: 1, padding: "7px 0", borderRadius: 9, border: "none",
                    background: sel ? "#fff" : "transparent",
                    color: sel ? "#142f1d" : "#7a9485",
                    fontSize: 13, fontWeight: sel ? 800 : 700,
                    cursor: "pointer", fontFamily: "inherit",
                    boxShadow: sel ? "0 1px 4px rgba(0,0,0,.1)" : "none",
                    transition: "all .15s",
                  }}
                >
                  {t.label}
                  {t.count > 0 && (
                    <span
                      style={{
                        marginLeft: 5, fontSize: 10, fontWeight: 900, color: sel ? "#2d5a3d" : "#9ab0a1",
                        background: sel ? "#e4f3e9" : "#dce8de",
                        padding: "1px 6px", borderRadius: 999,
                      }}
                    >
                      {t.count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <CatalogBrowserSheet
            key={catalogTab}
            inline
            browseCategories={catalogTab === "catalogo"}
            favoriteIds={catalogTab === "favoritas" ? favoriteIds : null}
            emptyLabel={catalogTab === "favoritas" ? "Aún no tienes favoritas. Márcalas desde Recetas para verlas aquí." : null}
            recipeVotes={data.recipeVotes}
            addedIds={addedCatalogIds}
            garnishByCatalogId={addedGarnishByCatalogId}
            onAdd={addCatalogDish}
            onRemove={removeCatalogDish}
            onSetGarnish={setCatalogGarnish}
            extraRecipes={data.userRecipes ?? []}
          />
        </>
      )}
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
            {(() => {
              const faces = groupAvatarFaces(members.filter((m) => g.memberIds?.includes(m.id)), members);
              if (faces.length > 0) return <GroupAvatarStack faces={faces} size={34} />;
              return (
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
                    overflow: "hidden",
                    background: "#fff",
                  }}
                >
                  {GROUP_COLUMN_ABBREV[g.label] ?? g.label.charAt(0)}
                </span>
              );
            })()}
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
                <Avatar
                  name={member.name}
                  size={24}
                  photo={memberAvatarThumbSrc(member)}
                  color={memberAvatarColor(member.id, members)}
                />
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

const INDIVIDUAL_REASON_COPY = {
  dieta_blanda: {
    title: "Dieta blanda para {name}",
    Icon: CookingPot,
    what: "un menú aparte de dieta blanda: suave, sin frituras ni picante",
  },
  embarazo: {
    title: "Menú de embarazo para {name}",
    Icon: Baby,
    what: "un menú aparte adaptado al embarazo",
  },
  lactancia: {
    title: "Menú de lactancia para {name}",
    Icon: Heart,
    what: "un menú aparte adaptado a la lactancia",
  },
};

// Auto-triggered the moment the state is checked (dieta blanda, embarazo,
// lactancia): same look and feel as the "menú de bebé" bubble, so accepting a
// heavy/ad-hoc state always explains itself the same way, right when it
// happens — no separate explainer shown later on the menu screen.
export function IndividualMenuSheet({ member, reason, onConfirm, onCancel }) {
  if (!member) return null;

  const copy = INDIVIDUAL_REASON_COPY[reason] ?? INDIVIDUAL_REASON_COPY.dieta_blanda;
  const firstName = (member.name || "").trim().split(/\s+/)[0] || member.name;
  const title = copy.title.replace("{name}", firstName);
  const points = [
    {
      Icon: copy.Icon,
      text: (
        <>
          Le prepararemos a <strong>{firstName}</strong> {copy.what}.
        </>
      ),
    },
    {
      Icon: CalendarDays,
      text: (
        <>
          Durará <strong>3 días</strong>; después volverá sola al menú de la familia.
        </>
      ),
    },
    {
      Icon: Users,
      text: (
        <>
          Podrás verlo cuando quieras tocando su avatar en <strong>Personas</strong>.
        </>
      ),
    },
  ];

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 260,
        background: "rgba(20,47,29,.32)", backdropFilter: "blur(2px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: "0 16px", animation: "afinarFadeIn .2s ease",
      }}
      onClick={onCancel}
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
          position: "relative", width: "100%", maxWidth: 380,
          background: "#fff", borderRadius: 24, padding: "22px 20px 18px",
          boxShadow: "0 18px 50px rgba(20,47,29,.32)",
          animation: "afinarPop .38s cubic-bezier(.34,1.56,.5,1) both",
        }}
      >
        <div
          style={{
            position: "absolute", top: -26, left: 22, width: 52, height: 52,
            borderRadius: "50% 50% 50% 8px",
            background: "linear-gradient(135deg, #7a8a3a, #a8bf5a)",
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: "0 6px 16px rgba(122,138,58,.4)",
            animation: "afinarBob 2.4s ease-in-out infinite",
          }}
        >
          <copy.Icon size={24} color="#fff" />
        </div>

        <div style={{ marginTop: 14 }}>
          <h3 style={{ margin: "0 0 5px", fontSize: 19, fontWeight: 900, color: "#142f1d", letterSpacing: "-.4px" }}>
            {title}
          </h3>
          <p style={{ margin: "0 0 14px", fontSize: 13, color: "#5a7a66", lineHeight: 1.45 }}>
            Es difícil de compartir con toda la familia. Si quieres, esto es lo que haríamos:
          </p>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
          {points.map((p, i) => (
            <div
              key={i}
              style={{
                display: "flex", alignItems: "center", gap: 10,
                padding: "9px 11px", borderRadius: 12, background: "#f4f9f5",
              }}
            >
              <span
                style={{
                  width: 30, height: 30, borderRadius: 9, flexShrink: 0,
                  background: "#e4efe7", display: "flex", alignItems: "center", justifyContent: "center",
                }}
              >
                <p.Icon size={16} color="#2d5a3d" />
              </span>
              <span style={{ fontSize: 12.5, color: "#33513e", lineHeight: 1.4 }}>{p.text}</span>
            </div>
          ))}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <button
            type="button"
            onClick={() => onConfirm(true)}
            style={{
              width: "100%", padding: "12px 16px", borderRadius: 13, border: "none",
              background: "linear-gradient(135deg, #7a8a3a, #a8bf5a)",
              color: "#fff", fontSize: 14.5, fontWeight: 800, cursor: "pointer", fontFamily: "inherit",
            }}
          >
            Sí, menú aparte
          </button>
          <button
            type="button"
            onClick={() => onConfirm(false)}
            style={{
              width: "100%", padding: "11px 16px", borderRadius: 13,
              border: "1.5px solid #cfe0d4", background: "#fff", color: "#2d5a3d",
              fontSize: 13.5, fontWeight: 800, cursor: "pointer", fontFamily: "inherit",
            }}
          >
            No, seguir con el menú familiar
          </button>
        </div>
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
  { step: 8, Icon: ChefHat, label: "Cocina", desc: "Tu nivel y herramientas" },
  { step: 9, Icon: Clock, label: "Tiempos", desc: "Cuánto tiempo tienes para cocinar" },
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
        {/* Cancel — informational bubble, so a plain close in the corner */}
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar"
          style={{
            position: "absolute", top: 12, right: 12, zIndex: 1,
            width: 30, height: 30, borderRadius: 999, border: "none",
            background: "#f0f4f1", cursor: "pointer", fontFamily: "inherit",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
        >
          <X size={17} color="#5a7a66" />
        </button>

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
      img: "/avatares/cards/comemos_lo_mismo.png",
      label: "Todos comemos lo mismo",
      desc: "Un único menú para toda la familia",
    },
    {
      id: "separate",
      Icon: GitBranch,
      img: "/avatares/cards/comemos_por_separado.png",
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
    const groups = reuseExisting
      ? reconcileTierGroups(data.members, data.groups)
      : buildGroups(data.members, "separate");

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
      <div style={{ display: "flex", flexDirection: "column", gap: 12, height: "100%" }}>
        {models.map((m) => {
          const sel = data.menuModel === m.id;
          return (
            <button
              key={m.id}
              type="button"
              onClick={() => pickModel(m.id)}
              style={{
                flex: 1,
                minHeight: 0,
                display: "flex",
                flexDirection: "column",
                alignItems: "stretch",
                width: "100%",
                textAlign: "center",
                padding: 0,
                borderRadius: 18,
                cursor: "pointer",
                overflow: "hidden",
                background: sel ? "#2d5a3d" : "#f7f9f8",
                border: `2.5px solid ${sel ? "#2d5a3d" : "#e8ede9"}`,
                boxShadow: sel ? "0 4px 18px rgba(45,90,61,.25)" : "none",
                transition: "all .18s ease",
                fontFamily: "inherit",
              }}
            >
              {/* illustration */}
              {m.img ? (
                <img
                  src={m.img}
                  alt=""
                  style={{
                    flex: 1,
                    minHeight: 0,
                    width: "100%",
                    objectFit: "cover",
                    objectPosition: "center center",
                    display: "block",
                    borderBottom: `1px solid ${sel ? "rgba(255,255,255,.15)" : "#e8ede9"}`,
                  }}
                />
              ) : (
              <span
                style={{
                    flex: 1,
                    minHeight: 0,
                    display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                    background: sel ? "rgba(255,255,255,.1)" : "#edf2ee",
                }}
              >
                <m.Icon size={36} color={sel ? "#fff" : "#2d5a3d"} />
              </span>
              )}
              {/* text + badge */}
              <span style={{ flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: 6, padding: "11px 16px 13px" }}>
              <span>
                  <div style={{ fontWeight: 800, color: sel ? "#fff" : "#1a3a24", fontSize: 15, marginBottom: 3 }}>{m.label}</div>
                  <div style={{ fontSize: 12, color: sel ? "rgba(255,255,255,.75)" : "#7a9080", lineHeight: 1.35 }}>{m.desc}</div>
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
              </span>
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

// El comedor tiene tono propio y no una variante del azul de "come fuera":
// para esta app son cosas distintas —el comedor trae menú conocido y condiciona
// lo que se cocina en casa esa noche— y merece leerse de lejos.
// El choque que tenía con el coral del desayuno (6° de matiz) ya no existe:
// dentro de los carriles los glifos de franja horaria van en gris, así que el
// único color de la rejilla es el del sitio donde se come.
const SLOT_CONFIG = {
  casa:   { label: "En casa",     color: "#4cba6e" },
  tupper: { label: "Tupper",      color: "#c05c3a" },
  fuera:  { label: "Come fuera",  color: "#2e7d75" },
  cole:   { label: "Comedor",     color: "#c05c3a" },
};

const MIXED_COLOR = "#aaa";

// Verde de la banda de "en casa" en los carriles: tiene que leerse como verde
// —de ahí que suba respecto al #e9f3ec de antes— pero quedarse por debajo de
// las fichas de comedor y de fuera, que son las que deben saltar.
const HOME_BAND = "#d9edde";

export function OnboardingSchedule({ data, setData, onNext, onBack, onFinish, onReset, autoplay = false, demoHeight = null }) {
  // Desayuno is optional (stored in data.extraMeals, not data.meals, so the AI
  // planner never treats it as a comida). But when it's on we DO want its row in
  // the "¿dónde coméis?" grid, so people can say who has breakfast at home.
  const desayunoOn = Boolean(data.extraMeals?.desayuno && data.extraMeals.desayuno !== "off");
  const meals = useMemo(() => {
    const base = getMeals(data);
    return desayunoOn ? ["Desayuno", ...base.filter((m) => m !== "Desayuno")] : base;
  }, [data, desayunoOn]);
  const memberList = useMemo(() => data.members ?? [], [data.members]);
  const [sheetSlot, setSheetSlot] = useState(null);
  // Slots just written by a quick action, so the lanes can animate them in.
  const [flashKeys, setFlashKeys] = useState(null);
  // Body scroll container (para el guion del carrusel: scroll DENTRO del body).
  const scheduleBodyRef = useRef(null);

  // Value-prop carousel demo (guionizado): el scroll ocurre DENTRO del body
  // (como una pantalla real), no paneando el frame → sin saltos raros.
  // 1) baja hasta las acciones rápidas; 2) toca «Al cole» y los carriles se
  // rellenan solos; 3) lo desactiva y vuelve a empezar. En bucle.
  //
  // El guion vive en un effect que solo depende de `autoplay`, así que lee la
  // acción y el toggle por ref para no congelar la primera versión.
  const quickActionsRef = useRef([]);
  const toggleQuickRef = useRef(null);
  const quickGridRef = useRef(null);
  useEffect(() => {
    if (!autoplay) return undefined;
    let cancelled = false;
    const timers = [];
    let rafId = 0;
    const wait = (ms) =>
      new Promise((res) => {
        const id = setTimeout(res, ms);
        timers.push(id);
      });
    // Scroll suave del body, con easing (el scroll nativo se ve a saltos dentro
    // del frame escalado). Solo hacia abajo durante el guion.
    const smoothScroll = (to, duration = 1000) =>
      new Promise((res) => {
        const el = scheduleBodyRef.current;
        if (!el) { res(); return; }
        const start = el.scrollTop;
        const delta = to - start;
        if (Math.abs(delta) < 1) { res(); return; }
        const t0 = performance.now();
        const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
        const tick = (now) => {
          if (cancelled) { res(); return; }
          const t = Math.min(1, (now - t0) / duration);
          el.scrollTop = start + delta * ease(t);
          if (t < 1) rafId = requestAnimationFrame(tick);
          else res();
        };
        rafId = requestAnimationFrame(tick);
      });
    const demoAction = () => {
      const list = quickActionsRef.current;
      return list.find((a) => a.id === "cole") ?? list[0] ?? null;
    };
    const run = async () => {
      while (!cancelled) {
        // Reinicio instantáneo al top (sin rebote animado hacia arriba).
        if (scheduleBodyRef.current) scheduleBodyRef.current.scrollTop = 0;
        const start = demoAction();
        if (start && start.status !== "off") toggleQuickRef.current?.(start);
        await wait(500); // 0,5s antes de empezar a bajar
        if (cancelled) return;
        const el = scheduleBodyRef.current;
        const grid = quickGridRef.current;
        // Deja la rejilla de acciones justo bajo el borde superior: así se ve
        // a la vez la tarjeta que se pulsa y los carriles que reacciona.
        const target = grid && el
          ? Math.min(grid.offsetTop - 12, el.scrollHeight - el.clientHeight)
          : (el ? el.scrollHeight - el.clientHeight : 0);
        await smoothScroll(target, 1000);
        if (cancelled) return;
        await wait(600);
        if (cancelled) return;
        const on = demoAction();
        if (on) toggleQuickRef.current?.(on); // enciende «Al cole»
        await wait(2000); // se ve el relleno escalonado de los carriles
        if (cancelled) return;
        const off = demoAction();
        if (off) toggleQuickRef.current?.(off); // y lo apaga
        await wait(900);
        if (cancelled) return;
      }
    };
    run();
    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
      timers.forEach(clearTimeout);
    };
  }, [autoplay]);

  // Multi-week menús: which selected week's "quién come dónde" is currently
  // being viewed/edited. Defaults to the earliest one (the base pattern).
  const weekOffsets = useMemo(() => {
    const raw = Array.isArray(data.menuWeekOffsets) && data.menuWeekOffsets.length
      ? data.menuWeekOffsets
      : [data.menuWeek?.offset ?? 0];
    return [...new Set(raw)].sort((a, b) => a - b);
  }, [data.menuWeekOffsets, data.menuWeek]);
  const sameForAllWeeks = data.menuScheduleSameForAllWeeks !== false;
  const [editingWeekOffset, setEditingWeekOffset] = useState(weekOffsets[0]);
  // Deselecting a week can leave this pointing at one that no longer exists;
  // falling back while rendering avoids the extra render an effect would cost.
  const editingWeek = weekOffsets.includes(editingWeekOffset) ? editingWeekOffset : weekOffsets[0];
  const baseOffset = weekOffsets[0];
  const viewingOffset = sameForAllWeeks ? baseOffset : editingWeek;
  const isEditingBaseWeek = viewingOffset === baseOffset;

  // Real calendar dates for the week being viewed — only the earliest
  // selected week can be partial (it starts today, not Monday); every other
  // week always shows all 7 days.
  const { dates: weekDates, activeDays } = useMemo(
    () => getWeekDatesByMenuWeek({
      offset: viewingOffset,
      startDayIdx: viewingOffset === baseOffset ? (data.menuWeek?.startDayIdx ?? 0) : 0,
    }),
    [viewingOffset, baseOffset, data.menuWeek],
  );

  // Solo hay algo que pasar si se han elegido varias semanas y cada una lleva
  // su propia configuración.
  const weekNav = useMemo(() => {
    if (sameForAllWeeks || weekOffsets.length <= 1) return null;
    const i = weekOffsets.indexOf(viewingOffset);
    return {
      index: i + 1,
      total: weekOffsets.length,
      label: formatWeekRangeLabel(weekDates, activeDays),
      modified: viewingOffset !== weekOffsets[0]
        && Boolean(data.menuWeekOverrides?.[viewingOffset]),
      onPrev: i > 0 ? () => setEditingWeekOffset(weekOffsets[i - 1]) : null,
      onNext: i < weekOffsets.length - 1 ? () => setEditingWeekOffset(weekOffsets[i + 1]) : null,
    };
  }, [sameForAllWeeks, weekOffsets, viewingOffset, weekDates, activeDays, data.menuWeekOverrides]);

  const effectiveSchedule = isEditingBaseWeek
    ? data.schedule
    : (data.menuWeekOverrides?.[viewingOffset] ?? data.schedule);

  const updateSchedule = (updater) => {
    setData((d) => {
      if (isEditingBaseWeek) {
        return { ...d, schedule: updater(d.schedule) };
      }
      const base = d.menuWeekOverrides?.[viewingOffset] ?? d.schedule;
      return { ...d, menuWeekOverrides: { ...(d.menuWeekOverrides ?? {}), [viewingOffset]: updater(base) } };
    });
  };

  const subjectMemberIds = useMemo(() => memberList.map((m) => m.id), [memberList]);
  const subjectMembers = memberList;
  const allowCole = memberList.some(
    (m) => stageForAge(memberAge(m)).id !== "adulto"
  );

  // Sheet state: { day, meal | null } — when meal is null, the sheet is in
  // "day mode" (only row-level actions, no per-member edition for a slot).
  const mainMeal = primaryDayMeal(data);

  const hasSchoolMenuLoaded = useMemo(() => {
    const sm = data.schoolMenus ?? { shared: {}, byMember: {} };
    if (hasAnySchoolDish(sm.shared)) return true;
    return Object.values(sm.byMember ?? {}).some((m) => hasAnySchoolDish(m));
  }, [data.schoolMenus]);

  const setSlots = (memberIds, day, meal, value) => {
    if (memberIds.length === 0) return;
    updateSchedule((prev) => {
      const next = { ...prev };
      for (const id of memberIds) {
        next[`${id}|${day}|${meal}`] = value;
      }
      return next;
    });
  };

  const setMemberSlot = (memberId, day, meal, value) => {
    updateSchedule((prev) => ({ ...prev, [`${memberId}|${day}|${meal}`]: value }));
  };

  // Lane view edits are binary: at home, or not. Which "not" gets stored is
  // resolved per slot by outStateFor, so the comedor label only appears where
  // a comedor could plausibly exist.
  const toggleLaneSlot = (member, day, meal) => {
    const cur = effectiveSchedule[`${member.id}|${day}|${meal}`];
    const next = isHomeState(cur) ? outStateFor(member, day, meal, data.schoolMenus) : "casa";
    setMemberSlot(member.id, day, meal, next);
  };

  // Tapping a lane's meal glyph is the "Leo come fuera, y ya está" gesture:
  // families describe a weekly habit, not seven separate days.
  const toggleLaneMemberMeal = (member, meal) => {
    const anyHome = DAYS.some((day) =>
      isHomeState(effectiveSchedule[`${member.id}|${day}|${meal}`])
    );
    updateSchedule((prev) => {
      const next = { ...prev };
      for (const day of DAYS) {
        next[`${member.id}|${day}|${meal}`] = anyHome
          ? outStateFor(member, day, meal, data.schoolMenus)
          : "casa";
      }
      return next;
    });
  };

  // Same idea on the column: one tap sends the whole family home for that day,
  // or out if they already all were.
  const toggleLaneDay = (day) => {
    const anyHome = subjectMembers.some((m) =>
      meals.some((meal) => isHomeState(effectiveSchedule[`${m.id}|${day}|${meal}`]))
    );
    updateSchedule((prev) => {
      const next = { ...prev };
      for (const m of subjectMembers) {
        for (const meal of meals) {
          next[`${m.id}|${day}|${meal}`] = anyHome
            ? outStateFor(m, day, meal, data.schoolMenus)
            : "casa";
        }
      }
      return next;
    });
  };

  const quickActions = useMemo(
    () => resolveQuickActions(subjectMembers, meals, effectiveSchedule),
    [subjectMembers, meals, effectiveSchedule],
  );

  // A card writes its own slots and nothing else, which is what makes it
  // reversible: turning it off restores "casa" on exactly the slots it claimed,
  // leaving anything you edited by hand elsewhere untouched. A half-applied
  // card completes on the first tap and clears on the second.
  const toggleQuickAction = (action) => {
    const turningOn = action.status !== "on";
    updateSchedule((prev) => {
      const next = { ...prev };
      for (const k of action.keys) next[k] = turningOn ? action.value : "casa";
      return next;
    });
    setFlashKeys(new Set(action.keys));
  };

  // El guion de la demo se monta una vez y vive fuera del render, así que lee
  // la versión actual por ref en lugar de congelar la del primer montaje.
  useEffect(() => {
    quickActionsRef.current = quickActions;
    toggleQuickRef.current = toggleQuickAction;
  });

  useEffect(() => {
    if (!flashKeys) return undefined;
    const id = setTimeout(() => setFlashKeys(null), 700);
    return () => clearTimeout(id);
  }, [flashKeys]);

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

  // Desayuno lives in data.extraMeals (optional, deterministic pool), NOT in
  // data.meals, so it never inflates the AI comida/cena budget. Turning it on
  // seeds the default "variado" variety; the variety picker lives in the meal-
  // styles step and only shows once desayuno is on here.
  const toggleDesayuno = () => {
    setData((d) => {
      const on = d.extraMeals?.desayuno && d.extraMeals.desayuno !== "off";
      return { ...d, extraMeals: { ...(d.extraMeals ?? {}), desayuno: on ? "off" : "variado" } };
    });
  };

  if (data.members.length === 0) {
    return (
      <OnboardingShell title="Planificación" onBack={onBack}>
        <p style={{ color: "#888" }}>Añade algún miembro primero.</p>
      </OnboardingShell>
    );
  }

  return (
    <OnboardingShell
      title="¿Dónde coméis?"
      subtitle="Marca dónde come cada uno durante la semana"
      onBack={onBack}
      onReset={onReset}
      onNext={onNext}
      onFinish={onFinish}
      bodyRef={scheduleBodyRef}
      heightOverride={demoHeight}
    >

      <div style={{ height: 1, background: "#d6e9dc", margin: "20px 0" }} />
      <SectionTitle>¿Qué comidas quieres organizar?</SectionTitle>
      <div style={{ display: "flex", gap: 8, marginBottom: 28 }}>
        {/* En modo básico solo comidas y cenas (sin desayuno). */}
        {(data.expertMode ? ALL_DAY_MEALS : ALL_DAY_MEALS.filter((m) => m !== "Desayuno")).map((meal) => {
          const isDesayuno = meal === "Desayuno";
          const sel = isDesayuno
            ? Boolean(data.extraMeals?.desayuno && data.extraMeals.desayuno !== "off")
            : meals.includes(meal);
          const MealIcon = meal === "Comida" ? Sun : meal === "Cena" ? Moon : Coffee;
          const tint = mealTimeColor(meal);
          return (
            <button
              key={meal}
              type="button"
              onClick={() => (isDesayuno ? toggleDesayuno() : toggleDayMeal(meal))}
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 7,
                padding: "14px 8px 12px",
                borderRadius: 14,
                cursor: "pointer",
                // Selección teñida con el color de la propia franja (ámbar para
                // Comida, azul noche para Cena): cada comida se enciende con su
                // identidad en vez del verde genérico.
                background: sel ? tint : "#f4f7f5",
                border: `1.5px solid ${sel ? tint : "#e3ebe6"}`,
                color: sel ? "#fff" : "#7a8a80",
                boxShadow: sel ? `0 6px 18px ${tint}55` : "none",
                transition: "all .15s ease",
                fontFamily: "inherit",
              }}
            >
              <span
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 11,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: sel ? "rgba(255,255,255,.22)" : `${tint}1f`,
                  color: sel ? "#fff" : tint,
                  transition: "all .15s ease",
                }}
              >
                <MealIcon size={19} strokeWidth={sel ? 2.4 : 2.2} />
              </span>
              <span style={{ fontSize: 12, fontWeight: 700 }}>{meal}</span>
            </button>
          );
        })}
      </div>

      {/* Estructura de plato: en modo básico se decide aquí mismo (una sola vez,
          para todos) en lugar de en una pantalla aparte. Solo tiene sentido si
          se organiza la comida. */}
      {!data.expertMode && meals.includes("Comida") && (
        <>
          <div style={{ height: 1, background: "#d6e9dc", margin: "0 0 20px" }} />
          <SectionTitle>¿Uno o dos platos en la comida?</SectionTitle>
          <div style={{ display: "flex", gap: 8, marginBottom: 28 }}>
            {MEAL_STRUCTURE_CARDS.map((t) => (
              <RestrictionTabCard
                key={t.id}
                img={t.img}
                title={t.title}
                subtitle={t.subtitle}
                imgHeight={160}
                textOverlay
                active={(data.mealStructure ?? "primero_segundo") === t.id}
                onClick={() => setData((d) => ({ ...d, mealStructure: t.id }))}
              />
            ))}
          </div>
        </>
      )}

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
        @keyframes laneFill {
          0%   { transform: scale(.55); opacity: .15; }
          65%  { transform: scale(1.1);  opacity: 1;   }
          100% { transform: scale(1);    opacity: 1;   }
        }
      `}</style>

      <div ref={quickGridRef}>
        {quickActions.length > 0 && <SectionTitle>Acciones rápidas</SectionTitle>}
        <QuickActionCards actions={quickActions} onToggle={toggleQuickAction} />
      </div>

      <ScheduleLanes
        members={subjectMembers}
        meals={meals}
        schedule={effectiveSchedule}
        activeDays={activeDays}
        dates={weekDates}
        schoolMenus={data.schoolMenus}
        flashKeys={flashKeys}
        weekNav={weekNav}
        onToggleSlot={toggleLaneSlot}
        onToggleMemberMeal={toggleLaneMemberMeal}
        onDayClick={toggleLaneDay}
      />
      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 7, marginBottom: 12, paddingRight: 2 }}>
        <SheetIconLegend columns={sheetColumns(allowCole)} compact tiny />
      </div>

      {/* "Aplicar la misma configuración a todas las semanas" toggle — only
          relevant once several weeks are selected for this menú. */}
      {weekOffsets.length > 1 && (
        <div
          style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "10px 14px", background: "#f7f9f7", borderRadius: 14, marginBottom: 16,
          }}
        >
          <span style={{ fontSize: 12.5, fontWeight: 700, color: "#142f1d", paddingRight: 10 }}>
            Misma configuración en todas las semanas
          </span>
          <ToggleSwitch
            checked={sameForAllWeeks}
            onChange={(v) => {
              setData((d) => ({
                ...d,
                menuScheduleSameForAllWeeks: v,
                ...(v ? { menuWeekOverrides: {} } : {}),
              }));
              if (v) setEditingWeekOffset(baseOffset);
            }}
          />
        </div>
      )}

      {sheetSlot && (
        <ScheduleSlotSheet
          day={sheetSlot.day}
          meal={sheetSlot.meal}
          members={subjectMembers}
          schedule={effectiveSchedule}
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

    </OnboardingShell>
  );
}

const SLOT_COLUMNS = ["casa", "cole", "fuera"];

function sheetColumns(showCole) {
  return showCole ? SLOT_COLUMNS : SLOT_COLUMNS.filter((s) => s !== "cole");
}

function SheetIconLegend({ columns, compact = false, tiny = false }) {
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
              fontSize: tiny ? 9 : 10,
              fontWeight: 600,
              color: tiny ? "#8b9b91" : "#666",
            }}
          >
            <span style={{ color: c, display: "inline-flex" }}>{stateIcon(s, tiny ? 11 : 12)}</span>
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

        {/* Todos row — avatar-style anchor (a "family" bubble with the label
            below) on the left, the state options on the right, matching the
            member rows so the whole sheet reads as one column of people. */}
        {members.length > 1 && (
          <div style={{ marginBottom: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 54, flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                <span style={{ width: 40, height: 40, borderRadius: "50%", background: "#e8f0ea", display: "inline-flex", alignItems: "center", justifyContent: "center", color: "#2d5a3d" }}>
                  <Users size={19} />
                </span>
                <span style={{ fontSize: 11, fontWeight: 800, color: "#1a3a24", textAlign: "center" }}>Todos</span>
            </div>
              <div style={{ display: "flex", gap: 8, flex: 1 }}>
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
            </div>
            <div style={{ height: 1, background: "#e8f0ea", margin: "14px 0 0" }} />
          </div>
        )}

        {/* Member rows — avatar (real photo) with the name below on the left,
            the state options on the right. */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {members.map((m) => {
            const raw = schedule[`${m.id}|${day}|${meal}`] ?? "casa";
            const cur = raw === "off" ? "casa" : raw;
            const kid = stageForAge(memberAge(m)).id !== "adulto";
            return (
              <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 54, flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                  <Avatar name={m.name} size={40} photo={memberAvatarThumbSrc(m)} color={memberAvatarColor(m.id, members)} />
                  <span style={{ fontSize: 11, fontWeight: 700, color: "#1a3a24", maxWidth: 54, textAlign: "center", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {m.name}
                  </span>
                </div>
                <div style={{ display: "flex", gap: 8, flex: 1 }}>
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

function SectionTitle({ children, img, Icon, color }) {
  const ink = color ?? "#1a3a24";
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        marginBottom: 8,
      }}
    >
      {(img || Icon) && (
        <span
          style={{
            width: 28,
            height: 28,
            borderRadius: 8,
            background: color ? `${color}22` : "#eef4f0",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            overflow: "hidden",
            flexShrink: 0,
          }}
        >
          {img ? (
            <img src={img} alt="" style={{ width: "84%", height: "84%", objectFit: "contain" }} />
          ) : (
            <Icon size={15} color={ink} strokeWidth={2.4} />
          )}
        </span>
      )}
    <div
      style={{
        fontSize: 11,
        fontWeight: 800,
          color: ink,
        textTransform: "uppercase",
        letterSpacing: 1,
      }}
    >
      {children}
      </div>
    </div>
  );
}

function PostreInmediatoPicker({ value, onChange }) {
  return (
    <div style={{ display: "flex", gap: 8 }}>
      {POSTRE_INMEDIATO_KINDS.map((k) => {
        const sel = value === k.id;
        return (
          <button
            key={k.id}
            type="button"
            onClick={() => onChange(k.id)}
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "stretch",
              padding: 0,
              overflow: "hidden",
              borderRadius: 14,
              border: `2px solid ${sel ? "#2d5a3d" : "#e0eae3"}`,
              background: sel ? "#2d5a3d" : "#fff",
              cursor: "pointer",
              fontFamily: "inherit",
              boxShadow: sel ? "0 6px 18px rgba(45,90,61,.18)" : "0 1px 2px rgba(0,0,0,.04)",
            }}
          >
            <div
              style={{
                height: 52,
                background: "#f4f7f5",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {k.img ? (
                <img src={k.img} alt="" style={{ width: 40, height: 40, objectFit: "contain" }} />
              ) : (
                <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
                  <img src="/categories/cut/frutas.png" alt="" style={{ width: 28, height: 28, objectFit: "contain" }} />
                  <span style={{ fontWeight: 800, fontSize: 13, color: "#2d5a3d", lineHeight: 1 }}>+</span>
                  <img src="/ingredients/yogur-cut.png" alt="" style={{ width: 26, height: 26, objectFit: "contain" }} />
                </span>
              )}
            </div>
            <div
              style={{
                flex: 1,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "6px 4px 7px",
                background: sel ? "#2d5a3d" : "#fff",
                color: sel ? "#fff" : "#142f1d",
                textAlign: "center",
                fontWeight: 800,
                fontSize: 11.5,
                borderTop: sel ? "none" : "1px solid #eef2f0",
              }}
            >
              {k.label}
            </div>
          </button>
        );
      })}
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

  // "Come fuera" is confusing at dinner, so the "fuera" label follows the meal:
  // Cena → "Cena fuera", Desayuno → "Desayuna fuera", Comida → "Come fuera".
  const slotLabel = (value, meal) => {
    if (value === "fuera") {
      return meal === "Cena" ? "Cena fuera" : meal === "Desayuno" ? "Desayuna fuera" : "Come fuera";
    }
    return SLOT_CONFIG[value]?.label ?? "En casa";
  };

  // Consensus of every member for a meal (null when they diverge), so the
  // "Todos" row can show a single state and toggle everyone at once.
  const mealConsensus = (meal) => {
    if (members.length === 0) return "casa";
    const vals = members.map((m) => {
      const raw = schedule[`${m.id}|${day}|${meal}`] ?? "casa";
      return raw === "off" ? "casa" : raw;
    });
    return vals.every((v) => v === vals[0]) ? vals[0] : null;
  };

  // One tap sets the whole family for that meal — casa ⇄ fuera (never "cole",
  // which only makes sense per kid). Mixed states reset to "casa" first.
  const toggleAllForMeal = (meal) => {
    const next = mealConsensus(meal) === "fuera" ? "casa" : "fuera";
    members.forEach((m) => onSetMemberSlot(m.id, day, meal, next));
  };

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

          {/* "Todos" row — set the whole family for a meal in one tap instead of
              editing each person cell by cell. */}
          {members.length > 1 && (
            <>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: `100px repeat(${meals.length}, 1fr)`,
                  gap: 8, marginBottom: 10,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "0 4px" }}>
                  <span
                    style={{
                      width: 28, height: 28, borderRadius: "50%", background: "#e8f0ea",
                      display: "inline-flex", alignItems: "center", justifyContent: "center",
                      color: "#2d5a3d", flexShrink: 0,
                    }}
                  >
                    <Users size={15} />
                  </span>
                  <span style={{ fontSize: 12, fontWeight: 900, color: "#1a3a24" }}>Todos</span>
                </div>

                {meals.map((meal) => {
                  const c = mealConsensus(meal);
                  const mixed = c === null;
                  const conf = SLOT_CONFIG[c] ?? SLOT_CONFIG.casa;
                  return (
                    <button
                      key={meal}
                      type="button"
                      onClick={() => toggleAllForMeal(meal)}
                      style={{
                        height: 56, borderRadius: 16,
                        border: mixed ? "2px dashed #cbd8cf" : "none",
                        background: mixed ? "#f4f7f5" : conf.color,
                        color: mixed ? "#9ab0a1" : "#fff",
                        boxShadow: mixed ? "none" : `0 4px 14px ${conf.color}55`,
                        display: "flex", flexDirection: "column",
                        alignItems: "center", justifyContent: "center",
                        gap: 4, cursor: "pointer", fontFamily: "inherit",
                        transition: "background .15s ease, box-shadow .15s ease",
                      }}
                    >
                      {mixed ? <Users size={18} /> : stateIcon(c, 18)}
                      <span style={{ fontSize: 10, fontWeight: 800 }}>
                        {mixed ? "Varios" : slotLabel(c, meal)}
                      </span>
                    </button>
                  );
                })}
              </div>
              <div style={{ height: 1, background: "#e8f0ea", margin: "0 2px 12px" }} />
            </>
          )}

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
                      {slotLabel(value, meal)}
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

function ScheduleGrid({ meals, memberIds, schedule, onCellClick, onDayClick, activeDays = DAYS, dates = null }) {
  // Renders one row per meal. For groups, each cell shows the consensus, or a
  // dot stack of every member's state when they diverge. Clicking a consensus
  // cell cycles; clicking a divergent cell opens the slot editor.
  // Always shows all 7 days (fixed layout across every week of a menú); days
  // that don't apply to the week currently being viewed (a partial first
  // week starting mid-week) are just dimmed — not hidden, since the same
  // pattern still governs every other, full week.
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
          const isActive = activeDays.includes(d);
          const dayNum = dates ? calendarDayNumber(d, dates) : null;
          return (
            <button
              key={d}
              type="button"
              onClick={onDayClick ? () => onDayClick(d) : undefined}
              title={onDayClick ? `Igualar todo el ${d}` : undefined}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 2,
                padding: "0 0 6px",
                background: "transparent",
                border: "none",
                cursor: onDayClick ? "pointer" : "default",
                fontFamily: "inherit",
                opacity: isActive ? 1 : 0.38,
                transition: "opacity .15s ease",
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
              {dayNum != null && (
                <span style={{ fontSize: 9, fontWeight: 700, color: "#9ab0a1" }}>{dayNum}</span>
              )}
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
              <span style={{ color: mealTimeColor(meal), display: "inline-flex" }}>
                {meal === "Desayuno" ? (
                  <Coffee size={15} strokeWidth={2.4} />
                ) : meal === "Comida" ? (
                  <Sun size={15} strokeWidth={2.4} />
                ) : (
                  <Moon size={15} strokeWidth={2.4} />
                )}
              </span>
            </div>
            {DAYS.map((day) => {
              const isActive = activeDays.includes(day);
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
                <div key={`${day}-${meal}`} style={{ opacity: isActive ? 1 : 0.38, transition: "opacity .15s ease" }}>
                  <ScheduleCell
                    value={value}
                    states={value === "mixed" ? memberStates : undefined}
                    onClick={() => onCellClick(day, meal)}
                    size={16}
                  />
                </div>
              );
            })}
          </Fragment>
        ))}
      </div>
    </div>
  );
}

/**
 * The 2x2 board of habits above the lanes.
 *
 * Each card carries the faces of the people it would actually move, so the rule
 * reads as "these three, to the school canteen" rather than as an abstract
 * setting — and a household with no children simply never sees that card.
 */
function QuickActionCards({ actions, onToggle }) {
  const railRef = useRef(null);

  // Abanico: las dos del centro rectas y las de los lados caídas hacia fuera.
  // El transform se escribe directamente en el DOM en cada frame de scroll —
  // pasarlo por estado repintaría cuatro tarjetas con ilustración sesenta veces
  // por segundo para animar tres grados.
  useLayoutEffect(() => {
    const rail = railRef.current;
    if (!rail) return undefined;
    let raf = 0;
    const paint = () => {
      raf = 0;
      const cards = [...rail.children];
      const mid = rail.scrollLeft + rail.clientWidth / 2;
      // Distancia al eje en anchos de tarjeta, con signo.
      const dist = cards.map((el) => (el.offsetLeft + el.offsetWidth / 2 - mid) / el.offsetWidth);
      // Las dos más cercanas al eje quedan rectas, y el resto cae en
      // proporción. Por ranking y no por un umbral fijo: así sigue saliendo
      // una pareja recta con tres tarjetas, o si cambia el ancho del móvil.
      const dead = [...dist].map(Math.abs).sort((a, b) => a - b)[1] ?? 0;
      cards.forEach((el, i) => {
        const d = dist[i];
        const t = Math.sign(d) * Math.min(1.2, Math.max(0, Math.abs(d) - dead));
        el.style.transform =
          `translateY(${Math.abs(t) * 10}px) rotate(${t * 5}deg) scale(${1 - Math.abs(t) * 0.05})`;
        // Las centrales por delante de las caídas. Nunca negativo: un z-index
        // por debajo de cero las mete detrás del fondo del panel y desaparecen.
        el.style.zIndex = t === 0 ? "2" : "1";
      });
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(paint); };
    // Arranca centrado en las dos del medio, que es donde vive el abanico.
    rail.scrollLeft = (rail.scrollWidth - rail.clientWidth) / 2;
    paint();
    // Las ilustraciones pueden cambiar el layout al cargar, así que se repinta
    // en el siguiente frame y ante cualquier reflow del carril.
    const raf2 = requestAnimationFrame(paint);
    const ro = new ResizeObserver(onScroll);
    ro.observe(rail);
    rail.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      rail.removeEventListener("scroll", onScroll);
      ro.disconnect();
      cancelAnimationFrame(raf);
      cancelAnimationFrame(raf2);
    };
  }, [actions.length]);

  if (actions.length === 0) return null;
  return (
    <div
      ref={railRef}
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 10,
        overflowX: "auto",
        // Sin scroll-snap: engancharía UNA tarjeta al eje y rompería la pareja
        // central que sostiene el abanico.
        // Sangra hasta el borde de la pantalla (el shell mete 20px) para que las
        // tarjetas de los lados asomen de verdad y se lea como carrusel.
        marginInline: -20,
        paddingInline: 20,
        // Hueco para la caída y la sombra de las inclinadas.
        paddingBottom: 12,
        marginBottom: 8,
        scrollbarWidth: "none",
      }}
    >
      {actions.map((a) => {
        const on = a.status === "on";
        const partial = a.status === "partial";
        const accent = SLOT_CONFIG[a.value]?.color ?? SLOT_CONFIG.fuera.color;
        return (
          <button
            key={a.id}
            type="button"
            onClick={() => onToggle(a)}
            aria-pressed={on}
            title={`${a.label} — ${a.faces.map((f) => f.name).join(", ")}`}
            style={{
              position: "relative",
              // Dos protagonistas en el centro y las vecinas asomando por los
              // lados: se ve que hay más sin abrir un scroll invisible.
              flex: "0 0 40%",
              transformOrigin: "center top",
              display: "block",
              padding: 0,
              overflow: "hidden",
              textAlign: "left",
              borderRadius: 16,
              background: "#fff",
              border: `2px solid ${on ? accent : partial ? "#cfe0d5" : "#e8efe9"}`,
              borderStyle: partial ? "dashed" : "solid",
              boxShadow: on ? `0 4px 14px ${accent}33` : "0 1px 3px rgba(0,0,0,.05)",
              cursor: "pointer",
              fontFamily: "inherit",
              transition: "border-color .16s ease, box-shadow .16s ease",
            }}
          >
            <div style={{ position: "relative", height: 84, background: "#fdfcfa" }}>
              <img
                src={a.img}
                alt=""
                style={{
                  width: "100%", height: "100%", objectFit: "cover", objectPosition: a.focus,
                  display: "block",
                  // Off cards stay legible but visibly dormant, so the board
                  // reads as a set of switches rather than four illustrations.
                  filter: on ? "none" : "saturate(.55) opacity(.72)",
                  transition: "filter .16s ease",
                }}
              />
              <div style={{ position: "absolute", left: 6, top: 6, display: "flex" }}>
                {a.faces.slice(0, 2).map((f, i) => (
                  <span
                    key={f.id}
                    style={{
                      marginLeft: i === 0 ? 0 : -7,
                      display: "inline-flex", borderRadius: "50%",
                      border: "2px solid #fff", background: "#fff",
                    }}
                  >
                    <Avatar name={f.name} photo={f.src} size={18} color={f.color} />
                  </span>
                ))}
                {a.faces.length > 2 && (
                  <span
                    style={{
                      marginLeft: -7, width: 20, height: 20, borderRadius: "50%",
                      background: "#2d5a3d", color: "#fff", border: "2px solid #fff",
                      fontSize: 8.5, fontWeight: 800,
                      display: "inline-flex", alignItems: "center", justifyContent: "center",
                    }}
                  >
                    +{a.faces.length - 2}
                  </span>
                )}
              </div>
              {on && (
                <span
                  style={{
                    position: "absolute", top: 6, right: 6,
                    width: 19, height: 19, borderRadius: "50%",
                    background: accent, border: "2px solid #fff",
                    display: "inline-flex", alignItems: "center", justifyContent: "center",
                  }}
                >
                  <Check size={10} color="#fff" strokeWidth={3.5} />
                </span>
              )}
            </div>
            <div style={{ padding: "6px 8px 7px" }}>
              <div
                style={{
                  fontSize: 10, fontWeight: 800, lineHeight: 1.3,
                  color: on ? accent : "#1a3a24",
                }}
              >
                {a.label}
              </div>
              {partial && (
                <div style={{ fontSize: 9, fontWeight: 700, color: "#9ab0a1", marginTop: 2 }}>
                  A medias · toca para completar
                </div>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}

/**
 * The week, transposed: one lane per person instead of one cell per slot.
 *
 * The classic grid collapses the household into a consensus per slot and gives
 * up ("Mix") the moment people diverge — so the one thing this step is actually
 * asking, *who* eats at home, is the one thing it can't show. Seven columns on
 * a phone leave ~40px each, which is why: a face never fits. Putting people on
 * the rows fixes that, and the meals become two thin bars inside each day
 * rather than a mode you have to toggle between.
 *
 * Editing is binary — at home or not — because the planner never distinguished
 * `cole` from `fuera` anyway; the stored label is resolved by `outStateFor`.
 */
/**
 * Paso de semana en miniatura para la esquina de la cabecera de los carriles.
 * Sustituye a la botonera de rangos a todo lo ancho: dentro de una tabla que ya
 * pide siete columnas, saber en cuál de las semanas estás es una nota al pie,
 * no un control principal. El rango de fechas se conserva en el `title`.
 */
function WeekStepper({ index, total, label, modified, onPrev, onNext }) {
  const step = (Icon, onClick) => (
    <button
      type="button"
      onClick={onClick ?? undefined}
      disabled={!onClick}
      style={{
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        width: 13, height: 13, padding: 0, border: "none", borderRadius: 999,
        background: "none", color: onClick ? "#5c6b60" : "#cbd8cf",
        cursor: onClick ? "pointer" : "default", fontFamily: "inherit",
      }}
    >
      <Icon size={11} strokeWidth={2.6} />
    </button>
  );
  return (
    <span
      title={label}
      style={{
        display: "inline-flex", alignItems: "center", gap: 1,
        background: "#f0f4f1", borderRadius: 999, padding: "2px 3px",
      }}
    >
      {step(ChevronLeft, onPrev)}
      <span style={{ fontSize: 8.5, fontWeight: 800, color: "#5c6b60", whiteSpace: "nowrap" }}>
        {index} de {total}
      </span>
      {/* La botonera anterior marcaba de un vistazo qué semanas tenían horario
          propio. Con un paso solo se puede decir de la actual, pero perder eso
          del todo dejaría al usuario editando una semana retocada sin saberlo. */}
      {modified && (
        <span style={{ width: 4, height: 4, borderRadius: 999, background: "#4cba6e", flexShrink: 0 }} />
      )}
      {step(ChevronRight, onNext)}
    </span>
  );
}

function ScheduleLanes({
  members,
  meals,
  schedule,
  activeDays,
  dates,
  schoolMenus,
  flashKeys,
  weekNav,
  onToggleSlot,
  onToggleMemberMeal,
  onDayClick,
}) {
  const mealGlyph = (meal, size = 11) =>
    meal === "Desayuno" ? <Coffee size={size} strokeWidth={2.6} /> :
    meal === "Comida"   ? <Sun size={size} strokeWidth={2.6} />    :
                          <Moon size={size} strokeWidth={2.6} />;

  // Nombre bajo la cara en vez de al lado: el carril gana 34px de ancho, que es
  // media columna de día, y los nombres largos dejan de recortarse.
  //
  // Los siete días no son columnas de esta rejilla sino una rejilla anidada
  // dentro de la tercera columna. Es lo que permite dibujar la banda de "en
  // casa" como una superficie continua por debajo: si los días fueran columnas
  // hermanas, los 3px de separación partirían el verde en siete trozos. La
  // cabecera usa la misma anidación para que día y celda sigan alineados.
  const gridCols = "48px 18px minmax(0, 1fr)";
  const dayCols = "repeat(7, minmax(0, 1fr))";

  // Qué columna es hoy. La semana en curso arranca en el día de hoy, así que
  // sin marcarlo el salto entre los días apagados y los vivos parece un error
  // de pintado en vez del punto donde empieza lo que aún puedes decidir.
  const todayKey = useMemo(() => {
    if (!dates) return null;
    const now = new Date();
    return DAYS.find((d) => {
      const dt = dates[d];
      return dt
        && dt.getFullYear() === now.getFullYear()
        && dt.getMonth() === now.getMonth()
        && dt.getDate() === now.getDate();
    }) ?? null;
  }, [dates]);

  return (
    <div style={{ background: "#fff", border: "1px solid #e8efe9", borderRadius: 18, padding: "10px 10px 6px" }}>
      {/* Day header */}
      <div style={{ display: "grid", gridTemplateColumns: gridCols, gap: 3, marginBottom: 9 }}>
        {/* Hueco izquierdo (avatar + nombre): el selector de semana vive aquí */}
        <div style={{ gridColumn: "span 2", display: "flex", alignItems: "center", justifyContent: "flex-start", paddingLeft: 2 }}>
          {weekNav && <WeekStepper {...weekNav} />}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: dayCols }}>
        {DAYS.map((d) => {
          const wknd = d === "Sáb" || d === "Dom";
          return (
            <button
              key={d}
              type="button"
              onClick={onDayClick ? () => onDayClick(d) : undefined}
              title={onDayClick ? `Igualar todo el ${d}` : undefined}
              style={{
                display: "flex", flexDirection: "column", alignItems: "center", gap: 1,
                background: "none", border: "none", padding: "0 0 2px", cursor: onDayClick ? "pointer" : "default",
                fontFamily: "inherit",
                opacity: activeDays.includes(d) ? 1 : 0.38,
              }}
            >
              <span
                style={{
                  fontSize: 9.5, fontWeight: 800, letterSpacing: .2,
                  color: wknd ? "#2d5a3d" : "#7d8f84",
                }}
              >
                {d.slice(0, 2)}
              </span>
              {dates && (
                <span
                  style={{
                    minWidth: 19, height: 19, borderRadius: 999,
                    display: "inline-flex", alignItems: "center", justifyContent: "center",
                    // El número era más claro que el nombre del día y la
                    // cabecera entera se leía como una marca de agua. Manda el
                    // número, que es lo que la gente busca para situarse.
                    background: d === todayKey ? "#2d5a3d" : "transparent",
                    color: d === todayKey ? "#fff" : "#1a3a24",
                    fontSize: 11.5, fontWeight: 800,
                  }}
                >
                  {calendarDayNumber(d, dates)}
                </span>
              )}
            </button>
          );
        })}
        </div>
      </div>

      {members.map((m, mi) => {
        const color = memberAvatarColor(m.id, members);
        const firstName = (m.name ?? "").trim().split(/\s+/)[0] || m.name;
        return (
          <div
            key={m.id}
            style={{
              display: "grid",
              gridTemplateColumns: gridCols,
              gap: 3,
              alignItems: "center",
              padding: "6px 0",
              borderTop: mi === 0 ? "none" : "1px solid #f0f5f2",
            }}
          >
            {/* Lane header spans this member's meal sub-rows */}
            <div
              style={{
                gridRow: `span ${meals.length}`,
                display: "flex", flexDirection: "column", alignItems: "center",
                gap: 2, minWidth: 0,
              }}
            >
              <Avatar name={m.name} photo={memberAvatarThumbSrc(m)} size={30} color={color} />
              <span
                style={{
                  fontSize: 9.5, fontWeight: 800, color: "#1a3a24", maxWidth: "100%",
                  whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                }}
              >
                {firstName}
              </span>
            </div>

            {meals.map((meal) => (
              <Fragment key={meal}>
                <button
                  type="button"
                  onClick={() => onToggleMemberMeal(m, meal)}
                  title={`${meal} de ${firstName} — toda la semana`}
                  style={{
                    display: "inline-flex", alignItems: "center", justifyContent: "center",
                    background: "none", border: "none", padding: 0, cursor: "pointer",
                    color: mealTimeColor(meal),
                  }}
                >
                  {mealGlyph(meal)}
                </button>
                <div style={{ position: "relative" }}>
                  {/* La casa no se dibuja celda a celda: es el campo sobre el
                      que ocurre todo lo demás. Antes era el hueco entre
                      excepciones y una semana normal —casi todo el mundo come
                      en casa casi siempre— se veía como una tabla a medio
                      rellenar en vez de como una semana resuelta. Los días ya
                      pasados atenúan su tramo, por eso son siete y no uno. */}
                  <div
                    style={{
                      position: "absolute", inset: 0, display: "grid",
                      gridTemplateColumns: dayCols, borderRadius: 7, overflow: "hidden",
                    }}
                  >
                    {DAYS.map((day, di) => (
                      <div
                        key={day}
                        style={{
                          background: HOME_BAND,
                          opacity: activeDays.includes(day) ? 1 : 0.35,
                          // Una línea de nada en cada frontera. La banda seguida
                          // resolvía el vacío pero se leía como un fondo, no como
                          // algo que se toca; los cortes devuelven la idea de
                          // siete casillas sin volver a partir el verde.
                          borderRight: di === DAYS.length - 1
                            ? "none"
                            : "1px solid rgba(45,90,61,.09)",
                        }}
                      />
                    ))}
                  </div>
                  <div style={{ position: "relative", display: "grid", gridTemplateColumns: dayCols }}>
                    {DAYS.map((day, di) => {
                      const key = `${m.id}|${day}|${meal}`;
                      const raw = schedule[key] ?? "casa";
                      const home = isHomeState(raw);
                      const out = home ? outStateFor(m, day, meal, schoolMenus) : raw;
                      const c = SLOT_CONFIG[out]?.color ?? SLOT_CONFIG.fuera.color;
                      const dayActive = activeDays.includes(day);
                      // Cells written by a quick action pop in one after
                      // another, so tapping a card reads as cause and effect
                      // instead of the grid silently changing under you.
                      const flash = flashKeys?.has(key);
                      return (
                        <button
                          key={day}
                          type="button"
                          onClick={() => onToggleSlot(m, day, meal)}
                          title={`${firstName} · ${meal} ${day} — ${home ? "en casa" : SLOT_CONFIG[out]?.label}`}
                          aria-pressed={home}
                          style={{
                            height: 22,
                            // Los 1.5px dejan asomar la banda alrededor de cada
                            // ficha: es lo que hace que se lea como algo puesto
                            // encima del verde y no como un trozo que falta.
                            margin: "0 1.5px",
                            borderRadius: 7,
                            border: "none",
                            padding: 0,
                            cursor: "pointer",
                            background: home ? "transparent" : c,
                            color: "#fff",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            opacity: dayActive ? 1 : 0.35,
                            transition: "background .14s ease",
                            animation: flash ? "laneFill .34s ease-out both" : "none",
                            animationDelay: flash ? `${di * 45}ms` : undefined,
                          }}
                        >
                          {!home && stateIcon(out, 11)}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </Fragment>
            ))}
          </div>
        );
      })}

      {/* Con las tarjetas de acciones rápidas arriba, la rejilla se lee como el
          resultado de lo que pulsas ahí y no como algo editable por su cuenta.
          Los cortes de la banda insinúan las casillas; esto lo dice. */}
      <div
        style={{
          paddingTop: 7, textAlign: "center",
          fontSize: 9.5, fontWeight: 600, fontStyle: "italic", color: "#9ab0a1",
        }}
      >
        Toca una casilla para cambiar un día suelto
      </div>
    </div>
  );
}

// ─── School menu ───────────────────────────────────────────────

// Value-prop carousel only (see `demoScript` below) — a plausible comedor
// menu the fake "AI parse" fills in once it "finishes".
const DEMO_SCHOOL_ENTRIES = {
  "Lun-Primero": "Crema de calabacín",
  "Lun-Segundo": "Merluza a la plancha",
  "Lun-Postre": "Fruta de temporada",
  "Mar-Primero": "Lentejas estofadas",
  "Mar-Segundo": "Tortilla de patatas",
  "Mar-Postre": "Yogur natural",
  "Mié-Primero": "Ensalada de pasta",
  "Mié-Segundo": "Pollo al horno",
  "Mié-Postre": "Fruta de temporada",
  "Jue-Primero": "Puré de verduras",
  "Jue-Segundo": "Albóndigas en salsa",
  "Jue-Postre": "Macedonia",
  "Vie-Primero": "Arroz tres delicias",
  "Vie-Segundo": "Merluza rebozada",
  "Vie-Postre": "Yogur natural",
};

// Same card language as "¿Cómo coméis en casa?" — both screens ask the same
// kind of question (one menú for everyone, or one each), so they shouldn't look
// like two different controls.
const SCHOOL_SCOPE_CARDS = [
  {
    value: "shared",
    img: "/avatares/cards/mismo_menu_ninos.png",
    label: "Mismo menú para todos",
    desc: "Todos comen lo mismo en el comedor",
  },
  {
    value: "individual",
    img: "/avatares/cards/distinto_menu_ninos.png",
    label: "Por niño/a",
    desc: "Cada uno con el menú de su cole",
  },
];

// Turn a parser week label ("Semana 1 (1 Jun)") into a title + a Mon–Fri date
// range for the multi-select. School weeks run Lun–Vie, so the end date is the
// start + 4 days. Falls back gracefully when the label has no parseable date.
const ES_MONTHS = {
  ene: 0, enero: 0, feb: 1, febrero: 1, mar: 2, marzo: 2, abr: 3, abril: 3,
  may: 4, mayo: 4, jun: 5, junio: 5, jul: 6, julio: 6, ago: 7, agosto: 7,
  sep: 8, sept: 8, set: 8, setiembre: 8, septiembre: 8, oct: 9, octubre: 9,
  nov: 10, noviembre: 10, dic: 11, diciembre: 11,
};
const ES_MONTH_SHORT = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

function parseSpanishDate(str) {
  const tokens = String(str ?? "").toLowerCase().replace(/\./g, "").split(/[\s/-]+/).filter(Boolean);
  let day = null;
  let month = null;
  for (const t of tokens) {
    if (/^\d{1,2}$/.test(t)) {
      if (day == null) day = Number(t);
    } else if (ES_MONTHS[t] != null && month == null) {
      month = ES_MONTHS[t];
    }
  }
  if (day == null || month == null) return null;
  return { day, month };
}

function weekChipLabel(weekLabel, i) {
  const raw = String(weekLabel ?? "").trim();
  const m = raw.match(/^(.*?)\s*\(([^)]*)\)\s*$/);
  const title = (m ? m[1] : raw).trim() || `Semana ${i + 1}`;
  const start = parseSpanishDate(m ? m[2] : "");
  if (!start) return { title, range: null };
  const year = new Date().getFullYear();
  const startDate = new Date(year, start.month, start.day);
  const endDate = new Date(year, start.month, start.day + 4);
  const sameMonth = startDate.getMonth() === endDate.getMonth();
  const range = sameMonth
    ? `${startDate.getDate()}–${endDate.getDate()} ${ES_MONTH_SHORT[endDate.getMonth()]}`
    : `${startDate.getDate()} ${ES_MONTH_SHORT[startDate.getMonth()]} – ${endDate.getDate()} ${ES_MONTH_SHORT[endDate.getMonth()]}`;
  return { title, range };
}

function weekPagerArrow(disabled) {
  return {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: 30,
    height: 30,
    borderRadius: 999,
    border: "1px solid #e6eee8",
    background: disabled ? "#f7f9f7" : "#fff",
    color: disabled ? "#c3cdc6" : "#2d5a3d",
    cursor: disabled ? "default" : "pointer",
    fontFamily: "inherit",
    padding: 0,
    flexShrink: 0,
  };
}

function schoolToolBtn(danger) {
  return {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: 36,
    height: 36,
    borderRadius: 10,
    border: `1.5px solid ${danger ? "#f0d5cf" : "#d7e5dc"}`,
    background: danger ? "#fdf3f0" : "#fff",
    color: danger ? "#c0492e" : "#2d5a3d",
    cursor: "pointer",
    fontFamily: "inherit",
    padding: 0,
    flexShrink: 0,
  };
}

export function OnboardingSchoolMenu({ data, setData, onNext, onBack, onFinish, onReset, demoScript = false }) {
  const schoolKids = data.members.filter((m) => tierForMember(m) === "child");
  const [scope, setScope] = useState("shared");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [activeKidId, setActiveKidId] = useState(schoolKids[0]?.id ?? null);
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [importStatus, setImportStatus] = useState("");
  const [importError, setImportError] = useState(null);
  const [importedFileName, setImportedFileName] = useState("");
  const [parsedWeeks, setParsedWeeks] = useState([]);
  // Multi-select of detected weeks (indices into parsedWeeks) and which stored
  // week the review deck is currently showing.
  const [selectedWeekIdxs, setSelectedWeekIdxs] = useState(() => new Set());
  const [viewPos, setViewPos] = useState(0);
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

  // Auto-set schedule to "cole" for school days when a menu is uploaded.
  //
  // Only on an actual *change* to the menu, never on mount: the schedule step
  // lets you say "el martes se lo salta y come en casa", and this effect would
  // otherwise stomp that back to "cole" every time you walked back through this
  // screen. Re-uploading a menu still re-claims the days, which is what someone
  // changing their menu means.
  const lastSyncedMenus = useRef(null);
  useEffect(() => {
    const prev = lastSyncedMenus.current;
    lastSyncedMenus.current = data.schoolMenus;
    if (prev === null) return;
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

  // ─── Multi-week derivation ──────────────────────────────────────────────
  // The stored menú can now hold several weeks; the review deck shows one at a
  // time. `scopeWeekIndices` are the global week indices that actually carry
  // dishes for the active scope/member, so the week switcher only offers real
  // weeks and edits always target the right one.
  const entryHas = (map) => Boolean(map && Object.keys(map).some((k) => String(map[k] ?? "").trim()));
  const smNorm = useMemo(() => normalizeSchoolMenus(data.schoolMenus), [data.schoolMenus]);
  const scopeWeekIndices = useMemo(() => {
    const out = [];
    smNorm.weeks.forEach((w, i) => {
      const has = scope === "shared" ? entryHas(w.shared) : entryHas(w.byMember?.[activeKidId]);
      if (has) out.push(i);
    });
    return out;
  }, [smNorm, scope, activeKidId]); // eslint-disable-line react-hooks/exhaustive-deps
  const weekCount = scopeWeekIndices.length;
  const hasAnyDish = weekCount > 0;

  useEffect(() => {
    if (viewPos > Math.max(0, weekCount - 1)) setViewPos(0);
  }, [weekCount, viewPos]);

  const globalWeekIndex = scopeWeekIndices[viewPos] ?? scopeWeekIndices[0] ?? 0;
  const weekObj = smNorm.weeks[globalWeekIndex] ?? smNorm.weeks[0];
  const entries = scope === "shared" ? weekObj.shared : (weekObj.byMember?.[activeKidId] ?? {});
  // Pre-computed catalog IDs from the parse step, keyed same as entries.
  const weekCatalogIds = weekObj.catalogIds ?? {};

  // Manual category overrides for the visible week/scope, keyed "Day-Course".
  const iconOverrides = useMemo(() => {
    const out = {};
    for (const day of SCHOOL_DAYS) {
      for (const course of SCHOOL_COURSES) {
        const v = getSchoolIconOverride(data.schoolMenus, { weekIndex: globalWeekIndex, scope, kidId: activeKidId, day, course });
        if (v) out[`${day}-${course}`] = v;
      }
    }
    return out;
  }, [data.schoolMenus, globalWeekIndex, scope, activeKidId]);

  // Replace the whole stored menú for the active scope with a single week (used
  // by the error fallback and the value-prop demo). The multi-week path goes
  // through `applyWeekSelection` below.
  const replaceDishes = (next) => {
    setData((d) => ({
      ...d,
      schoolMenus: replaceSchoolWeeks(d.schoolMenus, {
        scope,
        kidId: activeKidId,
        weeksEntries: [next],
      }),
    }));
  };

  // Store exactly the detected weeks the user has ticked, in order, for the
  // active scope. Empty selection clears the scope (the way to "not use" a menú
  // is to simply untick every week).
  const applyWeekSelection = (idxSet, weeksSource = parsedWeeks) => {
    const ordered = [...idxSet].sort((a, b) => a - b);
    const weeksEntries = ordered.map((i) => weeksSource[i]?.entries ?? {});
    const weeksCatalogIds = ordered.map((i) => weeksSource[i]?.catalogIds ?? {});
    setData((d) => ({
      ...d,
      schoolMenus: replaceSchoolWeeks(d.schoolMenus, {
        scope,
        kidId: activeKidId,
        weeksEntries,
        weeksCatalogIds,
      }),
    }));
    setViewPos(0);
  };

  const toggleWeek = (i) => {
    setSelectedWeekIdxs((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      applyWeekSelection(next);
      return next;
    });
  };

  // Delete just the currently-viewed week for the active scope (per-week borrar).
  const clearWeek = () => {
    if (!window.confirm("¿Borrar esta semana del menú del cole?")) return;
    setData((d) => ({
      ...d,
      schoolMenus: clearSchoolWeek(d.schoolMenus, {
        scope,
        kidId: activeKidId,
        weekIndex: globalWeekIndex,
      }),
    }));
    setViewPos((p) => Math.max(0, p - 1));
  };

  // Empty the whole menú for the active scope (all weeks) — "vaciar menú".
  const clearMenu = () => {
    if (!window.confirm("¿Vaciar el menú del cole?")) return;
    setData((d) => ({
      ...d,
      schoolMenus: clearSchoolScope(d.schoolMenus, { scope, kidId: activeKidId }),
    }));
    setViewPos(0);
  };

  // Edit a single course in the currently-viewed week (name + optional category).
  const editDish = (day, course, { name, category }) => {
    setData((d) => {
      let sm = setSchoolDishAt(d.schoolMenus, {
        scope,
        kidId: activeKidId,
        weekIndex: globalWeekIndex,
        day,
        course,
        value: name,
      });
      sm = setSchoolIconOverride(sm, {
        weekIndex: globalWeekIndex,
        scope,
        kidId: activeKidId,
        day,
        course,
        value: (name ?? "").trim() ? category : null,
      });
      return { ...d, schoolMenus: sm };
    });
  };

  // A row of one child leaves the upload button stranded next to a big gap, so
  // it carries the formats as a label. Past three children the circles need
  // that width more than the label does — the icon and the sheet's own
  // subtitle still say what it takes. The shared menú is a single stack, capped
  // at three faces plus a counter, so it never crowds the label out.
  const uploadCompact = scope === "individual" && schoolKids.length > 3;

  // Picking a card is also the way in to uploading: the choice only matters
  // because of the file that follows it, so the two happen in one gesture.
  const openUpload = (value) => {
    setScope(value);
    setImportError(null);
    setUploadOpen(true);
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
        setSelectedWeekIdxs(new Set());
      } else {
        setParsedWeeks(weeks);
        // Preselect every detected week that actually carries dishes so the user
        // sees the whole capture and can untick the ones they don't want. If for
        // some reason none has dishes, fall back to the single best week.
        const withDishes = weeks
          .map((w, i) => ({ i, n: Object.keys(w.entries ?? {}).length }))
          .filter((x) => x.n > 0)
          .map((x) => x.i);
        const defaultSel = withDishes.length ? withDishes : [selectBestWeek(weeks)];
        const selSet = new Set(defaultSel);
        setSelectedWeekIdxs(selSet);
        applyWeekSelection(selSet, weeks);
        setImportedFileName(file.name ?? "");
        setImportStatus("");
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

  // Value-prop carousel only: fakes the exact same visual states `handleFile`
  // walks through (progress bar, AI-parsing copy, elapsed timer) without any
  // real upload/OCR/AI call, then fills the review grid and loops.
  useEffect(() => {
    if (!demoScript) return undefined;
    let cancelled = false;
    const timers = [];
    const wait = (ms) =>
      new Promise((res) => {
        const id = setTimeout(res, ms);
        timers.push(id);
      });
    const reset = () => {
      replaceDishes({});
      setImportedFileName("");
      setImportStatus("");
      setImportError(null);
      setParsedWeeks([]);
    };
    const run = async () => {
      while (!cancelled) {
        reset();
        await wait(900);
        if (cancelled) return;
        setImporting(true);
        importElapsedRef.current = 0;
        setImportElapsedSec(0);
        setImportProgress(0.08);
        setImportStatus("Leyendo PDF (1/2)…");
        await wait(650);
        if (cancelled) return;
        setImportProgress(0.4);
        setImportStatus("Leyendo PDF (2/2)…");
        await wait(650);
        if (cancelled) return;
        aiParseStartSecRef.current = importElapsedRef.current;
        setAiParsing(true);
        setImportProgress(0.85);
        await wait(1700);
        if (cancelled) return;
        setAiParsing(false);
        setImporting(false);
        setImportProgress(0);
        replaceDishes(DEMO_SCHOOL_ENTRIES);
        setImportedFileName("menu_comedor_octubre.pdf");
        setImportStatus("Detectados 5/5 días (15 platos) · revisa antes de continuar");
        await wait(4200);
        if (cancelled) return;
      }
    };
    run();
    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [demoScript]);

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
      {/* Before any menú is loaded: the two big choice cards double as the
          upload entry point. Once a menú exists we drop them entirely (the deck
          below is the focus); upload/delete live in the review toolbar. */}
      {!hasAnyDish && (
      <div style={{ display: "flex", flexDirection: "column", gap: 12, height: "100%", paddingBottom: 4 }}>
        {SCHOOL_SCOPE_CARDS.map(({ value, img, label, desc }) => {
          const sel = scope === value;
          return (
            <button
              key={value}
              type="button"
              onClick={() => openUpload(value)}
              style={{
                flex: 1,
                minHeight: 0,
                display: "flex",
                flexDirection: "column",
                alignItems: "stretch",
                width: "100%",
                textAlign: "center",
                padding: 0,
                borderRadius: 18,
                cursor: "pointer",
                overflow: "hidden",
                background: sel ? "#2d5a3d" : "#f7f9f8",
                border: `2.5px solid ${sel ? "#2d5a3d" : "#e8ede9"}`,
                boxShadow: sel ? "0 4px 18px rgba(45,90,61,.25)" : "none",
                transition: "all .18s ease",
                fontFamily: "inherit",
              }}
            >
              <img
                src={img}
                alt=""
                style={{
                  width: "100%",
                  flex: 1,
                  minHeight: 90,
                  borderBottom: `1px solid ${sel ? "rgba(255,255,255,.15)" : "#e8ede9"}`,
                  objectFit: "cover",
                  objectPosition: "center 20%",
                  display: "block",
                }}
              />
              <span style={{ flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: 6, padding: "11px 16px 13px" }}>
                <span>
                  <div style={{ fontWeight: 800, color: sel ? "#fff" : "#1a3a24", fontSize: 15, marginBottom: 3 }}>{label}</div>
                  <div style={{ fontSize: 12, color: sel ? "rgba(255,255,255,.75)" : "#7a9080", lineHeight: 1.35 }}>{desc}</div>
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
              </span>
              </button>
            );
          })}
        </div>
      )}

      {uploadOpen && (
      <WizardSheet
        icon={School}
        title={scope === "individual" ? "Por niño/a" : "Mismo menú para todos"}
        subtitle="Sube el PDF, la foto o el CSV del comedor"
        onClose={() => !importing && setUploadOpen(false)}
      >
      {/* Who the menú is for, then upload, then done — one row of circles and
          icons instead of three stacked full-width blocks. */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 10 }}>
        {/* Shrinks (and scrolls) as people are added so the upload button keeps
            the leftover width instead of stranding it as a gap. */}
        <div style={{ display: "flex", gap: 10, overflowX: "auto", flex: "0 1 auto", minWidth: 0 }}>
          {scope === "individual" ? (
            schoolKids.map((m) => (
              <ScopeCircle
                key={m.id}
                label={(m.name ?? "").trim().split(/\s+/)[0] || m.name}
                color={memberAvatarColor(m.id, data.members)}
                members={[m]}
                allMembers={data.members}
                active={m.id === activeKidId}
                onClick={() => setActiveKidId(m.id)}
              />
            ))
          ) : (
            <ScopeCircle
              label="Todos"
              abbrev="T"
              color="#2d5a3d"
              members={schoolKids}
              allMembers={data.members}
              active
            />
          )}
        </div>

        <button
          type="button"
          onClick={() => !importing && fileInputRef.current?.click()}
          disabled={importing}
          aria-label="Subir PDF, foto o CSV"
          title="Subir PDF, foto o CSV"
          style={{
            flex: 1,
            minWidth: 46,
            height: 46,
            borderRadius: 14,
            border: "1.5px dashed rgba(45,90,61,.45)",
            background: importing ? "#eef3f0" : "#fff",
            color: "#2d5a3d",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 7,
            padding: "0 10px",
            fontSize: 12,
            fontWeight: 800,
            fontFamily: "inherit",
            cursor: importing ? "default" : "pointer",
          }}
        >
          {importing ? <Loader2 size={17} className="rotating" /> : <Upload size={17} />}
          {!uploadCompact && (
            <span style={{ whiteSpace: "nowrap" }}>
              {importing ? "Procesando…" : "PDF, foto o CSV"}
            </span>
          )}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf,image/*,.csv,text/csv"
          onChange={onPickFile}
          disabled={importing}
          style={{ display: "none" }}
        />

        <button
          type="button"
          onClick={() => setUploadOpen(false)}
          disabled={importing}
          aria-label="Listo"
          title="Listo"
            style={{
            flexShrink: 0,
            width: 46,
            height: 46,
            borderRadius: 14,
            border: "none",
            background: importing ? "#b8c9be" : "#1a3a24",
            color: "#fff",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
            cursor: importing ? "default" : "pointer",
          }}
        >
          <Check size={20} />
        </button>
      </div>

            {importing ? (
        <div style={{ marginBottom: 10 }}>
          <div style={{ height: 5, borderRadius: 3, background: "#e4ebe6", overflow: "hidden", marginBottom: 5 }}>
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
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "#8d978f" }}>
            <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", flex: 1, minWidth: 0 }}>
                    {displayStatus || "…"}
                  </span>
            <span style={{ flexShrink: 0, fontVariantNumeric: "tabular-nums" }}>{importElapsedSec}s</span>
                </div>
                </div>
      ) : (
        importedFileName && (
                  <div
                    style={{
              fontSize: 11.5,
              color: "#7a9080",
              marginBottom: 10,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {importedFileName}
                  </div>
        )
      )}

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


      {/* Multi-select of every detected week: tick the ones you want to use.
          Each ticked week becomes a distinct week of your menú. Unticking them
          all is how you "don't use" a menú — no explicit empty button needed.
          Stacked full-width rows, each showing its date range (Mon–Fri). */}
      {parsedWeeks.length > 1 && !importing && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 8 }}>
          {parsedWeeks.map((w, i) => {
            const sel = selectedWeekIdxs.has(i);
            const dishes = Object.keys(w.entries ?? {}).length;
            const disabled = dishes === 0;
            const { title, range } = weekChipLabel(w.weekLabel, i);
            return (
              <button
                key={i}
                type="button"
                onClick={() => !disabled && toggleWeek(i)}
                disabled={disabled}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  width: "100%",
                  padding: "10px 14px",
                  borderRadius: 12,
                  border: `1.5px solid ${sel ? "#2d5a3d" : "#d7e5dc"}`,
                  background: disabled ? "#f1f4f2" : sel ? "#2d5a3d" : "#fff",
                  color: disabled ? "#aebbb2" : sel ? "#fff" : "#2d5a3d",
                  fontFamily: "inherit",
                  cursor: disabled ? "default" : "pointer",
                  textAlign: "left",
                  transition: "all .15s ease",
                }}
              >
                <span style={{ width: 82, flexShrink: 0, fontSize: 13.5, fontWeight: 800 }}>{title}</span>
                <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: 600, color: disabled ? "#b9c4bd" : sel ? "rgba(255,255,255,.82)" : "#7a9080", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {range || ""}
                </span>
                <span
                  style={{
                    width: 18,
                    height: 18,
                    borderRadius: 6,
                    flexShrink: 0,
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    border: `1.5px solid ${sel ? "rgba(255,255,255,.85)" : "#c5d4cb"}`,
                    background: sel ? "rgba(255,255,255,.2)" : "#fff",
                  }}
                >
                  {sel && <Check size={12} strokeWidth={3.4} color="#fff" />}
                </span>
              </button>
            );
          })}
        </div>
      )}
      </WizardSheet>
      )}

      {hasAnyDish && !importing && data.expertMode && householdHasSchoolMenu(data.schoolMenus) && (
        <button
          type="button"
          onClick={() =>
            setData((d) => ({
              ...d,
              kidDinnerMatchesAdultLunch: !d.kidDinnerMatchesAdultLunch,
              ...(d.menuModel !== "separate"
                ? { menuModel: "separate", groups: groupsFromModel(d.members ?? [], "separate") }
                : {}),
            }))
          }
          style={{
            width: "100%",
            display: "flex",
            alignItems: "flex-start",
            gap: 12,
            padding: "12px 14px",
            borderRadius: 14,
            border: `2px solid ${data.kidDinnerMatchesAdultLunch ? "#2d5a3d" : "#e0eae3"}`,
            background: data.kidDinnerMatchesAdultLunch ? "#eef6f0" : "#fff",
            cursor: "pointer",
            fontFamily: "inherit",
            textAlign: "left",
            marginBottom: 12,
          }}
        >
          <span
            style={{
              flexShrink: 0,
              width: 22,
              height: 22,
              borderRadius: 7,
              marginTop: 1,
              border: `2px solid ${data.kidDinnerMatchesAdultLunch ? "#2d5a3d" : "#c5d4cb"}`,
              background: data.kidDinnerMatchesAdultLunch ? "#2d5a3d" : "#fff",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {data.kidDinnerMatchesAdultLunch && <Check size={13} color="#fff" strokeWidth={3} />}
          </span>
          <span style={{ minWidth: 0 }}>
            <span style={{ display: "block", fontSize: 13.5, fontWeight: 800, color: "#142f1d" }}>
              Cena de los niños = comida de los adultos
            </span>
            <span style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#6b7d70", marginTop: 3, lineHeight: 1.35 }}>
              Ajustamos la comida familiar para que no coincida con el cole, y esa misma comida se sirve de cena a los niños.
            </span>
          </span>
        </button>
      )}

      {/* Deck-style review — same look & feel as the Menús section. The review
          only shows once there's a menú loaded; tapping any tile renames the
          dish in place (OCR fixes). */}
      {hasAnyDish && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {/* Toolbar: week selector (lateral chevrons, like the Menús pager) on
              the left; upload + delete icon buttons on the right. */}
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {weekCount > 1 ? (
              <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0, flex: 1 }}>
                <button
                  type="button"
                  onClick={() => viewPos > 0 && setViewPos(viewPos - 1)}
                  disabled={viewPos <= 0}
                  aria-label="Semana anterior"
                  style={weekPagerArrow(viewPos <= 0)}
                >
                  <ChevronLeft size={16} />
                </button>
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: "block", fontSize: 13, fontWeight: 800, color: "#15301f" }}>
                    {(() => { const { title } = weekChipLabel(smNorm.weeks[scopeWeekIndices[viewPos]]?.label, viewPos); return title; })()}
                  </span>
                  {(() => {
                    const { range } = weekChipLabel(smNorm.weeks[scopeWeekIndices[viewPos]]?.label, viewPos);
                    return range ? (
                      <span style={{ display: "block", fontSize: 11, fontWeight: 600, color: "#7a9080" }}>{range}</span>
                    ) : null;
                  })()}
                </span>
                <button
                  type="button"
                  onClick={() => viewPos < weekCount - 1 && setViewPos(viewPos + 1)}
                  disabled={viewPos >= weekCount - 1}
                  aria-label="Semana siguiente"
                  style={weekPagerArrow(viewPos >= weekCount - 1)}
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            ) : (
              <span style={{ flex: 1 }} />
            )}
            <button
              type="button"
              onClick={() => openUpload(scope)}
              aria-label="Subir otro menú"
              title="Cambiar / subir otro"
              style={schoolToolBtn(false)}
            >
              <Upload size={16} />
            </button>
            {weekCount > 1 && (
              <button
                type="button"
                onClick={clearWeek}
                aria-label="Borrar esta semana"
                title="Borrar esta semana"
                style={schoolToolBtn(true)}
              >
                <Trash2 size={16} />
              </button>
            )}
            <button
              type="button"
              onClick={clearMenu}
              aria-label="Vaciar menú"
              title="Vaciar menú"
              style={schoolToolBtn(true)}
            >
              <Eraser size={16} />
            </button>
          </div>

          <SchoolMenuDeck entries={entries} overrides={iconOverrides} catalogIds={weekCatalogIds} onEditDish={editDish} />
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
            fontSize: 16,
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
            style={{ flex: 1, padding: "8px 10px", borderRadius: 8, border: "1px solid #ddd", fontSize: 16 }}
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

// Ilustraciones de categoría (mismo set Midjourney que el resto de la app).
// Se usan para componer el mosaico de cada estilo de comida.
const CATEGORY_ART = {
  carne: "/categories/cut/carne.png",
  pescado: "/categories/cut/pescado.png",
  pasta_arroz: "/categories/cut/pasta_arroz.png",
  legumbres: "/categories/cut/legumbres.png",
  huevos: "/categories/cut/huevos.png",
  verdura: "/categories/cut/verduras.png",
};

export const MEAL_STYLES = [
  {
    id: "de_todo",
    label: "De todo",
    desc: "Pasta, arroz y carne al frente. Familiar y del gusto de los peques.",
    Icon: Pizza,
    cats: ["pasta_arroz", "carne", "huevos", "verdura"],
    freqs: { pasta_arroz: 4, carne: 4, huevos: 2, verdura: 2, pescado: 1, legumbres: 1 },
  },
  {
    id: "equilibrado",
    label: "Equilibrado",
    desc: "Un poco de todo, sin que destaque nada. El punto medio.",
    Icon: HeartPulse,
    cats: ["carne", "pescado", "verdura", "legumbres"],
    freqs: { carne: 3, pescado: 3, verdura: 3, legumbres: 2, pasta_arroz: 2, huevos: 2 },
  },
  {
    id: "ligero",
    label: "Ligero y saludable",
    desc: "Mucha verdura, pescado y legumbre; poca pasta y carne roja.",
    Icon: Salad,
    cats: ["verdura", "pescado", "legumbres", "huevos"],
    freqs: { verdura: 6, pescado: 4, legumbres: 3, huevos: 2, carne: 1, pasta_arroz: 1 },
  },
  {
    id: "personalizado",
    label: "A tu gusto",
    desc: "Reparte tú mismo los platos de la semana.",
    Icon: SlidersHorizontal,
    wheel: true,
    freqs: { carne: 3, pescado: 3, verdura: 3, legumbres: 2, pasta_arroz: 2, huevos: 2 },
  },
];

export const DEFAULT_MEAL_STYLE = "de_todo";

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
  // Effective single-plate structure for this group — must mirror
  // buildGroupContext (aiPlanner.js): a comida becomes a single dish when the
  // per-day slotType is "unico" OR the group's meal structure is "1_plato"
  // (per-group override first, then the global "modo básico" default). Without
  // the "1_plato" branch the budget over-counts comida days as 2 slots while
  // the generator only produces 1, making the scaled freqs impossible to meet.
  const mealStructure =
    data.mealStructureByGroup?.[group?.id] ?? data.mealStructure ?? "primero_segundo";
  let comidaDays = 0;
  let cenaDays = 0;
  let platoUnicoDays = 0;
  DAYS.forEach((day) => {
    if (meals.includes("Comida")) {
      const mode = modeForGroupSlot(effectiveGroup, members, schedule, day, "Comida");
      if (mode.cook) {
        comidaDays += 1;
        if (slotType[`${day}|Comida`] === "unico" || mealStructure === "1_plato") platoUnicoDays += 1;
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
    [data.meals, data.members, data.schedule, data.slotType, data.mealStructure, data.mealStructureByGroup, group],
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
        width: 38,
        height: 30,
        borderRadius: 8,
        border: `1.5px solid ${color}`,
        background: "#fff",
        color: "#1a3a24",
        fontSize: 16,
        fontWeight: 800,
        fontFamily: "inherit",
        textAlign: "center",
        outline: "none",
        padding: 0,
      }}
    />
  );
}

export function mealStyleCardStyle(selected, accent = "#2d5a3d") {
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
    border: `1.5px solid ${selected ? accent : "#e0eae3"}`,
    background: selected ? accent : "#fff",
    cursor: "pointer",
    fontFamily: "inherit",
    transition: "all .16s ease",
    boxShadow: selected
      ? accent === "#0f766e"
        ? "0 6px 18px rgba(15,118,110,.22)"
        : "0 6px 18px rgba(45,90,61,.22)"
      : "0 1px 2px rgba(0,0,0,.04)",
  };
}

export function mealStyleIconStyle(selected, accent = "#2d5a3d") {
  return {
    width: 32,
    height: 32,
    borderRadius: 10,
    flexShrink: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: selected ? "rgba(255,255,255,.18)" : "#eef5f0",
    color: selected ? "#fff" : accent,
  };
}

export function OnboardingMealStyle({ data, setData, onNext, onBack, onFinish, onReset, nextLabel, autoplay = false }) {
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

  const [overBudgetInfoOpen, setOverBudgetInfoOpen] = useState(false);

  // Estructura de la comida, desayuno/merienda/postre y cenas rápidas now
  // live in their own screen (OnboardingMealExtras, right after this one) —
  // this screen is just the food×veces table so it doesn't grow unbounded
  // every time we add another optional meal.
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

  // Value-prop carousel demo: recorre los 4 estilos, 0,75 s por opción.
  useEffect(() => {
    if (!autoplay) return undefined;
    let i = 0;
    const id = setInterval(() => {
      i = (i + 1) % MEAL_STYLES.length;
      selectStyle(MEAL_STYLES[i].id);
    }, 750);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoplay, styleKey]);

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
      nextLabel={nextLabel}
      onBack={onBack}
      onReset={onReset}
      onNext={onNext}
      onFinish={onFinish}
      bg="#f5f9f6"
    >
      {hasMultipleGroups && (
        <div style={{ marginBottom: 20 }}>
          <GroupScopePicker
            groups={styleableGroups}
            scope={activeGroupId ?? "all"}
            onChange={(scopeId) => setActiveGroupId(scopeId === "all" ? null : scopeId)}
            members={data.members ?? []}
            style={{ marginBottom: 0 }}
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
        @keyframes noriaSpin { to { transform: rotate(360deg); } }
        @keyframes noriaSpinBack { to { transform: rotate(-360deg); } }
        @media (prefers-reduced-motion: reduce) {
          .noria-wheel, .noria-icon { animation: none !important; }
        }
      `}</style>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 9 }}>
        {MEAL_STYLES.map((s) => {
          const sel = activeStyle === s.id;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => selectStyle(s.id)}
              style={{
                position: "relative",
                minWidth: 0,
                height: 140,
                display: "flex", flexDirection: "column", alignItems: "stretch",
                borderRadius: 15,
                overflow: "hidden",
                border: `2px solid ${sel ? "#2d5a3d" : "#e3ebe6"}`,
                padding: 0,
                cursor: "pointer",
                fontFamily: "inherit",
                background: "#fff",
                boxShadow: sel
                  ? "0 6px 18px rgba(45,90,61,.24)"
                  : "0 1px 3px rgba(20,47,29,.06)",
                transition: "box-shadow .16s ease, border-color .16s ease",
              }}
            >
              {/* Composición: las dos categorías dominantes como una sola escena.
                  Se solapan solo por los márgenes casi-blancos (que funden con el
                  fondo), así los dos alimentos conviven sin pisarse ni parecer grid.
                  Para "A tu gusto" mostramos una mini-noria con las 6 categorías. */}
              <div style={{
                position: "relative",
                flex: 1,
                overflow: "hidden",
                background: "linear-gradient(180deg, #fbfcfb 0%, #eef3f0 100%)",
              }}>
                {s.wheel ? (
                  <div
                    className="noria-wheel"
                    style={{
                      position: "absolute", top: "50%", left: "50%",
                      width: 0, height: 0,
                      animation: "noriaSpin 18s linear infinite",
                    }}
                  >
                    {FOOD_ORDER.map((c, i) => {
                      const ang = (i * 360) / FOOD_ORDER.length;
                      return (
                        <div
                          key={c}
                          style={{
                            position: "absolute", top: 0, left: 0,
                            width: 32, height: 32, margin: "-16px 0 0 -16px",
                            transform: `rotate(${ang}deg) translateY(-33px)`,
                          }}
                        >
                          <div style={{ transform: `rotate(${-ang}deg)`, width: "100%", height: "100%" }}>
                            <img
                              className="noria-icon"
                              src={CATEGORY_ART[c]}
                              alt=""
                              loading="lazy"
                              style={{
                                width: "100%", height: "100%", objectFit: "contain",
                                animation: "noriaSpinBack 18s linear infinite",
                                filter: sel
                                  ? "drop-shadow(0 1px 2px rgba(0,0,0,.12))"
                                  : "saturate(.9) brightness(.99) drop-shadow(0 1px 2px rgba(0,0,0,.08))",
                              }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                <>
                {/* Sombra compartida: asienta las dos piezas en la misma superficie */}
                <div style={{
                  position: "absolute", zIndex: 1,
                  left: "14%", right: "12%", bottom: "9%", height: "16%",
                  borderRadius: "50%",
                  background: "radial-gradient(ellipse at center, rgba(20,47,29,.18) 0%, rgba(20,47,29,0) 70%)",
                  filter: "blur(1px)",
                }} />
                {/* Secundaria: detrás, algo más pequeña, apoyada a la izquierda */}
                {(s.cats?.[1] != null) && (
                  <img
                    src={CATEGORY_ART[s.cats[1]]}
                    alt=""
                    loading="lazy"
                    style={{
                      position: "absolute", zIndex: 2,
                      width: "60%", height: "72%",
                      left: "1%", bottom: "8%",
                      objectFit: "contain",
                      filter: sel
                        ? "drop-shadow(0 3px 4px rgba(0,0,0,.14))"
                        : "saturate(.9) brightness(.99) drop-shadow(0 3px 4px rgba(0,0,0,.1))",
                      transition: "filter .16s ease",
                    }}
                  />
                )}
                {/* Dominante: delante, más grande y apoyada abajo a la derecha */}
                {(s.cats?.[0] != null) && (
                  <img
                    src={CATEGORY_ART[s.cats[0]]}
                    alt=""
                    loading="lazy"
                    style={{
                      position: "absolute", zIndex: 3,
                      width: "66%", height: "86%",
                      right: "-1%", bottom: "3%",
                      objectFit: "contain",
                      filter: sel
                        ? "drop-shadow(0 4px 5px rgba(0,0,0,.16))"
                        : "saturate(.94) brightness(1) drop-shadow(0 4px 5px rgba(0,0,0,.12))",
                      transition: "filter .16s ease",
                    }}
                  />
                )}
                </>
                )}
              {sel && (
                  <span style={{
                    position: "absolute", top: 4, right: 4, zIndex: 3,
                    width: 16, height: 16, borderRadius: 999,
                    background: "#2d5a3d", border: "1.5px solid #fff",
                    display: "inline-flex", alignItems: "center", justifyContent: "center",
                  }}>
                    <Check size={9} color="#fff" strokeWidth={3} />
                </span>
              )}
              </div>
              <div style={{
                padding: "8px 6px 9px",
                background: sel ? "#2d5a3d" : "#fff",
                  textAlign: "center",
                transition: "background .16s ease",
              }}>
                <span style={{
                  fontSize: 12, fontWeight: 800, lineHeight: 1.15,
                  color: sel ? "#fff" : "#25402f",
                }}>
                {s.label}
                </span>
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
              const showCena = getMeals(data).includes("Cena");
              const slotCard = (Icon, value, label, color) => (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    background: "#fff",
                    border: `1.5px solid ${color}55`,
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
                      background: `${color}1f`,
                      color,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Icon size={11} strokeWidth={2.4} />
                  </span>
                  <span style={{ fontSize: 11.5, fontWeight: 800, color: "#142f1d", whiteSpace: "nowrap" }}>
                    {value} {label}
                  </span>
                </div>
              );
              return (
                <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
                  {showComida && slotCard(Sun, comidaSlots, "comidas", "#c9820a")}
                  {showCena && slotCard(Moon, cenaSlots, "cenas", "#5a7a9a")}
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
            <div style={panelCardStyle}>
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
                              width: 32,
                              height: 32,
                              borderRadius: 9,
                              background: `${meta.color}14`,
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              flexShrink: 0,
                              overflow: "hidden",
                            }}
                          >
                            {CATEGORY_ART[key] ? (
                              <img
                                src={CATEGORY_ART[key]}
                                alt=""
                                loading="lazy"
                                style={{ width: "88%", height: "88%", objectFit: "contain" }}
                              />
                            ) : (
                              <meta.Icon size={15} color={meta.color} />
                            )}
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

    </OnboardingShell>
  );
}

// ── Estructura de la comida, desayuno/merienda/postre y cenas rápidas ──
// Split out of OnboardingMealStyle (which was turning into a very long single
// screen every time we added another optional meal type) into its own step,
// right after it. Desayuno/merienda were a card that opened a modal with a
// vertical list of bordered options + subcopy under each ("horroroso" per
// feedback — heavy contrast, popup for a 3-way choice); now inline segmented
// controls, same visual language as "Estructura de la comida" and "Postre"
// (which already worked this way and read fine). "Cenas rápidas" keeps its
// own sheet since it's a per-day pick, not a single 2-4 way choice.
export function OnboardingMealExtras({ data, setData, onNext, onBack, onFinish, onReset, nextLabel }) {
  // Structure can vary per family group, same groups as the food×times table
  // in the previous step.
  useEffect(() => {
    if (!Array.isArray(data.groups) || data.groups.length === 0) {
      const seeded = groupsFromModel(data.members ?? [], data.menuModel ?? "same");
      if (seeded.length > 0) setData((d) => ({ ...d, groups: seeded }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const groups = useMemo(() => (Array.isArray(data.groups) ? data.groups : []), [data.groups]);
  const styleableGroups = useMemo(
    () => groups.filter((g) => !isBabyMenuGroup(g, data.members ?? [])),
    [groups, data.members],
  );
  const hasMultipleGroups = styleableGroups.length > 1;
  const [activeGroupId, setActiveGroupId] = useState(null);
  const [extrasTab, setExtrasTab] = useState("comidas");
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

  // ── Comidas / cenas rápidas (≤15 min, weekly exceptions) ──
  // Live on the household week (data.slotType), independent of the menu tab.
  const slotTypeMap = data.slotType ?? {};
  const hasCena = getMeals(data).includes("Cena");
  const hasComida = getMeals(data).includes("Comida");
  const toggleMealRapida = (day, meal) => {
    setData((d) => {
      const key = `${day}|${meal}`;
      const next = { ...(d.slotType ?? {}) };
      const manual = { ...(d.manualSlotType ?? {}) };
      if (next[key] === "rapida") {
        delete next[key];
        delete manual[key];
      } else {
        next[key] = "rapida";
        // Plato único and rápida can't both apply to the same comida slot.
        if (meal === "Comida" && next[key]) {
          /* rapida wins: preferType becomes comida_rapida */
        }
      }
      return { ...d, slotType: next, manualSlotType: manual };
    });
  };

  // A quick meal only makes sense when someone eats that meal at home.
  const nonBabyMembers = (data.members ?? []).filter((m) => !memberIsBaby(m));
  const mealAtHome = (day, meal) =>
    nonBabyMembers.some((m) => {
      const s = data.schedule?.[slotKey(m.id, day, meal)] ?? "casa";
      return s === "casa" || s === "tupper";
    });
  const dinnerAtHome = (day) => mealAtHome(day, "Cena");
  const lunchAtHome = (day) => mealAtHome(day, "Comida");
  // La rejilla va siempre de lunes a domingo sin envolver: la semana no se
  // "atraviesa" (nada de empezar en miércoles y arrastrar Lun/Mar a la cola).
  // Las semanas parciales se resuelven con el selector de semanas, no aquí.
  const cenaDays = DAYS;
  const weekDates = useMemo(
    () => getWeekDatesByMenuWeek({
      offset: data.menuWeek?.offset ?? 0,
      startDayIdx: data.menuWeek?.startDayIdx ?? 0,
    }).dates,
    [data.menuWeek],
  );

  // ── Desayuno / merienda / postre ── state lives in data.extraMeals;
  // desayuno on/off itself is set upstream in "¿Dónde coméis?".
  const em = data.extraMeals ?? {};
  const setExtraMeal = (key, val) =>
    setData((d) => ({ ...d, extraMeals: { ...(d.extraMeals ?? {}), [key]: val } }));
  const optDesayunoOn = Boolean(em.desayuno && em.desayuno !== "off");
  const optHasKids = (data.members ?? []).some((m) =>
    ["infantil", "primaria"].includes(stageForAge(memberAge(m)).id),
  );

  // Postre is a multi-select of comida/cena mapped onto the enum the planner
  // already understands (off | comida | cena | ambas) — no separate "ambas" UI.
  const postreHas = (slot) => em.postre === slot || em.postre === "ambas";
  const togglePostre = (slot) => {
    const c = slot === "comida" ? !postreHas("comida") : postreHas("comida");
    const n = slot === "cena" ? !postreHas("cena") : postreHas("cena");
    setExtraMeal("postre", c && n ? "ambas" : c ? "comida" : n ? "cena" : "off");
  };

  // One shared segmented-control look for every choice on this screen —
  // fixed height, icon on top, label below, no per-option subcopy — so
  // "Estructura", "Desayuno", "Merienda" and "Postre" all read as the exact
  // same kind of control regardless of whether they're single-select
  // (`isSelected` picks exactly one) or multi-select like Postre (both can
  // be on at once).
  const SEG_HEIGHT = 68;
  // `tint` (color sólido) y `fill` (fondo, admite degradado) son opcionales por
  // opción: sin ellos el control es verde como siempre; con ellos la opción se
  // enciende con su propio color (Postre usa ámbar/índigo, mismo idioma que
  // "cuándo coméis en casa"). El resto de segmentados no los pasan y no cambian.
  const segmented = (options, isSelected, onSelect) => (
    <div style={{ display: "flex", gap: 8 }}>
      {options.map(({ id, label, Icon, tint, fill }) => {
        const sel = isSelected(id);
        const accent = tint ?? "#2d5a3d";
        return (
          <button
            key={id}
            type="button"
            onClick={() => onSelect(id)}
            style={{
              flex: 1,
              minHeight: SEG_HEIGHT,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              padding: "10px 6px",
              borderRadius: 14,
              border: sel ? `2px solid ${accent}` : "1.5px solid #dde8e1",
              background: sel ? (fill ?? accent) : "#fff",
              color: sel ? "#fff" : "#142f1d",
              boxShadow: sel && tint ? `0 6px 18px ${accent}55` : "none",
              cursor: "pointer",
              fontFamily: "inherit",
              textAlign: "center",
              transition: "all .15s ease",
            }}
          >
            <Icon size={18} color={sel ? "#fff" : accent} strokeWidth={2.2} />
            <span style={{ fontSize: 11.5, fontWeight: 800, lineHeight: 1.2 }}>{label}</span>
          </button>
        );
      })}
    </div>
  );

  const expert = Boolean(data.expertMode);
  const postreOn = em.postre && em.postre !== "off";
  const postreTipo = em.postreTipo ?? "inmediato";
  const structureId = data.mealStructureByGroup?.[subjectId] ?? "primero_segundo";

  const showExtrasTabs = expert;

  const extrasSection = (key, children) => ({ key, children });

  const comidaSections = [];
  if (expert && optDesayunoOn) {
    comidaSections.push(
      extrasSection("desayuno",
        <>
          <SectionTitle Icon={Coffee} color={mealTimeColor("Desayuno")}>Desayuno</SectionTitle>
          <div style={{ display: "flex", gap: 8 }}>
            {DESAYUNO_OPTS.map((t) => (
              <RestrictionTabCard
                key={t.id}
                img={t.img}
                title={t.label}
                subtitle={t.subtitle}
                imgRatio="2 / 1"
                active={(em.desayuno ?? "variado") === t.id}
                onClick={() => setExtraMeal("desayuno", t.id)}
              />
            ))}
          </div>
        </>,
      ),
    );
  }
  if (subjectId) {
    comidaSections.push(
      extrasSection("estructura",
        <>
          <SectionTitle Icon={Sun} color={mealTimeColor("Comida")}>Comida</SectionTitle>
          <div style={{ display: "flex", gap: 8 }}>
            {MEAL_STRUCTURE_CARDS.map((t) => (
              <RestrictionTabCard
                key={t.id}
                img={t.img}
                title={t.title}
                subtitle={t.subtitle}
                imgHeight={160}
                textOverlay
                active={structureId === t.id}
                onClick={() =>
            setData((d) => ({
              ...d,
                    mealStructureByGroup: { ...(d.mealStructureByGroup ?? {}), [subjectId]: t.id },
                  }))
                }
              />
            ))}
          </div>
        </>,
      ),
    );
  }
  if (expert && (hasComida || hasCena)) {
    comidaSections.push(
      extrasSection("rapidas",
        <>
          <SectionTitle Icon={Zap} color="#d56b9a">Rápidas (≤ 15 min)</SectionTitle>
          <p style={{ fontSize: 12.5, color: "#6b7d70", margin: "0 0 12px", lineHeight: 1.4 }}>
            Toca los días que quieres ligeros: ensalada, plancha, tortilla…
          </p>
          {hasComida && (
            <div style={{ marginBottom: hasCena ? 14 : 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Sun size={14} strokeWidth={2.4} color={mealTimeColor("Comida")} style={{ flexShrink: 0 }} />
                <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 6, flex: 1 }}>
            {cenaDays.map((d) => {
                  const off = !lunchAtHome(d);
                  const active = !off && slotTypeMap[`${d}|Comida`] === "rapida";
                  const dayNum = calendarDayNumber(d, weekDates);
                  const tint = mealTimeColor("Comida");
              return (
                    <button
                      key={`comida-${d}`}
                      type="button"
                      disabled={off}
                      onClick={() => !off && toggleMealRapida(d, "Comida")}
                    style={{
                        aspectRatio: "1 / 1",
                        display: "flex",
                        flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "center",
                        gap: 2,
                        borderRadius: 12,
                        border: active ? "none" : off ? "1.5px dashed #e6ebe8" : `1.5px solid ${tint}44`,
                        background: active ? tint : "transparent",
                        color: active ? "#fff" : off ? "#c5cdc8" : tint,
                        cursor: off ? "not-allowed" : "pointer",
                        fontFamily: "inherit",
                        padding: 0,
                      }}
                    >
                      <span style={{ fontSize: 13, fontWeight: 800, lineHeight: 1 }}>{dayNum}</span>
                      <span style={{ fontSize: 10, fontWeight: 700, lineHeight: 1, opacity: 0.9 }}>{d.slice(0, 2)}</span>
                    </button>
              );
            })}
                </div>
              </div>
            </div>
          )}
          {hasCena && (
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Moon size={14} strokeWidth={2.4} color={mealTimeColor("Cena")} style={{ flexShrink: 0 }} />
                <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 6, flex: 1 }}>
            {cenaDays.map((d) => {
              const off = !dinnerAtHome(d);
              const active = !off && slotTypeMap[`${d}|Cena`] === "rapida";
                  const dayNum = calendarDayNumber(d, weekDates);
                  const tint = mealTimeColor("Cena");
              return (
                <button
                      key={`cena-${d}`}
                  type="button"
                  disabled={off}
                      onClick={() => !off && toggleMealRapida(d, "Cena")}
                  style={{
                        aspectRatio: "1 / 1",
                    display: "flex",
                        flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                        gap: 2,
                    borderRadius: 12,
                        border: active ? "none" : off ? "1.5px dashed #e6ebe8" : `1.5px solid ${tint}44`,
                        background: active ? tint : "transparent",
                        color: active ? "#fff" : off ? "#c5cdc8" : tint,
                    cursor: off ? "not-allowed" : "pointer",
                    fontFamily: "inherit",
                        padding: 0,
                  }}
                >
                      <span style={{ fontSize: 13, fontWeight: 800, lineHeight: 1 }}>{dayNum}</span>
                      <span style={{ fontSize: 10, fontWeight: 700, lineHeight: 1, opacity: 0.9 }}>{d.slice(0, 2)}</span>
                </button>
              );
            })}
                </div>
              </div>
            </div>
          )}
        </>,
      ),
    );
  }

  const otrosSections = [];
  if (expert && optHasKids) {
    otrosSections.push(
      extrasSection("merienda",
        <>
          <SectionTitle Icon={Apple} color="#c0504d">Merienda</SectionTitle>
          {segmented(
            MERIENDA_OPTS,
            (id) => (em.merienda ?? "off") === id,
            (id) => setExtraMeal("merienda", id),
          )}
        </>,
      ),
    );
  }
  if (expert) {
    otrosSections.push(
      extrasSection("guarnicion",
        <>
          <SectionTitle Icon={Salad} color="#2d8659">Guarnición</SectionTitle>
          <p style={{ fontSize: 12.5, color: "#6b7d70", margin: "0 0 10px", lineHeight: 1.4 }}>
            Cocina una vez y repite el complemento.
          </p>
          <div style={{ display: "flex", gap: 8 }}>
            {[
              { id: "off", label: "Cada día distinta" },
              { id: "week", label: "Toda la semana" },
              { id: "weekdays", label: "Solo entre semana" },
              { id: "weekend", label: "Solo finde" },
            ].map((opt) => {
              const active = (data.garnishRepeat ?? "off") === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setData((d) => ({ ...d, garnishRepeat: opt.id }))}
                  style={{
                    flex: 1,
                    minWidth: 0,
                    padding: "10px 6px",
                    borderRadius: 12,
                    border: active ? "2px solid #2d8659" : "1.5px solid #dde8e1",
                    background: active ? "#2d8659" : "#fff",
                    color: active ? "#fff" : "#142f1d",
                    fontSize: 11,
                    fontWeight: 800,
                    lineHeight: 1.2,
                    cursor: "pointer",
                    fontFamily: "inherit",
                    textAlign: "center",
                  }}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </>,
      ),
    );
  }
  if (expert) {
    otrosSections.push(
      extrasSection("postre",
        <>
          <SectionTitle Icon={IceCream} color="#c0568f">Postre</SectionTitle>
          {segmented(
            [
              { id: "comida", label: "Comida", Icon: Sun, tint: "#c9820a" },
              { id: "cena", label: "Cena", Icon: Moon, tint: "#5a7a9a" },
              {
                id: "ambas",
                label: "Ambos",
                Icon: UtensilsCrossed,
                tint: "#5a7a9a",
                fill: "linear-gradient(135deg, #c9820a 0%, #5a7a9a 100%)",
              },
            ],
            (id) => (id === "ambas" ? em.postre === "ambas" : postreHas(id)),
            (id) => (id === "ambas" ? setExtraMeal("postre", em.postre === "ambas" ? "off" : "ambas") : togglePostre(id)),
          )}
          {postreOn && (
            <div style={{ marginTop: 14 }}>
              <SectionTitle>Cómo lo preparas</SectionTitle>
              <div style={{ display: "flex", gap: 8 }}>
                {POSTRE_TIPOS.map((t) => (
                  <RestrictionTabCard
                    key={t.id}
                    img={t.img}
                    title={t.title}
                    subtitle={t.subtitle}
                    imgRatio="2 / 1"
                    active={postreTipo === t.id}
                    onClick={() => setExtraMeal("postreTipo", t.id)}
                  />
                ))}
        </div>
              {postreTipo === "inmediato" && (
                <div style={{ marginTop: 14 }}>
                  <div style={{ height: 1, background: "#d7e6dc", margin: "0 0 14px" }} />
                  <SectionTitle>¿Qué prefieres aquí?</SectionTitle>
                  <PostreInmediatoPicker
                    value={em.postreInmediato ?? "mix"}
                    onChange={(id) => setExtraMeal("postreInmediato", id)}
                  />
                </div>
              )}
            </div>
          )}
        </>,
      ),
    );
  }

  const visibleSections = showExtrasTabs && extrasTab === "otros" ? otrosSections : comidaSections;

  return (
    <OnboardingShell
      title="¿Cómo completamos el menú?"
      subtitle="Toca para ajustar. Si te vale, sigue."
      nextLabel={nextLabel}
      onBack={onBack}
      onReset={onReset}
      onNext={onNext}
      onFinish={onFinish}
      bg="#f5f9f6"
    >
      {hasMultipleGroups && (
        <div style={{ marginBottom: 12 }}>
          <GroupScopePicker
            groups={styleableGroups}
            scope={activeGroupId ?? "all"}
            onChange={(id) => setActiveGroupId(id === "all" ? null : id)}
            members={data.members ?? []}
          />
        </div>
      )}
      {showExtrasTabs && (
        <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
          <RestrictionTabCard
            img="/avatares/cards/comidas.jpg"
            title="Comidas"
            subtitle="desayuno, comida y cena"
            accent={CARD_ACCENT_TEAL}
            active={extrasTab === "comidas"}
            onClick={() => setExtrasTab("comidas")}
          />
          <RestrictionTabCard
            img="/avatares/cards/otros.jpg"
            title="Otros"
            subtitle="postre y guarnición"
            accent={CARD_ACCENT_TEAL}
            active={extrasTab === "otros"}
            onClick={() => setExtrasTab("otros")}
          />
        </div>
      )}
      {visibleSections.map((s, i) => (
        <div
          key={s.key}
          style={{
            padding: i === visibleSections.length - 1 ? "12px 0 0" : "12px 0",
            borderBottom: i === visibleSections.length - 1 ? "none" : "1px solid #d7e6dc",
          }}
        >
          {s.children}
        </div>
      ))}
    </OnboardingShell>
  );
}


// ── ¿Cómo aprovechamos lo de casa? ────────────────────────────────────────────
// Pantalla dedicada (post «¿Cómo completamos el menú?») para elegir cuánto pesa
// lo que ya hay en casa (despensa + nevera + congelador) al planificar. Las 4
// opciones van de más a menos: solo con lo de casa → partir de ello → tenerlo en
// cuenta → menú libre. Se mapean a data.pantryMode ("strict"/"only"/"prefer"/"off").
export function OnboardingPantry({ data, setData, onNext, onBack, onFinish, onReset, nextLabel }) {
  const current = data.pantryMode ?? "prefer";
  return (
    <OnboardingShell
      title="¿Aprovechamos lo que ya tienes en casa?"
      subtitle="Elige una opción · nevera, despensa y congelador."
      nextLabel={nextLabel}
      onBack={onBack}
      onReset={onReset}
      onNext={onNext}
      onFinish={onFinish}
    >
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        {DESPENSA_OPTS.map((t) => (
          <RestrictionTabCard
            key={t.id}
            img={t.img}
            title={t.label}
            subtitle={t.subtitle}
            accent={CARD_ACCENT_TEAL}
            active={current === t.id}
            onClick={() => setData((d) => ({ ...d, pantryMode: t.id, useHomeStock: t.id !== "off" }))}
          />
        ))}
      </div>
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
              fontSize: 16,
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
          fontSize: 16,
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
              fontSize: 16,
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
    { id: "basic", img: "/avatares/cards/cook_nivel_basico.png", label: "Básico", desc: "Lo justo para sobrevivir" },
    { id: "normal", img: "/avatares/cards/cook_nivel_normal.png", label: "Normal", desc: "Me defiendo bien" },
    { id: "pro", img: "/avatares/cards/cook_nivel_pro.png", label: "Me gusta cocinar", desc: "Disfruto experimentando" },
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
      subtitle="Tu nivel y tus herramientas"
      onBack={onBack}
      onReset={onReset}
      onNext={onNext}
      onFinish={onFinish}
      finishLabel={finishLabel}
    >
      {/* Nivel de cocina — mismo estilo que comida/cena/desayuno.
          En modo básico se asume "normal" y se oculta el selector. */}
      {data.expertMode && (
        <>
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
                    alignItems: "stretch",
                    padding: 0,
                    overflow: "hidden",
                    borderRadius: 14,
                    cursor: "pointer",
                    background: "#fff",
                    border: `2px solid ${sel ? "#2d5a3d" : "#e3ebe6"}`,
                    boxShadow: sel ? "0 6px 18px rgba(45,90,61,.18)" : "0 1px 3px rgba(20,47,29,.05)",
                    transition: "all .16s cubic-bezier(.4,0,.2,1)",
                    fontFamily: "inherit",
                  }}
                >
                  {/* Ilustración del nivel (contain para que se vea el personaje
                      entero) sobre un tinte neutro. */}
                  <div style={{ width: "100%", aspectRatio: "1 / 1", background: "#f4f7f5" }}>
                    <img
                      src={l.img}
                      alt=""
                      loading="lazy"
                      style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }}
                    />
                  </div>
                  <div
                    style={{
                      flex: 1,
                      display: "flex",
                      flexDirection: "column",
                      justifyContent: "center",
                      padding: "7px 5px 8px",
                      background: sel ? "#2d5a3d" : "#fff",
                      textAlign: "center",
                    }}
                  >
                    <span style={{ display: "block", fontWeight: 800, fontSize: 11.5, lineHeight: 1.15, color: sel ? "#fff" : "#25402f" }}>
                      {l.label}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </>
      )}

      {/* Despensa — oculto de momento (feature en pausa) */}

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
                  color={TOOL_COLOR[tool] ?? "#2d5a3d"}
                  label={tool}
                  checked={sel}
                  checkColor={TOOL_COLOR[tool] ?? "#2d5a3d"}
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
                style={{ flex: 1, padding: "9px 12px", borderRadius: 10, border: "1.5px solid #dde7e0", fontSize: 16, outline: "none", fontFamily: "inherit" }}
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
    </OnboardingShell>
  );
}

// Paso propio para el tiempo de cocina, separado de "¿Quién cocina y cómo?"
// (nivel + herramientas). Aquí viven las 4 cards ilustradas de ritmo de cocina.
export function OnboardingCookTime({ data, setData, onNext, onBack, onFinish, onReset, finishLabel }) {
  return (
    <OnboardingShell
      title="¿Cuánto tiempo tienes para cocinar?"
      subtitle="Ajustamos las recetas a tu ritmo"
      onBack={onBack}
      onReset={onReset}
      onNext={onNext}
      onFinish={onFinish}
      finishLabel={finishLabel}
    >
      <CookTimeEditor data={data} setData={setData} simple={!data.expertMode} showIntro={false} />
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

// Cross-week variety options: "strict" biases every week's generation away
// from dishes used in ANY earlier week of the same menú; "moderate" only
// avoids repeating vs. the immediately preceding week; "relaxed" applies no
// bias at all (handy for meal-prep-style repeats on purpose).
const VARIETY_OPTIONS = [
  { id: "strict",   label: "No quiero repetir platos",      Icon: Shuffle, img: "/variety-cards/strict.png" },
  { id: "moderate", label: "Algo de repetición está bien",  Icon: Repeat,  img: "/variety-cards/moderate.png" },
  { id: "relaxed",  label: "Repetir para ahorrar tiempo",   Icon: Zap,     img: "/variety-cards/relaxed.png" },
];

export function OnboardingWeek({ data, setData, onNext, onBack, onReset, onFinish }) {
  const todayIdx = todayMondayIdx();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const selectedOffsets = useMemo(() => {
    const raw = Array.isArray(data.menuWeekOffsets) && data.menuWeekOffsets.length
      ? data.menuWeekOffsets
      : [data.menuWeek?.offset ?? 0];
    return [...new Set(raw)].sort((a, b) => a - b);
  }, [data.menuWeekOffsets, data.menuWeek]);

  // Persist the default selection even when the user never toggles a week:
  // without this, data.menuWeek stays null and the current week is treated as
  // a full Mon–Sun week — so "¿dónde coméis?" never dims the past days and the
  // menú gets generated for days already gone. Invariant: the current week
  // (offset 0) always starts today; any later week is a full 7-day week.
  useEffect(() => {
    const anchor = selectedOffsets[0];
    const startDayIdx = anchor === 0 ? todayIdx : 0;
    if (
      data.menuWeek?.offset !== anchor ||
      (data.menuWeek?.startDayIdx ?? 0) !== startDayIdx
    ) {
      setData((d) => ({ ...d, menuWeek: { offset: anchor, startDayIdx } }));
    }
  }, [selectedOffsets, todayIdx, data.menuWeek, setData]);

  const toggleWeek = (offset) => {
    setData((d) => {
      const current = Array.isArray(d.menuWeekOffsets) && d.menuWeekOffsets.length
        ? d.menuWeekOffsets
        : [d.menuWeek?.offset ?? 0];
      const has = current.includes(offset);
      let next;
      if (has) {
        if (current.length <= 1) return d; // always keep at least one week selected
        next = current.filter((o) => o !== offset);
      } else {
        if (current.length >= MAX_MENU_WEEKS) return d;
        next = [...current, offset];
      }
      next = next.sort((a, b) => a - b);
      const anchor = next[0];
      return {
        ...d,
        menuWeekOffsets: next,
        menuWeek: { offset: anchor, startDayIdx: anchor === 0 ? todayIdx : 0 },
      };
    });
  };

  const weeks = buildCalendarWeeks(MAX_MENU_WEEKS);

  // The select-column card is drawn as one continuous pill that hugs the
  // circles: it must start above the FIRST circle and end below the LAST one
  // with equal padding, regardless of the month labels that add variable
  // height between week rows. So we measure the circles and size the card.
  const wrapRef = useRef(null);
  const firstCircleRef = useRef(null);
  const lastCircleRef = useRef(null);
  const [cardRect, setCardRect] = useState(null);
  useLayoutEffect(() => {
    const measure = () => {
      const wrap = wrapRef.current;
      const first = firstCircleRef.current;
      const last = lastCircleRef.current;
      if (!wrap || !first || !last) return;
      const PAD = 6;
      const wrapBox = wrap.getBoundingClientRect();
      const firstBox = first.getBoundingClientRect();
      const lastBox = last.getBoundingClientRect();
      const top = firstBox.top - wrapBox.top - PAD;
      const height = lastBox.bottom - wrapBox.top + PAD - top;
      setCardRect({ top, height });
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [weeks.length]);

  return (
    <OnboardingShell
      title="¿Para cuándo quieres el menú?"
      subtitle={`Toca las semanas que quieres planificar (hasta ${MAX_MENU_WEEKS})`}
      onBack={onBack}
      onReset={onReset}
      onNext={onNext}
      onFinish={onFinish}
      finishLabel="Generar menú"
    >
      {/* Month label above day headers — shows the first month in the calendar */}
      <div style={{
        fontSize: 11,
        fontWeight: 800,
        color: "#2d5a3d",
        letterSpacing: ".8px",
        textTransform: "uppercase",
        padding: "0 4px 4px",
      }}>
        {MONTH_NAMES_ES[weeks[0].monday.getMonth()]} {weeks[0].monday.getFullYear()}
      </div>

      {/* Day-of-week header */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(7, 1fr) 32px",
        gap: 0,
        padding: "0 4px",
        marginBottom: 1,
      }}>
        {WEEK_DAY_SHORT.map((d) => (
          <div key={d} style={{
            textAlign: "center",
            fontSize: 12,
            fontWeight: 800,
            color: "#4a6b55",
            letterSpacing: ".5px",
            padding: "4px 0",
          }}>{d}</div>
        ))}
        <div />
      </div>

      {/* Calendar grid — the select column (last 32px) is drawn as ONE
          continuous pill-shaped card that hugs the circles (measured), instead
          of a thin border repeated per row, so it reads as a single control
          rather than disconnected segments. */}
      <div style={{ position: "relative" }} ref={wrapRef}>
        <div style={{
          position: "absolute",
          top: cardRect ? cardRect.top : 0,
          height: cardRect ? cardRect.height : "100%",
          right: 4,
          width: 32,
          border: "1.5px solid #2d5a3d",
          borderRadius: 16,
          background: "rgba(45,90,61,.04)",
          pointerEvents: "none",
          opacity: cardRect ? 1 : 0,
        }} />
        <div style={{ display: "flex", flexDirection: "column", gap: 4, position: "relative" }}>
        {weeks.map(({ offset, monday, days }, weekIdx) => {
          const isSelected = selectedOffsets.includes(offset);
          const showMonthLabel =
            weekIdx > 0 &&
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
                onClick={() => toggleWeek(offset)}
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

                  {/* Select indicator — sits inside the continuous pill card
                      drawn as an absolute overlay above, so no per-row border. */}
                  <div style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    alignSelf: "stretch",
                  }}>
                    <span
                      ref={weekIdx === 0 ? firstCircleRef : weekIdx === weeks.length - 1 ? lastCircleRef : undefined}
                      style={{
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
      </div>

      {/* Variedad entre semanas: solo modo avanzado. En básico se asume
          "equilibrado" (moderate). */}
      {data.expertMode && selectedOffsets.length > 1 && (
        <div style={{ marginTop: 18, padding: 14, background: "#f7f9f7", borderRadius: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: "#142f1d", marginBottom: 12 }}>
            Variedad entre semanas
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            {VARIETY_OPTIONS.map((opt) => {
              const sel = (data.menuVarietyPref ?? "strict") === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setData((d) => ({ ...d, menuVarietyPref: opt.id }))}
                  style={{
                    position: "relative",
                    flex: 1, minWidth: 0,
                    height: 112,
                    borderRadius: 15,
                    overflow: "hidden",
                    border: "none",
                    padding: 0,
                    cursor: "pointer",
                    fontFamily: "inherit",
                    boxShadow: sel
                      ? "0 0 0 2.5px #2d5a3d, 0 6px 18px rgba(45,90,61,.3)"
                      : "0 1px 4px rgba(0,0,0,.1)",
                    transition: "box-shadow .16s ease",
                  }}
                >
                  {opt.img && (
                    <img
                      src={opt.img}
                      alt=""
                      style={{
                        position: "absolute", inset: 0, width: "100%", height: "100%",
                        objectFit: "cover", objectPosition: "center top",
                        filter: sel ? "none" : "saturate(.7) brightness(.95)",
                        transition: "filter .16s ease",
                      }}
                    />
                  )}
                  <div style={{
                    position: "absolute", inset: 0,
                    background: "linear-gradient(180deg, rgba(0,0,0,0) 35%, rgba(0,0,0,.65) 100%)",
                  }} />
                  {sel && (
                    <span style={{
                      position: "absolute", top: 5, right: 5,
                      width: 16, height: 16, borderRadius: 999,
                      background: "#2d5a3d", border: "1.5px solid #fff",
                      display: "inline-flex", alignItems: "center", justifyContent: "center",
                    }}>
                      <Check size={9} color="#fff" strokeWidth={3} />
                    </span>
                  )}
                  <div style={{
                    position: "absolute", bottom: 6, left: 4, right: 4,
                    fontSize: 9.5, fontWeight: 800, color: "#fff",
                    textAlign: "center", lineHeight: 1.2,
                  }}>
                    {opt.label}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
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
