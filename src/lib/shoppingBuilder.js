import { RECIPES_BY_ID } from "../data/recipes.js";
import { categoryForIngredient, normalizeIngredientKey, isQualitativeUnit, qualitativeUnitLabel } from "./ingredientCategories.js";
import { DAYS, MEALS } from "./planner.js";
import { ingredientWords, wordsOverlapEither } from "../utils/normalizePantryInput.js";

// Whole-word match (not raw substring — see normalizePantryInput.js's
// "Repollo" note) between a shopping-list ingredient name and the user's
// saved pantry. Quantities are ignored entirely: if the recipe needs
// tomatoes and the user has tomatoes, the whole line is discounted — no
// partial-amount tracking (per the feature spec, deliberately out of scope).
function matchesPantry(ingredientName, pantryNormalized) {
  if (!pantryNormalized || pantryNormalized.length === 0) return false;
  const words = ingredientWords(ingredientName);
  return pantryNormalized.some((key) => wordsOverlapEither(key.split("_"), words));
}

function scaleIngredient(ing, eaters, recipeServings) {
  if (isQualitativeUnit(ing.unit)) return { ...ing, qty: null, scaledPrice: 0 };
  const factor = Math.max(1, eaters) / recipeServings;
  return {
    ...ing,
    qty: Math.round(ing.qty * factor * 100) / 100,
    scaledPrice: (ing.pricePerUnit ?? 0) * ing.qty * factor,
  };
}

// Supermarket pack snapping. Each entry: [regex, inUnit, outUnit, packSize].
// Same inUnit/outUnit → round up to nearest multiple (e.g. 7 huevos → 12).
// Different units (g → ud) → convert to piece count (e.g. 300 g cebolla → 2 uds).
// First match wins — put more-specific patterns before general ones.
// Applied after full-week aggregation so rounding reflects the total need.
const PACK_SIZES = [
  // ud → ud
  [/huevo/, "ud", "ud", 6],           // half-dozen / dozen
  [/yogur/, "ud", "ud", 4],           // standard 4-pack
  // ml → ml
  [/leche/, "ml", "ml", 1000],        // 1 L carton
  [/nata/, "ml", "ml", 200],          // 200 ml brick
  // g → g
  [/harina/, "g", "g", 1000],         // 1 kg bag
  [/arroz/, "g", "g", 1000],          // 1 kg bag
  [/pasta|espagueti|macarron|fideo|lasana/, "g", "g", 500],  // 500 g packet
  [/pan rallado|panko/, "g", "g", 400],  // standard breadcrumb pack
  [/cocid/, "g", "g", 400],           // legumbres cocidas → bote 400 g
  [/^garbanzos$|^alubias (blancas|rojas)$|^lentejas( rojas)?$/, "g", "g", 500],  // legumbres secas → bolsa 500 g
  [/atun en conserva/, "g", "g", 120],   // lata pequeña escurrida
  [/mozzarella/, "g", "g", 125],      // bola / bolsa 125 g
  // g → ud: verduras que se compran por pieza
  // (cebolla morada ANTES de cebolla — la primera coincidencia gana)
  [/yogur/, "g", "ud", 125],          // 1 yogur estándar ≈ 125 g
  [/cebolla morada/, "g", "ud", 120], // 1 cebolla morada mediana
  [/cebolla/, "g", "ud", 150],        // 1 cebolla mediana
  [/zanahoria/, "g", "ud", 100],      // 1 zanahoria mediana
  [/calabacin/, "g", "ud", 350],      // 1 calabacín mediano
  [/berenjena/, "g", "ud", 300],      // 1 berenjena mediana
  [/puerro/, "g", "ud", 200],         // 1 puerro mediano
  [/^tomate$|tomate maduro/, "g", "ud", 150],  // 1 tomate de mesa
  [/pepino/, "g", "ud", 200],         // 1 pepino mediano
];

