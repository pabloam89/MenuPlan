import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, Loader2, Sparkles } from "lucide-react";
import { OnboardingMembers, OnboardingRestrictions, OnboardingSchoolMenu } from "./Onboarding.jsx";
import { DishDetail, MenuScreen } from "./Menu.jsx";
import { RecipesScreen } from "./RecipesScreen.jsx";
import { ShoppingScreen } from "./Shopping.jsx";
import { catalogToFrontendRecipe } from "../lib/aiPlanner.js";
import { recipeCatalogById } from "../data/recipeCatalog.js";
import heroProducePhoto from "../assets/dashboard/hero-produce.jpg";
import demoState from "../dev/demoState.json";

// First-run value-prop carousel. Hard rule (per product feedback): NO invented
// UI — every slide embeds a REAL app screen fed with realistic data, rendered
// inside a borderless, edge-feathered "screenshot" frame on a light background,
// with 2 saturated-green bullets underneath. Interactions the user asked to see
// (tab/method switching, allergen+pregnancy grid, dislike→regenerate, aisle
// zoom) are driven through small optional demo props added to those real
// screens (initialTab / initialAppliance / autoplay / autoDemo / etc.).
//
// The frame scales a fixed logical viewport (LOGICAL_W wide) down to VIS_W and
// clips it. A `transform` on the stage also makes DishDetail's `position:fixed`
// overlay resolve inside the frame; we still force it to `absolute` via the
// `.vp-dish` CSS below so viewport units (100vw/100dvh) don't leak on desktop.

const BG = "radial-gradient(120% 85% at 50% 0%, #ffffff 0%, #eef4f0 58%, #e3ebe5 100%)";
const INK = "#14301d";
const BULLET_GREEN = "#159a51";
// Mismo estilo que el botón "Atrás" del header del onboarding (OnboardingShell).
const headerBtnStyle = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "8px 14px",
  borderRadius: 10,
  border: "1.5px solid #2d5a3d",
  background: "#fff",
  color: "#2d5a3d",
  fontSize: 13,
  fontWeight: 700,
  cursor: "pointer",
  fontFamily: "inherit",
};

const LOGICAL_W = 420;
const VIS_W = 300;
const VIS_H = 380;
const SCALE = VIS_W / LOGICAL_W;
const MASK = "radial-gradient(125% 115% at 50% 40%, #000 58%, rgba(0,0,0,0) 100%)";
// Logical height that exactly fills the visible frame (VIS_H / SCALE). Demos
// that scroll their own content (DishDetail's `.mp-sheet-up`) must use this as
// `stageHeight` — otherwise the sheet renders taller than what's visible and
// scrolling it to its own bottom only reveals the middle of the content, not
// the true bottom (the outer frame keeps cropping the top of that taller box).
const STAGE_VISIBLE_H = Math.round(VIS_H / SCALE);

// ── Demo data (stable module constants) ──────────────────────────────────

const mkMember = (m) => ({
  useBirthDate: false,
  birthDate: "",
  stageDetail: "",
  allergies: [],
  dislikes: [],
  intolerances: [],
  dietaryStates: [],
  healthProfiles: [],
  ...m,
});

// Step 1 — arranca con 2 adultos y en bucle teclea un niño y un bebé.
const FAMILY_START = [
  mkMember({ id: "vp-pablo", name: "Pablo", age: 38, homeRole: "Adulto" }),
  mkMember({ id: "vp-ana", name: "Ana", age: 36, homeRole: "Adulto" }),
];
const DEMO_CHILD = mkMember({ id: "vp-leo", name: "Leo", age: 10, homeRole: "Hijo/a" });
const DEMO_BABY = mkMember({ id: "vp-lucas", name: "Lucas", age: 1, homeRole: "Bebé" });

const membersToData = (members) => ({
  members,
  menuModel: "same",
  groups: [{ id: "vp-g1", label: "Familia", memberIds: members.map((m) => m.id), color: "#2d5a3d" }],
  customAllergies: [],
});

// Step 2 — alérgenos (Pablo), embarazo (Ana), diabetes (Marcos).
const RESTRICTION_DATA = {
  members: [
    mkMember({ id: "vp-r-pablo", name: "Pablo", age: 38, homeRole: "Adulto", allergies: ["Gluten", "Leche"] }),
    mkMember({ id: "vp-r-ana", name: "Ana", age: 34, homeRole: "Adulto", dietaryStates: ["embarazo"] }),
    mkMember({ id: "vp-r-marcos", name: "Marcos", age: 52, homeRole: "Adulto", healthProfiles: ["glucemico"] }),
  ],
  customAllergies: [],
};

