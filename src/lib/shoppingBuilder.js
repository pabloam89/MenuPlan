import { RECIPES_BY_ID } from "../data/recipes.js";
import { categoryForIngredient, normalizeIngredientKey } from "./ingredientCategories.js";
import { DAYS, MEALS } from "./planner.js";
function scaleIngredient(ing, eaters, recipeServings) {
  const factor = Math.max(1, eaters) / recipeServings;
  return {
    ...ing,
    qty: Math.round(ing.qty * factor * 100) / 100,
    scaledPrice: (ing.pricePerUnit ?? 0) * ing.qty * factor,
  };
}

function formatQty(qty, unit) {
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
 * Returns:
 *   {
 *     byCategory: [{ cat, items: [{ id, name, qty, unit, price, displayQty, have, sources: [{day, meal, group, recipeName}] }] }],
 *     byDay:      [{ day, items: [...] }],
 *     total:      number,
 *   }
 */
export function buildShoppingList(menuPlan, groups, meals = MEALS) {
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

  const items = Object.values(aggregate).map((it) => ({
    ...it,
    displayQty: formatQty(it.qty, it.unit),
    price: Math.round(it.price * 100) / 100,
  }));

  const byCategoryMap = {};
  for (const it of items) {
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

  const total = items.reduce((s, it) => s + it.price, 0);

  return { byCategory, byDay, total: Math.round(total * 100) / 100 };
}
