import { z } from "zod";
import { uid } from "./groups.js";
import { callModel, extractJson, AIPlannerError, ICON_TYPE_MAP, CATEGORY_ICON } from "./aiPlanner.js";
import { FAST_MODEL } from "./aiModels.js";
import { EU_ALLERGENS } from "./allergens.js";
import { normalizeRichSteps, richToPlainSteps } from "./recipeSteps.js";
import { StepRichSchema, isMontaje } from "../data/recipeSchema.js";
import { recipeCatalog } from "../data/recipeCatalog.js";
import guarnicionesData from "../data/recipes/guarniciones.json";
import {
  SHOPPING_AISLES,
  guessShoppingAisle,
  normalizeName,
  ingredientStem,
  QUALITATIVE_INGREDIENT_UNITS,
  isQualitativeUnit,
} from "./ingredientCategories.js";

export { QUALITATIVE_INGREDIENT_UNITS, isQualitativeUnit };

// Same appliance names offered in the onboarding "Herramientas disponibles"
// question (src/screens/Onboarding.jsx) so a recipe's requiredAppliances
// match what filterRecipes.js checks against the household's kitchenTools.
// Leaving all unchecked means "no special tool", so the dish is never
// excluded by a household's available equipment. Several can be checked
// at once (e.g. oven or airfryer both work) — any one unlocks the dish.
export const COOKING_METHODS = [
  { id: "Horno", label: "Horno" },
  { id: "Airfryer", label: "Airfryer" },
  { id: "Thermomix", label: "Thermomix" },
  { id: "Olla rápida", label: "Olla rápida" },
  { id: "Microondas", label: "Microondas" },
  { id: "Vaporera", label: "Vaporera" },
];

