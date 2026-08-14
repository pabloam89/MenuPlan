import { z } from "zod";

// Canonical taxonomy for the recipe catalog. Adding a new category/protein/etc
// requires updating this file — that's the point: it forces a conscious
// decision instead of silently accepting a typo'd value.

const CATEGORIES = [
  "bebes", "carnes", "cenas_rapidas", "ensaladas_verduras", "guarniciones",
  "huevos", "legumbres", "pasta_arroces", "pescados", "platos_unicos",
  "sopas_cremas",
  // Off-menu categories: not part of comida/cena generation (isolated in
  // utils/filterRecipes.js, like "bebes"). They power the optional
  // desayuno/merienda/postre pool that unlocks fruit/yogur/kéfir/pan ingredients.
  "desayunos", "meriendas", "postres",
];

const MAIN_PROTEINS = [
  "cerdo", "huevo", "legumbre", "marisco", "none", "pavo",
  "pescado_azul", "pescado_blanco", "pollo", "ternera",
];

const TYPES = ["completo", "principal", "guarnicion"];

const MEAL_ROLES = [
  "cena", "guarnicion", "plato_unico", "primero", "segundo",
  // Off-menu roles for the optional light pool (see CATEGORIES note).
  "desayuno", "merienda", "postre",
];

const DIFFICULTIES = ["elaborada", "facil", "normal"];

const SEASONS = ["all", "invierno", "verano"];

// The 14 UE allergens. The first 8 are the historical catalog vocabulary
// (marisco = crustáceos, huevo = huevos, lactosa = leche, frutos_secos =
// frutos de cáscara); the last 6 close the gap so future catalog/remote
// recipes can declare them (see lib/allergens.js for the ingredient net that
// backfills them on the existing 244 recipes).
const ALLERGENS = [
  "frutos_secos", "gluten", "huevo", "lactosa", "marisco", "moluscos",
  "pescado", "sesamo",
  "cacahuetes", "soja", "apio", "mostaza", "sulfitos", "altramuces",
];

const UNITS = ["g", "ml", "ud"];

// Coarse dietary signals for the "menú más cuidado" profiles. Optional and
// usually derived at load time (lib/healthFlags.js), but a recipe may declare
// them explicitly too.
const HEALTH_FLAGS = [
  "frito", "embutido", "alto_sodio", "picante", "acido",
  "azucar_anadido", "rico_hierro",
];

const IngredientSchema = z.object({
  name: z.string().min(1),
  amount: z.number().nonnegative(),
  unit: z.enum(UNITS),
});

const MethodSchema = z.object({
  appliance: z.string().min(1),
  time: z.number().positive(),
  difficulty: z.enum(DIFFICULTIES),
  prepSummary: z.string().min(1),
});

export const RecipeSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    category: z.enum(CATEGORIES),
    mainProtein: z.enum(MAIN_PROTEINS),
    // Secondary animal proteins present in a dish whose mainProtein stays a
    // non-animal base for frequency/cena purposes — e.g. "Cocido madrileño"
    // keeps mainProtein "legumbre" (so it still counts as a legume serving and
    // is blocked from cena) but also carries ternera/cerdo/pollo, which the
    // same-day protein-variety rules must see (validateMenu.js proteinGroupsOf).
    extraProteins: z.array(z.enum(MAIN_PROTEINS)).optional(),
    mainBase: z.string().optional(),
    mealRole: z.array(z.enum(MEAL_ROLES)).min(1),
    type: z.enum(TYPES),
    // Links a variant (e.g. "Muslos de pollo al horno") to the base dish it
    // overlaps with (e.g. "Pollo al horno con patatas"). Populated manually
    // after reviewing scripts/detect-duplicate-dishes.mjs output.
    baseDishId: z.string().optional(),
    requiredAppliance: z.string().optional(),
    time: z.number().positive(),
    difficulty: z.enum(DIFFICULTIES),
    season: z.enum(SEASONS),
    kcal: z.number().nonnegative(),
    protein_g: z.number().nonnegative(),
    carbs_g: z.number().nonnegative(),
    fat_g: z.number().nonnegative(),
    baseServings: z.number().positive(),
    kidFriendly: z.boolean(),
    tupperFriendly: z.boolean(),
    allergens: z.array(z.enum(ALLERGENS)),
    healthFlags: z.array(z.enum(HEALTH_FLAGS)).optional(),
    ingredients: z.array(IngredientSchema).min(1),
    steps: z.array(z.string().min(1)).min(1),
    description: z.string().min(1),
    methods: z.array(MethodSchema).optional(),
    // Names this dish is commonly sold as a ready-made product under (e.g.
    // "Natillas caseras" -> ["Natillas", "Natillas de vainilla"]; "Gazpacho
    // andaluz" -> ["Gazpacho"]). A recipe's own ingredient list never contains
    // its own name (Natillas caseras lists leche/huevo/azúcar, never
    // "Natillas"), so without this the store-bought version of a dish that's
    // normally cooked from scratch could never be recognised on a receipt or
    // in the pantry. See ingredientDictionary() in lib/priceHistory.js, which
    // folds these in alongside every recipe's real ingredients. Only set on
    // dishes genuinely common as a finished supermarket product.
    productAliases: z.array(z.string().min(1)).optional(),
    // Off-menu postre effort. Optional so comida/cena recipes stay untouched.
    // inmediato = yogur/fruta; cazo = arroz con leche/natillas; horno = flan/tarta.
    effort: z.enum(["inmediato", "cazo", "horno"]).optional(),
    // Only for effort "inmediato": the fruta vs yogur micro-toggle.
    dessertKind: z.enum(["fruta", "yogur"]).optional(),
  })
  .superRefine((recipe, ctx) => {
    const { type, mealRole, id } = recipe;

    if (type === "guarnicion") {
      if (mealRole.length !== 1 || mealRole[0] !== "guarnicion") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `"${id}": type "guarnicion" requiere mealRole === ["guarnicion"], recibido [${mealRole.join(", ")}]`,
        });
      }
    } else if (mealRole.includes("guarnicion")) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `"${id}": mealRole "guarnicion" solo es válido con type "guarnicion"`,
      });
    }

    if (recipe.baseDishId === id) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `"${id}": baseDishId no puede apuntar a sí mismo`,
      });
    }
  });

/**
 * Validates every recipe in `recipes` against RecipeSchema.
 * Returns an array of human-readable error strings (empty if all valid).
 */
export function validateRecipes(recipes) {
  const errors = [];
  for (const recipe of recipes) {
    const result = RecipeSchema.safeParse(recipe);
    if (!result.success) {
      for (const issue of result.error.issues) {
        const path = issue.path.length ? ` (campo: ${issue.path.join(".")})` : "";
        errors.push(`[${recipe.id ?? "?"}] ${issue.message}${path}`);
      }
    }
  }
  return errors;
}
