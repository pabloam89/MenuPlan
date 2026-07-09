// Seed recipe catalog. Shape kept close to Spoonacular's so a future
// external adapter can replace this file with minimal glue.
//
// Ingredient categories must match the ones used in shoppingBuilder.js.

import { ensureHealthFlags } from "../lib/healthFlags.js";

export const INGREDIENT_CATEGORIES = [
  "Verduras y frutas",
  "Carnes y pescados",
  "Legumbres y pasta",
  "Lácteos y huevos",
  "Panadería y cereales",
  "Despensa",
];

/**
 * @typedef {Object} Ingredient
 * @property {string} id
 * @property {string} name
 * @property {"Verduras y frutas"|"Carnes y pescados"|"Legumbres y pasta"|"Lácteos y huevos"|"Panadería y cereales"|"Despensa"} category
 * @property {number} qty            // per servings (see recipe.servings)
 * @property {"g"|"ml"|"ud"} unit
 * @property {number} [pricePerUnit] // EUR per base unit (g/ml/ud)
 * @property {string[]} [allergens]
 */

/**
 * @typedef {Object} Recipe
 * @property {string} id
 * @property {string} name
 * @property {string} emoji
 * @property {string} iconType
 * @property {{protein:number, carbs:number, fat:number}} macros
 * @property {string} prepSummary
 * @property {string[]} steps
 * @property {string} image
 * @property {number} kcal           // per serving
 * @property {number} time           // minutes
 * @property {"Fácil"|"Normal"|"Me gusta"} difficulty
 * @property {string[]} tags         // legumbres, pescado, verdura, carne...
 * @property {("comida"|"cena")[]} mealTypes
 * @property {boolean} tupperFriendly
 * @property {boolean} kidFriendly
 * @property {string[]} allergens
 * @property {number} servings
 * @property {Ingredient[]} ingredients
 */

