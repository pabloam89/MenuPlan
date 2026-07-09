import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Users, Sparkles } from "lucide-react";
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
} from "./lib/groups.js";
import { loadState, saveState, clearState } from "./lib/storage.js";
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
import {
  loadUserRecipes,
  upsertUserRecipe,
  upsertUserRecipes,
  updateRecipeVisibility,
} from "./lib/userRecipesSync.js";
import { migrateFixedDishes } from "./lib/fixedDishes.js";
import { suggestHomeRole, migrateHomeRole } from "./lib/stages.js";
import { migrateCookTime, COOK_TIME_DEFAULTS } from "./lib/cookTime.js";
import { navDirection } from "./lib/motion.js";
import { useAuth } from "./lib/useAuth.js";
import { FeedbackFAB } from "./components/FeedbackFAB.jsx";
import { trackEvent, upsertUserProfile, APP_VERSION } from "./lib/analytics.js";
import { loadPantry } from "./lib/pantry.js";
import demoState from "./dev/demoState.json";

const DEV_DEMO_MENU =
  import.meta.env.DEV &&
  new URLSearchParams(window.location.search).get("demo") === "1";

// Temporary dietary states heavy/disruptive enough to warrant offering a
// separate ad-hoc individual menu instead of restricting the whole family.
const HEAVY_DIETARY_STATES = ["dieta_blanda"];

const INITIAL_DATA = {
  members: [],
  dislikes: [],
  customAllergies: [],
  customDislikes: [],
  fixedDishes: [],
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
  menuWeek: null,
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
      const age = m.useBirthDate
        ? (() => {
            if (!m.birthDate) return 30;
            const d0 = new Date(m.birthDate);
            if (Number.isNaN(d0.getTime())) return 30;
            const now = new Date();
            let a = now.getFullYear() - d0.getFullYear();
            const md = now.getMonth() - d0.getMonth();
            const dd = now.getDate() - d0.getDate();
            if (md < 0 || (md === 0 && dd < 0)) a -= 1;
            return Math.max(0, a);
          })()
        : Number.isFinite(m.age)
          ? m.age
          : parseInt(m.age, 10) || 30;
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
  d.userRecipes = Array.isArray(d.userRecipes) ? d.userRecipes : [];
  d.recipeVotes = d.recipeVotes && typeof d.recipeVotes === "object" ? d.recipeVotes : {};
  d.cookTime = migrateCookTime(d);
  return { ...state, data: { ...INITIAL_DATA, ...d } };
}

