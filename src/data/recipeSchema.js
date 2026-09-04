import { z } from "zod";

import { STEP_KINDS, STEP_PARTS } from "../lib/recipeSteps.js";

// Canonical taxonomy for the recipe catalog. Adding a new category/protein/etc
// requires updating this file — that's the point: it forces a conscious
// decision instead of silently accepting a typo'd value.

const CATEGORIES = [
  "bebes", "carnes", "cenas_rapidas", "ensaladas_verduras", "guarniciones",
  "huevos", "legumbres", "pasta_arroces", "pescados", "platos_unicos",
  "sopas_cremas",
  // Off-menu categories: not part of comida/cena generation (isolated in
  // utils/filterRecipes.js, like "bebes"). They power the optional
  // desayuno/merienda/postre pool that unlocks fruit/yogur/kéfir/pan ingredients.
  "desayunos", "meriendas", "postres",
  // "salsas" es igual de off-menu: nunca ocupa un slot de comida/cena por sí
  // misma (mealRole "salsa", ver MEAL_ROLES), vive en su propio catálogo
  // (data/recipes/salsas.json, mismo patrón que guarniciones.json) y se
  // engancha a un plato principal vía `sauceId`/emparejamiento por `sauceCompat`.
  "salsas",
];

// "cenas_rapidas" y "platos_unicos" están DEPRECADAS como categoría: mezclaban
// un eje distinto (esfuerzo/estructura) con el de ingrediente, y "plato único"
// ya lo captura mealRole. Se sustituyen por el flag `montaje` y por mealRole
// respectivamente — ver isMontaje() abajo.
//
// NO se eliminan del enum, ni aquí ni en Postgres: `recipe_category` es un enum
// nativo compartido por `recipes` y `user_recipes` (supabase/migrations/
// 0001_recipe_catalog.sql), quitar un valor obliga a reconstruir el tipo y hay
// filas de usuarios reales que ya lo usan (el checkbox "cena rápida" de
// RecipeClassificationFields.jsx las escribía). Se dejan de usar en recetas
// nuevas; las existentes siguen validando y funcionando.
const DEPRECATED_CATEGORIES = ["cenas_rapidas", "platos_unicos"];

const MAIN_PROTEINS = [
  "cerdo", "huevo", "legumbre", "marisco", "none", "pavo",
  "pescado_azul", "pescado_blanco", "pollo", "ternera",
];

// Eje de composición NO proteica y NO feculenta: cubre lo que hoy no se captura
// en ningún sitio. Deliberadamente sin solape semántico con MAIN_PROTEINS
// (proteína dominante) ni con `mainBase` (base de carbohidrato: arroz/pasta/
// patatas/quinoa/cuscus/pan/avena) — un valor que ya vive en uno de esos dos
// ejes no se repite aquí, para que "legumbre" o "arroz" signifiquen siempre lo
// mismo y en un solo campo. Es informativo/filtrable: NINGUNA regla de
// no-repetición depende de él (esas siguen siendo mainProtein + mainBase).
const MAIN_INGREDIENTS = [
  "verdura", "lacteo", "seta", "fruta", "frutos_secos", "encurtido",
];

// Con qué tipo de plato principal encaja una salsa. Curado a mano, no
// derivado — es gusto, no matemática (ver Contexto en model/recipe-data-
// model-refactor.md §4). Deliberadamente más grueso que MAIN_PROTEINS: no
// necesita distinguir pollo de pavo, solo "carne blanca" de "carne roja".
const SAUCE_COMPAT_TAGS = [
  "carne_roja", "carne_blanca", "pescado_blanco", "pescado_azul", "marisco",
  "huevos", "verduras", "ensaladas", "arroz_blanco",
];

const TYPES = ["completo", "principal", "guarnicion", "salsa"];

const MEAL_ROLES = [
  "cena", "guarnicion", "plato_unico", "primero", "segundo",
  // Off-menu roles for the optional light pool (see CATEGORIES note).
  "desayuno", "merienda", "postre",
  // Igual que "guarnicion": una salsa nunca es el hueco de un menú por sí
  // misma, solo marca su propio catálogo (ver TYPES/CATEGORIES "salsa"/"salsas").
  "salsa",
];

const DIFFICULTIES = ["elaborada", "facil", "normal"];

const SEASONS = ["all", "invierno", "verano"];

