/**
 * Genera src/dev/demoState.json: familia de ejemplo + menú semanal de la demo
 * (`?demo=1`, `npm run dev:menu`).
 * Uso: node scripts/gen-demo-state.mjs
 *
 * El menú es la lista fija de platos REALES del catálogo de src/dev/demoMenu.js
 * (no hay planificador: sale igual cada vez). Las recetas van en `aiRecipes` en
 * el formato de la app, que es por donde App.jsx las registra al abrir la demo.
 *
 * Carga el código de la app con el servidor de Vite (ssrLoadModule) y no con
 * `import`, porque la app usa import.meta.env y .jsx que node a secas no lee.
 */
import { writeFileSync, mkdirSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { createServer } from "vite";

const __dirname = dirname(fileURLToPath(import.meta.url));

const GRUPO_DEMO_ID = "uck1a48c";

const data = {
  members: [
    {
      id: "m-pablo",
      name: "Pablo",
      age: 35,
      allergies: [],
      dislikes: [],
      useBirthDate: false,
      birthDate: "",
      homeRole: "Papá",
      profileKey: "papa",
      avatarKey: "papa_4",
    },
    {
      id: "m-ana",
      name: "Ana",
      age: 33,
      allergies: [],
      dislikes: ["Coliflor"],
      useBirthDate: false,
      birthDate: "",
      homeRole: "Mamá",
      profileKey: "mama",
      avatarKey: "mama_5",
    },
    {
      id: "m-leo",
      name: "Leo",
      age: 8,
      allergies: [],
      dislikes: [],
      useBirthDate: false,
      birthDate: "",
      homeRole: "Hijo/a",
      profileKey: "hijo",
      avatarKey: "hijo_2",
    },
  ],
  dislikes: [],
  customAllergies: [],
  customDislikes: [],
  fixedDishes: [],
  menuModel: "same",
  meals: ["Comida", "Cena"],
  schedule: {},
  schoolMenus: { shared: {}, byMember: {} },
  goals: ["sano", "variado"],
  goalDefs: [],
  kcal: 2000,
  freqs: { legumbres: 3, verdura: 4, pescado: 2 },
  goalsByGroup: {},
  kcalByGroup: {},
  freqsByGroup: {},
  cookLevel: "normal",
  cookSkills: ["Pasta", "Horno"],
  kitchenTools: ["Horno", "Microondas"],
  customKitchenTools: [],
  timeWeekday: 35,
  timeWeekend: 60,
  hasBudget: false,
  budget: 80,
  supermarkets: [],
};

const vite = await createServer({
  root: join(__dirname, ".."),
  appType: "custom",
  logLevel: "silent",
  server: { middlewareMode: true, hmr: false, watch: null },
});
try {
  const load = (p) => vite.ssrLoadModule(p);
  const { groupsFromModel } = await load("/src/lib/groups.js");
  const { buildShoppingList } = await load("/src/lib/shoppingBuilder.js");
  const { getMeals } = await load("/src/lib/planner.js");
  const { catalogToFrontendRecipe } = await load("/src/lib/aiPlanner.js");
  const { recipeCatalogById } = await load("/src/data/recipeCatalog.js");
  const { registerRecipes } = await load("/src/data/recipes.js");
  const { DEMO_MENU_IDS, planDemo } = await load("/src/dev/demoMenu.js");

  // El id del grupo se conserva (conservarIds) para que regenerar no cambie el JSON sin motivo.
  const grupoAnterior = { id: GRUPO_DEMO_ID, label: "Familia", tipo: "familia", memberIds: data.members.map((m) => m.id) };
  const groups = groupsFromModel(data.members, data.menuModel, [grupoAnterior]);
  data.groups = groups;

  const eaters = data.members.length;
  const aiRecipes = DEMO_MENU_IDS.map((id) => {
    if (!recipeCatalogById[id]) throw new Error(`demoMenu.js: «${id}» no está en el catálogo`);
    return catalogToFrontendRecipe(recipeCatalogById[id], eaters);
  });
  // La lista de la compra se arma leyendo el registro vivo de recetas.
  registerRecipes(aiRecipes);

  const menuPlan = planDemo(groups[0].id, eaters);
  const sh = buildShoppingList(menuPlan, groups, getMeals(data));

  const demoState = {
    screen: "menu",
    onbStep: 6,
    data,
    menuPlan,
    shopping: { items: sh.byCategory.flatMap((c) => c.items) },
    aiRecipes,
  };

  const outDir = join(__dirname, "../src/dev");
  mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, "demoState.json");
  writeFileSync(outPath, JSON.stringify(demoState, null, 2), "utf8");
  console.log(`Wrote ${outPath} (${Object.keys(menuPlan[groups[0].id]).length} huecos, ${aiRecipes.length} recetas del catálogo, ${demoState.shopping.items.length} artículos de compra)`);
} finally {
  await vite.close();
}
