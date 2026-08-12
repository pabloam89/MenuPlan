import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeftRight, CalendarOff, Check, Clock3, CopyPlus, Fish, History, RotateCw, Search, Shuffle, Sparkles, ThumbsDown, Trash2 } from "lucide-react";
import { OnboardingMembers, OnboardingRestrictions, OnboardingSchoolMenu, OnboardingSchedule, OnboardingMealStyle } from "./Onboarding.jsx";
import { DishDetail, MenuScreen, RoscoMenu } from "./Menu.jsx";
import { DashboardScreen } from "./Dashboard.jsx";
import { RecipePlannerScreen } from "./RecipePlanner.jsx";
import { ShoppingScreen } from "./Shopping.jsx";
import { catalogToFrontendRecipe } from "../lib/aiPlanner.js";
import { recipeCatalogById } from "../data/recipeCatalog.js";
import { registerRecipes } from "../data/recipes.js";
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

// Step 1 — family builder (UI nueva): arranca con papá y mamá arriba y en bucle
// va "soltando" perfiles de la paleta (hijo, bebé). Cada miembro lleva su
// profileKey + color para que los avatares se pinten como en la app real.
// Each one carries an avatarKey so the carousel shows the same illustrated
// characters the user is about to pick in onboarding. Without it they fall back
// to plain initials and the first thing we promise looks nothing like the app.
const FAMILY_START = [
  mkMember({ id: "vp-pablo", name: "Pablo", age: 38, homeRole: "Papá", profileKey: "papa", avatarKey: "papa_4", color: "#039be5" }),
  mkMember({ id: "vp-ana", name: "Ana", age: 36, homeRole: "Mamá", profileKey: "mama", avatarKey: "mama_5", color: "#d81b60" }),
];
// Familia de 4 hijos: se van soltando de uno en uno sobre papá + mamá.
const DEMO_KIDS = [
  mkMember({ id: "vp-leo",  name: "Leo",  age: 11, homeRole: "Hijo/a", profileKey: "hijo", avatarKey: "hijo_2",  color: "#43a047" }),
  mkMember({ id: "vp-sara", name: "Sara", age: 9,  homeRole: "Hijo/a", profileKey: "hija", avatarKey: "hija_12", color: "#8e24aa" }),
  mkMember({ id: "vp-hugo", name: "Hugo", age: 6,  homeRole: "Hijo/a", profileKey: "hijo", avatarKey: "hijo_11", color: "#fb8c00" }),
  mkMember({ id: "vp-mia",  name: "Mía",  age: 3,  homeRole: "Hijo/a", profileKey: "hija", avatarKey: "hija_14", color: "#e53935" }),
];

const membersToData = (members) => ({
  members,
  menuModel: "same",
  groups: [{ id: "vp-g1", label: "Familia", memberIds: members.map((m) => m.id), color: "#2d5a3d" }],
  customAllergies: [],
});

