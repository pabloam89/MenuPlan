import legumbres from "./recipes/legumbres.json" with { type: "json" };
import carnes from "./recipes/carnes.json" with { type: "json" };
import pescados from "./recipes/pescados.json" with { type: "json" };
import huevos from "./recipes/huevos.json" with { type: "json" };
import pastaArroces from "./recipes/pasta_arroces.json" with { type: "json" };
import sopasCremas from "./recipes/sopas_cremas.json" with { type: "json" };
import ensaladasVerduras from "./recipes/ensaladas_verduras.json" with { type: "json" };
import platosUnicos from "./recipes/platos_unicos.json" with { type: "json" };
import cenasRapidas from "./recipes/cenas_rapidas.json" with { type: "json" };
import bebes from "./recipes/bebes.json" with { type: "json" };
import desayunos from "./recipes/desayunos.json" with { type: "json" };
import meriendas from "./recipes/meriendas.json" with { type: "json" };
import postres from "./recipes/postres.json" with { type: "json" };
import guarniciones from "./recipes/guarniciones.json" with { type: "json" };
import salsas from "./recipes/salsas.json" with { type: "json" };
import bases from "./recipes/bases.json" with { type: "json" };
import { validateRecipes } from "./recipeSchema.js";
import { deriveHealthFlags } from "../lib/healthFlags.js";
import { conNivelCalorias } from "../lib/caloriasNivel.js";
import recipeNutrition from "./derived/recipeNutrition.json" with { type: "json" };
import recipeFamilias from "./derived/recipeFamilias.json" with { type: "json" };
import { costeReceta } from "../lib/coste.js";
import { computeRecipeNutrition, deriveRecipeAllergens } from "../lib/ingredients.js";
import { NUTRIENTES, CAMPOS_SECUNDARIOS } from "./nutrientes.js";

// Attach heuristic health flags once, so filterRecipes/decisionCatalog get them
// for free.
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

/**
 * LA TABLA ES UNA CACHÉ, NO LA ÚNICA FUENTE, y hasta hoy se comportaba como
 * si lo fuera.
 *
 * `recipeNutrition.json` se calcula en build sobre el catálogo DEL BUILD, y
 * está indexado por id. Pero el catálogo puede venir de la nube: cuando la
 * versión remota supera a la del bundle, `loadCatalog` se baja `recipes`
 * entera de Supabase y usa ESA. Una receta que no existía cuando se generó el
 * artefacto no tiene fila — y se quedaba sin los 24 micros, sin su cobertura
 * y sin la corrección por cocción. Sin error: simplemente no los tenía.
 *
 * Es el fallo que la doctrina de `ejesDePlato.js` ya nombra —«un campo
 * derivado que se materializa es un campo que se desincroniza de su
 * operador»— y llegó por un salto que nadie decidió: `build-derived.mjs` dice
 * que materializa «para que la auditoría y el análisis no tengan que
 * recalcularlo, y sobre todo para que se vea», o sea para MIRARLO, y luego
 * esto empezó a leerlo para SERVIR.
 *
 * El arreglo es el `??`: la tabla cuando está, que es el caso normal y es
 * gratis, y el operador al vuelo para las pocas que no conoce. No recalcula
 * 1.033 recetas al arrancar — solo las que la nube haya traído de más.
 *
 * `servings` es `baseServings || 4` porque es exactamente lo que usa
 * `build-derived.mjs`: con otro divisor los números de las recetas nuevas no
 * serían comparables con los de las viejas.
 *
 * Y no hace falta marcar la procedencia con un `nutritionSource` como hace
 * `userRecipes.js`: allí distingue el cálculo de lo que estimó un modelo, que
 * son dos calidades distintas. Aquí las dos ramas son el MISMO operador sobre
 * los mismos datos, así que el dato es idéntico y no hay nada que advertir.
 */
const nutricionDe = (r) => recipeNutrition[r.id] ?? computeRecipeNutrition(r, r.baseServings || 4);

