import { memo, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Blend,
  BookOpen,
  BookOpenCheck,
  ChefHat,
  ChevronDown,
  Clock,
  Clock3,
  CircleHelp,
  Coffee,
  Download,
  Droplets,
  Drumstick,
  Egg,
  Fish,
  Flame,
  Gauge,
  Leaf,
  Microwave,
  Moon,
  RotateCcw,
  RotateCw,
  Shell,
  SlidersHorizontal,
  Share2,
  ShoppingCart,
  Soup,
  Sparkles,
  Sun,
  Users,
  Utensils,
  UtensilsCrossed,
  Wand2,
  Wheat,
  Wrench,
  X,
  Zap,
} from "lucide-react";
import { visualForRecipe, paletteForRecipe } from "../assets/dishes/dishVisuals.js";
import { dishImageForRecipe } from "../assets/dishes/dishImages.js";
import { resolveRecipeAllergens } from "../lib/allergens.js";
import { membersOfGroup } from "../lib/groups.js";
import { eatersForSlot } from "../lib/slotEaters.js";
import { Avatar, BottomNav, Chip, GroupScopePicker, SegmentedControl, WeekRangeBadge, bottomNavSpacer } from "../components/ui.jsx";
import { CookTimeEditor } from "../components/CookTimeEditor.jsx";
import { RECIPES_BY_ID } from "../data/recipes.js";
import { downloadMenu, shareMenu } from "../lib/menuExport.js";
import { generateRecipeSteps } from "../lib/aiPlanner.js";
import { DAYS, getMeals, isLunchMeal, dayLabel, slotKey } from "../lib/planner.js";
import { initialsOf, AVATAR_PALETTE, memberAvatarColor } from "../lib/stages.js";
import {
  APPLIANCE_LABELS,
  APPLIANCE_COLORS,
  selectMethodForRecipe,
  methodDifficultyLabel,
  userApplianceSlugs,
} from "../lib/applianceMethods.js";
import {
  calendarDayNumber,
  formatWeekRangeLabel,
  getWeekDates,
  getWeekDatesByMenuWeek,
  todayDayIdx,
} from "../lib/weekCalendar.js";

const ICONS_BY_TYPE = {
  fish: Fish,
  meat: Drumstick,
  egg: Egg,
  legume: Soup,
  pasta: Wheat,
  rice: Wheat,
  greens: Leaf,
  soup: Soup,
  chef: ChefHat,
};

/** Lucide icon per appliance method. */
const APPLIANCE_ICONS = {
  airfryer: Zap,
  horno: Flame,
  thermomix: Blend,
  vaporera: Droplets,
  olla_express: Gauge,
  microondas: Microwave,
};


function tagPalette(recipe) {
  return paletteForRecipe(recipe);
}

const MEAL_META = {
  Desayuno: { label: "Desayuno", Icon: Coffee },
  Comida:   { label: "Comida",   Icon: Sun    },
  Cena:     { label: "Cena",     Icon: Moon   },
};

/** Structural colors — not used by recipe families in dishVisuals.js */
const DAY_STYLE = { bg: "#f1f5f9", bar: "#64748b", text: "#334155" };
const MEAL_STYLE = {
  Desayuno: { color: "#a16207", bg: "#fef9c3" },
  Comida:   { color: "#0d9488", bg: "#ccfbf1" },
  Cena:     { color: "#6366f1", bg: "#e0e7ff" },
};

function DaySectionHeader({ day, dayNumber }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: 10,
        padding: "8px 12px",
        background: DAY_STYLE.bg,
        borderRadius: 10,
        borderLeft: `3px solid ${DAY_STYLE.bar}`,
      }}
    >
      <span
        style={{
          fontSize: 13,
          fontWeight: 900,
          color: DAY_STYLE.text,
          letterSpacing: 0.5,
          textTransform: "uppercase",
        }}
      >
        {dayLabel(day)}
      </span>
      <span
        style={{
          fontSize: 18,
          fontWeight: 900,
          color: DAY_STYLE.bar,
          lineHeight: 1,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {dayNumber}
      </span>
    </div>
  );
}

const DAY_LETTERS = { Lun: "L", Mar: "M", Mié: "X", Jue: "J", Vie: "V", Sáb: "S", Dom: "D" };
const MENU_VIEW_OPTIONS = [
  { id: "dia", label: "Por día" },
  { id: "semana", label: "Semana" },
];
const GROUP_ABBREV = { Adultos: "A", Niños: "N", "Bebé": "B", Familia: "F" };

const menuHelpIconBtnStyle = {
  width: 32,
  height: 32,
  borderRadius: 999,
  border: "1px solid #e0eae3",
  background: "#fff",
  color: "#2d5a3d",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  cursor: "pointer",
  fontFamily: "inherit",
  flexShrink: 0,
};

function GroupMenuBadge({ group, size = 22 }) {
  const abbrev = GROUP_ABBREV[group.label] ?? group.label.charAt(0);
  return (
    <span
      title={group.label}
      style={{
        width: size,
        height: size,
        borderRadius: 999,
        background: group.color,
        color: "#fff",
        fontSize: size <= 20 ? 9 : 10,
        fontWeight: 900,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
        boxShadow: `0 1px 4px ${group.color}44`,
      }}
    >
      {abbrev}
    </span>
  );
}

function MealSectionLabel({ meal, activeGroups = null }) {
  const meta = MEAL_META[meal] ?? { label: meal, Icon: Utensils };
  const accent = MEAL_STYLE[meal] ?? { color: "#64748b", bg: "#f1f5f9" };
  const Icon = meta.Icon;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          padding: "5px 12px",
          borderRadius: 999,
          background: accent.bg,
          color: accent.color,
          fontSize: 12,
          fontWeight: 800,
        }}
      >
        <Icon size={14} strokeWidth={2.4} />
        {meta.label}
      </span>
      {activeGroups && activeGroups.length > 0 && (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
          {activeGroups.map((g) => (
            <GroupMenuBadge key={g.id} group={g} size={20} />
          ))}
        </span>
      )}
      <span style={{ flex: 1, height: 1, background: "#e8f0ea" }} />
    </div>
  );
}

function MenuHelpBubble({ onClose, multiGroup }) {
  const rows = [
    {
      title: "Menú",
      text: multiGroup
        ? "T = todos los menús. A, N y B filtran adultos, niños y bebé. Los círculos con borde son menús."
        : "Un solo menú para la familia. Los bebés pueden tener menú aparte si lo configuraste.",
    },
    {
      title: "Personas",
      text: "Toca una inicial para ver solo sus comidas. Los círculos rellenos de color son personas.",
    },
    {
      title: "En cada plato",
      text: multiGroup
        ? "La letra A, N o B indica a qué menú pertenece. Las iniciales junto a los alérgenos muestran quién come si no come todo el grupo."
        : "Las iniciales junto a los alérgenos muestran quién come ese plato si no come todo el grupo.",
    },
    {
      title: "Vista",
      text: "Por día recorres un día; Semana muestra toda la semana con cabecera por día.",
    },
  ];

  return (
    <div
      style={{
        marginBottom: 12,
        padding: "14px 14px 12px",
        borderRadius: 14,
        background: "#fff",
        border: "1px solid #e0eae3",
        boxShadow: "0 8px 28px rgba(20,47,29,.1)",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 10,
        }}
      >
        <span style={{ fontSize: 13, fontWeight: 900, color: "#142f1d" }}>Cómo leer tu menú</span>
        <button
          type="button"
          onClick={onClose}
          style={{ ...menuHelpIconBtnStyle, width: 28, height: 28 }}
          aria-label="Cerrar ayuda"
        >
          <X size={14} />
        </button>
      </div>
      {rows.map((row, idx) => (
        <div
          key={row.title}
          style={{
            padding: idx > 0 ? "10px 0 0" : 0,
            borderTop: idx > 0 ? "1px solid #f0f4f1" : "none",
          }}
        >
          <div
            style={{
              fontSize: 11,
              fontWeight: 800,
              color: "#2d5a3d",
              textTransform: "uppercase",
              letterSpacing: ".04em",
              marginBottom: 4,
            }}
          >
            {row.title}
          </div>
          <p style={{ margin: 0, fontSize: 12, fontWeight: 500, color: "#5a7262", lineHeight: 1.45 }}>
            {row.text}
          </p>
        </div>
      ))}
    </div>
  );
}

