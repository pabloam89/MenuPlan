import { z } from "zod";

import { SHOPPING_AISLES, normalizeName } from "../lib/ingredientCategories.js";
import { INGREDIENT_CATEGORIES } from "./recipes.js";

// Taxonomía canónica del catálogo de ingredientes. Mismo criterio que
// recipeSchema.js: añadir un valor nuevo obliga a tocar este fichero, para que
// sea una decisión consciente y no un typo que se cuela.

// Los 14 alérgenos del Anexo II del Reglamento (UE) 1169/2011, con los ids
// CANÓNICOS de EU_ALLERGENS (src/lib/allergens.js) — no con el vocabulario
// histórico del catálogo de recetas ("marisco"/"lactosa"/"huevo"/
// "frutos_secos"), que RecipeSchema sigue usando por compatibilidad.
//
// Se escriben aquí en vez de importarse de allergens.js a propósito: ese módulo
// arrastra los iconos de lucide-react, y un schema de datos no debería depender
// de la capa de UI. La lista duplicada la vigila un test
// (ingredientSchema.test.js) que falla si los dos vocabularios divergen.
export const EU_ALLERGEN_IDS = [
  "gluten", "crustaceos", "huevos", "pescado", "cacahuetes", "soja", "leche",
  "frutos_cascara", "apio", "mostaza", "sesamo", "sulfitos", "altramuces",
  "moluscos",
];

// Restricciones que tienen sustituto real de supermercado y por tanto se
// ADAPTAN en vez de excluir el plato. Lista corta a propósito: ampliarla es una
// decisión de producto, no un detalle de implementación. Son siempre ids de
// INTOLERANCE_RULES (intolerancias o estados), NUNCA alérgenos — un producto
// "sin lactosa" conserva la proteína láctea y no vale para una alergia.
export const ADAPTABLE_RESTRICTIONS = ["lactosa_fina", "alcohol_cocina"];

// Mismas tres unidades que RecipeSchema — el catálogo entero se mide en g/ml/ud.
const UNITS = ["g", "ml", "ud"];

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const IngredientSchema = z
  .object({
    // Id estable, en kebab-case. Es la clave con la que `recipe_ingredients`
    // apuntará a esta fila en la Fase 2, así que renombrarlo es una migración,
    // no una edición.
    id: z.string().regex(SLUG_RE, "id debe ser kebab-case (a-z, 0-9, guiones)"),
    name: z.string().min(1),

    // Todas las variantes crudas que aparecen en el catálogo de recetas y que
    // resuelven a este ingrediente ("Pechuga de pollo" → pollo). Nunca incluye
    // `name`. La unicidad global de los alias la comprueba validateIngredients,
    // no el schema: es una invariante entre filas, no de una fila.
    aliases: z.array(z.string().min(1)),

    aisle: z.enum(SHOPPING_AISLES),
    category: z.enum(INGREDIENT_CATEGORIES),

    // Alérgeno declarable: el producto lo lleva y se come tal cual.
    allergens: z.array(z.enum(EU_ALLERGEN_IDS)),
    // Segundo nivel: alérgeno real pero que entra como ingrediente de cocinado
    // (el vino/vinagre/brandy de un sofrito). Mismo patrón que `alcohol_cocina`
    // en lib/intolerances.js — no excluye la receta, la adapta. Ver la sección
    // "Sulfitos de cocinado" de output/allergen-reconciliation.md.
    cookingAllergens: z.array(z.enum(EU_ALLERGEN_IDS)),

    // Con qué restricciones ADAPTABLES choca este ingrediente. Deliberadamente
    // NO se deduce de `allergens`: los dos conjuntos no coinciden.
    //   · La mantequilla lleva el alérgeno `leche` pero no está en
    //     `lactosa_fina` — se tolera, y ese es el sentido de la variante "fina".
    //   · El vinagre tiene sulfitos de cocinado pero no alcohol.
    // Se deriva de INTOLERANCE_RULES, las mismas listas con las que el cliente
    // excluye hoy. Ver ADAPTABLE_RESTRICTIONS en build-ingredient-catalog.mjs.
    conflictsWith: z.array(z.enum(ADAPTABLE_RESTRICTIONS)),

    isVegetarian: z.boolean(),
    isVegan: z.boolean(),

    // Unidad y cantidad típicas, derivadas de cómo lo usa el catálogo real.
    // Sirven de valor por defecto al añadir el ingrediente a mano (despensa,
    // lista de la compra), no son una restricción.
    defaultUnit: z.enum(UNITS),
    medianAmount: z.number().positive().nullable(),

    // Nutrición por 100g (Fase 9), vía BEDCA — ver scripts/bedca-nutrition.mjs.
    // Todo opcional/nullable: BEDCA cubre ~500 alimentos y el catálogo tiene
    // 379 propios, así que no habrá cobertura del 100% — "sin dato" no es un
    // error, mismo criterio que el resto de campos derivados de una fuente
    // externa. `sugar100g` en particular es sparse incluso dentro de BEDCA
    // (el campo existe pero muchos alimentos no lo tienen relleno).
    nutrition: z
      .object({
        kcal100g: z.number().nonnegative(),
        protein100g: z.number().nonnegative(),
        carbs100g: z.number().nonnegative(),
        fat100g: z.number().nonnegative(),
        fiber100g: z.number().nonnegative().nullable(),
        sugar100g: z.number().nonnegative().nullable(),
        saturatedFat100g: z.number().nonnegative().nullable(),
        sodium100g: z.number().nonnegative().nullable(),
      })
      .nullable(),
  })
  .strict()
  .superRefine((ing, ctx) => {
    if (ing.isVegan && !ing.isVegetarian) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "isVegan implica isVegetarian",
        path: ["isVegan"],
      });
    }
    // Un alérgeno no puede estar en los dos niveles: o se come tal cual o es de
    // cocinado. Si estuviera en ambos, un consumidor que solo mire uno de los
    // dos campos tomaría una decisión distinta que otro que mire el otro.
    const both = ing.cookingAllergens.filter((a) => ing.allergens.includes(a));
    if (both.length > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `alérgeno en los dos niveles a la vez: ${both.join(", ")}`,
        path: ["cookingAllergens"],
      });
    }
    if (ing.aliases.includes(ing.name)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "`name` no debe repetirse dentro de `aliases`",
        path: ["aliases"],
      });
    }
  });