/** @type {Recipe[]} */
const BASE_RECIPES = [
  {
    id: "lentejas-verduras",
    name: "Lentejas con verduras",
    emoji: "🍲",
    kcal: 520,
    time: 45,
    difficulty: "Fácil",
    tags: ["legumbres", "guiso"],
    mealTypes: ["comida"],
    tupperFriendly: true,
    kidFriendly: true,
    allergens: [],
    servings: 4,
    ingredients: [
      { id: "lentejas", name: "Lentejas", category: "Legumbres y pasta", qty: 400, unit: "g", pricePerUnit: 0.0025 },
      { id: "cebolla", name: "Cebolla", category: "Verduras y frutas", qty: 1, unit: "ud", pricePerUnit: 0.4 },
      { id: "zanahoria", name: "Zanahoria", category: "Verduras y frutas", qty: 2, unit: "ud", pricePerUnit: 0.3 },
      { id: "patata", name: "Patatas", category: "Verduras y frutas", qty: 2, unit: "ud", pricePerUnit: 0.25 },
      { id: "pimiento-rojo", name: "Pimiento rojo", category: "Verduras y frutas", qty: 1, unit: "ud", pricePerUnit: 0.9 },
      { id: "aceite-oliva", name: "Aceite de oliva", category: "Despensa", qty: 30, unit: "ml", pricePerUnit: 0.01 },
    ],
  },
  {
    id: "tortilla-francesa",
    name: "Tortilla francesa + ensalada",
    emoji: "🥚",
    kcal: 380,
    time: 15,
    difficulty: "Fácil",
    tags: ["huevos", "rápido"],
    mealTypes: ["cena"],
    tupperFriendly: false,
    kidFriendly: true,
    allergens: ["huevo"],
    servings: 2,
    ingredients: [
      { id: "huevos", name: "Huevos", category: "Lácteos y huevos", qty: 4, unit: "ud", pricePerUnit: 0.2 },
      { id: "lechuga", name: "Lechuga", category: "Verduras y frutas", qty: 1, unit: "ud", pricePerUnit: 0.99 },
      { id: "tomate", name: "Tomates", category: "Verduras y frutas", qty: 2, unit: "ud", pricePerUnit: 0.5 },
      { id: "aceite-oliva", name: "Aceite de oliva", category: "Despensa", qty: 15, unit: "ml", pricePerUnit: 0.01 },
    ],
  },
  {
    id: "pollo-horno-patatas",
    name: "Pollo al horno con patatas",
    emoji: "🍗",
    kcal: 610,
    time: 50,
    difficulty: "Normal",
    tags: ["carne", "horno", "proteína"],
    mealTypes: ["comida"],
    tupperFriendly: true,
    kidFriendly: true,
    allergens: [],
    servings: 4,
    ingredients: [
      { id: "pollo", name: "Pollo entero", category: "Carnes y pescados", qty: 1500, unit: "g", pricePerUnit: 0.0036 },
      { id: "patata", name: "Patatas", category: "Verduras y frutas", qty: 4, unit: "ud", pricePerUnit: 0.25 },
      { id: "cebolla", name: "Cebolla", category: "Verduras y frutas", qty: 1, unit: "ud", pricePerUnit: 0.4 },
      { id: "limon", name: "Limón", category: "Verduras y frutas", qty: 1, unit: "ud", pricePerUnit: 0.4 },
      { id: "aceite-oliva", name: "Aceite de oliva", category: "Despensa", qty: 30, unit: "ml", pricePerUnit: 0.01 },
    ],
  },
  {
    id: "crema-calabacin",
    name: "Crema de calabacín",
    emoji: "🥣",
    kcal: 290,
    time: 25,
    difficulty: "Fácil",
    tags: ["verdura", "crema"],
    mealTypes: ["cena"],
    tupperFriendly: true,
    kidFriendly: true,
    allergens: ["lactosa"],
    servings: 4,
    ingredients: [
      { id: "calabacin", name: "Calabacín", category: "Verduras y frutas", qty: 3, unit: "ud", pricePerUnit: 0.63 },
      { id: "cebolla", name: "Cebolla", category: "Verduras y frutas", qty: 1, unit: "ud", pricePerUnit: 0.4 },
      { id: "patata", name: "Patatas", category: "Verduras y frutas", qty: 1, unit: "ud", pricePerUnit: 0.25 },
      { id: "nata", name: "Nata cocinar", category: "Lácteos y huevos", qty: 200, unit: "ml", pricePerUnit: 0.0043 },
      { id: "aceite-oliva", name: "Aceite de oliva", category: "Despensa", qty: 15, unit: "ml", pricePerUnit: 0.01 },
    ],
  },
  {
    id: "pasta-bolonesa",
    name: "Pasta boloñesa",
    emoji: "🍝",
    kcal: 580,
    time: 35,
    difficulty: "Fácil",
    tags: ["carbos", "pasta", "carne"],
    mealTypes: ["comida", "cena"],
    tupperFriendly: true,
    kidFriendly: true,
    allergens: ["gluten"],
    servings: 4,
    ingredients: [
      { id: "espaguetis", name: "Espaguetis", category: "Legumbres y pasta", qty: 500, unit: "g", pricePerUnit: 0.0019 },
      { id: "carne-picada", name: "Carne picada", category: "Carnes y pescados", qty: 500, unit: "g", pricePerUnit: 0.0084 },
      { id: "tomate-frito", name: "Tomate triturado", category: "Despensa", qty: 400, unit: "g", pricePerUnit: 0.0025 },
      { id: "cebolla", name: "Cebolla", category: "Verduras y frutas", qty: 1, unit: "ud", pricePerUnit: 0.4 },
      { id: "parmesano", name: "Queso parmesano", category: "Lácteos y huevos", qty: 50, unit: "g", pricePerUnit: 0.0175 },
    ],
  },
  {
    id: "salmon-brocoli",
    name: "Salmón a la plancha + brócoli",
    emoji: "🐟",
    kcal: 420,
    time: 20,
    difficulty: "Fácil",
    tags: ["pescado", "rápido"],
    mealTypes: ["cena"],
    tupperFriendly: false,
    kidFriendly: false,
    allergens: ["pescado"],
    servings: 2,
    ingredients: [
      { id: "salmon", name: "Salmón", category: "Carnes y pescados", qty: 300, unit: "g", pricePerUnit: 0.0227 },
      { id: "brocoli", name: "Brócoli", category: "Verduras y frutas", qty: 1, unit: "ud", pricePerUnit: 1.29 },
      { id: "aceite-oliva", name: "Aceite de oliva", category: "Despensa", qty: 15, unit: "ml", pricePerUnit: 0.01 },
      { id: "limon", name: "Limón", category: "Verduras y frutas", qty: 1, unit: "ud", pricePerUnit: 0.4 },
    ],
  },
  {
    id: "garbanzos-espinacas",
    name: "Garbanzos con espinacas",
    emoji: "🥘",
    kcal: 490,
    time: 40,
    difficulty: "Fácil",
    tags: ["legumbres", "verdura", "guiso"],
    mealTypes: ["comida"],
    tupperFriendly: true,
    kidFriendly: true,
    allergens: [],
    servings: 4,
    ingredients: [
      { id: "garbanzos", name: "Garbanzos", category: "Legumbres y pasta", qty: 400, unit: "g", pricePerUnit: 0.0027 },
      { id: "espinacas", name: "Espinacas", category: "Verduras y frutas", qty: 400, unit: "g", pricePerUnit: 0.0041 },
      { id: "cebolla", name: "Cebolla", category: "Verduras y frutas", qty: 1, unit: "ud", pricePerUnit: 0.4 },
      { id: "ajo", name: "Ajos", category: "Verduras y frutas", qty: 3, unit: "ud", pricePerUnit: 0.1 },
      { id: "aceite-oliva", name: "Aceite de oliva", category: "Despensa", qty: 30, unit: "ml", pricePerUnit: 0.01 },
    ],
  },
  {
    id: "revuelto-setas",
    name: "Revuelto de setas + pan",
    emoji: "🍳",
    kcal: 350,
    time: 15,
    difficulty: "Fácil",
    tags: ["huevos", "rápido"],
    mealTypes: ["cena"],
    tupperFriendly: false,
    kidFriendly: true,
    allergens: ["huevo", "gluten"],
    servings: 2,
    ingredients: [
      { id: "huevos", name: "Huevos", category: "Lácteos y huevos", qty: 4, unit: "ud", pricePerUnit: 0.2 },
      { id: "setas", name: "Setas variadas", category: "Verduras y frutas", qty: 300, unit: "g", pricePerUnit: 0.0095 },
      { id: "pan", name: "Pan", category: "Panadería y cereales", qty: 1, unit: "ud", pricePerUnit: 1.2 },
      { id: "aceite-oliva", name: "Aceite de oliva", category: "Despensa", qty: 15, unit: "ml", pricePerUnit: 0.01 },
    ],
  },
  {
    id: "merluza-salsa-verde",
    name: "Merluza en salsa verde",
    emoji: "🐠",
    kcal: 410,
    time: 30,
    difficulty: "Normal",
    tags: ["pescado"],
    mealTypes: ["comida"],
    tupperFriendly: true,
    kidFriendly: true,
    allergens: ["pescado"],
    servings: 4,
    ingredients: [
      { id: "merluza", name: "Merluza", category: "Carnes y pescados", qty: 800, unit: "g", pricePerUnit: 0.0094 },
      { id: "perejil", name: "Perejil", category: "Verduras y frutas", qty: 1, unit: "ud", pricePerUnit: 0.5 },
      { id: "ajo", name: "Ajos", category: "Verduras y frutas", qty: 3, unit: "ud", pricePerUnit: 0.1 },
      { id: "harina", name: "Harina", category: "Despensa", qty: 30, unit: "g", pricePerUnit: 0.0011 },
      { id: "aceite-oliva", name: "Aceite de oliva", category: "Despensa", qty: 30, unit: "ml", pricePerUnit: 0.01 },
    ],
  },
  {
    id: "pizza-casera",
    name: "Pizza casera",
    emoji: "🍕",
    kcal: 620,
    time: 40,
    difficulty: "Normal",
    tags: ["carbos"],
    mealTypes: ["cena"],
    tupperFriendly: false,
    kidFriendly: true,
    allergens: ["gluten", "lactosa"],
    servings: 4,
    ingredients: [
      { id: "harina-pizza", name: "Harina de pizza", category: "Panadería y cereales", qty: 500, unit: "g", pricePerUnit: 0.0022 },
      { id: "mozzarella", name: "Mozzarella", category: "Lácteos y huevos", qty: 250, unit: "g", pricePerUnit: 0.0064 },
      { id: "tomate-frito", name: "Tomate triturado", category: "Despensa", qty: 200, unit: "g", pricePerUnit: 0.0025 },
      { id: "oregano", name: "Orégano", category: "Despensa", qty: 5, unit: "g", pricePerUnit: 0.03 },
    ],
  },
  {
    id: "paella-mixta",
    name: "Paella mixta",
    emoji: "🥘",
    kcal: 650,
    time: 55,
    difficulty: "Me gusta",
    tags: ["arroz"],
    mealTypes: ["comida"],
    tupperFriendly: true,
    kidFriendly: true,
    allergens: ["marisco"],
    servings: 4,
    ingredients: [
      { id: "arroz", name: "Arroz bomba", category: "Legumbres y pasta", qty: 400, unit: "g", pricePerUnit: 0.0042 },
      { id: "pollo", name: "Pollo entero", category: "Carnes y pescados", qty: 500, unit: "g", pricePerUnit: 0.0036 },
      { id: "gambas", name: "Gambas", category: "Carnes y pescados", qty: 200, unit: "g", pricePerUnit: 0.025 },
      { id: "pimiento-rojo", name: "Pimiento rojo", category: "Verduras y frutas", qty: 1, unit: "ud", pricePerUnit: 0.9 },
      { id: "aceite-oliva", name: "Aceite de oliva", category: "Despensa", qty: 45, unit: "ml", pricePerUnit: 0.01 },
    ],
  },
  {
    id: "hamburguesas",
    name: "Hamburguesas caseras",
    emoji: "🍔",
    kcal: 580,
    time: 25,
    difficulty: "Fácil",
    tags: ["carne", "proteína"],
    mealTypes: ["cena"],
    tupperFriendly: false,
    kidFriendly: true,
    allergens: ["gluten"],
    servings: 4,
    ingredients: [
      { id: "carne-picada", name: "Carne picada", category: "Carnes y pescados", qty: 600, unit: "g", pricePerUnit: 0.0084 },
      { id: "pan-burger", name: "Pan hamburguesa", category: "Panadería y cereales", qty: 4, unit: "ud", pricePerUnit: 0.4 },
      { id: "queso-cheddar", name: "Queso cheddar", category: "Lácteos y huevos", qty: 120, unit: "g", pricePerUnit: 0.02 },
      { id: "lechuga", name: "Lechuga", category: "Verduras y frutas", qty: 1, unit: "ud", pricePerUnit: 0.99 },
      { id: "tomate", name: "Tomates", category: "Verduras y frutas", qty: 2, unit: "ud", pricePerUnit: 0.5 },
    ],
  },
  {
    id: "ensalada-cesar",
    name: "Ensalada César",
    emoji: "🥗",
    kcal: 340,
    time: 15,
    difficulty: "Fácil",
    tags: ["verdura", "rápido"],
    mealTypes: ["cena"],
    tupperFriendly: false,
    kidFriendly: false,
    allergens: ["gluten", "lactosa", "huevo"],
    servings: 2,
    ingredients: [
      { id: "lechuga", name: "Lechuga romana", category: "Verduras y frutas", qty: 1, unit: "ud", pricePerUnit: 0.99 },
      { id: "pollo", name: "Pechuga de pollo", category: "Carnes y pescados", qty: 200, unit: "g", pricePerUnit: 0.0065 },
      { id: "parmesano", name: "Queso parmesano", category: "Lácteos y huevos", qty: 40, unit: "g", pricePerUnit: 0.0175 },
      { id: "picatostes", name: "Picatostes", category: "Panadería y cereales", qty: 50, unit: "g", pricePerUnit: 0.008 },
    ],
  },
  {
    id: "arroz-tres-delicias",
    name: "Arroz tres delicias",
    emoji: "🍚",
    kcal: 480,
    time: 25,
    difficulty: "Fácil",
    tags: ["arroz", "tupper"],
    mealTypes: ["comida", "cena"],
    tupperFriendly: true,
    kidFriendly: true,
    allergens: ["huevo", "soja"],
    servings: 4,
    ingredients: [
      { id: "arroz-largo", name: "Arroz largo", category: "Legumbres y pasta", qty: 400, unit: "g", pricePerUnit: 0.003 },
      { id: "huevos", name: "Huevos", category: "Lácteos y huevos", qty: 2, unit: "ud", pricePerUnit: 0.2 },
      { id: "jamon-york", name: "Jamón york", category: "Carnes y pescados", qty: 150, unit: "g", pricePerUnit: 0.015 },
      { id: "guisantes", name: "Guisantes", category: "Verduras y frutas", qty: 200, unit: "g", pricePerUnit: 0.005 },
      { id: "zanahoria", name: "Zanahoria", category: "Verduras y frutas", qty: 1, unit: "ud", pricePerUnit: 0.3 },
    ],
  },
  {
    id: "albondigas-tomate",
    name: "Albóndigas en salsa de tomate",
    emoji: "🍖",
    kcal: 520,
    time: 45,
    difficulty: "Normal",
    tags: ["carne", "guiso", "tupper"],
    mealTypes: ["comida"],
    tupperFriendly: true,
    kidFriendly: true,
    allergens: ["gluten"],
    servings: 4,
    ingredients: [
      { id: "carne-picada", name: "Carne picada", category: "Carnes y pescados", qty: 500, unit: "g", pricePerUnit: 0.0084 },
      { id: "tomate-frito", name: "Tomate triturado", category: "Despensa", qty: 400, unit: "g", pricePerUnit: 0.0025 },
      { id: "cebolla", name: "Cebolla", category: "Verduras y frutas", qty: 1, unit: "ud", pricePerUnit: 0.4 },
      { id: "pan-rallado", name: "Pan rallado", category: "Panadería y cereales", qty: 50, unit: "g", pricePerUnit: 0.005 },
      { id: "huevos", name: "Huevos", category: "Lácteos y huevos", qty: 1, unit: "ud", pricePerUnit: 0.2 },
    ],
  },
  {
    id: "ensalada-quinoa",
    name: "Ensalada de quinoa y pollo",
    emoji: "🥗",
    kcal: 450,
    time: 20,
    difficulty: "Fácil",
    tags: ["tupper", "verdura"],
    mealTypes: ["comida"],
    tupperFriendly: true,
    kidFriendly: false,
    allergens: [],
    servings: 2,
    ingredients: [
      { id: "quinoa", name: "Quinoa", category: "Legumbres y pasta", qty: 200, unit: "g", pricePerUnit: 0.008 },
      { id: "pollo", name: "Pechuga de pollo", category: "Carnes y pescados", qty: 250, unit: "g", pricePerUnit: 0.0065 },
      { id: "tomate-cherry", name: "Tomates cherry", category: "Verduras y frutas", qty: 200, unit: "g", pricePerUnit: 0.006 },
      { id: "pepino", name: "Pepino", category: "Verduras y frutas", qty: 1, unit: "ud", pricePerUnit: 0.7 },
      { id: "aceite-oliva", name: "Aceite de oliva", category: "Despensa", qty: 20, unit: "ml", pricePerUnit: 0.01 },
    ],
  },
  {
    id: "sopa-fideos",
    name: "Sopa de fideos con pollo",
    emoji: "🍜",
    kcal: 310,
    time: 30,
    difficulty: "Fácil",
    tags: ["sopa"],
    mealTypes: ["cena"],
    tupperFriendly: true,
    kidFriendly: true,
    allergens: ["gluten"],
    servings: 4,
    ingredients: [
      { id: "fideos", name: "Fideos finos", category: "Legumbres y pasta", qty: 200, unit: "g", pricePerUnit: 0.004 },
      { id: "pollo", name: "Pechuga de pollo", category: "Carnes y pescados", qty: 300, unit: "g", pricePerUnit: 0.0065 },
      { id: "zanahoria", name: "Zanahoria", category: "Verduras y frutas", qty: 2, unit: "ud", pricePerUnit: 0.3 },
      { id: "puerro", name: "Puerro", category: "Verduras y frutas", qty: 1, unit: "ud", pricePerUnit: 0.8 },
    ],
  },
  {
    id: "atun-pimientos",
    name: "Atún a la plancha con pimientos",
    emoji: "🐟",
    kcal: 400,
    time: 20,
    difficulty: "Fácil",
    tags: ["pescado"],
    mealTypes: ["comida"],
    tupperFriendly: false,
    kidFriendly: false,
    allergens: ["pescado"],
    servings: 2,
    ingredients: [
      { id: "atun", name: "Atún fresco", category: "Carnes y pescados", qty: 300, unit: "g", pricePerUnit: 0.025 },
      { id: "pimiento-rojo", name: "Pimiento rojo", category: "Verduras y frutas", qty: 1, unit: "ud", pricePerUnit: 0.9 },
      { id: "pimiento-verde", name: "Pimiento verde", category: "Verduras y frutas", qty: 1, unit: "ud", pricePerUnit: 0.8 },
      { id: "aceite-oliva", name: "Aceite de oliva", category: "Despensa", qty: 15, unit: "ml", pricePerUnit: 0.01 },
    ],
  },
  {
    id: "macarrones-boloñesa-ninos",
    name: "Macarrones con tomate",
    emoji: "🍝",
    kcal: 450,
    time: 20,
    difficulty: "Fácil",
    tags: ["pasta", "niños"],
    mealTypes: ["comida", "cena"],
    tupperFriendly: true,
    kidFriendly: true,
    allergens: ["gluten"],
    servings: 4,
    ingredients: [
      { id: "macarrones", name: "Macarrones", category: "Legumbres y pasta", qty: 400, unit: "g", pricePerUnit: 0.0022 },
      { id: "tomate-frito", name: "Tomate frito", category: "Despensa", qty: 400, unit: "g", pricePerUnit: 0.0028 },
      { id: "queso-rallado", name: "Queso rallado", category: "Lácteos y huevos", qty: 80, unit: "g", pricePerUnit: 0.013 },
    ],
  },
  {
    id: "pescadilla-rebozada",
    name: "Pescadilla rebozada con patatas",
    emoji: "🍟",
    kcal: 500,
    time: 30,
    difficulty: "Fácil",
    tags: ["pescado", "niños"],
    mealTypes: ["comida"],
    tupperFriendly: false,
    kidFriendly: true,
    allergens: ["pescado", "gluten", "huevo"],
    servings: 4,
    ingredients: [
      { id: "pescadilla", name: "Pescadilla", category: "Carnes y pescados", qty: 600, unit: "g", pricePerUnit: 0.009 },
      { id: "harina", name: "Harina", category: "Despensa", qty: 100, unit: "g", pricePerUnit: 0.0011 },
      { id: "huevos", name: "Huevos", category: "Lácteos y huevos", qty: 2, unit: "ud", pricePerUnit: 0.2 },
      { id: "patata", name: "Patatas", category: "Verduras y frutas", qty: 4, unit: "ud", pricePerUnit: 0.25 },
    ],
  },
  {
    id: "crema-zanahoria",
    name: "Crema de zanahoria",
    emoji: "🥣",
    kcal: 220,
    time: 25,
    difficulty: "Fácil",
    tags: ["verdura", "crema", "niños"],
    mealTypes: ["cena"],
    tupperFriendly: true,
    kidFriendly: true,
    allergens: [],
    servings: 4,
    ingredients: [
      { id: "zanahoria", name: "Zanahoria", category: "Verduras y frutas", qty: 6, unit: "ud", pricePerUnit: 0.3 },
      { id: "patata", name: "Patatas", category: "Verduras y frutas", qty: 1, unit: "ud", pricePerUnit: 0.25 },
      { id: "puerro", name: "Puerro", category: "Verduras y frutas", qty: 1, unit: "ud", pricePerUnit: 0.8 },
    ],
  },
  {
    id: "arroz-caldoso-pollo",
    name: "Arroz caldoso con pollo",
    emoji: "🍲",
    kcal: 540,
    time: 45,
    difficulty: "Normal",
    tags: ["arroz", "guiso", "tupper"],
    mealTypes: ["comida"],
    tupperFriendly: true,
    kidFriendly: true,
    allergens: [],
    servings: 4,
    ingredients: [
      { id: "arroz", name: "Arroz bomba", category: "Legumbres y pasta", qty: 400, unit: "g", pricePerUnit: 0.0042 },
      { id: "pollo", name: "Pollo entero", category: "Carnes y pescados", qty: 800, unit: "g", pricePerUnit: 0.0036 },
      { id: "cebolla", name: "Cebolla", category: "Verduras y frutas", qty: 1, unit: "ud", pricePerUnit: 0.4 },
      { id: "pimiento-verde", name: "Pimiento verde", category: "Verduras y frutas", qty: 1, unit: "ud", pricePerUnit: 0.8 },
    ],
  },
  {
    id: "fajitas-pollo",
    name: "Fajitas de pollo",
    emoji: "🌯",
    kcal: 560,
    time: 25,
    difficulty: "Fácil",
    tags: ["carne", "rápido"],
    mealTypes: ["cena"],
    tupperFriendly: false,
    kidFriendly: true,
    allergens: ["gluten", "lactosa"],
    servings: 4,
    ingredients: [
      { id: "tortillas-trigo", name: "Tortillas de trigo", category: "Panadería y cereales", qty: 8, unit: "ud", pricePerUnit: 0.25 },
      { id: "pollo", name: "Pechuga de pollo", category: "Carnes y pescados", qty: 500, unit: "g", pricePerUnit: 0.0065 },
      { id: "pimiento-rojo", name: "Pimiento rojo", category: "Verduras y frutas", qty: 1, unit: "ud", pricePerUnit: 0.9 },
      { id: "pimiento-verde", name: "Pimiento verde", category: "Verduras y frutas", qty: 1, unit: "ud", pricePerUnit: 0.8 },
      { id: "cebolla", name: "Cebolla", category: "Verduras y frutas", qty: 1, unit: "ud", pricePerUnit: 0.4 },
    ],
  },
  {
    id: "alubias-chorizo",
    name: "Alubias con chorizo",
    emoji: "🍲",
    kcal: 580,
    time: 50,
    difficulty: "Fácil",
    tags: ["legumbres", "guiso", "tupper"],
    mealTypes: ["comida"],
    tupperFriendly: true,
    kidFriendly: true,
    allergens: [],
    servings: 4,
    ingredients: [
      { id: "alubias", name: "Alubias blancas", category: "Legumbres y pasta", qty: 400, unit: "g", pricePerUnit: 0.003 },
      { id: "chorizo", name: "Chorizo", category: "Carnes y pescados", qty: 200, unit: "g", pricePerUnit: 0.015 },
      { id: "cebolla", name: "Cebolla", category: "Verduras y frutas", qty: 1, unit: "ud", pricePerUnit: 0.4 },
      { id: "zanahoria", name: "Zanahoria", category: "Verduras y frutas", qty: 1, unit: "ud", pricePerUnit: 0.3 },
    ],
  },
  {
    id: "wok-verduras-tofu",
    name: "Wok de verduras con tofu",
    emoji: "🥦",
    kcal: 360,
    time: 20,
    difficulty: "Fácil",
    tags: ["verdura", "vegetariano"],
    mealTypes: ["cena"],
    tupperFriendly: true,
    kidFriendly: false,
    allergens: ["soja"],
    servings: 2,
    ingredients: [
      { id: "tofu", name: "Tofu", category: "Lácteos y huevos", qty: 300, unit: "g", pricePerUnit: 0.009 },
      { id: "brocoli", name: "Brócoli", category: "Verduras y frutas", qty: 1, unit: "ud", pricePerUnit: 1.29 },
      { id: "zanahoria", name: "Zanahoria", category: "Verduras y frutas", qty: 2, unit: "ud", pricePerUnit: 0.3 },
      { id: "salsa-soja", name: "Salsa de soja", category: "Despensa", qty: 30, unit: "ml", pricePerUnit: 0.008 },
    ],
  },
  {
    id: "empanada-atun",
    name: "Empanada de atún",
    emoji: "🥟",
    kcal: 490,
    time: 50,
    difficulty: "Normal",
    tags: ["pescado", "tupper"],
    mealTypes: ["cena"],
    tupperFriendly: true,
    kidFriendly: true,
    allergens: ["gluten", "pescado"],
    servings: 4,
    ingredients: [
      { id: "masa-empanada", name: "Masa empanada", category: "Panadería y cereales", qty: 2, unit: "ud", pricePerUnit: 2.2 },
      { id: "atun-lata", name: "Atún en lata", category: "Despensa", qty: 300, unit: "g", pricePerUnit: 0.014 },
      { id: "tomate-frito", name: "Tomate frito", category: "Despensa", qty: 200, unit: "g", pricePerUnit: 0.0028 },
      { id: "cebolla", name: "Cebolla", category: "Verduras y frutas", qty: 1, unit: "ud", pricePerUnit: 0.4 },
    ],
  },
  {
    id: "pure-verduras-ninos",
    name: "Puré de verduras",
    emoji: "🥄",
    kcal: 180,
    time: 25,
    difficulty: "Fácil",
    tags: ["verdura", "niños", "bebé"],
    mealTypes: ["comida", "cena"],
    tupperFriendly: true,
    kidFriendly: true,
    allergens: [],
    servings: 4,
    ingredients: [
      { id: "patata", name: "Patatas", category: "Verduras y frutas", qty: 2, unit: "ud", pricePerUnit: 0.25 },
      { id: "zanahoria", name: "Zanahoria", category: "Verduras y frutas", qty: 2, unit: "ud", pricePerUnit: 0.3 },
      { id: "calabacin", name: "Calabacín", category: "Verduras y frutas", qty: 1, unit: "ud", pricePerUnit: 0.63 },
      { id: "puerro", name: "Puerro", category: "Verduras y frutas", qty: 1, unit: "ud", pricePerUnit: 0.8 },
    ],
  },
  {
    id: "tortilla-patatas",
    name: "Tortilla de patatas",
    emoji: "🥘",
    kcal: 500,
    time: 40,
    difficulty: "Normal",
    tags: ["huevos", "tupper"],
    mealTypes: ["comida", "cena"],
    tupperFriendly: true,
    kidFriendly: true,
    allergens: ["huevo"],
    servings: 4,
    ingredients: [
      { id: "patata", name: "Patatas", category: "Verduras y frutas", qty: 4, unit: "ud", pricePerUnit: 0.25 },
      { id: "huevos", name: "Huevos", category: "Lácteos y huevos", qty: 6, unit: "ud", pricePerUnit: 0.2 },
      { id: "cebolla", name: "Cebolla", category: "Verduras y frutas", qty: 1, unit: "ud", pricePerUnit: 0.4 },
      { id: "aceite-oliva", name: "Aceite de oliva", category: "Despensa", qty: 100, unit: "ml", pricePerUnit: 0.01 },
    ],
  },
  {
    id: "cuscus-verduras",
    name: "Cuscús con verduras",
    emoji: "🍲",
    kcal: 430,
    time: 25,
    difficulty: "Fácil",
    tags: ["verdura", "tupper"],
    mealTypes: ["comida"],
    tupperFriendly: true,
    kidFriendly: false,
    allergens: ["gluten"],
    servings: 4,
    ingredients: [
      { id: "cuscus", name: "Cuscús", category: "Legumbres y pasta", qty: 300, unit: "g", pricePerUnit: 0.004 },
      { id: "calabacin", name: "Calabacín", category: "Verduras y frutas", qty: 1, unit: "ud", pricePerUnit: 0.63 },
      { id: "pimiento-rojo", name: "Pimiento rojo", category: "Verduras y frutas", qty: 1, unit: "ud", pricePerUnit: 0.9 },
      { id: "garbanzos-cocidos", name: "Garbanzos cocidos", category: "Legumbres y pasta", qty: 200, unit: "g", pricePerUnit: 0.004 },
    ],
  },
];

