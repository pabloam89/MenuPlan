import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BottomNav } from "./components/ui.jsx";
import {
  OnboardingMembers,
  OnboardingRestrictions,
  OnboardingMenuModel,
  OnboardingSchedule,
  OnboardingSchoolMenu,
  OnboardingCooking,
} from "./screens/Onboarding.jsx";
import { OnboardingProgressContext } from "./screens/onboardingProgressContext.js";
import { MenuScreen, DishDetail } from "./screens/Menu.jsx";
import { ShoppingScreen } from "./screens/Shopping.jsx";
import { generateMenuWithAI } from "./lib/aiPlanner.js";
import { buildShoppingList } from "./lib/shoppingBuilder.js";
import { getMeals, replaceMenuSlot } from "./lib/planner.js";
import { groupsFromModel } from "./lib/groups.js";
import { loadState, saveState, clearState } from "./lib/storage.js";
import { registerRecipes } from "./data/recipes.js";
import { migrateFixedDishes } from "./lib/fixedDishes.js";
import { suggestHomeRole } from "./lib/stages.js";
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
  timeWeekday: 30,
  timeWeekend: 60,
  hasBudget: false,
  budget: 80,
  supermarkets: [],
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
        homeRole:
          typeof m.homeRole === "string" && m.homeRole
            ? m.homeRole
            : suggestHomeRole(age),
      };
    });
  }
  d.groups = Array.isArray(d.groups) ? d.groups : [];
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
      const sh = buildShoppingList(plan, groups, getMeals(working));
      setShopping({ items: sh.byCategory.flatMap((c) => c.items) });
      showToast("Menú generado con IA");
    } catch (err) {
      if (err?.name === "AbortError" || ctrl.signal.aborted) return;
      console.error("Error generating menu", err);
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

  const goToMenu = async () => {
    ensureGroupsIfMissing();
    setScreen("menu");
    await regenerateMenu();
  };

  const handleNav = useCallback((id) => {
    if (id === "settings") {
      setScreen("onboarding");
      setOnbStep(0);
    } else {
      setScreen(id);
    }
  }, []);

  const handleDishTap = useCallback((selection) => setSelectedSlot(selection), []);

  const handleReplaceSlot = useCallback((selection) => {
    const { groupId, day, meal, recipe } = selection;
    const result = replaceMenuSlot(data, menuPlan, {
      groupId,
      day,
      meal,
      excludeRecipeId: recipe.id,
      course: selection.course ?? "main",
    });
    if (!result) {
      showToast("No hay otra receta compatible para este hueco");
      return;
    }
    const groups =
      data.groups.length > 0 ? data.groups : groupsFromModel(data.members, data.menuModel);
    setMenuPlan((plan) => {
      const next = {
        ...plan,
        [groupId]: {
          ...(plan[groupId] ?? {}),
          [`${day}-${meal}`]: result.slot,
        },
      };
      const sh = buildShoppingList(next, groups, getMeals(data));
      setShopping({ items: sh.byCategory.flatMap((c) => c.items) });
      return next;
    });
    setSelectedSlot(null);
    showToast(`Sustituido por «${result.recipe.name}»`);
  }, [data, menuPlan, showToast]);

  const handleReset = useCallback(() => {
    if (!window.confirm("¿Reiniciar todo? Se borrarán datos y menús guardados.")) return;
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

  // Order: Members → Restrictions → Menu Model → School Menu → Schedule → Goals → Cooking.
  const ONB_STEP_COUNT = 6;
  const safeOnbStep = Math.min(onbStep, ONB_STEP_COUNT - 1);
  const onbProgressValue = useMemo(
    () => ({ current: safeOnbStep, total: ONB_STEP_COUNT, onJump: setOnbStep }),
    [safeOnbStep, ONB_STEP_COUNT]
  );

  useEffect(() => {
    if (onbStep >= ONB_STEP_COUNT) setOnbStep(ONB_STEP_COUNT - 1);
  }, [onbStep]);

  const onbScreens = [
    <OnboardingMembers
      data={data}
      setData={setData}
      onNext={() => setOnbStep(1)}
      onFinish={goToMenu}
      onReset={handleReset}
    />,
    <OnboardingRestrictions
      data={data}
      setData={setData}
      onNext={() => setOnbStep(2)}
      onBack={() => setOnbStep(0)}
      onFinish={goToMenu}
      onReset={handleReset}
    />,
    <OnboardingMenuModel
      data={data}
      setData={setData}
      onNext={() => setOnbStep(3)}
      onBack={() => setOnbStep(1)}
      onFinish={goToMenu}
      onReset={handleReset}
    />,
    <OnboardingSchoolMenu
      data={data}
      setData={setData}
      onNext={() => setOnbStep(4)}
      onBack={() => setOnbStep(2)}
      onFinish={goToMenu}
      onReset={handleReset}
    />,
    <OnboardingSchedule
      data={data}
      setData={setData}
      onNext={() => setOnbStep(5)}
      onBack={() => setOnbStep(3)}
      onFinish={goToMenu}
      onReset={handleReset}
    />,
    <OnboardingCooking
      data={data}
      setData={setData}
      onBack={() => setOnbStep(4)}
      onFinish={goToMenu}
      onReset={handleReset}
    />,
  ];

  const containerRef = useRef(null);
  useEffect(() => {
    if (containerRef.current) containerRef.current.scrollTop = 0;
  }, [screen, onbStep]);

  return (
    <div
      style={{
        maxWidth: 420,
        margin: "0 auto",
        minHeight: "100vh",
        background: "#fff",
        fontFamily: "'DM Sans', 'Helvetica Neue', sans-serif",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div
        ref={containerRef}
        style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}
      >
        {screen === "splash" && (
          <SplashScreen
            onNext={() => setScreen("onboarding")}
            hasSaved={data.members.length > 0}
            onResume={() => (Object.keys(menuPlan).length > 0 ? setScreen("menu") : setScreen("onboarding"))}
          />
        )}

        {screen === "onboarding" && (
          <OnboardingProgressContext.Provider value={onbProgressValue}>
            <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
              <div style={{ flex: 1 }}>{onbScreens[safeOnbStep]}</div>
            </div>
          </OnboardingProgressContext.Provider>
        )}

        {screen === "menu" && (
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
            onStop={stopGeneration}
            onReset={handleReset}
            onToast={showToast}
          />
        )}

        {screen === "shopping" && (
          <ShoppingScreen shopping={shopping} setShopping={setShopping} onNav={handleNav} />
        )}

        {screen === "analytics" && <AnalyticsPlaceholder onNav={handleNav} />}
      </div>

      {selectedSlot && (
        <DishDetail
          recipe={selectedSlot.recipe}
          slot={selectedSlot.slot}
          onClose={() => setSelectedSlot(null)}
          onReject={() => handleReplaceSlot(selectedSlot)}
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
          }}
        >
          {toast}
        </div>
      )}
    </div>
  );
}

function SplashScreen({ onNext, hasSaved, onResume }) {
  const handleEnter = () => (hasSaved ? onResume() : onNext());

  return (
    <div
      onClick={handleEnter}
      style={{
        position: "relative",
        minHeight: "100vh",
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
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 4 }}>
          {[
            { delay: ".25s", text: "Deja de agobiarte con cuadrar el menú." },
            { delay: ".4s",  text: "Para que tus hijos coman variado cada semana." },
          ].map(({ delay, text }) => (
            <p
              key={text}
              style={{
                fontSize: 20,
                lineHeight: 1.35,
                margin: 0,
                color: "rgba(255,255,255,.88)",
                fontWeight: 400,
                fontStyle: "italic",
                letterSpacing: "-.2px",
                textShadow: "0 1px 10px rgba(0,0,0,.5)",
                animation: `fadeUp .8s ease-out ${delay} both`,
              }}
            >
              {text}
            </p>
          ))}
        </div>
      </div>

      {/* Botón abajo */}
      <div
        style={{
          position: "relative",
          zIndex: 2,
          padding: "0 28px 64px",
          animation: "fadeUp .8s ease-out .5s both",
        }}
      >
        <button
          onClick={(e) => {
            e.stopPropagation();
            handleEnter();
          }}
          style={{
            flex: 1,
            background: "#fff",
            color: "#1a3a24",
            border: "none",
            borderRadius: 14,
            padding: "16px 24px",
            fontSize: 16,
            fontWeight: 800,
            cursor: "pointer",
            boxShadow: "0 10px 28px rgba(0,0,0,.35)",
            width: "100%",
          }}
        >
          {hasSaved ? "Continuar" : "Empezar ya"}
        </button>
      </div>
    </div>
  );
}

function AnalyticsPlaceholder({ onNav }) {
  return (
    <div style={{ paddingBottom: 0 }}>
      <div style={{ padding: "16px 24px 0" }}>
        <h2 style={{ fontSize: 22, fontWeight: 800, color: "#1a3a24", margin: "0 0 16px" }}>
          Análisis
        </h2>
        <div
          style={{
            padding: "40px 20px",
            textAlign: "center",
            color: "#888",
            background: "#fafafa",
            borderRadius: 14,
          }}
        >
          <p style={{ fontSize: 14 }}>
            Sección en construcción. Aquí verás tu gasto semanal y la comparativa de precios.
          </p>
        </div>
      </div>
      <div style={{ flex: 1 }} />
      <BottomNav active="analytics" onNav={onNav} />
    </div>
  );
}