// Exportada para poder probar la rama que NO se da en el bundle: una receta
// que llega de la nube y no está en la tabla derivada. Mismo motivo por el que
// `rowToRecipe` vive en su propio fichero — la costura que más silenciosamente
// se rompe necesita poder probarse.
/**
 * Las familias (las claves de `freqs`) que consume cada plato, y con qué
 * cuota de masa. Vienen de `derived/recipeFamilias.json`, no se calculan
 * aquí: el cálculo recorre los ingredientes de la receta entera y el panel
 * las pregunta en cada pintada.
 *
 * Una receta sin fila —una de usuario, una recién llegada de Supabase— se
 * queda sin el campo, y quien lo lea tiene que saber caer a la regla vieja.
 */
/**
 * Coste por ración con precios de Mercadona (derived/recipeCoste.json, que
 * regenera `npm run build:coste` y cada `sync:mercadona`). `costeNivel`
 * solo si la cobertura de precios llega: si no, la receta se queda sin él.
 */
/**
 * «Puede contener» de cada receta (ids UE), heredado de los ingredientes
 * elaborados. Lo leen filterRecipes (excluye si choca con una alergia) y quien
 * pinte la receta (avisa). Se calcula al cargar: no se guarda en el JSON, así
 * que cambiar una ficha de ingrediente lo cambia en todas sus recetas.
 */
export function withPuedeContener(recipes) {
  return recipes.map((r) => {
    const lista = deriveRecipeAllergens(r).mayContain;
    return lista.length ? { ...r, puedeContener: lista } : r;
  });
}

export function withCoste(recipes) {
  // Modo 'granel' (lib/coste.js): el € por ración que se planifica. Lo leen el
  // planner (puente de aiPlanner) y el bot («algo barato»: costeNivel).
  return recipes.map((r) => {
    const c = costeReceta(r, { modo: "granel" });
    return c ? { ...r, costeRacion: c.porRacion, costeNivel: c.nivel } : r;
  });
}

export function withFamilias(recipes) {
  return recipes.map((r) => {
    const f = recipeFamilias[r.id];
    return f ? { ...r, familias: f.familias, familiaCuotas: f.cuotas } : r;
  });
}

export function withMicronutrientes(recipes) {
  return recipes.map((r) => {
    const n = nutricionDe(r);
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


// UNA sola fuente: el catálogo que viaja en el bundle (src/data/recipes).
//
// Hasta el 30 sep 2026 la app preguntaba antes a Supabase (catalog_meta) y,
// si su versión iba por delante, se bajaba de ahí el catálogo entero. La copia
// de Supabase se quedó en la v27 mientras el bundle seguía (v39: alérgenos
// «puede contener», atributos, coste), y nadie la mantenía: era una puerta
// para que subir un número en la base cambiara las recetas de todos sin
// desplegar y sin pruebas. Ahora las recetas cambian con un commit, pasan las
// pruebas y se despliegan; las tablas de Supabase siguen ahí (migración
// 0064), sin lectores.
//
// Lo que guardaba el cargador antiguo en el navegador (hasta ~3,5 MB) se
// borra al pasar, para no ocupar sitio a nadie.
try {
  localStorage.removeItem("mp_recipe_catalog_cache_v1");
  localStorage.removeItem("mp_recipe_catalog_uptodate_v1");
} catch {
  // Sin almacenamiento (modo privado, pruebas): nada que borrar.
}

// El orden importa: los micros ANTES de las banderas, porque
// `deriveHealthFlags` lee `iron_mg` para decidir «rico en hierro».
// `caloriasNivel` (ligero/medio/contundente) sale de kcal y del papel del
// plato: ver lib/caloriasNivel.js.
export const recipeCatalog = withPuedeContener(withCoste(conNivelCalorias(withFamilias(withHealthFlags(withMicronutrientes(JSON_RECIPES))))));

export const recipeCatalogById = Object.fromEntries(
  recipeCatalog.map((r) => [r.id, r]),
);
