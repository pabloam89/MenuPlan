import legumbres from "./recipes/legumbres.json";
import carnes from "./recipes/carnes.json";
import pescados from "./recipes/pescados.json";
import huevos from "./recipes/huevos.json";
import pastaArroces from "./recipes/pasta_arroces.json";
import sopasCremas from "./recipes/sopas_cremas.json";
import ensaladasVerduras from "./recipes/ensaladas_verduras.json";
import platosUnicos from "./recipes/platos_unicos.json";
import cenasRapidas from "./recipes/cenas_rapidas.json";
import bebes from "./recipes/bebes.json";

const ALL_RECIPES = [
  ...legumbres,
  ...carnes,
  ...pescados,
  ...huevos,
  ...pastaArroces,
  ...sopasCremas,
  ...ensaladasVerduras,
  ...platosUnicos,
  ...cenasRapidas,
  ...bebes,
];

const seen = new Set();
for (const r of ALL_RECIPES) {
  if (seen.has(r.id)) throw new Error(`Duplicate recipe id: ${r.id}`);
  seen.add(r.id);
}

export const recipeCatalog = ALL_RECIPES;

export const recipeCatalogById = Object.fromEntries(
  ALL_RECIPES.map((r) => [r.id, r]),
);

export const CATALOG_DECISION_FIELDS = ALL_RECIPES.map((r) => ({
  id: r.id,
  name: r.name,
  category: r.category,
  mainProtein: r.mainProtein,
  mealRole: r.mealRole,
  time: r.time,
  kcal: r.kcal,
  kidFriendly: r.kidFriendly,
  tupperFriendly: r.tupperFriendly,
}));
