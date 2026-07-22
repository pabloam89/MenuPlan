import { useEffect, useRef, useState } from "react";
import {
  Apple,
  Bean,
  BookOpen,
  Calendar,
  CalendarDays,
  Check,
  ChefHat,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Coffee,
  Croissant,
  Drumstick,
  Egg,
  Fish,
  Hash,
  Refrigerator,
  Leaf,
  Loader2,
  Milk,
  Moon,
  Package,
  Plus,
  Receipt,
  Scale,
  Share2,
  ShoppingBasket,
  ShoppingCart,
  Soup,
  Sprout,
  Sun,
  Trash2,
  Undo2,
  Utensils,
  Wallet,
  Wheat,
  X,
} from "lucide-react";
import {
  BottomNav,
  ProgressDots,
  SegmentedControl,
  WeekRangeBadge,
  WizardOptionCard,
  WizardSheet,
  bottomNavSpacer,
} from "../components/ui.jsx";
import { ShoppingCoachTour } from "../components/HomeCoachTour.jsx";
import { ManualEntryModal, StorePicker, SUPERMARKETS, appendManualSpend, appendReceiptSpend } from "./SpendPanel.jsx";
import { ingredientDictionary, matchReceiptLine, classifyConfidence } from "../lib/priceHistory.js";
import { INGREDIENT_CATEGORIES, RECIPES_BY_ID } from "../data/recipes.js";
import { normalizeIngredientKey, isPerishableAisle, guessShoppingAisle, normalizeName } from "../lib/ingredientCategories.js";
import { dishImageForRecipe } from "../assets/dishes/dishImages.js";
import { visualForRecipe } from "../assets/dishes/dishVisuals.js";
import { formatISODateShort } from "../lib/menuArchive.js";
import { shoppingUnitsLabel, gramsPerPiece, convertStockAmount, formatStockQty } from "../lib/kitchenUnits.js";
import { extractReceiptDetail } from "../lib/receiptParser.js";
import { RECEIPT_FIXTURES } from "../lib/receiptFixtures.js";
import { useAuth } from "../lib/useAuth.js";
import { addPantryItems, addLocalPantryItems, loadPantry, loadLocalPantry, setPantryItemQty, setLocalPantryItemQty, removePantryItem, removeLocalPantryItem } from "../lib/pantry.js";
import { findMatchingPantryItem } from "../lib/shoppingBuilder.js";
import { normalizePantryInput } from "../utils/normalizePantryInput.js";
import {
  enrichItem,
  formatDisplay,
  isActiveItem,
  isDoneItem,
  itemsByAisle,
  itemsByDayMeal,
  mergeShoppingItems,
  matchReceiptProducts,
} from "../lib/shoppingListUtils.js";
import { calendarDayNumber, formatWeekRangeLabel, getWeekDates, getWeekDatesByMenuWeek, getWeekDatesFromStartISO } from "../lib/weekCalendar.js";
import { shareShoppingList } from "../lib/menuExport.js";

const DAY_LETTERS = { Lun: "L", Mar: "M", Mié: "X", Jue: "J", Vie: "V", Sáb: "S", Dom: "D" };

const DAY_FULL = {
  Lun: "Lunes",
  Mar: "Martes",
  Mié: "Miércoles",
  Jue: "Jueves",
  Vie: "Viernes",
  Sáb: "Sábado",
  Dom: "Domingo",
};

const MEAL_BADGE = {
  Desayuno: { Icon: Coffee, color: "#a16207" },
  Comida: { Icon: Sun, color: "#0d9488" },
  Cena: { Icon: Moon, color: "#6366f1" },
};

// Dish "miniatura" — mirrors DishIcon in Menu.jsx so cook mode uses the same
// colored tile / photo per recipe family.
const ICONS_BY_TYPE = {
  fish: Fish,
  meat: Drumstick,
  egg: Egg,
  legume: Soup,
  pasta: Wheat,
  rice: Wheat,
  greens: Leaf,
  soup: Soup,
  chef: Utensils,
};

// Cook mode only carries a recipe NAME (from shopping-item sources), so resolve
// the recipe object by name to get its icon/photo. Lazy + rebuilt when the
// async catalog grows.
let _recipeByName = null;
let _recipeByNameSize = 0;
function recipeByName(name) {
  const ids = Object.keys(RECIPES_BY_ID);
  if (!_recipeByName || _recipeByNameSize !== ids.length) {
    _recipeByName = new Map();
    for (const id of ids) {
      const r = RECIPES_BY_ID[id];
      if (r?.name) _recipeByName.set(normalizeName(r.name), r);
    }
    _recipeByNameSize = ids.length;
  }
  return _recipeByName.get(normalizeName(name ?? "")) ?? null;
}

// Which recipes (day::meal::name) are fully "ready to cook" — every one of
// their ingredients checked off, at home, or covered by pantry — given a raw
// shopping-items array. Used to diff before/after a ticket confirm so we can
// tell the user which dishes it just unlocked.
function readyRecipeKeys(items) {
  const { days } = itemsByDayMeal(items);
  const map = new Map();
  for (const d of days) {
    for (const m of d.meals) {
      for (const r of m.recipes) {
        if (r.ingredients.length > 0 && r.ingredients.every((i) => i.have || i.atHome || i.fromPantry)) {
          map.set(`${d.day}::${m.meal}::${r.recipeName}`, { day: d.day, meal: m.meal, recipeName: r.recipeName });
        }
      }
    }
  }
  return map;
}

// A cooked recipe's ingredient amount is in the catalog's own g/ml/ud unit;
// En casa stock can be in a different one of those three if the user chose
// it that way when adding (e.g. "2 ud" of chicken breast instead of grams).
// Delegates to the shared convertStockAmount, which also normalizes kg↔g and
// l↔ml and returns null (skip, don't guess) for unsafe mismatches (e.g. g↔ml).
function convertIngredientToStockUnit(ing, stockUnit) {
  return convertStockAmount(ing.qty, ing.unit, stockUnit, ing.name);
}

// Live "Ya en casa" coverage. Recomputes each buy row against the CURRENT
// pantry stock (never the fromPantry snapshot baked at generation) and is
// quantity-aware:
//   - stock ≥ need              → fully covered  (row.fromPantry = true)
//   - 0 < stock < need          → partial: trim the row to just the shortfall
//                                  and remember how much stock already covers it
//   - no stock / no safe unit   → left to buy in full
// Mutates the passed rows in place. A limited stock is allocated in calendar
// order (earlier weeks first) across a working copy, so two weeks of the same
// perishable draw from one shared amount instead of both seeing it whole.
function applyPantryCoverage(rows, stock) {
  for (const row of rows) {
    row.fromPantry = false;
  }
  if (!stock?.length) return;
  // Binary "Ya en casa" presence: any buy row that matches something you have
  // in stock (qty > 0) is shown as already-at-home, so the section lists
  // EVERYTHING you have that the menu needs — even when you only have part of
  // it. (A quantity-aware split that trimmed partials into the buy list hid the
  // table whenever coverage wasn't total, which isn't what users expect here.)
  for (const row of rows) {
    if (!(row.qty > 0)) continue;
    const match = findMatchingPantryItem(row.name, stock, { adapted: Boolean(row.adapted) });
    if (match && Number(match.qty) > 0) row.fromPantry = true;
  }
}

const AISLE_UI = {
  Verduras: { Icon: Leaf, color: "#3d9b5f" },
  Frutas: { Icon: Apple, color: "#e07b39" },
  Carne: { Icon: Drumstick, color: "#c45c4a" },
  Pescado: { Icon: Fish, color: "#2072b8" },
  Legumbres: { Icon: Bean, color: "#8b6914" },
  "Pasta y arroz": { Icon: Wheat, color: "#c9922a" },
  Lácteos: { Icon: Milk, color: "#4a9ec5" },
  Huevos: { Icon: Egg, color: "#ca9a14" },
  Panadería: { Icon: Croissant, color: "#a67c52" },
  Especias: { Icon: Sprout, color: "#7c5cbf" },
  "Aceites y conservas": { Icon: Package, color: "#64748b" },
  // Not a real store aisle — «Ya en casa» (ingredients matched against En casa
  // stock; see src/lib/pantry.js). Distinct from the Compra macro "Despensa"
  // (non-perishable aisles still to buy).
  __pantry: { Icon: Refrigerator, color: "#2d5a3d" },
};