// Step 2 — alérgenos (Pablo), embarazo (Ana), diabetes (Marcos).
const RESTRICTION_DATA = {
  members: [
    mkMember({ id: "vp-r-pablo", name: "Pablo", age: 38, homeRole: "Adulto", avatarKey: "papa_4", allergies: ["Gluten", "Leche"] }),
    mkMember({ id: "vp-r-ana", name: "Ana", age: 34, homeRole: "Adulto", avatarKey: "mama_5", dietaryStates: ["embarazo"] }),
    mkMember({ id: "vp-r-marcos", name: "Marcos", age: 52, homeRole: "Adulto", avatarKey: "papa_11", healthProfiles: ["glucemico"] }),
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
// El plan de `demoState` usa recetas con IDs propios que NO tienen foto en el
// manifiesto (salían placeholders de color). Reconstruimos el menú con recetas
// reales del catálogo que sí tienen imagen, para el mismo grupo/días.
const DEMO_GROUP_ID = MENU_DEMO_DATA.groups?.[0]?.id ?? "uck1a48c";
const demoSlot = (recipeId, firstRecipeId = null) => ({
  recipeId,
  firstRecipeId,
  mode: "casa",
  eaters: 3,
  warnings: [],
});
const MENU_DEMO_PLAN = {
  _warnings: [],
  [DEMO_GROUP_ID]: {
    "Lun-Comida": demoSlot("pescados_002", "ensaladas_verduras_001"),
    "Lun-Cena": demoSlot("pasta_arroces_001"),
    "Mar-Comida": demoSlot("carnes_001", "sopas_cremas_001"),
    "Mar-Cena": demoSlot("cenas_rapidas_001"),
    "Mié-Comida": demoSlot("pescados_005", "legumbres_001"),
    "Mié-Cena": demoSlot("huevos_001"),
    "Jue-Comida": demoSlot("carnes_005", "ensaladas_verduras_002"),
    "Jue-Cena": demoSlot("cenas_rapidas_002"),
    "Vie-Comida": demoSlot("platos_unicos_001", "sopas_cremas_002"),
    "Vie-Cena": demoSlot("pasta_arroces_002"),
    "Sáb-Comida": demoSlot("platos_unicos_002"),
    "Sáb-Cena": demoSlot("cenas_rapidas_001"),
    "Dom-Comida": demoSlot("carnes_001", "ensaladas_verduras_001"),
    "Dom-Cena": demoSlot("pescados_002"),
  },
};

// RECIPES_BY_ID se construye desde BASE_RECIPES (recetas legacy), NO desde el
// catálogo — el catálogo solo entra en runtime vía `registerRecipes` (planner).
// En el carrusel de bienvenida el planner no corre, así que registramos aquí las
// recetas de catálogo que usa el menú demo, para que resuelvan nombre + FOTO.
const DEMO_MENU_RECIPE_IDS = Array.from(
  new Set(
    Object.values(MENU_DEMO_PLAN[DEMO_GROUP_ID]).flatMap((s) =>
      [s.recipeId, s.firstRecipeId].filter(Boolean),
    ),
  ),
);
registerRecipes(
  DEMO_MENU_RECIPE_IDS.map((id) => recipeCatalogById[id])
    .filter(Boolean)
    .map((r) => catalogToFrontendRecipe(r, 3)),
);
// Home demo — usuario ficticio para que googleInfo pinte un nombre real.
const HOME_DEMO_USER = { user_metadata: { full_name: "Pablo" } };

// Step "Menú del cole" — familia con un hijo en edad escolar (para que
// OnboardingSchoolMenu no muestre el estado vacío "sin niños/as").
const SCHOOL_DEMO_MEMBERS = [
  mkMember({ id: "vp-s-pablo", name: "Pablo", age: 38, homeRole: "Adulto" }),
  mkMember({ id: "vp-s-ana", name: "Ana", age: 36, homeRole: "Adulto" }),
  mkMember({ id: "vp-s-leo", name: "Leo", age: 8, homeRole: "Hijo/a" }),
];

// Steps "Cuándo coméis" / "Cómo coméis" — reusan un hogar de 2 adultos + 1 niño.
// Horario realista: entre semana Leo come en el cole y Pablo come fuera; todos
// cenan en casa; el finde, comida en casa. Así la rejilla muestra casa/cole/fuera.
const HOME_DEMO_MEMBERS = [
  mkMember({ id: "vp-h-pablo", name: "Pablo", age: 38, homeRole: "Adulto" }),
  mkMember({ id: "vp-h-ana", name: "Ana", age: 36, homeRole: "Adulto" }),
  mkMember({ id: "vp-h-leo", name: "Leo", age: 8, homeRole: "Hijo/a" }),
];
const HOME_DEMO_GROUP = {
  id: "vp-h-g1",
  label: "Familia",
  memberIds: HOME_DEMO_MEMBERS.map((m) => m.id),
  color: "#2d5a3d",
};
const WEEK_DAYS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const buildScheduleDemo = () => {
  const s = {};
  for (const day of WEEK_DAYS) {
    const weekend = day === "Sáb" || day === "Dom";
    s[`vp-h-pablo|${day}|Comida`] = weekend ? "casa" : "fuera";
    s[`vp-h-ana|${day}|Comida`] = "casa";
    s[`vp-h-leo|${day}|Comida`] = weekend ? "casa" : "cole";
    s[`vp-h-pablo|${day}|Cena`] = "casa";
    s[`vp-h-ana|${day}|Cena`] = "casa";
    s[`vp-h-leo|${day}|Cena`] = "casa";
  }
  return s;
};
const SCHEDULE_DEMO_DATA = {
  members: HOME_DEMO_MEMBERS,
  meals: ["Comida", "Cena"],
  menuModel: "same",
  menuWeek: { offset: 0, startDayIdx: 0 },
  schedule: buildScheduleDemo(),
  schoolMenus: { shared: {}, byMember: {} },
  groups: [HOME_DEMO_GROUP],
  customAllergies: [],
};
const MEALSTYLE_DEMO_DATA = {
  members: HOME_DEMO_MEMBERS,
  meals: ["Comida", "Cena"],
  menuModel: "same",
  menuWeek: { offset: 0, startDayIdx: 0 },
  schedule: buildScheduleDemo(),
  groups: [HOME_DEMO_GROUP],
  mealStyleByGroup: { "vp-h-g1": "equilibrado" },
  customAllergies: [],
};

// ── Frame ─────────────────────────────────────────────────────────────────

function Frame({ children, focusY = 0, stageHeight = 760, containerRef = null, animate = true }) {
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
          // `animate=false` → salto instantáneo (reset al top entre pasos, sin
          // rebote hacia arriba). `true` → paneo suave (solo hacia abajo).
          transition: animate ? "transform 1s cubic-bezier(.4,0,.2,1)" : "none",
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

// ── Per-step demo wrappers (each holds its own state) ───────────────────────

// "Aquí arranca todo" — la Home real: menú de hoy, tu familia y accesos rápidos.
function HomeDemo() {
  return (
    <Frame stageHeight={1180} focusY={0}>
      <DashboardScreen
        user={HOME_DEMO_USER}
        data={MENU_DEMO_DATA}
        menuPlan={MENU_DEMO_PLAN}
        onNav={() => {}}
        onViewMenu={() => {}}
        onGenerateNewMenu={() => {}}
        onOpenRecipePlanner={() => {}}
        onOpenStreak={() => {}}
        onOpenAccount={() => {}}
      />
    </Frame>
  );
}

function MembersDemo() {
  // UI nueva (family builder): NO pasamos demoName → OnboardingMembers muestra la
  // lista de familia arriba + la paleta de perfiles abajo. En bucle vamos
  // "soltando" perfiles (papá/mamá → hijo → bebé) por setData para que se vea
  // crecer la familia con sus avatares de colores.
  const [members, setMembers] = useState(FAMILY_START);

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
        setMembers(FAMILY_START);
        await wait(900);
        if (cancelled) return;
        // Suelta los 4 hijos de uno en uno.
        for (let i = 0; i < DEMO_KIDS.length; i += 1) {
          setMembers([...FAMILY_START, ...DEMO_KIDS.slice(0, i + 1)]);
          await wait(900);
          if (cancelled) return;
        }
        // 1s viendo a los 6 miembros al completo.
        await wait(1000);
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
      <OnboardingMembers data={data} setData={setData} showMenuModel />
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
  // Vista "Semana" real con FOTOS. Paneo vertical suave por los días + scroll
  // horizontal continuo (`autoDemo="tour"`) para que se vean bien los platos.
  const [focusY, setFocusY] = useState(-60);
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
        for (const y of [-60, -60, -380, -700, -380]) {
          setFocusY(y);
          await wait(2800);
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
    <Frame stageHeight={1750} focusY={focusY}>
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
        initialDeckView="semana"
        autoDemo="tour"
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

function ScheduleDemo() {
  const [data, setData] = useState(SCHEDULE_DEMO_DATA);
  // Sin paneo del frame: fijamos la altura del shell al frame (STAGE_H) para que
  // el scroll ocurra DENTRO del body (como una pantalla real) y el panel
  // "Ajustar" (fixed) ancle al fondo del frame → sin recortes ni saltos raros.
  const STAGE_H = Math.round(VIS_H / SCALE); // altura lógica visible del frame
  return (
    <Frame stageHeight={STAGE_H} focusY={0}>
      <OnboardingSchedule
        data={data}
        setData={setData}
        onNext={() => {}}
        onBack={() => {}}
        onFinish={() => {}}
        onReset={() => {}}
        autoplay
        demoHeight={STAGE_H}
      />
    </Frame>
  );
}

function MealStyleDemo() {
  const [data, setData] = useState(MEALSTYLE_DEMO_DATA);
  return (
    <Frame stageHeight={900} focusY={0}>
      <OnboardingMealStyle
        data={data}
        setData={setData}
        onNext={() => {}}
        onBack={() => {}}
        onFinish={() => {}}
        onReset={() => {}}
        autoplay
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
          initialRecipeTab="pasos"
          autoDemo="methods"
        />
      </div>
    </Frame>
  );
}

// Flujo del radial real (mismos iconos/labels/colores que producción):
// 1) main: Mover / Duplicar / Regenerar / Quitar
// 2) regen: al pulsar Regenerar → Otro pescado / Otro plato / Elegir a mano
// 3) reason: al reemplazar pregunta el porqué; resaltamos "Tarda demasiado".
const RADIAL_MAIN = [
  { id: "swap", Icon: ArrowLeftRight, label: "Mover", onPick: () => {} },
  { id: "dup", Icon: CopyPlus, label: "Duplicar", onPick: () => {} },
  { id: "regen", Icon: RotateCw, label: "Regenerar", onPick: () => {} },
  { id: "clear", Icon: Trash2, label: "Quitar", onPick: () => {} },
];
const RADIAL_REGEN = [
  { id: "same", Icon: Fish, color: "#2f6fb8", label: "Otro pescado", onPick: () => {} },
  { id: "any", Icon: Shuffle, label: "Otro plato", onPick: () => {} },
  { id: "pick", Icon: Search, label: "Elegir a mano", onPick: () => {} },
];
const RADIAL_REASON = [
  { id: "dislike", Icon: ThumbsDown, color: "#e0405a", label: "No me gusta", onPick: () => {} },
  { id: "week", Icon: CalendarOff, color: "#e08a2f", label: "Esta semana no", onPick: () => {} },
  { id: "timing", Icon: Clock3, color: "#2f6fb8", label: "Tarda demasiado", active: true, onPick: () => {} },
  { id: "recent", Icon: History, color: "#7a5cc0", label: "Lo comí hace poco", onPick: () => {} },
];

const RADIAL_STAGE_H = 1300;
const RADIAL_FOCUS_Y = -58;
// Slot sobre el que actúa el radial: un día CENTRAL (para poder centrarlo también
// en horizontal) y un pescado (para que "Otro pescado" cuadre). "Regenera" a otro
// pescado del catálogo (ya registrado, con foto).
const RADIAL_SLOT = "Mié-Comida";
const RADIAL_SWAP_TO = "pescados_002";
const RADIAL_SWAPPED_PLAN = {
  ...MENU_DEMO_PLAN,
  [DEMO_GROUP_ID]: {
    ...MENU_DEMO_PLAN[DEMO_GROUP_ID],
    [RADIAL_SLOT]: { ...MENU_DEMO_PLAN[DEMO_GROUP_ID][RADIAL_SLOT], recipeId: RADIAL_SWAP_TO },
  },
};

// Pulso de "toque" sobre los ⋮ (arriba a la derecha del tile), antes del radial.
function TapPulse({ tile }) {
  const x = tile.left + tile.width - 24;
  const y = tile.top + 24;
  return (
    <div style={{ position: "absolute", inset: 0, zIndex: 1190, pointerEvents: "none" }}>
      <style>{`@keyframes vpTap {
        0%   { transform: translate(-50%,-50%) scale(.5); opacity: .95; }
        70%  { transform: translate(-50%,-50%) scale(1.6); opacity: 0; }
        100% { opacity: 0; }
      }`}</style>
      <span
        style={{
          position: "absolute", left: x, top: y, width: 34, height: 34,
          borderRadius: "50%", border: "3px solid rgba(255,255,255,.95)",
          background: "rgba(255,255,255,.3)", transform: "translate(-50%,-50%)",
          boxShadow: "0 2px 10px rgba(9,18,12,.45)",
          animation: "vpTap .62s ease-out both",
        }}
      />
    </div>
  );
}

// "Tú mandas" — el radial se lanza SOBRE el menú completo (fondo real, atenuado
// por el propio rosco). Secuencia: 1s viendo el menú → toque en los ⋮ →
// main → Regenerar → razón (Tarda demasiado) → regenera (plato nuevo) 1s. Bucle.
function RadialDemo() {
  const wrapRef = useRef(null);
  const [anchor, setAnchor] = useState(null);
  const [phase, setPhase] = useState("menu"); // menu | tap | main | regen | reason | done
  const [plan, setPlan] = useState(MENU_DEMO_PLAN);
  // focusY se calcula tras medir el tile para CENTRARLO en el marco (si no, el
  // radial queda pegado arriba y descuadrado). Fallback: RADIAL_FOCUS_Y.
  const [focusY, setFocusY] = useState(RADIAL_FOCUS_Y);

  useEffect(() => {
    let raf;
    let tries = 0;
    let scrolled = false;
    const measure = () => {
      const wrap = wrapRef.current;
      // El stage escalado es el único hijo del contenedor de Frame; medimos
      // relativo a él para obtener coordenadas LÓGICAS (el rosco vive dentro
      // del stage, así que comparte su scale + translateY(focusY)).
      const stage = wrap?.firstElementChild;
      // Anclamos en el SEGUNDO plato (el que se regenera) — así el resalte
      // coincide con los bordes de ESA miniatura (no una caja-unión desacoplada).
      const el =
        stage?.querySelector(`.deck-tile[data-slot="${RADIAL_SLOT}"][data-course="main"]`) ||
        stage?.querySelector(`.deck-tile[data-slot="${RADIAL_SLOT}"]`) ||
        stage?.querySelectorAll(".deck-tile")?.[0];
      if (!stage || !el) {
        if (tries++ < 60) raf = requestAnimationFrame(measure);
        return;
      }
      // 1) Centra ese plato en HORIZONTAL desplazando los scrollers del deck (una
      // vez), para que el radial quede cuadrado sin desacoplar el borde.
      if (!scrolled) {
        scrolled = true;
        const trr = el.getBoundingClientRect();
        const sr0 = stage.getBoundingClientRect();
        const delta = ((trr.left + trr.width / 2) - (sr0.left + sr0.width / 2)) / SCALE;
        const scrollers = stage.querySelectorAll(".deck-scroller");
        if (scrollers.length && Math.abs(delta) > 1) {
          scrollers.forEach((s) => { s.scrollLeft += delta; });
          raf = requestAnimationFrame(measure); // re-medir tras el scroll
          return;
        }
      }
      const tr = el.getBoundingClientRect();
      const sr = stage.getBoundingClientRect();
      const tile = {
        left: (tr.left - sr.left) / SCALE,
        top: (tr.top - sr.top) / SCALE,
        width: tr.width / SCALE,
        height: tr.height / SCALE,
      };
      setAnchor({ tile, radius: 16 });
      // 2) Centra en VERTICAL vía focusY (un pelín por encima del centro para
      // dejar aire a la chip inferior).
      const centerY = tile.top + tile.height / 2;
      setFocusY(Math.min(0, Math.round(STAGE_VISIBLE_H / 2 - 18 - centerY)));
    };
    measure();
    return () => cancelAnimationFrame(raf);
  }, []);

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
        setPlan(MENU_DEMO_PLAN);
        setPhase("menu");
        await wait(1000); // 1s viendo el menú normal
        if (cancelled) return;
        setPhase("tap"); // "toca" los ⋮
        await wait(650);
        if (cancelled) return;
        setPhase("main"); // Mover / Duplicar / Regenerar / Quitar
        await wait(2200);
        if (cancelled) return;
        setPhase("regen"); // Otro pescado / Otro plato / Elegir a mano
        await wait(2200);
        if (cancelled) return;
        setPhase("reason"); // razón: Tarda demasiado (resaltado)
        await wait(2400);
        if (cancelled) return;
        setPhase("done"); // regenera → plato nuevo
        setPlan(RADIAL_SWAPPED_PLAN);
        await wait(1200); // 1s viendo el nuevo plato
        if (cancelled) return;
      }
    };
    run();
    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
    };
  }, []);

  const showRadial = phase === "main" || phase === "regen" || phase === "reason";
  const actions = phase === "regen" ? RADIAL_REGEN : phase === "reason" ? RADIAL_REASON : RADIAL_MAIN;

  return (
    <Frame stageHeight={RADIAL_STAGE_H} focusY={focusY} containerRef={wrapRef}>
      <MenuScreen
        data={MENU_DEMO_DATA}
        setData={() => {}}
        menuPlan={plan}
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
        initialDeckView="semana"
      />
      {anchor && phase === "tap" && <TapPulse tile={anchor.tile} />}
      {anchor && showRadial && (
        <RoscoMenu
          key={phase}
          inline
          frameW={LOGICAL_W}
          frameH={RADIAL_STAGE_H}
          radius={58}
          anchor={anchor}
          actions={actions}
          onClose={() => {}}
        />
      )}
    </Frame>
  );
}

