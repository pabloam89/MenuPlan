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

export function normalizeName(name) {
  return String(name ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
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
  [
    /manzana|platano|naranja|limon|lima|pera|melon|sandia|fresa|frambuesa|arandano|uvas|mandarina|kiwi|mango|pina|granada|ciruela|melocoton|albaricoque|higo|chirimoya/,
    "Frutas",
  ],
  // Pescado antes que Carne: "lomos de salmón" contiene "lomo" (Carne) y
  // "salmón" (Pescado); la primera coincidencia gana, así que el pez va primero.
  [
    /merluza|salmon|bacalao|atun|gamba|langostino|sardina|anchoa|calamar|sepia|mejillon|pescado|rape|lubina|rodaballo|dorada|boqueron|besugo|lenguado|emperador|caballa|trucha|almeja|pulpo|rosada|bonito|berberecho|chirla|navaja|coquina/,
    "Pescado",
  ],
  [
    /pollo|pavo|ternera|cerdo|carne|lomo|chorizo|salchich|jamon|bacon|beicon|panceta|tocino|cordero|solomillo|chuleta|morcilla|picada|costilla|entrecot|hamburgues|albondig|butifarra|fuet|mortadela|fiambre/,
    "Carne",
  ],
  [/lentej|garbanz|alubi|judia verde|habas|soja|tofu/, "Legumbres"],
  [/pasta|espagueti|macarron|fideo|arroz|cuscus|quinoa|noodle|lasaña/, "Pasta y arroz"],
  [/leche|nata|queso|yogur|mantequilla|requeson|mozzarella|parmesano|cuajada/, "Lácteos"],
  [/huevo/, "Huevos"],
  [/pan |harina|avena|cereales|tostada|boller|pan rallado|panko/, "Panadería"],
  [
    /guindilla|perejil|eneldo|albahaca|romero|tomillo|oregano|cilantro|curry|curcuma|pimenton|comino|laurel|menta|hierbabuena|estrag|salvia|nuez moscada|canela|jengibre|anis|hinojo|especias|chile|pimienta|azafran|vainilla|guindillas|alcaparra|cebollino|mejorana|estragón/,
    "Especias",
  ],
  [
    /aceite|vinagre|sal|caldo|azucar|vino|tomate triturado|pasta de tomate|concentrado de tomate|miel|mostaza|mayonesa|ketchup|salsa|soja|levadura|maicena|almendra|nuez|aceituna|oliva|conserva|tahini/,
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
