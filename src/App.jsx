import { useEffect, useMemo, useRef, useState } from "react";
import { BottomNav, ProgressDots } from "./components/ui.jsx";
import {
  OnboardingMembers,
  OnboardingRestrictions,
  OnboardingMenuModel,
  OnboardingSchedule,
  OnboardingSchoolMenu,
  OnboardingGoals,
  OnboardingCooking,
  OnboardingBudget,
} from "./screens/Onboarding.jsx";
import { MenuScreen, DishDetail } from "./screens/Menu.jsx";
import { ShoppingScreen } from "./screens/Shopping.jsx";
import { getMeals } from "./lib/planner.js";
import { generateMenuWithAI } from "./lib/aiPlanner.js";
import { buildShoppingList } from "./lib/shoppingBuilder.js";
import { groupsFromModel } from "./lib/groups.js";
import { loadState, saveState, clearState } from "./lib/storage.js";
import { registerRecipes } from "./data/recipes.js";

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
    d.members = d.members.map((m) => ({
      ...m,
      id: m.id ?? Math.random().toString(36).slice(2, 10),
      allergies: Array.isArray(m.allergies)
        ? m.allergies
        : [...legacyAllergies],
      dislikes: Array.isArray(m.dislikes) ? m.dislikes : [],
      useBirthDate: Boolean(m.useBirthDate),
      birthDate: typeof m.birthDate === "string" ? m.birthDate : "",
    }));
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
  return { ...state, data: { ...INITIAL_DATA, ...d } };
}