// Step 4 — un par de recetas "generadas" en Mis recetas.
const USER_RECIPES = [
  {
    id: "user_demo_salmon",
    name: "Salmón al horno con espárragos",
    category: "pescados",
    mainProtein: "pescado_azul",
    mealRole: ["segundo", "cena"],
    usageTags: ["plato_normal"],
    type: "principal",
    time: 35,
    difficulty: "facil",
    season: "all",
    kcal: 420,
    protein_g: 38,
    carbs_g: 8,
    fat_g: 26,
    baseServings: 4,
    kidFriendly: false,
    tupperFriendly: true,
    allergens: ["pescado"],
    ingredients: [
      { name: "Lomo de salmón", amount: 600, unit: "g" },
      { name: "Espárragos verdes", amount: 400, unit: "g" },
      { name: "Limón", amount: 1, unit: "ud" },
      { name: "Aceite de oliva", unit: "c/n" },
    ],
    steps: [
      "Precalentar el horno a 200°C",
      "Colocar el salmón y los espárragos en una bandeja",
      "Rociar con aceite, sal y zumo de limón",
      "Hornear 18–20 min hasta que el pescado esté jugoso",
    ],
    description: "Salmón al horno con espárragos tiernos y limón.",
    methods: [],
    source: "user",
    createdAt: 1752566400000,
    visibility: "private",
    owner: { name: "Pablo" },
    rating: { up: 0, down: 0, score: 0 },
  },
  {
    id: "user_demo_lentejas",
    name: "Lentejas estofadas con verduras",
    category: "legumbres",
    mainProtein: "legumbre",
    mealRole: ["plato_unico", "primero"],
    usageTags: ["plato_unico"],
    type: "completo",
    time: 50,
    difficulty: "normal",
    season: "invierno",
    kcal: 385,
    protein_g: 22,
    carbs_g: 48,
    fat_g: 10,
    baseServings: 4,
    kidFriendly: true,
    tupperFriendly: true,
    allergens: ["apio"],
    ingredients: [
      { name: "Lentejas pardinas", amount: 300, unit: "g" },
      { name: "Zanahoria", amount: 2, unit: "ud" },
      { name: "Puerro", amount: 1, unit: "ud" },
      { name: "Patata", amount: 2, unit: "ud" },
      { name: "Pimentón dulce", amount: 1, unit: "cucharadita" },
    ],
    steps: [
      "Sofreír el puerro y la zanahoria en aceite",
      "Añadir las lentejas, patata y agua hasta cubrir",
      "Cocer a fuego lento 40 min",
      "Rectificar de sal y servir caliente",
    ],
    description: "Guiso reconfortante de lentejas con verduras de temporada.",
    methods: [],
    source: "user",
    createdAt: 1752480000000,
    visibility: "public",
    rating: { up: 0, down: 0, score: 0 },
  },
];

const RECIPE_VOTES = {
  carnes_001: { v: "up", fav: "all" },
  user_demo_lentejas: { fav: "all" },
};