// A hand-picked starting point per aisle so the ingredient step never starts
// from a blank page — especially fruit and veg, which are under-represented
// in the bundled catalog (few dishes list a whole "manzana" as an ingredient,
// but users cooking on their own reach for these constantly).
export const CURATED_INGREDIENTS_BY_AISLE = {
  Frutas: [
    "Manzana", "Plátano", "Naranja", "Limón", "Lima", "Pera", "Melón", "Sandía",
    "Fresa", "Frambuesa", "Arándanos", "Uvas", "Mandarina", "Kiwi", "Mango",
    "Piña", "Granada", "Ciruela", "Melocotón", "Albaricoque", "Higo",
    "Aguacate", "Coco", "Papaya", "Cereza", "Nectarina", "Chirimoya", "Caqui",
    "Membrillo", "Níspero",
  ],
  Verduras: [
    "Tomate", "Cebolla", "Ajo", "Pimiento rojo", "Pimiento verde", "Calabacín",
    "Berenjena", "Zanahoria", "Patata", "Lechuga", "Espinacas", "Acelga",
    "Brócoli", "Coliflor", "Judía verde", "Guisantes", "Puerro", "Apio",
    "Champiñón", "Calabaza", "Pepino", "Rábano", "Remolacha", "Alcachofa",
    "Espárrago", "Col", "Repollo", "Nabo", "Boniato", "Cebolleta", "Endibia",
  ],
  Carne: [
    "Pechuga de pollo", "Muslo de pollo", "Pavo", "Ternera", "Solomillo de cerdo",
    "Chuleta de cerdo", "Costilla", "Cordero", "Chorizo", "Salchicha",
    "Jamón serrano", "Jamón cocido", "Bacon", "Carne picada", "Hamburguesa",
    "Morcilla", "Panceta", "Lomo",
    "Secreto ibérico", "Pluma ibérica", "Presa ibérica", "Carrillera",
    "Rabo de toro", "Morcillo", "Entrecot", "Butifarra", "Fuet",
    "Lomo embuchado", "Cecina", "Sobrasada", "Chistorra", "Longaniza",
  ],
  Pescado: [
    "Merluza", "Salmón", "Bacalao", "Atún", "Gambas", "Langostinos", "Sardinas",
    "Calamar", "Sepia", "Mejillones", "Rape", "Lubina", "Dorada", "Boquerones",
    "Trucha", "Pulpo", "Almejas",
    "Ventresca", "Mojama", "Bonito del norte", "Anchoa en aceite",
    "Percebe", "Navaja", "Berberecho", "Cigala", "Vieira", "Zamburiña",
  ],
  Legumbres: [
    "Lentejas", "Garbanzos", "Alubias blancas", "Alubias pintas", "Judías",
    "Habas", "Tofu", "Soja texturizada",
    "Garrofón", "Judión", "Alubia de Tolosa",
  ],
  "Pasta y arroz": [
    "Arroz", "Arroz integral", "Espaguetis", "Macarrones", "Fideos", "Cuscús",
    "Quinoa", "Lasaña", "Ñoquis",
    "Arroz bomba", "Fideo nº2",
  ],
  Lácteos: [
    "Leche", "Nata", "Yogur natural", "Mantequilla", "Nata para cocinar",
    "Queso rallado", "Queso en lonchas", "Queso de untar", "Queso crema",
    "Queso fresco", "Queso de Burgos", "Requesón", "Cuajada", "Queso cottage",
    "Queso tierno", "Queso semicurado", "Queso curado",
    "Queso manchego", "Queso de oveja", "Idiazábal", "Roncal", "Zamorano",
    "Mahón", "Tetilla", "Arzúa-Ulloa", "San Simón",
    "Torta del Casar", "Torta de la Serena",
    "Queso de cabra", "Rulo de cabra",
    "Cabrales", "Queso azul", "Roquefort", "Gorgonzola", "Valdeón", "Stilton",
    "Mozzarella", "Mozzarella de búfala", "Burrata", "Ricotta", "Mascarpone",
    "Queso parmesano", "Pecorino", "Grana Padano",
    "Feta", "Halloumi",
    "Camembert", "Brie",
    "Cheddar", "Gouda", "Edam", "Emmental", "Gruyère", "Comté", "Havarti",
    "Provolone", "Scamorza", "Fontina", "Taleggio", "Raclette",
  ],
  Huevos: ["Huevo"],
  Panadería: [
    "Pan", "Pan rústico", "Hogaza", "Barra de pan", "Baguette", "Chapata",
    "Pan de pueblo", "Pan de payés", "Pan candeal", "Pan gallego", "Pan de cristal",
    "Pan de molde", "Pan integral", "Pan de centeno", "Pan de semillas", "Pan de cereal",
    "Pan de leche", "Pan de Viena", "Pan de masa madre",
    "Mollete", "Telera", "Panecillo", "Pan pita", "Pan árabe", "Naan",
    "Pan de hamburguesa", "Pan de perrito", "Pan bao",
    "Tortilla de trigo", "Tortilla de maíz",
    "Focaccia", "Brioche", "Croissant", "Bagel",
    "Picos", "Colines", "Biscote",
    "Pan rallado", "Harina", "Avena",
  ],
  Especias: [
    "Sal", "Pimienta negra", "Pimentón dulce", "Comino", "Orégano", "Perejil",
    "Laurel", "Curry", "Cúrcuma", "Canela", "Ajo en polvo", "Guindilla",
    "Albahaca", "Romero", "Tomillo", "Jengibre", "Azafrán",
    "Sal en escamas", "Sal ahumada", "Flor de sal", "Pimienta blanca",
    "Pimienta de Sichuan", "Pimentón ahumado", "Pimentón picante", "Pimentón de la Vera",
    "Ñora", "Anís estrellado", "Cardamomo", "Clavo", "Nuez moscada", "Sumac",
    "Zaatar", "Ras el hanout", "Garam masala", "Cinco especias", "Hierbas provenzales",
    "Eneldo", "Estragón", "Cilantro fresco", "Cilantro en grano", "Mostaza en grano",
    "Azafrán en hebra",
  ],
  "Aceites y conservas": [
    "Aceite de oliva", "Vinagre", "Caldo de verduras", "Caldo de pollo",
    "Salsa de tomate", "Tomate triturado", "Miel", "Mostaza", "Salsa de soja",
    "Aceitunas", "Maicena", "Almendras", "Nueces", "Azúcar", "Vino blanco", "Vino tinto",
    "Wasabi", "Tahini", "Miso", "Gochujang", "Harissa", "Salsa Worcestershire",
    "Vinagre de Jerez", "Vinagre balsámico", "Vinagre de manzana", "Vinagre de arroz",
    "Salsa de ostra", "Salsa de pescado", "Aceite de sésamo", "Aceite de coco",
    "Aceite de girasol", "AOVE picual", "AOVE arbequina", "Pedro Ximénez",
    "Piñón", "Avellana", "Pistacho", "Dátil", "Orejón", "Pasa sultana",
    "Membrillo en pasta", "Chocolate 70%", "Cacao puro", "Levadura fresca",
    "Masa madre", "Hojaldre", "Masa quebrada", "Oblea de empanadilla",
    "Alga nori", "Alga wakame", "Leche de coco", "Leche de almendras",
    "Edamame", "Tempeh", "Seitán",
  ],
};

function dedupeByNormalizedName(names) {
  const seen = new Map();
  for (const name of names) {
    const key = ingredientStem(name);
    if (!key || seen.has(key)) continue;
    seen.set(key, name);
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b, "es"));
}

// Every ingredient name already used across the bundled catalog + garnishes,
// merged with the curated seed above — a ready-made, proven autocomplete list
// for the recipe planner that also covers the gaps a recipe-only catalog has.
const derivedIngredientNames = [...recipeCatalog, ...guarnicionesData]
  .flatMap((r) => r.ingredients ?? [])
  .map((ing) => ing?.name?.trim())
  .filter(Boolean);