function MenuViewDivider({ options, value }) {
  const activeIdx = options.findIndex((o) => o.id === value);
  return (
    <div style={{ display: "flex", gap: 5, marginBottom: 12, paddingTop: 2 }}>
      {options.map((opt, i) => {
        const isActive = i === activeIdx;
        const isPast = i < activeIdx;
        return (
          <div
            key={opt.id}
            style={{
              flex: 1,
              height: isActive ? 4 : 3,
              borderRadius: 999,
              background: isPast || isActive ? "#2d5a3d" : "#d6e6db",
              opacity: isActive ? 1 : isPast ? 0.55 : 1,
              boxShadow: isActive ? "0 0 8px rgba(45,90,61,.55)" : "none",
              transition: "all .28s cubic-bezier(.4,0,.2,1)",
            }}
          />
        );
      })}
    </div>
  );
}

function VerticalSectionLabel({ text, color }) {
  return (
    <div
      style={{
        width: 28,
        flexShrink: 0,
        alignSelf: "stretch",
        background: color,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "12px 5px",
      }}
      aria-hidden
    >
      <span
        style={{
          writingMode: "vertical-rl",
          transform: "rotate(180deg)",
          fontSize: 10,
          fontWeight: 900,
          color: "#fff",
          letterSpacing: 1.4,
          textTransform: "uppercase",
          whiteSpace: "nowrap",
        }}
      >
        {text}
      </span>
    </div>
  );
}

function FilterSectionRow({ label, color, children }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "stretch",
        width: "100%",
        background: "#fff",
        borderBottom: "1px solid #e0eae3",
      }}
    >
      <VerticalSectionLabel text={label} color={color} />
      <div
        style={{
          flex: 1,
          minWidth: 0,
          padding: "10px 14px 10px 12px",
          display: "flex",
          alignItems: "center",
        }}
      >
        {children}
      </div>
    </div>
  );
}

function memberEatsSlot(member, schedule, day, meal) {
  const status = schedule[slotKey(member.id, day, meal)] ?? "casa";
  return status === "casa" || status === "tupper";
}

function groupForMember(memberId, groups) {
  return groups.find((g) => g.memberIds.includes(memberId));
}

/** Filled person badge — visually distinct from menu scope circles (outline when idle). */
function PersonInitialBadge({
  member,
  color,
  size = 36,
  active = true,
  onClick,
  title,
}) {
  const abbrev = initialsOf(member.name);
  const shared = {
    width: size,
    height: size,
    borderRadius: 999,
    background: color,
    color: "#fff",
    fontSize: size <= 22 ? 8 : 11,
    fontWeight: 900,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    opacity: active ? 1 : 0.55,
    boxShadow: active ? `0 3px 10px ${color}55` : `0 1px 4px ${color}33`,
    transition: "opacity .15s ease, box-shadow .15s ease",
    border: "none",
    padding: 0,
    fontFamily: "inherit",
    cursor: onClick ? "pointer" : "default",
  };

  if (onClick) {
    return (
      <button type="button" onClick={onClick} title={title ?? member.name} style={shared}>
        {abbrev}
      </button>
    );
  }

  return (
    <span title={title ?? member.name} style={shared}>
      {abbrev}
    </span>
  );
}

function PersonScopeCircle({ member, color, active, onClick }) {
  return (
    <PersonInitialBadge
      member={member}
      color={color}
      size={36}
      active={active}
      onClick={onClick}
    />
  );
}

function MenuFilterPanel({
  groups,
  scope,
  onScopeChange,
  members,
  memberScope,
  onMemberScopeChange,
  multiGroup,
}) {
  return (
    <div style={{ width: "100%" }}>
      <FilterSectionRow label="Menú" color="#2d5a3d">
        {multiGroup ? (
          <GroupScopePicker
            groups={groups}
            scope={scope}
            onChange={onScopeChange}
            style={{ marginBottom: 0, width: "100%" }}
          />
        ) : (
          <span style={{ fontSize: 13, fontWeight: 800, color: "#2d5a3d" }}>
            {groups[0]?.label ?? "Familia"}
          </span>
        )}
      </FilterSectionRow>

      <FilterSectionRow label="Personas" color="#1a3a24">
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            flexWrap: "wrap",
            width: "100%",
          }}
        >
          {members.map((member) => {
            const color = memberAvatarColor(member.id, members);
            const active = memberScope === member.id;
            return (
              <PersonScopeCircle
                key={member.id}
                member={member}
                color={color}
                active={active}
                onClick={() => onMemberScopeChange(active ? null : member.id)}
              />
            );
          })}
        </div>
      </FilterSectionRow>
    </div>
  );
}

function formatQty(qty, unit) {
  if (unit === "ud") return `${Math.ceil(qty)} ${Math.ceil(qty) === 1 ? "ud" : "uds"}`;
  if (unit === "g" && qty >= 1000) return `${(qty / 1000).toFixed(1)} kg`;
  if (unit === "ml" && qty >= 1000) return `${(qty / 1000).toFixed(1)} l`;
  return `${Math.ceil(qty)} ${unit}`;
}

function scaledIngredients(recipe, eaters) {
  const factor = Math.max(1, eaters) / recipe.servings;
  return recipe.ingredients.map((ing) => ({
    ...ing,
    label: formatQty(ing.qty * factor, ing.unit),
  }));
}

function MacroPill({ label, value, tone = "#2d5a3d" }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: "4px 8px",
        borderRadius: 999,
        background: "#f4f7f4",
        color: tone,
        fontSize: 10.5,
        fontWeight: 800,
      }}
    >
      <span style={{ fontWeight: 900 }}>{value}</span>
      <span style={{ opacity: 0.7, fontWeight: 700 }}>{label}</span>
    </span>
  );
}

function DishIcon({ recipe, size = 44, imageUrl = null }) {
  const visual = visualForRecipe(recipe);
  const Icon = ICONS_BY_TYPE[recipe.iconType] ?? Utensils;
  const radius = Math.round(size * 0.3);
  const [imgFailed, setImgFailed] = useState(false);

  if (imageUrl && !imgFailed) {
    return (
      <img
        src={imageUrl}
        alt={recipe.name}
        width={size}
        height={size}
        loading="lazy"
        onError={() => setImgFailed(true)}
        style={{
          width: size,
          height: size,
          borderRadius: radius,
          objectFit: "cover",
          flexShrink: 0,
          background: visual.surface,
          boxShadow: `0 0 0 2px ${visual.accent}`,
        }}
      />
    );
  }

  return (
    <span
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        color: "#fff",
        background: visual.accent,
        flexShrink: 0,
      }}
    >
      <Icon size={Math.round(size * 0.48)} strokeWidth={2.2} />
    </span>
  );
}

function DishVisual({ recipe, height = 220, imageUrl = null }) {
  const visual = visualForRecipe(recipe);
  const Icon = ICONS_BY_TYPE[recipe.iconType] ?? Utensils;
  const [imgFailed, setImgFailed] = useState(false);
  const showPhoto = imageUrl && !imgFailed;

  return (
    <div
      style={{
        height,
        position: "relative",
        overflow: "hidden",
        borderRadius: 22,
        background: visual.surface,
      }}
    >
      {showPhoto ? (
        <img
          src={imageUrl}
          alt={recipe.name}
          onError={() => setImgFailed(true)}
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
          }}
        />
      ) : (
        <>
          <svg
            viewBox="0 0 320 220"
            preserveAspectRatio="xMidYMid slice"
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
            aria-hidden="true"
          >
            <circle cx="252" cy="44" r="58" fill={visual.ink} fillOpacity="0.07" />
            <circle cx="280" cy="186" r="36" fill={visual.ink} fillOpacity="0.05" />
            <path
              d="M-10 168 Q 80 132 170 168 T 340 168 L 340 230 L -10 230 Z"
              fill={visual.ink}
              fillOpacity="0.06"
            />
            <path
              d="M-10 196 Q 80 168 170 196 T 340 196 L 340 230 L -10 230 Z"
              fill={visual.ink}
              fillOpacity="0.05"
            />
          </svg>
          <span
            style={{
              position: "absolute",
              top: 18,
              left: 18,
              width: 56,
              height: 56,
              borderRadius: 18,
              background: "#fff",
              color: visual.ink,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Icon size={28} strokeWidth={1.7} />
          </span>
        </>
      )}

      {showPhoto && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "linear-gradient(to top, rgba(8,18,12,.78) 0%, rgba(8,18,12,.15) 45%, rgba(8,18,12,0) 70%)",
          }}
        />
      )}

      <div
        style={{
          position: "absolute",
          left: 20,
          right: 20,
          bottom: 20,
          color: showPhoto ? "#fff" : visual.ink,
        }}
      >
        <div
          style={{
            fontSize: 10.5,
            fontWeight: 800,
            textTransform: "uppercase",
            letterSpacing: 1.5,
            opacity: showPhoto ? 0.85 : 0.62,
            marginBottom: 4,
          }}
        >
          Receta de la semana
        </div>
        <div
          style={{
            fontSize: 24,
            fontWeight: 900,
            lineHeight: 1.05,
            letterSpacing: "-.4px",
            textShadow: showPhoto ? "0 1px 12px rgba(0,0,0,.5)" : "none",
          }}
        >
          {recipe.name}
        </div>
      </div>
    </div>
  );
}

