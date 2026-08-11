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

// Units that don't carry a fixed numeric amount — how much to use depends on
// taste or on the process, not on a weighable/countable quantity. Kept here
// (rather than in userRecipes.js) so aiPlanner.js / Menu.jsx / shoppingBuilder.js
// / shoppingListUtils.js can all import it without creating an import cycle
// with userRecipes.js (which itself imports from aiPlanner.js).
//   - "al gusto": personal preference (sal, pimienta, aliño)
//   - "pizca": a pinch, traditionally never weighed (sal, azafrán, canela)
//   - "c/n" ("cantidad necesaria"): whatever the process needs, not taste
//     (aceite para freír, agua para cubrir, harina para espolvorear)
export const QUALITATIVE_INGREDIENT_UNITS = ["al gusto", "pizca", "c/n"];

export function isQualitativeUnit(unit) {
  return QUALITATIVE_INGREDIENT_UNITS.includes(unit);
}

const QUALITATIVE_UNIT_LABELS = {
  "al gusto": "Al gusto",
  "pizca": "Pizca",
  "c/n": "C/N",
};

/** Display label for a qualitative unit on its own (no number attached). */
export function qualitativeUnitLabel(unit) {
  return QUALITATIVE_UNIT_LABELS[unit] ?? unit;
}

/** Stable shopping-list key: same product + unit merges into one row. */
export function normalizeIngredientKey(name, unit = "ud") {
  const n = normalizeName(name);
  // Strip trailing plural 's' so "huevo"/"huevos", "tomate"/"tomates" merge
  // into one row. Only strip when > 3 chars to preserve "sal", "pan", etc.
  const stem = n.length > 3 && n.endsWith("s") ? n.slice(0, -1) : n;
  return `${stem}|${unit}`;
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
    /pan de hamburguesa|pan de perrito|pan de hot ?dog|pan de molde|pan de pita|pan de leche|pan rallado|panko|panecillo|bollo de pan|chapata|baguette/,
    "Panadería",
  ],
  [
    // `\b`-bounded for "pera"/"mora"/"pina": all three are also short
    // mid-word fragments of very common, very much NOT fruit ingredients —
    // "eMPERAdor" (swordfish), "cebolla moRAda" (red onion), "esPINAcas"
    // (spinach) — all three used to silently resolve to "Frutas" because
    // this group is checked before Pescado/the Verduras default even runs,
    // and a bare substring match doesn't care where in the word it hits.
    /manzana|platano|naranja|limon|lima|\bperas?\b|melon|sandia|fresa|frambuesa|\bmoras?\b|cerez|arandano|uvas|mandarina|kiwi|mango|\bpinas?\b|granada|ciruela|melocoton|albaricoque|higo|chirimoya|pitaya|papaya|maracuya|lichi|caqui|nispero/,
    "Frutas",
  ],
  // Pescado antes que Carne: "lomos de salmón" contiene "lomo" (Carne) y
  // "salmón" (Pescado); la primera coincidencia gana, así que el pez va primero.
  [
    /merluza|salmon|bacalao|atun|gamba|langostino|sardina|anchoa|calamar|sepia|mejillon|pescado|rape|lubina|rodaballo|dorada|boqueron|besugo|lenguado|emperador|caballa|trucha|almeja|pulpo|rosada|bonito|berberecho|chirla|navaja|coquina|rodaja|ventresca|cogote|suprema|pescadilla|gallo|panga|perca|tilapia|\bmero\b|congrio|raya|chipiron|chopito|vieira|zamburi|carabinero|cigala|necora|centoll|bogavante|cangrejo|buey de mar|surimi|jurel|salmonete|cazon|abadejo|halibut|corvina|palometa|pez espada|marisco/,
    "Pescado",
  ],
  [
    /pollo|pavo|ternera|cerdo|carne|lomo|chorizo|salchich|jamon|bacon|beicon|panceta|tocino|cordero|solomillo|chuleta|chuleton|morcilla|picada|costilla|entrecot|hamburgues|albondig|butifarra|fuet|mortadela|fiambre|entrana|entraña|aguja|secreto|presa|pluma|carrillera|morcillo|jarrete|osobuco|redondo|cadera|babilla|espaldilla|contramuslo|muslo|pechuga|magro|escalop|filete|conejo|pato|codorniz|higado|churrasco|villagodio|lacon|manitas/,
    "Carne",
  ],
  [/lentej|garbanz|alubi|judia verde|habas|soja|tofu|judion|judias? pintas?|garrofon|fabes/, "Legumbres"],
  // "lasaña" (with ñ) never actually matched anything: `normalizeName` runs
  // NFD + strips combining marks, which turns "ñ" into a plain "n" ("lasaña"
  // -> "lasana") before this regex ever sees it — dead alternative, silently
  // falling through to the Verduras default instead. Also filled in the
  // pasta *shapes* (fusilli/penne/tallarín/tirabuzón/lacitos/canelones/
  // raviolis) added to the ingredient dictionary in the receipt-matching
  // pass but never wired into this separate aisle list.
  [
    /pasta|espagueti|macarron|fideo|arroz|cuscus|quinoa|noodle|lasan|fusilli|penne|tallarin|tirabuzon|lacito|canelon|raviol|tortellini/,
    "Pasta y arroz",
  ],
  [/leche|nata|queso|yogur|mantequilla|requeson|mozzarella|parmesano|cuajada|quesito/, "Lácteos"],
  [/huevo/, "Huevos"],
  [/pan |harina|avena|cereales|tostada|boller|pan rallado|panko/, "Panadería"],
  [
    /ajo en polvo|cebolla en polvo|ajo granulado|guindilla|perejil|eneldo|albahaca|romero|tomillo|oregano|cilantro|curry|curcuma|pimenton|comino|laurel|menta|hierbabuena|estrag|salvia|nuez moscada|canela|jengibre|anis|hinojo|especias|chile|pimienta|azafran|vainilla|guindillas|alcaparra|cebollino|mejorana|estragón/,
    "Especias",
  ],
  [
    /aceite|vinagre|sal|caldo|azucar|vino|tomate triturado|pasta de tomate|concentrado de tomate|miel|mostaza|mayonesa|ketchup|salsa|soja|levadura|maicena|almendra|nuez|aceituna|oliva|conserva|tahini|bechamel|besamel|alioli|allioli|holandesa|romesco|chimichurri|pesto|roux/,
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