// Step 5 — lista de la compra realista repartida en varias secciones.
const SHOPPING_ITEMS = [
  { id: "cebolla|ud", name: "Cebolla", category: "Verduras y frutas", unit: "ud", qty: 3, displayQty: "3 uds", have: false, atHome: false, sources: [{ day: "Lun", meal: "Cena", group: "Familia", recipeName: "Pasta boloñesa", qty: 1, unit: "ud" }, { day: "Mié", meal: "Comida", group: "Familia", recipeName: "Pollo al horno", qty: 2, unit: "ud" }] },
  { id: "calabacin|ud", name: "Calabacín", category: "Verduras y frutas", unit: "ud", qty: 2, displayQty: "2 uds", have: false, atHome: false, sources: [{ day: "Mar", meal: "Comida", group: "Familia", recipeName: "Puré de verduras", qty: 2, unit: "ud" }] },
  { id: "zanahoria|ud", name: "Zanahoria", category: "Verduras y frutas", unit: "ud", qty: 4, displayQty: "4 uds", have: false, atHome: false, sources: [{ day: "Jue", meal: "Comida", group: "Familia", recipeName: "Lentejas estofadas", qty: 4, unit: "ud" }] },
  { id: "pechuga de pollo|g", name: "Pechuga de pollo", category: "Carnes y pescados", unit: "g", qty: 600, displayQty: "600 g", have: false, atHome: false, sources: [{ day: "Vie", meal: "Comida", group: "Familia", recipeName: "Pollo al curry", qty: 600, unit: "g" }] },
  { id: "merluza|g", name: "Merluza", category: "Carnes y pescados", unit: "g", qty: 500, displayQty: "500 g", have: false, atHome: false, sources: [{ day: "Lun", meal: "Comida", group: "Familia", recipeName: "Merluza en salsa verde", qty: 500, unit: "g" }] },
  { id: "espagueti|g", name: "Espaguetis", category: "Legumbres y pasta", unit: "g", qty: 500, displayQty: "500 g", have: false, atHome: false, sources: [{ day: "Lun", meal: "Cena", group: "Familia", recipeName: "Pasta boloñesa", qty: 500, unit: "g" }] },
  { id: "leche|ml", name: "Leche", category: "Lácteos y huevos", unit: "ml", qty: 1000, displayQty: "1 L", have: false, atHome: false, sources: [{ day: "Mar", meal: "Desayuno", group: "Familia", recipeName: "Tostadas con leche", qty: 1000, unit: "ml" }] },
  { id: "huevo|ud", name: "Huevos", category: "Lácteos y huevos", unit: "ud", qty: 6, displayQty: "6 uds", have: false, atHome: false, sources: [{ day: "Jue", meal: "Comida", group: "Familia", recipeName: "Tortilla de patatas", qty: 6, unit: "ud" }] },
  { id: "aceite de oliva|ml", name: "Aceite de oliva", category: "Despensa", unit: "ml", qty: 250, displayQty: "250 ml", have: true, atHome: false, sources: [{ day: "Lun", meal: "Comida", group: "Familia", recipeName: "Merluza en salsa verde", qty: 250, unit: "ml" }] },
];

// Step 3 — bundled per-method steps so Tradicional/Thermomix/Airfryer differ offline.
const CANNELONI_STEPS = {
  base: [
    "Sofríe la carne picada con cebolla y tomate hasta que quede jugosa.",
    "Cuece las placas de canelón y rellénalas con el sofrito.",
    "Colócalos en la fuente y cúbrelos con bechamel.",
    "Espolvorea queso y gratina en el horno a 190 °C durante 25 min.",
  ],
  horno: [
    "Precalienta el horno a 200 °C con calor arriba y abajo.",
    "Rellena las placas ya cocidas con el sofrito de carne.",
    "Cubre con bechamel y una capa generosa de queso.",
    "Hornea 22–25 min hasta que la superficie esté dorada.",
  ],
  thermomix: [
    "Trocea cebolla 5 s/vel 5 y sofríe 7 min/120°/vel cuchara.",
    "Añade la carne y el tomate: 12 min/100°/giro inverso/vel cuchara.",
    "Rellena los canelones y prepara la bechamel 8 min/90°/vel 4.",
    "Cubre, añade queso y gratina en el horno 15 min a 200 °C.",
  ],
  airfryer: [
    "Sofríe la carne y monta los canelones con la bechamel.",
    "Colócalos en un molde apto para airfryer sin amontonar.",
    "Cocina a 180 °C durante 12 min.",
    "Añade queso y dale un golpe final de 4 min a 200 °C para gratinar.",
  ],
};

const KITCHEN_TOOLS = ["Thermomix", "Airfryer", "Horno"];

// "Tu menú" — reusa el mismo fixture completo (miembros, grupo, menuPlan con
// recetas reales) que ya usa `?demo=1` en local, así garantizamos que todos
// los recipeId existen en RECIPES_BY_ID y las imágenes resuelven.
const MENU_DEMO_DATA = { ...demoState.data, menuWeek: { offset: 0, startDayIdx: 0 } };
const MENU_DEMO_PLAN = demoState.menuPlan;

// Step "Menú del cole" — familia con un hijo en edad escolar (para que
// OnboardingSchoolMenu no muestre el estado vacío "sin niños/as").
const SCHOOL_DEMO_MEMBERS = [
  mkMember({ id: "vp-s-pablo", name: "Pablo", age: 38, homeRole: "Adulto" }),
  mkMember({ id: "vp-s-ana", name: "Ana", age: 36, homeRole: "Adulto" }),
  mkMember({ id: "vp-s-leo", name: "Leo", age: 8, homeRole: "Hijo/a" }),
];

// ── Frame ─────────────────────────────────────────────────────────────────

