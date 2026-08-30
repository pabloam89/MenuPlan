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
import desayunos from "./recipes/desayunos.json";
import meriendas from "./recipes/meriendas.json";
import postres from "./recipes/postres.json";
import guarniciones from "./recipes/guarniciones.json";
import salsas from "./recipes/salsas.json";
import { validateRecipes } from "./recipeSchema.js";
import { deriveHealthFlags } from "../lib/healthFlags.js";
import { supabase } from "../lib/supabase.js";
import { BUNDLED_CATALOG_VERSION } from "./catalogVersion.js";

// Attach heuristic health flags once, so filterRecipes/decisionCatalog get them
// for free regardless of whether the recipe came from JSON or Supabase.
function withHealthFlags(recipes) {
  return recipes.map((r) => ({ ...r, healthFlags: deriveHealthFlags(r) }));
}

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
  ...desayunos,
  ...meriendas,
  ...postres,
];

// guarniciones.json and salsas.json each live outside the main comida/cena
// catalog (never occupy a menu slot themselves — see MEAL_ROLES "guarnicion"/
// "salsa" in recipeSchema.js), so they're validated alongside `recipes` but
// not folded into it. Every consumer that needs them imports the JSON file
// directly (pairGarnishes.js, Menu.jsx, etc).
function validateCatalog(recipes, sideCatalogs) {
  const seen = new Set();
  const errors = [];
  for (const r of recipes) {
    if (seen.has(r.id)) errors.push(`Duplicate recipe id: ${r.id}`);
    seen.add(r.id);
  }
  errors.push(...validateRecipes([...recipes, ...sideCatalogs.flat()]));
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
const jsonErrors = validateCatalog(JSON_RECIPES, [guarniciones, salsas]);
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
    // Ejes separados (migración 0023_recipe_axes.sql). Los booleanos se
    // distinguen de "la columna no existe todavía" igual que freezable: un
    // `montaje: false` es un juicio ya tomado y debe sobrevivir el viaje.
    ...(row.montaje != null ? { montaje: row.montaje } : {}),
    ...(row.apetecible != null ? { apetecible: row.apetecible } : {}),
    ...(row.can_be_garnish != null ? { canBeGarnish: row.can_be_garnish } : {}),
    ...(row.main_ingredients?.length ? { mainIngredients: row.main_ingredients } : {}),
    // Proteínas animales secundarias (jamón en una ensalada, atún en un
    // huevo…) — la regla de "no repetir proteína el mismo día" en
    // validateMenu.js depende de verlas. Se quedó fuera de este mapeo hasta
    // ahora (2026-08-30): la columna existía en el schema/JSON local pero
    // nunca en Supabase ni aquí, así que se perdía en silencio para toda
    // receta servida desde la nube. Ver 0024_recipe_extra_fields.sql.
    ...(row.extra_proteins?.length ? { extraProteins: row.extra_proteins } : {}),
    ...(row.sauce_id ? { sauceId: row.sauce_id } : {}),
    ...(row.sauce_compat?.length ? { sauceCompat: row.sauce_compat } : {}),
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
    ...(row.steps_rich ? { stepsRich: row.steps_rich } : {}),
    // Congelador: freezable puede ser false a propósito (un juicio ya tomado),
    // así que se distingue de "la columna no existe" en una BD sin migrar.
    ...(row.freezable != null ? { freezable: row.freezable } : {}),
    ...(row.thaw_steps ? { thawSteps: row.thaw_steps } : {}),
    description: row.description,
    ...(row.methods ? { methods: row.methods } : {}),
    ...(row.product_aliases?.length ? { productAliases: row.product_aliases } : {}),
    ...(row.effort ? { effort: row.effort } : {}),
    ...(row.dessert_kind ? { dessertKind: row.dessert_kind } : {}),
  };
}

const SUPABASE_FETCH_TIMEOUT_MS = 3000;

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`timeout after ${ms}ms`)), ms)),
  ]);
}

// Reads the remote catalog version from catalog_meta. Any problem (table not
// created yet, no row, network/permission error) resolves to 0 so the version
// gate below treats the DB as "behind" and keeps the bundled JSON — the safe
// default. Never throws.
async function loadRemoteCatalogVersion() {
  try {
    const { data, error } = await withTimeout(
      supabase.from("catalog_meta").select("version").eq("id", "recipes").maybeSingle(),
      SUPABASE_FETCH_TIMEOUT_MS,
    );
    if (error) throw error;
    return Number(data?.version ?? 0) || 0;
  } catch {
    return 0;
  }
}

// Catalog loading strategy — Supabase is authoritative, but GATED on version.
//
// Editing recipes in Supabase (no redeploy) stays possible, but a database
// that's BEHIND the bundled JSON (e.g. an old seed missing an allergen fix)
// can no longer silently override the reviewed catalog: if
// catalog_meta.version < BUNDLED_CATALOG_VERSION, or the remote data is
// missing/invalid/unreachable, we fall back to the bundled JSON (already
// validated above). Never throws: menu generation must keep working.
async function loadRecipes() {
  if (!supabase) return JSON_RECIPES;
  try {
    const [remoteVersion, result] = await Promise.all([
      loadRemoteCatalogVersion(),
      withTimeout(supabase.from("recipes").select("*"), SUPABASE_FETCH_TIMEOUT_MS),
    ]);

    if (remoteVersion < BUNDLED_CATALOG_VERSION) {
      console.warn(
        `[recipeCatalog] Catálogo de Supabase v${remoteVersion} por detrás del incluido ` +
          `v${BUNDLED_CATALOG_VERSION}; usando el catálogo local para no degradar datos.`,
      );
      return JSON_RECIPES;
    }

    const { data, error } = result;
    if (error) throw error;
    if (!data || data.length === 0) throw new Error("empty result");

    const remoteRecipes = data.map(rowToRecipe);
    const remoteGuarniciones = remoteRecipes.filter((r) => r.type === "guarnicion");
    const remoteSalsas = remoteRecipes.filter((r) => r.type === "salsa");
    const errors = validateCatalog(remoteRecipes, [remoteGuarniciones, remoteSalsas]);
    if (errors.length > 0) throw new Error(`invalid data:\n${errors.join("\n")}`);

    return remoteRecipes;
  } catch (e) {
    console.warn(
      `[recipeCatalog] No se pudo leer el catálogo de Supabase (${e.message}); usando el catálogo local.`,
    );
    return JSON_RECIPES;
  }
}

export const recipeCatalog = withHealthFlags(await loadRecipes());

export const recipeCatalogById = Object.fromEntries(
  recipeCatalog.map((r) => [r.id, r]),
);
