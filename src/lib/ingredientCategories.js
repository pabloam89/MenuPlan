import { INGREDIENT_CATEGORIES } from "../data/recipes.js";

/** Finer supermarket aisles for the shopping list UI. */
export const SHOPPING_AISLES = [
  "Verduras",
  "Frutas",
  "Carne",
  "Pescado",
  "Legumbres",
  "Pasta y arroz",
  "Lácteos",
  "Huevos",
  "Panadería",
  "Especias",
  // Was "Despensa" — freed up that name for the "already have at home"
  // pantry-match section (Shopping.jsx), which would otherwise read as the
  // same thing as this supermarket aisle for oil/vinegar/canned goods.
  "Aceites y conservas",
];

// Perishable aisles (fresh food) — best bought for the week you'll actually eat
// it. The rest (legumbres, pasta/arroz, especias, aceites y conservas) keep for
// a long time, so they can be bought ahead for several weeks at once. Derived
// purely from the aisle each item already gets (guessShoppingAisle), so no new
// per-recipe field or catalog change is needed. Used by the shopping list to
// split "Frescos" vs "Despensa" and, for multi-week menús, to decide what can
// be merged across weeks.
export const PERISHABLE_AISLES = new Set([
  "Verduras",
  "Frutas",
  "Carne",
  "Pescado",
  "Lácteos",
  "Huevos",
  "Panadería",
]);

export function isPerishableAisle(aisle) {
  return PERISHABLE_AISLES.has(aisle);
}