// "Recetas": muestra CÓMO se crea una receta. El planner se teclea solo
// ("Salmón a la plancha con ensalada de mango y aguacate") y recorre las 6
// pantallas; paneamos hacia abajo en los pasos con contenido largo.
function RecipesDemo() {
  const [focusY, setFocusY] = useState(0);
  const [animate, setAnimate] = useState(true);
  const rafRef = useRef(0);
  // Cambio de paso: salto instantáneo al top del nuevo paso (sin animar hacia
  // arriba, para que NO rebote). El scroll dentro del paso siempre va hacia
  // abajo, animado, vía onDemoScroll.
  const onDemoStep = () => {
    cancelAnimationFrame(rafRef.current);
    setAnimate(false);
    setFocusY(0);
    rafRef.current = requestAnimationFrame(() => setAnimate(true));
  };
  const onDemoScroll = (y) => {
    setAnimate(true);
    setFocusY(y);
  };
  useEffect(() => () => cancelAnimationFrame(rafRef.current), []);
  return (
    <Frame stageHeight={1080} focusY={focusY} animate={animate}>
      <RecipePlannerScreen
        userRecipes={USER_RECIPES}
        user={null}
        setData={() => {}}
        onClose={() => {}}
        onSaved={() => {}}
        autoDemo
        onDemoStep={onDemoStep}
        onDemoScroll={onDemoScroll}
      />
    </Frame>
  );
}