function iconTypeForRecipe(recipe) {
  if (recipe.tags.includes("pescado")) return "fish";
  if (recipe.tags.includes("carne")) return "meat";
  if (recipe.tags.includes("huevos")) return "egg";
  if (recipe.tags.includes("legumbres")) return "legume";
  if (recipe.tags.includes("pasta")) return "pasta";
  if (recipe.tags.includes("arroz")) return "rice";
  if (recipe.tags.includes("verdura") || recipe.tags.includes("vegetariano")) return "greens";
  if (recipe.tags.includes("crema") || recipe.tags.includes("sopa")) return "soup";
  return "chef";
}

function macrosForRecipe(recipe) {
  const macros = { protein: 18, carbs: 42, fat: 16 };
  if (recipe.tags.includes("pescado")) Object.assign(macros, { protein: 34, carbs: 16, fat: 18 });
  if (recipe.tags.includes("carne")) Object.assign(macros, { protein: 32, carbs: 34, fat: 20 });
  if (recipe.tags.includes("huevos")) Object.assign(macros, { protein: 22, carbs: 18, fat: 24 });
  if (recipe.tags.includes("legumbres")) Object.assign(macros, { protein: 24, carbs: 58, fat: 12 });
  if (recipe.tags.includes("pasta")) Object.assign(macros, { protein: 25, carbs: 72, fat: 18 });
  if (recipe.tags.includes("arroz")) Object.assign(macros, { protein: 24, carbs: 70, fat: 16 });
  if (recipe.tags.includes("verdura") && !recipe.tags.includes("carne") && !recipe.tags.includes("pescado")) {
    Object.assign(macros, { protein: 14, carbs: 34, fat: 13 });
  }
  if (recipe.tags.includes("niños")) {
    macros.protein = Math.max(12, macros.protein - 4);
    macros.carbs += 8;
  }
  if (recipe.kcal < 320) {
    macros.carbs = Math.max(14, macros.carbs - 14);
    macros.fat = Math.max(8, macros.fat - 6);
  }
  if (recipe.kcal > 560) {
    macros.carbs += 10;
    macros.fat += 5;
  }
  return macros;
}

