/**
 * Postre planning helpers — effort tiers (inmediato / cazo / horno) and the
 * seasonal-fruit overlay. Desserts live outside cook-time: this module never
 * reads maxTime. The onboarding section owns the questions; the planner only
 * filters the off-menu pool.
 */

export const SEASONAL_FRUIT_RECIPE_ID = "postres_003";

export const POSTRE_TIPOS = [
  {
    id: "inmediato",
    title: "Al momento",
    subtitle: "Sin cocinar",
    img: "/avatares/cards/postre_inmediato.png",
  },
  {
    id: "cazo",
    title: "De cazo",
    subtitle: "Arroz con leche, natillas",
    img: "/avatares/cards/postre_intermedio.png",
  },
  {
    id: "horno",
    title: "De horno",
    subtitle: "Flan, tarta, bizcocho",
    img: "/avatares/cards/postre_elaborado.png",
  },
];

export const POSTRE_INMEDIATO_KINDS = [
  { id: "fruta", label: "Fruta", img: "/categories/cut/frutas.png" },
  { id: "yogur", label: "Yogur", img: "/ingredients/yogur-cut.png" },
  // "+" = pool de fruta O yogur (elige uno u otro cada día), no un plato mezclado.
  { id: "mix", label: "Yogur + fruta", img: "/avatares/cards/yogur_fruta.png" },
];

/** Calendar season in Spain (meteorological quarters). */
export function currentFruitSeason(date = new Date()) {
  const m = date.getMonth() + 1;
  if (m >= 3 && m <= 5) return "primavera";
  if (m >= 6 && m <= 8) return "verano";
  if (m >= 9 && m <= 11) return "otono";
  return "invierno";
}

/**
 * What "fruta de temporada" means this quarter: visible name, shopping
 * ingredients, and the overhead thumbnail (Gemini, same bowl+slate as the
 * rest of the catalog). Paths live under /dishes so they resolve like any
 * other recipe photo; missing files fall through to the generic postres_003
 * blob via dishImageForRecipe.
 */
export const FRUIT_SEASON = {
  invierno: {
    label: "Naranja y kiwi",
    hint: "Naranja, mandarina, kiwi",
    ingredients: [
      { name: "Naranja", amount: 2, unit: "ud" },
      { name: "Kiwi", amount: 2, unit: "ud" },
    ],
    image: "/seasonal-fruit/fruta_temporada_invierno.jpg",
  },
  primavera: {
    label: "Fresas",
    hint: "Fresa, níspero, cereza",
    ingredients: [
      { name: "Fresas", amount: 250, unit: "g" },
      { name: "Nísperos", amount: 4, unit: "ud" },
    ],
    image: "/seasonal-fruit/fruta_temporada_primavera.jpg",
  },
  verano: {
    label: "Melocotón y sandía",
    hint: "Melocotón, sandía, nectarina",
    ingredients: [
      { name: "Melocotón", amount: 2, unit: "ud" },
      { name: "Sandía", amount: 400, unit: "g" },
    ],
    image: "/seasonal-fruit/fruta_temporada_verano.jpg",
  },
  otono: {
    label: "Uva y granada",
    hint: "Uva, granada, manzana",
    ingredients: [
      { name: "Uvas", amount: 250, unit: "g" },
      { name: "Granada", amount: 1, unit: "ud" },
    ],
    image: "/seasonal-fruit/fruta_temporada_otono.jpg",
  },
};

export function seasonalFruitMeta(date = new Date()) {
  return FRUIT_SEASON[currentFruitSeason(date)];
}

export function isSeasonalFruitRecipe(recipe) {
  if (!recipe) return false;
  const id = recipe.baseRecipeId ?? recipe.id ?? "";
  return id === SEASONAL_FRUIT_RECIPE_ID || id.endsWith(`__${SEASONAL_FRUIT_RECIPE_ID}`);
}

/**
 * Overlay the current season onto the generic "Fruta de temporada" recipe
 * (name, ingredients, photo). Other recipes pass through unchanged.
 */
export function applySeasonalFruit(catalogRecipe, date = new Date()) {
  if (!catalogRecipe || catalogRecipe.id !== SEASONAL_FRUIT_RECIPE_ID) return catalogRecipe;
  const meta = seasonalFruitMeta(date);
  return {
    ...catalogRecipe,
    name: meta.label,
    description: `Fruta de temporada (${meta.hint})`,
    ingredients: meta.ingredients,
    photo: meta.image,
  };
}

function recipeEffort(r) {
  return r.effort ?? "inmediato";
}

function recipeKind(r) {
  return r.dessertKind ?? null;
}

/**
 * Narrow the off-menu postre pool to the user's effort tier (and, for
 * inmediato, the fruta/yogur micro-toggle). Soft: if a filter would empty the
 * pool we fall back so the slot is never left blank.
 */
export function filterPostrePool(pool, extraMeals = {}) {
  const tipo = extraMeals.postreTipo ?? "inmediato";
  const byTipo = pool.filter((r) => recipeEffort(r) === tipo);
  let next = byTipo.length > 0 ? byTipo : pool;

  if (tipo === "inmediato") {
    const kind = extraMeals.postreInmediato ?? "mix";
    if (kind === "fruta" || kind === "yogur") {
      const byKind = next.filter((r) => recipeKind(r) === kind);
      if (byKind.length > 0) next = byKind;
    }
  }
  return next;
}