function Frame({ children, focusY = 0, stageHeight = 760, containerRef = null }) {
  return (
    <div
      ref={containerRef}
      style={{
        position: "relative",
        width: VIS_W,
        height: VIS_H,
        overflow: "hidden",
        WebkitMaskImage: MASK,
        maskImage: MASK,
        animation: "vpFloat 6s ease-in-out infinite",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: LOGICAL_W,
          height: stageHeight,
          transform: `scale(${SCALE}) translateY(${focusY}px)`,
          transformOrigin: "top left",
          transition: "transform 1s cubic-bezier(.4,0,.2,1)",
        }}
      >
        {children}
      </div>
    </div>
  );
}

// Custom eased scroll (native `scrollTo({behavior:"smooth"})` reads as an
// abrupt jump inside the scaled/transformed frame) so autoplayed scrolling
// looks like a real, gentle finger swipe.
function smoothScrollTo(el, to, duration = 1200) {
  if (!el) return () => {};
  const start = el.scrollTop;
  const delta = to - start;
  if (Math.abs(delta) < 1) return () => {};
  const t0 = performance.now();
  const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
  let raf;
  const tick = (now) => {
    const t = Math.min(1, (now - t0) / duration);
    el.scrollTop = start + delta * ease(t);
    if (t < 1) raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(raf);
}

function RegenOverlay() {
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 5,
        background: "rgba(244,248,245,.86)",
        backdropFilter: "blur(2px)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 12,
      }}
    >
      <Loader2 size={30} color="#2d5a3d" style={{ animation: "vpSpin 1s linear infinite" }} />
      <span style={{ fontSize: 13, fontWeight: 800, color: "#2d5a3d" }}>Buscando otro plato…</span>
    </div>
  );
}

// ── Per-step demo wrappers (each holds its own state) ───────────────────────

function MembersDemo() {
  // Loop: 2 adultos ya rellenos → teclea "Leo" (niño) y añade → teclea "Lucas"
  // (bebé) y añade (salta el pop-up) → pausa → reset. El tecleo se muestra en el
  // input real vía demoName/demoAge; los miembros los añadimos por setData.
  const [members, setMembers] = useState(FAMILY_START);
  const [typed, setTyped] = useState("");
  const [typedAge, setTypedAge] = useState("");

  useEffect(() => {
    let cancelled = false;
    const timers = [];
    const wait = (ms) =>
      new Promise((res) => {
        const id = setTimeout(res, ms);
        timers.push(id);
      });
    const typeName = async (word) => {
      for (let i = 1; i <= word.length; i += 1) {
        if (cancelled) return;
        setTyped(word.slice(0, i));
        await wait(90);
      }
    };
    const run = async () => {
      while (!cancelled) {
        setMembers(FAMILY_START);
        setTyped("");
        setTypedAge("");
        await wait(1000);
        if (cancelled) return;
        await typeName("Leo");
        setTypedAge("10");
        await wait(650);
        if (cancelled) return;
        setMembers([...FAMILY_START, DEMO_CHILD]);
        setTyped("");
        setTypedAge("");
        await wait(1100);
        if (cancelled) return;
        await typeName("Lucas");
        setTypedAge("1");
        await wait(650);
        if (cancelled) return;
        setMembers([...FAMILY_START, DEMO_CHILD, DEMO_BABY]);
        setTyped("");
        setTypedAge("");
        await wait(3200);
      }
    };
    run();
    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
    };
  }, []);

  const data = useMemo(() => membersToData(members), [members]);
  const setData = useCallback((updater) => {
    const next = typeof updater === "function" ? updater(membersToData(members)) : updater;
    if (Array.isArray(next?.members)) setMembers(next.members);
  }, [members]);

  return (
    <Frame stageHeight={820} focusY={0}>
      <OnboardingMembers
        data={data}
        setData={setData}
        showMenuModel
        demoName={typed}
        demoAge={typedAge}
      />
    </Frame>
  );
}

function RestrictionsDemo() {
  const [data, setData] = useState(RESTRICTION_DATA);
  return (
    <Frame stageHeight={820} focusY={0}>
      <OnboardingRestrictions data={data} setData={setData} autoplay />
    </Frame>
  );
}

