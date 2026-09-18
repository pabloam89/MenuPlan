/**
 * El traductor de la NUBE al bundle: Supabase guarda columnas en snake_case
 * (supabase/migrations/0001_recipe_catalog.sql) y aquí se devuelven al shape
 * exacto en camelCase que esperan recipeSchema.js y todos los consumidores
 * (aiPlanner.js, filterRecipes.js…), para que nada de aguas abajo tenga que
 * saber si la receta vino de la nube o del JSON del bundle.
 *
 * ── Por qué vive en su propio fichero ──────────────────────────────────────
 * Porque es la pieza que más veces se ha roto EN SILENCIO, y para poder
 * probarla hace falta importarla sin arrastrar recipeCatalog.js entero (que
 * carga 1.011 recetas y llama a Supabase al importarse).
 *
 * Cinco veces ha pasado lo mismo: se añade un campo al JSON y al schema, nadie
 * se acuerda de esta función, y el campo se pierde para toda receta servida
 * desde la nube — `apetecible`, `montaje`, `estrella`, `occasion` y
 * `extraProteins`, cada uno descubierto meses después por su cuenta (ver los
 * comentarios de abajo, que son el registro del daño). No falla nada: el campo
 * simplemente llega `undefined` y el motor se comporta como si la receta no lo
 * tuviera. `estrella` ausente deja el pool principal del generador a CERO.
 *
 * recipeRow.test.js es el fusible: compara los campos de RecipeSchema con lo
 * que sale de aquí y revienta cuando aparece uno nuevo que no viaja. Si has
 * llegado a este comentario desde un test en rojo, la respuesta está ahí.
 */