/** Ingredient names grouped by supermarket aisle, for a browsable/filterable picker. */
export const INGREDIENT_CATALOG_BY_AISLE = Object.fromEntries(
  SHOPPING_AISLES.map((aisle) => {
    const curated = CURATED_INGREDIENTS_BY_AISLE[aisle] ?? [];
    const derived = derivedIngredientNames.filter((n) => guessShoppingAisle(n) === aisle);
    return [aisle, dedupeByNormalizedName([...curated, ...derived])];
  }),
);

export const INGREDIENT_CATALOG = dedupeByNormalizedName(
  Object.values(INGREDIENT_CATALOG_BY_AISLE).flat(),
);

// Same categories the bundled catalog uses (excluding "bebes" and
// "guarniciones", which aren't things a user creates through this flow).
export const USER_RECIPE_CATEGORIES = [
  { id: "carnes", label: "Carne" },
  { id: "pescados", label: "Pescado" },
  { id: "legumbres", label: "Legumbres" },
  { id: "huevos", label: "Huevos" },
  { id: "pasta_arroces", label: "Pasta / Arroz" },
  { id: "ensaladas_verduras", label: "Ensalada / Verdura" },
  { id: "sopas_cremas", label: "Sopa / Crema" },
  { id: "platos_unicos", label: "Plato único" },
  { id: "cenas_rapidas", label: "Cena rápida" },
];

export const USER_RECIPE_MEAL_ROLES = [
  { id: "primero", label: "Primero" },
  { id: "segundo", label: "Segundo" },
  { id: "plato_unico", label: "Plato único" },
  { id: "cena", label: "Cena" },
];

// How a recipe can be used at the table — proposed by the AI at the review
// step and editable there. Multi-select: the same recipe can be valid as more
// than one thing (e.g. an avocado-mango salad works as a light dish OR a side).
// These are USER-FACING usage tags; the persisted `type` field the rest of the
// app reads (pairGarnishes.js, CatalogBrowserSheet.jsx, recipeSchema.js) is
// derived from them via deriveTypeFromUsageTags so nothing downstream changes.
export const USAGE_TAGS = [
  { id: "plato_unico", label: "Plato único", hint: "Se basta solo (lentejas, cocido)" },
  { id: "plato_normal", label: "Plato normal", hint: "Suele llevar guarnición aparte" },
  { id: "guarnicion", label: "Guarnición", hint: "Acompaña a otro plato" },
];

const USAGE_TAG_IDS = USAGE_TAGS.map((t) => t.id);

/**
 * Collapses the multi-select usage tags into the single legacy `type` value
 * (completo | principal | guarnicion) every existing consumer still reads.
 * Priority: a dish that can be a main ("plato_normal") acts as "principal"
 * even if it can double as a side; a pure side is "guarnicion"; anything else
 * is self-sufficient ("completo").
 */
export function deriveTypeFromUsageTags(usageTags = []) {
  const tags = Array.isArray(usageTags) ? usageTags : [];
  if (tags.includes("plato_normal")) return "principal";
  if (tags.includes("guarnicion") && !tags.includes("plato_unico")) return "guarnicion";
  return "completo";
}

/**
 * Best-effort inverse: seed usage tags from a legacy `type` (used when the AI
 * only returned the old field, or for recipes created before usageTags).
 */
export function deriveUsageTagsFromType(type) {
  if (type === "guarnicion") return ["guarnicion"];
  if (type === "principal") return ["plato_normal"];
  return ["plato_unico"];
}

/** Whether the logged-in user owns this user-created recipe. */
export function isUserRecipeOwner(recipe, user) {
  if (!recipe || recipe.source !== "user" || !user?.id) return false;
  return recipe.owner?.id === user.id;
}

/** User recipe cloned from a catalog dish + fixed garnish (browse-only combos). */
export function isCatalogGarnishCombo(recipe) {
  return Boolean(recipe?.linkedCatalogId && recipe?.pinnedGarnishId);
}

/**
 * True only for recipes saved via Crear receta (RecipePlanner): user_* id,
 * source user, stamped owner matching the logged-in user. Excludes catalog
 * clones, garnish-combo shortcuts, and legacy rows without owner.
 */
export function isOwnCreatedRecipe(recipe, user) {
  if (!recipe?.id?.startsWith?.("user_")) return false;
  if (recipe.source !== "user") return false;
  if (isCatalogGarnishCombo(recipe)) return false;
  return isUserRecipeOwner(recipe, user);
}

/** @param {object[]} userRecipes @param {{ id?: string } | null} user */
export function filterOwnCreatedRecipes(userRecipes, user) {
  return (userRecipes ?? []).filter((r) => isOwnCreatedRecipe(r, user));
}

/**
 * Recompute catalog fields after the owner edits Tipo / Aplica inline.
 * Mirrors RecipePlannerScreen#saveRecipe classification logic.
 */
