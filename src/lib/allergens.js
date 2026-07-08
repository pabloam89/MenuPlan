import {
  Bean,
  CircleDot,
  Egg,
  Fish,
  FlaskConical,
  Leaf,
  Milk,
  Nut,
  Shell,
  Shrimp,
  Sprout,
  Wheat,
  Wine,
} from "lucide-react";
import { compileKeywordRegex, normalizeText } from "./recipeText.js";

/** Reglamento UE — 14 alérgenos declarables */
export const EU_ALLERGENS = {
  gluten: {
    label: "Gluten",
    Icon: Wheat,
    color: "#a67c00",
  },
  crustaceos: {
    label: "Crustáceos",
    Icon: Shrimp,
    color: "#c03818",
  },
  huevos: {
    label: "Huevos",
    Icon: Egg,
    color: "#c8a000",
  },
  pescado: {
    label: "Pescado",
    Icon: Fish,
    color: "#2072b8",
  },
  cacahuetes: {
    label: "Cacahuetes",
    Icon: Nut,
    color: "#b86a2a",
  },
  soja: {
    label: "Soja",
    Icon: Bean,
    color: "#5a8f3a",
  },
  leche: {
    label: "Leche",
    Icon: Milk,
    color: "#4a7ab8",
  },
  frutos_cascara: {
    label: "Frutos de cáscara",
    Icon: Nut,
    color: "#8a5a28",
  },
  apio: {
    label: "Apio",
    Icon: Leaf,
    color: "#4cba6e",
  },
  mostaza: {
    label: "Mostaza",
    Icon: FlaskConical,
    color: "#d4a017",
  },
  sesamo: {
    label: "Sésamo",
    Icon: CircleDot,
    color: "#9a7b4f",
  },
  sulfitos: {
    label: "Sulfitos",
    Icon: Wine,
    color: "#8b4a6b",
  },
  altramuces: {
    label: "Altramuces",
    Icon: Sprout,
    color: "#6b9a3a",
  },
  moluscos: {
    label: "Moluscos",
    Icon: Shell,
    color: "#5a6a8a",
  },
};

const ALLERGEN_ALIASES = {
  gluten: "gluten",
  crustaceos: "crustaceos",
  crustaceo: "crustaceos",
  marisco: "crustaceos",
  mariscos: "crustaceos",
  huevo: "huevos",
  huevos: "huevos",
  pescado: "pescado",
  cacahuete: "cacahuetes",
  cacahuetes: "cacahuetes",
  soja: "soja",
  lactosa: "leche",
  leche: "leche",
  frutos_secos: "frutos_cascara",
  frutos_de_cascara: "frutos_cascara",
  frutos_cascara: "frutos_cascara",
  apio: "apio",
  mostaza: "mostaza",
  sesamo: "sesamo",
  sésamo: "sesamo",
  sulfito: "sulfitos",
  sulfitos: "sulfitos",
  dioxido_de_azufre: "sulfitos",
  altramuz: "altramuces",
  altramuces: "altramuces",
  molusco: "moluscos",
  moluscos: "moluscos",
};

function slugifyAllergen(raw) {
  return String(raw)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "_");
}

/** @param {string} raw */
export function normalizeAllergenId(raw) {
  const slug = slugifyAllergen(raw);
  return ALLERGEN_ALIASES[slug] ?? slug;
}

// Ingredient-name safety net for allergens the bundled catalog does NOT encode
// in its `allergens` field (see recipeSchema.js ALLERGENS: only 8 of the 14 UE
// allergens are representable). Without this, marking e.g. "Soja" or
// "Cacahuetes" would exclude ZERO recipes — a false sense of safety. Keys are
// normalized allergen ids (see normalizeAllergenId). Over-exclusion is the safe
// direction for an allergen, so lists favor coverage over precision.
export const INGREDIENT_ALLERGEN_KEYWORDS = {
  cacahuetes: ["cacahuete", "cacahuate"],
  soja: ["soja", "tofu", "edamame", "tempeh", "tamari", "miso"],
  apio: ["apio"],
  mostaza: ["mostaza"],
  sulfitos: ["sulfito", "vino", "vinagre"],
  altramuces: ["altramuz", "altramuces", "lupino"],
};

const INGREDIENT_ALLERGEN_RE = Object.fromEntries(
  Object.entries(INGREDIENT_ALLERGEN_KEYWORDS).map(([id, words]) => [id, compileKeywordRegex(words)]),
);

/**
 * Safety net: does any of a recipe's ingredient names reveal a blocked allergen
 * that the catalog's `allergens` field cannot encode? Only checks the allergens
 * in INGREDIENT_ALLERGEN_KEYWORDS; the other 8 are already covered by declared
 * `allergens`, so this never second-guesses them.
 *
 * @param {string[]} ingredientNames
 * @param {Set<string>|Iterable<string>} blockedAllergenIds - normalized ids
 * @returns {boolean}
 */
export function recipeIngredientsHitAllergens(ingredientNames, blockedAllergenIds) {
  const names = (ingredientNames ?? []).map(normalizeText);
  for (const id of blockedAllergenIds) {
    const re = INGREDIENT_ALLERGEN_RE[id];
    if (!re) continue;
    if (names.some((name) => re.test(name))) return true;
  }
  return false;
}

/** @param {string[] | undefined} allergens */
export function resolveRecipeAllergens(allergens) {
  const seen = new Set();
  const items = [];
  for (const raw of allergens ?? []) {
    const id = normalizeAllergenId(raw);
    const meta = EU_ALLERGENS[id];
    if (!meta || seen.has(id)) continue;
    seen.add(id);
    items.push({ id, ...meta });
  }
  return items;
}

/** @param {string[] | undefined} allergens */
export function formatAllergenLabels(allergens) {
  return resolveRecipeAllergens(allergens)
    .map((a) => a.label)
    .join(", ");
}
