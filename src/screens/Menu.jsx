import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  AlertTriangle,
  ArrowLeftRight,
  BarChart3,
  Blend,
  BookOpen,
  BookOpenCheck,
  CalendarDays,
  Check,
  ChefHat,
  CircleUserRound,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  Clock3,
  ClipboardList,
  Apple,
  Coffee,
  CookingPot,
  History,
  IceCream,
  Layers2,
  Download,
  Droplets,
  Drumstick,
  Egg,
  Fish,
  Flame,
  Gauge,
  HeartPulse,
  Leaf,
  Menu as MenuIcon,
  Microwave,
  Moon,
  MoreVertical,
  Pizza,
  RotateCcw,
  RotateCw,
  Salad,
  Shell,
  SlidersHorizontal,
  Share2,
  ShoppingCart,
  Soup,
  Sparkles,
  Heart,
  Sun,
  Undo2,
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
import { resolveRecipeAllergens, EU_ALLERGENS } from "../lib/allergens.js";
import { matchingHealthProfiles } from "../lib/healthProfileMatch.js";
import { migrateFixedDishes } from "../lib/fixedDishes.js";
import { recipeCatalogById } from "../data/recipeCatalog.js";
import { isQualitativeUnit, qualitativeUnitLabel } from "../lib/ingredientCategories.js";
import { kitchenHint } from "../lib/kitchenUnits.js";
import { findMatchingPantryItem } from "../lib/shoppingBuilder.js";
import { consumeFromPantry, restoreToPantry } from "../lib/cookPantry.js";
import { addPantryItems, addLocalPantryItems, loadPantry, loadLocalPantry } from "../lib/pantry.js";
import { normalizePantryInput } from "../utils/normalizePantryInput.js";
import { membersOfGroup, isBabyMenuGroup, adhocReasonLabel } from "../lib/groups.js";
import { eatersForSlot } from "../lib/slotEaters.js";
import { summarizeMenuRestrictionConflicts } from "../utils/menuConflicts.js";
import { Avatar, BottomNav, Chip, GroupScopePicker, SegmentedControl, WeekRangeBadge, bottomNavSpacer, APP_SHELL_MAX_WIDTH } from "../components/ui.jsx";
import { CookTimeEditor } from "../components/CookTimeEditor.jsx";
import { MenuCoachTour, CoachHelpButton } from "../components/HomeCoachTour.jsx";
import { RestrictionConflictBanner } from "../components/RestrictionConflictBanner.jsx";
import { RECIPES_BY_ID } from "../data/recipes.js";
import { MenuPlanBadge, RecipeVoteCounts, formatRecipeDate } from "../components/RecipeProvenance.jsx";
import { FavoriteScopeModal } from "../components/FavoriteScopeModal.jsx";
import { OnboardingRestrictions, OnboardingMealStyle, OnboardingMealExtras } from "./Onboarding.jsx";
import { downloadMenu, shareMenu } from "../lib/menuExport.js";
import { generateRecipeSteps } from "../lib/aiPlanner.js";
import { DAYS, getMeals, getDayMeals, isLunchMeal, dayLabel } from "../lib/planner.js";
import { dishAvailabilityMap } from "../lib/shoppingListUtils.js";
import { initialsOf, AVATAR_PALETTE, memberAvatarColor } from "../lib/stages.js";
import {
  MEAL_STYLES,
  DEFAULT_MEAL_STYLE,
  scaleFreqsToSlots,
  mealStyleCardStyle,
  mealStyleIconStyle,
  useGroupSlotBudget,
} from "./Onboarding.jsx";
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
  getWeekDatesByMenuWeek,
  todayDayIdx,
} from "../lib/weekCalendar.js";
import { orderedWeeks } from "../lib/menuArchive.js";

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
  Merienda: { label: "Merienda", Icon: Apple  },
  Cena:     { label: "Cena",     Icon: Moon   },
  Postre:   { label: "Postre",   Icon: IceCream },
};

/** Structural colors — not used by recipe families in dishVisuals.js */
const DAY_STYLE = { bg: "#f1f5f9", bar: "#64748b", text: "#334155" };
const MEAL_STYLE = {
  Desayuno: { color: "#a16207", bg: "#fef9c3" },
  Comida:   { color: "#0d9488", bg: "#ccfbf1" },
  Merienda: { color: "#15803d", bg: "#dcfce7" },
  Cena:     { color: "#6366f1", bg: "#e0e7ff" },
  Postre:   { color: "#be185d", bg: "#fce7f3" },
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

function GroupMenuBadge({ group, size = 22 }) {
  const abbrev = GROUP_ABBREV[group.label] ?? group.label.charAt(0);
  const displayLabel = group.adHoc ? adhocReasonLabel(group.reason) : group.label;
  return (
    <span
      title={group.adHoc ? `${displayLabel} · menú individual` : displayLabel}
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
      {group.adHoc ? <CookingPot size={size <= 20 ? 11 : 13} /> : abbrev}
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

function groupForMember(memberId, groups) {
  return groups.find((g) => g.memberIds.includes(memberId));
}

/** Filled person avatar (name below) that jumps the menu to whichever group
 * this person is currently in — their own ad-hoc menu if they have one,
 * otherwise their shared family/group menu. Same selection model as the
 * "Menú" row above: one `scope`, whatever avatar you tap. */
function PersonScopeCircle({ member, color, active, onClick }) {
  const abbrev = initialsOf(member.name);
  return (
    <button
      type="button"
      className="deck-press"
      onClick={onClick}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 5,
        padding: 0,
        border: "none",
        background: "transparent",
        cursor: "pointer",
        fontFamily: "inherit",
        minWidth: 44,
      }}
    >
      <span
        style={{
          width: 36,
          height: 36,
          borderRadius: 999,
          background: color,
          color: "#fff",
          fontSize: 11,
          fontWeight: 900,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          opacity: active ? 1 : 0.55,
          boxShadow: active ? `0 3px 10px ${color}55` : `0 1px 4px ${color}33`,
          transition: "opacity .15s ease, box-shadow .15s ease",
        }}
      >
        {abbrev}
      </span>
      <span
        style={{
          fontSize: 10,
          fontWeight: 800,
          color: active ? color : "#8d978f",
          letterSpacing: "-.1px",
          maxWidth: 56,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {member.name}
      </span>
    </button>
  );
}

function MenuFilterPanel({ groups, scope, onScopeChange, members, multiGroup }) {
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
            alignItems: "flex-start",
            gap: 12,
            flexWrap: "wrap",
            width: "100%",
          }}
        >
          {members.map((member) => {
            const color = memberAvatarColor(member.id, members);
            const memberGroupId = groupForMember(member.id, groups)?.id ?? "all";
            const active = scope === memberGroupId;
            return (
              <PersonScopeCircle
                key={member.id}
                member={member}
                color={color}
                active={active}
                onClick={() => onScopeChange(memberGroupId)}
              />
            );
          })}
        </div>
      </FilterSectionRow>
    </div>
  );
}

function formatQty(qty, unit) {
  if (isQualitativeUnit(unit)) return qualitativeUnitLabel(unit);
  if (unit === "ud") return `${Math.ceil(qty)} ${Math.ceil(qty) === 1 ? "ud" : "uds"}`;
  if (unit === "g" && qty >= 1000) return `${(qty / 1000).toFixed(1)} kg`;
  if (unit === "ml" && qty >= 1000) return `${(qty / 1000).toFixed(1)} l`;
  return `${Math.ceil(qty)} ${unit}`;
}

