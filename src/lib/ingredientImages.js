// Cartoon illustration per ingredient, resolved from a free-text name.
//
// Recipe ingredients from the static catalog carry a stable `id` we can look up
// directly, but everything else in the app (AI-generated recipes, hand-added
// shopping rows, scanned receipts) only has a display name. So the resolver
// walks three tiers and stops at the first hit:
//
//   1. exact id / alias      "Pechuga de pollo"        -> pollo
//   2. visual family         "Solomillo de ternera"    -> fam_carne_roja
//   3. nothing               caller falls back to the aisle illustration
//
// Tier 2 exists because a cartoon entrecot, solomillo and chuletón are the same
// picture; drawing 50 near-identical cuts would cost a lot and read the same.

import { normalizeName, guessShoppingAisle } from "./ingredientCategories.js";
import { INGREDIENT_IMAGE_IDS } from "./ingredientImageIds.js";

const AVAILABLE = new Set(INGREDIENT_IMAGE_IDS);

const src = (id) => (AVAILABLE.has(id) ? `/ingredients/${id}.png` : null);

// Free-text name -> specific ingredient id. Ordered: the first regex that
// matches wins, so put the narrow patterns above the broad ones (e.g. "atún en
// lata" before "atún", "queso de cabra" before "queso").
const ALIASES = [
  // Checked first: "harina de maíz"/"de garbanzo" is flour, not corn or chickpeas.
  [/harina/, "harina"],

  // — conservas antes que su materia prima —
  [/atun (en )?lata|lata de atun|atun claro|conserva de atun/, "atun-lata"],
  [/tomate (frito|triturado|concentrado)|pasta de tomate|salsa de tomate/, "tomate-frito"],
  [/leche de coco/, "leche-coco"],

  // — quesos concretos antes que "queso" —
  [/parmesano|grana padano|pecorino/, "parmesano"],
  [/mozzarella|burrata/, "mozzarella"],
  [/manchego/, "queso-manchego"],
  [/(queso )?(de )?cabra|rulo de cabra/, "queso-cabra"],
  [/queso azul|roquefort|gorgonzola|cabrales/, "queso-azul"],
  [/queso fresco|burgos|requeson|ricotta|feta/, "queso-fresco"],
  [/queso rallado|queso en polvo/, "queso"],
  [/quesito|queso crema|philadelphia|queso untar/, "queso-fresco"],
  [/cheddar|gouda|edam|emmental|gruyere|queso/, "queso"],

  // — carnes concretas —
  [/pechuga|contramuslo|muslo|pollo|gallina/, "pollo"],
  [/pavo/, "pavo"],
  [/carne picada|picada de|hamburgues/, "carne-picada"],
  [/albondig/, "albondigas"],
  [/chorizo/, "chorizo"],
  [/salchichon|fuet|lomo embuchado/, "salchichon"],
  [/morcilla/, "morcilla"],
  [/salchich|butifarra|longaniza/, "salchicha"],
  [/jamon (york|cocido|dulce)|fiambre de pavo|lacon/, "jamon-york"],
  [/jamon (serrano|iberico|curado)|jamon\b|paleta/, "jamon"],
  [/bacon|beicon/, "bacon"],
  [/panceta|tocino/, "panceta"],
  [/costilla|churrasco/, "costilla"],
  [/solomillo/, "solomillo"],
  [/cordero|lechal/, "cordero"],
  [/conejo/, "conejo"],
  [/pato|codorniz/, "pato"],

  // — pescados y mariscos concretos —
  [/salmon/, "salmon"],
  [/atun|bonito|ventresca/, "atun"],
  [/bacalao|abadejo/, "bacalao"],
  [/merluza|pescadilla|rosada/, "merluza"],
  [/dorada|besugo/, "dorada"],
  [/lubina|corvina/, "lubina"],
  [/sardina|boqueron|anchoa|caballa|jurel|salmonete/, "sardinas"],
  [/langostino|carabinero|cigala/, "langostinos"],
  [/gamba|camaron/, "gambas"],
  [/pulpo/, "pulpo"],
  [/mejillon/, "mejillones"],
  [/almeja|berberecho|chirla|navaja|coquina/, "almejas"],
  [/calamar|chipiron|chopito/, "calamar"],
  [/sepia|jibia/, "sepia"],
  [/surimi|palito de cangrejo|palitos de cangrejo/, "surimi"],

  // — verduras —
  [/cebolleta|cebolla tierna/, "cebolleta"],
  [/cebollas? (moradas?|rojas?)/, "cebolla-morada"],
  [/cebolla/, "cebolla"],
  [/ajo en polvo|ajo granulado/, "ajo-polvo"],
  [/\bajos?\b|diente de ajo/, "ajo"],
  [/zanahoria/, "zanahoria"],
  [/boniato|batata/, "boniato"],
  [/patata|papa\b/, "patata"],
  [/tomate cherry|cherry/, "tomate-cherry"],
  [/tomate/, "tomate"],
  [/pimientos? (rojos?|morrones?)/, "pimiento-rojo"],
  [/pimientos? (verdes?|italianos?)|pimiento/, "pimiento-verde"],
  [/calabacin/, "calabacin"],
  [/berenjena/, "berenjena"],
  [/calabaza/, "calabaza"],
  [/brocoli|brecol/, "brocoli"],
  [/coliflor/, "coliflor"],
  [/\bcol\b|repollo|lombarda/, "col"],
  [/lechuga|escarola|endivia|canonigo/, "lechuga"],
  [/rucula/, "rucula"],
  [/espinaca|acelga/, "espinacas"],
  [/pepino/, "pepino"],
  [/puerro/, "puerro"],
  [/champinon|seta|portobello|shiitake/, "champinon"],
  [/esparrago/, "esparragos"],
  [/alcachofa/, "alcachofa"],
  [/\bapio\b/, "apio"],
  [/remolacha/, "remolacha"],
  [/aguacate/, "aguacate"],
  [/\bmaiz\b|mazorca/, "maiz"],
  [/judias? verdes?|vainitas?|habichuelas? verdes?/, "judia-verde"],
  [/guisante/, "guisantes"],
  [/jengibre/, "jengibre"],

  // — frutas —
  [/manzana/, "manzana"],
  [/platano|banana/, "platano"],
  [/mandarina|clementina/, "mandarina"],
  [/naranja/, "naranja"],
  [/limon|lima\b/, "limon"],
  [/fresa|freson/, "fresa"],
  [/arandano|frambuesa|\bmoras?\b|grosella/, "arandanos"],
  [/uvas?\b/, "uvas"],
  [/sandia/, "sandia"],
  [/melon/, "melon"],
  [/\bpinas?\b|ananas/, "pina"],
  [/kiwi/, "kiwi"],
  [/\bperas?\b/, "pera"],
  [/melocoton|nectarina|paraguayo|albaricoque/, "melocoton"],
  [/ciruela/, "ciruela"],
  [/cerez/, "cereza"],
  [/mango|papaya|maracuya|chirimoya|caqui/, "mango"],
  [/granada/, "granada"],
  [/\bcocos?\b/, "coco"],

  // — legumbres —
  [/lentej/, "lentejas"],
  [/garbanz/, "garbanzos"],
  [/alubia|judion|fabes|judia blanca/, "alubias"],
  [/judias? pintas?|frijol/, "judias-pintas"],
  [/\bhabas?\b/, "habas"],
  [/tofu|tempeh|seitan/, "tofu"],

  // — pasta y arroz —
  [/espagueti|spaghetti/, "espaguetis"],
  [/macarron|coditos/, "macarrones"],
  [/tallarin|tagliatelle|linguine|pappardelle/, "tallarines"],
  [/penne|plumas/, "penne"],
  [/fusilli|espiral|tirabuzon|lacito|helice/, "fusilli"],
  [/raviol|tortellini|pasta rellena/, "ravioli"],
  [/canelon/, "canelones"],
  [/lasan/, "lasana"],
  [/noqui|gnocchi/, "noquis"],
  [/fideo|noodle|ramen/, "fideos"],
  [/arroz integral/, "arroz-integral"],
  [/arroz/, "arroz"],
  [/cuscus|bulgur/, "cuscus"],
  [/quinoa/, "quinoa"],

  // — lácteos y huevos —
  [/huevo/, "huevos"],
  // Word-bounded: bare /nata/ would swallow "yogur natural".
  [/\bnata\b|crema de leche/, "nata"],
  [/yogur|kefir/, "yogur"],
  [/mantequilla|margarina/, "mantequilla"],
  [/leche/, "leche"],

  // — panadería —
  [/pan rallado|panko/, "pan-rallado"],
  [/pan de molde|pan bimbo/, "pan-molde"],
  [/baguette|chapata|barra de pan/, "baguette"],
  [/tortillas? de (trigo|maiz)|wrap|fajita/, "tortillas-trigo"],
  [/\bpan\b|panecillo|bollo|picatoste|crouton/, "pan"],
  [/harina/, "harina"],
  [/avena|copos/, "avena"],

  // — especias y hierbas —
  [/pimenton|paprika/, "pimenton"],
  [/pimienta/, "pimienta"],
  [/oregano/, "oregano"],
  [/comino/, "comino"],
  [/curcuma/, "curcuma"],
  [/curry/, "curry"],
  [/canela/, "canela"],
  [/laurel/, "laurel"],
  [/tomillo/, "tomillo"],
  [/romero/, "romero"],
  [/albahaca/, "albahaca"],
  [/perejil/, "perejil"],
  [/cilantro/, "cilantro"],
  [/azafran/, "azafran"],
  [/cayena|guindilla|chile|picante/, "cayena"],
  [/nuez moscada/, "nuez-moscada"],
  [/sesamo|ajonjoli/, "sesamo"],
  [/hierbas provenzales|finas hierbas|mezcla de hierbas/, "hierbas-provenzales"],

  // — despensa —
  [/aceite de oliva|aceite oliva|\baove\b/, "aceite-oliva"],
  [/aceite de girasol|aceite vegetal/, "aceite-girasol"],
  [/aceite/, "aceite-oliva"],
  [/vinagre/, "vinagre"],
  [/aceituna|oliva/, "aceitunas"],
  [/\bsal\b|sal marina|sal gorda/, "sal"],
  [/azucar/, "azucar"],
  [/caldo|fondo de/, "caldo"],
  [/miel/, "miel"],
  [/mostaza/, "mostaza"],
  [/mayonesa|alioli|allioli/, "mayonesa"],
  [/ketchup/, "ketchup"],
  [/soja texturizada|proteina de soja|soja granulada/, "tofu"],
  [/salsa de soja|soja/, "salsa-soja"],
  [/levadura/, "levadura"],
  [/maicena|almidon/, "maicena"],
  [/chocolate/, "chocolate"],
  [/cacao/, "cacao"],
  [/mermelada|confitura/, "mermelada"],
  [/vino/, "vino-blanco"],
  [/almendra|nuez|nueces|avellana|pistacho|anacardo/, "almendras"],
];

