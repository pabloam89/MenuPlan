import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Users, Sparkles, LogOut, RotateCcw, AlertTriangle, Trash2, Check } from "lucide-react";
import { BottomNav, APP_SHELL_MAX_WIDTH, GoogleButton, GhostPillButton } from "./components/ui.jsx";
import {
  OnboardingMembers,
  OnboardingRestrictions,
  OnboardingRepeat,
  OnboardingMenuModel,
  OnboardingMealStyle,
  OnboardingSchedule,
  OnboardingSchoolMenu,
  OnboardingCooking,
  OnboardingWeek,
  AfinarWizardBubble,
  IndividualMenuSheet,
} from "./screens/Onboarding.jsx";
import { OnboardingProgressContext } from "./screens/onboardingProgressContext.js";
import { MenuScreen, DishDetail } from "./screens/Menu.jsx";
const ValuePropsCarousel = lazy(() => import("./screens/ValueProps.jsx").then(m => ({ default: m.ValuePropsCarousel })));
const ShoppingScreen = lazy(() => import("./screens/Shopping.jsx").then(m => ({ default: m.ShoppingScreen })));
const AnalyticsScreen = lazy(() => import("./screens/Analytics.jsx").then(m => ({ default: m.AnalyticsScreen })));
const SettingsScreen = lazy(() => import("./screens/Settings.jsx").then(m => ({ default: m.SettingsScreen })));
const AccountScreen = lazy(() => import("./screens/Settings.jsx").then(m => ({ default: m.AccountScreen })));
const PantryScreen = lazy(() => import("./screens/Pantry.jsx").then(m => ({ default: m.PantryScreen })));
const DashboardScreen = lazy(() => import("./screens/Dashboard.jsx").then(m => ({ default: m.DashboardScreen })));
const RecipePlannerScreen = lazy(() => import("./screens/RecipePlanner.jsx").then(m => ({ default: m.RecipePlannerScreen })));
const RecipesScreen = lazy(() => import("./screens/RecipesScreen.jsx").then(m => ({ default: m.RecipesScreen })));
const HomeProfileScreen = lazy(() => import("./screens/HomeProfileScreen.jsx").then(m => ({ default: m.HomeProfileScreen })));
import { generateMenuWithAI, pickCatalogReplacement, catalogToFrontendRecipe } from "./lib/aiPlanner.js";
import { resolvePlannerModel } from "./lib/aiModels.js";
import { findMenuRestrictionConflicts } from "./utils/menuConflicts.js";
import { GeneratingScreen } from "./screens/GeneratingScreen.jsx";
import { buildShoppingList } from "./lib/shoppingBuilder.js";
import { normalizeIngredientKey } from "./lib/ingredientCategories.js";
import { getMeals } from "./lib/planner.js";
import {
  groupsFromModel,
  migrateGroupsForBabies,
  memberIsBaby,
  canSplitMenus,
  hasUnderageMember,
  createIndividualMenuGroup,
  individualMenuGroupFor,
  pruneExpiredIndividualMenus,
  adhocReasonLabel,
  resolveMemberAge,
} from "./lib/groups.js";
import { loadState, saveState, clearState } from "./lib/storage.js";
import {
  clampWeekCount,
  computeWeekRange,
  createMenuId,
  foldInNewMenu,
  removeMenu,
  toggleMenuFavorite,
  collectMenuRecipeIds,
  pruneAiRecipes,
  pruneMenuHistory,
  planHasDishes,
  orderedWeeks,
} from "./lib/menuArchive.js";
import { todayDayIdx } from "./lib/weekCalendar.js";
import {
  saveMenu as saveMenuRemote,
  loadMenuSummaries as loadMenuSummariesRemote,
  loadMenuWeekRanges as loadMenuWeekRangesRemote,
  loadMenuDetail as loadMenuDetailRemote,
  activateMenu as activateMenuRemote,
  deleteMenu as deleteMenuRemote,
  toggleMenuFavorite as toggleMenuFavoriteRemote,
  saveAndActivateMenu,
  queueSaveMenuWeek,
} from "./lib/menusSync.js";
const MenusScreen = lazy(() => import("./screens/MenusScreen.jsx").then(m => ({ default: m.MenusScreen })));
const MenuHistoryView = lazy(() => import("./screens/MenuHistoryView.jsx").then(m => ({ default: m.MenuHistoryView })));
import { registerRecipes, RECIPES_BY_ID } from "./data/recipes.js";
import {
  toggleRecipeVote,
  setFavoriteScope,
  voteOf,
  favScopeOf,
  isRecipeFavorite,
  mergeVotes,
  loadRecipeVotes,
  saveRecipeVote,
  deleteRecipeVote,
  upsertRecipeVotes,
} from "./lib/recipeVotes.js";
import { loadUserState, saveUserState, clearUserState } from "./lib/userState.js";
import { shouldAdoptRemoteProfile } from "./lib/profileMerge.js";
import {
  loadUserRecipes,
  upsertUserRecipe,
  upsertUserRecipes,
  updateRecipeVisibility,
  deleteUserRecipe,
} from "./lib/userRecipesSync.js";
import { migrateFixedDishes } from "./lib/fixedDishes.js";
import { buildGarnishComboRecipe } from "./lib/userRecipes.js";
import { suggestHomeRole, migrateHomeRole } from "./lib/stages.js";
import { migrateCookTime, COOK_TIME_DEFAULTS } from "./lib/cookTime.js";
import { navDirection } from "./lib/motion.js";
import { useAuth } from "./lib/useAuth.js";
import { FeedbackFAB } from "./components/FeedbackFAB.jsx";
import { HomeCoachTour, RecipesCoachTour, MenuCoachTour } from "./components/HomeCoachTour.jsx";
import { trackEvent, upsertUserProfile, APP_VERSION } from "./lib/analytics.js";
import { loadPantry, loadLocalPantry, mergeLocalPantryIntoCloud } from "./lib/pantry.js";
import demoState from "./dev/demoState.json";

const DEV_DEMO_MENU =
  import.meta.env.DEV &&
  new URLSearchParams(window.location.search).get("demo") === "1";

// Dev/support helper: open the app with ?tour=1 to see the *whole* first-time
// experience end to end — the value-prop carousel, then every guided
// coach-mark tour (Home, Recetas, Tu menú) — regardless of what's actually
// saved in this browser. Loads the same demo data as ?demo=1 (a family +
// an already-generated menú) so there's something real for every coach-mark
// to point at, but starts from the splash screen like a genuine first visit.
const FORCE_TOUR =
  import.meta.env.DEV &&
  new URLSearchParams(window.location.search).get("tour") === "1";

// Dev/support helper: open the app with ?tutorial=1 to replay the first-run
// value-prop carousel on demand, regardless of the "seen" flag or saved data.
const FORCE_VALUE_PROPS =
  FORCE_TOUR ||
  new URLSearchParams(window.location.search).get("tutorial") === "1";

// Temporary dietary states heavy/disruptive enough to warrant offering a
// separate ad-hoc individual menu instead of restricting the whole family.
const HEAVY_DIETARY_STATES = ["dieta_blanda"];

// Max menú-weeks generated concurrently. Weeks are independent (deterministic
// cross-week variety, see aiPlanner#poolForWeek), so they run in parallel — but
// each week fans out to one LLM call per group, so we cap the burst to stay well
// under Anthropic rate limits (e.g. 4 weeks × 2 groups would be 8 in flight).
const WEEK_CONCURRENCY = 3;

// Runs `fn` over `items` with at most `limit` in flight, preserving input order
// in the returned results array. Rejects on the first error (like Promise.all).
async function mapWithConcurrency(items, limit, fn) {
  const results = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const i = cursor++;
      results[i] = await fn(items[i], i);
    }
  }
  const workers = Array.from(
    { length: Math.max(1, Math.min(limit, items.length)) },
    worker,
  );
  await Promise.all(workers);
  return results;
}

// Shared copy/branding for the reset-family confirmation sheet. "abandon" and
// "soft" are low-stakes (nothing valuable is lost), so they get MenuPlan's
// friendly brand green; "hard"/"delete" actually destroy data, so the accent
// leans amber/red instead — same layout and type everywhere, just the tone.
const RESET_VARIANTS = {
  soft: {
    Icon: RotateCcw,
    tone: "brand",
    title: "¿Reiniciar el menú?",
    desc: "Se borrará el menú de esta semana y la lista de la compra. Tu familia, recetas y preferencias se mantienen.",
    confirmLabel: "Reiniciar menú",
  },
  hard: {
    Icon: AlertTriangle,
    tone: "danger",
    title: "¿Reiniciar todo?",
    desc: "Se borrarán todos tus datos, menús y configuración. Esta acción no se puede deshacer.",
    confirmLabel: "Reiniciar todo",
  },
  delete: {
    Icon: Trash2,
    tone: "danger",
    title: "¿Eliminar tu cuenta?",
    desc: "Se borrarán todos tus datos y se cerrará tu sesión. Esta acción no se puede deshacer.",
    confirmLabel: "Eliminar cuenta",
  },
  abandon: {
    Icon: LogOut,
    tone: "brand",
    title: "¿Salir sin generar el menú?",
    desc: "Se perderá lo que has configurado en este asistente. Tu familia, recetas y menú actual no se ven afectados.",
    confirmLabel: "Salir",
  },
};

const INITIAL_DATA = {
  members: [],
  dislikes: [],
  customAllergies: [],
  customDislikes: [],
  fixedDishes: [],
  // When true, mapped «En casa» stock soft-biases menu generation (pantryScore
  // + LLM nudge). Shopping still discounts stock either way.
  useHomeStock: true,
  // Recipes created by the user via the recipe planner. Same shape as the
  // bundled catalog (see src/data/recipes/*.json) plus source:"user".
  userRecipes: [],
  // Per-user recipe like/dislike ratings + favorite scope, keyed by recipe id.
  // See lib/recipeVotes.js — the two are independent (VoteEntry: { v, fav }).
  recipeVotes: {},
  menuModel: "same",
  groups: [],
  meals: ["Comida", "Cena"],
  schedule: {},
  // schoolMenus: { shared: { "Lun-Primero": "...", "Lun-Segundo": "...", "Lun-Postre": "..." },
  //                byMember: { [memberId]: { ... } } }
  schoolMenus: { shared: {}, byMember: {} },
  // Active goal ids selected globally (used as fallback when a group has no
  // override yet, and as the canonical list before menuModel is set).
  goals: [],
  // Catalogue of available goal chips. Default ones are seeded on migration.
  // Each entry has a stable `id` (used by the planner) and a user-editable
  // `label`. Custom entries (`isCustom: true`) can also be removed.
  goalDefs: [],
  kcal: 2000,
  freqs: { legumbres: 2, verdura: 3, pescado: 2 },
  // Per-group overrides; when missing, fall back to the global values above.
  goalsByGroup: {},
  kcalByGroup: {},
  freqsByGroup: {},
  cookLevel: "normal",
  cookSkills: [],
  kitchenTools: [],
  customKitchenTools: [],
  cookTime: { ...COOK_TIME_DEFAULTS },
  timeWeekday: 30,
  timeWeekend: 60,
  hasBudget: false,
  budget: 80,
  supermarkets: [],
  // menuWeek: { offset: 0=current/1=next/2=in2weeks, startDayIdx: 0-6 (Mon-Sun) }
  // — always mirrors the EARLIEST offset in menuWeekOffsets below.
  menuWeek: null,
  // Which weeks (offsets from "today", 0=this week) to generate in one go.
  // Not necessarily consecutive — e.g. [0, 2] skips next week (holiday).
  menuWeekOffsets: [0],
  // "strict" = bias every week against repeating dishes from ANY earlier
  // week of the same menú; "moderate" = only vs. the immediately preceding
  // week; "relaxed" = no cross-week bias (deliberate repeats OK).
  menuVarietyPref: "strict",
  // Whether every selected week reuses the exact same "quién come dónde"
  // pattern (the common case) or each can be customized independently.
  menuScheduleSameForAllWeeks: true,
  // Per-week schedule overrides, keyed by week OFFSET (not position), only
  // used when menuScheduleSameForAllWeeks is false. Absent = that week
  // inherits the base `schedule` pattern. See OnboardingSchedule.
  menuWeekOverrides: {},
  // Archive of generated menús, keyed by id — see lib/menuArchive.js.
  // { [menuId]: { id, createdAt, isFavorite, isActive, varietyPref, weeks } }
  menus: {},
  activeMenuId: null,
  // ── Precios / Gasto (lib/priceHistory.js) ──
  // Individual price observations, one per receipt/manual line that mapped to a
  // canonical ingredient: { id, ingredientId, name, brand, store, price, qty,
  // unit, purchasedAt, source: "receipt"|"manual", receiptId }.
  priceObs: [],
  // Learned mappings so a cryptic receipt line only needs confirming once:
  // { [normalizedReceiptLine]: ingredientId }.
  priceAliases: {},
  // Uploaded receipts (the "facturas" inbox): { id, createdAt, store,
  // purchasedAt, total, lineCount }.
  receipts: [],
};

// Ad-hoc menus used to be labeled by the member's name ("Menú de X"); now
// they're labeled by what they're for ("Dieta blanda"). Heals any group
// saved under the old scheme (localStorage or cloud) so every reader of
// `group.label` — scope pickers, exports, insights — sees the current
// wording without needing per-call special-casing.
function healAdhocGroupLabels(groups) {
  if (!Array.isArray(groups)) return groups;
  return groups.map((g) =>
    g.adHoc && g.label !== adhocReasonLabel(g.reason)
      ? { ...g, label: adhocReasonLabel(g.reason) }
      : g,
  );
}

