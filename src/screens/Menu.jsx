import { cloneElement, createContext, Fragment, memo, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
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
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  Clock3,
  ClipboardList,
  Apple,
  Coffee,
  CopyPlus,
  UserPlus,
  CookingPot,
  BriefcaseBusiness,
  History,
  IceCream,
  Minimize2,
  MoreHorizontal,
  LayoutGrid,
  Layers,
  Layers2,
  Download,
  Droplets,
  Drumstick,
  Egg,
  Euro,
  Fish,
  Flame,
  Gauge,
  HeartPulse,
  Leaf,
  Menu as MenuIcon,
  Microwave,
  Moon,
  Pizza,
  Plus,
  RotateCcw,
  RotateCw,
  Refrigerator,
  Salad,
  Shell,
  SlidersHorizontal,
  Snowflake,
  Share2,
  ShoppingCart,
  Trash2,
  Soup,
  Sparkles,
  Heart,
  Sun,
  Undo2,
  Users,
  Utensils,
  Tag,
  UtensilsCrossed,
  Wand2,
  Wheat,
  Wrench,
  X,
  Zap,
  MilkOff,
} from "../components/icons.jsx";
import { visualForRecipe, paletteForRecipe } from "../assets/dishes/dishVisuals.js";
import { dishImageForRecipe } from "../assets/dishes/dishImages.js";
import { resolveRecipeAllergens, EU_ALLERGENS } from "../lib/allergens.js";
import { adaptationsNeededFor } from "../lib/substitutions.js";
import { matchingHealthProfiles } from "../lib/healthProfileMatch.js";
import { migrateFixedDishes } from "../lib/fixedDishes.js";
import { recipeCatalogById } from "../data/recipeCatalog.js";
import { resolvePlainSteps, resolveRichSteps } from "../data/stepsRichById.js";
import guarnicionesData from "../data/recipes/guarniciones.json";
import salsasData from "../data/recipes/salsas.json";
import { categoryColor, categoryIcon, categoryLabel, isKnownCategory } from "./CatalogBrowserSheet.jsx";
import { isQualitativeUnit, qualitativeUnitLabel } from "../lib/ingredientCategories.js";
import { RecipeStepList } from "../components/RecipeSteps.jsx";
import {
  formatQty,
  normalizeRichSteps,
  resolveApplianceSteps,
  availablePartsOf,
  stepsByPart,
  ingredientsByPart,
  STEP_PART_META,
} from "../lib/recipeSteps.js";
import { estimateRecipeCost } from "../lib/listPricing.js";
import {
  assignFreezerToSlot,
  assignFridgeToSlot,
  cookedAgoLabel,
  cookedEatersFor,
  fridgePortionsFor,
  frozenPortionsFor,
  catalogIdOfPlanRecipe,
  itemPortions,
  pickFridgeItem,
  pickFrozenItem,
  portionsLabel,
  preparedPortionsFor,
  slotUsesFridge,
  slotUsesFreezer,
  slotUsesPrepared,
  splitSlotPortions,
} from "../lib/freezer.js";
import { ingredientImageFor, ingredientThumbSrc, categoryImageSrc } from "../lib/ingredientImages.js";
import { recetaConBases } from "../lib/recetaConBases.js";
import { hayTandasPedidas } from "../lib/cookTime.js";
import { basesPedidas, claveDeBase, clavesDeReceta, sesionDeBases } from "../lib/bases.js";
import { BASES_UI } from "../lib/basesUI.js";
import { mealTimeColor, mealTimeBg } from "../lib/mealTimes.js";
import { kitchenHint, pantryPieceCountLabel } from "../lib/kitchenUnits.js";
import { findMatchingPantryItem } from "../lib/shoppingBuilder.js";
import { consumeFromPantry, restoreToPantry, pantryConsumeMode } from "../lib/cookPantry.js";
import { addPantryItems, addLocalPantryItems, adjustCookedDishPortions, adjustLocalCookedDishPortions, loadPantry, loadLocalPantry, removePantryItem, removeLocalPantryItem } from "../lib/pantry.js";
import { normalizePantryInput } from "../utils/normalizePantryInput.js";
import { membersOfGroup, isBabyMenuGroup, adhocReasonLabel } from "../lib/groups.js";
import { eatersForSlot } from "../lib/slotEaters.js";
import { summarizeMenuRestrictionConflicts } from "../utils/menuConflicts.js";
import { Avatar, BottomNav, Chip, EmptyIllustration, GroupAvatarStack, GroupScopePicker, WeekRangeBadge, WizardSheet, bottomNavSpacer, groupAvatarFaces, APP_SHELL_MAX_WIDTH } from "../components/ui.jsx";
import { CommentThread } from "../components/CommentThread.jsx";
import { ShareMenuSheet } from "../components/ShareMenuSheet.jsx";
import { CookTimeEditor } from "../components/CookTimeEditor.jsx";
import { BasesPreferidas } from "../components/BasesPreferidas.jsx";
import { MenuCoachTour, CoachHelpButton } from "../components/HomeCoachTour.jsx";
import { RestrictionConflictBanner } from "../components/RestrictionConflictBanner.jsx";
import { RECIPES_BY_ID } from "../data/recipes.js";
import { MenuPlanBadge, RecipeVoteCounts, formatRecipeDate } from "../components/RecipeProvenance.jsx";
import { DishSpecPills } from "../components/SwipeCard.jsx";
import { RecipeClassificationFields } from "../components/RecipeClassificationFields.jsx";
import { isUserRecipeOwner, patchUserRecipeClassification } from "../lib/userRecipes.js";
import { FavoriteScopeModal } from "../components/FavoriteScopeModal.jsx";
import { MenuPdfExportModal } from "../components/MenuPdfExportModal.jsx";
import { OnboardingRestrictions, OnboardingMealStyle, OnboardingMealExtrasComidas, OnboardingMealExtrasOtros } from "./Onboarding.jsx";
import { downloadMenuPdf, shareMenu } from "../lib/menuExport.js";
import { generateRecipeSteps, catalogToFrontendRecipe } from "../lib/aiPlanner.js";
import { DAYS, getMeals, getDayMeals, isLunchMeal, dayLabel } from "../lib/planner.js";
import { dishAvailabilityMap, formatDisplay } from "../lib/shoppingListUtils.js";
import { initialsOf, AVATAR_PALETTE, memberAvatarColor, memberAvatarThumbSrc } from "../lib/stages.js";
import { deckImg, deckSrcSet, prefetchDeckHero } from "../lib/dishPhotoOptimize.js";
import {
  baseDishName,
  formatDishWithGarnish,
  isPlatoUnicoWithGarnish,
} from "../lib/dishNaming.js";
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
  KITCHEN_TOOLS,
  REQUIRED_APPLIANCE_ICONS,
  selectMethodForRecipe,
  methodDifficultyLabel,
  userApplianceSlugs,
} from "../lib/applianceMethods.js";
import {
  calendarDayNumber,
  formatWeekRangeLabel,
  getWeekDatesByMenuWeek,
  getWeekDatesFromStartISO,
  isoLocalDate,
  todayDayIdx,
} from "../lib/weekCalendar.js";
import { orderedWeeks } from "../lib/menuArchive.js";
// La MISMA baldosa que un mando del wizard: las acciones se despliegan en su
// fila, y con otra forma la fila cambiaría de idioma a mitad de gesto.
import { BaldosaAccion } from "../components/wizard/ControlRow.jsx";

// Los 1,7 MB de pasos precomputados por electrodomestico se cargan BAJO DEMANDA.
// Antes viajaban como import estatico, o sea dentro del chunk de Menu -- el mas
// pesado de la app y el que todo el mundo abre -- para algo que solo hace falta
// si abres una ficha Y eliges electrodomestico. La promesa se memoiza: se paga
// una vez por sesion y las siguientes fichas ya lo tienen resuelto.
let applianceStepsPromise = null;
function loadBundledApplianceSteps() {
  applianceStepsPromise ??= import("../data/recipeStepsByAppliance.json")
    .then((m) => m.default)
    // Si la descarga falla no se rompe la ficha: se sigue por /api/recipe-steps,
    // que es el camino que ya existia para lo que no esta precomputado.
    .catch(() => ({}));
  return applianceStepsPromise;
}

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

function DishVisual({ recipe, height = 220, imageUrl = null, eyebrow = null, title = null }) {
  const visual = visualForRecipe(recipe);
  const Icon = ICONS_BY_TYPE[recipe.iconType] ?? Utensils;
  const [imgFailed, setImgFailed] = useState(false);
  const showPhoto = imageUrl && !imgFailed;
  const displayTitle = title ?? recipe.name;

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
          alt={displayTitle}
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
        {eyebrow && (
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
        )}
        <div
          style={{
            fontSize: 24,
            fontWeight: 900,
            lineHeight: 1.05,
            letterSpacing: "-.4px",
            textShadow: showPhoto ? "0 1px 12px rgba(0,0,0,.5)" : "none",
          }}
        >
          {displayTitle}
        </div>
      </div>
    </div>
  );
}

const COOK_LEVELS = [
  { id: "basic",  label: "Básico",           icon: <BookOpenCheck size={20} /> },
  { id: "normal", label: "Normal",            icon: <ChefHat size={20} /> },
  { id: "pro",    label: "Me gusta cocinar",  icon: <Sparkles size={20} /> },
];

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
  // "Estructura y extras" solía ser una sola pantalla con pestañas
  // Comidas/Otros; ahora son dos pasos propios del asistente, así que Afinar
  // necesita su propio interruptor ligero para seguir editando los dos desde
  // aquí (2026-08-24).
  const [extrasEditPart, setExtrasEditPart] = useState("comidas");

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
    const ExtrasPart = extrasEditPart === "otros" ? OnboardingMealExtrasOtros : OnboardingMealExtrasComidas;
    return createPortal(
      <div style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(20,47,29,.28)", display: "flex", justifyContent: "center" }}>
        <div style={{ width: "100%", maxWidth: 420, height: "100dvh", background: "#f5f9f6", boxShadow: "0 0 40px rgba(0,0,0,.18)", position: "relative" }}>
          <div style={{
            position: "absolute", top: 56, left: "50%", transform: "translateX(-50%)", zIndex: 1,
            display: "flex", background: "#e8efe9", borderRadius: 999, padding: 3, gap: 2,
          }}>
            {[
              { id: "comidas", label: "Comidas" },
              { id: "otros", label: "Otros" },
            ].map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setExtrasEditPart(t.id)}
                style={{
                  padding: "6px 14px", borderRadius: 999, border: "none",
                  background: extrasEditPart === t.id ? "#0f766e" : "transparent",
                  color: extrasEditPart === t.id ? "#fff" : "#4a6555",
                  fontSize: 12.5, fontWeight: 800, cursor: "pointer", fontFamily: "inherit",
                }}
              >
                {t.label}
              </button>
            ))}
          </div>
          <ExtrasPart
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

        {/* ── Batch cooking ──
            Sección hermana de la de arriba, no un modo suyo. Vivió DENTRO de
            "Tiempo disponible", donde un selector "Clásico / Batch cooking"
            decidía cuál de las dos veías; así que elegir tanda borraba la
            pregunta de cuánto tiempo tienes un martes, que seguía en pie.
            Cerrada no estorba a quien cocina cada día, y quien no pide ninguna
            tanda no hace batch cooking: no hace falta interruptor. */}
        <AccordionSection title="Batch cooking" icon={CookingPot}>
          <BasesPreferidas data={data} setData={wrappedSetData} />
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
      // Captured now (plain DOM node, not the pooled synthetic event) so the
      // callback can still read its bounding rect once the timer fires.
      const target = e.currentTarget;
      timer.current = setTimeout(() => {
        firedLong.current = true;
        onLongPress?.(target);
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

/**
 * Las bases que ESTA semana merecen una tanda, por el mismo criterio que la
 * vista Tanda: dos platos o más compartiendo olla.
 *
 * Va por contexto y no por props por la misma razón que `ArmedContext`: la
 * usan las fichas del fondo del árbol y encadenarla a mano por Día, Semana y
 * Mes sería tres sitios donde olvidarse de pasarla.
 *
 * Que un plato lleve sofrito no basta para marcarlo: si es el único de la
 * semana que lo lleva, nadie va a hacer una tanda de sofrito y el icono estaría
 * prometiendo algo que no va a pasar.
 */
const TandaContext = createContext(null);

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
  // El primero cuenta aunque falte el segundo. Antes se salía en seco si no
  // había `recipeId`, así que una comida con primero y sin segundo no se
  // pintaba — y si ese día tampoco había cena, el día entero desaparecía de
  // la lista. Ver el comentario gemelo en aiPlanner.js, donde esa misma comida
  // ni siquiera llegaba a entrar en el plan.
  const tienePrimero = Boolean(isLunch && slot?.firstRecipeId);
  if (!slot?.recipeId && !tienePrimero) return [];
  const items = [];
  if (tienePrimero) {
    items.push({
      course: "1º",
      courseKey: "first",
      recipeId: slot.firstRecipeId,
    });
  }
  if (slot?.recipeId) {
    items.push({
      course: tienePrimero ? "2º" : null,
      courseKey: "main",
      recipeId: slot.recipeId,
    });
  }
  return items;
}

/**
 * ¿Este hueco admite cambiar de estructura (plato único ↔ primero y segundo)?
 *
 * Solo la comida. La cena SIEMPRE es un plato: aiPlanner le crea un único slot
 * (`${daySlug}_cena`, sin primero/segundo) y dishesFromSlot solo pinta el
 * primero cuando isLunch. Ofrecerlo en la cena sería un botón que escribe un
 * campo que nadie lee. Desayuno, merienda y postre, lo mismo.
 */
function isStructuralMeal(meal) {
  return isLunchMeal(meal);
}

/**
 * La acción contextual de la barra: si la comida tiene dos platos, ofrece
 * juntarlos en uno; si tiene uno, ofrece repartirlo en primero y segundo.
 *
 * El copy dice el RESULTADO, no la operación ("Plato único", no "Combinar"):
 * no se fusionan ni se parten platos —eso sería emparejar—, se sustituyen por
 * las recetas que pide la estructura nueva, cada una con su foto. "Combinar"
 * haría esperar los dos platos juntos en la misma imagen.
 */
function structureActionFor(sel, menuPlan, onPick) {
  const slot = menuPlan?.[sel.groupId]?.[`${sel.day}-${sel.meal}`];
  const dosPlatos = Boolean(slot?.firstRecipeId);
  return dosPlatos
    ? { id: "unico", Icon: Minimize2, label: "Plato único", onPick: () => onPick("unico") }
    : { id: "split", Icon: Layers2, label: "1º y 2º", onPick: () => onPick("primero_segundo") };
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
  // Este plato sale (del todo o en parte) de un tupper del congelador: se avisa
  // ya en la semana, porque cambia el plan del día — hay que bajarlo a la nevera
  // la noche antes, y no hay que comprar para él.
  const fromFreezer = slotUsesFreezer(slot, slot.recipeId);
  const fromFridge = slotUsesFridge(slot, slot.recipeId);
  const fromPrepared = fromFreezer || fromFridge;
  const preparedFresh = fromPrepared ? Number(slot.freshPortions) || 0 : 0;
  const preparedCount = fromFreezer
    ? Number(slot.frozenPortions) || 0
    : fromFridge
      ? Number(slot.fridgePortions) || 0
      : 0;

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
        {fromPrepared && (
          <span
            aria-hidden="true"
            title={
              preparedFresh > 0
                ? `${portionsLabel(preparedCount)} ${fromFridge ? "de la nevera" : "del congelador"} · cocinas ${preparedFresh} más`
                : `${portionsLabel(preparedCount)} ${fromFridge ? "de la nevera" : "del congelador"}: solo ${fromFridge ? "recalentar" : "descongelar"}`
            }
            style={{
              position: "absolute", top: -3, right: -3,
              width: 18, height: 18, borderRadius: 999,
              display: "flex", alignItems: "center", justifyContent: "center",
              background: fromFridge ? "#eef8f1" : "#eaf4fb",
              border: "2px solid #fff",
              boxShadow: "0 1px 3px rgba(0,0,0,.18)", boxSizing: "border-box",
            }}
          >
            {fromFridge
              ? <Refrigerator size={10} color="#2f6d8a" strokeWidth={3} />
              : <Snowflake size={10} color="#3d6b93" strokeWidth={3} />}
          </span>
        )}
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
            {/* Sin reloj, igual que en las pastillas de la foto: "25 min" ya
                dice que es tiempo. Ver DishSpecPills. */}
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

// Tres tramos de tiempo, y solo tres. "Resumen" (`lista`) salió de aquí: era la
// misma semana que ya enseña la vista Semana, puesta en rejilla, así que la
// cuarta opción del selector no llevaba a ningún sitio nuevo. Su vista sigue
// montada más abajo (DeckCalendar) y `deckView === "lista"` sigue funcionando:
// está APARCADA, no borrada, por si vuelve con algo propio que contar.
const DECK_VIEW_OPTIONS = [
  { id: "dia", label: "Día" },
  { id: "semana", label: "Semana" },
  { id: "mes", label: "Mes" },
  // La cuarta NO es otro tramo de tiempo: es el mismo menú visto por lo que hay
  // que cocinar ANTES. Va aquí y no en un sitio propio porque se mira en el
  // mismo gesto que la semana — "¿qué comemos?" y "¿qué dejo hecho?" son la
  // misma pregunta hecha desde dos lados.
  { id: "tanda", label: "Tanda" },
];

/**
 * La pizarra solo tiene Semana.
 *
 * Día también sabe pintar huecos vacíos, pero con una sola vista no hace
 * falta selector, y sin selector la fila de arriba deja sitio al avatar. Si
 * algún día vuelve Día, vuelve también el interruptor: la lista manda y el
 * `deckView` guardado que no esté aquí se corrige solo (ver el efecto que
 * lo acota).
 */
const DECK_VIEWS_BASICAS = DECK_VIEW_OPTIONS.filter((v) => v.id === "semana");

// Tres formas distintas para tres tramos distintos, y ahí está el cambio: antes
// Día era un calendario y Mes era OTRO calendario, y en este set de Nucleo los
// cuatro glifos de calendario son el mismo marco vacío —se comprobó mirándolos,
// no leyendo sus nombres—, así que el selector pedía elegir entre dos dibujos
// iguales. Y "Semana" llevaba `Layers2`, que en esta misma pantalla ya significa
// "1º y 2º" (dos platos) en el rosco y en la estructura del día.
//
// Ahora: un calendario (una fecha), una pila de hojas (varios días seguidos) y
// una rejilla (que es literalmente lo que dibuja la vista de mes).
const DECK_VIEW_ICON  = { dia: CalendarDays, semana: Layers, mes: LayoutGrid, tanda: CookingPot };
const DECK_VIEW_COLOR = { dia: "#c9820a", semana: "#2e7d75", mes: "#8a5cc4", tanda: "#b2622f" };

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
      // Una comida partida en dos (`dosPlatos`) enseña un hueco por plato,
      // aunque estén los dos sin poner: es la única forma de que puedas
      // elegir el primero y el segundo por separado desde el tablero vacío.
      // `dishesFromSlot` no puede decirlo —solo ve lo que hay puesto—, así
      // que los vacíos se intercalan aquí, cada uno en su sitio: el primero
      // delante y el segundo detrás.
      const dosPlatos = Boolean(isLunch && slot.dosPlatos);
      const items = [];
      if (dosPlatos && !slot.firstRecipeId) items.push({ vacio: "first" });
      for (const dish of dishes) items.push({ dish });
      if (dosPlatos && !slot.recipeId) items.push({ vacio: "main" });
      // A slot the user emptied ("Vaciar hueco") keeps a `cleared` flag so we can
      // still render a tappable placeholder to refill it (per group, no dedup).
      if (!dosPlatos && dishes.length === 0 && slot.cleared) items.push({ vacio: "main" });

      for (const item of items) {
        if (item.vacio) {
          // Sin el id del grupo en la clave: dos menús con la misma comida
          // vacía enseñaban DOS baldosas iguales, y rellenar una dejaba la
          // otra ahí, pidiendo el mismo plato otra vez. Ahora es una sola que
          // se acuerda de a quién representa (`groups`), y lo que pongas cae
          // en todos.
          const key = `empty::${meal}::${item.vacio}`;
          const existing = byKey.get(key);
          if (existing) {
            existing.groups.push(g);
            continue;
          }
          const tile = { meal, group: g, groups: [g], slot, dish: null, empty: true, course: item.vacio, dosPlatos };
          byKey.set(key, tile);
          tiles.push(tile);
          continue;
        }
        const dish = item.dish;
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

/**
 * La baldosa del `+`: abre un hueco nuevo en ESE día.
 *
 * Va al final de la fila y no en un mando aparte porque lo que se añade es
 * del día, no de la semana: el sitio donde se decide tiene que ser el sitio
 * donde se ve. Punteada y sin color, para no competir con los platos — es un
 * hueco por abrir, no un plato más.
 */
function AddSlotTile({ day, onAddSlot, denso = false }) {
  return (
    <button
      type="button"
      className="mp-press"
      onClick={() => onAddSlot(day)}
      aria-label={`Añadir hueco al ${dayLabel(day)}`}
      style={{
        width: "100%", height: "100%", minHeight: denso ? 104 : 120,
        border: "1.5px dashed #cfe0d5", borderRadius: denso ? 14 : 22,
        background: "transparent", cursor: "pointer", fontFamily: "inherit",
        display: "flex", flexDirection: "column", alignItems: "center",
        justifyContent: "center", gap: 6, padding: 0,
      }}
    >
      <span
        style={{
          width: denso ? 26 : 32, height: denso ? 26 : 32, borderRadius: 999,
          background: "#eaf3ed", color: "#2d5a3d",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}
      >
        <Plus size={denso ? 15 : 18} strokeWidth={3} />
      </span>
      <span style={{ fontSize: denso ? 10 : 11.5, fontWeight: 800, color: "#8aa394" }}>
        Añadir hueco
      </span>
    </button>
  );
}

/** A single photo-forward dish tile. Fills its parent (parent controls size). */
const mandoStyle = {
  width: 20, height: 20, borderRadius: 999, cursor: "pointer",
  background: "rgba(12,22,15,.45)", backdropFilter: "blur(3px)",
  display: "flex", alignItems: "center", justifyContent: "center",
};

function DeckTile({ tile, day, onDishTap, onDishLongPress, imgWidth = 720, radius = 22, compact = false, denso = false, showGroup = false, members = null, invitados = 0, onRemoveSlot = null, onFillSlot = null, onDishActions = null }) {
  const { meal, group, slot, dish } = tile;
  const armed = useContext(ArmedContext);
  const clavesTanda = useContext(TandaContext);
  const isEmpty = Boolean(tile.empty);
  const badgeGroups = tile.groups ?? (group ? [group] : []);
  const [failed, setFailed] = useState(false);
  const recipe = isEmpty ? null : RECIPES_BY_ID[dish.recipeId];
  const srcUrl = recipe ? dishImageForRecipe(recipe) : null;
  const sel = isEmpty
    ? {
        slot, groupId: group.id, day, meal, group,
        groupIds: (tile.groups ?? [group]).map((g) => g.id),
        course: tile.course ?? "main", empty: true,
      }
    : recipe
      ? { recipe, slot, groupId: group.id, day, meal, group, course: dish.courseKey }
      : null;
  const press = useLongPress(
    (targetEl) => {
      if (!sel) return;
      const tr = targetEl?.getBoundingClientRect();
      const radius = targetEl ? parseFloat(getComputedStyle(targetEl).borderRadius) || 18 : 18;
      onDishLongPress?.({
        ...sel,
        anchor: tr ? { tile: { top: tr.top, left: tr.left, width: tr.width, height: tr.height }, radius } : null,
      });
    },
    () => sel && onDishTap?.(sel),
    // En la pizarra esta misma pulsación levanta el plato para arrastrarlo, y
    // ahí el listón de 420ms/12px es demasiado fino: sujetar el dedo quieto
    // medio segundo sobre una baldosa que se mueve con el scroll falla más de
    // lo que acierta. Un pelín antes y con más margen de temblor.
    onDishActions ? { ms: 340, moveTol: 18 } : undefined,
  );
  const onPointerDownPrefetch = (e) => {
    press.onPointerDown?.(e);
    if (srcUrl) prefetchDeckHero(srcUrl, 720);
  };
  // ¿Este plato tira de alguna tanda de esta semana? Se mira contra las bases
  // que la sesión del domingo justifica, no contra las que el plato declara:
  // un sofrito que nadie más comparte no se va a cocinar aparte.
  // El eje de bases se lee del CATÁLOGO y no de la receta guardada, por lo
  // mismo que `lookupDeTanda`: una semana generada antes de que el puente
  // copiara `basesAparte` la trae vacía, y el icono no aparecería nunca.
  const delCatalogo = recipe ? (recipeCatalogById[String(recipe.id).split("__").pop()] ?? recipe) : null;
  const deTanda = Boolean(
    delCatalogo && clavesTanda?.size
    && clavesDeReceta(delCatalogo).some((c) => clavesTanda.has(c)),
  );
  // `slot.mode` lo pone modeForGroupSlot: "tupper" cuando alguien de este grupo
  // se lleva esa comida fuera y hay que cocinarla igual.
  const esTupper = slot?.mode === "tupper";
  // El aparato con el que has dicho que harás ESTE plato. Por plato y no por
  // hueco: en una comida partida, el primero puede ir al horno y el segundo a
  // la sartén.
  const aparatoElegido = dish?.courseKey === "first" ? slot?.firstAppliance : slot?.appliance;
  const emptyMealLabel = MEAL_META[meal]?.label ?? meal;
  if (isEmpty) {
    // Use the meal's own MenuPlan icon (Comida = Sol, Cena = Luna…) inside a soft
    // colored badge with a small "+", so an empty slot reads as "add here" rather
    // than a generic crossed-cutlery placeholder.
    const MealIcon = MEAL_META[meal]?.Icon ?? UtensilsCrossed;
    const accent = MEAL_EMPTY_ACCENT[meal] ?? MEAL_EMPTY_ACCENT._default;
    const badge = compact ? 32 : 46;
    return (
      <div style={{ position: "relative", width: "100%", height: "100%" }}>
      {/* Cerrar el hueco. Solo aparece sobre uno VACÍO: el plato se quita antes
          con "vaciar", que es otro gesto y reversible, así que este toque no
          puede llevarse por delante nada que hubieras elegido. */}
      {/* "Que lo elija la app": rellena SOLO este hueco, con el mismo pool
          que ya calcula las sugerencias de abajo. Ni espera ni coste — no
          pasa por el modelo. */}
      {onFillSlot && (
        <span
          role="button"
          tabIndex={0}
          aria-label={`Rellenar el hueco de ${emptyMealLabel}`}
          onClick={(e) => { e.stopPropagation(); onFillSlot(sel); }}
          onPointerDown={(e) => e.stopPropagation()}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.stopPropagation(); onFillSlot(sel); } }}
          style={{
            position: "absolute", top: 5, left: 5, zIndex: 2,
            width: 20, height: 20, borderRadius: 999, cursor: "pointer",
            background: "#fff", border: "1px solid #dbe7df",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
        >
          <Sparkles size={11} color="#7a9485" strokeWidth={2.4} />
        </span>
      )}
      {onRemoveSlot && (
        <span
          role="button"
          tabIndex={0}
          aria-label={`Quitar el hueco de ${emptyMealLabel}`}
          onClick={(e) => { e.stopPropagation(); onRemoveSlot(sel); }}
          onPointerDown={(e) => e.stopPropagation()}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.stopPropagation(); onRemoveSlot(sel); } }}
          style={{
            position: "absolute", top: 5, right: 5, zIndex: 2,
            width: 20, height: 20, borderRadius: 999, cursor: "pointer",
            background: "#fff", border: "1px solid #dbe7df",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
        >
          <X size={11} color="#9ab0a1" strokeWidth={2.6} />
        </span>
      )}
      <button
        type="button"
        {...press}
        data-slot={`${day}-${meal}`}
        data-group={group?.id}
        data-course="main"
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
          {tile.dosPlatos
            ? `${tile.course === "first" ? "1º" : "2º"} libre`
            : `${emptyMealLabel} libre`}
        </span>
        <span style={{ fontSize: compact ? 9 : 10.5, fontWeight: 600, color: "#9bb0a4" }}>Toca para añadir</span>
      </button>
      </div>
    );
  }
  if (!recipe) return null;
  const optimized = deckImg(srcUrl, imgWidth);
  const visual = visualForRecipe(recipe);
  const mealLabel = MEAL_META[meal]?.label ?? meal;
  const courseTxt = dish.course ? `${mealLabel} · ${dish.course}` : mealLabel;
  const showPhoto = optimized && !failed;
  const isArmed = !!armed && !!sel && sameDish(armed.source, sel);
  // El rosco se ancla a la BALDOSA, no al botón que lo abre: así sale
  // centrado sobre el plato, igual que con la pulsación larga.
  const abrirMandos = (e, cb) => {
    const tile = e.currentTarget.closest(".deck-tile");
    const tr = tile?.getBoundingClientRect();
    const rad = tile ? parseFloat(getComputedStyle(tile).borderRadius) || 18 : 18;
    cb({
      ...sel,
      anchor: tr ? { tile: { top: tr.top, left: tr.left, width: tr.width, height: tr.height }, radius: rad } : null,
    });
  };
  // Las acciones de un plato ya colocado. En la pizarra la pulsación larga
  // levanta el plato para arrastrarlo, así que el rosco y el vaciar necesitan
  // botón propio — sin ellos, un plato puesto no se podía ni quitar.
  const mandosDelPlato = onDishActions && sel && (
    <div
      style={{
        position: "absolute", top: compact ? 5 : 8, right: compact ? 5 : 8,
        zIndex: 3, display: "flex",
      }}
    >
      {onDishActions && (
        <span
          role="button"
          tabIndex={0}
          aria-label={`Acciones de ${recipe.name}`}
          onClick={(e) => { e.stopPropagation(); abrirMandos(e, onDishActions); }}
          onPointerDown={(e) => e.stopPropagation()}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.stopPropagation(); abrirMandos(e, onDishActions); } }}
          className="deck-tile-actions"
          style={mandoStyle}
        >
          <MoreHorizontal size={compact ? 11 : 13} color="#fff" strokeWidth={2.8} />
        </span>
      )}
    </div>
  );
  return (
    <button
      type="button"
      className="deck-tile"
      data-coach="menu-dish"
      data-slot={`${day}-${meal}`}
      data-group={group?.id}
      data-course={dish?.courseKey}
      {...press}
      onPointerDown={onPointerDownPrefetch}
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
      {mandosDelPlato}
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
      {/* Lo mismo que ve el cartel de una receta en Inspírate o en Gente: si
          hoy da la vida para cocinar esto se decide con estos dos datos, y
          hasta ahora había que abrir el plato para saberlos. */}
      {/* En denso no: la tarjeta mide la mitad y con dos pastillas encima el
          nombre del plato, que es lo único que se viene a leer de un vistazo,
          pierde la esquina. Siguen a un toque, dentro del plato. */}
      {!denso && (
        <div style={{ position: "absolute", top: compact ? 8 : 12, right: compact ? 8 : 12 }}>
          <DishSpecPills difficulty={recipe.difficulty} time={recipe.time} compact={compact} align="flex-end" />
        </div>
      )}
      {/* Invitados en este hueco. Comparte esquina con las chapas de grupo y
          va DELANTE: "esta noche sois uno más" cambia lo que hay que cocinar,
          y de quién es el menú no. */}
      {invitados > 0 && (
        <div style={{
          position: "absolute", top: compact ? 8 : 12, left: compact ? 8 : 12,
          display: "inline-flex", alignItems: "center", gap: 3,
          height: compact ? 20 : 26, padding: compact ? "0 7px" : "0 9px",
          borderRadius: 999, background: "#2d5a3d", color: "#fff",
          fontSize: compact ? 10.5 : 12, fontWeight: 800,
          boxShadow: "0 2px 8px rgba(9,18,12,.35)",
        }}
        title={invitados === 1 ? "Un comensal más" : `${invitados} comensales más`}
        >
          <UserPlus size={compact ? 11 : 13} strokeWidth={2.6} />
          {invitados > 1 && <span>{invitados}</span>}
        </div>
      )}
      {showGroup && badgeGroups.length > 0 && (
        <div style={{
          position: "absolute", top: compact ? 8 : 12,
          // Se aparta para no taparse con la chapa de invitados.
          left: (compact ? 8 : 12) + (invitados > 0 ? (compact ? 30 : 40) : 0),
          display: "flex", gap: 4,
        }}>
          {badgeGroups.map((gr) => (
            // Two faces then a counter: a dish shared by several menús already
            // shows one badge per group, so letting each one run to three would
            // march a row of discs across the photo.
            <GroupMenuBadge key={gr.id} group={gr} size={compact ? 20 : 26} members={members} max={2} />
          ))}
        </div>
      )}
      {/* Las dos chapas de la esquina dicen cosas distintas y por eso van
          juntas y separadas: la olla es "esto tira de algo que dejas hecho el
          domingo" y el maletín es "esto te lo llevas". Se parecen —las dos
          hablan de cocinar para otro momento— pero no son lo mismo: puedes
          llevarte un tupper de lo que sobró sin haber hecho ninguna tanda. */}
      {(deTanda || esTupper || aparatoElegido) && (
        <div
          style={{
            position: "absolute", right: compact ? 8 : 12, bottom: compact ? 8 : 12,
            display: "flex", gap: compact ? 4 : 6,
          }}
        >
          {/* Con qué has dicho que lo vas a hacer. Va en esta esquina y no
              arriba porque es de la misma familia que la olla y el maletín:
              las tres hablan de CÓMO se cocina esto, no de qué es. */}
          {aparatoElegido && (
            <div
              title={`Lo haces con ${APPLIANCE_LABELS[aparatoElegido] ?? aparatoElegido}`}
              style={{
                width: compact ? 22 : 28, height: compact ? 22 : 28, borderRadius: 999,
                background: "rgba(255,255,255,.92)",
                display: "flex", alignItems: "center", justifyContent: "center",
                boxShadow: "0 2px 8px rgba(9,18,12,.35)",
              }}
            >
              {(() => {
                const Ap = APPLIANCE_ICONS[aparatoElegido];
                return Ap ? <Ap size={compact ? 12 : 15} color={APPLIANCE_COLORS[aparatoElegido] ?? "#5a7066"} strokeWidth={2.4} /> : null;
              })()}
            </div>
          )}
          {deTanda && (
            <div
              title="Lleva algo que dejas hecho el domingo"
              style={{
                width: compact ? 22 : 28, height: compact ? 22 : 28, borderRadius: 999,
                background: "rgba(255,255,255,.92)",
                display: "flex", alignItems: "center", justifyContent: "center",
                boxShadow: "0 2px 8px rgba(9,18,12,.35)",
              }}
            >
              <CookingPot size={compact ? 12 : 15} color="#b2622f" strokeWidth={2.4} />
            </div>
          )}
          {esTupper && (
            <div
              title="Esta comida te la llevas en tupper"
              style={{
                width: compact ? 22 : 28, height: compact ? 22 : 28, borderRadius: 999,
                background: "rgba(255,255,255,.92)",
                display: "flex", alignItems: "center", justifyContent: "center",
                boxShadow: "0 2px 8px rgba(9,18,12,.35)",
              }}
            >
              <BriefcaseBusiness size={compact ? 12 : 15} color="#b45309" strokeWidth={2.4} />
            </div>
          )}
        </div>
      )}
      <div style={{
        position: "absolute", left: compact ? 10 : 14,
        // Se aparta de la chapa de la tanda para que el título no pase por debajo.
        right: (compact ? 10 : 14) + ((deTanda ? 1 : 0) + (esTupper ? 1 : 0)) * (compact ? 26 : 34),
        bottom: compact ? 10 : 13,
      }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 7,
            marginBottom: compact ? 4 : 7,
          }}
        >
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

