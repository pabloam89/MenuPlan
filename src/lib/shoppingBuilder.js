import { RECIPES_BY_ID } from "../data/recipes.js";
import { categoryForIngredient, normalizeIngredientKey, isQualitativeUnit, qualitativeUnitLabel } from "./ingredientCategories.js";
import { DAYS, MEALS } from "./planner.js";
import { ingredientWords, wordsOverlapEither, isWordSubsetOf } from "../utils/normalizePantryInput.js";
import { cookedEatersFor, slotUsesPrepared, slotGarnishInTupper } from "./freezer.js";
import { resolveIngredientId } from "./ingredients.js";
import { gramsPerPiece, convertStockAmount } from "./kitchenUnits.js";

// Whole-word match (not raw substring — see normalizePantryInput.js's
// "Repollo" note) between a shopping-list ingredient name and the user's
// saved pantry. Quantities are ignored entirely: if the recipe needs
// tomatoes and the user has tomatoes, the whole line is discounted — no
// partial-amount tracking (per the feature spec, deliberately out of scope).
//
// `adapted` lines (dietary swaps like "Leche sin lactosa") use a stricter,
// one-directional match: the pantry entry must mention every word of the
// adapted name, not just the base ingredient. Otherwise a plain "leche"
// pantry entry (regular milk) would silently discount the whole "Leche sin
// lactosa" line, defeating the reason that line was flagged `adapted` in the
// first place — the family still needs to buy the specific substitute
// product even though they already have the regular one at home.
// `pantryIngredientIds` (Fase 8, optional): canonical id per pantry row, same
// order as `pantryNormalized`. Only used on the non-adapted path — an adapted
// line (dietary swap) needs the stricter word-subset rule below to stay safe,
// and the catalog may not distinguish a substitute from its base ingredient
// by id, so an id match there could reintroduce the exact bug that rule
// exists to prevent.
function matchesPantry(ingredientName, pantryNormalized, adapted = false, pantryIngredientIds = []) {
  if (!pantryNormalized || pantryNormalized.length === 0) return false;
  const words = ingredientWords(ingredientName);
  if (adapted) {
    return pantryNormalized.some((key) => isWordSubsetOf(words, key.split("_")));
  }
  const ingredientId = resolveIngredientId(ingredientName);
  return pantryNormalized.some(
    (key, i) => wordsOverlapEither(key.split("_"), words) || (ingredientId != null && pantryIngredientIds[i] === ingredientId),
  );
}

/**
 * Pick the first pantry stock row that matches a recipe/shopping ingredient
 * name — same fuzzy rules as matchesPantry (or the stricter adapted rule),
 * plus an exact-id shortcut (Fase 8, non-adapted only — see matchesPantry's
 * comment on why `adapted` never uses it) when the row carries a resolved
 * `ingredientId` (`user_pantry.ingredient_id`) matching the ingredient name's
 * own resolution. Purely additive: never matches less than before.
 * Used by Modo cocina «Marcar cocinado» so decrementing stock agrees with
 * «Ya en casa» discounts.
 *
 * @param {string} ingredientName
 * @param {{ ingredientNormalized: string, ingredientId?: string|null }[]} pantryStock
 * @param {{ adapted?: boolean }} [opts]
 * @returns {object|null}
 */
export function findMatchingPantryItem(ingredientName, pantryStock, { adapted = false } = {}) {
  if (!pantryStock?.length) return null;
  const words = ingredientWords(ingredientName);
  if (!words.length) return null;
  const ingredientId = adapted ? null : resolveIngredientId(ingredientName);
  for (const row of pantryStock) {
    const idMatch = ingredientId != null && row.ingredientId != null && row.ingredientId === ingredientId;
    const keyWords = String(row.ingredientNormalized ?? "")
      .split("_")
      .filter(Boolean);
    if (!idMatch && !keyWords.length) continue;
    const ok = idMatch || (adapted ? isWordSubsetOf(words, keyWords) : wordsOverlapEither(keyWords, words));
    if (ok) return row;
  }
  return null;
}