export default function App() {
  const persisted = useMemo(() => migrate(loadState()), []);
  const [screen, setScreen] = useState("splash");
  const [onbStep, setOnbStep] = useState(persisted?.onbStep ?? 0);
  const [data, setData] = useState(persisted?.data ?? INITIAL_DATA);
  const [menuPlan, setMenuPlan] = useState(persisted?.menuPlan ?? {});
  const [shopping, setShopping] = useState(persisted?.shopping ?? { items: [] });
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [toast, setToast] = useState(null);
  const [isGeneratingMenu, setIsGeneratingMenu] = useState(false);
  const [menuError, setMenuError] = useState(null);
  const lastRegenerateArgs = useRef(null);

  // Re-hydrate AI-generated recipes from persisted state so DishCard / Shopping
  // can resolve ids after a reload.
  useEffect(() => {
    const dyn = persisted?.aiRecipes;
    if (Array.isArray(dyn) && dyn.length > 0) registerRecipes(dyn);
  }, [persisted]);
  const [aiRecipes, setAiRecipes] = useState(persisted?.aiRecipes ?? []);

  useEffect(() => {
    saveState({ screen, onbStep, data, menuPlan, shopping, aiRecipes });
  }, [screen, onbStep, data, menuPlan, shopping, aiRecipes]);

  const ensureGroupsIfMissing = () => {
    if (data.groups.length === 0 && data.members.length > 0) {
      setData((d) => ({ ...d, groups: groupsFromModel(d.members, d.menuModel) }));
    }
  };

  const regenerateMenu = async (nextData) => {
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
    setIsGeneratingMenu(true);
    setMenuError(null);
    try {
      const { plan, recipes } = await generateMenuWithAI({ ...working, groups });
      registerRecipes(recipes);
      setAiRecipes((cur) => {
        const byId = new Map(cur.map((r) => [r.id, r]));
        for (const r of recipes) byId.set(r.id, r);
        return Array.from(byId.values());
      });
      setMenuPlan(plan);
      const sh = buildShoppingList(plan, groups, getMeals(working));
      const items = sh.byCategory.flatMap((c) => c.items);
      setShopping({ items });
      showToast("Menú generado con IA");
    } catch (err) {
      console.error("Error generating menu", err);
      setMenuError({
        message: err?.message || "No se pudo generar el menú.",
        cause: err?.cause,
      });
    } finally {
      setIsGeneratingMenu(false);
    }
  };

  const retryGenerateMenu = () => {
    const args = lastRegenerateArgs.current ?? {};
    return regenerateMenu(args.nextData);
  };

  const goToMenu = async () => {
    ensureGroupsIfMissing();
    setScreen("menu");
    await regenerateMenu();
  };

  const handleNav = (id) => {
    if (id === "settings") {
      setScreen("onboarding");
      setOnbStep(0);
    } else {
      setScreen(id);
    }
  };

  const showToast = (msg) => {
    setToast(msg);
    window.clearTimeout(showToast._t);
    showToast._t = window.setTimeout(() => setToast(null), 1800);
  };

  const handleReset = () => {
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
  };

  // Order: Members → Restrictions(+Platos fijos) → Menu Model →
  //        School Menu → Schedule → Goals → Cooking → Budget.
  // Every step exposes onFinish={goToMenu} so the user can generate at any moment.
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
    <OnboardingGoals
      data={data}
      setData={setData}
      onNext={() => setOnbStep(6)}
      onBack={() => setOnbStep(4)}
      onFinish={goToMenu}
      onReset={handleReset}
    />,
    <OnboardingCooking
      data={data}
      setData={setData}
      onNext={() => setOnbStep(7)}
      onBack={() => setOnbStep(5)}
      onFinish={goToMenu}
      onReset={handleReset}
    />,
    <OnboardingBudget
      data={data}
      setData={setData}
      onFinish={goToMenu}
      onBack={() => setOnbStep(6)}
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
          <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
            <ProgressDots current={onbStep} total={8} onJump={setOnbStep} />
            <div style={{ flex: 1 }}>{onbScreens[onbStep]}</div>
          </div>
        )}

        {screen === "menu" && (
          <MenuScreen
            data={data}
            menuPlan={menuPlan}
            isGenerating={isGeneratingMenu}
            error={menuError}
            onDishTap={(recipe, slot) => setSelectedSlot({ recipe, slot })}
            onNav={handleNav}
            onRegenerate={() => regenerateMenu()}
            onRetry={retryGenerateMenu}
            onReset={handleReset}
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
          onReject={() => setSelectedSlot(null)}
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

const SPLASH_BG = "/splash.jpg";

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
        background: "#1a3a24",
      }}
    >
      <style>{`
        @keyframes kenburns {
          0%   { transform: scale(1.1) translate(0,0); }
          50%  { transform: scale(1.2) translate(-10px, -6px); }
          100% { transform: scale(1.1) translate(0,0); }
        }
        @keyframes pulseHint {
          0%, 100% { opacity: .7; transform: translateY(0); }
          50%      { opacity: 1;  transform: translateY(-4px); }
        }
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(14px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage: `url(${SPLASH_BG})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
          filter: "saturate(108%) contrast(102%)",
          transform: "scale(1.05)",
          animation: "kenburns 22s ease-in-out infinite",
        }}
      />
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          background:
            "linear-gradient(180deg, rgba(10,22,14,0) 0%, rgba(10,22,14,0) 40%, rgba(10,22,14,.72) 72%, rgba(10,22,14,.96) 100%)",
        }}
      />

      <div
        style={{
          position: "relative",
          zIndex: 1,
          padding: "48px 28px 44px",
          color: "#fff",
          textAlign: "left",
          animation: "fadeUp .9s ease-out",
        }}
      >
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 10,
            background: "rgba(255,255,255,.14)",
            backdropFilter: "blur(8px)",
            WebkitBackdropFilter: "blur(8px)",
            padding: "6px 12px",
            borderRadius: 999,
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: ".8px",
            textTransform: "uppercase",
            marginBottom: 18,
            border: "1px solid rgba(255,255,255,.18)",
          }}
        >
          Cole + Casa, sin pensar
        </div>
        <h1
          style={{
            fontSize: 54,
            fontWeight: 800,
            margin: 0,
            letterSpacing: "-1.8px",
            lineHeight: 1,
            fontFamily: "'Playfair Display', Georgia, serif",
            textShadow: "0 2px 24px rgba(0,0,0,.35)",
          }}
        >
          MenuPlan
        </h1>
        <p
          style={{
            fontSize: 16,
            lineHeight: 1.45,
            margin: "14px 0 0",
            maxWidth: 320,
            color: "rgba(255,255,255,.88)",
            fontWeight: 500,
          }}
        >
          Concilia el menú del cole con el de casa. Nosotros completamos la semana para que cenéis equilibrado sin pensar.
        </p>

        <div style={{ display: "flex", gap: 10, marginTop: 28 }}>
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
            }}
          >
            {hasSaved ? "Continuar" : "Empezar"}
          </button>
        </div>

        <div
          style={{
            marginTop: 22,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 12,
            color: "rgba(255,255,255,.75)",
            animation: "pulseHint 1.8s ease-in-out infinite",
            letterSpacing: ".4px",
          }}
        >
          Toca en cualquier punto para entrar
        </div>
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