function ShoppingDemo() {
  const [shopping, setShopping] = useState({ items: SHOPPING_ITEMS });
  // Altura = frame visible, y wrapper .vp-shop para que el overlay del ticket
  // (WizardSheet) quede DENTRO del marco (no fixed al viewport) y no tape "Atrás".
  return (
    <Frame stageHeight={STAGE_VISIBLE_H} focusY={0}>
      <div className="vp-shop">
        <ShoppingScreen
          shopping={shopping}
          setShopping={setShopping}
          onNav={() => {}}
          onToast={() => {}}
          initialOpenAisle="Verduras"
          autoDemo
        />
      </div>
    </Frame>
  );
}

const STEPS = [
  {
    title: "Aquí arranca todo",
    Demo: HomeDemo,
    bullets: [
      "Tu pantalla de inicio: el menú de hoy, tu familia y accesos rápidos.",
      "Desde aquí generas el menú, abres la compra y consultas tus recetas.",
    ],
  },
  {
    title: "Un menú para toda la familia",
    Demo: MembersDemo,
    bullets: [
      "Añade a cada uno de casa, con su edad y el personaje que más se le parezca.",
      "Un único menú para todos o uno distinto para peques y mayores.",
    ],
  },
  {
    title: "Cuándo coméis",
    Demo: ScheduleDemo,
    bullets: [
      "Di quién come en casa cada día, en comida y cena, entre semana y el finde.",
      "Marca quién come fuera o en el cole y el menú se ajusta a los días reales.",
    ],
  },
  {
    title: "Cómo os gusta comer",
    Demo: MealStyleDemo,
    bullets: [
      "Elige el estilo: de todo, equilibrado o algo más ligero.",
      "Repartimos legumbres, pescado, verdura y demás en su justa medida.",
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
    title: "Los peques, cubiertos",
    Demo: SchoolMenuDemo,
    bullets: [
      "A los bebés les preparamos un menú aparte de purés y texturas suaves.",
      "Sube el PDF o la foto del comedor: el menú de casa no repite lo del cole.",
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
    title: "Adaptado a tu cocina",
    Demo: DishMethodsDemo,
    bullets: [
      "Recetas con pasos para horno, fuego tradicional, Thermomix o Airfryer.",
      "Cambia de método cuando quieras: los pasos se ajustan solos.",
    ],
  },
  {
    title: "Crea tus propias recetas",
    Demo: RecipesDemo,
    bullets: [
      "Escribe el plato y la IA te propone ingredientes, pasos y hasta la foto.",
      "En unos pasos la guardas y ya entra en tus menús.",
    ],
  },
  {
    title: "La lista de la compra, hecha sola",
    Demo: ShoppingDemo,
    bullets: [
      "Se genera sola desde el menú; marca lo que ya tienes en casa.",
      "Sube el ticket y tachamos lo comprado y lo guardamos en la despensa.",
    ],
  },
  {
    title: "Tú mandas",
    Demo: RadialDemo,
    bullets: [
      "Toca los ⋮ de un plato y elige: moverlo, duplicarlo, regenerarlo o quitarlo.",
      "También puedes elegirlo a mano o descartarlo: el menú se adapta a vosotros.",
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
        /* Igual para el wizard del ticket en "Tu compra": el overlay queda DENTRO
           del frame (no fixed al viewport) para que no tape el botón "Atrás". */
        .vp-shop .mp-overlay-in {
          position: absolute !important;
          inset: 0 !important;
          width: 100% !important;
          height: 100% !important;
          align-items: center !important;
        }
        .vp-shop .mp-sheet-up {
          max-height: 100% !important;
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