/**
 * Valida el catálogo de ingredientes: cada fila contra IngredientSchema, más
 * las invariantes ENTRE filas que un schema por fila no puede ver.
 *
 * La unicidad de alias es la importante: `resolveIngredientId` los usa como
 * clave de búsqueda, así que un alias repetido en dos ingredientes haría que la
 * resolución dependiera del orden del array — silenciosamente, y con un
 * alérgeno distinto según cuál ganase.
 *
 * @returns {string[]} errores legibles (vacío si todo es válido)
 */
export function validateIngredients(ingredients) {
  const errors = [];

  for (const ing of ingredients) {
    const result = IngredientSchema.safeParse(ing);
    if (!result.success) {
      for (const issue of result.error.issues) {
        const path = issue.path.length ? ` (campo: ${issue.path.join(".")})` : "";
        errors.push(`[${ing?.id ?? "?"}] ${issue.message}${path}`);
      }
    }
  }

  const seenId = new Set();
  for (const ing of ingredients) {
    if (seenId.has(ing.id)) errors.push(`Id de ingrediente duplicado: ${ing.id}`);
    seenId.add(ing.id);
  }

  // Un nombre o alias solo puede pertenecer a un ingrediente. Se compara con
  // el mismo normalizeName() que usará el resolver, no con una copia local:
  // si las dos normalizaciones divergieran, esta comprobación daría por buenos
  // alias que en runtime colisionan.
  const owner = new Map();
  for (const ing of ingredients) {
    // Dentro de un mismo ingrediente tampoco puede repetirse la forma
    // normalizada: "Queso gruyère" y "Queso Gruyère" son dos textos distintos
    // pero UNA sola clave de búsqueda, y en ingredient_aliases una sola PK.
    // Sin esta comprobación el catálogo validaba y el seed reventaba con
    // "ON CONFLICT DO UPDATE command cannot affect row a second time".
    const own = new Map();
    for (const label of [ing.name, ...(ing.aliases ?? [])]) {
      const key = normalizeName(label);
      if (own.has(key)) {
        errors.push(
          `[${ing.id}] "${own.get(key)}" y "${label}" normalizan igual ("${key}") — deja solo uno`,
        );
      }
      own.set(key, label);

      if (owner.has(key) && owner.get(key) !== ing.id) {
        errors.push(`"${label}" pertenece a dos ingredientes: ${owner.get(key)} y ${ing.id}`);
      }
      owner.set(key, ing.id);
    }
  }

  return errors;
}
