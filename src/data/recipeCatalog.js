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
import guarniciones from "./recipes/guarniciones.json";
import { validateRecipes } from "./recipeSchema.js";

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

// guarniciones.json is a separate catalog (not merged into ALL_RECIPES, since
// menu generation and garnish pairing consume it independently) but must
// satisfy the same schema.
const schemaErrors = validateRecipes([...ALL_RECIPES, ...guarniciones]);
for (const r of ALL_RECIPES) {
  if (r.baseDishId && !seen.has(r.baseDishId)) {
    schemaErrors.push(`[${r.id}] baseDishId "${r.baseDishId}" no existe en el catálogo`);
  }
}
if (schemaErrors.length > 0) {
  throw new Error(
    `Catálogo de recetas inválido (${schemaErrors.length} error/es):\n` +
      schemaErrors.map((e) => `  - ${e}`).join("\n"),
  );
}

export const recipeCatalog = ALL_RECIPES;

export const recipeCatalogById = Object.fromEntries(
  ALL_RECIPES.map((r) => [r.id, r]),
);
