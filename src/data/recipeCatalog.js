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
    // ¿Recetario Estrella? Señal que usa filterRecipes.isPrimaryCatalog() en
    // vez de "¿tiene foto?" (ver recipeSchema.js). Mismo mapeo que faltaba en
    // apetecible/montaje hasta 0023 — sin él, undefined para toda receta
    // servida desde Supabase y el pool principal del generador se queda a 0
    // para cualquier grupo sin bebés. Ver 0025_recipe_estrella.sql.
    ...(row.estrella != null ? { estrella: row.estrella } : {}),
    // Plato de OCASIÓN (marisco de ración, arroces de bogavante, paellas):
    // la regla 3f de validateMenu.js lo saca de lunes a viernes. Mismo mapeo
    // que faltó en su día para apetecible/montaje/estrella/extraProteins — sin
    // esta línea el campo existe en el JSON, existe en el schema y se pierde
    // en el viaje para cualquier receta servida desde Supabase, que es lo que
    // producción sirve cuando catalog_meta.version alcanza a la del bundle.
    ...(row.occasion ? { occasion: row.occasion } : {}),
    // Mismo motivo que occasion/estrella: sin esta línea el campo existe en el
    // JSON y se pierde en el viaje para toda receta servida desde Supabase.
    ...(row.kid_favourite != null ? { kidFavourite: row.kid_favourite } : {}),
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

// Caché en localStorage del catálogo remoto ya validado, para no repetir el
// select("*") completo (~3.5MB) en cada recarga de página — solo se salta la
// red mientras la versión cacheada siga siendo >= BUNDLED_CATALOG_VERSION (si
// el bundle sube de versión, la caché queda obsoleta automáticamente) y no
// haya pasado CACHE_TTL_MS desde que se guardó.
const CATALOG_CACHE_KEY = "mp_recipe_catalog_cache_v1";
const CATALOG_CACHE_TTL_MS = 30 * 60 * 1000;

function readCatalogCache() {
  try {
    const raw = localStorage.getItem(CATALOG_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed.version !== "number" || !Array.isArray(parsed.recipes)) return null;
    if (typeof parsed.cachedAt !== "number" || Date.now() - parsed.cachedAt > CATALOG_CACHE_TTL_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeCatalogCache(version, recipes) {
  try {
    localStorage.setItem(CATALOG_CACHE_KEY, JSON.stringify({ version, recipes, cachedAt: Date.now() }));
  } catch {
    // Cuota de localStorage llena o no disponible — la caché es una pura
    // optimización, seguir sin ella no cambia el comportamiento.
  }
}

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`timeout after ${ms}ms`)), ms)),
  ]);
}

// Cuánto tarda en volver a preguntarse "¿hay catálogo nuevo?" cuando la
// respuesta ha sido que no. La consulta en sí son ~100 bytes, pero es una ida
// y vuelta en el arranque de CADA carga, y la respuesta solo cambia cuando
// alguien sube una seed nueva a mano.
const NO_UPDATE_KEY = "mp_recipe_catalog_uptodate_v1";
const NO_UPDATE_TTL_MS = 6 * 60 * 60 * 1000;

function remoteKnownUpToDate() {
  try {
    const raw = localStorage.getItem(NO_UPDATE_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw);
    // Atado a la versión del bundle: en cuanto se despliega un bundle nuevo,
    // la nota deja de valer y se vuelve a preguntar.
    if (parsed?.bundled !== BUNDLED_CATALOG_VERSION) return false;
    return Date.now() - (parsed.at ?? 0) <= NO_UPDATE_TTL_MS;
  } catch {
    return false;
  }
}

function markRemoteUpToDate() {
  try {
    localStorage.setItem(NO_UPDATE_KEY, JSON.stringify({ bundled: BUNDLED_CATALOG_VERSION, at: Date.now() }));
  } catch {
    // Cuota llena o modo privado: solo significa volver a preguntar.
  }
}

// Reads the remote catalog version from catalog_meta. Any problem (table not
// created yet, no row, network/permission error) resolves to 0 so the version
// gate below treats the DB as "behind" and keeps the bundled JSON — the safe
// default. Never throws.
async function loadRemoteCatalogVersion() {
  try {
    const { data, error } = await withTimeout(
      supabase.from("catalog_meta").select("version").eq("id", "recipes")
        .abortSignal(AbortSignal.timeout(SUPABASE_FETCH_TIMEOUT_MS))
        .maybeSingle(),
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

  // Empate = mismo contenido. La versión sube cuando cambia el JSON y la seed
  // la iguala, así que con v20 en los dos lados bajarse el catálogo entero es
  // pagar ~1,1 MB por recibir exactamente lo que ya viene en el bundle. Solo
  // hay algo que traerse cuando la nube va POR DELANTE, que es el caso real
  // del "editar recetas en Supabase sin redesplegar".
  if (remoteKnownUpToDate()) return JSON_RECIPES;

  const cached = readCatalogCache();
  if (cached && cached.version > BUNDLED_CATALOG_VERSION) {
    return cached.recipes;
  }

  try {
    // La VERSIÓN primero, y el catálogo solo si hace falta.
    //
    // Antes las dos peticiones salían en paralelo (Promise.all), así que el
    // catálogo entero se descargaba SIEMPRE y se tiraba a la basura cuando la
    // puerta de versión no dejaba usarlo — y ese camino además no cacheaba
    // nada, o sea que volvía a bajárselo entero en la siguiente carga. Con el
    // bundle por delante de la nube (que es lo normal justo después de un
    // despliegue) eran megas por recarga, por usuario, para nada. La ida y
    // vuelta de más que cuesta preguntar antes son ~100 bytes.
    const remoteVersion = await loadRemoteCatalogVersion();

    if (remoteVersion <= BUNDLED_CATALOG_VERSION) {
      if (remoteVersion < BUNDLED_CATALOG_VERSION) {
        console.warn(
          `[recipeCatalog] Catálogo de Supabase v${remoteVersion} por detrás del incluido ` +
            `v${BUNDLED_CATALOG_VERSION}; usando el catálogo local para no degradar datos.`,
        );
      }
      markRemoteUpToDate();
      return JSON_RECIPES;
    }

    // Con AbortSignal, no solo con la carrera del timeout: withTimeout deja de
    // ESPERAR a los 3 s, pero sin abortar la petición los megas siguen
    // bajando igual. Una conexión lenta pagaba el catálogo entero Y encima se
    // quedaba con el JSON local — lo peor de los dos mundos.
    const result = await withTimeout(
      supabase.from("recipes").select("*").abortSignal(AbortSignal.timeout(SUPABASE_FETCH_TIMEOUT_MS)),
      SUPABASE_FETCH_TIMEOUT_MS,
    );

    const { data, error } = result;
    if (error) throw error;
    if (!data || data.length === 0) throw new Error("empty result");

    const remoteRecipes = data.map(rowToRecipe);
    const remoteGuarniciones = remoteRecipes.filter((r) => r.type === "guarnicion");
    const remoteSalsas = remoteRecipes.filter((r) => r.type === "salsa");
    const errors = validateCatalog(remoteRecipes, [remoteGuarniciones, remoteSalsas]);
    if (errors.length > 0) throw new Error(`invalid data:\n${errors.join("\n")}`);

    writeCatalogCache(remoteVersion, remoteRecipes);
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