export function patchUserRecipeClassification(recipe, { usageTags, mealRole, quickDinner } = {}) {
  const tags = usageTags ?? recipe.usageTags ?? deriveUsageTagsFromType(recipe.type);
  const type = deriveTypeFromUsageTags(tags);
  const isGarnishOnly = type === "guarnicion";
  const qd = quickDinner ?? isMontaje(recipe);
  const roles = mealRole ?? recipe.mealRole ?? [];
  const fallbackCategory =
    recipe.category && recipe.category !== "cenas_rapidas" && recipe.category !== "guarniciones"
      ? recipe.category
      : "platos_unicos";

  return {
    ...recipe,
    usageTags: tags,
    type,
    // "Cena rápida" pasa a viajar en `montaje`, su propio eje, en vez de
    // secuestrar `category` (que ahora solo responde "qué lleva el plato").
    // La categoría deprecada solo se conserva si la receta YA la tenía: las
    // recetas de usuario existentes no se migran, y isMontaje() las sigue
    // resolviendo por el fallback.
    montaje: qd,
    category: isGarnishOnly
      ? "guarniciones"
      : qd && recipe.category === "cenas_rapidas"
        ? "cenas_rapidas"
        : fallbackCategory,
    mealRole: isGarnishOnly
      ? ["guarnicion"]
      : qd
        ? Array.from(new Set([...roles.filter((r) => r !== "guarnicion"), "cena"]))
        : roles,
    pinnedGarnishId: type === "principal" ? recipe.pinnedGarnishId : undefined,
    linkedCatalogId: tags.includes("guarnicion") ? recipe.linkedCatalogId : undefined,
    source: "user",
  };
}

export const USER_RECIPE_PROTEINS = [
  { id: "pollo", label: "Pollo" },
  { id: "pavo", label: "Pavo" },
  { id: "cerdo", label: "Cerdo" },
  { id: "ternera", label: "Ternera" },
  { id: "pescado_blanco", label: "Pescado blanco" },
  { id: "pescado_azul", label: "Pescado azul" },
  { id: "marisco", label: "Marisco" },
  { id: "huevo", label: "Huevo" },
  { id: "legumbre", label: "Legumbre" },
  { id: "none", label: "Sin proteína animal / legumbre" },
];

export const INGREDIENT_UNITS = [
  "g",
  "kg",
  "ml",
  "l",
  "ud",
  "cucharada",
  "cucharadita",
  "taza",
  "diente",
  "pizca",
  "al gusto",
  "c/n",
];

export const ALLERGEN_OPTIONS = Object.entries(EU_ALLERGENS).map(([id, meta]) => ({
  id,
  label: meta.label,
  Icon: meta.Icon,
  color: meta.color,
}));

export function buildUserRecipeId() {
  return `user_${uid()}`;
}

/**
 * Builds a "combo" user recipe from a catalog dish + a garnish, so a user can
 * save a MenuPlan catalog recipe paired with the side they like into "Mis
 * recetas". From there it joins the pool like any other own recipe and is
 * favored/excluded by the general recipeMode setting (preferir/solo mías).
 *
 * Macros are per-ración: the garnish JSON stores them per its own baseServings,
 * so we normalize before adding. Ingredients are re-scaled to the dish's
 * baseServings and merged. Time is the max (dishes cook in parallel).
 *
 * @param {object} recipe - catalog recipe (protein_g/… flat shape)
 * @param {object} garnish - guarniciones.json entry
 * @returns {object} a new user recipe (source: "user"), not yet persisted
 */
export function buildGarnishComboRecipe(recipe, garnish) {
  const gPer = garnish.baseServings ?? 1;
  const baseServings = recipe.baseServings ?? gPer;
  const perServing = (v) => Math.round((Number(v) || 0) / gPer);
  const factor = baseServings / gPer;

  const garnishIngredients = (garnish.ingredients ?? []).map((ing) => {
    let amount = ing.amount != null ? ing.amount * factor : ing.amount;
    if (amount != null) {
      if (ing.unit === "g" || ing.unit === "ml") {
        amount = Math.max(5, Math.round(amount / 5) * 5);
      } else {
        amount = Math.ceil(amount);
      }
    }
    return { name: ing.name, amount, unit: ing.unit };
  });

  const shortGarnish = garnish.shortName ?? garnish.name;

  return {
    id: buildUserRecipeId(),
    name: `${recipe.name} con ${shortGarnish}`,
    category: recipe.category,
    mainProtein: recipe.mainProtein ?? "none",
    mealRole: recipe.mealRole ?? ["segundo"],
    usageTags: deriveUsageTagsFromType(recipe.type),
    type: recipe.type ?? "principal",
    time: Math.max(recipe.time ?? 0, garnish.time ?? 0),
    difficulty: recipe.difficulty ?? "normal",
    season: recipe.season ?? "all",
    kcal: (Number(recipe.kcal) || 0) + perServing(garnish.kcal),
    protein_g: (Number(recipe.protein_g) || 0) + perServing(garnish.protein_g),
    carbs_g: (Number(recipe.carbs_g) || 0) + perServing(garnish.carbs_g),
    fat_g: (Number(recipe.fat_g) || 0) + perServing(garnish.fat_g),
    baseServings,
    kidFriendly: Boolean(recipe.kidFriendly),
    tupperFriendly: Boolean(recipe.tupperFriendly),
    allergens: [...new Set([...(recipe.allergens ?? []), ...(garnish.allergens ?? [])])],
    ingredients: [...(recipe.ingredients ?? []), ...garnishIngredients],
    steps: [...(recipe.steps ?? []), ...(garnish.steps ?? [])],
    description: `${recipe.description || recipe.name} con ${shortGarnish}`,
    // Provenance so the combo is traceable back to the catalog dish + garnish.
    linkedCatalogId: recipe.id,
    pinnedGarnishId: garnish.id,
    requiredAppliances: undefined,
    methods: [],
    source: "user",
    createdAt: Date.now(),
  };
}