export function rowToRecipe(row) {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    mainProtein: row.main_protein,
    ...(row.main_base ? { mainBase: row.main_base } : {}),
    // `baseMode` viaja PEGADO a mainBase porque sin él mainBase no sirve para
    // lo que existe: mainBase dice QUÉ fécula lleva el plato, y baseMode si esa
    // fécula se puede tener hecha del domingo (el arroz de un bowl) o se cocina
    // dentro y precocinarla arruina el plato (el de un risotto). Son 356
    // recetas y es la clave entera del batch cooking; sin esta línea, una
    // receta servida desde la nube no propone ni una sola tanda.
    ...(row.base_mode ? { baseMode: row.base_mode } : {}),
    // Las preparaciones batcheables que no son fécula (hoy, el sofrito: 265
    // platos). Sin esta línea, una receta servida desde la nube no propone
    // ninguna tanda de sofrito — que es la que más trabajo ahorra.
    ...(row.bases_aparte?.length ? { basesAparte: row.bases_aparte } : {}),
    // Dónde se parte un plato a medio hacer (migración 0054). Lo llevan 39
    // platos del catálogo estrella —croquetas, lasañas, empanadas, ravioli— y
    // son recetas CORRIENTES, no `type: "base"`: se sirven desde la nube como
    // cualquier otra. Sin esta línea, la sesión de tanda de una casa servida
    // desde Supabase no ofrece ni un solo plato a medio hacer, que es
    // exactamente la mitad de lo que esa sesión sabe hacer.
    ...(row.adelanto ? { adelanto: row.adelanto } : {}),
    // Ejes separados (migración 0023_recipe_axes.sql). Los booleanos se
    // distinguen de "la columna no existe todavía" igual que freezable: un
    // `montaje: false` es un juicio ya tomado y debe sobrevivir el viaje.
    ...(row.montaje != null ? { montaje: row.montaje } : {}),
    ...(row.apetecible != null ? { apetecible: row.apetecible } : {}),
    // ¿Recetario Estrella? Señal que usa filterRecipes.isPrimaryCatalog() en
    // vez de "¿tiene foto?" (ver recipeSchema.js). Mismo mapeo que faltaba en
    // apetecible/montaje hasta 0023 — sin él, undefined para toda receta
    // servida desde Supabase y el pool principal del generador se queda a 0
    // para cualquier grupo sin bebés. Ver 0025_recipe_estrella.sql.
    ...(row.estrella != null ? { estrella: row.estrella } : {}),
    // Plato de OCASIÓN (marisco de ración, arroces de bogavante, paellas):
    // la regla 3f de validateMenu.js lo saca de lunes a viernes. Mismo mapeo
    // que faltó en su día para apetecible/montaje/estrella/extraProteins — sin
    // esta línea el campo existe en el JSON, existe en el schema y se pierde
    // en el viaje para cualquier receta servida desde Supabase, que es lo que
    // producción sirve cuando catalog_meta.version alcanza a la del bundle.
    ...(row.occasion ? { occasion: row.occasion } : {}),
    // Mismo motivo que occasion/estrella: sin esta línea el campo existe en el
    // JSON y se pierde en el viaje para toda receta servida desde Supabase.
    ...(row.kid_favourite != null ? { kidFavourite: row.kid_favourite } : {}),
    ...(row.tecnica ? { tecnica: row.tecnica } : {}),
    ...(row.cocina ? { cocina: row.cocina } : {}),
    ...(row.lleva_salsa != null ? { llevaSalsa: row.lleva_salsa } : {}),
    ...(row.etapa_bebe ? { etapaBebe: row.etapa_bebe } : {}),
    ...(row.can_be_garnish != null ? { canBeGarnish: row.can_be_garnish } : {}),
    ...(row.main_ingredients?.length ? { mainIngredients: row.main_ingredients } : {}),
    // Proteínas animales secundarias (jamón en una ensalada, atún en un
    // huevo…) — la regla de "no repetir proteína el mismo día" en
    // validateMenu.js depende de verlas. Se quedó fuera de este mapeo hasta
    // ahora (2026-08-30): la columna existía en el schema/JSON local pero
    // nunca en Supabase ni aquí, así que se perdía en silencio para toda
    // receta servida desde la nube. Ver 0024_recipe_extra_fields.sql.
    ...(row.extra_proteins?.length ? { extraProteins: row.extra_proteins } : {}),
    ...(row.sauce_id ? { sauceId: row.sauce_id } : {}),
    ...(row.sauce_compat?.length ? { sauceCompat: row.sauce_compat } : {}),
    mealRole: row.meal_roles,
    type: row.type,
    ...(row.base_dish_id ? { baseDishId: row.base_dish_id } : {}),
    ...(row.required_appliance ? { requiredAppliance: row.required_appliance } : {}),
    time: row.time_minutes,
    difficulty: row.difficulty,
    season: row.season,
    kcal: Number(row.kcal),
    protein_g: Number(row.protein_g),
    carbs_g: Number(row.carbs_g),
    fat_g: Number(row.fat_g),
    // Nutrición secundaria: 888 recetas la declaran y se perdía entera en el
    // viaje. `!= null` y no `?` a propósito — un 0 de azúcar o de sodio es un
    // dato, no una ausencia, y con `?` se convertía en undefined.
    ...(row.fiber_g != null ? { fiber_g: Number(row.fiber_g) } : {}),
    ...(row.sugar_g != null ? { sugar_g: Number(row.sugar_g) } : {}),
    ...(row.saturated_fat_g != null ? { saturated_fat_g: Number(row.saturated_fat_g) } : {}),
    ...(row.sodium_mg != null ? { sodium_mg: Number(row.sodium_mg) } : {}),
    baseServings: row.base_servings,
    kidFriendly: row.kid_friendly,
    tupperFriendly: row.tupper_friendly,
    allergens: row.allergens ?? [],
    ingredients: row.ingredients,
    steps: row.steps,
    ...(row.steps_rich ? { stepsRich: row.steps_rich } : {}),
    // Congelador: freezable puede ser false a propósito (un juicio ya tomado),
    // así que se distingue de "la columna no existe" en una BD sin migrar.
    ...(row.freezable != null ? { freezable: row.freezable } : {}),
    ...(row.thaw_steps ? { thawSteps: row.thaw_steps } : {}),
    description: row.description,
    ...(row.methods ? { methods: row.methods } : {}),
    ...(row.product_aliases?.length ? { productAliases: row.product_aliases } : {}),
    ...(row.effort ? { effort: row.effort } : {}),
    ...(row.dessert_kind ? { dessertKind: row.dessert_kind } : {}),
  };
}