export default function App() {
  const persisted = useMemo(
    () => (DEV_DEMO_MENU ? migrate(demoState) : migrate(loadState())),
    []
  );
  const [screen, setScreen] = useState(
    DEV_DEMO_MENU ? (persisted?.screen ?? "menu") : "splash"
  );
  const [onbStep, setOnbStep] = useState(persisted?.onbStep ?? 0);
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
  const [data, setData] = useState(persisted?.data ?? INITIAL_DATA);
  const [menuPlan, setMenuPlan] = useState(persisted?.menuPlan ?? {});
  const [shopping, setShopping] = useState(persisted?.shopping ?? { items: [] });
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [toast, setToast] = useState(null);
  const [isGeneratingMenu, setIsGeneratingMenu] = useState(false);
  const [menuError, setMenuError] = useState(null);
  const lastRegenerateArgs = useRef(null);
  const generateAbortRef = useRef(null);
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

  // User-created recipes must live in RECIPES_BY_ID for DishDetail.
  useEffect(() => {
    const own = data.userRecipes ?? [];
    if (own.length > 0) registerRecipes(own);
  }, [data.userRecipes]);

  const { user, signInWithGoogle, signOut } = useAuth();

  // Debounced: serializar todo el estado a localStorage en cada pulsación de
  // tecla del onboarding es perceptible en móviles modestos.
  useEffect(() => {
    const t = window.setTimeout(
      () => saveState({ screen, onbStep, data, menuPlan, shopping, aiRecipes }),
      400
    );
    return () => window.clearTimeout(t);
  }, [screen, onbStep, data, menuPlan, shopping, aiRecipes]);

  // ── Cloud sync (Supabase) ──────────────────────────────────────
  // localStorage stays the working source of truth; these effects mirror it to
  // the account so the profile, user recipes and favorites survive across
  // devices and a "smart reset". Everything no-ops without a signed-in session.
  const hydratedUserRef = useRef(null);
  const cloudReadyRef = useRef(false);

  useEffect(() => {
    if (!user?.id) {
      cloudReadyRef.current = false;
      hydratedUserRef.current = null;
      return;
    }
    if (hydratedUserRef.current === user.id) return;
    hydratedUserRef.current = user.id;

    // Captured now (effect runs the moment a session appears): these are the
    // local-only items to reconcile with the cloud.
    const localRecipes = data.userRecipes ?? [];
    const localVotes = data.recipeVotes ?? {};
    let cancelled = false;

    (async () => {
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

      // Adopt the remote profile snapshot when it exists and is set up (has
      // members); otherwise keep local as the base and push it up below.
      const remoteData = remoteState?.state?.data;
      const useRemote = remoteData && (remoteData.members?.length ?? 0) > 0;
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
      const pantryIngredients = user ? await loadPantry(user.id) : [];
      const { plan, recipes } = await generateMenuWithAI(
        { ...working, groups },
        { signal: ctrl.signal, pantryIngredients },
      );
      registerRecipes(recipes);
      setAiRecipes((cur) => {
        const byId = new Map(cur.map((r) => [r.id, r]));
        for (const r of recipes) byId.set(r.id, r);
        return Array.from(byId.values());
      });
      setMenuPlan(plan);
      const isFirstMenu = (data.menuHistory ?? []).length === 0;
      trackEvent(user, "menu_generated", "menu", { groupCount: groups.length, memberCount: working.members.length });
      if (isFirstMenu) upsertUserProfile(user, { first_menu_at: new Date().toISOString(), app_version: APP_VERSION });
      setData((d) => ({
        ...d,
        menuHistory: [...(d.menuHistory ?? []), { at: Date.now(), groups: groups.length }].slice(-60),
      }));
      const sh = buildShoppingList(plan, groups, getMeals(working), pantryIngredients);
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
      // plan._warnings collects non-blocking issues from generation (slots
      // dropped by the 3b safety net, weekly freqs targets the filtered pool
      // couldn't achieve, etc.) — surface them instead of the generic success
      // toast so "no bloquea, pero informa" actually reaches the user instead
      // of a warning that was computed and then silently discarded.
      if (plan._warnings?.length > 0) {
        const [first, ...rest] = plan._warnings;
        showToast(rest.length > 0 ? `${first} (+${rest.length} aviso${rest.length === 1 ? "" : "s"} más)` : first);
      } else {
        showToast("Menú generado con IA");
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

  const handleNav = useCallback((id) => {
    dirRef.current = navDirection(screen, id);
    setScreen(id);
    if (id === "shopping") trackEvent(user, "shopping_opened", "shopping");
  }, [screen, user]);

  const goToOnboardingStep = useCallback((step) => {
    dirRef.current = "forward";
    setOnbStep(step);
    setScreen("onboarding");
  }, []);

  // "¿Para quién es el menú?" — when the profile already has members, offer to
  // reuse the household or start fresh for a different group, instead of always
  // forcing the full onboarding.
  const [whoForOpen, setWhoForOpen] = useState(false);
  // Quick-menu mode: a shortened onboarding for "Mi familia habitual" that skips
  // the steps already configured in Mi perfil (family + cooking), while still
  // walking through the per-menu screens (week, schedule, style, restrictions…).
  const [quickMenu, setQuickMenu] = useState(false);
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
    dirRef.current = "forward";
    setOnbStep(1); // step 0 (familia) is hidden in quick mode; effect hops if 1 is too
    setScreen("onboarding");
  }, []);

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
    const pantryIngredients = user ? await loadPantry(user.id) : [];
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
  // only wipes the active menu/session; "hard" nukes everything (used by the
  // onboarding "empezar de cero"); "delete" nukes + signs out.
  const [resetConfirm, setResetConfirm] = useState(null); // null | "soft" | "hard" | "delete"

  const handleReset = useCallback(() => setResetConfirm("hard"), []);
  const handleSoftReset = useCallback(() => setResetConfirm("soft"), []);
  const handleDeleteAccount = useCallback(() => setResetConfirm("delete"), []);

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
    setData((d) => ({ ...d, schedule: {}, slotType: {}, menuWeek: null }));
    dirRef.current = "forward";
    setScreen("dashboard");
    showToast("Menú reiniciado");
  }, [showToast]);

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
      // Quick mode reuses the profile: skip Familia (0), Modelo de menú (1 —
      // now editable from "Gestionar familia" in Mi perfil) and Cocina (8).
      (quickMenu && (i === 0 || i === 1 || i === 8)),
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
    () => ({
      current: progressIndex,
      total: visibleSteps.length,
      onJump: (i) => setOnbStep(visibleSteps[i] ?? 0),
    }),
    [progressIndex, visibleSteps]
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
      onNext={nextOf(0)}
      onFinish={() => fwd(goToMenu)}
      onReset={handleReset}
    />,
    <OnboardingMenuModel
      data={data}
      setData={setData}
      onNext={nextOf(1)}
      onBack={backOf(1)}
      onFinish={() => fwd(goToMenu)}
      onReset={handleReset}
    />,
    <OnboardingSchoolMenu
      data={data}
      setData={setData}
      onNext={nextOf(2)}
      onBack={backOf(2)}
      onFinish={() => fwd(goToMenu)}
      onReset={handleReset}
    />,
    <OnboardingWeek
      data={data}
      setData={setData}
      onNext={nextOf(3)}
      onBack={backOf(3)}
      onFinish={() => fwd(goToMenu)}
      onReset={handleReset}
    />,
    <OnboardingSchedule
      data={data}
      setData={setData}
      onNext={nextOf(4)}
      onBack={backOf(4)}
      onFinish={() => fwd(goToMenu)}
      onReset={handleReset}
    />,
    <OnboardingMealStyle
      data={data}
      setData={setData}
      onNext={nextOf(5)}
      onBack={backOf(5)}
      onFinish={() => fwd(goToMenu)}
      onReset={handleReset}
    />,
    <OnboardingRestrictions
      data={data}
      setData={setData}
      onNext={nextOf(6)}
      onBack={backOf(6)}
      onFinish={() => fwd(goToMenu)}
      onReset={handleReset}
    />,
    <OnboardingRepeat
      data={data}
      setData={setData}
      hasAccount={Boolean(user)}
      onNext={nextOf(7)}
      onBack={backOf(7)}
      onFinish={() => fwd(goToMenu)}
      onReset={handleReset}
    />,
    <OnboardingCooking
      data={data}
      setData={setData}
      onNext={nextOf(8)}
      onBack={backOf(8)}
      onFinish={() => fwd(goToMenu)}
      onReset={handleReset}
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
            onNext={() => fwd(() => setScreen("onboarding"))}
            hasSaved={data.members.length > 0}
            onResume={() => fwd(() => {
              // Signed-in users land on their dashboard; guests keep going
              // straight to their menu (no account to show a profile for).
              if (user) { setScreen("dashboard"); return; }
              setScreen(Object.keys(menuPlan).length > 0 ? "menu" : "onboarding");
            })}
            isAuthed={Boolean(user)}
            onGoogle={signInWithGoogle}
          />
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
              onDishTap={handleDishTap}
              onNav={handleNav}
              onRegenerate={handleRegenerate}
              onRetry={retryGenerateMenu}
              onReset={handleReset}
              onToast={showToast}
              user={user}
              onTrackEvent={(event, metadata) => trackEvent(user, event, "menu", metadata)}
            />
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
                onNav={handleNav}
                onToast={showToast}
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
                menuPlan={menuPlan}
                shopping={shopping}
                onNav={handleNav}
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
                onEditPreferences={() => goToOnboardingStep(6)}
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
                onEditPreferences={() => goToOnboardingStep(6)}
                onSignIn={signInWithGoogle}
                onSignOut={signOut}
                onToast={showToast}
                onOpenPantry={() => fwd(() => setScreen("pantry"))}
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
                onBack={() => back(() => setScreen("account"))}
                onSignIn={signInWithGoogle}
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
                onOpenRecipePlanner={() => { recipePlannerOriginRef.current = "dashboard"; fwd(() => setScreen("recipePlanner")); }}
                onOpenRecipes={() => fwd(() => setScreen("recipes"))}
              />
            </Suspense>
          </div>
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
                onOpenRecipePlanner={() => { recipePlannerOriginRef.current = "recipes"; fwd(() => setScreen("recipePlanner")); }}
                onChangeRecipeVisibility={(recipeId, visibility) => {
                  setData((d) => ({
                    ...d,
                    userRecipes: (d.userRecipes ?? []).map((r) =>
                      (r.id ?? r.name) === recipeId ? { ...r, visibility } : r
                    ),
                  }));
                  if (user?.id) updateRecipeVisibility(user.id, recipeId, visibility);
                }}
              />
            </Suspense>
          </div>
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
                onOpenPantry={() => fwd(() => setScreen("pantry"))}
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
                onClose={() => back(() => setScreen(recipePlannerOriginRef.current ?? "dashboard"))}
                onSaved={(recipe) => {
                  showToast("Receta creada con IA");
                  if (user?.id && recipe) upsertUserRecipe(user.id, recipe);
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

      {resetConfirm && (
        <div
          onClick={() => setResetConfirm(null)}
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
              borderRadius: 24,
              padding: "28px 24px 24px",
              width: "100%",
              maxWidth: 360,
              boxShadow: "0 24px 60px rgba(0,0,0,.25)",
            }}
          >
            <div style={{
              width: 52, height: 52, borderRadius: 16,
              background: "#fff3f3", margin: "0 auto 16px",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <span style={{ fontSize: 26 }}>⚠️</span>
            </div>
            <h3 style={{
              margin: "0 0 8px", fontSize: 19, fontWeight: 900,
              color: "#142f1d", textAlign: "center",
            }}>
              {resetConfirm === "soft"
                ? "¿Reiniciar el menú?"
                : resetConfirm === "delete"
                  ? "¿Eliminar tu cuenta?"
                  : "¿Reiniciar todo?"}
            </h3>
            <p style={{
              margin: "0 0 24px", fontSize: 14, color: "#6b7b6e",
              textAlign: "center", lineHeight: 1.5,
            }}>
              {resetConfirm === "soft"
                ? "Se borrará el menú de esta semana y la lista de la compra. Tu familia, recetas y preferencias se mantienen."
                : resetConfirm === "delete"
                  ? "Se borrarán todos tus datos y se cerrará tu sesión. Esta acción no se puede deshacer."
                  : "Se borrarán todos tus datos, menús y configuración. Esta acción no se puede deshacer."}
            </p>
            <div style={{ display: "flex", gap: 10 }}>
              <button
                type="button"
                onClick={() => setResetConfirm(null)}
                style={{
                  flex: 1, padding: "14px", borderRadius: 14,
                  border: "none", background: "#2d5a3d", color: "#fff",
                  fontSize: 15, fontWeight: 800, cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={
                  resetConfirm === "soft"
                    ? doSoftReset
                    : resetConfirm === "delete"
                      ? doDeleteAccount
                      : doReset
                }
                style={{
                  flex: 1, padding: "14px", borderRadius: 14,
                  border: "none", background: "#c0392b", color: "#fff",
                  fontSize: 15, fontWeight: 800, cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                {resetConfirm === "soft"
                  ? "Reiniciar menú"
                  : resetConfirm === "delete"
                    ? "Eliminar"
                    : "Reiniciar"}
              </button>
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
            background: "#1a3a24",
            color: "#fff",
            padding: "10px 18px",
            borderRadius: 24,
            fontSize: 13,
            fontWeight: 600,
            boxShadow: "0 6px 22px rgba(0,0,0,.2)",
            zIndex: 200,
          }}
        >
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