// Anything the aliases miss but that still has a recognisable visual family.
// Deliberately broad — these run last, so a miss here means "use the aisle".
const FAMILIES = [
  [/ternera|buey|\btoro\b|entrecot|chuleton|chuleta|aguja|redondo|cadera|babilla|espaldilla|filete|escalop|entrana|morcillo|jarrete|osobuco|carrillera|villagodio/, "fam_carne_roja"],
  [/cerdo|lomo|secreto|presa|pluma|magro|manitas|iberico/, "fam_cerdo"],
  [/mortadela|embutido|fiambre|salami|pastrami/, "fam_embutido"],
  [/rodaballo|lenguado|\bgallo\b|panga|perca|tilapia|\bmero\b|congrio|raya|halibut|palometa|rape|trucha|cazon|emperador|pez espada/, "fam_pescado_blanco"],
  [/lomos? de|filete de pescado|suprema|cogote|rodaja/, "fam_filete_pescado"],
  [/pescado azul/, "fam_pescado_azul"],
  [/necora|centoll|bogavante|cangrejo|buey de mar|marisco|vieira|zamburi/, "fam_marisco"],
  [/molusco/, "fam_molusco"],
  [/cefalopodo/, "fam_cefalopodo"],
  [/higo|nispero|lichi/, "fam_fruta_hueso"],
];

