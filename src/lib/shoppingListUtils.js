import { INGREDIENT_CATEGORIES } from "../data/recipes.js";
import {
  categoryForIngredient,
  guessShoppingAisle,
  normalizeIngredientKey,
  normalizeName,
  SHOPPING_AISLES,
  isQualitativeUnit,
  qualitativeUnitLabel,
} from "./ingredientCategories.js";
import { DAYS } from "./planner.js";

export function formatDisplay(qty, unit) {
  if (isQualitativeUnit(unit)) return qualitativeUnitLabel(unit);
  if (unit === "g" && qty >= 1000)
    return `${(qty / 1000).toFixed(qty % 1000 === 0 ? 0 : 1)} kg`;
  if (unit === "ml" && qty >= 1000)
    return `${(qty / 1000).toFixed(qty % 1000 === 0 ? 0 : 1)} L`;
  if (unit === "ud")
    return Math.ceil(qty) === 1 ? "1 ud" : `${Math.ceil(qty)} uds`;
  return `${Math.ceil(qty)} ${unit}`;
}

/** One line per recipe with summed qty. */
export function recipeLinesFromSources(sources = []) {
  const map = new Map();
  for (const s of sources) {
    const key = s.recipeName ?? "?";
    if (!map.has(key)) {
      map.set(key, {
        recipeName: key,
        qty: 0,
        unit: s.unit ?? "ud",
        meals: new Set(),
        days: new Set(),
      });
    }
    const row = map.get(key);
    row.qty += s.qty ?? 0;
    if (s.meal) row.meals.add(s.meal);
    if (s.day) row.days.add(s.day);
  }
  return Array.from(map.values())
    .map((r) => ({
      ...r,
      meals: Array.from(r.meals),
      days: Array.from(r.days),
      displayQty: formatDisplay(r.qty, r.unit),
    }))
    .sort((a, b) => a.recipeName.localeCompare(b.recipeName));
}

/** Per recipe: which days/meals use this ingredient and how much. */
export function recipeUsageFromSources(sources = []) {
  const byRecipe = new Map();
  for (const s of sources) {
    const key = s.recipeName ?? "?";
    if (!byRecipe.has(key)) {
      byRecipe.set(key, { recipeName: key, slots: [] });
    }
    const mealRank = s.meal === "Cena" ? 2 : s.meal === "Desayuno" ? 0 : 1;
    byRecipe.get(key).slots.push({
      day: s.day,
      meal: s.meal,
      displayQty: formatDisplay(s.qty ?? 0, s.unit ?? "ud"),
      sort: (DAYS.indexOf(s.day ?? "") + 1) * 10 + mealRank,
    });
  }
  return Array.from(byRecipe.values())
    .map((r) => ({
      ...r,
      slots: r.slots.sort((a, b) => a.sort - b.sort),
    }))
    .sort((a, b) => a.recipeName.localeCompare(b.recipeName));
}

export function isActiveItem(item) {
  return !item.have && !item.atHome && !item.fromPantry;
}

export function isDoneItem(item) {
  return Boolean(item.have || item.atHome || item.fromPantry);
}

/** Auto-detected from the user's saved pantry — shown in its own "Ya lo
 * tienes" section rather than mixed into either the pending or done view. */
export function isPantryItem(item) {
  return Boolean(item.fromPantry);
}

/** Merge duplicate rows (legacy ids, garnish prefixes, accent variants). */
export function mergeShoppingItems(items) {
  const map = new Map();
  for (const it of items) {
    const key = normalizeIngredientKey(it.name, it.unit ?? "ud");
    const category = categoryForIngredient(it.name, it.category);
    if (!map.has(key)) {
      map.set(key, {
        ...it,
        id: key,
        name: it.name,
        category,
        unit: it.unit ?? "ud",
        qty: it.qty ?? 0,
        sources: [...(it.sources ?? [])],
        have: Boolean(it.have),
        atHome: Boolean(it.atHome),
        fromPantry: Boolean(it.fromPantry),
      });
      continue;
    }
    const row = map.get(key);
    row.qty += it.qty ?? 0;
    row.sources.push(...(it.sources ?? []));
    row.have = row.have || Boolean(it.have);
    row.atHome = row.atHome || Boolean(it.atHome);
    row.fromPantry = row.fromPantry || Boolean(it.fromPantry);
  }
  return Array.from(map.values()).map((it) => ({
    ...it,
    displayQty: formatDisplay(it.qty, it.unit),
  }));
}