// The 14 UE allergens. The first 8 are the historical catalog vocabulary
// (marisco = crustáceos, huevo = huevos, lactosa = leche, frutos_secos =
// frutos de cáscara); the last 6 close the gap so future catalog/remote
// recipes can declare them (see lib/allergens.js for the ingredient net that
// backfills them on the existing 244 recipes).
const ALLERGENS = [
  "frutos_secos", "gluten", "huevo", "lactosa", "marisco", "moluscos",
  "pescado", "sesamo",
  "cacahuetes", "soja", "apio", "mostaza", "sulfitos", "altramuces",
];

const UNITS = ["g", "ml", "ud"];

// Coarse dietary signals for the "menú más cuidado" profiles. Optional and
// usually derived at load time (lib/healthFlags.js), but a recipe may declare
// them explicitly too.
const HEALTH_FLAGS = [
  "frito", "embutido", "alto_sodio", "picante", "acido",
  "azucar_anadido", "rico_hierro",
];

const IngredientSchema = z.object({
  name: z.string().min(1),
  amount: z.number().nonnegative(),
  unit: z.enum(UNITS),
});

const MethodSchema = z.object({
  appliance: z.string().min(1),
  time: z.number().positive(),
  difficulty: z.enum(DIFFICULTIES),
  prepSummary: z.string().min(1),
});

// Structured version of a step. Optional and parallel to the plain `steps`
// (which stays the source of truth / fallback): a step carries an approximate
// time and a kind so the detail can render a stepper with a time badge and a
// type tag. `text` still holds the full instruction, markers included.
// Exported because user-created recipes (lib/userRecipes.js) reuse it.
export const StepRichSchema = z.object({
  text: z.string().min(1),
  minutes: z.number().nonnegative().optional(),
  kind: z.enum(STEP_KINDS).optional(),
  // Índice 0-based del paso al que va en paralelo (solo kind === "paralelo").
  during: z.number().int().nonnegative().optional(),
  // Eje ORTOGONAL a `kind` (que es de tiempo/atención): qué componente del
  // plato trabaja el paso, para poder cocinar cada parte por separado cuando
  // una sola receta ya incluye varias (p. ej. arroz + su salsa). Opcional:
  // la mayoría de recetas de una sola técnica no lo llevan.
  part: z.enum(STEP_PARTS).optional(),
});

