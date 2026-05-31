/**
 * Generates src/dev/demoState.json — sample household + weekly menu for local dev.
 * Run: node scripts/gen-demo-state.mjs
 */
import { writeFileSync, mkdirSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { generateMenu, getMeals } from "../src/lib/planner.js";
import { groupsFromModel } from "../src/lib/groups.js";
import { buildShoppingList } from "../src/lib/shoppingBuilder.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

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
      homeRole: "Adulto",
    },
    {
      id: "m-ana",
      name: "Ana",
      age: 33,
      allergies: [],
      dislikes: ["Coliflor"],
      useBirthDate: false,
      birthDate: "",
      homeRole: "Adulto",
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

const groups = groupsFromModel(data.members, data.menuModel);
data.groups = groups;

const menuPlan = generateMenu({ ...data, groups });
const sh = buildShoppingList(menuPlan, groups, getMeals(data));

const demoState = {
  screen: "menu",
  onbStep: 6,
  data,
  menuPlan,
  shopping: { items: sh.byCategory.flatMap((c) => c.items) },
  aiRecipes: [],
};

const outDir = join(__dirname, "../src/dev");
mkdirSync(outDir, { recursive: true });
const outPath = join(outDir, "demoState.json");
writeFileSync(outPath, JSON.stringify(demoState, null, 2), "utf8");
console.log(`Wrote ${outPath} (${Object.keys(menuPlan).length - 1} groups, menu ready)`);