export function itemsByAisle(items) {
  const byAisle = Object.fromEntries(SHOPPING_AISLES.map((a) => [a, []]));
  for (const it of items) {
    const aisle = guessShoppingAisle(it.name);
    if (!byAisle[aisle]) byAisle[aisle] = [];
    byAisle[aisle].push(it);
  }
  return SHOPPING_AISLES.map((aisle) => ({
    aisle,
    items: (byAisle[aisle] ?? []).sort((a, b) => a.name.localeCompare(b.name)),
  })).filter((g) => g.items.length > 0);
}

/** @deprecated Broad categories; use itemsByAisle in UI. */
export function itemsByCategory(items) {
  const byCategoryMap = {};
  for (const it of items) {
    const cat = categoryForIngredient(it.name, it.category) || "Otros";
    if (!byCategoryMap[cat]) byCategoryMap[cat] = [];
    byCategoryMap[cat].push(it);
  }
  return INGREDIENT_CATEGORIES.map((cat) => ({
    cat,
    items: (byCategoryMap[cat] || []).sort((a, b) => a.name.localeCompare(b.name)),
  }))
    .concat(
      Object.keys(byCategoryMap)
        .filter((c) => !INGREDIENT_CATEGORIES.includes(c))
        .map((c) => ({
          cat: c,
          items: byCategoryMap[c].sort((a, b) => a.name.localeCompare(b.name)),
        }))
    )
    .filter((g) => g.items.length > 0);
}

/** Per-day rows: one entry per ingredient with qty only for that day. */
export function itemsByDay(items) {
  const dayMap = Object.fromEntries(DAYS.map((d) => [d, new Map()]));

  for (const it of items) {
    if (!it.sources?.length) continue;
    const byDaySources = new Map();
    for (const s of it.sources) {
      if (!s.day) continue;
      if (!byDaySources.has(s.day)) byDaySources.set(s.day, []);
      byDaySources.get(s.day).push(s);
    }
    for (const [day, sources] of byDaySources) {
      const qty = sources.reduce((sum, s) => sum + (s.qty ?? 0), 0);
      const unit = sources[0]?.unit ?? it.unit ?? "ud";
      const key = it.id;
      if (!dayMap[day].has(key)) {
        dayMap[day].set(key, {
          ...it,
          qty,
          unit,
          sources,
          displayQty: formatDisplay(qty, unit),
          recipeLines: recipeLinesFromSources(sources),
        });
      }
    }
  }

  const manual = items.filter((it) => it.manual);
  const byDay = DAYS.map((day) => ({
    day,
    items: Array.from(dayMap[day].values()).sort((a, b) => a.name.localeCompare(b.name)),
  })).filter((d) => d.items.length > 0);

  if (manual.length > 0) {
    byDay.push({
      day: "Manual",
      items: manual.map((it) => ({
        ...it,
        recipeLines: recipeLinesFromSources(it.sources),
      })),
    });
  }

  return byDay;
}

const MEAL_ORDER = { Desayuno: 0, Comida: 1, Cena: 2 };

/**
 * Cook-mode tree: day → meal → recipe → ingredients, with the qty each recipe
 * actually uses (the "need", per-source — NOT the pack-snapped buy amount, which
 * only makes sense aggregated in the shopping view). Items with no recipe
 * sources (manually added lines) are returned separately in `extras`.
 *
 * Each ingredient keeps its parent item `id` so the caller can toggle purchase
 * state against the same aggregated line the shopping view edits — checking off
 * an onion under Tuesday marks it bought everywhere it appears, so the two views
 * never disagree.
 */
export function itemsByDayMeal(items) {
  const dayMap = new Map(); // day -> meal -> recipeName -> { recipeId, ings:Map(id->ing) }
  const extras = [];
  for (const it of items) {
    if (!it.sources?.length) {
      if (it.manual) extras.push(it);
      continue;
    }
    for (const s of it.sources) {
      if (!s.day || !s.meal) continue;
      if (!dayMap.has(s.day)) dayMap.set(s.day, new Map());
      const mealMap = dayMap.get(s.day);
      if (!mealMap.has(s.meal)) mealMap.set(s.meal, new Map());
      const recipeMap = mealMap.get(s.meal);
      const rName = s.recipeName ?? "Otros";
      if (!recipeMap.has(rName)) recipeMap.set(rName, { recipeId: s.recipeId ?? null, ings: new Map() });
      const entry = recipeMap.get(rName);
      if (!entry.recipeId && s.recipeId) entry.recipeId = s.recipeId;
      if (!entry.ings.has(it.id)) {
        entry.ings.set(it.id, {
          id: it.id,
          name: it.name,
          unit: s.unit ?? it.unit ?? "ud",
          qty: 0,
          have: Boolean(it.have),
          atHome: Boolean(it.atHome),
          fromPantry: Boolean(it.fromPantry),
        });
      }
      entry.ings.get(it.id).qty += s.qty ?? 0;
    }
  }

  const days = DAYS.filter((d) => dayMap.has(d)).map((day) => {
    const mealMap = dayMap.get(day);
    const meals = Array.from(mealMap.keys())
      .sort((a, b) => (MEAL_ORDER[a] ?? 1) - (MEAL_ORDER[b] ?? 1))
      .map((meal) => ({
        meal,
        recipes: Array.from(mealMap.get(meal).entries())
          .sort((a, b) => a[0].localeCompare(b[0]))
          .map(([recipeName, entry]) => ({
            recipeName,
            recipeId: entry.recipeId,
            ingredients: Array.from(entry.ings.values())
              .map((g) => ({ ...g, displayQty: formatDisplay(g.qty, g.unit) }))
              .sort((a, b) => a.name.localeCompare(b.name)),
          })),
      }));
    return { day, meals };
  });

  return { days, extras };
}