/**
 * Generates a dish photo through the server-side `/api/generate-dish-photo`
 * proxy, which keeps GEMINI_AI_STUDIO_KEY off the client and reuses the exact
 * same fixed style formula as the curated catalog (see
 * scripts/lib/combos.mjs#buildPrompt) so AI-made photos stay visually
 * consistent with the rest of MenuPlan.
 *
 * @param {string} dishName
 * @param {{ signal?: AbortSignal, category?: string, steps?: string[] }} [opts]
 *   `category` "bebes" switches the server to a baby-texture prompt: every
 *   baby recipe ends its steps in "triturar" (smooth blend) or "chafar"
 *   (fork-mash) — `steps` lets the server pick the matching texture instead
 *   of forcing a liquid-smooth purée on a dish that should look mashed.
 * @returns {Promise<string>} a data: URL with the generated JPEG
 */
export async function generateDishPhotoWithAI(dishName, { signal, category, steps } = {}) {
  let response;
  try {
    response = await fetch("/api/generate-dish-photo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dishName, category, steps }),
      signal,
    });
  } catch (err) {
    if (err?.name === "AbortError") throw err;
    throw new AIPlannerError(
      "No se pudo contactar con el servicio de fotos. Comprueba la conexión.",
      { cause: err },
    );
  }

  let payload;
  try {
    payload = await response.json();
  } catch (err) {
    throw new AIPlannerError("Respuesta no válida del servicio de fotos.", { cause: err });
  }

  if (!response.ok || !payload?.photo) {
    throw new AIPlannerError(payload?.error || "No se pudo generar la foto con IA.", { raw: payload });
  }
  return payload.photo;
}

export function iconTypeForRecipe(recipe) {
  return ICON_TYPE_MAP[recipe.mainProtein] ?? CATEGORY_ICON[recipe.category] ?? "chef";
}

// "al gusto" / "pizca" / "c/n" don't carry a fixed numeric amount (see
// isQualitativeUnit) — the amount is only required for units that are
// actually weighed/measured/counted.
const IngredientSchema = z
  .object({
    name: z.string().min(1),
    amount: z.coerce.number().positive().optional().nullable(),
    // Kept in sync with INGREDIENT_UNITS (the wizard's unit picker) — if the
    // user picks any of these, the AI echoes it back verbatim in `ingredients`
    // and this must accept it, or the whole draft fails schema validation.
    unit: z.enum(INGREDIENT_UNITS),
  })
  .refine((ing) => isQualitativeUnit(ing.unit) || typeof ing.amount === "number", {
    message: "amount es obligatorio salvo para unidades sin cantidad fija (al gusto/pizca/c/n)",
    path: ["amount"],
  });

// Safety nets for the two enum fields the model most often drifts on with a
// bare/ambiguous prompt ("pescado" instead of pescado_blanco/azul, "todo_el_ano"
// instead of "all"). The system prompt now spells out the exact values, but
// fast/cheap models can still slip — these normalizers fix the common misses
// client-side instead of failing the whole draft.
const MAIN_PROTEIN_IDS = USER_RECIPE_PROTEINS.map((p) => p.id);
const BLUE_FISH_RE = /salmon|atun|sardina|caballa|boqueron|trucha|bonito|melva|jurel|anchoa/;
const WHITE_FISH_RE = /merluza|bacalao|lenguado|rape|dorada|lubina|rodaballo|gallo|emperador|panga|abadejo/;
const SHELLFISH_RE = /gamba|langostino|mejillon|calamar|sepia|pulpo|almeja|percebe|centollo|cigala|marisco|berberecho|bogavante/;
const NO_PROTEIN_RE = /vegetal|vegetarian|verdura|ninguna|ninguno|ningun|sin proteina/;