function MenuDemo() {
  // No hay nada que clicar aquí: la propia cámara (focusY) hace un paneo
  // vertical lento a lo largo de la semana ya planificada, en modo "semana"
  // desde el arranque para que se vea de un vistazo que es un menú completo.
  const [focusY, setFocusY] = useState(0);
  useEffect(() => {
    let cancelled = false;
    const timers = [];
    const wait = (ms) =>
      new Promise((res) => {
        const id = setTimeout(res, ms);
        timers.push(id);
      });
    const run = async () => {
      while (!cancelled) {
        for (const y of [0, -480, -960, -1440]) {
          setFocusY(y);
          await wait(2500);
          if (cancelled) return;
        }
      }
    };
    run();
    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
    };
  }, []);

  return (
    <Frame stageHeight={2100} focusY={focusY}>
      <MenuScreen
        data={MENU_DEMO_DATA}
        setData={() => {}}
        menuPlan={MENU_DEMO_PLAN}
        onDishTap={() => {}}
        onNav={() => {}}
        onRegenerate={() => {}}
        onRetry={() => {}}
        onReset={() => {}}
        onToast={() => {}}
        onTrackEvent={() => {}}
        onSwitchWeek={() => {}}
        onOpenMenus={() => {}}
        onAutoOpenProfileHandled={() => {}}
        initialViewMode="semana"
      />
    </Frame>
  );
}

function SchoolMenuDemo() {
  const [data, setData] = useState({
    members: SCHOOL_DEMO_MEMBERS,
    schedule: {},
    schoolMenus: { shared: {}, byMember: {} },
  });
  return (
    <Frame stageHeight={860} focusY={0}>
      <OnboardingSchoolMenu
        data={data}
        setData={setData}
        onNext={() => {}}
        onBack={() => {}}
        onFinish={() => {}}
        onReset={() => {}}
        demoScript
      />
    </Frame>
  );
}

function DishMethodsDemo() {
  const recipe = useMemo(() => {
    const cat = recipeCatalogById["pasta_arroces_018"];
    return cat ? catalogToFrontendRecipe(cat, 4) : null;
  }, []);
  const ref = useRef(null);
  useEffect(() => {
    let cancelScroll = () => {};
    const t = setTimeout(() => {
      const el = ref.current?.querySelector(".mp-sheet-up");
      // Scroll justo hasta la sección "Receta" (selector de método + paso a
      // paso), medida en el DOM real, para que ambos queden a la vista.
      const target = el?.querySelector(".mp-recipe-section");
      const to = target ? target.offsetTop - 8 : 330;
      cancelScroll = smoothScrollTo(el, to, 1200);
    }, 550);
    return () => {
      clearTimeout(t);
      cancelScroll();
    };
  }, []);
  if (!recipe) return null;
  return (
    <Frame stageHeight={STAGE_VISIBLE_H} containerRef={ref}>
      <div className="vp-dish">
        <DishDetail
          key={recipe.id}
          recipe={recipe}
          slot={{ eaters: 4 }}
          kitchenTools={KITCHEN_TOOLS}
          browse
          onClose={() => {}}
          stepsByAppliance={CANNELONI_STEPS}
          autoDemo="methods"
        />
      </div>
    </Frame>
  );
}

function DishSwapDemo() {
  const recipes = useMemo(() => {
    const a = recipeCatalogById["pasta_arroces_018"];
    const b = recipeCatalogById["pescados_001"];
    return [a ? catalogToFrontendRecipe(a, 4) : null, b ? catalogToFrontendRecipe(b, 4) : null];
  }, []);
  const [idx, setIdx] = useState(0);
  const [regen, setRegen] = useState(false);
  const ref = useRef(null);
  const recipe = recipes[idx];

  const handleReject = useCallback(() => {
    setRegen(true);
    setTimeout(() => {
      setIdx(1);
      setRegen(false);
    }, 900);
  }, []);

  // idx 0 (plato rechazado): arranca arriba, baja con scroll suave hasta la
  // tarjeta "Cambiar este plato" — justo a tiempo para el rechazo automático
  // de DishDetail (autoDemo="reject", a los 2000ms). idx 1 (plato nuevo):
  // arranca arriba y, tras una pausa breve, reinicia el bucle entero.
  useEffect(() => {
    const el = ref.current?.querySelector(".mp-sheet-up");
    if (!el) return undefined;
    el.scrollTop = 0;
    let cancelScroll = () => {};
    const timers = [];
    if (idx === 0) {
      timers.push(
        setTimeout(() => {
          cancelScroll = smoothScrollTo(el, el.scrollHeight, 1000);
        }, 500),
      );
    } else {
      timers.push(setTimeout(() => setIdx(0), 2200));
    }
    return () => {
      timers.forEach(clearTimeout);
      cancelScroll();
    };
  }, [idx]);

  if (!recipe) return null;
  return (
    <Frame stageHeight={STAGE_VISIBLE_H} containerRef={ref}>
      <div className="vp-dish">
        <DishDetail
          key={recipe.id}
          recipe={recipe}
          slot={{ eaters: 4 }}
          onClose={() => {}}
          onReject={idx === 0 ? handleReject : undefined}
          autoDemo={idx === 0 ? "reject" : null}
        />
      </div>
      {regen && <RegenOverlay />}
    </Frame>
  );
}