function snapToPackSize(name, unit, qty) {
  const lower = String(name ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  for (const [regex, inUnit, outUnit, packSize] of PACK_SIZES) {
    if (unit === inUnit && regex.test(lower)) {
      const snapped =
        inUnit === outUnit
          ? Math.ceil(qty / packSize) * packSize  // same unit: round to multiple
          : Math.ceil(qty / packSize);             // unit conversion: count pieces
      return { qty: snapped, unit: outUnit };
    }
  }
  return { qty, unit };
}

function formatQty(qty, unit) {
  if (isQualitativeUnit(unit)) return qualitativeUnitLabel(unit);
  if (unit === "g" && qty >= 1000) return `${(qty / 1000).toFixed(qty % 1000 === 0 ? 0 : 1)}kg`;
  if (unit === "ml" && qty >= 1000) return `${(qty / 1000).toFixed(qty % 1000 === 0 ? 0 : 1)}L`;
  if (unit === "ud") {
    const rounded = Math.ceil(qty);
    return rounded === 1 ? "1 ud" : `${rounded} uds`;
  }
  return `${Math.ceil(qty)}${unit}`;
}

/**
 * Build the shopping list from the generated menu plan.
 *
 * @param {{ ingredientName: string, ingredientNormalized: string }[]} [pantryIngredients]
 *   The signed-in user's saved pantry (see src/lib/pantry.js#loadPantry).
 *   Matched items are pulled out of `byCategory` into `pantryItems`
 *   ("Despensa") instead of being removed — the user may still want to check
 *   them off — and are excluded from `total`. No partial-quantity handling:
 *   a match discounts the whole line (see matchesPantry above).
 *
 * Returns:
 *   {
 *     byCategory:  [{ cat, items: [{ id, name, qty, unit, price, displayQty, have, sources: [{day, meal, group, recipeName}] }] }],
 *     pantryItems: [{ ...same shape, fromPantry: true }],
 *     byDay:       [{ day, items: [...] }],
 *     total:       number,
 *   }
 */
export function buildShoppingList(menuPlan, groups, meals = MEALS, pantryIngredients = []) {
  const groupById = Object.fromEntries(groups.map((g) => [g.id, g]));
  /** @type {Record<string, {id:string,name:string,category:string,unit:string,qty:number,price:number,sources:Array<{day:string,meal:string,group:string,recipeName:string}>}>} */
  const aggregate = {};
  /** @type {Record<string, Array<any>>} */
  const dayBuckets = Object.fromEntries(DAYS.map((d) => [d, []]));

  for (const [groupId, slots] of Object.entries(menuPlan)) {
    const group = groupById[groupId];
    if (!group) continue;
    for (const day of DAYS) {
      for (const meal of meals) {
        const slot = slots[`${day}-${meal}`];
        if (!slot) continue;
        const recipeIds = [slot.firstRecipeId, slot.recipeId].filter(Boolean);
        for (const rid of recipeIds) {
          const recipe = RECIPES_BY_ID[rid];
          if (!recipe) continue;
          for (const ing of recipe.ingredients) {
            const scaled = scaleIngredient(ing, slot.eaters, recipe.servings);
            const key = normalizeIngredientKey(ing.name, ing.unit);
            const category = categoryForIngredient(ing.name, ing.category);
            if (!aggregate[key]) {
              aggregate[key] = {
                id: key,
                name: ing.name,
                category,
                unit: ing.unit,
                qty: 0,
                price: 0,
                sources: [],
                have: false,
                atHome: false,
                manual: false,
              };
            }
            aggregate[key].qty += scaled.qty;
            aggregate[key].price += scaled.scaledPrice;
            aggregate[key].sources.push({
              day,
              meal,
              group: group.label,
              recipeName: recipe.name,
              qty: scaled.qty,
              unit: ing.unit,
            });

            dayBuckets[day].push({
              id: `${day}-${meal}-${groupId}-${rid}-${ing.id}`,
              name: ing.name,
              category: ing.category,
              qty: scaled.qty,
              unit: ing.unit,
              price: scaled.scaledPrice,
              displayQty: formatQty(scaled.qty, ing.unit),
              meal,
              group: group.label,
              recipeName: recipe.name,
            });
          }
        }
      }
    }
  }

  const pantryNormalized = pantryIngredients.map((p) => p.ingredientNormalized);
  const items = Object.values(aggregate).map((it) => {
    const { qty: snappedQty, unit: snappedUnit } = snapToPackSize(it.name, it.unit, it.qty);
    return {
      ...it,
      qty: snappedQty,
      unit: snappedUnit,
      displayQty: formatQty(snappedQty, snappedUnit),
      price: Math.round(it.price * 100) / 100,
      fromPantry: matchesPantry(it.name, pantryNormalized),
    };
  });

  // Pantry matches move to their own "Despensa" bucket instead of sitting in
  // their normal aisle group — they still need checking off, per the spec,
  // so they aren't dropped entirely.
  const shoppingItems = items.filter((it) => !it.fromPantry);
  const pantryItems = items
    .filter((it) => it.fromPantry)
    .sort((a, b) => a.name.localeCompare(b.name));

  const byCategoryMap = {};
  for (const it of shoppingItems) {
    if (!byCategoryMap[it.category]) byCategoryMap[it.category] = [];
    byCategoryMap[it.category].push(it);
  }
  const byCategory = Object.entries(byCategoryMap).map(([cat, items]) => ({
    cat,
    items: items.sort((a, b) => a.name.localeCompare(b.name)),
  }));

  const byDay = DAYS.map((day) => {
    const dayItems = dayBuckets[day];
    // Aggregate per ingredient within the day too
    const m = {};
    for (const it of dayItems) {
      const key = `${it.name}|${it.unit}`;
      if (!m[key]) m[key] = { ...it, qty: 0, price: 0, meals: new Set(), recipes: new Set() };
      m[key].qty += it.qty;
      m[key].price += it.price;
      m[key].meals.add(it.meal);
      m[key].recipes.add(it.recipeName);
    }
    return {
      day,
      items: Object.values(m).map((it) => ({
        ...it,
        meals: Array.from(it.meals),
        recipes: Array.from(it.recipes),
        displayQty: formatQty(it.qty, it.unit),
        price: Math.round(it.price * 100) / 100,
      })),
    };
  });

  // Excludes pantry matches — the whole point is not paying for what's
  // already at home.
  const total = shoppingItems.reduce((s, it) => s + it.price, 0);

  return { byCategory, pantryItems, byDay, total: Math.round(total * 100) / 100 };
}