function normalizeMainProtein(value, ingredientNames = []) {
  if (MAIN_PROTEIN_IDS.includes(value)) return value;
  const text = normalizeName([value, ...ingredientNames].filter(Boolean).join(" "));
  if (NO_PROTEIN_RE.test(text)) return "none";
  if (BLUE_FISH_RE.test(text)) return "pescado_azul";
  if (WHITE_FISH_RE.test(text)) return "pescado_blanco";
  if (SHELLFISH_RE.test(text)) return "marisco";
  // Genuinely unmappable ("pescado" with no recognizable fish in the
  // ingredients, etc.) — leave untouched so validation surfaces a clear error
  // rather than silently guessing something that could be wrong.
  return value;
}

const SEASON_IDS = ["all", "verano", "invierno"];

function normalizeSeason(value) {
  if (SEASON_IDS.includes(value)) return value;
  const text = normalizeName(value);
  if (/verano|estival/.test(text)) return "verano";
  if (/invierno/.test(text)) return "invierno";
  // "todo_el_ano", "todo el año", "anual", "primavera", "otoño"... — anything
  // else defaults to "all" (valid year-round), the safest interpretation.
  return "all";
}

// Same idea for the other enum/array fields the model can drift on with a
// terse prompt — normalize common near-misses instead of failing the whole
// draft over a single wrong word.
const CATEGORY_IDS = USER_RECIPE_CATEGORIES.map((c) => c.id).concat("guarniciones");
const CATEGORY_ALIASES = [
  [/pollo|pavo|cerdo|ternera|carne|cordero/, "carnes"],
  [/pescad|marisco/, "pescados"],
  [/legumbre|lenteja|garbanz|alubi/, "legumbres"],
  [/huevo|tortilla|revuelto/, "huevos"],
  [/pasta|arroz|espagueti|macarron|fideo/, "pasta_arroces"],
  [/ensalada|verdura|vegetal/, "ensaladas_verduras"],
  [/sopa|crema|caldo/, "sopas_cremas"],
  [/unico|completo|guiso/, "platos_unicos"],
  [/cena.?rapid|sandwich|tosta/, "cenas_rapidas"],
  [/guarnicion|acompañ/, "guarniciones"],
];
function normalizeCategory(value) {
  if (CATEGORY_IDS.includes(value)) return value;
  const text = normalizeName(value);
  for (const [regex, id] of CATEGORY_ALIASES) {
    if (regex.test(text)) return id;
  }
  return value;
}

const DIFFICULTY_IDS = ["facil", "normal", "elaborada"];
function normalizeDifficulty(value) {
  if (DIFFICULTY_IDS.includes(value)) return value;
  const text = normalizeName(value);
  if (/facil|easy|sencill/.test(text)) return "facil";
  if (/dificil|elaborad|complej|hard/.test(text)) return "elaborada";
  if (/media|medio|normal|intermedi/.test(text)) return "normal";
  return value;
}

const MEAL_ROLE_IDS = USER_RECIPE_MEAL_ROLES.map((r) => r.id).concat("guarnicion");
function normalizeMealRole(value, type) {
  const valid = Array.isArray(value) ? value.filter((r) => MEAL_ROLE_IDS.includes(r)) : [];
  if (valid.length > 0) return valid;
  // The model returned nothing usable — infer a sensible default from the
  // classification instead of failing the draft over a missing hint field.
  if (type === "guarnicion") return ["guarnicion"];
  if (type === "principal") return ["segundo"];
  return ["plato_unico"];
}

// "gr"/"gramos" -> "g", "unidad(es)" -> "ud", "cda"/"cdta" -> cucharada(s)...
// — common shorthand the model can use instead of the exact enum values.
const UNIT_ALIASES = [
  [/^gr(s|amos?)?$/, "g"],
  [/^kg(s|ramos?)?$/, "kg"],
  [/^mls?$/, "ml"],
  [/^litro?s?$/, "l"],
  [/^unidad(es)?$/, "ud"],
  [/^cdas?$/, "cucharada"],
  [/^cucharadas?$/, "cucharada"],
  [/^cdtas?$/, "cucharadita"],
  [/^cucharaditas?$/, "cucharadita"],
  [/^tazas?$/, "taza"],
  [/^dientes?$/, "diente"],
  [/^pizcas?$/, "pizca"],
  [/^c\s*\/?\s*n\.?$/, "c/n"],
  [/^cantidad necesaria$/, "c/n"],
];
function normalizeUnit(value) {
  if (INGREDIENT_UNITS.includes(value)) return value;
  const text = normalizeName(value);
  for (const [regex, id] of UNIT_ALIASES) {
    if (regex.test(text)) return id;
  }
  return value;
}

