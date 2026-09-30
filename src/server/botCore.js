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

// Ajustes de la casa desde el chat: las mismas piezas que la app.
export { aplicarAjustes, dataConLibreta } from "../lib/libretaEnData.js";
export { normalizar as normalizarLibreta, estadoDe } from "../lib/notepad.js";
export { CAMPOS, valorValido, FAMILIAS, AMBITOS, SERVICIOS } from "../lib/notepadFields.js";
export { PREGUNTAS_POR_ID } from "../lib/wizardRegistry.js";
export { reglaDeInvitado, describirRegla, podarReglasVencidas } from "../lib/reglas.js";
export { reconcileGroupsWithMembers, migrateGroupsForBabies } from "../lib/groups.js";
export { suggestHomeRole } from "../lib/stages.js";
export { EU_ALLERGEN_IDS } from "../data/ingredientSchema.js";
export { aplicarAlergias, FAMILIA } from "../lib/alergias.js";
export { SLOT_VALUES, slotKey } from "../lib/planner.js";
export { mapRow as filaDeDespensa, COLUMNAS_DESPENSA } from "../lib/pantry.js";

// Fotos desde el chat: ticket o nevera → despensa; menú del cole → la casa.
export { normalizePantryInput } from "../utils/normalizePantryInput.js";
export { convertStockAmount } from "../lib/kitchenUnits.js";
export { resolveIngredientId } from "../lib/ingredients.js";
export { factorRacion } from "../lib/raciones.js";
export { resolveMemberAge } from "../lib/groups.js";
export { replaceSchoolWeeks, normalizeSchoolMenus, getSchoolDish, SCHOOL_DAYS, SCHOOL_COURSES } from "../lib/schoolMenu.js";
