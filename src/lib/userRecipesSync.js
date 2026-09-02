import { supabase } from "./supabase.js";
import { uploadRecipePhoto, deleteRecipePhoto, isDataUrl } from "./recipePhotos.js";

/**
 * Cloud persistence for user-created recipes (see user_recipes in
 * supabase/migrations/0003_user_data.sql). The wizard builds recipe objects in
 * the same shape as the bundled catalog (see lib/userRecipes.js); this module
 * maps that camelCase shape to/from the snake_case DB row.
 *
 * Note: this is separate from lib/userRecipes.js (which is the AI-draft
 * generator). Here we only persist/read already-built recipes.
 *
 * All functions degrade gracefully: no Supabase / no session → no-op, so
 * localStorage (data.userRecipes) stays the working source of truth offline.
 */

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
    usage_tags: recipe.usageTags ?? [],
    type: recipe.type,
    base_dish_id: recipe.baseDishId ?? null,
    linked_catalog_id: recipe.linkedCatalogId ?? null,
    pinned_garnish_id: recipe.pinnedGarnishId ?? null,
    required_appliances: recipe.requiredAppliances ?? null,
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

/** Loads all recipes owned by the user. */
export async function loadUserRecipes(userId) {
  if (!supabase || !userId) return [];
  const { data, error } = await supabase
    .from("user_recipes")
    .select("*")
    .eq("owner_id", userId)
    .order("created_at", { ascending: true });
  if (error) {
    console.warn("[userRecipes] load failed", error.message);
    return [];
  }
  return (data ?? []).map(rowToRecipe);
}

/**
 * Una receta ajena que este usuario puede leer: la RLS de user_recipes deja
 * pasar las 'public' a cualquiera y las 'friends' a seguidores mutuos. Si no
 * tienes permiso no da error, devuelve null — y el que copia se entera de
 * que ya no está disponible, no de que existe.
 */
export async function loadPublicRecipe(recipeId) {
  if (!supabase || !recipeId) return null;
  const { data, error } = await supabase
    .from("user_recipes")
    .select("*")
    .eq("id", recipeId)
    .maybeSingle();
  if (error) {
    console.warn("[userRecipes] public load failed", error.message);
    return null;
  }
  return data ? rowToRecipe(data) : null;
}

/** Inserts or updates a single recipe. */
export async function upsertUserRecipe(userId, recipe) {
  if (!supabase || !userId || !recipe?.id) return;
  // La foto va a Storage y en la fila queda su URL. Se hace aqui, en el unico
  // sitio por el que pasan TODAS las escrituras, para que ninguna via -el
  // asistente, una edicion, una copia del feed- pueda volver a incrustar dos
  // megas de imagen dentro de la fila. Ver lib/recipePhotos.js.
  const photo = await uploadRecipePhoto(userId, recipe.id, recipe.photo);
  const { error } = await supabase
    .from("user_recipes")
    .upsert(recipeToRow({ ...recipe, photo }, userId), { onConflict: "id" });
  if (error) console.warn("[userRecipes] upsert failed", error.message);
  return photo;
}

/** Backfills several local-only recipes to the cloud (first login on device). */
export async function upsertUserRecipes(userId, recipes) {
  if (!supabase || !userId || !recipes?.length) return;
  // De una en una y no en paralelo: cada foto son un par de megas y disparar
  // diez subidas a la vez desde un movil es la mejor forma de que fallen.
  const withPhotos = [];
  for (const r of recipes) {
    withPhotos.push(isDataUrl(r.photo)
      ? { ...r, photo: await uploadRecipePhoto(userId, r.id, r.photo) }
      : r);
  }
  const rows = withPhotos.map((r) => recipeToRow(r, userId));
  const { error } = await supabase
    .from("user_recipes")
    .upsert(rows, { onConflict: "id" });
  if (error) console.warn("[userRecipes] bulk upsert failed", error.message);
}

/** Patches just the visibility of one recipe (avoids resending the whole row). */
export async function updateRecipeVisibility(userId, recipeId, visibility) {
  if (!supabase || !userId || !recipeId) return;
  const { error } = await supabase
    .from("user_recipes")
    .update({ visibility })
    .eq("id", recipeId)
    .eq("owner_id", userId);
  if (error) console.warn("[userRecipes] visibility update failed", error.message);
}

export async function deleteUserRecipe(userId, recipeId) {
  if (!supabase || !userId || !recipeId) return false;
  // Primero el fichero: si se borra la fila y falla esto, la foto se queda
  // para siempre en el cubo sin nadie que sepa a que receta pertenecia.
  await deleteRecipePhoto(userId, recipeId);
  const { error } = await supabase
    .from("user_recipes")
    .delete()
    .eq("id", recipeId)
    .eq("owner_id", userId);
  if (error) {
    console.warn("[userRecipes] delete failed", error.message);
    return false;
  }
  return true;
}
