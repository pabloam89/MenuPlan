import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
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
} from "./screens/Onboarding.jsx";
import { OnboardingProgressContext } from "./screens/onboardingProgressContext.js";
import { MenuScreen, DishDetail } from "./screens/Menu.jsx";
const ShoppingScreen = lazy(() => import("./screens/Shopping.jsx").then(m => ({ default: m.ShoppingScreen })));
const AnalyticsScreen = lazy(() => import("./screens/Analytics.jsx").then(m => ({ default: m.AnalyticsScreen })));
const SettingsScreen = lazy(() => import("./screens/Settings.jsx").then(m => ({ default: m.SettingsScreen })));
const AccountScreen = lazy(() => import("./screens/Settings.jsx").then(m => ({ default: m.AccountScreen })));
import { generateMenuWithAI, pickCatalogReplacement } from "./lib/aiPlanner.js";
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
} from "./lib/groups.js";
import { loadState, saveState, clearState } from "./lib/storage.js";
import { registerRecipes } from "./data/recipes.js";
import { migrateFixedDishes } from "./lib/fixedDishes.js";
import { suggestHomeRole, migrateHomeRole } from "./lib/stages.js";
import { migrateCookTime, COOK_TIME_DEFAULTS } from "./lib/cookTime.js";
import { navDirection } from "./lib/motion.js";
import { useAuth } from "./lib/useAuth.js";
import { FeedbackFAB } from "./components/FeedbackFAB.jsx";
import { trackEvent, upsertUserProfile, APP_VERSION } from "./lib/analytics.js";
import demoState from "./dev/demoState.json";

const DEV_DEMO_MENU =
  import.meta.env.DEV &&
  new URLSearchParams(window.location.search).get("demo") === "1";