export const RecipeSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    category: z.enum(CATEGORIES),
    mainProtein: z.enum(MAIN_PROTEINS),
    // Secondary animal proteins present in a dish whose mainProtein stays a
    // non-animal base for frequency/cena purposes — e.g. "Cocido madrileño"
    // keeps mainProtein "legumbre" (so it still counts as a legume serving and
    // is blocked from cena) but also carries ternera/cerdo/pollo, which the
    // same-day protein-variety rules must see (validateMenu.js proteinGroupsOf).
    extraProteins: z.array(z.enum(MAIN_PROTEINS)).optional(),
    mainBase: z.string().optional(),
    // Composición no proteica/no feculenta — ver MAIN_INGREDIENTS. Aditivo:
    // no sustituye a mainProtein ni a mainBase, que siguen siendo el motor de
    // las reglas de variedad en utils/validateMenu.js.
    mainIngredients: z.array(z.enum(MAIN_INGREDIENTS)).optional(),
    // ¿Entra por los ojos? Eje de CURACIÓN, ortogonal a difficulty/time: un
    // revuelto bien resuelto puede ser tan apetecible como un plato de 3h. Se
    // marca a mano (no se deriva) y solo sesga qué se propone/destaca — ninguna
    // regla del motor depende de él.
    apetecible: z.boolean().optional(),
    // ¿Pertenece al Recetario Estrella (catálogo principal, curado en 2026)?
    // Antes se deducía de "¿tiene foto en dishImages.json?" — pero eso acopla
    // el nivel de catálogo a un detalle puramente visual: conectar una foto
    // huérfana (fix visual sin relación con el generador) promovía la receta
    // al pool principal sin que nadie lo decidiera. Se marca a mano y es la
    // única fuente de verdad que usa filterRecipes.isPrimaryCatalog(); el
    // resto del catálogo ("fondo de armario") solo entra si el pool principal
    // se queda corto para las restricciones del grupo.
    estrella: z.boolean().optional(),
    // ¿Es plato de OCASIÓN? Marisco de ración (cigalas, navajas, percebes),
    // arroces de bogavante, paellas de marisco… Cocina real y del catálogo,
    // pero que nadie se hace un martes para comer: se comen un fin de semana,
    // en familia o con invitados. Sin este campo el generador no tenía forma
    // de distinguirlos de un filete a la plancha -mismo tiempo, misma
    // dificultad, misma categoría- y los repartía por el diario.
    //
    // Se marca a MANO, como `estrella` y `montaje`: no se puede derivar de
    // precio (no está en el catálogo), ni de tiempo (las navajas son 10 min),
    // ni de dificultad (son fáciles). Ausente = plato de diario.
    occasion: z.enum(["diario", "especial"]).optional(),
    // ¿Es de los que un niño PIDE? `kidFriendly` dice lo que PUEDE comer, y
    // por eso está al 88% del catálogo: como filtro no distingue nada. Esto es
    // lo otro — los míticos (filetes empanados, macarrones con tomate,
    // tortilla, salchichas) y lo sano que entra con esa misma forma: las
    // cremas dulces de calabaza o zanahoria, las lentejas con salchichas, la
    // merluza rebozada. Sirve para colar verdura, no para rendirse.
    //
    // Se marca a MANO, como `apetecible` y `montaje`: NO se deriva de
    // kidFriendly + dificultad, que es justo la aproximación que se quedaba
    // corta (ver utils/recipeIntents.js).
    kidFavourite: z.boolean().optional(),
    // "Cena rápida" de verdad: se monta, no se cocina (sándwich, tostas, tabla,
    // ensalada de asamblaje). Sustituye a category "cenas_rapidas".
    //
    // Se marca a MANO y no se deriva de time+difficulty a propósito: medido
    // contra el catálogo, las 16 recetas curadas como cenas_rapidas caen en
    // 5-25 min, pero otras 57 recetas cumplen ese mismo umbral (fácil + rol
    // cena + ≤20 min) sin tener el mismo carácter (Escalope de pollo, Ensalada
    // César, Hamburguesas caseras...). Ni requiredAppliance ni el número de
    // ingredientes separan los dos grupos — la cualidad no vive hoy en ningún
    // campo estructurado, así que se declara.
    montaje: z.boolean().optional(),
    // ¿Puede además hacer de guarnición de otro plato? Capacidad independiente
    // del rol: una ensalada o un arroz sencillo acompañan un filete un día y
    // son la cena entera otro. Solo mete el plato en el pool de
    // utils/pairGarnishes.js; su mealRole sigue describiendo los huecos de menú
    // que acepta y no necesita incluir "guarnicion".
    canBeGarnish: z.boolean().optional(),
    // Salsa/emulsión emparejada (catálogo aparte, mismo patrón que guarniciones).
    // Solo para salsas que se preparan APARTE y se añaden al final; una técnica
    // de cocinado integral (al ajillo, en salsa verde, guisos) se queda dentro
    // de ingredients/steps de la propia receta.
    sauceId: z.string().optional(),
    // Solo en recetas type "salsa": con qué tipo de plato principal encaja.
    // Ver SAUCE_COMPAT_TAGS arriba.
    sauceCompat: z.array(z.enum(SAUCE_COMPAT_TAGS)).optional(),
    // ¿Puede recibir una salsa de acompañamiento (data/recipes/salsas.json)?
    // Curado a mano, NUNCA derivado de category/mainProtein: la mayoría de
    // carnes/pescados/ensaladas del catálogo ya llevan su sabor integrado
    // (Merluza en salsa verde, Ensalada César) y añadir otra salsa encima
    // sería redundante o directamente raro. Solo se marca en las recetas
    // verificadas una a una como "a la plancha/horno sin aderezo propio" o
    // "ensalada simple" — ver model/recipe-data-model-refactor.md §4.
    canReceiveSauce: z.boolean().optional(),
    mealRole: z.array(z.enum(MEAL_ROLES)).min(1),
    type: z.enum(TYPES),
    // Links a variant (e.g. "Muslos de pollo al horno") to the base dish it
    // overlaps with (e.g. "Pollo al horno con patatas"). Populated manually
    // after reviewing scripts/detect-duplicate-dishes.mjs output.
    baseDishId: z.string().optional(),
    requiredAppliance: z.string().optional(),
    time: z.number().positive(),
    // `time` se cocina para `baseServings` comensales. Algunas recetas
    // escalan de verdad con el nº de comensales (pelar/cortar más patatas
    // para 6 que para 3); otras no (un horno tarda igual para 2 que para 6).
    // Opcional y SIN CURAR hoy en el catálogo — indefinido se trata como
    // false (no escala), así que nada cambia de comportamiento hasta que se
    // marque receta a receta. Ver effectiveRecipeTime() más abajo.
    scalesWithEaters: z.boolean().optional(),
    difficulty: z.enum(DIFFICULTIES),
    season: z.enum(SEASONS),
    kcal: z.number().nonnegative(),
    protein_g: z.number().nonnegative(),
    carbs_g: z.number().nonnegative(),
    fat_g: z.number().nonnegative(),
    // Secondary nutrition, optional so the 244 existing recipes stay valid and
    // only surface it once the one-off enrichment pass (scripts/enrich-recipe-
    // steps.mjs) estimates them. Shown collapsed in the dish detail. Same per-
    // serving basis and _g/_mg naming convention as the primary macros.
    fiber_g: z.number().nonnegative().optional(),
    sugar_g: z.number().nonnegative().optional(),
    saturated_fat_g: z.number().nonnegative().optional(),
    sodium_mg: z.number().nonnegative().optional(),
    baseServings: z.number().positive(),
    kidFriendly: z.boolean(),
    tupperFriendly: z.boolean(),
    allergens: z.array(z.enum(ALLERGENS)),
    healthFlags: z.array(z.enum(HEALTH_FLAGS)).optional(),
    ingredients: z.array(IngredientSchema).min(1),
    steps: z.array(z.string().min(1)).min(1),
    // Enriched, structured steps (one-off, generated by scripts/enrich-recipe-
    // steps.mjs). Optional so existing recipes stay valid; when present the
    // detail renders the stepper, otherwise it falls back to `steps`. Kept in
    // sync with `steps` (stepsRich[i].text === steps[i]).
    stepsRich: z.array(StepRichSchema).min(1).optional(),
    // ¿Aguanta el plato una congelación y un recalentado sin arruinarse? Es
    // distinto de tupperFriendly (que solo pide que viaje bien en frío o de un
    // día para otro en nevera): un rebozado va perfecto en tupper y se queda
    // blando al descongelar. Solo las recetas con freezable true entran en el
    // flujo de congelador (banner en la ficha, uso desde el planner) y solo
    // ellas reciben thawSteps en el enriquecimiento.
    freezable: z.boolean().optional(),
    // Pasos para resucitar una ración ya cocinada que salió del congelador —
    // mismo formato que stepsRich, así que RecipeSteps los pinta igual. Sustituyen
    // a los pasos de cocinado cuando el slot viene marcado fromFreezer; si además
    // hay raciones frescas que cocinar, se muestran los dos bloques.
    thawSteps: z.array(StepRichSchema).min(1).optional(),
    description: z.string().min(1),
    methods: z.array(MethodSchema).optional(),
    // Names this dish is commonly sold as a ready-made product under (e.g.
    // "Natillas caseras" -> ["Natillas", "Natillas de vainilla"]; "Gazpacho
    // andaluz" -> ["Gazpacho"]). A recipe's own ingredient list never contains
    // its own name (Natillas caseras lists leche/huevo/azúcar, never
    // "Natillas"), so without this the store-bought version of a dish that's
    // normally cooked from scratch could never be recognised on a receipt or
    // in the pantry. See ingredientDictionary() in lib/priceHistory.js, which
    // folds these in alongside every recipe's real ingredients. Only set on
    // dishes genuinely common as a finished supermarket product.
    productAliases: z.array(z.string().min(1)).optional(),
    // Off-menu postre effort. Optional so comida/cena recipes stay untouched.
    // inmediato = yogur/fruta; cazo = arroz con leche/natillas; horno = flan/tarta.
    effort: z.enum(["inmediato", "cazo", "horno"]).optional(),
    // Only for effort "inmediato": the fruta vs yogur micro-toggle.
    dessertKind: z.enum(["fruta", "yogur"]).optional(),
  })
  .superRefine((recipe, ctx) => {
    const { type, mealRole, id } = recipe;

    if (type === "guarnicion") {
      if (mealRole.length !== 1 || mealRole[0] !== "guarnicion") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `"${id}": type "guarnicion" requiere mealRole === ["guarnicion"], recibido [${mealRole.join(", ")}]`,
        });
      }
    } else if (mealRole.includes("guarnicion")) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `"${id}": mealRole "guarnicion" solo es válido con type "guarnicion"`,
      });
    }

    if (type === "salsa") {
      if (mealRole.length !== 1 || mealRole[0] !== "salsa") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `"${id}": type "salsa" requiere mealRole === ["salsa"], recibido [${mealRole.join(", ")}]`,
        });
      }
    } else if (mealRole.includes("salsa")) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `"${id}": mealRole "salsa" solo es válido con type "salsa"`,
      });
    }

    // sauceCompat solo tiene sentido en la propia receta de salsa; en un plato
    // principal el campo relevante es sauceId (qué salsa lleva), no con qué
    // encaja — mismo error de confusión que canBeGarnish en type "guarnicion".
    if (recipe.sauceCompat && type !== "salsa") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `"${id}": sauceCompat solo es válido en type "salsa"`,
      });
    }

    // canReceiveSauce en una salsa o una guarnición es dato muerto: el flag
    // habilita a un plato principal a recibir salsa, no al revés.
    if (recipe.canReceiveSauce && (type === "salsa" || type === "guarnicion")) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `"${id}": canReceiveSauce es redundante en type "${type}"`,
      });
    }

    if (recipe.baseDishId === id) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `"${id}": baseDishId no puede apuntar a sí mismo`,
      });
    }

    // Unos thawSteps en un plato que no se congela no se pintarían nunca: si
    // están ahí es que el enriquecimiento (o una edición a mano) se equivocó de
    // receta, y prefiero enterarme al validar que dejarlo como dato muerto.
    if (recipe.thawSteps && !recipe.freezable) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `"${id}": thawSteps requiere freezable true`,
      });
    }

    // Un type "guarnicion" YA está en el pool de guarniciones; marcarlo además
    // con canBeGarnish es dato muerto que sugiere una confusión sobre qué hace
    // el flag (habilitar a un plato principal, no redundar en una guarnición).
    if (recipe.canBeGarnish && type === "guarnicion") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `"${id}": canBeGarnish es redundante en type "guarnicion"`,
      });
    }
  });