export function ShoppingScreen({
  shopping,
  setShopping,
  // Full app blob + writer, so spend capture (ticket / manual) lives right here
  // in Compra instead of forcing a trip to Análisis → Gasto.
  data = null,
  setData = null,
  onNav,
  onToast,
  // The menú's own week (offset + startDayIdx). Drives the date label so a
  // mid-week menú shows only its real days, matching the Menú screen.
  menuWeek = null,
  // Multi-week support: every week of the ACTIVE menú (orderedWeeks shape:
  // { weekStart, offset, startISO, endISO, startDayIdx, shopping }). When
  // present with >1 entries the screen shows a week multi-select and merges
  // the selected weeks (staples summed, perishables kept per week). Empty/
  // absent → falls back to the single live `shopping` list (guests, demo,
  // legacy menús with no archive).
  menuWeeks = null,
  // Offset of the menú's currently-active week (drives the default selection
  // and which week reads the live `shopping` instead of the archived copy).
  activeOffset = null,
  // Writes one week's shopping back to the archive (and mirrors the live list
  // when it's the active week). Signature: (weekStart, { items }).
  onUpdateWeek = null,
  // Optional demo hooks (first-run value-prop carousel): preset the list filter
  // and pre-open one aisle so the category "zoom" is visible on mount. Default
  // to the normal collapsed behaviour; never passed in the real app.
  initialOpenAisle = null,
  initialListScope = null,
  // One-shot deep link from the Menú screen's "faltan ingredientes" dot:
  // { day, meal, recipeId }. Switches to Modo Cocina and auto-expands +
  // scrolls to that exact dish. Cleared by the parent once consumed.
  initialFocusDish = null,
  onFocusDishHandled = null,
  onOpenPantry = null,
  // Bumps after login merge so stock reloads once local→cloud fold finishes.
  pantryEpoch = 0,
}) {
  // Used to file un-matched ticket lines into En casa on receipt confirm
  // (handleReceiptConfirm) and to look up/decrement real stock when a dish
  // gets marked "Cocinado" in Modo cocina — guests use the localStorage mirror.
  const { user } = useAuth();
  const [pantryStock, setPantryStock] = useState(() => (user ? [] : loadLocalPantry()));
  useEffect(() => {
    let active = true;
    if (!user) {
      setPantryStock(loadLocalPantry());
      return undefined;
    }
    loadPantry(user.id).then((rows) => {
      if (active) setPantryStock(rows);
    });
    return () => {
      active = false;
    };
  }, [user, pantryEpoch]);
  const [listScope, setListScope] = useState(initialListScope ?? "pending");
  // "compra": aggregated by aisle (buy efficiently). "cocina": grouped by day →
  // meal → recipe (plan what you'll cook). Same underlying items, two lenses.
  const [viewMode, setViewMode] = useState(initialFocusDish ? "cocina" : "compra");

  useEffect(() => {
    if (!initialFocusDish) return;
    setViewMode("cocina");
    // The dish is only linkable while it's missing something, i.e. still
    // "pending" — force that scope so the cook tree doesn't filter it out if
    // the screen had been left on "Comprado".
    setListScope("pending");
  }, [initialFocusDish]);
  // Cook mode lets you read quantities two ways: exact "peso" (175 g / 300 ml) or
  // kitchen "uds" (≈ 1 lata, 2 muslos…). A mini toggle flips every row at once.
  const [cookUnitView, setCookUnitView] = useState("peso");
  const [openSections, setOpenSections] = useState(
    initialOpenAisle ? { [initialOpenAisle]: true } : {},
  );

  // Demo only (value-prop carousel): let the parent drive the tab from
  // outside by changing `initialListScope`. Never happens in the real app,
  // where this prop is passed once and never updated.
  useEffect(() => {
    if (initialListScope) setListScope(initialListScope);
  }, [initialListScope]);
  const [expandedId, setExpandedId] = useState(null);
  const [showIconCoach, setShowIconCoach] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [receiptBusy, setReceiptBusy] = useState(false);
  // Unified spend capture: one money button → chooser (escanear / a mano).
  const [showCapture, setShowCapture] = useState(false);
  const [showManualSpend, setShowManualSpend] = useState(false);
  // Row-level "Comprado" tap: which item is being marked, while the wizard
  // (sin precio / añadir gasto / escanear ticket) or the manual modal opened
  // from it is on screen. Cleared once the pick resolves.
  const [purchaseChoice, setPurchaseChoice] = useState(null);
  // Parsed receipt awaiting the clarifying-questions wizard:
  // { detail:{store,date,lines}, lines:[enriched] }. Null when no ticket is
  // being reviewed.
  const [receiptWizard, setReceiptWizard] = useState(null);
  // DEV-only: picker of synthetic demo tickets, shown instead of the file input
  // when tapping "Escanear ticket" in local development.
  const [showReceiptDemo, setShowReceiptDemo] = useState(false);
  // Recipes that just became fully "ready to cook" after confirming a ticket
  // (see handleReceiptConfirm) — shown as a small celebratory follow-up.
  const [unlockedDishes, setUnlockedDishes] = useState(null);
  const [editingQtyId, setEditingQtyId] = useState(null);
  const fileRef = useRef(null);

  const menuMode = Array.isArray(menuWeeks) && menuWeeks.length > 0;

  // Each week's item list. The ACTIVE week reads the live `shopping` (freshest
  // edits) rather than its archived copy; the rest read the archive. In
  // fallback mode (guests / demo / legacy menús with no archive) there's a
  // single synthetic week wrapping the live list.
  const weeks = menuMode
    ? menuWeeks.map((w) => ({
        ...w,
        items: w.offset === activeOffset ? shopping.items : (w.shopping?.items ?? []),
      }))
    : [
        {
          weekStart: "__live",
          offset: activeOffset ?? 0,
          startISO: null,
          endISO: null,
          startDayIdx: menuWeek?.startDayIdx ?? 0,
          items: shopping.items,
        },
      ];

  const orderedAll = [...weeks].sort((a, b) => a.offset - b.offset);
  const weekNumByStart = new Map(orderedAll.map((w, i) => [w.weekStart, i + 1]));
  const weeksSig = orderedAll.map((w) => w.offset).join(",");

  // Which weeks are included in the list right now. Defaults to the active
  // week; the user can add more to buy for several weeks at once. Never empty.
  const [selectedOffsets, setSelectedOffsets] = useState(null);
  useEffect(() => {
    const avail = weeksSig.split(",").filter(Boolean).map(Number);
    setSelectedOffsets((cur) => {
      if (!avail.length) return cur && cur.size === 0 ? cur : new Set();
      let base = cur ? [...cur].filter((o) => avail.includes(o)) : [];
      if (base.length === 0) base = [avail.includes(activeOffset) ? activeOffset : avail[0]];
      const next = new Set(base);
      if (cur && cur.size === next.size && [...next].every((o) => cur.has(o))) return cur;
      return next;
    });
  }, [weeksSig, activeOffset]);

  const activeSelected = weeks
    .filter((w) => selectedOffsets?.has(w.offset))
    .sort((a, b) => a.offset - b.offset);
  const selectedWeeks = activeSelected.length ? activeSelected : [orderedAll[0]].filter(Boolean);
  const multiWeek = selectedWeeks.length > 1;

  const toggleWeek = (offset) =>
    setSelectedOffsets((cur) => {
      const next = new Set(cur ?? []);
      if (next.has(offset)) {
        if (next.size <= 1) return cur; // keep at least one week selected
        next.delete(offset);
      } else {
        next.add(offset);
      }
      return next;
    });

  // Writes one week's shopping through the parent (archive + live mirror for
  // the active week). Fallback mode drives the live `shopping` state directly.
  const updateWeek = (weekStart, updater) => {
    const w = weeks.find((x) => x.weekStart === weekStart);
    const next = updater(w?.items ?? []);
    if (menuMode) onUpdateWeek?.(weekStart, { items: next });
    else setShopping((s) => ({ ...s, items: next }));
  };

  // A row's sources belonging to `weekStart`, or every source if it has none
  // there — so scoping to a specific week (see applyToSources) never
  // silently no-ops just because that week isn't one of the row's own.
  const scopedSources = (row, weekStart) => {
    const sources = row?.__sources ?? [];
    if (!weekStart) return sources;
    const scoped = sources.filter((s) => s.weekStart === weekStart);
    return scoped.length ? scoped : sources;
  };

  // Apply a patch to a display row across every week it came from: a merged
  // Despensa line can span several weeks; a Frescos line belongs to one.
  // Optional `weekStart` scopes the patch to just that week's own slice of a
  // multi-week row (used by the receipt wizard — a ticket only ever covers
  // ONE real purchase, so it shouldn't tach every merged week at once).
  const applyToSources = (row, patch, weekStart = null) => {
    const byWeek = new Map();
    for (const s of scopedSources(row, weekStart)) {
      if (!byWeek.has(s.weekStart)) byWeek.set(s.weekStart, new Set());
      byWeek.get(s.weekStart).add(s.ikey);
    }
    for (const [ws, ikeys] of byWeek) {
      // Merge first so a patch (esp. an absolute qty) lands once even if the
      // stored week still carries legacy duplicate rows for the same key.
      updateWeek(ws, (items) =>
        mergeShoppingItems(items).map((it) =>
          ikeys.has(normalizeIngredientKey(it.name, it.unit ?? "ud")) ? { ...it, ...patch } : it,
        ),
      );
    }
  };

  // ── Combined, enriched view of the selected weeks ──
  // Perishables (Frescos) stay per week; staples (Despensa) and pantry matches
  // are merged/summed across the selected weeks.
  // Build every buy row first WITHOUT trusting the stored `fromPantry` flag —
  // "Ya en casa" is recomputed live below against the current stock, so the
  // generation-time snapshot must not pre-exclude anything here.
  const perishRows = [];
  const stapleAgg = new Map(); // ikey -> { items:[], sources:[] }
  const accumulate = (agg, ikey, it, weekStart) => {
    if (!agg.has(ikey)) agg.set(ikey, { items: [], sources: [] });
    const e = agg.get(ikey);
    e.items.push(it);
    e.sources.push({ weekStart, ikey });
  };
  for (const w of selectedWeeks) {
    for (const it of mergeShoppingItems(w.items ?? [])) {
      const ikey = it.id;
      if (isPerishableAisle(guessShoppingAisle(it.name))) {
        const row = enrichItem(it);
        row.id = multiWeek ? `${w.weekStart}::${ikey}` : ikey;
        row.__sources = [{ weekStart: w.weekStart, ikey }];
        row.__weekLabel = multiWeek ? `Sem ${weekNumByStart.get(w.weekStart)}` : null;
        row.__weekOffset = w.offset;
        perishRows.push(row);
      } else {
        accumulate(stapleAgg, ikey, it, w.weekStart);
      }
    }
  }
  const aggToRows = (agg, idPrefix) =>
    [...agg.values()].map(({ items, sources }) => {
      const merged = mergeShoppingItems(items)[0];
      const row = enrichItem(merged);
      row.id = `${idPrefix}${merged.id}`;
      row.__sources = sources;
      row.__qtyLocked = sources.length > 1;
      // mergeShoppingItems ORs `have` across duplicates, which is right for
      // same-week legacy dupes but wrong across weeks: since a ticket can now
      // tach just ONE week's slice of a multi-week staple (see markPurchased
      // weekStart scoping), the aggregated row must only read as "comprado"
      // once EVERY week it represents is actually covered — otherwise buying
      // it for this week would wrongly hide it as done for the others too.
      if (items.length > 1) row.have = items.every((it) => it.have);
      return row;
    });
  const allRows = [...perishRows, ...aggToRows(stapleAgg, "")];

  // Live pantry match (mutates allRows in place): flags every buy row you
  // already have something of in stock as fromPantry → the "Ya en casa" section.
  applyPantryCoverage(allRows, pantryStock);

  const enrichedItems = allRows.filter((r) => !r.fromPantry);
  // Matched rows form the "Ya en casa" section. Merge per-week perishable rows
  // back into one line per ingredient so the section reads one row per stocked
  // ingredient, not one per week. The `qty` here stays the recipe need (cook
  // mode reuses these rows and must show what each dish uses); the shopping
  // "Ya en casa" section overrides the DISPLAY with real stock (see below).
  const pantryMap = new Map();
  for (const r of allRows) {
    if (!r.fromPantry) continue;
    const ikey = r.__sources?.[0]?.ikey ?? r.id;
    if (!pantryMap.has(ikey)) {
      pantryMap.set(ikey, {
        ...r,
        id: `p::${ikey}`,
        __sources: [...(r.__sources ?? [])],
        __weekLabel: null,
      });
    } else {
      const ex = pantryMap.get(ikey);
      ex.__sources.push(...(r.__sources ?? []));
      ex.qty = (ex.qty ?? 0) + (r.qty ?? 0);
      ex.displayQty = formatDisplay(ex.qty, ex.unit ?? "ud");
    }
  }
  const pantryItems = [...pantryMap.values()]
    .map((r) => ({ ...r, __qtyLocked: (r.__sources?.length ?? 0) > 1 }))
    .sort((a, b) => a.name.localeCompare(b.name));

  // For the shopping "Ya en casa" section only: show the REAL amount you have in
  // the pantry for each ingredient (the stock from "En casa"), not the recipe's
  // need. It shrinks on its own as dishes are marked cooked (handleMarkCooked
  // decrements stock and reloads pantryStock).
  const pantryStockView = pantryItems.map((r) => {
    const stock = findMatchingPantryItem(r.name, pantryStock, { adapted: Boolean(r.adapted) });
    const stockQty = stock ? Number(stock.qty) || 0 : Number(r.qty) || 0;
    const stockUnit = stock?.unit ?? r.unit ?? "ud";
    return { ...r, qty: stockQty, unit: stockUnit, displayQty: formatStockQty(stockQty, stockUnit) };
  });

  const rowById = new Map();
  for (const r of [...enrichedItems, ...pantryItems]) rowById.set(r.id, r);
  const mergedItems = enrichedItems; // receipt matching / qty lookups

  const patchItem = (id, patch) => {
    const row = rowById.get(id);
    if (row) applyToSources(row, patch);
  };
  const removeItem = (id) => {
    const row = rowById.get(id);
    if (!row) return;
    const byWeek = new Map();
    for (const s of row.__sources ?? []) {
      if (!byWeek.has(s.weekStart)) byWeek.set(s.weekStart, new Set());
      byWeek.get(s.weekStart).add(s.ikey);
    }
    for (const [weekStart, ikeys] of byWeek) {
      updateWeek(weekStart, (items) =>
        mergeShoppingItems(items).filter(
          (it) => !ikeys.has(normalizeIngredientKey(it.name, it.unit ?? "ud")),
        ),
      );
    }
  };
  const addItem = (newItem) => {
    const target = selectedWeeks[0]?.weekStart ?? orderedAll[0]?.weekStart;
    if (target == null) return;
    updateWeek(target, (items) => [
      ...items,
      {
        ...newItem,
        id: `manual-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        have: false,
        atHome: false,
        manual: true,
        sources: [],
      },
    ]);
  };
  // "No lo tengo" on a "Ya en casa" row: coverage is now recomputed live from
  // real stock, so flipping a flag would just get re-covered on the next render.
  // The honest fix is to drop the disputed stock — the row then rejoins the buy
  // list because nothing covers it anymore.
  const rejectPantryMatch = async (item) => {
    const match = findMatchingPantryItem(item.name, pantryStock, {
      adapted: Boolean(item.adapted),
    });
    if (!match) return;
    if (user) {
      await removePantryItem(user.id, match.id);
      setPantryStock(await loadPantry(user.id));
    } else {
      removeLocalPantryItem(match.id);
      setPantryStock(loadLocalPantry());
    }
    onToast?.("Quitado de 'en casa'");
  };
  const markPurchased = (ids, weekStart = null) => {
    for (const id of ids) {
      const row = rowById.get(id);
      if (row) applyToSources(row, { have: true }, weekStart);
    }
  };
  const saveItemQty = (id, rawValue) => {
    const parsed = parseFloat(String(rawValue).replace(",", "."));
    const row = rowById.get(id);
    if (row && !row.__qtyLocked && !isNaN(parsed) && parsed > 0) {
      applyToSources(row, {
        qty: parsed,
        displayQty: formatDisplay(parsed, row.unit ?? "ud"),
      });
    }
    setEditingQtyId(null);
  };

  const shoppingOnlyItems = enrichedItems;
  const totalCount = shoppingOnlyItems.length;
  const doneCount = shoppingOnlyItems.filter(isDoneItem).length;
  const progress = totalCount > 0 ? doneCount / totalCount : 0;
  const visibleItems =
    listScope === "pending"
      ? enrichedItems.filter(isActiveItem)
      : listScope === "done"
        ? enrichedItems.filter(isDoneItem)
        : enrichedItems;
  const sections = itemsByAisle(visibleItems).map((g) => ({
    key: g.aisle,
    title: g.aisle,
    items: g.items,
  }));
  // Two always-visible macro-groups: Frescos (perishable aisles) vs Despensa.
  const freshSections = sections.filter((s) => isPerishableAisle(s.key));
  const stapleSections = sections.filter((s) => !isPerishableAisle(s.key));

  // Cook mode always shows the full recipe: every ingredient stays visible and
  // marking one as comprado/en casa just adds a tick (no filtering), so a dish
  // never ends up with some lines vanished and others ticked. The pending/done
  // scope only affects Modo compra.
  const cookSourceItems = [...enrichedItems, ...pantryItems];
  const cookTree = itemsByDayMeal(cookSourceItems);
  // Cook rows carry the same two actions as the aisle rows: "En casa" (atHome)
  // and "Comprado" (have). Each clears the other so an item lands in one bucket.
  const toggleCookHome = (id, atHome) => patchItem(id, { atHome, have: false });
  // Marking "Comprado" mirrors Modo compra: it opens the same PurchaseChoiceSheet
  // (registrar precio / a mano / escanear ticket) instead of ticking silently.
  // Un-marking just clears the flag.
  const toggleCookPurchased = (id, have) => {
    if (!have) {
      patchItem(id, { have: false });
      return;
    }
    const item = cookSourceItems.find((it) => it.id === id);
    // "Ya en casa" ingredients are already stocked — don't offer the spend
    // pop-up for them (Modo compra hides "Comprado" on these rows for the same
    // reason); just tick without polluting spend/price data.
    if (setData && item && !item.fromPantry) {
      setPurchaseChoice(item);
      return;
    }
    patchItem(id, { have: true, atHome: false });
  };

  // "Marcar cocinado" state is scoped per week (so it naturally resets when a
  // new week's menú replaces this one) but lives in the generic `data` blob —
  // no per-week archive plumbing needed, it already round-trips through
  // localStorage + user_state on its own (see App.jsx's debounced saves).
  const cookWeekKey = selectedWeeks[0]?.weekStart ?? "live";
  const cookedKeys = new Set(
    (data?.cookedDishes ?? [])
      .filter((k) => k.startsWith(`${cookWeekKey}::`))
      .map((k) => k.slice(cookWeekKey.length + 2)),
  );
  const handleMarkCooked = async (day, meal, recipeId, recipeName, ingredients) => {
    const shortKey = `${day}::${meal}::${recipeId ?? recipeName}`;
    if (cookedKeys.has(shortKey)) return;
    let decremented = 0;
    // Exact amount removed per stock row so "Deshacer cocinado" can restore it
    // precisely (survives clamping at 0 and several ingredients hitting one row).
    let deltas = [];
    if (pantryStock.length) {
      // Working copy so two ingredients that fuzzy-match the same stock row
      // (e.g. «Tomate» + «Tomate maduro») decrement sequentially instead of
      // both subtracting from the original qty.
      const working = pantryStock.map((p) => ({ ...p }));
      const origById = new Map(pantryStock.map((p) => [p.id, Number(p.qty) || 0]));
      const updatesById = new Map();
      const metaById = new Map();
      for (const ing of ingredients) {
        const stock = findMatchingPantryItem(ing.name, working, {
          adapted: Boolean(ing.adapted),
        });
        if (!stock) continue;
        const consume = convertIngredientToStockUnit(ing, stock.unit);
        if (consume == null) continue;
        const nextQty = Math.max(0, (Number(stock.qty) || 0) - consume);
        stock.qty = nextQty;
        updatesById.set(stock.id, nextQty);
        metaById.set(stock.id, {
          name: stock.ingredientName,
          normalized: stock.ingredientNormalized,
          unit: stock.unit,
        });
        decremented++;
      }
      if (updatesById.size) {
        const updates = [...updatesById.entries()].map(([id, nextQty]) => ({ id, nextQty }));
        deltas = updates
          .map((u) => {
            const removed = (origById.get(u.id) ?? 0) - u.nextQty;
            const meta = metaById.get(u.id);
            return removed > 0 && meta ? { ...meta, qty: removed } : null;
          })
          .filter(Boolean);
        if (user) {
          await Promise.all(updates.map((u) => setPantryItemQty(user.id, u.id, u.nextQty)));
        } else {
          for (const u of updates) setLocalPantryItemQty(u.id, u.nextQty);
        }
        setPantryStock((prev) =>
          prev
            .map((p) => {
              if (!updatesById.has(p.id)) return p;
              return { ...p, qty: updatesById.get(p.id) };
            })
            .filter((p) => p.qty > 0),
        );
      }
    }
    const fullKey = `${cookWeekKey}::${shortKey}`;
    setData?.((d) => ({
      ...d,
      cookedDishes: [...(d?.cookedDishes ?? []), fullKey],
      cookedDeltas: { ...(d?.cookedDeltas ?? {}), [fullKey]: deltas },
    }));
    onToast?.(decremented ? `¡Cocinado! Stock en casa actualizado (${decremented})` : "¡Cocinado!");
  };
  // Reverse of handleMarkCooked: re-adds exactly what was subtracted (top-up
  // recreates rows that had hit 0) and clears the cooked flag for that dish.
  const handleUndoCooked = async (day, meal, recipeId, recipeName) => {
    const shortKey = `${day}::${meal}::${recipeId ?? recipeName}`;
    if (!cookedKeys.has(shortKey)) return;
    const fullKey = `${cookWeekKey}::${shortKey}`;
    const deltas = data?.cookedDeltas?.[fullKey] ?? [];
    let restored = 0;
    if (deltas.length) {
      const items = deltas.map((d) => ({
        name: d.name,
        normalized: d.normalized,
        qty: d.qty,
        unit: d.unit,
        source: "manual",
      }));
      if (user) {
        await addPantryItems(user.id, items);
        setPantryStock(await loadPantry(user.id));
      } else {
        addLocalPantryItems(items);
        setPantryStock(loadLocalPantry());
      }
      restored = items.length;
    }
    setData?.((d) => {
      const nextDeltas = { ...(d?.cookedDeltas ?? {}) };
      delete nextDeltas[fullKey];
      return {
        ...d,
        cookedDishes: (d?.cookedDishes ?? []).filter((k) => k !== fullKey),
        cookedDeltas: nextDeltas,
      };
    });
    onToast?.(restored ? `Cocinado deshecho · stock devuelto (${restored})` : "Cocinado deshecho");
  };
  // Calendar dates for the cook-mode day stripe (same "Lun 14" reading as Tu
  // menú). Anchored to the first selected week in menú mode, else the live week.
  const cookDates = (() => {
    const w = selectedWeeks[0];
    if (menuMode && w?.startISO) return getWeekDatesFromStartISO(w.startISO, w.startDayIdx ?? 0).dates;
    if (menuWeek) return getWeekDatesByMenuWeek(menuWeek).dates;
    return getWeekDates();
  })();

  const isEmpty = sections.every((s) => s.items.length === 0) && pantryItems.length === 0;
  const hasPendingItems = shoppingOnlyItems.some(isActiveItem);
  const hasDoneItems = shoppingOnlyItems.some(isDoneItem);

  // Date label for the current selection: real span of the selected weeks in
  // menú mode; the single-week label otherwise.
  const weekLabel = (() => {
    const withISO = selectedWeeks.filter((w) => w.startISO && w.endISO);
    if (menuMode && withISO.length) {
      const start = withISO.reduce((m, w) => (w.startISO < m ? w.startISO : m), withISO[0].startISO);
      const end = withISO.reduce((m, w) => (w.endISO > m ? w.endISO : m), withISO[0].endISO);
      return `${formatISODateShort(start)} – ${formatISODateShort(end)}`;
    }
    const { dates: weekDates, activeDays } = menuWeek
      ? getWeekDatesByMenuWeek(menuWeek)
      : { dates: getWeekDates(), activeDays: undefined };
    return formatWeekRangeLabel(weekDates, activeDays);
  })();

  // Badge top label: "N semanas" when several are selected, else the default
  // "Semana". The date range below always spans the whole selection.
  const weekTopLabel = multiWeek ? `${selectedWeeks.length} semanas` : undefined;

  // Real span of the currently selected week(s), used by the receipt wizard to
  // check the ticket's date against the shopping week it should belong to.
  const receiptWeek = (() => {
    const withISO = selectedWeeks.filter((w) => w.startISO && w.endISO);
    if (withISO.length) {
      const startISO = withISO.reduce((m, w) => (w.startISO < m ? w.startISO : m), withISO[0].startISO);
      const endISO = withISO.reduce((m, w) => (w.endISO > m ? w.endISO : m), withISO[0].endISO);
      return { startISO: startISO.slice(0, 10), endISO: endISO.slice(0, 10), label: weekLabel };
    }
    return { startISO: null, endISO: null, label: weekLabel };
  })();

  // Turn a parsed receipt detail into the enriched, matched lines the wizard
  // works with. Shared by the real photo flow and the DEV demo-ticket picker.
  const buildReceiptLines = (detail) => {
    const dict = ingredientDictionary();
    const aliases = data?.priceAliases ?? {};
    return detail.lines
      .filter((l) => l.kind !== "nonfood")
      .map((l) => {
        const m =
          l.kind === "prefab"
            ? { ingredientId: null, name: l.name, confidence: 1 }
            : matchReceiptLine(l.name, dict, aliases);
        return {
          raw: l.name,
          name: m.name ?? l.name,
          ingredientId: m.ingredientId,
          price: l.price ?? 0,
          qty: l.qty,
          unit: l.unit,
          kind: l.kind,
          confidence: m.confidence,
          include: true,
        };
      });
  };

  const handleReceiptPick = async (file) => {
    if (!file) return;
    setReceiptBusy(true);
    try {
      const detail = await extractReceiptDetail(file);
      const lines = buildReceiptLines(detail);
      if (lines.length === 0) {
        onToast?.("No se detectaron alimentos en el ticket");
        return;
      }
      setReceiptWizard({ detail, lines });
    } catch {
      onToast?.("No se pudo leer el ticket");
    } finally {
      setReceiptBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  // "Escanear ticket" entry point. In local dev we open a chooser of synthetic
  // demo tickets so the wizard flow can be tested without a photo; in
  // production it opens the camera/file picker as usual.
  const openScan = () => {
    if (import.meta.env.DEV) setShowReceiptDemo(true);
    else fileRef.current?.click();
  };

  const handleDemoTicket = (fixture) => {
    setShowReceiptDemo(false);
    const detail = {
      ...fixture.detail,
      lines: fixture.detail.lines.map((l) => ({ ...l })),
    };
    const lines = buildReceiptLines(detail);
    if (lines.length === 0) {
      onToast?.("No se detectaron alimentos en el ticket");
      return;
    }
    setReceiptWizard({ detail, lines });
  };

  // Ticket confirmed through the wizard: tach exactly the list ingredients the
  // user kept checked in the review step, and (when spend capture is available)
  // persist the prices + receipt from the lines they didn't discard.
  const handleReceiptConfirm = async ({ store, date, lines, tachIds, pantryEntries = [] }) => {
    const included = lines.filter((l) => l.include);

    // A ticket is ONE real purchase — it should only tach the week it
    // actually belongs to, not every week merged into a multi-week Despensa
    // row. Resolve that week from the ticket's own date (falls back to "all
    // the row's weeks" per scopedSources when it doesn't land in any of them,
    // e.g. guest/fallback mode with no week calendar at all).
    const targetWeekStart = (() => {
      for (const w of weeks) {
        if (w.startISO && w.endISO && date >= w.startISO.slice(0, 10) && date <= w.endISO.slice(0, 10)) {
          return w.weekStart;
        }
      }
      return null;
    })();

    // `ikeys` is the full set of ingredient keys this ticket actually tachas
    // (for persistence/undo, across whichever week(s) each row's sources
    // scoped to). `activeIkeys` is the subset that specifically lands on the
    // ACTIVE week — the only one `shopping.items` represents — since an ikey
    // alone (name+unit) doesn't carry week identity and would otherwise wrongly
    // preview a dish as unlocked when the tach really only hit a different week.
    const activeWeekStart = weeks.find((w) => w.offset === activeOffset)?.weekStart ?? weeks[0]?.weekStart ?? null;
    const ikeys = new Set();
    const activeIkeys = new Set();
    for (const id of tachIds) {
      const row = rowById.get(id);
      for (const s of scopedSources(row, targetWeekStart)) {
        ikeys.add(s.ikey);
        if (s.weekStart === activeWeekStart) activeIkeys.add(s.ikey);
      }
    }
    // Snapshot which recipes are "ready to cook" before vs. after this
    // ticket's tachado, so we can tell the user which dishes it just
    // unlocked.
    const beforeReady = readyRecipeKeys(shopping.items);
    const afterItems = shopping.items.map((it) =>
      activeIkeys.has(normalizeIngredientKey(it.name, it.unit ?? "ud")) ? { ...it, have: true } : it,
    );
    const afterReady = readyRecipeKeys(afterItems);
    const unlocked = [];
    const seenNames = new Set();
    for (const [key, info] of afterReady) {
      if (beforeReady.has(key) || seenNames.has(info.recipeName)) continue;
      seenNames.add(info.recipeName);
      unlocked.push(info);
    }

    markPurchased(tachIds, targetWeekStart);

    // A ticket line that matched nothing on the list wasn't a pending need —
    // it's something the user now has at home, so it goes straight into
    // "Despensa" for future weeks instead of being left dangling. Resolved
    // before appendReceiptSpend so the receipt record can carry the exact
    // pantry ids it created (lets deleting the ticket undo just those).
    let pantried = 0;
    let pantryIds = [];
    if (pantryEntries.length) {
      const items = pantryEntries
        .map((entry) => {
          const parsed = normalizePantryInput(entry.name)[0];
          if (!parsed) return null;
          return {
            name: parsed.raw,
            normalized: parsed.ambiguous ? parsed.candidates[0].normalized : parsed.normalized,
            qty: entry.qty,
            unit: entry.unit,
            source: "manual",
          };
        })
        .filter(Boolean);
      if (items.length) {
        if (user) {
          const results = await addPantryItems(user.id, items);
          pantried = results.length;
          // Only brand-new En casa rows get undone if this ticket is deleted —
          // a top-up on stock that already existed predates the ticket, so
          // wiping the whole row on undo would lose quantity the ticket never
          // created (see pantry.js addPantryItems).
          pantryIds = results.filter((r) => r.isNew).map((r) => r.id);
          setPantryStock(await loadPantry(user.id));
        } else {
          addLocalPantryItems(items);
          const next = loadLocalPantry();
          pantried = items.length;
          setPantryStock(next);
        }
      }
    }

    let saved = 0;
    if (setData) {
      saved = appendReceiptSpend(
        setData,
        { store, date, lines: included, tachedKeys: [...ikeys], tachedWeekStart: targetWeekStart, pantryIds },
        data?.priceAliases ?? {},
      );
    }
    setReceiptWizard(null);
    // When the ticket unlocks dishes we show the celebratory sheet instead of
    // a toast (the sheet already summarises the win — no double messaging, L2).
    if (unlocked.length) {
      setUnlockedDishes(unlocked);
    } else {
      const parts = [];
      if (tachIds.length) parts.push(`${tachIds.length} tachados`);
      if (saved) parts.push(`${saved} gastos guardados`);
      if (pantried) parts.push(`${pantried} a En casa`);
      onToast?.(parts.length ? parts.join(" · ") : "Ticket procesado");
    }
  };

  // Record a gasto from the same "Añadir a mano" modal used in Análisis → Gasto.
  // When opened from a row's "Comprado" wizard, also marks that row bought.
  const handleAddManualSpend = (entry) => {
    if (!setData) return;
    appendManualSpend(setData, entry, ingredientDictionary(), data?.priceAliases ?? {});
    if (purchaseChoice) patchItem(purchaseChoice.id, { have: true });
    setShowManualSpend(false);
    setPurchaseChoice(null);
    onToast?.("Gasto añadido");
  };

  const toggleIconCoach = () => {
    setShowIconCoach((on) => {
      if (on) return false;
      // The per-product icons only exist in the DOM when a section is open, so
      // make sure the first available aisle is expanded before the spotlight
      // starts hunting for its targets.
      const firstKey = freshSections[0]?.key ?? stapleSections[0]?.key;
      if (firstKey) setOpenSections((c) => ({ ...c, [firstKey]: true }));
      return true;
    });
  };

  const renderAisleSection = (section) => {
    if (section.items.length === 0) return null;
    const open = Boolean(openSections[section.key]);
    return (
      <div key={section.key} style={{ marginBottom: 10 }}>
        <button
          type="button"
          onClick={() =>
            setOpenSections((c) => ({ ...c, [section.key]: !c[section.key] }))
          }
          style={{
            ...sectionHeaderStyle,
            ...sectionLabelCardStyle,
            borderRadius: open ? "14px 14px 0 0" : 14,
            borderBottom: open ? "none" : sectionLabelCardStyle.border,
          }}
        >
          <AisleIcon aisle={section.key} />
          <span
            style={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              gap: 8,
              minWidth: 0,
              textAlign: "left",
            }}
          >
            {open ? (
              <ChevronDown size={16} color="#7a8a7f" />
            ) : (
              <ChevronRight size={16} color="#7a8a7f" />
            )}
            <span
              style={{
                fontSize: 15,
                fontWeight: 800,
                color: "#142f1d",
                letterSpacing: "-.2px",
              }}
            >
              {section.title}
            </span>
          </span>
          <span
            style={{
              fontSize: 14,
              fontWeight: 800,
              color: "#7a8a7f",
              minWidth: 28,
              textAlign: "right",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {section.items.length}
          </span>
        </button>
        {open && (
          <div style={aisleItemsStyle}>
            {/* Peso/uds switch sits directly ON TOP of this aisle's quantity
                column (2nd grid track), not flush-right over the actions. The
                3rd-track spacer reserves the actions width so the toggle lands
                over the qty reading exactly like it does in Modo cocina. */}
            <div style={aisleToggleRowStyle}>
              <span />
              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <CookUnitToggle unitView={cookUnitView} onUnitView={setCookUnitView} />
              </div>
              <span style={{ width: AISLE_ACTIONS_WIDTH }} />
            </div>
            {section.items.map((item) => (
              <ShoppingRow
                key={`${section.key}-${item.id}`}
                item={item}
                unitView={cookUnitView}
                doneView={listScope === "done"}
                expanded={expandedId === item.id}
                isEditingQty={editingQtyId === item.id}
                onToggleRecipes={() =>
                  setExpandedId(expandedId === item.id ? null : item.id)
                }
                onEditQty={() => setEditingQtyId(item.id)}
                onSaveQty={(val) => saveItemQty(item.id, val)}
                onCancelQty={() => setEditingQtyId(null)}
                onAtHome={() => patchItem(item.id, { atHome: true, have: false })}
                onPurchased={() => (setData ? setPurchaseChoice(item) : patchItem(item.id, { have: true }))}
                onUndo={() => patchItem(item.id, { atHome: false, have: false })}
                onRemove={() => removeItem(item.id)}
              />
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div style={{ background: "#f7f9f7", minHeight: "100dvh" }}>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        style={{ display: "none" }}
        onChange={(e) => handleReceiptPick(e.target.files?.[0])}
      />

      <div style={{ padding: "20px 16px 0", position: "relative" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 4,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <h2 style={titleStyle}>Tu compra</h2>
            <button
              type="button"
              onClick={toggleIconCoach}
              style={{
                ...iconBtnStyle,
                width: 32,
                height: 32,
                borderRadius: 999,
                background: showIconCoach ? "#e8f0ea" : "#fff",
              }}
              aria-label="Explicar iconos"
              aria-pressed={showIconCoach}
            >
              <CircleHelp size={17} strokeWidth={2.2} />
            </button>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {onOpenPantry && (
              <button
                type="button"
                onClick={onOpenPantry}
                style={iconBtnStyle}
                aria-label="En casa"
                title="En casa"
              >
                <Refrigerator size={18} strokeWidth={2.2} />
              </button>
            )}
            <button
              type="button"
              data-coach="shop-share"
              onClick={() => shareShoppingList(shopping).then((r) => {
                if (r.method === "clipboard") onToast?.("Lista copiada al portapapeles");
                else if (r.method === "download") onToast?.("Lista descargada");
              })}
              style={iconBtnStyle}
              aria-label="Compartir lista"
              title="Compartir lista"
            >
              <Share2 size={18} strokeWidth={2.2} />
            </button>
            <button
              type="button"
              data-coach="shop-receipt"
              onClick={() => (setData ? setShowCapture(true) : openScan())}
              disabled={receiptBusy}
              style={moneyBtnStyle}
              aria-label="Registrar gasto"
              title="Registrar gasto (ticket o a mano)"
            >
              {receiptBusy ? (
                <Loader2 size={18} className="rotating" color="#fff" />
              ) : (
                <Wallet size={18} strokeWidth={2.4} color="#fff" />
              )}
            </button>
          </div>
        </div>
        <div style={{ marginBottom: orderedAll.length > 1 ? 10 : 16 }}>
          <WeekRangeBadge topLabel={weekTopLabel} label={weekLabel} />
        </div>

        {orderedAll.length > 1 && (
          <div
            role="group"
            aria-label="Semanas del menú"
            style={{
              display: "flex",
              marginBottom: 16,
              borderRadius: 12,
              border: "1.5px solid #9cc7ab",
              overflow: "hidden",
              background: "#fff",
            }}
          >
            {orderedAll.map((w, i) => {
              const sel = selectedOffsets?.has(w.offset);
              return (
                <button
                  key={w.weekStart}
                  type="button"
                  onClick={() => toggleWeek(w.offset)}
                  aria-pressed={sel}
                  style={{
                    flex: 1,
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 7,
                    padding: "9px 8px",
                    border: "none",
                    borderLeft: i === 0 ? "none" : "1.5px solid #9cc7ab",
                    background: "#fff",
                    color: sel ? "#1c4a2e" : "#3d5245",
                    fontSize: 13,
                    fontWeight: 800,
                    cursor: "pointer",
                    fontFamily: "inherit",
                    transition: "color .15s",
                  }}
                >
                  <span
                    style={{
                      width: 16,
                      height: 16,
                      borderRadius: 5,
                      flexShrink: 0,
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      border: `1.5px solid ${sel ? "#4cba6e" : "#bcd3c4"}`,
                      background: sel ? "#4cba6e" : "transparent",
                      transition: "background .15s, border-color .15s",
                    }}
                  >
                    {sel && <Check size={11} strokeWidth={3.4} color="#fff" />}
                  </span>
                  Sem {i + 1}
                </button>
              );
            })}
          </div>
        )}

        {showIconCoach && (
          <ShoppingCoachTour onClose={() => setShowIconCoach(false)} />
        )}

        {totalCount > 0 && (
          <div style={{ marginBottom: 14 }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                fontSize: 13,
                fontWeight: 800,
                color: "#142f1d",
                marginBottom: 8,
              }}
            >
              <span>
                {doneCount}/{totalCount}
              </span>
              <span style={{ color: "#2d5a3d" }}>{Math.round(progress * 100)}%</span>
            </div>
            <div style={progressTrackStyle}>
              <div style={{ ...progressFillStyle, width: `${progress * 100}%` }} />
            </div>
          </div>
        )}

        <SegmentedControl
          value={viewMode}
          onChange={setViewMode}
          activeDark
          options={[
            { id: "compra", label: "Modo compra", Icon: ShoppingCart },
            { id: "cocina", label: "Modo cocina", Icon: ChefHat },
          ]}
          style={{ marginBottom: 10 }}
        />

        {/* Pending/Comprado only makes sense in Modo compra. In Modo cocina the
            whole recipe stays visible (ticking never hides a line), so the
            filter would be a no-op and is hidden. */}
        {viewMode !== "cocina" && (
          <>
            <div style={toggleDividerStyle} />
            <SegmentedControl
              value={listScope}
              onChange={setListScope}
              options={[
                { id: "pending", label: "Por comprar" },
                { id: "done", label: "Comprado" },
              ]}
              style={{ marginBottom: 12 }}
            />
          </>
        )}
      </div>

      <div
        style={{
          padding: "0 16px",
          paddingBottom: `calc(${bottomNavSpacer()} + 12px)`,
        }}
      >
        {viewMode === "cocina" ? (
          <CookView
            tree={cookTree}
            dates={cookDates}
            scope={listScope}
            hasAnyItems={enrichedItems.length > 0}
            unitView={cookUnitView}
            onUnitView={setCookUnitView}
            onToggleHome={toggleCookHome}
            onTogglePurchased={toggleCookPurchased}
            onAdd={() => setShowAdd(true)}
            focusDish={initialFocusDish}
            onFocusHandled={onFocusDishHandled}
            cookedKeys={cookedKeys}
            onMarkCooked={handleMarkCooked}
            onUndoCooked={handleUndoCooked}
          />
        ) : (
        <>
        {isEmpty && (
          <EmptyList
            onAdd={() => setShowAdd(true)}
            scope={listScope}
            hasPending={hasPendingItems}
            hasDone={hasDoneItems}
          />
        )}

        {freshSections.length > 0 && (
          <MacroHeader
            icon={Apple}
            title="Frescos"
            count={freshSections.reduce((n, s) => n + s.items.length, 0)}
            first
          />
        )}
        {freshSections.map(renderAisleSection)}

        {stapleSections.length > 0 && (
          <MacroHeader
            icon={Package}
            title="Despensa"
            count={stapleSections.reduce((n, s) => n + s.items.length, 0)}
          />
        )}
        {stapleSections.map(renderAisleSection)}

        {pantryItems.length > 0 && (() => {
          const open = Boolean(openSections.__pantry);
          return (
            <div style={{ marginBottom: 10 }}>
              <button
                type="button"
                onClick={() => setOpenSections((c) => ({ ...c, __pantry: !c.__pantry }))}
                style={{
                  ...sectionHeaderStyle,
                  ...sectionLabelCardStyle,
                  borderRadius: open ? "14px 14px 0 0" : 14,
                  borderBottom: open ? "none" : sectionLabelCardStyle.border,
                }}
              >
                <AisleIcon aisle="__pantry" />
                <span
                  style={{
                    flex: 1,
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    minWidth: 0,
                    textAlign: "left",
                  }}
                >
                  {open ? (
                    <ChevronDown size={16} color="#7a8a7f" />
                  ) : (
                    <ChevronRight size={16} color="#7a8a7f" />
                  )}
                  <span
                    style={{
                      fontSize: 15,
                      fontWeight: 800,
                      color: "#142f1d",
                      letterSpacing: "-.2px",
                    }}
                  >
                    Ya en casa
                  </span>
                </span>
                <span
                  style={{
                    fontSize: 14,
                    fontWeight: 800,
                    color: "#7a8a7f",
                    minWidth: 28,
                    textAlign: "right",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {pantryItems.length}
                </span>
              </button>
              {open && (
                <div style={aisleItemsStyle}>
                  {pantryStockView.map((item) => (
                    <ShoppingRow
                      key={`pantry-${item.id}`}
                      item={item}
                      expanded={expandedId === item.id}
                      onToggleRecipes={() =>
                        setExpandedId(expandedId === item.id ? null : item.id)
                      }
                      // "No lo tengo" — the user disagrees with the pantry
                      // match, so drop the stock and let it rejoin the buy list.
                      onUndo={() => rejectPantryMatch(item)}
                      onRemove={() => removeItem(item.id)}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })()}
        </>
        )}
      </div>

      {showAdd && <AddItemModal onClose={() => setShowAdd(false)} onAdd={addItem} />}

      {showCapture && (
        <CaptureSheet
          onClose={() => setShowCapture(false)}
          onScan={() => {
            setShowCapture(false);
            openScan();
          }}
          onManual={() => {
            setShowCapture(false);
            setShowManualSpend(true);
          }}
        />
      )}

      {showManualSpend && (
        <ManualEntryModal
          onClose={() => {
            setShowManualSpend(false);
            setPurchaseChoice(null);
          }}
          onAdd={handleAddManualSpend}
          initialName={purchaseChoice?.name ?? ""}
          initialQty={purchaseChoice ? String(Math.max(1, Math.round(purchaseChoice.qty ?? 1))) : "1"}
          initialUnit={purchaseChoice?.unit ?? "ud"}
        />
      )}

      {purchaseChoice && !showManualSpend && (
        <PurchaseChoiceSheet
          item={purchaseChoice}
          onClose={() => setPurchaseChoice(null)}
          onNoPrice={() => {
            patchItem(purchaseChoice.id, { have: true });
            setPurchaseChoice(null);
          }}
          onManual={() => setShowManualSpend(true)}
          onScan={() => {
            setPurchaseChoice(null);
            openScan();
          }}
        />
      )}

      {receiptWizard && (
        <ReceiptWizard
          detail={receiptWizard.detail}
          initialLines={receiptWizard.lines}
          weekRange={receiptWeek}
          listItems={mergedItems}
          onCancel={() => setReceiptWizard(null)}
          onConfirm={handleReceiptConfirm}
        />
      )}

      {showReceiptDemo && (
        <DemoReceiptSheet
          onClose={() => setShowReceiptDemo(false)}
          onPick={handleDemoTicket}
        />
      )}

      {unlockedDishes && (
        <UnlockedDishesSheet
          dishes={unlockedDishes}
          onClose={() => setUnlockedDishes(null)}
          onGoCook={() => {
            setUnlockedDishes(null);
            // A just-unlocked dish has every ingredient bought/at-home, so it
            // only shows under the "Comprado" filter of the cook tree — force
            // it so "Ir a Modo cocina" actually lands on the dish (H2).
            setListScope("done");
            setViewMode("cocina");
          }}
        />
      )}

      <BottomNav active="shopping" onNav={onNav} />
    </div>
  );
}

// Cook mode: plan-oriented tree (day → meal → dish). Each dish is collapsed by
// default (just its miniatura + name) so the view doesn't saturate; tapping it
// reveals only its ingredient table, styled like the recipe detail (double
// column: kitchen-friendly "por unidad" hint | exact "por peso"), with a
// "lo tengo en casa" tickbox. Checking toggles the SAME aggregated line the
// shopping view edits, so the two views never disagree.
function CookView({
  tree,
  dates,
  scope,
  hasAnyItems,
  unitView,
  onUnitView,
  onToggleHome,
  onTogglePurchased,
  onAdd,
  focusDish = null,
  onFocusHandled = null,
  cookedKeys = null,
  onMarkCooked = null,
  onUndoCooked = null,
}) {
  if (tree.days.length === 0 && tree.extras.length === 0) {
    // Empty can mean three things now that the filter applies here too.
    const msg = !hasAnyItems
      ? "Genera un menú para ver qué cocinas cada día"
      : scope === "done"
        ? "Aún no has marcado nada como comprado"
        : "¡Nada por comprar! Ya tienes todo para cocinar";
    return (
      <div style={{ padding: "48px 0", textAlign: "center" }}>
        <p style={{ fontSize: 14, fontWeight: 600, color: "#7a8a7f", margin: "0 0 16px" }}>
          {msg}
        </p>
        {!hasAnyItems && (
          <button type="button" onClick={onAdd} style={primaryBtnStyle}>
            Añadir
          </button>
        )}
      </div>
    );
  }
  return (
    <div>
      {tree.days.map((d) => (
        <div key={d.day} style={{ marginBottom: 18 }}>
          <CookDayStripe day={d.day} dayNumber={calendarDayNumber(d.day, dates)} />
          {d.meals.map((m) => (
            <div key={m.meal} style={{ marginTop: 10 }}>
              <div style={cookMealHeaderStyle}>
                <MealBadge meal={m.meal} />
                <span>{m.meal}</span>
              </div>
              {m.recipes.map((r) => (
                <CookDish
                  key={r.recipeName}
                  recipeName={r.recipeName}
                  recipeId={r.recipeId}
                  ingredients={r.ingredients}
                  unitView={unitView}
                  onUnitView={onUnitView}
                  onToggleHome={onToggleHome}
                  onTogglePurchased={onTogglePurchased}
                  autoOpen={Boolean(
                    focusDish &&
                      focusDish.day === d.day &&
                      focusDish.meal === m.meal &&
                      focusDish.recipeId === r.recipeId,
                  )}
                  onAutoOpened={onFocusHandled}
                  isCooked={cookedKeys?.has(`${d.day}::${m.meal}::${r.recipeId ?? r.recipeName}`) ?? false}
                  onMarkCooked={onMarkCooked ? () => onMarkCooked(d.day, m.meal, r.recipeId, r.recipeName, r.ingredients) : null}
                  onUndoCooked={onUndoCooked ? () => onUndoCooked(d.day, m.meal, r.recipeId, r.recipeName) : null}
                />
              ))}
            </div>
          ))}
        </div>
      ))}
      {tree.extras.length > 0 && (
        <div style={{ marginBottom: 18 }}>
          <CookDayStripe day="Manual" label="Añadidos a mano" />
          <div style={{ marginTop: 10 }}>
            <div style={cookUnitToggleRowStyle}>
              <CookUnitToggle unitView={unitView} onUnitView={onUnitView} />
            </div>
            <div style={{ display: "grid", gap: 7 }}>
              {tree.extras.map((ing) => (
                <CookIngredientRow
                  key={ing.id}
                  ing={ing}
                  unitView={unitView}
                  onToggleHome={onToggleHome}
                  onTogglePurchased={onTogglePurchased}
                />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Same day stripe as Tu menú (DaySectionHeader): slate bar, left accent, day
// name in caps + the calendar day number on the right.
function CookDayStripe({ day, dayNumber, label }) {
  return (
    <div style={cookDayStripeStyle}>
      <span style={cookDayStripeLabelStyle}>{label ?? DAY_FULL[day] ?? day}</span>
      {dayNumber != null && <span style={cookDayStripeNumStyle}>{dayNumber}</span>}
    </div>
  );
}

function CookDish({
  recipeName,
  recipeId,
  ingredients,
  unitView,
  onUnitView,
  onToggleHome,
  onTogglePurchased,
  // Deep link from the Menú screen's availability dot: expand + scroll here
  // once, then tell the parent so the one-shot signal gets cleared.
  autoOpen = false,
  onAutoOpened = null,
  isCooked = false,
  onMarkCooked = null,
  onUndoCooked = null,
}) {
  const [open, setOpen] = useState(false);
  const cardRef = useRef(null);
  useEffect(() => {
    if (!autoOpen) return;
    setOpen(true);
    const t = setTimeout(() => {
      cardRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 80);
    onAutoOpened?.();
    return () => clearTimeout(t);
    // Fires once per deep link — `autoOpen` flips true→false as soon as the
    // parent clears its one-shot focus state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoOpen]);
  // Resolve by id first (reliable, same photo as Tu menú); fall back to name for
  // legacy shopping lists whose sources predate recipeId.
  const recipe = (recipeId && RECIPES_BY_ID[recipeId]) || recipeByName(recipeName);
  const doneCount = ingredients.filter((i) => i.have || i.atHome || i.fromPantry).length;
  return (
    <div ref={cardRef} style={cookDishCardStyle}>
      <button type="button" onClick={() => setOpen((o) => !o)} style={cookDishHeaderStyle}>
        <DishTile recipe={recipe} name={recipeName} />
        <span style={cookDishNameStyle}>{recipeName}</span>
        <span style={cookDishCountStyle}>
          {doneCount}/{ingredients.length}
        </span>
        <ChevronDown
          size={17}
          color="#7a8a7f"
          strokeWidth={2.4}
          style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform .2s ease", flexShrink: 0 }}
        />
      </button>
      {open && (
        <div style={{ padding: "0 10px 10px" }}>
          {/* Peso/uds switch sits right above this dish's quantity column, so it's
              always reachable without scrolling back to the top of the screen. */}
          <div style={cookUnitToggleRowStyle}>
            <CookUnitToggle unitView={unitView} onUnitView={onUnitView} />
          </div>
          <div style={{ display: "grid", gap: 7 }}>
            {ingredients.map((ing) => (
              <CookIngredientRow
                key={ing.id}
                ing={ing}
                unitView={unitView}
                onToggleHome={onToggleHome}
                onTogglePurchased={onTogglePurchased}
              />
            ))}
          </div>
          {(onMarkCooked || onUndoCooked) && (
            <button
              type="button"
              onClick={isCooked ? onUndoCooked ?? undefined : onMarkCooked ?? undefined}
              disabled={isCooked ? !onUndoCooked : !onMarkCooked}
              title={
                isCooked
                  ? "Deshacer: devuelve estos ingredientes a lo que tienes en casa"
                  : "Descuenta estos ingredientes de lo que tienes en casa"
              }
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 7,
                width: "100%",
                marginTop: 10,
                padding: "9px 12px",
                borderRadius: 11,
                border: isCooked ? "1.5px solid #bcdcc7" : "1.5px solid #2d5a3d",
                background: isCooked ? "#eaf3ec" : "#fff",
                color: "#2d5a3d",
                fontSize: 12.5,
                fontWeight: 800,
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              {isCooked ? <Undo2 size={14} strokeWidth={2.6} /> : <ChefHat size={14} strokeWidth={2.4} />}
              {isCooked ? "Deshacer cocinado" : "Marcar cocinado"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// Compact icon switch (Peso ⇄ Unidades) placed above each dish's quantity
// column. Two tiny icon buttons; the active one is filled green.
function CookUnitToggle({ unitView, onUnitView }) {
  const opts = [
    { id: "peso", Icon: Scale, label: "Peso" },
    { id: "uds", Icon: Hash, label: "Unidades" },
  ];
  return (
    <div style={cookUnitToggleStyle}>
      {opts.map(({ id, Icon, label }) => {
        const sel = unitView === id;
        return (
          <button
            key={id}
            type="button"
            onClick={() => onUnitView(id)}
            aria-label={label}
            title={label}
            aria-pressed={sel}
            style={{ ...cookUnitToggleBtnStyle, ...(sel ? cookUnitToggleBtnOnStyle : {}) }}
          >
            <Icon size={13} strokeWidth={2.6} />
          </button>
        );
      })}
    </div>
  );
}

function DishTile({ recipe, name, size = 40 }) {
  const [failed, setFailed] = useState(false);
  const visual = visualForRecipe(recipe);
  const Icon = ICONS_BY_TYPE[recipe?.iconType] ?? Utensils;
  const radius = Math.round(size * 0.3);
  const imageUrl = recipe ? dishImageForRecipe(recipe) : null;

  if (imageUrl && !failed) {
    return (
      <img
        src={imageUrl}
        alt={name}
        width={size}
        height={size}
        loading="lazy"
        onError={() => setFailed(true)}
        style={{ width: size, height: size, borderRadius: radius, objectFit: "cover", flexShrink: 0, background: visual.surface }}
      />
    );
  }
  return (
    <span
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        color: "#fff",
        background: visual.accent,
        flexShrink: 0,
      }}
    >
      <Icon size={Math.round(size * 0.48)} strokeWidth={2.2} />
    </span>
  );
}

function CookIngredientRow({ ing, unitView, onToggleHome, onTogglePurchased }) {
  const atHome = Boolean(ing.atHome || ing.fromPantry);
  const have = Boolean(ing.have);
  const done = atHome || have;
  // "Peso" shows the exact amount; "Unidades" shows the compact buy-oriented
  // reading (whole pieces / litres) and falls back to the exact amount when
  // there's no sensible mapping.
  const unitsLabel = shoppingUnitsLabel(ing.name, ing.qty, ing.unit);
  const showUds = unitView === "uds";
  const qtyLabel = showUds ? unitsLabel || ing.displayQty : ing.displayQty;
  return (
    <div style={{ ...cookIngRowStyle, opacity: done ? 0.6 : 1 }}>
      {done && (
        <span
          aria-hidden
          style={{
            width: 18,
            height: 18,
            borderRadius: 999,
            flexShrink: 0,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            background: "#2d5a3d",
          }}
        >
          <Check size={12} strokeWidth={3.2} color="#fff" />
        </span>
      )}
      <span
        style={{
          flex: 1,
          minWidth: 0,
          fontWeight: 700,
          color: "#15331c",
          // Full ingredient name, wrapping to multiple lines when needed.
          whiteSpace: "normal",
          overflowWrap: "anywhere",
          lineHeight: 1.25,
        }}
      >
        {ing.name}
      </span>
      <strong style={showUds ? cookIngQtyUdsStyle : cookIngQtyStyle}>{qtyLabel}</strong>
      {ing.fromPantry ? (
        // Already stocked ("Ya en casa"): a read-only indicator, no "Comprado"
        // action — you don't buy what you already have (matches Modo compra,
        // which hides "Comprado" on pantry rows for the same reason).
        <ActionBtn icon={Refrigerator} label="Ya en casa" active readOnly />
      ) : (
        <>
          <ActionBtn
            icon={Refrigerator}
            label={atHome ? "Quitar de 'en casa'" : "Lo tengo en casa"}
            active={atHome}
            onClick={() => onToggleHome(ing.id, !atHome)}
          />
          <ActionBtn
            icon={Check}
            label={have ? "Marcar como no comprado" : "Comprado"}
            active={have}
            onClick={() => onTogglePurchased(ing.id, !have)}
          />
        </>
      )}
    </div>
  );
}

function AisleIcon({ aisle, size = 36 }) {
  const meta = AISLE_UI[aisle] ?? { Icon: Package, color: "#64748b" };
  const Icon = meta.Icon;
  return (
    <span
      style={{
        width: size,
        height: size,
        borderRadius: 11,
        background: meta.color,
        color: "#fff",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}
    >
      <Icon size={size * 0.48} strokeWidth={2.2} />
    </span>
  );
}

function QtyInput({ item, onSave, onCancel }) {
  const [val, setVal] = useState(String(item.qty ?? 1));
  const inputRef = useRef(null);

  useEffect(() => {
    inputRef.current?.select();
  }, []);

  const commit = () => onSave(val);

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 3, justifyContent: "flex-end" }}>
      <input
        ref={inputRef}
        type="number"
        inputMode="decimal"
        min="0"
        step="any"
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.preventDefault(); commit(); }
          if (e.key === "Escape") { e.preventDefault(); onCancel(); }
        }}
        style={{
          width: "3.4rem",
          textAlign: "right",
          border: "1.5px solid #2d5a3d",
          borderRadius: 7,
          padding: "3px 5px",
          fontSize: 16,
          fontWeight: 800,
          fontVariantNumeric: "tabular-nums",
          fontFamily: "inherit",
          color: "#142f1d",
          background: "#fff",
          outline: "none",
        }}
      />
      <span style={{ fontSize: 11, fontWeight: 700, color: "#64748b", flexShrink: 0 }}>
        {item.unit !== "ud" ? item.unit : "uds"}
      </span>
    </div>
  );
}

function ShoppingRow({
  item,
  unitView = "peso",
  doneView,
  expanded,
  isEditingQty,
  onToggleRecipes,
  onEditQty,
  onSaveQty,
  onCancelQty,
  onAtHome,
  onPurchased,
  onUndo,
  onRemove,
}) {
  const qty = item.displayQty ?? formatDisplay(item.qty ?? 0, item.unit ?? "ud");
  // Compact, buy-oriented reading (whole pieces / litres) for the "uds" lens.
  const unitsLabel = shoppingUnitsLabel(item.name, item.qty, item.unit);
  // The peso/uds toggle flips the qty pill: exact weight vs. buyable units.
  const showUds = unitView === "uds" && Boolean(unitsLabel);
  const qtyText = showUds ? unitsLabel : qty;
  // Pantry-matched rows are always struck through (the whole "Despensa"
  // section is inherently "done"), independent of the doneView convention
  // used elsewhere, which only dims within the mixed "all" scope.
  const dimmed = item.fromPantry || (!doneView && (item.have || item.atHome));
  // Merged Despensa lines spanning several weeks have no single editable qty.
  const canEditQty = !item.fromPantry && !dimmed && !item.__qtyLocked;

  return (
    <div
      style={{
        borderBottom: "1px solid #dde8e1",
        opacity: dimmed ? 0.45 : 1,
        padding: "10px 4px 10px 4px",
      }}
    >
      <div style={rowGridStyle}>
        <div style={{ minWidth: 0 }}>
          <span
            style={{
              display: "block",
              fontSize: 13.5,
              fontWeight: 700,
              color: "#142f1d",
              textDecoration: dimmed ? "line-through" : "none",
              lineHeight: 1.2,
              // Read the full name — wrap to as many lines as needed rather than
              // truncating (the name is the most important part of the row).
              whiteSpace: "normal",
              overflowWrap: "anywhere",
            }}
          >
            {item.name}
          </span>
          {item.__weekLabel && (
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                fontSize: 10,
                fontWeight: 800,
                color: "#2d5a3d",
                background: "#eef4ef",
                border: "1px solid #d7e6dc",
                borderRadius: 999,
                padding: "1px 7px",
                marginTop: 2,
              }}
            >
              {item.__weekLabel}
            </span>
          )}
          {item.adapted && (
            <span
              title="Adaptado por una intolerancia — asegúrate de comprar este producto y no el habitual"
              style={{
                display: "flex", alignItems: "center", gap: 3,
                fontSize: 10, fontWeight: 800, color: "#2f9e52",
                marginTop: 1,
              }}
            >
              <Leaf size={11} strokeWidth={2.6} />
              Adaptado
            </span>
          )}
        </div>
        {isEditingQty ? (
          <QtyInput item={item} onSave={onSaveQty} onCancel={onCancelQty} />
        ) : (
          <button
            type="button"
            onClick={canEditQty && !showUds ? onEditQty : undefined}
            style={{
              ...qtyColStyle,
              background: "transparent",
              border: canEditQty && !showUds ? "1px dashed #c0cfc5" : "none",
              borderRadius: 6,
              cursor: canEditQty && !showUds ? "pointer" : "default",
              padding: "2px 4px",
              fontFamily: "inherit",
              // In "uds" the label can be two words ("1 calabacín") — let it wrap
              // instead of truncating in the narrow column.
              ...(showUds ? { whiteSpace: "normal", fontSize: 12, lineHeight: 1.15 } : null),
            }}
            title={canEditQty && !showUds ? "Tocar para editar cantidad" : undefined}
          >
            {qtyText}
          </button>
        )}
        <div style={actionsColStyle}>
          {item.fromPantry ? (
            // No purchase-status badge here — being in the pantry already
            // means "I'm not buying this", so "Comprado"/"En casa" would be
            // redundant. Just the two actions that actually apply.
            <>
              <ActionBtn icon={ShoppingCart} label="No lo tengo" onClick={onUndo} />
              {item.recipeCount > 0 && (
                <ActionBtn
                  icon={BookOpen}
                  label="Recetas"
                  onClick={onToggleRecipes}
                  active={expanded}
                />
              )}
              <ActionBtn icon={Trash2} label="Quitar" onClick={onRemove} muted />
            </>
          ) : doneView ? (
            <>
              {item.atHome ? (
                <ActionBtn icon={Refrigerator} label="En casa" active readOnly />
              ) : (
                <ActionBtn icon={Check} label="Comprado" active readOnly />
              )}
              <ActionBtn icon={Undo2} label="Deshacer" onClick={onUndo} />
              {item.recipeCount > 0 && (
                <ActionBtn
                  icon={BookOpen}
                  label="Recetas"
                  onClick={onToggleRecipes}
                  active={expanded}
                />
              )}
            </>
          ) : (
            <>
              <ActionBtn icon={Refrigerator} label="En casa" onClick={onAtHome} active={item.atHome} coach="shop-athome" />
              <ActionBtn icon={Check} label="Comprado" onClick={onPurchased} active={item.have} coach="shop-purchased" />
              {item.recipeCount > 0 && (
                <ActionBtn
                  icon={BookOpen}
                  label="Recetas"
                  onClick={onToggleRecipes}
                  active={expanded}
                  coach="shop-recipes"
                />
              )}
              <ActionBtn icon={Trash2} label="Quitar" onClick={onRemove} muted coach="shop-remove" />
            </>
          )}
        </div>
      </div>

      {expanded && item.recipeUsage?.length > 0 && (
        <div style={{ paddingTop: 8 }}>
          {item.recipeUsage
            .flatMap((recipe) =>
              recipe.slots.map((slot) => ({ ...slot, recipeName: recipe.recipeName }))
            )
            .sort((a, b) => a.sort - b.sort)
            .map((slot, idx) => (
              <div
                key={`${slot.day}-${slot.meal}-${slot.recipeName}-${idx}`}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "7px 0",
                  borderTop: idx === 0 ? "none" : "1px solid #eef2ef",
                  minHeight: 32,
                }}
              >
                <DayBadge day={slot.day} />
                <MealBadge meal={slot.meal} />
                <span
                  style={{
                    flex: 1,
                    minWidth: 0,
                    fontSize: 13,
                    fontWeight: 700,
                    color: "#142f1d",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {slot.recipeName}
                </span>
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 800,
                    color: "#64748b",
                    flexShrink: 0,
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {slot.displayQty}
                </span>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}

function DayBadge({ day }) {
  return (
    <span
      style={{
        width: 26,
        height: 26,
        borderRadius: 8,
        background: "#64748b",
        color: "#fff",
        fontSize: 12,
        fontWeight: 900,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
        lineHeight: 1,
      }}
    >
      {DAY_LETTERS[day] ?? "?"}
    </span>
  );
}

function MealBadge({ meal }) {
  const meta = MEAL_BADGE[meal] ?? { Icon: Sun, color: "#64748b" };
  const Icon = meta.Icon;
  return (
    <span
      style={{
        width: 26,
        height: 26,
        borderRadius: 8,
        background: meta.color,
        color: "#fff",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}
    >
      <Icon size={13} strokeWidth={2.4} />
    </span>
  );
}

function MacroHeader({ icon: Icon, title, subtitle, count, first }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        margin: first ? "2px 2px 10px" : "22px 2px 10px",
      }}
    >
      <span
        style={{
          width: 34,
          height: 34,
          borderRadius: 10,
          background: "#e8f0ea",
          color: "#2d5a3d",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <Icon size={18} strokeWidth={2.4} />
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 15,
            fontWeight: 900,
            color: "#142f1d",
            letterSpacing: "-.3px",
            lineHeight: 1.1,
          }}
        >
          {title}
        </div>
        {subtitle && (
          <div style={{ fontSize: 11.5, fontWeight: 700, color: "#7a8a7f", marginTop: 1 }}>
            {subtitle}
          </div>
        )}
      </div>
      {typeof count === "number" && count > 0 && (
        <span
          style={{
            fontSize: 12,
            fontWeight: 900,
            color: "#2d5a3d",
            background: "#eef4ef",
            border: "1px solid #d7e6dc",
            borderRadius: 999,
            padding: "3px 9px",
            fontVariantNumeric: "tabular-nums",
            flexShrink: 0,
          }}
        >
          {count}
        </span>
      )}
    </div>
  );
}

function ActionBtn({ icon: Icon, label, onClick, active, muted, readOnly, coach }) {
  const style = {
    width: 32,
    height: 32,
    borderRadius: 9,
    border: `1px solid ${active ? "#2d5a3d" : "#e0eae3"}`,
    background: active ? "#eef4ef" : "#fff",
    color: muted ? "#b0bab4" : "#3d5245",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: readOnly ? "default" : "pointer",
    fontFamily: "inherit",
    flexShrink: 0,
    padding: 0,
  };

  if (readOnly) {
    return (
      <span aria-label={label} title={label} style={style}>
        <Icon size={15} strokeWidth={2.2} />
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      data-coach={coach}
      style={style}
    >
      <Icon size={15} strokeWidth={2.2} />
    </button>
  );
}

// Unified spend-capture chooser: one sheet, two ways in — scan a receipt (marks
// bought + saves prices) or add a gasto by hand. Same wizard shell/cards as
// onboarding's big decision moments, so every "choose one of these paths"
// popup in the app reads the same.
function CaptureSheet({ onClose, onScan, onManual }) {
  return (
    <WizardSheet icon={Wallet} iconColor="#2d5a3d" title="Registrar gasto" onClose={onClose}>
      <div style={{ display: "grid", gap: 10 }}>
        <WizardOptionCard
          icon={Receipt}
          iconColor="#fff"
          iconBg="#2d5a3d"
          title="Escanear ticket"
          subtitle="Marca como comprado lo que coincida"
          onClick={onScan}
        />
        <WizardOptionCard
          icon={Plus}
          iconColor="#fff"
          iconBg="#e07b39"
          title="Añadir a mano"
          subtitle="Un producto y su precio"
          onClick={onManual}
        />
      </div>
    </WizardSheet>
  );
}

// DEV-only: choose one of the synthetic demo tickets to run through the receipt
// wizard without a photo. Never rendered in production (gated by openScan).
function DemoReceiptSheet({ onClose, onPick }) {
  return (
    <WizardSheet
      icon={Receipt}
      iconColor="#2d5a3d"
      title="Ticket de demo"
      subtitle="Solo en local · elige uno para probar el flujo"
      onClose={onClose}
    >
      <div style={{ display: "grid", gap: 10 }}>
        {RECEIPT_FIXTURES.map((f) => (
          <WizardOptionCard
            key={f.id}
            icon={Receipt}
            iconColor="#fff"
            iconBg="#2d5a3d"
            title={f.label}
            subtitle={f.hint}
            onClick={() => onPick(f)}
          />
        ))}
      </div>
    </WizardSheet>
  );
}

// Shown right after confirming a ticket when it left one or more dishes fully
// covered (every ingredient checked/pantried) — a small payoff moment instead
// of just a toast, with a shortcut into Modo cocina to start cooking.
function UnlockedDishesSheet({ dishes, onClose, onGoCook }) {
  const one = dishes.length === 1;
  return (
    <WizardSheet
      icon={ChefHat}
      iconColor="#2d5a3d"
      title={one ? "¡Ya puedes cocinar!" : `¡Ya puedes cocinar ${dishes.length} platos!`}
      subtitle={one ? "Este ticket completó todos los ingredientes" : "Este ticket completó sus ingredientes"}
      onClose={onClose}
    >
      <div style={{ display: "grid", gap: 8, marginBottom: 16 }}>
        {dishes.map((d) => (
          <div
            key={`${d.day}::${d.meal}::${d.recipeName}`}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "10px 12px",
              borderRadius: 12,
              background: "#fff",
              border: "1px solid #e2ede5",
            }}
          >
            <span
              style={{
                width: 30,
                height: 30,
                borderRadius: 9,
                background: "#eaf3ec",
                color: "#2d5a3d",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <ChefHat size={15} strokeWidth={2.3} />
            </span>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: "#142f1d" }}>{d.recipeName}</div>
              <div style={{ fontSize: 11.5, fontWeight: 600, color: "#7a8a7f" }}>
                {DAY_FULL[d.day] ?? d.day} · {d.meal}
              </div>
            </div>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 10 }}>
        <button type="button" onClick={onClose} style={{ ...wizNextBtnStyle, flex: 1, background: "#fff", color: "#2d5a3d", border: "1.5px solid #2d5a3d" }}>
          Cerrar
        </button>
        <button type="button" onClick={onGoCook} style={{ ...wizNextBtnStyle, flex: 1 }}>
          Ir a Modo cocina
        </button>
      </div>
    </WizardSheet>
  );
}

// Row-level "Comprado" tap: three ways to close the loop on one ingredient —
// just mark it, log what it cost, or point at the ticket that covers it (and
// probably others too, which the ticket review screen already handles).
function PurchaseChoiceSheet({ item, onClose, onNoPrice, onManual, onScan }) {
  return (
    <WizardSheet
      icon={Check}
      iconColor="#2d5a3d"
      title="Marcar como comprado"
      subtitle={item?.name}
      onClose={onClose}
    >
      <div style={{ display: "grid", gap: 10 }}>
        <WizardOptionCard
          icon={Check}
          iconColor="#fff"
          iconBg="#2d5a3d"
          title="Sin precio"
          subtitle="Solo marcar comprado"
          onClick={onNoPrice}
        />
        <WizardOptionCard
          icon={Wallet}
          iconColor="#fff"
          iconBg="#e07b39"
          title="Añadir gasto"
          subtitle="Marca comprado y registra el precio"
          onClick={onManual}
        />
        <WizardOptionCard
          icon={Receipt}
          iconColor="#fff"
          iconBg="#2d5a3d"
          title="Escanear ticket"
          subtitle="Si compraste esto junto a más cosas"
          onClick={onScan}
        />
      </div>
    </WizardSheet>
  );
}

// ── Receipt clarifying-questions wizard ──────────────────────────────────
// One WizardSheet-styled pop-up that walks through every question we need to be
// sure we read the uploaded ticket correctly before applying it:
//   1. Fecha    — does the ticket belong to the shopping week? (correctable)
//   2. Súper    — which store was it? (confirm/edit)
//   3. Productos — clarify the lines we couldn't confidently identify
//   4. Coincidencias — which of your list ingredients this ticket covers (→ tach)
// The "Productos" step is skipped when every food line was matched with high
// confidence. Confirming on the last step calls onConfirm({ store, date, lines }).
function ReceiptWizard({ detail, initialLines, weekRange, listItems, onCancel, onConfirm }) {
  // Store picker mirrors "Añadir gasto"'s: a known chain (with logo/monogram)
  // or "__other" + free text for local shops. The ticket's OCR'd store name
  // seeds whichever of the two applies.
  const detectedStore = (detail.store ?? "").trim();
  const knownStore = SUPERMARKETS.find((s) => s.toLowerCase() === detectedStore.toLowerCase());
  const [storeSel, setStoreSel] = useState(knownStore ?? (detectedStore ? "__other" : ""));
  const [storeOther, setStoreOther] = useState(knownStore ? "" : detectedStore);
  const store = storeSel === "__other" ? storeOther : storeSel;
  const [date, setDate] = useState(detail.date ?? new Date().toISOString().slice(0, 10));
  const [lines, setLines] = useState(initialLines);
  const [step, setStep] = useState(0);
  // "Aclara productos" is answered one line at a time (select-a-candidate),
  // advancing through the unclear lines.
  const [prodStep, setProdStep] = useState(0);
  // Peso ⇄ Unidades lens for the review step's quantity column — converts
  // the ticket's own qty to a piece count when possible.
  const [unitView, setUnitView] = useState("peso");

  const setLine = (i, patch) =>
    setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  // Lines we're not confident about (excluding clearly-flagged prefab meals):
  // these are the ones worth asking the user to confirm/rename. Derived from the
  // ORIGINAL parse so the set (and hence the step list) stays stable while the
  // user edits or excludes lines — excluded ones just render dimmed.
  const unclearIdx = initialLines
    .map((l, i) => ({ l, i }))
    .filter(({ l }) => l.kind !== "prefab" && classifyConfidence(l.confidence) !== "auto")
    .map(({ i }) => i);

  // Always 4 fixed steps — fecha → súper → productos → cantidades y precios —
  // regardless of whether anything needs clarifying in "productos" (that step
  // just shows a "todo identificado" confirmation instead of the picker then).
  const steps = ["fecha", "super", "productos", "coincidencias"];
  const stepId = steps[Math.min(step, steps.length - 1)];
  const isLast = step >= steps.length - 1;

  const included = lines.filter((l) => l.include);
  // Lines the user explicitly flagged "no está en mi lista" in step 3 never go
  // through matching — they head straight to Despensa — so the fuzzy matcher
  // can't override that decision (H1). Everything else is matchable.
  const matchable = included.filter((l) => !l.pantry);
  // Each match ({ id, name, receiptLine }) enriched with the ticket line it came
  // from, so the review card can show price, quantity and the raw ticket text
  // (which carries the brand/sub-brand when the ticket printed one).
  const rawMatches = matchReceiptProducts(matchable.map((l) => l.name), listItems);
  const itemById = new Map(listItems.map((it) => [it.id, it]));
  const usedLineIdx = new Set();
  const matches = rawMatches.map((m) => {
    let lineIdx = -1;
    for (let k = 0; k < lines.length; k++) {
      if (!usedLineIdx.has(k) && lines[k].include && !lines[k].pantry && lines[k].name === m.receiptLine) {
        lineIdx = k;
        break;
      }
    }
    if (lineIdx >= 0) usedLineIdx.add(lineIdx);
    const l = lineIdx >= 0 ? lines[lineIdx] : null;
    // What the shopping list needs for this item — kept on the match object
    // for potential future use, but deliberately not rendered in the review
    // row: it doesn't reliably line up with what the ticket printed, and
    // showing a "wrong" expectation next to the real ticket qty read as more
    // confusing than helpful. Follows the same peso/uds lens as the
    // ticket-side qty column.
    const li = itemById.get(m.id);
    let neededLabel = null;
    if (li) {
      const exact = li.displayQty ?? formatDisplay(li.qty ?? 0, li.unit ?? "ud");
      neededLabel = unitView === "uds" ? shoppingUnitsLabel(li.name, li.qty, li.unit) || exact : exact;
    }
    return {
      ...m,
      lineIdx,
      price: l?.price ?? 0,
      qty: l?.qty,
      unit: l?.unit,
      raw: l?.raw ?? m.receiptLine,
      neededLabel,
    };
  });
  // Which item this ticket line is (and whether it's on the list at all) was
  // already decided in "Aclara productos" — this step only validates qty/
  // price, so every match tachs; discarding a line (below) is the only way
  // to drop one, and it removes it from both taching and the saved gasto.
  const tachIds = matches.map((m) => m.id);

  // Every included ticket line ends up here — matched to a list item (with
  // "Tu lista pide") or not (still reviewable/saveable as gasto). Keeps the
  // review step's row count exactly equal to the number of ticket lines
  // carried over from "Aclara productos" — no line disappears silently
  // between steps 3 and 4.
  const matchByLineIdx = new Map(matches.filter((m) => m.lineIdx >= 0).map((m) => [m.lineIdx, m]));
  const reviewRows = lines
    .map((l, idx) => ({ l, idx }))
    .filter(({ l }) => l.include)
    .map(({ l, idx }) => ({ lineIdx: idx, line: l, match: matchByLineIdx.get(idx) ?? null }));
  // Lines kept but matched to nothing on the list — these go straight to
  // "Despensa" on confirm instead of just vanishing after being reviewed.
  // Two guards keep Despensa clean: skip anything whose name already exists on
  // the list as bought/at-home (it's a known ingredient, not a new staple —
  // M5), and de-duplicate repeated ticket lines by normalized name (M4).
  const satisfiedNames = new Set(
    listItems.filter((it) => it.have || it.atHome || it.fromPantry).map((it) => normalizeName(it.name)),
  );
  const pantryEntries = (() => {
    const seen = new Set();
    const out = [];
    for (const { line } of reviewRows.filter(({ match }) => !match)) {
      const key = normalizeName(line.name);
      if (!key || seen.has(key) || satisfiedNames.has(key)) continue;
      seen.add(key);
      // Ticket units → despensa's canonical g/ml/ud domain (kg→g, l→ml) so
      // the stock this creates can later be subtracted by a cooked recipe.
      const unit = line.unit === "kg" || line.unit === "g" ? "g" : line.unit === "l" || line.unit === "ml" ? "ml" : "ud";
      const rawQty = Number(line.qty) > 0 ? Number(line.qty) : 1;
      const qty = line.unit === "kg" || line.unit === "l" ? rawQty * 1000 : rawQty;
      out.push({ name: line.name, qty, unit });
    }
    return out;
  })();

  // Ticket-side qty under the Peso ⇄ Unidades lens. Bidirectional so the
  // toggle actually changes what you see:
  //   - uds: weight → piece count (when the product is piece-countable)
  //          ml/l → litres when bottle-sized
  //   - peso: ud → grams (when piece-countable), otherwise the raw weight/vol
  // Returns null when no conversion applies — caller shows the raw qty/unit.
  const ticketQtyView = (name, qty, unit) => {
    if (qty == null || !(Number(qty) > 0)) return null;
    const u = String(unit ?? "ud").toLowerCase();
    const pieceG = gramsPerPiece(name);

    if (unitView === "uds") {
      if (pieceG && (u === "g" || u === "kg")) {
        const grams = u === "kg" ? qty * 1000 : qty;
        return { value: Math.max(1, Math.round(grams / pieceG)), label: "uds", mode: "pieces", pieceG, storeUnit: u };
      }
      if (u === "ml" || u === "l") {
        const ml = u === "l" ? qty * 1000 : qty;
        if (ml >= 100) {
          const liters = ml / 1000;
          const value = Number.isInteger(liters) ? liters : Math.round(liters * 100) / 100;
          return { value, label: "L", mode: "liters", storeUnit: u };
        }
      }
      return null;
    }

    // peso
    if (pieceG && (u === "ud" || u === "uds" || u === "u" || u === "unidad" || u === "unidades")) {
      return { value: Math.round(qty * pieceG), label: "g", mode: "fromPieces", pieceG };
    }
    return null;
  };

  const STEP_META = {
    fecha: { title: "Fecha del ticket", subtitle: "¿A qué compra corresponde?" },
    super: { title: "Supermercado", subtitle: "¿Dónde fue esta compra?" },
    productos: { title: "Aclara estos productos", subtitle: "No los identificamos con seguridad" },
    coincidencias: { title: "Repasa y confirma", subtitle: "Revisa precio y cantidad, y descarta lo que no cuadre" },
  };
  const meta = STEP_META[stepId];

  const next = () =>
    isLast ? onConfirm({ store, date, lines, tachIds, pantryEntries }) : setStep((s) => s + 1);

  return (
    <WizardSheet icon={Receipt} title={meta.title} subtitle={meta.subtitle} onClose={onCancel}>
      <div style={{ marginBottom: 16 }}>
        <ProgressDots current={step} total={steps.length} onJump={(i) => setStep(i)} compact />
      </div>

      {stepId === "fecha" && (
        <div style={wizCardStyle}>
          <div style={wizFieldLabelStyle}>Fecha detectada</div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Calendar size={18} color="#2d5a3d" strokeWidth={2.2} />
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              style={{ ...wizInputStyle, flex: 1 }}
            />
          </div>
          {weekRange.label && (
            <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid #e2ede5" }}>
              <div style={wizFieldLabelStyle}>Semana de compra</div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <CalendarDays size={18} color="#2d5a3d" strokeWidth={2.2} />
                <div style={{ ...wizInputStyle, flex: 1 }}>{weekRange.label}</div>
              </div>
            </div>
          )}
        </div>
      )}

      {stepId === "super" && (
        <StorePicker
          value={storeSel}
          otherValue={storeOther}
          onChange={setStoreSel}
          onOtherChange={setStoreOther}
        />
      )}

      {stepId === "productos" && (() => {
        const total = unclearIdx.length;
        if (total === 0) {
          return (
            <div style={{ ...wizCardStyle, display: "flex", alignItems: "center", gap: 10 }}>
              <span
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 999,
                  background: "#eef4ef",
                  color: "#2d5a3d",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <Check size={15} strokeWidth={2.8} />
              </span>
              <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: "#3d5245" }}>
                Identificamos todos los productos del ticket con seguridad. Nada que aclarar.
              </p>
            </div>
          );
        }
        const pIdx = Math.min(prodStep, total - 1);
        const i = unclearIdx[pIdx];
        const l = lines[i];
        const activeListItems = listItems.filter((it) => !it.have && !it.atHome);
        const candidates = receiptLineCandidates([l.raw, l.name], activeListItems, 3);
        const chosenKey = normalizeName(l.name);
        const advanceProd = () => setProdStep((s) => Math.min(s + 1, total - 1));
        return (
          <div style={{ display: "grid", gap: 12 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <button
                type="button"
                aria-label="Producto anterior"
                disabled={pIdx === 0}
                onClick={() => setProdStep((s) => Math.max(0, s - 1))}
                style={prodNavBtnStyle(pIdx === 0)}
              >
                <ChevronLeft size={16} strokeWidth={2.6} />
              </button>
              <span style={{ fontSize: 12, fontWeight: 800, color: "#4f6a5a" }}>
                Producto {pIdx + 1} de {total}
              </span>
              <button
                type="button"
                aria-label="Producto siguiente"
                disabled={pIdx === total - 1}
                onClick={advanceProd}
                style={prodNavBtnStyle(pIdx === total - 1)}
              >
                <ChevronRight size={16} strokeWidth={2.6} />
              </button>
            </div>

            <div style={wizFieldLabelStyle}>En el ticket</div>
            <div style={{ ...wizCardStyle, fontSize: 12.5, fontWeight: 700, color: "#142f1d", overflowWrap: "anywhere", lineHeight: 1.35 }}>
              {l.raw}
            </div>

            <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: "#3d5245" }}>
              ¿Qué producto de tu lista es?
            </p>

            <div style={{ display: "grid", gap: 8 }}>
              {candidates.map((c) => {
                const selected = l.include && normalizeName(c.name) === chosenKey;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => { setLine(i, { name: c.name, include: true, pantry: false }); advanceProd(); }}
                    style={receiptOptionBtnStyle(selected)}
                  >
                    <span style={{ fontSize: 14, fontWeight: 800, color: "#142f1d", overflowWrap: "anywhere" }}>
                      {c.name}
                    </span>
                    {selected && <Check size={16} strokeWidth={3} color="#2d5a3d" style={{ flexShrink: 0 }} />}
                  </button>
                );
              })}
              {candidates.length === 0 && (
                <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: "#3d5245" }}>
                  No encontramos nada parecido en tu lista. Escríbelo tú:
                </p>
              )}
            </div>

            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input
                value={l.name}
                onChange={(e) => setLine(i, { name: e.target.value })}
                placeholder="Escribe otro nombre"
                style={{ ...wizInputStyle, flex: 1 }}
              />
              <button
                type="button"
                aria-label="No está en mi lista"
                title="No está en mi lista: se guarda en casa (y el gasto), sin tachar nada"
                onClick={() => { setLine(i, { include: true, pantry: true }); advanceProd(); }}
                style={prodActionIconStyle(false)}
              >
                <Check size={18} strokeWidth={2.6} />
              </button>
              <button
                type="button"
                aria-label="Descartar"
                title="Descartar: ignorar esta línea del ticket (no se tacha ni se guarda gasto)"
                onClick={() => { setLine(i, { include: false }); advanceProd(); }}
                style={prodActionIconStyle(true)}
              >
                <Trash2 size={17} strokeWidth={2.4} />
              </button>
            </div>
          </div>
        );
      })()}

      {stepId === "coincidencias" && (
        <div style={{ display: "grid" }}>
          {reviewRows.length === 0 ? (
            <p style={{ margin: 0, fontSize: 13.5, fontWeight: 700, color: "#3d5245" }}>
              No queda ningún producto de este ticket por registrar.
            </p>
          ) : (
            <>
              {/* The toggle up top drives "Cantidad" below — it doesn't name
                  a unit itself (it changes with the toggle), so the header
                  is plain copy. Whether a line matches what the list needs
                  is still resolved per-row (see `match` below) — just not
                  surfaced as its own column, it doesn't apply cleanly enough
                  to show. */}
              <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
                <CookUnitToggle unitView={unitView} onUnitView={setUnitView} />
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6, paddingBottom: 7, marginBottom: 3, borderBottom: "1px solid #d7e6dc" }}>
                <span style={{ flex: 1 }} />
                <span style={{ ...reviewColHeaderStyle, width: 66, textAlign: "center" }}>Cantidad</span>
                <span style={{ ...reviewColHeaderStyle, width: 67, textAlign: "right" }}>Precio</span>
                <span style={{ width: 26, flexShrink: 0 }} />
              </div>
              <div style={{ display: "grid", maxHeight: "52dvh", overflowY: "auto" }}>
                {reviewRows.map(({ lineIdx, line, match }) => {
                  const matched = Boolean(match);
                  const name = matched ? match.name : line.name;
                  const view = ticketQtyView(name, line.qty, line.unit);
                  const unitLabel = view ? view.label : receiptUnitLabel(line.unit);
                  const qtyValue = view ? view.value : line.qty;
                  const onQtyChange = (e) => {
                    const raw = e.target.value;
                    if (raw === "") { setLine(lineIdx, { qty: null }); return; }
                    const n = Number(raw);
                    if (!(n >= 0)) return;
                    if (view?.mode === "pieces") {
                      const grams = n * view.pieceG;
                      setLine(lineIdx, { qty: view.storeUnit === "kg" ? grams / 1000 : grams });
                    } else if (view?.mode === "liters") {
                      const ml = n * 1000;
                      setLine(lineIdx, { qty: view.storeUnit === "l" ? n : ml, unit: view.storeUnit });
                    } else if (view?.mode === "fromPieces") {
                      setLine(lineIdx, { qty: Math.max(1, Math.round(n / view.pieceG)), unit: "ud" });
                    } else {
                      setLine(lineIdx, { qty: n });
                    }
                  };
                  // Whether a line is on the list was already settled in
                  // "Aclara productos" — this just marks WHERE it's headed:
                  // a recipe (on the list) or straight to Despensa (not on it).
                  return (
                    <div
                      key={lineIdx}
                      style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 0", borderBottom: "1px solid #e2ede5" }}
                    >
                      <span
                        style={{ flexShrink: 0, display: "inline-flex", color: matched ? "#2d5a3d" : "#8a6d1f" }}
                        title={matched ? "En tu lista: cuenta para tus recetas" : "No estaba en tu lista: se guarda en casa"}
                      >
                        {matched ? <ChefHat size={13} strokeWidth={2.4} /> : <Refrigerator size={13} strokeWidth={2.4} />}
                      </span>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 800, color: "#142f1d", overflowWrap: "anywhere", lineHeight: 1.2 }}>
                          {name}
                        </div>
                      </div>
                      <input
                        type="number"
                        inputMode="decimal"
                        min="0"
                        step="0.1"
                        aria-label="Cantidad"
                        className="mp-no-spinner"
                        value={qtyValue ?? ""}
                        onChange={onQtyChange}
                        style={{ ...miniInputStyle, width: 38, textAlign: "center", flexShrink: 0 }}
                      />
                      <span style={{ fontSize: 10.5, fontWeight: 700, color: "#7a8a7f", width: 18, flexShrink: 0 }}>
                        {unitLabel}
                      </span>
                      <input
                        type="number"
                        inputMode="decimal"
                        min="0"
                        step="0.01"
                        aria-label="Precio"
                        className="mp-no-spinner"
                        value={line.price || ""}
                        onChange={(e) => setLine(lineIdx, { price: Number(e.target.value) || 0 })}
                        style={{ ...miniInputStyle, width: 54, textAlign: "right", flexShrink: 0 }}
                      />
                      <span style={{ fontSize: 10.5, fontWeight: 800, color: "#2d5a3d", flexShrink: 0 }}>€</span>
                      <button
                        type="button"
                        onClick={() => setLine(lineIdx, { include: false })}
                        aria-label="Descartar"
                        title="Descartar esta línea del ticket"
                        style={{
                          width: 26,
                          height: 26,
                          borderRadius: 8,
                          flexShrink: 0,
                          border: "none",
                          background: "transparent",
                          color: "#b0bab4",
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          cursor: "pointer",
                          padding: 0,
                        }}
                      >
                        <Trash2 size={14} strokeWidth={2.2} />
                      </button>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}

      <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
        {step > 0 && (
          <button type="button" onClick={() => setStep((s) => s - 1)} style={wizBackBtnStyle}>
            <ChevronLeft size={16} strokeWidth={2.6} />
            Atrás
          </button>
        )}
        <button type="button" onClick={next} style={{ ...wizNextBtnStyle, flex: 1 }}>
          {isLast ? (tachIds.length ? `Confirmar y tachar ${tachIds.length}` : "Confirmar") : "Siguiente"}
        </button>
      </div>
    </WizardSheet>
  );
}

function EmptyList({ onAdd, scope, hasPending, hasDone }) {
  let message = "Sin productos";
  if (scope === "pending" && hasDone) message = "Nada pendiente";
  else if (scope === "done" && hasPending) message = "Nada comprado aún";

  return (
    <div style={{ padding: "48px 0", textAlign: "center" }}>
      <p style={{ fontSize: 14, fontWeight: 600, color: "#7a8a7f", margin: "0 0 16px" }}>
        {message}
      </p>
      <button type="button" onClick={onAdd} style={primaryBtnStyle}>
        Añadir
      </button>
    </div>
  );
}

function AddItemModal({ onClose, onAdd }) {
  const [name, setName] = useState("");
  const disabled = !name.trim();
  const submit = () => {
    if (disabled) return;
    onAdd({
      name: name.trim(),
      qty: 1,
      unit: "ud",
      category: INGREDIENT_CATEGORIES[0],
      displayQty: "1 ud",
    });
    onClose();
  };

  return (
    <div className="mp-overlay-in" style={overlayStyle} onClick={onClose}>
      <div className="mp-sheet-up" onClick={(e) => e.stopPropagation()} style={sheetStyle}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h3 style={{ fontSize: 18, fontWeight: 900, color: "#142f1d", margin: 0 }}>
            Añadir
          </h3>
          <button type="button" onClick={onClose} style={iconBtnStyle} aria-label="Cerrar">
            <X size={20} />
          </button>
        </div>
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nombre"
          style={{ ...inputStyle, marginTop: 16, padding: "12px" }}
          onKeyDown={(e) => e.key === "Enter" && submit()}
        />
        <button
          type="button"
          disabled={disabled}
          onClick={submit}
          style={{
            ...primaryBtnStyle,
            width: "100%",
            marginTop: 14,
            opacity: disabled ? 0.5 : 1,
          }}
        >
          Añadir
        </button>
      </div>
    </div>
  );
}

const titleStyle = {
  fontSize: 26,
  fontWeight: 900,
  color: "#142f1d",
  margin: 0,
  letterSpacing: "-.7px",
};

const iconBtnStyle = {
  width: 40,
  height: 40,
  borderRadius: 12,
  border: "1px solid #e0eae3",
  background: "#fff",
  color: "#2d5a3d",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  cursor: "pointer",
  fontFamily: "inherit",
  flexShrink: 0,
};

// Filled green "money" button — the prominent entry point to spend capture.
const moneyBtnStyle = {
  ...iconBtnStyle,
  border: "none",
  background: "#2d5a3d",
  color: "#fff",
  boxShadow: "0 2px 6px rgba(45, 90, 61, 0.28)",
};

const primaryBtnStyle = {
  padding: "12px 20px",
  borderRadius: 12,
  border: "none",
  background: "#2d5a3d",
  color: "#fff",
  fontSize: 14,
  fontWeight: 800,
  cursor: "pointer",
  fontFamily: "inherit",
};

const rowGridStyle = {
  display: "grid",
  gridTemplateColumns: "1fr 4.5rem auto",
  alignItems: "center",
  gap: 8,
  minHeight: 36,
};

const qtyColStyle = {
  fontSize: 13,
  fontWeight: 800,
  color: "#64748b",
  textAlign: "right",
  fontVariantNumeric: "tabular-nums",
  whiteSpace: "nowrap",
};

const actionsColStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "flex-end",
  gap: 4,
};

const sectionLabelCardStyle = {
  background: "#fff",
  border: "1px solid #e8f0ea",
  padding: "4px 12px",
  boxShadow: "0 1px 3px rgba(20, 47, 29, 0.04)",
};

// Day stripe — mirrors Tu menú's DaySectionHeader (Menu.jsx).
const cookDayStripeStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "8px 12px",
  background: "#f1f5f9",
  borderRadius: 10,
  borderLeft: "3px solid #64748b",
};

const cookDayStripeLabelStyle = {
  fontSize: 13,
  fontWeight: 900,
  color: "#334155",
  letterSpacing: 0.5,
  textTransform: "uppercase",
};

const cookDayStripeNumStyle = {
  fontSize: 18,
  fontWeight: 900,
  color: "#64748b",
  lineHeight: 1,
  fontVariantNumeric: "tabular-nums",
};

const cookMealHeaderStyle = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  fontSize: 13.5,
  fontWeight: 800,
  color: "#2d5a3d",
  marginBottom: 8,
};

const cookDishCardStyle = {
  border: "1px solid #e3ece6",
  borderRadius: 12,
  overflow: "hidden",
  marginBottom: 8,
  background: "#fff",
  boxShadow: "0 1px 3px rgba(20, 47, 29, 0.05)",
};

const cookDishHeaderStyle = {
  width: "100%",
  display: "flex",
  alignItems: "center",
  gap: 10,
  padding: "9px 10px",
  border: "none",
  background: "#fff",
  cursor: "pointer",
  fontFamily: "inherit",
  textAlign: "left",
};

// Name wraps to at most 2 lines and is shown in full (no ellipsis truncation of
// the first line like before).
const cookDishNameStyle = {
  flex: 1,
  minWidth: 0,
  fontSize: 14,
  fontWeight: 800,
  color: "#142f1d",
  lineHeight: 1.25,
  display: "-webkit-box",
  WebkitBoxOrient: "vertical",
  WebkitLineClamp: 2,
  overflow: "hidden",
};

// Ingredient count as a compact box on the right.
const cookDishCountStyle = {
  flexShrink: 0,
  fontSize: 11.5,
  fontWeight: 800,
  color: "#3d5245",
  background: "#eef4ef",
  border: "1px solid #dce8e0",
  borderRadius: 8,
  padding: "3px 8px",
  whiteSpace: "nowrap",
  fontVariantNumeric: "tabular-nums",
};

// Thin separator between the two segmented controls (Modo compra/cocina and
// Por comprar/Comprado) so they read as two distinct switches.
const toggleDividerStyle = {
  height: 1,
  background: "#e0eae3",
  margin: "0 6px 10px",
};

// Cook mode: the Peso/uds switch sits above the quantity column of each dish
// (and the manual extras block). The right padding pulls it left off the two
// "En casa / Comprado" action buttons so it lands over the qty reading itself.
const cookUnitToggleRowStyle = {
  display: "flex",
  justifyContent: "flex-end",
  marginBottom: 7,
  paddingRight: 84,
};

// Typical width of a row's action cluster (4 buttons of 32 + 3 gaps of 4 =
// Home · Comprado · Recetas · Quitar). The Modo compra toggle row reserves this
// on its 3rd grid track so the switch lands over the qty column, not the actions.
const AISLE_ACTIONS_WIDTH = 140;

// Aisle (Modo compra) view: matches the rows' grid so the switch aligns over the
// middle quantity track instead of floating right over the actions.
const aisleToggleRowStyle = {
  display: "grid",
  gridTemplateColumns: "1fr 4.5rem auto",
  gap: 8,
  alignItems: "center",
  padding: "4px 4px 2px",
};

const cookUnitToggleStyle = {
  display: "inline-flex",
  gap: 2,
  padding: 2,
  borderRadius: 8,
  background: "#eef4ef",
  border: "1px solid #dce8e0",
};

const cookUnitToggleBtnStyle = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: 30,
  height: 24,
  border: "none",
  background: "transparent",
  color: "#7a8a7f",
  borderRadius: 6,
  cursor: "pointer",
  fontFamily: "inherit",
  transition: "background .15s, color .15s",
};

const cookUnitToggleBtnOnStyle = {
  background: "#2d5a3d",
  color: "#fff",
};

// Ingredient row mirrors the recipe detail (Menu.jsx): soft tile, name on the
// left, quantity, then the two "En casa / Comprado" actions on the right.
const cookIngRowStyle = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "6px 8px 6px 10px",
  borderRadius: 10,
  background: "#f8faf8",
  color: "#526057",
  fontSize: 12,
};

const cookIngQtyStyle = {
  flexShrink: 0,
  minWidth: 56,
  textAlign: "right",
  whiteSpace: "nowrap",
  color: "#15331c",
  fontVariantNumeric: "tabular-nums",
};

// "uds" variant: the label can be two words ("1 calabacín", "0,5 L"), so give it
// a bit more room and allow wrapping rather than clipping.
const cookIngQtyUdsStyle = {
  flexShrink: 0,
  minWidth: 56,
  maxWidth: 96,
  textAlign: "right",
  whiteSpace: "normal",
  lineHeight: 1.15,
  color: "#15331c",
};

const aisleItemsStyle = {
  background: "#eef4ef",
  border: "1px solid #e8f0ea",
  borderTop: "none",
  borderRadius: "0 0 14px 14px",
  padding: "2px 10px 6px",
};

const sectionHeaderStyle = {
  width: "100%",
  display: "flex",
  alignItems: "center",
  gap: 12,
  padding: "12px 2px",
  border: "none",
  background: "transparent",
  cursor: "pointer",
  fontFamily: "inherit",
};

const progressTrackStyle = {
  height: 6,
  borderRadius: 999,
  background: "#e0eae3",
  overflow: "hidden",
};

const progressFillStyle = {
  height: "100%",
  background: "#2d5a3d",
  borderRadius: 999,
  transition: "width .25s ease",
};

const inputStyle = {
  padding: "8px 10px",
  borderRadius: 10,
  border: "1px solid #e0eae3",
  fontSize: 16,
  fontWeight: 600,
  outline: "none",
  width: "100%",
  boxSizing: "border-box",
  fontFamily: "inherit",
  color: "#142f1d",
};

const overlayStyle = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,.45)",
  zIndex: 150,
  display: "flex",
  alignItems: "flex-end",
  justifyContent: "center",
};

const sheetStyle = {
  background: "#fff",
  borderRadius: "20px 20px 0 0",
  width: "100%",
  maxWidth: 420,
  padding: "20px 20px calc(20px + env(safe-area-inset-bottom, 0px))",
};

// ── Receipt wizard styles ── white cards / inputs that lift off the
// WizardSheet's tinted green background, matching the rest of the wizards.
const wizCardStyle = {
  background: "#fff",
  border: "1.5px solid #d7e6dc",
  borderRadius: 16,
  padding: "12px 14px",
  boxShadow: "0 6px 16px -10px rgba(20,47,29,.35)",
};

const reviewColHeaderStyle = {
  fontSize: 9.5,
  fontWeight: 900,
  letterSpacing: ".4px",
  textTransform: "uppercase",
  color: "#7a8a7f",
};

const wizFieldLabelStyle = {
  fontSize: 10,
  fontWeight: 900,
  letterSpacing: ".5px",
  textTransform: "uppercase",
  color: "#4f6a5a",
  marginBottom: 6,
};

const wizInputStyle = {
  width: "100%",
  padding: "9px 11px",
  borderRadius: 10,
  // Tinted fill so the field reads as an input against the white card instead
  // of blending into it (same fix as the mini qty/precio fields).
  border: "1.5px solid #bcd4c4",
  fontSize: 14,
  fontWeight: 600,
  outline: "none",
  boxSizing: "border-box",
  fontFamily: "inherit",
  color: "#142f1d",
  background: "#f2f7f3",
};

// Buy-oriented unit label: weights/volumes shown as-is (kg, g, l, ml), and any
// piece unit ("ud", "unidad"…) shown as "uds" so it reads as a plain count.
function receiptUnitLabel(unit) {
  if (!unit) return "uds";
  const u = String(unit).trim().toLowerCase();
  if (["ud", "uds", "u", "unidad", "unidades", "pieza", "piezas"].includes(u)) return "uds";
  return u;
}

// How close a normalized list-item name (n) is to a normalized ticket text (p).
// 3 = identical, 2 = one contains the other, else fractional token overlap.
function nameSimilarity(n, p) {
  if (!n || !p) return 0;
  if (n === p) return 3;
  if (n.includes(p) || p.includes(n)) return 2;
  const nt = n.split(" ").filter(Boolean);
  const pt = new Set(p.split(" ").filter(Boolean));
  if (!nt.length || !pt.size) return 0;
  let inter = 0;
  for (const t of nt) if (pt.has(t)) inter++;
  const overlap = inter / Math.min(nt.length, pt.size);
  return overlap >= 0.34 ? overlap : 0;
}

// The best 2-3 shopping-list items an unclear ticket line could be, scored
// against both the raw ticket text and our parsed guess, deduped by name.
function receiptLineCandidates(texts, items, limit = 3) {
  const ps = texts.map(normalizeName).filter(Boolean);
  if (!ps.length) return [];
  const scored = [];
  for (const it of items) {
    const n = normalizeName(it.name);
    if (!n) continue;
    let best = 0;
    for (const p of ps) best = Math.max(best, nameSimilarity(n, p));
    if (best > 0) scored.push({ item: it, score: best });
  }
  scored.sort((a, b) => b.score - a.score);
  const seen = new Set();
  const out = [];
  for (const s of scored) {
    const key = normalizeName(s.item.name);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s.item);
    if (out.length >= limit) break;
  }
  return out;
}

function prodNavBtnStyle(disabled) {
  return {
    width: 30,
    height: 30,
    borderRadius: 999,
    border: "1px solid #cfe0d6",
    background: "#fff",
    color: disabled ? "#c3d0c8" : "#2d5a3d",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: disabled ? "default" : "pointer",
    opacity: disabled ? 0.6 : 1,
  };
}

function receiptOptionBtnStyle(selected) {
  return {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    width: "100%",
    textAlign: "left",
    cursor: "pointer",
    padding: "12px 14px",
    borderRadius: 14,
    border: `1.5px solid ${selected ? "#2d5a3d" : "#d7e6dc"}`,
    background: selected ? "#eef5f0" : "#fff",
    boxShadow: "0 6px 16px -10px rgba(20,47,29,.35)",
    fontFamily: "inherit",
  };
}

function prodActionIconStyle(danger) {
  return {
    width: 40,
    height: 40,
    borderRadius: 10,
    flexShrink: 0,
    border: `1px solid ${danger ? "#eccaca" : "#cfe0d6"}`,
    background: "#fff",
    color: danger ? "#b23b3b" : "#2d5a3d",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
  };
}

const miniInputStyle = {
  width: "100%",
  padding: "5px 6px",
  borderRadius: 8,
  // Tinted fill + firmer border so the fields read as inputs against the white
  // match card instead of blending into it.
  border: "1.5px solid #bcd4c4",
  fontSize: 11.5,
  fontWeight: 700,
  outline: "none",
  boxSizing: "border-box",
  fontFamily: "inherit",
  color: "#142f1d",
  background: "#f2f7f3",
};

const wizNextBtnStyle = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 6,
  padding: "13px 16px",
  borderRadius: 14,
  border: "none",
  background: "#2d5a3d",
  color: "#fff",
  fontSize: 14,
  fontWeight: 800,
  cursor: "pointer",
  fontFamily: "inherit",
  boxShadow: "0 6px 18px rgba(45,90,61,.28)",
};

const wizBackBtnStyle = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 4,
  padding: "13px 16px",
  borderRadius: 14,
  border: "1px solid #d7e6dc",
  background: "#fff",
  color: "#2d5a3d",
  fontSize: 14,
  fontWeight: 800,
  cursor: "pointer",
  fontFamily: "inherit",
};