// Unidad en la que se acumula un ingrediente, ANTES de agrupar.
//
// El catalogo declara 40 ingredientes en dos unidades a la vez -Aguacate en
// "ud" en 17 recetas y en "g" en otras 30, Cebolla 18/282, Ajo 11/370- porque
// una receta pide "1 aguacate" y otra "150 g de aguacate". Como la clave de
// agrupacion llevaba la unidad cruda, cada uno de esos 40 se partia en DOS
// filas del mismo ingrediente en la lista de la compra.
//
// El peso es la base porque de el se derivan las dos lecturas: la columna
// "Unidades" saca las piezas de los gramos (shoppingUnitsLabel -> pieceUnits),
// y snapToPackSize tambien convierte g -> ud al final. Al reves no se puede.
//
// Depende SOLO del nombre y la unidad, nunca del orden en que se recorra el
// menu: si dependiera de "la primera que aparezca", el mismo menu podria dar
// filas distintas en cada generacion.
//
// Sin gramos por pieza conocidos devuelve la unidad tal cual, y entonces las
// dos mitades siguen separadas igual que hasta ahora. Es lo correcto: preferimos
// dos filas visibles a fusionarlas con un factor inventado.
function aggregationUnit(name, unit) {
  if (unit === "ud" && gramsPerPiece(name) != null) return "g";
  return unit;
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

// applyGarnishToRecipe (lib/aiPlanner.js) funde los ingredientes de la
// guarnición en los del plato, marcándolos con este prefijo de id. Es lo único
// que distingue las dos mitades de un plato emparejado una vez fusionado, y lo
// necesitamos para los slots del congelador: del plato principal ya hay
// raciones hechas, pero la guarnición se cocina fresca igual.
function isGarnishIngredient(ing) {
  return String(ing?.id ?? "").startsWith("garnish-");
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
  // No specific pack-size rule matched. Whole-unit ("ud") ingredients still
  // can't be bought as fractions — e.g. a recipe scaled to 1 eater can need
  // "0.25 cebolla", but the store only sells whole onions. Round up so the
  // returned qty (used for editing, totals) matches what formatQty already
  // displays, instead of silently understating what to buy.
  if (unit === "ud") return { qty: Math.ceil(qty), unit };
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
 *   ("Ya en casa") instead of being removed — the user may still want to check
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
          // Names this recipe's ingredients got renamed to for a dietary
          // adaptation (e.g. "Leche" -> "Leche sin lactosa") — so the item can
          // be flagged in the shopping list instead of blending in as a plain
          // renamed line the user might not notice and buy the wrong product.
          const adaptedNames = new Set((recipe.adaptations ?? []).map((a) => a.to));
          // Slots cubiertos (total o parcialmente) desde nevera/congelador: del
          // plato principal solo se compra lo que falte por cocinar. Si la
          // guarnición va en el tupper (preparedGarnishRef), tampoco se compra.
          const usesPrepared = slotUsesPrepared(slot, rid);
          const mainEaters = usesPrepared ? cookedEatersFor(slot, rid) : slot.eaters;
          const garnishInTupper = slotGarnishInTupper(slot, rid);
          for (const ing of recipe.ingredients) {
            const forGarnish = isGarnishIngredient(ing);
            const ingEaters = forGarnish
              ? (garnishInTupper ? cookedEatersFor(slot, rid) : slot.eaters)
              : mainEaters;
            // Nada que comprar de esta mitad del plato: ya está cocinada y
            // esperando en el congelador.
            if (ingEaters <= 0) continue;
            const scaled = scaleIngredient(ing, ingEaters, recipe.servings);
            // Ver aggregationUnit: "1 aguacate" y "150 g de aguacate" tienen que
            // caer en la misma fila, no en dos.
            const aggUnit = aggregationUnit(ing.name, ing.unit);
            const aggQty =
              aggUnit === ing.unit
                ? scaled.qty
                : convertStockAmount(scaled.qty, ing.unit, aggUnit, ing.name) ?? scaled.qty;
            const key = normalizeIngredientKey(ing.name, aggUnit);
            const category = categoryForIngredient(ing.name, ing.category);
            if (!aggregate[key]) {
              aggregate[key] = {
                id: key,
                name: ing.name,
                category,
                unit: aggUnit,
                qty: 0,
                price: 0,
                sources: [],
                have: false,
                atHome: false,
                manual: false,
                adapted: false,
              };
            }
            if (adaptedNames.has(ing.name)) aggregate[key].adapted = true;
            aggregate[key].qty += aggQty;
            aggregate[key].price += scaled.scaledPrice;
            aggregate[key].sources.push({
              day,
              meal,
              group: group.label,
              recipeId: rid,
              recipeName: recipe.name,
              qty: scaled.qty,
              unit: ing.unit,
            });

            dayBuckets[day].push({
              id: `${day}-${meal}-${groupId}-${rid}-${ing.id}`,
              name: ing.name,
              category: ing.category,
              qty: aggQty,
              unit: aggUnit,
              price: scaled.scaledPrice,
              displayQty: formatQty(aggQty, aggUnit),
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
  const pantryIngredientIds = pantryIngredients.map((p) => p.ingredientId ?? null);
  const items = Object.values(aggregate).map((it) => {
    const { qty: snappedQty, unit: snappedUnit } = snapToPackSize(it.name, it.unit, it.qty);
    return {
      ...it,
      qty: snappedQty,
      unit: snappedUnit,
      displayQty: formatQty(snappedQty, snappedUnit),
      price: Math.round(it.price * 100) / 100,
      fromPantry: matchesPantry(it.name, pantryNormalized, it.adapted, pantryIngredientIds),
    };
  });

  // Pantry matches move to their own "Ya en casa" bucket instead of sitting in
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