/**
 * Illustration for an ingredient by free-text name.
 * @param {string} name
 * @returns {string|null} public URL, or null when only the aisle image fits
 */
export function ingredientImageSrc(name) {
  const n = normalizeName(name);
  if (!n) return null;

  // Catalog ingredients already use these ids verbatim ("aceite-oliva").
  const direct = n.replace(/\s+/g, "-");
  if (AVAILABLE.has(direct)) return src(direct);

  for (const [re, id] of ALIASES) {
    if (re.test(n)) return src(id);
  }
  for (const [re, id] of FAMILIES) {
    if (re.test(n)) return src(id);
  }
  return null;
}

/**
 * Illustration for a catalog ingredient object, preferring its stable id and
 * falling back to the name when the id isn't one we shipped art for.
 * @param {{id?: string, name?: string}} ing
 * @returns {string|null}
 */
export function ingredientImageFor(ing) {
  if (!ing) return null;
  if (ing.id && AVAILABLE.has(ing.id)) return src(ing.id);
  return ingredientImageSrc(ing.name);
}

// Supermarket aisle -> the category illustration already shipped for it.
const AISLE_IMAGE = {
  Verduras: "verduras",
  Frutas: "frutas",
  Carne: "carne",
  Pescado: "pescado",
  Legumbres: "legumbres",
  "Pasta y arroz": "pasta_arroz",
  Lácteos: "lacteos",
  Huevos: "huevos",
  Panadería: "panaderia",
  Especias: "especias",
  "Aceites y conservas": "aceites_conservas",
};

