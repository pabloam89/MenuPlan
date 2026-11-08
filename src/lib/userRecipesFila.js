/**
 * user_recipes ↔ receta con la forma del catálogo, sin nada más: ni cliente de
 * Supabase ni fotos. Vive aparte de userRecipesSync.js para que el bot (Node,
 * sin `import.meta.env`) lo pueda importar sin cargar el motor.
 *
 * Las columnas de vocabulario (usage_tags, required_appliances) pasan por la lista viva de
 * vocabularios.js (#539): un retirado se escribe como su sucesor, uno desconocido lanza.
 */
import { listaParaEscribir } from "./vocabularios.js";

const num = (v) => (v == null ? null : Number(v));

/** Frontend recipe object → user_recipes row. */
export function recipeToRow(recipe, userId) {
  return {
    id: recipe.id,
    owner_id: userId,
    name: recipe.name,
    category: recipe.category,
    main_protein: recipe.mainProtein ?? "none",
    meal_roles: recipe.mealRole ?? [],
    usage_tags: listaParaEscribir("usos_receta", recipe.usageTags ?? []),
    type: recipe.type,
    base_dish_id: recipe.baseDishId ?? null,
    linked_catalog_id: recipe.linkedCatalogId ?? null,
    pinned_garnish_id: recipe.pinnedGarnishId ?? null,
    required_appliances: listaParaEscribir("aparatos", recipe.requiredAppliances ?? null),
    time_minutes: num(recipe.time),
    difficulty: recipe.difficulty ?? null,
    season: recipe.season ?? "all",
    kcal: num(recipe.kcal),
    protein_g: num(recipe.protein_g),
    carbs_g: num(recipe.carbs_g),
    fat_g: num(recipe.fat_g),
    // Fase 9 (0042_user_recipes_nutrition.sql): rellenos solo cuando
    // computeRecipeNutrition (ingredients.js) los calculó de verdad — ver
    // generateUserRecipeDraft, userRecipes.js.
    fiber_g: num(recipe.fiber_g),
    sugar_g: num(recipe.sugar_g),
    saturated_fat_g: num(recipe.saturated_fat_g),
    sodium_mg: num(recipe.sodium_mg),
    nutrition_source: recipe.nutritionSource ?? null,
    base_servings: num(recipe.baseServings),
    kid_friendly: Boolean(recipe.kidFriendly),
    tupper_friendly: Boolean(recipe.tupperFriendly),
    allergens: recipe.allergens ?? [],
    ingredients: recipe.ingredients ?? [],
    steps: recipe.steps ?? [],
    // Paso a paso estructurado (ver 0013_user_recipes_steps_rich.sql). Opcional:
    // `steps` sigue siendo el fallback para las recetas que no lo tengan.
    steps_rich: recipe.stepsRich ?? null,
    // Ejes separados (ver 0023_recipe_axes.sql). `?? null` en vez de Boolean()
    // porque "sin clasificar" y "clasificado como false" no son lo mismo: el
    // primero deja que isMontaje() caiga al fallback de category, el segundo es
    // un juicio explícito del usuario que debe ganar.
    montaje: recipe.montaje ?? null,
    apetecible: recipe.apetecible ?? null,
    can_be_garnish: recipe.canBeGarnish ?? null,
    main_ingredients: recipe.mainIngredients ?? null,
    sauce_id: recipe.sauceId ?? null,
    description: recipe.description ?? null,
    methods: recipe.methods ?? null,
    photo: recipe.photo ?? null,
    owner_snapshot: recipe.owner ?? null,
    visibility: recipe.visibility ?? "private",
    // Atribución de copia (0027_social_feed.sql). Instantánea: la copia no
    // se resincroniza con el original, esto solo sirve para firmar el "de @X".
    copied_from_recipe_id: recipe.copiedFromRecipeId ?? null,
    copied_from_owner_id: recipe.copiedFromOwnerId ?? null,
    created_at: recipe.createdAt
      ? new Date(recipe.createdAt).toISOString()
      : new Date().toISOString(),
  };
}

/**
 * La copia de una fila de user_recipes de otra persona («guardar en mi recetario», el bot):
 * fila nueva a nombre de `dueno`, privada y firmada «de …» (copied_from_*, 0027). Es una
 * escritura nueva, así que sus vocabularios pasan por la lista viva: un valor que la fila del
 * otro guardó y hoy está retirado se escribe como su sucesor (#539). Sin created_at ni
 * updated_at (los pone la base) y sin claves undefined.
 */
