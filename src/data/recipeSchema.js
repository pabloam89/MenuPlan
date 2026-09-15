import { z } from "zod";

import { STEP_KINDS, STEP_PARTS } from "../lib/recipeSteps.js";

// Canonical taxonomy for the recipe catalog. Adding a new category/protein/etc
// requires updating this file — that's the point: it forces a conscious
// decision instead of silently accepting a typo'd value.

const CATEGORIES = [
  "bebes", "carnes", "cenas_rapidas", "ensaladas_verduras", "guarniciones",
  "huevos", "legumbres", "pasta_arroces", "pescados", "platos_unicos",
  "sopas_cremas",
  // "bases" es off-menu por el mismo motivo que "salsas": una olla de arroz
  // cocido no es la cena de nadie. Vive en su propio catálogo
  // (data/recipes/bases.json) y la consumen los platos vía `mainBase`.
  "bases",
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

// Los dos ejes de estilo, con nombre y exportados (11 sep 2026). Hasta ahora
// eran arrays inline dentro del schema, y por eso vivían TRES veces: aquí, como
// literal repetido en lib/notepadFields.js (el dominio que el panel puede
// emitir) y en prosa dentro de api/_prompts.js. Tres copias a mano de la misma
// lista es como se descuadran: aquí es la fuente, los otros dos la importan, y
// promptContract.test.js comprueba que el prompt la repite tal cual.
const TECNICAS = ["horno", "plancha", "sarten", "olla", "crudo"];
// AUSENTE = española (ver el comentario de `cocina` más abajo): por eso
// "espanola" no está en la lista, y por eso el panel no puede pedirla.
const COCINAS = [
  "italiana", "asiatica", "mexicana", "arabe",
  "francesa", "americana", "india", "peruana",
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

const TYPES = ["completo", "principal", "guarnicion", "salsa", "base"];

/**
 * Las bases: lo que se cocina UNA VEZ y alimenta a varios platos de la semana.
 *
 * Este enum es el eje `mainBase`, que hasta ahora era `z.string()` libre — y
 * por eso convivían `patata` (8 recetas) y `patatas` (81) como si fueran cosas
 * distintas, más `cuscús`/`cuscus`/`sémola` y `lentejas`/`garbanzos` pisando a
 * `legumbre`. El sesgo "más patatas" del panel se saltaba en silencio esas 8.
 * Cerrarlo a enum es lo que convierte el campo en la clave de una base: si no
 * se escribe siempre igual, no se puede agrupar por él. Ver
 * scripts/normalize-main-base.mjs, que hizo la limpieza.
 *
 * `pan` y `avena` ESTUVIERON aquí y se sacaron (11 sep 2026), porque este campo
 * responde a una sola pregunta: ¿qué se puede cocinar en una tanda aparte y
 * repartir entre varios platos? Y el propio catálogo contestaba que no:
 *
 *   legumbre 80 · patatas 67 · pasta 52 · arroz 33 · quinoa 6 · cuscus 5 · boniato 4
 *   pan 0 de 83   ·   avena 0 de 9        ← ni un solo plato marcado "aparte"
 *
 * Nadie hace una tanda de pan el domingo, y no hay entrada suya en bases.json.
 * Tenerlos aquí mezclaba dos ejes: qué OLLA compartes (esto) y qué HIDRATO
 * percibe el comensal (carbType). Son lo segundo, no lo primero, y como tal
 * siguen vivos: `CARB_PATTERNS` en utils/validateMenu.js ya llamaba "pan" por su
 * cuenta a 73 de esos 83 platos, así que la regla 9 apenas se entera.
 *
 * Al salir del enum, esas 92 recetas perdieron también su `baseMode` (que exige
 * mainBase) — era "dentro" en las 92, o sea que no decía nada que no supiéramos.
 */
const MAIN_BASES = [
  "arroz", "pasta", "patatas", "boniato", "legumbre",
  "quinoa", "cuscus",
];

/**
 * Qué tipo de HIDRATO aporta cada base — la tabla que une los dos ejes que
 * hasta ahora modelaban lo mismo por separado y no se hablaban:
 *
 *   · `mainBase`  →  qué OLLA comparte el plato (batch cooking, lib/bases.js)
 *   · carbType    →  si el comensal percibe "otra vez lo mismo" (regla 9
 *                    guarnicion_repetida y regla 14, utils/validateMenu.js)
 *
 * Hasta ahora el carbType se sacaba SOLO de un regex sobre nombre +
 * ingredientes, sin mirar el `mainBase` declarado, y las dos taxonomías
 * discrepaban: "Trofie al pesto genovés" (mainBase pasta) contaba como patatas
 * porque el pesto genovés lleva patata, "Cocido madrileño" (mainBase legumbre)
 * también, y "Fettuccine Alfredo" no contaba como nada porque el regex no
 * conoce "fettuccine". Con `mainBase` declarado mandando sobre el regex, la
 * regla 9 pasa a leer lo que la receta DICE que es, y el sesgo de batch cooking
 * deja de pelearse con un dato derivado.
 *
 * Deliberadamente SIN cifras de catálogo aquí: el número de recetas afectadas
 * cambia cada vez que entra una tanda nueva, y un comentario con un absoluto
 * dentro nace caducando. Para medirlo, cruzar `mainBase` con `getCarbType()`.
 *
 * Los dos valores que NO son la identidad son el motivo de que esto sea una
 * tabla y no un `mainBase === carbType`:
 *
 *   boniato → "patatas"  Es una base propia (bases_007: una bandeja de boniato
 *       asado no es una olla de patatas cocidas) pero en la mesa es el mismo
 *       tubérculo asado dos veces, y el regex ya metía boniato/batata en
 *       "patatas" para los platos que no declaran base. Separarlo aquí crearía
 *       la incoherencia de que el boniato declarado y el no declarado
 *       contaran distinto.
 *
 *   legumbre → null      La legumbre en este catálogo es el eje de PROTEÍNA,
 *       no el de hidrato.
 *
 *       Quién impide de verdad repetir legumbre el mismo día es la REGLA 13
 *       (`dos_cuchara_mismo_dia`, utils/validateMenu.js), vía `isPlatoCuchara`,
 *       que mira `category === "legumbres"` y `mainProtein === "legumbre"` y no
 *       consulta el carbType para nada. Lentejas y garbanzos el mismo día
 *       saltaban antes de esta tabla y siguen saltando después. (Las reglas 2,
 *       3b, 3c y 15 son del eje de la proteína y NO sirven de argumento aquí:
 *       fallan justo para las recetas con mainBase "legumbre" y un mainProtein
 *       distinto, que existen.)
 *
 *       Lo que este `null` quita no era enforcement de legumbre: era
 *       enforcement CRUZADO y falso. Los guisos arrastraban un carbType de su
 *       acompañamiento — patata, pan o fideos — y con él un potaje bloqueaba
 *       las patatas de ese día. Que dos guisos chocaran entre sí solo ocurría
 *       por accidente, cuando coincidían en el mismo carbType falso.
 *
 *       Y el efecto colateral bueno: libera la base con MÁS platos del catálogo
 *       (bases_004, la mejor tanda que hay — una olla de garbanzos son 55 min
 *       pasen dos raciones o doce) sin tocar la restricción real.
 *
 *       NOTA DE ALCANCE: esto NO resuelve la decisión aparcada en
 *       specs/batch-cooking.md §7.4, donde `api/_prompts.js:24` enumera las
 *       bases sin `legumbre` ni `boniato`. Aquella sigue sin tocarse, y sigue
 *       siendo del dueño del producto: corregirla cambia qué menús genera el
 *       motor para todo el mundo.
 */
const CARB_TYPE_BY_BASE = {
  arroz: "arroz",
  pasta: "pasta",
  patatas: "patatas",
  boniato: "patatas",
  legumbre: null,
  quinoa: "quinoa",
  cuscus: "cuscus",
};

const MEAL_ROLES = [
  "cena", "guarnicion", "plato_unico", "primero", "segundo",
  // Off-menu roles for the optional light pool (see CATEGORIES note).
  "desayuno", "merienda", "postre",
  // Igual que "guarnicion": una salsa nunca es el hueco de un menú por sí
  // misma, solo marca su propio catálogo (ver TYPES/CATEGORIES "salsa"/"salsas").
  "salsa",
  // Y una base, menos todavía.
  "base",
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
  // El id canónico en src/data/ingredients.json (11 sep 2026).
  //
  // Hasta ahora el enlace receta → ingrediente iba SOLO por texto: `name` se
  // resolvía contra nombre y alias con resolveIngredientId(). Funcionaba —las
  // 7.415 líneas del catálogo resuelven— pero era una búsqueda difusa en la
  // fuente de verdad: no se podía cruzar de verdad, y una grafía nueva rompía
  // el enlace en silencio. Postgres sí tenía recipe_ingredients.ingredient_id
  // con su FK… y el cliente no lee esa tabla.
  //
  // Es opcional en el esquema para que una receta de usuario o una generada
  // por IA con un ingrediente que no está en el catálogo siga siendo válida
  // (ahí `null` significa "no sé qué ingrediente es", nunca "no tiene"). Que
  // en el CATÁLOGO esté SIEMPRE y apunte a un id real lo exige
  // scripts/validate-catalog.mjs, que además comprueba que coincide con lo que
  // resuelve `name`: si algún día discrepan, que reviente el build y no la
  // lista de la compra. Se rellena con scripts/add-ingredient-ids.mjs.
  ingredientId: z.string().min(1).optional(),
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
  // Qué base cocina este paso, si es que cocina alguna. Tercer eje, y otra
  // pregunta distinta de las dos anteriores: `kind` dice cuánto te ata el paso,
  // `part` dice a qué componente del plato pertenece, y esto dice si el paso
  // DESAPARECE cuando esa base ya viene hecha del domingo.
  //
  // Es lo único que convierte el batch cooking en una promesa comprobable. Sin
  // esto sabíamos que un plato "lleva sofrito aparte", pero no cuánto trabajo
  // te quitas un martes por tenerlo hecho: el ahorro se medía sobre la receta
  // de la BASE (lo que cuesta la olla), nunca sobre el plato que la usa. Con
  // esto se suman los minutos de los pasos marcados y sale el número que de
  // verdad importa — "con el sofrito hecho, esto son 8 minutos".
  //
  // El valor es la clave de la base (`baseKey`, o el `mainBase` de las de
  // fécula), y solo vale si el plato la declara suya: en `basesAparte` o como
  // su `mainBase` con `baseMode: "aparte"`. Lo comprueba validate-catalog.
  //
  // Se marca un paso SOLO si se va entero. Un paso que sofríe la cebolla y
  // además dora el pollo no se marca: tener el sofrito hecho no te lo ahorra,
  // te lo acorta, y contar esos minutos como ahorrados sería inflar la promesa.
  base: z.string().min(1).optional(),
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
    // Qué base lleva el plato. Ver MAIN_BASES: era string libre y ahora es
    // enum, porque es la clave por la que se agrupan los platos que comparten
    // olla en una sesión de batch cooking.
    mainBase: z.enum(MAIN_BASES).optional(),
    // ¿La base se cocina APARTE del plato, o DENTRO de él?
    //
    // Es la distinción que hace posible el batch cooking y la única que
    // `mainBase` no podía dar: dice QUÉ fécula lleva el plato, no si esa
    // fécula se puede tener ya hecha el domingo.
    //
    //   aparte → el arroz de un bowl, de una ensalada, de unas judías con
    //            arroz. Se cuece en su olla y se junta al final: una tanda
    //            grande sirve a tres platos distintos de la semana.
    //   dentro → el arroz de un risotto, una paella o un arroz caldoso; la
    //            pasta de una lasaña, de unos canelones o de una sopa. El
    //            grano se cocina EN el plato absorbiendo su caldo, y
    //            precocinarlo no ahorra tiempo: arruina el plato.
    //
    // Solo tiene sentido junto a `mainBase`, y solo "aparte" engancha con una
    // receta de base. Ausente = sin decidir todavía, que NO es lo mismo que
    // "dentro": el generador de sesiones ignora lo que no está marcado en vez
    // de suponer (ver lib/bases.js).
    baseMode: z.enum(["aparte", "dentro"]).optional(),
    // ── Preparaciones batcheables que NO son fécula ────────────────────────
    // `mainBase` responde "¿qué hidrato lleva este plato?" y alimenta carbType
    // y las reglas de variedad. El sofrito no es un hidrato, y un plato puede
    // llevar arroz Y sofrito — así que meterlo en MAIN_BASES habría roto el eje
    // y solo habría dejado declarar uno de los dos.
    //
    // Esto es la otra pregunta: ¿qué preparaciones admite este plato YA HECHAS?
    // Es una lista porque la respuesta honesta suele ser más de una. El sofrito
    // es el caso grande: lo llevan 260 platos del recetario estrella, más que
    // las siete bases de fécula juntas, y es casi todo trabajo de manos — que
    // es lo único que de verdad se ahorra (ver fraccionActiva en lib/bases.js).
    //
    // Riesgo asimétrico, y al revés que en `baseMode`: tener sofrito hecho y no
    // usarlo no estropea nada, mientras que precocer el arroz de un risotto sí.
    // Por eso aquí se puede marcar con menos miedo.
    basesAparte: z.array(z.string().min(1)).optional(),
    // Solo en recetas `type: "base"`: con qué clave la buscan los platos. Para
    // las siete de fécula es su `mainBase`; existe para que una base que no es
    // fécula (el sofrito) tenga nombre propio sin colarse en MAIN_BASES.
    baseKey: z.string().min(1).optional(),
    // ── Campos solo de type "base" ─────────────────────────────────────────
    // Cuánto produce una tanda. Una base rinde 600 g de arroz cocido, no "4
    // raciones": `baseServings` es la unidad del que se come un plato, y aquí
    // lo que se reparte es peso entre platos que piden cantidades distintas.
    rinde: z.object({
      amount: z.number().positive(),
      unit: z.enum(UNITS),
    }).optional(),
    // El tiempo de una base es AFÍN, no proporcional, y esa es justo la razón
    // de que el batch cooking ahorre: una olla de garbanzos tarda 40 min tanto
    // para 2 raciones como para 8. `minutosFijos` es ese 40 —lo que cuesta
    // aunque sea una sola ración—, y `minutosPorRacion` lo poco que crece
    // (pelar y cortar sí escala; hervir no). Ver tiempoDeBase() en lib/bases.js.
    minutosFijos: z.number().nonnegative().optional(),
    minutosPorRacion: z.number().nonnegative().optional(),
    // Cuántas raciones caben en UNA tanda. Por encima hace falta otra olla u
    // otra bandeja, y entonces el tiempo sí se suma entero — sin este tope el
    // modelo afín prometería cocinar para 20 en el mismo cazo.
    capacidadMax: z.number().positive().optional(),
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
    // única fuente de verdad que usa filterRecipes.isPrimaryCatalog().
    //
    // Y es sin plan B: el resto del catálogo ("fondo de armario") NO entra
    // nunca para un grupo normal, ni siquiera cuando las restricciones dejan
    // el pool principal corto — ahí filterRecipes devuelve error antes que
    // rellenar en silencio. La única excepción son los bebés, cuyo pool ya
    // va aislado aparte. Para que una receta del fondo de armario se use,
    // se la promueve a mano marcándola aquí (y entonces necesita foto).
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
    // Cómo se cocina, en una palabra: la técnica DOMINANTE, no las que se
    // mencionan de paso.
    //
    // Contar menciones no sirve — "sartén" aparece en el 73% de los pasos del
    // catálogo y "olla" en el 55%, porque casi todo empieza sofriendo cebolla.
    // Se resuelve con una prioridad (nombre → electrodoméstico → pasos), que
    // da un reparto que sí distingue: olla 38%, sartén 29%, horno 20%, crudo
    // 14%, plancha 10%. Ver scripts/mark-catalog-axes.mjs.
    tecnica: z.enum(TECNICAS).optional(),
    // De dónde es el plato. AUSENTE = española, que es lo que este catálogo es
    // de serie: marcar 580 recetas como "espanola" sería ruido para decir lo
    // obvio. Sale solo del NOMBRE — derivarlo de los ingredientes hacía
    // "asiáticas" a unas costillas BBQ por llevar salsa de soja, y mexicana a
    // la tortilla de jamón y queso.
    // Las cuatro últimas se añadieron al medir la convención: 30 platos de
    // nombre inequívocamente extranjero (quiche lorraine, ceviche, hamburguesa,
    // pollo al curry) contaban como españoles por omisión.
    cocina: z.enum(COCINAS).optional(),
    // El plato TRAE salsa escrita dentro. No es `sauceId` —que fija UNA salsa
    // concreta a mano y no lo usa nadie— sino "esto es un plato de salsa".
    //
    // Existe porque aquí no se combinan platos con salsas: cada receta es la
    // que es. Sin este campo, "quiero más platos con salsa" no tiene respuesta
    // posible; con él, la respuesta honesta —"te doy los que ya la llevan"—
    // pasa a ser servible.
    //
    // Deliberadamente NO incluye guisos y estofados: tienen su jugo, pero eso
    // ya lo dice `tecnica`, y mezclarlos dejaba el filtro sin filo.
    //
    // ── APARTE vs DENTRO: el criterio, fijado el 11 sep 2026 ────────────────
    // Esa exclusión de los guisos estaba tanteando una distinción que no se
    // llegó a nombrar, y que es la misma que `baseMode` hace con la fécula:
    //
    //   APARTE  se puede servir en un cuenco al lado, Y el plato sigue siendo
    //           ese plato sin ella. Hacen falta LAS DOS cosas.
    //   DENTRO  no es escindible de la preparación: sus ingredientes no se
    //           pueden atribuir por separado.
    //
    // Casos que costaron y cómo se resolvieron, para que no haya que volver a
    // discutirlos:
    //
    //   · REDUCCIONES — hay un test mecánico, comprobable en los propios pasos:
    //     ¿el líquido de la salsa ha cocinado el ingrediente principal?
    //       NO  → aparte. El magret con reducción de frutos rojos: la reducción
    //             se hace en un cazo y nunca tocó el pato.
    //       SÍ  → dentro. La carrillada al vino: esa reducción ES el líquido de
    //             braseado, y la carne soltó sus jugos en él.
    //
    //   · MANTEQUILLAS COMPUESTAS (Café de París, de perejil) → aparte. Se hacen
    //     en bol, se enfrían, se cortan en rodajas y se posan. Un entrecot sin
    //     ella sigue siendo un entrecot.
    //
    //   · BACALAO AL PIL-PIL → dentro. La salsa se emulsiona con el aceite de
    //     confitar el propio bacalao y su gelatina: no hay frontera que trazar.
    //
    //   · PATATAS BRAVAS → dentro. La brava es separable, pero unas bravas sin
    //     brava son patatas fritas: falla la segunda cláusula. Y para lo que de
    //     verdad importa —¿se le puede quitar a un alérgico?— la respuesta es
    //     que no, porque entonces se le está dando otro plato.
    //
    // Medido sobre el catálogo: ~8 % de los platos llevan salsa aparte. La señal
    // está en el nombre (la preposición: "con salsa X" ≈ aparte, "en salsa X" /
    // "al X" ≈ dentro) y, mejor todavía, en el texto de los últimos pasos
    // ("aparte", "al lado", "en un cuenco"), que acertó el 100 % de las veces.
    // Ojo con cinco familias de falso positivo del "con X": gratinados,
    // portadores (un wrap con césar la lleva dentro), glaseados que se pincelan,
    // aliños, y los "con X" donde X no es una salsa.
    llevaSalsa: z.boolean().optional(),
    // Etapa del bebé, solo para category "bebes". "Bebé" no es una etapa: son
    // tres, y hasta ahora las 19 recetas eran todas del primer tramo — un niño
    // de 22 meses comía el mismo puré que uno de seis, porque filterRecipes
    // encierra al grupo bebé en su propia categoría.
    //
    // Ausente = "cremas", que es lo que eran las 19 originales.
    etapaBebe: z.enum(["cremas", "solidos"]).optional(),
    // "Cena rápida" de verdad: se MONTA con cosas ya listas (sándwich, tostas,
    // tabla, ensalada de asamblaje). Sustituye a category "cenas_rapidas".
    //
    // NO es lo mismo que "no pasa por el fuego" — eso lo dice `tecnica:
    // "crudo"`. La diferencia tiene consecuencia: recipeMatchesPreferType()
    // acepta como cena rápida cualquier plato de montaje SALTÁNDOSE el filtro
    // de dificultad y de tiempo (utils/filterRecipes.js). Eso vale para una
    // tosta de tomate y no vale para un tartar de solomillo al cuchillo ni para
    // un ceviche con su leche de tigre: no llevan fuego, pero son técnica y
    // cuchillo, y de hecho están catalogados como dificultad "normal". Los
    // tartares, ceviches y carpaccios se quedan fuera de este eje y dentro de
    // `tecnica: "crudo"`.
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
    // ── Solo en recetas `type: "base"`: cómo se vuelve a poner en marcha ────
    // Un táper de la nevera no se usa tal cual: el arroz se seca y pide un
    // chorrito de agua, el sofrito quiere un minuto de sartén, y lo rebozado
    // pierde la textura si lo pasas por el microondas en vez de por el horno.
    //
    // Es el mismo patrón que `thawSteps`, y de hecho la hermana pequeña: si
    // aquello es "sacarlo del congelador", esto es "sacarlo de la nevera".
    //
    // Nace porque el modelo estaba cobrando CERO por esto. `montajeTrasBases`
    // quitaba los pasos de la base y daba el plato por empezado, así que la
    // promesa del martes salía más corta de lo que iba a ser. Y además los
    // pasos del plato están escritos suponiendo que la base acaba de salir del
    // fuego: sin esto, un martes faltaba una instrucción.
    //
    // Va sin marcadores, igual que thawSteps: aquí no hay cantidades que
    // escalar porque lo que se reactiva ya está cocinado.
    reactivacion: z.array(StepRichSchema).min(1).optional(),
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

    if (type === "base") {
      if (mealRole.length !== 1 || mealRole[0] !== "base") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `"${id}": type "base" requiere mealRole === ["base"], recibido [${mealRole.join(", ")}]`,
        });
      }
      if (!recipe.rinde) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `"${id}": type "base" requiere rinde — una base sin rendimiento no se puede repartir entre platos`,
        });
      }
      // Sin clave la base no se puede emparejar con ningún plato: es el join,
      // no un adorno. Una base huérfana es dato muerto. La clave es `mainBase`
      // para las siete de fécula y `baseKey` para las que no lo son — el
      // sofrito no es un hidrato y no podía entrar en MAIN_BASES sin romper
      // carbType y las reglas de variedad.
      if (!recipe.mainBase && !recipe.baseKey) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `"${id}": type "base" requiere mainBase o baseKey — es la clave por la que los platos la encuentran`,
        });
      }
    } else if (mealRole.includes("base")) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `"${id}": mealRole "base" solo es válido con type "base"`,
      });
    }

    // rinde/minutosFijos/minutosPorRacion/capacidadMax describen una TANDA, y
    // una tanda solo la produce una base. En un plato serían dato muerto.
    for (const campo of ["rinde", "minutosFijos", "minutosPorRacion", "capacidadMax"]) {
      if (recipe[campo] !== undefined && type !== "base") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `"${id}": ${campo} solo es válido en type "base"`,
        });
      }
    }

    // Un baseMode sin mainBase no dice nada: "aparte" ¿de qué? Es el error
    // típico de marcar el eje a mano en la receta equivocada, y prefiero que
    // salte al validar que descubrirlo cuando la sesión salga vacía.
    if (recipe.baseMode && !recipe.mainBase) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `"${id}": baseMode requiere mainBase`,
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

    // Unos pasos de reactivación en algo que no es una base no los pintaría
    // nadie, y peor: `montajeTrasBases` los cobraría como coste de una tanda
    // que no existe.
    if (recipe.reactivacion && type !== "base") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `"${id}": reactivacion solo es válido en type "base"`,
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

export { CARB_TYPE_BY_BASE, COCINAS, DEPRECATED_CATEGORIES, MAIN_BASES, MAIN_INGREDIENTS, SAUCE_COMPAT_TAGS, TECNICAS };

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