// El system prompt que antes vivia aqui (SUGGEST_INGREDIENTS_SYSTEM) ahora es propiedad
// del servidor: api/_prompts.js. El cliente solo envia un `task`, para que
// /api/generate no pueda usarse como LLM generico con un prompt cualquiera.

/**
 * Suggests a plausible ingredient list from just a dish name. Used to pre-fill
 * the wizard's ingredient step. Returns [] on empty name; throws AIPlannerError
 * on failure so the caller can fall back to a blank list silently.
 *
 * @param {string} name
 * @param {{ servings?: number, signal?: AbortSignal }} [opts]
 * @returns {Promise<Array<{name:string, amount?:number, unit:string}>>}
 */
export async function suggestRecipeIngredients(name, { servings = 4, signal } = {}) {
  const clean = String(name || "").trim();
  if (!clean) return [];
  const body = {
    model: FAST_MODEL,
    max_tokens: 500,
    task: "suggest-ingredients",
    messages: [{ role: "user", content: JSON.stringify({ name: clean, servings }) }],
  };
  let parsed;
  try {
    const text = await callModel(body, signal);
    parsed = extractJson(text);
  } catch (err) {
    if (err instanceof AIPlannerError) throw err;
    throw new AIPlannerError("No se pudieron sugerir ingredientes.", { cause: err });
  }
  const list = Array.isArray(parsed?.ingredients) ? parsed.ingredients : [];
  return list
    .filter((i) => i && typeof i.name === "string" && i.name.trim())
    .map((i) => {
      const unit = normalizeUnit(i.unit);
      const out = { name: i.name.trim(), unit };
      if (!isQualitativeUnit(unit)) out.amount = Number(i.amount) || 0;
      return out;
    })
    .slice(0, 12);
}

// What the AI is asked to fill in / return. Name, ingredients, time and
// servings are treated as ground truth from the user and echoed back as-is
// by the model rather than re-guessed.
export const UserRecipeDraftSchema = z.object({
  name: z.string().min(1),
  category: z.enum([
    "carnes", "pescados", "legumbres", "huevos", "pasta_arroces",
    "ensaladas_verduras", "sopas_cremas", "platos_unicos", "cenas_rapidas",
    "guarniciones",
  ]),
  mainProtein: z.enum([
    "pollo", "pavo", "cerdo", "ternera", "pescado_blanco", "pescado_azul",
    "marisco", "huevo", "legumbre", "none",
  ]),
  mealRole: z.array(z.enum(["primero", "segundo", "plato_unico", "cena", "guarnicion"])).min(1),
  // How the dish can be served — multi-select. `type` (below) is derived from
  // this and kept in sync for backward compatibility with the rest of the app.
  usageTags: z.array(z.enum(["plato_unico", "plato_normal", "guarnicion"])).min(1),
  type: z.enum(["completo", "principal", "guarnicion"]),
  // Coerced: fast/cheap models occasionally quote numbers ("30" instead of 30)
  // — tolerate that instead of failing the whole draft over formatting.
  time: z.coerce.number().positive(),
  difficulty: z.enum(["facil", "normal", "elaborada"]),
  kcal: z.coerce.number().nonnegative(),
  protein_g: z.coerce.number().nonnegative(),
  carbs_g: z.coerce.number().nonnegative(),
  fat_g: z.coerce.number().nonnegative(),
  baseServings: z.coerce.number().positive(),
  kidFriendly: z.boolean(),
  tupperFriendly: z.boolean(),
  allergens: z.array(z.enum(Object.keys(EU_ALLERGENS))),
  season: z.enum(["all", "verano", "invierno"]),
  ingredients: z.array(IngredientSchema).min(1),
  steps: z.array(z.string().min(1)).min(1),
  // Paso a paso estructurado, mismo formato que el catálogo. Opcional: si el
  // modelo devuelve pasos sin metadatos, `steps` (plano) sigue funcionando.
  stepsRich: z.array(StepRichSchema).min(1).optional(),
  description: z.string().min(1),
});

// El system prompt que antes vivia aqui (SYSTEM_PROMPT) ahora es propiedad
// del servidor: api/_prompts.js. El cliente solo envia un `task`, para que
// /api/generate no pueda usarse como LLM generico con un prompt cualquiera.

/**
 * Sends the user's partial recipe input to Claude and returns a full recipe
 * object matching the same shape as the bundled catalog (see
 * src/data/recipes/*.json), tagged with `source: "user"` so it never mixes
 * with the curated catalog files. Macros/allergens are AI estimates — the UI
 * should let the user review (especially allergens) before saving.
 *
 * @param {Object} input - whatever the recipe planner wizard collected
 * @returns {Promise<Object>} validated recipe object, not yet persisted
 */