function RecipesDemo() {
  return (
    <Frame stageHeight={780} focusY={0}>
      <RecipesScreen
        userRecipes={USER_RECIPES}
        recipeVotes={RECIPE_VOTES}
        scopeGroups={[]}
        onNav={() => {}}
        onOpenRecipe={() => {}}
        onOpenRecipePlanner={() => {}}
        onSetFavoriteScope={() => {}}
        catalogInitialCategory="pasta_arroces"
        autoplay
      />
    </Frame>
  );
}

// Ids marcados como comprados en el bucle de ShoppingDemo (ver SHOPPING_ITEMS).
const SHOPPING_CHECK_IDS = ["cebolla|ud", "calabacin|ud"];

function ShoppingDemo() {
  const [shopping, setShopping] = useState({ items: SHOPPING_ITEMS });
  useEffect(() => {
    let cancelled = false;
    const timers = [];
    const wait = (ms) =>
      new Promise((res) => {
        const id = setTimeout(res, ms);
        timers.push(id);
      });
    const setHave = (id, have) =>
      setShopping((s) => ({
        ...s,
        items: s.items.map((it) => (it.id === id ? { ...it, have } : it)),
      }));

    const run = async () => {
      while (!cancelled) {
        SHOPPING_CHECK_IDS.forEach((id) => setHave(id, false));
        await wait(900);
        if (cancelled) return;
        // Toca "Comprado" en un par de productos, uno tras otro: cada uno sale
        // de la lista al marcarlo (ya no hay sub-vista de "Comprado").
        for (const id of SHOPPING_CHECK_IDS) {
          setHave(id, true);
          await wait(480);
          if (cancelled) return;
        }
        await wait(2000);
        if (cancelled) return;
      }
    };
    run();
    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
    };
  }, []);

  return (
    <Frame stageHeight={780} focusY={0}>
      <ShoppingScreen
        shopping={shopping}
        setShopping={setShopping}
        onNav={() => {}}
        onToast={() => {}}
        initialOpenAisle="Verduras"
      />
    </Frame>
  );
}

const STEPS = [
  {
    title: "Un menú para toda la familia",
    Demo: MembersDemo,
    bullets: [
      "Añade a cada uno de casa, con su edad: adultos, niños y bebés.",
      "A los bebés les preparamos un menú de purés y texturas suaves, aparte.",
    ],
  },
  {
    title: "Cada uno con lo suyo",
    Demo: RestrictionsDemo,
    bullets: [
      "Marca alergias e intolerancias en un par de toques.",
      "También tenemos en cuenta embarazo, diabetes o una dieta blanda.",
    ],
  },
  {
    title: "Tu menú, ya organizado",
    Demo: MenuDemo,
    bullets: [
      "Cada comida de la semana, con su plato y su tiempo de cocina.",
      "Míralo día a día o de un vistazo, semana completa.",
    ],
  },
  {
    title: "Y el menú del cole, también",
    Demo: SchoolMenuDemo,
    bullets: [
      "Sube el PDF o la foto del comedor y lo interpretamos por ti.",
      "Así el menú de casa no repite lo que ya comen en el cole.",
    ],
  },
  {
    title: "Adaptado a tu cocina",
    Demo: DishMethodsDemo,
    bullets: [
      "Recetas con pasos para horno, fuego tradicional, Thermomix o Airfryer.",
      "Cambia de método cuando quieras: los pasos se ajustan solos.",
    ],
  },
  {
    title: "Recetas de verdad, también las tuyas",
    Demo: RecipesDemo,
    bullets: [
      "Un catálogo con recetas reales, no inventadas por un ordenador.",
      "Añade las tuyas con ayuda de la IA y guarda tus favoritas.",
    ],
  },
  {
    title: "La lista de la compra, hecha sola",
    Demo: ShoppingDemo,
    bullets: [
      "Se genera automáticamente a partir del menú de la semana.",
      "Marca lo que ya tienes en casa para no comprarlo de más.",
    ],
  },
  {
    title: "¿No te convence un plato?",
    Demo: DishSwapDemo,
    bullets: [
      "Pulsa “No me gusta” y te buscamos otro al momento.",
      "El menú se adapta a vosotros, no al revés.",
    ],
  },
];