function migrate(state) {
  if (!state) return null;
  const d = state.data ?? INITIAL_DATA;
  if (Array.isArray(d.schedule) || typeof d.schedule !== "object" || d.schedule === null) {
    d.schedule = {};
  }
  // Members: ensure id + allergies/dislikes arrays.
  // Old schema had global `data.allergies`; move it to every member so nothing is lost.
  const legacyAllergies = Array.isArray(d.allergies) ? d.allergies : [];
  if (Array.isArray(d.members)) {
    d.members = d.members.map((m) => {
      // Delegates to the single source of truth (lib/stages.js's
      // resolveMemberAge) instead of re-deriving the birthDate math here, so
      // this migration step can never silently drift from the onboarding
      // form's own calculation.
      const age = resolveMemberAge(m);
      return {
        ...m,
        id: m.id ?? Math.random().toString(36).slice(2, 10),
        allergies: Array.isArray(m.allergies)
          ? m.allergies
          : [...legacyAllergies],
        // Predefined intolerances (lactosa_fina, fructosa, sorbitol) and
        // temporary dietary states (embarazo, lactancia) — hard exclusions.
        intolerances: Array.isArray(m.intolerances) ? m.intolerances : [],
        dietaryStates: Array.isArray(m.dietaryStates) ? m.dietaryStates : [],
        healthProfiles: Array.isArray(m.healthProfiles)
          ? m.healthProfiles
          : typeof m.healthProfile === "string" && m.healthProfile
            ? [m.healthProfile]
            : [],
        dislikes: Array.isArray(m.dislikes) ? m.dislikes : [],
        useBirthDate: Boolean(m.useBirthDate),
        birthDate: typeof m.birthDate === "string" ? m.birthDate : "",
        homeRole: migrateHomeRole(
          typeof m.homeRole === "string" && m.homeRole ? m.homeRole : suggestHomeRole(age),
        ),
      };
    });
  }
  d.groups = Array.isArray(d.groups) ? d.groups : [];
  if (d.members?.length) {
    const model = d.menuModel ?? "same";
    const base =
      d.groups.length > 0 ? d.groups : groupsFromModel(d.members, model);
    d.groups = migrateGroupsForBabies(d.members, base, model);
  }
  d.groups = healAdhocGroupLabels(d.groups);
  d.customAllergies = Array.isArray(d.customAllergies) ? d.customAllergies : [];
  d.customDislikes = Array.isArray(d.customDislikes) ? d.customDislikes : [];
  if (!d.menuModel) d.menuModel = "same";
  if (!Array.isArray(d.meals) || d.meals.length === 0) {
    d.meals = ["Comida", "Cena"];
  }
  if (!d.freqs || typeof d.freqs !== "object") {
    d.freqs = { legumbres: 2, verdura: 3, pescado: 2 };
  }
  // Seed the editable goal catalogue + migrate legacy `goals` (labels) and
  // `customGoals` (legacy free-text chips) onto stable ids.
  const slugify = (label) =>
    String(label ?? "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
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
  if (!Array.isArray(d.goalDefs) || d.goalDefs.length === 0) {
    d.goalDefs = DEFAULT_GOAL_DEFS.map((g) => ({ ...g, isCustom: false }));
    if (Array.isArray(d.customGoals)) {
      for (const label of d.customGoals) {
        const id = slugify(label) || `custom-${Math.random().toString(36).slice(2, 8)}`;
        if (!d.goalDefs.some((g) => g.id === id)) {
          d.goalDefs.push({ id, label, profile: {}, isCustom: true });
        }
      }
    }
  } else {
    // Ensure every default goal still exists (so the user can re-enable them
    // even after a partial removal in older app versions).
    for (const def of DEFAULT_GOAL_DEFS) {
      if (!d.goalDefs.some((g) => g.id === def.id)) {
        d.goalDefs.push({ ...def, isCustom: false });
      }
    }
  }
  // Convert legacy `goals` array (labels) to ids.
  if (Array.isArray(d.goals) && d.goals.length > 0 && typeof d.goals[0] === "string") {
    const labelToId = (label) => {
      const lower = String(label).toLowerCase();
      const def = d.goalDefs.find(
        (g) => g.label.toLowerCase() === lower || g.id === lower
      );
      return def?.id ?? null;
    };
    const converted = d.goals.map(labelToId).filter(Boolean);
    // Detect "already ids" by checking against existing defs; only overwrite
    // if the migration changed anything.
    const allIdsAlready = d.goals.every((v) => d.goalDefs.some((g) => g.id === v));
    if (!allIdsAlready) d.goals = Array.from(new Set(converted));
  }
  if (!Array.isArray(d.goals)) d.goals = [];
  delete d.customGoals;
  // Per-group overrides containers.
  if (!d.goalsByGroup || typeof d.goalsByGroup !== "object") d.goalsByGroup = {};
  if (!d.kcalByGroup || typeof d.kcalByGroup !== "object") d.kcalByGroup = {};
  if (!d.freqsByGroup || typeof d.freqsByGroup !== "object") d.freqsByGroup = {};
  if (!d.goalsManualByGroup || typeof d.goalsManualByGroup !== "object") {
    d.goalsManualByGroup = {};
  }
  if (!Array.isArray(d.cookSkills)) d.cookSkills = [];
  if (!Array.isArray(d.kitchenTools)) d.kitchenTools = [];
  if (!Array.isArray(d.customKitchenTools)) d.customKitchenTools = [];
  // Normalize school menus: courses (Primero/Segundo/Postre) instead of meals.
  // Migrate any legacy "*-Comida" or "*-Cena" entries → "*-Segundo".
  const SCHOOL_COURSES_VALID = new Set(["Primero", "Segundo", "Postre"]);
  const normalizeCoursesMap = (raw) => {
    if (!raw || typeof raw !== "object") return {};
    const out = {};
    for (const [k, v] of Object.entries(raw)) {
      if (typeof v !== "string") continue;
      const trimmed = v.trim();
      if (!trimmed) continue;
      const parts = k.split("-");
      if (parts.length !== 2) continue;
      const [day, slot] = parts;
      if (SCHOOL_COURSES_VALID.has(slot)) {
        out[k] = trimmed;
      } else if (slot === "Comida") {
        const target = `${day}-Segundo`;
        if (!out[target]) out[target] = trimmed;
      }
      // ignore "*-Cena" and any other legacy entries
    }
    return out;
  };
  if (!d.schoolMenus || typeof d.schoolMenus !== "object") {
    d.schoolMenus = { shared: {}, byMember: {} };
  } else {
    const byMemberRaw =
      d.schoolMenus.byMember && typeof d.schoolMenus.byMember === "object"
        ? d.schoolMenus.byMember
        : {};
    const byMember = {};
    for (const [memberId, courses] of Object.entries(byMemberRaw)) {
      byMember[memberId] = normalizeCoursesMap(courses);
    }
    d.schoolMenus = {
      shared: normalizeCoursesMap(d.schoolMenus.shared),
      byMember,
    };
  }
  delete d.allergies;
  d.fixedDishes = migrateFixedDishes(d.fixedDishes);
  if (typeof d.useHomeStock !== "boolean") d.useHomeStock = true;
  d.userRecipes = Array.isArray(d.userRecipes) ? d.userRecipes : [];
  d.recipeVotes = d.recipeVotes && typeof d.recipeVotes === "object" ? d.recipeVotes : {};
  d.cookTime = migrateCookTime(d);
  d.menus = d.menus && typeof d.menus === "object" && !Array.isArray(d.menus) ? d.menus : {};
  d.activeMenuId = typeof d.activeMenuId === "string" ? d.activeMenuId : null;
  // Precios / Gasto
  d.priceObs = Array.isArray(d.priceObs) ? d.priceObs : [];
  d.priceAliases = d.priceAliases && typeof d.priceAliases === "object" && !Array.isArray(d.priceAliases) ? d.priceAliases : {};
  d.receipts = Array.isArray(d.receipts) ? d.receipts : [];
  // Legacy shape: a single consecutive count from week 1 → [0, 1, ..., n-1].
  if (!Array.isArray(d.menuWeekOffsets) || d.menuWeekOffsets.length === 0) {
    const legacyCount = clampWeekCount(d.menuWeekCount ?? 1);
    d.menuWeekOffsets = Array.from({ length: legacyCount }, (_, i) => i);
  }
  delete d.menuWeekCount;
  d.menuVarietyPref = ["strict", "moderate", "relaxed"].includes(d.menuVarietyPref)
    ? d.menuVarietyPref
    : d.menuVarietyPref === "max" ? "strict" : d.menuVarietyPref === "relaxed" ? "relaxed" : "strict";
  d.menuScheduleSameForAllWeeks = d.menuScheduleSameForAllWeeks !== false;
  d.menuWeekOverrides =
    d.menuWeekOverrides && typeof d.menuWeekOverrides === "object" ? d.menuWeekOverrides : {};
  // Backfill: `menuPlan`/`shopping` predate the multi-week archive (`data.menus`)
  // and live outside `data` (see App() — they're their own useState, restored
  // from `state.menuPlan`/`state.shopping`). An account whose last menú was
  // generated before this feature shipped has real content there but an empty
  // archive, which made MenusScreen ("Menús") report "no tienes menú" while
  // Dashboard/MenuScreen (which still read menuPlan directly) showed it fine.
  // Synthesize a single-week archive entry from it so both screens agree.
  // Only fires once: after this runs, `d.menus` is non-empty and the whole
  // block is skipped on every later load. Guarded on `state.menuPlan` still
  // having content so a legitimately-deleted active menú isn't resurrected.
  // Guard on real dishes (not just key count): a plan always carries a
  // `_warnings` array, so an empty/aborted plan (`{ _warnings: [] }`) would
  // otherwise synthesize a phantom "Menú actual" card with a date but no food.
  if (Object.keys(d.menus).length === 0 && planHasDishes(state.menuPlan)) {
    const offset = d.menuWeek?.offset ?? 0;
    const startDayIdx = d.menuWeek?.startDayIdx ?? 0;
    const { startISO, endISO } = computeWeekRange(offset, startDayIdx);
    const legacyMenu = {
      id: createMenuId(),
      createdAt: Date.now(),
      isFavorite: false,
      isActive: true,
      varietyPref: d.menuVarietyPref,
      weeks: {
        [startISO]: {
          offset,
          startDayIdx,
          startISO,
          endISO,
          plan: state.menuPlan,
          shopping: state.shopping ?? { items: [] },
          schedule: d.schedule,
        },
      },
    };
    d.menus = { [legacyMenu.id]: legacyMenu };
    d.activeMenuId = legacyMenu.id;
  }
  return { ...state, data: { ...INITIAL_DATA, ...d } };
}

export default function App() {
  const persisted = useMemo(
    () => (DEV_DEMO_MENU || FORCE_TOUR ? migrate(demoState) : migrate(loadState())),
    []
  );
  const [screen, setScreen] = useState(
    DEV_DEMO_MENU ? (persisted?.screen ?? "menu") : "splash"
  );
  // "pantry" is opened from Compra / nav Inicio — remembers which so "Atrás"
  // returns there instead of always landing on dashboard.
  const [pantryOrigin, setPantryOrigin] = useState("dashboard");
  // Bumps after mergeLocalPantryIntoCloud so Pantry/Shopping/onboarding reload
  // stock once the local→cloud fold finishes (avoids a stale empty list).
  const [pantryEpoch, setPantryEpoch] = useState(0);
  const [onbStep, setOnbStep] = useState(persisted?.onbStep ?? 0);
  // Which history entry is open in the read-only viewer (screen "menuHistory").
  const [historyMenuId, setHistoryMenuId] = useState(null);
  // "Afinar o generar ya" bubble — shown once on the first onboarding screen
  // after Members (whichever is visible), remembered locally so it never nags.
  const [afinarBubbleSeen, setAfinarBubbleSeen] = useState(() => {
    try {
      return Boolean(localStorage.getItem("mp_onb_afinar_seen"));
    } catch {
      return false;
    }
  });
  const dismissAfinarBubble = useCallback(() => {
    try {
      localStorage.setItem("mp_onb_afinar_seen", "1");
    } catch {
      // ignore storage failures (private mode, etc.)
    }
    setAfinarBubbleSeen(true);
  }, []);
  // First-run value-prop carousel — shown once, only to brand-new guests before
  // onboarding (see the splash "onNext" wiring). Remembered locally so it never
  // reappears after the first pass.
  const [valuePropsSeen, setValuePropsSeen] = useState(() => {
    if (FORCE_TOUR) return false;
    try {
      return Boolean(localStorage.getItem("mp_value_props_seen"));
    } catch {
      return false;
    }
  });
  const markValuePropsSeen = useCallback(() => {
    try {
      localStorage.setItem("mp_value_props_seen", "1");
    } catch {
      // ignore storage failures (private mode, etc.)
    }
    setValuePropsSeen(true);
  }, []);
  // Home coach-marks — guided highlights over the Home actions + nav tabs,
  // shown once the first time a user reaches the dashboard. Remembered locally
  // so it never nags again.
  const [homeCoachSeen, setHomeCoachSeen] = useState(() => {
    if (FORCE_TOUR) return false;
    try {
      return Boolean(localStorage.getItem("mp_home_coachmarks_seen"));
    } catch {
      return false;
    }
  });
  const markHomeCoachSeen = useCallback(() => {
    try {
      localStorage.setItem("mp_home_coachmarks_seen", "1");
    } catch {
      // ignore storage failures (private mode, etc.)
    }
    setHomeCoachSeen(true);
  }, []);
  // Recetas coach-marks — same idea, shown once the first time the Recetas
  // screen is opened, explaining "Crear" and the three tabs.
  const [recipesCoachSeen, setRecipesCoachSeen] = useState(() => {
    if (FORCE_TOUR) return false;
    try {
      return Boolean(localStorage.getItem("mp_recipes_coachmarks_seen"));
    } catch {
      return false;
    }
  });
  const markRecipesCoachSeen = useCallback(() => {
    try {
      localStorage.setItem("mp_recipes_coachmarks_seen", "1");
    } catch {
      // ignore storage failures (private mode, etc.)
    }
    setRecipesCoachSeen(true);
  }, []);
  // "Tu menú" coach-marks — shown once the first time the user sees a generated
  // menu, explaining Tu perfil, filtros, día/semana, los platos y el nav.
  const [menuCoachSeen, setMenuCoachSeen] = useState(() => {
    if (FORCE_TOUR) return false;
    try {
      return Boolean(localStorage.getItem("mp_menu_coachmarks_seen"));
    } catch {
      return false;
    }
  });
  const markMenuCoachSeen = useCallback(() => {
    try {
      localStorage.setItem("mp_menu_coachmarks_seen", "1");
    } catch {
      // ignore storage failures (private mode, etc.)
    }
    setMenuCoachSeen(true);
  }, []);
  const [data, setData] = useState(persisted?.data ?? INITIAL_DATA);
  // Safety net: if a history entry gets deleted (e.g. from another tab/
  // device, or a race the per-row delete-button guard in MenusScreen didn't
  // catch) while the user is viewing it, the "menuHistory" screen block
  // simply renders nothing (no fallback branch) — bounce back to the list
  // instead of leaving a blank screen with no BottomNav.
  useEffect(() => {
    if (screen === "menuHistory" && historyMenuId && !data.menus?.[historyMenuId]) {
      setScreen("menus");
    }
  }, [screen, historyMenuId, data.menus]);
  const [menuPlan, setMenuPlan] = useState(persisted?.menuPlan ?? {});
  const [shopping, setShopping] = useState(persisted?.shopping ?? { items: [] });
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [toast, setToast] = useState(null);
  const [isGeneratingMenu, setIsGeneratingMenu] = useState(false);
  const [menuError, setMenuError] = useState(null);
  // Detects dishes already in menuPlan that no longer respect a member's
  // current allergies/intolerances (e.g. edited from "Tu perfil" after the
  // menu was generated, declining regeneration). Pure/deterministic — see
  // utils/menuConflicts.js. Recomputed whenever restrictions, groups or the
  // plan itself change.
  const restrictionConflicts = useMemo(
    () => findMenuRestrictionConflicts(data, menuPlan),
    [data, menuPlan],
  );
  const lastRegenerateArgs = useRef(null);
  const generateAbortRef = useRef(null);
  // Warn at most once per session if localStorage writes start failing
  // (full quota, private-mode Safari) — see the debounced saveState effect
  // below. Without this, the app silently stops persisting ANY state
  // (profile, restrictions, active menu) with zero signal to the user.
  const storageQuotaWarnedRef = useRef(false);
  // Auto-triggered ad-hoc individual menu prompt: { memberId, reason }.
  const [individualPrompt, setIndividualPrompt] = useState(null);
  // Member+reason pairs we've already offered, so we don't re-prompt in a loop.
  const promptedIndividualRef = useRef(new Set());

  // Re-hydrate AI-generated recipes from persisted state so DishCard
  // can resolve ids after a reload.
  useEffect(() => {
    const dyn = persisted?.aiRecipes;
    if (Array.isArray(dyn) && dyn.length > 0) registerRecipes(dyn);
  }, [persisted]);
  const [aiRecipes, setAiRecipes] = useState(persisted?.aiRecipes ?? []);

  // User-created recipes must live in RECIPES_BY_ID for DishDetail — but in the
  // "frontend" shape (macros object, scaled ingredients), not the raw catalog
  // shape (flat protein_g/…). Registering them raw made DishDetail crash on
  // recipe.macros.protein when a user opened their own recipe from the catalog.
  useEffect(() => {
    const own = data.userRecipes ?? [];
    if (own.length === 0) return;
    const eaters = Math.max(1, data.members?.length || 4);
    registerRecipes(own.map((r) => catalogToFrontendRecipe(r, eaters)));
  }, [data.userRecipes, data.members]);

  const { user, signInWithGoogle, signOut } = useAuth();

  // Debounced: serializar todo el estado a localStorage en cada pulsación de
  // tecla del onboarding es perceptible en móviles modestos. Si la cuota está
  // llena, saveState compacta historial/gasto y reintenta; sincronizamos ese
  // recorte al estado React para no volver a fallar en el siguiente tick.
  useEffect(() => {
    const t = window.setTimeout(() => {
      const result = saveState({ screen, onbStep, data, menuPlan, shopping, aiRecipes });
      if (result.ok && result.pruned && result.saved) {
        const prunedData = result.saved.data;
        setData((d) => {
          const menusShrunk =
            Object.keys(prunedData?.menus ?? {}).length < Object.keys(d.menus ?? {}).length;
          const obsShrunk = (prunedData?.priceObs?.length ?? 0) < (d.priceObs?.length ?? 0);
          const receiptsShrunk = (prunedData?.receipts?.length ?? 0) < (d.receipts?.length ?? 0);
          if (!menusShrunk && !obsShrunk && !receiptsShrunk) return d;
          return {
            ...d,
            menus: prunedData.menus ?? d.menus,
            priceObs: prunedData.priceObs ?? d.priceObs,
            receipts: prunedData.receipts ?? d.receipts,
          };
        });
        const prunedAi = result.saved.aiRecipes ?? [];
        setAiRecipes((cur) => (prunedAi.length < cur.length ? prunedAi : cur));
      }
      if (!result.ok && !storageQuotaWarnedRef.current) {
        storageQuotaWarnedRef.current = true;
        showToast(
          user
            ? "Memoria del navegador llena: se ha intentado liberar historial antiguo. Si sigue fallando, borra datos del sitio o usa otra sesión."
            : "No se ha podido guardar tu progreso en este dispositivo (memoria llena). Inicia sesión para no perderlo.",
        );
      }
    }, 400);
    return () => window.clearTimeout(t);
  }, [screen, onbStep, data, menuPlan, shopping, aiRecipes, user]);

  // ── Cloud sync (Supabase) ──────────────────────────────────────
  // localStorage stays the working source of truth; these effects mirror it to
  // the account so the profile, user recipes and favorites survive across
  // devices and a "smart reset". Everything no-ops without a signed-in session.
  const hydratedUserRef = useRef(null);
  const cloudReadyRef = useRef(false);
  // Kept live (not just captured once) so the one-time legacy backfill below
  // can tell whether a menú it's about to activate in the cloud is still
  // actually the active one locally — the user may generate a brand new menú
  // while the backfill's slow sequential loop is still in flight.
  const activeMenuIdRef = useRef(data.activeMenuId);
  useEffect(() => {
    activeMenuIdRef.current = data.activeMenuId;
  }, [data.activeMenuId]);

  useEffect(() => {
    if (!user?.id) {
      cloudReadyRef.current = false;
      hydratedUserRef.current = null;
      return;
    }
    if (hydratedUserRef.current === user.id) return;
    hydratedUserRef.current = user.id;

    // Capture local-only blobs before any await so a mid-hydration edit
    // isn't the source of truth for the union (same as before).
    const localRecipes = data.userRecipes ?? [];
    const localVotes = data.recipeVotes ?? {};
    const localMenus = data.menus ?? {};
    let cancelled = false;

    // Fold signed-out stock into the account first, then bump pantryEpoch so
    // any open En casa / Compra UI reloads after the merge (not mid-flight).
    (async () => {
      await mergeLocalPantryIntoCloud(user.id);
      if (cancelled) return;
      setPantryEpoch((n) => n + 1);

      const [remoteState, remoteRecipes, remoteVotes] = await Promise.all([
        loadUserState(user.id),
        loadUserRecipes(user.id),
        loadRecipeVotes(user.id),
      ]);
      if (cancelled) return;

      // Recipes: union by id (remote wins on conflict); votes: same.
      const byId = new Map(localRecipes.map((r) => [r.id ?? r.name, r]));
      for (const r of remoteRecipes) byId.set(r.id, r);
      const mergedRecipes = Array.from(byId.values());
      // Remote is authoritative for the vote itself, but a locally-set group
      // scope survives if it hasn't round-tripped to the server yet.
      const mergedVotes = mergeVotes(localVotes, remoteVotes);

      // Adopt the remote profile snapshot only to hydrate a session that
      // hasn't built a local profile yet (new device, cleared storage, or
      // mid "sin cuenta" flow). If the local session already completed
      // onboarding (has members), it wins — signing in with Google right
      // after finishing onboarding locally must never silently discard the
      // profile (members, allergies, intolerances, healthProfiles) the user
      // just set up. See lib/profileMerge.js.
      const remoteData = remoteState?.state?.data;
      const useRemote = shouldAdoptRemoteProfile({
        localMemberCount: data.members?.length ?? 0,
        remoteMemberCount: remoteData?.members?.length ?? 0,
      });
      if (useRemote) remoteData.groups = healAdhocGroupLabels(remoteData.groups);

      setData((d) => ({
        ...(useRemote ? { ...INITIAL_DATA, ...remoteData } : d),
        userRecipes: mergedRecipes,
        recipeVotes: mergedVotes,
      }));
      if (useRemote) {
        if (remoteState.state.menuPlan) setMenuPlan(remoteState.state.menuPlan);
        if (remoteState.state.shopping) setShopping(remoteState.state.shopping);
        if (Array.isArray(remoteState.state.aiRecipes)) {
          registerRecipes(remoteState.state.aiRecipes);
          setAiRecipes(remoteState.state.aiRecipes);
        }
      }
      if (mergedRecipes.length) registerRecipes(mergedRecipes);

      // Backfill local-only rows the cloud doesn't have yet.
      const remoteIds = new Set(remoteRecipes.map((r) => r.id));
      const localOnly = localRecipes.filter((r) => r.id && !remoteIds.has(r.id));
      if (localOnly.length) upsertUserRecipes(user.id, localOnly);
      const votesBackfill = {};
      for (const [rid, v] of Object.entries(localVotes)) {
        if (!(rid in remoteVotes)) votesBackfill[rid] = v;
      }
      upsertRecipeVotes(user.id, votesBackfill);

      // Fase 3/4 of the menú-archive migration: the cloud tables
      // (user_menus/user_menu_weeks/user_menu_recipes) are the read
      // preference once they hold anything for this account; the JSONB
      // blob (data.menus, hydrated above) is only the fallback for an
      // account that hasn't migrated yet.
      const cloudSummaries = await loadMenuSummariesRemote(user.id);
      if (cancelled) return;

      if (cloudSummaries.length === 0) {
        // One-time backfill: an account that never wrote to the new menú
        // tables (pre-existing user, or a device that only ever wrote to
        // user_state) has real history sitting in the JSONB blob. Only
        // runs when the cloud archive is empty, so it's naturally
        // idempotent — once any menú lands there (from this backfill or a
        // live dual-write), this branch never runs again for this user.
        const finalMenus = useRemote ? (remoteData.menus ?? {}) : localMenus;
        const menuList = Object.values(finalMenus);
        for (const menu of menuList) {
          const recipes = Array.from(collectMenuRecipeIds({ [menu.id]: menu }))
            .map((id) => RECIPES_BY_ID[id])
            .filter(Boolean);
          const res = await saveMenuRemote(user.id, menu, recipes);
          if (cancelled) return;
          // Only (re)activate in the cloud if this menú is STILL the active
          // one locally right now — otherwise a menú freshly generated while
          // this backfill loop was mid-flight (see activeMenuIdRef above)
          // could get clobbered back to an old "active" menú.
          if (res.ok && menu.isActive && menu.id === activeMenuIdRef.current) {
            await activateMenuRemote(menu.id);
          }
        }
      } else {
        // Cloud has data: it wins over the blob for the archive (data.menus).
        // History entries get lightweight week ranges only (just enough for
        // MenusScreen's date range + week-count labels — see
        // lib/menuArchive.js's formatMenuRangeLabel/orderedWeeks, which only
        // read offset/startISO/endISO); the active menú gets full week
        // detail (plan/shopping/schedule) eagerly since Menu.jsx's week
        // switcher (switchActiveWeek) needs it right away. Any OTHER
        // historic menú's full detail is fetched lazily, on demand, by
        // reuseMenu() only when the user actually taps "Repetir" on it.
        const weekRanges = await loadMenuWeekRangesRemote(user.id);
        if (cancelled) return;

        const cloudMenus = {};
        for (const s of cloudSummaries) cloudMenus[s.id] = { ...s, weeks: weekRanges[s.id] ?? {} };

        const nowD = new Date();
        nowD.setHours(0, 0, 0, 0);
        const todayISO = `${nowD.getFullYear()}-${String(nowD.getMonth() + 1).padStart(2, "0")}-${String(nowD.getDate()).padStart(2, "0")}`;

        const activeSummary = cloudSummaries.find((s) => s.isActive) ?? null;
        let activeWeek = null;
        if (activeSummary) {
          const detail = await loadMenuDetailRemote(user.id, activeSummary.id);
          if (cancelled) return;
          if (detail) {
            cloudMenus[activeSummary.id] = { ...cloudMenus[activeSummary.id], weeks: detail.menu.weeks };
            if (detail.recipes.length) registerRecipes(detail.recipes);
            // Re-materialize the live plan/shopping from the cloud's active
            // menú. Otherwise Home ("hoy te toca") and the Menú screen keep
            // rendering the user_state blob's menuPlan (set above) while
            // data.menus/activeMenuId (and MenusScreen) come from the cloud
            // tables — the two silently diverge and show different menús.
            // Prefer the week that contains today, falling back to the
            // earliest, mirroring switchActiveWeek.
            const weeks = Object.values(detail.menu.weeks ?? {}).sort(
              (a, b) => a.offset - b.offset,
            );
            activeWeek =
              weeks.find((w) => w.startISO <= todayISO && todayISO <= w.endISO) ??
              weeks[0] ??
              null;
            if (activeWeek) {
              setMenuPlan(activeWeek.plan ?? {});
              setShopping(activeWeek.shopping ?? { items: [] });
            }
          }
        }

        // The cloud tables have no row cap (loadMenuSummaries/loadMenuWeekRanges
        // fetch the whole history), so apply the same cap used everywhere else
        // in the archive — otherwise an old account's local state (and every
        // subsequent hydration's network cost) grows without bound.
        const prunedCloudMenus = pruneMenuHistory(cloudMenus);

        setData((d) => ({
          ...d,
          menus: prunedCloudMenus,
          activeMenuId: activeSummary?.id ?? null,
          ...(activeWeek
            ? { menuWeek: { offset: activeWeek.offset, startDayIdx: activeWeek.startDayIdx ?? 0 } }
            : {}),
        }));
      }

      cloudReadyRef.current = true;
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // Debounced push of the private profile snapshot (everything except the
  // normalized recipes/votes, which sync through their own tables). Gated on
  // cloudReadyRef so we never clobber the remote copy before hydration lands.
  useEffect(() => {
    if (!user?.id || !cloudReadyRef.current) return;
    const t = window.setTimeout(() => {
      const profile = { ...data };
      delete profile.userRecipes;
      delete profile.recipeVotes;
      // Fase 7 (multi-week-menus plan): user_menus/user_menu_weeks/
      // user_menu_recipes are now the source of truth for a signed-in
      // account's menú archive (see the Fase 3/4 hydration above) — stop
      // duplicating it into this JSONB blob. Untouched for accounts that
      // haven't cut over yet: their existing remote snapshot still carries
      // whatever `menus` it had until the one-time backfill (line ~585)
      // consumes it, and this write simply never re-adds it afterwards.
      delete profile.menus;
      saveUserState(user.id, { data: profile, menuPlan, shopping, aiRecipes, onbStep });
    }, 1200);
    return () => window.clearTimeout(t);
  }, [user?.id, data, menuPlan, shopping, aiRecipes, onbStep]);

  const ensureGroupsIfMissing = () => {
    if (data.groups.length === 0 && data.members.length > 0) {
      setData((d) => ({ ...d, groups: groupsFromModel(d.members, d.menuModel) }));
    }
  };

  const toastTimer = useRef(null);
  const showToast = useCallback((msg) => {
    setToast(msg);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 1800);
  }, []);

  const regenerateMenu = useCallback(async (nextData) => {
    const working = nextData ?? data;
    let groups = working.groups;
    if (groups.length === 0 && working.members.length > 0) {
      groups = groupsFromModel(working.members, working.menuModel);
      setData((d) => ({ ...d, groups }));
    }
    if (groups.length === 0) {
      setMenuError({ message: "Añade al menos un miembro antes de generar el menú." });
      return;
    }
    lastRegenerateArgs.current = { nextData };
    if (generateAbortRef.current) generateAbortRef.current.abort();
    const ctrl = new AbortController();
    generateAbortRef.current = ctrl;
    setIsGeneratingMenu(true);
    setMenuError(null);
    try {
      const pantryStock = user ? await loadPantry(user.id) : loadLocalPantry();
      // Planning bias is opt-out via useHomeStock; shopping always sees stock
      // so «Ya en casa» stays accurate.
      const pantryIngredients = working.useHomeStock === false ? [] : pantryStock;
      const weekOffsets = (Array.isArray(working.menuWeekOffsets) && working.menuWeekOffsets.length
        ? [...new Set(working.menuWeekOffsets)]
        : [working.menuWeek?.offset ?? 0]
      ).sort((a, b) => a - b);
      const weekCount = weekOffsets.length;
      const baseStartDayIdx = working.menuWeek?.startDayIdx ?? 0;
      const varietyPref = ["strict", "moderate", "relaxed"].includes(working.menuVarietyPref)
        ? working.menuVarietyPref
        : "strict";
      const sameForAllWeeks = working.menuScheduleSameForAllWeeks !== false;
      // Planner model for THIS generation (A/B Sonnet vs Haiku). Resolved once
      // so every week/group of the same menú uses the same variant.
      const planner = resolvePlannerModel();

      // Weeks are generated in parallel (bounded by WEEK_CONCURRENCY). Cross-week
      // variety is deterministic per week (aiPlanner#poolForWeek), so there's no
      // dependency on a previous week's result — "strict"/"moderate" bias the
      // pool, "relaxed" applies none.
      const weekResults = await mapWithConcurrency(weekOffsets, WEEK_CONCURRENCY, async (offset, w) => {
        // Only the earliest selected week can be partial (starts today, not
        // Monday) — any other offset is always a full 7-day week.
        const startDayIdx = offset === weekOffsets[0] ? baseStartDayIdx : 0;
        const weekSchedule = sameForAllWeeks || offset === weekOffsets[0]
          ? working.schedule
          : (working.menuWeekOverrides?.[offset] ?? working.schedule);
        const weekData = { ...working, groups, schedule: weekSchedule, menuWeek: { offset, startDayIdx } };
        const crossWeek = varietyPref === "relaxed" || weekCount <= 1
          ? null
          : { weekIndex: w, weekCount, varietyPref };

        const { plan, recipes } = await generateMenuWithAI(weekData, {
          signal: ctrl.signal,
          pantryIngredients,
          crossWeek,
          plannerModel: planner.model,
        });

        // The planner picks from recipeCatalog.js, but buildShoppingList (and the
        // UI) resolve dishes through RECIPES_BY_ID in recipes.js — the two are
        // bridged only by registerRecipes(). Register THIS week's recipes before
        // building its shopping list; otherwise none of the picked catalog/AI
        // recipes resolve and the list comes back empty. (registerRecipes is a
        // synchronous mutation of a shared map, so it's safe to call from the
        // parallel workers.) The aggregate registerRecipes below is now belt-and-
        // suspenders for health-flags/UI, but harmless.
        registerRecipes(recipes);
        const sh = buildShoppingList(plan, groups, getMeals(weekData), pantryStock);
        const weekShopping = { items: [...sh.byCategory.flatMap((c) => c.items), ...sh.pantryItems] };
        const { startISO, endISO } = computeWeekRange(offset, startDayIdx);
        return { offset, startDayIdx, startISO, endISO, plan, weekShopping, weekSchedule, recipes };
      });

      if (ctrl.signal.aborted) return;

      const weeks = {};
      const allRecipes = [];
      let firstWeekPlan = null;
      let firstWeekShopping = null;
      weekResults.forEach((res, w) => {
        weeks[res.startISO] = {
          offset: res.offset,
          startDayIdx: res.startDayIdx,
          startISO: res.startISO,
          endISO: res.endISO,
          plan: res.plan,
          shopping: res.weekShopping,
          schedule: res.weekSchedule,
        };
        allRecipes.push(...res.recipes);
        if (w === 0) {
          firstWeekPlan = res.plan;
          firstWeekShopping = res.weekShopping;
        }
      });

      registerRecipes(allRecipes);
      setMenuPlan(firstWeekPlan);
      const isFirstMenu = (data.menuHistory ?? []).length === 0;
      trackEvent(user, "menu_generated", "menu", { groupCount: groups.length, memberCount: working.members.length, weekCount, plannerModel: planner.model, plannerVariant: planner.variant });
      if (isFirstMenu) upsertUserProfile(user, { first_menu_at: new Date().toISOString(), app_version: APP_VERSION });

      const newMenu = {
        id: createMenuId(),
        createdAt: Date.now(),
        isFavorite: false,
        isActive: true,
        varietyPref,
        weeks,
      };
      // Guests never keep history (one active menú at a time, per product
      // decision); signed-in users keep every past menú browsable.
      const keepHistory = Boolean(user);
      // Fold once and reuse for both the archive AND the AI-recipe prune so the
      // two stay consistent: any dish only referenced by a menú that the fold
      // trims out of history is dropped from the aiRecipes cache too, instead
      // of accumulating forever inside the persisted state blob.
      const foldedMenus = foldInNewMenu(data.menus, newMenu, { keepHistory });
      const keepRecipeIds = collectMenuRecipeIds(foldedMenus);

      setAiRecipes((cur) => {
        const byId = new Map(cur.map((r) => [r.id, r]));
        for (const r of allRecipes) byId.set(r.id, r);
        return pruneAiRecipes(Array.from(byId.values()), keepRecipeIds);
      });

      setData((d) => ({
        ...d,
        menus: foldedMenus,
        activeMenuId: newMenu.id,
        menuHistory: [...(d.menuHistory ?? []), { at: Date.now(), groups: groups.length }].slice(-60),
      }));
      // Fase 2 (multi-week-menus plan): best-effort dual write to the
      // normalized tables, fire-and-forget. Never awaited — the localStorage/
      // user_state blob (just written above) stays the real source of truth;
      // a failed or slow cloud write must never block or risk the local one.
      if (user) saveAndActivateMenu(user.id, newMenu, allRecipes);
      setShopping((prev) => {
        const flags = Object.fromEntries(
          prev.items.map((i) => [
            normalizeIngredientKey(i.name, i.unit ?? "ud"),
            { have: i.have, atHome: i.atHome },
          ])
        );
        return {
          items: firstWeekShopping.items.map((it) => ({
            ...it,
            have: flags[it.id]?.have ?? false,
            atHome: flags[it.id]?.atHome ?? false,
          })),
        };
      });
      // plan._warnings collects non-blocking issues from generation (slots
      // dropped by the 3b safety net, weekly freqs targets the filtered pool
      // couldn't achieve, etc.) — surface them instead of the generic success
      // toast so "no bloquea, pero informa" actually reaches the user instead
      // of a warning that was computed and then silently discarded.
      if (firstWeekPlan._warnings?.length > 0) {
        const [first, ...rest] = firstWeekPlan._warnings;
        showToast(rest.length > 0 ? `${first} (+${rest.length} aviso${rest.length === 1 ? "" : "s"} más)` : first);
      } else {
        showToast(weekCount > 1 ? `Menú generado con IA (${weekCount} semanas)` : "Menú generado con IA");
      }
    } catch (err) {
      if (err?.name === "AbortError" || ctrl.signal.aborted) return;
      console.error("Error generating menu", err);
      trackEvent(user, "generation_failed", "menu", { error: err?.message });
      setMenuError({
        message: err?.message || "No se pudo generar el menú.",
        cause: err?.cause,
      });
    } finally {
      if (generateAbortRef.current === ctrl) generateAbortRef.current = null;
      setIsGeneratingMenu(false);
    }
  }, [data, showToast]);

  const handleRegenerate = useCallback(() => regenerateMenu(), [regenerateMenu]);

  // ── Ad-hoc individual menus ──────────────────────────────────────────────
  // Auto-offer a separate 3-day menu when a member gets a heavy, hard-to-share
  // temporary state. Only "dieta blanda" qualifies today: embarazo/lactancia
  // are long-term and their restrictions don't wreck the shared menu, so they
  // stay applied to the family group (see buildGroupContext).

  // A dismissal only "sticks" while the state stays active: if the member's
  // dieta_blanda gets unchecked and rechecked later, that's a new decision
  // and the pop-up (shown once per "decision") should be offered again.
  useEffect(() => {
    const activeKeys = new Set(
      data.members.flatMap((m) =>
        (m.dietaryStates ?? [])
          .filter((s) => HEAVY_DIETARY_STATES.includes(s))
          .map((s) => `${m.id}:${s}`),
      ),
    );
    for (const key of promptedIndividualRef.current) {
      if (!activeKeys.has(key)) promptedIndividualRef.current.delete(key);
    }
  }, [data.members]);

  useEffect(() => {
    if (individualPrompt) return;
    for (const m of data.members) {
      const reason = (m.dietaryStates ?? []).find((s) => HEAVY_DIETARY_STATES.includes(s));
      if (!reason) continue;
      if (individualMenuGroupFor(data.groups, m.id)) continue;
      const key = `${m.id}:${reason}`;
      if (promptedIndividualRef.current.has(key)) continue;
      promptedIndividualRef.current.add(key);
      setIndividualPrompt({ memberId: m.id, reason });
      break;
    }
  }, [data.members, data.groups, individualPrompt]);

  // Retire individual menus older than 3 days: put the member back in their
  // home group, clear the "dieta blanda" flag, and drop the ad-hoc menu plan.
  useEffect(() => {
    const { groups, expired } = pruneExpiredIndividualMenus(data.groups);
    if (expired.length === 0) return;
    const expiredIds = new Set(expired.map((g) => g.id));
    const expiredMemberIds = new Set(expired.map((g) => g.sourceMemberId));
    setData((d) => {
      const mealStructureByGroup = { ...(d.mealStructureByGroup ?? {}) };
      for (const id of expiredIds) delete mealStructureByGroup[id];
      return {
        ...d,
        groups,
        mealStructureByGroup,
        members: d.members.map((m) =>
          expiredMemberIds.has(m.id)
            ? { ...m, dietaryStates: (m.dietaryStates ?? []).filter((s) => s !== "dieta_blanda") }
            : m,
        ),
      };
    });
    setMenuPlan((mp) => {
      const next = { ...mp };
      for (const id of expiredIds) delete next[id];
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const confirmIndividualMenu = useCallback(
    (useIndividual) => {
      const prompt = individualPrompt;
      setIndividualPrompt(null);
      if (!prompt) return;
      const member = data.members.find((m) => m.id === prompt.memberId);
      if (!member) return;

      if (!useIndividual) {
        // Declined: leave the checkbox unmarked (drop the state) so there's no
        // orphan "dieta blanda" without its own menu.
        setData((d) => ({
          ...d,
          members: d.members.map((m) =>
            m.id === member.id
              ? { ...m, dietaryStates: (m.dietaryStates ?? []).filter((s) => s !== prompt.reason) }
              : m,
          ),
        }));
        return;
      }

      // Accepted: just set up the ad-hoc group and keep the checkbox marked.
      // Don't generate or navigate here — the menu is generated as usual at the
      // end of onboarding (goToMenu → regenerateMenu picks up data.groups), so
      // the remaining steps (e.g. "cómo cocinas") aren't skipped.
      const homeGroup =
        data.groups.find((g) => !g.adHoc && g.memberIds.includes(member.id)) ?? null;
      const adHoc = createIndividualMenuGroup(member, homeGroup?.id ?? null, prompt.reason);
      // Take the member out of the shared menu for the duration so they don't
      // get two menus; they're restored on expiry (pruneExpiredIndividualMenus).
      setData((d) => ({
        ...d,
        groups: [
          ...d.groups.map((g) =>
            homeGroup && g.id === homeGroup.id
              ? { ...g, memberIds: g.memberIds.filter((id) => id !== member.id) }
              : g,
          ),
          adHoc,
        ],
        // Inherit the meal structure (1 plato vs primero+segundo) from the
        // member's home group, so their bland menu keeps the same 1/2-dish
        // shape they picked for the family instead of defaulting to two.
        mealStructureByGroup: {
          ...(d.mealStructureByGroup ?? {}),
          [adHoc.id]:
            d.mealStructureByGroup?.[homeGroup?.id] ?? "primero_segundo",
        },
      }));
    },
    [individualPrompt, data],
  );

  const stopGeneration = useCallback(() => {
    if (generateAbortRef.current) {
      generateAbortRef.current.abort();
      generateAbortRef.current = null;
    }
    setIsGeneratingMenu(false);
  }, []);

  const retryGenerateMenu = useCallback(() => {
    const args = lastRegenerateArgs.current ?? {};
    return regenerateMenu(args.nextData);
  }, [regenerateMenu]);

  const dirRef = useRef("forward");
  // Track which screen opened the recipe planner so we can return there on close.
  const recipePlannerOriginRef = useRef("dashboard");
  // When set, the recipe planner opens in "edit" mode for this user recipe.
  const [editingRecipe, setEditingRecipe] = useState(null);
  const fwd  = (fn) => { dirRef.current = "forward";  fn(); };
  const back = (fn) => { dirRef.current = "backward"; fn(); };

  const goToMenu = async () => {
    ensureGroupsIfMissing();
    setQuickMenu(false);
    setScreen("menu");
    if (user) {
      upsertUserProfile(user, {
        onboarding_completed: true,
        family_size: data.members.length || null,
        has_babies: data.members.some((m) => memberIsBaby(m)),
        onboarding_step_max: onbStep,
      });
    }
    await regenerateMenu();
  };

  const goToDashboard = useCallback(() => fwd(() => setScreen("dashboard")), []);

  const goToMenuFromDashboard = useCallback(() => {
    fwd(() => setScreen("menu"));
  }, []);

  const openMenusScreen = useCallback(() => fwd(() => setScreen("menus")), []);

  // One-shot signal consumed by MenuScreen: "Editar" en la card de menú
  // actual reutiliza el sheet de "Tu perfil" (ProfileSettingsSheet) en vez
  // de mandar a un flujo de edición aparte.
  const [pendingProfileOpen, setPendingProfileOpen] = useState(false);

  // Switches which week of the ACTIVE menú is displayed (menús spanning
  // several weeks) — materializes that week's plan/shopping into the live
  // menuPlan/shopping state everything else already reads from.
  const switchActiveWeek = useCallback((weekStart) => {
    const menu = data.menus?.[data.activeMenuId];
    const wk = menu?.weeks?.[weekStart];
    if (!wk) return;
    setMenuPlan(wk.plan);
    setShopping(wk.shopping);
    setData((d) => ({ ...d, menuWeek: { offset: wk.offset, startDayIdx: wk.startDayIdx } }));
  }, [data.menus, data.activeMenuId]);

  // Writes one week's shopping back into the archive so per-week lists stay
  // authoritative (Compra can view/edit several weeks). Mirrors into the live
  // `shopping` state when the edited week is the one currently active, so the
  // Menú/Compra views and the archive never drift apart.
  const updateWeekShopping = useCallback((weekStart, nextShopping) => {
    const menuId = data.activeMenuId;
    setData((d) => {
      const m = d.menus?.[menuId];
      if (!m?.weeks?.[weekStart]) return d;
      if (m.weeks[weekStart].shopping === nextShopping) return d;
      return {
        ...d,
        menus: {
          ...d.menus,
          [menuId]: {
            ...m,
            weeks: {
              ...m.weeks,
              [weekStart]: { ...m.weeks[weekStart], shopping: nextShopping },
            },
          },
        },
      };
    });
    const wk = data.menus?.[menuId]?.weeks?.[weekStart];
    if (wk && wk.offset === data.menuWeek?.offset) setShopping(nextShopping);
    // Cloud tables are the hydration read-preference, so mirror this edit to
    // the week's normalized row too — otherwise a logged-in user loses every
    // shopping change on reload (the generation-time row would win). Debounced
    // + fire-and-forget inside queueSaveMenuWeek; local blob is still the belt.
    if (user && menuId && wk) {
      queueSaveMenuWeek(user.id, menuId, weekStart, { ...wk, shopping: nextShopping });
    }
  }, [data.menus, data.activeMenuId, data.menuWeek?.offset, user]);

  // Undo a confirmed ticket's tachado. Deleting a ticket in Análisis → Gasto
  // must reverse the exact "have: true" the receipt wizard set — and through
  // the SAME write path (updateWeekShopping → archive + live mirror + cloud),
  // otherwise a logged-in user would see the tachado reappear on reload.
  // `weekStart` mirrors the SAME scoping the wizard tached with (a ticket is
  // one real purchase, tached against one real week — see Shopping.jsx's
  // targetWeekStart): when it names a week that's actually in the archive,
  // undo touches ONLY that week, so it can't wipe out an unrelated tachado of
  // the same ingredient sitting in a different week. Falls back to every
  // week (old behaviour) when it's null/unknown/not archived — matching
  // exactly the case where the wizard itself fell back to tach everywhere.
  const undoReceiptTachado = useCallback((tachedKeys = [], weekStart = null) => {
    if (!tachedKeys?.length) return;
    const keySet = new Set(tachedKeys);
    const untacha = (items) =>
      (items ?? []).map((it) =>
        keySet.has(normalizeIngredientKey(it.name, it.unit ?? "ud")) ? { ...it, have: false } : it,
      );
    const menuId = data.activeMenuId;
    const weeks = data.menus?.[menuId]?.weeks ?? null;
    const weekEntries = weeks ? Object.entries(weeks) : [];
    const hasArchive = weekEntries.some(([, wk]) => wk?.shopping?.items?.length);
    if (hasArchive) {
      const scoped = weekStart && weekEntries.some(([ws]) => ws === weekStart)
        ? weekEntries.filter(([ws]) => ws === weekStart)
        : weekEntries;
      for (const [ws, wk] of scoped) {
        const items = wk?.shopping?.items;
        if (!items?.length) continue;
        const next = untacha(items);
        // Only write weeks that actually held one of the tached keys, so we
        // don't churn cloud rows for untouched weeks.
        if (next.some((it, i) => it !== items[i])) {
          updateWeekShopping(ws, { ...wk.shopping, items: next });
        }
      }
    } else {
      setShopping((s) => ({ ...s, items: untacha(s?.items) }));
    }
  }, [data.activeMenuId, data.menus, updateWeekShopping]);

  // Keep the active week's archived shopping in sync with the live list, so
  // switching weeks (or reloading) never loses the check-offs/edits made in
  // Compra. Covers every path that touches `shopping` directly (receipt import,
  // generation, manual edits in single-week mode). No-ops (returns the same
  // reference) once the archive already matches, so it can't loop.
  useEffect(() => {
    const menuId = data.activeMenuId;
    if (!menuId) return;
    const offset = data.menuWeek?.offset;
    setData((d) => {
      const m = d.menus?.[menuId];
      if (!m?.weeks) return d;
      const entry = Object.entries(m.weeks).find(([, w]) => w?.offset === offset);
      if (!entry) return d;
      const [weekStart, wk] = entry;
      if (wk.shopping === shopping) return d;
      return {
        ...d,
        menus: {
          ...d.menus,
          [menuId]: { ...m, weeks: { ...m.weeks, [weekStart]: { ...wk, shopping } } },
        },
      };
    });
  }, [shopping, data.activeMenuId, data.menuWeek?.offset]);

  // "Borrar" from the Menús screen: drops the active menú from the archive
  // (still leaves any OTHER past menús untouched) and clears the live
  // plan/shopping so nothing stale lingers around.
  const deleteActiveMenu = useCallback(() => {
    const menuIdToDelete = data.activeMenuId;
    setData((d) => {
      if (!d.activeMenuId) return d;
      return { ...d, menus: removeMenu(d.menus, d.activeMenuId), activeMenuId: null };
    });
    if (user && menuIdToDelete) {
      // Optimistic: the local delete above always applies immediately. If the
      // cloud call fails, the row would otherwise silently reappear on the
      // next hydration with zero explanation — at least warn so the user
      // knows to retry instead of assuming it's gone for good.
      deleteMenuRemote(user.id, menuIdToDelete).then((res) => {
        if (!res.ok) showToast("No se pudo borrar el menú en la nube. Puede reaparecer al recargar.");
      });
    }
    setMenuPlan({});
    setShopping({ items: [] });
  }, [data.activeMenuId, user, showToast]);

  // Deletes a non-active menú from the histórico. Unlike deleteActiveMenu,
  // never touches menuPlan/shopping — those mirror the active menú's current
  // week and have nothing to do with a history entry.
  const deleteHistoryMenu = useCallback((menuId) => {
    setData((d) => {
      if (!d.menus?.[menuId] || menuId === d.activeMenuId) return d;
      return { ...d, menus: removeMenu(d.menus, menuId) };
    });
    if (user) {
      deleteMenuRemote(user.id, menuId).then((res) => {
        if (!res.ok) showToast("No se pudo borrar el menú en la nube. Puede reaparecer al recargar.");
      });
    }
  }, [user, showToast]);

  // "Repetir esta configuración" from the histórico: reuses a past menú's
  // logistics (schedule) always, and either clones its dishes verbatim or
  // regenerates fresh ones for new dates, per the user's choice.
  const reuseMenu = useCallback(async (menuId, { weekCount, sameRecipes } = {}) => {
    let old = data.menus?.[menuId];
    if (!old) return;
    // A history entry hydrated from the cloud read-preference (see the
    // session-hydration effect) may only carry lightweight week ranges
    // (offset/startISO/endISO — no plan/shopping/schedule) for every menú
    // except the active one. Fetch the real detail now, on demand, instead
    // of eagerly fetching every historic menú's full JSON up front.
    const isLazy = Object.values(old.weeks ?? {}).some((w) => w && w.schedule === undefined);
    if (isLazy && user) {
      const detail = await loadMenuDetailRemote(user.id, menuId);
      if (detail) {
        old = { ...old, weeks: detail.menu.weeks };
        if (detail.recipes.length) {
          registerRecipes(detail.recipes);
          // Persist into aiRecipes too, not just the in-memory RECIPES_BY_ID
          // registry — otherwise a reload right after opening a lazy history
          // entry loses these snapshots (isLazy is now false since `schedule`
          // is set, so it never re-fetches) and the dish silently disappears.
          setAiRecipes((cur) => {
            const byId = new Map(cur.map((r) => [r.id, r]));
            for (const r of detail.recipes) byId.set(r.id, r);
            return Array.from(byId.values());
          });
        }
        setData((d) => (d.menus?.[menuId] ? { ...d, menus: { ...d.menus, [menuId]: old } } : d));
      }
    }
    const oldWeeks = Object.values(old.weeks ?? {}).sort((a, b) => a.offset - b.offset);
    const count = clampWeekCount(weekCount ?? oldWeeks.length ?? 1);
    const oldSchedule = oldWeeks[0]?.schedule ?? data.schedule;
    const startDayIdx = todayDayIdx();

    if (sameRecipes && oldWeeks.length > 0) {
      const weeks = {};
      for (let w = 0; w < count; w++) {
        const src = oldWeeks[w % oldWeeks.length];
        const offset = w;
        const sdIdx = w === 0 ? startDayIdx : 0;
        const { startISO, endISO } = computeWeekRange(offset, sdIdx);
        weeks[startISO] = {
          offset, startDayIdx: sdIdx, startISO, endISO,
          plan: src.plan, shopping: src.shopping, schedule: src.schedule ?? oldSchedule,
        };
      }
      const newMenu = {
        id: createMenuId(), createdAt: Date.now(), isFavorite: false, isActive: true,
        varietyPref: old.varietyPref ?? "strict", weeks,
      };
      const firstKey = Object.keys(weeks)[0];
      setMenuPlan(weeks[firstKey].plan);
      setShopping(weeks[firstKey].shopping);
      const foldedMenus = foldInNewMenu(data.menus, newMenu, { keepHistory: Boolean(user) });
      const keepRecipeIds = collectMenuRecipeIds(foldedMenus);
      setAiRecipes((cur) => pruneAiRecipes(cur, keepRecipeIds));
      setData((d) => ({
        ...d,
        schedule: oldSchedule,
        menus: foldedMenus,
        activeMenuId: newMenu.id,
        menuWeek: { offset: 0, startDayIdx },
        // "Repetir → Mismos platos" still generates and activates a real
        // menú for the week — it just clones dishes instead of asking the AI
        // for new ones. Without this it never appended to menuHistory, so
        // the streak (computeStreak) and the Dashboard's "menús generados"
        // counter silently undercounted a week the user did have a menú for.
        menuHistory: [...(d.menuHistory ?? []), { at: Date.now(), groups: (d.groups ?? []).length }].slice(-60),
      }));
      // Fase 2 dual write (see regenerateMenu) — no fresh generation happened
      // here, so resolve the cloned menú's recipe snapshots from the already-
      // registered catalog/aiRecipes/own-recipes registry instead.
      if (user) {
        const recipes = Array.from(collectMenuRecipeIds({ [newMenu.id]: newMenu }))
          .map((id) => RECIPES_BY_ID[id])
          .filter(Boolean);
        saveAndActivateMenu(user.id, newMenu, recipes);
      }
      showToast("Menú repetido con los mismos platos");
      fwd(() => setScreen("menu"));
      return;
    }

    // Fresh dishes: reuse only the logistics, regenerate for the new dates.
    await regenerateMenu({
      ...data,
      schedule: oldSchedule,
      menuWeekOffsets: Array.from({ length: count }, (_, i) => i),
      menuScheduleSameForAllWeeks: true,
      menuWeek: { offset: 0, startDayIdx },
    });
    fwd(() => setScreen("menu"));
  }, [data, regenerateMenu, showToast, user]);

  // Opens a history entry in the read-only viewer — same lazy-detail fetch as
  // reuseMenu, since a history row hydrated from the cloud read-preference may
  // only carry lightweight week ranges (no plan/shopping/schedule) up front.
  const openHistoryMenu = useCallback(async (menuId) => {
    let m = data.menus?.[menuId];
    if (!m) return;
    const isLazy = Object.values(m.weeks ?? {}).some((w) => w && w.schedule === undefined);
    if (isLazy && user) {
      const detail = await loadMenuDetailRemote(user.id, menuId);
      if (!detail) {
        showToast("No se pudo cargar este menú del histórico. Inténtalo de nuevo.");
        return;
      }
      m = { ...m, weeks: detail.menu.weeks };
      if (detail.recipes.length) {
        registerRecipes(detail.recipes);
        // See the matching comment in reuseMenu: persist into aiRecipes too so
        // a reload doesn't lose these dishes forever (isLazy would otherwise
        // stay false since `schedule` is now set, so it never re-fetches).
        setAiRecipes((cur) => {
          const byId = new Map(cur.map((r) => [r.id, r]));
          for (const r of detail.recipes) byId.set(r.id, r);
          return Array.from(byId.values());
        });
      }
      setData((d) => (d.menus?.[menuId] ? { ...d, menus: { ...d.menus, [menuId]: m } } : d));
    }
    setHistoryMenuId(menuId);
    fwd(() => setScreen("menuHistory"));
  }, [data.menus, user, showToast]);

  const handleNav = useCallback((id) => {
    dirRef.current = navDirection(screen, id);
    if (id === "pantry") {
      const origin =
        screen === "shopping" ? "shopping"
        : screen === "dashboard" ? "dashboard"
        : screen === "profile" ? "profile"
        : screen === "account" ? "account"
        : screen === "pantry" ? pantryOrigin
        : "dashboard";
      setPantryOrigin(origin);
    }
    setScreen(id);
    if (id === "shopping") trackEvent(user, "shopping_opened", "shopping");
  }, [screen, user, pantryOrigin]);

  const goToOnboardingStep = useCallback((step) => {
    dirRef.current = "forward";
    setFirstRunOnboarding(false);
    setOnbStep(step);
    setScreen("onboarding");
  }, []);

  // "Editar preferencias" from Settings/Account used to just jump into step 6
  // of the full onboarding wizard — "Atrás" then stepped backward through the
  // whole wizard instead of returning to where the user came from, and
  // finishing it regenerated the entire menú (goToMenu → regenerateMenu) just
  // to save an allergy edit. This tracks which screen to return to so the
  // restrictions step can behave as a self-contained mini-editor instead.
  const [editPreferencesOrigin, setEditPreferencesOrigin] = useState(null);
  const openEditPreferences = useCallback((origin) => {
    setEditPreferencesOrigin(origin);
    goToOnboardingStep(6);
  }, [goToOnboardingStep]);

  // "¿Para quién es el menú?" — when the profile already has members, offer to
  // reuse the household or start fresh for a different group, instead of always
  // forcing the full onboarding.
  const [whoForOpen, setWhoForOpen] = useState(false);
  // Quick-menu mode: a shortened onboarding for "Mi familia habitual" that skips
  // the steps already configured in Mi perfil (family + cooking), while still
  // walking through the per-menu screens (week, schedule, style, restrictions…).
  const [quickMenu, setQuickMenu] = useState(false);
  // First-time visitor path: splash → (tutorial) → "¿quién come en casa?" only
  // → straight to Home, instead of the full 9-step wizard. Any other entry
  // into onboarding (edit shortcuts, "Otro grupo", quick menu…) resets this.
  const [firstRunOnboarding, setFirstRunOnboarding] = useState(false);
  const handleGenerateMenu = useCallback(() => {
    if ((data.members ?? []).length > 0) {
      setWhoForOpen(true);
    } else {
      setQuickMenu(false);
      goToOnboardingStep(0);
    }
  }, [data.members, goToOnboardingStep]);

  // "Mi familia habitual" → shortened assistant (not skipped entirely).
  const startQuickMenu = useCallback(() => {
    setQuickMenu(true);
    setFirstRunOnboarding(false);
    dirRef.current = "forward";
    setOnbStep(1); // step 0 (familia) is hidden in quick mode; effect hops if 1 is too
    setScreen("onboarding");
  }, []);

  const handleDishTap = useCallback((selection) => {
    setSelectedSlot(selection);
    trackEvent(user, "dish_viewed", "menu", { recipeId: selection?.recipe?.id });
  }, [user]);

  // One-shot "jump to this dish" signal from the Menú availability dot →
  // opens Compra straight into Modo Cocina with that recipe expanded.
  const [cookFocus, setCookFocus] = useState(null);
  const handleFocusCookDish = useCallback((focus) => {
    setCookFocus(focus);
    handleNav("shopping");
  }, [handleNav]);

  // Public like/dislike rating — independent of favoriting. Feeds the
  // accumulated thumbs-up/down counts shown next to the recipe owner.
  const handleVoteRecipe = useCallback((recipeId, vote) => {
    const nextVotes = toggleRecipeVote(data.recipeVotes, recipeId, vote);
    setData((d) => ({ ...d, recipeVotes: nextVotes }));
    if (user?.id) {
      const entry = nextVotes[recipeId] ?? null;
      if (entry == null) deleteRecipeVote(user.id, recipeId);
      else saveRecipeVote(user.id, recipeId, entry);
    }
  }, [data.recipeVotes, user]);

  // Favorite (personal collection) — sets/clears the group scope a recipe
  // applies to ("all" | string[] | null to unfavorite). Independent of vote.
  const handleSetFavoriteScope = useCallback((recipeId, scope) => {
    const wasFav = isRecipeFavorite(data.recipeVotes, recipeId);
    const nextVotes = setFavoriteScope(data.recipeVotes, recipeId, scope);
    setData((d) => ({ ...d, recipeVotes: nextVotes }));
    if (scope == null && wasFav) showToast("Quitada de favoritas");
    else if (scope != null && !wasFav) showToast("Añadida a favoritas");
    if (user?.id) {
      const entry = nextVotes[recipeId] ?? null;
      if (entry == null) deleteRecipeVote(user.id, recipeId);
      else saveRecipeVote(user.id, recipeId, entry);
    }
  }, [data.recipeVotes, showToast, user]);

  // Selectable scopes for a favorite: the household's distinct menu-group labels
  // (excluding the single-family "Familia"). Empty/one → no per-group choice.
  const favoriteScopeGroups = useMemo(() => {
    const labels = (data.groups ?? [])
      .map((g) => g.label)
      .filter((l) => l && l !== "Familia");
    return Array.from(new Set(labels));
  }, [data.groups]);

  const handleOpenCatalogRecipe = useCallback((recipe) => {
    if (!recipe?.id) return;
    const eaters = Math.max(1, data.members?.length || 4);
    // Catalog/user-recipe objects use the protein_g/carbs_g/fat_g + baseServings
    // shape; DishDetail expects the "frontend" shape (macros object, scaled
    // ingredients) that the menu/planner already produce for every dish that's
    // been placed in a menu. Reuse that converter so opening a dish straight
    // from the catalog looks identical, and cache it in the runtime registry.
    const already = RECIPES_BY_ID[recipe.id];
    const full = already ?? catalogToFrontendRecipe(recipe, eaters);
    if (!already) registerRecipes([full]);
    setSelectedSlot({
      recipe: full,
      slot: { eaters: full.servings ?? eaters },
      browse: true,
    });
    trackEvent(user, "dish_viewed", "recipes", { recipeId: recipe.id });
  }, [data.members, user]);

  const handleReplaceSlot = useCallback(async (selection) => {
    const { groupId, day, meal } = selection;
    const course = selection.course ?? "main";
    // Pick the replacement from the SAME rich catalog the AI planner uses, so the
    // swapped dish is identical in shape (photo, methods, macros, scaled
    // ingredients) to the rest of the menu instead of a legacy-catalog mismatch.
    const result = pickCatalogReplacement(data, menuPlan, { groupId, day, meal, course });
    if (!result) {
      showToast("No hay otra receta compatible para este hueco");
      return;
    }
    const { frontendRecipe, recipeId, reusedDuplicate } = result;
    // No unused alternative existed for this slot — the swap still goes
    // through (better than refusing), but it repeats a dish already placed
    // elsewhere this week, so the user should know instead of finding out by
    // spotting it themselves.
    if (reusedDuplicate) {
      showToast("Sin alternativas nuevas: se repite un plato ya usado esta semana");
    }

    // Register it exactly like AI-generated dishes (runtime catalog + persisted
    // aiRecipes) so DishCard/DishDetail resolve it through the same path.
    registerRecipes([frontendRecipe]);
    setAiRecipes((cur) => {
      const byId = new Map(cur.map((r) => [r.id, r]));
      byId.set(frontendRecipe.id, frontendRecipe);
      return Array.from(byId.values());
    });

    const groups =
      data.groups.length > 0 ? data.groups : groupsFromModel(data.members, data.menuModel);
    // Fetched before the state updater (which must stay synchronous) so the
    // rebuilt shopping list still discounts pantry ingredients after a swap.
    const pantryIngredients = user ? await loadPantry(user.id) : loadLocalPantry();
    setMenuPlan((plan) => {
      const slotKey = `${day}-${meal}`;
      const prevSlot = plan[groupId]?.[slotKey] ?? {};
      const nextSlot = {
        ...prevSlot,
        ...(course === "first" ? { firstRecipeId: recipeId } : { recipeId }),
        warnings: [],
      };
      const next = {
        ...plan,
        [groupId]: {
          ...(plan[groupId] ?? {}),
          [slotKey]: nextSlot,
        },
      };
      const sh = buildShoppingList(next, groups, getMeals(data), pantryIngredients);
      setShopping((prev) => {
        const flags = Object.fromEntries(
          prev.items.map((i) => [
            normalizeIngredientKey(i.name, i.unit ?? "ud"),
            { have: i.have, atHome: i.atHome },
          ])
        );
        return {
          items: [...sh.byCategory.flatMap((c) => c.items), ...sh.pantryItems].map((it) => ({
            ...it,
            have: flags[it.id]?.have ?? false,
            atHome: flags[it.id]?.atHome ?? false,
          })),
        };
      });
      return next;
    });
    setSelectedSlot(null);
    showToast(`Sustituido por «${frontendRecipe.name}»`);
    trackEvent(user, "dish_replaced", "menu", { day, meal, newRecipeId: recipeId });
  }, [data, menuPlan, showToast, user]);

  // Reset intents: "soft" keeps the profile (family, recipes, preferences) and
  // only wipes the active menu/session; "hard" nukes everything (used by
  // Ajustes' "empezar de cero"); "delete" nukes + signs out; "abandon" just
  // walks away from the onboarding wizard without touching any saved data.
  const [resetConfirm, setResetConfirm] = useState(null); // null | "soft" | "hard" | "delete" | "abandon"

  const handleReset = useCallback(() => setResetConfirm("hard"), []);
  const handleSoftReset = useCallback(() => setResetConfirm("soft"), []);
  const handleDeleteAccount = useCallback(() => setResetConfirm("delete"), []);
  const handleAbandonOnboarding = useCallback(() => setResetConfirm("abandon"), []);

  const doReset = useCallback(() => {
    setResetConfirm(null);
    clearState();
    // Fired immediately (not the 1200ms debounced profile push) so a quick
    // reload right after "Reiniciar" can't race the stale cloud snapshot back
    // in through the hydration effect above.
    if (user?.id) clearUserState(user.id);
    setData(INITIAL_DATA);
    setMenuPlan({});
    setShopping({ items: [] });
    setSelectedSlot(null);
    setOnbStep(0);
    setAiRecipes([]);
    setMenuError(null);
    setScreen("splash");
  }, [user]);

  // Soft reset — the profile lives in the account, so "reiniciar" only clears
  // the current week's menu, shopping list and week selection, then lands back
  // on the dashboard with the onboarding effectively already done.
  const doSoftReset = useCallback(() => {
    setResetConfirm(null);
    setMenuPlan({});
    setShopping({ items: [] });
    setAiRecipes([]);
    setSelectedSlot(null);
    setMenuError(null);
    setData((d) => ({
      ...d,
      schedule: {},
      slotType: {},
      menuWeek: null,
      activeMenuId: null,
      menuWeekOffsets: [0],
      menuScheduleSameForAllWeeks: true,
      menuWeekOverrides: {},
    }));
    dirRef.current = "forward";
    setScreen("dashboard");
    showToast("Menú reiniciado");
  }, [showToast]);

  // Abandon the onboarding/menu-generation wizard: only exits back to the
  // dashboard (every entry point into onboarding — "Otro grupo", "Mi familia
  // habitual", edit shortcuts, and the empty-profile case — starts there), no
  // data is cleared. Whatever the wizard already wrote into `data` mid-flow
  // simply stays as-is, same as tapping "Atrás" between steps.
  const doAbandonOnboarding = useCallback(() => {
    setResetConfirm(null);
    setQuickMenu(false);
    setFirstRunOnboarding(false);
    back(() => setScreen("dashboard"));
  }, []);

  const doDeleteAccount = useCallback(async () => {
    setResetConfirm(null);
    clearState();
    // Must happen before signOut(): the delete is authorized by the current
    // session (RLS on user_id = auth.uid()), so it has to run while still
    // logged in.
    if (user?.id) await clearUserState(user.id);
    setData(INITIAL_DATA);
    setMenuPlan({});
    setShopping({ items: [] });
    setSelectedSlot(null);
    setOnbStep(0);
    setAiRecipes([]);
    setMenuError(null);
    setScreen("splash");
    await signOut();
  }, [signOut, user]);

  // Order: Members → Menu Model → School Menu → Week → Schedule → Meal Style → Restrictions → Repeat → Cooking.
  // "Menu Model" and "School Menu" are skipped when they wouldn't offer any
  // real choice: no split possible if everyone's an adult, nothing to upload
  // if nobody in the house is underage (baby or child).
  const ONB_STEP_COUNT = 9;
  const skipMenuModel = !canSplitMenus(data.members);
  const skipSchoolMenu = !hasUnderageMember(data.members);
  const isStepHidden = useCallback(
    (i) =>
      (i === 1 && skipMenuModel) ||
      (i === 2 && skipSchoolMenu) ||
      // "Mi familia habitual" only ever skips Familia (0) — it's the one
      // thing already known. Everything else (modelo de menú, semana,
      // horario, estilo, restricciones, qué repetimos, cocina) can change
      // from una generación a otra, so it's asked in full every time, same
      // as a brand-new family or "Otro grupo".
      (quickMenu && i === 0),
    [skipMenuModel, skipSchoolMenu, quickMenu]
  );
  const stepNeighbor = useCallback(
    (from, dir) => {
      let i = from + dir;
      while (i >= 0 && i <= ONB_STEP_COUNT - 1 && isStepHidden(i)) i += dir;
      return Math.max(0, Math.min(ONB_STEP_COUNT - 1, i));
    },
    [isStepHidden]
  );
  const visibleSteps = useMemo(
    () => Array.from({ length: ONB_STEP_COUNT }, (_, i) => i).filter((i) => !isStepHidden(i)),
    [isStepHidden]
  );

  const safeOnbStep = Math.min(onbStep, ONB_STEP_COUNT - 1);
  const progressIndex = Math.max(0, visibleSteps.indexOf(safeOnbStep));
  const onbProgressValue = useMemo(
    () =>
      // First-run visitors only ever see this one screen before Home, so a
      // "step 1 of 9" progress bar would be meaningless (and about to jump to
      // Home makes it look broken). Hide it entirely for that path.
      firstRunOnboarding
        ? null
        : {
            current: progressIndex,
            total: visibleSteps.length,
            onJump: (i) => setOnbStep(visibleSteps[i] ?? 0),
          },
    [firstRunOnboarding, progressIndex, visibleSteps]
  );

  useEffect(() => {
    if (onbStep >= ONB_STEP_COUNT) {
      setOnbStep(ONB_STEP_COUNT - 1);
      return;
    }
    // Data changed mid-flow (e.g. the last child was removed) and left us on
    // a step that should now be hidden — hop to the next visible one.
    if (isStepHidden(onbStep)) {
      setOnbStep((s) => stepNeighbor(s, s >= ONB_STEP_COUNT - 1 ? -1 : 1));
    }
  }, [onbStep, isStepHidden, stepNeighbor]);

  // The last visible step shows a single "Generar" button (no "Siguiente"); the
  // first visible step hides the back button. This makes both the full flow and
  // the shortened quick-menu flow finish correctly regardless of which steps are
  // hidden.
  const lastVisibleStep = visibleSteps[visibleSteps.length - 1];
  const firstVisibleStep = visibleSteps[0];
  const nextOf = (i) =>
    i === lastVisibleStep ? undefined : () => fwd(() => setOnbStep(stepNeighbor(i, 1)));
  const backOf = (i) =>
    i === firstVisibleStep ? undefined : () => back(() => setOnbStep(stepNeighbor(i, -1)));

  const onbScreens = [
    <OnboardingMembers
      data={data}
      setData={setData}
      onNext={
        firstRunOnboarding
          ? () => { setFirstRunOnboarding(false); goToDashboard(); }
          : nextOf(0)
      }
      onFinish={firstRunOnboarding ? undefined : () => fwd(goToMenu)}
      nextLabel={firstRunOnboarding ? "Continuar" : undefined}
      onReset={firstRunOnboarding ? undefined : handleAbandonOnboarding}
    />,
    <OnboardingMenuModel
      data={data}
      setData={setData}
      onNext={nextOf(1)}
      onBack={backOf(1)}
      onFinish={() => fwd(goToMenu)}
      onReset={handleAbandonOnboarding}
    />,
    <OnboardingSchoolMenu
      data={data}
      setData={setData}
      onNext={nextOf(2)}
      onBack={backOf(2)}
      onFinish={() => fwd(goToMenu)}
      onReset={handleAbandonOnboarding}
    />,
    <OnboardingWeek
      data={data}
      setData={setData}
      onNext={nextOf(3)}
      onBack={backOf(3)}
      onFinish={() => fwd(goToMenu)}
      onReset={handleAbandonOnboarding}
    />,
    <OnboardingSchedule
      data={data}
      setData={setData}
      onNext={nextOf(4)}
      onBack={backOf(4)}
      onFinish={() => fwd(goToMenu)}
      onReset={handleAbandonOnboarding}
    />,
    <OnboardingMealStyle
      data={data}
      setData={setData}
      onNext={nextOf(5)}
      onBack={backOf(5)}
      onFinish={() => fwd(goToMenu)}
      onReset={handleAbandonOnboarding}
    />,
    <OnboardingRestrictions
      data={data}
      setData={setData}
      onNext={editPreferencesOrigin ? undefined : nextOf(6)}
      onBack={
        editPreferencesOrigin
          ? () => back(() => { setScreen(editPreferencesOrigin); setEditPreferencesOrigin(null); })
          : backOf(6)
      }
      onFinish={
        editPreferencesOrigin
          ? () => back(() => { setScreen(editPreferencesOrigin); setEditPreferencesOrigin(null); })
          : () => fwd(goToMenu)
      }
      onReset={handleAbandonOnboarding}
      {...(editPreferencesOrigin ? { finishLabel: "Guardar" } : {})}
    />,
    <OnboardingRepeat
      data={data}
      setData={setData}
      user={user}
      priceObs={data.priceObs ?? []}
      pantryEpoch={pantryEpoch}
      onNext={nextOf(7)}
      onBack={backOf(7)}
      onFinish={() => fwd(goToMenu)}
      onReset={handleAbandonOnboarding}
    />,
    <OnboardingCooking
      data={data}
      setData={setData}
      onNext={nextOf(8)}
      onBack={backOf(8)}
      onFinish={() => fwd(goToMenu)}
      onReset={handleAbandonOnboarding}
    />,
  ];

  const containerRef = useRef(null);
  useEffect(() => {
    if (containerRef.current) containerRef.current.scrollTop = 0;
  }, [screen, onbStep]);

  const animKey = `${screen}-${safeOnbStep}`;
  const animDir = dirRef.current;

  return (
    <div
      style={{
        maxWidth: APP_SHELL_MAX_WIDTH,
        margin: "0 auto",
        minHeight: "100dvh",
        background: "#fff",
        fontFamily: "'DM Sans', 'Helvetica Neue', sans-serif",
        position: "relative",
        overflowX: "hidden",
      }}
    >
      <style>{`
        @keyframes slideFromRight {
          from { opacity: 0; transform: translateX(18px); }
          to   { opacity: 1; transform: translateX(0); }
        }
        @keyframes slideFromLeft {
          from { opacity: 0; transform: translateX(-18px); }
          to   { opacity: 1; transform: translateX(0); }
        }
        /* "backwards" (not "both"): onboarding steps render nested position:fixed
           overlays (filter sheets, pickers…), and pinning transform after the
           transition ends would trap them inside this box instead of the
           viewport once the user scrolls. See index.css .mp-nav-fwd for detail. */
        .screen-enter-fwd  { animation: slideFromRight .22s cubic-bezier(.25,.46,.45,.94) backwards; }
        .screen-enter-back { animation: slideFromLeft  .22s cubic-bezier(.25,.46,.45,.94) backwards; }
      `}</style>
      <div
        ref={containerRef}
        style={{ minHeight: "100dvh", display: "flex", flexDirection: "column" }}
      >
        {screen === "splash" && (
          <SplashScreen
            onNext={() =>
              fwd(() => {
                // hasSaved is false here (see below), so this is always a
                // brand-new visitor: after this they only fill in "¿quién
                // come en casa?" and land straight on Home. Force onbStep
                // back to 0 too — it may still be pointing at a later step
                // left over from a previous (abandoned) attempt.
                setFirstRunOnboarding(true);
                setOnbStep(0);
                setScreen(!FORCE_VALUE_PROPS && valuePropsSeen ? "onboarding" : "valueProps");
              })
            }
            hasSaved={FORCE_VALUE_PROPS ? false : data.members.length > 0}
            onResume={() => fwd(() => setScreen("dashboard"))}
            isAuthed={Boolean(user)}
            onGoogle={signInWithGoogle}
          />
        )}

        {screen === "valueProps" && (
          <div
            key="valueProps"
            className={animDir === "forward" ? "screen-enter-fwd" : "screen-enter-back"}
            style={{ flex: 1, display: "flex", flexDirection: "column" }}
          >
            <Suspense fallback={null}>
              <ValuePropsCarousel
                onFinish={() => {
                  markValuePropsSeen();
                  fwd(() => setScreen("onboarding"));
                }}
              />
            </Suspense>
          </div>
        )}

        {screen === "onboarding" && (
          <OnboardingProgressContext.Provider value={onbProgressValue}>
            <div
              key={animKey}
              className={animDir === "forward" ? "screen-enter-fwd" : "screen-enter-back"}
              style={{ flex: 1, display: "flex", flexDirection: "column" }}
            >
              <div style={{ flex: 1 }}>{onbScreens[safeOnbStep]}</div>
            </div>
            {!afinarBubbleSeen && safeOnbStep === visibleSteps[1] && (
              <AfinarWizardBubble
                visibleSteps={visibleSteps}
                onClose={dismissAfinarBubble}
              />
            )}
          </OnboardingProgressContext.Provider>
        )}

        {screen === "menu" && (
          <div
            key="menu"
            className={animDir === "forward" ? "mp-nav-fwd" : "mp-nav-back"}
          >
            <MenuScreen
              data={data}
              setData={setData}
              menuPlan={menuPlan}
              isGenerating={isGeneratingMenu}
              error={menuError}
              restrictionConflicts={restrictionConflicts}
              onDishTap={handleDishTap}
              onNav={handleNav}
              onRegenerate={handleRegenerate}
              onRetry={retryGenerateMenu}
              onToast={showToast}
              user={user}
              onTrackEvent={(event, metadata) => trackEvent(user, event, "menu", metadata)}
              activeMenu={data.menus?.[data.activeMenuId] ?? null}
              onSwitchWeek={switchActiveWeek}
              onOpenMenus={openMenusScreen}
              autoOpenProfile={pendingProfileOpen}
              onAutoOpenProfileHandled={() => setPendingProfileOpen(false)}
              shoppingItems={shopping.items}
              onFocusCookDish={handleFocusCookDish}
            />
          </div>
        )}

        {screen === "menu" &&
          !menuCoachSeen &&
          !isGeneratingMenu &&
          !menuError &&
          Object.keys(menuPlan ?? {}).length > 0 && (
            <MenuCoachTour onClose={markMenuCoachSeen} />
          )}

        {screen === "menus" && (
          <div
            key="menus"
            className={animDir === "forward" ? "mp-nav-fwd" : "mp-nav-back"}
          >
            <Suspense fallback={null}>
              <MenusScreen
                data={data}
                hasAccount={Boolean(user)}
                onNav={handleNav}
                onOpenCurrent={() => fwd(() => setScreen("menu"))}
                onGenerateMenu={handleGenerateMenu}
                onReuseMenu={reuseMenu}
                onToggleFavorite={(menuId) => {
                  const nextFavorite = !data.menus?.[menuId]?.isFavorite;
                  setData((d) => ({ ...d, menus: toggleMenuFavorite(d.menus, menuId) }));
                  if (user) toggleMenuFavoriteRemote(user.id, menuId, nextFavorite);
                }}
                onSignIn={signInWithGoogle}
                onRegenerateActive={() => { fwd(() => setScreen("menu")); regenerateMenu(); }}
                onEditActive={() => { setPendingProfileOpen(true); fwd(() => setScreen("menu")); }}
                onDeleteActive={deleteActiveMenu}
                onOpenHistory={openHistoryMenu}
                onDeleteHistory={deleteHistoryMenu}
              />
            </Suspense>
          </div>
        )}

        {screen === "menuHistory" && historyMenuId && data.menus?.[historyMenuId] && (
          <div
            key="menuHistory"
            className={animDir === "forward" ? "mp-nav-fwd" : "mp-nav-back"}
          >
            <Suspense fallback={null}>
              <MenuHistoryView
                menu={data.menus[historyMenuId]}
                data={data}
                onBack={() => back(() => setScreen("menus"))}
              />
            </Suspense>
          </div>
        )}

        {screen === "shopping" && (
          <div
            key="shopping"
            className={animDir === "forward" ? "mp-nav-fwd" : "mp-nav-back"}
          >
            <Suspense fallback={null}>
              <ShoppingScreen
                shopping={shopping}
                setShopping={setShopping}
                data={data}
                setData={setData}
                onNav={handleNav}
                onToast={showToast}
                menuWeek={data.menuWeek}
                menuWeeks={data.activeMenuId ? orderedWeeks(data.menus?.[data.activeMenuId]) : null}
                activeOffset={data.menuWeek?.offset ?? null}
                onUpdateWeek={updateWeekShopping}
                initialFocusDish={cookFocus}
                onFocusDishHandled={() => setCookFocus(null)}
                onOpenPantry={() => fwd(() => { setPantryOrigin("shopping"); setScreen("pantry"); })}
                pantryEpoch={pantryEpoch}
              />
            </Suspense>
          </div>
        )}

        {screen === "analytics" && (
          <div
            key="analytics"
            className={animDir === "forward" ? "mp-nav-fwd" : "mp-nav-back"}
          >
            <Suspense fallback={null}>
              <AnalyticsScreen
                data={data}
                setData={setData}
                menuPlan={menuPlan}
                shopping={shopping}
                setShopping={setShopping}
                onUndoReceiptTachado={undoReceiptTachado}
                onNav={handleNav}
                onToast={showToast}
              />
            </Suspense>
          </div>
        )}

        {screen === "settings" && (
          <div
            key="settings"
            className={animDir === "forward" ? "mp-nav-fwd" : "mp-nav-back"}
          >
            <Suspense fallback={null}>
              <SettingsScreen
                user={user}
                data={data}
                setData={setData}
                onNav={handleNav}
                onOpenAccount={() => fwd(() => setScreen("account"))}
                onOpenDashboard={goToDashboard}
                onEditPreferences={() => openEditPreferences("settings")}
                onSignIn={signInWithGoogle}
                onReset={handleReset}
              />
            </Suspense>
          </div>
        )}

        {screen === "account" && (
          <div
            key="account"
            className={animDir === "forward" ? "mp-nav-fwd" : "mp-nav-back"}
          >
            <Suspense fallback={null}>
              <AccountScreen
                user={user}
                data={data}
                setData={setData}
                menuPlan={menuPlan}
                setMenuPlan={setMenuPlan}
                onNav={handleNav}
                onBack={() => back(() => setScreen("settings"))}
                onEditMembers={() => goToOnboardingStep(0)}
                onEditPreferences={() => openEditPreferences("account")}
                onSignIn={signInWithGoogle}
                onSignOut={signOut}
                onToast={showToast}
              />
            </Suspense>
          </div>
        )}

        {screen === "pantry" && (
          <div
            key="pantry"
            className={animDir === "forward" ? "mp-nav-fwd" : "mp-nav-back"}
          >
            <Suspense fallback={null}>
              <PantryScreen
                user={user}
                onBack={() => back(() => setScreen(pantryOrigin))}
                priceObs={data.priceObs ?? []}
                pantryEpoch={pantryEpoch}
                onNav={handleNav}
                navActive={
                  pantryOrigin === "shopping" ? "shopping"
                  : pantryOrigin === "account" ? "settings"
                  : "pantry"
                }
                navContext={
                  pantryOrigin === "shopping" || pantryOrigin === "account" ? "menu" : "home"
                }
              />
            </Suspense>
          </div>
        )}

        {screen === "dashboard" && (
          <div
            key="dashboard"
            className={animDir === "forward" ? "mp-nav-fwd" : "mp-nav-back"}
          >
            <Suspense fallback={null}>
              <DashboardScreen
                user={user}
                data={data}
                menuPlan={menuPlan}
                onNav={handleNav}
                onOpenAccount={() => fwd(() => setScreen("profile"))}
                onViewMenu={goToMenuFromDashboard}
                onGenerateNewMenu={handleGenerateMenu}
                onOpenAnalytics={() => fwd(() => setScreen("analytics"))}
                onOpenRecipePlanner={() => { recipePlannerOriginRef.current = "dashboard"; setEditingRecipe(null); fwd(() => setScreen("recipePlanner")); }}
                onOpenRecipes={() => fwd(() => setScreen("recipes"))}
                onOpenStreak={() => fwd(() => setScreen("account"))}
              />
            </Suspense>
          </div>
        )}

        {screen === "dashboard" && !homeCoachSeen && (
          <HomeCoachTour onClose={markHomeCoachSeen} />
        )}

        {screen === "recipes" && (
          <div
            key="recipes"
            className={animDir === "forward" ? "mp-nav-fwd" : "mp-nav-back"}
          >
            <Suspense fallback={null}>
              <RecipesScreen
                userRecipes={data.userRecipes}
                recipeVotes={data.recipeVotes}
                scopeGroups={favoriteScopeGroups}
                onSetFavoriteScope={handleSetFavoriteScope}
                onOpenRecipe={handleOpenCatalogRecipe}
                onNav={handleNav}
                onOpenRecipePlanner={() => { recipePlannerOriginRef.current = "recipes"; setEditingRecipe(null); fwd(() => setScreen("recipePlanner")); }}
                onEditRecipe={(recipe) => { recipePlannerOriginRef.current = "recipes"; setEditingRecipe(recipe); fwd(() => setScreen("recipePlanner")); }}
                onChangeRecipeVisibility={(recipeId, visibility) => {
                  setData((d) => ({
                    ...d,
                    userRecipes: (d.userRecipes ?? []).map((r) =>
                      (r.id ?? r.name) === recipeId ? { ...r, visibility } : r
                    ),
                  }));
                  if (user?.id) updateRecipeVisibility(user.id, recipeId, visibility);
                }}
                onDeleteRecipe={(recipeId) => {
                  setData((d) => ({
                    ...d,
                    userRecipes: (d.userRecipes ?? []).filter((r) => (r.id ?? r.name) !== recipeId),
                  }));
                  if (user?.id) deleteUserRecipe(user.id, recipeId);
                  showToast("Receta eliminada");
                }}
                onCombineGarnish={(recipe, garnish) => {
                  if (!garnish) return;
                  const combo = buildGarnishComboRecipe(recipe, garnish);
                  setData((d) => ({ ...d, userRecipes: [...(d.userRecipes ?? []), combo] }));
                  const eaters = Math.max(1, data.members?.length || 4);
                  registerRecipes([catalogToFrontendRecipe(combo, eaters)]);
                  if (user?.id) upsertUserRecipe(user.id, combo);
                  showToast(`Guardada en Mis recetas: ${combo.name}`);
                }}
              />
            </Suspense>
          </div>
        )}

        {screen === "recipes" && !recipesCoachSeen && (
          <RecipesCoachTour onClose={markRecipesCoachSeen} />
        )}

        {screen === "profile" && (
          <div
            key="profile"
            className={animDir === "forward" ? "mp-nav-fwd" : "mp-nav-back"}
          >
            <Suspense fallback={null}>
              <HomeProfileScreen
                user={user}
                data={data}
                setData={setData}
                onNav={handleNav}
                onSignIn={signInWithGoogle}
                onSignOut={signOut}
                onReset={handleSoftReset}
                onDeleteAccount={handleDeleteAccount}
                onEditMembers={() => fwd(() => setScreen("members"))}
              />
            </Suspense>
          </div>
        )}

        {screen === "members" && (
          <div
            key="members"
            className={animDir === "forward" ? "mp-nav-fwd" : "mp-nav-back"}
          >
            {/* Standalone household editor — isolated from menu generation so
                "Gestionar familia" never drops the user back into onboarding. */}
            <OnboardingMembers
              data={data}
              setData={setData}
              onBack={() => back(() => setScreen("profile"))}
              onNext={() => back(() => setScreen("profile"))}
              nextLabel="Guardar"
              showMenuModel
            />
          </div>
        )}

        {screen === "recipePlanner" && (
          <div
            key="recipePlanner"
            className={animDir === "forward" ? "mp-nav-fwd" : "mp-nav-back"}
          >
            <Suspense fallback={null}>
              <RecipePlannerScreen
                userRecipes={data.userRecipes}
                user={user}
                setData={setData}
                editRecipe={editingRecipe}
                onClose={() => { setEditingRecipe(null); back(() => setScreen(recipePlannerOriginRef.current ?? "dashboard")); }}
                onSaved={(recipe, { edited } = {}) => {
                  showToast(edited ? "Receta actualizada" : "Receta creada con IA");
                  if (user?.id && recipe) upsertUserRecipe(user.id, recipe);
                  setEditingRecipe(null);
                  // Saving takes you straight Home (dashboard), not back into
                  // the wizard's success screen.
                  goToDashboard();
                }}
              />
            </Suspense>
          </div>
        )}
      </div>

      {isGeneratingMenu && <GeneratingScreen onStop={stopGeneration} />}

      {individualPrompt && (
        <IndividualMenuSheet
          member={data.members.find((m) => m.id === individualPrompt.memberId) ?? null}
          reason={individualPrompt.reason}
          onConfirm={confirmIndividualMenu}
          onCancel={() => setIndividualPrompt(null)}
        />
      )}

      {selectedSlot && (
        <DishDetail
          key={selectedSlot.recipe.id}
          recipe={selectedSlot.recipe}
          slot={selectedSlot.slot}
          group={selectedSlot.group ?? null}
          allMembers={data.members}
          kitchenTools={data.kitchenTools ?? []}
          browse={Boolean(selectedSlot.browse)}
          userVote={voteOf(data.recipeVotes?.[selectedSlot.recipe.id])}
          onVote={(vote) => handleVoteRecipe(selectedSlot.recipe.id, vote)}
          favoriteScope={favScopeOf(data.recipeVotes?.[selectedSlot.recipe.id])}
          scopeGroups={favoriteScopeGroups}
          onSetFavoriteScope={(scope) => handleSetFavoriteScope(selectedSlot.recipe.id, scope)}
          onClose={() => setSelectedSlot(null)}
          onReject={selectedSlot.browse ? undefined : () => handleReplaceSlot(selectedSlot)}
        />
      )}

      {resetConfirm && (() => {
        const variant = RESET_VARIANTS[resetConfirm];
        const danger = variant.tone === "danger";
        const confirmAction =
          resetConfirm === "soft"
            ? doSoftReset
            : resetConfirm === "delete"
              ? doDeleteAccount
              : resetConfirm === "abandon"
                ? doAbandonOnboarding
                : doReset;
        return (
          <div
            onClick={() => setResetConfirm(null)}
            style={{
              position: "fixed", inset: 0, zIndex: 300,
              background: "rgba(20,47,29,.4)",
              backdropFilter: "blur(2px)",
              display: "flex", alignItems: "center", justifyContent: "center",
              padding: "0 22px",
              animation: "mpModalFadeIn .2s ease",
            }}
          >
            <style>{`
              @keyframes mpModalFadeIn { from { opacity: 0; } to { opacity: 1; } }
              @keyframes mpModalPop {
                0%   { opacity: 0; transform: translateY(18px) scale(.94); }
                60%  { transform: translateY(-3px) scale(1.01); }
                100% { opacity: 1; transform: translateY(0) scale(1); }
              }
              @keyframes mpModalBob {
                0%, 100% { transform: translateY(0) rotate(-4deg); }
                50%      { transform: translateY(-4px) rotate(-4deg); }
              }
            `}</style>
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                position: "relative",
                width: "100%",
                maxWidth: 360,
                background: "#fff",
                borderRadius: 24,
                padding: "28px 22px 20px",
                boxShadow: "0 18px 50px rgba(20,47,29,.32)",
                animation: "mpModalPop .38s cubic-bezier(.34,1.56,.5,1) both",
              }}
            >
              <div
                style={{
                  position: "absolute",
                  top: -24,
                  left: 24,
                  width: 52,
                  height: 52,
                  borderRadius: "50% 50% 50% 8px",
                  background: danger
                    ? "linear-gradient(135deg, #b7452f, #d9704f)"
                    : "linear-gradient(135deg, #2d5a3d, #4cba6e)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  boxShadow: danger
                    ? "0 6px 16px rgba(183,69,47,.4)"
                    : "0 6px 16px rgba(45,90,61,.4)",
                  animation: "mpModalBob 2.4s ease-in-out infinite",
                }}
              >
                <variant.Icon size={24} color="#fff" />
              </div>

              <div style={{ marginTop: 20 }}>
                <h3 style={{
                  margin: "0 0 6px", fontSize: 19, fontWeight: 900,
                  color: "#142f1d", letterSpacing: "-.4px",
                }}>
                  {variant.title}
                </h3>
                <p style={{
                  margin: "0 0 20px", fontSize: 13.5, color: "#5a7a66",
                  lineHeight: 1.5,
                }}>
                  {variant.desc}
                </p>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <button
                  type="button"
                  onClick={() => setResetConfirm(null)}
                  style={{
                    width: "100%",
                    padding: "13px 16px",
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
                  {resetConfirm === "abandon" ? "Seguir aquí" : "Cancelar"}
                </button>
                <button
                  type="button"
                  onClick={confirmAction}
                  style={{
                    width: "100%",
                    padding: "12px 16px",
                    borderRadius: 13,
                    border: `1.5px solid ${danger ? "#f0c9bf" : "#cfe0d4"}`,
                    background: "#fff",
                    color: danger ? "#a8402b" : "#2d5a3d",
                    fontSize: 13.5,
                    fontWeight: 800,
                    cursor: "pointer",
                    fontFamily: "inherit",
                  }}
                >
                  {variant.confirmLabel}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {whoForOpen && (
        <div
          onClick={() => setWhoForOpen(false)}
          className="mp-overlay-in"
          style={{
            position: "fixed", inset: 0, zIndex: 300,
            background: "rgba(0,0,0,.5)",
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: "0 24px",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="mp-sheet-up"
            style={{
              background: "#fff",
              borderRadius: 26,
              padding: "26px 22px 20px",
              width: "100%", maxWidth: 360, boxSizing: "border-box",
              boxShadow: "0 24px 60px rgba(0,0,0,.25)",
            }}
          >
            <h3 style={{ margin: "0 0 6px", fontSize: 20, fontWeight: 900, color: "#142f1d", textAlign: "center", letterSpacing: "-.01em" }}>
              ¿Para quién es el menú?
            </h3>
            <p style={{ margin: "0 auto 20px", fontSize: 13.5, color: "#7a9485", textAlign: "center", lineHeight: 1.45, maxWidth: 260 }}>
              Reutiliza tu familia o empieza de cero para otro grupo.
            </p>

            {(() => {
              const options = [
                {
                  key: "family", Icon: Users, primary: true,
                  label: "Mi familia habitual",
                  onClick: () => { setWhoForOpen(false); startQuickMenu(); },
                },
                {
                  key: "other", Icon: Sparkles, primary: false,
                  label: "Otro grupo",
                  onClick: () => { setWhoForOpen(false); setQuickMenu(false); goToOnboardingStep(0); },
                },
              ];
              return (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {options.map(({ key, Icon, primary, label, onClick }) => (
                    <button
                      key={key}
                      type="button"
                      onClick={onClick}
                      style={{
                        display: "flex", flexDirection: "column", alignItems: "center",
                        justifyContent: "center", gap: 10, width: "100%", textAlign: "center",
                        padding: "22px 18px", borderRadius: 20, cursor: "pointer",
                        fontFamily: "inherit",
                        background: primary ? "#eef6f0" : "#f7f9f8",
                        border: `2.5px solid ${primary ? "#bfe0cb" : "#e8ede9"}`,
                        transition: "all .15s ease",
                      }}
                    >
                      <span
                        style={{
                          width: 58, height: 58, borderRadius: 18,
                          background: primary ? "#2d5a3d" : "#edf2ee",
                          display: "inline-flex", alignItems: "center", justifyContent: "center",
                        }}
                      >
                        <Icon size={28} color={primary ? "#fff" : "#2d5a3d"} strokeWidth={2.2} />
                      </span>
                      <span style={{ fontWeight: 800, color: "#1a3a24", fontSize: 15.5 }}>
                        {label}
                      </span>
                    </button>
                  ))}
                </div>
              );
            })()}

            <button
              type="button"
              onClick={() => setWhoForOpen(false)}
              style={{
                display: "block", margin: "16px auto 0", padding: "6px 12px",
                border: "none", background: "none", cursor: "pointer",
                fontFamily: "inherit", fontSize: 13.5, fontWeight: 700, color: "#9aa8a0",
              }}
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* FeedbackFAB hidden */}

      {toast && (
        <div
          className="mp-toast-in"
          style={{
            position: "fixed",
            bottom: 80,
            left: "50%",
            transform: "translateX(-50%)",
            display: "flex",
            alignItems: "center",
            gap: 10,
            maxWidth: "calc(100% - 40px)",
            // Same tinted-green wizard-sheet palette as the pop-ups, so a
            // toast reads as "the same app" instead of a separate dark pill.
            background: "#f3f8f4",
            border: "1px solid #e2ede5",
            color: "#142f1d",
            padding: "9px 16px 9px 9px",
            borderRadius: 18,
            fontSize: 13,
            fontWeight: 800,
            lineHeight: 1.3,
            boxShadow: "0 16px 40px rgba(0,0,0,.22)",
            zIndex: 200,
          }}
        >
          <span
            style={{
              width: 28,
              height: 28,
              borderRadius: 9,
              background: "#2d5a3d",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
              boxShadow: "0 3px 8px rgba(45,90,61,.35)",
            }}
          >
            <Check size={14} color="#fff" strokeWidth={2.6} />
          </span>
          {toast}
        </div>
      )}
    </div>
  );
}

function SplashScreen({ onNext, hasSaved, onResume, isAuthed, onGoogle }) {
  const handleEnter = () => (hasSaved ? onResume() : onNext());
  const phrases = [
    "qué te gusta comer",
    "qué no puedes comer",
    "cuándo comes en casa",
    "tu tiempo para cocinar",
    "el menú del cole de tus hijos",
  ];
  const [phraseIdx, setPhraseIdx] = useState(0);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const total = phrases.length;
    const interval = setInterval(() => {
      setVisible(false);
      setTimeout(() => {
        setPhraseIdx((i) => (i + 1) % total);
        setVisible(true);
      }, 350);
    }, 1800);
    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      onClick={handleEnter}
      style={{
        position: "relative",
        minHeight: "100dvh",
        width: "100%",
        cursor: "pointer",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        justifyContent: "flex-end",
        background: "#0a160e",
      }}
    >
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(22px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes glowPulse {
          0%, 100% { opacity: .55; transform: scale(1); }
          50%       { opacity: .75; transform: scale(1.06); }
        }
        @keyframes shimmer {
          0%   { transform: translateX(-120%) skewX(-18deg); }
          100% { transform: translateX(320%) skewX(-18deg); }
        }
        @keyframes btnGlow {
          0%, 100% { box-shadow: 0 8px 28px rgba(61,122,82,.45), 0 2px 8px rgba(0,0,0,.25); }
          50%       { box-shadow: 0 10px 36px rgba(61,122,82,.7),  0 2px 8px rgba(0,0,0,.25); }
        }
        .splash-btn {
          transition: transform .14s ease;
          animation: btnGlow 3s ease-in-out infinite;
          animation-delay: 1.2s;
        }
        .splash-btn:active { transform: scale(.97); }
        .splash-btn .shimmer-bar {
          position: absolute;
          top: 0; left: 0;
          width: 40%;
          height: 100%;
          background: linear-gradient(90deg, transparent, rgba(255,255,255,.22), transparent);
          border-radius: inherit;
          animation: shimmer 3.2s ease-in-out infinite;
          animation-delay: 1.8s;
          pointer-events: none;
        }
      `}</style>

      {/* Vídeo de fondo */}
      <video
        autoPlay
        muted
        loop
        playsInline
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          objectFit: "cover",
          animation: "fadeIn 1.2s ease-out",
        }}
      >
        <source src="/splash.mp4" type="video/mp4" />
      </video>

      {/* Overlay oscuro uniforme */}
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          background: "rgba(0,0,0,0.32)",
        }}
      />

      {/* Gradiente inferior */}
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          background:
            "linear-gradient(180deg, rgba(5,14,8,0) 0%, rgba(5,14,8,.1) 45%, rgba(5,14,8,.82) 75%, rgba(5,14,8,.98) 100%)",
        }}
      />

      {/* Glow detrás del título */}
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          top: 0,
          left: "50%",
          transform: "translateX(-50%)",
          width: 340,
          height: 340,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(61,122,82,.38) 0%, transparent 70%)",
          animation: "glowPulse 5s ease-in-out infinite",
          zIndex: 1,
          pointerEvents: "none",
        }}
      />

      {/* Título centrado arriba */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          zIndex: 2,
          padding: "72px 32px 0",
          color: "#fff",
          textAlign: "center",
          animation: "fadeUp .8s ease-out both",
        }}
      >
        <h1
          style={{
            fontSize: 76,
            fontWeight: 900,
            margin: "0 0 18px",
            letterSpacing: "-3px",
            lineHeight: 1,
            fontFamily: "'Playfair Display', Georgia, serif",
            textShadow: "0 2px 24px rgba(0,0,0,.55)",
          }}
        >
          Menú<span style={{ color: "#7ecb96" }}>Plan</span>
        </h1>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 4 }}>
          <p style={{
            fontSize: 20, lineHeight: 1.4, margin: 0,
            color: "rgba(255,255,255,.88)", fontWeight: 400, fontStyle: "italic",
            letterSpacing: "-.2px", textShadow: "0 1px 10px rgba(0,0,0,.5)",
            textAlign: "left",
            animation: "fadeUp .8s ease-out .25s both",
          }}>
            Tu app de <span style={{ color: "#7ecb96" }}>menús familiares</span>.
          </p>
          <div style={{ animation: "fadeUp .8s ease-out .4s both", textAlign: "left" }}>
            <p style={{
              fontSize: 20, lineHeight: 1.4, margin: 0,
              color: "rgba(255,255,255,.88)", fontWeight: 400, fontStyle: "italic",
              letterSpacing: "-.2px", textShadow: "0 1px 10px rgba(0,0,0,.5)",
            }}>
              Dinos{" "}
              <span style={{
                color: "#7ecb96",
                display: "inline-block",
                opacity: visible ? 1 : 0,
                transform: visible ? "translateY(0)" : "translateY(5px)",
                transition: "opacity .35s ease, transform .35s ease",
              }}>
                {phrases[phraseIdx]}
              </span>
            </p>
            <p style={{
              fontSize: 20, lineHeight: 1.4, margin: "6px 0 0",
              color: "rgba(255,255,255,.88)", fontWeight: 400, fontStyle: "italic",
              letterSpacing: "-.2px", textShadow: "0 1px 10px rgba(0,0,0,.5)",
            }}>
              Y nosotros nos encargamos del resto.
            </p>
          </div>
        </div>
      </div>

      {/* Botón abajo */}
      <div
        style={{
          position: "relative",
          zIndex: 2,
          padding: "0 28px 40px",
          animation: "fadeUp .8s ease-out .5s both",
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {hasSaved || isAuthed ? (
          <GhostPillButton onClick={handleEnter} tone="light">
            {hasSaved ? "Continuar" : "Empezar ya"}
          </GhostPillButton>
        ) : (
          <>
            <GoogleButton onClick={onGoogle} variant="dark" />
            <GhostPillButton onClick={handleEnter} tone="light">
              Entrar sin cuenta
            </GhostPillButton>
          </>
        )}
      </div>
    </div>
  );
}
