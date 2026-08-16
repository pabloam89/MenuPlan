import { supabase } from "./supabase.js";

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
function recipeToRow(recipe, userId) {
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
    base_servings: num(recipe.baseServings),
    kid_friendly: Boolean(recipe.kidFriendly),
    tupper_friendly: Boolean(recipe.tupperFriendly),
    allergens: recipe.allergens ?? [],
    ingredients: recipe.ingredients ?? [],
    steps: recipe.steps ?? [],
    // Paso a paso estructurado (ver 0011_user_recipes_steps_rich.sql). Opcional:
    // `steps` sigue siendo el fallback para las recetas que no lo tengan.
    steps_rich: recipe.stepsRich ?? null,
    description: recipe.description ?? null,
    methods: recipe.methods ?? null,
    photo: recipe.photo ?? null,
    owner_snapshot: recipe.owner ?? null,
    visibility: recipe.visibility ?? "private",
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
    baseServings: row.base_servings,
    kidFriendly: Boolean(row.kid_friendly),
    tupperFriendly: Boolean(row.tupper_friendly),
    allergens: row.allergens ?? [],
    ingredients: row.ingredients ?? [],
    steps: row.steps ?? [],
    stepsRich: row.steps_rich ?? undefined,
    description: row.description ?? "",
    methods: row.methods ?? [],
    photo: row.photo ?? null,
    owner: row.owner_snapshot ?? null,
    visibility: row.visibility ?? "private",
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

/** Inserts or updates a single recipe. */
export async function upsertUserRecipe(userId, recipe) {
  if (!supabase || !userId || !recipe?.id) return;
  const { error } = await supabase
    .from("user_recipes")
    .upsert(recipeToRow(recipe, userId), { onConflict: "id" });
  if (error) console.warn("[userRecipes] upsert failed", error.message);
}

/** Backfills several local-only recipes to the cloud (first login on device). */
export async function upsertUserRecipes(userId, recipes) {
  if (!supabase || !userId || !recipes?.length) return;
  const rows = recipes.map((r) => recipeToRow(r, userId));
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
  if (!supabase || !userId || !recipeId) return;
  const { error } = await supabase
    .from("user_recipes")
    .delete()
    .eq("id", recipeId)
    .eq("owner_id", userId);
  if (error) console.warn("[userRecipes] delete failed", error.message);
}
