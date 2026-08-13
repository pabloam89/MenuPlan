import { createContext, Fragment, memo, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  AlertTriangle,
  ArrowLeftRight,
  BarChart3,
  Blend,
  BookOpen,
  BookOpenCheck,
  CalendarDays,
  CalendarOff,
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
  CopyPlus,
  CookingPot,
  History,
  IceCream,
  LayoutGrid,
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
  Plus,
  RotateCcw,
  RotateCw,
  Salad,
  Search,
  Shell,
  Shuffle,
  SlidersHorizontal,
  Share2,
  ShoppingCart,
  Trash2,
  Soup,
  Sparkles,
  Heart,
  ThumbsDown,
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
import guarnicionesData from "../data/recipes/guarniciones.json";
import { categoryColor, categoryIcon, categoryLabel, isKnownCategory } from "./CatalogBrowserSheet.jsx";
import { isQualitativeUnit, qualitativeUnitLabel } from "../lib/ingredientCategories.js";
import { ingredientImageFor, ingredientThumbSrc, categoryImageSrc } from "../lib/ingredientImages.js";
import { mealTimeColor, mealTimeBg } from "../lib/mealTimes.js";
import { kitchenHint, pantryPieceCountLabel } from "../lib/kitchenUnits.js";
import { findMatchingPantryItem } from "../lib/shoppingBuilder.js";
import { consumeFromPantry, restoreToPantry } from "../lib/cookPantry.js";
import { addPantryItems, addLocalPantryItems, loadPantry, loadLocalPantry, removePantryItem, removeLocalPantryItem } from "../lib/pantry.js";
import { normalizePantryInput } from "../utils/normalizePantryInput.js";
import { membersOfGroup, isBabyMenuGroup, adhocReasonLabel } from "../lib/groups.js";
import { eatersForSlot } from "../lib/slotEaters.js";
import { summarizeMenuRestrictionConflicts } from "../utils/menuConflicts.js";
import { Avatar, BottomNav, Chip, GroupAvatarStack, GroupScopePicker, SegmentedControl, WeekRangeBadge, bottomNavSpacer, groupAvatarFaces, APP_SHELL_MAX_WIDTH } from "../components/ui.jsx";
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
import { dishAvailabilityMap, formatDisplay } from "../lib/shoppingListUtils.js";
import { initialsOf, AVATAR_PALETTE, memberAvatarColor, memberAvatarThumbSrc } from "../lib/stages.js";
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

// Soft badge tints for empty-slot placeholders, per meal (matches the meal icon).
const MEAL_EMPTY_ACCENT = {
  Desayuno: { tint: "#efe6db", ink: "#9b6a3f" },
  Comida:   { tint: "#fbf0d9", ink: "#c98a1e" },
  Merienda: { tint: "#fde6e6", ink: "#c0504d" },
  Cena:     { tint: "#e7ecf9", ink: "#4f68b0" },
  Postre:   { tint: "#fbe7f1", ink: "#c0568f" },
  _default: { tint: "#e4efe8", ink: "#5f7d6c" },
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

function DaySectionHeader({ day, dayNumber, right = null }) {
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
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
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
        {right}
      </div>
    </div>
  );
}

const DAY_LETTERS = { Lun: "L", Mar: "M", Mié: "X", Jue: "J", Vie: "V", Sáb: "S", Dom: "D" };
const MENU_VIEW_OPTIONS = [
  { id: "dia", label: "Por día" },
  { id: "semana", label: "Semana" },
];
const GROUP_ABBREV = { Adultos: "A", Niños: "N", "Bebé": "B", Familia: "F" };

// An ad-hoc menú isn't a set of people, and a caller with no roster can't
// resolve anyone — both fall back to the initial. Below ~16px even a head-and-
// shoulders thumb is mush, so tiny badges keep the letter too.
function groupBadgeFaces(group, members, size) {
  if (group?.adHoc || !members || size < 16) return [];
  return groupAvatarFaces(members.filter((m) => group.memberIds?.includes(m.id)), members);
}

// Menu badges sit inline beside dish names and day headers, where a stack that
// grows with the household would shove the layout around — so unlike everywhere
// else these keep the single row and the "+N" counter.
function GroupMenuBadge({ group, size = 22, members, active = true, max = 4 }) {
  const abbrev = GROUP_ABBREV[group.label] ?? group.label.charAt(0);
  const displayLabel = group.adHoc ? adhocReasonLabel(group.reason) : group.label;
  const faces = groupBadgeFaces(group, members, size);
  if (faces.length > 0) {
    return (
      <span title={displayLabel} style={{ display: "inline-flex" }}>
        <GroupAvatarStack faces={faces} size={size} active={active} max={max} />
      </span>
    );
  }
  return (
    <span
      title={group.adHoc ? `${displayLabel} · menú individual` : displayLabel}
      style={{
        width: size,
        height: size,
        borderRadius: 999,
        overflow: "hidden",
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
  const avatar = memberAvatarThumbSrc(member);
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
          overflow: "hidden",
          boxSizing: "border-box",
          // Same hollow-until-selected rule as the group stacks beside it.
          background: active ? color : "#fff",
          border: `2px solid ${color}`,
          color: active ? "#fff" : color,
          fontSize: 11,
          fontWeight: 900,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          boxShadow: active ? `0 3px 10px ${color}55` : "none",
          transition: "background .15s ease, border-color .15s ease, box-shadow .15s ease",
        }}
      >
        {avatar
          ? <img src={avatar} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
          : abbrev}
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
            members={members}
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
    // A 44px thumbnail never needs the ~1MB origin blob — fetch a tiny derivative
    // sized for the icon (×2 for retina), in WebP.
    const thumbW = Math.max(96, size * 2);
    return (
      <img
        src={deckImg(imageUrl, thumbW)}
        srcSet={deckSrcSet(imageUrl, size)}
        sizes={`${size}px`}
        alt={recipe.name}
        width={size}
        height={size}
        loading="lazy"
        decoding="async"
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
          src={deckImg(imageUrl, 720)}
          srcSet={deckSrcSet(imageUrl, 720)}
          sizes="100vw"
          alt={recipe.name}
          decoding="async"
          onError={() => setImgFailed(true)}
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
            background: visual.surface,
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
          {membersWithAllergies.length === 0 && membersWithRegimen.length === 0 ? (
            <span style={{ fontSize: 12, color: "#9ab0a1" }}>Toca para añadir alergias, intolerancias o lo que no os gusta.</span>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {membersWithAllergies.map((m) => {
                const memberColor = memberAvatarColor(m.id, members);
                return (
                  <div key={m.id} style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                    <div style={{
                      width: 26, height: 26, borderRadius: 999, flexShrink: 0, overflow: "hidden",
                      background: memberColor, display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 11, fontWeight: 900, color: "#fff",
                    }}>
                      {memberAvatarThumbSrc(m)
                        ? <img src={memberAvatarThumbSrc(m)} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                        : (m.name ?? "?")[0].toUpperCase()}
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
                          width: 18, height: 18, borderRadius: 999, overflow: "hidden", flexShrink: 0,
                          background: memberColor, display: "flex", alignItems: "center", justifyContent: "center",
                          fontSize: 9, fontWeight: 900, color: "#fff",
                        }}>
                          {memberAvatarThumbSrc(m)
                            ? <img src={memberAvatarThumbSrc(m)} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                            : (m.name ?? "?")[0].toUpperCase()}
                        </div>
                        {m.name}: {memberCareTags(m).join(", ")}
                      </div>
                    );
                  })}
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
                members={members}
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
// While a "Mover"/"Duplicar" action is armed, the source dish is highlighted
// across the deck so it's obvious which one is about to move. Provided by
// MenuScreen and consumed by the deck tiles/cards without prop drilling.
const ArmedContext = createContext(null);

// Overlay that draws the traveling green "about to move" ring. Absolutely
// positioned, so its host must be `position: relative`. `radius` matches the
// host's border-radius so the ring hugs the corners exactly.
function ArmedRing({ radius = 14 }) {
  return <span aria-hidden="true" className="armed-ring" style={{ borderRadius: radius }} />;
}

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
  // When true, this dish is the source of an armed "Mover"/"Duplicar" action —
  // draw a ring + tint so it's clear which one is being moved.
  highlight = false,
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
        position: "relative",
        width: "100%",
        border: "none",
        borderBottom: showDivider && !highlight ? "1px solid #e8f0ea" : "none",
        touchAction: "pan-y",
        textAlign: "left",
        display: "flex",
        gap: 12,
        padding: highlight ? "12px 8px" : "12px 2px",
        background: highlight ? "#eaf6ee" : "transparent",
        borderRadius: highlight ? 14 : 0,
        cursor: "pointer",
        fontFamily: "inherit",
      }}
    >
      {highlight && <ArmedRing radius={14} />}
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
                      photo={memberAvatarThumbSrc(member)}
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
  // La vista "Resumen" (id "lista") sigue en el código (DeckCalendar) pero aún
  // no está lista, así que no la exponemos en el switch todavía. Reactivar
  // cuando esté terminada volviendo a añadir: { id: "lista", label: "Resumen" }.
];

const DECK_VIEW_ICON = { dia: CalendarDays, semana: Layers2, lista: LayoutGrid };

// On-the-fly image optimization for the deck's big photos: the origin blobs are
// ~1.5–1.8 MB / ~1024px, far too heavy for full-bleed tiles. wsrv.nl resizes +
// converts to WebP at the edge (origin stays cached separately). Temporary until
// we ship pre-generated derivatives with sharp.
// WebP only: wsrv.nl's free endpoint returns HTTP 400 for `output=avif`, and a
// failed <source> in a <picture> does NOT fall back to <img src> — it just shows
// nothing. So we stick to WebP, which every target browser supports.
function deckImg(url, w = 720) {
  if (!url) return null;
  return `https://wsrv.nl/?url=${encodeURIComponent(url)}&w=${w}&output=webp&q=72`;
}

// Responsive srcset with width descriptors so the browser fetches the size that
// actually fits the tile × device pixel ratio (instead of a fixed 720px for a
// 160px thumbnail). Caps at 1080 — the origin blobs are ~1024px, so asking for
// more just upscales. Paired with a `sizes` hint of the tile's CSS width.
function deckSrcSet(url, w = 720) {
  if (!url) return null;
  const hi = Math.min(Math.round(w * 2), 1080);
  const lo = Math.min(w, hi);
  const parts = [`${deckImg(url, lo)} ${lo}w`];
  if (hi > lo) parts.push(`${deckImg(url, hi)} ${hi}w`);
  return parts.join(", ");
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
      const dishes = dishesFromSlot(slot, isLunch);
      // A slot the user emptied ("Vaciar hueco") keeps a `cleared` flag so we can
      // still render a tappable placeholder to refill it (per group, no dedup).
      if (dishes.length === 0) {
        if (slot.cleared) {
          const key = `empty::${meal}::${g.id}`;
          if (!byKey.has(key)) {
            const tile = { meal, group: g, groups: [g], slot, dish: null, empty: true };
            byKey.set(key, tile);
            tiles.push(tile);
          }
        }
        continue;
      }
      for (const dish of dishes) {
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
function DeckTile({ tile, day, onDishTap, onDishLongPress, imgWidth = 720, radius = 22, compact = false, showGroup = false, members = null }) {
  const { meal, group, slot, dish } = tile;
  const armed = useContext(ArmedContext);
  const isEmpty = Boolean(tile.empty);
  const badgeGroups = tile.groups ?? (group ? [group] : []);
  const [failed, setFailed] = useState(false);
  const recipe = isEmpty ? null : RECIPES_BY_ID[dish.recipeId];
  const sel = isEmpty
    ? { slot, groupId: group.id, day, meal, group, course: "main", empty: true }
    : recipe
      ? { recipe, slot, groupId: group.id, day, meal, group, course: dish.courseKey }
      : null;
  const press = useLongPress(
    () => sel && onDishLongPress?.(sel),
    () => sel && onDishTap?.(sel),
  );
  const emptyMealLabel = MEAL_META[meal]?.label ?? meal;
  if (isEmpty) {
    // Use the meal's own MenuPlan icon (Comida = Sol, Cena = Luna…) inside a soft
    // colored badge with a small "+", so an empty slot reads as "add here" rather
    // than a generic crossed-cutlery placeholder.
    const MealIcon = MEAL_META[meal]?.Icon ?? UtensilsCrossed;
    const accent = MEAL_EMPTY_ACCENT[meal] ?? MEAL_EMPTY_ACCENT._default;
    const badge = compact ? 32 : 46;
    return (
      <button
        type="button"
        {...press}
        style={{
          position: "relative",
          width: "100%",
          height: "100%",
          border: "2px dashed #cbd8cf",
          borderRadius: radius,
          background: "#f6faf7",
          cursor: "pointer",
          fontFamily: "inherit",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: compact ? 4 : 7,
          padding: 8,
          touchAction: "pan-x pan-y",
        }}
      >
        <span
          style={{
            position: "relative",
            width: badge,
            height: badge,
            borderRadius: 999,
            background: accent.tint,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <MealIcon size={compact ? 16 : 22} strokeWidth={2.2} color={accent.ink} />
          <span
            style={{
              position: "absolute",
              right: -3,
              bottom: -3,
              width: compact ? 15 : 18,
              height: compact ? 15 : 18,
              borderRadius: 999,
              background: "#2d5a3d",
              color: "#fff",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              border: "2px solid #f6faf7",
            }}
          >
            <Plus size={compact ? 9 : 11} strokeWidth={3.2} />
          </span>
        </span>
        <span style={{ fontSize: compact ? 10 : 12.5, fontWeight: 800, color: "#4f6a5b", textAlign: "center", lineHeight: 1.2 }}>
          {emptyMealLabel} libre
        </span>
        <span style={{ fontSize: compact ? 9 : 10.5, fontWeight: 600, color: "#9bb0a4" }}>Toca para añadir</span>
      </button>
    );
  }
  if (!recipe) return null;
  const srcUrl = dishImageForRecipe(recipe);
  const optimized = deckImg(srcUrl, imgWidth);
  const visual = visualForRecipe(recipe);
  const mealLabel = MEAL_META[meal]?.label ?? meal;
  const courseTxt = dish.course ? `${mealLabel} · ${dish.course}` : mealLabel;
  const showPhoto = optimized && !failed;
  const isArmed = !!armed && !!sel && sameDish(armed.source, sel);
  return (
    <button
      type="button"
      className="deck-tile"
      data-coach="menu-dish"
      data-slot={`${day}-${meal}`}
      data-course={dish?.courseKey}
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
        boxShadow: isArmed
          ? "0 8px 24px rgba(20,47,29,.28)"
          : "0 6px 20px rgba(20,47,29,.14)",
        touchAction: "pan-x pan-y",
      }}
    >
      {isArmed && <ArmedRing radius={radius} />}
      {showPhoto ? (
        <img
          src={optimized}
          srcSet={deckSrcSet(srcUrl, imgWidth)}
          sizes={`${imgWidth}px`}
          alt={recipe.name}
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", background: visual.surface }}
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
            // Two faces then a counter: a dish shared by several menús already
            // shows one badge per group, so letting each one run to three would
            // march a row of discs across the photo.
            <GroupMenuBadge key={gr.id} group={gr} size={compact ? 20 : 26} members={members} max={2} />
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
          data-coach="menu-actions"
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
// Small pill in each day header that rerolls every dish of that day at once.
// A round scope chip that slides in from the right over the day's divider line.
function DayScopeChip({ label, color, size, delay, onPick, children }) {
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onPick(); }}
      aria-label={label}
      title={label}
      style={{
        flexShrink: 0,
        width: size,
        height: size,
        borderRadius: "50%",
        display: "grid",
        placeItems: "center",
        background: "#fff",
        border: `2px solid ${color}`,
        color,
        padding: 0,
        cursor: "pointer",
        fontFamily: "inherit",
        boxShadow: "0 2px 7px rgba(9,18,12,.14)",
        animation: `dayScopeIn .3s cubic-bezier(.34,1.5,.64,1) ${delay.toFixed(2)}s both`,
      }}
    >
      {children}
    </button>
  );
}

// Day-level "Regenerar". With a single menú it's a plain button. With several,
// tapping the icon hides it and slides the scope chips (one per menú + "Todos")
// in from the right, "eating" part of the header's divider line; tap one to
// regenerate that scope for the whole day.
function DayRegenButton({ day, onRegenerateDay, groups = [], compact = false }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => { if (!rootRef.current?.contains(e.target)) setOpen(false); };
    document.addEventListener("pointerdown", onDoc);
    return () => document.removeEventListener("pointerdown", onDoc);
  }, [open]);
  // Collapse when the day this button belongs to changes underneath it.
  useEffect(() => { setOpen(false); }, [day]);

  if (!onRegenerateDay) return null;

  const menus = groups.filter(Boolean);
  const size = compact ? 26 : 28;
  const iconSize = compact ? 12 : 13;

  // Single menú (or none): nothing to scope — a plain regenerate button.
  if (menus.length <= 1) {
    return (
      <button
        type="button"
        className="deck-press"
        data-coach="menu-day-regen"
        onClick={(e) => { e.stopPropagation(); onRegenerateDay(day); }}
        aria-label={`Regenerar ${dayLabel(day)}`}
        title="Regenerar todos los platos de este día"
        style={{
          flexShrink: 0,
          display: "inline-flex",
          alignItems: "center",
          gap: 5,
          border: "1px solid #d6e6db",
          background: "#fff",
          color: "#2d5a3d",
          borderRadius: 999,
          padding: compact ? "3px 6px" : "4px 9px 4px 7px",
          cursor: "pointer",
          fontFamily: "inherit",
        }}
      >
        <RotateCw size={iconSize} strokeWidth={2.6} />
        {!compact && <span style={{ fontSize: 11, fontWeight: 800 }}>Regenerar</span>}
      </button>
    );
  }

  const pick = (groupIds) => {
    onRegenerateDay(day, groupIds ? { groupIds } : undefined);
    setOpen(false);
  };

  return (
    <div ref={rootRef} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      {open ? (
        <>
          {menus.map((g, i) => (
            <DayScopeChip
              key={g.id}
              size={size}
              color={g.color}
              label={`Regenerar ${g.adHoc ? adhocReasonLabel(g.reason) : g.label}`}
              delay={(menus.length - i) * 0.05}
              onPick={() => pick([g.id])}
            >
              <span style={{ fontSize: size <= 26 ? 11 : 12, fontWeight: 900 }}>
                {GROUP_ABBREV[g.label] ?? g.label.charAt(0)}
              </span>
            </DayScopeChip>
          ))}
          <DayScopeChip
            size={size}
            color="#2d5a3d"
            label="Regenerar todos los menús"
            delay={0}
            onPick={() => pick(null)}
          >
            <Users size={size <= 26 ? 13 : 14} strokeWidth={2.4} />
          </DayScopeChip>
        </>
      ) : (
        <button
          type="button"
          className="deck-press"
          data-coach="menu-day-regen"
          onClick={(e) => { e.stopPropagation(); setOpen(true); }}
          aria-label={`Regenerar ${dayLabel(day)}`}
          title="Regenerar este día"
          style={{
            flexShrink: 0,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: size,
            height: size,
            border: "1px solid #d6e6db",
            background: "#fff",
            color: "#2d5a3d",
            borderRadius: "50%",
            cursor: "pointer",
            padding: 0,
          }}
        >
          <RotateCw size={iconSize} strokeWidth={2.6} />
        </button>
      )}
    </div>
  );
}

function DeckDayPager({ days, activeDay, onActiveDay, weekDates, data, menuPlan, visibleGroups, onDishTap, onDishLongPress, onRegenerateDay, regenGroups = [], showGroup = false }) {
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
                <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "0 2px" }}>
                  <span style={{ fontSize: 15, fontWeight: 900, color: "#142f1d", letterSpacing: "-.2px" }}>{dayLabel(day)}</span>
                  <span style={{ fontSize: 13, fontWeight: 800, color: "#4cba6e" }}>{calendarDayNumber(day, weekDates)}</span>
                  <span style={{ flex: 1, height: 1, background: "#dbe8df", marginLeft: 2 }} />
                  <DayRegenButton day={day} onRegenerateDay={onRegenerateDay} groups={regenGroups} />
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
                    key={`${tile.group.id}-${tile.meal}-${tile.dish?.courseKey ?? "empty"}-${i}`}
                    style={many ? { height: 172, flexShrink: 0 } : { flex: 1, minHeight: 0 }}
                  >
                    <DeckTile tile={tile} day={day} onDishTap={onDishTap} onDishLongPress={onDishLongPress} imgWidth={760} showGroup={showGroup} members={data?.members} />
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
function DeckWeek({ days, weekDates, data, menuPlan, visibleGroups, onDishTap, onDishLongPress, onRegenerateDay, regenGroups = [], showGroup = false }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      {days.map((day) => {
        const tiles = getDeckDayTiles(day, data, menuPlan, visibleGroups);
        if (tiles.length === 0) return null;
        return (
          <div key={day}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <span style={{ fontSize: 14, fontWeight: 900, color: "#142f1d" }}>{dayLabel(day)}</span>
              <span style={{ fontSize: 12, fontWeight: 800, color: "#4cba6e" }}>{calendarDayNumber(day, weekDates)}</span>
              <span style={{ flex: 1, height: 1, background: "#e8f0ea" }} />
              <DayRegenButton day={day} onRegenerateDay={onRegenerateDay} groups={regenGroups} compact />
            </div>
            <div className="deck-scroller" style={{ display: "flex", gap: 10, overflowX: "auto", paddingBottom: 4 }}>
              {tiles.map((tile, i) => (
                <div key={`${tile.group.id}-${tile.meal}-${tile.dish?.courseKey ?? "empty"}-${i}`} style={{ flex: "0 0 46%" }}>
                  <div style={{ height: 150 }}>
                    <DeckTile tile={tile} day={day} onDishTap={onDishTap} onDishLongPress={onDishLongPress} imgWidth={360} radius={16} compact showGroup={showGroup} members={data?.members} />
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

// Legacy seed recipes tag themselves in singular ("pescado", "carne") while the
// catalog uses its own category ids ("pescados", "carnes"). Bridge the two so
// old menús still get a color instead of falling back to the neutral token.
const LEGACY_TAG_TO_CATEGORY = {
  pescado: "pescados",
  carne: "carnes",
  pollo: "carnes",
  huevo: "huevos",
  verdura: "ensaladas_verduras",
  verduras: "ensaladas_verduras",
  ensalada: "ensaladas_verduras",
  ensaladas: "ensaladas_verduras",
  legumbre: "legumbres",
  pasta: "pasta_arroces",
  arroz: "pasta_arroces",
  arroces: "pasta_arroces",
  sopa: "sopas_cremas",
  sopas: "sopas_cremas",
  crema: "sopas_cremas",
  cremas: "sopas_cremas",
  postre: "postres",
  desayuno: "desayunos",
  merienda: "meriendas",
  bebe: "bebes",
};

const GUARNICION_BY_ID = Object.fromEntries(guarnicionesData.map((g) => [g.id, g]));

// Garnishes split into two families that change the meal's character far more
// than the individual side does: a starch ("pescado + patatas") or a vegetable
// ("pescado + ensalada"). Reuse the dish category colors so the badge speaks
// the same visual language as the token it sits on.
const GARNISH_STARCH_RE = /arroz|patata|pur[eé]|pasta|cusc[uú]s|quinoa/i;

function garnishCategory(garnish) {
  if (!garnish) return null;
  const text = `${garnish.shortName ?? ""} ${garnish.name ?? ""}`;
  return GARNISH_STARCH_RE.test(text) ? "pasta_arroces" : "ensaladas_verduras";
}

/**
 * Resolve the catalog category, display name and side dish for a slot's
 * recipeId. The id stored in the plan is a frontendId that may carry a group
 * prefix ("groupId__pescados_001"), so try the runtime registry first, then
 * the bare catalog id, and finally the legacy tag bridge.
 */
function dishTypology(recipeId) {
  const fr = RECIPES_BY_ID[recipeId];
  const bareId = recipeId.includes("__") ? recipeId.slice(recipeId.indexOf("__") + 2) : recipeId;
  const catalogEntry =
    recipeCatalogById[bareId] ?? (fr?.baseRecipeId ? recipeCatalogById[fr.baseRecipeId] : null);

  let cat = catalogEntry?.category ?? null;
  if (!isKnownCategory(cat)) {
    cat = (fr?.tags ?? [])
      .map((t) => (isKnownCategory(t) ? t : LEGACY_TAG_TO_CATEGORY[t]))
      .find(isKnownCategory) ?? null;
  }

  const garnish = fr?.garnishId ? GUARNICION_BY_ID[fr.garnishId] : null;

  return {
    cat,
    name: fr?.name ?? catalogEntry?.name ?? "",
    garnishCat: garnishCategory(garnish),
    garnishName: garnish?.shortName ?? null,
  };
}

/** Every dish of a day+meal across the visible menús, deduped by recipe. */
function typologyTokens(day, meal, menuPlan, visibleGroups) {
  const isLunch = isLunchMeal(meal);
  const tokens = [];
  const seen = new Set();

  for (const g of visibleGroups) {
    const slot = menuPlan[g.id]?.[`${day}-${meal}`];
    if (!slot) continue;
    const ids = isLunch ? [slot.firstRecipeId, slot.recipeId] : [slot.recipeId];
    for (const [i, recipeId] of ids.entries()) {
      if (!recipeId || seen.has(recipeId)) continue;
      seen.add(recipeId);
      const course = isLunch && i === 0 ? "first" : "main";
      tokens.push({ recipeId, slot, group: g, course, ...dishTypology(recipeId) });
    }
  }
  return tokens;
}

/**
 * Solid circular category token — icon only, color carries the meaning. When
 * the dish has a side, a smaller badge rides on its corner so the pairing
 * ("pescado + patatas") reads as a single glyph.
 */
function TypologyToken({ cat, name, garnishCat, garnishName, onTap, size = 32 }) {
  const color = cat ? categoryColor(cat) : "#5a7066";
  const Icon = cat ? categoryIcon(cat) : Utensils;
  const label = cat ? categoryLabel(cat) : "Plato";

  const gColor = garnishCat ? categoryColor(garnishCat) : null;
  const GIcon = garnishCat ? categoryIcon(garnishCat) : null;
  const badge = Math.round(size * 0.47);

  const tip = [label, name].filter(Boolean).join(" · ");

  return (
    <button
      type="button"
      className="deck-press"
      onClick={onTap}
      title={garnishName ? `${tip} (+ ${garnishName})` : tip}
      aria-label={tip}
      style={{
        position: "relative",
        width: size,
        height: size,
        flexShrink: 0,
        borderRadius: 999,
        border: "none",
        padding: 0,
        cursor: "pointer",
        fontFamily: "inherit",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        background: `linear-gradient(145deg, ${color} 0%, ${color}d9 100%)`,
        boxShadow: `0 3px 9px -3px ${color}99, inset 0 1px 0 rgba(255,255,255,.25)`,
        transition: "transform .15s ease",
      }}
    >
      <Icon size={Math.round(size * 0.47)} color="#fff" strokeWidth={2.4} />
      {GIcon && (
        <span
          style={{
            position: "absolute",
            right: -3,
            bottom: -3,
            width: badge,
            height: badge,
            borderRadius: 999,
            background: gColor,
            border: "1.5px solid #fff",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <GIcon size={Math.round(badge * 0.58)} color="#fff" strokeWidth={3} />
        </span>
      )}
    </button>
  );
}

/** Small sun/moon badge that labels each meal row of the grid. */
function MealGlyph({ isLunch, size = 22 }) {
  const meal = isLunch ? "Comida" : "Cena";
  const color = mealTimeColor(meal);
  const bg = mealTimeBg(meal);
  const Icon = isLunch ? Sun : Moon;
  return (
    <span
      title={isLunch ? "Comida" : "Cena"}
      style={{
        width: size,
        height: size,
        flexShrink: 0,
        borderRadius: 999,
        background: bg,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Icon size={Math.round(size * 0.6)} color={color} strokeWidth={2.6} />
    </span>
  );
}

/**
 * "Resumen" view — the week as a real calendar grid: days across, meals down.
 * Each dish is a colored icon token (with a side-dish badge when it has one),
 * so a glance answers "what dominates this week?" without reading a single
 * name. A proportion bar on top tallies the whole mix.
 */
function DeckCalendar({ days, weekDates, data, menuPlan, visibleGroups, onDishTap }) {
  const { mealRows, mix, hasContent } = useMemo(() => {
    const meals = getMeals(data); // main meals only (Comida / Cena)
    const counts = new Map();
    const rows = [];
    let any = false;

    for (const meal of meals) {
      const cells = days.map((day) => {
        const tokens = typologyTokens(day, meal, menuPlan, visibleGroups);
        for (const t of tokens) {
          if (t.cat) counts.set(t.cat, (counts.get(t.cat) ?? 0) + 1);
        }
        if (tokens.length > 0) any = true;
        return { day, tokens };
      });
      rows.push({ meal, cells });
    }

    const total = [...counts.values()].reduce((a, b) => a + b, 0);
    const sorted = [...counts.entries()]
      .sort((a, b) => b[1] - a[1] || categoryLabel(a[0]).localeCompare(categoryLabel(b[0])))
      .map(([cat, count]) => ({ cat, count, pct: total ? (count / total) * 100 : 0 }));

    return { mealRows: rows, mix: { total, items: sorted }, hasContent: any };
  }, [days, data, menuPlan, visibleGroups]);

  if (!hasContent) {
    return (
      <div style={{ padding: "40px 20px", textAlign: "center" }}>
        <LayoutGrid size={32} color="#cdd8d0" strokeWidth={2} />
        <p style={{ margin: "10px 0 0", fontSize: 13, fontWeight: 700, color: "#9ab0a1" }}>
          Aún no hay platos que resumir
        </p>
      </div>
    );
  }

  const todayNum = new Date().getDate();

  return (
    <div style={{ paddingBottom: 8 }}>
      {/* ── Week mix: proportion bar + legend with counts ── */}
      {mix.items.length > 0 && (
        <div
          style={{
            background: "#fff",
            border: "1px solid #e8efe9",
            borderRadius: 16,
            padding: 14,
            marginBottom: 14,
            boxShadow: "0 1px 3px rgba(20,47,29,.05)",
          }}
        >
          <span
            style={{
              fontSize: 10,
              fontWeight: 800,
              color: "#9ab0a1",
              textTransform: "uppercase",
              letterSpacing: ".8px",
            }}
          >
            El mix de la semana
          </span>

          <div
            style={{
              display: "flex",
              height: 10,
              borderRadius: 999,
              overflow: "hidden",
              margin: "10px 0 12px",
              background: "#f0f4f1",
            }}
          >
            {mix.items.map(({ cat, pct }) => (
              <span
                key={cat}
                title={`${categoryLabel(cat)} · ${Math.round(pct)}%`}
                style={{ width: `${pct}%`, background: categoryColor(cat) }}
              />
            ))}
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", gap: "8px 14px" }}>
            {mix.items.map(({ cat, count }) => {
              const color = categoryColor(cat);
              const Icon = categoryIcon(cat);
              return (
                <span key={cat} style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                  <span
                    style={{
                      width: 20,
                      height: 20,
                      borderRadius: 999,
                      background: color,
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Icon size={11} color="#fff" strokeWidth={2.6} />
                  </span>
                  <span style={{ fontSize: 11.5, fontWeight: 800, color: "#3a4a42" }}>
                    {categoryLabel(cat)}
                  </span>
                  <span
                    style={{
                      fontSize: 11.5,
                      fontWeight: 900,
                      color,
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {count}
                  </span>
                </span>
              );
            })}
          </div>
        </div>
      )}

      {/* ── The week as a grid: days across, meals down ── */}
      <div
        style={{
          background: "#fff",
          border: "1px solid #e8efe9",
          borderRadius: 16,
          overflow: "hidden",
          boxShadow: "0 1px 3px rgba(20,47,29,.05)",
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: `26px repeat(${days.length}, minmax(0, 1fr))`,
          }}
        >
          {/* Header: day names + dates */}
          <div style={{ background: "#f6f9f7", borderBottom: "1px solid #e3ebe6" }} />
          {days.map((day) => {
            const dayNum = calendarDayNumber(day, weekDates);
            const isToday = dayNum != null && dayNum === todayNum;
            return (
              <div
                key={`h-${day}`}
                style={{
                  background: isToday ? "#eaf6ee" : "#f6f9f7",
                  borderBottom: `1px solid ${isToday ? "#bfe6cb" : "#e3ebe6"}`,
                  padding: "7px 0 6px",
                  textAlign: "center",
                }}
              >
                <div
                  style={{
                    fontSize: 9,
                    fontWeight: 800,
                    color: isToday ? "#4cba6e" : "#9ab0a1",
                    textTransform: "uppercase",
                    letterSpacing: ".4px",
                    lineHeight: 1.3,
                  }}
                >
                  {day}
                </div>
                <div
                  style={{
                    fontSize: 14,
                    fontWeight: 900,
                    color: isToday ? "#2d5a3d" : "#142f1d",
                    lineHeight: 1.2,
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {dayNum ?? "·"}
                </div>
              </div>
            );
          })}

          {/* One row per meal */}
          {mealRows.map(({ meal, cells }, ri) => {
            const divider = ri > 0 ? "1px solid #eef3f0" : "none";
            return (
              <Fragment key={meal}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: "#fbfdfb",
                    borderTop: divider,
                    borderRight: "1px solid #eef3f0",
                  }}
                >
                  <MealGlyph isLunch={isLunchMeal(meal)} size={20} />
                </div>

                {cells.map(({ day, tokens }) => {
                  const dayNum = calendarDayNumber(day, weekDates);
                  const isToday = dayNum != null && dayNum === todayNum;
                  return (
                    <div
                      key={`${meal}-${day}`}
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 6,
                        padding: "11px 2px",
                        borderTop: divider,
                        background: isToday ? "#f7fdf9" : "transparent",
                      }}
                    >
                      {tokens.length === 0 ? (
                        <span
                          style={{
                            width: 6,
                            height: 6,
                            borderRadius: 999,
                            background: "#e3ebe6",
                          }}
                        />
                      ) : (
                        tokens.map(({ recipeId, slot, group, course, cat, name, garnishCat, garnishName }) => (
                          <TypologyToken
                            key={`${recipeId}-${course}`}
                            cat={cat}
                            name={name}
                            garnishCat={garnishCat}
                            garnishName={garnishName}
                            onTap={() =>
                              onDishTap?.({
                                recipe: RECIPES_BY_ID[recipeId],
                                slot,
                                groupId: group.id,
                                day,
                                meal,
                                group,
                                course,
                              })
                            }
                          />
                        ))
                      )}
                    </div>
                  );
                })}
              </Fragment>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function MenuDeck({ deckView, days, weekDates, data, menuPlan, visibleGroups, members, dishAvailability, multiGroup, scope, selectedDay, setSelectedDay, onDishTap, onDishLongPress, onRegenerateDay, regenGroups = [] }) {
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
          onRegenerateDay={onRegenerateDay}
          regenGroups={regenGroups}
          showGroup={showGroup}
        />
      )}
      {deckView === "semana" && (
        <DeckWeek days={days} weekDates={weekDates} data={data} menuPlan={menuPlan} visibleGroups={visibleGroups} onDishTap={onDishTap} onDishLongPress={onDishLongPress} onRegenerateDay={onRegenerateDay} regenGroups={regenGroups} showGroup={showGroup} />
      )}
      {deckView === "lista" && (
        <DeckCalendar
          days={days}
          weekDates={weekDates}
          data={data}
          menuPlan={menuPlan}
          visibleGroups={visibleGroups}
          onDishTap={onDishTap}
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

/**
 * Segmented control (Día / Semana) as two flat pills.
 * The active pill is solid green; inactive is transparent on a light track.
 */
function DeckNav({ value, onChange, options }) {
  return (
    <div
      style={{
        display: "inline-flex",
        background: "#eef4ef",
        borderRadius: 999,
        padding: 3,
        gap: 3,
      }}
    >
      {options.map((o) => {
        const Icon = DECK_VIEW_ICON[o.id] ?? CalendarDays;
        const active = o.id === value;
        return (
          <button
            key={o.id}
            type="button"
            className="deck-press"
            onClick={() => onChange(o.id)}
            style={{
              display: "inline-flex", alignItems: "center", gap: 5,
              padding: "5px 12px",
              borderRadius: 999,
              border: "none",
              background: active ? "#2d5a3d" : "transparent",
              color: active ? "#fff" : "#5a7060",
              cursor: "pointer",
              fontFamily: "inherit",
              transition: "background .15s ease, color .15s ease",
              whiteSpace: "nowrap",
            }}
          >
            <Icon size={14} strokeWidth={2.4} />
            <span style={{ fontSize: 12, fontWeight: 800 }}>{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}

/** Mini "N de X" week stepper shown next to DeckNav when there are multiple weeks. */
function DeckWeekStepper({ weekIdx, weekTotal, onPrev, onNext, onOpen }) {
  const btn = (Icon, onClick, disabled) => (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        width: 20, height: 20, padding: 0, border: "none", borderRadius: 999,
        background: "none",
        color: disabled ? "#c8d8cc" : "#5a7060",
        cursor: disabled ? "default" : "pointer", fontFamily: "inherit",
      }}
    >
      <Icon size={13} strokeWidth={2.8} />
    </button>
  );
  return (
    <div style={{ display: "inline-flex", alignItems: "center", background: "#eef4ef", borderRadius: 999, padding: "3px 6px 3px 4px", gap: 1 }}>
      {btn(ChevronLeft, onPrev, weekIdx <= 0)}
      <button
        type="button"
        onClick={onOpen}
        style={{
          border: "none", background: "none", cursor: "pointer", fontFamily: "inherit",
          fontSize: 11.5, fontWeight: 800, color: "#2d5a3d", padding: "0 4px", whiteSpace: "nowrap",
        }}
      >
        {weekIdx + 1} de {weekTotal}
      </button>
      {btn(ChevronRight, onNext, weekIdx >= weekTotal - 1)}
    </div>
  );
}

/** The scope circle used both as the deck filter chip and inside its popup, so
 *  they are visually identical. `opt.group` null means the "Todos" circle. */
function ScopeCircle({ opt, active, size = 42, members }) {
  // "Todos" has no group behind it, but it still stands for a set of people —
  // the whole household — so it gets their faces like every other option.
  const faces = opt.group
    ? groupBadgeFaces(opt.group, members, size)
    : members && size >= 32
      ? groupAvatarFaces(members, members)
      : [];
  // A stack of faces carries its own selected state. Keeping the outer ring
  // would stretch it into a pill around the whole row, which reads as a
  // different kind of control than the single circles beside it.
  if (faces.length > 0) {
    return <GroupAvatarStack faces={faces} size={size} active={active} />;
  }
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
        <GroupMenuBadge group={opt.group} size={size} members={members} active={active} />
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
        data-coach="menu-filters"
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
        <ScopeCircle opt={activeOpt} active size={42} members={members} />
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
                    <ScopeCircle opt={opt} active={isActive} size={42} members={members} />
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

// Label for the "misma categoría" regen chip — a natural "otra/o <categoría>"
// so it reads like "Otra ensalada" / "Otro pescado" instead of a vague "Parecido".
const SAME_CATEGORY_LABEL = {
  carnes: "Otra carne",
  pescados: "Otro pescado",
  legumbres: "Otra legumbre",
  huevos: "Otro de huevo",
  pasta_arroces: "Otra pasta/arroz",
  sopas_cremas: "Otra sopa",
  ensaladas_verduras: "Otra ensalada",
  platos_unicos: "Otro plato único",
  cenas_rapidas: "Otra cena rápida",
  bebes: "Otro de bebé",
  desayunos: "Otro desayuno",
  meriendas: "Otra merienda",
  postres: "Otro postre",
};

// Reasons shown when rejecting a dish (Regenerar / Quitar → sub-radial). Each
// carries its own persistent consequence in App.jsx#applyDiscardReason:
//   dislike → descartar para siempre (Recetas ▸ Descartados)
//   week    → descartar esta semana (~7 días)
//   timing  → tarda demasiado = descartar esta semana (~7 días)
//   recent  → «me gusta pero reciente»: enfriamiento ~14 días + favorito
const REJECT_REASONS = [
  { key: "dislike", Icon: ThumbsDown, color: "#e0405a", label: "No me gusta" },
  { key: "week", Icon: CalendarOff, color: "#e08a2f", label: "Esta semana no" },
  { key: "timing", Icon: Clock3, color: "#2f6fb8", label: "Tarda demasiado" },
  { key: "recent", Icon: History, color: "#7a5cc0", label: "Lo comí hace poco" },
];

// Radial ("rosco") action menu: chips laid out around the spotlighted dish
// thumbnail. The main dish-action menu (5 actions) spreads them on a full circle
// with a thin ring connector; callers can instead pass an explicit `angle`
// (degrees, -90 = top) per action to drop the ring and place chips exactly where
// the parent chips were (e.g. the "Regenerar" sub-menu reusing the Regenerar /
// Elegir slots).
//
// Per-action extras: `content` renders a custom node inside the chip instead of
// an `Icon` (e.g. a group letter badge); `active` fills the chip in its color to
// show a toggled/selected state. `center` renders a node at the middle of the
// ring (e.g. a "Regenerar" confirm button for the multi-select scope picker).
// Radial chip filled edge-to-edge with the category illustration, so "Otra
// ensalada" shows the same artwork as the catalog and the shopping list rather
// than a flat line icon. The Lucide icon stays underneath and shows through if
// the image fails to load. Returns null when the category has no art, letting
// RoscoMenu render its default icon.
//
// RoscoMenu invokes `content` as a plain function, not as a component, so this
// must stay hook-free.
function categoryChipContent(category, Icon, tint) {
  const src = categoryImageSrc(category);
  if (!src || !Icon) return null;
  return (active) => (
    <>
      <Icon size={19} strokeWidth={2.2} color={active ? "#fff" : tint} />
      <img
        src={src}
        alt=""
        onError={(e) => { e.currentTarget.style.display = "none"; }}
        style={{
          position: "absolute", inset: 0,
          width: "100%", height: "100%",
          objectFit: "cover", borderRadius: "50%",
        }}
      />
    </>
  );
}

export function RoscoMenu({ anchor, actions, onClose, center = null, inline = false, frameW = null, frameH = null, radius = null }) {
  const a = anchor;
  // `inline` (value-props demo): render inside a relatively-positioned frame
  // instead of portaling to document.body, so the radial stays inside the
  // scaled tutorial "screenshot" instead of covering the whole viewport.
  const vw = frameW ?? window.innerWidth;
  const vh = frameH ?? window.innerHeight;
  const POS = inline ? "absolute" : "fixed";
  // Center on the tile, fall back to the ⋮ icon, then the viewport center.
  const cx = a?.tile
    ? a.tile.left + a.tile.width / 2
    : a?.icon ? (a.icon.left + a.icon.right) / 2 : vw / 2;
  const cy = a?.tile
    ? a.tile.top + a.tile.height / 2
    : a?.icon ? (a.icon.top + a.icon.bottom) / 2 : vh / 2;
  const CHIP = 42;
  // With the dish dimmed (no bright spotlight to clear), the chips can sit much
  // closer in — a compact ring instead of hugging the tile's edges. The scope
  // picker still needs a wider ring so its center confirm button fits.
  const baseR = radius ?? (center ? 100 : 84);
  const maxR = Math.min(cx, vw - cx, cy, vh - cy) - CHIP / 2 - 10;
  const R = Math.max(46, Math.min(baseR, maxR));

  const N = actions.length;
  // Explicit per-action angles (the "Regenerar" sub-menu) drop the ring and land
  // chips on the parent's slots. Otherwise auto-spread: full circle for 5 chips
  // (with ring), a top arc for 2-3.
  const hasExplicitAngles = actions.every((a) => typeof a.angle === "number");
  const isArc = !hasExplicitAngles && N <= 3;
  // En la demo (inline) el anillo circular compite con el borde rectangular de la
  // miniatura y se ve "desacoplado": lo omitimos y dejamos solo las chips.
  const showRing = !hasExplicitAngles && N > 3 && !inline;
  const points = actions.map((act, i) => {
    let angDeg;
    if (typeof act.angle === "number") {
      angDeg = act.angle;
    } else if (isArc) {
      const spread = 200;
      angDeg = -90 - spread / 2 + spread / (N * 2) + (spread / N) * i;
    } else {
      angDeg = -90 + (360 / N) * i;
    }
    const ang = angDeg * (Math.PI / 180);
    return { ...act, x: cx + R * Math.cos(ang), y: cy + R * Math.sin(ang) };
  });
  const circ = 2 * Math.PI * R;

  const overlay = (
    <div
      onClick={onClose}
      style={{
        position: POS, inset: 0, zIndex: 1200,
        // Uniform dark scrim over EVERYTHING (thumbnail included) so the chip
        // labels read perfectly — no bright spotlight fighting the text.
        background: "rgba(9,18,12,.8)",
        animation: "deckFadeIn .16s ease both",
      }}
    >
      <style>{`
        @keyframes deckFadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes roscoRing { to { stroke-dashoffset: 0; } }
        @keyframes roscoChip {
          0%   { opacity: 0; transform: translate(-50%,-50%) scale(.3); }
          62%  { opacity: 1; transform: translate(-50%,-50%) scale(1.1); }
          100% { opacity: 1; transform: translate(-50%,-50%) scale(1); }
        }
        .rosco-chip { transition: background .12s ease, box-shadow .12s ease; }
        .rosco-chip:hover { background: rgba(255,255,255,.99); box-shadow: 0 10px 26px rgba(9,18,12,.4); }
        @media (prefers-reduced-motion: reduce) {
          .rosco-chip, .rosco-ring { animation-duration: .001s !important; }
        }
      `}</style>

      {a?.tile && (
        <div
          style={{
            position: POS,
            top: a.tile.top,
            left: a.tile.left,
            width: a.tile.width,
            height: a.tile.height,
            boxSizing: "border-box",
            borderRadius: a.radius,
            // Subtle marker only — the scrim already dims the dish; a thin outline
            // just shows which one the radial acts on, without any glare.
            border: "2px solid rgba(255,255,255,.55)",
            pointerEvents: "none",
            zIndex: 1201,
            animation: "deckFadeIn .16s ease both",
          }}
        />
      )}

      {showRing && (
        <svg
          width={vw}
          height={vh}
          style={{ position: POS, inset: 0, zIndex: 1201, pointerEvents: "none" }}
        >
          <circle
            className="rosco-ring"
            cx={cx} cy={cy} r={R}
            fill="none"
            stroke="rgba(255,255,255,.42)"
            strokeWidth={1.5}
            strokeDasharray={circ}
            strokeDashoffset={circ}
            style={{ animation: "roscoRing .55s cubic-bezier(.22,1,.36,1) .05s both" }}
          />
        </svg>
      )}

      {points.map((p, i) => {
        const tint = p.color ?? "#3f5a49";
        return (
          <button
            key={p.id}
            type="button"
            role="menuitem"
            aria-label={p.label}
            aria-pressed={p.active ? true : undefined}
            className="rosco-chip"
            onClick={(e) => { e.stopPropagation(); p.onPick(); }}
            style={{
              position: POS,
              top: p.y,
              left: p.x,
              zIndex: 1203,
              width: CHIP,
              height: CHIP,
              borderRadius: "50%",
              display: "grid",
              placeItems: "center",
              background: p.active ? tint : "rgba(250,252,251,.95)",
              border: `2px solid ${tint}`,
              boxShadow: p.active
                ? `0 8px 22px ${tint}66, inset 0 1px 0 rgba(255,255,255,.3)`
                : "0 8px 22px rgba(9,18,12,.34), inset 0 1px 0 rgba(255,255,255,.8)",
              cursor: "pointer",
              transform: "translate(-50%,-50%)",
              animation: `roscoChip .34s cubic-bezier(.34,1.4,.64,1) ${(0.08 + i * 0.05).toFixed(2)}s both`,
            }}
          >
            {p.content ? (
              p.content(p.active)
            ) : (
              <p.Icon size={19} strokeWidth={2.2} color={p.active ? "#fff" : tint} />
            )}
            <span
              style={{
                position: "absolute",
                top: "calc(100% + 4px)",
                left: "50%",
                transform: "translateX(-50%)",
                fontSize: 10.5,
                fontWeight: 700,
                color: "rgba(255,255,255,.96)",
                whiteSpace: "nowrap",
                textShadow: "0 1px 5px rgba(0,0,0,.6)",
                pointerEvents: "none",
              }}
            >
              {p.label}
            </span>
          </button>
        );
      })}

      {center && (
        <div
          style={{
            position: POS,
            top: cy,
            left: cx,
            transform: "translate(-50%,-50%)",
            zIndex: 1204,
            animation: "roscoChip .3s cubic-bezier(.34,1.4,.64,1) .04s both",
          }}
        >
          {center}
        </div>
      )}
    </div>
  );
  return inline ? overlay : createPortal(overlay, document.body);
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
  onDishReplaceSameCategory,
  onDishRegarnish,
  onDishSwap,
  onDishDuplicate,
  onDishClear,
  onDishManualPick,
  onDishPickCenaRapida,
  onDishPickPlatoUnico,
  onNav,
  onRegenerate,
  onRegenerateDay,
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
  // Demo-only (value-props carousel): seed the deck view ("semana"/"dia"/"lista")
  // and auto-play the quick-actions rosco so the tutorial can show off the
  // week view + acciones rápidas without a real user gesture.
  initialDeckView = null,
  autoDemo = null,
  // Live shopping list (active week) + jump-to-cook-mode callback, so each
  // dish can show a "faltan ingredientes" dot instead of making you go check
  // Compra yourself.
  shoppingItems = null,
}) {
  const [scope, setScope] = useState("all");
  const [profileOpen, setProfileOpen] = useState(false);
  const [showIconCoach, setShowIconCoach] = useState(false);
  // Menu flexibility: tap a dish's ⋮ → spotlight the dish + a liquid-glass
  // action card anchored to it. "Cambiar" and "Duplicar" arm a two-tap mode
  // (`armed`), where the next dish/hueco tapped is the swap/duplicate target.
  const [dishAction, setDishAction] = useState(null);
  const [armed, setArmed] = useState(null); // null | { mode: "swap" | "duplicate", source }
  // "Regenerar" on a dish that carries a garnish first asks what to regenerate:
  // just the side ("Guarnición") or the whole dish ("Plato completo").
  const [regenChoice, setRegenChoice] = useState(null); // null | dishAction
  // Reason sub-radial (No me gusta / Esta semana no / Tarda demasiado / Lo comí
  // hace poco). Shown by "Quitar" and by the dish-replacing options of Regenerar.
  // `{ ctx, run }` where run(reasonKey) executes the action carrying that reason.
  const [reasonChoice, setReasonChoice] = useState(null);

  const handleTileTap = useCallback(
    (sel) => {
      if (armed) {
        // Tapping the same dish cancels the armed action.
        if (sameDish(armed.source, sel)) {
          setArmed(null);
          return;
        }
        if (armed.mode === "swap") onDishSwap?.(armed.source, sel);
        else if (armed.mode === "duplicate") onDishDuplicate?.(armed.source, sel);
        setArmed(null);
        return;
      }
      // Empty (cleared) slots open the catalog to refill instead of dish detail.
      if (sel.empty) {
        onDishManualPick?.(sel);
        return;
      }
      onDishTap?.(sel);
    },
    [armed, onDishSwap, onDishDuplicate, onDishManualPick, onDishTap],
  );

  const handleTileLongPress = useCallback(
    (sel) => {
      if (armed || sel.empty) return;
      setDishAction(sel);
    },
    [armed],
  );

  // Demo-only autoplay for the value-props carousel: open the quick-actions
  // rosco on a real tile (via a synthetic click, so the anchor is computed
  // exactly like a user tap), pause to read it, then arm "Mover" to show the
  // marching ring on the source tile, and loop. No callbacks fire — arming is
  // pure internal state — so it's safe with the demo's no-op handlers.
  const dishActionRef = useRef(null);
  useEffect(() => { dishActionRef.current = dishAction; }, [dishAction]);
  useEffect(() => {
    if (autoDemo !== "actions") return undefined;
    let cancelled = false;
    const timers = [];
    const wait = (ms) =>
      new Promise((res) => {
        const id = setTimeout(res, ms);
        timers.push(id);
      });
    const run = async () => {
      while (!cancelled) {
        setArmed(null);
        setDishAction(null);
        await wait(1500);
        if (cancelled) return;
        // Open the rosco on the first tile's ⋮ (real click → correct anchor).
        document.querySelector(".deck-tile-actions")?.click();
        await wait(2400);
        if (cancelled) return;
        // Arm "Mover": the source tile gets the marching ring.
        const source = dishActionRef.current;
        if (source) {
          setArmed({ mode: "swap", source });
          setDishAction(null);
        }
        await wait(2600);
        if (cancelled) return;
        setArmed(null);
        await wait(1400);
      }
    };
    run();
    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoDemo]);

  // Demo-only "tour" (value-props "Tu menú" slide): en vista Semana, hace scroll
  // horizontal continuo (ida y vuelta) por las filas para que se vean los platos.
  // (No cambiamos a Día: su layout usa 100dvh y no encaja en el mini-marco.)
  useEffect(() => {
    if (autoDemo !== "tour") return undefined;
    let cancelled = false;
    let dir = 1;
    let raf = 0;
    const step = () => {
      if (cancelled) return;
      const scrollers = document.querySelectorAll(".deck-scroller");
      let ref = null;
      scrollers.forEach((el) => {
        const max = el.scrollWidth - el.clientWidth;
        if (max <= 1) return;
        if (!ref) ref = el;
        let next = el.scrollLeft + dir * 1.1;
        if (next < 0) next = 0;
        if (next > max) next = max;
        el.scrollLeft = next;
      });
      if (ref) {
        const max = ref.scrollWidth - ref.clientWidth;
        if (dir > 0 && ref.scrollLeft >= max - 0.5) dir = -1;
        else if (dir < 0 && ref.scrollLeft <= 0.5) dir = 1;
      }
      raf = requestAnimationFrame(step);
    };
    setDeckView("semana");
    raf = requestAnimationFrame(step);
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoDemo]);

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
    if (initialDeckView === "semana" || initialDeckView === "lista" || initialDeckView === "dia") {
      return initialDeckView;
    }
    try {
      const saved = localStorage.getItem("menuDeckView");
      // "lista" (Resumen) está oculta por ahora: un valor guardado antiguo cae a "día".
      return saved === "semana" ? "semana" : "dia";
    } catch {
      return "dia";
    }
  }); // "dia" | "semana" | "lista"
  useEffect(() => {
    // In demo mode we must not clobber the real user's saved deck preference.
    if (autoDemo) return;
    try {
      localStorage.setItem("menuDeckView", deckView);
    } catch {
      /* ignore */
    }
  }, [deckView, autoDemo]);
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

  // Menús with members — the scope chips for the day-level "Regenerar" (a chip
  // per menú + "Todos"), revealed inline on each day header by DayRegenButton.
  const activeMenus = useMemo(
    () => (data.groups ?? []).filter((g) => membersOfGroup(g, data.members).length > 0),
    [data.groups, data.members],
  );

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
        /* Armed "Mover"/"Duplicar" source dish — a green ring that hugs the whole
           rounded border uniformly, with a brighter arc that travels around it in
           one direction so it's unmistakable which dish is about to move. Built as
           a conic gradient masked into a border band (follows the corner radius). */
        @keyframes armedGlow { 0%, 100% { opacity: 1; } 50% { opacity: .58; } }
        .armed-ring {
          position: absolute;
          inset: 0;
          padding: 4.5px;
          pointer-events: none;
          z-index: 6;
          /* Uniform saturated light-green band all around — no rotating arc, so the
             rest of the border never goes dark. A gentle opacity pulse keeps it
             alive without introducing dark segments. */
          background: #2fce69;
          -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
                  mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
          -webkit-mask-composite: xor;
                  mask-composite: exclude;
          animation: armedGlow 1.2s ease-in-out infinite;
        }
        @media (prefers-reduced-motion: reduce) {
          .armed-ring { animation: none; }
        }
        /* Day-scope chips sliding in from the right over the header divider */
        @keyframes dayScopeIn {
          from { opacity: 0; transform: translateX(14px) scale(.45); }
          to   { opacity: 1; transform: translateX(0) scale(1); }
        }
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
            data-coach="menu-options"
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
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
            {/* The coach anchor hugs the view switch alone: the filter circle at
                the far right gets its own step, and a spotlight over the whole
                row would highlight both at once. */}
            <div data-coach="menu-viewmode" style={{ display: "inline-flex", alignItems: "center", gap: 6, minWidth: 0 }}>
              <DeckNav
                value={deckView}
                onChange={setDeckView}
                options={DECK_VIEW_OPTIONS}
              />
              {menuWeeks.length > 1 && (
                <DeckWeekStepper
                  weekIdx={Math.max(0, currentWeekIdx)}
                  weekTotal={menuWeeks.length}
                  onPrev={() => currentWeekIdx > 0 && onSwitchWeek?.(menuWeeks[currentWeekIdx - 1].weekStart)}
                  onNext={() => currentWeekIdx < menuWeeks.length - 1 && onSwitchWeek?.(menuWeeks[currentWeekIdx + 1].weekStart)}
                  onOpen={onOpenMenus}
                />
              )}
            </div>
            <div style={{ flex: 1 }} />
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
            <ArmedContext.Provider value={armed}>
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
              onRegenerateDay={onRegenerateDay}
              regenGroups={activeMenus}
            />
            </ArmedContext.Provider>
          </div>
        )}

        {dishAction && autoDemo !== "actions" && (
          <RoscoMenu
            anchor={dishAction.anchor}
            onClose={() => setDishAction(null)}
            actions={[
              {
                id: "swap", Icon: ArrowLeftRight, label: "Mover",
                onPick: () => { setArmed({ mode: "swap", source: dishAction }); setDishAction(null); },
              },
              {
                id: "dup", Icon: CopyPlus, label: "Duplicar",
                onPick: () => { setArmed({ mode: "duplicate", source: dishAction }); setDishAction(null); },
              },
              {
                id: "regen", Icon: RotateCw, label: "Regenerar",
                // Sub-radial: cómo reemplazar (otra categoría / otro plato / otra
                // guarnición / elegir a mano). "Elegir" ahora vive aquí dentro.
                onPick: () => { setRegenChoice(dishAction); setDishAction(null); },
              },
              {
                id: "clear", Icon: Trash2, label: "Quitar",
                // Quitar pregunta por qué (razón) → vacía el hueco aplicando la
                // consecuencia (descarte para siempre / semana / enfriamiento).
                onPick: () => {
                  const ctx = dishAction;
                  setReasonChoice({ ctx, run: (reason) => onDishClear?.(ctx, { reason }) });
                  setDishAction(null);
                },
              },
            ]}
          />
        )}

        {/* "Regenerar" sub-radial — cómo reemplazar. Las opciones que cambian el
            plato (otra categoría / otro plato / elegir a mano) abren después el
            sub-radial de razones; "Otra guarnición" se aplica directa (no rechaza
            el plato). Chips reutilizan el icono + color de la categoría. */}
        {regenChoice &&
          (() => {
            const cat = regenChoice.recipe?.category;
            const hasGarnish = Boolean(regenChoice.recipe?.garnishId);
            // Ask the reason, then run the replacement carrying that reason.
            const askReason = (run) => { setReasonChoice({ ctx: regenChoice, run }); setRegenChoice(null); };
            const sameCatIcon = cat ? categoryIcon(cat) : RotateCw;
            const sameCatColor = cat ? categoryColor(cat) : undefined;
            const sameCat = {
              id: "same",
              Icon: sameCatIcon,
              color: sameCatColor,
              content: categoryChipContent(cat, sameCatIcon, sameCatColor ?? "#3f5a49"),
              label: (cat && SAME_CATEGORY_LABEL[cat]) || "Otro parecido",
              onPick: () => askReason((reason) => onDishReplaceSameCategory?.(regenChoice, { reason })),
            };
            const anyDish = {
              id: "any", Icon: Shuffle, label: "Otro plato",
              onPick: () => askReason((reason) => onDishReplace?.(regenChoice, { reason })),
            };
            const pick = {
              id: "pick", Icon: Search, label: "Elegir a mano",
              onPick: () => askReason((reason) => onDishManualPick?.(regenChoice, { reason })),
            };
            const garnish = {
              id: "garnish", Icon: Salad, label: "Otra guarnición", color: "#16a34a",
              onPick: () => { onDishRegarnish?.(regenChoice); setRegenChoice(null); },
            };
            // Slot-type picker: only dinners get the "Cena rápida" thumbnail
            // picker. (Plato único was removed — it mixed two concepts and added
            // confusion.) No reason step: it's a deliberate pick, like the garnish.
            const meal = String(regenChoice.meal).toLowerCase();
            const special =
              meal === "cena"
                ? {
                    id: "cenarapida",
                    Icon: categoryIcon("cenas_rapidas"),
                    color: categoryColor("cenas_rapidas"),
                    content: categoryChipContent(
                      "cenas_rapidas",
                      categoryIcon("cenas_rapidas"),
                      categoryColor("cenas_rapidas"),
                    ),
                    label: "Cena rápida",
                    onPick: () => { onDishPickCenaRapida?.(regenChoice); setRegenChoice(null); },
                  }
                : null;
            // Avoid a duplicate "cena rápida" entry: when the current dish is
            // already a cena rápida, the thumbnail picker (special) replaces the
            // random "Otra cena rápida" (sameCat) — we keep the picker.
            const dropSameCat = special && cat === "cenas_rapidas";
            const base = [
              ...(dropSameCat ? [] : [sameCat]),
              ...(hasGarnish ? [garnish] : []),
              anyDish,
              pick,
            ];
            const actions = special ? [...base, special] : base;
            return (
              <RoscoMenu
                anchor={regenChoice.anchor}
                onClose={() => setRegenChoice(null)}
                actions={actions}
              />
            );
          })()}

        {/* Reason sub-radial (por qué) — used by Quitar and by Regenerar's
            dish-replacing options. Picking a reason runs the pending action with
            that reason, so App.jsx applies its persistent consequence. */}
        {reasonChoice && (
          <RoscoMenu
            anchor={reasonChoice.ctx.anchor}
            onClose={() => setReasonChoice(null)}
            actions={REJECT_REASONS.map((r) => ({
              id: r.key,
              Icon: r.Icon,
              color: r.color,
              label: r.label,
              onPick: () => { reasonChoice.run(r.key); setReasonChoice(null); },
            }))}
          />
        )}

        {armed && autoDemo !== "actions" &&
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
                {armed.mode === "duplicate" ? (
                  <CopyPlus size={17} strokeWidth={2.6} color="#8ee0a6" style={{ flexShrink: 0 }} />
                ) : (
                  <ArrowLeftRight size={17} strokeWidth={2.6} color="#8ee0a6" style={{ flexShrink: 0 }} />
                )}
                <span style={{ flex: 1, minWidth: 0, color: "#fff", fontSize: 12.5, fontWeight: 700, lineHeight: 1.3 }}>
                  {armed.mode === "duplicate"
                    ? "Toca el hueco donde repetir el plato"
                    : "Toca el plato al que moverlo"}
                </span>
                <button
                  type="button"
                  onClick={() => setArmed(null)}
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
                              highlight={!!armed && sameDish(armed.source, { groupId: card.group.id, day, meal, course: card.dish.courseKey })}
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
  initialRecipeTab = "ingredientes",
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
  // Receta section: segmented control between "Ingredientes" and "Pasos".
  const [recipeTab, setRecipeTab] = useState(initialRecipeTab);
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
  // Tracks the created/topped-up pantry row id per ingredient (session-local,
  // reset on unmount) so the tick can be reverted — but ONLY for a tick we
  // ourselves just added here. A tick that reflects real pre-existing "En
  // casa" stock must stay read-only: un-ticking it would delete stock the
  // user has for reasons unrelated to this dish.
  const [manuallyOwnedIds, setManuallyOwnedIds] = useState({});
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
    let addedId = null;
    if (user) {
      const rows = await addPantryItems(user.id, [item]);
      addedId = rows[0]?.id ?? null;
    } else {
      const next = addLocalPantryItems([item]);
      addedId = next.find((it) => it.ingredientNormalized === item.normalized)?.id ?? null;
    }
    if (addedId) setManuallyOwnedIds((m) => ({ ...m, [ing.id]: addedId }));
    await reloadCookStock();
  };
  const revertIngredientOwned = async (ing) => {
    const pantryId = manuallyOwnedIds[ing.id];
    if (!pantryId) return;
    if (user) await removePantryItem(user.id, pantryId);
    else removeLocalPantryItem(pantryId);
    setManuallyOwnedIds((m) => {
      const next = { ...m };
      delete next[ing.id];
      return next;
    });
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

        {onSetFavoriteScope && (
          <button
            type="button"
            onClick={() => {
              if (scopeGroups.length > 1) setScopeOpen(true);
              else onSetFavoriteScope(isFavorite ? null : "all");
            }}
            aria-label={isFavorite ? "Quitar de favoritas" : "Añadir a favoritas"}
            title={isFavorite ? "Quitar de favoritas" : "Añadir a favoritas"}
            style={{ ...closeButtonStyle, right: "auto", left: 26 }}
          >
            <Heart
              size={18}
              color={isFavorite ? "#e0405a" : "#1a3a24"}
              strokeWidth={isFavorite ? 2.4 : 2}
              fill={isFavorite ? "#e0405a" : "none"}
            />
          </button>
        )}

        <DishVisual
          recipe={recipe}
          height={220}
          imageUrl={dishImageForRecipe(recipe)}
          eyebrow={browse ? "Catálogo" : "Receta de la semana"}
        />

        <div style={{ padding: "18px 2px 0" }}>
          {(recipe.owner || recipe.rating || browse) && (
            <div style={{ marginBottom: 14, borderRadius: 16, background: "#fff", border: "2px solid #2d5a3d", padding: "12px 14px", display: "flex", flexDirection: "column", gap: 12 }}>
              {/* Row 1 — owner + date on the left, votes on the right, all in a
                  single horizontal line. The favorite toggle moved to the ♥ button
                  top-left of the sheet. */}
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

          {/* Ficha rápida: comensales · minutos · dificultad · alérgenos. Sin
              caja: chips en una fila y un divider fino debajo. Los alérgenos ya se
              entienden por su icono, así que no llevan rótulo "Alérgenos". */}
          <div style={{
            display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
            marginBottom: 12,
          }}>
            <span style={detailTagStyle}>
              <Users size={12} /> {slot.eaters} comensales
            </span>
            <span style={detailTagStyle}>
              <Clock3 size={12} /> {activeMethod.time} min
            </span>
            <span style={detailTagStyle}>
              <Gauge size={12} /> {activeMethod.difficultyLabel}
            </span>
            {recipe.allergens.length > 0 && (
              <>
                <span style={{ width: 1, alignSelf: "stretch", background: "#e6efe9", margin: "0 2px" }} />
                {resolveRecipeAllergens(recipe.allergens).map(({ id, Icon, label, color }) => (
                  <span key={id} style={{
                    display: "inline-flex", alignItems: "center", gap: 4,
                    color, fontSize: 12, fontWeight: 700,
                  }}>
                    <Icon size={14} strokeWidth={2.2} />
                    {label}
                  </span>
                ))}
              </>
            )}
          </div>
          <div style={{ height: 2, background: "#d5e3da", borderRadius: 2, marginBottom: 14 }} />

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

          <section style={{ ...macroCardStyle, border: "none", background: "transparent", padding: 0, marginBottom: 14 }}>
            {/* kcal + macros as four circles (number inside, copy below). Earthy,
                cohesive palette — no rainbow. */}
            <div style={{ display: "flex", gap: 8, justifyContent: "space-between" }}>
              {[
                { label: "kcal",          value: recipe.kcal,    unit: "",  color: "#2d5a3d" },
                { label: "Proteína",      value: macros.protein, unit: "g", color: "#b5734a" },
                { label: "Carbohidratos", value: macros.carbs,   unit: "g", color: "#c9a24a" },
                { label: "Grasas",        value: macros.fat,     unit: "g", color: "#7f9e57" },
              ].map(({ label, value, unit, color }) => (
                <div key={label} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 7 }}>
                  <div style={{
                    width: 62, height: 62, borderRadius: "50%",
                    background: "#fff",
                    border: `3.5px solid ${color}`,
                    boxShadow: `0 2px 12px ${color}28`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    <span style={{ fontSize: 15, fontWeight: 900, color: "#142f1d", lineHeight: 1 }}>
                      {value}{unit && <span style={{ fontSize: 12, fontWeight: 900, color: "#142f1d" }}>{unit}</span>}
                    </span>
                  </div>
                  <span style={{ fontSize: 10, fontWeight: 700, color: "#7a8a7f", textAlign: "center", maxWidth: 64 }}>{label}</span>
                </div>
              ))}
            </div>
          </section>
          <div style={{ height: 2, background: "#d5e3da", borderRadius: 2, marginBottom: 14 }} />

          <section className="mp-recipe-section" style={{ ...recipeBlockStyle, border: "none", background: "transparent", padding: 0 }}>
            <div style={sectionTitleStyle}>
              <BookOpen size={16} /> Receta
            </div>

            {/* Segmented control: Ingredientes | Pasos */}
            <div style={{ display: "flex", background: "#eef3f0", borderRadius: 12, padding: 3, marginBottom: 14 }}>
              {[
                { id: "ingredientes", label: `Ingredientes (${ingredients.length})` },
                { id: "pasos", label: "Pasos" },
              ].map((t) => {
                const sel = recipeTab === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setRecipeTab(t.id)}
                    style={{
                      flex: 1, padding: "8px 0", borderRadius: 9, border: "none",
                      background: sel ? "#fff" : "transparent",
                      color: sel ? "#142f1d" : "#7a9485",
                      fontSize: 13, fontWeight: sel ? 800 : 700,
                      cursor: "pointer", fontFamily: "inherit",
                      boxShadow: sel ? "0 1px 4px rgba(0,0,0,.1)" : "none",
                      transition: "all .15s",
                    }}
                  >
                    {t.label}
                  </button>
                );
              })}
            </div>
            {recipeTab === "ingredientes" && (
              <div style={{ marginBottom: cookable ? 14 : 4 }}>
                {ingredients.map((ing, i) => (
                  <DishIngredientRow
                    key={ing.id}
                    ing={ing}
                    isLast={i === ingredients.length - 1}
                    cookable={cookable}
                    owned={cookable && haveByIngId[ing.id]}
                    revertible={cookable && Boolean(manuallyOwnedIds[ing.id])}
                    onMarkOwned={() => markIngredientOwned(ing)}
                    onRevertOwned={() => revertIngredientOwned(ing)}
                  />
                ))}
              </div>
            )}
            {recipeTab === "pasos" && (
              <>
                {/* Tipos de cocina (electrodomésticos) — segundo segmented control,
                    solo dentro de Pasos y solo si hay más de una forma de cocinarlo. */}
                {methodOptions.length > 1 && (
                  <div
                    style={
                      methodOptions.length >= 4
                        ? { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 3, background: "#eef3f0", borderRadius: 12, padding: 3, marginBottom: 14 }
                        : { display: "flex", background: "#eef3f0", borderRadius: 12, padding: 3, marginBottom: 14 }
                    }
                  >
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
                            flex: 1, minWidth: 0,
                            display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
                            padding: "8px 4px", borderRadius: 9, border: "none",
                            background: isActive ? "#fff" : "transparent",
                            color: isActive ? "#142f1d" : "#7a9485",
                            fontSize: 11.5, fontWeight: isActive ? 800 : 700,
                            cursor: "pointer", fontFamily: "inherit",
                            boxShadow: isActive ? "0 1px 4px rgba(0,0,0,.1)" : "none",
                            transition: "all .15s",
                          }}
                        >
                          {Icon && <Icon size={15} color={isActive ? aColor : "#b0bdb4"} strokeWidth={2.2} />}
                          <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{o.label}</span>
                          {isYours && (
                            <span style={{ width: 5, height: 5, borderRadius: "50%", background: aColor, flexShrink: 0 }} />
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
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
              </>
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
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 9,
                  width: "100%", marginTop: 16, padding: "13px 14px", borderRadius: 14,
                  border: "none",
                  background: isCooked ? "#eaf3ec" : "linear-gradient(135deg,#3a7d52,#2d5a3d)",
                  color: isCooked ? "#2d5a3d" : "#fff",
                  fontSize: 14, fontWeight: 900,
                  cursor: cookBusy ? "default" : "pointer", fontFamily: "inherit",
                  boxShadow: isCooked ? "none" : "0 10px 24px -10px rgba(45,90,61,.7)",
                  opacity: cookBusy ? 0.6 : 1,
                  transition: "all .15s ease",
                }}
              >
                {isCooked ? <Undo2 size={16} strokeWidth={2.6} /> : <ChefHat size={16} strokeWidth={2.4} />}
                {isCooked ? "Deshacer cocinado" : "Marcar como cocinado"}
              </button>
            )}
          </section>

          {/* "Cambiar este plato" — demo-only now. In the real menu this moved to
              the dish radial (Regenerar/Quitar → razón), so it only renders for the
              value-prop carousel autoplay (autoDemo="reject"). */}
          {autoDemo === "reject" && onReject && (
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

// Ingredient rows in Dish Detail — same two-column qty layout as Compra
// (uds | peso), without the swipe "Comprado" actions.
const dishIngRowGridStyle = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr) auto",
  alignItems: "center",
  gap: 8,
  minHeight: 36,
};

const dishIngValueGroupStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "flex-end",
  gap: 5,
};

const dishIngQtyCellBase = {
  minWidth: 40,
  textAlign: "center",
  padding: "4px 7px",
  borderRadius: 7,
  border: "none",
  fontSize: 11.5,
  fontWeight: 700,
  fontVariantNumeric: "tabular-nums",
  whiteSpace: "nowrap",
  lineHeight: 1.2,
};

const dishIngUdsCellStyle = {
  ...dishIngQtyCellBase,
  background: "#e8f1ea",
  color: "#2d5a3d",
};

const dishIngPesoCellStyle = {
  ...dishIngQtyCellBase,
  background: "#eef2f6",
  color: "#3f5568",
};

function DishIngredientQtyCell({ text, cellStyle, wrap = false }) {
  const isEmpty = text === "—";
  const style = {
    ...cellStyle,
    ...(wrap ? { whiteSpace: "normal", maxWidth: 68 } : null),
    ...(isEmpty ? { color: "#c2cfc7", background: "transparent", minWidth: 22 } : null),
  };
  return <span style={style}>{text}</span>;
}

// Cartoon thumbnail for an ingredient row. Falls back through the resolver's
// family/aisle tiers, and renders nothing at all if even that misses, so the
// grid column just collapses instead of showing a hole.
function IngredientThumb({ ing, dimmed = false, size = 30 }) {
  const src = ingredientImageFor(ing) ?? ingredientThumbSrc(ing?.name);
  const [failed, setFailed] = useState(false);
  if (!src || failed) return <span style={{ width: 0 }} />;
  return (
    <span
      style={{
        width: size, height: size, borderRadius: 8, flexShrink: 0,
        overflow: "hidden", background: "#f2f7f4",
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        opacity: dimmed ? 0.45 : 1,
      }}
    >
      <img
        src={src}
        alt=""
        onError={() => setFailed(true)}
        style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
      />
    </span>
  );
}

function DishIngredientRow({ ing, isLast, cookable, owned, revertible, onMarkOwned, onRevertOwned }) {
  const unit = ing.unit ?? "ud";
  const qty = ing.qtyScaled;
  const displayVal = qty == null ? qualitativeUnitLabel(unit) : formatDisplay(qty, unit);
  const isUdUnit = unit === "ud";
  const pieceCount = qty != null ? pantryPieceCountLabel(ing.name, qty, unit) : null;
  const udsText = isUdUnit ? displayVal : pieceCount || "—";
  const pesoText = isUdUnit ? "—" : displayVal;

  return (
    <div
      style={{
        borderBottom: isLast ? "none" : "1px solid #dde8e1",
        opacity: owned ? 0.45 : 1,
        padding: "10px 4px",
      }}
    >
      <div
        style={{
          ...dishIngRowGridStyle,
          gridTemplateColumns: cookable
            ? "auto auto minmax(0, 1fr) auto"
            : "auto minmax(0, 1fr) auto",
          ...(cookable ? { gap: 10 } : null),
        }}
      >
        {cookable && (
          owned ? (
            revertible ? (
              <button
                type="button"
                onClick={onRevertOwned}
                title="Deshacer: quitar de En casa"
                style={{
                  width: 18, height: 18, borderRadius: 6, flexShrink: 0,
                  display: "inline-flex", alignItems: "center", justifyContent: "center",
                  background: "#4cba6e", border: "none", cursor: "pointer", padding: 0,
                }}
              >
                <Check size={12} strokeWidth={3.2} color="#fff" />
              </button>
            ) : (
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
            )
          ) : (
            <button
              type="button"
              onClick={onMarkOwned}
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
        <IngredientThumb ing={ing} dimmed={owned} />
        <div style={{ minWidth: 0 }}>
          <span
            style={{
              display: "block",
              fontSize: 12,
              fontWeight: 700,
              color: "#142f1d",
              textDecoration: owned ? "line-through" : "none",
              lineHeight: 1.25,
              whiteSpace: "normal",
              overflowWrap: "anywhere",
            }}
          >
            {ing.name}
          </span>
          {ing.adapted && (
            <span
              title="Adaptado por una intolerancia"
              style={{
                display: "flex", alignItems: "center", gap: 3,
                fontSize: 10, fontWeight: 800, color: "#2f9e52",
                marginTop: 1,
              }}
            >
              <Leaf size={11} strokeWidth={2.6} />
              Adaptado
            </span>
          )}
        </div>
        <div style={dishIngValueGroupStyle}>
          <DishIngredientQtyCell text={udsText} cellStyle={dishIngUdsCellStyle} wrap />
          <DishIngredientQtyCell text={pesoText} cellStyle={dishIngPesoCellStyle} />
        </div>
      </div>
    </div>
  );
}