function prepSummaryForRecipe(recipe) {
  if (recipe.time <= 20) return "Rápido, directo y perfecto para días con poca ventana.";
  if (recipe.tupperFriendly) return "Se conserva bien y funciona para cocinar de más.";
  if (recipe.tags.includes("guiso")) return "Mejora con reposo y admite preparación tranquila.";
  return "Cocina casera con pasos sencillos y resultado completo.";
}

function stepsForRecipe(recipe) {
  const mainIngredients = recipe.ingredients.slice(0, 3).map((ing) => ing.name.toLowerCase());
  const base = [
    `Prepara ${mainIngredients.join(", ")} y deja todo pesado antes de encender el fuego.`,
  ];
  if (recipe.tags.includes("crema") || recipe.tags.includes("sopa")) {
    return [
      ...base,
      "Sofríe la base vegetal con aceite de oliva hasta que coja aroma.",
      "Cubre con agua o caldo, cocina hasta que esté tierno y tritura si procede.",
      "Ajusta sal, textura y sirve con un toque de aceite al final.",
    ];
  }
  if (recipe.tags.includes("horno")) {
    return [
      ...base,
      "Precalienta el horno y coloca la proteína con las verduras en una bandeja.",
      "Aliña con aceite, sal y especias; hornea hasta que quede dorado.",
      "Deja reposar 5 minutos antes de servir para que los jugos se asienten.",
    ];
  }
  if (recipe.tags.includes("pasta") || recipe.tags.includes("arroz")) {
    return [
      ...base,
      "Cocina la pasta o el arroz hasta el punto recomendado.",
      "Prepara el acompañamiento en paralelo y mezcla al final para integrar sabores.",
      "Termina con hierbas, queso o aceite según encaje con la receta.",
    ];
  }
  if (recipe.tags.includes("pescado")) {
    return [
      ...base,
      "Marca el pescado a fuego medio-alto con poco aceite.",
      "Añade la guarnición y cocina solo lo justo para mantener jugosidad.",
      "Sirve al momento con limón o una salsa ligera.",
    ];
  }
  return [
    ...base,
    "Cocina primero la base aromática y añade la proteína o ingrediente principal.",
    "Mantén fuego medio hasta que todo quede hecho y bien ligado.",
    "Prueba, corrige sal y sirve en caliente.",
  ];
}

