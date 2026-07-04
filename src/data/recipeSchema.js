import { z } from "zod";

// Canonical taxonomy for the recipe catalog. Adding a new category/protein/etc
// requires updating this file — that's the point: it forces a conscious
// decision instead of silently accepting a typo'd value.

const CATEGORIES = [
  "bebes", "carnes", "cenas_rapidas", "ensaladas_verduras", "guarniciones",
  "huevos", "legumbres", "pasta_arroces", "pescados", "platos_unicos",
  "sopas_cremas",
];

const MAIN_PROTEINS = [
  "cerdo", "huevo", "legumbre", "marisco", "none", "pavo",
  "pescado_azul", "pescado_blanco", "pollo", "ternera",
];

const TYPES = ["completo", "principal", "guarnicion"];

const MEAL_ROLES = ["cena", "guarnicion", "plato_unico", "primero", "segundo"];

const DIFFICULTIES = ["elaborada", "facil", "normal"];

const SEASONS = ["all", "invierno", "verano"];

const ALLERGENS = [
  "frutos_secos", "gluten", "huevo", "lactosa", "marisco", "moluscos",
  "pescado", "sesamo",
];

const UNITS = ["g", "ml", "ud"];

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
    ingredients: z.array(IngredientSchema).min(1),
    steps: z.array(z.string().min(1)).min(1),
    description: z.string().min(1),
    methods: z.array(MethodSchema).optional(),
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
    } else {
      if (mealRole.includes("guarnicion")) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `"${id}": mealRole "guarnicion" solo es válido con type "guarnicion"`,
        });
      }
      if (type === "principal" && mealRole.includes("primero")) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `"${id}": type "principal" no puede tener mealRole "primero" (los platos con proteína van de segundo, no de primero)`,
        });
      }
      if (type === "principal" && !mealRole.includes("segundo")) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `"${id}": type "principal" requiere mealRole incluya "segundo"`,
        });
      }
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