function ProfileButton({ onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        padding: "7px 14px 7px 10px",
        borderRadius: 12,
        border: "1px solid #2d5a3d",
        background: "#2d5a3d",
        cursor: "pointer",
        fontFamily: "inherit",
        flexShrink: 0,
      }}
    >
      <SlidersHorizontal size={15} color="#fff" />
      <div style={{ fontSize: 13, fontWeight: 900, color: "#fff", letterSpacing: "-.2px", lineHeight: 1 }}>
        Tu perfil
      </div>
    </button>
  );
}

const COOK_LEVELS = [
  { id: "basic",  label: "Básico",           icon: <BookOpenCheck size={20} /> },
  { id: "normal", label: "Normal",            icon: <ChefHat size={20} /> },
  { id: "pro",    label: "Me gusta cocinar",  icon: <Sparkles size={20} /> },
];

const KITCHEN_TOOLS = ["Airfryer", "Horno", "Microondas", "Thermomix", "Olla rápida", "Vaporera"];

const FREQ_OPTIONS = [
  { id: "verdura", label: "Verdura" },
  { id: "pescado", label: "Pescado" },
  { id: "legumbres", label: "Legumbres" },
];

const profileLabelStyle = {
  fontSize: 10,
  fontWeight: 800,
  color: "#8d978f",
  textTransform: "uppercase",
  letterSpacing: 1,
  marginBottom: 6,
};

function FreqStepper({ label, value, onChange }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
      <span style={{ fontSize: 13, fontWeight: 600, color: "#1a3a24" }}>{label}</span>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <button
          type="button"
          onClick={() => onChange(Math.max(0, value - 1))}
          style={{
            width: 28, height: 28, borderRadius: 8, border: "1px solid #d7e1db",
            background: "#fff", cursor: "pointer", fontSize: 16, fontWeight: 700,
            color: "#2d5a3d", display: "flex", alignItems: "center", justifyContent: "center",
            fontFamily: "inherit",
          }}
        >
          −
        </button>
        <span style={{ fontSize: 13, fontWeight: 700, color: "#1a3a24", minWidth: 40, textAlign: "center" }}>
          ≥{value}/sem
        </span>
        <button
          type="button"
          onClick={() => onChange(Math.min(7, value + 1))}
          style={{
            width: 28, height: 28, borderRadius: 8, border: "1px solid #d7e1db",
            background: "#fff", cursor: "pointer", fontSize: 16, fontWeight: 700,
            color: "#2d5a3d", display: "flex", alignItems: "center", justifyContent: "center",
            fontFamily: "inherit",
          }}
        >
          +
        </button>
      </div>
    </div>
  );
}

function AccordionSection({ title, icon: Icon, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ borderBottom: "1px solid #e8f0ea" }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "12px 0", border: "none", background: "transparent", cursor: "pointer",
          fontFamily: "inherit",
        }}
      >
        <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {Icon && <Icon size={15} color="#2d5a3d" />}
          <span style={{ fontSize: 13, fontWeight: 700, color: "#142f1d" }}>
            {title}
          </span>
        </span>
        <ChevronDown
          size={16}
          color="#9ab0a1"
          style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform .2s" }}
        />
      </button>
      {open && <div style={{ paddingBottom: 14 }}>{children}</div>}
    </div>
  );
}

function ProfileSettingsSheet({ data, setData, onClose, onRegenerate }) {
  const members = data.members ?? [];
  const allergies = [...new Set(members.flatMap((m) => m.allergies ?? []))];
  const dislikes = [...new Set([...(data.dislikes ?? []), ...members.flatMap((m) => m.dislikes ?? [])])];
  const allTools = [...KITCHEN_TOOLS, ...(data.customKitchenTools ?? [])];

  // Track if user changed anything to prompt regeneration
  const snapshotRef = useRef(JSON.stringify({ cookLevel: data.cookLevel, kitchenTools: data.kitchenTools }));
  const [confirmRegen, setConfirmRegen] = useState(false);

  const wrappedSetData = (updater) => {
    setData(updater);
    snapshotRef.current = "__dirty__";
  };

  const toggleTool = (tool) =>
    wrappedSetData((d) => ({
      ...d,
      kitchenTools: (d.kitchenTools ?? []).includes(tool)
        ? (d.kitchenTools ?? []).filter((v) => v !== tool)
        : [...(d.kitchenTools ?? []), tool],
    }));

  const handleClose = () => {
    if (snapshotRef.current === "__dirty__") {
      setConfirmRegen(true);
    } else {
      onClose();
    }
  };

  if (confirmRegen) {
    return (
      <div
        style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,.5)",
          zIndex: 160, display: "flex", alignItems: "center", justifyContent: "center",
          padding: "0 24px",
        }}
      >
        <div style={{
          background: "#fff", borderRadius: 20, padding: "28px 22px 22px",
          width: "100%", maxWidth: 340, textAlign: "center",
        }}>
          <p style={{ margin: "0 0 6px", fontSize: 17, fontWeight: 900, color: "#142f1d" }}>
            ¿Generar nuevo menú?
          </p>
          <p style={{ margin: "0 0 22px", fontSize: 13, color: "#526057", lineHeight: 1.5 }}>
            Has cambiado tu perfil. ¿Quieres que generemos un menú nuevo con estas condiciones?
          </p>
          <button
            type="button"
            onClick={() => { setConfirmRegen(false); onClose(); onRegenerate(); }}
            style={{
              width: "100%", padding: "13px", borderRadius: 12, border: "none",
              background: "#2d5a3d", color: "#fff", fontSize: 14, fontWeight: 800,
              cursor: "pointer", fontFamily: "inherit", marginBottom: 10,
            }}
          >
            Sí, generar nuevo menú
          </button>
          <button
            type="button"
            onClick={() => { setConfirmRegen(false); onClose(); }}
            style={{
              width: "100%", padding: "13px", borderRadius: 12,
              border: "1.5px solid #dde8e0", background: "#fff",
              color: "#526057", fontSize: 14, fontWeight: 700,
              cursor: "pointer", fontFamily: "inherit",
            }}
          >
            No, solo guardar cambios
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      onClick={handleClose}
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
          maxHeight: "88dvh",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* sticky header */}
        <div style={{ padding: "16px 18px 0", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
            <h3 style={{ margin: 0, fontSize: 17, fontWeight: 900, color: "#142f1d" }}>Tu perfil</h3>
            <button
              type="button"
              onClick={handleClose}
              aria-label="Cerrar"
              style={{
                border: "none", background: "#f0f4f1", borderRadius: 999,
                width: 32, height: 32, cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}
            >
              <X size={18} />
            </button>
          </div>
        </div>
        {/* scrollable body */}
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            WebkitOverflowScrolling: "touch",
            padding: "0 18px calc(18px + env(safe-area-inset-bottom, 0px))",
          }}
        >
        {/* ── Evitar / alergias ── */}
        <AccordionSection title="Evitar" icon={UtensilsCrossed}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {allergies.length === 0 && dislikes.length === 0 && (
              <span style={{ fontSize: 12, color: "#9ab0a1" }}>—</span>
            )}
            {allergies.map((a) => (
              <span key={a} style={{ padding: "4px 10px", borderRadius: 20, background: "#fef3f0", fontSize: 12, fontWeight: 600, color: "#a83a1f" }}>
                {a}
              </span>
            ))}
            {dislikes.map((d) => (
              <span key={d} style={{ padding: "4px 10px", borderRadius: 20, background: "#f5f0e8", fontSize: 12, fontWeight: 600, color: "#8a6d3b" }}>
                {d}
              </span>
            ))}
          </div>
        </AccordionSection>

        {/* ── Nivel de cocina ── */}
        <AccordionSection title="Nivel de cocina" icon={ChefHat}>
          <div style={{ display: "flex", gap: 8 }}>
            {COOK_LEVELS.map((l) => {
              const sel = data.cookLevel === l.id;
              return (
                <button
                  key={l.id}
                  type="button"
                  onClick={() => wrappedSetData((d) => ({ ...d, cookLevel: l.id }))}
                  style={{
                    flex: 1, display: "flex", flexDirection: "column", alignItems: "center",
                    gap: 6, padding: "12px 8px 10px", borderRadius: 14, cursor: "pointer",
                    background: sel ? "#2d5a3d" : "#f4f7f5",
                    border: `1.5px solid ${sel ? "#2d5a3d" : "#e3ebe6"}`,
                    color: sel ? "#fff" : "#9ab0a1",
                    transition: "all .15s ease", fontFamily: "inherit",
                    fontSize: 12, fontWeight: 700,
                  }}
                >
                  {l.icon}
                  {l.label}
                </button>
              );
            })}
          </div>
        </AccordionSection>

        {/* ── Herramientas ── */}
        <AccordionSection title="Herramientas" icon={Wrench}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 6 }}>
            {allTools.map((t) => {
              const sel = (data.kitchenTools ?? []).includes(t);
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => toggleTool(t)}
                  style={{
                    height: 30, borderRadius: 7,
                    border: `1.5px solid ${sel ? "#2d5a3d" : "#dde8e0"}`,
                    background: sel ? "#2d5a3d" : "#fff",
                    color: sel ? "#fff" : "#526057",
                    fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}
                >
                  {t}
                </button>
              );
            })}
          </div>
        </AccordionSection>

        {/* ── Tiempo disponible ── */}
        <AccordionSection title="Tiempo disponible" icon={Clock}>
          <CookTimeEditor data={data} setData={wrappedSetData} />
        </AccordionSection>

        {/* ── CTA ── */}
        <div style={{ paddingTop: 16 }}>
          <button
            type="button"
            onClick={() => { onClose(); onRegenerate(); }}
            style={{
              width: "100%", padding: "12px", borderRadius: 12,
              border: "none", background: "#2d5a3d", color: "#fff",
              fontSize: 13, fontWeight: 800, cursor: "pointer", fontFamily: "inherit",
            }}
          >
            Regenerar menú
          </button>
        </div>
        </div>{/* end scrollable body */}
      </div>
    </div>
  );
}