function DeckDayPager({ days, activeDay, onActiveDay, weekDates, data, menuPlan, visibleGroups, onDishTap, onDishLongPress, onRegenerateDay, regenGroups = [], showGroup = false, invitadosPorHueco = null, onAddSlot = null, onRemoveSlot = null, onFillSlot = null, onDishActions = null }) {
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
                    <DeckTile tile={tile} day={day} onDishTap={onDishTap} onDishLongPress={onDishLongPress} imgWidth={760} showGroup={showGroup} members={data?.members} invitados={invitadosPorHueco?.[`${tile.group?.id}|${day}|${tile.meal}`] ?? 0} onRemoveSlot={onRemoveSlot} onFillSlot={onFillSlot} onDishActions={onDishActions} />
                  </div>
                ))
              )}
              {onAddSlot && (
                <div style={many ? { height: 96, flexShrink: 0 } : { flex: "0 0 96px" }}>
                  <AddSlotTile day={day} onAddSlot={onAddSlot} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** "Semana" view — one row per day, horizontally scrollable mini photo cards. */
function DeckWeek({ days, weekDates, data, menuPlan, visibleGroups, onDishTap, onDishLongPress, onRegenerateDay, regenGroups = [], showGroup = false, invitadosPorHueco = null, denso = false, onAddSlot = null, onRemoveSlot = null, onFillSlot = null, onDishActions = null }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: denso ? 12 : 18 }}>
      {days.map((day) => {
        const tiles = getDeckDayTiles(day, data, menuPlan, visibleGroups);
        // Un día sin huecos se sigue pintando cuando hay `+`: si desapareciera,
        // no habría dónde tocar para volver a abrirle uno.
        if (tiles.length === 0 && !onAddSlot) return null;
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
                <div key={`${tile.group.id}-${tile.meal}-${tile.dish?.courseKey ?? "empty"}-${i}`} style={{ flex: denso ? "0 0 33%" : "0 0 46%" }}>
                  <div style={{ height: denso ? 104 : 150 }}>
                    <DeckTile tile={tile} day={day} onDishTap={onDishTap} onDishLongPress={onDishLongPress} imgWidth={360} radius={denso ? 14 : 16} compact denso={denso} showGroup={showGroup} members={data?.members} invitados={invitadosPorHueco?.[`${tile.group?.id}|${day}|${tile.meal}`] ?? 0} onRemoveSlot={onRemoveSlot} onFillSlot={onFillSlot} onDishActions={onDishActions} />
                  </div>
                </div>
              ))}
              {onAddSlot && (
                <div style={{ flex: denso ? "0 0 26%" : "0 0 34%" }}>
                  <div style={{ height: denso ? 104 : 150 }}>
                    <AddSlotTile day={day} onAddSlot={onAddSlot} denso={denso} />
                  </div>
                </div>
              )}
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
const SALSA_BY_ID = Object.fromEntries(salsasData.map((s) => [s.id, s]));

/** Id de catálogo sin prefijo de grupo (p. ej. `adultos__carnes_032` → `carnes_032`). */
function catalogRecipeId(recipeOrId) {
  if (recipeOrId && typeof recipeOrId === "object") {
    if (recipeOrId.baseRecipeId) return recipeOrId.baseRecipeId;
    return catalogRecipeId(recipeOrId.id ?? "");
  }
  const id = String(recipeOrId ?? "");
  return id.includes("__") ? id.slice(id.indexOf("__") + 2) : id;
}

/** Qué guarnición enlazar: garnishId persistido, nombre fusionado o demo de catálogo. */
function resolveGarnishKey(recipe, catalogId) {
  if (recipe?.garnishId && GUARNICION_BY_ID[recipe.garnishId]) return recipe.garnishId;
  if (recipe?.pinnedGarnishId && GUARNICION_BY_ID[recipe.pinnedGarnishId]) return recipe.pinnedGarnishId;

  // Menús viejos: "Escalope de pollo con puré de patatas" sin garnishId en el objeto.
  const suffix = (recipe?.name ?? "").split(/\s+con\s+/i).pop()?.trim().toLowerCase();
  if (suffix) {
    const byName = Object.values(GUARNICION_BY_ID).find(
      (g) => g.shortName?.toLowerCase() === suffix || g.name?.toLowerCase() === suffix,
    );
    if (byName) return byName.id;
  }

  if (catalogId === "carnes_032") return "guarniciones_024";

  return null;
}

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
 * Category illustration as a coin: the full render, cropped into a circle and
 * rimmed in the category colour.
 *
 * A real border (not an inset shadow) does the rimming, because the artwork is
 * scaled past the edge to bury its flat margin and would paint straight over
 * an inset one.
 */
function CategoryArt({ cat, size = 34, ring = 1.2, elevated = false }) {
  const [failed, setFailed] = useState(false);
  const color = cat ? categoryColor(cat) : "#5a7066";
  const Icon = cat ? categoryIcon(cat) : Utensils;
  const img = cat && !failed ? categoryImageSrc(cat) : null;

  return (
    <span
      style={{
        width: size,
        height: size,
        flexShrink: 0,
        borderRadius: 999,
        border: `${ring}px solid ${color}`,
        boxSizing: "border-box",
        overflow: "hidden",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        background: `${color}1a`,
        // Elevated tokens wear a halo in their own category colour so each
        // dish reads as its own coloured coin — sits well against the tinted
        // board and separates neighbouring combos at a glance.
        boxShadow: elevated
          ? `0 0 0 1.5px ${color}, 0 2px 8px -1px ${color}80, 0 1px 3px rgba(20,47,29,.22)`
          : "none",
      }}
    >
      {img ? (
        <img
          src={img}
          alt=""
          onError={() => setFailed(true)}
          style={{ width: "118%", height: "118%", objectFit: "cover", display: "block" }}
        />
      ) : (
        <Icon size={Math.round(size * 0.5)} color={color} strokeWidth={2.5} />
      )}
    </span>
  );
}

/**
 * A dish in the Resumen grid: the category illustration ringed in its colour.
 * When the dish has a side, a smaller art badge rides on its corner so the
 * pairing ("pescado + patatas") reads as a single glyph.
 */
function TypologyToken({ cat, name, garnishCat, garnishName, onTap, size = 34, delay = 0 }) {
  const label = cat ? categoryLabel(cat) : "Plato";
  const badge = Math.round(size * 0.46);
  const tip = [label, name].filter(Boolean).join(" · ");

  return (
    <button
      type="button"
      className="cal-token"
      onClick={onTap}
      title={garnishName ? `${tip} (+ ${garnishName})` : tip}
      aria-label={tip}
      style={{
        position: "relative",
        width: size,
        height: size,
        flexShrink: 0,
        border: "none",
        padding: 0,
        background: "none",
        cursor: "pointer",
        fontFamily: "inherit",
        display: "inline-flex",
        animationDelay: `${delay}ms`,
        transition: "transform .15s ease",
      }}
    >
      <CategoryArt cat={cat} size={size} ring={1.5} elevated />
      {garnishCat && (
        <span
          style={{
            position: "absolute",
            right: -3,
            bottom: -3,
            borderRadius: 999,
            border: "2px solid #fff",
            display: "inline-flex",
            boxShadow: "0 2px 5px -1px rgba(20,47,29,.3)",
          }}
        >
          <CategoryArt cat={garnishCat} size={badge} ring={1} />
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
 * The week's category mix as a ranked bar chart: illustration, name, a bar
 * scaled against the leading category, and the count.
 *
 * Everything lives in one four-column grid, so the art, the names, the bar
 * baselines and the numbers line up down the card — the bubble layout it
 * replaced couldn't do that, because each bubble carried its own badge at its
 * own diameter. Bars are measured against the top category rather than the
 * total: "half as much chicken as fish" is the comparison people actually make.
 */
function WeekMix({ mix }) {
  const top = mix.items[0]?.count ?? 1;
  const leadColor = categoryColor(mix.items[0]?.cat);

  return (
    <div
      style={{
        position: "relative",
        padding: "13px 2px 14px",
        marginBottom: 14,
        overflow: "hidden",
      }}
    >

      <div style={{ position: "relative", display: "flex", alignItems: "baseline", gap: 8, marginBottom: 11 }}>
        <span style={{ fontSize: 11, fontWeight: 900, color: "#2f4238", textTransform: "uppercase", letterSpacing: ".8px", whiteSpace: "nowrap" }}>
          El mix de la semana
        </span>
        <span style={{ flex: 1, borderBottom: "1.5px dashed #d4dfd8", marginBottom: 3 }} />
        <span
          style={{
            flexShrink: 0,
            width: 22, height: 22,
            borderRadius: 999,
            background: "#2d5a3d",
            color: "#fff",
            fontSize: 11,
            fontWeight: 900,
            fontVariantNumeric: "tabular-nums",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {mix.total}
        </span>
      </div>

      <div
        style={{
          position: "relative",
          display: "grid",
          gridTemplateColumns: "30px minmax(0, 1fr) 1.45fr 18px",
          alignItems: "center",
          columnGap: 9,
          rowGap: 9,
        }}
      >
        {mix.items.map(({ cat, count, pct }, i) => {
          const color = categoryColor(cat);
          const lead = i === 0;
          return (
            <Fragment key={cat}>
              <CategoryArt cat={cat} size={30} ring={1.2} />

              <span
                title={categoryLabel(cat)}
                style={{ fontSize: 11.5, fontWeight: 800, color: "#2f4238", letterSpacing: "-.2px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
              >
                {categoryLabel(cat)}
              </span>

              <span
                title={`${count} ${count === 1 ? "plato" : "platos"} · ${Math.round(pct)}%`}
                style={{ height: 10, borderRadius: 999, background: "#eff4f0", overflow: "hidden" }}
              >
                <span
                  className="mix-bar"
                  style={{
                    display: "block", height: "100%",
                    width: `${(count / top) * 100}%`,
                    borderRadius: 999,
                    background: color,
                    boxShadow: lead ? `0 0 8px -1px ${color}90` : "none",
                    animationDelay: `${i * 70}ms`,
                  }}
                />
              </span>

              <span style={{ fontSize: 13, fontWeight: 900, color, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                {count}
              </span>
            </Fragment>
          );
        })}
      </div>
    </div>
  );
}

/**
 * "Resumen" view — the week as a real calendar grid: days across, meals down.
 * Each dish is a category illustration ringed in its colour (with a side-dish
 * badge when it has one), so a glance answers "what dominates this week?"
 * without reading a single name. A bubble mix on top tallies the whole week.
 */
function DeckCalendar({ days, weekDates, data, menuPlan, visibleGroups, onDishTap }) {
  const { activeMeals, dayRows, mix, hasContent } = useMemo(() => {
    const meals = getMeals(data); // main meals only (Comida / Cena)
    const counts = new Map();
    let any = false;

    const rows = days.map((day) => {
      const byMeal = {};
      for (const meal of meals) {
        const tokens = typologyTokens(day, meal, menuPlan, visibleGroups);
        for (const t of tokens) {
          if (t.cat) counts.set(t.cat, (counts.get(t.cat) ?? 0) + 1);
        }
        if (tokens.length > 0) any = true;
        byMeal[meal] = tokens;
      }
      return { day, byMeal };
    });

    const total = [...counts.values()].reduce((a, b) => a + b, 0);
    const sorted = [...counts.entries()]
      .sort((a, b) => b[1] - a[1] || categoryLabel(a[0]).localeCompare(categoryLabel(b[0])))
      .map(([cat, count]) => ({ cat, count, pct: total ? (count / total) * 100 : 0 }));

    return { activeMeals: meals, dayRows: rows, mix: { total, items: sorted }, hasContent: any };
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
      {mix.items.length > 0 && <WeekMix mix={mix} />}
      <WeekGrid
        dayRows={dayRows}
        activeMeals={activeMeals}
        weekDates={weekDates}
        todayNum={todayNum}
        onDishTap={onDishTap}
      />
    </div>
  );
}

/** Renderiza los platos de una celda (principal + guarnición) unidos por "+". */
function ComboTokens({ tokens, meal, day, onDishTap, size = 34, gap = 9, plusColor = "#b3c4b9" }) {
  if (!tokens || tokens.length === 0) {
    return <span style={{ width: 7, height: 7, borderRadius: 999, background: "#c6d8cc" }} />;
  }
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", flexWrap: "wrap", gap }}>
      {tokens.map(({ recipeId, slot, group, course, cat, name, garnishCat, garnishName }, ti) => (
        <Fragment key={`${recipeId}-${course}`}>
          {ti > 0 && (
            <span
              style={{
                fontSize: 13,
                fontWeight: 900,
                color: plusColor,
                lineHeight: 1,
                flexShrink: 0,
                userSelect: "none",
                margin: "0 -2px",
              }}
            >
              +
            </span>
          )}
          <TypologyToken
            cat={cat}
            name={name}
            garnishCat={garnishCat}
            garnishName={garnishName}
            size={size}
            onTap={() =>
              onDishTap?.({ recipe: RECIPES_BY_ID[recipeId], slot, groupId: group.id, day, meal, group, course })
            }
          />
        </Fragment>
      ))}
    </div>
  );
}

/** Cabecera de columna de comida: icono y nombre en su color, sobre un subrayado. */
function CalMealHeader({ meal }) {
  const mc = mealTimeColor(meal);
  const MealIcon = isLunchMeal(meal) ? Sun : Moon;
  return (
    <div
      style={{
        borderBottom: `2px solid ${mc}`,
        padding: "9px 4px 8px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
      }}
    >
      <MealIcon size={15} color={mc} strokeWidth={2.6} />
      <span
        style={{
          fontSize: 11,
          fontWeight: 900,
          color: mc,
          letterSpacing: ".4px",
          textTransform: "uppercase",
        }}
      >
        {meal}
      </span>
    </div>
  );
}

/**
 * The week as a grid: days down the side, meals across the top.
 *
 * Deliberately quiet — the dish coins are the only saturated thing here, so
 * the surface stays white and rows alternate with a barely-there tint. The
 * meal columns are told apart by their coloured underline alone.
 */
function WeekGrid({ dayRows, activeMeals, weekDates, todayNum, onDishTap }) {
  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: `46px repeat(${activeMeals.length}, 1fr)` }}>
        <div />
        {activeMeals.map((meal) => (
          <CalMealHeader key={`h-${meal}`} meal={meal} />
        ))}
        {dayRows.map(({ day, byMeal }, di) => {
          const dayNum = calendarDayNumber(day, weekDates);
          const isToday = dayNum != null && dayNum === todayNum;
          const bg = "transparent";
          return (
            <Fragment key={day}>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "14px 4px", borderTop: di > 0 ? "1px solid #eef2f0" : "none" }}>
                <div style={{ fontSize: 9, fontWeight: 800, color: isToday ? "#4a7c5c" : "#9ab0a1", textTransform: "uppercase", letterSpacing: ".4px" }}>{day.slice(0, 3)}</div>
                <div style={{ fontSize: 15, fontWeight: 900, color: isToday ? "#2d5a3d" : "#142f1d", fontVariantNumeric: "tabular-nums" }}>{dayNum ?? "·"}</div>
              </div>
              {activeMeals.map((meal) => (
                <div key={`${day}-${meal}`} style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "12px 8px", borderTop: di > 0 ? "1px solid #eef2f0" : "none" }}>
                  <ComboTokens tokens={byMeal[meal]} meal={meal} day={day} onDishTap={onDishTap} size={40} gap={11} />
                </div>
              ))}
            </Fragment>
          );
        })}
      </div>
    </div>
  );
}

const MONTH_NAMES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];
const MONTH_COLS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

/** Lunes de la semana que contiene `d`. */
function mondayOf(d) {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  out.setDate(out.getDate() - ((out.getDay() + 6) % 7));
  return out;
}

/**
 * Todos los días del menú COMPLETO -de todas sus semanas- indexados por fecha.
 *
 * Las demás vistas trabajan sobre `menuPlan`, que es solo la semana activa. Un
 * mes no cabe en una semana, así que esta lee `menuWeeks`, donde cada semana ya
 * viene con su propio `plan` (ver orderedWeeks en lib/menuArchive.js): no hace
 * falta pedir nada, ya estaba en las props.
 */
function monthCellsFromWeeks(menuWeeks, data, visibleGroups) {
  const meals = getMeals(data);
  const byDate = new Map();
  for (const week of menuWeeks ?? []) {
    if (!week?.weekStart || !week.plan) continue;
    // La semana ABIERTA trae sus fechas ya resueltas por la pantalla, que es
    // quien manda sobre qué días se ven (data.menuWeek). Calcularlas otra vez
    // aquí las sacaba distintas -el archivo guarda su propio startDayIdx- y el
    // mes acababa ofreciendo días que la vista de día no tiene: tocabas el
    // miércoles y aterrizabas en el viernes.
    const { dates, activeDays } = week.dates && week.activeDays
      ? week
      : getWeekDatesFromStartISO(week.weekStart, week.startDayIdx ?? 0);
    for (const day of activeDays) {
      const date = dates[day];
      if (!date) continue;
      const tokens = [];
      for (const meal of meals) {
        for (const t of typologyTokens(day, meal, week.plan, visibleGroups)) tokens.push({ ...t, meal });
      }
      if (tokens.length === 0) continue;
      byDate.set(isoLocalDate(date), { day, weekStart: week.weekStart, tokens });
    }
  }
  return byDate;
}

/**
 * El menú puesto sobre el calendario del mes.
 *
 * No es "otra forma de ver la semana": responde a una pregunta distinta —
 * DÓNDE cae cada cosa en el mes, qué días están cubiertos y cuáles no. Por eso
 * pinta el mes ENTERO, con sus huecos vacíos a la vista, en vez de amontonar
 * solo los días que tienen plato: el hueco es justamente la información.
 *
 * Cada día es su número y un punto por plato, del color de su categoría (la
 * misma escala que el resumen semanal). A ese tamaño un nombre no se lee y una
 * ilustración es un borrón, pero el color sí dice "ese día hay pescado". Para
 * el detalle se toca el día: lleva a su semana y a su vista de día, que es
 * donde el plato ya se ve entero.
 */
/**
 * Vista "Tanda" — lo que hay que dejar hecho antes de que empiece la semana.
 *
 * No es otro tramo de tiempo como Día, Semana o Mes: es el MISMO menú visto por
 * el otro lado. `sesionDeBases` mira los platos de la semana, agrupa los que
 * comparten olla y saca qué bases merecen una tanda, cuántas raciones y a qué
 * días alimenta cada una. Esa función existía desde hacía días sin que la
 * llamara ninguna pantalla: todo el trabajo de etiquetar el catálogo terminaba
 * en un número que nadie veía.
 *
 * Una base solo sale si la comparten DOS platos o más (MIN_PLATOS_POR_BASE):
 * cocinar el arroz de un único plato no es una tanda, es cocinar.
 *
 * Las tarjetas son las del menú —foto real, dificultad y tiempo— porque una
 * base es una receta como las demás y se abre igual. La ilustración de dibujo
 * se queda en el selector del wizard, que es donde se ELIGE; aquí se cocina.
 */
/**
 * El índice de recetas con el que se calcula la tanda.
 *
 * Manda el CATÁLOGO, no lo que el menú guardó. `RECIPES_BY_ID` se rellena con
 * las recetas persistidas del menú, y las de un menú generado antes de que el
 * puente copiara `basesAparte` llegan sin el eje de bases: para ellas la sesión
 * salía vacía aunque el catálogo supiera perfectamente que ese plato lleva
 * sofrito.
 *
 * Arreglar el puente no bastaba: las semanas YA generadas seguían rotas hasta
 * que alguien las regenerara, y nadie iba a saber por qué. Mirando primero el
 * catálogo, una semana vieja funciona igual.
 *
 * Lo que no está en el catálogo —recetas propias, generadas por IA— se sigue
 * leyendo de donde estaba.
 */
/**
 * El nombre de la base como se lee en la tarjeta.
 *
 * Quita el "base" del final. Dentro del catálogo "Sofrito base" distingue la
 * receta de la tanda del sofrito que hace un plato por su cuenta, pero en una
 * pestaña que ya se llama Tanda y en una tarjeta que ya pone BASE arriba, el
 * sufijo lo dice por tercera vez.
 *
 * Solo lo llevan tres ("Sofrito base", "Salsa de tomate base", "Bechamel
 * base"); las demás se leen tal cual.
 */
const nombreDeBase = (base) => String(base?.name ?? "").replace(/\s+base$/i, "");

function lookupDeTanda() {
  const m = new Map(Object.entries(RECIPES_BY_ID));
  for (const [id, r] of Object.entries(recipeCatalogById)) m.set(id, r);
  return m;
}

function DeckBatch({ days, data, menuPlan, visibleGroups, onDishTap }) {
  const comidas = getDayMeals(data);
  // Lo que hay en esta cocina cambia la tanda entera, no solo una etiqueta: la
  // bechamel son 25 minutos removiendo o 12 sin tocarla, y la legumbre 60 o 25.
  // Es justo donde el domingo se paga o no se paga.
  const utensilios = data?.kitchenTools;
  const sesion = useMemo(() => {
    const plan = {};
    for (const g of visibleGroups) if (menuPlan?.[g.id]) plan[g.id] = menuPlan[g.id];
    return sesionDeBases(plan, lookupDeTanda(), {
      dias: days, comidas,
      metodoDeBase: (b) => selectMethodForRecipe(b, utensilios ?? []),
    });
  }, [days, comidas, menuPlan, visibleGroups, utensilios]);

  // Las que el usuario PIDIÓ y esta semana no puede dar. Sin esto, marcar tres
  // bases y ver una sola tarjeta parece un fallo: no lo es — una tanda existe
  // porque DOS platos comparten la olla, y el menú que ya estaba generado no
  // sabía nada de lo que se ha pedido después— pero callarlo es peor que el
  // fallo, porque no hay forma de saber que hay que regenerar.
  const sinCubrir = useMemo(() => {
    const puestas = new Set(sesion.bases.map((b) => claveDeBase(b.base)));
    const pedidas = Object.keys(basesPedidas(data?.tanda)).filter((c) => !puestas.has(c));
    if (pedidas.length === 0) return [];

    // Cuántos platos de la semana llevan cada una. El número es la explicación:
    // cero y uno son situaciones distintas y la frase tiene que decir cuál es.
    const recetas = lookupDeTanda();
    const cuenta = Object.fromEntries(pedidas.map((c) => [c, 0]));
    for (const g of visibleGroups) {
      const slots = menuPlan?.[g.id];
      if (!slots) continue;
      for (const dia of days) {
        for (const comida of comidas) {
          const slot = slots[`${dia}-${comida}`];
          if (!slot) continue;
          for (const rid of [slot.firstRecipeId, slot.recipeId]) {
            if (!rid) continue;
            const receta = recetas.get(catalogIdOfPlanRecipe(rid));
            if (!receta) continue;
            for (const c of clavesDeReceta(receta)) {
              if (c in cuenta) cuenta[c] += 1;
            }
          }
        }
      }
    }
    return pedidas.map((c) => ({
      etiqueta: BASES_UI[c]?.etiqueta ?? c,
      platos: cuenta[c],
    }));
  }, [sesion, data?.sesgos, visibleGroups, menuPlan, days, comidas]);

  if (sesion.bases.length === 0) {
    return (
      <div style={{ padding: "28px 18px", textAlign: "center" }}>
        <div style={{
          width: 54, height: 54, borderRadius: 999, margin: "0 auto 12px",
          background: "#f2f0e9", display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <CookingPot size={26} color="#b2622f" strokeWidth={2} />
        </div>
        <div style={{ fontSize: 14, fontWeight: 800, color: "#142f1d", marginBottom: 4 }}>
          Esta semana no hay tanda
        </div>
        <div style={{ fontSize: 12.5, color: "#6b7d70", lineHeight: 1.45, maxWidth: 260, margin: "0 auto" }}>
          Ninguna base la comparten dos platos o más, así que cocinarla el domingo
          no te ahorraría nada.
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: "4px 14px 18px" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, margin: "2px 2px 12px" }}>
        {/* Solo el título. Los minutos totales de la sesión estaban de más: cada
            tarjeta ya lleva los suyos, y el domingo no se decide por un número
            agregado que nadie va a cocinar de una sentada. */}
        <span style={{ fontSize: 15, fontWeight: 900, color: "#142f1d", letterSpacing: "-.3px" }}>
          Deja esto hecho
        </span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {sesion.bases.map((b) => (
          <BatchBaseCard
            key={b.base.id}
            entrada={b}
            onDishTap={onDishTap}
            grupos={visibleGroups}
            members={data?.members ?? []}
          />
        ))}
      </div>

      {/* Lo pedido que esta semana no da para una tanda, con el motivo delante.
          Cero platos y un plato son cosas distintas: la primera es que el menú
          se generó antes de pedirlo, la segunda es que una tanda necesita DOS
          que compartan olla. Decir "no lo comparten dos platos" sin el número
          no explicaba ninguna de las dos. */}
      {sinCubrir.length > 0 && (
        <div style={{ margin: "16px 2px 0" }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: "#142f1d", marginBottom: 6 }}>
            Lo que pediste y no cabe
          </div>
          {sinCubrir.map((b) => (
            <div key={b.etiqueta} style={{ fontSize: 12, color: "#6b7d70", lineHeight: 1.5 }}>
              <strong style={{ color: "#3c5346" }}>{b.etiqueta}:</strong>{" "}
              {b.platos === 0
                ? "ningún plato del menú la lleva."
                : "solo la lleva un plato, y una tanda necesita dos que compartan olla."}
            </div>
          ))}
          <div style={{ fontSize: 12, color: "#6b7d70", lineHeight: 1.5, marginTop: 6 }}>
            El menú se generó antes de que lo pidieras. Regéneralo y entrarán.
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Una base de la sesión: la foto arriba como en el menú, y debajo a qué días
 * alimenta. Los días son la mitad que importa — sin ellos esto es una lista de
 * la compra, y con ellos es un plan.
 */
function BatchBaseCard({ entrada, onDishTap, grupos = [], members = [] }) {
  const { base, raciones, huecos, minutos, racionesNevera, racionesCongelador, diasEnNevera, metodo } = entrada;
  const [failed, setFailed] = useState(false);
  const [platosAbiertos, setPlatosAbiertos] = useState(false);
  // La base se pinta y se abre por el MISMO puente que un plato del menú. Sin
  // esto la ficha salía con el formato del catálogo: cantidades en blanco
  // (`amount` en vez de `qty`), la dificultad en minúscula y sin macros. Y las
  // raciones que se le pasan son las de la TANDA, no las de un plato, que es lo
  // que hace que la lista de ingredientes sea la de la olla del domingo.
  const receta = useMemo(() => catalogToFrontendRecipe(base, raciones), [base, raciones]);
  // Para quién es esta olla. Un hogar con varios menús —dieta, bebé, niños—
  // puede tener el mismo sofrito alimentando a dos, y saber a cuál sirve cambia
  // cuánto hay que cocinar.
  const gruposDeLaTanda = useMemo(() => {
    const ids = new Set(huecos.map((h) => h.groupId));
    return grupos.filter((g) => ids.has(g.id));
  }, [huecos, grupos]);
  const srcUrl = dishImageForRecipe(base);
  const optimized = deckImg(srcUrl, 760);
  const visual = visualForRecipe(base);
  const showPhoto = optimized && !failed;

  return (
    <div>
    <button
      type="button"
      onClick={() => onDishTap?.({
        recipe: receta,
        // `slot` NO es opcional aunque se abra en modo catálogo: la ficha lee
        // `slot.eaters` sin protección en varios sitios, así que abrirla sin él
        // revienta. El catálogo pasa uno fabricado por el mismo motivo, y aquí
        // los comensales son las raciones de la TANDA, que es lo que se cocina.
        slot: { eaters: raciones },
        browse: true,
        // Si la tarjeta cuenta 12 minutos de Thermomix, la ficha tiene que
        // abrirse en Thermomix. Abrirla en "Tradicional" y ensenar 25 hacia
        // que el numero de la tanda pareciera un error.
        initialAppliance: metodo?.appliance ?? null,
      })}
      style={{
        position: "relative", display: "block", width: "100%", height: 186,
        // El mismo radio que las fichas de Día y Semana: son la misma tarjeta
        // en la misma pantalla, y un borde menos redondeado se lee como otro
        // componente.
        border: "none", padding: 0, borderRadius: 22, overflow: "hidden",
        cursor: "pointer", fontFamily: "inherit", textAlign: "left",
        background: visual.surface,
        boxShadow: "0 6px 20px rgba(20,47,29,.14)",
      }}
    >
      {showPhoto ? (
        <img
          src={optimized}
          srcSet={deckSrcSet(srcUrl, 760)}
          sizes="760px"
          alt={base.name}
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
        />
      ) : (
        <div style={{ position: "absolute", inset: 0, background: visual.surface }} />
      )}
      <div style={{
        position: "absolute", inset: 0,
        background: "linear-gradient(to top, rgba(0,0,0,.74) 0%, rgba(0,0,0,.25) 42%, rgba(0,0,0,0) 66%)",
      }} />

      {/* CUÁNTAS VECES, no cuántas raciones. Las raciones son ambiguas — seis
          pueden ser dos platos para tres o tres platos para dos— y lo que se
          decide el domingo es cuántas cenas cubre esa olla. Va arriba a la
          izquierda, a la altura de la dificultad, que es donde el ojo ya busca
          los datos del plato. */}
      <div style={{
        position: "absolute", top: 12, left: 12,
        display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 6,
      }}>
        {/* Cuántas veces sale, y al tocarla, cuáles. `stopPropagation` porque va
            DENTRO del botón de la tarjeta: sin él, abrir la lista abría también
            la ficha de la base por debajo. */}
        <span
          role="button"
          tabIndex={0}
          onClick={(e) => { e.stopPropagation(); setPlatosAbiertos(true); }}
          onKeyDown={(e) => {
            if (e.key !== "Enter" && e.key !== " ") return;
            e.preventDefault(); e.stopPropagation(); setPlatosAbiertos(true);
          }}
          style={{
            display: "inline-flex", alignItems: "center", gap: 5,
            height: 26, padding: "0 10px", borderRadius: 999,
            background: "rgba(255,255,255,.94)", color: "#b2622f",
            fontSize: 12, fontWeight: 900, cursor: "pointer",
            boxShadow: "0 2px 8px rgba(9,18,12,.3)",
          }}
        >
          <BookOpen size={13} strokeWidth={2.6} />
          {huecos.length}x
        </span>
        <span style={{
          display: "inline-flex", alignItems: "center",
          height: 24, padding: "0 10px", borderRadius: 999,
          background: "rgba(255,255,255,.88)", color: "#3c5346",
          fontSize: 11.5, fontWeight: 800,
          boxShadow: "0 2px 8px rgba(9,18,12,.25)",
        }}>
          {raciones} raciones
        </span>
      </div>

      <div style={{
        position: "absolute", top: 12, right: 12,
        display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 7,
      }}>
        {gruposDeLaTanda.length > 0 && (
          <div style={{ display: "flex", gap: 4 }}>
            {gruposDeLaTanda.map((g) => (
              <GroupMenuBadge key={g.id} group={g} size={24} members={members} max={2} />
            ))}
          </div>
        )}
        <DishSpecPills difficulty={receta.difficulty} time={minutos} align="flex-end" />
        {/* Con que aparato esta contado. Sin decirlo, una legumbre que pasa de
            60 a 25 minutos porque la casa tiene olla rapida parece un fallo de
            la app y no la razon por la que merece la pena. */}
        {metodo && (
          <span style={{
            display: "inline-flex", alignItems: "center", gap: 5,
            height: 22, padding: "0 9px", borderRadius: 999,
            background: "rgba(255,255,255,.92)",
            color: APPLIANCE_COLORS[metodo.appliance] ?? "#3c5346",
            fontSize: 11, fontWeight: 800,
            boxShadow: "0 2px 8px rgba(9,18,12,.25)",
          }}>
            {(() => {
              const Icono = APPLIANCE_ICONS[metodo.appliance];
              return Icono ? <Icono size={12} strokeWidth={2.5} /> : null;
            })()}
            {APPLIANCE_LABELS[metodo.appliance] ?? metodo.appliance}
          </span>
        )}
      </div>

      <div style={{ position: "absolute", left: 14, right: 14, bottom: 13 }}>
        <div style={{
          color: "rgba(255,255,255,.95)", fontSize: 10.5, fontWeight: 800,
          letterSpacing: ".7px", textTransform: "uppercase",
          textShadow: "0 1px 6px rgba(0,0,0,.5)", marginBottom: 5,
        }}>
          Base
        </div>
        <div style={{
          color: "#fff", fontSize: 20, fontWeight: 900, lineHeight: 1.15,
          letterSpacing: "-.3px", textShadow: "0 2px 12px rgba(0,0,0,.45)",
        }}>
          {nombreDeBase(base)}
        </div>
      </div>
    </button>

    {/* DÓNDE VA CADA RACIÓN, debajo de la tarjeta y con sus iconos.
        Antes decía "6 raciones · 4 días en nevera · 2 al congelador" dentro de
        la foto, y ahí no se sabía si el 2 eran días o raciones. Ahora cada
        número va pegado a su icono, una línea por destino, y las dos cifras
        suman el total: cuánto meto en la nevera y cuánto congelo.

        No hay una tercera de "hoy" porque la tanda se cocina el día ANTES de
        que empiece la semana: nada de esta olla se come el mismo día. */}
    <div style={{
      display: "flex", flexDirection: "column", gap: 3,
      padding: "8px 4px 0", fontSize: 11.5, fontWeight: 700, color: "#3c5346",
    }}>
      {racionesNevera > 0 && (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <Refrigerator size={14} color="#2f6d8a" strokeWidth={2.4} />
          <span style={{ fontWeight: 600, color: "#6b7d70" }}>
            {racionesNevera === 1 ? "1 ración" : `${racionesNevera} raciones`}
            {diasEnNevera != null && (
              <>
                {" hasta "}
                <strong style={{ color: "#3c5346", fontWeight: 800 }}>
                  {diasEnNevera === 1 ? "mañana" : `${diasEnNevera} días`}
                </strong>
              </>
            )}
          </span>
        </span>
      )}
      {racionesCongelador > 0 && (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <Snowflake size={14} color="#3d6b93" strokeWidth={2.4} />
          <span style={{ fontWeight: 600, color: "#6b7d70" }}>
            {racionesCongelador === 1 ? "1 ración" : `${racionesCongelador} raciones`}
            {" "}
            <strong style={{ color: "#3c5346", fontWeight: 800 }}>al congelador</strong>
          </span>
        </span>
      )}
    </div>

    {platosAbiertos && (
      <WizardSheet
        icon={BookOpen}
        iconColor="#b2622f"
        title={nombreDeBase(base)}
        subtitle={huecos.length === 1 ? "El plato que la usa" : `Los ${huecos.length} platos que la usan`}
        onClose={() => setPlatosAbiertos(false)}
        maxWidth={360}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {huecos.map((h) => {
            const [dia, comida] = String(h.clave).split("-");
            const meta = MEAL_META[comida] ?? { label: comida, Icon: Utensils };
            const MealIcon = meta.Icon;
            // La miniatura del plato, la misma que en el menú: se reconoce
            // antes por la foto que por el nombre.
            const receta = RECIPES_BY_ID[catalogIdOfPlanRecipe(h.recipeId)]
              ?? recipeCatalogById[catalogIdOfPlanRecipe(h.recipeId)];
            const foto = receta ? deckImg(dishImageForRecipe(receta), 120) : null;
            return (
              <div
                key={`${h.groupId}-${h.clave}`}
                style={{
                  display: "flex", alignItems: "center", gap: 10,
                  padding: "8px 2px", borderBottom: "1px solid #eef3f0",
                }}
              >
                <span style={{
                  width: 42, height: 42, borderRadius: 11, flexShrink: 0, overflow: "hidden",
                  background: "#f2f0e9", display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  {foto
                    ? <img src={foto} alt="" loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    : <UtensilsCrossed size={16} color="#bcc9c4" strokeWidth={1.8} />}
                </span>
                <div style={{ minWidth: 0, flex: 1 }}>
                  {/* El día y el icono de la comida. El "SÁB · CENA" de antes
                      repetía en texto lo que el icono ya dice. */}
                  <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 1 }}>
                    <span style={{ fontSize: 10.5, fontWeight: 900, color: "#7a9485", letterSpacing: ".4px", textTransform: "uppercase" }}>
                      {dayLabel(dia)}
                    </span>
                    <MealIcon size={13} color="#b2622f" strokeWidth={2.3} />
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#142f1d", lineHeight: 1.3 }}>
                    {h.nombre}
                  </div>
                </div>
                {/* De dónde sale ese día: de la nevera o del congelador. Es el
                    dato que convierte la lista en un plan. */}
                {h.desde === "congelador"
                  ? <Snowflake size={15} color="#3d6b93" strokeWidth={2.4} />
                  : <Refrigerator size={15} color="#2f6d8a" strokeWidth={2.4} />}
              </div>
            );
          })}
        </div>
      </WizardSheet>
    )}
    </div>
  );
}

function DeckMonth({ menuWeeks, data, visibleGroups, onPickDay }) {
  const cells = useMemo(
    () => monthCellsFromWeeks(menuWeeks, data, visibleGroups),
    [menuWeeks, data, visibleGroups],
  );

  // Los meses que el menú toca de verdad. Navegar fuera de ellos sería pasear
  // por meses vacíos: el menú no llega ahí y nunca va a llegar.
  const months = useMemo(() => {
    const counts = new Map();
    for (const iso of cells.keys()) {
      const key = iso.slice(0, 7);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return { keys: [...counts.keys()].sort(), counts };
  }, [cells]);

  // Por cuál se abre. Una semana a caballo de dos meses (31 de agosto → 6 de
  // septiembre) toca DOS, y abrir por el primero enseñaba agosto con un solo
  // día y el resto del mes vacío — parecía que no había menú. Manda el mes de
  // hoy si el menú pasa por él, y si no, aquel donde hay más menú que ver.
  const defaultMonthIdx = useMemo(() => {
    if (months.keys.length === 0) return 0;
    const todayKey = isoLocalDate(new Date()).slice(0, 7);
    const todayAt = months.keys.indexOf(todayKey);
    if (todayAt >= 0) return todayAt;
    let best = 0;
    for (let i = 1; i < months.keys.length; i++) {
      if ((months.counts.get(months.keys[i]) ?? 0) > (months.counts.get(months.keys[best]) ?? 0)) best = i;
    }
    return best;
  }, [months]);

  const [monthIdx, setMonthIdx] = useState(null);
  const idx = Math.min(monthIdx ?? defaultMonthIdx, Math.max(0, months.keys.length - 1));
  const monthKey = months.keys[idx];

  if (!monthKey) {
    return (
      <div style={{ padding: "40px 20px", textAlign: "center" }}>
        <LayoutGrid size={32} color="#cdd8d0" strokeWidth={2} />
        <p style={{ margin: "10px 0 0", fontSize: 13, fontWeight: 700, color: "#9ab0a1" }}>
          Aún no hay menú que poner en el calendario
        </p>
      </div>
    );
  }

  const [year, month] = monthKey.split("-").map(Number);
  const first = new Date(year, month - 1, 1);
  const last = new Date(year, month, 0);
  const gridStart = mondayOf(first);
  const gridEnd = mondayOf(last);
  gridEnd.setDate(gridEnd.getDate() + 6);

  const grid = [];
  for (const d = new Date(gridStart); d <= gridEnd; d.setDate(d.getDate() + 1)) {
    grid.push(new Date(d));
  }

  const todayIso = isoLocalDate(new Date());
  const covered = [...cells.keys()].filter((iso) => iso.startsWith(monthKey)).length;

  return (
    <div style={{ paddingBottom: 8 }}>
      <div style={monthHead}>
        <button
          type="button"
          className="mp-press"
          onClick={() => setMonthIdx(Math.max(0, idx - 1))}
          disabled={idx <= 0}
          aria-label="Mes anterior"
          style={weekNavArrowStyle(idx <= 0)}
        >
          <ChevronLeft size={16} />
        </button>
        <span style={{ flex: 1, textAlign: "center" }}>
          <span style={{ display: "block", fontSize: 15, fontWeight: 900, color: "#142f1d", letterSpacing: "-.2px" }}>
            {MONTH_NAMES[month - 1]} {year}
          </span>
          <span style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#8aa294", marginTop: 1 }}>
            {covered} {covered === 1 ? "día con menú" : "días con menú"}
          </span>
        </span>
        <button
          type="button"
          className="mp-press"
          onClick={() => setMonthIdx(Math.min(months.keys.length - 1, idx + 1))}
          disabled={idx >= months.keys.length - 1}
          aria-label="Mes siguiente"
          style={weekNavArrowStyle(idx >= months.keys.length - 1)}
        >
          <ChevronRight size={16} />
        </button>
      </div>

      <div style={monthGrid}>
        {MONTH_COLS.map((c) => (
          <span key={c} style={monthColHead}>{c}</span>
        ))}
        {grid.map((date) => {
          const iso = isoLocalDate(date);
          const outside = date.getMonth() !== month - 1;
          const cell = cells.get(iso);
          const isToday = iso === todayIso;
          const label = `${date.getDate()} de ${MONTH_NAMES[date.getMonth()]}`;
          return (
            <button
              key={iso}
              type="button"
              className={cell ? "mp-press" : undefined}
              disabled={!cell}
              onClick={cell ? () => onPickDay?.(cell.weekStart, cell.day) : undefined}
              aria-label={cell ? `${label}: ${cell.tokens.length} platos` : label}
              style={{
                ...monthCell,
                // El día sin menú no se esconde: se apaga. Es la mitad de la
                // respuesta a "dónde caben los platos".
                background: cell ? "#fff" : "transparent",
                border: cell ? "1px solid #e3ece6" : "1px solid transparent",
                boxShadow: cell ? "0 1px 3px rgba(20,47,29,.05)" : "none",
                opacity: outside ? 0.35 : 1,
                cursor: cell ? "pointer" : "default",
                ...(isToday ? { borderColor: "#2d5a3d", boxShadow: "0 0 0 1.5px #2d5a3d" } : null),
              }}
            >
              <span style={{
                fontSize: 12, fontWeight: isToday ? 900 : 800,
                color: cell ? "#142f1d" : "#b6c7bd",
                fontVariantNumeric: "tabular-nums", lineHeight: 1,
              }}>
                {date.getDate()}
              </span>
              <span style={monthDots}>
                {(cell?.tokens ?? []).slice(0, 4).map((t, i) => (
                  <span
                    key={i}
                    title={categoryLabel(t.cat)}
                    style={{
                      width: 6, height: 6, borderRadius: 999, flexShrink: 0,
                      background: t.cat ? categoryColor(t.cat) : "#9ab0a1",
                    }}
                  />
                ))}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

const monthHead = {
  display: "flex", alignItems: "center", gap: 8, marginBottom: 12,
};

const monthGrid = {
  display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4,
};

const monthColHead = {
  textAlign: "center", fontSize: 9.5, fontWeight: 800, color: "#9ab0a1",
  textTransform: "uppercase", letterSpacing: ".4px", paddingBottom: 4,
};

const monthCell = {
  display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
  minHeight: 52, padding: "7px 2px 6px", borderRadius: 12,
  fontFamily: "inherit", boxSizing: "border-box",
};

// Dos filas de dos puntos como mucho: en 48 px de ancho, cuatro seguidos se
// tocan y dejan de leerse como platos distintos.
const monthDots = {
  display: "flex", flexWrap: "wrap", justifyContent: "center",
  alignItems: "center", gap: 3, maxWidth: 30,
};

function MenuDeck({ deckView, days, weekDates, data, menuPlan, visibleGroups, members, dishAvailability, multiGroup, scope, selectedDay, setSelectedDay, onDishTap, onDishLongPress, onRegenerateDay, regenGroups = [], menuWeeks = null, onPickMonthDay, invitadosPorHueco = null, denso = false, onAddSlot = null, onRemoveSlot = null, onFillSlot = null, onDishActions = null }) {
  // When several menús coexist (dieta/bebés/niños…) and no single one is picked,
  // each tile shows a colored group badge so you can tell whose dish it is.
  const showGroup = multiGroup && scope === "all";
  const comidasDeLaSemana = getDayMeals(data);
  const clavesTanda = useMemo(() => {
    // Solo si hay tandas PEDIDAS. El icono salía para todo el mundo, porque se
    // calculaba de los platos de la semana (dos que comparten olla) sin mirar
    // si alguien había pedido batch cooking. A quien no lo pidió le aparecían
    // tandas que no existen — y marcar el modo sin pedir nada es exactamente el
    // mismo caso: no hay olla que enseñar.
    if (!hayTandasPedidas(data)) return new Set();
    const plan = {};
    for (const g of visibleGroups) if (menuPlan?.[g.id]) plan[g.id] = menuPlan[g.id];
    const s = sesionDeBases(plan, lookupDeTanda(), { dias: days, comidas: comidasDeLaSemana });
    return new Set(s.bases.map((b) => claveDeBase(b.base)).filter(Boolean));
  }, [days, comidasDeLaSemana, menuPlan, visibleGroups, data]);
  return (
    <TandaContext.Provider value={clavesTanda}>
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
          invitadosPorHueco={invitadosPorHueco}
          onAddSlot={onAddSlot}
          onRemoveSlot={onRemoveSlot}
          onFillSlot={onFillSlot}
          onDishActions={onDishActions}
        />
      )}
      {deckView === "semana" && (
        <DeckWeek days={days} weekDates={weekDates} data={data} menuPlan={menuPlan} visibleGroups={visibleGroups} onDishTap={onDishTap} onDishLongPress={onDishLongPress} onRegenerateDay={onRegenerateDay} regenGroups={regenGroups} showGroup={showGroup} invitadosPorHueco={invitadosPorHueco} denso={denso} onAddSlot={onAddSlot} onRemoveSlot={onRemoveSlot} onFillSlot={onFillSlot} onDishActions={onDishActions} />
      )}
      {deckView === "mes" && (
        <DeckMonth
          menuWeeks={menuWeeks}
          data={data}
          visibleGroups={visibleGroups}
          onPickDay={onPickMonthDay}
        />
      )}
      {deckView === "tanda" && (
        <DeckBatch
          days={days}
          data={data}
          menuPlan={menuPlan}
          visibleGroups={visibleGroups}
          onDishTap={onDishTap}
        />
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
    </TandaContext.Provider>
  );
}

/**
 * Deck view selector — a pill showing the active view that unfolds an animated
 * menu (Día / Semana / Mes + week switcher + Vista clásica).
 */
/** Circular icon for the view picker. Each view has its own accent colour;
 *  active state fills the disc, inactive shows the tinted ring + icon. */
function ViewCircle({ Icon, active, color = "#2d5a3d", size = 36 }) {
  return (
    <span
      style={{
        display: "inline-flex",
        borderRadius: 999,
        padding: 3,
        background: "rgba(255,255,255,.5)",
        boxShadow: active ? `0 0 0 2px ${color}` : "0 0 0 1px rgba(45,90,61,.12)",
        transition: "box-shadow .15s ease",
      }}
    >
      <span
        style={{
          width: size,
          height: size,
          borderRadius: 999,
          background: active ? color : `${color}18`,
          color: active ? "#fff" : color,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          transition: "background .15s ease, color .15s ease",
        }}
      >
        <Icon size={Math.round(size * 0.44)} strokeWidth={2.4} />
      </span>
    </span>
  );
}

/** Menu view picker — circular chip that opens a modal with the view options. */
/**
 * El selector de vista de la pizarra: un botón, no un menú.
 *
 * Con dos vistas, abrir una hoja modal para elegir entre dos es pedir tres
 * gestos (tocar, leer, elegir) para algo que es un interruptor. Aquí el toque
 * ya cambia, el chevron sobra —no despliega nada— y la etiqueta baja debajo
 * del icono, que es donde cabe sin ensanchar la fila.
 */
function DeckToggleVista({ value, onChange, options }) {
  const i = Math.max(0, options.findIndex((o) => o.id === value));
  const activa = options[i] ?? options[0];
  const siguiente = options[(i + 1) % options.length];
  const Icon = DECK_VIEW_ICON[activa?.id] ?? CalendarDays;
  const color = DECK_VIEW_COLOR[activa?.id] ?? "#2d5a3d";

  return (
    <button
      type="button"
      className="deck-press"
      onClick={() => onChange(siguiente.id)}
      aria-label={`Vista: ${activa?.label}. Tocar para ver ${siguiente?.label}`}
      title={`Ver ${siguiente?.label}`}
      style={{
        border: "none", background: "transparent", padding: 0, cursor: "pointer",
        fontFamily: "inherit", flexShrink: 0,
        display: "inline-flex", flexDirection: "column", alignItems: "center", gap: 3,
      }}
    >
      {/* Círculo, y de 42 como el avatar de la derecha: son los dos
          extremos de la misma fila y con tamaños distintos la fila se veía
          descuadrada. El copy va debajo, como en el avatar. */}
      <span
        style={{
          width: 42, height: 42, borderRadius: 999,
          background: `${color}14`, border: `2px solid ${color}55`,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}
      >
        <Icon size={19} color={color} strokeWidth={2.4} />
      </span>
      <span style={{ fontSize: 10, fontWeight: 800, color, letterSpacing: "-.1px", lineHeight: 1 }}>
        {activa?.label}
      </span>
    </button>
  );
}

function DeckNav({ value, onChange, options }) {
  const [open, setOpen] = useState(false);
  const active = options.find((o) => o.id === value) ?? options[0];
  const ActiveIcon  = DECK_VIEW_ICON[active?.id]  ?? CalendarDays;
  const activeColor = DECK_VIEW_COLOR[active?.id] ?? "#2d5a3d";

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
          border: "none", background: "transparent", padding: 0,
          cursor: "pointer", fontFamily: "inherit", flexShrink: 0,
          display: "inline-flex", alignItems: "center", gap: 7,
        }}
      >
        <ViewCircle Icon={ActiveIcon} active color={activeColor} />
        <span style={{ fontSize: 13.5, fontWeight: 800, color: activeColor, whiteSpace: "nowrap", letterSpacing: "-.2px" }}>
          {active?.label}
        </span>
        <ChevronDown size={15} strokeWidth={2.8} color="#9db3a6" style={{ marginLeft: -2 }} />
      </button>

      {open && (
        <div
          onClick={() => setOpen(false)}
          style={{
            position: "fixed", inset: 0, zIndex: 1000,
            background: "rgba(15,30,20,.34)",
            backdropFilter: "blur(2px)", WebkitBackdropFilter: "blur(2px)",
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: 20, animation: "deckFadeIn .18s ease both",
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 320, maxWidth: "calc(100vw - 40px)",
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
                    onClick={() => { onChange(o.id); setOpen(false); }}
                    style={{
                      display: "flex", flexDirection: "column", alignItems: "center", gap: 8,
                      border: "none", background: "transparent", cursor: "pointer",
                      fontFamily: "inherit", padding: 0, minWidth: 62,
                    }}
                  >
                    <ViewCircle Icon={Icon} active={isActive} color={DECK_VIEW_COLOR[o.id] ?? "#2d5a3d"} size={48} />
                    <span style={{ fontSize: 12.5, fontWeight: 800, color: isActive ? "#2d5a3d" : "#5f7568", maxWidth: 76, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
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

/** Mini "N de X" week stepper shown next to DeckNav when there are multiple weeks. */
function DeckWeekStepper({ weekIdx, weekTotal, onPrev, onNext, onOpen, style }) {
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
    <div style={{ display: "inline-flex", alignItems: "center", background: "#eef4ef", borderRadius: 999, padding: "3px 6px 3px 4px", gap: 1, ...style }}>
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
function DeckFilter({ groups, scope, onScopeChange, members, interactivo = true, ciclar = false }) {
  const [open, setOpen] = useState(false);

  const scopeOptions = [{ id: "all", label: "Todos", group: null }, ...groups.map((g) => ({ id: g.id, label: g.label, group: g }))];
  const activeOpt = scopeOptions.find((o) => o.id === scope) ?? scopeOptions[0];

  return (
    <>
      {/* Con un solo menú las caras se ven igual, pero no abren nada: es un
          recordatorio de para quién cocinas, y un filtro de una sola opción
          sería un botón que no hace nada. */}
      {interactivo ? (
        <button
          type="button"
          className="deck-press"
          data-coach="menu-filters"
          // En la pizarra el toque pasa al siguiente menú (Todos → Adultos →
          // Niños → …) en vez de abrir la hoja: con dos o tres opciones, un
          // modal para elegir entre ellas cuesta más que recorrerlas. La hoja
          // sigue estando en el menú generado, donde además filtra.
          onClick={() => {
            if (!ciclar) { setOpen(true); return; }
            const i = scopeOptions.findIndex((o) => o.id === (scope ?? "all"));
            onScopeChange(scopeOptions[(i + 1) % scopeOptions.length].id);
          }}
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
      ) : (
        <span style={{ flexShrink: 0, display: "inline-flex" }} title={activeOpt.label}>
          <ScopeCircle opt={activeOpt} active size={42} members={members} />
        </span>
      )}

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

// Radial ("rosco") action menu: chips laid out around the spotlighted dish
// thumbnail, spread on a full circle with a thin ring connector; callers can
// instead pass an explicit `angle` (degrees, -90 = top) per action to drop the
// ring and land chips at fixed spots. Only used by the value-props demo
// carousel now (see ValueProps.jsx) — the real in-app dish menu uses
// DishActionBar (a plain horizontal row) instead (2026-08-28).
//
// Per-action extras: `content` renders a custom node inside the chip instead of
// an `Icon` (e.g. a group letter badge); `active` fills the chip in its color to
// show a toggled/selected state. `center` renders a node at the middle of the
// ring (e.g. a confirm button for the multi-select scope picker).
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

// Acciones rápidas de un plato: fila horizontal (icono + copy debajo), sin
// radial y sin sub-menús — cada botón ejecuta directamente al tocarlo.
// Sustituye al RoscoMenu de "Regenerar/Mover/Duplicar/Quitar" (2026-08-28).
/**
 * Cuántos comensales de más tiene este plato. Un contador, no un campo de
 * texto: el número realista es 1, 2 o 3, y sacar el teclado numérico del móvil
 * para eso es un peaje. El campo sigue ahí para quien monte una mesa de doce.
 *
 * EDITA el total, no suma: arranca en los que ya hay y baja hasta cero, así
 * que quitar invitados es el mismo gesto que ponerlos. Por eso el botón dice
 * "Guardar" y no "Añadir" cuando ya había alguno.
 */
function GuestCountSheet({ inicial = 0, onConfirm, onClose }) {
  const [n, setN] = useState(Math.max(0, inicial));
  const paso = (d) => setN((v) => Math.max(0, Math.min(20, v + d)));
  const redondo = {
    width: 44, height: 44, borderRadius: 999, border: "1.5px solid #dbe7de",
    background: "#fff", color: "#2d5a3d", fontSize: 22, fontWeight: 800,
    display: "grid", placeItems: "center", cursor: "pointer",
    transition: "transform .15s ease",
  };
  return createPortal(
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 1250,
        background: "rgba(9,18,12,.8)",
        display: "grid", placeItems: "center", padding: 20,
        animation: "deckFadeIn .16s ease both",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#fff", borderRadius: 22, padding: "22px 20px 18px",
          width: "100%", maxWidth: 300, textAlign: "center",
          boxShadow: "0 18px 48px rgba(9,18,12,.28)",
        }}
      >
        <div style={{ fontSize: 15, fontWeight: 800, color: "#1f3326" }}>
          {inicial > 0 ? "Comensales de más" : "¿Cuántos más?"}
        </div>
        <div style={{ fontSize: 12.5, color: "#6b7d70", marginTop: 4, lineHeight: 1.35 }}>
          {n === 0 ? "Sin invitados en este plato" : "Se suman solo a este plato"}
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 16, margin: "18px 0 20px" }}>
          <button type="button" aria-label="Uno menos" onClick={() => paso(-1)} disabled={n <= 0}
            style={{ ...redondo, opacity: n <= 0 ? 0.4 : 1 }}>−</button>
          <input
            type="number" inputMode="numeric" min={0} max={20} value={n}
            aria-label="Comensales de más"
            onChange={(e) => setN(Math.max(0, Math.min(20, Math.round(Number(e.target.value) || 0))))}
            style={{
              width: 68, textAlign: "center", fontSize: 30, fontWeight: 900,
              color: "#2d5a3d", border: "none", outline: "none",
              fontVariantNumeric: "tabular-nums", background: "transparent",
            }}
          />
          <button type="button" aria-label="Uno más" onClick={() => paso(1)} disabled={n >= 20}
            style={{ ...redondo, opacity: n >= 20 ? 0.4 : 1 }}>+</button>
        </div>
        <button
          type="button"
          onClick={() => { onConfirm(n); onClose(); }}
          style={{
            width: "100%", padding: "13px 0", borderRadius: 999, border: "none",
            background: "#2d5a3d", color: "#fff", fontSize: 14.5, fontWeight: 800,
            cursor: "pointer",
          }}
        >
          {inicial > 0 ? "Guardar" : "Añadir"}
        </button>
      </div>
    </div>,
    document.body,
  );
}

function DishActionBar({ anchor, actions, onClose }) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const tile = anchor?.tile;
  const BTN = 62;
  const GAP = 8;
  const PAD = 12;
  // Dos filas en vez de una: con 5 acciones, una sola fila se sale de un móvil
  // estrecho. Se reparten 3+2 (cinco) o 2+2 (cuatro, cuando la comida no admite
  // cambio de estructura). Nunca se deja un hueco suelto en la fila de abajo:
  // preferimos que los botones bailen de sitio a que se vea un agujero.
  //
  // Hasta TRES caben en una sola fila y van en horizontal: 3×62 + 2×8 + 24 de
  // padding son 226 px, que entran de sobra en el móvil más estrecho. La
  // fórmula de antes (`ceil(n/2)`) partía también los casos pequeños, así que
  // el submenú de "Cambiar" —dos acciones— salía una debajo de otra, en
  // vertical, sin necesidad ninguna.
  const topCount = actions.length <= 3 ? actions.length : actions.length >= 5 ? 3 : 2;
  const rows = [actions.slice(0, topCount), actions.slice(topCount)].filter((r) => r.length > 0);
  const widest = Math.max(...rows.map((r) => r.length));
  const barW = widest * BTN + (widest - 1) * GAP + PAD * 2;
  const cx = tile ? tile.left + tile.width / 2 : vw / 2;
  const halfW = barW / 2 + 10;
  const left = Math.min(Math.max(cx, halfW), vw - halfW);
  // Prefers sitting just below the tile; flips above it when there isn't
  // room (near the bottom of the viewport).
  const fitsBelow = !tile || tile.top + tile.height + 92 <= vh;
  const anchorFromBottom = Boolean(tile) && !fitsBelow;
  const top = !tile ? vh / 2 : anchorFromBottom ? tile.top - 14 : tile.top + tile.height + 14;

  return createPortal(
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 1200,
        background: "rgba(9,18,12,.8)",
        animation: "deckFadeIn .16s ease both",
      }}
    >
      <style>{`
        @keyframes deckFadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes actionBarPop { from { opacity: 0; transform: scale(.9); } to { opacity: 1; transform: scale(1); } }
        @media (prefers-reduced-motion: reduce) {
          .dish-action-bar, .dish-action-bar * { animation-duration: .001s !important; }
        }
      `}</style>

      {tile && (
        <div
          style={{
            position: "fixed",
            top: tile.top, left: tile.left, width: tile.width, height: tile.height,
            boxSizing: "border-box",
            borderRadius: anchor.radius,
            border: "2px solid rgba(255,255,255,.55)",
            pointerEvents: "none",
            zIndex: 1201,
            animation: "deckFadeIn .16s ease both",
          }}
        />
      )}

      <div
        style={{
          position: "fixed",
          top,
          left,
          // Static positioning transform (incl. the above/below flip) lives on
          // this wrapper; the pop-in animation below only scales/fades, so the
          // two never fight over the `transform` property.
          transform: !tile ? "translate(-50%, -50%)" : anchorFromBottom ? "translate(-50%, -100%)" : "translate(-50%, 0)",
          zIndex: 1203,
        }}
      >
        <div
          className="dish-action-bar"
          onClick={(e) => e.stopPropagation()}
          style={{
            display: "flex",
            flexDirection: "column",
            gap: GAP,
            padding: PAD,
            borderRadius: 20,
            background: "rgba(250,252,251,.98)",
            boxShadow: "0 14px 34px rgba(9,18,12,.42)",
            animation: "actionBarPop .22s cubic-bezier(.34,1.4,.64,1) both",
          }}
        >
          {rows.map((row, ri) => (
            <div key={ri} style={{ display: "flex", gap: GAP, justifyContent: "center" }}>
          {row.map((act) => (
            <button
              key={act.id}
              type="button"
              aria-label={act.label}
              onClick={() => act.onPick()}
              style={{
                display: "flex", flexDirection: "column", alignItems: "center", gap: 5,
                width: BTN, padding: "8px 2px", border: "none", background: "none",
                cursor: "pointer", fontFamily: "inherit", borderRadius: 12,
              }}
            >
              <span
                style={{
                  width: 38, height: 38, borderRadius: "50%",
                  display: "grid", placeItems: "center",
                  background: act.tint ?? "#eef5f0",
                }}
              >
                <act.Icon size={18} strokeWidth={2.3} color={act.color ?? "#2d5a3d"} />
              </span>
              <span style={{ fontSize: 11, fontWeight: 800, color: "#142f1d", textAlign: "center", lineHeight: 1.15 }}>
                {act.label}
              </span>
            </button>
          ))}
            </div>
          ))}
        </div>
      </div>
    </div>,
    document.body,
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
  onDishDuplicate,
  onDishClear,
  // Ausente = el control no se pinta (menus de solo lectura).
  onSetGuests,
  // Invitados por hueco, clave `"<grupoId>|<dia>|<comida>"`. Sale de las
  // reglas (lib/reglas.js#invitadosPorHueco), no de un campo en el plan.
  invitadosPorHueco = null,
  onSlotStructure,
  incomingDish = null,
  onDishPlace,
  onIncomingCancel,
  onDishManualPick,
  onNav,
  onRegenerate,
  onRegenerateDay,
  onRetry,
  onToast,
  onTrackEvent,
  user = null,
  activeMenu = null,
  activeFavorite = false,
  onToggleFavorite,
  onActivateMenu = null,
  onDeactivateMenu = null,
  onSwitchWeek,
  onOpenMenus,
  onOpenAnalytics,
  onDeleteActive,
  // Demo-only (value-props carousel): seed the deck view ("semana"/"dia"/"lista")
  // and auto-play the quick-actions rosco so the tutorial can show off the
  // week view + acciones rápidas without a real user gesture.
  initialDeckView = null,
  autoDemo = null,
  // Live shopping list (active week) + jump-to-cook-mode callback, so each
  // dish can show a "faltan ingredientes" dot instead of making you go check
  // Compra yourself.
  shoppingItems = null,
  readOnly = false,
  readOnlyLabel = null,
  // Publicar el menu en Gente (distinto del "Compartir" nativo de abajo,
  // que manda texto por WhatsApp/portapapeles y no publica nada en la app).
  onPublishToFeed = null,
  onUnpublishFromFeed = null,
  menuSharedInFeed = false,
  // ── Wizard generativo (experimento local) ────────────────────────────────
  // Dos nodos opcionales que el menú se limita a colocar: la fila de mandos
  // bajo la cabecera y la burbuja flotante del bot. Van como props y no
  // importados aquí para que esta pantalla NO dependa del wizard: con ambos a
  // null —que es como los recibe todo lo demás— el menú se comporta
  // exactamente igual que antes de que esto existiera.
  wizardControls = null,
  wizardBubble = null,
  // Este menú se monta a mano. Cambia tres cosas, y las tres por el mismo
  // motivo —aquí no decide un motor, decides tú—: solo Día y Semana (las dos
  // vistas que saben pintar un hueco vacío; en Mes o Tanda un menú sin platos
  // se vería en blanco y sin nada que tocar), la semana en denso para que
  // quepa de un vistazo, y sin la fila de mandos ni la burbuja del asistente,
  // que App ya no pasa.
  modoPizarra = false,
  // Abre el menú de "añadir hueco" para ese día. Solo la pizarra lo pasa: en
  // un menú generado los huecos los pone el motor desde el horario de la casa.
  onAddSlot = null,
  // Cierra un hueco vacío. Igual que `onAddSlot`: solo la pizarra lo pasa.
  onRemoveSlot = null,
  // Rellena huecos vacíos sin pasar por el modelo. Recibe un ámbito:
  // `{groupId, day, meal, course}` para uno, o nada para todo lo que quede.
  onFillSlots = null,
  // Soltar un plato encima de otro hueco del tablero: mueve, o intercambia si
  // el destino ya tenía algo. Solo la pizarra lo pasa.
  onSlotDrag = null,
  // La fila de mandos de la pizarra (días, balance, rellenar). Va en el mismo
  // sitio que la del asistente y por el mismo motivo: se lee como "esto de
  // aquí arriba controla lo de abajo".
  pizarraControles = null,
}) {
  const deckViews = modoPizarra ? DECK_VIEWS_BASICAS : DECK_VIEW_OPTIONS;
  const [scope, setScope] = useState("all");
  const [profileOpen, setProfileOpen] = useState(false);
  const [pdfExportOpen, setPdfExportOpen] = useState(false);
  const [showIconCoach, setShowIconCoach] = useState(false);
  // Menu flexibility: long-press a dish → spotlight it + a horizontal action
  // bar anchored under it (Cambiar/Mover/Duplicar). "Mover" and "Duplicar" arm
  // a two-tap mode (`armed`), where the next dish/hueco tapped is the target;
  // "Cambiar" executes on the spot, no extra step.
  const [dishAction, setDishAction] = useState(null);
  // Segundo nivel de "Cambiar". No es una barra nueva: es la MISMA
  // `DishActionBar`, con el mismo ancla y los mismos estilos, a la que se le
  // pasa otra lista de acciones. Así el submenú no puede desentonar con el
  // menú del que sale, porque es él.
  const [cambiarSub, setCambiarSub] = useState(false);
  const cerrarAcciones = useCallback(() => { setDishAction(null); setCambiarSub(false); }, []);
  const [armed, setArmed] = useState(null); // null | { mode: "swap" | "duplicate" | "incoming", source }

  // Un plato copiado del menu de otra persona llega ya armado: has cruzado de
  // pantalla justamente para colocarlo, asi que pedirte un toque mas para
  // "activarlo" seria hacerte repetir la intencion que ya expresaste.
  useEffect(() => {
    if (incomingDish?.recipeId) setArmed({ mode: "incoming", dish: incomingDish });
  }, [incomingDish]);

  const handleTileTap = useCallback(
    (sel) => {
      if (readOnly && sel.empty) return;
      if (armed) {
        // Tapping the same dish cancels the armed action.
        if (sameDish(armed.source, sel)) {
          setArmed(null);
          return;
        }
        if (armed.mode === "swap") onDishSwap?.(armed.source, sel);
        else if (armed.mode === "duplicate") onDishDuplicate?.(armed.source, sel);
        else if (armed.mode === "incoming") onDishPlace?.(armed.dish.recipeId, sel);
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
    [armed, onDishSwap, onDishDuplicate, onDishPlace, onDishManualPick, onDishTap, readOnly],
  );

  // El hueco al que se le estan añadiendo comensales, o null. Vive aparte de
  // `dishAction` porque la barra se cierra al elegir: el contador es el paso
  // siguiente, no otra barra.
  const [guestFor, setGuestFor] = useState(null);

  // ── Arrastrar un hueco (solo pizarra) ───────────────────────────────────
  //
  // El gesto es el long-press que ya existía, y esa es media solución: como
  // `useLongPress` cancela en cuanto el dedo se mueve 12px, el scroll de la
  // fila gana siempre mientras no te hayas parado a propósito. Cuando el
  // temporizador salta, el plato "se levanta" y a partir de ahí mandan los
  // listeners de window, no los del tile — el dedo se va a salir de él.
  //
  // El destino se busca con `elementFromPoint` y los `data-slot` de las
  // baldosas, en vez de midiendo rectángulos: así funciona igual en Día y en
  // Semana, con scroll horizontal por medio y sin que esta pantalla tenga que
  // saber cómo está maquetada cada vista.
  const [arrastre, setArrastre] = useState(null);
  const arrastreRef = useRef(null);
  useEffect(() => { arrastreRef.current = arrastre; }, [arrastre]);

  const iniciarArrastre = useCallback((sel) => {
    // La etiqueta nace en el centro de la baldosa que acabas de levantar, no
    // en (0,0): es la única señal de que el plato está cogido, y si empieza
    // invisible en una esquina el gesto parece que no ha hecho nada.
    const t = sel?.anchor?.tile;
    setArrastre({
      source: sel,
      sobre: null,
      x: t ? t.left + t.width / 2 : 0,
      y: t ? t.top + t.height / 2 : 0,
    });
  }, []);

  useEffect(() => {
    if (!arrastre) return undefined;

    const destinoEn = (x, y) => {
      const el = document.elementFromPoint(x, y)?.closest?.("[data-slot]");
      if (!el) return null;
      const bruto = el.getAttribute("data-slot") ?? "";
      const corte = bruto.indexOf("-");
      const groupId = el.getAttribute("data-group");
      if (corte < 0 || !groupId) return null;
      return {
        groupId,
        day: bruto.slice(0, corte),
        meal: bruto.slice(corte + 1),
        course: el.getAttribute("data-course") === "first" ? "first" : "main",
      };
    };

    const mover = (e) => {
      const d = destinoEn(e.clientX, e.clientY);
      const src = arrastreRef.current?.source;
      const valido = d && src && !(d.groupId === src.groupId && d.day === src.day && d.meal === src.meal && d.course === src.course);
      setArrastre((a) => (a ? { ...a, sobre: valido ? d : null, x: e.clientX, y: e.clientY } : a));
    };
    const soltar = () => {
      const a = arrastreRef.current;
      setArrastre(null);
      if (a?.sobre) onSlotDrag?.(a.source, a.sobre);
    };

    // ── Que el navegador no se lleve el gesto ───────────────────────────
    // Esto es lo que hacía que arrastrar no funcionara en el móvil. Tocar
    // `touch-action` aquí no sirve: el navegador decide si un toque es scroll
    // AL EMPEZAR el toque, y para cuando el plato se levanta —420ms después—
    // esa decisión ya está tomada. En cuanto el dedo se movía, la fila
    // scrolleaba, el navegador se quedaba el puntero y mandaba `pointercancel`,
    // que aquí significa "suelta": el arrastre moría antes de empezar.
    //
    // Lo que sí llega a tiempo es cancelar cada `touchmove`. Se puede porque
    // el dedo TODAVÍA no se ha movido (`useLongPress` cancela la pulsación
    // larga a los 12px), así que no hay scroll en marcha que interrumpir. Y
    // tiene que ser `passive: false` o el navegador ignora el preventDefault.
    const bloquearScroll = (e) => e.preventDefault();
    window.addEventListener("touchmove", bloquearScroll, { passive: false });
    window.addEventListener("pointermove", mover, { passive: true });
    window.addEventListener("pointerup", soltar);
    window.addEventListener("pointercancel", soltar);
    return () => {
      window.removeEventListener("touchmove", bloquearScroll);
      window.removeEventListener("pointermove", mover);
      window.removeEventListener("pointerup", soltar);
      window.removeEventListener("pointercancel", soltar);
    };
  }, [arrastre, onSlotDrag]);

  const handleTileLongPress = useCallback(
    (sel) => {
      if (readOnly || armed) return;
      // En la pizarra la pulsación larga LEVANTA el plato. Las acciones
      // (cambiar, duplicar, vaciar) siguen en el botón de los tres puntos, que
      // es un gesto explícito: aquí el dedo largo ya significa "lo voy a
      // mover", y darle dos significados sería pedirle al usuario que adivine.
      if (modoPizarra && !sel.empty && onSlotDrag) {
        iniciarArrastre(sel);
        return;
      }
      if (sel.empty) return;
      setDishAction(sel);
    },
    [armed, readOnly, modoPizarra, onSlotDrag, iniciarArrastre],
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

  const [deckView, setDeckView] = useState(() => {
    if (["semana", "lista", "dia", "mes"].includes(initialDeckView)) {
      return initialDeckView;
    }
    try {
      const saved = localStorage.getItem("menuDeckView");
      // "lista" (Resumen) está oculta por ahora: un valor guardado antiguo cae a "día".
      return saved === "semana" || saved === "mes" ? saved : "dia";
    } catch {
      return "dia";
    }
  }); // "dia" | "semana" | "mes" | "lista"
  // Una vista guardada que este menú no ofrece (la pizarra solo da Día y
  // Semana) dejaría el deck en blanco: se cae a la primera disponible.
  useEffect(() => {
    if (!deckViews.some((v) => v.id === deckView)) setDeckView(deckViews[0].id);
  }, [deckViews, deckView]);
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
  // Las otras acciones del menú, plegadas en la fila de mandos. Ver
  // `accionesDelMenu` más abajo.
  const [accionesAbiertas, setAccionesAbiertas] = useState(false);
  const [confirmDeleteActive, setConfirmDeleteActive] = useState(false);
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
  const multiGroup = data.groups.length > 1;
  const visibleGroups = useMemo(() => {
    if (!multiGroup || scope === "all") return data.groups;
    return data.groups.filter((g) => g.id === scope);
  }, [data.groups, multiGroup, scope]);
  // A plan can have keys (or leftover recipe ids on days outside this week)
  // without anything to paint in the current deck — treat that as empty so
  // the "Generar" card shows instead of a blank Semana view.
  const hasVisibleMenu = useMemo(
    () => (activeDays ?? []).some((day) => getDeckDayTiles(day, data, menuPlan, visibleGroups).length > 0),
    [activeDays, data, menuPlan, visibleGroups],
  );
  const menuNeedsActivation = Boolean(
    user && activeMenu && activeMenu.activatedAt === null && onActivateMenu,
  );
  const menuActivado = Boolean(activeMenu?.activatedAt);
  const hasMenu = !isGenerating && !error && hasVisibleMenu;


  /**
   * Las acciones del menú —activar, favorito, publicar— como BALDOSAS, en la
   * misma fila que los mandos y plegadas tras una pestaña.
   *
   * Vivían sueltas arriba a la derecha, y esa esquina ya estaba llena: con
   * varias semanas la fila de debajo trae además su paso de semanas, y
   * cualquier mando nuevo —las bases, sin ir más lejos— no tenía dónde
   * entrar. Aquí comparten fila con las baldosas y se turnan: o ajustas el
   * menú o haces algo CON el menú, nunca las dos a la vez.
   *
   * Son la MISMA baldosa que un mando —mismo cuadrado, mismo nombre debajo—
   * con icono en vez de ilustración. Si al desplegarlas aparecieran pastillas,
   * la fila cambiaría de idioma a mitad de gesto.
   *
   * ── Las tres están SIEMPRE ────────────────────────────────────────────
   * Antes cada una se escondía cuando no procedía: activar solo si el menú
   * estaba sin activar, favorito solo con cuenta. El resultado era una fila
   * que cambiaba de contenido sin avisar —con el menú ya activado y sin
   * sesión quedaba solo publicar— y no había forma de saber si activar
   * faltaba porque ya estaba hecho o porque la app se lo había comido.
   *
   * Ahora salen las tres y lo que cambia es el estado: APAGADA cuando esa
   * acción ya no está pendiente. Apagada no es muerta —quitar de favoritos y
   * volver a la hoja de publicar siguen pulsando—: solo se bloquea lo que de
   * verdad no tiene nada que hacer, un menú ya activado o guardar sin cuenta
   * donde guardarlo.
   *
   * Lo demás —menús guardados, compartir, PDF, regenerar— sigue en el burger
   * de la cabecera, que se queda donde estaba: son destinos y diálogos, no
   * interruptores, y una baldosa que abre una pantalla promete algo que no es.
   */
  const [publishSheetOpen, setPublishSheetOpen] = useState(false);
  // Vive aqui arriba, y no junto a los demás manejadores de exportar, porque
  // la baldosa de Descargar lo lleva en sus dependencias: declarado abajo se
  // lee antes de existir y revienta en el primer render.
  const handleDownload = useCallback(() => setPdfExportOpen(true), []);
  const abrirAcciones = useCallback((v) => setAccionesAbiertas(v), []);
  // Sin activar Y con cuenta para activarlo: es la única de las tres que pide
  // un toque ya mismo, así que es la única que se destaca —y la que asoma
  // cuando la pestaña está plegada.
  const puedeActivar = Boolean(hasMenu && onActivateMenu && menuNeedsActivation);
  const puedeFavorito = Boolean(onToggleFavorite && user);
  const accionesEnLaFila = hasMenu && Boolean(wizardControls);
  const menuWeeks = useMemo(() => orderedWeeks(activeMenu), [activeMenu]);
  const currentWeekIdx = useMemo(
    () => menuWeeks.findIndex((w) => w.offset === data.menuWeek?.offset),
    [menuWeeks, data.menuWeek],
  );
  /**
   * Las semanas del menú tal y como las ve la vista de mes.
   *
   * `menuWeeks` trae el plan que se GUARDÓ de cada semana, y el de la semana
   * abierta puede haber cambiado desde entonces (cambiar un plato, mover otro):
   * ese vive en `menuPlan`. Así que la activa se sustituye por lo que hay en
   * pantalla — si no, el mes enseñaría el plato viejo justo en la semana que
   * estás tocando.
   *
   * Y si el menú no tiene entrada en el archivo (una sola semana, sin
   * activeMenuId) se arma una semana a mano con lo que hay delante, para que
   * la vista no salga vacía teniendo menú.
   */
  const monthWeeks = useMemo(() => {
    const firstDate = activeDays?.[0] ? weekDates?.[activeDays[0]] : null;
    const activeStart = menuWeeks[Math.max(0, currentWeekIdx)]?.weekStart
      ?? (firstDate ? isoLocalDate(firstDate) : null);
    const live = activeStart
      ? { weekStart: activeStart, plan: menuPlan, dates: weekDates, activeDays }
      : null;
    if (menuWeeks.length > 0) {
      return menuWeeks.map((w) => (live && w.weekStart === activeStart ? { ...w, ...live } : w));
    }
    return live ? [live] : [];
  }, [menuWeeks, currentWeekIdx, menuPlan, activeDays, weekDates]);

  /**
   * Tocar un día en la vista de mes.
   *
   * El mes cruza semanas, así que llevar allí son DOS cosas: cambiar de semana
   * si el día no es de la que está abierta, y bajar a la vista de día en ese
   * día. El cambio de semana solo se pide cuando hace falta — pedirlo siempre
   * volvería a montar el plan de la misma semana para nada.
   */
  const handlePickMonthDay = useCallback(
    (weekStart, day) => {
      const current = menuWeeks[Math.max(0, currentWeekIdx)]?.weekStart ?? null;
      if (weekStart && weekStart !== current) onSwitchWeek?.(weekStart);
      setSelectedDay(day);
      setDeckView("dia");
    },
    [menuWeeks, currentWeekIdx, onSwitchWeek],
  );

  const restrictionWarning = useMemo(
    () => summarizeMenuRestrictionConflicts(restrictionConflicts),
    [restrictionConflicts],
  );

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


  /**
   * Las siete, en orden: lo que cambia el estado del menú primero, lo que se
   * lo lleva fuera después, y el histórico al final porque no es una acción
   * sobre este menú sino irse a otro sitio.
   *
   * Todas CON COLOR, siempre. Estuvieron un rato apagándose al completarse
   * —gris para "ya está activado", gris para "ya es favorito"— y leído en la
   * fila parecía que la app las había deshabilitado, cuando es justo al
   * revés: activado y guardado son los estados BUENOS. Lo que dice si está
   * hecho es el aro y el nombre, no el apagarse.
   *
   * El gris queda solo para lo que de verdad no se puede hacer aquí —guardar
   * sin cuenta donde guardarlo—, y entonces el botón ni siquiera responde.
   */
  // Lo que hoy no se puede hacer no se apaga: se toca igual y contesta. Un
  // botón gris y muerto no explica por qué no va.
  const sinCuenta = (que) => () => onToast?.(`Necesitas cuenta para ${que}`);

  const accionesDelMenu = (
    <>
      <BaldosaAccion
        Icono={Zap}
        etiqueta={menuActivado ? "Activado" : "Activar"}
        color="#c9922a"
        tinte="#fff6e0"
        marcado={menuActivado}
        ariaPressed={menuActivado}
        title={
          menuActivado ? "Desactivar — se devuelve a En casa lo que este menú descontó"
            : puedeActivar ? "Activar menú — En casa se moverá según tus preferencias"
              : "Necesitas cuenta para activar el menú"
        }
        onClick={
          menuActivado ? (onDeactivateMenu ?? sinCuenta("activar el menú"))
            : puedeActivar ? onActivateMenu : sinCuenta("activar el menú")
        }
      />
      <BaldosaAccion
        Icono={Heart}
        etiqueta={activeFavorite ? "Guardado" : "Favorito"}
        color="#e0405a"
        tinte="#fff0f3"
        marcado={activeFavorite}
        ariaPressed={activeFavorite}
        title={
          !puedeFavorito ? "Necesitas cuenta para guardar favoritos"
            : activeFavorite ? "Quitar de favoritos" : "Guardar en favoritos"
        }
        onClick={puedeFavorito ? onToggleFavorite : sinCuenta("guardar favoritos")}
      />
      <BaldosaAccion
        Icono={Users}
        etiqueta={menuSharedInFeed ? "Publicado" : "Publicar"}
        color="#4a6fd4"
        tinte="#e6efff"
        marcado={menuSharedInFeed}
        title={
          !onPublishToFeed ? "Necesitas cuenta para publicar en Gente"
            : menuSharedInFeed ? "Menú publicado en Gente" : "Publicar en Gente"
        }
        onClick={onPublishToFeed ? () => setPublishSheetOpen(true) : sinCuenta("publicar en Gente")}
      />
      {/* Estas cuatro no tienen estado: o las haces o no. Nunca llevan aro ni
          se apagan — compartir dos veces o bajar el PDF otra vez es legítimo. */}
      <BaldosaAccion
        Icono={Share2}
        etiqueta="Compartir"
        color="#0d9488"
        tinte="#e0f4f1"
        title="Compartir el menú fuera de la app"
        onClick={handleShare}
      />
      <BaldosaAccion
        Icono={Download}
        etiqueta="Descargar"
        color="#d97706"
        tinte="#fdf0e0"
        title="Descargar el menú en PDF"
        onClick={handleDownload}
      />
      {!isGenerating && !readOnly && onRegenerate && (
        <BaldosaAccion
          Icono={RotateCw}
          etiqueta="Regenerar"
          color="#16a34a"
          tinte="#e6f6ec"
          title="Regenerar el menú entero"
          onClick={onRegenerate}
        />
      )}
      {onOpenMenus && (
        <BaldosaAccion
          Icono={History}
          etiqueta="Menús"
          color="#7c3aed"
          tinte="#f0e9fe"
          title="Menús guardados"
          onClick={onOpenMenus}
        />
      )}
    </>
  );

  const runPdfDownload = async (exportOptions) => {
    try {
      const weeks = menuWeeks.length > 0
        ? menuWeeks
        : [{
            plan: menuPlan,
            offset: data.menuWeek?.offset ?? 0,
            startDayIdx: data.menuWeek?.startDayIdx ?? 0,
            schedule: data.schedule,
          }];
      const result = await downloadMenuPdf(data, menuPlan, data.groups, {
        weeks,
        export: exportOptions,
      });
      onToast?.(result.method === "print" ? "Elige \"Guardar como PDF\" en el diálogo de impresión" : "Menú descargado");
      onTrackEvent?.("menu_exported", {
        method: result.method,
        weekCount: weeks.length,
        pdfDayScope: exportOptions.dayScope,
        pdfMeals: exportOptions.meals?.join(","),
        pdfSchoolMenu: exportOptions.includeSchoolMenu,
      });
    } catch {
      onToast?.("No se pudo descargar el menú");
    }
  };


  return (
    <div style={{ background: "#fff", minHeight: "100dvh" }}>
      <style>{`
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


        @keyframes mixBarGrow { from { transform: scaleX(0); } to { transform: scaleX(1); } }
        .mix-bar { transform-origin: left center; animation: mixBarGrow .5s cubic-bezier(.22,1,.36,1) both; }

        /* Grid tokens ripple in left-to-right, top-to-bottom. */
        @keyframes calTokenIn {
          from { opacity: 0; transform: scale(.55); }
          to   { opacity: 1; transform: scale(1); }
        }
        .cal-token { animation: calTokenIn .3s cubic-bezier(.34,1.4,.5,1) both; }
        .cal-token:active { transform: scale(.9); }

        @media (prefers-reduced-motion: reduce) {
          .mix-bar, .cal-token { animation: none; }
        }

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
            {!modoPizarra && <CoachHelpButton active={showIconCoach} onClick={() => setShowIconCoach((v) => !v)} />}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
            {/* Activar y favorito se van a la fila de mandos como baldosas en
                cuanto esa fila existe (ver `accionesDelMenu`); si no hay fila,
                se quedan aquí. El burger NO se mueve: sus entradas son
                destinos y diálogos, no interruptores, y este es el sitio donde
                se busca "lo demás" en toda la app.

                Guardar como favorito solo tiene sentido con cuenta: sin ella no
                hay histórico/favoritos persistentes donde recuperarlo, así que
                no ofrecemos algo que no podemos cumplir. */}
            {!accionesEnLaFila && hasMenu && onActivateMenu && menuNeedsActivation && (
              <button
                type="button"
                onClick={onActivateMenu}
                aria-label="Activar menú"
                title="Activar menú — En casa se moverá según tus preferencias"
                style={{
                  ...iconChipButtonStyle,
                  background: "#fff6e0",
                  borderColor: "#f0d48a",
                }}
              >
                <Zap size={18} strokeWidth={2.5} color="#c9922a" fill="#f5d78a" />
              </button>
            )}
            {!accionesEnLaFila && hasMenu && onToggleFavorite && user && (
              <button
                type="button"
                onClick={onToggleFavorite}
                aria-label={activeFavorite ? "Quitar de favoritos" : "Guardar en favoritos"}
                aria-pressed={activeFavorite}
                title={activeFavorite ? "Quitar de favoritos" : "Guardar en favoritos"}
                style={{
                  ...iconChipButtonStyle,
                  background: activeFavorite ? "#fff0f3" : "#fff",
                  borderColor: activeFavorite ? "#f6bcc9" : "#dbe7df",
                }}
              >
                <Heart
                  size={18}
                  strokeWidth={2.4}
                  color={activeFavorite ? "#e0405a" : "#2d5a3d"}
                  fill={activeFavorite ? "#e0405a" : "none"}
                />
              </button>
            )}
            {modoPizarra && menuWeeks.length > 1 && (
              <DeckWeekStepper
                weekIdx={Math.max(0, currentWeekIdx)}
                weekTotal={menuWeeks.length}
                onPrev={() => currentWeekIdx > 0 && onSwitchWeek?.(menuWeeks[currentWeekIdx - 1].weekStart)}
                onNext={() => currentWeekIdx < menuWeeks.length - 1 && onSwitchWeek?.(menuWeeks[currentWeekIdx + 1].weekStart)}
                onOpen={onOpenMenus}
              />
            )}
            {/* El burger es el PLAN B. Cuando hay fila de mandos, sus entradas
                viven allí como baldosas y este botón sobra: tener las mismas
                acciones en dos sitios obliga a mirar los dos para saber si
                algo está hecho. Sin fila —hogar de solo lectura, o ningún
                control visible— es la única puerta, así que no se borra. */}
            {!accionesEnLaFila && (
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
            )}
          </div>
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
                    // "Análisis" y "Borrar menú" quitados de momento (2026-08-27):
                    // para borrar, ahora se genera otro menú por encima.
                    onOpenMenus && { key: "menus", label: "Menús guardados", Icon: History, coach: "menu-menus", action: onOpenMenus, tint: "#f0e9fe", ink: "#7c3aed" },
                    hasMenu && onPublishToFeed && { key: "feed", label: menuSharedInFeed ? "Menú publicado" : "Publicar en Gente", Icon: Users, action: () => setPublishSheetOpen(true), tint: "#e6efff", ink: "#4a6fd4" },
                    hasMenu && { key: "share", label: "Compartir fuera", Icon: Share2, action: handleShare, tint: "#e0f4f1", ink: "#0d9488" },
                    hasMenu && { key: "download", label: "Descargar PDF", Icon: Download, action: handleDownload, tint: "#fdf0e0", ink: "#d97706" },
                    !isGenerating && !readOnly && onRegenerate && { key: "regen", label: "Regenerar menú", Icon: RotateCw, action: onRegenerate, tint: "#e6f6ec", ink: "#16a34a" },
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

      {/* ── Zona de navegación: cabecera clásica (fecha/perfil/chevron) o nav del deck ── */}
      <div style={{ background: "#fff", padding: "12px 16px 0" }}>

        {/* ── Multi-week switcher: solo en clásico (en deck vive dentro del DeckNav) ── */}

        {/* View controls — clásico: segmented + botón para entrar al Deck */}

        {/* View controls — deck: vistas (izq) · semana (centro) · filtro círculo (der) */}
        {/* ── La fila de la pizarra ─────────────────────────────────────
            Dos secciones en una sola banda: quién come (avatares, en blanco,
            porque son personas y van con el tablero) y con qué se maneja el
            tablero (las baldosas, en el slate que esta app ya reserva para lo
            logístico — ver la escala de Compra en DESIGN_SYSTEM §7). El tinte
            llega hasta el borde derecho porque la franja es una zona, no una
            tarjeta: cortarla antes del margen la convertiría en un recuadro
            más de los que hay debajo. */}
        {hasMenu && modoPizarra && (
          <div style={{ display: "flex", alignItems: "stretch", marginRight: -16, marginBottom: 14, minHeight: 78 }}>
            <div style={{ background: "#fff", display: "flex", alignItems: "center", paddingRight: 12, flexShrink: 0 }}>
              {(data.groups?.length > 0) && (
                <DeckFilter
                  groups={data.groups}
                  scope={scope}
                  onScopeChange={setScope}
                  members={data.members ?? []}
                  interactivo={multiGroup}
                  ciclar={multiGroup}
                />
              )}
            </div>
            <div style={{ flex: 1, minWidth: 0, background: "#f1f5f9", display: "flex", alignItems: "center" }}>
              {pizarraControles}
            </div>
          </div>
        )}
        {hasMenu && !modoPizarra && (
          <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
            {/* The coach anchor hugs the view switch alone: the filter circle at
                the far right gets its own step, and a spotlight over the whole
                row would highlight both at once. */}
            <div data-coach="menu-viewmode" style={{ display: "flex", minWidth: 0 }}>
              <DeckNav value={deckView} onChange={setDeckView} options={deckViews} />
            </div>
            {/* Centrado en la FRANJA, no en el hueco que sobra. Con
                `flex: 1 + center` el paso de semanas se centraba entre el
                selector de vistas y el filtro, así que sin avatares —el caso
                normal, una casa con un solo menú— se quedaba flotando a medio
                camino: ni en el centro ni pegado a nada. Absoluto y al 50 %
                está donde se espera, y no se mueve cuando aparecen los
                avatares. Cabe de sobra: 110 + 70 + 42 en 420. */}
            <div
              style={{
                position: "absolute", left: "50%", transform: "translateX(-50%)",
                display: "flex", justifyContent: "center", pointerEvents: "none",
              }}
            >
              {!modoPizarra && menuWeeks.length > 1 && (
                <DeckWeekStepper
                  style={{ pointerEvents: "auto" }}
                  weekIdx={Math.max(0, currentWeekIdx)}
                  weekTotal={menuWeeks.length}
                  onPrev={() => currentWeekIdx > 0 && onSwitchWeek?.(menuWeeks[currentWeekIdx - 1].weekStart)}
                  onNext={() => currentWeekIdx < menuWeeks.length - 1 && onSwitchWeek?.(menuWeeks[currentWeekIdx + 1].weekStart)}
                  onOpen={onOpenMenus}
                />
              )}
            </div>
            <span style={{ flex: 1, minWidth: 0 }} />
            {!modoPizarra && multiGroup && (
              <DeckFilter
                groups={data.groups}
                scope={scope}
                onScopeChange={setScope}
                members={data.members ?? []}
              />
            )}
          </div>
        )}

        {/* La fila de mandos del wizard, justo bajo el selector de vistas: se
            lee como "esto de aquí arriba controla lo de abajo". Solo con menú
            delante — sin platos que ajustar, un mando no significa nada. */}
        {/* Las acciones se le inyectan a la fila ya montada en vez de subirlas
            a App: los manejadores —activar, favorito, el panel de opciones—
            viven aquí, y hacerlos viajar por dos componentes para volver al
            mismo sitio no le añade nada a nadie. */}
        {accionesEnLaFila
          ? cloneElement(wizardControls, {
              acciones: accionesDelMenu,
              accionesAbiertas,
              onAccionesAbiertas: abrirAcciones,
              accionesAviso: puedeActivar,
            })
          : hasMenu && wizardControls}
      </div>

      {/* ── Second divider: end of nav zone (solo clásico; en deck sobra) ── */}

      {!isGenerating && error && (
        <ErrorCard error={error} onRetry={onRetry} />
      )}

      {!isGenerating && !error && !hasVisibleMenu && (
        <EmptyState readOnly={readOnly} />
      )}

      {!isGenerating && !error && hasVisibleMenu && (
      <div>
        {restrictionWarning && (
          <RestrictionConflictBanner key={restrictionWarning} message={restrictionWarning} onRegenerate={readOnly ? undefined : onRegenerate} />
        )}
        {(
          <div
            style={{
              paddingTop: 14,
              // La lengüeta del calendario ocupa 26px pegada al borde: sin
              // este aire se comía la esquina izquierda de las tarjetas.
              paddingLeft: modoPizarra ? 36 : 16,
              paddingRight: 16,
              paddingBottom: `calc(${bottomNavSpacer()} + 12px)`,
            }}
          >
            <ArmedContext.Provider value={armed}>
            <MenuDeck
              denso={modoPizarra}
              onAddSlot={modoPizarra ? onAddSlot : null}
              onRemoveSlot={modoPizarra ? onRemoveSlot : null}
              onFillSlot={modoPizarra ? onFillSlots : null}
              onDishActions={modoPizarra && !readOnly ? setDishAction : null}
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
              menuWeeks={monthWeeks}
              onPickMonthDay={handlePickMonthDay}
              invitadosPorHueco={invitadosPorHueco}
            />
            </ArmedContext.Provider>
          </div>
        )}

        {/* La etiqueta que sigue al dedo mientras arrastras. Es la única pista
            de que el gesto va bien: sin ella el plato levantado no dice a
            dónde va a caer, y hay que soltarlo para averiguarlo. */}
        {arrastre && (
          <div
            aria-hidden
            style={{
              position: "fixed", zIndex: 250, pointerEvents: "none",
              left: arrastre.x, top: arrastre.y - 46,
              transform: "translateX(-50%)",
              padding: "7px 13px", borderRadius: 999,
              background: arrastre.sobre ? "#2d5a3d" : "#1a3a24",
              color: "#fff", fontSize: 12, fontWeight: 800, whiteSpace: "nowrap",
              boxShadow: "0 6px 20px rgba(20,47,29,.35)",
            }}
          >
            {arrastre.sobre
              ? `Soltar en ${MEAL_META[arrastre.sobre.meal]?.label ?? arrastre.sobre.meal} · ${dayLabel(arrastre.sobre.day)}`
              : "Arrastra a otro hueco"}
          </div>
        )}

        {dishAction && cambiarSub && autoDemo !== "actions" && !readOnly && (
          <DishActionBar
            anchor={dishAction.anchor}
            onClose={cerrarAcciones}
            actions={[
              ...(onDishManualPick ? [{
                id: "manual", Icon: BookOpen, label: "Elegir a mano",
                onPick: () => { onDishManualPick(dishAction); cerrarAcciones(); },
              }] : []),
              {
                id: "mismo", Icon: Tag, label: "Del mismo tipo",
                // `sameCategory` acota el reemplazo a la categoría del plato que
                // hay (carnes → otra carne). Ya existía en el motor
                // (pickCatalogReplacement) y no lo usaba nadie.
                onPick: () => { onDishReplace?.(dishAction, { sameCategory: true }); cerrarAcciones(); },
              },
            ]}
          />
        )}

        {dishAction && !cambiarSub && autoDemo !== "actions" && !readOnly && (
          <DishActionBar
            anchor={dishAction.anchor}
            onClose={cerrarAcciones}
            actions={[
              {
                id: "regen", Icon: RotateCw, label: "Cambiar",
                // Abre un segundo nivel en vez de cambiar el plato de golpe.
                //
                // Hasta el 17 sep 2026 ejecutaba al toque, y el comentario de
                // aquí defendía que el criterio de reemplazo "es cosa nuestra,
                // no una decisión que deba tomar el usuario cada vez". Era
                // razonable cuando no había selector manual; ahora sí lo hay
                // (`onDishManualPick`, que abre el catálogo) y esconderlo
                // detrás de una pulsación larga lo dejaba sin encontrar.
                onPick: () => setCambiarSub(true),
              },
              {
                id: "swap", Icon: ArrowLeftRight, label: "Mover",
                onPick: () => { setArmed({ mode: "swap", source: dishAction }); cerrarAcciones(); },
              },
              {
                id: "dup", Icon: CopyPlus, label: "Duplicar",
                onPick: () => { setArmed({ mode: "duplicate", source: dishAction }); cerrarAcciones(); },
              },
              // "Uno mas": escribe una REGLA de invitado para ESTE hueco, no
              // un numero. A partir de ahi el comensal se cuenta solo, la
              // receta escala y la compra sube (ver handleAddGuest en
              // App.jsx). Se queda fuera cuando el padre no lo pasa, que es
              // como se apaga en los menus de solo lectura.
              ...(onSetGuests ? [{
                id: "guest", Icon: UserPlus,
                // La etiqueta cambia porque la acción cambia: con invitados ya
                // puestos, el contador sirve para bajarlos, y llamarlo
                // "Añadir" sería mentir sobre lo que hay detrás.
                label: (invitadosPorHueco?.[`${dishAction.groupId}|${dishAction.day}|${dishAction.meal}`] ?? 0) > 0
                  ? "Comensales" : "Añadir comensal",
                onPick: () => { setGuestFor(dishAction); cerrarAcciones(); },
              }] : []),
              {
                id: "clear", Icon: Trash2, label: "Quitar",
                onPick: () => { onDishClear?.(dishAction); cerrarAcciones(); },
              },
              // Estructura: solo en comidas y cenas. En desayuno, merienda o
              // postre no hay primero y segundo que repartir, así que la barra
              // se queda en cuatro y la retícula pasa sola a 2+2.
              ...(onSlotStructure && isStructuralMeal(dishAction.meal)
                ? [structureActionFor(dishAction, menuPlan, (structure) => {
                    onSlotStructure(dishAction, structure);
                    cerrarAcciones();
                  })]
                : []),
            ]}
          />
        )}

        {guestFor && !readOnly && (
          <GuestCountSheet
            inicial={invitadosPorHueco?.[`${guestFor.groupId}|${guestFor.day}|${guestFor.meal}`] ?? 0}
            onClose={() => setGuestFor(null)}
            onConfirm={(n) => onSetGuests?.(guestFor, n)}
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
                {armed.mode === "swap" ? (
                  <ArrowLeftRight size={17} strokeWidth={2.6} color="#8ee0a6" style={{ flexShrink: 0 }} />
                ) : (
                  <CopyPlus size={17} strokeWidth={2.6} color="#8ee0a6" style={{ flexShrink: 0 }} />
                )}
                <span style={{ flex: 1, minWidth: 0, color: "#fff", fontSize: 12.5, fontWeight: 700, lineHeight: 1.3 }}>
                  {/* El plato que viene de fuera se nombra: has cambiado de
                      pantalla desde que lo elegiste y conviene confirmar que
                      es el que creias. */}
                  {armed.mode === "incoming"
                    ? `Toca el hueco para ${armed.dish.name}`
                    : armed.mode === "duplicate"
                      ? "Toca el hueco donde repetir el plato"
                      : "Toca el plato al que moverlo"}
                </span>
                <button
                  type="button"
                  onClick={() => { setArmed(null); if (armed.mode === "incoming") onIncomingCancel?.(); }}
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

      </div>
      )}

      {profileOpen && !readOnly && (
        <ProfileSettingsSheet
          data={data}
          setData={setData}
          onClose={() => setProfileOpen(false)}
          onRegenerate={() => {
            setProfileOpen(false);
            onRegenerate?.();
          }}
        />
      )}

      {confirmDeleteActive && createPortal(
        <div
          style={{
            position: "fixed", inset: 0, zIndex: 300, display: "flex",
            alignItems: "flex-end", justifyContent: "center",
            background: "rgba(10,20,14,.45)",
          }}
          onClick={() => setConfirmDeleteActive(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%", maxWidth: 420, background: "#fff",
              borderRadius: "24px 24px 0 0", padding: "26px 22px calc(env(safe-area-inset-bottom,0px) + 22px)",
            }}
          >
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: 20 }}>
              <div
                style={{
                  width: 52, height: 52, borderRadius: 16, marginBottom: 10, background: "#fdf1f0",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}
              >
                <Trash2 size={22} color="#c0392b" />
              </div>
              <h3 style={{ fontSize: 18, fontWeight: 900, color: "#142f1d", margin: 0, textAlign: "center" }}>
                ¿Borrar este menú?
              </h3>
              <p style={{ fontSize: 13, color: "#7a8a7f", margin: "4px 0 0", textAlign: "center" }}>
                Perderás los platos y la compra generada. El histórico no se ve afectado.
              </p>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <button
                type="button"
                onClick={() => { setConfirmDeleteActive(false); onDeleteActive(); }}
                style={{
                  border: "none", borderRadius: 999, background: "#c0392b", color: "#fff",
                  fontWeight: 800, fontSize: 14, padding: "13px 0", cursor: "pointer", fontFamily: "inherit",
                }}
              >
                Borrar menú
              </button>
              <button
                type="button"
                onClick={() => setConfirmDeleteActive(false)}
                style={{
                  border: "1.5px solid #e3ebe6", borderRadius: 999, background: "#fff", color: "#5c6b60",
                  fontWeight: 800, fontSize: 14, padding: "13px 0", cursor: "pointer", fontFamily: "inherit",
                }}
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {pdfExportOpen && createPortal(
        <MenuPdfExportModal
          data={data}
          weekCount={menuWeeks.length > 0 ? menuWeeks.length : 1}
          onClose={() => setPdfExportOpen(false)}
          onConfirm={(exportOptions) => {
            setPdfExportOpen(false);
            runPdfDownload(exportOptions);
          }}
        />,
        document.body,
      )}

      {showIconCoach && <MenuCoachTour onClose={() => setShowIconCoach(false)} />}

      {publishSheetOpen && (
        <ShareMenuSheet
          shared={menuSharedInFeed}
          onPublish={async (scope) => {
            const done = await onPublishToFeed?.(scope);
            if (done) setPublishSheetOpen(false);
          }}
          onUnpublish={async () => {
            await onUnpublishFromFeed?.();
            setPublishSheetOpen(false);
          }}
          onClose={() => setPublishSheetOpen(false)}
        />
      )}

      {/* La burbuja del bot va DESPUÉS de la nav: se posiciona ella sola por
          encima, y montarla antes la dejaba tapada por la barra inferior. */}
      {wizardBubble}

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

// Sin botón de generar (2026-08-29): el único sitio para generar un menú es
// la card de Inicio — meter un segundo botón aquí duplicaba esa acción.
function EmptyState({ readOnly = false }) {
  return (
    <div style={{ padding: "16px 18px", maxWidth: 420, margin: "0 auto", boxSizing: "border-box" }}>
      <EmptyIllustration
        img="/avatares/cards/aun_no_menu_generado.jpg"
        title={readOnly ? "Sin menú en este hogar" : "Aún no tienes menú esta semana"}
        subtitle={
          readOnly
            ? "Cuando el propietario genere el menú, lo verás aquí."
            : "Genera tu menú desde Inicio y aparecerá aquí."
        }
        maxWidth={240}
        imgAspect="1 / 1"
        imgPosition="center"
      />
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
  // Se llama al tocar una pestaña de método cuando el plato viene de un hueco
  // del menú: elegir «Thermomix» aquí es decir con qué lo vas a hacer, no solo
  // mirar sus pasos. En modo catálogo no se pasa — no hay dónde guardarlo.
  onPickAppliance = null,
  initialCourse = "principal",
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
  // Congelador: `onSlotFreezerChange(patch)` marca (o desmarca) este hueco como
  // cubierto por un plato ya cocinado. `patch` es null para volver a cocinarlo
  // desde cero, o { fromFreezer, frozenItemId, frozenPortions, freshPortions }.
  // Sin este callback (catálogo, demos) la ficha solo informa, sin poder asignar.
  onSlotFreezerChange = null,
  // Owner-only: patch classification (tipo / aplica) on a user-created recipe.
  onUpdateUserRecipe = null,
  // Abrir el perfil de quien subió esta receta. Sin este callback el nombre y
  // la cara siguen ahí, pero como texto: no se pinta un enlace que no lleva a
  // ningún sitio.
  onOpenPerson = null,
  readOnly = false,
}) {
  const isFavorite = favoriteScope != null;
  // Solo hay perfil que abrir si la receta es de ALGUIEN. Las del catálogo son
  // de la casa ("HoMenu"), y ahí no hay perfil detrás.
  const ownerId = recipe.owner?.id ?? recipe.owner?.userId ?? null;
  const abrirPerfil = onOpenPerson && ownerId ? () => onOpenPerson(ownerId) : null;
  const rejectReasons = ["No me gusta", "Esta semana no", "Tarda demasiado", "Lo comí hace poco"];
  const [rejected, setRejected] = useState(null);
  // Demo only (autoDemo="reject"): visual "press" on "Sustituir plato" right
  // before firing onReject, since the auto-trigger skips the real pointerdown.
  const [demoPressed, setDemoPressed] = useState(false);
  // Receta section: segmented control between "Ingredientes" and "Pasos".
  const [recipeTab, setRecipeTab] = useState(initialRecipeTab);
  const [recipeExpanded, setRecipeExpanded] = useState(true);
  // ¿Se cocina con las bases YA hechas? Empieza en SÍ.
  //
  // Es una decisión de producto y no una deducción: quien abre un plato de una
  // semana con tanda lo normal es que la tenga hecha, y encontrarse la receta
  // larga cuando no toca molesta más que al revés. El que no la tenga lo apaga
  // y ve la receta entera; nadie se queda sin poder cocinar.
  //
  // Cuando la vista del domingo sepa qué se cocinó de verdad, podrá decidirlo
  // ella en vez de asumirlo.
  const [conBases, setConBases] = useState(true);
  const [scopeOpen, setScopeOpen] = useState(false);
  // Pasos del método activo. La base usa los del catálogo (o IA bajo demanda);
  // los métodos por electrodoméstico se piden a /api/recipe-steps (caché Redis).
  const [steps, setSteps] = useState(() => recipe.steps ?? []);
  const [stepsLoading, setStepsLoading] = useState(
    () => (recipe.steps?.length ?? 0) === 0
  );
  const stepsCacheRef = useRef({});
  const catalogId = useMemo(() => catalogRecipeId(recipe), [recipe.baseRecipeId, recipe.id]);

  const userCatalogRecipe = useMemo(() => {
    const baseId = recipe.baseRecipeId ?? catalogId;
    if (!baseId?.startsWith?.("user_") && recipe.source !== "user") return null;
    return (data?.userRecipes ?? []).find((r) => r.id === baseId) ?? null;
  }, [data?.userRecipes, recipe.source, recipe.baseRecipeId, catalogId]);

  const canEditClassification = Boolean(
    !browse && userCatalogRecipe && isUserRecipeOwner(userCatalogRecipe, user) && onUpdateUserRecipe,
  );

  const applyClassificationPatch = useCallback(
    (patch) => {
      if (!userCatalogRecipe || !onUpdateUserRecipe) return;
      onUpdateUserRecipe(
        patchUserRecipeClassification(userCatalogRecipe, {
          usageTags: patch.usageTags ?? userCatalogRecipe.usageTags,
          mealRole: patch.mealRole ?? userCatalogRecipe.mealRole,
          quickDinner: patch.quickDinner ?? userCatalogRecipe.category === "cenas_rapidas",
        }),
      );
    },
    [userCatalogRecipe, onUpdateUserRecipe],
  );

  // ── Congelador (parte que solo depende del slot) ───────────────────────────
  // Un hueco marcado `fromFreezer` trae ya el reparto que decidió el planner (o
  // el propio usuario desde esta ficha). Se lee aquí arriba porque determina a
  // cuántas raciones se escalan los ingredientes: de las que salen del
  // congelador no hay nada que comprar ni medir, solo las frescas cuentan.
  const slotFromFreezer = slotUsesFreezer(slot, recipe.id);
  const slotFromFridge = slotUsesFridge(slot, recipe.id);
  const slotFromPrepared = slotFromFreezer || slotFromFridge;
  const preparedPortionsInSlot = slotFromPrepared ? preparedPortionsFor(slot, recipe.id) : 0;
  const cookedEaters = cookedEatersFor(slot, recipe.id);
  const needsFreshCooking = slotFromPrepared && cookedEaters > 0;
  // Las cantidades de la ficha (y los marcadores {{Ingrediente}} de los pasos)
  // se refieren SOLO a lo que hay que cocinar de verdad. Un plato cubierto del
  // todo por el congelador se queda con la lista vacía: no se compra ni se pesa
  // nada, se descongela.
  const ingredients = useMemo(
    () => (cookedEaters > 0 ? scaledIngredients(recipe, cookedEaters) : []),
    [recipe, cookedEaters],
  );

  // ── Doble curso: plato principal + guarnición ──────────────────────────────
  // La guarnición asignada al slot (recipe.garnishId) es una receta completa con
  // sus propios ingredientes y pasos, hoy invisible en la ficha. La hidratamos a
  // la misma forma "frontend" que el plato para poder mostrarla como un segundo
  // curso con su propia lista de ingredientes y su paso a paso.
  const garnishRecipe = useMemo(() => {
    const garnishKey = resolveGarnishKey(recipe, catalogId);
    const raw = garnishKey ? GUARNICION_BY_ID[garnishKey] : null;
    return raw ? catalogToFrontendRecipe(raw, slot.eaters) : null;
  }, [recipe, catalogId, slot.eaters]);
  const garnishIngredients = useMemo(
    () => (garnishRecipe ? scaledIngredients(garnishRecipe, slot.eaters) : []),
    [garnishRecipe, slot.eaters],
  );
  // Pasos estructurados (stepsRich): el objeto `recipe` del slot puede venir de
  // un menú hidratado o persistido ANTES de que existiera stepsRich (RECIPES_BY_ID
  // se rellena en runtime vía registerRecipes), así que hacemos fallback al
  // índice HMR-friendly del bundle (stepsRichById), que siempre trae la versión
  // enriquecida aunque el menú persistido traiga steps fusionados con guarnición.
  const richSteps = useMemo(() => {
    const direct = resolveRichSteps(catalogId, recipe);
    if (direct) return direct;
    const fromCatalog = recipeCatalogById[catalogId]?.stepsRich;
    return Array.isArray(fromCatalog) && fromCatalog.length > 0 ? fromCatalog : null;
  }, [catalogId, recipe.stepsRich]);
  const garnishRichSteps = useMemo(
    () => (garnishRecipe ? resolveRichSteps(garnishRecipe.id, garnishRecipe) : null),
    [garnishRecipe],
  );
  const mainPlainSteps = useMemo(() => {
    const catalogPlain = recipeCatalogById[catalogId]?.steps ?? [];
    const resolved = resolvePlainSteps(catalogId, recipe, { garnishLinked: Boolean(garnishRecipe) });
    // Menús viejos con pasos fusionados (main + guarnición): si el objeto trae
    // más pasos que el catálogo del plato solo, usa los del catálogo.
    if (garnishRecipe && catalogPlain.length && resolved.length > catalogPlain.length) {
      return catalogPlain;
    }
    return resolved.length > 0 ? resolved : catalogPlain;
  }, [catalogId, recipe.steps, garnishRecipe]);
  const garnishPlainSteps = useMemo(
    () => (garnishRecipe ? resolvePlainSteps(garnishRecipe.id, garnishRecipe) : []),
    [garnishRecipe],
  );
  // ── Tercer curso: salsa (independiente de la guarnición — un plato puede
  // llevar guarnición Y salsa a la vez). Solo existe cuando se eligió a mano
  // desde "Combinar plato" (recipe.sauceId) — sin sugerencia automática.
  const sauceRecipe = useMemo(() => {
    const raw = recipe?.sauceId && SALSA_BY_ID[recipe.sauceId] ? SALSA_BY_ID[recipe.sauceId] : null;
    return raw ? catalogToFrontendRecipe(raw, slot.eaters) : null;
  }, [recipe, slot.eaters]);
  const sauceIngredients = useMemo(
    () => (sauceRecipe ? scaledIngredients(sauceRecipe, slot.eaters) : []),
    [sauceRecipe, slot.eaters],
  );
  const sauceRichSteps = useMemo(
    () => (sauceRecipe ? resolveRichSteps(sauceRecipe.id, sauceRecipe) : null),
    [sauceRecipe],
  );
  const saucePlainSteps = useMemo(
    () => (sauceRecipe ? resolvePlainSteps(sauceRecipe.id, sauceRecipe) : []),
    [sauceRecipe],
  );

  const [activeCourse, setActiveCourse] = useState(initialCourse);
  const garnishShortName = garnishRecipe
    ? (GUARNICION_BY_ID[garnishRecipe.id]?.shortName ?? garnishRecipe.name)
    : null;
  const catalogEntry = recipeCatalogById[catalogId];
  const baseName = baseDishName(recipe, catalogId, recipeCatalogById);
  const platoUnico = isPlatoUnicoWithGarnish(
    recipe,
    catalogEntry,
    catalogId,
    garnishRecipe,
    garnishShortName,
    sauceRecipe,
  );
  // ── Desglose por `part` de la propia receta (sin guarnición/salsa de
  // catálogo aparte) — mutuamente excluyente con el modelo antiguo: si ya hay
  // garnishRecipe/sauceRecipe, esas mandan tal cual y esto se queda vacío.
  const ownParts = useMemo(
    () => (!garnishRecipe && !sauceRecipe ? availablePartsOf(richSteps) : []),
    [garnishRecipe, sauceRecipe, richSteps],
  );
  const hasOwnParts = ownParts.length > 0;
  const ownStepsByPart = useMemo(
    () => (hasOwnParts ? stepsByPart(richSteps) : {}),
    [hasOwnParts, richSteps],
  );
  const ownIngredientsByPart = useMemo(
    () => (hasOwnParts ? ingredientsByPart(richSteps, ingredients) : {}),
    [hasOwnParts, richSteps, ingredients],
  );
  const showGarnishCourse = (Boolean(garnishRecipe) && !platoUnico) || ownParts.includes("guarnicion");
  const showSalsaCourse = (Boolean(sauceRecipe) && !platoUnico) || ownParts.includes("salsa");
  const displayName = useMemo(() => {
    if (!garnishRecipe && !sauceRecipe) return recipe.name;
    if (platoUnico || activeCourse === "combinado") {
      return formatDishWithGarnish(
        baseName,
        garnishRecipe ? { shortName: garnishShortName, name: garnishRecipe.name } : null,
        sauceRecipe,
      );
    }
    if (activeCourse === "guarnicion" && garnishRecipe) return garnishRecipe.name;
    if (activeCourse === "salsa" && sauceRecipe) return sauceRecipe.name;
    return baseName;
  }, [
    recipe.name,
    garnishRecipe,
    garnishShortName,
    sauceRecipe,
    activeCourse,
    platoUnico,
    baseName,
  ]);
  // ── La receta vista desde el martes, con las bases ya hechas ────────────
  // Solo en el plato principal: una guarnición o una salsa de catálogo tienen
  // su propia pestaña con sus propios pasos, y meter ahí la tanda mezclaría
  // dos cosas que el usuario está mirando por separado.
  const vistaBases = useMemo(() => recetaConBases(recipe), [recipe]);
  // La pregunta solo tiene sentido si hay tandas pedidas. Antes salía en
  // cualquier plato que TUVIERA bases, que son casi todos, así que a quien
  // nunca pidió batch cooking le preguntaba si tiene cocinado un sofrito que
  // nadie le dijo que cocinara — y de paso hacía parecer que el menú traía
  // tandas que no había pedido.
  const puedeConBases =
    vistaBases.aplicada && !garnishRecipe && !sauceRecipe && hayTandasPedidas(data);
  const usandoBases = puedeConBases && conBases;
  // Los ingredientes de la ficha vienen escalados, así que la marca se cruza
  // por nombre — que es la misma clave con la que se resolvieron.
  const deBasePorNombre = useMemo(() => {
    const m = new Map();
    if (!puedeConBases) return m;
    for (const i of vistaBases.ingredientes) if (i.deBase) m.set(i.name, i.deBase);
    return m;
  }, [puedeConBases, vistaBases]);

  const onGarnishCourse = showGarnishCourse && activeCourse === "guarnicion";
  const onSalsaCourse = showSalsaCourse && activeCourse === "salsa";
  const onCombinedCourse =
    ((showGarnishCourse || showSalsaCourse) && activeCourse === "combinado") ||
    (platoUnico && (Boolean(garnishRecipe) || Boolean(sauceRecipe)));
  const cookCourse = platoUnico || (!onGarnishCourse && !onSalsaCourse && !onCombinedCourse);
  const courseIngredients = onGarnishCourse
    ? (garnishRecipe ? garnishIngredients : (ownIngredientsByPart.guarnicion ?? []))
    : onSalsaCourse
      ? (sauceRecipe ? sauceIngredients : (ownIngredientsByPart.salsa ?? []))
      : onCombinedCourse
        ? [...ingredients, ...garnishIngredients, ...sauceIngredients]
        : hasOwnParts
          ? (ownIngredientsByPart.principal ?? [])
          : ingredients;
  // Nutrientes secundarios (fibra, azúcares, grasas sat., sodio): opcionales y
  // solo presentes tras la pasada de enriquecimiento. Se muestran colapsados.
  const [nutriExpanded, setNutriExpanded] = useState(true);

  // ── Cook mode (moved here from the old "Modo cocina" tab in Compra) ──
  // Only when opened from the weekly menu with a real slot. Pantry is the single
  // source of truth: a tick means "you already have it in En casa"; "Marcar
  // cocinado" discounts the dish's ingredients from that stock (undo restores).
  const cookable = !browse && day != null && meal != null && cookWeekKey != null && setData != null;
  // Solo se calcula al navegar el catálogo, que es donde se pinta.
  const potentialSwaps = useMemo(
    () => (browse ? adaptationsNeededFor(recipe, "lactosa_fina") : []),
    [browse, recipe],
  );
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
  // Coste estimado por ración — mismo motor de precios que la lista de la
  // compra (Fase 8), aplicado a lo que este plato compra de verdad (los
  // ingredientes ya escalados a `cookedEaters`). Async porque el catálogo de
  // Mercadona se carga por fetch; sin resultado (aún cargando, o ningún
  // ingrediente con precio) no se pinta nada — nunca un coste inventado.
  const [recipeCost, setRecipeCost] = useState(null);
  useEffect(() => {
    let active = true;
    setRecipeCost(null);
    if (ingredients.length === 0 || !(cookedEaters > 0)) return undefined;
    (async () => {
      const cost = await estimateRecipeCost({ ingredients }, cookedEaters, data?.priceObs ?? []);
      if (active) setRecipeCost(cost);
    })();
    return () => { active = false; };
  }, [ingredients, cookedEaters, data?.priceObs]);
  // Electrodoméstico usado para cocinar el plato (RecipePlanner.jsx, paso
  // "¿Cómo se prepara?"), si se marcó alguno — nada si es tradicional
  // (fuego/sartén/olla), mismo criterio que el resto de chips opcionales de
  // esta fila. `requiredAppliances` (recetas de usuario) y `requiredAppliance`
  // (catálogo curado) usan nombres de campo distintos; se comprueban los dos.
  const usedAppliance = recipe.requiredAppliances?.[0] ?? recipe.requiredAppliance ?? null;
  const UsedApplianceIcon = usedAppliance ? (REQUIRED_APPLIANCE_ICONS[usedAppliance] ?? UtensilsCrossed) : null;
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

  // ── Congelador (parte que depende del stock real) ──────────────────────────
  // Lo de arriba lee el reparto que YA trae el slot; esto mira qué hay ahora en
  // el congelador para poder ofrecer usarlo si el hueco no está marcado.
  const freezerPortions = useMemo(
    () => frozenPortionsFor(pantryStock, catalogId),
    [pantryStock, catalogId],
  );
  const fridgePortions = useMemo(
    () => fridgePortionsFor(pantryStock, catalogId),
    [pantryStock, catalogId],
  );
  const freezerItem = useMemo(
    () => pickFrozenItem(pantryStock, catalogId),
    [pantryStock, catalogId],
  );
  const fridgeItem = useMemo(
    () => pickFridgeItem(pantryStock, catalogId),
    [pantryStock, catalogId],
  );
  const preparedSplit = useMemo(
    () =>
      slotFromPrepared
        ? { preparedPortions: preparedPortionsInSlot, freshPortions: cookedEaters }
        : splitSlotPortions(slot.eaters, Math.max(fridgePortions, freezerPortions)),
    [slotFromPrepared, preparedPortionsInSlot, cookedEaters, slot.eaters, fridgePortions, freezerPortions],
  );
  const thawSteps = useMemo(() => {
    const own = normalizeRichSteps(recipe.thawSteps);
    if (own.length > 0) return own;
    const fromCatalog = normalizeRichSteps(recipeCatalogById[catalogId]?.thawSteps);
    return fromCatalog.length > 0 ? fromCatalog : null;
  }, [recipe.thawSteps, catalogId]);
  const canUseFreezer =
    Boolean(onSlotFreezerChange) && !slotFromPrepared && freezerPortions > 0 && !isCooked;
  const canUseFridge =
    Boolean(onSlotFreezerChange) && !slotFromPrepared && fridgePortions > 0 && !isCooked;

  const handleUseFreezer = () => {
    if (!canUseFreezer || !freezerItem) return;
    const next = assignFreezerToSlot(slot, freezerItem, recipe.id);
    if (!slotUsesFreezer(next, recipe.id)) return;
    onSlotFreezerChange({
      fromFreezer: true,
      frozenItemId: next.frozenItemId,
      frozenRecipeId: next.frozenRecipeId,
      frozenPortions: next.frozenPortions,
      freshPortions: next.freshPortions,
      ...(next.preparedGarnishRef ? { preparedGarnishRef: next.preparedGarnishRef } : {}),
    });
    onToast?.(
      next.freshPortions > 0
        ? `Sacarás ${portionsLabel(next.frozenPortions)} del congelador · cocinas ${next.freshPortions} más`
        : `Sacarás ${portionsLabel(next.frozenPortions)} del congelador`,
    );
  };

  const handleUseFridge = () => {
    if (!canUseFridge || !fridgeItem) return;
    const next = assignFridgeToSlot(slot, fridgeItem, recipe.id);
    if (!slotUsesFridge(next, recipe.id)) return;
    onSlotFreezerChange({
      fromFridge: true,
      fridgeItemId: next.fridgeItemId,
      fridgeRecipeId: next.fridgeRecipeId,
      fridgePortions: next.fridgePortions,
      freshPortions: next.freshPortions,
      ...(next.preparedGarnishRef ? { preparedGarnishRef: next.preparedGarnishRef } : {}),
    });
    onToast?.(
      next.freshPortions > 0
        ? `Sacarás ${portionsLabel(next.fridgePortions)} de la nevera · cocinas ${next.freshPortions} más`
        : `Sacarás ${portionsLabel(next.fridgePortions)} de la nevera`,
    );
  };

  const handleCookFromScratch = () => {
    if (!onSlotFreezerChange || !slotFromPrepared) return;
    onSlotFreezerChange(null);
    onToast?.("Este plato se cocinará desde cero");
  };

  /**
   * Saca de nevera/congelador las raciones reservadas en este hueco.
   */
  const consumePreparedPortions = async () => {
    let pending = preparedPortionsInSlot;
    if (pending <= 0) return null;
    const fromFridge = slotFromFridge;
    const primaryItemId = fromFridge ? slot.fridgeItemId : slot.frozenItemId;
    const mine = pantryStock.filter(
      (it) => it.itemType === "cooked_dish"
        && Boolean(it.frozen) === !fromFridge
        && it.recipeRef === catalogId,
    );
    const candidates = [
      ...mine.filter((it) => it.id === primaryItemId),
      ...mine
        .filter((it) => it.id !== primaryItemId)
        .sort((a, b) => String(a.cookedAt ?? "").localeCompare(String(b.cookedAt ?? ""))),
    ];

    const taken = [];
    for (const item of candidates) {
      if (pending <= 0) break;
      const available = itemPortions(item);
      if (available <= 0) continue;
      const take = Math.min(available, pending);
      const left = user
        ? await adjustCookedDishPortions(user.id, item.id, -take)
        : adjustLocalCookedDishPortions(item.id, -take);
      if (left == null) continue;
      taken.push({
        itemId: item.id,
        portions: take,
        name: item.ingredientName,
        normalized: item.ingredientNormalized,
        cookedAt: item.cookedAt,
        frozen: Boolean(item.frozen),
        garnishRef: item.garnishRef ?? null,
      });
      pending -= take;
    }
    if (taken.length === 0) return null;
    return { portions: taken.reduce((s, t) => s + t.portions, 0), taken, fromFridge };
  };

  const restorePreparedPortions = async (delta) => {
    for (const t of delta?.taken ?? []) {
      const restored = user
        ? await adjustCookedDishPortions(user.id, t.itemId, t.portions)
        : adjustLocalCookedDishPortions(t.itemId, t.portions);
      if (restored != null) continue;
      const revived = {
        name: t.name ?? recipe.name,
        normalized: t.normalized ?? normalizePantryInput(t.name ?? recipe.name).normalized,
        portions: t.portions,
        qty: t.portions,
        unit: "racion",
        frozen: Boolean(t.frozen),
        itemType: "cooked_dish",
        recipeRef: catalogId,
        garnishRef: t.garnishRef ?? null,
        cookedAt: t.cookedAt,
        source: "manual",
      };
      if (user) await addPantryItems(user.id, [revived]);
      else addLocalPantryItems([revived]);
    }
  };
  // Cuándo se descuenta: "Marcar cocinado" solo resta de la despensa real si el
  // usuario eligió "Al marcarlo cocinado". Si eligió "Al crear el menú" o "Al
  // final del día", esa resta ya ocurrió (o la hará el barrido diario) y marcar
  // cocinado aquí es solo un tick informativo. Vía pantryConsumeMode para
  // respetar el modo básico, que fuerza "onGenerate".
  const shouldConsumeOnCook = pantryConsumeMode(data) === "onCook";
  const handleMarkCooked = async () => {
    if (!cookable || isCooked || cookBusy) return;
    setCookBusy(true);
    try {
      // Slot del congelador: lo que se "gasta" son raciones del tupper, no
      // ingredientes. En un slot mixto se hacen las dos cosas — salen las
      // raciones congeladas Y se descuentan los ingredientes de las frescas
      // (que `ingredients` ya trae escalados a los comensales que toca).
      const preparedDelta = slotFromPrepared
        ? await consumePreparedPortions()
        : null;
      const consumeIngredients = shouldConsumeOnCook && ingredients.length > 0;
      const { deltas, decremented } = consumeIngredients
        ? await consumeFromPantry(cookIngredients(), pantryStock, { user })
        : { deltas: [], decremented: 0 };
      setData((d) => ({
        ...d,
        cookedDishes: [...(d?.cookedDishes ?? []), cookedKey],
        cookedDeltas: { ...(d?.cookedDeltas ?? {}), [cookedKey]: deltas },
        ...(preparedDelta
          ? { cookedFreezerDeltas: { ...(d?.cookedFreezerDeltas ?? {}), [cookedKey]: preparedDelta } }
          : {}),
      }));
      if (consumeIngredients || preparedDelta) await reloadCookStock();
      if (preparedDelta) {
        onToast?.(`¡Listo! ${portionsLabel(preparedDelta.portions)} ${preparedDelta.fromFridge ? "de la nevera" : "del congelador"}`);
      } else {
        onToast?.(decremented ? `¡Cocinado! Stock en casa actualizado (${decremented})` : "¡Cocinado!");
      }
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
      const preparedDelta = data?.cookedFreezerDeltas?.[cookedKey] ?? null;
      if (preparedDelta) await restorePreparedPortions(preparedDelta);
      setData((d) => {
        const nextDeltas = { ...(d?.cookedDeltas ?? {}) };
        delete nextDeltas[cookedKey];
        const nextFreezer = { ...(d?.cookedFreezerDeltas ?? {}) };
        delete nextFreezer[cookedKey];
        return {
          ...d,
          cookedDishes: (d?.cookedDishes ?? []).filter((k) => k !== cookedKey),
          cookedDeltas: nextDeltas,
          cookedFreezerDeltas: nextFreezer,
        };
      });
      await reloadCookStock();
      if (preparedDelta) {
        onToast?.(`Deshecho · ${portionsLabel(preparedDelta.portions)} de vuelta ${preparedDelta.fromFridge ? "a la nevera" : "al congelador"}`);
      } else {
        onToast?.(restored ? `Cocinado deshecho · stock devuelto (${restored})` : "Cocinado deshecho");
      }
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
  // Nutrición: 4 base siempre + secundarios opcionales (los que existan tras el
  // enriquecimiento). Todos con el mismo look (círculos), en filas de máximo 4.
  const baseNutrients = [
    { key: "kcal", label: "kcal", value: recipe.kcal, unit: "", color: "#2d5a3d" },
    { key: "protein", label: "Proteína", value: macros.protein, unit: "g", color: "#b5734a" },
    { key: "carbs", label: "Carbohidratos", value: macros.carbs, unit: "g", color: "#c9a24a" },
    { key: "fat", label: "Grasas", value: macros.fat, unit: "g", color: "#7f9e57" },
  ];
  const extraNutrients = [
    { key: "fiber", label: "Fibra", value: macros.fiber ?? recipe.fiber_g, unit: "g", color: "#5b8a72" },
    { key: "sugar", label: "Azúcares", value: macros.sugar ?? recipe.sugar_g, unit: "g", color: "#c98aa8" },
    { key: "satfat", label: "Grasas sat.", value: macros.saturatedFat ?? recipe.saturated_fat_g, unit: "g", color: "#a86f5a" },
    { key: "sodium", label: "Sodio", value: macros.sodium ?? recipe.sodium_mg, unit: "mg", color: "#6f8aa8" },
  ];
  const nutrientCircles = [...baseNutrients, ...extraNutrients];
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

  /**
   * Los minutos que se anuncian arriba son los de la receta que se está
   * viendo, no siempre los del método.
   *
   * Con el interruptor de bases en SÍ, los pasos de abajo ya son los cortos
   * —la base sale de la nevera— pero la píldora seguía diciendo los 33
   * minutos de cocinarla desde cero. Decía una cosa y enseñaba otra.
   *
   * Solo aplica al método tradicional: el ahorro se mide sobre SUS pasos
   * (`stepsRich`), y un airfryer reescribe la receta entera, así que restarle
   * un tiempo calculado sobre otra técnica daría un número inventado.
   */
  const minutosDelPlato =
    usandoBases && activeMethod?.appliance === "base" ? vistaBases.minutos : activeMethod.time;

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

    // Método tradicional (base): si hay stepsRich, no hace falta cargar pasos planos.
    if (activeAppliance === "base") {
      if (richSteps?.length > 0) {
        setStepsLoading(false);
        return undefined;
      }
      if (mainPlainSteps.length > 0) {
        stepsCacheRef.current.base = mainPlainSteps;
        setSteps(mainPlainSteps);
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

    // Método por electrodoméstico: primero los pasos precomputados que viajan en
    // el bundle (one-off, generados con Sonnet por scripts/enrich-recipe-steps.mjs).
    // Solo si no hay precomputados se recurre a /api/recipe-steps (recetas de
    // usuario o combinaciones aún sin hornear), que a su vez cachea en Redis.
    setStepsLoading(true);
    const method = (recipe.methods ?? []).find((m) => m.appliance === activeAppliance);

    (async () => {
      const bundledApplianceSteps = await loadBundledApplianceSteps();
      if (!active) return;

      const preComputed = bundledApplianceSteps?.[recipe.id]?.[activeAppliance];
      if (Array.isArray(preComputed) && preComputed.length > 0) {
        stepsCacheRef.current[activeAppliance] = preComputed;
        setSteps(preComputed);
        setStepsLoading(false);
        return;
      }

      try {
        const r = await fetch("/api/recipe-steps", {
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
        });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const data = await r.json();
        const s = Array.isArray(data?.steps) ? data.steps : [];
        if (s.length > 0) stepsCacheRef.current[activeAppliance] = s;
        if (active) {
          setSteps(s.length > 0 ? s : recipe.steps ?? []);
          setStepsLoading(false);
        }
      } catch {
        // Fallback: muestra los pasos tradicionales si la generación falla.
        if (active) {
          setSteps(mainPlainSteps.length > 0 ? mainPlainSteps : (recipe.steps ?? []));
          setStepsLoading(false);
        }
      }
    })();

    return () => {
      active = false;
      ctrl.abort();
    };
  }, [recipe, activeAppliance, stepsByAppliance, richSteps, mainPlainSteps]);

  // Los pasos por electrodoméstico llegan de cuatro sitios (caché en memoria,
  // bundle del demo, bundle precomputado y /api/recipe-steps) y no todos usan el
  // mismo formato: el bundle ya viene enriquecido y la API todavía devuelve
  // strings. Se resuelve aquí, en el render, para que la forma que traiga cada
  // fuente dé igual y el stepper se pinte siempre que haya metadatos.
  const applianceStepList = useMemo(() => {
    if (activeAppliance === "base") return { rich: null, plain: mainPlainSteps };
    return resolveApplianceSteps(steps);
  }, [activeAppliance, steps, mainPlainSteps]);

  return (
    <div className="mp-overlay-in" style={detailOverlayStyle} onClick={onClose}>
      <div className="mp-sheet-up" style={detailSheetStyle} onClick={(e) => e.stopPropagation()}>
        <button type="button" onClick={onClose} aria-label="Cerrar detalle" style={closeButtonStyle}>
          <X size={20} />
        </button>

        {onSetFavoriteScope && !readOnly && (
          <button
            type="button"
            onClick={() => {
              if (scopeGroups.length > 1) setScopeOpen(true);
              else onSetFavoriteScope(isFavorite ? null : "all");
            }}
            aria-label={isFavorite ? "Quitar de favoritas" : "Añadir a favoritas"}
            title={isFavorite ? "Quitar de favoritas" : "Añadir a favoritas"}
            style={{ ...heroActionButtonStyle, position: "absolute", left: 26, top: 26, zIndex: 2 }}
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
          eyebrow={browse ? "Catálogo" : null}
          title={displayName}
        />

        <div style={{ padding: "18px 2px 0" }}>
          {(recipe.owner || recipe.rating || browse) && (
            <div style={{ marginBottom: 14, borderRadius: 16, background: "#fff", border: "2px solid #2d5a3d", padding: "12px 14px", display: "flex", flexDirection: "column", gap: 12 }}>
              {/* Row 1 — owner + date on the left, votes on the right, all in a
                  single horizontal line. The favorite toggle moved to the ♥ button
                  top-left of the sheet. */}
              {(recipe.owner || recipe.rating || browse) && (
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  {/* La cara abre el perfil igual que el nombre: son el mismo
                      objetivo, y tocar el avatar de alguien es el gesto que la
                      gente prueba primero. */}
                  {recipe.owner?.avatar ? (
                    <img
                      src={recipe.owner.avatar}
                      alt={recipe.owner.name ?? ""}
                      onClick={abrirPerfil ?? undefined}
                      style={{
                        width: 30, height: 30, borderRadius: 999, objectFit: "cover", flexShrink: 0,
                        cursor: abrirPerfil ? "pointer" : "default",
                      }}
                    />
                  ) : (
                    <MenuPlanBadge size={30} />
                  )}
                  {/* Nombre y fecha en VERDE los dos, con la fecha más suave.
                      El nombre iba en un azul (#2f6fb8) que no está en la
                      paleta y que no significaba nada: no era un enlace, no
                      era una categoría, era un color suelto en una ficha donde
                      todo lo demás es verde. Y entre ese azul y el gris de la
                      fecha, dos datos del mismo hecho —quién y cuándo— parecían
                      de dos sitios distintos.

                      Sin el "·" delante de la fecha: separaba dos cosas que ya
                      están separadas por un espacio y por el peso del texto, y
                      en una ficha con cuatro pastillas debajo era un punto más
                      que leer. */}
                  <div style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "baseline", gap: 7, flexWrap: "wrap" }}>
                    {abrirPerfil ? (
                      <button
                        type="button"
                        onClick={abrirPerfil}
                        style={{
                          border: "none", background: "none", padding: 0, cursor: "pointer",
                          fontFamily: "inherit", fontSize: 13.5, fontWeight: 800, color: "#2d5a3d",
                          textAlign: "left",
                        }}
                      >
                        {recipe.owner.name ?? "Tú"}
                      </button>
                    ) : (
                      <span style={{ fontSize: 13.5, fontWeight: 800, color: "#2d5a3d" }}>
                        {recipe.owner ? (recipe.owner.name ?? "Tú") : "HoMenu"}
                      </span>
                    )}
                    {recipe.createdAt && (
                      <span style={{ fontSize: 12.5, fontWeight: 700, color: "#7a9485" }}>
                        {formatRecipeDate(recipe.createdAt)}
                      </span>
                    )}
                  </div>
                  <div style={{ flexShrink: 0 }}>
                    <RecipeVoteCounts
                      up={recipe.rating?.up ?? 0}
                      down={recipe.rating?.down ?? 0}
                      userVote={readOnly ? null : userVote}
                      onVote={readOnly ? undefined : onVote}
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
              <Clock3 size={12} /> {minutosDelPlato} min
            </span>
            <span style={detailTagStyle}>
              <Gauge size={12} /> {activeMethod.difficultyLabel}
            </span>
            {recipeCost != null && (
              <span style={detailTagStyle}>
                <Euro size={12} /> ~{recipeCost.perServing.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €/ración
              </span>
            )}
            {usedAppliance && (
              <span style={detailTagStyle}>
                <UsedApplianceIcon size={12} /> {usedAppliance}
              </span>
            )}
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
          {/* Divider tras la ficha rápida. Solo si debajo hay algún bloque
              (selector de curso, adaptaciones o badges); si no, evitamos que se
              pegue al divider de Nutrientes y se vea doble. */}
          {(showGarnishCourse || showSalsaCourse || recipe.adaptations?.length > 0 || healthBadges.length > 0) && (
            <div style={{ height: 2, background: "#d5e3da", borderRadius: 2, marginBottom: 14 }} />
          )}

          {/* Selector de curso: icono a color + copy. Primer plato siempre;
              Guarnición y Salsa solo si el plato las lleva (independientes
              entre sí); Combinado en cuanto haya al menos una de las dos. */}
          {(showGarnishCourse || showSalsaCourse) && (
            <div style={{ display: "flex", justifyContent: "center", gap: 8, marginBottom: 16 }}>
              {[
                { id: "principal", Icon: CookingPot, color: "#2d5a3d", copy: "Primer plato", sub: baseName },
                showGarnishCourse && { id: "guarnicion", Icon: Salad, color: "#16a34a", copy: "Guarnición", sub: garnishRecipe ? garnishRecipe.name : STEP_PART_META.guarnicion.label },
                showSalsaCourse && { id: "salsa", Icon: Droplets, color: "#c2703d", copy: "Salsa", sub: sauceRecipe ? sauceRecipe.name : STEP_PART_META.salsa.label },
                {
                  id: "combinado", Icon: Layers2, color: "#2f6fb8", copy: "Combinado",
                  sub: [showGarnishCourse && "guarnición", showSalsaCourse && "salsa"].filter(Boolean).join(" + ") || "guarnición",
                },
              ].filter(Boolean).map(({ id, Icon, color, copy, sub }) => {
                const sel = activeCourse === id;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setActiveCourse(id)}
                    aria-pressed={sel}
                    title={`${copy} · ${sub}`}
                    style={{
                      flex: 1, minWidth: 0, maxWidth: 120,
                      display: "flex", flexDirection: "column", alignItems: "center", gap: 5,
                      padding: "9px 6px", borderRadius: 13,
                      border: sel ? `2px solid ${color}` : `1.5px solid ${color}2e`,
                      background: sel ? `${color}12` : "#fff",
                      cursor: "pointer", fontFamily: "inherit",
                      boxShadow: sel ? `0 6px 16px -10px ${color}` : "none",
                      transition: "all .15s",
                    }}
                  >
                    <Icon size={20} strokeWidth={2.3} color={color} />
                    <span style={{ fontSize: 11.5, fontWeight: sel ? 800 : 700, color: sel ? color : "#5a7066", whiteSpace: "nowrap" }}>
                      {copy}
                    </span>
                  </button>
                );
              })}
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

          {/* Mismo bloque de arriba pero en potencial: el de arriba aparece
              cuando el menú YA se generó adaptado para alguien de la casa;
              este solo al navegar el catálogo, para que un plato diga por sí
              mismo que se puede hacer sin lactosa y con qué cambio. Fuera del
              catálogo no se pinta: a quien no le afecta, le sobra. */}
          {browse && !recipe.adaptations?.length && potentialSwaps.length > 0 && (
            <div style={{
              display: "flex", alignItems: "flex-start", gap: 8,
              marginBottom: 14,
              padding: "12px 15px",
              borderRadius: 16,
              background: "#f2f9f4",
              border: "2px solid #4cba6e",
            }}>
              <MilkOff size={15} color="#2f9e52" strokeWidth={2.4} style={{ marginTop: 1, flexShrink: 0 }} />
              <div>
                <div style={{ fontSize: 11, fontWeight: 800, color: "#2f9e52", letterSpacing: ".3px", textTransform: "uppercase" }}>
                  Se puede hacer sin lactosa
                </div>
                <div style={{ fontSize: 12, fontWeight: 600, color: "#3a5a44", marginTop: 3 }}>
                  {potentialSwaps.map((a) => `${a.from} → ${a.to}`).join(" · ")}
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

          {/* Nevera / congelador: el plato ya viene marcado o hay raciones disponibles. */}
          {(slotFromPrepared || canUseFridge || canUseFreezer) && (
            <div
              style={{
                display: "flex", alignItems: "flex-start", gap: 10,
                padding: "12px 14px", borderRadius: 14, marginBottom: 14,
                background: slotFromFridge ? "#eef8f1" : slotFromFreezer ? "#eaf4fb" : "#f4f8fa",
                border: `2px solid ${slotFromFridge ? "#6aab7a" : slotFromFreezer ? "#6b8cae" : "#d3e2ec"}`,
              }}
            >
              {slotFromFridge
                ? <Refrigerator size={17} color="#2f6d8a" strokeWidth={2.5} style={{ marginTop: 1, flexShrink: 0 }} />
                : <Snowflake size={17} color="#4a7ba7" strokeWidth={2.5} style={{ marginTop: 1, flexShrink: 0 }} />}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: slotFromFridge ? "#2f6d8a" : "#3d6b93", letterSpacing: ".3px", textTransform: "uppercase" }}>
                  {slotFromPrepared
                    ? (slotFromFridge ? "De la nevera" : "Del congelador")
                    : (canUseFridge ? "Lo tienes en la nevera" : "Lo tienes en el congelador")}
                </div>
                <div style={{ fontSize: 12.5, fontWeight: 600, color: "#3a4a42", marginTop: 3, lineHeight: 1.45 }}>
                  {slotFromPrepared ? (
                    needsFreshCooking ? (
                      <>
                        Sacas {portionsLabel(preparedSplit.preparedPortions)} y cocinas{" "}
                        {preparedSplit.freshPortions} más para llegar a {slot.eaters}.
                        No hace falta comprar para las raciones ya cocinadas.
                      </>
                    ) : (
                      <>
                        {portionsLabel(preparedSplit.preparedPortions)} listas para{" "}
                        {slot.eaters === 1 ? "el comensal" : `los ${slot.eaters} comensales`}: solo hay que
                        {slotFromFridge ? " recalentar" : " descongelar"}. Este plato no entra en la compra.
                      </>
                    )
                  ) : (
                    <>
                      {canUseFridge && (
                        <>Hay {portionsLabel(fridgePortions)} en la nevera
                          {fridgeItem?.cookedAt && cookedAgoLabel(fridgeItem.cookedAt)
                            ? ` (${cookedAgoLabel(fridgeItem.cookedAt)})`
                            : ""}. </>
                      )}
                      {canUseFreezer && (
                        <>Hay {portionsLabel(freezerPortions)} en el congelador
                          {freezerItem?.cookedAt && cookedAgoLabel(freezerItem.cookedAt)
                            ? ` (${cookedAgoLabel(freezerItem.cookedAt)})`
                            : ""}. </>
                      )}
                      Úsalas y te ahorras cocinar.
                    </>
                  )}
                </div>
                {onSlotFreezerChange && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 9 }}>
                    {slotFromPrepared ? (
                      <button
                        type="button"
                        onClick={handleCookFromScratch}
                        disabled={isCooked}
                        style={{
                          padding: "8px 14px", borderRadius: 999,
                          border: "1.5px solid #a8c3d8", background: "#fff", color: "#3d6b93",
                          fontSize: 12, fontWeight: 800, cursor: isCooked ? "default" : "pointer",
                          fontFamily: "inherit", opacity: isCooked ? 0.5 : 1,
                        }}
                      >
                        Cocinarlo desde cero
                      </button>
                    ) : (
                      <>
                        {canUseFridge && (
                          <button
                            type="button"
                            onClick={handleUseFridge}
                            disabled={isCooked}
                            style={{
                              padding: "8px 14px", borderRadius: 999, border: "none",
                              background: "linear-gradient(135deg,#4a9e6e,#2f6d8a)", color: "#fff",
                              fontSize: 12, fontWeight: 800, cursor: isCooked ? "default" : "pointer",
                              fontFamily: "inherit", opacity: isCooked ? 0.5 : 1,
                            }}
                          >
                            Usar de la nevera
                          </button>
                        )}
                        {canUseFreezer && (
                          <button
                            type="button"
                            onClick={handleUseFreezer}
                            disabled={isCooked}
                            style={{
                              padding: "8px 14px", borderRadius: 999, border: "none",
                              background: "linear-gradient(135deg,#5b8fbd,#3d6b93)", color: "#fff",
                              fontSize: 12, fontWeight: 800, cursor: isCooked ? "default" : "pointer",
                              fontFamily: "inherit", opacity: isCooked ? 0.5 : 1,
                            }}
                          >
                            Usar del congelador
                          </button>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          <div style={{ height: 2, background: "#d5e3da", borderRadius: 2, marginBottom: 14 }} />

          <section className="mp-recipe-section" style={{ ...recipeBlockStyle, border: "none", background: "transparent", padding: 0 }}>
            <button
              type="button"
              onClick={() => setRecipeExpanded((v) => !v)}
              aria-expanded={recipeExpanded}
              style={{
                ...sectionTitleStyle, width: "100%", padding: 0,
                marginBottom: recipeExpanded ? 10 : 0,
                background: "none", border: "none", cursor: "pointer", fontFamily: "inherit",
              }}
            >
              <BookOpen size={16} /> Receta
              <ChevronDown
                size={16}
                strokeWidth={2.6}
                style={{ marginLeft: "auto", color: "#9db3a6", transition: "transform .18s", transform: recipeExpanded ? "rotate(180deg)" : "none" }}
              />
            </button>

            {canEditClassification && (
              <RecipeClassificationFields
                value={userCatalogRecipe}
                onChange={applyClassificationPatch}
              />
            )}

            {recipeExpanded && (
              <>
            {/* ── ¿Tienes la base hecha? ────────────────────────────
                Una PREGUNTA con su interruptor, no un botón que dice "la
                tengo". "Ya la tengo / La tengo" era equívoco: no se sabía si
                describía el estado o lo que iba a pasar al tocarlo.

                Empieza en SÍ. Es una decisión de producto, no una deducción:
                quien llega a este plato desde una semana con tanda lo normal es
                que la tenga hecha, y encontrarse la receta larga cuando no toca
                molesta más que al revés. El que no la tenga lo apaga y ve la
                receta entera.

                Una sola fila: base a la izquierda, pregunta, interruptor. El
                ahorro NO se cuenta aquí — "18 min en vez de 33" dentro de la
                tarjeta era el mismo dato que la píldora de minutos de arriba,
                dicho dos veces y con distinta forma. Ahora la píldora cambia
                sola al mover el interruptor, que es donde el usuario ya mira
                el tiempo del plato. */}
            {puedeConBases && (
              <div
                style={{
                  display: "flex", alignItems: "center", gap: 10,
                  padding: "10px 12px", marginBottom: 12, borderRadius: 12,
                  background: usandoBases ? "#e8f5ec" : "#f7f9f7",
                  outline: usandoBases ? "1.5px solid #2d5a3d" : "1px solid #e3ede6",
                  outlineOffset: -1,
                  transition: "background .15s, outline .15s",
                }}
              >
                {/* Ilustración con su nombre debajo, como en el selector de
                    bases: es la misma cosa y se reconoce por el dibujo. */}
                <div style={{ display: "flex", alignItems: "flex-start", gap: 8, flexShrink: 0 }}>
                  {vistaBases.bases.map((b) => {
                    const img = ingredientThumbSrc(BASES_UI[b.clave]?.foto ?? b.clave);
                    return (
                      <div key={b.clave} style={{ textAlign: "center", width: 54 }}>
                        {img && (
                          <img
                            src={img}
                            alt=""
                            style={{ width: 42, height: 42, objectFit: "contain", display: "block", margin: "0 auto" }}
                          />
                        )}
                        <div style={{
                          fontSize: 10, fontWeight: 800, color: "#142f1d", lineHeight: 1.15, marginTop: 2,
                        }}>
                          {BASES_UI[b.clave]?.etiqueta ?? b.nombre}
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div style={{ flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: 800, color: "#142f1d", lineHeight: 1.3 }}>
                  {vistaBases.bases.length === 1
                    ? "¿Tienes cocinada esta base?"
                    : "¿Tienes cocinadas estas bases?"}
                </div>

                <div style={{ display: "flex", flexShrink: 0, background: "#fff", borderRadius: 999, padding: 3, outline: "1.5px solid #cfe0d5", outlineOffset: -1.5 }}>
                  {[["si", "Sí", true], ["no", "No", false]].map(([id, texto, valor]) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setConBases(valor)}
                      aria-pressed={usandoBases === valor}
                      style={{
                        padding: "5px 13px", borderRadius: 999, border: "none",
                        background: usandoBases === valor ? "#2d5a3d" : "transparent",
                        color: usandoBases === valor ? "#fff" : "#7a9485",
                        fontSize: 12, fontWeight: 800, cursor: "pointer", fontFamily: "inherit",
                        transition: "background .15s, color .15s",
                      }}
                    >
                      {texto}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Segmented control: Ingredientes | Pasos */}
            <div style={{ display: "flex", background: "#eef3f0", borderRadius: 12, padding: 3, marginBottom: 14 }}>
              {[
                { id: "ingredientes", label: `Ingredientes (${courseIngredients.length})` },
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
            {recipeTab === "ingredientes" && onCombinedCourse && (
              <div style={{ marginBottom: 4 }}>
                {/* Combinado: ingredientes agrupados por curso, en secciones
                    siempre visibles — misma paridad que Pasos/Combinado, que
                    ya pinta una cabecera de color por `part` sin necesidad de
                    plegar nada. */}
                {(hasOwnParts
                  ? ["principal", "guarnicion", "salsa", "combinado"]
                      .filter((part) => (ownIngredientsByPart[part] ?? []).length > 0)
                      .map((part) => ({ key: part, label: STEP_PART_META[part].label, color: STEP_PART_META[part].color, items: ownIngredientsByPart[part] }))
                  : [
                      { key: "principal", label: recipe.name, color: "#2d5a3d", items: ingredients },
                      garnishRecipe && { key: "guarnicion", label: garnishRecipe.name, color: "#16a34a", items: garnishIngredients },
                      sauceRecipe && { key: "salsa", label: sauceRecipe.name, color: "#c2703d", items: sauceIngredients },
                    ].filter(Boolean)
                ).map((grp, gi) => (
                  <div key={grp.key} style={{ marginTop: gi === 0 ? 0 : 18 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "0 0 10px" }}>
                      <span style={{ fontSize: 12, fontWeight: 900, color: grp.color, whiteSpace: "nowrap" }}>
                        {grp.label}
                      </span>
                      <div style={{ flex: 1, borderTop: `1.5px dashed ${grp.color}44` }} />
                    </div>
                    {grp.items.map((ing, i) => (
                      <DishIngredientRow key={ing.id} ing={ing} isLast={i === grp.items.length - 1} cookable={false} />
                    ))}
                  </div>
                ))}
              </div>
            )}
            {recipeTab === "ingredientes" && !onCombinedCourse && courseIngredients.length === 0 && (
              <div style={{
                display: "flex", alignItems: "flex-start", gap: 9, marginBottom: 4,
                padding: "12px 14px", borderRadius: 12,
                background: "#f4f8fa", border: "1.5px solid #d3e2ec",
              }}>
                <Snowflake size={16} color="#4a7ba7" strokeWidth={2.4} style={{ marginTop: 1, flexShrink: 0 }} />
                <p style={{ fontSize: 12.5, color: "#3a4a42", margin: 0, fontWeight: 600, lineHeight: 1.5 }}>
                  Nada que comprar ni pesar: el plato ya está cocinado
                  {slotFromFridge ? " en la nevera" : " en el congelador"}.
                  Solo hay que {slotFromFridge ? "recalentarlo" : "descongelarlo"}.
                </p>
              </div>
            )}
            {recipeTab === "ingredientes" && !onCombinedCourse && courseIngredients.length > 0 && (
              <div style={{ marginBottom: cookable && cookCourse ? 14 : 4 }}>
                {/* El modo cocina (ticks "lo tengo" + descontar de la despensa)
                    opera sobre el plato principal; en la guarnición se muestra
                    solo la lista para no duplicar descuentos. */}
                {needsFreshCooking && cookCourse && (
                  <p style={{ fontSize: 11.5, color: "#5a6b60", margin: "0 0 10px", fontWeight: 700 }}>
                    Cantidades para las {preparedSplit.freshPortions} raciones que hay que cocinar
                    (las otras {preparedSplit.preparedPortions} {slotFromFridge ? "salen de la nevera" : "salen del congelador"}).
                  </p>
                )}
                {courseIngredients.map((ing, i) => (
                  <DishIngredientRow
                    key={ing.id}
                    ing={ing}
                    isLast={i === courseIngredients.length - 1}
                    cookable={cookable && cookCourse && !readOnly}
                    owned={cookable && cookCourse && haveByIngId[ing.id]}
                    revertible={!readOnly && cookable && cookCourse && Boolean(manuallyOwnedIds[ing.id])}
                    onMarkOwned={() => markIngredientOwned(ing)}
                    onRevertOwned={() => revertIngredientOwned(ing)}
                    deBase={usandoBases ? deBasePorNombre.get(ing.name) ?? null : null}
                  />
                ))}
              </div>
            )}
            {recipeTab === "pasos" && onGarnishCourse && (
              garnishRecipe ? (
                garnishRichSteps?.length > 0 || garnishPlainSteps.length > 0 ? (
                  <RecipeStepList rich={garnishRichSteps} plain={garnishPlainSteps} ingredients={garnishIngredients} kitchenTools={kitchenTools} />
                ) : (
                  <p style={{ fontSize: 13, color: "#8a948d", margin: 0 }}>
                    Esta guarnición no tiene pasos detallados.
                  </p>
                )
              ) : (
                <RecipeStepList rich={ownStepsByPart.guarnicion} plain={[]} ingredients={ownIngredientsByPart.guarnicion} kitchenTools={kitchenTools} />
              )
            )}
            {recipeTab === "pasos" && onSalsaCourse && (
              sauceRecipe ? (
                sauceRichSteps?.length > 0 || saucePlainSteps.length > 0 ? (
                  <RecipeStepList rich={sauceRichSteps} plain={saucePlainSteps} ingredients={sauceIngredients} kitchenTools={kitchenTools} />
                ) : (
                  <p style={{ fontSize: 13, color: "#8a948d", margin: 0 }}>
                    Esta salsa no tiene pasos detallados.
                  </p>
                )
              ) : (
                <RecipeStepList rich={ownStepsByPart.salsa} plain={[]} ingredients={ownIngredientsByPart.salsa} kitchenTools={kitchenTools} />
              )
            )}
            {recipeTab === "pasos" && onCombinedCourse && (
              hasOwnParts ? (
                // Receta propia con `part`: richSteps ya es la secuencia completa
                // (principal+guarnición/salsa+combinado intercalados); RecipeStepList
                // ya pinta una cabecera de color al cambiar de `part` entre pasos
                // consecutivos, así que no hace falta reconstruir bloques aquí.
                <RecipeStepList
                  rich={usandoBases ? vistaBases.pasos : richSteps}
                  plain={mainPlainSteps}
                  ingredients={ingredients}
                  kitchenTools={kitchenTools}
                />
              ) : (
                <>
                  {/* Combinado: pasos del plato + guarnición + salsa (los que
                      haya) en bloques etiquetados, el método tradicional de
                      cada uno por separado. */}
                  {[
                    { key: "principal", label: "Primer plato", color: "#2d5a3d", Icon: CookingPot, rich: richSteps, plain: mainPlainSteps, ings: ingredients },
                    garnishRecipe && { key: "guarnicion", label: "Guarnición", color: "#16a34a", Icon: Salad, rich: garnishRichSteps, plain: garnishPlainSteps, ings: garnishIngredients },
                    sauceRecipe && { key: "salsa", label: "Salsa", color: "#c2703d", Icon: Droplets, rich: sauceRichSteps, plain: saucePlainSteps, ings: sauceIngredients },
                  ].filter(Boolean).map((blk, bi) => (
                    <div key={blk.key} style={{ marginTop: bi === 0 ? 0 : 18 }}>
                      <div style={{
                        display: "inline-flex", alignItems: "center", gap: 6, marginBottom: 10,
                        padding: "3px 10px", borderRadius: 999,
                        background: `${blk.color}14`, color: blk.color, fontSize: 11.5, fontWeight: 800,
                      }}>
                        <blk.Icon size={13} strokeWidth={2.4} />
                        {blk.label}
                      </div>
                      <RecipeStepList rich={blk.rich} plain={blk.plain} ingredients={blk.ings} kitchenTools={kitchenTools} />
                    </div>
                  ))}
                </>
              )
            )}
            {/* Plato del congelador: los pasos de descongelado SUSTITUYEN a los de
                cocinado — no hay nada que cocinar, hay que resucitarlo. Si además
                quedan raciones frescas por hacer, debajo van los pasos normales
                con su propia etiqueta, para que se vea que son dos tareas. */}
            {recipeTab === "pasos" && activeCourse === "principal" && slotFromPrepared && (
              <div style={{ marginBottom: needsFreshCooking ? 18 : 0 }}>
                <div style={{
                  display: "inline-flex", alignItems: "center", gap: 6, marginBottom: 10,
                  padding: "3px 10px", borderRadius: 999,
                  background: slotFromFridge ? "#6aab7a14" : "#6b8cae14",
                  color: slotFromFridge ? "#2f6d8a" : "#3d6b93",
                  fontSize: 11.5, fontWeight: 800,
                }}>
                  {slotFromFridge ? <Refrigerator size={13} strokeWidth={2.4} /> : <Snowflake size={13} strokeWidth={2.4} />}
                  {slotFromFridge ? "Recalentar" : "Descongelar"} {portionsLabel(preparedSplit.preparedPortions)}
                </div>
                {thawSteps ? (
                  <RecipeStepList rich={thawSteps} plain={[]} ingredients={ingredients} kitchenTools={kitchenTools} />
                ) : (
                  <p style={{ fontSize: 13, color: "#5a6b60", margin: 0, lineHeight: 1.55 }}>
                    {slotFromFridge
                      ? "Calienta el tupper a fuego medio o en el microondas removiendo a mitad, hasta que esté caliente por dentro."
                      : "Pasa el tupper del congelador a la nevera la noche anterior. Al ir a comer, calienta a fuego medio o en el microondas removiendo a mitad, hasta que esté caliente por dentro."}
                  </p>
                )}
              </div>
            )}
            {recipeTab === "pasos" && activeCourse === "principal" && needsFreshCooking && (
              <div style={{
                display: "inline-flex", alignItems: "center", gap: 6, marginBottom: 10,
                padding: "3px 10px", borderRadius: 999,
                background: "#2d5a3d14", color: "#2d5a3d", fontSize: 11.5, fontWeight: 800,
              }}>
                <CookingPot size={13} strokeWidth={2.4} />
                Cocinar {portionsLabel(preparedSplit.freshPortions)} más
              </div>
            )}
            {recipeTab === "pasos" && activeCourse === "principal" && (!slotFromPrepared || needsFreshCooking) && (
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
                          onClick={() => { setActiveAppliance(o.appliance); onPickAppliance?.(o.appliance); }}
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
                {/* Todos los métodos pintan el mismo stepper con tiempo + tipo:
                    en los electrodomésticos es donde más importa, porque es lo
                    que distingue el rato que el aparato cocina solo del rato que
                    hay que estar delante. Si los pasos llegan sin metadatos
                    (recetas de usuario vía API), cae a la lista numerada. */}
                {activeAppliance === "base" && richSteps?.length > 0 ? (
                  <RecipeStepList
                    rich={usandoBases
                      ? vistaBases.pasos
                      : (hasOwnParts ? (ownStepsByPart.principal ?? richSteps) : richSteps)}
                    plain={mainPlainSteps}
                    ingredients={hasOwnParts ? (ownIngredientsByPart.principal ?? ingredients) : ingredients}
                    kitchenTools={kitchenTools}
                  />
                ) : stepsLoading ? (
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
                ) : applianceStepList.plain.length > 0 ? (
                  <RecipeStepList
                    rich={applianceStepList.rich}
                    plain={applianceStepList.plain}
                    ingredients={ingredients}
                    kitchenTools={kitchenTools}
                  />
                ) : (
                  <p style={{ fontSize: 13, color: "#8a948d", margin: 0 }}>
                    No se pudo cargar el paso a paso. Cierra y vuelve a abrir el plato para reintentar.
                  </p>
                )}
              </>
            )}

            {cookable && cookCourse && !readOnly && (
              <button
                type="button"
                onClick={isCooked ? handleUndoCooked : handleMarkCooked}
                disabled={cookBusy}
                title={
                  slotFromPrepared
                    ? isCooked
                      ? `Deshacer: devuelve las raciones ${slotFromFridge ? "a la nevera" : "al congelador"}`
                      : `Saca las raciones ${slotFromFridge ? "de la nevera" : "del congelador"} y las descuenta de lo que tienes en casa`
                    : isCooked
                      ? "Deshacer: devuelve estos ingredientes a lo que tienes en casa"
                      : "Descuenta estos ingredientes de lo que tienes en casa"
                }
                style={{
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 9,
                  width: "100%", marginTop: 16, padding: "13px 14px", borderRadius: 14,
                  border: "none",
                  background: isCooked
                    ? "#eaf3ec"
                    : slotFromPrepared
                      ? (slotFromFridge ? "linear-gradient(135deg,#4a9e6e,#2f6d8a)" : "linear-gradient(135deg,#5b8fbd,#3d6b93)")
                      : "linear-gradient(135deg,#3a7d52,#2d5a3d)",
                  color: isCooked ? "#2d5a3d" : "#fff",
                  fontSize: 14, fontWeight: 900,
                  cursor: cookBusy ? "default" : "pointer", fontFamily: "inherit",
                  boxShadow: isCooked
                    ? "none"
                    : slotFromPrepared
                      ? (slotFromFridge ? "0 10px 24px -10px rgba(47,109,138,.7)" : "0 10px 24px -10px rgba(61,107,147,.7)")
                      : "0 10px 24px -10px rgba(45,90,61,.7)",
                  opacity: cookBusy ? 0.6 : 1,
                  transition: "all .15s ease",
                }}
              >
                {isCooked
                  ? <Undo2 size={16} strokeWidth={2.6} />
                  : slotFromPrepared
                    ? (slotFromFridge ? <Refrigerator size={16} strokeWidth={2.4} /> : <Snowflake size={16} strokeWidth={2.4} />)
                    : <ChefHat size={16} strokeWidth={2.4} />}
                {slotFromPrepared
                  ? isCooked
                    ? (slotFromFridge ? "Deshacer recalentado" : "Deshacer descongelado")
                    : (slotFromFridge ? "Confirmar recalentado" : "Confirmar descongelado")
                  : isCooked ? "Deshacer cocinado" : "Marcar como cocinado"}
              </button>
            )}
              </>
            )}
          </section>

          {/* Nutrientes: siempre debajo de la Receta y desplegado por defecto. */}
          <div style={{ height: 2, background: "#d5e3da", borderRadius: 2, margin: "18px 0 14px" }} />
          <section style={{ ...macroCardStyle, border: "none", background: "transparent", padding: 0, marginBottom: 14 }}>
            <button
              type="button"
              onClick={() => setNutriExpanded((v) => !v)}
              aria-expanded={nutriExpanded}
              style={{
                ...sectionTitleStyle, width: "100%", padding: 0,
                marginBottom: nutriExpanded ? 14 : 0,
                background: "none", border: "none", cursor: "pointer", fontFamily: "inherit",
              }}
            >
              <Flame size={16} /> Nutrientes por ración
              {recipe.source === "user" && recipe.nutritionSource && (
                <span style={{
                  fontSize: 10, fontWeight: 800, padding: "2px 8px", borderRadius: 999,
                  color: recipe.nutritionSource === "computed" ? "#2d5a3d" : "#8a6d1f",
                  background: recipe.nutritionSource === "computed" ? "#2d5a3d14" : "#8a6d1f14",
                }}>
                  {recipe.nutritionSource === "computed" ? "Nutrición calculada" : "Estimada por IA"}
                </span>
              )}
              <ChevronDown
                size={16}
                strokeWidth={2.6}
                style={{ marginLeft: "auto", color: "#9db3a6", transition: "transform .18s", transform: nutriExpanded ? "rotate(180deg)" : "none" }}
              />
            </button>
            {nutriExpanded && (
              /* Todos los nutrientes con el mismo look (círculos), en filas de
                 máximo 4: kcal + macros base, y debajo los secundarios (fibra,
                 azúcares, grasas sat., sodio) cuando la receta los tiene. */
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", columnGap: 8, rowGap: 16 }}>
                {nutrientCircles.map(({ key, label, value, unit, color }) => (
                  <div key={key} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 7 }}>
                    <div style={{
                      width: 62, height: 62, borderRadius: "50%",
                      background: "#fff",
                      border: `3.5px solid ${color}`,
                      boxShadow: `0 2px 12px ${color}28`,
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}>
                      <span style={{ fontSize: 15, fontWeight: 900, color: "#142f1d", lineHeight: 1 }}>
                        {value == null || Number.isNaN(Number(value))
                          ? "—"
                          : <>
                              {Math.round(value)}
                              {unit && <span style={{ fontSize: 12, fontWeight: 900, color: "#142f1d" }}>{unit}</span>}
                            </>}
                      </span>
                    </div>
                    <span style={{ fontSize: 10, fontWeight: 700, color: "#7a8a7f", textAlign: "center", maxWidth: 68 }}>{label}</span>
                  </div>
                ))}
              </div>
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

          {/* Lo que dice la gente de este plato.
              Tambien en las recetas de HoMenu: los votos y los comentarios de
              una receta de la casa son igual de utiles que los de una tuya, y
              desde 0036 el dueño puede ir nulo justo para esto.
              Sin sesion no se pinta: comentar pide cuenta, y un hilo que no
              puedes usar solo estorba. */}
          {user?.id && recipe?.id && (
            <section style={{ marginTop: 18, paddingTop: 14, borderTop: "1px solid #eef3f0" }}>
              <CommentThread
                user={user}
                targetType="recipe"
                targetId={String(recipe.id).split("__").pop()}
                targetOwnerId={recipe.owner?.id ?? null}
                startOpen
              />
            </section>
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

const heroActionButtonStyle = {
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
  boxShadow: "0 1px 4px rgba(0,0,0,.12)",
};

const closeButtonStyle = {
  position: "absolute",
  right: 26,
  top: 26,
  zIndex: 2,
  ...heroActionButtonStyle,
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

// Dos columnas FIJAS: "uds" y peso. Con flex cada celda se dimensionaba por su
// contenido —y la vacia ("—") medía la mitad—, asi que el limite entre las dos
// bailaba de fila en fila: las pastillas no caian nunca en la misma vertical y
// la lista se leia como si se pisaran.
const dishIngValueGroupStyle = {
  display: "grid",
  gridTemplateColumns: "68px 58px",
  alignItems: "center",
  gap: 5,
};

const dishIngQtyCellBase = {
  width: "100%",
  boxSizing: "border-box",
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
    ...(wrap ? { whiteSpace: "normal" } : null),
    // La celda vacia se apaga, pero conserva el ancho de su columna: si
    // encogiera, arrastraria a la de al lado y se perderia la tabulacion.
    ...(isEmpty ? { color: "#c2cfc7", background: "transparent" } : null),
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

function DishIngredientRow({ ing, isLast, cookable, owned, revertible, onMarkOwned, onRevertOwned, deBase = null }) {
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
        // Lo que resuelve una tanda se atenua igual que lo que ya tienes en
        // casa, porque para esta cena significa lo mismo: no hay que hacerlo.
        // Pero NO se tacha ni se borra — sigue haciendo falta comprarlo, solo
        // que para el domingo, y una linea tachada diria lo contrario.
        opacity: owned || deBase ? 0.45 : 1,
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
          {deBase && (
            <span
              title="Lo lleva la base que ya tienes hecha"
              style={{
                display: "flex", alignItems: "center", gap: 3,
                fontSize: 10, fontWeight: 800, color: "#2d5a3d",
                marginTop: 1,
              }}
            >
              <Check size={11} strokeWidth={3} />
              Ya en la base
            </span>
          )}
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