/**
 * Per-dish "do I have everything?" lookup for the Menú screen's availability
 * badge: `${day}::${meal}::${recipeId}` -> { have, total }. Built on top of
 * `itemsByDayMeal` so a dish's ratio always matches what Modo Cocina shows for
 * the same recipe. Pantry matches count as "have" — same rule as CookDish's
 * own counter.
 */
export function dishAvailabilityMap(items) {
  const { days } = itemsByDayMeal(items);
  const map = new Map();
  for (const d of days) {
    for (const m of d.meals) {
      for (const r of m.recipes) {
        if (!r.recipeId) continue;
        const have = r.ingredients.filter((i) => i.have || i.atHome || i.fromPantry).length;
        map.set(`${d.day}::${m.meal}::${r.recipeId}`, { have, total: r.ingredients.length });
      }
    }
  }
  return map;
}

export function enrichItem(item) {
  const recipeLines = recipeLinesFromSources(item.sources);
  const recipeUsage = recipeUsageFromSources(item.sources);
  return {
    ...item,
    atHome: Boolean(item.atHome),
    have: Boolean(item.have),
    fromPantry: Boolean(item.fromPantry),
    recipeLines,
    recipeUsage,
    recipeCount: recipeLines.length,
    isGrouped: recipeLines.length > 1,
  };
}

export function matchReceiptProducts(productNames, items) {
  const pending = items.filter(isActiveItem);
  const matchedIds = new Set();
  const matches = [];

  for (const raw of productNames) {
    const p = normalizeName(raw);
    if (p.length < 3) continue;

    // Pick the *best* candidate among all still-unmatched items rather than
    // the first one that satisfies any condition — otherwise a generic list
    // item ("Leche") that happens to come first can steal a receipt line
    // that actually spells out a more specific item ("Leche sin lactosa").
    let best = null;
    let bestScore = 0;
    for (const it of pending) {
      if (matchedIds.has(it.id)) continue;
      const n = normalizeName(it.name);
      const score = matchScore(n, p, it.adapted);
      if (score > bestScore) {
        bestScore = score;
        best = it;
      }
    }
    if (best) {
      matchedIds.add(best.id);
      matches.push({ id: best.id, name: best.name, receiptLine: raw });
    }
  }
  return matches;
}

/**
 * Score how well a receipt line (p) matches a shopping-list item name (n).
 * Higher = more confident; 0 means "no match".
 *
 * Items flagged `adapted` were renamed for an allergy/intolerance (e.g.
 * "Leche" -> "Leche sin lactosa" — see shoppingBuilder.js). They require
 * stronger evidence than a plain substring: a generic receipt line like
 * "LECHE" must NOT be enough to confirm the safety-relevant "sin lactosa"
 * variant was actually bought, since the store or the shopper may well have
 * bought regular milk instead. So for adapted items we drop the loose
 * "item name contains the (possibly generic) receipt text" direction and
 * only accept an exact match, the receipt text spelling out the item's full
 * name, or a high token overlap.
 */
function matchScore(n, p, adapted) {
  if (n === p) return 3;
  if (adapted) {
    if (p.includes(n)) return 2;
    const overlap = tokenOverlap(n, p);
    return overlap >= 0.6 ? 1 + overlap : 0;
  }
  if (n.includes(p) || p.includes(n)) return 2;
  const overlap = tokenOverlap(n, p);
  return overlap >= 0.6 ? 1 + overlap : 0;
}

function tokenOverlap(a, b) {
  const ta = new Set(a.split(/\s+/).filter((t) => t.length > 2));
  const tb = new Set(b.split(/\s+/).filter((t) => t.length > 2));
  if (ta.size === 0 || tb.size === 0) return 0;
  let hit = 0;
  for (const t of ta) if (tb.has(t)) hit++;
  return hit / Math.max(ta.size, tb.size);
}