function scaledIngredients(recipe, eaters) {
  const factor = Math.max(1, eaters) / recipe.servings;
  return recipe.ingredients.map((ing) => {
    const scaledQty = isQualitativeUnit(ing.unit) ? null : ing.qty * factor;
    return {
      ...ing,
      // Kept for cook-mode consumption (what THIS dish, for these eaters, spends
      // from the pantry). null for qualitative units (al gusto) → skipped.
      qtyScaled: scaledQty,
      label: formatQty(scaledQty, ing.unit),
      hint: kitchenHint(ing.name, scaledQty, ing.unit),
    };
  });
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

function DishVisual({ recipe, height = 220, imageUrl = null, eyebrow = "Receta de la semana" }) {
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
          {eyebrow}
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
    <>
      <style>{`
        .profile-pill-btn {
          position: relative;
          overflow: hidden;
          transition: transform .13s ease, box-shadow .13s ease;
        }
        .profile-pill-btn:active {
          transform: scale(.92);
          box-shadow: 0 1px 4px rgba(45,90,61,.18);
        }
        .profile-pill-btn::after {
          content: "";
          position: absolute;
          inset: 0;
          border-radius: 12px;
          background: rgba(255,255,255,.25);
          transform: scale(0);
          opacity: 0;
          pointer-events: none;
        }
        .profile-pill-btn:active::after {
          animation: profileRipple .35s ease-out;
        }
        @keyframes profileRipple {
          0%   { transform: scale(0); opacity: 1; }
          100% { transform: scale(2.5); opacity: 0; }
        }
      `}</style>
      <button
        type="button"
        data-coach="menu-profile"
        onClick={onClick}
        className="profile-pill-btn"
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
    </>
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

// When `onHeaderClick` is passed, this section isn't collapsible: the whole
// header (including the chevron) is a single tap that navigates straight to
// the editor — content stays always visible as a summary, and the chevron
// points right (navigate) instead of down (expand), so the affordance is
// honest about what tapping it does.
function AccordionSection({ title, icon: Icon, children, defaultOpen = false, action, onHeaderClick }) {
  const [open, setOpen] = useState(defaultOpen || Boolean(onHeaderClick));
  return (
    <div style={{ borderBottom: "1px solid #e8f0ea" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px 0" }}>
        <button
          type="button"
          onClick={onHeaderClick ?? (() => setOpen((v) => !v))}
          style={{
            flex: 1, minWidth: 0, display: "flex", alignItems: "center", justifyContent: "space-between",
            border: "none", background: "transparent", cursor: "pointer", padding: 0,
            fontFamily: "inherit",
          }}
        >
          <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {Icon && <Icon size={15} color="#2d5a3d" />}
            <span style={{ fontSize: 13, fontWeight: 700, color: "#142f1d" }}>
              {title}
            </span>
          </span>
          {onHeaderClick ? (
            <ChevronRight size={16} color="#9ab0a1" />
          ) : (
            <ChevronDown
              size={16}
              color="#9ab0a1"
              style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform .2s" }}
            />
          )}
        </button>
        {action}
      </div>
      {open && <div style={{ paddingBottom: 14 }}>{children}</div>}
    </div>
  );
}

function ProfileSettingsSheet({ data, setData, onClose, onRegenerate }) {
  const members = data.members ?? [];
  const dislikes = [...new Set([...(data.dislikes ?? []), ...members.flatMap((m) => m.dislikes ?? [])])];
  const allTools = [...KITCHEN_TOOLS, ...(data.customKitchenTools ?? [])];
  const fixedDishes = migrateFixedDishes(data.fixedDishes ?? []);
  // members with allergies, and members needing a more careful menu
  const membersWithAllergies = members.filter((m) => (m.allergies ?? []).length > 0);
  const CARE_LABELS = {
    glucemico: "Control glucémico",
    corazon: "Corazón",
    bajo_sodio: "Bajo en sal",
    reflux: "Reflujo",
    anemia: "Anemia",
    lactosa_fina: "Lactosa",
    fructosa: "Fructosa",
    sorbitol: "Sorbitol",
    embarazo: "Embarazo",
    lactancia: "Lactancia",
    dieta_blanda: "Dieta blanda",
  };
  const memberCareTags = (m) =>
    [...(m.healthProfiles ?? []), ...(m.dietaryStates ?? []), ...(m.intolerances ?? [])]
      .filter(Boolean)
      .map((id) => CARE_LABELS[id] ?? id);
  const membersWithRegimen = members.filter((m) => memberCareTags(m).length > 0);

  // ── Meal style ──
  const styleableGroups = useMemo(
    () => (data.groups ?? []).filter((g) => !isBabyMenuGroup(g, members) && !g.adHoc),
    [data.groups, members],
  );
  const hasMultipleStyleGroups = styleableGroups.length > 1;
  const [activeStyleGroupId, setActiveStyleGroupId] = useState(
    () => styleableGroups[0]?.id ?? null,
  );
  const styleKey = activeStyleGroupId ?? "__global__";
  const activeStyleGroup = styleableGroups.find((g) => g.id === activeStyleGroupId) ?? null;
  const slotBudget = useGroupSlotBudget(data, activeStyleGroup);
  const activeStyle = data.mealStyleByGroup?.[styleKey] ?? DEFAULT_MEAL_STYLE;

  // Track if user changed anything to prompt regeneration
  const snapshotRef = useRef(JSON.stringify({ cookLevel: data.cookLevel, kitchenTools: data.kitchenTools }));
  const [confirmRegen, setConfirmRegen] = useState(false);
  const [editingAvoid, setEditingAvoid] = useState(false);
  const [editingStyle, setEditingStyle] = useState(false);
  const [editingExtras, setEditingExtras] = useState(false);

  const wrappedSetData = (updater) => {
    setData(updater);
    snapshotRef.current = "__dirty__";
  };

  const selectStyle = (styleId) => {
    const preset = MEAL_STYLES.find((s) => s.id === styleId);
    if (!preset) return;
    const scaled = scaleFreqsToSlots(preset.freqs, slotBudget.total);
    wrappedSetData((d) => {
      const nextStyleMap = { ...(d.mealStyleByGroup ?? {}), [styleKey]: styleId };
      if (activeStyleGroupId) {
        return { ...d, mealStyleByGroup: nextStyleMap, freqsByGroup: { ...(d.freqsByGroup ?? {}), [activeStyleGroupId]: scaled } };
      }
      return { ...d, mealStyleByGroup: nextStyleMap, freqs: scaled };
    });
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

  // "Qué evitamos" reuses the same allergy/dislike editor from onboarding
  // instead of duplicating member-scoped allergen logic here — editing marks
  // the profile dirty so closing this sheet prompts regeneration as usual.
  if (editingAvoid) {
    // Rendered standalone (outside the onboarding flow) OnboardingShell has no
    // width cap, so it sprawled edge-to-edge. Wrap it in the same centered
    // mobile viewport the rest of the app uses so it stays consistent.
    return createPortal(
      <div style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(20,47,29,.28)", display: "flex", justifyContent: "center" }}>
        <div style={{ width: "100%", maxWidth: 420, height: "100dvh", background: "#f5f9f6", boxShadow: "0 0 40px rgba(0,0,0,.18)" }}>
          <OnboardingRestrictions
            data={data}
            setData={wrappedSetData}
            onNext={() => setEditingAvoid(false)}
            onBack={() => setEditingAvoid(false)}
            nextLabel="Guardar"
          />
        </div>
      </div>,
      document.body
    );
  }

  // "A tu gusto" reuses the full onboarding meal-style editor (presets +
  // per-food "veces/semana" stepper) so fine-tuning here is identical to the
  // onboarding step, no duplicated logic.
  if (editingStyle) {
    return createPortal(
      <div style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(20,47,29,.28)", display: "flex", justifyContent: "center" }}>
        <div style={{ width: "100%", maxWidth: 420, height: "100dvh", background: "#f5f9f6", boxShadow: "0 0 40px rgba(0,0,0,.18)" }}>
          <OnboardingMealStyle
            data={data}
            setData={wrappedSetData}
            onNext={() => setEditingStyle(false)}
            onBack={() => setEditingStyle(false)}
            nextLabel="Guardar"
          />
        </div>
      </div>,
      document.body
    );
  }

  // "Estructura y extras": platos por comida, desayuno, merienda, postre y
  // cenas rápidas — same standalone-editor pattern as "A tu gusto" above.
  if (editingExtras) {
    return createPortal(
      <div style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(20,47,29,.28)", display: "flex", justifyContent: "center" }}>
        <div style={{ width: "100%", maxWidth: 420, height: "100dvh", background: "#f5f9f6", boxShadow: "0 0 40px rgba(0,0,0,.18)" }}>
          <OnboardingMealExtras
            data={data}
            setData={wrappedSetData}
            onNext={() => setEditingExtras(false)}
            onBack={() => setEditingExtras(false)}
            nextLabel="Guardar"
          />
        </div>
      </div>,
      document.body
    );
  }

  if (confirmRegen) {
    const regenPoints = [
      {
        Icon: SlidersHorizontal,
        text: <>Aplicaremos <strong>tus nuevos ajustes</strong> (alergias, estilo, tiempos…) al menú.</>,
      },
      {
        Icon: CalendarDays,
        text: <>Se generará un <strong>menú nuevo</strong> para las mismas fechas; el actual se reemplaza.</>,
      },
    ];
    return createPortal(
      <div
        style={{
          position: "fixed", inset: 0, zIndex: 260,
          background: "rgba(20,47,29,.32)", backdropFilter: "blur(2px)",
          display: "flex", alignItems: "center", justifyContent: "center",
          padding: "0 16px", animation: "afinarFadeIn .2s ease",
        }}
        onClick={() => { setConfirmRegen(false); onClose(); }}
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
              background: "linear-gradient(135deg, #2d5a3d, #4cba6e)",
              display: "flex", alignItems: "center", justifyContent: "center",
              boxShadow: "0 6px 16px rgba(45,90,61,.4)",
              animation: "afinarBob 2.4s ease-in-out infinite",
            }}
          >
            <Wand2 size={24} color="#fff" />
          </div>

          <div style={{ marginTop: 14 }}>
            <h3 style={{ margin: "0 0 5px", fontSize: 19, fontWeight: 900, color: "#142f1d", letterSpacing: "-.4px" }}>
              ¿Generar nuevo menú?
            </h3>
            <p style={{ margin: "0 0 14px", fontSize: 13, color: "#5a7a66", lineHeight: 1.45 }}>
              Has cambiado tu perfil. Esto es lo que haríamos si generamos de nuevo:
            </p>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
            {regenPoints.map((p, i) => (
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
              onClick={() => { setConfirmRegen(false); onClose(); onRegenerate(); }}
              style={{
                width: "100%", padding: "12px 16px", borderRadius: 13, border: "none",
                background: "linear-gradient(135deg, #2d5a3d, #4cba6e)",
                color: "#fff", fontSize: 14.5, fontWeight: 800, cursor: "pointer", fontFamily: "inherit",
              }}
            >
              Sí, generar nuevo menú
            </button>
            <button
              type="button"
              onClick={() => { setConfirmRegen(false); onClose(); }}
              style={{
                width: "100%", padding: "11px 16px", borderRadius: 13,
                border: "1.5px solid #cfe0d4", background: "#fff", color: "#2d5a3d",
                fontSize: 13.5, fontWeight: 800, cursor: "pointer", fontFamily: "inherit",
              }}
            >
              No, solo guardar cambios
            </button>
          </div>
        </div>
      </div>,
      document.body
    );
  }

  return createPortal(
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
        {/* ── Qué evitamos ── */}
        {/* Not collapsible: tapping the header (chevron included) opens the
            editor directly — the summary below is just a live preview. */}
        <AccordionSection
          title="Qué evitamos"
          icon={UtensilsCrossed}
          onHeaderClick={() => setEditingAvoid(true)}
        >
          <div
            onClick={() => setEditingAvoid(true)}
            style={{ display: "flex", alignItems: "flex-start", gap: 8, cursor: "pointer" }}
          >
          <div style={{ flex: 1, minWidth: 0 }}>
          {membersWithAllergies.length === 0 && membersWithRegimen.length === 0 && dislikes.length === 0 ? (
            <span style={{ fontSize: 12, color: "#9ab0a1" }}>Toca para añadir alergias, intolerancias o lo que no os gusta.</span>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {membersWithAllergies.map((m) => {
                const memberColor = memberAvatarColor(m.id, members);
                return (
                  <div key={m.id} style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                    <div style={{
                      width: 26, height: 26, borderRadius: 999, flexShrink: 0,
                      background: memberColor, display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 11, fontWeight: 900, color: "#fff",
                    }}>
                      {(m.name ?? "?")[0].toUpperCase()}
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 5, paddingTop: 3 }}>
                      {(m.allergies ?? []).map((a) => {
                        const meta = EU_ALLERGENS[a];
                        return (
                          <span key={a} style={{
                            display: "inline-flex", alignItems: "center", gap: 4,
                            padding: "3px 8px", borderRadius: 20,
                            background: "#fef3f0", fontSize: 11, fontWeight: 600, color: "#a83a1f",
                          }}>
                            {meta ? <meta.Icon size={11} /> : null}
                            {meta ? meta.label : a}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
              {membersWithRegimen.length > 0 && (
                <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginTop: 2 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: "#526057" }}>Menú cuidado:</span>
                  {membersWithRegimen.map((m) => {
                    const memberColor = memberAvatarColor(m.id, members);
                    return (
                      <div key={m.id} style={{
                        display: "flex", alignItems: "center", gap: 5,
                        padding: "3px 8px 3px 5px", borderRadius: 20,
                        background: "#f0f7f2", border: "1px solid #c8dece",
                        fontSize: 11, fontWeight: 700, color: "#2d5a3d",
                      }}>
                        <div style={{
                          width: 18, height: 18, borderRadius: 999,
                          background: memberColor, display: "flex", alignItems: "center", justifyContent: "center",
                          fontSize: 9, fontWeight: 900, color: "#fff",
                        }}>
                          {(m.name ?? "?")[0].toUpperCase()}
                        </div>
                        {m.name}: {memberCareTags(m).join(", ")}
                      </div>
                    );
                  })}
                </div>
              )}
              {dislikes.length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                  {dislikes.map((d) => (
                    <span key={d} style={{ padding: "3px 8px", borderRadius: 20, background: "#f5f0e8", fontSize: 11, fontWeight: 600, color: "#8a6d3b" }}>
                      {d}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
          </div>
          </div>
        </AccordionSection>

        {/* ── Tu despensa — oculto de momento (feature en pausa) ── */}

        {/* ── Qué repetimos ── */}
        <AccordionSection title="Qué repetimos" icon={RotateCcw}>
          {fixedDishes.length === 0 ? (
            <span style={{ fontSize: 12, color: "#9ab0a1" }}>—</span>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {fixedDishes.map((fd, i) => {
                const recipe = fd.catalogId ? recipeCatalogById[fd.catalogId] : null;
                const name = recipe ? recipe.name : fd.name;
                const meal = (fd.meals ?? ["Comida"])[0];
                return (
                  <div key={i} style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "8px 10px", borderRadius: 10,
                    background: "#f5f9f6", border: "1px solid #ddeee3",
                  }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: "#142f1d", flex: 1, marginRight: 8 }}>
                      {name}
                    </span>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                      <span style={{
                        fontSize: 11, fontWeight: 800, color: "#2d5a3d",
                        background: "#d9eedf", borderRadius: 20, padding: "2px 7px",
                      }}>
                        {fd.timesPerWeek}× sem
                      </span>
                      <span style={{
                        fontSize: 11, fontWeight: 600, color: "#526057",
                        background: "#eef3f0", borderRadius: 20, padding: "2px 7px",
                      }}>
                        {meal}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </AccordionSection>

        {/* ── Estilo de cocina ── */}
        <AccordionSection title="Estilo de cocina" icon={Sparkles}>
          {hasMultipleStyleGroups && (
            <div style={{ marginBottom: 12 }}>
              <GroupScopePicker
                groups={styleableGroups}
                scope={activeStyleGroupId ?? "all"}
                onChange={(id) => setActiveStyleGroupId(id === "all" ? (styleableGroups[0]?.id ?? null) : id)}
              />
            </div>
          )}
          <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
            {/* Presets + "A tu gusto": the last one opens the full onboarding
                food-frequency editor so you can fine-tune the chosen style. */}
            {MEAL_STYLES.map((s) => {
              const sel = activeStyle === s.id;
              const isCustom = s.id === "personalizado";
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => (isCustom ? setEditingStyle(true) : selectStyle(s.id))}
                  style={mealStyleCardStyle(sel)}
                >
                  {sel && (
                    <span style={{ position: "absolute", top: 7, right: 7, display: "flex" }}>
                      <Check size={12} color="#fff" />
                    </span>
                  )}
                  <div style={mealStyleIconStyle(sel)}>
                    <s.Icon size={16} />
                  </div>
                  <div style={{ fontSize: 11.5, fontWeight: 800, color: sel ? "#fff" : "#142f1d", textAlign: "center", lineHeight: 1.25 }}>
                    {s.label}
                  </div>
                </button>
              );
            })}
          </div>
          {(() => {
            const styleObj = MEAL_STYLES.find((s) => s.id === activeStyle);
            if (!styleObj) return null;
            return (
              <p style={{ margin: "10px 0 0", fontSize: 12, color: "#6b7d70", lineHeight: 1.45 }}>
                {styleObj.desc}
              </p>
            );
          })()}
        </AccordionSection>

        {/* ── Estructura y extras: platos por comida, desayuno, merienda,
              postre, cenas rápidas — its own screen so it doesn't crowd the
              food-frequency editor above. */}
        <AccordionSection title="Estructura y extras" icon={Layers2}>
          <button
            type="button"
            onClick={() => setEditingExtras(true)}
            style={{
              display: "flex", alignItems: "center", gap: 12, width: "100%",
              padding: "12px 14px", borderRadius: 14, cursor: "pointer",
              border: "1.5px solid #e3ebe6", background: "#f4f7f5",
              fontFamily: "inherit", textAlign: "left",
            }}
          >
            <div style={{
              width: 36, height: 36, borderRadius: 10, flexShrink: 0,
              display: "flex", alignItems: "center", justifyContent: "center",
              background: "#eef5f0", color: "#2d5a3d",
            }}>
              <Coffee size={17} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: "#142f1d" }}>
                Platos, desayuno, merienda y postre
              </div>
              <div style={{ fontSize: 11.5, color: "#6b7d70", marginTop: 1 }}>
                Y noches de cena rápida
              </div>
            </div>
            <ChevronRight size={18} color="#b6c4bb" />
          </button>
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
    </div>,
    document.body
  );
}

/**
 * Long-press + tap on the same element via pointer events (works for touch and
 * mouse). Holding past `ms` fires onLongPress and swallows the click that
 * follows; a quick tap fires onClick. Moving past a small threshold (a scroll)
 * cancels the long-press so the deck stays scrollable.
 */
function useLongPress(onLongPress, onClick, { ms = 420, moveTol = 12 } = {}) {
  const timer = useRef(null);
  const firedLong = useRef(false);
  const start = useRef(null);
  const clear = () => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  };
  return {
    onPointerDown: (e) => {
      firedLong.current = false;
      start.current = { x: e.clientX, y: e.clientY };
      clear();
      timer.current = setTimeout(() => {
        firedLong.current = true;
        onLongPress?.();
      }, ms);
    },
    onPointerMove: (e) => {
      if (!start.current) return;
      if (
        Math.abs(e.clientX - start.current.x) > moveTol ||
        Math.abs(e.clientY - start.current.y) > moveTol
      ) {
        clear();
      }
    },
    onPointerUp: clear,
    onPointerCancel: clear,
    onPointerLeave: clear,
    onClick: (e) => {
      if (firedLong.current) {
        e.preventDefault();
        e.stopPropagation();
        firedLong.current = false;
        return;
      }
      onClick?.(e);
    },
    onContextMenu: (e) => e.preventDefault(),
  };
}

/** Same dish slot (group + day + meal + course) — used to cancel a swap that
 *  targets the very dish you started from. */
export function sameDish(a, b) {
  return (
    !!a &&
    !!b &&
    a.groupId === b.groupId &&
    a.day === b.day &&
    a.meal === b.meal &&
    a.course === b.course
  );
}

export function dishesFromSlot(slot, isLunch) {
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

export function DishCard({
  slot,
  onTap,
  onLongPress = null,
  courseLabel = null,
  showDivider = true,
  eaterMembers = null,
  allMembers = [],
  group = null,
  // Groups this dish belongs to (deduped menus). Falls back to [group] so
  // callers that only pass a single group keep working.
  badgeGroups = null,
  showGroupBadge = false,
  kitchenTools = [],
  // { have, total } from dishAvailabilityMap. Only rendered/clickable when
  // something's still missing — a complete dish has nothing left to jump to.
  // Tapping the dot just opens the dish (its detail now shows what's missing
  // and lets you mark cooked — the old "Modo Cocina" tab is gone).
  availability = null,
}) {
  // Hook must run before any early return (rules-of-hooks).
  const press = useLongPress(
    () => onLongPress?.(),
    () => onTap?.(),
  );
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

  // "Menú más cuidado" badge — active health profiles of the group this dish
  // was planned for, matched against the dish's own healthFlags (see
  // lib/healthProfileMatch.js). Uses the group's full roster (not just today's
  // eaters) since aiPlanner biases the whole week's menu for the group, not
  // just individual slots.
  const groupMembers = group ? membersOfGroup(group, allMembers) : (eaterMembers ?? []);
  const activeHealthProfiles = groupMembers.flatMap((m) => m.healthProfiles ?? []);
  const healthBadges = matchingHealthProfiles(recipe.healthFlags, activeHealthProfiles);
  // Same signal as DishDetail's "Adaptado" card, but visible while just
  // scanning the week — a family shouldn't have to open every dish to find
  // out we already handled an intolerance (e.g. lactose-free swap).
  const adaptationLabels = recipe.adaptations?.length > 0
    ? Array.from(new Set(recipe.adaptations.map((a) => a.label)))
    : [];

  return (
    <button
      type="button"
      data-coach="menu-dish"
      {...press}
      style={{
        width: "100%",
        border: "none",
        borderBottom: showDivider ? "1px solid #e8f0ea" : "none",
        touchAction: "pan-y",
        textAlign: "left",
        display: "flex",
        gap: 12,
        padding: "12px 2px",
        background: "transparent",
        cursor: "pointer",
        fontFamily: "inherit",
      }}
    >
      {/* alignSelf: flex-start pins this to the icon's own 44px height — without
          it, rows with extra badges (2º, alérgenos…) are taller than 44px and
          the default flex `stretch` stretches this wrapper too, dragging the
          bottom-anchored dot away from the thumbnail's actual corner. */}
      <span style={{ position: "relative", flexShrink: 0, alignSelf: "flex-start" }}>
        <DishIcon recipe={recipe} size={44} imageUrl={dishImageForRecipe(recipe)} />
        {availability && availability.have < availability.total && (
          // Decorative dot: the whole card is already a button that opens the
          // dish, so a click here just bubbles up to it — kept as a <span> to
          // avoid an (invalid) nested <button>.
          <span
            aria-hidden="true"
            title={
              availability.have === 0
                ? "No tienes ningún ingrediente — abrir el plato"
                : `Te faltan ${availability.total - availability.have} ingredientes — abrir el plato`
            }
            style={{
              position: "absolute",
              bottom: -2,
              left: -2,
              width: 14,
              height: 14,
              borderRadius: 999,
              border: "2px solid #fff",
              background: availability.have === 0 ? "#d1483f" : "#e0a336",
              boxSizing: "border-box",
            }}
          />
        )}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
          {showGroupBadge && (badgeGroups?.length ? badgeGroups : group ? [group] : []).length > 0 && (
            <span style={{ display: "inline-flex", gap: 4 }}>
              {(badgeGroups?.length ? badgeGroups : [group]).map((gr) => (
                <GroupMenuBadge key={gr.id} group={gr} />
              ))}
            </span>
          )}
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
          {adaptationLabels.length > 0 && (
            <>
              <span style={{ color: "#dde8e0", fontSize: 12 }}>·</span>
              <span
                title={`Adaptado: ${adaptationLabels.join(", ")}`}
                aria-label={`Adaptado: ${adaptationLabels.join(", ")}`}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 4,
                  fontSize: 10, fontWeight: 800, color: "#2f9e52",
                }}
              >
                <Leaf size={13} strokeWidth={2.4} />
                Adaptado
              </span>
            </>
          )}
          {healthBadges.length > 0 && (
            <>
              <span style={{ color: "#dde8e0", fontSize: 12 }}>·</span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                {healthBadges.map(({ id, Icon, label, color }) => (
                  <span
                    key={id}
                    title={`Menú más cuidado: ${label}`}
                    aria-label={`Menú más cuidado: ${label}`}
                    style={{ display: "inline-flex", alignItems: "center", color }}
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
                    <Avatar
                      key={member.id}
                      name={member.name}
                      photo={member.photo}
                      color={color}
                      size={22}
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

// ─────────────────────────────────────────────────────────────────────────
// NEW "DECK" MENU MODE — mobile-first, photo-forward. Toggled from the header
// and fully isolated so the classic renderer above stays untouched.
// ─────────────────────────────────────────────────────────────────────────

const DECK_VIEW_OPTIONS = [
  { id: "dia", label: "Día" },
  { id: "semana", label: "Semana" },
  { id: "lista", label: "Lista" },
];

const DECK_VIEW_ICON = { dia: CalendarDays, semana: Layers2, lista: ClipboardList };

// On-the-fly image optimization for the deck's big photos: the origin blobs are
// ~1.5–1.8 MB / ~1024px, far too heavy for full-bleed tiles. wsrv.nl resizes +
// converts to WebP at the edge (origin stays cached separately). Temporary until
// we ship pre-generated derivatives with sharp.
function deckImg(url, w = 720) {
  if (!url) return null;
  return `https://wsrv.nl/?url=${encodeURIComponent(url)}&w=${w}&output=webp&q=72`;
}

/** Flatten a day into photo tiles (one per dish/course, across visible groups).
 *  When the same dish (recipe + course) is planned for several groups in the
 *  same meal we don't repeat it: it collapses into one tile that carries all
 *  the groups it belongs to, so the UI can show every group icon at once. */
function getDeckDayTiles(day, data, menuPlan, visibleGroups) {
  const meals = getDayMeals(data);
  const tiles = [];
  const byKey = new Map();
  for (const meal of meals) {
    const isLunch = isLunchMeal(meal);
    for (const g of visibleGroups) {
      const slot = menuPlan[g.id]?.[`${day}-${meal}`] ?? null;
      if (!slot) continue;
      for (const dish of dishesFromSlot(slot, isLunch)) {
        const key = `${meal}::${dish.recipeId}::${dish.courseKey}`;
        const existing = byKey.get(key);
        if (existing) {
          existing.groups.push(g);
          continue;
        }
        const tile = { meal, group: g, groups: [g], slot, dish };
        byKey.set(key, tile);
        tiles.push(tile);
      }
    }
  }
  return tiles;
}

/** A single photo-forward dish tile. Fills its parent (parent controls size). */
function DeckTile({ tile, day, onDishTap, onDishLongPress, imgWidth = 720, radius = 22, compact = false, showGroup = false }) {
  const { meal, group, slot, dish } = tile;
  const badgeGroups = tile.groups ?? (group ? [group] : []);
  const [failed, setFailed] = useState(false);
  const recipe = RECIPES_BY_ID[dish.recipeId];
  const sel = recipe
    ? { recipe, slot, groupId: group.id, day, meal, group, course: dish.courseKey }
    : null;
  const press = useLongPress(
    () => sel && onDishLongPress?.(sel),
    () => sel && onDishTap?.(sel),
  );
  if (!recipe) return null;
  const optimized = deckImg(dishImageForRecipe(recipe), imgWidth);
  const visual = visualForRecipe(recipe);
  const mealLabel = MEAL_META[meal]?.label ?? meal;
  const courseTxt = dish.course ? `${mealLabel} · ${dish.course}` : mealLabel;
  const showPhoto = optimized && !failed;
  return (
    <button
      type="button"
      className="deck-tile"
      {...press}
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        border: "none",
        padding: 0,
        borderRadius: radius,
        overflow: "hidden",
        cursor: "pointer",
        fontFamily: "inherit",
        background: visual.surface,
        display: "block",
        textAlign: "left",
        boxShadow: "0 6px 20px rgba(20,47,29,.14)",
        touchAction: "pan-x pan-y",
      }}
    >
      {showPhoto ? (
        <img
          src={optimized}
          alt={recipe.name}
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
        />
      ) : (
        <div style={{ position: "absolute", inset: 0, background: visual.surface }} />
      )}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "linear-gradient(to top, rgba(0,0,0,.74) 0%, rgba(0,0,0,.25) 42%, rgba(0,0,0,0) 66%)",
        }}
      />
      {showGroup && badgeGroups.length > 0 && (
        <div style={{ position: "absolute", top: compact ? 8 : 12, left: compact ? 8 : 12, display: "flex", gap: 4 }}>
          {badgeGroups.map((gr) => (
            <GroupMenuBadge key={gr.id} group={gr} size={compact ? 20 : 26} />
          ))}
        </div>
      )}
      {sel && onDishLongPress && (
        // Explicit affordance (long-press is mobile-only / invisible on desktop).
        // A <span role=button> avoids an invalid nested <button>; it stops the
        // pointer/click so it never triggers the tile's open/long-press.
        <span
          role="button"
          tabIndex={0}
          aria-label="Acciones del plato"
          className="deck-tile-actions"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            const r = e.currentTarget.getBoundingClientRect();
            const tileEl = e.currentTarget.closest(".deck-tile");
            const tr = tileEl?.getBoundingClientRect();
            const radius = tileEl ? parseFloat(getComputedStyle(tileEl).borderRadius) || 18 : 18;
            onDishLongPress({
              ...sel,
              anchor: {
                icon: { top: r.top, left: r.left, right: r.right, bottom: r.bottom },
                tile: tr ? { top: tr.top, left: tr.left, width: tr.width, height: tr.height } : null,
                radius,
              },
            });
          }}
          style={{
            position: "absolute",
            top: compact ? 6 : 9,
            right: compact ? 6 : 9,
            width: compact ? 24 : 30,
            height: compact ? 24 : 30,
            borderRadius: 999,
            background: "rgba(12,22,15,.44)",
            backdropFilter: "blur(6px)",
            WebkitBackdropFilter: "blur(6px)",
            border: "1px solid rgba(255,255,255,.28)",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            zIndex: 3,
          }}
        >
          <MoreVertical size={compact ? 14 : 16} strokeWidth={2.8} color="#fff" />
        </span>
      )}
      <div style={{ position: "absolute", left: compact ? 10 : 14, right: compact ? 10 : 14, bottom: compact ? 10 : 13 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 7,
            marginBottom: compact ? 4 : 7,
          }}
        >
          {/* Dot = recipe family (verdura, legumbre, pescado…), not the meal */}
          <span
            title={visual.label}
            style={{
              width: compact ? 7 : 9,
              height: compact ? 7 : 9,
              borderRadius: 999,
              background: visual.accent,
              flexShrink: 0,
              boxShadow: "0 0 0 2px rgba(255,255,255,.6)",
            }}
          />
          <span
            style={{
              color: "rgba(255,255,255,.95)",
              fontSize: compact ? 9 : 10.5,
              fontWeight: 800,
              letterSpacing: ".7px",
              textTransform: "uppercase",
              textShadow: "0 1px 6px rgba(0,0,0,.5)",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {courseTxt}
          </span>
        </div>
        {/* Fixed 2-line height so the eyebrow + title always start at the same
            baseline across every stacked tile, regardless of title length. */}
        <div
          style={{
            color: "#fff",
            fontSize: compact ? 13 : 20,
            fontWeight: 900,
            lineHeight: 1.15,
            letterSpacing: "-.3px",
            textShadow: "0 2px 12px rgba(0,0,0,.45)",
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
            height: compact ? 30 : 46,
          }}
        >
          {recipe.name}
        </div>
      </div>
    </button>
  );
}

/** "Día" view — horizontal day pager (scroll-snap) with peek + stacked tiles. */
function DeckDayPager({ days, activeDay, onActiveDay, weekDates, data, menuPlan, visibleGroups, onDishTap, onDishLongPress, showGroup = false }) {
  const scrollerRef = useRef(null);
  const rafRef = useRef(0);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const idx = Math.max(0, days.indexOf(activeDay));
    el.children[idx]?.scrollIntoView({ inline: "center", block: "nearest" });
    // Only center on mount; afterwards the active day follows the swipe.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleScroll = () => {
    if (rafRef.current) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0;
      const el = scrollerRef.current;
      if (!el) return;
      const center = el.scrollLeft + el.clientWidth / 2;
      let best = 0;
      let bestDist = Infinity;
      for (let i = 0; i < el.children.length; i++) {
        const c = el.children[i];
        const cc = c.offsetLeft + c.offsetWidth / 2;
        const d = Math.abs(cc - center);
        if (d < bestDist) {
          bestDist = d;
          best = i;
        }
      }
      if (days[best] && days[best] !== activeDay) onActiveDay(days[best]);
    });
  };

  return (
    <div>
      <div
        ref={scrollerRef}
        onScroll={handleScroll}
        className="deck-scroller"
        style={{
          display: "flex",
          gap: 12,
          overflowX: "auto",
          overflowY: "hidden",
          scrollSnapType: "x mandatory",
          WebkitOverflowScrolling: "touch",
        }}
      >
        {days.map((day) => {
          const tiles = getDeckDayTiles(day, data, menuPlan, visibleGroups);
          // With several menús a day can hold many dishes; forcing them all into
          // one screen (flex:1 each) squishes tiles into unusable strips. So past
          // 3 tiles we give each a fixed height and let the day scroll vertically.
          const many = tiles.length > 3;
          return (
            <div
              key={day}
              className="deck-scroller"
              style={{
                flex: "0 0 86%",
                scrollSnapAlign: "center",
                display: "flex",
                flexDirection: "column",
                gap: 10,
                height: "calc(100dvh - 300px)",
                minHeight: 420,
                overflowY: many ? "auto" : "hidden",
                WebkitOverflowScrolling: "touch",
              }}
            >
              <div style={{ position: "sticky", top: 0, zIndex: 2, background: "#fff", paddingBottom: 8 }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 8, padding: "0 2px" }}>
                  <span style={{ fontSize: 15, fontWeight: 900, color: "#142f1d", letterSpacing: "-.2px" }}>{dayLabel(day)}</span>
                  <span style={{ fontSize: 13, fontWeight: 800, color: "#4cba6e" }}>{calendarDayNumber(day, weekDates)}</span>
                  <span style={{ flex: 1, height: 1, background: "#dbe8df", marginLeft: 2 }} />
                </div>
              </div>
              {tiles.length === 0 ? (
                <div
                  style={{
                    flex: 1,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#aab5af",
                    fontSize: 13,
                    fontWeight: 700,
                    background: "#f3f8f4",
                    borderRadius: 22,
                  }}
                >
                  Sin platos
                </div>
              ) : (
                tiles.map((tile, i) => (
                  <div
                    key={`${tile.group.id}-${tile.meal}-${tile.dish.courseKey}-${i}`}
                    style={many ? { height: 172, flexShrink: 0 } : { flex: 1, minHeight: 0 }}
                  >
                    <DeckTile tile={tile} day={day} onDishTap={onDishTap} onDishLongPress={onDishLongPress} imgWidth={760} showGroup={showGroup} />
                  </div>
                ))
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** "Semana" view — one row per day, horizontally scrollable mini photo cards. */
function DeckWeek({ days, weekDates, data, menuPlan, visibleGroups, onDishTap, onDishLongPress, showGroup = false }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      {days.map((day) => {
        const tiles = getDeckDayTiles(day, data, menuPlan, visibleGroups);
        if (tiles.length === 0) return null;
        return (
          <div key={day}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 8 }}>
              <span style={{ fontSize: 14, fontWeight: 900, color: "#142f1d" }}>{dayLabel(day)}</span>
              <span style={{ fontSize: 12, fontWeight: 800, color: "#4cba6e" }}>{calendarDayNumber(day, weekDates)}</span>
              <span style={{ flex: 1, height: 1, background: "#e8f0ea" }} />
            </div>
            <div className="deck-scroller" style={{ display: "flex", gap: 10, overflowX: "auto", paddingBottom: 4 }}>
              {tiles.map((tile, i) => (
                <div key={`${tile.group.id}-${tile.meal}-${tile.dish.courseKey}-${i}`} style={{ flex: "0 0 46%" }}>
                  <div style={{ height: 150 }}>
                    <DeckTile tile={tile} day={day} onDishTap={onDishTap} onDishLongPress={onDishLongPress} imgWidth={360} radius={16} compact showGroup={showGroup} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** "Lista" view — the classic, information-dense list (reuses DishCard). */
function DeckList({ days, weekDates, data, menuPlan, visibleGroups, members, dishAvailability, multiGroup, scope, onDishTap, onDishLongPress }) {
  return (
    <div>
      {days.map((day) => {
        const meals = getDayMeals(data);
        const dayHasContent = meals.some((meal) => visibleGroups.some((g) => menuPlan[g.id]?.[`${day}-${meal}`]));
        if (!dayHasContent) return null;
        return (
          <div key={day} style={{ marginBottom: 18 }}>
            <DaySectionHeader day={day} dayNumber={calendarDayNumber(day, weekDates)} />
            {meals.map((meal) => {
              const isLunch = isLunchMeal(meal);
              const cards = [];
              const cardByKey = new Map();
              for (const g of visibleGroups) {
                const slot = menuPlan[g.id]?.[`${day}-${meal}`] ?? null;
                if (!slot) continue;
                for (const dish of dishesFromSlot(slot, isLunch)) {
                  const key = `${dish.recipeId}::${dish.courseKey}`;
                  const existing = cardByKey.get(key);
                  if (existing) {
                    existing.groups.push(g);
                    continue;
                  }
                  const card = { group: g, groups: [g], slot, dish };
                  cardByKey.set(key, card);
                  cards.push(card);
                }
              }
              if (cards.length === 0) return null;
              return (
                <div key={meal} style={{ marginBottom: 14 }}>
                  <MealSectionLabel meal={meal} />
                  <div style={{ display: "flex", flexDirection: "column" }}>
                    {cards.map((card, idx) => (
                      <DishCard
                        key={`${card.group.id}-${card.dish.courseKey}-${idx}`}
                        slot={{ ...card.slot, recipeId: card.dish.recipeId }}
                        courseLabel={card.dish.course}
                        showDivider={idx < cards.length - 1}
                        allMembers={members}
                        group={card.group}
                        badgeGroups={card.groups}
                        showGroupBadge={multiGroup && scope === "all"}
                        kitchenTools={data.kitchenTools ?? []}
                        availability={dishAvailability.get(`${day}::${meal}::${card.dish.recipeId}`) ?? null}
                        onTap={() =>
                          onDishTap?.({
                            recipe: RECIPES_BY_ID[card.dish.recipeId],
                            slot: card.slot,
                            groupId: card.group.id,
                            day,
                            meal,
                            group: card.group,
                            course: card.dish.courseKey,
                          })
                        }
                        onLongPress={() =>
                          onDishLongPress?.({
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
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

function MenuDeck({ deckView, days, weekDates, data, menuPlan, visibleGroups, members, dishAvailability, multiGroup, scope, selectedDay, setSelectedDay, onDishTap, onDishLongPress }) {
  // When several menús coexist (dieta/bebés/niños…) and no single one is picked,
  // each tile shows a colored group badge so you can tell whose dish it is.
  const showGroup = multiGroup && scope === "all";
  return (
    <div key={deckView} className="deck-view-swap">
      {deckView === "dia" && (
        <DeckDayPager
          days={days}
          activeDay={selectedDay}
          onActiveDay={setSelectedDay}
          weekDates={weekDates}
          data={data}
          menuPlan={menuPlan}
          visibleGroups={visibleGroups}
          onDishTap={onDishTap}
          onDishLongPress={onDishLongPress}
          showGroup={showGroup}
        />
      )}
      {deckView === "semana" && (
        <DeckWeek days={days} weekDates={weekDates} data={data} menuPlan={menuPlan} visibleGroups={visibleGroups} onDishTap={onDishTap} onDishLongPress={onDishLongPress} showGroup={showGroup} />
      )}
      {deckView === "lista" && (
        <DeckList
          days={days}
          weekDates={weekDates}
          data={data}
          menuPlan={menuPlan}
          visibleGroups={visibleGroups}
          members={members}
          dishAvailability={dishAvailability}
          multiGroup={multiGroup}
          scope={scope}
          onDishTap={onDishTap}
          onDishLongPress={onDishLongPress}
        />
      )}
    </div>
  );
}

/**
 * Deck view selector — a pill showing the active view that unfolds an animated
 * menu (Día / Semana / Lista + week switcher + Vista clásica). "Tu perfil" lives
 * outside, to the right of this pill in the header row.
 */
/** Circular icon for the view picker — mirrors ScopeCircle so the view picker
 *  and the menú filter share the exact same visual language. */
function ViewCircle({ Icon, active, size = 42 }) {
  return (
    <span
      style={{
        display: "inline-flex",
        borderRadius: 999,
        padding: 3,
        background: "rgba(255,255,255,.5)",
        boxShadow: active ? "0 0 0 2.5px #2d5a3d" : "0 0 0 1px rgba(45,90,61,.15)",
        transition: "box-shadow .15s ease",
      }}
    >
      <span
        style={{
          width: size,
          height: size,
          borderRadius: 999,
          background: active ? "#2d5a3d" : "#eef4ef",
          color: active ? "#fff" : "#2d5a3d",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          transition: "background .15s ease, color .15s ease",
        }}
      >
        <Icon size={Math.round(size * 0.46)} strokeWidth={2.4} />
      </span>
    </span>
  );
}

/** Menu view picker. A circular chip (same model as DeckFilter) that opens a
 *  centered "liquid glass" modal with Día / Semana / Lista as circle options. */
function DeckNav({ value, onChange, options }) {
  const [open, setOpen] = useState(false);
  const active = options.find((o) => o.id === value) ?? options[0];
  const ActiveIcon = DECK_VIEW_ICON[active?.id] ?? CalendarDays;

  return (
    <>
      <button
        type="button"
        className="deck-press"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-label={`Vista del menú (${active?.label})`}
        title={`Vista · ${active?.label}`}
        style={{
          border: "none",
          background: "transparent",
          padding: 0,
          cursor: "pointer",
          fontFamily: "inherit",
          flexShrink: 0,
          display: "inline-flex",
          alignItems: "center",
          gap: 7,
        }}
      >
        <ViewCircle Icon={ActiveIcon} active size={42} />
        <span style={{ fontSize: 13.5, fontWeight: 800, color: "#2d5a3d", whiteSpace: "nowrap", letterSpacing: "-.2px" }}>
          {active?.label}
        </span>
        <ChevronDown size={15} strokeWidth={2.8} color="#9db3a6" style={{ marginLeft: -2 }} />
      </button>

      {open && (
        <div
          onClick={() => setOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 1000,
            background: "rgba(15,30,20,.34)",
            backdropFilter: "blur(2px)",
            WebkitBackdropFilter: "blur(2px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 20,
            animation: "deckFadeIn .18s ease both",
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 320,
              maxWidth: "calc(100vw - 40px)",
              background: "rgba(247,251,248,.8)",
              backdropFilter: "blur(26px) saturate(180%)",
              WebkitBackdropFilter: "blur(26px) saturate(180%)",
              borderRadius: 24,
              border: "1px solid rgba(255,255,255,.7)",
              boxShadow: "0 30px 70px rgba(20,47,29,.30), inset 0 1px 0 rgba(255,255,255,.6)",
              padding: 18,
              animation: "deckModalIn .22s cubic-bezier(.4,0,.2,1) both",
            }}
          >
            <div style={{ display: "flex", justifyContent: "center", gap: 22 }}>
              {options.map((o) => {
                const Icon = DECK_VIEW_ICON[o.id] ?? CalendarDays;
                const isActive = o.id === value;
                return (
                  <button
                    key={o.id}
                    type="button"
                    className="deck-press"
                    onClick={() => {
                      onChange(o.id);
                      setOpen(false);
                    }}
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: 8,
                      border: "none",
                      background: "transparent",
                      cursor: "pointer",
                      fontFamily: "inherit",
                      padding: 0,
                      minWidth: 62,
                    }}
                  >
                    <ViewCircle Icon={Icon} active={isActive} size={58} />
                    <span
                      style={{
                        fontSize: 12.5,
                        fontWeight: 800,
                        color: isActive ? "#2d5a3d" : "#5f7568",
                        maxWidth: 76,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {o.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/** The scope circle used both as the deck filter chip and inside its popup, so
 *  they are visually identical. `opt.group` null means the "Todos" circle. */
function ScopeCircle({ opt, active, size = 42 }) {
  return (
    <span
      style={{
        display: "inline-flex",
        borderRadius: 999,
        padding: 3,
        background: "rgba(255,255,255,.5)",
        boxShadow: active ? "0 0 0 2.5px #2d5a3d" : "0 0 0 1px rgba(45,90,61,.15)",
        transition: "box-shadow .15s ease",
      }}
    >
      {opt.group ? (
        <GroupMenuBadge group={opt.group} size={size} />
      ) : (
        <span
          style={{
            width: size,
            height: size,
            borderRadius: 999,
            background: "#2d5a3d",
            color: "#fff",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Users size={Math.round(size * 0.46)} strokeWidth={2.4} />
        </span>
      )}
    </span>
  );
}

/**
 * Deck filter — a circular chip (identical to the popup circles) that opens a
 * centered "liquid glass" modal to filter by menú (dieta/bebés/niños…) and by
 * persona. Only rendered when there are several menús.
 */
function DeckFilter({ groups, scope, onScopeChange, members }) {
  const [open, setOpen] = useState(false);

  const scopeOptions = [{ id: "all", label: "Todos", group: null }, ...groups.map((g) => ({ id: g.id, label: g.label, group: g }))];
  const activeOpt = scopeOptions.find((o) => o.id === scope) ?? scopeOptions[0];

  return (
    <>
      <button
        type="button"
        className="deck-press"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-label={`Filtrar menú (${activeOpt.label})`}
        title={`Filtrar · ${activeOpt.label}`}
        style={{
          border: "none",
          background: "transparent",
          padding: 0,
          cursor: "pointer",
          fontFamily: "inherit",
          flexShrink: 0,
          display: "inline-flex",
        }}
      >
        <ScopeCircle opt={activeOpt} active size={42} />
      </button>

      {open && (
        <div
          onClick={() => setOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 1000,
            background: "rgba(15,30,20,.34)",
            backdropFilter: "blur(2px)",
            WebkitBackdropFilter: "blur(2px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 20,
            animation: "deckFadeIn .18s ease both",
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 320,
              maxWidth: "calc(100vw - 40px)",
              background: "rgba(247,251,248,.8)",
              backdropFilter: "blur(26px) saturate(180%)",
              WebkitBackdropFilter: "blur(26px) saturate(180%)",
              borderRadius: 24,
              border: "1px solid rgba(255,255,255,.7)",
              boxShadow: "0 30px 70px rgba(20,47,29,.30), inset 0 1px 0 rgba(255,255,255,.6)",
              padding: 18,
              animation: "deckModalIn .22s cubic-bezier(.4,0,.2,1) both",
            }}
          >
            <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: ".6px", textTransform: "uppercase", color: "#5f7568", marginBottom: 12 }}>
              Menú
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 16, marginBottom: 18 }}>
              {scopeOptions.map((opt) => {
                const isActive = scope === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    className="deck-press"
                    onClick={() => {
                      onScopeChange(opt.id);
                      setOpen(false);
                    }}
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: 6,
                      border: "none",
                      background: "transparent",
                      cursor: "pointer",
                      fontFamily: "inherit",
                      padding: 0,
                      minWidth: 54,
                    }}
                  >
                    <ScopeCircle opt={opt} active={isActive} size={42} />
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 800,
                        color: isActive ? "#2d5a3d" : "#5f7568",
                        maxWidth: 68,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {opt.label}
                    </span>
                  </button>
                );
              })}
            </div>

            {members?.length > 0 && (
              <>
                <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: ".6px", textTransform: "uppercase", color: "#5f7568", marginBottom: 10 }}>
                  Personas
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 14 }}>
                  {members.map((member) => {
                    const color = memberAvatarColor(member.id, members);
                    const memberGroupId = groupForMember(member.id, groups)?.id ?? "all";
                    const active = scope === memberGroupId;
                    return (
                      <PersonScopeCircle
                        key={member.id}
                        member={member}
                        color={color}
                        active={active}
                        onClick={() => {
                          onScopeChange(memberGroupId);
                          setOpen(false);
                        }}
                      />
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}

export const MenuScreen = memo(function MenuScreen({
  data,
  setData,
  menuPlan,
  isGenerating = false,
  error = null,
  restrictionConflicts = [],
  onDishTap,
  onDishReplace,
  onDishSwap,
  onNav,
  onRegenerate,
  onRetry,
  onToast,
  onTrackEvent,
  activeMenu = null,
  onSwitchWeek,
  onOpenMenus,
  onOpenAnalytics,
  autoOpenProfile = false,
  onAutoOpenProfileHandled,
  initialViewMode = "dia",
  // Live shopping list (active week) + jump-to-cook-mode callback, so each
  // dish can show a "faltan ingredientes" dot instead of making you go check
  // Compra yourself.
  shoppingItems = null,
}) {
  const [scope, setScope] = useState("all");
  const [profileOpen, setProfileOpen] = useState(false);
  const [showIconCoach, setShowIconCoach] = useState(false);
  // Menu flexibility: long-press a dish → liquid-glass action sheet (swap /
  // regenerate). "Swapear" arms swap mode, where the next tap picks the dish to
  // exchange with.
  const [dishAction, setDishAction] = useState(null);
  const [swapSource, setSwapSource] = useState(null);

  const handleTileTap = useCallback(
    (sel) => {
      if (swapSource) {
        if (sameDish(swapSource, sel)) {
          setSwapSource(null);
          return;
        }
        onDishSwap?.(swapSource, sel);
        setSwapSource(null);
        return;
      }
      onDishTap?.(sel);
    },
    [swapSource, onDishSwap, onDishTap],
  );

  const handleTileLongPress = useCallback(
    (sel) => {
      if (swapSource) return;
      setDishAction(sel);
    },
    [swapSource],
  );
  const dishAvailability = useMemo(
    () => dishAvailabilityMap(shoppingItems ?? []),
    [shoppingItems],
  );

  // "Editar" desde la pantalla de Menús reutiliza este mismo sheet de "Tu
  // perfil" en vez de duplicar un flujo de edición aparte — es un signal
  // one-shot que el padre limpia tras consumirlo.
  useEffect(() => {
    if (!autoOpenProfile) return;
    setProfileOpen(true);
    onAutoOpenProfileHandled?.();
  }, [autoOpenProfile, onAutoOpenProfileHandled]);
  const [viewMode, setViewMode] = useState(initialViewMode); // "dia" | "semana"
  const [viewAnimDir, setViewAnimDir] = useState(0);
  // Deck is now the only menu UI. (The classic view has been retired; its render
  // branches are gated on `uiMode === "clasico"` and simply never activate.)
  const uiMode = "deck";
  const [deckView, setDeckView] = useState(() => {
    try {
      const saved = localStorage.getItem("menuDeckView");
      return saved === "semana" || saved === "lista" ? saved : "dia";
    } catch {
      return "dia";
    }
  }); // "dia" | "semana" | "lista"
  useEffect(() => {
    try {
      localStorage.setItem("menuDeckView", deckView);
    } catch {
      /* ignore */
    }
  }, [deckView]);
  const [filterPanelOpen, setFilterPanelOpen] = useState(true);
  const [headerMenuOpen, setHeaderMenuOpen] = useState(false);
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
  const weekLabel = useMemo(() => formatWeekRangeLabel(weekDates, activeDays), [weekDates, activeDays]);
  const hasMenu = !isGenerating && !error && Object.keys(menuPlan).length > 0;
  const menuWeeks = useMemo(() => orderedWeeks(activeMenu), [activeMenu]);
  const currentWeekIdx = useMemo(
    () => menuWeeks.findIndex((w) => w.offset === data.menuWeek?.offset),
    [menuWeeks, data.menuWeek],
  );
  const restrictionWarning = useMemo(
    () => summarizeMenuRestrictionConflicts(restrictionConflicts),
    [restrictionConflicts],
  );
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
    <div style={{ background: "#fff", minHeight: "100dvh" }}>
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
        @keyframes shareRipple {
          0%   { transform: scale(0); opacity: .3; }
          100% { transform: scale(3.5); opacity: 0; }
        }
        .share-chip-btn { position: relative; overflow: hidden; }
        .share-chip-btn::after {
          content: "";
          position: absolute;
          inset: 0;
          border-radius: 999px;
          background: #2d5a3d;
          transform: scale(0);
          opacity: 0;
          pointer-events: none;
        }
        .share-chip-btn:active::after { animation: shareRipple .4s ease-out; }
        .share-chip-icon {
          display: flex;
          transition: transform .4s cubic-bezier(0.68, -0.55, 0.265, 1.55);
        }
        .share-chip-icon.open { transform: rotate(180deg) scale(1.1); }
        .share-drop-row { transition: background .15s ease !important; }
        .share-drop-row:hover { background: #f3f8f4 !important; }
        .share-drop-row-icon {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 28px;
          height: 28px;
          border-radius: 50%;
          background: #e8f0ea;
          color: #2d5a3d;
          flex-shrink: 0;
          transition: background .22s ease, transform .3s cubic-bezier(0.68, -0.55, 0.265, 1.55), color .22s ease;
        }
        .share-drop-row:hover .share-drop-row-icon {
          background: #1a3a24;
          color: #fff;
          transform: scale(1.12);
        }
        .deck-scroller { scrollbar-width: none; -ms-overflow-style: none; }
        .deck-scroller::-webkit-scrollbar { display: none; }
        @keyframes deckNavMenuIn {
          from { opacity: 0; transform: translateY(-8px) scale(.98); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes deckNavItemIn {
          from { opacity: 0; transform: translateY(-6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes deckModalIn {
          from { opacity: 0; transform: scale(.94); }
          to   { opacity: 1; transform: scale(1); }
        }
        @keyframes deckFadeIn { from { opacity: 0; } to { opacity: 1; } }
        .deck-nav-menu { animation: deckNavMenuIn .18s cubic-bezier(.4,0,.2,1) both; transform-origin: top left; }
        .deck-nav-item { animation: deckNavItemIn .24s cubic-bezier(.4,0,.2,1) both; transition: background .15s ease; }
        .deck-nav-item:hover { background: #f3f8f4; }
        .deck-nav-item:active { background: #e8f0ea; }
        @keyframes sidebarIn { from { transform: translateX(100%); } to { transform: translateX(0); } }
        @keyframes sidebarItemIn { from { opacity: 0; transform: translateX(16px); } to { opacity: 1; transform: none; } }
        .sidebar-item {
          display: flex; align-items: center; gap: 13px; width: 100%;
          padding: 13px 12px; border: none; background: transparent; cursor: pointer;
          font-family: inherit; font-size: 14.5px; font-weight: 800; color: #1f3a29;
          text-align: left; border-radius: 12px;
          animation: sidebarItemIn .3s cubic-bezier(.4,0,.2,1) both;
          transition: background .15s ease;
        }
        .sidebar-item:hover { background: #f3f8f4; }
        .sidebar-item:active { background: #eef4ef; }

        /* View swap (Día / Semana / Lista): gentle rise + fade so switching feels fluid */
        @keyframes deckViewSwap { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
        .deck-view-swap { animation: deckViewSwap .34s cubic-bezier(.22,1,.36,1) both; will-change: transform, opacity; }

        /* Photo tiles: springy press + subtle image zoom for a tactile feel */
        .deck-tile { transition: transform .2s cubic-bezier(.34,1.4,.5,1); -webkit-tap-highlight-color: transparent; }
        .deck-tile:active { transform: scale(.975); }
        .deck-tile img { transition: transform .55s cubic-bezier(.22,1,.36,1); }
        .deck-tile:active img { transform: scale(1.05); }
        .deck-tile-actions { transition: transform .16s cubic-bezier(.34,1.4,.5,1), background .16s ease; }
        .deck-tile-actions:hover { transform: scale(1.14); background: rgba(12,22,15,.62); }
        .deck-tile-actions:active { transform: scale(.9); }

        /* Circular buttons (view picker + filter + view options) get a press cue */
        .deck-press { transition: transform .16s cubic-bezier(.34,1.4,.5,1); -webkit-tap-highlight-color: transparent; }
        .deck-press:active { transform: scale(.93); }

        @media (prefers-reduced-motion: reduce) {
          .deck-view-swap, .deck-tile, .deck-tile img, .deck-press,
          .sidebar-item, .deck-nav-item, .header-menu, .deck-nav-menu {
            animation: none !important;
            transition: none !important;
          }
        }
      `}</style>
      {/* ── Top header: title + actions ── */}
      <div style={{ background: "#e9f4ed", padding: "20px 20px 14px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span
              style={{
                width: 36,
                height: 36,
                borderRadius: 11,
                background: "#c3e6d1",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <ClipboardList size={18} color="#1f4a30" strokeWidth={2.4} />
            </span>
            <h2 style={{ fontSize: 20, fontWeight: 900, color: "#142f1d", margin: 0, letterSpacing: "-.3px" }}>
              Tu menú
            </h2>
            <CoachHelpButton active={showIconCoach} onClick={() => setShowIconCoach((v) => !v)} />
          </div>
          <button
            type="button"
            onClick={() => setHeaderMenuOpen(true)}
            aria-label="Opciones del menú"
            aria-haspopup="menu"
            aria-expanded={headerMenuOpen}
            title="Opciones"
            style={{ ...iconChipButtonStyle, background: headerMenuOpen ? "#e8f0ea" : "#fff" }}
          >
            <MenuIcon size={18} strokeWidth={2.4} />
          </button>
          {headerMenuOpen && (
            <div
              onClick={() => setHeaderMenuOpen(false)}
              style={{
                position: "fixed",
                top: 0,
                left: 0,
                right: 0,
                bottom: bottomNavSpacer(),
                zIndex: 1000,
                background: "rgba(15,30,20,.42)",
                backdropFilter: "blur(2px)",
                WebkitBackdropFilter: "blur(2px)",
                display: "flex",
                justifyContent: "center",
                animation: "deckFadeIn .2s ease both",
              }}
            >
              <div style={{ position: "relative", width: "100%", maxWidth: APP_SHELL_MAX_WIDTH }}>
              <aside
                role="menu"
                onClick={(e) => e.stopPropagation()}
                style={{
                  position: "absolute",
                  top: 0,
                  right: 0,
                  height: "100%",
                  width: 300,
                  maxWidth: "82%",
                  background: "#fff",
                  boxShadow: "-18px 0 50px rgba(20,47,29,.22)",
                  display: "flex",
                  flexDirection: "column",
                  animation: "sidebarIn .3s cubic-bezier(.4,0,.2,1) both",
                }}
              >
                <div style={{ background: "#e9f4ed", padding: "18px 16px 14px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                    <span
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: 11,
                        background: "#c3e6d1",
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                      }}
                    >
                      <MenuIcon size={18} color="#1f4a30" strokeWidth={2.4} />
                    </span>
                    <h2 style={{ fontSize: 18, fontWeight: 900, color: "#142f1d", margin: 0, letterSpacing: "-.3px" }}>
                      Opciones
                    </h2>
                  </div>
                  <button
                    type="button"
                    onClick={() => setHeaderMenuOpen(false)}
                    aria-label="Cerrar"
                    style={{ ...iconChipButtonStyle, width: 34, height: 34, borderRadius: 999, flexShrink: 0 }}
                  >
                    <X size={17} strokeWidth={2.5} />
                  </button>
                </div>
                <div style={{ padding: "8px 10px", overflowY: "auto" }}>
                  {[
                    onOpenAnalytics && { key: "analytics", label: "Análisis de tu menú", Icon: BarChart3, coach: "menu-analytics", action: onOpenAnalytics, tint: "#e7effe", ink: "#2563eb" },
                    onOpenMenus && { key: "menus", label: "Menús guardados", Icon: History, coach: "menu-menus", action: onOpenMenus, tint: "#f0e9fe", ink: "#7c3aed" },
                    hasMenu && { key: "share", label: "Compartir", Icon: Share2, action: handleShare, tint: "#e0f4f1", ink: "#0d9488" },
                    hasMenu && { key: "download", label: "Descargar PDF", Icon: Download, action: handleDownload, tint: "#fdf0e0", ink: "#d97706" },
                    { key: "profile", label: "Tu perfil", Icon: CircleUserRound, coach: "menu-profile", action: () => setProfileOpen(true), tint: "#e6f2ea", ink: "#2d5a3d" },
                    !isGenerating && { key: "regen", label: "Regenerar menú", Icon: RotateCw, action: onRegenerate, tint: "#e6f6ec", ink: "#16a34a" },
                  ]
                    .filter(Boolean)
                    .map((a, i, arr) => (
                      <div key={a.key}>
                        <button
                          type="button"
                          role="menuitem"
                          data-coach={a.coach}
                          className="sidebar-item"
                          style={{ animationDelay: `${i * 40}ms` }}
                          onClick={() => { a.action?.(); setHeaderMenuOpen(false); }}
                        >
                          <span style={{ ...sidebarIconStyle, background: a.tint, color: a.ink }}>
                            <a.Icon size={19} strokeWidth={2.5} />
                          </span>
                          <span style={{ flex: 1 }}>{a.label}</span>
                          <ChevronRight size={16} strokeWidth={2.4} color="#c2d3c8" />
                        </button>
                        {i < arr.length - 1 && (
                          <div style={{ height: 1, background: "rgba(45,90,61,.16)", margin: "0 12px" }} />
                        )}
                      </div>
                    ))}
                </div>
              </aside>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Filter panel: collapsible con animación (solo modo clásico) ── */}
      {uiMode === "clasico" && (
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
            multiGroup={multiGroup}
          />
          <div style={{ height: 1, background: "#e0eae3" }} />
        </div>
      )}

      {/* ── Zona de navegación: cabecera clásica (fecha/perfil/chevron) o nav del deck ── */}
      <div style={{ background: "#fff", padding: "12px 16px 0" }}>
        {uiMode === "clasico" && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
          <WeekRangeBadge label={weekLabel} hideLabel />
          <div style={{ flex: 1, display: "flex", justifyContent: "center" }}>
            <ProfileButton onClick={() => setProfileOpen(true)} />
          </div>
          <button
            type="button"
            data-coach="menu-filters"
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
        )}

        {/* ── Multi-week switcher: solo en clásico (en deck vive dentro del DeckNav) ── */}
        {uiMode === "clasico" && menuWeeks.length > 1 && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, marginBottom: 12 }}>
            <button
              type="button"
              onClick={() => currentWeekIdx > 0 && onSwitchWeek?.(menuWeeks[currentWeekIdx - 1].weekStart)}
              disabled={currentWeekIdx <= 0}
              aria-label="Semana anterior"
              style={weekNavArrowStyle(currentWeekIdx <= 0)}
            >
              <ChevronLeft size={16} />
            </button>
            <button
              type="button"
              onClick={onOpenMenus}
              style={{
                border: "none", background: "none", cursor: "pointer", fontFamily: "inherit",
                fontSize: 12.5, fontWeight: 800, color: "#2d5a3d", padding: "4px 8px",
              }}
            >
              Semana {Math.max(0, currentWeekIdx) + 1} de {menuWeeks.length}
            </button>
            <button
              type="button"
              onClick={() => currentWeekIdx < menuWeeks.length - 1 && onSwitchWeek?.(menuWeeks[currentWeekIdx + 1].weekStart)}
              disabled={currentWeekIdx >= menuWeeks.length - 1}
              aria-label="Semana siguiente"
              style={weekNavArrowStyle(currentWeekIdx >= menuWeeks.length - 1)}
            >
              <ChevronRight size={16} />
            </button>
          </div>
        )}

        {/* View controls — clásico: segmented + botón para entrar al Deck */}
        {hasMenu && uiMode === "clasico" && (
          <>
            <div data-coach="menu-viewmode" style={{ minWidth: 0 }}>
              <SegmentedControl
                value={viewMode}
                onChange={handleViewModeChange}
                options={MENU_VIEW_OPTIONS}
                style={{ marginBottom: 0 }}
              />
            </div>
            <MenuViewDivider options={MENU_VIEW_OPTIONS} value={viewMode} />
          </>
        )}

        {/* View controls — deck: vistas (izq) · semana (centro) · filtro círculo (der) */}
        {hasMenu && uiMode === "deck" && (
          <div
            data-coach="menu-viewmode"
            style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}
          >
            <DeckNav
              value={deckView}
              onChange={setDeckView}
              options={DECK_VIEW_OPTIONS}
            />
            <div style={{ flex: 1, minWidth: 0, display: "flex", justifyContent: "center" }}>
            {menuWeeks.length > 1 && (
              <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
                <button
                  type="button"
                  onClick={() => currentWeekIdx > 0 && onSwitchWeek?.(menuWeeks[currentWeekIdx - 1].weekStart)}
                  disabled={currentWeekIdx <= 0}
                  aria-label="Semana anterior"
                  style={weekNavArrowStyle(currentWeekIdx <= 0)}
                >
                  <ChevronLeft size={16} />
                </button>
                <button
                  type="button"
                  onClick={onOpenMenus}
                  style={{
                    border: "none", background: "none", cursor: "pointer", fontFamily: "inherit",
                    fontSize: 12.5, fontWeight: 800, color: "#2d5a3d", padding: "4px 4px",
                    whiteSpace: "nowrap",
                  }}
                >
                  Semana {Math.max(0, currentWeekIdx) + 1} de {menuWeeks.length}
                </button>
                <button
                  type="button"
                  onClick={() => currentWeekIdx < menuWeeks.length - 1 && onSwitchWeek?.(menuWeeks[currentWeekIdx + 1].weekStart)}
                  disabled={currentWeekIdx >= menuWeeks.length - 1}
                  aria-label="Semana siguiente"
                  style={weekNavArrowStyle(currentWeekIdx >= menuWeeks.length - 1)}
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            )}
            </div>
            {multiGroup && (
              <DeckFilter
                groups={data.groups}
                scope={scope}
                onScopeChange={setScope}
                members={data.members ?? []}
              />
            )}
          </div>
        )}
      </div>

      {/* ── Second divider: end of nav zone (solo clásico; en deck sobra) ── */}
      {uiMode === "clasico" && <div style={{ height: 1, background: "#e8eee9" }} />}

      {!isGenerating && error && (
        <ErrorCard error={error} onRetry={onRetry} />
      )}

      {!isGenerating && !error && Object.keys(menuPlan).length === 0 && (
        <EmptyState onRegenerate={onRegenerate} />
      )}

      {!isGenerating && !error && Object.keys(menuPlan).length > 0 && (
      <div>
        {restrictionWarning && (
          // Keyed on the message text so a NEW conflict (different dishes/
          // restrictions) re-surfaces even if the user dismissed an earlier one.
          <RestrictionConflictBanner key={restrictionWarning} message={restrictionWarning} onRegenerate={onRegenerate} />
        )}
        {uiMode === "deck" && (
          <div
            style={{
              paddingTop: 14,
              paddingLeft: 16,
              paddingRight: 16,
              paddingBottom: `calc(${bottomNavSpacer()} + 12px)`,
            }}
          >
            <MenuDeck
              deckView={deckView}
              days={activeDays}
              weekDates={weekDates}
              data={data}
              menuPlan={menuPlan}
              visibleGroups={visibleGroups}
              members={data.members ?? []}
              dishAvailability={dishAvailability}
              multiGroup={multiGroup}
              scope={scope}
              selectedDay={selectedDay}
              setSelectedDay={setSelectedDay}
              onDishTap={handleTileTap}
              onDishLongPress={handleTileLongPress}
            />
          </div>
        )}

        {dishAction &&
          createPortal(
            (() => {
              const W = 132;
              const EST_H = 78;
              const a = dishAction.anchor;
              const anchored = !!a?.icon;
              let menuPos = { transformOrigin: "top center" };
              if (anchored) {
                const vw = window.innerWidth;
                const vh = window.innerHeight;
                // Drop out of the ⋮ toward the bottom-LEFT so it clears the
                // thumbnail: the menu sits just left of the icon, dropping down
                // (flips up only if there's no room below).
                const below = a.icon.bottom + 8 + EST_H <= vh - 8;
                const top = below ? a.icon.bottom + 8 : Math.max(8, a.icon.top - EST_H - 8);
                const left = Math.min(Math.max(8, a.icon.left - W + 10), vw - W - 6);
                menuPos = {
                  position: "fixed",
                  top,
                  left,
                  transformOrigin: below ? "top right" : "bottom right",
                };
              }
              const rows = [
                {
                  id: "swap",
                  Icon: ArrowLeftRight,
                  label: "Intercambiar",
                  onPick: () => {
                    setSwapSource(dishAction);
                    setDishAction(null);
                  },
                },
                {
                  id: "regen",
                  Icon: RotateCw,
                  label: "Regenerar",
                  onPick: () => {
                    onDishReplace?.(dishAction);
                    setDishAction(null);
                  },
                },
              ];
              return (
                <div
                  onClick={() => setDishAction(null)}
                  style={{
                    position: "fixed",
                    inset: 0,
                    zIndex: 1200,
                    background: anchored ? "transparent" : "rgba(15,30,20,.34)",
                    backdropFilter: anchored ? "none" : "blur(2px)",
                    WebkitBackdropFilter: anchored ? "none" : "blur(2px)",
                    display: anchored ? "block" : "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: anchored ? 0 : 16,
                    animation: "deckFadeIn .18s ease both",
                  }}
                >
                  <style>{`
                    @keyframes dishActionPop {
                      0%   { opacity: 0; transform: scale(.72) translateY(-6px); }
                      55%  { opacity: 1; transform: scale(1.06) translateY(0); }
                      100% { opacity: 1; transform: scale(1) translateY(0); }
                    }
                  `}</style>

                  {/* Spotlight: dims everything except the affected thumbnail (a
                      giant box-shadow cut-out), so it stays clearly visible while
                      the menu drops out of its ⋮ icon. */}
                  {anchored && a.tile && (
                    <div
                      style={{
                        position: "fixed",
                        top: a.tile.top,
                        left: a.tile.left,
                        width: a.tile.width,
                        height: a.tile.height,
                        borderRadius: a.radius,
                        boxShadow: "0 0 0 9999px rgba(15,30,20,.5)",
                        border: "2.5px solid rgba(255,255,255,.9)",
                        pointerEvents: "none",
                        zIndex: 1201,
                        animation: "deckFadeIn .18s ease both",
                      }}
                    />
                  )}

                  <div
                    role="dialog"
                    aria-modal="true"
                    onClick={(e) => e.stopPropagation()}
                    style={{
                      ...menuPos,
                      zIndex: 1202,
                      width: W,
                      maxWidth: "calc(100vw - 12px)",
                      background: "rgba(247,251,248,.85)",
                      backdropFilter: "blur(26px) saturate(180%)",
                      WebkitBackdropFilter: "blur(26px) saturate(180%)",
                      borderRadius: 13,
                      border: "1px solid rgba(255,255,255,.7)",
                      boxShadow: "0 14px 34px rgba(20,47,29,.32), inset 0 1px 0 rgba(255,255,255,.6)",
                      padding: 4,
                      display: "flex",
                      flexDirection: "column",
                      gap: 2,
                      animation: "dishActionPop .3s cubic-bezier(.34,1.56,.64,1) both",
                    }}
                  >
                    {rows.map(({ id, Icon, label, onPick }) => (
                      <button
                        key={id}
                        type="button"
                        onClick={onPick}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 7,
                          width: "100%",
                          textAlign: "left",
                          padding: "5px 6px",
                          borderRadius: 9,
                          border: "none",
                          background: "transparent",
                          cursor: "pointer",
                          fontFamily: "inherit",
                        }}
                      >
                        <span
                          style={{
                            width: 22,
                            height: 22,
                            borderRadius: 7,
                            background: "linear-gradient(135deg, #2d5a3d 0%, #4cba6e 100%)",
                            boxShadow: "0 2px 6px rgba(45,90,61,.35)",
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            flexShrink: 0,
                          }}
                        >
                          <Icon size={12} strokeWidth={2.8} color="#fff" />
                        </span>
                        <span style={{ fontSize: 12, fontWeight: 800, color: "#142f1d" }}>{label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              );
            })(),
            document.body,
          )}

        {swapSource &&
          createPortal(
            <div
              style={{
                position: "fixed",
                left: 0,
                right: 0,
                bottom: 0,
                zIndex: 1150,
                display: "flex",
                justifyContent: "center",
                padding: `0 12px calc(${bottomNavSpacer()} + 10px)`,
                pointerEvents: "none",
              }}
            >
              <div
                style={{
                  pointerEvents: "auto",
                  width: 420,
                  maxWidth: "calc(100vw - 24px)",
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "11px 12px 11px 15px",
                  borderRadius: 18,
                  background: "rgba(20,47,29,.9)",
                  backdropFilter: "blur(18px) saturate(160%)",
                  WebkitBackdropFilter: "blur(18px) saturate(160%)",
                  boxShadow: "0 18px 44px rgba(20,47,29,.4)",
                  animation: "deckModalIn .2s cubic-bezier(.4,0,.2,1) both",
                }}
              >
                <ArrowLeftRight size={17} strokeWidth={2.6} color="#8ee0a6" style={{ flexShrink: 0 }} />
                <span style={{ flex: 1, minWidth: 0, color: "#fff", fontSize: 12.5, fontWeight: 700, lineHeight: 1.3 }}>
                  Toca el plato con el que intercambiar
                </span>
                <button
                  type="button"
                  onClick={() => setSwapSource(null)}
                  style={{
                    flexShrink: 0,
                    padding: "7px 13px",
                    borderRadius: 12,
                    border: "1px solid rgba(255,255,255,.28)",
                    background: "rgba(255,255,255,.12)",
                    color: "#fff",
                    fontFamily: "inherit",
                    fontSize: 12.5,
                    fontWeight: 800,
                    cursor: "pointer",
                  }}
                >
                  Cancelar
                </button>
              </div>
            </div>,
            document.body,
          )}

        {uiMode === "clasico" && (<>
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
            const meals = getDayMeals(data);
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
                  const cards = [];
                  const cardByKey = new Map();
                  for (const g of visibleGroups) {
                    const slot = menuPlan[g.id]?.[`${day}-${meal}`] ?? null;
                    if (!slot) continue;
                    for (const dish of dishesFromSlot(slot, isLunch)) {
                      const key = `${dish.recipeId}::${dish.courseKey}`;
                      const existing = cardByKey.get(key);
                      if (existing) {
                        existing.groups.push(g);
                        continue;
                      }
                      const card = { kind: "dish", group: g, groups: [g], slot, dish };
                      cardByKey.set(key, card);
                      cards.push(card);
                    }
                  }
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
                          // With a dish shared across groups the "who eats this"
                          // sub-line is ambiguous, so only show it for single-group dishes.
                          const groupMembers = membersOfGroup(card.group, members);
                          const slotEaters = eatersForSlot(card.group, members, schedule, day, meal);
                          const showEaters =
                            card.groups.length === 1 &&
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
                              group={card.group}
                              badgeGroups={card.groups}
                              showGroupBadge={multiGroup && scope === "all"}
                              kitchenTools={data.kitchenTools ?? []}
                              availability={dishAvailability.get(`${day}::${meal}::${card.dish.recipeId}`) ?? null}
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
        </>)}
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

      {showIconCoach && <MenuCoachTour onClose={() => setShowIconCoach(false)} />}

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

export function DishDetail({
  recipe, slot, kitchenTools = [], onClose, onReject,
  browse = false,
  // Group context — only present when opened from the weekly menu (not when
  // browsing the catalog). Used solely to resolve which "menú más cuidado"
  // badges this dish earns (see lib/healthProfileMatch.js).
  group = null,
  allMembers = [],
  // Public like/dislike rating — independent of favoriting. Applied by
  // tapping the accumulated thumbs-up/down counts (see RecipeProvenance).
  userVote = null,
  onVote,
  // Favorite (personal collection): `favoriteScope` is null when not a
  // favorite, else "all" | string[] of group labels. `scopeGroups` are the
  // selectable labels (only passed when the household has more than one menu
  // group); `onSetFavoriteScope(scope)` persists the choice (null to unfavorite).
  favoriteScope = null,
  scopeGroups = [],
  onSetFavoriteScope,
  // Optional demo hooks (first-run value-prop carousel):
  // - initialAppliance: preselect a cooking method tab.
  // - stepsByAppliance: bundled step lists per appliance, so the demo shows
  //   different Thermomix/airfryer steps offline without hitting /api/recipe-steps.
  // - autoDemo: "methods" cycles the method tabs; "reject" auto-picks a swap
  //   reason and fires onReject once. Default null → normal interactive behaviour.
  initialAppliance = null,
  stepsByAppliance = null,
  autoDemo = null,
  // Cook context — only present when opened from the weekly menu. Enables the
  // per-ingredient "lo tengo" ticks and "Marcar cocinado" (which discounts the
  // dish from the real pantry). day/meal/cookWeekKey identify this exact slot's
  // cooked flag; user/data/setData/onPantryChanged wire the pantry + persistence.
  day = null,
  meal = null,
  cookWeekKey = null,
  user = null,
  data = null,
  setData = null,
  onToast = null,
  onPantryChanged = null,
}) {
  const isFavorite = favoriteScope != null;
  const rejectReasons = ["No me gusta", "Esta semana no", "Tarda demasiado", "Lo comí hace poco"];
  const [rejected, setRejected] = useState(null);
  // Demo only (autoDemo="reject"): visual "press" on "Sustituir plato" right
  // before firing onReject, since the auto-trigger skips the real pointerdown.
  const [demoPressed, setDemoPressed] = useState(false);
  const [ingredientsOpen, setIngredientsOpen] = useState(false);
  const [scopeOpen, setScopeOpen] = useState(false);
  // Pasos del método activo. La base usa los del catálogo (o IA bajo demanda);
  // los métodos por electrodoméstico se piden a /api/recipe-steps (caché Redis).
  const [steps, setSteps] = useState(() => recipe.steps ?? []);
  const [stepsLoading, setStepsLoading] = useState(
    () => (recipe.steps?.length ?? 0) === 0
  );
  const stepsCacheRef = useRef({});
  const ingredients = scaledIngredients(recipe, slot.eaters);

  // ── Cook mode (moved here from the old "Modo cocina" tab in Compra) ──
  // Only when opened from the weekly menu with a real slot. Pantry is the single
  // source of truth: a tick means "you already have it in En casa"; "Marcar
  // cocinado" discounts the dish's ingredients from that stock (undo restores).
  const cookable = !browse && day != null && meal != null && cookWeekKey != null && setData != null;
  const cookedKey = cookable ? `${cookWeekKey}::${day}::${meal}::${recipe.id}` : null;
  const isCooked = cookedKey ? (data?.cookedDishes ?? []).includes(cookedKey) : false;
  const [pantryStock, setPantryStock] = useState([]);
  const [cookBusy, setCookBusy] = useState(false);
  useEffect(() => {
    if (!cookable) return;
    let active = true;
    (async () => {
      const stock = user ? await loadPantry(user.id) : loadLocalPantry();
      if (active) setPantryStock(stock);
    })();
    return () => { active = false; };
  }, [cookable, user]);
  const reloadCookStock = async () => {
    setPantryStock(user ? await loadPantry(user.id) : loadLocalPantry());
    onPantryChanged?.();
  };
  // Which ingredients are already covered by real stock (drives the tick).
  const haveByIngId = useMemo(() => {
    const map = {};
    if (cookable) {
      for (const ing of ingredients) {
        const stock = findMatchingPantryItem(ing.name, pantryStock, { adapted: Boolean(ing.adapted) });
        map[ing.id] = Boolean(stock && Number(stock.qty) > 0);
      }
    }
    return map;
  }, [cookable, ingredients, pantryStock]);
  // "Lo tengo": you have this even though it's not registered — add it to En
  // casa (the override we agreed on), so the tick lights up and cooking can
  // later discount it. Uses the dish's scaled need as the stocked amount.
  const markIngredientOwned = async (ing) => {
    const parsed = normalizePantryInput(ing.name)[0];
    if (!parsed) return;
    const item = {
      name: parsed.raw,
      normalized: parsed.ambiguous ? parsed.candidates[0].normalized : parsed.normalized,
      qty: Number(ing.qtyScaled) > 0 ? Number(ing.qtyScaled) : 1,
      unit: ing.unit ?? "ud",
      source: "manual",
    };
    if (user) await addPantryItems(user.id, [item]);
    else addLocalPantryItems([item]);
    await reloadCookStock();
  };
  const cookIngredients = () =>
    ingredients.map((ing) => ({
      name: ing.name,
      qty: ing.qtyScaled,
      unit: ing.unit,
      adapted: ing.adapted,
    }));
  // Decisión D (cuándo se descuenta): "Marcar cocinado" solo resta de la
  // despensa real si el usuario eligió "Al darle a «Cocinado»" (onCook, el
  // default). Si eligió "Al generar el menú" o "Al final del día", esa resta
  // ya ocurrió (o la hará el barrido automático) — marcar cocinado aquí es
  // solo un tick informativo y no debe descontar dos veces. "No descontar"
  // tampoco resta nunca.
  const shouldConsumeOnCook = (data?.pantryPrefs?.consume ?? "onGenerate") === "onCook";
  const handleMarkCooked = async () => {
    if (!cookable || isCooked || cookBusy) return;
    setCookBusy(true);
    try {
      const { deltas, decremented } = shouldConsumeOnCook
        ? await consumeFromPantry(cookIngredients(), pantryStock, { user })
        : { deltas: [], decremented: 0 };
      setData((d) => ({
        ...d,
        cookedDishes: [...(d?.cookedDishes ?? []), cookedKey],
        cookedDeltas: { ...(d?.cookedDeltas ?? {}), [cookedKey]: deltas },
      }));
      if (shouldConsumeOnCook) await reloadCookStock();
      onToast?.(decremented ? `¡Cocinado! Stock en casa actualizado (${decremented})` : "¡Cocinado!");
    } finally {
      setCookBusy(false);
    }
  };
  const handleUndoCooked = async () => {
    if (!cookable || !isCooked || cookBusy) return;
    setCookBusy(true);
    try {
      const deltas = data?.cookedDeltas?.[cookedKey] ?? [];
      const restored = await restoreToPantry(deltas, { user });
      setData((d) => {
        const nextDeltas = { ...(d?.cookedDeltas ?? {}) };
        delete nextDeltas[cookedKey];
        return {
          ...d,
          cookedDishes: (d?.cookedDishes ?? []).filter((k) => k !== cookedKey),
          cookedDeltas: nextDeltas,
        };
      });
      await reloadCookStock();
      onToast?.(restored ? `Cocinado deshecho · stock devuelto (${restored})` : "Cocinado deshecho");
    } finally {
      setCookBusy(false);
    }
  };
  // Fall back to the flat protein_g/carbs_g/fat_g shape (raw catalog / user
  // recipes) and finally to 0, so a recipe without a hydrated `macros` object
  // never crashes the detail view.
  const macros = recipe.macros ?? {
    protein: recipe.protein_g ?? 0,
    carbs: recipe.carbs_g ?? 0,
    fat: recipe.fat_g ?? 0,
  };
  const selectedMethod = selectMethodForRecipe(recipe, kitchenTools);

  const detailGroupMembers = group ? membersOfGroup(group, allMembers) : [];
  const detailActiveHealthProfiles = detailGroupMembers.flatMap((m) => m.healthProfiles ?? []);
  const healthBadges = matchingHealthProfiles(recipe.healthFlags, detailActiveHealthProfiles);

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

  // Siempre abre en "Tradicional" (base): el electrodoméstico más rápido del
  // usuario solo se destaca como sugerencia (chip "isYours" más abajo), nunca
  // reemplaza el método por defecto — así la ficha no "salta" de método según
  // qué tenga cada uno en casa.
  const [activeAppliance, setActiveAppliance] = useState(() => initialAppliance ?? "base");
  const activeMethod =
    methodOptions.find((o) => o.appliance === activeAppliance) ?? methodOptions[0];

  // Demo autoplay for the value-prop carousel (guarded by autoDemo).
  useEffect(() => {
    if (autoDemo !== "methods" || methodOptions.length <= 1) return undefined;
    let i = 0;
    const id = setInterval(() => {
      i = (i + 1) % methodOptions.length;
      setActiveAppliance(methodOptions[i].appliance);
    }, 1700);
    return () => clearInterval(id);
  }, [autoDemo, methodOptions]);

  useEffect(() => {
    if (autoDemo !== "reject") return undefined;
    const t1 = setTimeout(() => setRejected(rejectReasons[0]), 1100);
    const t2 = setTimeout(() => setDemoPressed(true), 1750);
    const t3 = setTimeout(() => onReject?.(slot, rejectReasons[0]), 2000);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoDemo]);

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

    // Demo: pasos empaquetados por método (evita /api/recipe-steps offline).
    const bundled = stepsByAppliance?.[activeAppliance];
    if (bundled && bundled.length > 0) {
      stepsCacheRef.current[activeAppliance] = bundled;
      setSteps(bundled);
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
  }, [recipe, activeAppliance, stepsByAppliance]);

  return (
    <div className="mp-overlay-in" style={detailOverlayStyle} onClick={onClose}>
      <div className="mp-sheet-up" style={detailSheetStyle} onClick={(e) => e.stopPropagation()}>
        <button type="button" onClick={onClose} aria-label="Cerrar detalle" style={closeButtonStyle}>
          <X size={20} />
        </button>

        <DishVisual
          recipe={recipe}
          height={220}
          imageUrl={dishImageForRecipe(recipe)}
          eyebrow={browse ? "Catálogo" : "Receta de la semana"}
        />

        <div style={{ padding: "18px 2px 0" }}>
          {(onSetFavoriteScope || recipe.owner || recipe.rating || browse) && (
            <div style={{ marginBottom: 14, borderRadius: 16, background: "#fff", border: "2px solid #2d5a3d", padding: "12px 14px", display: "flex", flexDirection: "column", gap: 12 }}>
              {/* Row 1 — owner + date on the left, votes on the right, all in a
                  single horizontal line. */}
              {(recipe.owner || recipe.rating || browse) && (
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  {recipe.owner?.avatar ? (
                    <img
                      src={recipe.owner.avatar}
                      alt={recipe.owner.name ?? ""}
                      style={{ width: 30, height: 30, borderRadius: 999, objectFit: "cover", flexShrink: 0 }}
                    />
                  ) : (
                    <MenuPlanBadge size={30} />
                  )}
                  <div style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "baseline", gap: 6, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 13.5, fontWeight: 800, color: recipe.owner ? "#2f6fb8" : "#2d5a3d" }}>
                      {recipe.owner ? (recipe.owner.name ?? "Tú") : "MenuPlan"}
                    </span>
                    {recipe.createdAt && (
                      <span style={{ fontSize: 12.5, fontWeight: 700, color: "#9ab0a1" }}>
                        · {formatRecipeDate(recipe.createdAt)}
                      </span>
                    )}
                  </div>
                  <div style={{ flexShrink: 0 }}>
                    <RecipeVoteCounts
                      up={recipe.rating?.up ?? 0}
                      down={recipe.rating?.down ?? 0}
                      userVote={userVote}
                      onVote={onVote}
                      textSize={13}
                      iconSize={16}
                    />
                  </div>
                </div>
              )}

              {/* Divider between the owner/votes row and the favorite row. */}
              {onSetFavoriteScope && (recipe.owner || recipe.rating || browse) && (
                <div style={{ height: 1, background: "#eef3f0" }} />
              )}

              {/* Row 2 — favorite toggle + the groups it applies to. */}
              {onSetFavoriteScope && (
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  <button
                    type="button"
                    onClick={() => {
                      if (scopeGroups.length > 1) setScopeOpen(true);
                      else onSetFavoriteScope(isFavorite ? null : "all");
                    }}
                    aria-label={isFavorite ? "Quitar de favoritas" : "Añadir a favoritas"}
                    style={{
                      display: "inline-flex", alignItems: "center", gap: 8,
                      padding: 0, cursor: "pointer", flexShrink: 0,
                      border: "none", background: "transparent", fontFamily: "inherit",
                    }}
                  >
                    <span
                      style={{
                        width: 32, height: 32, borderRadius: 10, flexShrink: 0,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        border: `1.5px solid ${isFavorite ? "#e0405a" : "#dde7e0"}`,
                        background: isFavorite ? "#fdeef1" : "#fff",
                      }}
                    >
                      <Heart
                        size={16}
                        color={isFavorite ? "#e0405a" : "#9ab0a1"}
                        strokeWidth={isFavorite ? 2.4 : 2}
                        fill={isFavorite ? "#e0405a" : "none"}
                      />
                    </span>
                    <span style={{ fontSize: 13, fontWeight: 800, color: isFavorite ? "#e0405a" : "#7a9485" }}>
                      {isFavorite ? "Quitar" : "Favorito"}
                    </span>
                  </button>

                  {isFavorite && scopeGroups.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setScopeOpen(true)}
                      style={{
                        display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap",
                        border: "none", background: "transparent", padding: 0,
                        fontFamily: "inherit", cursor: "pointer",
                      }}
                    >
                      <span style={{ fontSize: 13, fontWeight: 700, color: "#9ab0a1", marginRight: 2 }}>Para:</span>
                      {(!Array.isArray(favoriteScope) ? ["Todos"] : favoriteScope).map((label) => (
                        <span
                          key={label}
                          style={{
                            display: "inline-flex", alignItems: "center", gap: 4,
                            padding: "4px 9px", borderRadius: 999,
                            border: "1.5px solid #f0aebb", background: "#fdeef1",
                            fontSize: 13, fontWeight: 800, color: "#e0405a",
                          }}
                        >
                          {label}
                        </span>
                      ))}
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {scopeOpen && (
            <FavoriteScopeModal
              recipeName={recipe.name}
              isFavorite={isFavorite}
              scope={favoriteScope}
              groups={scopeGroups}
              onPick={(key) => {
                onSetFavoriteScope(key === "__remove" ? null : key === "all" ? "all" : [key]);
                setScopeOpen(false);
              }}
              onClose={() => setScopeOpen(false)}
            />
          )}

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

          {recipe.adaptations?.length > 0 && (
            <div style={{
              display: "flex", alignItems: "flex-start", gap: 8,
              marginBottom: 14,
              padding: "12px 15px",
              borderRadius: 16,
              background: "#f2f9f4",
              border: "2px solid #4cba6e",
            }}>
              <Leaf size={15} color="#2f9e52" strokeWidth={2.4} style={{ marginTop: 1, flexShrink: 0 }} />
              <div>
                <div style={{ fontSize: 11, fontWeight: 800, color: "#2f9e52", letterSpacing: ".3px", textTransform: "uppercase" }}>
                  Adaptado: {Array.from(new Set(recipe.adaptations.map((a) => a.label))).join(", ")}
                </div>
                <div style={{ fontSize: 12, fontWeight: 600, color: "#3a5a44", marginTop: 3 }}>
                  {recipe.adaptations.map((a) => `${a.from} → ${a.to}`).join(" · ")}
                </div>
              </div>
            </div>
          )}

          {healthBadges.map(({ id, Icon, label, color, explain }) => (
            <div
              key={id}
              style={{
                display: "flex", alignItems: "flex-start", gap: 8,
                marginBottom: 14,
                padding: "12px 15px",
                borderRadius: 16,
                background: `${color}10`,
                border: `2px solid ${color}`,
              }}
            >
              <Icon size={15} color={color} strokeWidth={2.4} style={{ marginTop: 1, flexShrink: 0 }} />
              <div>
                <div style={{ fontSize: 11, fontWeight: 800, color, letterSpacing: ".3px", textTransform: "uppercase" }}>
                  Menú más cuidado · {label}
                </div>
                <div style={{ fontSize: 12, fontWeight: 600, color: "#3a4a42", marginTop: 3 }}>
                  {explain}
                </div>
              </div>
            </div>
          ))}

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

          <section className="mp-recipe-section" style={recipeBlockStyle}>
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
              <div style={{ display: "grid", gap: 7, marginBottom: cookable ? 12 : 16 }}>
                {ingredients.map((ing) => {
                  const owned = cookable && haveByIngId[ing.id];
                  return (
                    <div key={ing.id} style={ingredientRowStyle}>
                      {cookable && (
                        owned ? (
                          <span
                            title="Ya lo tienes en casa"
                            style={{
                              width: 18, height: 18, borderRadius: 6, flexShrink: 0,
                              display: "inline-flex", alignItems: "center", justifyContent: "center",
                              background: "#4cba6e",
                            }}
                          >
                            <Check size={12} strokeWidth={3.2} color="#fff" />
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => markIngredientOwned(ing)}
                            title="Marcar que ya lo tienes (lo añade a En casa)"
                            style={{
                              width: 18, height: 18, borderRadius: 6, flexShrink: 0,
                              display: "inline-flex", alignItems: "center", justifyContent: "center",
                              background: "#fff", border: "1.5px solid #cdddd2", cursor: "pointer",
                              padding: 0,
                            }}
                          />
                        )
                      )}
                      <span
                        style={{
                          flex: 1, minWidth: 0,
                          ...(owned ? { color: "#9aa89f", textDecoration: "line-through" } : null),
                        }}
                      >
                        {ing.name}
                      </span>
                      {ing.hint && (
                        <>
                          <span style={ingredientHintStyle}>{ing.hint}</span>
                          <span style={ingredientDividerStyle} />
                        </>
                      )}
                      <strong style={ingredientQtyStyle}>{ing.label}</strong>
                    </div>
                  );
                })}
              </div>
            )}
            {cookable && (
              <button
                type="button"
                onClick={isCooked ? handleUndoCooked : handleMarkCooked}
                disabled={cookBusy}
                title={
                  isCooked
                    ? "Deshacer: devuelve estos ingredientes a lo que tienes en casa"
                    : "Descuenta estos ingredientes de lo que tienes en casa"
                }
                style={{
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                  width: "100%", marginBottom: 16, padding: "11px 12px", borderRadius: 12,
                  border: isCooked ? "1.5px solid #bcdcc7" : "1.5px solid #2d5a3d",
                  background: isCooked ? "#eaf3ec" : "#fff",
                  color: "#2d5a3d", fontSize: 13, fontWeight: 800,
                  cursor: cookBusy ? "default" : "pointer", fontFamily: "inherit",
                  opacity: cookBusy ? 0.6 : 1,
                }}
              >
                {isCooked ? <Undo2 size={15} strokeWidth={2.6} /> : <ChefHat size={15} strokeWidth={2.4} />}
                {isCooked ? "Deshacer cocinado" : "Marcar cocinado"}
              </button>
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

          {/* Swap section — only when opened from the weekly menu */}
          {!browse && onReject && (
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
                  boxShadow: demoPressed ? "0 1px 6px rgba(45,90,61,.25)" : "0 4px 14px rgba(45,90,61,.25)",
                  marginTop: 10,
                  transform: demoPressed ? "scale(.95)" : "scale(1)",
                  transition: "transform .15s ease, box-shadow .15s ease",
                }}
              >
                <RotateCw size={14} />
                Sustituir plato
              </button>
            )}
          </div>
          )}
        </div>
      </div>
    </div>
  );
}

const iconChipButtonStyle = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: 36,
  height: 36,
  padding: 0,
  borderRadius: 12,
  border: "1.5px solid #dbe7df",
  background: "#fff",
  color: "#2d5a3d",
  cursor: "pointer",
  flexShrink: 0,
  fontFamily: "inherit",
  boxShadow: "0 6px 16px -12px rgba(20,47,29,.3)",
};

const sidebarIconStyle = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: 38,
  height: 38,
  borderRadius: 11,
  flexShrink: 0,
};

function weekNavArrowStyle(disabled) {
  return {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: 26,
    height: 26,
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
  alignItems: "center",
  justifyContent: "space-between",
  gap: 10,
  padding: "8px 10px",
  borderRadius: 10,
  background: "#f8faf8",
  color: "#526057",
  fontSize: 12,
};

// Secondary "kitchen-friendly" reading (≈ 3 muslos / al gusto). Same color as
// the exact g/ml amount — it's not a warning or a different kind of data, just
// a softer weight — separated from it by ingredientDividerStyle instead.
// Fixed width + right alignment so the divider lands in the same spot on
// every row instead of drifting with each hint's text length.
const ingredientHintStyle = {
  flexShrink: 0,
  width: 92,
  textAlign: "right",
  fontSize: 11,
  fontWeight: 600,
  color: "#526057",
  whiteSpace: "nowrap",
};

const ingredientDividerStyle = {
  flexShrink: 0,
  width: 1,
  height: 13,
  background: "#d7e3da",
};

const ingredientQtyStyle = {
  flexShrink: 0,
  minWidth: 48,
  textAlign: "right",
  whiteSpace: "nowrap",
};