export const RECIPES = BASE_RECIPES.map((recipe) => ({
  ...recipe,
  iconType: iconTypeForRecipe(recipe),
  image: `/dishes/${recipe.id}.webp`,
  macros: macrosForRecipe(recipe),
  prepSummary: prepSummaryForRecipe(recipe),
  steps: stepsForRecipe(recipe),
}));

// Live, mutable lookup: callers (planner, shopping list, UI) read it through
// the live module binding and pick up entries added at runtime by
// `registerRecipes` (e.g. recipes generated by the AI planner).
export const RECIPES_BY_ID = Object.fromEntries(RECIPES.map((r) => [r.id, r]));

/**
 * Add or replace recipes in the runtime catalogue. New recipes are also
 * appended to RECIPES so any consumer iterating it sees them.
 *
 * @param {Recipe[]} extra
 */
export function registerRecipes(extra) {
  if (!Array.isArray(extra)) return;
  for (const recipe of extra) {
    if (!recipe?.id) continue;
    const existed = Boolean(RECIPES_BY_ID[recipe.id]);
    // Derive healthFlags defensively so every recipe reachable through
    // RECIPES_BY_ID (dish cards, dish detail) can show an honest health-profile
    // badge, regardless of which caller registered it (own recipe, AI-generated,
    // remote merge...).
    RECIPES_BY_ID[recipe.id] = ensureHealthFlags({ ...recipe });
    if (!existed) RECIPES.push(RECIPES_BY_ID[recipe.id]);
    else {
      const idx = RECIPES.findIndex((r) => r.id === recipe.id);
      if (idx !== -1) RECIPES[idx] = RECIPES_BY_ID[recipe.id];
    }
  }
}