export function ValuePropsCarousel({ onFinish }) {
  // step 0 = pantalla de bienvenida; 1..N = slides del tutorial.
  const [step, setStep] = useState(0);
  const touchX = useRef(null);
  const last = STEPS.length;

  const next = useCallback(() => setStep((s) => (s >= last ? s : s + 1)), [last]);
  const prev = useCallback(() => setStep((s) => Math.max(0, s - 1)), []);

  const onTouchStart = (e) => { touchX.current = e.touches[0].clientX; };
  const onTouchEnd = (e) => {
    if (touchX.current == null) return;
    const dx = e.changedTouches[0].clientX - touchX.current;
    touchX.current = null;
    if (dx <= -45) next();
    else if (dx >= 45) prev();
  };

  const isWelcome = step === 0;
  const isLast = step === last;
  const tut = isWelcome ? null : STEPS[step - 1];

  return (
    <div
      style={{
        position: "relative",
        height: "100dvh",
        width: "100%",
        display: "flex",
        flexDirection: "column",
        background: BG,
        overflow: "hidden",
      }}
    >
      <style>{`
        @keyframes vpFadeUp { from { opacity:0; transform:translateY(18px);} to { opacity:1; transform:translateY(0);} }
        @keyframes vpFloat { 0%,100% { transform:translateY(0);} 50% { transform:translateY(-6px);} }
        @keyframes vpSpin { to { transform:rotate(360deg);} }
        .vp-slide { animation: vpFadeUp .6s cubic-bezier(.22,.61,.36,1) both; }
        .vp-bullet { animation: vpFadeUp .6s cubic-bezier(.22,.61,.36,1) both; }
        /* Hide the app's portaled bottom nav (Recetario/Compra render it) so the
           framed screenshots stay clean while the carousel is on screen. */
        nav[aria-label="Navegación principal"] { display: none !important; }
        /* Keep DishDetail's fixed overlay inside the scaled frame. */
        .vp-dish .mp-overlay-in {
          position: absolute !important;
          inset: 0 !important;
          width: 100% !important;
          height: 100% !important;
          background: rgba(20,48,29,.08) !important;
          align-items: flex-start !important;
        }
        .vp-dish .mp-sheet-up {
          max-height: 100% !important;
          border-radius: 22px !important;
          box-shadow: 0 10px 30px rgba(0,0,0,.12) !important;
        }
      `}</style>

      {/* Barra superior: Atrás + progreso segmentado, igual que en el onboarding (solo en tutorial) */}
      {!isWelcome && (
        <div
          style={{
            position: "relative", zIndex: 3, flexShrink: 0,
            minHeight: 30,
            padding: "12px 22px 0",
            display: "flex", alignItems: "center", gap: 8,
          }}
        >
          <div style={{ flex: "0 0 auto" }}>
            <button type="button" onClick={prev} style={headerBtnStyle}>
              Atrás
            </button>
          </div>
          <div style={{ flex: 1, minWidth: 0, display: "flex", gap: 5 }}>
            {STEPS.map((_, i) => {
              const isDone = i < step - 1;
              const isCurrent = i === step - 1;
              return (
                <button
                  key={i}
                  type="button"
                  aria-label={`Ir al paso ${i + 1}`}
                  onClick={() => setStep(i + 1)}
                  style={{
                    flex: 1, height: 4, borderRadius: 999,
                    border: "none", padding: 0, cursor: "pointer",
                    background: isCurrent
                      ? "#3ddc78"
                      : isDone
                      ? "#2d5a3d"
                      : "rgba(20,48,29,.13)",
                    boxShadow: isCurrent ? "0 0 8px rgba(61,220,120,.75)" : "none",
                    transition: "background .3s ease, box-shadow .3s ease",
                  }}
                />
              );
            })}
          </div>
          <div style={{ flex: "0 0 auto", width: 0 }} />
        </div>
      )}

      {/* Contenido */}
      <div
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        style={{
          position: "relative", zIndex: 2, flex: 1, minHeight: 0,
          display: "flex", flexDirection: "column",
          justifyContent: "center", alignItems: "center",
          padding: "8px 26px", gap: 20,
        }}
      >
        {isWelcome ? (
          <div
            key="welcome"
            className="vp-slide"
            style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 26, width: "100%", maxWidth: 360 }}
          >
            <div
              style={{
                position: "relative", width: "100%", borderRadius: 26, overflow: "hidden",
                boxShadow: "0 18px 42px rgba(20,48,29,.2)",
                animation: "vpFloat 6s ease-in-out infinite",
              }}
            >
              <img
                src={heroProducePhoto}
                alt=""
                style={{ width: "100%", height: VIS_H, objectFit: "cover", display: "block" }}
              />
              <div
                style={{
                  position: "absolute", inset: 0,
                  background: "linear-gradient(180deg, rgba(10,22,13,0) 45%, rgba(10,22,13,.7) 100%)",
                }}
              />
              <div style={{ position: "absolute", left: 0, right: 0, bottom: 26, textAlign: "center" }}>
                <div
                  style={{
                    color: "#fff", fontSize: 30, fontWeight: 800, lineHeight: 1.05,
                    letterSpacing: "-.3px", marginBottom: 4,
                    fontFamily: "'Playfair Display', Georgia, serif",
                  }}
                >
                  Bienvenido a
                </div>
                <div
                  style={{
                    color: "#fff", fontSize: 46, fontWeight: 900, lineHeight: 1,
                    letterSpacing: "-.5px",
                    fontFamily: "'Playfair Display', Georgia, serif",
                  }}
                >
                  Menú<span style={{ color: "#7ecb96" }}>Plan</span>
                </div>
              </div>
            </div>

            <p style={{ fontSize: 16, lineHeight: 1.5, fontWeight: 600, color: INK, textAlign: "center", margin: 0 }}>
              Antes de empezar, te enseñamos en 1 minuto cómo te ayudamos a organizar el menú de tu familia.
            </p>
          </div>
        ) : (
          <div
            key={step}
            className="vp-slide"
            style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16, width: "100%", maxWidth: 360 }}
          >
            <h2
              style={{
                fontSize: 20, fontWeight: 900, letterSpacing: "-.5px",
                color: INK, margin: 0, lineHeight: 1.15, textAlign: "center",
                maxWidth: 360,
                fontFamily: "'Playfair Display', Georgia, serif",
              }}
            >
              {tut.title}
            </h2>

            <tut.Demo />

            <div style={{ width: "100%", maxWidth: 360, display: "flex", flexDirection: "column", gap: 8 }}>
              {tut.bullets.map((b, i) => (
                <div
                  key={b}
                  className="vp-bullet"
                  style={{ display: "flex", gap: 9, alignItems: "flex-start", animationDelay: `${0.1 + i * 0.1}s` }}
                >
                  <span
                    style={{
                      flexShrink: 0, marginTop: 1,
                      width: 19, height: 19, borderRadius: "50%",
                      background: "rgba(21,154,81,.14)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}
                  >
                    <Check size={13} strokeWidth={3} color={BULLET_GREEN} />
                  </span>
                  <span style={{ fontSize: 13.5, lineHeight: 1.35, fontWeight: 600, color: INK }}>
                    {b}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Pie: Saltar + Siguiente. En el último paso, solo "Empezar ya" a todo
          el ancho. El bloque flota sobre el mismo fondo degradado que el resto
          (sin franja blanca): así respira igual que en la pantalla de
          Bienvenida, cuyo pie usa este mismo componente. */}
      <div
        style={{
          position: "relative", zIndex: 2, flexShrink: 0,
          display: "flex", gap: 12,
          padding: "22px 26px calc(22px + env(safe-area-inset-bottom))",
        }}
      >
        {!isLast && (
          <button
            type="button"
            onClick={onFinish}
            style={{
              flex: 1, padding: 13, borderRadius: 13,
              border: "1.5px solid #c8ddd0", background: "#fff",
              color: "#2d5a3d", fontSize: 14.5, fontWeight: 800,
              cursor: "pointer", fontFamily: "inherit",
            }}
          >
            Saltar
          </button>
        )}
        <button
          type="button"
          onClick={isWelcome ? () => setStep(1) : isLast ? onFinish : next}
          style={{
            flex: 1, padding: 13, borderRadius: 13, border: "none",
            background: "#2d5a3d", color: "#fff", fontSize: 14.5, fontWeight: 800,
            cursor: "pointer", fontFamily: "inherit",
            boxShadow: "0 8px 22px rgba(45,90,61,.28)",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
          }}
        >
          {isLast ? "Empezar ya" : "Siguiente"}
          {isLast && <Sparkles size={16} />}
        </button>
      </div>
    </div>
  );
}