const INITIAL_DATA = {
  members: [],
  dislikes: [],
  customAllergies: [],
  customDislikes: [],
  fixedDishes: [],
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

  // Re-hydrate AI-generated recipes from persisted state so DishCard
  // can resolve ids after a reload.
  useEffect(() => {
    const dyn = persisted?.aiRecipes;
    if (Array.isArray(dyn) && dyn.length > 0) registerRecipes(dyn);
  }, [persisted]);
  const [aiRecipes, setAiRecipes] = useState(persisted?.aiRecipes ?? []);

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
      const { plan, recipes } = await generateMenuWithAI({ ...working, groups }, { signal: ctrl.signal });
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
      const sh = buildShoppingList(plan, groups, getMeals(working));
      setShopping((prev) => {
        const flags = Object.fromEntries(
          prev.items.map((i) => [
            normalizeIngredientKey(i.name, i.unit ?? "ud"),
            { have: i.have, atHome: i.atHome },
          ])
        );
        return {
          items: sh.byCategory.flatMap((c) => c.items).map((it) => ({
            ...it,
            have: flags[it.id]?.have ?? false,
            atHome: flags[it.id]?.atHome ?? false,
          })),
        };
      });
      showToast("Menú generado con IA");
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
  const fwd  = (fn) => { dirRef.current = "forward";  fn(); };
  const back = (fn) => { dirRef.current = "backward"; fn(); };

  const goToMenu = async () => {
    ensureGroupsIfMissing();
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

  const handleDishTap = useCallback((selection) => {
    setSelectedSlot(selection);
    trackEvent(user, "dish_viewed", "menu", { recipeId: selection?.recipe?.id });
  }, [user]);

  const handleReplaceSlot = useCallback((selection) => {
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
    const { frontendRecipe, recipeId } = result;

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
      const sh = buildShoppingList(next, groups, getMeals(data));
      setShopping((prev) => {
        const flags = Object.fromEntries(
          prev.items.map((i) => [
            normalizeIngredientKey(i.name, i.unit ?? "ud"),
            { have: i.have, atHome: i.atHome },
          ])
        );
        return {
          items: sh.byCategory.flatMap((c) => c.items).map((it) => ({
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

  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);

  const handleReset = useCallback(() => {
    setResetConfirmOpen(true);
  }, []);

  const doReset = useCallback(() => {
    setResetConfirmOpen(false);
    clearState();
    setData(INITIAL_DATA);
    setMenuPlan({});
    setShopping({ items: [] });
    setSelectedSlot(null);
    setOnbStep(0);
    setAiRecipes([]);
    setMenuError(null);
    setScreen("splash");
  }, []);

  // Order: Members → Menu Model → School Menu → Week → Schedule → Meal Style → Restrictions → Repeat → Cooking.
  // "Menu Model" and "School Menu" are skipped when they wouldn't offer any
  // real choice: no split possible if everyone's an adult, nothing to upload
  // if nobody in the house is underage (baby or child).
  const ONB_STEP_COUNT = 9;
  const skipMenuModel = !canSplitMenus(data.members);
  const skipSchoolMenu = !hasUnderageMember(data.members);
  const isStepHidden = useCallback(
    (i) => (i === 1 && skipMenuModel) || (i === 2 && skipSchoolMenu),
    [skipMenuModel, skipSchoolMenu]
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

  const onbScreens = [
    <OnboardingMembers
      data={data}
      setData={setData}
      onNext={() => fwd(() => setOnbStep(stepNeighbor(0, 1)))}
      onFinish={() => fwd(goToMenu)}
      onReset={handleReset}
    />,
    <OnboardingMenuModel
      data={data}
      setData={setData}
      onNext={() => fwd(() => setOnbStep(stepNeighbor(1, 1)))}
      onBack={() => back(() => setOnbStep(stepNeighbor(1, -1)))}
      onFinish={() => fwd(goToMenu)}
      onReset={handleReset}
    />,
    <OnboardingSchoolMenu
      data={data}
      setData={setData}
      onNext={() => fwd(() => setOnbStep(stepNeighbor(2, 1)))}
      onBack={() => back(() => setOnbStep(stepNeighbor(2, -1)))}
      onFinish={() => fwd(goToMenu)}
      onReset={handleReset}
    />,
    <OnboardingWeek
      data={data}
      setData={setData}
      onNext={() => fwd(() => setOnbStep(stepNeighbor(3, 1)))}
      onBack={() => back(() => setOnbStep(stepNeighbor(3, -1)))}
      onFinish={() => fwd(goToMenu)}
      onReset={handleReset}
    />,
    <OnboardingSchedule
      data={data}
      setData={setData}
      onNext={() => fwd(() => setOnbStep(stepNeighbor(4, 1)))}
      onBack={() => back(() => setOnbStep(stepNeighbor(4, -1)))}
      onFinish={() => fwd(goToMenu)}
      onReset={handleReset}
    />,
    <OnboardingMealStyle
      data={data}
      setData={setData}
      onNext={() => fwd(() => setOnbStep(stepNeighbor(5, 1)))}
      onBack={() => back(() => setOnbStep(stepNeighbor(5, -1)))}
      onFinish={() => fwd(goToMenu)}
      onReset={handleReset}
    />,
    <OnboardingRestrictions
      data={data}
      setData={setData}
      onNext={() => fwd(() => setOnbStep(stepNeighbor(6, 1)))}
      onBack={() => back(() => setOnbStep(stepNeighbor(6, -1)))}
      onFinish={() => fwd(goToMenu)}
      onReset={handleReset}
    />,
    <OnboardingRepeat
      data={data}
      setData={setData}
      onNext={() => fwd(() => setOnbStep(stepNeighbor(7, 1)))}
      onBack={() => back(() => setOnbStep(stepNeighbor(7, -1)))}
      onFinish={() => fwd(goToMenu)}
      onReset={handleReset}
    />,
    <OnboardingCooking
      data={data}
      setData={setData}
      onBack={() => back(() => setOnbStep(stepNeighbor(8, -1)))}
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
        .screen-enter-fwd  { animation: slideFromRight .22s cubic-bezier(.25,.46,.45,.94) both; }
        .screen-enter-back { animation: slideFromLeft  .22s cubic-bezier(.25,.46,.45,.94) both; }
      `}</style>
      <div
        ref={containerRef}
        style={{ minHeight: "100dvh", display: "flex", flexDirection: "column" }}
      >
        {screen === "splash" && (
          <SplashScreen
            onNext={() => fwd(() => setScreen("onboarding"))}
            hasSaved={data.members.length > 0}
            onResume={() => fwd(() => (Object.keys(menuPlan).length > 0 ? setScreen("menu") : setScreen("onboarding")))}
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
              />
            </Suspense>
          </div>
        )}
      </div>

      {isGeneratingMenu && <GeneratingScreen onStop={stopGeneration} />}

      {selectedSlot && (
        <DishDetail
          key={selectedSlot.recipe.id}
          recipe={selectedSlot.recipe}
          slot={selectedSlot.slot}
          kitchenTools={data.kitchenTools ?? []}
          onClose={() => setSelectedSlot(null)}
          onReject={() => handleReplaceSlot(selectedSlot)}
        />
      )}

      {resetConfirmOpen && (
        <div
          onClick={() => setResetConfirmOpen(false)}
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
              ¿Reiniciar todo?
            </h3>
            <p style={{
              margin: "0 0 24px", fontSize: 14, color: "#6b7b6e",
              textAlign: "center", lineHeight: 1.5,
            }}>
              Se borrarán todos tus datos, menús y configuración. Esta acción no se puede deshacer.
            </p>
            <div style={{ display: "flex", gap: 10 }}>
              <button
                type="button"
                onClick={() => setResetConfirmOpen(false)}
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
                onClick={doReset}
                style={{
                  flex: 1, padding: "14px", borderRadius: 14,
                  border: "none", background: "#c0392b", color: "#fff",
                  fontSize: 15, fontWeight: 800, cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                Reiniciar
              </button>
            </div>
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
