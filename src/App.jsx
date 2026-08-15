import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Users, Sparkles, LogOut, RotateCcw, AlertTriangle, Trash2, Check, Soup, Utensils, Play, Eraser, X } from "lucide-react";
import { BottomNav, APP_SHELL_MAX_WIDTH, GoogleButton, GhostPillButton, GroupAvatarStack, groupAvatarFaces } from "./components/ui.jsx";
import {
  OnboardingMembers,
  OnboardingRestrictions,
  OnboardingMenuModel,
  OnboardingMealStyle,
  OnboardingMealExtras,
  OnboardingSchedule,
  OnboardingSchoolMenu,
  OnboardingCooking,
  OnboardingCookTime,
  OnboardingWeek,
  AfinarWizardBubble,
  IndividualMenuSheet,
} from "./screens/Onboarding.jsx";
import { OnboardingProgressContext } from "./screens/onboardingProgressContext.js";
import { MenuScreen, DishDetail } from "./screens/Menu.jsx";
import { CatalogBrowserSheet } from "./screens/CatalogBrowserSheet.jsx";
import { SlotTypePickerSheet } from "./screens/SlotTypePickerSheet.jsx";
import { recipeCatalogById } from "./data/recipeCatalog.js";
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
import { generateMenuWithAI, pickCatalogReplacement, pickGarnishReplacement, catalogToFrontendRecipe } from "./lib/aiPlanner.js";
import { resolvePlannerModel } from "./lib/aiModels.js";
import { findMenuRestrictionConflicts } from "./utils/menuConflicts.js";
import { GeneratingScreen } from "./screens/GeneratingScreen.jsx";
import { buildShoppingList } from "./lib/shoppingBuilder.js";
import { normalizeIngredientKey } from "./lib/ingredientCategories.js";
import { getDayMeals } from "./lib/planner.js";
import {
  groupsFromModel,
  migrateGroupsForBabies,
  memberIsBaby,
  canSplitMenus,
  hasChildMember,
  createIndividualMenuGroup,
  individualMenuGroupFor,
  pruneExpiredIndividualMenus,
  adhocReasonLabel,
  resolveMemberAge,
  membersOfGroup,
  reconcileGroupsWithMembers,
} from "./lib/groups.js";
import { loadState, saveState, clearState } from "./lib/storage.js";
import {
  clampWeekCount,
  computeWeekRange,
  createMenuId,
  foldInNewMenu,
  removeMenu,
  toggleMenuFavorite,
  saveActivePlanAsFavorite,
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
import {
  loadRecipeDiscards,
  saveRecipeDiscard,
  deleteRecipeDiscard,
  upsertRecipeDiscards,
  mergeDiscards,
} from "./lib/recipeDiscardsSync.js";
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
import {
  DEFAULT_ROSTER_ID,
  ensureRosters,
  listRosters,
  startOtherRoster,
  switchRoster,
} from "./lib/rosters.js";
import { navDirection } from "./lib/motion.js";
import { useAuth } from "./lib/useAuth.js";
import { FeedbackFAB } from "./components/FeedbackFAB.jsx";
import { HomeCoachTour, RecipesCoachTour, MenuCoachTour } from "./components/HomeCoachTour.jsx";
import { ModeSelectSheet } from "./components/ModeSheets.jsx";
import { trackEvent, upsertUserProfile, APP_VERSION } from "./lib/analytics.js";
import { loadPantry, loadLocalPantry, mergeLocalPantryIntoCloud } from "./lib/pantry.js";
import { applyConsumption, consumeFromPantry, restoreToPantry } from "./lib/cookPantry.js";
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
  // Recipes the user rejected from the menu, by base catalog id:
  //   forever[]              → permanent "No me gusta" (shown in Recetas ▸ Descartados, reversible)
  //   cooldownUntil{ id: ts } → temporary ("Esta semana no"/"Tarda demasiado" ≈7d,
  //                             "Lo comí hace poco" ≈14d). Excluded while ts > now.
  discards: { forever: [], cooldownUntil: {} },
  // When true, mapped «En casa» stock soft-biases menu generation (pantryScore
  // + LLM nudge). Shopping still discounts stock either way.
  useHomeStock: true,
  // How «En casa» stock feeds menu generation:
  //   "only"   → strong bias: build the menu mostly from what's at home
  //   "prefer" → soft, secondary preference (the historical useHomeStock:true)
  //   "off"    → ignore the pantry when planning
  // useHomeStock is kept in sync as a legacy boolean (off ⇄ false).
  pantryMode: "prefer",
  // ── Modo básico vs avanzado (progressive disclosure) ──
  // false = modo básico (por defecto): asumimos los ajustes más sencillos y
  // ocultamos los controles avanzados. true = modo avanzado: el usuario ve y
  // controla todo. La elección se pide una vez, tras el spotlight de Inicio.
  expertMode: false,
  // Si ya se ha mostrado el selector básico/avanzado (para no repetirlo).
  modePrompted: false,
  // Decisiones "finas" de despensa (solo modo avanzado). En básico se fuerzan
  // los defaults de más abajo. Ver el cuestionario de 4 preguntas en «En casa».
  //   apply:     "snapshot" (se calcula al generar y no cambia) | "onShop" | "live"
  //   multiWeek: "nearest"  (la despensa va a la semana más cercana) | "all" | "spread"
  //   lifecycle: "weekly"   (se resetea cada semana) | "persist"
  //   consume:   "onGenerate" (descuenta el menú de golpe) | "onCook" | "endOfDay" | "none"
  pantryPrefs: { apply: "snapshot", multiWeek: "nearest", lifecycle: "weekly", consume: "onGenerate" },
  // Si el usuario ya respondió el cuestionario de despensa (modo avanzado).
  pantryPrefsSet: false,
  // Si ya se ha mostrado el cuestionario de despensa al menos una vez (para no
  // volver a abrirlo solo aunque respondan "más tarde"; el icono lo reabre).
  pantryPrefsSeen: false,
  // Deltas reversibles de la bajada "al generar el menú" (decisión D), por
  // semana — ver migración arriba para la explicación completa.
  pantryGenDeltas: {},
  // Recipes created by the user via the recipe planner. Same shape as the
  // bundled catalog (see src/data/recipes/*.json) plus source:"user".
  userRecipes: [],
  // Per-user recipe like/dislike ratings + favorite scope, keyed by recipe id.
  // See lib/recipeVotes.js — the two are independent (VoteEntry: { v, fav }).
  recipeVotes: {},
  menuModel: "same",
  groups: [],
  meals: ["Comida", "Cena"],
  // Optional "off-menu" meals, planned deterministically from the light pool
  // (fruit/yogur/pan…), never by the AI. desayuno: off|variado|findes|igual ·
  // merienda (kids only): off|semana|laborables · postre: off|comida|cena|ambas.
  // postreTipo: inmediato|cazo|horno · postreInmediato: fruta|yogur|mix.
  extraMeals: { desayuno: "off", merienda: "off", postre: "off", postreTipo: "inmediato", postreInmediato: "mix" },
  // Estructura de plato global (fallback del per-grupo mealStructureByGroup).
  // En modo básico se elige aquí (un solo control, aplica a todos). "1_plato" o
  // "primero_segundo".
  mealStructure: "primero_segundo",
  schedule: {},
  // schoolMenus: { shared: { "Lun-Primero": "...", "Lun-Segundo": "...", "Lun-Postre": "..." },
  //                byMember: { [memberId]: { ... } } }
  schoolMenus: { shared: {}, byMember: {} },
  // Advanced: kids' dinner mirrors adults' lunch that day (and adults' lunch
  // avoids the school menu). Only meaningful with a school menu uploaded and
  // separate Adultos/Niños groups.
  kidDinnerMatchesAdultLunch: false,
  // Reuse the first day's garnish across the week / weekdays / weekend.
  // off | week | weekdays | weekend
  garnishRepeat: "off",
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
  // ── Grupos de personas para los que planificas (lib/rosters.js) ──
  // El roster activo vive en los campos de arriba (members, groups, schedule…);
  // los demás se aparcan aquí y se intercambian al cambiar de grupo, de modo
  // que "Otro grupo" ya no contamina la familia habitual.
  rosters: {},
  activeRosterId: DEFAULT_ROSTER_ID,
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

// Ajustes que el modo básico da por sentados (progressive disclosure). Se
// aplican SOLO al generar el menú, sin tocar lo que el usuario tenga guardado,
// para que al pasar a avanzado recupere sus elecciones intactas.
const BASIC_PANTRY_PREFS = {
  apply: "snapshot",      // se calcula al generar y no cambia solo
  multiWeek: "nearest",   // en multisemana, la despensa va a la más cercana
  lifecycle: "weekly",    // el ciclo de vida se resetea cada semana
  consume: "onGenerate",  // se descuenta el menú de golpe al generar
};

// Devuelve una copia de `data` con los ajustes del modo básico forzados.
// En modo avanzado (expertMode) devuelve `data` tal cual.
function resolveModeData(data) {
  if (!data || data.expertMode) return data;
  // Cenas rápidas viven en data.slotType como entradas "…|Cena": "rapida".
  // En básico se descartan las que vienen de la configuración del onboarding,
  // PERO se respetan las elegidas a mano desde el menú (data.manualSlotType),
  // porque son una decisión explícita del usuario para ese hueco concreto.
  const slotType = data.slotType ?? {};
  const manualSlotType = data.manualSlotType ?? {};
  const cleanedSlotType = {};
  for (const [k, v] of Object.entries(slotType)) {
    if (v !== "rapida" || manualSlotType[k]) cleanedSlotType[k] = v;
  }
  // Tiempo de cocina compartido (comida = cena) en básico.
  const ct = data.cookTime?.weekday ? data.cookTime : COOK_TIME_DEFAULTS;
  const syncBlock = (b) => {
    const v = Math.max(b?.Comida ?? 30, b?.Cena ?? 30);
    return { Comida: v, Cena: v };
  };
  return {
    ...data,
    // Solo comidas y cenas: sin desayuno, merienda ni postre.
    extraMeals: { desayuno: "off", merienda: "off", postre: "off", postreTipo: "inmediato", postreInmediato: "mix" },
    // Sin cenas rápidas.
    slotType: cleanedSlotType,
    // Nivel de cocina normal.
    cookLevel: "normal",
    // Despensa: usar lo que haya (preferencia blanda).
    pantryMode: "prefer",
    useHomeStock: true,
    // Multisemana: cosas distintas cada semana (sin repetir platos).
    menuVarietyPref: "strict",
    // Estilo de comida: equilibrado, sin diferenciar por grupo.
    mealStyleByGroup: {},
    // Estructura de plato única para todos (la global elegida en «¿Qué comidas
    // quieres organizar?»); ignora overrides por grupo del modo avanzado.
    mealStructureByGroup: {},
    // Tiempo de cocina igual para comida y cena.
    cookTime: { mode: "shared", weekday: syncBlock(ct.weekday), weekend: syncBlock(ct.weekend) },
    // Decisiones finas de despensa: los defaults sencillos.
    pantryPrefs: { ...BASIC_PANTRY_PREFS },
  };
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
  if (!d.extraMeals || typeof d.extraMeals !== "object") {
    d.extraMeals = { desayuno: "off", merienda: "off", postre: "off", postreTipo: "inmediato", postreInmediato: "mix" };
  } else {
    d.extraMeals = {
      desayuno: d.extraMeals.desayuno ?? "off",
      merienda: d.extraMeals.merienda ?? "off",
      postre: d.extraMeals.postre ?? "off",
      postreTipo: d.extraMeals.postreTipo ?? "inmediato",
      postreInmediato: d.extraMeals.postreInmediato ?? "mix",
    };
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
  // pantryMode is the richer 3-way successor to the useHomeStock boolean; seed
  // it from the legacy flag for existing saves (false → "off", true → "prefer").
  if (!["only", "prefer", "off"].includes(d.pantryMode)) {
    d.pantryMode = d.useHomeStock === false ? "off" : "prefer";
  }
  // ── Modo básico / avanzado ──
  const looksEstablished =
    (Array.isArray(d.members) && d.members.length > 0) ||
    (d.menus && Object.keys(d.menus).length > 0) ||
    planHasDishes(state.menuPlan);
  if (typeof d.expertMode !== "boolean") d.expertMode = false;
  if (typeof d.kidDinnerMatchesAdultLunch !== "boolean") d.kidDinnerMatchesAdultLunch = false;
  if (!["off", "week", "weekdays", "weekend"].includes(d.garnishRepeat)) d.garnishRepeat = "off";
  if (typeof d.modePrompted !== "boolean") {
    // Cuentas ya en marcha no deben ver de repente el selector de modo: se da
    // por respondido (quedan en básico). Los usuarios nuevos lo verán una vez.
    d.modePrompted = Boolean(looksEstablished);
  }
  if (!d.pantryPrefs || typeof d.pantryPrefs !== "object") d.pantryPrefs = {};
  d.pantryPrefs = {
    apply: ["snapshot", "onShop", "live"].includes(d.pantryPrefs.apply) ? d.pantryPrefs.apply : "snapshot",
    multiWeek: ["nearest", "all", "spread"].includes(d.pantryPrefs.multiWeek) ? d.pantryPrefs.multiWeek : "nearest",
    lifecycle: ["weekly", "persist"].includes(d.pantryPrefs.lifecycle) ? d.pantryPrefs.lifecycle : "weekly",
    consume: ["endOfDay", "onGenerate", "onCook", "none"].includes(d.pantryPrefs.consume) ? d.pantryPrefs.consume : "onGenerate",
  };
  if (typeof d.pantryPrefsSet !== "boolean") d.pantryPrefsSet = false;
  if (typeof d.pantryPrefsSeen !== "boolean") d.pantryPrefsSeen = false;
  // Deltas reversibles de la última bajada "al generar el menú" (decisión D),
  // por semana (clave = startISO). Permiten deshacer al regenerar la misma
  // semana sin descontar dos veces, y se limpian por Q3 (lifecycle) tras cada
  // generación. Nunca se muestran en UI, es solo contabilidad interna.
  if (!d.pantryGenDeltas || typeof d.pantryGenDeltas !== "object" || Array.isArray(d.pantryGenDeltas)) {
    d.pantryGenDeltas = {};
  }
  if (!["primero_segundo", "1_plato"].includes(d.mealStructure)) d.mealStructure = "primero_segundo";
  d.userRecipes = Array.isArray(d.userRecipes) ? d.userRecipes : [];
  d.recipeVotes = d.recipeVotes && typeof d.recipeVotes === "object" ? d.recipeVotes : {};
  // Discards: normalize both buckets, and prune expired cooldowns on load so the
  // map doesn't grow unbounded across sessions.
  {
    const src = d.discards && typeof d.discards === "object" && !Array.isArray(d.discards) ? d.discards : {};
    const now = Date.now();
    const cooldownUntil = {};
    for (const [id, ts] of Object.entries(src.cooldownUntil ?? {})) {
      if (Number(ts) > now) cooldownUntil[id] = Number(ts);
    }
    d.discards = {
      forever: Array.isArray(src.forever) ? Array.from(new Set(src.forever)) : [],
      cooldownUntil,
    };
  }
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
  return { ...state, data: ensureRosters({ ...INITIAL_DATA, ...d }) };
}

// ─── Combos de familias para la card "Otro grupo" ───────────────────────────
const OTHER_GROUP_COMBOS = [
  // 4: papá + mamá + hijo + hija
  [
    { src: "/avatares/papa/papa_3.png",   color: "#6b8fa8" },
    { src: "/avatares/mama/mama_4.png",   color: "#c47fa0" },
    { src: "/avatares/hijo/hijo_5.png",   color: "#7ab87a" },
    { src: "/avatares/hija/hija_2.png",   color: "#e8a45a" },
  ],
  // 2: pareja sin hijos
  [
    { src: "/avatares/adulto/adulto_2.png", color: "#8a7bc8" },
    { src: "/avatares/adulto/adulto_5.png", color: "#b87ab8" },
  ],
  // 5: familia grande con abuela
  [
    { src: "/avatares/papa/papa_7.png",    color: "#5a8a6a" },
    { src: "/avatares/mama/mama_9.png",    color: "#c07080" },
    { src: "/avatares/hijo/hijo_8.png",    color: "#7090c0" },
    { src: "/avatares/hija/hija_6.png",    color: "#d08050" },
    { src: "/avatares/abuela/abuela_2.png",color: "#90a080" },
  ],
  // 3: adulto solo con dos hijos
  [
    { src: "/avatares/adulto/adulto_4.png", color: "#c06050" },
    { src: "/avatares/hijo/hijo_11.png",    color: "#6090a0" },
    { src: "/avatares/hija/hija_9.png",     color: "#e0a060" },
  ],
  // 3: abuelos + nieto
  [
    { src: "/avatares/abuelo/abuelo_2.png", color: "#708090" },
    { src: "/avatares/abuela/abuela_4.png", color: "#a08090" },
    { src: "/avatares/hijo/hijo_3.png",     color: "#80b090" },
  ],
  // 4: mamá + bebé + hijo + hija
  [
    { src: "/avatares/mama/mama_6.png",   color: "#d06080" },
    { src: "/avatares/bebe/bebe_2.png",   color: "#f0c060" },
    { src: "/avatares/hijo/hijo_2.png",   color: "#60a090" },
    { src: "/avatares/hija/hija_12.png",  color: "#e09050" },
  ],
];

function RotatingGroupPreview() {
  const [idx, setIdx] = useState(0);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = setInterval(() => {
      setVisible(false);
      setTimeout(() => {
        setIdx((i) => (i + 1) % OTHER_GROUP_COMBOS.length);
        setVisible(true);
      }, 300);
    }, 3000);
    return () => clearInterval(timer);
  }, []);

  const faces = OTHER_GROUP_COMBOS[idx];
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "22px 18px 18px",
        opacity: visible ? 1 : 0,
        transition: "opacity .3s ease",
      }}
    >
      <GroupAvatarStack faces={faces} size={64} />
    </div>
  );
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
  // Cross-screen intents fired from "En casa": open the receipt capture flow in
  // Tu compra, and land on Análisis → Gasto. Cleared by the target once consumed.
  const [shoppingCaptureIntent, setShoppingCaptureIntent] = useState(false);
  const [analyticsInitialTab, setAnalyticsInitialTab] = useState(null);
  // Whether "Tu gasto" should show a "volver a En casa" shortcut in its own
  // header — only true right after the deep link from Pantry's "histórico y
  // analítica" button, not on a plain bottom-nav tap into Analytics/Gasto
  // (which has no particular screen to "go back" to).
  const [gastoFromPantry, setGastoFromPantry] = useState(false);
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
  // "Elegir manualmente" (rosco): the slot we're filling from the catalog.
  const [slotPicker, setSlotPicker] = useState(null);
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

  const { user, session, signInWithGoogle, signOut } = useAuth();

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
    const localDiscards = data.discards ?? { forever: [], cooldownUntil: {} };
    const localMenus = data.menus ?? {};
    // Spend history is NOT part of the winner-takes-all profile adoption below:
    // it's merged as a union both ways so a guest's tickets survive login and a
    // returning user keeps the spend recorded on other devices.
    const localPriceObs = data.priceObs ?? [];
    const localReceipts = data.receipts ?? [];
    const localAliases = data.priceAliases ?? {};
    let cancelled = false;

    // Fold signed-out stock into the account first, then bump pantryEpoch so
    // any open En casa / Compra UI reloads after the merge (not mid-flight).
    (async () => {
      await mergeLocalPantryIntoCloud(user.id);
      if (cancelled) return;
      setPantryEpoch((n) => n + 1);

      const [remoteState, remoteRecipes, remoteVotes, remoteDiscards] = await Promise.all([
        loadUserState(user.id),
        loadUserRecipes(user.id),
        loadRecipeVotes(user.id),
        loadRecipeDiscards(user.id),
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

      // Forever discards union, cooldowns take the later expiry — see
      // recipeDiscardsSync.js's mergeDiscards for the reasoning. Also folds in
      // whatever discards still sit in the legacy user_state blob (remoteData),
      // for accounts whose only record of them predates user_recipe_discards —
      // otherwise that history would be silently orphaned the moment the blob
      // write stops carrying `discards` (see the debounced push below).
      const mergedDiscards = mergeDiscards(
        mergeDiscards(localDiscards, remoteDiscards),
        remoteData?.discards ?? { forever: [], cooldownUntil: {} },
      );

      // Union spend by id so neither side's tickets/observations are dropped by
      // the profile adoption (which otherwise picks one whole `data` blob).
      const unionById = (a = [], b = []) => {
        const m = new Map();
        for (const x of a) if (x && x.id != null) m.set(x.id, x);
        for (const x of b) if (x && x.id != null) m.set(x.id, x);
        return Array.from(m.values());
      };
      const mergedPriceObs = unionById(localPriceObs, remoteData?.priceObs);
      const mergedReceipts = unionById(localReceipts, remoteData?.receipts);
      const mergedAliases = { ...(remoteData?.priceAliases ?? {}), ...localAliases };

      setData((d) => ({
        ...(useRemote ? { ...INITIAL_DATA, ...remoteData } : d),
        userRecipes: mergedRecipes,
        recipeVotes: mergedVotes,
        discards: mergedDiscards,
        priceObs: mergedPriceObs,
        receipts: mergedReceipts,
        priceAliases: mergedAliases,
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
      // Backfill from the full merge (local + legacy blob), not just local —
      // an account whose only record of a discard sits in the legacy blob
      // needs it pushed to the new table too, not only kept in memory.
      const discardsBackfill = {
        forever: mergedDiscards.forever.filter((id) => !(remoteDiscards.forever ?? []).includes(id)),
        cooldownUntil: Object.fromEntries(
          Object.entries(mergedDiscards.cooldownUntil).filter(([id]) => !(id in (remoteDiscards.cooldownUntil ?? {}))),
        ),
      };
      upsertRecipeDiscards(user.id, discardsBackfill);

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

        setData((d) => {
          // Cloud wins for menús it knows about, but a menú that exists only
          // locally must survive: saveAndActivateMenu is fire-and-forget, so a
          // menú generated minutes ago (or while offline) may not have reached
          // the cloud yet. Replacing the map outright would delete it — the
          // "mi menú desapareció de un día para otro" bug.
          const merged = { ...prunedCloudMenus };
          for (const [id, localMenu] of Object.entries(d.menus ?? {})) {
            if (!merged[id]) merged[id] = localMenu;
          }
          return {
            ...d,
            menus: merged,
            // Same reasoning for the pointer: only follow the cloud's idea of
            // "active" when it actually has one, otherwise keep the local one.
            activeMenuId: activeSummary?.id ?? d.activeMenuId ?? null,
            ...(activeWeek
              ? { menuWeek: { offset: activeWeek.offset, startDayIdx: activeWeek.startDayIdx ?? 0 } }
              : {}),
          };
        });
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
      // discards now sync through user_recipe_discards (0010_recipe_discards.sql)
      // with their own immediate write — stop duplicating into this blob.
      delete profile.discards;
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

  // Anyone added to the roster — from onboarding, a quick edit, or while
  // setting up a different group — has to land on some menu. Nothing else
  // re-runs the split once `groups` exists: `ensureGroupsIfMissing` only fires
  // on an empty list and the tier reconcile only runs when you re-pick the menu
  // model, so newcomers used to sit in `members` belonging to no group at all.
  // Reconcile returns the same reference when nobody moved, which is what keeps
  // this from looping.
  useEffect(() => {
    setData((d) => {
      if (d.groups.length === 0 || d.members.length === 0) return d;
      const groups = reconcileGroupsWithMembers(d.members, d.groups);
      return groups === d.groups ? d : { ...d, groups };
    });
  }, [data.members, data.groups]);

  const toastTimer = useRef(null);
  // `action` (optional) renders a trailing button in the toast — e.g. a
  // "Deshacer" for a just-marked "Comprado". When present the toast lingers a
  // bit longer so there's time to actually tap it. All other callers pass a
  // plain string and keep the old short, action-less behaviour.
  const showToast = useCallback((msg, action = null) => {
    setToast(action ? { msg, action } : msg);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), action ? 5000 : 1800);
  }, []);

  const regenerateMenu = useCallback(async (nextData) => {
    // En modo básico forzamos los ajustes sencillos (comidas/cenas, cocina
    // normal, despensa "usar lo que haya", menú equilibrado, decisiones de
    // despensa por defecto) sin tocar lo guardado del usuario.
    const working = resolveModeData(nextData ?? data);
    let groups = working.groups;
    // A group set with an empty roster (present but no member matches — e.g.
    // members re-added after a reset, or a stale saved model) makes the AI
    // planner throw "Ningún grupo tiene miembros asignados". Rebuild from the
    // model whenever groups are missing OR stale, so generation stays viable.
    const hasRoster = (gs) => gs.some((g) => membersOfGroup(g, working.members).length > 0);
    if (working.members.length > 0 && (groups.length === 0 || !hasRoster(groups))) {
      groups = groupsFromModel(working.members, working.menuModel);
      setData((d) => ({ ...d, groups }));
    }
    if (groups.length === 0 || !hasRoster(groups)) {
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
      const weekOffsets = (Array.isArray(working.menuWeekOffsets) && working.menuWeekOffsets.length
        ? [...new Set(working.menuWeekOffsets)]
        : [working.menuWeek?.offset ?? 0]
      ).sort((a, b) => a - b);
      const weekCount = weekOffsets.length;
      const baseStartDayIdx = working.menuWeek?.startDayIdx ?? 0;
      // startISO/endISO por semana, calculados antes de generar — se usan como
      // clave estable para deshacer/rehacer la bajada "al generar" (decisión D)
      // y para la limpieza semanal (decisión C).
      const weekMeta = weekOffsets.map((offset, w) => {
        const startDayIdx = offset === weekOffsets[0] ? baseStartDayIdx : 0;
        const { startISO, endISO } = computeWeekRange(offset, startDayIdx);
        return { offset, w, startDayIdx, startISO, endISO };
      });

      // D (consumo): si alguna de las semanas que vamos a regenerar ya tenía
      // una bajada "al generar" de una generación anterior, la deshacemos
      // ANTES de recargar la despensa — así regenerar la misma semana varias
      // veces nunca descuenta dos veces lo mismo.
      const staleGenDeltas = working.pantryGenDeltas ?? {};
      const weeksBeingRegenerated = new Set(weekMeta.map((m) => m.startISO));
      const restoreKeys = Object.keys(staleGenDeltas).filter(
        (k) => weeksBeingRegenerated.has(k) && staleGenDeltas[k]?.length
      );
      for (const key of restoreKeys) {
        await restoreToPantry(staleGenDeltas[key], { user });
      }

      const pantryStock = user ? await loadPantry(user.id) : loadLocalPantry();
      // Planning bias is controlled by pantryMode ("only"/"prefer"/"off");
      // shopping always sees the stock so «Ya en casa» stays accurate.
      // Fall back to the legacy useHomeStock boolean for older saves.
      const pantryMode = ["only", "prefer", "off"].includes(working.pantryMode)
        ? working.pantryMode
        : working.useHomeStock === false ? "off" : "prefer";
      const pantryIngredients = pantryMode === "off" ? [] : pantryStock;
      const pantryStrict = pantryMode === "only";
      // Decisión B (multisemana): "nearest" → la despensa solo sesga la semana
      // más cercana; "all" → todas las semanas ven la despensa completa
      // (histórico); "spread" → cada semana ve la despensa menos lo que ya
      // "gastó" la semana anterior (resta en cascada, nunca duplica).
      const pantryMultiWeek = ["nearest", "all", "spread"].includes(working.pantryPrefs?.multiWeek)
        ? working.pantryPrefs.multiWeek
        : "nearest";
      // Decisión D (consumo): cuándo se baja el stock real. "onGenerate" se
      // resuelve aquí mismo (bloque tras la generación); "onCook" lo gestiona
      // DishDetail/"Marcar cocinado"; "endOfDay"/"none" no bajan stock aquí.
      const consumeMode = ["endOfDay", "onGenerate", "onCook", "none"].includes(working.pantryPrefs?.consume)
        ? working.pantryPrefs.consume
        : "onGenerate";
      const varietyPref = ["strict", "moderate", "relaxed"].includes(working.menuVarietyPref)
        ? working.menuVarietyPref
        : "strict";
      const sameForAllWeeks = working.menuScheduleSameForAllWeeks !== false;
      // Planner model for THIS generation (A/B Sonnet vs Haiku). Resolved once
      // so every week/group of the same menú uses the same variant.
      const planner = resolvePlannerModel();

      // "spread" necesita que cada semana vea el resultado de la anterior (no
      // hay independencia entre semanas), así que se genera en serie —
      // concurrencia 1 en mapWithConcurrency procesa la cola en orden. El
      // resto de modos sigue en paralelo (bounded by WEEK_CONCURRENCY).
      // Cross-week variety es determinista por semana (aiPlanner#poolForWeek):
      // "strict"/"moderate" sesgan el pool, "relaxed" no aplica ninguno.
      let spreadPantry = pantryIngredients;
      const effectiveConcurrency = pantryMultiWeek === "spread" ? 1 : WEEK_CONCURRENCY;
      const weekResults = await mapWithConcurrency(weekOffsets, effectiveConcurrency, async (offset, w) => {
        const { startDayIdx, startISO, endISO } = weekMeta[w];
        const weekSchedule = sameForAllWeeks || offset === weekOffsets[0]
          ? working.schedule
          : (working.menuWeekOverrides?.[offset] ?? working.schedule);
        const weekData = { ...working, groups, schedule: weekSchedule, menuWeek: { offset, startDayIdx } };
        const crossWeek = varietyPref === "relaxed" || weekCount <= 1
          ? null
          : { weekIndex: w, weekCount, varietyPref };

        // B: en "nearest" solo la semana más cercana recibe despensa como
        // sesgo; en "all" todas ven la despensa completa; en "spread" cada
        // semana ve lo que queda tras restar lo que gastó la anterior.
        const weekPantry =
          pantryMultiWeek === "all" ? pantryIngredients
          : pantryMultiWeek === "spread" ? spreadPantry
          : offset === weekOffsets[0] ? pantryIngredients : [];

        const { plan, recipes } = await generateMenuWithAI(weekData, {
          signal: ctrl.signal,
          pantryIngredients: weekPantry,
          pantryStrict,
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
        const sh = buildShoppingList(plan, groups, getDayMeals(weekData), pantryStock);
        if (pantryMultiWeek === "spread" && pantryMode !== "off") {
          // Proyección en memoria únicamente (nunca escribe en BD): lo que esta
          // semana cubrió con despensa deja de estar disponible para la
          // siguiente. La resta real en BD (si consumeMode === "onGenerate")
          // se hace más abajo, después de que todas las semanas terminen.
          spreadPantry = applyConsumption(
            sh.pantryItems.map((it) => ({ name: it.name, qty: it.qty, unit: it.unit })),
            spreadPantry
          ).workingStock;
        }
        const weekShopping = { items: [...sh.byCategory.flatMap((c) => c.items), ...sh.pantryItems] };
        return {
          offset, startDayIdx, startISO, endISO, plan, weekShopping, weekSchedule, recipes,
          pantryItems: sh.pantryItems,
        };
      });

      if (ctrl.signal.aborted) return;

      // D (consumo, "al generar el menú"): baja de la despensa real, semana a
      // semana y EN SERIE (recargando stock entre cada una), lo que esa
      // semana cubrió con despensa. En serie evita que dos semanas resten a
      // la vez del mismo stock ya cargado en memoria (double-count). Guarda
      // los deltas por semana para poder deshacer si se regenera otra vez.
      const genDeltasPatch = {};
      if (consumeMode === "onGenerate") {
        for (const res of weekResults) {
          const used = (res.pantryItems ?? []).map((it) => ({ name: it.name, qty: it.qty, unit: it.unit }));
          if (!used.length) continue;
          const freshStock = user ? await loadPantry(user.id) : loadLocalPantry();
          const { deltas } = await consumeFromPantry(used, freshStock, { user });
          if (deltas.length) genDeltasPatch[res.startISO] = deltas;
        }
      }
      // Decisión C (ciclo de vida): en "weekly" no arrastramos indefinidamente
      // el historial de deshacer de semanas ya terminadas — solo afecta a esta
      // contabilidad interna, nunca borra ni toca el stock real.
      const lifecycleMode = ["weekly", "persist"].includes(working.pantryPrefs?.lifecycle)
        ? working.pantryPrefs.lifecycle
        : "weekly";
      const nextGenDeltas = { ...(working.pantryGenDeltas ?? {}) };
      for (const key of restoreKeys) delete nextGenDeltas[key];
      for (const m of weekMeta) delete nextGenDeltas[m.startISO];
      Object.assign(nextGenDeltas, genDeltasPatch);
      if (lifecycleMode === "weekly") {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        for (const key of Object.keys(nextGenDeltas)) {
          const weekEnd = new Date(key);
          if (Number.isNaN(weekEnd.getTime())) continue;
          weekEnd.setDate(weekEnd.getDate() + 6);
          weekEnd.setHours(23, 59, 59, 999);
          if (weekEnd < today) delete nextGenDeltas[key];
        }
      }

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
        pantryGenDeltas: nextGenDeltas,
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
      // plan._warnings still collects non-blocking issues from generation, but
      // we no longer surface their raw internal text as a toast — it read as a
      // confusing "toast rarísimo" on success. Always show the plain success
      // message; the warnings remain on the plan for anyone who needs them.
      showToast(weekCount > 1 ? `Menú generado con IA (${weekCount} semanas)` : "Menú generado con IA");
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
    // Hard gate: no menu without at least one family member. The family step's
    // "Siguiente" is already blocked, but the progress-dot jump skips it (and any
    // later step's "Generar menú" would otherwise reach the planner), so the AI
    // planner throws "Ningún grupo tiene miembros asignados". Stop here and send
    // the user back to add someone.
    if ((data.members?.length ?? 0) === 0) {
      showToast("Añade al menos un miembro de la familia para generar el menú");
      setScreen("onboarding");
      setOnbStep(0);
      return;
    }
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

  // Header ♥ on "Tu menú": favorites the active menú so it survives the prune
  // and shows up in the Favoritos tab. Turning it ON snapshots the live
  // (edited) plan into the archive first, so the favorite keeps the menú the
  // user actually shaped — not the raw generated one.
  const toggleActiveFavorite = useCallback(() => {
    const menuId = data.activeMenuId;
    const current = data.menus?.[menuId];
    if (!current) return;
    if (!current.isFavorite) {
      const offset = data.menuWeek?.offset;
      const { menus, weekStart, week } = saveActivePlanAsFavorite(data.menus, menuId, menuPlan, offset);
      setData((d) => ({ ...d, menus }));
      if (user) {
        toggleMenuFavoriteRemote(user.id, menuId, true);
        if (weekStart && week) queueSaveMenuWeek(user.id, menuId, weekStart, week);
      }
      showToast("Menú guardado en favoritos");
    } else {
      setData((d) => ({ ...d, menus: toggleMenuFavorite(d.menus, menuId) }));
      if (user) toggleMenuFavoriteRemote(user.id, menuId, false);
      showToast("Quitado de favoritos");
    }
  }, [data.activeMenuId, data.menus, data.menuWeek?.offset, menuPlan, user, showToast]);

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
    // A plain bottom-nav tap into Analytics is not the pantry deep link —
    // drop any leftover "volver a En casa" shortcut from an earlier visit so
    // it doesn't linger into an unrelated visit to Gasto.
    if (id === "analytics") setGastoFromPantry(false);
    setScreen(id);
    if (id === "shopping") trackEvent(user, "shopping_opened", "shopping");
  }, [screen, user, pantryOrigin]);

  // Internal: navigate directly, no gate. Used after the resume dialog resolves.
  const _doGoToOnboardingStep = useCallback((step) => {
    dirRef.current = "forward";
    setFirstRunOnboarding(false);
    setOnbStep(step);
    setScreen("onboarding");
  }, []);

  // Dialog state: when the user re-enters the wizard with data already saved,
  // ask whether to continue or start fresh instead of silently overwriting.
  const [onbResumeOpen, setOnbResumeOpen] = useState(false);

  const goToOnboardingStep = useCallback((step) => {
    _doGoToOnboardingStep(step);
  }, [_doGoToOnboardingStep]);

  // "Editar preferencias" from Settings/Account used to just jump into the
  // restrictions step of the full onboarding wizard — "Atrás" then stepped
  // backward through the whole wizard instead of returning to where the user
  // came from, and finishing it regenerated the entire menú (goToMenu →
  // regenerateMenu) just to save an allergy edit. This tracks which screen to
  // return to so the restrictions step can behave as a self-contained
  // mini-editor instead. NOTE: keep the index in sync with OnboardingRestrictions'
  // position in `onbScreens` below (currently 3).
  const [editPreferencesOrigin, setEditPreferencesOrigin] = useState(null);
  const openEditPreferences = useCallback((origin) => {
    setEditPreferencesOrigin(origin);
    _doGoToOnboardingStep(3);
  }, [_doGoToOnboardingStep]);

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
      setOnbResumeOpen(true);
    } else {
      setQuickMenu(false);
      _doGoToOnboardingStep(0);
    }
  }, [data.members, _doGoToOnboardingStep]);

  // "Mi familia habitual" → shortened assistant (not skipped entirely).
  const startQuickMenu = useCallback(() => {
    setQuickMenu(true);
    setFirstRunOnboarding(false);
    dirRef.current = "forward";
    setOnbStep(1); // step 0 (familia) is hidden in quick mode; effect hops if 1 is too
    setScreen("onboarding");
  }, []);

  // "Continuar donde lo dejé": if they already generated a menu, skip the
  // wizard and generate with the saved profile (pantry, extras, family). If
  // they abandoned mid-wizard, reopen that step. If they only finished the
  // first-run family screen, pick up the rest of the assistant.
  const resumeOnboardingOrGenerate = useCallback(() => {
    setOnbResumeOpen(false);
    const hasMenu =
      Object.keys(menuPlan ?? {}).length > 0 ||
      Object.keys(data.menus ?? {}).length > 0;
    if (hasMenu) {
      fwd(goToMenu);
      return;
    }
    if (onbStep > 0) {
      setFirstRunOnboarding(false);
      setQuickMenu(false);
      dirRef.current = "forward";
      setScreen("onboarding");
      return;
    }
    startQuickMenu();
  }, [menuPlan, data.menus, onbStep, goToMenu, startQuickMenu]);

  // "Otro grupo" → park the current household and start an empty roster, so
  // whoever gets added next belongs to that group alone. Before rosters existed
  // this only jumped to step 0, which appended the new people to the family you
  // already had, with no way back.
  const startOtherGroup = useCallback(() => {
    setData((d) => startOtherRoster(d, { defaults: INITIAL_DATA }));
    setMenuPlan({});
    setShopping({ items: [] });
    setSelectedSlot(null);
    setQuickMenu(false);
    _doGoToOnboardingStep(0);
  }, [_doGoToOnboardingStep]);

  // Switching back to a group also has to restore the menú it last generated:
  // `menuPlan`/`shopping` live outside `data`, so swapping the roster alone
  // would leave the previous group's food on screen.
  const useRoster = useCallback((rosterId) => {
    const target = data.rosters?.[rosterId];
    if (!target || rosterId === data.activeRosterId) return;
    const snapshot = target.snapshot ?? {};
    const weeks = Object.values(snapshot.menus?.[snapshot.activeMenuId]?.weeks ?? {});
    const week = weeks.find((w) => w.offset === snapshot.menuWeek?.offset) ?? weeks[0] ?? null;
    setData((d) => switchRoster(d, rosterId));
    setMenuPlan(week?.plan ?? {});
    setShopping(week?.shopping ?? { items: [] });
    setSelectedSlot(null);
  }, [data]);

  const handleDishTap = useCallback((selection) => {
    setSelectedSlot(selection);
    trackEvent(user, "dish_viewed", "menu", { recipeId: selection?.recipe?.id });
  }, [user]);

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

  // ── Discards (menu rejections) ──────────────────────────────────────────
  // Base catalog id (prefix-free) of whatever currently sits in a slot, so a
  // discard matches the id filterRecipes/aiPlanner filter on.
  const slotBaseRecipeId = useCallback((sel) => {
    if (!sel) return null;
    const key = `${sel.day}-${sel.meal}`;
    const field = (sel.course ?? "main") === "first" ? "firstRecipeId" : "recipeId";
    const id = menuPlan[sel.groupId]?.[key]?.[field] ?? sel.recipe?.id ?? null;
    return id ? String(id).split("__").pop() : null;
  }, [menuPlan]);

  // Turn a rejection reason (chosen in the dish radial) into its persistent
  // consequence. Reasons:
  //   "dislike" → descartar para siempre (Recetas ▸ Descartados, reversible)
  //   "week"    → descartar esta semana (~7 días)
  //   "timing"  → tarda demasiado = descartar esta semana (~7 días)
  //   "recent"  → «me gusta pero lo comí hace poco»: enfriamiento ~14 días +
  //               marcar favorito para que vuelva en próximos menús.
  const applyDiscardReason = useCallback((sel, reason) => {
    if (!reason) return;
    const baseId = slotBaseRecipeId(sel);
    if (!baseId) return;
    const DAY_MS = 86400000;
    setData((d) => {
      const forever = [...(d.discards?.forever ?? [])];
      const cooldownUntil = { ...(d.discards?.cooldownUntil ?? {}) };
      if (reason === "dislike") {
        if (!forever.includes(baseId)) forever.push(baseId);
        delete cooldownUntil[baseId];
      } else if (!forever.includes(baseId)) {
        const days = reason === "recent" ? 14 : 7;
        cooldownUntil[baseId] = Date.now() + days * DAY_MS;
      }
      let next = { ...d, discards: { forever, cooldownUntil } };
      if (reason === "recent") {
        next = { ...next, recipeVotes: setFavoriteScope(next.recipeVotes ?? {}, baseId, "all") };
      }
      return next;
    });
    if (reason === "recent" && user?.id) {
      const nextVotes = setFavoriteScope(data.recipeVotes ?? {}, baseId, "all");
      const entry = nextVotes[baseId] ?? null;
      if (entry != null) saveRecipeVote(user.id, baseId, entry);
    }
    if (user?.id) {
      if (reason === "dislike") {
        saveRecipeDiscard(user.id, baseId, { isPermanent: true });
      } else if (!(data.discards?.forever ?? []).includes(baseId)) {
        const days = reason === "recent" ? 14 : 7;
        saveRecipeDiscard(user.id, baseId, { cooldownUntil: Date.now() + days * DAY_MS });
      }
    }
    const label = reason === "dislike"
      ? "Descartado para siempre"
      : reason === "recent"
        ? "Lo dejamos para luego"
        : "Descartado esta semana";
    trackEvent(user, "dish_discarded", "menu", { reason, recipeId: baseId });
    return label;
  }, [slotBaseRecipeId, data.recipeVotes, data.discards, user]);

  // Recuperar (Recetas ▸ Descartados): clear a permanent discard so the dish
  // rejoins the active catalog.
  const handleUndiscardRecipe = useCallback((recipeId) => {
    if (!recipeId) return;
    setData((d) => {
      const forever = (d.discards?.forever ?? []).filter((id) => id !== recipeId);
      const cooldownUntil = { ...(d.discards?.cooldownUntil ?? {}) };
      delete cooldownUntil[recipeId];
      return { ...d, discards: { forever, cooldownUntil } };
    });
    if (user?.id) deleteRecipeDiscard(user.id, recipeId);
    showToast("Receta recuperada");
  }, [showToast, user]);

  // Descartar desde el catálogo (Recetas ▸ Catálogo): añade al listado permanente
  // "No me gusta" sin pasar por el menú. Equivalente a elegir «No me gusta» desde
  // el menú; se puede revertir desde la pestaña Descartados.
  const handleDiscardRecipe = useCallback((recipeId) => {
    if (!recipeId) return;
    setData((d) => {
      const forever = [...(d.discards?.forever ?? [])];
      if (!forever.includes(recipeId)) forever.push(recipeId);
      const cooldownUntil = { ...(d.discards?.cooldownUntil ?? {}) };
      delete cooldownUntil[recipeId];
      return { ...d, discards: { forever, cooldownUntil } };
    });
    showToast("Receta descartada — aparece en la pestaña Descartados");
  }, [showToast]);

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

  const handleReplaceSlot = useCallback(async (selection, { sameCategory = false, reason = null } = {}) => {
    // Learn from the rejection (discard/cooldown/favorite) BEFORE the slot
    // mutates, so slotBaseRecipeId still reads the outgoing dish.
    if (reason) applyDiscardReason(selection, reason);
    const { groupId, day, meal } = selection;
    const course = selection.course ?? "main";
    // Pick the replacement from the SAME rich catalog the AI planner uses, so the
    // swapped dish is identical in shape (photo, methods, macros, scaled
    // ingredients) to the rest of the menu instead of a legacy-catalog mismatch.
    const result = pickCatalogReplacement(data, menuPlan, { groupId, day, meal, course, sameCategory });
    if (!result) {
      showToast(
        sameCategory
          ? "No hay otro plato parecido para este hueco"
          : "No hay otra receta compatible para este hueco",
      );
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
      const sh = buildShoppingList(next, groups, getDayMeals(data), pantryIngredients);
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
  }, [data, menuPlan, showToast, user, applyDiscardReason]);

  // Swap two existing dishes (long-press → "Intercambiar" → tap target). Only
  // recipe ids move; each slot keeps its own eaters/mode (they describe who eats
  // that day/meal, not the dish), so the shopping list just needs a rebuild.
  const handleSwapSlots = useCallback(async (source, target) => {
    if (!source || !target) return;
    const sGroup = source.groupId;
    const tGroup = target.groupId;
    const sKey = `${source.day}-${source.meal}`;
    const tKey = `${target.day}-${target.meal}`;
    const sField = source.course === "first" ? "firstRecipeId" : "recipeId";
    const tField = target.course === "first" ? "firstRecipeId" : "recipeId";

    const sRecipeId = menuPlan[sGroup]?.[sKey]?.[sField];
    const tRecipeId = menuPlan[tGroup]?.[tKey]?.[tField];
    if (!sRecipeId || !tRecipeId) {
      showToast("Solo puedes intercambiar platos que ya existen");
      return;
    }
    if (sRecipeId === tRecipeId) {
      showToast("Son el mismo plato");
      return;
    }

    const groups =
      data.groups.length > 0 ? data.groups : groupsFromModel(data.members, data.menuModel);
    const pantryIngredients = user ? await loadPantry(user.id) : loadLocalPantry();

    setMenuPlan((plan) => {
      const next = { ...plan };
      const writeField = (group, key, field, val) => {
        next[group] = { ...(next[group] ?? {}) };
        next[group][key] = { ...(next[group][key] ?? {}), [field]: val, warnings: [] };
      };
      writeField(sGroup, sKey, sField, tRecipeId);
      writeField(tGroup, tKey, tField, sRecipeId);

      const sh = buildShoppingList(next, groups, getDayMeals(data), pantryIngredients);
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
    showToast("Platos intercambiados");
    trackEvent(user, "dish_swapped", "menu", {
      from: `${source.day}-${source.meal}`,
      to: `${target.day}-${target.meal}`,
    });
  }, [data, menuPlan, showToast, user]);

  // Shared shopping-list rebuild for the rosco actions (clear / duplicate /
  // manual pick). Preserves the user's have/atHome flags across the rebuild.
  const applyShoppingFor = useCallback((next, groups, pantryIngredients) => {
    const sh = buildShoppingList(next, groups, getDayMeals(data), pantryIngredients);
    setShopping((prev) => {
      const flags = Object.fromEntries(
        prev.items.map((i) => [
          normalizeIngredientKey(i.name, i.unit ?? "ud"),
          { have: i.have, atHome: i.atHome },
        ]),
      );
      return {
        items: [...sh.byCategory.flatMap((c) => c.items), ...sh.pantryItems].map((it) => ({
          ...it,
          have: flags[it.id]?.have ?? false,
          atHome: flags[it.id]?.atHome ?? false,
        })),
      };
    });
  }, [data]);

  // Regenerate every dish of a single day (all active groups) in one tap — the
  // deck day header exposes this so users can reroll a day (or two) they don't
  // like without touching the rest of the week. Deterministic + free: reuses the
  // same per-slot catalog picker as the single-dish "Regenerar", applied slot by
  // slot on a working clone so carb/protein dedup stays correct within the day.
  // Defined AFTER applyShoppingFor since it depends on it (const TDZ).
  const handleRegenerateDay = useCallback(async (day, { groupIds = null } = {}) => {
    const groups = data.groups.length > 0 ? data.groups : groupsFromModel(data.members, data.menuModel);
    let activeGroups = groups.filter((g) => membersOfGroup(g, data.members).length > 0);
    // Scope picker (multi-menu households): regenerate only the chosen menus.
    // A null/empty selection falls back to every active menu.
    if (Array.isArray(groupIds) && groupIds.length > 0) {
      const wanted = new Set(groupIds);
      activeGroups = activeGroups.filter((g) => wanted.has(g.id));
    }
    if (activeGroups.length === 0) return;
    const meals = getDayMeals(data);

    const working = {};
    for (const gid of Object.keys(menuPlan)) {
      working[gid] = {};
      for (const k of Object.keys(menuPlan[gid] ?? {})) working[gid][k] = { ...menuPlan[gid][k] };
    }

    const newRecipes = [];
    let changed = 0;
    for (const g of activeGroups) {
      for (const meal of meals) {
        const key = `${day}-${meal}`;
        const slot = working[g.id]?.[key];
        if (!slot || slot.cleared) continue;
        const courses = [];
        if (slot.firstRecipeId) courses.push("first");
        if (slot.recipeId) courses.push("main");
        for (const course of courses) {
          const result = pickCatalogReplacement(data, working, { groupId: g.id, day, meal, course });
          if (!result) continue;
          newRecipes.push(result.frontendRecipe);
          working[g.id][key] = {
            ...working[g.id][key],
            ...(course === "first"
              ? { firstRecipeId: result.recipeId }
              : { recipeId: result.recipeId }),
            warnings: [],
          };
          changed++;
        }
      }
    }

    if (changed === 0) {
      showToast("No hay platos que regenerar en este día");
      return;
    }

    registerRecipes(newRecipes);
    setAiRecipes((cur) => {
      const byId = new Map(cur.map((r) => [r.id, r]));
      for (const r of newRecipes) byId.set(r.id, r);
      return Array.from(byId.values());
    });

    const pantryIngredients = user ? await loadPantry(user.id) : loadLocalPantry();
    setMenuPlan(() => {
      applyShoppingFor(working, groups, pantryIngredients);
      return working;
    });
    showToast("Día regenerado");
    trackEvent(user, "day_regenerated", "menu", { day });
  }, [data, menuPlan, showToast, user, applyShoppingFor]);

  // Vaciar hueco: keep the slot (flagged `cleared`) so the deck renders a
  // tappable placeholder to refill it; offer an undo that restores the dishes.
  const handleClearSlot = useCallback(async (sel, { reason = null } = {}) => {
    const { groupId, day, meal } = sel;
    const key = `${day}-${meal}`;
    const prevSlot = menuPlan[groupId]?.[key];
    if (!prevSlot || (!prevSlot.recipeId && !prevSlot.firstRecipeId)) return;
    const discardLabel = reason ? applyDiscardReason(sel, reason) : null;
    const groups = data.groups.length > 0 ? data.groups : groupsFromModel(data.members, data.menuModel);
    const pantryIngredients = user ? await loadPantry(user.id) : loadLocalPantry();
    const snapshot = prevSlot;
    const writeSlot = (slotValue) =>
      setMenuPlan((plan) => {
        const next = { ...plan, [groupId]: { ...(plan[groupId] ?? {}), [key]: slotValue } };
        applyShoppingFor(next, groups, pantryIngredients);
        return next;
      });
    writeSlot({ ...prevSlot, recipeId: null, firstRecipeId: null, cleared: true, warnings: [] });
    showToast(discardLabel ?? "Hueco vaciado", { label: "Deshacer", onClick: () => writeSlot(snapshot) });
    trackEvent(user, "dish_cleared", "menu", { day, meal });
  }, [data, menuPlan, showToast, user, applyShoppingFor, applyDiscardReason]);

  // Duplicar: copy a dish into another slot (rosco → "Duplicar" → tap target).
  const handleDuplicateSlot = useCallback(async (source, target) => {
    if (!source || !target) return;
    const sKey = `${source.day}-${source.meal}`;
    const sField = source.course === "first" ? "firstRecipeId" : "recipeId";
    const srcRecipeId = menuPlan[source.groupId]?.[sKey]?.[sField];
    if (!srcRecipeId) { showToast("No hay plato que duplicar"); return; }
    const tGroup = target.groupId;
    const tKey = `${target.day}-${target.meal}`;
    const tField = target.course === "first" ? "firstRecipeId" : "recipeId";
    const groups = data.groups.length > 0 ? data.groups : groupsFromModel(data.members, data.menuModel);
    const pantryIngredients = user ? await loadPantry(user.id) : loadLocalPantry();
    setMenuPlan((plan) => {
      const prevSlot = plan[tGroup]?.[tKey] ?? {};
      const nextSlot = { ...prevSlot, [tField]: srcRecipeId, cleared: false, warnings: [] };
      const next = { ...plan, [tGroup]: { ...(plan[tGroup] ?? {}), [tKey]: nextSlot } };
      applyShoppingFor(next, groups, pantryIngredients);
      return next;
    });
    showToast("Plato duplicado");
    trackEvent(user, "dish_duplicated", "menu", { from: sKey, to: tKey });
  }, [data, menuPlan, showToast, user, applyShoppingFor]);

  // "Regenerar → Cambiar guarnición": keep the main dish, swap only its side.
  // The recipe id encodes only the main, so it doesn't change — we overwrite the
  // registry/aiRecipes entry in place and bounce the slot to force a re-render +
  // shopping rebuild with the new garnish's ingredients.
  const handleRegarnishSlot = useCallback(async (sel) => {
    const { groupId, day, meal } = sel;
    const course = sel.course ?? "main";
    const key = `${day}-${meal}`;
    const currentRecipeId =
      course === "first" ? menuPlan[groupId]?.[key]?.firstRecipeId : menuPlan[groupId]?.[key]?.recipeId;
    const currentGarnishId = RECIPES_BY_ID[currentRecipeId]?.garnishId ?? sel.recipe?.garnishId ?? null;
    const result = pickGarnishReplacement(data, menuPlan, { groupId, day, meal, course, currentGarnishId });
    if (!result) {
      showToast("No hay otra guarnición para este plato");
      return;
    }
    const { frontendRecipe } = result;
    registerRecipes([frontendRecipe]);
    setAiRecipes((cur) => {
      const byId = new Map(cur.map((r) => [r.id, r]));
      byId.set(frontendRecipe.id, frontendRecipe);
      return Array.from(byId.values());
    });
    const groups =
      data.groups.length > 0 ? data.groups : groupsFromModel(data.members, data.menuModel);
    const pantryIngredients = user ? await loadPantry(user.id) : loadLocalPantry();
    setMenuPlan((plan) => {
      const prevSlot = plan[groupId]?.[key] ?? {};
      const nextSlot = {
        ...prevSlot,
        ...(course === "first" ? { firstRecipeId: frontendRecipe.id } : { recipeId: frontendRecipe.id }),
        warnings: [],
      };
      const next = { ...plan, [groupId]: { ...(plan[groupId] ?? {}), [key]: nextSlot } };
      applyShoppingFor(next, groups, pantryIngredients);
      return next;
    });
    showToast(`Nueva guarnición: «${frontendRecipe.name}»`);
    trackEvent(user, "dish_regarnished", "menu", { day, meal });
  }, [data, menuPlan, showToast, user, applyShoppingFor]);

  // Elegir manualmente: open the catalog picker for a slot. A reason (from the
  // "Regenerar → Elegir a mano" flow) discards the outgoing dish first.
  const handleManualPickSlot = useCallback((sel, { reason = null } = {}) => {
    if (reason) applyDiscardReason(sel, reason);
    setSlotPicker({ groupId: sel.groupId, day: sel.day, meal: sel.meal, course: sel.course ?? "main" });
  }, [applyDiscardReason]);

  // "Regenerar → Cena rápida / Plato único": open the picker restricted to the
  // relevant pool (cenas_rapidas for a dinner, plato_unico dishes for a lunch),
  // with thumbnails + tap-to-open dish detail. Placing one also flips this slot's
  // type (data.slotType) so future regenerations keep honoring the choice.
  const handlePickSlotType = useCallback((sel, kind) => {
    const all = Object.values(recipeCatalogById);
    const recipes =
      kind === "cena_rapida"
        ? all.filter((r) => r.category === "cenas_rapidas")
        : all.filter((r) => (r.mealRole ?? []).includes("plato_unico"));
    setSlotPicker({
      groupId: sel.groupId,
      day: sel.day,
      meal: sel.meal,
      course: sel.course ?? "main",
      kind,
      recipes,
    });
  }, []);

  // Apply the catalog dish the user picked into the pending slot.
  const handleChooseRecipeForSlot = useCallback(async (recipeId) => {
    if (!slotPicker || !recipeId) return;
    const { groupId, day, meal, course, kind = null } = slotPicker;
    const catalogRecipe = recipeCatalogById[recipeId];
    if (!catalogRecipe) { showToast("Receta no encontrada"); setSlotPicker(null); return; }
    // Plato único takes over the WHOLE comida (single dish, no primero/segundo),
    // so force it into the main course regardless of which one was long-pressed.
    const placeCourse = kind === "plato_unico" ? "main" : course;
    const result = pickCatalogReplacement(data, menuPlan, { groupId, day, meal, course: placeCourse, forcedRecipe: catalogRecipe });
    if (!result) { showToast("No se pudo colocar esa receta aquí"); setSlotPicker(null); return; }
    const { frontendRecipe, recipeId: newRecipeId } = result;
    registerRecipes([frontendRecipe]);
    setAiRecipes((cur) => {
      const byId = new Map(cur.map((r) => [r.id, r]));
      byId.set(frontendRecipe.id, frontendRecipe);
      return Array.from(byId.values());
    });
    // Persist the slot-type choice so regeneration keeps honoring it. A manually
    // picked cena rápida is also flagged in manualSlotType so it survives basic
    // mode's normalization (resolveModeData) — an explicit pick beats the mode.
    if (kind === "cena_rapida" || kind === "plato_unico") {
      const slotKey = `${day}|${meal}`;
      setData((d) => ({
        ...d,
        slotType: { ...(d.slotType ?? {}), [slotKey]: kind === "cena_rapida" ? "rapida" : "unico" },
        ...(kind === "cena_rapida"
          ? { manualSlotType: { ...(d.manualSlotType ?? {}), [slotKey]: true } }
          : null),
      }));
    }
    const groups = data.groups.length > 0 ? data.groups : groupsFromModel(data.members, data.menuModel);
    const pantryIngredients = user ? await loadPantry(user.id) : loadLocalPantry();
    setMenuPlan((plan) => {
      const key = `${day}-${meal}`;
      const prevSlot = plan[groupId]?.[key] ?? {};
      const nextSlot = {
        ...prevSlot,
        ...(placeCourse === "first" ? { firstRecipeId: newRecipeId } : { recipeId: newRecipeId }),
        // Plato único merges the two courses into one → drop the primero.
        ...(kind === "plato_unico" ? { firstRecipeId: null } : null),
        cleared: false,
        warnings: [],
      };
      const next = { ...plan, [groupId]: { ...(plan[groupId] ?? {}), [key]: nextSlot } };
      applyShoppingFor(next, groups, pantryIngredients);
      return next;
    });
    setSlotPicker(null);
    showToast(`Colocado «${frontendRecipe.name}»`);
    trackEvent(user, "dish_manual_pick", "menu", { day, meal, newRecipeId, kind });
  }, [slotPicker, data, menuPlan, showToast, user, applyShoppingFor]);

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
    setData(ensureRosters(INITIAL_DATA));
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

  // Deletes the actual Supabase Auth account (not just app data) via
  // api/delete-account — required for App Store 5.1.1(v). Every user-scoped
  // table cascades from auth.users(id), so this one call is enough; there's
  // no separate clearUserState() step anymore. Must run while the access
  // token is still valid, so before signOut(). If the server call fails, the
  // user stays signed in with their data intact (so they can retry) instead
  // of the app claiming "deleted" when it wasn't.
  const doDeleteAccount = useCallback(async () => {
    if (user?.id && session?.access_token) {
      try {
        const res = await fetch("/api/delete-account", {
          method: "POST",
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body?.error || `HTTP ${res.status}`);
        }
      } catch (err) {
        console.error("[delete-account] failed", err);
        setResetConfirm(null);
        showToast("No se pudo eliminar la cuenta. Inténtalo de nuevo.");
        return;
      }
    }

    setResetConfirm(null);
    clearState();
    setData(ensureRosters(INITIAL_DATA));
    setMenuPlan({});
    setShopping({ items: [] });
    setSelectedSlot(null);
    setOnbStep(0);
    setAiRecipes([]);
    setMenuError(null);
    setScreen("splash");
    await signOut();
  }, [signOut, user, session, showToast]);

  // Order: Members → Menu Model → School Menu → Restrictions → Week → Schedule →
  // Meal Style → Meal Extras (structure/desayuno/merienda/postre/cenas rápidas)
  // → Repeat → Cooking.
  // "Menu Model" and "School Menu" are skipped when they wouldn't offer any
  // real choice: no kids to diverge from adults, nothing to upload if nobody
  // is on the kids' menu (pure babies don't use the school cafeteria flow).
  const ONB_STEP_COUNT = 10;
  const skipMenuModel = !canSplitMenus(data.members);
  // School cafeteria only applies to kids (Niños), not pure babies.
  const skipSchoolMenu = !hasChildMember(data.members);
  // Modo básico simplifica el onboarding: "¿Cómo os gusta comer?" (6, se asume
  // equilibrado) y "¿Cómo completamos el menú?" (7, la estructura de plato se
  // pregunta ya en "¿Qué comidas quieres organizar?") se ocultan.
  const basicMode = !data.expertMode;
  const isStepHidden = useCallback(
    (i) =>
      (i === 1 && skipMenuModel) ||
      (i === 2 && skipSchoolMenu) ||
      (basicMode && (i === 6 || i === 7)) ||
      // "Mi familia habitual" only ever skips Familia (0) — it's the one
      // thing already known. Everything else (modelo de menú, semana,
      // horario, estilo, restricciones, cocina) can change
      // from una generación a otra, so it's asked in full every time, same
      // as a brand-new family or "Otro grupo".
      (quickMenu && i === 0),
    [skipMenuModel, skipSchoolMenu, quickMenu, basicMode]
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
    <OnboardingRestrictions
      data={data}
      setData={setData}
      onNext={editPreferencesOrigin ? undefined : nextOf(3)}
      onBack={
        editPreferencesOrigin
          ? () => back(() => { setScreen(editPreferencesOrigin); setEditPreferencesOrigin(null); })
          : backOf(3)
      }
      onFinish={
        editPreferencesOrigin
          ? () => back(() => { setScreen(editPreferencesOrigin); setEditPreferencesOrigin(null); })
          : () => fwd(goToMenu)
      }
      onReset={handleAbandonOnboarding}
      {...(editPreferencesOrigin ? { finishLabel: "Guardar" } : {})}
    />,
    <OnboardingWeek
      data={data}
      setData={setData}
      onNext={nextOf(4)}
      onBack={backOf(4)}
      onFinish={() => fwd(goToMenu)}
      onReset={handleAbandonOnboarding}
    />,
    <OnboardingSchedule
      data={data}
      setData={setData}
      onNext={nextOf(5)}
      onBack={backOf(5)}
      onFinish={() => fwd(goToMenu)}
      onReset={handleAbandonOnboarding}
    />,
    <OnboardingMealStyle
      data={data}
      setData={setData}
      onNext={nextOf(6)}
      onBack={backOf(6)}
      onFinish={() => fwd(goToMenu)}
      onReset={handleAbandonOnboarding}
    />,
    <OnboardingMealExtras
      data={data}
      setData={setData}
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
    <OnboardingCookTime
      data={data}
      setData={setData}
      onNext={nextOf(9)}
      onBack={backOf(9)}
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
                setHomeCoachSeen(false); // spotlight siempre al llegar al dashboard tras el tutorial
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
              onDishReplace={handleReplaceSlot}
              onDishReplaceSameCategory={(sel, opts = {}) => handleReplaceSlot(sel, { ...opts, sameCategory: true })}
              onDishRegarnish={handleRegarnishSlot}
              onDishSwap={handleSwapSlots}
              onDishDuplicate={handleDuplicateSlot}
              onDishClear={handleClearSlot}
              onDishManualPick={handleManualPickSlot}
              onDishPickCenaRapida={(sel) => handlePickSlotType(sel, "cena_rapida")}
              onDishPickPlatoUnico={(sel) => handlePickSlotType(sel, "plato_unico")}
              onRegenerateDay={handleRegenerateDay}
              onNav={handleNav}
              onRegenerate={handleRegenerate}
              onRetry={retryGenerateMenu}
              onToast={showToast}
              user={user}
              onTrackEvent={(event, metadata) => trackEvent(user, event, "menu", metadata)}
              activeMenu={data.menus?.[data.activeMenuId] ?? null}
              activeFavorite={Boolean(data.menus?.[data.activeMenuId]?.isFavorite)}
              onToggleFavorite={toggleActiveFavorite}
              onSwitchWeek={switchActiveWeek}
              onOpenMenus={openMenusScreen}
              onOpenAnalytics={() => {
                setGastoFromPantry(false);
                setAnalyticsInitialTab(null);
                fwd(() => setScreen("analytics"));
              }}
              autoOpenProfile={pendingProfileOpen}
              onAutoOpenProfileHandled={() => setPendingProfileOpen(false)}
              shoppingItems={shopping.items}
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
                onBack={() => back(() => setScreen("menu"))}
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
                openCaptureOnMount={shoppingCaptureIntent}
                onCaptureHandled={() => setShoppingCaptureIntent(false)}
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
                initialTab={analyticsInitialTab}
                onInitialTabHandled={() => setAnalyticsInitialTab(null)}
                onBackToPantry={
                  gastoFromPantry ? () => back(() => { setGastoFromPantry(false); setScreen("pantry"); }) : null
                }
                navActive={gastoFromPantry ? "pantry" : "menu"}
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
                // One unified nav now (see BottomNav in ui.jsx): "En casa" is always
                // its own permanent tab, so it's always the one lit up here — no
                // more borrowing "shopping"/"settings" depending on where you came
                // from. `pantryOrigin` still matters for the Atrás button below.
                data={data}
                setData={setData}
                shopping={shopping}
                setShopping={setShopping}
                onToast={showToast}
                onOpenAnalytics={() => {
                  setAnalyticsInitialTab("gasto");
                  setGastoFromPantry(true);
                  fwd(() => setScreen("analytics"));
                }}
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
                expertMode={Boolean(data.expertMode)}
                onToggleMode={() => {
                  setData((d) => ({ ...d, expertMode: !d.expertMode, modePrompted: true }));
                  showToast(data.expertMode ? "Modo sencillo activado" : "Modo avanzado activado");
                }}
                onNav={handleNav}
                onOpenAccount={() => fwd(() => setScreen("profile"))}
                onViewMenu={goToMenuFromDashboard}
                onGenerateNewMenu={handleGenerateMenu}
                onOpenAnalytics={() => fwd(() => setScreen("analytics"))}
                onOpenRecipePlanner={() => { recipePlannerOriginRef.current = "dashboard"; setEditingRecipe(null); fwd(() => setScreen("recipePlanner")); }}
                onOpenRecipes={() => fwd(() => setScreen("recipes"))}
                onOpenStreak={() => fwd(() => setScreen("menus"))}
              />
            </Suspense>
          </div>
        )}

        {screen === "dashboard" && !homeCoachSeen && (
          <HomeCoachTour onClose={markHomeCoachSeen} />
        )}

        {/* Selector básico/avanzado: una sola vez, tras el spotlight de Inicio.
            Cerrar sin elegir = modo básico. */}
        {screen === "dashboard" && homeCoachSeen && !data.modePrompted && (
          <ModeSelectSheet
            onChoose={(expert) =>
              setData((d) => ({ ...d, expertMode: Boolean(expert), modePrompted: true }))
            }
            onDismiss={() =>
              setData((d) => ({ ...d, expertMode: false, modePrompted: true }))
            }
          />
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
                discardedIds={data.discards?.forever ?? []}
                onRecoverRecipe={handleUndiscardRecipe}
                onDiscardRecipe={handleDiscardRecipe}
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
                onBack={() => back(() => setScreen("dashboard"))}
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
          day={selectedSlot.day ?? null}
          meal={selectedSlot.meal ?? null}
          cookWeekKey={`${data.activeMenuId ?? "live"}:${data.menuWeek?.offset ?? 0}`}
          user={user}
          data={data}
          setData={setData}
          onToast={showToast}
          onPantryChanged={() => setPantryEpoch((n) => n + 1)}
        />
      )}

      {/* Cena rápida / Plato único: minimal thumbnail-only picker. */}
      {slotPicker && (slotPicker.kind === "cena_rapida" || slotPicker.kind === "plato_unico") && (
        <SlotTypePickerSheet
          title={slotPicker.kind === "cena_rapida" ? "Cena rápida" : "Plato único"}
          Icon={slotPicker.kind === "cena_rapida" ? Soup : Utensils}
          accent={slotPicker.kind === "cena_rapida" ? "#d56b9a" : "#5a7066"}
          recipes={slotPicker.recipes ?? []}
          onPick={(id) => { if (id) handleChooseRecipeForSlot(id); }}
          onClose={() => setSlotPicker(null)}
        />
      )}

      {/* Elegir a mano: full catalog browser. */}
      {slotPicker && !slotPicker.kind && (
        <CatalogBrowserSheet
          gatePick
          gatePickType="plato"
          selectedPlatoId={null}
          onPickPlato={(id) => { if (id) handleChooseRecipeForSlot(id); }}
          onClose={() => setSlotPicker(null)}
          recipeVotes={data.recipeVotes ?? {}}
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

      {onbResumeOpen && (
        <div
          onClick={() => setOnbResumeOpen(false)}
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
              position: "relative",
              background: "#fff",
              borderRadius: 26,
              padding: "26px 22px 18px",
              width: "100%", maxWidth: 360, boxSizing: "border-box",
              boxShadow: "0 24px 60px rgba(0,0,0,.25)",
            }}
          >
            <button
              type="button"
              onClick={() => setOnbResumeOpen(false)}
              aria-label="Cerrar"
              style={{
                position: "absolute", top: 14, right: 14,
                width: 32, height: 32, borderRadius: 999,
                border: "none", background: "#f0f4f1",
                display: "inline-flex", alignItems: "center", justifyContent: "center",
                cursor: "pointer", color: "#5a7a66",
              }}
            >
              <X size={16} strokeWidth={2.4} />
            </button>

            <h3 style={{ margin: "0 0 6px", fontSize: 20, fontWeight: 900, color: "#142f1d", textAlign: "center", letterSpacing: "-.01em", paddingRight: 28 }}>
              ¿Cómo quieres generar?
            </h3>
            <p style={{ margin: "0 auto 18px", fontSize: 13.5, color: "#7a9485", textAlign: "center", lineHeight: 1.45, maxWidth: 280 }}>
              Tienes una configuración guardada. Elige cómo seguir.
            </p>

            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {[
                {
                  key: "continue",
                  Icon: Play,
                  iconColor: "#2d5a3d",
                  iconBg: "#e7f3ec",
                  img: "/avatares/cards/continuar_donde_lo_deje.jpg",
                  primary: true,
                  title: "Continuar donde lo dejé",
                  subtitle: "Sigue con familia, despensa y preferencias.",
                  onClick: resumeOnboardingOrGenerate,
                },
                {
                  key: "soft",
                  Icon: Eraser,
                  iconColor: "#8a5a00",
                  iconBg: "#fbeecd",
                  img: "/avatares/cards/empezar_de_cero.jpg",
                  primary: false,
                  title: "Empezar de cero",
                  subtitle: "Se guarda la familia; el resto se reinicia.",
                  onClick: () => {
                    setOnbResumeOpen(false);
                    const members = data.members ?? [];
                    const rosters = data.rosters;
                    const activeRosterId = data.activeRosterId;
                    setMenuPlan({});
                    setShopping({ items: [] });
                    setSelectedSlot(null);
                    setAiRecipes([]);
                    setMenuError(null);
                    setOnbStep(0);
                    setData((d) =>
                      ensureRosters({
                        ...INITIAL_DATA,
                        members: d.members ?? members,
                        rosters: d.rosters ?? rosters,
                        activeRosterId: d.activeRosterId ?? activeRosterId,
                        expertMode: d.expertMode,
                        modePrompted: true,
                      }),
                    );
                    startQuickMenu();
                  },
                },
                {
                  key: "hard",
                  Icon: Trash2,
                  iconColor: "#a8402b",
                  iconBg: "#fdecea",
                  img: "/avatares/cards/empezar_de_cero_todo.jpg",
                  primary: false,
                  title: "Empezar de cero del todo",
                  subtitle: "Borra familia, menús y configuración.",
                  onClick: () => {
                    setOnbResumeOpen(false);
                    clearState();
                    if (user?.id) clearUserState(user.id);
                    setData(ensureRosters(INITIAL_DATA));
                    setMenuPlan({});
                    setShopping({ items: [] });
                    setSelectedSlot(null);
                    setOnbStep(0);
                    setAiRecipes([]);
                    setMenuError(null);
                    _doGoToOnboardingStep(0);
                  },
                },
              ].map(({ key, Icon, iconColor, iconBg, img, primary, title, subtitle, onClick }) => (
                <button
                  key={key}
                  type="button"
                  onClick={onClick}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 14,
                    width: "100%",
                    padding: "14px 14px",
                    borderRadius: 18,
                    cursor: "pointer",
                    fontFamily: "inherit",
                    textAlign: "left",
                    border: primary ? "2.5px solid #bfe0cb" : "1.5px solid #e8ede9",
                    background: primary ? "#eef6f0" : "#f7f9f8",
                    boxShadow: primary ? "0 4px 14px rgba(45,90,61,.12)" : "none",
                  }}
                >
                  <span
                    style={{
                      flex: "0 0 auto",
                      width: 72,
                      height: 72,
                      borderRadius: 16,
                      overflow: "hidden",
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      background: iconBg,
                      ...(img ? { border: "2.5px solid #0f766e", boxShadow: "0 0 0 1px rgba(15,118,110,.12)" } : {}),
                    }}
                  >
                    {img
                      ? <img src={img} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      : <Icon size={20} color={iconColor} strokeWidth={2.2} />
                    }
                  </span>
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: "block", fontSize: 14.5, fontWeight: 800, color: "#142f1d" }}>{title}</span>
                    <span style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#7a8a7f", marginTop: 2, lineHeight: 1.3 }}>{subtitle}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

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
              Reutiliza un grupo que ya tengas o empieza de cero.
            </p>

            {(() => {
              // Solo dos opciones: reutilizar la familia habitual ("Mi familia",
              // el roster primario) o empezar "Otro grupo". Los grupos scratch no
              // se listan uno a uno (antes se acumulaban como tarjetas duplicadas
              // e indistinguibles, todas "Otro grupo").
              const allRosters = listRosters(data);
              const primaryRoster =
                allRosters.find((r) => r.id === DEFAULT_ROSTER_ID) ??
                allRosters.find((r) => r.isActive) ??
                allRosters[0];
              const options = [
                ...(primaryRoster && primaryRoster.members.length > 0
                  ? [
                      {
                        key: primaryRoster.id,
                        Icon: Users,
                        primary: true,
                        label: primaryRoster.name,
                        faces: groupAvatarFaces(primaryRoster.members, primaryRoster.members),
                        onClick: () => {
                          setWhoForOpen(false);
                          if (!primaryRoster.isActive) useRoster(primaryRoster.id);
                          startQuickMenu();
                        },
                      },
                    ]
                  : []),
                {
                  key: "other", Icon: Sparkles, rotating: true, primary: false,
                  label: "Otro grupo",
                  onClick: () => { setWhoForOpen(false); startOtherGroup(); },
                },
              ];
              return (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {options.map(({ key, Icon, rotating, primary, label, faces = [], onClick }) => (
                    <button
                      key={key}
                      type="button"
                      onClick={onClick}
                      style={{
                        display: "flex", flexDirection: "column", alignItems: "center",
                        justifyContent: "center", gap: rotating ? 0 : 10, width: "100%", textAlign: "center",
                        padding: "0 0 18px", borderRadius: 20, cursor: "pointer",
                        fontFamily: "inherit", overflow: "hidden",
                        background: primary ? "#eef6f0" : "#f7f9f8",
                        border: `2.5px solid ${primary ? "#bfe0cb" : "#e8ede9"}`,
                        transition: "all .15s ease",
                      }}
                    >
                      {rotating ? (
                        <>
                          <RotatingGroupPreview />
                          <span style={{ fontWeight: 800, color: "#1a3a24", fontSize: 15.5 }}>{label}</span>
                        </>
                      ) : faces.length > 0 ? (
                        <>
                          <div style={{ padding: "22px 18px 4px" }}>
                            <GroupAvatarStack faces={faces} size={72} />
                          </div>
                          <span style={{ fontWeight: 800, color: "#1a3a24", fontSize: 15.5 }}>{label}</span>
                        </>
                      ) : (
                        <div style={{ padding: "22px 18px", display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
                          <span
                            style={{
                              width: 58, height: 58, borderRadius: 18,
                              background: primary ? "#2d5a3d" : "#edf2ee",
                              display: "inline-flex", alignItems: "center", justifyContent: "center",
                            }}
                          >
                            <Icon size={28} color={primary ? "#fff" : "#2d5a3d"} strokeWidth={2.2} />
                          </span>
                          <span style={{ fontWeight: 800, color: "#1a3a24", fontSize: 15.5 }}>{label}</span>
                        </div>
                      )}
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
            maxWidth: "calc(100% - 24px)",
            // Mirror the WizardSheet card tokens (tinted-green fill, 22px radius,
            // 44px icon bubble, deep shadow) so a save confirmation reads as the
            // same surface family as the pop-ups, just smaller.
            background: "#f3f8f4",
            border: "1.5px solid #e2ede5",
            color: "#142f1d",
            padding: "10px 14px 10px 10px",
            borderRadius: 22,
            fontSize: 13.5,
            fontWeight: 800,
            lineHeight: 1.3,
            whiteSpace: "nowrap",
            boxShadow: "0 24px 60px -16px rgba(20,47,29,.5)",
            zIndex: 320,
          }}
        >
          <span
            style={{
              width: 32,
              height: 32,
              borderRadius: 11,
              background: "#2d5a3d",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
              boxShadow: "0 6px 14px -4px rgba(45,90,61,.5)",
            }}
          >
            <Check size={17} color="#fff" strokeWidth={2.8} />
          </span>
          <span
            style={{
              minWidth: 0,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {typeof toast === "string" ? toast : toast.msg}
          </span>
          {typeof toast !== "string" && toast.action && (
            <button
              type="button"
              onClick={() => {
                toast.action.onClick?.();
                window.clearTimeout(toastTimer.current);
                setToast(null);
              }}
              style={{
                flexShrink: 0,
                marginLeft: 2,
                border: "none",
                background: "#2d5a3d",
                color: "#fff",
                borderRadius: 999,
                padding: "6px 13px",
                fontSize: 13,
                fontWeight: 800,
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              {toast.action.label}
            </button>
          )}
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
          background: "radial-gradient(circle, rgba(61,122,82,.32) 0%, transparent 70%)",
          animation: "glowPulse 5s ease-in-out infinite",
          zIndex: 0,
          pointerEvents: "none",
        }}
      />

      {/* Vídeo a pantalla completa */}
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
          zIndex: 1,
          pointerEvents: "none",
          animation: "fadeIn 1.2s ease-out",
        }}
      >
        <source src="/splash.mp4" type="video/mp4" />
      </video>

      {/* Título arriba */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          zIndex: 2,
          padding: "56px 32px 0",
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
      </div>

      {/* Botones abajo */}
      <div
        style={{
          position: "relative",
          zIndex: 2,
          flexShrink: 0,
          padding: "0 28px 40px",
          animation: "fadeUp .8s ease-out .5s both",
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {hasSaved || isAuthed ? (
          <GhostPillButton onClick={handleEnter} tone="solid">
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