/**
 * ¿Es una "cena rápida" (plato de montaje, no de cocinado)?
 *
 * Fuente única de verdad del predicado, compartida por el planificador
 * (lib/aiPlanner.js), la validación determinista (utils/validateMenu.js) y el
 * formulario de recetas de usuario — antes cada sitio comparaba
 * `category === "cenas_rapidas"` por su cuenta.
 *
 * El fallback a la categoría deprecada NO es temporal: las recetas de usuario
 * ya guardadas en Supabase con `category: "cenas_rapidas"` nunca se migran (ver
 * DEPRECATED_CATEGORIES), así que siguen teniendo que resolverse como cena
 * rápida indefinidamente.
 */
export function isMontaje(recipe) {
  if (!recipe) return false;
  if (typeof recipe.montaje === "boolean") return recipe.montaje;
  return recipe.category === "cenas_rapidas";
}

/**
 * `recipe.time` tal cual, salvo que la receta esté marcada `scalesWithEaters`
 * — entonces se infla un 12% por cada comensal por encima de `baseServings`
 * (nunca se reduce por debajo de la base: menos comensales no acelera la
 * receta). Sin curar todavía en el catálogo, así que hoy devuelve siempre
 * `recipe.time` sin tocar. Fuente única de verdad para el umbral de "comida/
 * cena rápida" (ver aiPlanner.js recipeMatchesPreferType).
 */
export function effectiveRecipeTime(recipe, eaters) {
  if (!recipe) return 0;
  if (!recipe.scalesWithEaters || !eaters) return recipe.time;
  const base = recipe.baseServings || 2;
  const extra = Math.max(0, eaters - base);
  return recipe.time * (1 + 0.12 * extra);
}

export { DEPRECATED_CATEGORIES, MAIN_INGREDIENTS, SAUCE_COMPAT_TAGS };

/**
 * Validates every recipe in `recipes` against RecipeSchema.
 * Returns an array of human-readable error strings (empty if all valid).
 */
export function validateRecipes(recipes) {
  const errors = [];
  for (const recipe of recipes) {
    const result = RecipeSchema.safeParse(recipe);
    if (!result.success) {
      for (const issue of result.error.issues) {
        const path = issue.path.length ? ` (campo: ${issue.path.join(".")})` : "";
        errors.push(`[${recipe.id ?? "?"}] ${issue.message}${path}`);
      }
    }
  }
  return errors;
}
