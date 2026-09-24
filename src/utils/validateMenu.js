/**
 * Validate a slot assignment from the LLM against business rules.
 * Returns { valid: true } or { valid: false, violations: [...] }.
 *
 * Each violation: { rule, slotId, message }
 */

import { HEALTH_PROFILE_BADGE } from "../lib/healthProfileMatch.js";
import { CARB_TYPE_BY_BASE, PROTEIN_GROUP_BY_MAIN_PROTEIN, isMontaje } from "../data/recipeSchema.js";
import {
  evaluarNoRepetir, deValor, deBandera, deConjunto,
  cadena, parFranja, parComida, primeroVsCenas, mismoDia, diaYAnterior, cenasAdyacentes,
} from "./reglasNoRepetir.js";
import { esCasqueria } from "../lib/casqueria.js";
import { clavesDeReceta } from "../lib/bases.js";

// Health profiles that trigger a correctable violation below. `anemia` is a
// presence-based profile ("must contain iron-rich flag") rather than
// absence-based ("must not contain risk flag") — treating it the same way
// would flag almost every slot in the week as a violation and fight the
// variety/carb-repetition rules. It stays pure LLM soft-bias, matching the
// "prioriza" (not "excluye") wording in the SYSTEM_PROMPT.
const CORRECTABLE_HEALTH_PROFILES = new Set(
  Object.keys(HEALTH_PROFILE_BADGE).filter((id) => id !== "anemia"),
);

// ── Carb-type extraction ─────────────────────────────────────────
// Used to detect same-day "guarnición" repetition. The DECLARED `mainBase`
// wins when the recipe has one (see getCarbType + CARB_TYPE_BY_BASE in
// data/recipeSchema.js); these patterns are the fallback for the ~500 recipes
// that don't declare it, matched against recipe name + ingredient list, most
// specific pattern first.
const CARB_PATTERNS = [
  [/arroz|paella|risotto/, "arroz"],
  [/pasta|macarr[oó]n|espagueti|tallar[íi]n|fideo|fideu[áa]|penne|lasa[ñn]a|can+elones|ravioli/, "pasta"],
  [/patata|papa\b|boniato|batata/, "patatas"],
  [/quinoa/, "quinoa"],
  [/c[uú]sc[uú]s|couscous|s[ée]mola|bulgur/, "cuscus"],
  // Wheat-flour bases all count as "pan": a pizza for lunch and a bocadillo
  // for dinner is the same repetition the rule exists to prevent, but until
  // these were listed the menu could serve both on the same day undetected.
  // "empanad(a|illa)" catches las dos y sus plurales, y deja fuera el
  // EMPANADO, que es rebozado y no masa: unos "Filetes de lomo empanados" y
  // un "Pollo empanado" no deben chocar con una empanada gallega. Son tres
  // platos contra seis. "tosta" catches the common short form used throughout
  // the catalog alongside "tostada".
  //
  // `picatoste` SALIÓ de la lista (21 sep 2026): un crouton nunca es la base
  // de nada, ni cuando lo dice el nombre del plato. Un «Puré de verduras con
  // picatostes» y una «Sopa de pescado con picatostes» contaban como pan por
  // el tropezón de encima, y lo que se come es el puré y la sopa. Sigue en
  // NO_ES_BASE, para el lado de los ingredientes.
  //
  // La masa se detecta por el NOMBRE del plato, no por el ingrediente. Buscar
  // "hojaldre" o "masa quebrada" en la lista de ingredientes metía aquí al
  // Solomillo Wellington y a los dos vol-au-vent, donde la masa es el envoltorio
  // y no el hidrato: que un Wellington chocara con una tosta el mismo día no es
  // precisión, es un falso positivo. Una quiche o una tarta salada sí son masa
  // —te comes la porción de masa—, y esas entran por su nombre.
  [/\bpan\b|s[áa]ndwich|bocadillo|tostada|\btosta\b|bruschetta|rebanada|pizza|wrap|burrito|quesadilla|empanad(a|illa)|migas|quiche|\btarta (salada|fina|de puerros|de cebolla)/, "pan"],
  [/avena|porridge/, "avena"],
];

// ── Ingredientes que llevan la palabra pero NO son la base ───────
// Mismo principio que el párrafo de arriba sobre el hojaldre, un paso más:
// allí el problema era la MASA que envuelve, aquí es el rebozado, el
// condimento y el adjetivo. Medido sobre el catálogo, 41 platos sin
// `mainBase` los clasificaba un ingrediente que nadie llamaría la base:
//
//   30  "Pan rallado"         → pan     un rebozado no es un hidrato: el
//                                       escalope empanado y las albóndigas
//                                       no chocan con un bocadillo
//    5  "Almendra tostada"    → pan     `tostada` como ADJETIVO. Es el mismo
//       "Avellanas tostadas"          fallo de substring de «Lard» dentro de
//                                       «Collards», con otra palabra
//    3  "Vinagre de arroz"    → arroz   un tataki de solomillo no lleva arroz
//    2  "Pan frito"           → pan     los picatostes del romesco van DENTRO
//                                       de la salsa, molidos
//
// El plato sí se clasifica por su propio NOMBRE: una "Tosta de aguacate"
// sigue siendo pan, y unas "Almendras al romero" no dejan de ser lo que son.
const NO_ES_BASE = [
  /pan rallado|panko/,
  /vinagre/,
  /pan frito|picatoste|crouton/,
  /almendra|avellana|nuez|nueces|pistacho|anacardo|cacahuete|pi[ñn][oó]n|pipa|s[ée]samo/,
  /harina|maicena|levadura/,
];

// The whole carb vocabulary, derived from the patterns instead of retyped —
// exported so the test suite can cross-check CARB_TYPE_BY_BASE against it. A
// base mapped to a carbType this list doesn't contain would classify declared
// dishes differently from undeclared ones, which is exactly the drift the
// table exists to end.
export const CARB_TYPES = CARB_PATTERNS.map(([, carbType]) => carbType);

// Text-only carb classifier — exported so aiPlanner.js can classify the
// school menu's free-text dish names (which have no ingredients array) with
// the exact same taxonomy used below, instead of a second regex list that
// could drift out of sync.
// «Almendras TOSTADAS» no es una tostada: ahí `tostada` es el adjetivo, no la
// rebanada. Como participio va detrás de su fruto seco, así que la frase
// entera se quita del texto antes de clasificar — y «Tosta de aguacate» o
// «Pan tostado», donde sí es lo que parece, siguen entrando. Es el mismo
// fallo de substring que `^sal` con «salchicha», con otra palabra.
const FRUTO_SECO_TOSTADO =
  /\b(almendras?|avellanas?|nueces|nuez|pistachos?|anacardos?|cacahuetes?|pi[ñn]ones?|pipas?|s[ée]samo|semillas?)\s+tostad[oa]s?\b/g;

