import legumbres from "./recipes/legumbres.json";
import carnes from "./recipes/carnes.json";
import pescados from "./recipes/pescados.json";
import huevos from "./recipes/huevos.json";
import pastaArroces from "./recipes/pasta_arroces.json";
import sopasCremas from "./recipes/sopas_cremas.json";
import ensaladasVerduras from "./recipes/ensaladas_verduras.json";
import platosUnicos from "./recipes/platos_unicos.json";
import cenasRapidas from "./recipes/cenas_rapidas.json";
import bebes from "./recipes/bebes.json";
import guarniciones from "./recipes/guarniciones.json";
import { validateRecipes } from "./recipeSchema.js";
import { supabase } from "../lib/supabase.js";

const JSON_RECIPES = [
  ...legumbres,
  ...carnes,
  ...pescados,
  ...huevos,
  ...pastaArroces,
  ...sopasCremas,
  ...ensaladasVerduras,
  ...platosUnicos,
  ...cenasRapidas,
  ...bebes,
];

function validateCatalog(recipes, guarnicionesData) {
  const seen = new Set();
  const errors = [];
  for (const r of recipes) {
    if (seen.has(r.id)) errors.push(`Duplicate recipe id: ${r.id}`);
    seen.add(r.id);
  }
  errors.push(...validateRecipes([...recipes, ...guarnicionesData]));
  for (const r of recipes) {
    if (r.baseDishId && !seen.has(r.baseDishId)) {
      errors.push(`[${r.id}] baseDishId "${r.baseDishId}" no existe en el catálogo`);
    }
  }
  return errors;
}

// JSON is validated unconditionally at import time — it's bundled with the
// app, so a broken JSON catalog must fail loudly regardless of whether
// Supabase is reachable.
const jsonErrors = validateCatalog(JSON_RECIPES, guarniciones);
if (jsonErrors.length > 0) {
  throw new Error(
    `Catálogo de recetas inválido (${jsonErrors.length} error/es):\n` +
      jsonErrors.map((e) => `  - ${e}`).join("\n"),
  );
}

// Supabase stores columns as snake_case (see supabase/migrations/0001_recipe_catalog.sql);
// map back to the exact camelCase shape recipeSchema.js and every consumer
// (aiPlanner.js, filterRecipes.js, etc.) already expects, so nothing downstream
// needs to know whether a recipe came from Supabase or the bundled JSON.
function rowToRecipe(row) {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    mainProtein: row.main_protein,
    ...(row.main_base ? { mainBase: row.main_base } : {}),
    mealRole: row.meal_roles,
    type: row.type,
    ...(row.base_dish_id ? { baseDishId: row.base_dish_id } : {}),
    ...(row.required_appliance ? { requiredAppliance: row.required_appliance } : {}),
    time: row.time_minutes,
    difficulty: row.difficulty,
    season: row.season,
    kcal: Number(row.kcal),
    protein_g: Number(row.protein_g),
    carbs_g: Number(row.carbs_g),
    fat_g: Number(row.fat_g),
    baseServings: row.base_servings,
    kidFriendly: row.kid_friendly,
    tupperFriendly: row.tupper_friendly,
    allergens: row.allergens ?? [],
    ingredients: row.ingredients,
    steps: row.steps,
    description: row.description,
    ...(row.methods ? { methods: row.methods } : {}),
  };
}

const SUPABASE_FETCH_TIMEOUT_MS = 3000;

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`timeout after ${ms}ms`)), ms)),
  ]);
}

// Best-effort: try Supabase first so the catalog can be edited without a
// redeploy; fall back to the bundled JSON (already validated above) on any
// failure — missing config, network error, timeout, or invalid remote data.
// Never throws: menu generation must keep working even if Supabase is down.
async function loadRecipes() {
  if (!supabase) return JSON_RECIPES;
  try {
    const { data, error } = await withTimeout(
      supabase.from("recipes").select("*"),
      SUPABASE_FETCH_TIMEOUT_MS,
    );
    if (error) throw error;
    if (!data || data.length === 0) throw new Error("empty result");

    const remoteRecipes = data.map(rowToRecipe);
    const remoteGuarniciones = remoteRecipes.filter((r) => r.type === "guarnicion");
    const errors = validateCatalog(remoteRecipes, remoteGuarniciones);
    if (errors.length > 0) throw new Error(`invalid data:\n${errors.join("\n")}`);

    return remoteRecipes;
  } catch (e) {
    console.warn(
      `[recipeCatalog] No se pudo leer el catálogo de Supabase (${e.message}); usando el catálogo local.`,
    );
    return JSON_RECIPES;
  }
}

export const recipeCatalog = await loadRecipes();

export const recipeCatalogById = Object.fromEntries(
  recipeCatalog.map((r) => [r.id, r]),
);
