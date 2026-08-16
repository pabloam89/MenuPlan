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
  [/burrata/, "mozzarella"],
  [/mozzarella/, "mozzarella"],
  [/manchego/, "queso-manchego"],
  [/rulo de cabra/, "rulo-de-cabra"],
  [/(queso )?(de )?cabra/, "queso-cabra"],
  [/roquefort/, "roquefort"],
  [/gorgonzola/, "gorgonzola"],
  [/cabrales/, "cabrales"],
  [/stilton/, "stilton"],
  [/valdeon/, "valdeon"],
  [/queso azul/, "queso-azul"],
  [/idiazabal/, "idiazabal"],
  [/torta( del)? casar/, "torta-casar"],
  [/tetilla/, "tetilla"],
  [/mahon/, "mahon"],
  [/arzua/, "arzua-ulloa"],
  [/roncal/, "roncal"],
  [/zamorano/, "zamorano"],
  [/queso de oveja/, "queso-de-oveja"],
  [/cottage/, "queso-cottage"],
  [/cuajada/, "cuajada"],
  [/requeson/, "requeson"],
  [/queso en lonchas/, "queso-en-lonchas"],
  [/queso crema|philadelphia/, "queso-crema"],
  [/camembert|brie/, "queso-fresco"],
  [/queso fresco|burgos|ricotta|feta/, "queso-fresco"],
  [/queso rallado|queso en polvo/, "queso"],
  [/quesito|queso untar/, "queso-fresco"],
  [/cheddar|gouda|\bedam\b|emmental|gruyere|comte|havarti|halloumi|scamorza|provolone|fontina|taleggio|raclette|queso/, "queso"],

  // — carnes concretas —
  [/pechuga de pavo/, "pechuga-de-pavo"],
  [/pechuga/, "pechuga-de-pollo"],
  [/alitas/, "alitas-de-pollo"],
  [/contramuslo/, "contramuslos-de-pollo"],
  [/muslo/, "muslo-de-pollo"],
  [/\bpollo\b|gallina/, "pollo"],
  [/pavo/, "pavo"],
  [/hamburgues/, "hamburguesa"],
  [/carne picada|picada de/, "carne-picada"],
  [/albondig/, "albondigas"],
  [/chorizo/, "chorizo"],
  [/fuet/, "fuet"],
  [/lomo embuchado/, "lomo-embuchado"],
  [/salchichon/, "salchichon"],
  [/morcilla/, "morcilla"],
  [/butifarra/, "butifarra"],
  [/longaniza/, "longaniza"],
  [/chistorra/, "chistorra"],
  [/sobrasada/, "sobrasada"],
  [/cecina/, "cecina"],
  [/salchich/, "salchicha"],
  [/jamon (york|cocido|dulce)|fiambre de pavo/, "jamon-york"],
  [/lacon/, "lacon"],
  [/jamon (serrano|iberico|curado)|jamon\b|paleta/, "jamon"],
  [/bacon|beicon/, "bacon"],
  [/tocino/, "tocino"],
  [/panceta/, "panceta"],
  [/costilla|churrasco/, "costilla"],
  [/solomillo/, "solomillo"],
  [/carrillera/, "carrillera"],
  [/entrecot/, "entrecot"],
  [/rabo de toro/, "rabo-de-toro"],
  [/morcillo/, "morcillo"],
  [/pluma/, "pluma-iberica"],
  [/presa/, "presa-iberica"],
  [/cordero|lechal/, "cordero"],
  [/conejo/, "conejo"],
  [/pato|codorniz/, "pato"],

  // — pescados y mariscos concretos —
  [/salmon ahumado/, "salmon-ahumado"],
  [/salmon/, "salmon"],
  [/ventresca/, "ventresca"],
  [/bonito/, "bonito-del-norte"],
  [/atun/, "atun"],
  [/bacalao|abadejo/, "bacalao"],
  [/merluza|pescadilla|rosada/, "merluza"],
  [/dorada|besugo/, "dorada"],
  [/lubina|corvina/, "lubina"],
  [/boqueron/, "boquerones"],
  [/anchoa/, "anchoa-en-aceite"],
  [/caballa/, "caballa"],
  [/sardina|jurel|salmonete/, "sardinas"],
  [/cigala/, "cigala"],
  [/langostino|carabinero/, "langostinos"],
  [/gamba|camaron/, "gambas"],
  [/pulpo/, "pulpo"],
  [/mejillon/, "mejillones"],
  [/berberecho/, "berberecho"],
  [/navaja/, "navaja"],
  [/percebe/, "percebe"],
  [/vieira/, "vieira"],
  [/zamburi/, "zamburina"],
  [/mojama/, "mojama"],
  [/almeja|chirla|coquina/, "almejas"],
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
  [/pimiento choricero/, "pimiento-choricero"],
  [/piquillo/, "pimientos-del-piquillo"],
  [/pimientos? (verdes?|italianos?)|pimiento/, "pimiento-verde"],
  [/calabacin/, "calabacin"],
  [/berenjena/, "berenjena"],
  [/calabaza/, "calabaza"],
  [/brocoli|brecol/, "brocoli"],
  [/coliflor/, "coliflor"],
  [/lombarda/, "lombarda"],
  [/repollo/, "repollo"],
  [/\bcol\b/, "col"],
  [/lechuga|escarola|endivia|canonigo/, "lechuga"],
  [/rucula/, "rucula"],
  [/acelga/, "acelga"],
  [/espinaca/, "espinacas"],
  [/pepino/, "pepino"],
  [/puerro/, "puerro"],
  [/setas?/, "setas"],
  [/champinon|portobello|shiitake/, "champinon"],
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
  [/platano macho/, "platano-macho"],
  [/platano|banana/, "platano"],
  [/mandarina|clementina/, "mandarina"],
  [/naranja/, "naranja"],
  [/lima\b/, "lima"],
  [/limon/, "limon"],
  [/fresa|freson/, "fresa"],
  [/frambuesa/, "frambuesa"],
  [/arandano|\bmoras?\b|grosella/, "arandanos"],
  [/uvas?\b/, "uvas"],
  [/sandia/, "sandia"],
  [/melon/, "melon"],
  [/\bpinas?\b|ananas/, "pina"],
  [/kiwi/, "kiwi"],
  [/\bperas?\b/, "pera"],
  [/melocoton|paraguayo/, "melocoton"],
  [/nectarina/, "nectarina"],
  [/albaricoque/, "albaricoque"],
  [/ciruela/, "ciruela"],
  [/cerez/, "cereza"],
  [/papaya/, "papaya"],
  [/chirimoya/, "chirimoya"],
  [/caqui/, "caqui"],
  [/mango|maracuya/, "mango"],
  [/granada/, "granada"],
  [/\bcocos?\b/, "coco"],

  // — legumbres —
  [/lentejas? rojas?/, "lentejas-rojas"],
  [/lentej/, "lentejas"],
  [/garbanz/, "garbanzos"],
  [/alubia de tolosa|tolosa/, "alubia-de-tolosa"],
  [/alubias? rojas?/, "alubias-rojas"],
  [/judion/, "judion"],
  [/fabes/, "fabes"],
  [/alubia|judia blanca/, "alubias"],
  [/judias? pintas?|frijol/, "judias-pintas"],
  [/\bhabas?\b/, "habas"],
  [/soja texturizada|proteina de soja|soja granulada/, "soja-texturizada"],
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
  [/arroz bomba/, "arroz-bomba"],
  [/arroz arborio/, "arroz-arborio"],
  [/arroz/, "arroz"],
  [/cuscus|bulgur/, "cuscus"],
  [/quinoa/, "quinoa"],

  // — lácteos y huevos —
  [/huevo/, "huevos"],
  [/nata para montar/, "nata-para-montar"],
  [/\bnata\b|crema de leche/, "nata"],
  [/kefir/, "kefir"],
  [/yogur/, "yogur"],
  [/mantequilla|margarina/, "mantequilla"],
  [/leche condensada/, "leche-condensada"],
  [/leche/, "leche"],

  // — panadería —
  [/pan rallado|panko/, "pan-rallado"],
  [/pan de molde|pan bimbo/, "pan-molde"],
  [/pan de payes|payes/, "pan-de-payes"],
  [/pan integral/, "pan-integral"],
  [/baguette|chapata|ciabatta|barra de pan/, "baguette"],
  [/tortillas? de (trigo|maiz)|wrap|fajita/, "tortillas-trigo"],
  [/hogaza|pan rustico|candeal|mollete|telera|bagel|biscote/, "pan"],
  [/\bpan\b|panecillo|bollo|picatoste|crouton|focaccia|brioche|croissant|naan/, "pan"],
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
  [/soja texturizada|proteina de soja|soja granulada/, "soja-texturizada"],
  [/salsa de soja|soja/, "salsa-soja"],
  [/levadura/, "levadura"],
  [/maicena|almidon/, "maicena"],
  [/chocolate/, "chocolate"],
  [/cacao/, "cacao"],
  [/mermelada|confitura/, "mermelada"],
  [/vino/, "vino-blanco"],
  [/nuez moscada/, "nuez-moscada"],
  [/nueces|\bnuez\b/, "nueces"],
  [/almendra|avellana|pistacho|anacardo/, "almendras"],
  // Variants that reuse a dedicated illustration instead of a generic family.
  [/menta|hierbabuena/, "menta"],
  [/\brape\b/, "monkfish"],
  [/trucha/, "truchas-enteras"],
  [/chuletas? de cerdo/, "chuletas-de-cerdo"],
  [/^lomo$|lomo de cerdo/, "cinta-de-lomo"],
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