function dishesFromSlot(slot, isLunch) {
  if (!slot?.recipeId) return [];
  const items = [];
  if (isLunch && slot.firstRecipeId) {
    items.push({
      course: "1º",
      courseKey: "first",
      recipeId: slot.firstRecipeId,
    });
  }
  items.push({
    course: isLunch && slot.firstRecipeId ? "2º" : null,
    courseKey: "main",
    recipeId: slot.recipeId,
  });
  return items;
}

function DishCard({
  slot,
  onTap,
  courseLabel = null,
  showDivider = true,
  eaterMembers = null,
  allMembers = [],
  groups = [],
  group = null,
  showGroupBadge = false,
  kitchenTools = [],
}) {
  if (!slot) {
    return (
      <div style={{ padding: "10px 0", fontSize: 12, color: "#bbb", fontStyle: "italic" }}>
        No aplica
      </div>
    );
  }

  const recipe = RECIPES_BY_ID[slot.recipeId];
  if (!recipe) return null;

  const palette = tagPalette(recipe);
  const allergenItems = resolveRecipeAllergens(recipe.allergens);
  const method = selectMethodForRecipe(recipe, kitchenTools);
  const MethodIcon = method ? APPLIANCE_ICONS[method.appliance] : null;

  return (
    <button
      type="button"
      onClick={onTap}
      style={{
        width: "100%",
        border: "none",
        borderBottom: showDivider ? "1px solid #e8f0ea" : "none",
        textAlign: "left",
        display: "flex",
        gap: 12,
        padding: "12px 2px",
        background: "transparent",
        cursor: "pointer",
        fontFamily: "inherit",
      }}
    >
      <DishIcon recipe={recipe} size={44} imageUrl={dishImageForRecipe(recipe)} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
          {showGroupBadge && group && <GroupMenuBadge group={group} />}
          <span
            style={{
              fontSize: 15,
              fontWeight: 900,
              color: "#142f1d",
              lineHeight: 1.25,
              letterSpacing: "-.15px",
            }}
          >
            {recipe.name}
          </span>
          {courseLabel && (
            <span
              style={{
                fontSize: 9,
                fontWeight: 900,
                color: palette.accent,
                background: `${palette.surface}`,
                padding: "2px 7px",
                borderRadius: 6,
              }}
            >
              {courseLabel}
            </span>
          )}
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            marginTop: 6,
            flexWrap: "wrap",
          }}
        >
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              fontSize: 12,
              fontWeight: 600,
              color: "#8d978f",
            }}
          >
            <Clock3 size={13} strokeWidth={2.2} />
            {method ? method.time : recipe.time} min
          </span>
          {method && MethodIcon && (
            <span
              title={APPLIANCE_LABELS[method.appliance]}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                fontSize: 11,
                fontWeight: 800,
                color: APPLIANCE_COLORS[method.appliance],
                background: `${APPLIANCE_COLORS[method.appliance]}14`,
                padding: "2px 7px",
                borderRadius: 999,
              }}
            >
              <MethodIcon size={12} strokeWidth={2.4} />
              {APPLIANCE_LABELS[method.appliance]}
            </span>
          )}
          {slot.mode === "tupper" && (
            <span
              style={{
                fontSize: 10,
                fontWeight: 800,
                color: "#a85a00",
              }}
            >
              · tupper
            </span>
          )}
          {allergenItems.length > 0 && (
            <>
              <span style={{ color: "#dde8e0", fontSize: 12 }}>·</span>
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 5,
                }}
              >
                {allergenItems.map(({ id, Icon, label, color }) => (
                  <span
                    key={id}
                    title={label}
                    aria-label={label}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      color,
                    }}
                  >
                    <Icon size={14} strokeWidth={2.2} />
                  </span>
                ))}
              </span>
            </>
          )}
          {eaterMembers && eaterMembers.length > 0 && (
            <>
              <span style={{ color: "#dde8e0", fontSize: 12 }}>·</span>
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  flexWrap: "wrap",
                }}
              >
                {eaterMembers.map((member) => {
                  const color = memberAvatarColor(member.id, allMembers);
                  return (
                    <PersonInitialBadge
                      key={member.id}
                      member={member}
                      color={color}
                      size={22}
                      active
                    />
                  );
                })}
              </span>
            </>
          )}
        </div>
      </div>
    </button>
  );
}