export async function generateUserRecipeDraft(input, { signal } = {}) {
  // Classification (usageTags/type/category/mainProtein) is now proposed by the
  // AI and confirmed by the user at the review step — so we no longer force it
  // upfront. Only the ground-truth the user actually typed is passed as hints.
  const userPayload = {
    name: input.name,
    servings: input.baseServings,
    timeMin: input.time,
    mealRole: input.mealRole?.length ? input.mealRole : undefined,
    kidFriendly: typeof input.kidFriendly === "boolean" ? input.kidFriendly : undefined,
    ingredients: (input.ingredients ?? []).map((i) => ({
      name: i.name,
      unit: i.unit,
      // No fixed amount to send for qualitative units — omit rather than
      // force a fake 0, so the model doesn't try to "correct" it.
      ...(isQualitativeUnit(i.unit) ? {} : { amount: Number(i.amount) || 0 }),
    })),
    allergens: input.allergens?.length ? input.allergens : undefined,
    preparationNotes: input.preparationNotes || undefined,
  };

  const body = {
    model: FAST_MODEL,
    // Los pasos pasaron de strings a objetos {text, minutes, kind} y sin tope
    // de número de pasos: una receta larga se truncaba a medio JSON con 1200.
    max_tokens: 2600,
    task: "structure-recipe",
    messages: [{ role: "user", content: JSON.stringify(userPayload) }],
  };

  let parsed;
  try {
    const text = await callModel(body, signal);
    parsed = extractJson(text);
  } catch (err) {
    if (err instanceof AIPlannerError) throw err;
    throw new AIPlannerError("No se pudo generar la receta con IA.", { cause: err });
  }

  // Be forgiving if the model returns only one of the two classification
  // fields: fill in the missing side so validation can succeed, then let the
  // user adjust at the review step.
  if (parsed && typeof parsed === "object") {
    const validUsage = Array.isArray(parsed.usageTags)
      ? parsed.usageTags.filter((t) => USAGE_TAG_IDS.includes(t))
      : [];
    if (validUsage.length === 0) {
      parsed.usageTags = deriveUsageTagsFromType(parsed.type);
    } else {
      parsed.usageTags = validUsage;
    }
    parsed.type = deriveTypeFromUsageTags(parsed.usageTags);
    parsed.mainProtein = normalizeMainProtein(
      parsed.mainProtein,
      (parsed.ingredients ?? []).map((i) => i?.name),
    );
    parsed.season = normalizeSeason(parsed.season);
    parsed.category = normalizeCategory(parsed.category);
    parsed.difficulty = normalizeDifficulty(parsed.difficulty);
    parsed.mealRole = normalizeMealRole(parsed.mealRole, parsed.type);
    // The prompt asks the model to echo `ingredients` back verbatim (name/
    // amount/unit), never adding, dropping or re-quantifying any — so the
    // user's own list (already guaranteed valid: every unit came from this
    // wizard's own INGREDIENT_UNITS picker, see userPayload above) is always
    // ground truth. Fast/cheap models occasionally ignore that instruction
    // and hallucinate an extra ingredient with a unit outside the enum,
    // which previously failed the WHOLE draft over a field we don't even
    // need the model's version of. Use the user's list directly instead of
    // trusting the echo, so this entire failure mode can't happen.
    parsed.ingredients = userPayload.ingredients;

    // El modelo devuelve `steps` como objetos enriquecidos; normalizarlos aquí
    // (tolera también un array de strings, que es a lo que cae un modelo rápido
    // cuando se despista) y derivar de ahí los `steps` planos, que siguen
    // siendo la fuente de verdad / fallback y no pueden llevar marcadores.
    // Solo se guarda `stepsRich` si los pasos traen metadatos de verdad: un
    // stepper donde todo pone "A continuación" y sin tiempos es peor que la
    // lista numerada de siempre.
    const rich = normalizeRichSteps(parsed.steps);
    if (rich.length > 0) {
      parsed.steps = richToPlainSteps(rich);
      parsed.stepsRich = rich.some((s) => s.kind || s.minutes) ? rich : undefined;
    }
  }

  const validation = UserRecipeDraftSchema.safeParse(parsed);
  if (!validation.success) {
    // Surface exactly which field(s) failed instead of a generic message —
    // makes it obvious from the UI alone (no DevTools needed) what the model
    // drifted on, e.g. "category: Invalid enum value...".
    const detail = validation.error.issues
      .map((i) => `${i.path.join(".") || "?"}: ${i.message}`)
      .join(" · ");
    console.error("[generateUserRecipeDraft] Zod validation failed", validation.error.issues, parsed);
    throw new AIPlannerError(
      `La IA no devolvió una receta con el formato esperado (${detail}). Prueba de nuevo.`,
      { cause: validation.error, raw: parsed },
    );
  }

  const draft = validation.data;
  return {
    ...draft,
    id: buildUserRecipeId(),
    requiredAppliances: undefined,
    methods: [],
    source: "user",
    createdAt: Date.now(),
  };
}