/** Category illustration for a supermarket aisle name. */
export function aisleImageSrc(aisle) {
  const slug = AISLE_IMAGE[aisle];
  return slug ? `/categories/${slug}.png` : null;
}

// Recipe categories we shipped an illustration for. The file name is the
// category id verbatim, so this is just a guard against 404s for any category
// added later without art.
const RECIPE_CATEGORY_IMAGES = new Set([
  "legumbres", "carnes", "pescados", "huevos", "pasta_arroces", "sopas_cremas",
  "ensaladas_verduras", "platos_unicos", "cenas_rapidas", "bebes", "desayunos",
  "meriendas", "postres",
]);

/** Illustration for a recipe category id, or null when there's no art for it. */
export function categoryImageSrc(category) {
  return RECIPE_CATEGORY_IMAGES.has(category) ? `/categories/${category}.png` : null;
}

// recipeSchema.js MAIN_PROTEINS -> the ingredient art that stands for it. The
// broad ones borrow their family image, since "ternera" as a filter means any
// red meat rather than one specific cut.
const PROTEIN_IMAGE = {
  cerdo: "fam_cerdo",
  huevo: "huevos",
  legumbre: "legumbres",
  marisco: "fam_marisco",
  pavo: "pavo",
  pescado_azul: "fam_pescado_azul",
  pescado_blanco: "fam_pescado_blanco",
  pollo: "pollo",
  ternera: "fam_carne_roja",
};

/** Illustration for a mainProtein value, or null for "none"/unknown. */
export function proteinImageSrc(protein) {
  const id = PROTEIN_IMAGE[protein];
  if (!id) return null;
  // "legumbres" has no single-ingredient render — only lentejas, garbanzos and
  // friends — so it borrows the category plate, which reads as the family
  // anyway. Same escape hatch for any protein we add art for later.
  return src(id) ?? categoryImageSrc(id);
}

/**
 * Full cascade for a row-level thumbnail: specific ingredient -> visual family
 * -> the aisle illustration. Always returns something for a recognisable name,
 * so ingredient rows never render an empty slot.
 *
 * @param {string} name
 * @returns {string|null}
 */
export function ingredientThumbSrc(name) {
  return ingredientImageSrc(name) ?? aisleImageSrc(guessShoppingAisle(name));
}

export const hasIngredientImages = AVAILABLE.size > 0;