export function carbTypeFromText(text) {
  const normalized = String(text ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(FRUTO_SECO_TOSTADO, " ");
  for (const [pattern, carbType] of CARB_PATTERNS) {
    if (!pattern.test(normalized)) continue;
    // "Mini quiche SIN MASA de brócoli" casaba con `quiche` y salía como pan,
    // cuando el nombre dice justo lo contrario. Solo desactiva el pan: un
    // plato puede no llevar masa y seguir siendo de arroz.
    if (carbType === "pan" && /\bsin masa\b|\bsin pan\b/.test(normalized)) continue;
    return carbType;
  }
  return null;
}

/**
 * El tipo de hidrato de un PLATO del catálogo (no de un texto suelto).
 *
 * El `mainBase` declarado manda sobre el regex, traducido por la tabla
 * CARB_TYPE_BY_BASE (data/recipeSchema.js), que es donde se explica el porqué
 * de sus dos únicas entradas no-identidad (boniato → "patatas", legumbre →
 * null). Antes se ignoraba el campo declarado y se clasificaba SIEMPRE por
 * regex sobre nombre + ingredientes, y eso hacía dos cosas mal:
 *
 *   · leía un ingrediente secundario como si fuera la base del plato — el
 *     "Trofie al pesto genovés" contaba como patatas (el pesto genovés lleva
 *     patata) y por tanto NO chocaba con otra pasta el mismo día;
 *   · no veía lo que su vocabulario no nombra — "Fettuccine Alfredo",
 *     "Linguine alle vongole" o unos "Tacos de pollo" no tenían base ninguna,
 *     así que espaguetis de comida + fettuccine de cena pasaban sin más.
 *
 * Medido contra el catálogo: 36 de 934 recetas cambian de carbType (26 del
 * catálogo estrella). Ver el bloque CARB_TYPE_BY_BASE para el reparto.
 *
 * Un plato SIN `mainBase` sigue clasificándose por regex, que es lo que
 * mantiene cubiertas las ~500 recetas que no declaran el campo (y las 109 que
 * hoy solo tienen carbType gracias a él).
 */
// Una línea que declara `preparacion` dice que ESE ingrediente es la base del
// plato: la harina del naan o de un ravioli no es harina cuando llega a la
// mesa. Ver IngredientSchema (data/recipeSchema.js) para por qué es un campo
// declarado y no un operador.
const CARB_TYPE_BY_PREPARACION = { masa_pasta: "pasta", masa_pan: "pan" };

export function getCarbType(recipe) {
  if (recipe?.mainBase && Object.hasOwn(CARB_TYPE_BY_BASE, recipe.mainBase)) {
    return CARB_TYPE_BY_BASE[recipe.mainBase];
  }
  // Antes que el regex, y por el mismo motivo que `mainBase`: lo declarado
  // gana a lo adivinado. Sin esto, el «Crumble de manzana» contaba como
  // avena por sus 50 g de copos, ignorando los 150 g de harina que son el
  // crumble — la harina está en NO_ES_BASE, que es la regla correcta para
  // el ingrediente y la equivocada para esta línea.
  const declarada = (recipe?.ingredients ?? [])
    .map((i) => CARB_TYPE_BY_PREPARACION[i.preparacion])
    .find(Boolean);
  if (declarada) return declarada;
  // EL NOMBRE PRIMERO, y solo si calla se mira la despensa.
  //
  // Antes se unían nombre e ingredientes en un solo texto y decidía el ORDEN
  // de CARB_PATTERNS, que es un orden de especificidad y no de autoridad. Así
  // un "Bocadillo de tortilla" salía `patatas`: el patrón de la patata va
  // antes que el del pan, y la patata estaba en la lista de ingredientes. El
  // plato se llama bocadillo.
  const delNombre = carbTypeFromText(recipe.name);
  if (delNombre) return delNombre;

  // Los ingredientes, y solo los que pueden SER la base (ver NO_ES_BASE). Se
  // filtra uno a uno y no sobre el texto ya unido, porque unirlo primero
  // pierde de quién era cada palabra: "Pan rallado" quedaba indistinguible de
  // un pan de verdad.
  const deIngredientes = (recipe.ingredients ?? [])
    .map((i) => i.name)
    .filter((nombre) => !NO_ES_BASE.some((re) => re.test(normName(nombre))));
  return carbTypeFromText(deIngredientes.join(" "));
}

// ── Meal ordering (chronological across the whole week) ─────────
// Shared by rule 3 (consecutive-protein) below and by applyFallback's
// targeted fix for that same rule, so both agree on what "adjacent meal"
// means — a slot's neighbors in this array are always its true chronological
// prev/next main meal, including across a day boundary (cena day N ->
// comida day N+1).
const DAY_ORDER = ["lun", "mar", "mie", "jue", "vie", "sab", "dom"];
// De lunes a viernes se come lo de diario; el fin de semana es donde caben la
// paella de marisco y el arroz de bogavante (ver la regla 3f).
const WEEKDAY_SLUGS = new Set(["lun", "mar", "mie", "jue", "vie"]);

// Coarse protein grouping shared by the school-conflict rule (4), the new
// same-day clash rule (3c) and applyFallback, so "no repetir carne/pescado el
// mismo día" means the same thing everywhere. Anything not mapped (e.g.
// "none") falls through to its raw value.
function proteinGroup(mainProtein) {
  return PROTEIN_GROUP_BY_MAIN_PROTEIN[mainProtein] ?? mainProtein;
}

// All protein GROUPS a dish carries — its mainProtein PLUS any secondary
// animal proteins declared in `extraProteins`. This is what lets a compound
// legume dish keep mainProtein "legumbre" (for frequency + the no-legumbre-in-
// cena rule) while its ternera/cerdo/pollo still block a same-day meat dish in
// the variety rules (3c, 4). "none" contributes nothing.
function proteinGroupsOf(recipe) {
  const groups = new Set();
  const add = (p) => {
    if (p && p !== "none") groups.add(proteinGroup(p));
  };
  add(recipe?.mainProtein);
  for (const p of recipe?.extraProteins ?? []) add(p);
  return groups;
}

// Raw protein VALUES a dish carries (mainProtein + extraProteins), UNGROUPED —
// unlike proteinGroupsOf, "pollo" and "cerdo" stay distinct here. Used by rule
// 3 (proteina_consecutiva), which deliberately allows switching between
// different meats/fish on consecutive meals (pollo lunch, cerdo dinner is
// normal variety) but must still catch the literal same ingredient repeating
// through a secondary protein — e.g. a "Revuelto de gambas" (mainProtein
// huevo, extraProteins ["marisco"]) right before a "Pasta con gambas"
// (mainProtein marisco): proteinGroupsOf would already collapse "huevo" out of
// the "carne" bucket comparison, but comparing by raw value is what actually
// catches this pair without also flagging every pollo-then-cerdo swap the
// group-based rules 3c/15 are fine collapsing together.
function proteinTokensOf(recipe) {
  const tokens = new Set();
  const add = (p) => {
    if (p && p !== "none") tokens.add(p);
  };
  add(recipe?.mainProtein);
  for (const p of recipe?.extraProteins ?? []) add(p);
  return tokens;
}

// Normalize a dish name for keyword scans (lowercase, strip accents), matching
// carbTypeFromText's approach so the "plato de cuchara" detector below stays
// consistent with the carb classifier.
function normName(text) {
  return String(text ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

// A "frito" dish carries the derived/declared health flag (see
// lib/healthFlags.js). Used by rule 12 to avoid two fried mains in a row.
function isFrito(recipe) {
  return (recipe?.healthFlags ?? []).includes("frito");
}

// "Plato de cuchara": soups/creams, legume stews, and any name that reads as a
// stew/broth. Used by rule 13 to avoid two spoon dishes on the same day.
const CUCHARA_NAME_RE = /\b(guiso|estofad|potaje|cocido|caldo|fabada|marmitako|puchero|olla)/;
/**
 * Los tres formatos que se comen con cuchara. El eje 6 los separa de
 * `plato_seco` y de `ensalada`, que es justo lo que este detector quería y no
 * podía: la categoría decía dónde está archivada la receta, no cómo se come.
 */
const CUCHARA_FORMATO = new Set(["sopa", "cremoso", "guiso"]);

function isPlatoCuchara(recipe) {
  if (!recipe) return false;
  // EL EJE MANDA CUANDO HABLA (749 de 1.033, ver axisRegistry §6). Medido
  // contra el detector viejo: deja de contar 28 platos que NO son de cuchara
  // —falafel, hamburguesa de garbanzos, croquetas de cocido, bocaditos de
  // lentejas— que entraban por `mainProtein: legumbre` o por la palabra
  // «cocido» dentro de «croquetas de cocido»; y empieza a contar 33 que sí lo
  // son y el nombre no delataba: ternera guisada, pollo en pepitoria, ragú,
  // merluza en salsa verde, bacalao a la vizcaína.
  if (recipe.formato) return CUCHARA_FORMATO.has(recipe.formato);
  // Y el detector viejo sigue de respaldo para el 27,5 % sin formato, que se
  // abstiene a propósito: en olla conviven «Brócoli al vapor» y «Ternera
  // guisada» sin nada en el nombre que las separe.
  if (recipe.category === "sopas_cremas" || recipe.category === "legumbres") return true;
  if (recipe.mainProtein === "legumbre") return true;
  return CUCHARA_NAME_RE.test(normName(recipe.name));
}

// Name-based, same idea as isPlatoCuchara: catches "ensalada" dishes
// regardless of which catalog category they live in. This matters because a
// hearty "ensalada completa" (e.g. "Ensalada de pollo asado con nueces y
// queso") is correctly filed under category "carnes" with mealRole
// ["segundo","plato_unico"] — a perfectly valid segundo on its own — but
// pairing it with an "ensalada"-named primero reads as two salads to the
// user even though neither dish's role/category is wrong. Used by rule 3d.
//
// Anchored at the START of the name on purpose, not a bare substring match:
// 35 real segundo dishes contain "ensalada" somewhere in the name but AREN'T
// salads themselves — e.g. "Salmón a la plancha con ensalada de pepino y
// eneldo" or "Lomo de cerdo a la plancha con ensalada de tomate y cebolla"
// are a protein main course WITH a side salad, not "a salad". Those are a
// completely normal primero+segundo pairing and must not be flagged. Only
// the 15 dishes where "Ensalada" IS the dish (starts the name) count.
const ENSALADA_NAME_RE = /^ensalada/i;
function isEnsalada(recipe) {
  if (!recipe) return false;
  // EL EJE 6 ES ESTRICTAMENTE MEJOR AQUÍ, medido: ve las 78 que el regex ve y
  // CINCO más que se le escapaban por no empezar por «Ensalada» —Ensaladilla
  // rusa, Tabulé de cuscús, Salpicón de marisco, Lentejas en ensalada
  // templada— y no pierde ninguna. El regex se queda de respaldo para lo que
  // no declara formato.
  if (recipe.formato) return recipe.formato === "ensalada";
  return ENSALADA_NAME_RE.test(recipe.name.trim());
}

// Y los que LLEVAN ensalada de acompañamiento sin serlo: "Filete de pavo a la
// plancha con ensalada de aguacate". Por sí solos son un segundo perfectamente
// normal —el comentario de arriba sigue siendo cierto— pero puestos al lado de
// un primero que SÍ es una ensalada, en la mesa hay dos ensaladas. Reportado
// tal cual: "de primero ensalada de melón con jamón y de segundo filete de
// pavo con ensalada de…". Ver la regla 3d.
//
// Vale cualquier "ensalada" dentro del nombre, no solo "con ensalada": se
// escapó "Salmón ahumado con huevo revuelto Y ensalada de aguacate y eneldo",
// que es la misma situación escrita con otra conjunción.
const CON_ENSALADA_RE = /\bensalada\b/i;
function traeEnsalada(recipe) {
  return recipe ? isEnsalada(recipe) || CON_ENSALADA_RE.test(recipe.name) : false;
}

/**
 * La "familia" de un plato: la primera palabra de su nombre, que es la que
 * dice QUE ES antes de decir de que va. Hummus, quesadilla, tortilla, wrap,
 * tosta, crema, ensalada, bowl…
 *
 * Name-based por la misma razon que isPlatoCuchara e isEnsalada: lo que el
 * usuario percibe como "otra vez lo mismo" no vive en ningun campo
 * estructurado. Dos quesadillas seguidas son "Quesadillas de queso y jamon"
 * (category carnes, mainProtein cerdo) y "Quesadilla de champiñones y queso"
 * (category ensaladas_verduras, mainProtein none): ids distintos, categorias
 * distintas y proteinas distintas, asi que NINGUNA regla de las que habia las
 * veia — ni la de receta repetida (son dos recetas) ni la de proteina.
 *
 * El plural se recorta a lo bruto (quesadillas -> quesadilla, navajas ->
 * navaja). No busca el singular correcto: solo que dos nombres de la misma
 * familia caigan en la misma cadena, y para eso "hummus" -> "hummu" vale
 * igual mientras los dos lo hagan.
 */
function dishFamily(recipe) {
  const first = normName(recipe?.name).trim().split(/\s+/)[0] ?? "";
  return first.length > 3 ? first.replace(/(es|s)$/, "") : first;
}

/**
 * LAS DIEZ DE «NO REPETIR», declaradas.
 *
 * Eran diez bloques con su bucle y su acumulador, unas 350 líneas para diez
 * celdas de una matriz de extractor × ventana. El motor está en
 * reglasNoRepetir.js; aquí solo vive la tabla, porque los extractores son
 * locales a este fichero.
 *
 * ── Por qué van en DOS bloques ────────────────────────────────────────────
 *
 * Por el orden en que se emiten las violaciones, no por nada conceptual. Cinco
 * salían entre la regla 3 y la 3e y las otras cinco después de la 8, y
 * `applyFallback` recorre `violations` en orden para decidir qué hueco
 * repara primero. Agruparlas todas movería cinco reglas de sitio y cambiaría
 * qué plato se cambia en un menú con varios problemas — un cambio de
 * comportamiento colado dentro de un refactor que no debe tener ninguno.
 *
 * Si algún día se decide que el orden da igual, se juntan y se borra el campo.
 */
const NO_REPETIR = [
  {
    bloque: 1,
    rule: "proteina_consecutiva",
    ventana: cadena,
    // Valor CRUDO, no grupo: deja pasar pollo → cerdo como variedad legítima,
    // pero pilla que las gambas de `extraProteins` de un plato de huevo choquen
    // con una pasta de gambas — que la igualdad de `mainProtein` no veía, y un
    // tester reportó marisco en casi todos los huecos por exactamente eso.
    extractor: deConjunto(proteinTokensOf),
    mensaje: ({ ra, rb, antes, despues, valor }) =>
      `Proteína "${valor}" repetida entre ${antes.slotId} ("${ra.name}") y ${despues.slotId} ("${rb.name}")`,
  },
  {
    bloque: 1,
    rule: "proteina_repetida_en_comida",
    ventana: parComida,
    // Exacta, y solo primero+segundo de la MISMA comida: un revuelto de huevo
    // seguido de una tortilla. La regla de la cadena saca los primeros a
    // propósito, y esa relajación nunca quiso decir «la misma proteína dos
    // veces en un mismo plato».
    extractor: deValor((r) => r.mainProtein),
    mensaje: ({ ra, rb, antes, valor }) =>
      `"${rb.name}" repite la proteína "${valor}" del primero ("${ra.name}") de la misma comida (${antes.daySlug})`,
  },
  {
    bloque: 1,
    rule: "proteina_repetida_en_dia",
    ventana: primeroVsCenas,
    // Por GRUPO y con el conjunto entero (mainProtein + extraProteins), para
    // que un «Cocido madrileño» —legumbre y tres carnes— bloquee también una
    // cena de carne y no solo otra de legumbre.
    extractor: deConjunto(proteinGroupsOf),
    mensaje: ({ ra, rb, antes, valor }) =>
      `"${rb.name}" repite el grupo de proteína "${valor}" del primero ("${ra.name}") el mismo día (${antes.daySlug})`,
  },
  {
    bloque: 1,
    rule: "dos_ensaladas_en_comida",
    ventana: parFranja,
    // LA ÚNICA ASIMÉTRICA, y por eso lleva comparador propio en vez de
    // extractor: uno de los dos tiene que SER ensalada, al otro le basta con
    // traerla de guarnición. Sin esa mitad se escapaba el caso más común y el
    // que de verdad se ve en la mesa — ensalada de primero, y de segundo un
    // filete con ensalada.
    comparador: (ra, rb) =>
      (isEnsalada(ra) && traeEnsalada(rb)) || (traeEnsalada(ra) && isEnsalada(rb)),
    mensaje: ({ ra, rb, antes }) =>
      `"${ra.name}" (primero) y "${rb.name}" (segundo) son ambas ensaladas en la misma comida (${antes.daySlug})`,
  },
  {
    bloque: 1,
    rule: "mismo_plato_seguido",
    ventana: diaYAnterior,
    soloUnaPorSlot: true,
    // Hummus el lunes y el martes, quesadillas el martes y el miércoles: son
    // RECETAS distintas, con otra categoría y otra proteína, así que ni la
    // regla de repetir receta ni las de proteína las veían. El catálogo tiene
    // familias enteras —seis hummus, tres quesadillas— donde «otra receta» y
    // «otro plato» no son lo mismo para quien se lo come.
    extractor: deValor(dishFamily),
    mensaje: ({ ra, rb, antes }) =>
      `"${rb.name}" repite el mismo plato que "${ra.name}" (${antes.slotId})`,
  },

  {
    bloque: 2,
    rule: "guarnicion_repetida",
    ventana: mismoDia,
    soloUnaPorSlot: true,
    extractor: deValor(getCarbType),
    mensaje: ({ rb, antes, despues, valor }) =>
      `"${rb.name}" tiene base "${valor}" repetida el ${despues.daySlug} (también en ${antes.slotId})`,
  },
  {
    bloque: 2,
    rule: "dos_fritos_seguidos",
    ventana: cadena,
    extractor: deBandera(isFrito, "frito"),
    mensaje: ({ ra, rb }) =>
      `"${rb.name}" es un frito justo después de otro frito ("${ra.name}")`,
  },
  {
    bloque: 2,
    rule: "dos_cuchara_mismo_dia",
    ventana: mismoDia,
    soloUnaPorSlot: true,
    // LOS PURÉS DE BEBÉ QUEDAN FUERA, y es la regla la que los excluye, no el
    // detector: un puré SÍ es un plato de cuchara —lo que no aplica es la
    // regla de variedad—. A los seis meses se come así, y un día entero de
    // purés no es un menú aburrido, es el menú correcto.
    //
    // Hizo falta al poner el eje `formato`: los 14 purés de bebé pasaron de no
    // contar (su categoría no es `sopas_cremas` ni `legumbres`) a contar todos
    // como `cremoso`, y las violaciones de un menú de bebé se triplicaron —de
    // 161 a 545 sobre 300 menús—. Mismo criterio que `racion.test.js`, que ya
    // dejaba los purés de bebé fuera de la regla de las sopas.
    extractor: deBandera((r) => r.category !== "bebes" && isPlatoCuchara(r), "cuchara"),
    mensaje: ({ rb, antes, despues }) =>
      `"${rb.name}" es un segundo plato de cuchara el ${despues.daySlug} (también en ${antes.slotId})`,
  },
  {
    bloque: 2,
    rule: "guarnicion_cena_consecutiva",
    ventana: cenasAdyacentes,
    extractor: deValor(getCarbType),
    mensaje: ({ ra, rb, antes, valor }) =>
      `"${rb.name}" tiene base "${valor}" igual que la cena del ${antes.daySlug} ("${ra.name}")`,
  },
  {
    bloque: 2,
    rule: "proteina_cena_consecutiva",
    ventana: cenasAdyacentes,
    extractor: deConjunto(proteinGroupsOf),
    mensaje: ({ ra, rb, antes, valor }) =>
      `"${rb.name}" repite el grupo de proteína "${valor}" de la cena del ${antes.daySlug} ("${ra.name}")`,
  },
];

/**
 * LAS REGLAS UNARIAS: las que se deciden mirando SOLO el plato y su hueco.
 *
 * ── El problema que cierran ───────────────────────────────────────────────
 *
 * Siete de estas ya estaban escritas DOS VECES: aquí y en `candidatosDeHueco`
 * del solver, que las reimplementa para podar el dominio. El propio solver lo
 * reconoce —«son unarias: puestas aquí, un hígado encebollado NO llega
 * siquiera a probarse un miércoles»— y es una decisión correcta de
 * rendimiento, pero dejaba siete reglas con dos redacciones que pueden
 * divergir en silencio. Es exactamente el fallo que la cabecera del solver
 * jura evitar, cometido por el solver.
 *
 * Con la tabla, `validateMenu` las evalúa y `candidatosDeHueco` las filtra
 * desde la MISMA declaración. Ya no pueden separarse.
 *
 * ── Tres no se podan todavía ──────────────────────────────────────────────
 *
 * Los dos conflictos con el menú escolar y el perfil de salud son unarios y
 * el solver NO los poda: se prueban y rebotan en cada nodo. Están declarados
 * igual, pero enchufarlos a la poda CAMBIA qué menús salen —podar de más
 * estrecha el dominio— así que es un paso aparte y se mide antes.
 */
export const UNARIAS = [
  {
    rule: "rol_incompatible_con_hueco",
    cumple: (r, h) => slotAcceptsRole(r, { mealType: h.mealType, position: h.position, preferType: h.preferType }),
    mensaje: (r, h) => `"${r.name}" (${(r.mealRole ?? []).join("/") || "sin rol"}) no encaja en ${h.slotId}`,
  },
  {
    rule: "tiempo_excedido",
    cumple: (r, h) => !h.maxTime || r.time <= h.maxTime,
    mensaje: (r, h) => `"${r.name}" (${r.time}min) excede el límite de ${h.maxTime}min`,
  },
  {
    rule: "tupper_not_friendly",
    cumple: (r, h) => h.mode !== "tupper" || Boolean(r.tupperFriendly),
    mensaje: (r) => `"${r.name}" no es apta para tupper pero el slot lo requiere`,
  },
  {
    // Un plato de montaje no es una COMIDA. De CENA sí, cuando su ficha lo
    // dice: vetarlo en todas partes dejaba fuera a 43 platos estrella con
    // "cena" en su `mealRole` —carpaccio, wrap, quesadillas, poke bowl— y el
    // motor volvía una y otra vez a la tortilla.
    rule: "cena_rapida_no_solicitada",
    cumple: (r, h) => {
      if (!isMontaje(r)) return true;
      if (h.preferType === "cena_rapida") return true;
      // `mealTypeDeclarado`, NO `mealType`: esta regla siempre leyó el contexto
      // crudo, sin el respaldo de partir el slotId que sí usa la del rol. La
      // diferencia es real y la cazó un test — un hueco "lun_cena" sin contexto
      // declarado tiene que seguir marcando el montaje, porque nadie ha dicho
      // que esa cena admita uno.
      return h.mealTypeDeclarado === "cena" && (r.mealRole ?? []).includes("cena");
    },
    mensaje: (r) => `"${r.name}" es un plato de montaje pero el slot no fue marcado como cena rápida`,
  },
  {
    // Por categoría O por proteína, para que una «Crema de lentejas» archivada
    // en sopas_cremas cuente igual.
    rule: "legumbres_en_cena",
    cumple: (r, h) => h.mealType !== "cena" || (r.category !== "legumbres" && r.mainProtein !== "legumbre"),
    mensaje: (r) => `"${r.name}" es legumbre y no debería ir en cena`,
  },
  {
    // Lo que hace raro un hígado un miércoles no es el tiempo ni la dificultad
    // —para el motor era un segundo rápido, igual que un filete—: es que la
    // casquería se come cuando se elige. Se DERIVA de los ingredientes para que
    // el catálogo pueda crecer sin que la regla se quede vieja en silencio.
    rule: "casqueria_entre_semana",
    cumple: (r, h) => !WEEKDAY_SLUGS.has(h.daySlug) || !esCasqueria(r),
    mensaje: (r, h) => `"${r.name}" es casquería: va en fin de semana, no un ${h.daySlug}`,
  },
  {
    rule: "plato_ocasion_entre_semana",
    cumple: (r, h) => !WEEKDAY_SLUGS.has(h.daySlug) || r?.occasion !== "especial",
    mensaje: (r, h) => `"${r.name}" es plato de ocasión y ${h.daySlug} es día de diario`,
  },
  {
    // Se mira DONDE ESTÉ EL CAMPO, no solo en cena: cuando los niños cenan lo
    // que los padres comieron, `buildGroupContext` cuelga esto del segundo de
    // la comida. Un `if (mealType !== "cena")` lo saltaba, y el día que el niño
    // comía pollo en el cole nada impedía que los padres comieran pollo.
    rule: "school_protein_conflict",
    cumple: (r, h) => !h.schoolProteinsToAvoid?.length
      || ![...proteinGroupsOf(r)].some((g) => h.schoolProteinsToAvoid.includes(g)),
    mensaje: (r, h) => {
      const clash = [...proteinGroupsOf(r)].find((g) => h.schoolProteinsToAvoid.includes(g));
      return `"${r.name}" tiene proteína "${clash}" que el menú escolar ya cubrió`;
    },
  },
  {
    rule: "school_carb_conflict",
    cumple: (r, h) => {
      if (!h.schoolCarbsToAvoid?.length) return true;
      const carb = getCarbType(r);
      return !carb || !h.schoolCarbsToAvoid.includes(carb);
    },
    mensaje: (r) => `"${r.name}" tiene base "${getCarbType(r)}" que el menú escolar ya cubrió`,
  },
  {
    // Unaria respecto al PLATO, pero su parámetro es del hogar y no del hueco,
    // así que `huecoDe` se lo cuelga a todos por igual.
    rule: "health_profile_conflict",
    cumple: (r, h) => {
      const perfiles = h.activeHealthProfiles ?? [];
      if (perfiles.length === 0) return true;
      const flags = r.healthFlags ?? [];
      return !perfiles.some((id) => !HEALTH_PROFILE_BADGE[id].matches(flags));
    },
    mensaje: (r, h) => {
      const flags = r.healthFlags ?? [];
      const violados = (h.activeHealthProfiles ?? []).filter((id) => !HEALTH_PROFILE_BADGE[id].matches(flags));
      return `"${r.name}" no cumple el/los perfil(es) de salud activos: ${violados.join(", ")}`;
    },
  },
];

/** La tabla por nombre, para que el solver coja solo las que quiere podar. */
export const UNARIA_POR_REGLA = Object.fromEntries(UNARIAS.map((u) => [u.rule, u]));

/**
 * Un hueco con todo lo que las unarias pueden preguntar, venga del validador
 * o del solver. El `slotId` se parte como respaldo porque no todos los
 * contextos declaran `mealType`/`position` — así estaba ya en la regla del rol.
 */
export function huecoDe(slotId, ctx = {}, extra = {}) {
  const partes = String(slotId).split("_");
  return {
    slotId,
    daySlug: ctx.daySlug ?? partes[0],
    mealType: ctx.mealType ?? partes[1],
    position: ctx.position ?? partes[2],
    // Sin respaldo, y hace falta: no todas las reglas leían el contexto igual.
    // La del rol partía el slotId cuando el contexto callaba; la del montaje
    // no, y esa diferencia decide si un hueco "lun_cena" sin contexto admite
    // un sándwich. Uniformarlas sin darse cuenta era un cambio de
    // comportamiento disfrazado de limpieza.
    mealTypeDeclarado: ctx.mealType,
    preferType: ctx.preferType,
    maxTime: ctx.maxTime,
    mode: ctx.mode,
    schoolProteinsToAvoid: ctx.schoolProteinsToAvoid,
    schoolCarbsToAvoid: ctx.schoolCarbsToAvoid,
    ...extra,
  };
}

/**
 * Evalúa una unaria sobre una lista de huecos.
 *
 * La LISTA se pasa desde fuera —unas reglas recorrían `slotAssignments` y
 * otras `mealOrder`— porque las dos no llevan el mismo orden: `mealOrder` está
 * ordenada por día y `slotAssignments` viene como la devolvió quien la montó.
 * Cambiar cuál usa cada regla cambiaría el orden de `violations`, y de eso
 * depende qué hueco repara `applyFallback` primero.
 */
function evaluarUnaria(regla, huecos, poolById, contextBySlot, extra) {
  const out = [];
  for (const { slotId, recipeId } of huecos) {
    const receta = poolById[recipeId];
    if (!receta) continue;
    const hueco = huecoDe(slotId, contextBySlot[slotId] ?? {}, extra);
    if (regla.cumple(receta, hueco)) continue;
    out.push({ rule: regla.rule, slotId, message: regla.mensaje(receta, hueco) });
  }
  return out;
}

function buildMealOrder(slotAssignments) {
  const mealOrder = [];
  for (const { slotId, recipeId } of slotAssignments) {
    const parts = slotId.split("_");
    const daySlug = parts[0];
    const mealType = parts[1];
    const position = parts[2];
    const dayIdx = DAY_ORDER.indexOf(daySlug);
    mealOrder.push({ slotId, recipeId, daySlug, dayIdx, mealType, position });
  }
  mealOrder.sort((a, b) => {
    if (a.dayIdx !== b.dayIdx) return a.dayIdx - b.dayIdx;
    if (a.mealType === "comida" && b.mealType === "cena") return -1;
    if (a.mealType === "cena" && b.mealType === "comida") return 1;
    return (a.position ?? "").localeCompare(b.position ?? "");
  });
  return mealOrder;
}

// A "comida_1" slot is normally a light primero (soup/salad, mainProtein
// "none") that shouldn't collide-check against segundo/cena — EXCEPT when it
// holds a plato_unico (paella, cocido...), which carries the day's actual
// protein just like any other main dish and must stay visible to rule 3.
// Recipes that don't resolve in `poolById` (already flagged by rule 1) are
// treated as non-main, same as before.
function mainMealsOf(mealOrder, poolById) {
  return mealOrder.filter((m) => {
    if (!(m.mealType === "comida" && m.position === "1")) return true;
    const r = poolById[m.recipeId];
    return Boolean(r?.mealRole?.includes("plato_unico"));
  });
}

// ── Weekly frequency targets (config.freqs) ──────────────────────
// Mirrors the SYSTEM_PROMPT's "OBJETIVOS SEMANALES (config.freqs)" mapping
// exactly (aiPlanner.js), so the deterministic check enforces the same
// categories the LLM is asked to aim for. A recipe can count toward more
// than one key (e.g. a chicken-and-rice dish is both "carne" and
// "pasta_arroz"), matching the prompt's own per-bullet "category X OR
// mainProtein Y" wording.
//
// Uses proteinGroupsOf (mainProtein + extraProteins), not a bare mainProtein
// check: without this, a dish whose animal protein is secondary — e.g.
// "Revuelto de gambas" (mainProtein huevo, extraProteins ["marisco"]) — only
// ever counted toward "huevos" and never toward "pescado", so the weekly
// pescado cap couldn't see it at all. That let marisco dishes stack up
// unbounded regardless of the configured limit (a tester reported gambas in
// nearly every slot of the week).
// Las bases que son fécula "de plato" — las que hacen que un plato cuente como
// pasta_arroz aunque esté archivado en carnes o ensaladas. Subconjunto
// deliberado de MAIN_BASES: sin patatas/boniato (guarnición) ni legumbre (ya
// cuenta por proteína). Ver el comentario de `pasta_arroz` justo debajo.
const FECULAS = new Set(["arroz", "pasta", "quinoa", "cuscus"]);

// ── Los MÁXIMOS leen IDENTIDAD, no aporte ──────────────────────────────────
// `category` (más la proteína y la fécula declaradas) dice qué ES el plato;
// `aporteDe` (lib/aporte.js) dice qué RACIONES entrega, y un plato entrega
// varias a la vez. Los topes semanales son máximos sobre la identidad: "como
// mucho dos platos DE pasta". Hubo una versión que contaba aquí por aporte, y
// el solver (lib/solver.js) demostró al primer intento por qué no:
//   · verdura como tope + aporte = "evita la verdura": 277 platos la entregan,
//     así que con el tope en 3 había que esquivarla en 18 de 21 huecos;
//   · seis topes que suman 21 sobre 21 huecos, con cada plato consumiendo dos o
//     tres topes a la vez → sin solución posible (12/21 tras 5000 nodos).
// `aporte` es para los MÍNIMOS ("al menos 4 días con verdura"), que todavía no
// existen como regla, y viaja al prompt como información para repartir.

export const FREQ_KEY_MATCHERS = {
  carne: (r) => r.category === "carnes" || proteinGroupsOf(r).has("carne"),
  pescado: (r) => r.category === "pescados" || proteinGroupsOf(r).has("pescado"),
  legumbres: (r) => r.category === "legumbres" || proteinGroupsOf(r).has("legumbres"),
  huevos: (r) => r.category === "huevos" || proteinGroupsOf(r).has("huevos"),
  // Por categoría O por `mainBase` declarado. Solo la categoría dejaba fuera
  // 29 platos del estrella que ENTREGAN una ración de fécula y viven en otro
  // cajón: "Lomo saltado" y "Pollo tikka masala" (carnes, mainBase arroz),
  // "Tabulé de cuscús" (ensaladas, mainBase cuscus), los bowls de quinoa…
  // Cuatro días de pollo con arroz y el tope de pasta_arroz no se enteraba.
  //
  // Solo las FÉCULAS de verdad (arroz, pasta, quinoa, cuscús). `patatas` y
  // `boniato` se quedan fuera a propósito: la patata es guarnición, no plato,
  // y no va en este cubo — la vigilan las reglas 9 y 14 por `carbType` y, el
  // día que haga falta, un tope propio. `legumbre` ya cuenta por mainProtein.
  pasta_arroz: (r) => r.category === "pasta_arroces" || FECULAS.has(r.mainBase),
  verdura: (r) => r.category === "ensaladas_verduras" || r.category === "sopas_cremas",
};

/**
 * Split a freqs target into the keys the filtered pool can realistically
 * satisfy vs. the ones it can't — e.g. `{ pescado: 2 }` when only one pescado
 * recipe survived the allergy/preference filter. Retrying the LLM (or the
 * deterministic fallback) can never fix an unachievable key, since there
 * simply aren't enough matching recipes in the pool to place — so callers
 * should only feed `achievable` into validateMenu's rule 11, and surface
 * `warnings` to the user instead of silently shipping an unbalanced week.
 *
 * @param {Object[]} filteredPool
 * @param {Object} freqs - e.g. { carne: 3, pescado: 2, ... }
 * @returns {{ achievable: Object, warnings: string[] }}
 */
export function splitAchievableFreqs(filteredPool, freqs) {
  const achievable = {};
  const warnings = [];
  for (const [key, target] of Object.entries(freqs ?? {})) {
    if (target == null || target < 0) continue;
    const matcher = FREQ_KEY_MATCHERS[key];
    if (!matcher) continue; // unknown/custom key — ignore rather than crash
    // Un tope de CERO es un objetivo legítimo y siempre alcanzable: "esta
    // semana, nada de carne". Aquí se descartaba junto a los nulos, y un cero
    // salía de esta función como "sin tope", o sea lo contrario de lo que
    // pidió el usuario: un estilo de comida sin carne producía trece platos de
    // carne en veintiún huecos. La comprobación de disponibilidad de abajo no
    // aplica —no hace falta ninguna receta para no poner ninguna—, así que
    // pasa directo.
    if (target === 0) {
      achievable[key] = 0;
      continue;
    }
    const available = filteredPool.filter(matcher).length;
    if (available < target) {
      warnings.push(
        `El objetivo semanal de "${key}" (${target}/semana) no es alcanzable: solo hay ${available} receta(s) de esa categoría tras aplicar alergias/preferencias. Se ha omitido ese objetivo para no bloquear el menú.`,
      );
    } else {
      achievable[key] = target;
    }
  }
  return { achievable, warnings };
}

/**
 * Qué bases pedidas puede dar la semana ENTERAS, y cuáles hay que dejar fuera.
 *
 * Todo o nada, y es una decisión de producto, no una limitación técnica: pedir
 * dos platos de sofrito y colocar uno no deja al usuario a medias, lo deja en
 * cero. Una tanda existe porque DOS platos comparten la olla; con uno solo, lo
 * cocinas ese día y no hay nada que partir.
 *
 * Se cae una base por dos motivos: la semana no tiene huecos para tantos (una
 * semana acortada) o el recetario no tiene tantos platos con esa base después
 * de alergias y preferencias (cuscús tiene seis en todo el catálogo).
 *
 * @returns {{alcanzables: Record<string, number>, warnings: string[]}}
 */
export function basesAlcanzables(filteredPool, basesPedidas, huecos) {
  const alcanzables = {};
  const warnings = [];
  for (const [clave, pedidas] of Object.entries(basesPedidas ?? {})) {
    if (!(pedidas > 0)) continue;
    const disponibles = filteredPool.filter((r) => clavesDeReceta(r).includes(clave)).length;
    if (disponibles < pedidas) {
      warnings.push(
        `No caben ${pedidas} platos con "${clave}": el recetario solo tiene ${disponibles} tras aplicar alergias y preferencias. Se deja fuera esa tanda entera, porque con menos no ahorra nada.`,
      );
      continue;
    }
    if (huecos != null && huecos < pedidas) {
      warnings.push(
        `No caben ${pedidas} platos con "${clave}" en una semana de ${huecos} hueco(s). Se deja fuera esa tanda entera.`,
      );
      continue;
    }
    alcanzables[clave] = pedidas;
  }
  return { alcanzables, warnings };
}

// Soft ceiling for primero + segundo of the same comida (see rule 7b).
// Derived from this catalog: median comida ≈ 606 kcal, p90+p90 ≈ 862, worst
// possible pairing ≈ 1006. 850 sits above the normal range and only catches
// two-main-sized-dishes-at-once. Tune here if the catalog's balance shifts.
// It's a QUALITY preference: applyFallback relaxes it before leaving a hole.
export const COMIDA_KCAL_SOFT_CAP = 850;

/**
 * Cuánto se admite por encima del presupuesto de la comida (regla 7c), una vez
 * contado el solape de la cocina.
 */
export const SOLAPE_COMIDA = 1.25;

/**
 * El mismo techo, para una CENA de dos platos (regla 7b).
 *
 * Más bajo que el de la comida a propósito: una cena es más ligera, y eso ya
 * lo dice el catálogo solo — los platos con rol `cena` tienen 360 kcal de
 * mediana frente a los 445 de un segundo de comida.
 *
 * El número sale de la misma cuenta que el de la comida, sobre las cenas: un
 * primero de cena típico (crema, gazpacho, ensalada) son 262 kcal de mediana y
 * un plato de cena 360, así que la pareja normal ronda las 620. 700 se queda
 * por encima de lo normal y por debajo de las parejas pesadas — un gazpacho
 * con una tortilla y su ensalada entra de sobra; una crema con una hamburguesa
 * de 800, no. Si no existiera este techo, poner una crema delante serviría
 * para cenar MÁS, que es justo lo contrario.
 */
export const CENA_KCAL_SOFT_CAP = 700;

/**
 * Cuántas noches puede repetirse la MISMA sopa como entrada de una cena de dos
 * platos (regla 6).
 *
 * Tres, que es lo que da una olla. Es la única excepción a "no repetir plato en
 * la semana", y no es una concesión: nadie hace una crema distinta cada noche.
 * Se hace una el domingo y se tira de ella.
 *
 * Además es lo que hace posible la cena de dos platos. Las entradas salen solo
 * del cajón de sopas y cremas, y con 30 minutos entre semana caben ocho para
 * siete noches: sin repetir, quedaban diez cenas sin entrada de cada 112.
 */
export const VECES_MISMA_SOPA = 3;

/**
 * Cuánto se tarda de verdad en hacer dos platos: el LARGO entero más la mitad
 * del corto.
 *
 * Sumarlos era el modelo equivocado, y se vio en cuanto alguien pidió comidas
 * de 20 minutos: los primeros que caben en 20 minutos duran justo 20, así que
 * al segundo le quedaban diez y no entraba nada — cuatro días de dos semanas
 * se quedaron con un solo plato. Pero nadie cocina dos platos en fila: la
 * ensalada se monta mientras el pescado está en el horno. Lo que no es cierto
 * es lo contrario, que salgan gratis, porque hay un rato de manos que no se
 * puede partir en dos; de ahí la mitad y no cero.
 */
export function tiempoDeLaComida(t1, t2) {
  const a = t1 ?? 0;
  const b = t2 ?? 0;
  return Math.round(Math.max(a, b) + Math.min(a, b) / 2);
}

/**
 * Does this recipe's mealRole fit the slot it's been placed in?
 *
 * SINGLE SOURCE OF TRUTH, shared by the validation rule below and by
 * applyFallback's candidate searches. Keeping them in one function is the
 * whole point: this constraint used to live ONLY inside applyFallback, so a
 * cena-only dish (e.g. "Quesadillas caseras") placed in a comida slot was
 * never flagged as a violation — and because nothing flagged it, the repair
 * that knew perfectly well how to fix it never ran. It shipped to the user.
 *
 * `plato_unico` is deliberately NOT accepted for a "primero" slot: a plato
 * único IS the whole meal (lasaña 562 kcal, carbonara 548…), so allowing it
 * as a first course produced a first course as heavy as a main, plus a second
 * course on top. It stays valid only where the slot itself is a single-dish
 * meal (user-marked "plato único", or the 1_plato structure).
 *
 * @param {{ mealRole?: string[] }} recipe
 * @param {{ mealType?: string, position?: string, preferType?: string }} slot
 *   `position` accepts both the semantic form used by aiPlanner's slot
 *   objects ("primero" | "segundo" | "plato_unico") and the raw form parsed
 *   out of a slotId ("1" | "2"), since callers have one or the other.
 */
/**
 * De qué cajón sale el primer plato de una cena: sopas y cremas, y nada más.
 *
 * Aquí viven también el gazpacho y la crema fría, así que la forma de la cena
 * queda clara y de una pieza: algo de cuchara delante y el plato detrás. Sopa
 * y tortilla, sopa y tortilla con ensalada.
 *
 * Hubo una versión que admitía además ensaladas y verduras. Sobraba: si la
 * ensalada puede ser el primero Y la guarnición del segundo, la cena deja de
 * tener una forma reconocible y hay que ponerse a distinguir cuál es cuál.
 */
const ENTRADAS_DE_CENA = new Set(["sopas_cremas"]);

export function slotAcceptsRole(recipe, slot = {}) {
  const roles = recipe?.mealRole ?? [];
  const { mealType, position, preferType } = slot;

  if (mealType === "cena") {
    // En una cena de DOS platos, el primero es un plato de ENTRADA: una crema,
    // un gazpacho, una ensalada. Eso es exactamente lo que dice el rol
    // `primero`, y hay 156 en el recetario entre sopas y ensaladas, así que
    // pedirlo no deja la cena sin candidatos.
    //
    // Y hay que pedirlo: aceptando también el rol `cena` salían parejas al
    // revés —unos filetes de pavo de entrada y una sopa de tomate detrás—
    // porque para el motor los dos huecos admitían lo mismo.
    //
    // El segundo sí va por `cena`, que es donde vive "esto se puede cenar". En
    // una cena de un solo plato no hay posición y manda `cena`, como siempre.
    //
    // Y no basta con el rol: un primero de COMIDA puede ser un plato de pasta,
    // y de entrada en una cena eso no es una entrada, es la cena. Se pide
    // además que sea de lo que se pone delante por la noche — sopa, crema,
    // gazpacho, ensalada o verdura. Sin este filtro salían parejas como "pasta
    // con pesto de primero y puré de verduras de segundo", que es la cena del
    // revés.
    if (position === "primero" || position === "1") {
      return roles.includes("primero") && ENTRADAS_DE_CENA.has(recipe?.category);
    }
    return roles.includes("cena");
  }
  if (position === "plato_unico" || preferType === "plato_unico") {
    return roles.includes("plato_unico");
  }
  if (position === "primero" || position === "1") return roles.includes("primero");
  if (position === "segundo" || position === "2") return roles.includes("segundo");
  // Unknown/!unconstrained slot shape — don't invent a restriction.
  return true;
}

export function validateMenu(
  slotAssignments,
  filteredPool,
  slotsContext,
  activeHealthProfiles = [],
  freqs = {},
  basesPedidas = {},
) {

  // Lo que las unarias necesitan y NO viene del hueco: los perfiles de salud
  // son del hogar, así que se cuelgan de todos los huecos por igual.
  //
  // `anemia` queda fuera (CORRECTABLE_HEALTH_PROFILES) porque es el único
  // perfil de PRESENCIA —«tiene que llevar hierro»— en vez de ausencia:
  // tratarlo igual marcaría casi todos los huecos de la semana y pelearía con
  // las reglas de variedad. Se queda como sesgo blando en el prompt.
  const unariaExtra = {
    activeHealthProfiles: Array.from(new Set(activeHealthProfiles ?? []))
      .filter((id) => CORRECTABLE_HEALTH_PROFILES.has(id)),
  };
  const violations = [];
  const poolIds = new Set(filteredPool.map((r) => r.id));
  const poolById = Object.fromEntries(filteredPool.map((r) => [r.id, r]));

  const contextBySlot = Object.fromEntries(
    slotsContext.map((s) => [s.slotId, s]),
  );

  const mealOrder = buildMealOrder(slotAssignments);

  const returnedIds = new Set(slotAssignments.map((s) => s.slotId));

  // Las parejas primero+segundo de cada día, por franja.
  //
  // La comida las tuvo siempre. La cena puede tenerlas desde que existe la
  // estructura de cena de dos platos (una crema y algo ligero detrás), y sus
  // slotIds tienen la misma forma — "lun_cena_1", "lun_cena_2" — así que
  // `buildMealOrder` ya les saca la posición sin tocar nada.
  //
  // Las reglas de PAREJA (dos ensaladas, peso, tiempo, falta el segundo) leen
  // este mapa y valen para las dos franjas. Las que hablan solo de la comida
  // —el primero que arrastra proteína al día entero— siguen leyendo
  // `comidaByDay`, que se construye en la misma pasada.
  const parejasPorDia = {};
  const comidaByDay = {};
  for (const m of mealOrder) {
    if (m.position === "1" || m.position === "2") {
      const clave = `${m.daySlug}|${m.mealType}`;
      if (!parejasPorDia[clave]) parejasPorDia[clave] = { daySlug: m.daySlug, mealType: m.mealType };
      parejasPorDia[clave][m.position] = m;
    }
    if (m.mealType !== "comida") continue;
    if (!comidaByDay[m.daySlug]) comidaByDay[m.daySlug] = {};
    comidaByDay[m.daySlug][m.position] = m;
  }

  // 0. Missing slots — every expected slot must be covered
  for (const ctx of slotsContext) {
    if (!returnedIds.has(ctx.slotId)) {
      violations.push({
        rule: "slot_faltante",
        slotId: ctx.slotId,
        message: `El LLM no devolvió asignación para ${ctx.slotId}`,
      });
    }
  }

  // 1. All recipeIds must exist in filtered pool
  for (const { slotId, recipeId } of slotAssignments) {
    if (!poolIds.has(recipeId)) {
      violations.push({
        rule: "recipeId_not_in_catalog",
        slotId,
        message: `recipeId "${recipeId}" no existe en el catálogo filtrado`,
      });
    }
  }

  violations.push(...evaluarUnaria(
    UNARIA_POR_REGLA.legumbres_en_cena, mealOrder, poolById, contextBySlot, unariaExtra,
  ));

  violations.push(...evaluarUnaria(
    UNARIA_POR_REGLA.rol_incompatible_con_hueco, slotAssignments, poolById, contextBySlot, unariaExtra,
  ));

  violations.push(...evaluarUnaria(
    UNARIA_POR_REGLA.cena_rapida_no_solicitada, slotAssignments, poolById, contextBySlot, unariaExtra,
  ));

  // ── Las cinco de NO REPETIR que salen aquí (reglas 3, 3b, 3c, 3d, 3e) ────
  //
  // Eran cinco bucles con su propio acumulador. Ahora son cinco filas de la
  // tabla NO_REPETIR de arriba y el motor vive en reglasNoRepetir.js.
  //
  // Siguen saliendo en ESTE punto del recorrido, y no agrupadas con las otras
  // cinco, porque `applyFallback` lee `violations` en orden para decidir qué
  // hueco repara primero: moverlas cambiaría qué plato se sustituye en un menú
  // con varios problemas, y eso es un cambio de comportamiento colado dentro
  // de un refactor que no debe tener ninguno.
  // La cadena cronológica de platos principales: `mainMealsOf` deja fuera los
  // primeros de comida a propósito (ver su comentario), y de ahí salen las dos
  // reglas que dicen «seguidos».
  const mainMeals = mainMealsOf(mealOrder, poolById);
  const ctxNoRepetir = {
    mealOrder, poolById, mainMeals, parejasPorDia, comidaByDay, DAY_ORDER,
  };
  violations.push(...evaluarNoRepetir(NO_REPETIR.filter((r) => r.bloque === 1), ctxNoRepetir));


  violations.push(...evaluarUnaria(
    UNARIA_POR_REGLA.casqueria_entre_semana, mealOrder, poolById, contextBySlot, unariaExtra,
  ));

  violations.push(...evaluarUnaria(
    UNARIA_POR_REGLA.plato_ocasion_entre_semana, mealOrder, poolById, contextBySlot, unariaExtra,
  ));

  violations.push(...evaluarUnaria(
    UNARIA_POR_REGLA.school_protein_conflict, mealOrder, poolById, contextBySlot, unariaExtra,
  ));

  violations.push(...evaluarUnaria(
    UNARIA_POR_REGLA.school_carb_conflict, mealOrder, poolById, contextBySlot, unariaExtra,
  ));

  violations.push(...evaluarUnaria(
    UNARIA_POR_REGLA.tupper_not_friendly, slotAssignments, poolById, contextBySlot, unariaExtra,
  ));

  // 6. No repeated recipeId in the week
  //
  //    Con UNA excepción, y es la olla de sopa: la entrada de una cena de dos
  //    platos puede repetirse hasta VECES_MISMA_SOPA veces. Nadie hace una
  //    crema distinta cada noche — se hace una olla el domingo y da para tres.
  //
  //    Sin esta excepción la cena de dos platos no se sostiene: las entradas
  //    salen solo del cajón de sopas y cremas, y con 30 minutos entre semana
  //    hay OCHO que quepan para siete noches. Medido: 10 huecos vacíos de 112.
  //    No es una concesión, es cómo se cocina.
  const usedRecipeIds = new Map();
  const vecesDeEntrada = new Map();
  const esEntradaDeCena = (slotId) => {
    const ctx = contextBySlot[slotId];
    return ctx?.mealType === "cena" && (ctx?.position === "primero" || ctx?.position === "1");
  };
  for (const { slotId, recipeId } of slotAssignments) {
    if (esEntradaDeCena(slotId)) {
      const previas = vecesDeEntrada.get(recipeId) ?? 0;
      // Solo si TODAS sus apariciones son entradas de cena: la misma crema de
      // primero de comida y de entrada de cena sigue siendo una repetición.
      if (!usedRecipeIds.has(recipeId) || previas > 0) {
        vecesDeEntrada.set(recipeId, previas + 1);
        if (previas + 1 <= VECES_MISMA_SOPA) {
          if (!usedRecipeIds.has(recipeId)) usedRecipeIds.set(recipeId, slotId);
          continue;
        }
      }
    }
    if (usedRecipeIds.has(recipeId)) {
      const firstSlotId = usedRecipeIds.get(recipeId);
      violations.push({
        rule: "recipeId_repetido",
        slotId,
        // firstSlotId (structured, not just in the message) lets applyFallback
        // tell a same-day repeat (e.g. comida y cena del mismo plato — the
        // worse outcome) from a cross-day one without parsing message text.
        firstSlotId,
        message: `recipeId "${recipeId}" ya usado en ${firstSlotId}`,
      });
    } else {
      usedRecipeIds.set(recipeId, slotId);
    }
  }

  // 7. Estructura de la franja: primero+segundo, o un plato que vale por los
  //    dos. Vale igual para una comida y para una cena de dos platos.
  for (const { daySlug, "1": slot1, "2": slot2 } of Object.values(parejasPorDia)) {
    if (slot1 && !slot2) {
      const recipe = poolById[slot1.recipeId];
      if (recipe && !recipe.mealRole.includes("plato_unico")) {
        violations.push({
          rule: "comida_sin_segundo",
          slotId: slot1.slotId,
          message: `${daySlug}: solo hay primero "${recipe.name}" sin segundo, y no es plato_unico`,
        });
      }
    }
  }

  // 7b. Primero + segundo shouldn't add up to a disproportionate comida.
  //
  // This is a PROPORTION heuristic for menu balance, not a nutritional target:
  // it only asks that a two-course lunch not be built from two main-sized
  // dishes at once. A cap on either dish alone would be wrong — "macarrones
  // con tomate" (412 kcal) is a perfectly normal Spanish primero — so the
  // rule looks at the pair. The threshold comes from this catalog's own
  // distribution: a typical comida is ~606 kcal (median primero 228 + median
  // segundo 378) and the heaviest possible pairing reaches ~1006. See
  // COMIDA_KCAL_SOFT_CAP — it's a starting value, meant to be tuned.
  //
  // La cena de dos platos tiene su propio techo y más bajo (CENA_KCAL_SOFT_CAP):
  // una cena es más ligera que una comida, y si el par no lo respetara, poner
  // una crema delante serviría para comer MÁS, que es lo contrario de lo que
  // se busca.
  for (const { daySlug, mealType, "1": first, "2": second } of Object.values(parejasPorDia)) {
    if (!first || !second) continue;
    const r1 = poolById[first.recipeId];
    const r2 = poolById[second.recipeId];
    if (!r1 || !r2) continue;
    const total = (r1.kcal ?? 0) + (r2.kcal ?? 0);
    const tope = mealType === "cena" ? CENA_KCAL_SOFT_CAP : COMIDA_KCAL_SOFT_CAP;
    if (total > tope) {
      violations.push({
        rule: "comida_desproporcionada",
        // Points at the segundo: swapping the main is the less disruptive fix
        // (the primero is usually the lighter, more "structural" half).
        slotId: second.slotId,
        message: `${daySlug}: "${r1.name}" + "${r2.name}" suman ${total} kcal, demasiado para una ${mealType} de dos platos`,
      });
    }
  }

  // 7c. La COMIDA entera cabe en el tiempo que dijo quien cocina.
  //
  // El deslizador de tiempo es el presupuesto de la comida, no de cada plato,
  // y cada plato por su lado ya cabe en él (regla 8). Lo que falta es que la
  // pareja no se vaya: dos platos de media hora no son una comida de media
  // hora.
  //
  // El factor no es 1: los dos platos se solapan en la cocina —la ensalada se
  // monta mientras el horno trabaja— así que sumar sus tiempos como si fueran
  // consecutivos es la lectura más estricta posible, y ya se probó: repartía
  // el presupuesto 40/60 y dejaba el primero en 12 minutos, con cuatro platos
  // posibles en todo el catálogo. `SOLAPE_COMIDA` es cuánto se admite de más
  // sobre el presupuesto contando ese solape.
  for (const { daySlug, "1": first, "2": second } of Object.values(parejasPorDia)) {
    if (!first || !second) continue;
    const presupuesto = contextBySlot[first.slotId]?.mealBudget ?? contextBySlot[second.slotId]?.mealBudget;
    if (!presupuesto) continue;
    const r1 = poolById[first.recipeId];
    const r2 = poolById[second.recipeId];
    if (!r1 || !r2) continue;
    const total = tiempoDeLaComida(r1.time, r2.time);
    const tope = Math.round(presupuesto * SOLAPE_COMIDA);
    if (total > tope) {
      violations.push({
        rule: "comida_demasiado_larga",
        // Al segundo, igual que `comida_desproporcionada`: cambiar el principal
        // molesta menos que cambiar el primero.
        slotId: second.slotId,
        message: `${daySlug}: "${r1.name}" (${r1.time}min) + "${r2.name}" (${r2.time}min) son ${total}min de cocina para una comida de ${presupuesto}min`,
      });
    }
  }

  violations.push(...evaluarUnaria(
    UNARIA_POR_REGLA.tiempo_excedido, slotAssignments, poolById, contextBySlot, unariaExtra,
  ));

  violations.push(...evaluarUnaria(
    UNARIA_POR_REGLA.health_profile_conflict, slotAssignments, poolById, contextBySlot, unariaExtra,
  ));

  // 11. Weekly frequency CAPS (config.freqs) — soft, correctable MAXIMUMS for
  // how many times each food-group key (carne/pescado/legumbres/huevos/
  // pasta_arroz/verdura) may appear across the week. The configured number is
  // a ceiling, not a target: going under is always fine, only going OVER is a
  // violation. (Earlier versions treated it as a minimum to reach — that read
  // "huevos: 2" as "at least 2", so nothing ever flagged 5 egg dishes in one
  // week; a tester reported exactly that.) Soft and correctable like every
  // other rule above: retried through the LLM, then a deterministic carve-out
  // in applyFallback, never a hard block.
  if (freqs && Object.keys(freqs).length > 0) {
    const freqCounts = {};
    for (const key of Object.keys(freqs)) freqCounts[key] = 0;
    const matchedKeysBySlot = {};
    for (const { slotId, recipeId } of slotAssignments) {
      const recipe = poolById[recipeId];
      if (!recipe) continue;
      const matched = new Set();
      for (const key of Object.keys(freqs)) {
        const matcher = FREQ_KEY_MATCHERS[key];
        if (matcher?.(recipe)) {
          freqCounts[key]++;
          matched.add(key);
        }
      }
      matchedKeysBySlot[slotId] = matched;
    }

    // A dish can count toward more than one key at once (e.g. "Arroz a la
    // cubana" is both pasta_arroz and huevos), so a shared claim set is used
    // across every key's pass: a slot already flagged for one over-cap key is
    // never flagged a second time for another key it also happens to push
    // over. Fixing it once — the replacement in applyFallback can't match
    // ANY key still over its cap — resolves both without a redundant swap.
    const claimedExcess = new Set();
    for (const [key, target] of Object.entries(freqs)) {
      const excess = (freqCounts[key] ?? 0) - target;
      if (excess <= 0) continue;

      // Offenders: slots counting toward this over-cap key, not already
      // claimed by another key's excess this pass. Walked in mealOrder for a
      // stable, deterministic pick; the LAST `excess` of them are flagged —
      // the earliest uses read as "the normal ones", anything beyond as "the
      // extra repeats".
      const offenders = mealOrder.filter(
        (m) => !claimedExcess.has(m.slotId) && matchedKeysBySlot[m.slotId]?.has(key),
      );

      for (const offender of offenders.slice(-excess)) {
        claimedExcess.add(offender.slotId);
        const offenderRecipe = poolById[offender.recipeId];
        violations.push({
          rule: "freq_max_exceeded",
          slotId: offender.slotId,
          targetKey: key,
          message: `Objetivo semanal "${key}" superado (actual ${freqCounts[key]}, máximo ${target}). Sustituye "${offenderRecipe?.name ?? offender.recipeId}" (${offender.slotId}) por algo de otra categoría.`,
        });
      }
    }
  }

  // 11b. Las BASES pedidas salen al menos N veces.
  //
  // Es la única regla de MÍNIMO del fichero, y va al revés que la 11 a
  // propósito: los objetivos semanales son topes ("como mucho un pescado"),
  // pero una tanda es lo contrario — si el sofrito sale una sola vez, no hay
  // tanda que hacer y cocinarlo aparte no tiene sentido.
  //
  // De ahí que sea TODO O NADA. `basesAlcanzables` deja fuera la base que la
  // semana no puede dar entera (semana corta, pool pequeño), en vez de colocar
  // una sola: media tanda no es media ventaja, es ninguna.
  {
    const cuentaPorBase = {};
    const sinBasePedida = [];
    for (const m of mealOrder) {
      const r = poolById[m.recipeId];
      const suyas = r ? clavesDeReceta(r).filter((c) => basesPedidas[c] > 0) : [];
      if (suyas.length === 0) sinBasePedida.push(m);
      for (const c of suyas) cuentaPorBase[c] = (cuentaPorBase[c] ?? 0) + 1;
    }

    // Un hueco solo se ofrece una vez: si dos bases van cortas, cada una se
    // lleva un hueco distinto y no se pisan.
    const ofrecidos = new Set();
    for (const [clave, pedidas] of Object.entries(basesPedidas)) {
      if (!(pedidas > 0)) continue;
      const faltan = pedidas - (cuentaPorBase[clave] ?? 0);
      if (faltan <= 0) continue;

      // Se ceden los ÚLTIMOS huecos sin base, por el mismo motivo que la 11
      // se lleva los últimos excesos: los primeros días de la semana son los
      // que el usuario ya ha visto y moverá menos.
      //
      // Pero solo huecos donde esa base PUEDA entrar. Sin esto se ofrecía un
      // primero de 36 minutos para la bechamel, cuando todos los platos con
      // bechamel son segundos de 35 a 70: la violación salía, la reparación no
      // encontraba nada y el hueco se quedaba igual. Con 21 huecos y dos bases
      // pedidas, colocaba CERO.
      const cabeAqui = (m) => {
        const ctxSlot = contextBySlot[m.slotId];
        const partes = m.slotId.split("_");
        return filteredPool.some((r) => {
          if (!clavesDeReceta(r).includes(clave)) return false;
          if (ctxSlot?.maxTime && r.time > ctxSlot.maxTime) return false;
          if (ctxSlot?.mode === "tupper" && !r.tupperFriendly) return false;
          return slotAcceptsRole(r, {
            mealType: ctxSlot?.mealType ?? partes[1],
            position: ctxSlot?.position ?? partes[2],
            preferType: ctxSlot?.preferType,
          });
        });
      };
      const candidatos = sinBasePedida
        .filter((m) => !ofrecidos.has(m.slotId) && cabeAqui(m))
        .slice(-faltan);
      for (const c of candidatos) {
        ofrecidos.add(c.slotId);
        violations.push({
          rule: "base_pedida_insuficiente",
          slotId: c.slotId,
          targetKey: clave,
          message: `Has pedido ${pedidas} plato(s) con "${clave}" y hay ${cuentaPorBase[clave] ?? 0}. Cambia "${poolById[c.recipeId]?.name ?? c.recipeId}" (${c.slotId}) por algo que lleve esa base.`,
        });
      }
    }
  }

  // ── Las otras cinco de NO REPETIR (reglas 9, 12, 13, 14, 15) ─────────────
  //
  // La 9 (`guarnicion_repetida`) salía antes, entre la 8 y la 10, y se ha
  // traído aquí: es la ÚNICA de las diez cuyo sitio en el orden no cambia
  // nada, porque ninguna otra regla apunta a su mismo hueco por el mismo
  // motivo. Las otras cuatro ya salían al final.
  violations.push(...evaluarNoRepetir(NO_REPETIR.filter((r) => r.bloque === 2), ctxNoRepetir));


  return { valid: violations.length === 0, violations };
}

/**
 * Build a correction prompt from validation violations.
 */
// `slotsShape` echoes the answer format the planner was asked for: the JSON
// array by default, a slotId→recipeId map for the "planner-compact" task.
export function buildCorrectionMessage(violations, slotsShape = '{"slots":[...]}') {
  const lines = violations.map(
    (v) => `- [${v.rule}] ${v.slotId}: ${v.message}`,
  );
  return `Tu asignación viola estas reglas:\n${lines.join("\n")}\n\nCorrige SOLO los slots afectados y devuelve el JSON completo ${slotsShape} con TODOS los slots (corregidos y no corregidos).`;
}

/**
 * Which soft guard IS the violation being repaired — that guard is mandatory
 * in every relaxation tier, since dropping it would let the repair "fix" a
 * violation by swapping in another dish that breaks the very same rule.
 *
 * EVERY key must be a rule name actually emitted by validateMenu(). A key
 * matching no real rule silently disables the guard it was meant to protect —
 * exactly the bug that shipped two egg dishes in one comida, two fried dishes
 * in a row, and a same-day protein-group clash. Exported so the test suite can
 * cross-check the keys against the rule names the source really emits, which
 * is what stops this map from drifting again.
 *
 * A rule mapped to `null` (or absent) deliberately has no corresponding guard.
 */
export const GUARD_FOR_RULE = {
  guarnicion_repetida: "carb",
  guarnicion_cena_consecutiva: "carb",
  school_carb_conflict: "carb",
  proteina_consecutiva: "protein",
  proteina_repetida_en_comida: "sibling",
  dos_ensaladas_en_comida: "ensaladaClash",
  mismo_plato_seguido: "familiaPlato",
  plato_ocasion_entre_semana: "ocasion",
  // Mismo guardia que la ocasion: el arreglo es el mismo, cambiar el plato
  // por uno que no sea de fin de semana.
  casqueria_entre_semana: "ocasion",
  proteina_repetida_en_dia: "primeroGroup",
  proteina_cena_consecutiva: "cenaConsecutiva",
  dos_fritos_seguidos: "frito",
  dos_cuchara_mismo_dia: "cuchara",
  cena_rapida_no_solicitada: "cenaRapida",
  comida_desproporcionada: "weight",
  legumbres_en_cena: null,
  // Sin guardia relajable a propósito: "el sustituto tiene que llevar esa
  // base" se comprueba en la parte que NO se relaja nunca. Si se pudiera
  // soltar, el arreglo elegiría un plato sin la base y dejaría la violación
  // exactamente igual que estaba, habiendo cambiado la cena de sitio.
  base_pedida_insuficiente: null,
};

/**
 * Deterministic fallback: fix violations by replacing offending recipes
 * with the first valid alternative from the filtered pool.
 * Also fills missing slots that the LLM omitted.
 */
export function applyFallback(slotAssignments, violations, filteredPool, slotsContext, activeHealthProfiles = [], freqs = null, basesPedidas = null) {
  const result = slotAssignments.map((s) => ({ ...s }));
  const poolById = Object.fromEntries(filteredPool.map((r) => [r.id, r]));
  const contextBySlot = Object.fromEntries(
    slotsContext.map((s) => [s.slotId, s]),
  );
  const usedIds = new Set(result.map((s) => s.recipeId));
  // Violations this pass could not repair — attached to the returned array as
  // `unfixedViolations` so aiPlanner can warn instead of silently shipping a
  // menu that still breaks a rule.
  const unfixed = [];
  // Slots filled by reusing a dish already in the menu because no distinct
  // compatible recipe was left. Surfaced so the UI can suggest relaxing the
  // constraint that caused it instead of the repetition looking like a bug.
  const repeatedForCompleteness = [];

  // Fill missing slots first
  const missingViolations = violations.filter((v) => v.rule === "slot_faltante");
  for (const v of missingViolations) {
    const ctx = contextBySlot[v.slotId];
    if (!ctx) continue;
    const mealType = v.slotId.split("_")[1];
    const position = v.slotId.split("_")[2];
    const daySlug = v.slotId.split("_")[0];

    // Carb types already used this day (to avoid creating new guarnicion_repetida)
    const dayCarbsUsed = new Set();
    let dayHasCuchara = false;
    for (const s of result) {
      if (!s.slotId.startsWith(daySlug + "_")) continue;
      const r = poolById[s.recipeId];
      if (r) {
        const c = getCarbType(r); if (c) dayCarbsUsed.add(c);
        if (isPlatoCuchara(r)) dayHasCuchara = true;
      }
    }

    // Hard constraints: never relaxed. These are real user needs (tiempo
    // máximo, tupper) or structural correctness (rol del plato, sin repetir
    // receta). filteredPool is already allergen/intolerance-safe.
    const satisfiesHard = (r) => {
      if (usedIds.has(r.id)) return false;
      if (ctx.maxTime && r.time > ctx.maxTime) return false;
      if (ctx.mode === "tupper" && !r.tupperFriendly) return false;
      // Llevar la base pedida es una restricción DURA, no una preferencia.
      //
      // Estaba solo en el filtro de `findReplacement`, y el último recurso —el
      // que repite un plato antes que dejar el hueco vacío— no pasa por ahí:
      // usa esta función. Así que metía cualquier plato, daba la violación por
      // arreglada, y la base seguía sin aparecer. En una semana de 21 huecos
      // pedir dos de bechamel y dos de tomate colocaba CERO de cada.
      //
      // Cambiar un hueco por otro plato que tampoco lleva la base no arregla
      // nada: solo mueve la cena de sitio.
      if (v.rule === "base_pedida_insuficiente" && v.targetKey
        && !clavesDeReceta(r).includes(v.targetKey)) return false;
      // Shared with the validation rule (see slotAcceptsRole) so repair can
      // never accept something detection would reject, or vice versa.
      return slotAcceptsRole(r, {
        mealType: ctx.mealType ?? mealType,
        position: ctx.position ?? position,
        preferType: ctx.preferType,
      });
    };

    // Soft preferences: quality-of-menu nice-to-haves. Insisting on all of them
    // used to leave the slot EMPTY when no candidate satisfied every single one
    // — the user then saw a day with one dish instead of the two they'd
    // configured, silently. A slightly repetitive second course beats a missing
    // one, so relax these progressively instead of giving up.
    const carbOk = (r) => { const c = getCarbType(r); return !(c && dayCarbsUsed.has(c)); };
    const cucharaOk = (r) => !(dayHasCuchara && isPlatoCuchara(r));
    const typeOk = (r) => ctx.preferType === "cena_rapida" || !isMontaje(r);

    const tiers = [
      (r) => carbOk(r) && cucharaOk(r) && typeOk(r), // ideal
      (r) => cucharaOk(r) && typeOk(r),              // permite repetir base
      (r) => typeOk(r),                              // permite dos de cuchara
      () => true,                                    // lo que sea válido
    ];

    let candidate;
    for (const softOk of tiers) {
      candidate = filteredPool.find((r) => satisfiesHard(r) && softOk(r));
      if (candidate) break;
    }

    // Last resort: reuse a dish already in the menu. With a tight time budget
    // the catalog can genuinely lack enough DISTINCT recipes for the week —
    // e.g. a 20-min comida leaves the segundo ~10 min, and only 3 segundos in
    // the whole catalog are that quick, against 7 slots to fill. Repeating a
    // dish is normal in a real household; an empty slot reads as a broken app.
    // Hard constraints still apply — only the "no repeats" rule is dropped.
    if (!candidate) {
      const timesUsed = new Map();
      for (const s of result) timesUsed.set(s.recipeId, (timesUsed.get(s.recipeId) ?? 0) + 1);
      // A qué distancia (en días) está el uso más cercano de este plato. Si un
      // plato se va a repetir por narices, que se repita LEJOS: repetir el
      // jueves lo que ya hubo el lunes pasa desapercibido; repetirlo al día
      // siguiente es exactamente lo que la gente ve y comenta ("hummus el
      // lunes y el martes"). Antes solo se miraba cuántas veces aparecía, no
      // dónde, así que el repetido caía tan a menudo en la puerta de al lado.
      const thisDayIdx = DAY_ORDER.indexOf(daySlug);
      const nearestUse = (recipeId) => {
        let best = Infinity;
        for (const s of result) {
          if (s.recipeId !== recipeId) continue;
          const d = DAY_ORDER.indexOf(s.slotId.split("_")[0]);
          if (d < 0 || thisDayIdx < 0) continue;
          best = Math.min(best, Math.abs(d - thisDayIdx));
        }
        return best;
      };
      const reusable = filteredPool
        .filter((r) => {
          const wasUsed = usedIds.has(r.id);
          usedIds.delete(r.id);            // temporarily ignore the no-repeat rule
          const ok = satisfiesHard(r);
          if (wasUsed) usedIds.add(r.id);
          return ok;
        })
        // Spread repeats: primero el que esté más lejos en el calendario, y a
        // igual distancia el que menos veces haya salido.
        .sort((a, b) => {
          const far = nearestUse(b.id) - nearestUse(a.id);
          if (far !== 0) return far;
          return (timesUsed.get(a.id) ?? 0) - (timesUsed.get(b.id) ?? 0);
        });
      candidate = reusable[0];
      if (candidate) repeatedForCompleteness.push({ slotId: v.slotId, recipeId: candidate.id });
    }

    if (candidate) {
      result.push({ slotId: v.slotId, recipeId: candidate.id });
      usedIds.add(candidate.id);
    } else {
      unfixed.push(v);
    }
  }

  // Fix other violations by replacing offending recipes
  // Las de BASE primero. Es la única regla que exige una propiedad concreta del
  // plato —que lleve esa base— y por tanto la que menos candidatos tiene: dos
  // o tres en todo el pool. Las demás (proteína seguida, plato repetido, cena
  // desproporcionada) tienen cientos, así que saben apañárselas alrededor.
  //
  // Al revés no funcionaba: las otras veintitantas reparaciones se comían los
  // huecos y los platos antes de llegar aquí, y una semana que pide dos de
  // bechamel y dos de tomate acababa con cero de cada aunque hubiera candidatos.
  const otherViolations = violations
    .filter((v) => v.rule !== "slot_faltante")
    .sort((a, b) => (b.rule === "base_pedida_insuficiente" ? 1 : 0)
      - (a.rule === "base_pedida_insuficiente" ? 1 : 0));
  for (const v of otherViolations) {
    const idx = result.findIndex((s) => s.slotId === v.slotId);
    if (idx === -1) continue;
    // `comida_sin_segundo` reports the PRIMERO's slotId, but the actual defect
    // is the missing SEGUNDO. When that segundo was in slotsContext it already
    // fired `slot_faltante` and got filled by the loop above, leaving this
    // violation stale — repairing it here would swap out a perfectly good first
    // course for no reason. Only act on it when the day still lacks a segundo
    // (i.e. it's genuinely a single-dish comida that isn't a plato único).
    if (v.rule === "comida_sin_segundo") {
      const day = v.slotId.split("_")[0];
      const hasSegundo = result.some((s) => s.slotId === `${day}_comida_2`);
      if (hasSegundo) continue;
    }
    const slot = result[idx];
    const ctx = contextBySlot[slot.slotId];
    const mealType = slot.slotId.split("_")[1];
    const daySlug = slot.slotId.split("_")[0];

    // Carb types already used this day (excluding current slot) — always
    // computed and always enforced below, not just when the violation being
    // fixed IS guarnicion_repetida. Rationale: violations are processed one
    // at a time in rule order, so a fix applied for a LATER rule (e.g. rule
    // 11 freq_max_exceeded) must not reintroduce a violation of an EARLIER
    // rule (e.g. rule 9 guarnicion_repetida) that already passed. Since
    // nothing re-validates the whole menu between fixes within this same
    // pass, every candidate search has to independently respect every
    // context-derived constraint, regardless of which rule triggered it.
    const dayCarbsUsed = new Set();
    // Regla 11 cross-safety, por el MISMO motivo que el parrafo de arriba:
    // cuantos platos de cada clave con tope lleva ya la semana sin contar este
    // hueco. Hasta ahora el tope solo se miraba cuando la violacion que se
    // estaba arreglando ERA el tope, asi que reparar otra cosa (un choque con
    // el menu del cole, por ejemplo) podia meter un pescado con el cupo de
    // pescado ya lleno y dejar la semana rota. Se vio con "Gambas al ajillo"
    // entrando en una cena al arreglar un conflicto distinto.
    const usosPorClave = {};
    for (const [clave, tope] of Object.entries(freqs ?? {})) {
      const matcher = FREQ_KEY_MATCHERS[clave];
      if (!matcher || !(Number(tope) >= 0)) continue;
      let n = 0;
      for (const s2 of result) {
        if (s2.slotId === slot.slotId) continue;
        const r = poolById[s2.recipeId];
        if (r && matcher(r)) n += 1;
      }
      usosPorClave[clave] = { usados: n, tope: Number(tope) };
    }
    // Rule 13 cross-safety: does another dish this day already read as a plato
    // de cuchara? If so, the replacement must not be one too.
    let dayHasCuchara = false;
    for (const s of result) {
      if (s.slotId === slot.slotId) continue;
      if (!s.slotId.startsWith(daySlug + "_")) continue;
      const r = poolById[s.recipeId];
      if (r) {
        const c = getCarbType(r); if (c) dayCarbsUsed.add(c);
        if (isPlatoCuchara(r)) dayHasCuchara = true;
      }
    }
    // Rule 14 cross-safety: also forbid carb types used by the immediately
    // adjacent cenas (prev/next day) so a cena replacement never reintroduces
    // guarnicion_cena_consecutiva while fixing an unrelated violation.
    if (mealType === "cena") {
      const dayIdx = DAY_ORDER.indexOf(daySlug);
      for (const delta of [-1, 1]) {
        const neighborDay = DAY_ORDER[dayIdx + delta];
        if (!neighborDay) continue;
        const neighborCena = result.find((s) => {
          const p = s.slotId.split("_");
          return p[0] === neighborDay && p[1] === "cena";
        });
        if (!neighborCena) continue;
        const nr = poolById[neighborCena.recipeId];
        const carb = nr && getCarbType(nr);
        if (carb) dayCarbsUsed.add(carb);
      }
    }

    // Same rationale as dayCarbsUsed above, for rule 3 (proteina_consecutiva):
    // always mirror the neighbor(s) — prev and next in the current mainMeals
    // sequence — the same way rule 3 itself finds them, using the live
    // `result` so earlier fixes in this same pass are reflected. Always
    // enforced below so fixing an unrelated later violation can never
    // reintroduce a same-protein collision that already passed.
    const neighborProteins = new Set();
    // Rule 12 cross-safety: is a consecutive main-meal neighbor fried? If so,
    // the replacement must not be fried either.
    let neighborFrito = false;
    {
      const order = mainMealsOf(buildMealOrder(result), poolById);
      const orderIdx = order.findIndex((m) => m.slotId === slot.slotId);
      if (orderIdx !== -1) {
        for (const neighbor of [order[orderIdx - 1], order[orderIdx + 1]]) {
          if (!neighbor) continue;
          const nr = poolById[neighbor.recipeId];
          if (!nr) continue;
          for (const token of proteinTokensOf(nr)) neighborProteins.add(token);
          if (isFrito(nr)) neighborFrito = true;
        }
      }
    }

    // Same-comida sibling (primero<->segundo) protein — mirrors rule 3b: a
    // replacement for either half of a comida must never reintroduce the
    // exact protein its sibling already carries this same meal.
    let siblingProtein = null;
    // Kcal of the other half of this comida, so a replacement can keep the
    // pair under COMIDA_KCAL_SOFT_CAP (rule 7b). null = not a two-course
    // comida, so there's no pair to balance.
    let siblingKcal = null;
    // Mirrors rule 3d: is the OTHER half of this comida an "ensalada"-named
    // dish? If so, a replacement must not also be one.
    let siblingIsEnsalada = false;
    {
      const pos = slot.slotId.split("_")[2];
      if (mealType === "comida" && (pos === "1" || pos === "2")) {
        const siblingSlotId = `${daySlug}_comida_${pos === "1" ? "2" : "1"}`;
        const siblingRecipeId = result.find((s) => s.slotId === siblingSlotId)?.recipeId;
        const siblingRecipe = siblingRecipeId ? poolById[siblingRecipeId] : null;
        if (siblingRecipe && siblingRecipe.mainProtein !== "none") siblingProtein = siblingRecipe.mainProtein;
        if (siblingRecipe) siblingKcal = siblingRecipe.kcal ?? 0;
        if (siblingRecipe) siblingIsEnsalada = isEnsalada(siblingRecipe);
      }
    }

    // Familias de plato del día anterior, del día siguiente y del propio día
    // (rule 3e): el reemplazo no puede volver a ser "otro hummus" cuando lo
    // que se está arreglando es justo que hay hummus dos días seguidos.
    const nearbyFamilies = new Set();
    {
      const dayIdx = DAY_ORDER.indexOf(daySlug);
      for (const s2 of result) {
        if (s2.slotId === slot.slotId) continue;
        const otherDay = DAY_ORDER.indexOf(s2.slotId.split("_")[0]);
        if (otherDay < 0 || Math.abs(otherDay - dayIdx) > 1) continue;
        const r = poolById[s2.recipeId];
        if (!r) continue;
        const f = dishFamily(r);
        if (f) nearbyFamilies.add(f);
      }
    }

    // Same-day comida_1 primero protein GROUP — mirrors rule 3c: when replacing
    // a cena, never reintroduce the protein group already carried by that day's
    // primero (e.g. don't pick a legumbre cena when the comida_1 is a lentil
    // cream). Enforced unconditionally for the same cross-rule-safety reason as
    // the guards above.
    let sameDayPrimeroGroups = null;
    if (mealType === "cena") {
      const primeroRecipeId = result.find((s) => s.slotId === `${daySlug}_comida_1`)?.recipeId;
      const primeroRecipe = primeroRecipeId ? poolById[primeroRecipeId] : null;
      if (primeroRecipe) {
        const g = proteinGroupsOf(primeroRecipe);
        if (g.size) sameDayPrimeroGroups = g;
      }
    }

    // Protein groups of the immediately adjacent-day cenas (rule 15) — mirrors
    // rule 14's dayCarbsUsed cross-day extension above, but for protein group
    // instead of carb base.
    let adjacentCenaGroups = null;
    if (mealType === "cena") {
      const dayIdx = DAY_ORDER.indexOf(daySlug);
      for (const delta of [-1, 1]) {
        const neighborDay = DAY_ORDER[dayIdx + delta];
        if (!neighborDay) continue;
        const neighborCenaId = result.find((s) => s.slotId === `${neighborDay}_cena`)?.recipeId;
        const neighborRecipe = neighborCenaId ? poolById[neighborCenaId] : null;
        if (!neighborRecipe) continue;
        const g = proteinGroupsOf(neighborRecipe);
        if (g.size) {
          adjacentCenaGroups = adjacentCenaGroups ?? new Set();
          for (const group of g) adjacentCenaGroups.add(group);
        }
      }
    }

    // Cross-safety guards are split out from the hard constraints so they can
    // be relaxed if — and only if — insisting on all of them at once would
    // otherwise leave the offending dish in place. Keeping a KNOWN violation
    // (e.g. arroz de primero + arroz de segundo, reported by a tester) is worse
    // than a replacement that's merely suboptimal on an unrelated axis.
    // The guard that corresponds to the violation being fixed is never relaxed
    // — relaxing it would defeat the whole repair.
    const softGuards = {
      carb: (r) => {
        const carb = getCarbType(r);
        return !(carb && dayCarbsUsed.has(carb));
      },
      protein: (r) => ![...proteinTokensOf(r)].some((p) => neighborProteins.has(p)),
      sibling: (r) => !(siblingProtein && r.mainProtein === siblingProtein),
      ensaladaClash: (r) => !(siblingIsEnsalada && isEnsalada(r)),
      familiaPlato: (r) => !nearbyFamilies.has(dishFamily(r)),
      ocasion: (r) => r.occasion !== "especial" || !WEEKDAY_SLUGS.has(daySlug),
      primeroGroup: (r) =>
        !(sameDayPrimeroGroups && [...proteinGroupsOf(r)].some((g) => sameDayPrimeroGroups.has(g))),
      cenaConsecutiva: (r) =>
        !(adjacentCenaGroups && [...proteinGroupsOf(r)].some((g) => adjacentCenaGroups.has(g))),
      frito: (r) => !(neighborFrito && isFrito(r)),
      cuchara: (r) => !(dayHasCuchara && isPlatoCuchara(r)),
      cenaRapida: (r) => ctx?.preferType === "cena_rapida" || !isMontaje(r),
      weight: (r) => siblingKcal === null || (r.kcal ?? 0) + siblingKcal <= COMIDA_KCAL_SOFT_CAP,
    };

    // See GUARD_FOR_RULE at module scope for why this mapping matters.
    const mandatoryGuard = GUARD_FOR_RULE[v.rule] ?? null;

    // Progressively drop the optional guards, MOST EXPENDABLE FIRST — the
    // array is ordered accordingly: `weight` (menu balance) is the first to go
    // and must never be the reason a slot can't be filled, while `carb` (the
    // "arroz de primero y arroz de segundo" a tester reported) is protected
    // longest and only dropped as the very last resort.
    //
    // This used to slice from the END (`slice(length - drop)`), which relaxed
    // the list in exactly the reverse of the documented intent: `carb` was
    // dropped first and `weight` last. Every extra guard kept while a better
    // candidate exists is fine; dropping the important ones first is what
    // produced visibly-bad menus.
    const RELAX_ORDER = ["weight", "cenaRapida", "frito", "cuchara", "primeroGroup", "cenaConsecutiva", "familiaPlato", "ensaladaClash", "sibling", "protein", "ocasion", "carb"];
    const guardTiers = [];
    for (let drop = 0; drop <= RELAX_ORDER.length; drop++) {
      const dropped = new Set(RELAX_ORDER.slice(0, drop));
      dropped.delete(mandatoryGuard);
      guardTiers.push(dropped);
    }

    // Qué bases pedidas lleva el plato que se va a QUITAR y quedarían por debajo
    // de lo pedido si se va. El sustituto tiene que traerlas.
    //
    // Es el mismo principio que ya sujeta los hidratos del día: nadie
    // revalida el menú entre arreglo y arreglo, así que un arreglo no puede
    // deshacer lo que otro acaba de conseguir. Sin esto, la reparación de
    // bases colocaba los dos platos de bechamel y las veintitantas siguientes
    // —proteína seguida, plato repetido, cena desproporcionada— los sacaban
    // otra vez: el menú acababa con cero, habiendo pasado por dos.
    const basesQueNoPuedenIrse = (() => {
      const fuera = new Set();
      const actual = poolById[slot.recipeId];
      if (!actual || !basesPedidas) return fuera;
      for (const clave of clavesDeReceta(actual)) {
        const pedidas = basesPedidas[clave];
        if (!(pedidas > 0)) continue;
        let n = 0;
        for (const s2 of result) {
          const r2 = poolById[s2.recipeId];
          if (r2 && clavesDeReceta(r2).includes(clave)) n += 1;
        }
        if (n <= pedidas) fuera.add(clave);
      }
      return fuera;
    })();

    const findReplacement = (droppedGuards, { relaxMaxTime = false } = {}) => filteredPool.find((r) => {
      if (usedIds.has(r.id) && r.id !== slot.recipeId) return false;
      if (r.id === slot.recipeId) return false;

      for (const [key, ok] of Object.entries(softGuards)) {
        if (droppedGuards.has(key)) continue;
        if (!ok(r)) return false;
      }

      // ── Hard constraints: never relaxed (maxTime is the one exception —
      // see relaxMaxTime below) ─────────────────────────────────────────
      if (!relaxMaxTime && ctx?.maxTime && r.time > ctx.maxTime) return false;
      if (mealType === "cena" && (r.category === "legumbres" || r.mainProtein === "legumbre")) return false;
      if (v.rule === "tupper_not_friendly" && !r.tupperFriendly) return false;

      // Same shared helper as the validation rule — see slotAcceptsRole.
      if (!slotAcceptsRole(r, {
        mealType: ctx?.mealType ?? mealType,
        position: ctx?.position ?? slot.slotId.split("_")[2],
        preferType: ctx?.preferType,
      })) return false;

      if (ctx?.mode === "tupper" && !r.tupperFriendly) return false;

      // Sin filtrar por `cena`: el campo solo lo llevan los huecos que lo
      // necesitan, y con "el niño cena lo del mediodía" ese hueco es la COMIDA
      // de los adultos (ver reglas 4 y 4b). Filtrar por tipo de comida dejaba la
      // reparación ciega justo en ese caso.
      if (ctx?.schoolProteinsToAvoid) {
        if ([...proteinGroupsOf(r)].some((g) => ctx.schoolProteinsToAvoid.includes(g))) return false;
      }

      if (ctx?.schoolCarbsToAvoid) {
        const carb = getCarbType(r);
        if (carb && ctx.schoolCarbsToAvoid.includes(carb)) return false;
      }

      if (v.rule === "freq_max_exceeded" && v.targetKey) {
        // freqs are maximums now — the replacement must NOT also count
        // toward the key that's already over its cap (the opposite check
        // from when this was a minimum-deficit fix).
        const matcher = FREQ_KEY_MATCHERS[v.targetKey];
        if (matcher && matcher(r)) return false;
      }

      // Regla 11b al reves que la 11: aqui el candidato tiene que LLEVAR la
      // base que falta, que es justo el motivo de cambiar este hueco.
      if (v.rule === "base_pedida_insuficiente" && v.targetKey) {
        if (!clavesDeReceta(r).includes(v.targetKey)) return false;
      }

      // Y no se puede DESHACER una base ya colocada para arreglar otra cosa.
      for (const clave of basesQueNoPuedenIrse) {
        if (!clavesDeReceta(r).includes(clave)) return false;
      }

      // Y el tope, SIEMPRE, se arregle lo que se arregle: meter el candidato no
      // puede pasar de lo que la casa ha pedido como maximo.
      for (const [clave, { usados, tope }] of Object.entries(usosPorClave)) {
        const matcher = FREQ_KEY_MATCHERS[clave];
        if (matcher?.(r) && usados + 1 > tope) return false;
      }

      // Prefer a profile-compliant replacement, but only for the violation
      // that's actually about health profiles — never reject an otherwise-fine
      // replacement for a legumbres_en_cena/tupper/etc. violation just because
      // it also happens to be non-compliant with an unrelated active profile.
      if (v.rule === "health_profile_conflict") {
        const profileIds = Array.from(new Set(activeHealthProfiles ?? [])).filter((id) =>
          CORRECTABLE_HEALTH_PROFILES.has(id),
        );
        const flags = r.healthFlags ?? [];
        if (profileIds.some((id) => !HEALTH_PROFILE_BADGE[id].matches(flags))) return false;
      }

      return true;
    });

    let replacement;
    for (const dropped of guardTiers) {
      replacement = findReplacement(dropped);
      if (replacement) break;
    }

    // Last resort: a distinct dish that runs a few minutes over the cook-time
    // budget reads far better than repeating a recipeId already used
    // elsewhere in the week — same-day (e.g. the same salad for comida and
    // cena) or across different days (e.g. the same primero on Monday and
    // Thursday), both tester-reported. This is the one violation allowed to
    // relax maxTime, and only as the true last resort after every other
    // guard is already dropped.
    if (!replacement && v.rule === "recipeId_repetido") {
      replacement = findReplacement(new Set(RELAX_ORDER), { relaxMaxTime: true });
    }

    if (replacement) {
      usedIds.delete(slot.recipeId);
      slot.recipeId = replacement.id;
      usedIds.add(replacement.id);
    } else {
      // Nothing in the pool can fix this slot even with every optional guard
      // dropped. The offending dish stays (removing it would leave a hole),
      // but record it so the caller can surface the gap instead of shipping a
      // known-violating menu silently.
      unfixed.push(v);
    }
  }

  // Non-enumerable so the return value still compares as a plain array of
  // assignments (callers and tests treat it as one); this is extra diagnostic
  // metadata riding along, not part of the list.
  Object.defineProperty(result, "unfixedViolations", {
    value: unfixed,
    enumerable: false,
  });
  Object.defineProperty(result, "repeatedForCompleteness", {
    value: repeatedForCompleteness,
    enumerable: false,
  });
  return result;
}