export function normalizeName(name) {
  return String(name ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

// Las unidades cualitativas se mudaron a lib/ingredientUnits.js (modulo hoja):
// data/recipes.js tambien las necesita, y este fichero importa DE data/recipes.js,
// asi que dejarlas aqui cerraba un ciclo. Se re-exportan para que los ocho
// sitios que ya las importaban desde aqui sigan funcionando igual.
export { QUALITATIVE_INGREDIENT_UNITS, isQualitativeUnit, qualitativeUnitLabel } from "./ingredientUnits.js";

// Already-singular words that happen to end in -s. Stripping the s would
// turn "cuscús" into "cuscu" and break catalog keys.
const INVARIANT_S_WORDS = new Set(["cuscus", "hummus", "anis", "boletus"]);

// Consonant-ending singulars form the plural with -es (calamar→calamares,
// pan→panes, col→coles, yogur→yogures, laurel→laureles, perejil→perejiles,
// azúcar→azúcares). Vowel-ending singulars only add -s (tomate→tomates) —
// those must NOT match this list, or "tomates" would collapse to "tomat".
const CONSONANT_PLUS_ES =
  /(?:ones|anes|enes|ines|unes|ares|eres|ires|ores|ures|ales|eles|iles|oles|ules|ades|edes|ides|udes)$/;

/** Singular stem of one Spanish word: tomates→tomate, calamares→calamar, nueces→nuez. */
export function singularizeWord(word) {
  const w = String(word ?? "");
  if (w.length <= 2 || INVARIANT_S_WORDS.has(w)) return w;
  // nuez→nueces, pez→peces, arroz→arroces
  if (w.endsWith("ces") && w.length > 4) return `${w.slice(0, -3)}z`;
  if (CONSONANT_PLUS_ES.test(w) && w.length > 4) return w.slice(0, -2);
  if (/[aeiou]s$/.test(w) && w.length > 3) return w.slice(0, -1);
  return w;
}

// Freshness / cut / size words that do not change the product. "queso fresco"
// is a cheese type, not a qualifier — that pair is kept in ingredientStem.
const STEM_NOISE = new Set([
  "fresco", "fresca",
  "baby",
  "maduro", "madura",
  "natural",
  "entero", "entera",
  "pelado", "pelada",
  "troceado", "troceada",
  "crudo", "cruda",
  "grande", "pequeno", "pequena",
  "variado", "variada",
  "desalado", "desalada",
  "cocido", "cocida",
  "triguero",
]);

const STEM_NOISE_PHRASES = [
  "virgen extra",
  "del dia anterior",
  "en lomo",
  "en rodaja",
  "en filete",
];

/** Accent-free, singularized name — "Judías verdes" == "Judía verde", "Espinacas frescas" == "Espinacas". */
export function ingredientStem(name) {
  const raw = normalizeName(name)
    .replace(/[º°]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!raw) return "";

  const words = raw.split(" ").filter(Boolean).map(singularizeWord);
  const kept = words.filter((w, i) => {
    if (!STEM_NOISE.has(w)) return true;
    if ((w === "fresco" || w === "fresca") && words[i - 1] === "queso") return true;
    return false;
  });

  let stem = kept.join(" ");
  for (const phrase of STEM_NOISE_PHRASES) {
    stem = stem.replaceAll(phrase, " ");
  }
  return stem.replace(/\s+/g, " ").trim();
}

/** Stable shopping-list key: same product + unit merges into one row. */
export function normalizeIngredientKey(name, unit = "ud") {
  return `${ingredientStem(name)}|${unit}`;
}

const INGREDIENT_CATEGORY_HINTS = [
  [/pollo|pavo|ternera|cerdo|carne|lomo|chorizo|salchich|jamon|bacon|cordero|solomillo|chuleta|morcilla/, "Carnes y pescados"],
  [
    /merluza|salmon|bacalao|atun|gamba|langostino|sardina|anchoa|calamar|sepia|mejillon|pescado|rape|lubina|rodaballo|dorada|boqueron|besugo|lenguado|emperador|caballa|trucha|almeja|pulpo/,
    "Carnes y pescados",
  ],
  [/lentej|garbanz|alubi|judia|pasta|espagueti|macarron|fideo|arroz|cuscus|quinoa|noodle/, "Legumbres y pasta"],
  [/leche|nata|queso|yogur|mantequilla|huevo|requeson|mozzarella|parmesano/, "Lácteos y huevos"],
  [/pan |harina|avena|cereales|tostada|panader|boller/, "Panadería y cereales"],
  [
    /aceite|vinagre|sal|pimienta|especias|pimenton|comino|oregano|caldo|azucar|vino|laurel|tomate triturado|miel|mostaza|salsa|soja|harina|levadura|maicena|almendra|nuez|panko|pan rallado/,
    "Despensa",
  ],
];

export function guessIngredientCategory(name) {
  const lower = normalizeName(name);
  for (const [regex, cat] of INGREDIENT_CATEGORY_HINTS) {
    if (regex.test(lower)) return cat;
  }
  return "Verduras y frutas";
}

const SHOPPING_AISLE_HINTS = [
  // Breads/buns first: "pan de hamburguesa" / "pan de perrito" contain
  // "hamburgues"/"perrito" fragments that the Carne group below would grab, and
  // "pan rallado"/"panko" are breadcrumbs — all belong in Panadería. Runs before
  // every other group so those specific breads never get mis-shelved.
  [
    // `\bpan\b` va el primero porque el ingrediente más usado de este grupo se
    // llama literalmente "Pan" (69 recetas) y NINGUNA alternativa lo cogía: la
    // lista de abajo enumera panes compuestos y la genérica de más abajo exige
    // "pan " con espacio detrás. Caía al default "Verduras", que además lo
    // marcaba como perecedero vía isPerishableAisle.
    /\bpan\b|pan de hamburguesa|pan de perrito|pan de hot ?dog|pan de molde|pan de pita|pan de leche|pan rallado|panko|panecillo|bollo de pan|chapata|ciabatta|baguette|hogaza|focaccia|brioche|croissant|naan|mollete|telera|bagel|biscote|candeal|payes|pan rustico|pan gallego|pan arabe|pan de viena|pan de cereal|pan de masa madre|colines|\bpicos\b|muffin/,
    "Panadería",
  ],
  // Masas, obleas y bollería industrial: mismo pasillo, y también caían a
  // "Verduras" por no estar en ninguna lista.
  [
    /hojaldre|vol-?au-?vent|masa quebrada|masa de pizza|masa brisa|\boblea|empanadilla|galleta|soletilla|bizcocho|magdalena|granola|tortita|\bcrepe|gofre|nachos|tortillas? de (trigo|maiz)/,
    "Panadería",
  ],
  // Salsas y fondos embotellados, antes de que los grupos de fresco los
  // reclamen por su ingrediente base: "Vinagre de arroz" caía en Pasta y arroz,
  // "Pesto de albahaca" en Especias y "Caldo de pescado" en Pescado, que
  // además es perecedero — un brik de caldo no va a la nevera.
  [/\bvinagre\b|\bpesto\b|\bcaldo\b|\bfumet\b|tomate frito|salsa de (tomate|pescado)/, "Aceites y conservas"],
  [
    // `\b`-bounded for "pera"/"mora"/"pina": all three are also short
    // mid-word fragments of very common, very much NOT fruit ingredients —
    // "eMPERAdor" (swordfish), "cebolla moRAda" (red onion), "esPINAcas"
    // (spinach) — all three used to silently resolve to "Frutas" because
    // this group is checked before Pescado/the Verduras default even runs,
    // and a bare substring match doesn't care where in the word it hits.
    /manzana|platano|naranja|limon|lima|\bperas?\b|melon|sandia|fresa|frambuesa|\bmoras?\b|cerez|arandano|uvas(?! pasas)|mandarina|kiwi|mango|\bpinas?\b|granada|ciruela|melocoton|albaricoque|higo|chirimoya|pitaya|papaya|maracuya|lichi|caqui|nispero|pomelo|frutos rojos|\bacai\b/,
    "Frutas",
  ],
  // Pescado antes que Carne: "lomos de salmón" contiene "lomo" (Carne) y
  // "salmón" (Pescado); la primera coincidencia gana, así que el pez va primero.
  [
    /merluza|salmon|bacalao|atun|gamba|langostino|sardina|anchoa|calamar|sepia|mejillon|pescado|rape|lubina|rodaballo|dorada|boqueron|besugo|lenguado|emperador|caballa|trucha|almeja|pulpo|rosada|bonito|berberecho|chirla|navaja|coquina|ventresca|cogote|suprema|pescadilla|gallo|panga|perca|tilapia|\bmero\b|congrio|raya|chipiron|chopito|vieira|zamburi|carabinero|cigala|necora|centoll|bogavante|cangrejo|buey de mar|surimi|jurel|salmonete|cazon|abadejo|halibut|corvina|palometa|pez espada|marisco|cabracho|txangurro/,
    "Pescado",
  ],
  [
    /pollo|pavo|ternera|cerdo|carne|lomo|chorizo|salchich|jamon|bacon|beicon|panceta|tocino|cordero|solomillo|chuleta|chuleton|morcilla|picada|costilla|entrecot|hamburgues|albondig|butifarra|fuet|mortadela|fiambre|sobrasada|cecina|entrana|entraña|aguja|secreto|presa|pluma|carrillera|morcillo|jarrete|osobuco|redondo|cadera|babilla|espaldilla|contramuslo|muslo|pechuga|magro|escalop|filete|conejo|pato|codorniz|higado|churrasco|villagodio|lacon|manitas|rabo de toro|carrillada|guanciale|cochinillo|perdiz|jabali|venado|ciervo|pichon|\bfoie\b|\bpate\b|\bunto\b/,
    "Carne",
  ],
  // "judia verde" NO va aquí: la judía verde es verdura fresca, no legumbre
  // seca, y el propio test de este grupo dice "distinct from fresh green
  // beans". Estaba mandando las judías verdes al pasillo de las alubias.
  [/lentej|garbanz|alubi|habas|soja|tofu|judion|judias? pintas?|garrofon|fabes|frijol|edamame|falafel|judias? (blanca|negra|roja)/, "Legumbres"],
  // "lasaña" (with ñ) never actually matched anything: `normalizeName` runs
  // NFD + strips combining marks, which turns "ñ" into a plain "n" ("lasaña"
  // -> "lasana") before this regex ever sees it — dead alternative, silently
  // falling through to the Verduras default instead. Also filled in the
  // pasta *shapes* (fusilli/penne/tallarín/tirabuzón/lacitos/canelones/
  // raviolis) added to the ingredient dictionary in the receipt-matching
  // pass but never wired into this separate aisle list.
  [
    /pasta|espagueti|macarron|fideo|arroz|cuscus|quinoa|noodle|lasan|fusilli|penne|tallarin|tirabuzon|lacito|canelon|cannelon|raviol|tortellini|tagliatelle|fettuccine|linguine|pappardelle|rigatoni|farfalle|orecchiette|trofie|\borzo\b|bucatini|conchiglie|casarecce|noqui|gnocchi|semola|bulgur/,
    "Pasta y arroz",
  ],
  [
    /leche|nata|queso|yogur|mantequilla|requeson|mozzarella|parmesano|cuajada|quesito|roquefort|camembert|\bbrie\b|gorgonzola|cabrales|manchego|idiazabal|mahon|tetilla|feta|ricotta|mascarpone|burrata|gruyere|emmental|cheddar|gouda|\bedam\b|provolone|halloumi|pecorino|comte|havarti|scamorza|stilton|taleggio|fontina|raclette|roncal|zamorano|valdeon|arzua|grana padano|kefir/,
    "Lácteos",
  ],
  [/huevo/, "Huevos"],
  // "tostada" a secas mandaba "Almendra tostada" y "Avellana tostada" a
  // Panadería. Como pan solo aparece en el catálogo como "Pan tostado", el
  // token exige el contexto — mismo arreglo que en la tabla de alérgenos.
  [/pan |harina|avena|cereales|pan tostado|boller|pan rallado|panko/, "Panadería"],
  [
    // Las semillas de sésamo van aquí, pero el ACEITE de sésamo no: este grupo
    // se evalúa antes que "Aceites y conservas", así que el patrón exige que
    // "sésamo" venga con su calificativo de semilla, nunca a secas.
    /ajo en polvo|cebolla en polvo|ajo granulado|guindilla|perejil|eneldo|albahaca|romero|tomillo|oregano|cilantro|curry|curcuma|pimenton|comino|laurel|menta|hierbabuena|estrag|salvia|nuez moscada|canela|jengibre|anis|hinojo|especias|chile|pimienta|azafran|vainilla|guindillas|alcaparra|cebollino|mejorana|estragón|semillas? de sesamo|sesamo (tostado|blanco|negro|crudo)|gomasio|\bnora\b|aji amarillo|wasabi|cayena|pimiento choricero/,
    "Especias",
  ],
  [
    /aceite|vinagre|sal|caldo|azucar|vino|tomate triturado|pasta de tomate|concentrado de tomate|miel|mostaza|mayonesa|ketchup|salsa|soja|levadura|maicena|almendra|nuez|aceituna|oliva|conserva|tahini|bechamel|besamel|alioli|allioli|holandesa|romesco|chimichurri|pesto|roux/,
    "Aceites y conservas",
  ],
  // Resto de despensa que no encaja en ningún pasillo fresco. Sin esta regla
  // todo esto caía al default "Verduras" y viajaba a la nevera: frutos secos en
  // plural ("nueces" no contiene "nuez"), bebidas alcohólicas, repostería,
  // encurtidos, algas y condimentos asiáticos.
  [
    /\bnueces\b|\bpinones?\b|castana|pistacho|anacardo|avellana|cacahuete|\bpipas\b|semillas? de (girasol|calabaza|chia|lino|amapola)/,
    "Aceites y conservas",
  ],
  [
    /\bbrandy\b|\bcona?c\b|\bron\b|whisky|vodka|ginebra|\blicor\b|\bcava\b|champan|cerveza|\bsidra\b|\bjerez\b|pedro ximenez|\bvermut\b|\bmarsala\b|\bmirin\b|\bsake\b|cointreau/,
    "Aceites y conservas",
  ],
  [
    // Los desecados (pasas, orejones, dátiles) van a despensa, no a Frutas: en
    // Frutas isPerishableAisle los mandaría a la nevera. Por eso el grupo de
    // Frutas lleva `uvas(?! pasas)`, para no cazarlos antes de llegar aquí.
    /chocolate|\bcacao\b|sirope|mermelada|gelatina|bicarbonato|\bcafe\b|\bagua\b|leche condensada|pepinillo|piquillo|\btrufa\b|gazpacho|\bmiso\b|\balga\b|\bnori\b|wakame|coco rallado|tabasco|sriracha|harissa|gochujang|encurtido|\bpasas?\b|orejones?|\bdatiles?\b|fruta desecada/,
    "Aceites y conservas",
  ],
];

export function guessShoppingAisle(name) {
  const lower = normalizeName(name);
  for (const [regex, aisle] of SHOPPING_AISLE_HINTS) {
    if (regex.test(lower)) return aisle;
  }
  return "Verduras";
}

export function isValidCategory(cat) {
  return INGREDIENT_CATEGORIES.includes(cat);
}

export function categoryForIngredient(name, fallback) {
  const guessed = guessIngredientCategory(name);
  if (!fallback || !isValidCategory(fallback)) return guessed;
  if (fallback === "Verduras y frutas" && guessed !== "Verduras y frutas") return guessed;
  return fallback;
}
