// El motor de la app, para el servidor del bot.
//
// El solver y la lista de la compra son funciones puras, pero el código de
// src/ solo corre bajo Vite: importa JSON sin atributos y lee import.meta.env.
// scripts/build-bot-core.mjs empaqueta este fichero con esbuild en
// api/_bot/core.mjs, que es lo que importan las funciones de Vercel.
//
// Comprobado el 29 sep 2026 con una casa real: la semana entera sale en ~1,8 s
// en Node, sin red, y la compra de esa semana, completa.

export { generateMenuWithAI, pickCatalogReplacement } from "../lib/aiPlanner.js";
export { buildShoppingList } from "../lib/shoppingBuilder.js";
export { registerRecipes, RECIPES_BY_ID } from "../data/recipes.js";
export { DAYS, getDayMeals } from "../lib/planner.js";
export { membersOfGroup, groupsFromModel } from "../lib/groups.js";
export { resolveModeData, prepararSemana } from "../lib/prepararGeneracion.js";
export { computeWeekRange, explicitDaysForOffset, createMenuId } from "../lib/menuArchive.js";
export { menuToRow, weekToRow } from "../lib/menusSync.js";
// Los ids nuevos (src/lib/ids.js). Los ficheros del bot que no cargan el motor
// lo importan directo: es puro y no pesa, y core.mjs son ~10 MB.
export * as ids from "../lib/ids.js";

// Ajustes de la casa desde el chat: las mismas piezas que la app.
export { aplicarAjustes, dataConLibreta, dataVigente, conTandaPedida } from "../lib/libretaEnData.js";
export { TANDA_MIN, TANDA_MAX, TANDA_PASO } from "../lib/cookTime.js";
export { normalizar as normalizarLibreta, estadoDe, matizDe, vigente, rechazar, rechazadosDe } from "../lib/notepad.js";
export { itemValido } from "../lib/excluirHueco.js";
export { CAMPOS, valorValido, rutaDe, FAMILIAS, AMBITOS, SERVICIOS } from "../lib/notepadFields.js";
export { PREGUNTAS_POR_ID } from "../lib/wizardRegistry.js";
export { reglaDeInvitado, describirRegla, podarReglasVencidas, nuevaRegla } from "../lib/reglas.js";
export { reconcileGroupsWithMembers, migrateGroupsForBabies } from "../lib/groups.js";
export { normalizeKidDinnerConfig, deriveKidsMenuModel, kidMembers, KID_DINNER_DEFAULTS, KID_DINNER_AVOID_DEFAULTS } from "../lib/kidsMenu.js";
export { suggestHomeRole } from "../lib/stages.js";
export { EU_ALLERGEN_IDS } from "../data/ingredientSchema.js";
export { aplicarAlergias, FAMILIA, marcarRevisadas, pendientesDeAlergias, conMiembroNuevo } from "../lib/alergias.js";
export { SLOT_VALUES, slotKey } from "../lib/planner.js";
export { mapRow as filaDeDespensa, COLUMNAS_DESPENSA } from "../lib/pantry.js";

// Fotos desde el chat: ticket o nevera → despensa; menú del cole → la casa.
export { normalizePantryInput } from "../utils/normalizePantryInput.js";
export { convertStockAmount } from "../lib/kitchenUnits.js";
export { resolveIngredientId } from "../lib/ingredients.js";
export { factorRacion } from "../lib/raciones.js";
export { resolveMemberAge } from "../lib/groups.js";
export { replaceSchoolWeeks, normalizeSchoolMenus, getSchoolDish, SCHOOL_DAYS, SCHOOL_COURSES } from "../lib/schoolMenu.js";

// Fotos de los platos para mandarlas por Telegram (URLs públicas del blob).
export { dishImageForRecipe } from "../assets/dishes/dishImages.js";

// Recetas desde el chat: buscar en el recetario y crear una propia con el
// mismo borrador, la misma validación y la misma fila que el asistente de la app.
export { recipeCatalog, recipeCatalogById } from "../data/recipeCatalog.js";
export { payloadDeBorrador, borradorDesdeRespuesta, recetaParaGuardar, INGREDIENT_UNITS } from "../lib/userRecipes.js";
export { recipeToRow, rowToRecipe } from "../lib/userRecipesSync.js";
export { KITCHEN_TOOLS } from "../lib/applianceMethods.js";
export { FAST_MODEL } from "../lib/aiModels.js";

// Compartir una semana desde el chat: la misma «foto» que publica la app.
export { buildSharedMenuPayload } from "../lib/sharedMenu.js";
export { catalogToFrontendRecipe } from "../lib/aiPlanner.js";

// Qué choca de una receta con la casa, con las mismas reglas que el motor.
export { choquesDeReceta, textoDeChoque } from "../lib/restriccionesReceta.js";

// El coste por ración, para scripts/build-coste.mjs (Node a secas no carga src/).
export { costeDeReceta } from "../lib/derive/coste.js";

// Los ejes «más/menos» de densidad y carga (api/_bot/menu.js, EJES_NUMERICOS).
export { densidadDe, cargaDe, completitudDe } from "../lib/derive/ejesDePlato.js";
// Un solo lector de nutrientes para las dos formas de plato (src/lib/nutricionPlato.js).
export { nutrienteDe, vectorDe, crudoDe, CAMPOS_PLATO } from "../lib/nutricionPlato.js";