export const MenuScreen = memo(function MenuScreen({
  data,
  setData,
  menuPlan,
  isGenerating = false,
  error = null,
  onDishTap,
  onNav,
  onRegenerate,
  onRetry,
  onReset,
  onToast,
  user,
  onTrackEvent,
}) {
  const [scope, setScope] = useState("all");
  const [memberScope, setMemberScope] = useState(null);
  const [showMenuHelp, setShowMenuHelp] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [viewMode, setViewMode] = useState("dia"); // "dia" | "semana"
  const [viewAnimDir, setViewAnimDir] = useState(0);
  const [filterPanelOpen, setFilterPanelOpen] = useState(true);
  const [showShareDropdown, setShowShareDropdown] = useState(false);
  const [selectedDay, setSelectedDay] = useState(() => {
    const jsDay = new Date().getDay();
    const idx = jsDay === 0 ? 6 : jsDay - 1;
    if (data.menuWeek?.offset === 0) {
      return DAYS[Math.max(idx, data.menuWeek.startDayIdx ?? idx)];
    }
    return DAYS[Math.min(idx, 6)];
  });

  const { dates: weekDates, activeDays } = useMemo(() => {
    if (data.menuWeek) return getWeekDatesByMenuWeek(data.menuWeek);
    // Fallback: current week starting from today
    const startDayIdx = todayDayIdx();
    return getWeekDatesByMenuWeek({ offset: 0, startDayIdx });
  }, [data.menuWeek]);
  const weekLabel = useMemo(() => formatWeekRangeLabel(weekDates), [weekDates]);
  const hasMenu = !isGenerating && !error && Object.keys(menuPlan).length > 0;
  const multiGroup = data.groups.length > 1;

  const visibleGroups = useMemo(() => {
    if (!multiGroup || scope === "all") return data.groups;
    return data.groups.filter((g) => g.id === scope);
  }, [data.groups, multiGroup, scope]);

  const handleShare = async () => {
    try {
      const result = await shareMenu(data, menuPlan, data.groups);
      if (result.method === "cancelled") return;
      const msg =
        result.method === "share"
          ? "Menú compartido"
          : result.method === "clipboard"
            ? "Menú copiado al portapapeles"
            : "Menú descargado";
      onToast?.(msg);
      onTrackEvent?.("menu_exported", { method: result.method });
    } catch {
      onToast?.("No se pudo compartir el menú");
    }
  };

  const handleDownload = async () => {
    try {
      await downloadMenu(data, menuPlan, data.groups);
      onToast?.("Menú descargado");
      onTrackEvent?.("menu_exported", { method: "download" });
    } catch {
      onToast?.("No se pudo descargar el menú");
    }
  };

  const handleViewModeChange = (mode) => {
    if (mode === viewMode) return;
    setViewAnimDir(mode === "semana" ? 1 : -1);
    setViewMode(mode);
  };

  return (
    <div style={{ background: "#f7f9f7", minHeight: "100dvh" }}>
      <style>{`
        @keyframes menuViewFromRight {
          from { opacity: 0; transform: translateX(14px); }
          to { opacity: 1; transform: translateX(0); }
        }
        @keyframes menuViewFromLeft {
          from { opacity: 0; transform: translateX(-14px); }
          to { opacity: 1; transform: translateX(0); }
        }
        @keyframes shareDropIn {
          from { opacity: 0; transform: translateY(-6px) scale(.96); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
      {/* ── Top header: title + actions ── */}
      <div style={{ padding: "20px 20px 0" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 12, marginBottom: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <h2 style={{ fontSize: 26, fontWeight: 900, color: "#142f1d", margin: 0, letterSpacing: "-.7px" }}>
              Tu menú
            </h2>
            <button
              type="button"
              onClick={() => setShowMenuHelp((v) => !v)}
              style={{
                ...menuHelpIconBtnStyle,
                background: showMenuHelp ? "#e8f0ea" : "#fff",
              }}
              aria-label="Ayuda del menú"
              aria-expanded={showMenuHelp}
            >
              <CircleHelp size={17} strokeWidth={2.2} />
            </button>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {hasMenu && (
              <div style={{ position: "relative" }}>
                <button
                  type="button"
                  onClick={() => setShowShareDropdown((v) => !v)}
                  aria-label="Compartir o descargar"
                  style={{
                    ...iconChipButtonStyle,
                    background: showShareDropdown ? "#e8f0ea" : "#fff",
                  }}
                >
                  <Share2 size={16} />
                </button>
                {showShareDropdown && (
                  <>
                    <div
                      style={{ position: "fixed", inset: 0, zIndex: 49 }}
                      onClick={() => setShowShareDropdown(false)}
                    />
                    <div
                      style={{
                        position: "absolute",
                        right: 0,
                        top: "calc(100% + 8px)",
                        zIndex: 50,
                        background: "#fff",
                        borderRadius: 12,
                        boxShadow: "0 4px 20px rgba(0,0,0,.14)",
                        border: "1px solid #e6eee8",
                        overflow: "hidden",
                        minWidth: 164,
                        animation: "shareDropIn .18s ease-out",
                      }}
                    >
                      {[
                        { label: "Compartir", icon: <Share2 size={14} />, action: () => { handleShare(); setShowShareDropdown(false); } },
                        { label: "Descargar PDF", icon: <Download size={14} />, action: () => { handleDownload(); setShowShareDropdown(false); } },
                      ].map(({ label, icon, action }) => (
                        <button
                          key={label}
                          type="button"
                          onClick={action}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 10,
                            width: "100%",
                            padding: "12px 16px",
                            background: "none",
                            border: "none",
                            cursor: "pointer",
                            fontFamily: "inherit",
                            fontSize: 13,
                            fontWeight: 700,
                            color: "#142f1d",
                            textAlign: "left",
                          }}
                        >
                          {icon}
                          {label}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}
            <button type="button" onClick={onReset} style={ghostButtonStyle} disabled={isGenerating}>
              Reiniciar
            </button>
            {!isGenerating && (
              <button
                type="button"
                onClick={onRegenerate}
                aria-label="Regenerar menú"
                title="Regenerar menú"
                style={regenerateIconButtonStyle}
              >
                <RotateCw size={16} strokeWidth={2.2} />
              </button>
            )}
          </div>
        </div>

        {showMenuHelp && (
          <MenuHelpBubble onClose={() => setShowMenuHelp(false)} multiGroup={multiGroup} />
        )}
      </div>

      {/* ── Filter panel: collapsible con animación ── */}
      <div
        style={{
          overflow: "hidden",
          maxHeight: filterPanelOpen ? 300 : 0,
          opacity: filterPanelOpen ? 1 : 0,
          transition: "max-height 0.35s cubic-bezier(.4,0,.2,1), opacity 0.25s ease",
        }}
      >
        <MenuFilterPanel
          groups={data.groups}
          scope={scope}
          onScopeChange={setScope}
          members={data.members ?? []}
          memberScope={memberScope}
          onMemberScopeChange={setMemberScope}
          multiGroup={multiGroup}
        />
        <div style={{ height: 1, background: "#e0eae3" }} />
      </div>

      {/* ── Week card: fecha + perfil (centrado) + chevron colapso ── */}
      <div style={{ background: "#fff", padding: "12px 16px 0" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
          <WeekRangeBadge label={weekLabel} hideLabel />
          <div style={{ flex: 1, display: "flex", justifyContent: "center" }}>
            <ProfileButton onClick={() => setProfileOpen(true)} />
          </div>
          <button
            type="button"
            onClick={() => setFilterPanelOpen((v) => !v)}
            aria-label={filterPanelOpen ? "Colapsar filtros" : "Expandir filtros"}
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: 32,
              height: 32,
              borderRadius: 999,
              border: "1px solid #e6eee8",
              background: filterPanelOpen ? "#f0f5f1" : "#fff",
              cursor: "pointer",
              flexShrink: 0,
              fontFamily: "inherit",
              padding: 0,
            }}
          >
            <ChevronDown
              size={17}
              strokeWidth={2.5}
              color="#2d5a3d"
              style={{
                transform: filterPanelOpen ? "rotate(180deg)" : "rotate(0deg)",
                transition: "transform 0.3s cubic-bezier(.4,0,.2,1)",
                display: "block",
              }}
            />
          </button>
        </div>

        {/* Semana / Día toggle */}
        {hasMenu && (
          <>
            <SegmentedControl
              value={viewMode}
              onChange={handleViewModeChange}
              options={MENU_VIEW_OPTIONS}
              style={{ marginBottom: 0 }}
            />
            <MenuViewDivider options={MENU_VIEW_OPTIONS} value={viewMode} />
          </>
        )}
      </div>

      {/* ── Second divider: end of nav zone ── */}
      <div style={{ height: 1, background: "#e8eee9" }} />

      {!isGenerating && error && (
        <ErrorCard error={error} onRetry={onRetry} />
      )}

      {!isGenerating && !error && Object.keys(menuPlan).length === 0 && (
        <EmptyState onRegenerate={onRegenerate} />
      )}

      {!isGenerating && !error && Object.keys(menuPlan).length > 0 && (
      <div>
        {/* ── Week strip (only in "dia" mode) ── */}
        <div
          style={{
            overflow: "hidden",
            maxHeight: viewMode === "dia" ? 100 : 0,
            opacity: viewMode === "dia" ? 1 : 0,
            transition: "max-height .3s cubic-bezier(.4,0,.2,1), opacity .24s ease",
            background: "#fff",
          }}
        >
          <div style={{ display: "flex", alignItems: "flex-end", padding: "4px 12px 16px", gap: 2 }}>
            {activeDays.map((day) => {
              const meals = getMeals(data);
              const hasDot = meals.some((meal) =>
                visibleGroups.some((g) => menuPlan[g.id]?.[`${day}-${meal}`])
              );
              const isSelected = day === selectedDay;
              const dayNum = calendarDayNumber(day, weekDates);
              const isWeekend = day === "Sáb" || day === "Dom";
              return (
                <button key={day} type="button" onClick={() => setSelectedDay(day)}
                  style={{
                    flex: isSelected ? 1.4 : 1,
                    display: "flex", flexDirection: "column", alignItems: "center",
                    gap: 4, padding: isSelected ? "12px 6px 10px" : "8px 4px 8px",
                    borderRadius: 16, border: "none",
                    background: isSelected ? "#4cba6e" : isWeekend ? "#f0f8f3" : "transparent",
                    cursor: "pointer", fontFamily: "inherit",
                    transition: "all .2s cubic-bezier(.4,0,.2,1)",
                    boxShadow: isSelected ? "0 4px 16px #4cba6e55" : "none",
                  }}
                >
                  <span style={{
                    fontSize: isSelected ? 10 : 9, fontWeight: 800, letterSpacing: .5, textTransform: "uppercase",
                    color: isSelected ? "rgba(255,255,255,.85)" : isWeekend ? "#4cba6e" : "#aab5af",
                  }}>
                    {DAY_LETTERS[day]}
                  </span>
                  <span style={{
                    fontSize: isSelected ? 20 : 15, fontWeight: 900, lineHeight: 1,
                    color: isSelected ? "#fff" : "#15331c",
                    transition: "font-size .2s",
                  }}>
                    {dayNum}
                  </span>
                  <span style={{
                    width: 5, height: 5, borderRadius: 999,
                    background: isSelected ? "rgba(255,255,255,.6)" : hasDot ? "#4cba6e" : "transparent",
                  }} />
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Content ── */}
        <div
          key={viewMode}
          style={{
            padding: "14px 16px 0",
            paddingBottom: `calc(${bottomNavSpacer()} + 12px)`,
            animation:
              viewAnimDir > 0
                ? "menuViewFromRight .28s cubic-bezier(.4,0,.2,1) both"
                : viewAnimDir < 0
                  ? "menuViewFromLeft .28s cubic-bezier(.4,0,.2,1) both"
                  : "menuViewFromRight .28s cubic-bezier(.4,0,.2,1) both",
          }}
        >
          {(viewMode === "dia" ? [selectedDay] : activeDays).map((day) => {
            const members = data.members ?? [];
            const schedule = data.schedule ?? {};
            const meals = getMeals(data);
            const dayHasContent = meals.some((meal) =>
              visibleGroups.some((g) => menuPlan[g.id]?.[`${day}-${meal}`])
            );
            if (!dayHasContent) return null;
            return (
              <div key={day}>
                {viewMode === "semana" && (
                  <DaySectionHeader
                    day={day}
                    dayNumber={calendarDayNumber(day, weekDates)}
                  />
                )}

                {meals.map((meal) => {
                  const isLunch = isLunchMeal(meal);
                  const cards = visibleGroups.flatMap((g) => {
                    const result = [];
                    const slot = menuPlan[g.id]?.[`${day}-${meal}`] ?? null;
                    if (slot) {
                      if (memberScope) {
                        const groupMembers = membersOfGroup(g, members);
                        const eater = groupMembers.find((m) => m.id === memberScope);
                        if (!eater || !memberEatsSlot(eater, schedule, day, meal)) {
                          return result;
                        }
                      }
                      for (const dish of dishesFromSlot(slot, isLunch)) {
                        result.push({ kind: "dish", group: g, slot, dish });
                      }
                    }
                    return result;
                  });
                  if (cards.length === 0) return null;

                  const mealGroups =
                    multiGroup && scope === "all"
                      ? data.groups.filter((g) => menuPlan[g.id]?.[`${day}-${meal}`])
                      : null;

                  return (
                    <div key={meal} style={{ marginBottom: viewMode === "semana" ? 14 : 18 }}>
                      <MealSectionLabel meal={meal} activeGroups={mealGroups} />
                      <div style={{ display: "flex", flexDirection: "column" }}>
                        {cards.map((card, idx) => {
                          const groupMembers = membersOfGroup(card.group, members);
                          const slotEaters = eatersForSlot(card.group, members, schedule, day, meal);
                          const showEaters =
                            groupMembers.length > 1 &&
                            slotEaters.length > 0 &&
                            slotEaters.length < groupMembers.length;

                          return (
                            <DishCard
                              key={`dish-${card.group.id}-${card.dish.courseKey}-${idx}`}
                              slot={{ ...card.slot, recipeId: card.dish.recipeId }}
                              courseLabel={card.dish.course}
                              showDivider={idx < cards.length - 1}
                              eaterMembers={showEaters ? slotEaters : null}
                              allMembers={members}
                              groups={data.groups}
                              group={card.group}
                              showGroupBadge={multiGroup && scope === "all"}
                              kitchenTools={data.kitchenTools ?? []}
                              onTap={() =>
                                onDishTap({
                                  recipe: RECIPES_BY_ID[card.dish.recipeId],
                                  slot: card.slot,
                                  groupId: card.group.id,
                                  day,
                                  meal,
                                  group: card.group,
                                  course: card.dish.courseKey,
                                })
                              }
                            />
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
                {viewMode === "semana" && (
                  <div style={{ height: 1, background: "#e8f0ea", marginBottom: 20 }} />
                )}
              </div>
            );
          })}
        </div>
      </div>
      )}

      {profileOpen && (
        <ProfileSettingsSheet
          data={data}
          setData={setData}
          onClose={() => setProfileOpen(false)}
          onRegenerate={() => {
            setProfileOpen(false);
            onRegenerate();
          }}
        />
      )}

      <BottomNav active="menu" onNav={onNav} />
    </div>
  );
});

function ErrorCard({ error, onRetry }) {
  return (
    <div style={{ padding: "0 16px" }}>
      <div
        style={{
          padding: "16px 16px 14px",
          background: "#fff5ef",
          border: "1px solid #f1c08a",
          borderRadius: 16,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            marginBottom: 8,
            color: "#a85a00",
          }}
        >
          <AlertTriangle size={18} />
          <div style={{ fontSize: 14, fontWeight: 900 }}>No se pudo generar el menú</div>
        </div>
        <div style={{ fontSize: 12, color: "#7a4a12", marginBottom: 14, lineHeight: 1.45 }}>
          {error?.message ?? "La IA no respondió correctamente. Inténtalo de nuevo."}
        </div>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "10px 14px",
              borderRadius: 12,
              border: "none",
              background: "#1a3a24",
              color: "#fff",
              fontSize: 12,
              fontWeight: 900,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            <RotateCw size={13} />
            Reintentar
          </button>
        )}
      </div>
    </div>
  );
}

function EmptyState({ onRegenerate }) {
  return (
    <div style={{ padding: "0 16px" }}>
      <div
        style={{
          padding: "20px 16px",
          background: "#fff",
          border: "1px dashed #d9e5dd",
          borderRadius: 16,
          textAlign: "center",
        }}
      >
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: 12,
            background: "#eaf2ec",
            color: "#3f6948",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: 10,
          }}
        >
          <Wand2 size={18} />
        </div>
        <div style={{ fontSize: 14, fontWeight: 900, color: "#15331c", marginBottom: 4 }}>
          Aún no tienes menú esta semana
        </div>
        <div style={{ fontSize: 12, color: "#8d978f", marginBottom: 14, lineHeight: 1.45 }}>
          Pulsa "Generar" y la IA diseñará tu menú a partir de todo lo que has configurado.
        </div>
        {onRegenerate && (
          <button
            type="button"
            onClick={onRegenerate}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "10px 14px",
              borderRadius: 12,
              border: "none",
              background: "#1a3a24",
              color: "#fff",
              fontSize: 12,
              fontWeight: 900,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            <Wand2 size={13} />
            Generar
          </button>
        )}
      </div>
    </div>
  );
}

export function DishDetail({ recipe, slot, kitchenTools = [], onClose, onReject }) {
  const rejectReasons = ["No me gusta", "Esta semana no", "Tarda demasiado", "Lo comí hace poco"];
  const [rejected, setRejected] = useState(null);
  const [ingredientsOpen, setIngredientsOpen] = useState(false);
  // Pasos del método activo. La base usa los del catálogo (o IA bajo demanda);
  // los métodos por electrodoméstico se piden a /api/recipe-steps (caché Redis).
  const [steps, setSteps] = useState(() => recipe.steps ?? []);
  const [stepsLoading, setStepsLoading] = useState(
    () => (recipe.steps?.length ?? 0) === 0
  );
  const stepsCacheRef = useRef({});
  const ingredients = scaledIngredients(recipe, slot.eaters);
  const macros = recipe.macros;
  const selectedMethod = selectMethodForRecipe(recipe, kitchenTools);

  // Opciones de preparación: la tradicional (base) + solo los electrodomésticos
  // que el usuario tiene declarados en kitchenTools.
  const methodOptions = useMemo(() => {
    const base = {
      appliance: "base",
      label: "Tradicional",
      time: recipe.time,
      difficultyLabel: recipe.difficulty,
      prepSummary: recipe.prepSummary,
    };
    const userSlugs = userApplianceSlugs(kitchenTools);
    const others = (recipe.methods ?? [])
      .filter((m) => userSlugs.has(m.appliance))
      .map((m) => ({
        appliance: m.appliance,
        label: APPLIANCE_LABELS[m.appliance] ?? m.appliance,
        time: m.time,
        difficultyLabel: methodDifficultyLabel(m.difficulty),
        prepSummary: m.prepSummary || recipe.prepSummary,
      }));
    return [base, ...others];
  }, [recipe, kitchenTools]);

  const [activeAppliance, setActiveAppliance] = useState(
    () => selectedMethod?.appliance ?? "base",
  );
  const activeMethod =
    methodOptions.find((o) => o.appliance === activeAppliance) ?? methodOptions[0];

  const TITLE_GREEN = "#2d5a3d";

  useEffect(() => {
    let active = true;
    const ctrl = new AbortController();

    const cached = stepsCacheRef.current[activeAppliance];
    if (cached) {
      setSteps(cached);
      setStepsLoading(false);
      return undefined;
    }

    // Método tradicional (base): usa los pasos del catálogo o los genera (recetas IA).
    if (activeAppliance === "base") {
      if ((recipe.steps?.length ?? 0) > 0) {
        stepsCacheRef.current.base = recipe.steps;
        setSteps(recipe.steps);
        setStepsLoading(false);
        return undefined;
      }
      setStepsLoading(true);
      generateRecipeSteps(recipe, { signal: ctrl.signal })
        .then((s) => {
          recipe.steps = s;
          stepsCacheRef.current.base = s;
          if (active) {
            setSteps(s);
            setStepsLoading(false);
          }
        })
        .catch(() => {
          if (active) setStepsLoading(false);
        });
      return () => {
        active = false;
        ctrl.abort();
      };
    }

    // Método por electrodoméstico: pasos adaptados (caché Redis en el servidor).
    setStepsLoading(true);
    const method = (recipe.methods ?? []).find((m) => m.appliance === activeAppliance);
    fetch("/api/recipe-steps", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        recipeId: recipe.id,
        appliance: activeAppliance,
        name: recipe.name,
        ingredients: (recipe.ingredients ?? []).map((i) => i.name),
        baseSteps: recipe.steps ?? [],
        prepSummary: method?.prepSummary ?? "",
        time: method?.time,
      }),
      signal: ctrl.signal,
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((data) => {
        const s = Array.isArray(data?.steps) ? data.steps : [];
        if (s.length > 0) stepsCacheRef.current[activeAppliance] = s;
        if (active) {
          setSteps(s.length > 0 ? s : recipe.steps ?? []);
          setStepsLoading(false);
        }
      })
      .catch(() => {
        // Fallback: muestra los pasos tradicionales si la generación falla.
        if (active) {
          setSteps(recipe.steps ?? []);
          setStepsLoading(false);
        }
      });

    return () => {
      active = false;
      ctrl.abort();
    };
  }, [recipe, activeAppliance]);

  return (
    <div className="mp-overlay-in" style={detailOverlayStyle} onClick={onClose}>
      <div className="mp-sheet-up" style={detailSheetStyle} onClick={(e) => e.stopPropagation()}>
        <button type="button" onClick={onClose} aria-label="Cerrar detalle" style={closeButtonStyle}>
          <X size={20} />
        </button>

        <DishVisual recipe={recipe} height={220} imageUrl={dishImageForRecipe(recipe)} />

        <div style={{ padding: "18px 2px 0" }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
            <span style={detailTagStyle}>
              <Users size={12} /> {slot.eaters} comensales
            </span>
            <span style={detailTagStyle}>
              <Clock3 size={12} /> {activeMethod.time} min
            </span>
            <span style={detailTagStyle}>
              <Gauge size={12} /> {activeMethod.difficultyLabel}
            </span>
          </div>

          {recipe.allergens.length > 0 && (
            <div style={{
              display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap",
              marginBottom: 14,
              padding: "12px 15px",
              borderRadius: 16,
              background: "#fff",
              border: "2px solid #2d5a3d",
            }}>
              <span style={{ fontSize: 10, fontWeight: 800, color: TITLE_GREEN, letterSpacing: ".4px", textTransform: "uppercase", marginRight: 2 }}>
                Alérgenos
              </span>
              {resolveRecipeAllergens(recipe.allergens).map(({ id, Icon, label, color }) => (
                <span key={id} style={{
                  display: "inline-flex", alignItems: "center", gap: 4,
                  color, fontSize: 12, fontWeight: 700,
                }}>
                  <Icon size={14} strokeWidth={2.2} />
                  {label}
                </span>
              ))}
            </div>
          )}

          <section style={{ ...macroCardStyle, border: "2px solid #2d5a3d" }}>
            {/* kcal header */}
            <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 16 }}>
              <Flame size={15} color={TITLE_GREEN} />
              <span style={{ fontSize: 13, fontWeight: 900, color: TITLE_GREEN }}>
                {recipe.kcal} kcal
              </span>
              <span style={{ fontSize: 13, fontWeight: 900, color: TITLE_GREEN }}>por ración</span>
            </div>
            {/* Macro circles */}
            <div style={{ display: "flex", gap: 10, justifyContent: "space-around" }}>
              {[
                { label: "Proteína",      value: macros.protein, color: "#3b82f6" },
                { label: "Carbohidratos", value: macros.carbs,   color: "#f97316" },
                { label: "Grasas",        value: macros.fat,     color: "#eab308" },
              ].map(({ label, value, color }) => (
                <div key={label} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 7 }}>
                  <div style={{
                    width: 66, height: 66, borderRadius: "50%",
                    background: "#fff",
                    border: `3.5px solid ${color}`,
                    boxShadow: `0 2px 12px ${color}28`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    <span style={{ fontSize: 16, fontWeight: 900, color: "#142f1d", lineHeight: 1 }}>
                      {value}<span style={{ fontSize: 13, fontWeight: 900, color: "#142f1d" }}>g</span>
                    </span>
                  </div>
                  <span style={{ fontSize: 10, fontWeight: 700, color: "#7a8a7f", textAlign: "center", maxWidth: 64 }}>{label}</span>
                </div>
              ))}
            </div>
          </section>

          <section style={recipeBlockStyle}>
            <div style={sectionTitleStyle}>
              <BookOpen size={16} /> Receta
            </div>

            {methodOptions.length > 1 && (
              <div style={{
                display: "grid",
                gridTemplateColumns: `repeat(${Math.min(methodOptions.length, 3)}, 1fr)`,
                gap: 7,
                margin: "0 0 14px",
              }}>
                {methodOptions.map((o) => {
                  const isActive = o.appliance === activeAppliance;
                  const isYours = o.appliance === selectedMethod?.appliance;
                  const Icon = o.appliance === "base" ? ChefHat : APPLIANCE_ICONS[o.appliance];
                  const aColor = o.appliance === "base" ? TITLE_GREEN : (APPLIANCE_COLORS[o.appliance] ?? TITLE_GREEN);
                  return (
                    <button
                      key={o.appliance}
                      type="button"
                      onClick={() => setActiveAppliance(o.appliance)}
                      style={{
                        position: "relative",
                        display: "flex", flexDirection: "column",
                        alignItems: "center", justifyContent: "center", gap: 5,
                        padding: "10px 6px 8px",
                        borderRadius: 12,
                        border: `1.5px solid ${isActive ? aColor : "#e5ede7"}`,
                        background: isActive ? `${aColor}12` : "#fff",
                        color: isActive ? "#142f1d" : "#7a8a7f",
                        fontSize: 11, fontWeight: 800,
                        cursor: "pointer", fontFamily: "inherit",
                        transition: "all .15s ease",
                      }}
                    >
                      {Icon && <Icon size={18} color={isActive ? aColor : "#b0bdb4"} strokeWidth={2.2} />}
                      <span style={{ lineHeight: 1.2, textAlign: "center" }}>{o.label}</span>
                      {isYours && (
                        <span style={{
                          position: "absolute", top: 5, right: 6,
                          width: 6, height: 6, borderRadius: "50%",
                          background: aColor,
                        }} />
                      )}
                    </button>
                  );
                })}
              </div>
            )}

            <button
              type="button"
              onClick={() => setIngredientsOpen((o) => !o)}
              style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                width: "100%", padding: 0, border: "none", background: "none",
                cursor: "pointer", fontFamily: "inherit",
                marginBottom: ingredientsOpen ? 8 : 16,
              }}
            >
              <span style={{ fontSize: 12, fontWeight: 900, color: "#15331c" }}>
                Ingredientes ajustados{" "}
                <span style={{ color: "#9aa89f", fontWeight: 800 }}>({ingredients.length})</span>
              </span>
              <ChevronDown
                size={16}
                color="#15331c"
                strokeWidth={2.4}
                style={{ transform: ingredientsOpen ? "rotate(180deg)" : "none", transition: "transform .2s ease" }}
              />
            </button>
            {ingredientsOpen && (
              <div style={{ display: "grid", gap: 7, marginBottom: 16 }}>
                {ingredients.map((ing) => (
                  <div key={ing.id} style={ingredientRowStyle}>
                    <span>{ing.name}</span>
                    <strong>{ing.label}</strong>
                  </div>
                ))}
              </div>
            )}
            <div style={{ fontSize: 12, fontWeight: 900, color: "#15331c", marginBottom: 8 }}>
              Paso a paso
            </div>
            {stepsLoading ? (
              <div
                style={{
                  fontSize: 13,
                  color: "#8a948d",
                  animation: "pulse 1.4s ease-in-out infinite",
                }}
              >
                Preparando el paso a paso…
                <style>{`@keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: .55; } }`}</style>
              </div>
            ) : steps.length > 0 ? (
              <ol
                style={{
                  margin: 0,
                  paddingLeft: 18,
                  color: "#526057",
                  fontSize: 13,
                  lineHeight: 1.6,
                }}
              >
                {steps.map((step) => (
                  <li key={step} style={{ marginBottom: 6 }}>
                    {step}
                  </li>
                ))}
              </ol>
            ) : (
              <p style={{ fontSize: 13, color: "#8a948d", margin: 0 }}>
                No se pudo cargar el paso a paso. Cierra y vuelve a abrir el plato para reintentar.
              </p>
            )}
          </section>

          {/* Swap section */}
          <div style={{
            borderRadius: 16,
            border: "2px solid #2d5a3d",
            padding: "14px 15px",
            marginBottom: 16,
          }}>
            {/* Title */}
            <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 12 }}>
              <RotateCw size={15} color={TITLE_GREEN} />
              <span style={{ fontSize: 13, fontWeight: 900, color: TITLE_GREEN }}>
                Cambiar este plato
              </span>
            </div>
            {/* 2×2 grid chips */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {rejectReasons.map((r) => {
                const sel = rejected === r;
                return (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setRejected(sel ? null : r)}
                    style={{
                      padding: "10px 8px",
                      borderRadius: 12,
                      border: `1.5px solid ${sel ? "#4cba6e" : "#d6e6db"}`,
                      background: sel ? "rgba(76,186,110,.08)" : "#fff",
                      color: sel ? "#1a3a24" : "#7a8a7f",
                      fontSize: 12, fontWeight: 700,
                      cursor: "pointer", fontFamily: "inherit",
                      textAlign: "center",
                      transition: "all .15s ease",
                    }}
                  >
                    {r}
                  </button>
                );
              })}
            </div>

            {rejected && (
              <button
                type="button"
                onClick={() => { onReject(slot, rejected); onClose(); }}
                style={{
                  width: "100%", padding: "12px",
                  borderRadius: 12, border: "none",
                  background: "#2d5a3d", color: "#fff",
                  fontSize: 13, fontWeight: 900,
                  cursor: "pointer", fontFamily: "inherit",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                  boxShadow: "0 4px 14px rgba(45,90,61,.25)",
                  marginTop: 10,
                }}
              >
                <RotateCw size={14} />
                Sustituir plato
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

const ghostButtonStyle = {
  border: "1px solid #d9e5dd",
  background: "#fff",
  color: "#2d5a3d",
  padding: "7px 11px",
  borderRadius: 10,
  fontSize: 11,
  fontWeight: 800,
  cursor: "pointer",
  fontFamily: "inherit",
};

const shoppingButtonStyle = {
  flex: 1,
  padding: "14px",
  borderRadius: 14,
  border: "none",
  background: "#1a3a24",
  color: "#fff",
  fontSize: 13,
  fontWeight: 900,
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 8,
  fontFamily: "inherit",
};

const iconChipButtonStyle = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: 36,
  height: 36,
  padding: 0,
  borderRadius: 999,
  border: "1px solid #e6eee8",
  background: "#fff",
  color: "#2d5a3d",
  cursor: "pointer",
  flexShrink: 0,
  fontFamily: "inherit",
};

const regenerateIconButtonStyle = {
  ...iconChipButtonStyle,
  border: "none",
  background: "#1a3a24",
  color: "#fff",
  boxShadow: "0 2px 8px rgba(26,58,36,.22)",
};

const detailOverlayStyle = {
  position: "fixed",
  inset: 0,
  background: "rgba(9,22,13,.58)",
  zIndex: 1000,
  display: "flex",
  alignItems: "flex-end",
  justifyContent: "center",
  width: "100vw",
  height: "100dvh",
};

const detailSheetStyle = {
  background: "#fff",
  borderRadius: "26px 26px 0 0",
  width: "100%",
  maxWidth: 420,
  maxHeight: "92dvh",
  overflow: "auto",
  padding: "14px 16px 24px",
  position: "relative",
};

const closeButtonStyle = {
  position: "absolute",
  right: 26,
  top: 26,
  zIndex: 2,
  width: 32,
  height: 32,
  borderRadius: 999,
  border: "none",
  background: "rgba(255,255,255,.92)",
  color: "#1a3a24",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  cursor: "pointer",
};

const detailTagStyle = {
  display: "inline-flex",
  alignItems: "center",
  gap: 5,
  padding: "5px 9px",
  borderRadius: 999,
  background: "#f3f7f4",
  color: "#526057",
  fontSize: 11,
  fontWeight: 800,
};

const macroCardStyle = {
  borderRadius: 16,
  padding: "14px 15px",
  background: "#fff",
  border: "1px solid #e8eee9",
  marginBottom: 14,
};

const recipeBlockStyle = {
  borderRadius: 16,
  padding: "14px 15px",
  background: "#fff",
  border: "2px solid #2d5a3d",
  marginBottom: 14,
};

const sectionTitleStyle = {
  display: "flex",
  alignItems: "center",
  gap: 7,
  fontSize: 14,
  fontWeight: 900,
  color: "#15331c",
  marginBottom: 10,
};

const ingredientRowStyle = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  padding: "8px 10px",
  borderRadius: 10,
  background: "#f8faf8",
  color: "#526057",
  fontSize: 12,
};

const replaceButtonStyle = {
  width: "100%",
  padding: "14px",
  borderRadius: 12,
  border: "none",
  background: "#c67030",
  color: "#fff",
  fontSize: 14,
  fontWeight: 900,
  cursor: "pointer",
  fontFamily: "inherit",
};
