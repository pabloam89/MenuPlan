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
import bases from "./recipes/bases.json";
import { validateRecipes } from "./recipeSchema.js";
import { deriveHealthFlags } from "../lib/healthFlags.js";
import { supabase } from "../lib/supabase.js";
import { BUNDLED_CATALOG_VERSION } from "./catalogVersion.js";
import { rowToRecipe } from "./recipeRow.js";
import recipeNutrition from "./derived/recipeNutrition.json";
import { NUTRIENTES, CAMPOS_SECUNDARIOS } from "./nutrientes.js";

// Attach heuristic health flags once, so filterRecipes/decisionCatalog get them
// for free regardless of whether the recipe came from JSON or Supabase.
function withHealthFlags(recipes) {
  return recipes.map((r) => ({ ...r, healthFlags: deriveHealthFlags(r) }));
}

/**
 * Los MICRONUTRIENTES, desde la tabla derivada a la receta.
 *
 * QUÉ PROBLEMA RESUELVE. El catálogo de ingredientes tiene 32 nutrientes con
 * procedencia por fila, y `derived/recipeNutrition.json` los suma por receta
 * desde hace tiempo. No los leía NADIE: la receta lleva ocho macros escritos a
 * mano y la app enseña esos, así que hierro, calcio y las trece vitaminas
 * morían en un fichero. `deriveHealthFlags` ya sabe leer `macros.iron_mg` para
 * decidir «rico en hierro» con el dato en vez de con una lista de quince
 * palabras, y ese lector nunca llegaba a dispararse.
 *
 * TRES REGLAS, Y LAS TRES SON DELIBERADAS.
 *
 * 1. SOLO LOS MICROS. Los ocho declarados —kcal, proteína, hidratos, grasa,
 *    fibra, azúcar, grasa saturada, sodio— NO se tocan, aunque sepamos que el
 *    calculado es mejor (ver el veredicto en el commit de las fracciones
 *    comestibles: el declarado se comprime de 1,03 a 0,64 según el tamaño del
 *    plato). Cambiar lo que el usuario lee es una decisión de producto y esta
 *    no lo es: los micros no tienen valor declarado con el que competir, así
 *    que no hay conflicto que resolver.
 *
 * 2. CADA UNO VIAJA CON SU COBERTURA. Un hierro sostenido por el 30 % del
 *    plato no es un hierro, y quien lo pinte tiene derecho a saberlo. Va en
 *    `micronutrientesCobertura`, con la misma forma.
 *
 * 3. LO QUE LA RECETA YA TRAE, MANDA. Una receta de Supabase o del usuario con
 *    su propio hierro no se pisa. Y una receta que no está en la tabla
 *    derivada —las de usuario no lo están— simplemente no gana campos, que es
 *    lo correcto: el hueco se ve.
 */
const MICRONUTRIENTES = CAMPOS_SECUNDARIOS.filter(
  (c) => !["fiber100g", "sugar100g", "saturatedFat100g", "sodium100g"].includes(c),
).map((c) => NUTRIENTES[c].porRacion);

function withMicronutrientes(recipes) {
  return recipes.map((r) => {
    const n = recipeNutrition[r.id];
    if (!n) return r;
    const extra = {};
    const cobertura = {};
    for (const campo of MICRONUTRIENTES) {
      if (r[campo] != null) continue;
      if (n[campo] == null) continue;
      extra[campo] = n[campo];
      cobertura[campo] = n.coberturaPorCampo?.[campo] ?? 0;
    }
    if (!Object.keys(extra).length) return r;
    return { ...r, ...extra, micronutrientesCobertura: cobertura };
  });
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

// guarniciones.json, salsas.json y bases.json viven fuera del catálogo de
// comida/cena (nunca ocupan un hueco de menú por sí mismos — ver MEAL_ROLES
// "guarnicion"/"salsa"/"base" en recipeSchema.js), así que se validan junto a
// `recipes` pero no se mezclan con él. Cada consumidor que los necesita importa
// el JSON directamente (pairGarnishes.js, bases.js, Menu.jsx, etc).
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

// El JSON bundleado se valida SOLO en desarrollo y en los tests.
//
// Antes corría sin condición, y eso son ~210 ms de hilo principal bloqueado
// —medido sobre las 1011 recetas— antes del primer pixel, EN CADA CARGA DE
// PÁGINA, para revalidar un fichero que no puede haber cambiado desde que se
// construyó la app.
//
// Por qué es seguro quitarlo de producción, que era la duda razonable del
// comentario anterior ("debe fallar ruidosamente pase lo que pase"):
// `scripts/validate-catalog.mjs` corre en `prebuild` Y en `pretest`
// (package.json), así que un catálogo inválido no llega a haber build. El JSON
// va empaquetado dentro del bundle: entre el build y el runtime no hay nadie
// que pueda tocarlo. Esta comprobación era un tirante sobre unos tirantes.
//
// Lo que NO se toca es la validación del catálogo REMOTO (más abajo, en
// loadRecipes): esos datos llegan por red, son los únicos que pueden venir
// corruptos o de una versión que este código no conoce, y ahí la validación es
// la puerta que impide servirlos.
//
// `import.meta.env.DEV` es `true` bajo vitest, así que las pruebas siguen
// validando el catálogo entero igual que antes.
if (import.meta.env.DEV) {
  const jsonErrors = validateCatalog(JSON_RECIPES, [guarniciones, salsas, bases]);
  if (jsonErrors.length > 0) {
    throw new Error(
      `Catálogo de recetas inválido (${jsonErrors.length} error/es):\n` +
        jsonErrors.map((e) => `  - ${e}`).join("\n"),
    );
  }
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

// El orden importa: los micros ANTES de las banderas, porque
// `deriveHealthFlags` lee `iron_mg` para decidir «rico en hierro».
export const recipeCatalog = withHealthFlags(withMicronutrientes(await loadRecipes()));

export const recipeCatalogById = Object.fromEntries(
  recipeCatalog.map((r) => [r.id, r]),
);
