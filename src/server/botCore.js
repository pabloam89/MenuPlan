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