export function filaCopiada(fila, { id, dueno }) {
  const copia = {
    ...fila,
    id,
    owner_id: dueno,
    visibility: "private",
    copied_from_recipe_id: fila.id,
    copied_from_owner_id: fila.owner_id,
    owner_snapshot: null,
    usage_tags: listaParaEscribir("usos_receta", fila.usage_tags),
    required_appliances: listaParaEscribir("aparatos", fila.required_appliances),
    created_at: undefined,
    updated_at: undefined,
  };
  for (const k of Object.keys(copia)) if (copia[k] === undefined) delete copia[k];
  return copia;
}

// ── Las recetas del titular, vistas por un cotitular (#958, 0104) ────────
//
// Un cotitular (editor) ve las recetas del titular de la casa, pero no son
// suyas: no se editan, no se borran y NUNCA se suben (con su owner_id la RLS
// las rechazaría, y en un upsert de varias tumbaría también las suyas). Por eso
// viajan con la marca `soloLectura` y fuera de `data.userRecipes`.

/** ¿Es una receta del titular que ve un cotitular? */
export const esRecetaDelTitular = (receta) => receta?.soloLectura === true;

/** Las recetas del titular con su marca de solo lectura. */
export const marcarDelTitular = (recetas) => (recetas ?? []).map((r) => ({ ...r, soloLectura: true }));

/** Las propias primero; del titular, solo las que no tengan el mismo id que una propia. */
export function unirConLasDelTitular(propias, delTitular) {
  const ids = new Set((propias ?? []).map((r) => r.id));
  return [...(propias ?? []), ...(delTitular ?? []).filter((r) => !ids.has(r.id))];
}

/** Lo que se puede subir a nombre de quien llama: nunca una del titular. */
export const subibles = (recetas) => (recetas ?? []).filter((r) => !esRecetaDelTitular(r));

/** user_recipes row → frontend recipe object (catalog-compatible shape). */
export function rowToRecipe(row) {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    mainProtein: row.main_protein,
    mealRole: row.meal_roles ?? [],
    usageTags: row.usage_tags ?? [],
    type: row.type,
    baseDishId: row.base_dish_id ?? null,
    linkedCatalogId: row.linked_catalog_id ?? null,
    pinnedGarnishId: row.pinned_garnish_id ?? null,
    requiredAppliances: row.required_appliances ?? [],
    time: row.time_minutes,
    difficulty: row.difficulty,
    season: row.season ?? "all",
    kcal: num(row.kcal),
    protein_g: num(row.protein_g),
    carbs_g: num(row.carbs_g),
    fat_g: num(row.fat_g),
    // Fase 9: ausentes (undefined, no null) en una fila guardada antes de
    // 0042_user_recipes_nutrition.sql — mismo criterio que montaje/apetecible
    // arriba, para no confundir "no calculado nunca" con "cero real".
    fiber_g: row.fiber_g != null ? num(row.fiber_g) : undefined,
    sugar_g: row.sugar_g != null ? num(row.sugar_g) : undefined,
    saturated_fat_g: row.saturated_fat_g != null ? num(row.saturated_fat_g) : undefined,
    sodium_mg: row.sodium_mg != null ? num(row.sodium_mg) : undefined,
    nutritionSource: row.nutrition_source ?? undefined,
    baseServings: row.base_servings,
    kidFriendly: Boolean(row.kid_friendly),
    tupperFriendly: Boolean(row.tupper_friendly),
    allergens: row.allergens ?? [],
    ingredients: row.ingredients ?? [],
    steps: row.steps ?? [],
    stepsRich: row.steps_rich ?? undefined,
    // Ejes separados: se omiten (undefined) cuando la columna viene null, para
    // que isMontaje() distinga "sin clasificar" de un false explícito.
    montaje: row.montaje ?? undefined,
    apetecible: row.apetecible ?? undefined,
    canBeGarnish: row.can_be_garnish ?? undefined,
    mainIngredients: row.main_ingredients ?? undefined,
    sauceId: row.sauce_id ?? undefined,
    description: row.description ?? "",
    methods: row.methods ?? [],
    photo: row.photo ?? null,
    owner: row.owner_snapshot ?? null,
    visibility: row.visibility ?? "private",
    copiedFromRecipeId: row.copied_from_recipe_id ?? undefined,
    copiedFromOwnerId: row.copied_from_owner_id ?? undefined,
    createdAt: row.created_at ? Date.parse(row.created_at) : Date.now(),
    rating: { up: 0, down: 0, score: 0 },
    source: "user",
  };
}
