// Canonical food-group taxonomy shared across analytics/insights.
//
// The app has two recipe vocabularies that must map to the SAME food groups:
//   - AI/catalog recipes carry `iconType` (fish/meat/egg/legume/pasta/rice/
//     greens/soup/chef) plus `category`/`mainProtein`, and their `tags` are
//     just [category, mainProtein] (e.g. ["pescados","pescado_blanco"]).
//   - Legacy seed recipes (data/recipes.js) carry human tags like
//     "pescado", "verdura", "legumbres", "pasta"...
//
// Matching a menu against weekly goals (verdura/pescado/legumbres) by the
// legacy singular tags alone silently misses every catalog recipe, so all
// consumers must resolve the group through this single helper instead.

export const FOOD_GROUP_LABELS = {
  pescado: "Pescado",
  carne: "Carne",
  legumbres: "Legumbres",
  huevos: "Huevos",
  verdura: "Verdura",
  pasta: "Pasta",
  arroz: "Arroz",
  otros: "Otros",
};

// iconType (set by catalogToFrontendRecipe / data/recipes.js) is the most
// reliable signal for catalog recipes, so it's checked first.
const ICON_TYPE_TO_GROUP = {
  fish: "pescado",
  meat: "carne",
  egg: "huevos",
  legume: "legumbres",
  pasta: "pasta",
  rice: "arroz",
  greens: "verdura",
  soup: "verdura",
};

function normalizedText(value) {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/**
 * Resolve a recipe (catalog or legacy) to a single canonical food group.
 * Order: iconType → legacy tags → recipe name heuristics.
 *
 * @param {Object} recipe
 * @returns {"pescado"|"carne"|"legumbres"|"huevos"|"verdura"|"pasta"|"arroz"|"otros"}
 */
export function foodGroupOf(recipe) {
  if (!recipe) return "otros";

  if (recipe.iconType && ICON_TYPE_TO_GROUP[recipe.iconType]) {
    return ICON_TYPE_TO_GROUP[recipe.iconType];
  }

  const tags = recipe.tags ?? [];
  const name = normalizedText(recipe.name);

  if (tags.includes("pescado") || /pesc|merluza|salmon|bacalao|atun/.test(name)) return "pescado";
  if (tags.includes("carne") || /pollo|ternera|cerdo|carne|lomo|hamburg/.test(name)) return "carne";
  if (tags.includes("legumbres") || /lentej|garbanz|alubia|judia/.test(name)) return "legumbres";
  if (tags.includes("huevos") || /huevo|tortilla|revuelto/.test(name)) return "huevos";
  if (tags.includes("pasta") || /pasta|macarron|lasañ|espaguet/.test(name)) return "pasta";
  if (tags.includes("arroz") || /arroz|paella/.test(name)) return "arroz";
  if (
    tags.includes("verdura") ||
    tags.includes("vegetariano") ||
    tags.includes("crema") ||
    tags.includes("sopa") ||
    /verdur|ensalad|calabac|crema|sopa|guis/.test(name)
  ) {
    return "verdura";
  }
  if (tags.includes("carbos")) return /arroz|paella/.test(name) ? "arroz" : "pasta";
  if (tags.includes("guiso")) {
    if (tags.includes("legumbres")) return "legumbres";
    if (tags.includes("carne")) return "carne";
    return "verdura";
  }
  return "otros";
}
